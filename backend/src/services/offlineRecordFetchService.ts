/**
 * OfflineRecordFetchService.ts
 *
 * Automatically fetches offline records from a device when it comes back online.
 *
 * Triggered by: netSdkService.updateDeviceStatus() when status transitions to 'online'
 *
 * Flow:
 *   1. Device comes online → updateDeviceStatus() calls triggerAutoFetch()
 *   2. Wait delaySeconds (default 4s) for SDK handshake to stabilise
 *   3. Read device.lastOnlineAt from DB → this is the start of the gap window
 *      Gap start = lastOnlineAt - offsetBeforeOfflineSeconds (default 15s)
 *      This 15s buffer catches records written just before the device disconnected.
 *   4. Call fetchAndStoreRecords({ deviceId, startDate, endDate })
 *   5. Update device.lastOnlineAt = now in DB
 *   6. Emit socket event 'device:auto-fetch:complete' with count for frontend toast
 *   7. Remove device from fetchInProgress set
 *
 * Config (shared/server.config.json):
 *   autoFetch.enabled                  — master on/off switch
 *   autoFetch.delaySeconds             — handshake settle delay (default 4)
 *   autoFetch.offsetBeforeOfflineSeconds — gap buffer before lastOnlineAt (default 15)
 */

import path from 'path';
import fs from 'fs';
import axios from 'axios';
import logger from '../utils/logger';
import AccessRecordService from './accessRecordService';
import deviceService from './device.service';

const SERVER_CONFIG_PATH = path.join(__dirname, '../../../shared/server.config.json');

interface AutoFetchConfig {
  enabled: boolean;
  delaySeconds: number;
  offsetBeforeOfflineSeconds: number;
}

function loadAutoFetchConfig(): AutoFetchConfig {
  try {
    const raw = fs.readFileSync(SERVER_CONFIG_PATH, 'utf-8');
    const cfg = JSON.parse(raw);
    return {
      enabled:                    cfg.autoFetch?.enabled                    ?? true,
      delaySeconds:               cfg.autoFetch?.delaySeconds               ?? 4,
      offsetBeforeOfflineSeconds: cfg.autoFetch?.offsetBeforeOfflineSeconds ?? 15,
    };
  } catch {
    return { enabled: true, delaySeconds: 4, offsetBeforeOfflineSeconds: 15 };
  }
}

class OfflineRecordFetchService {
  /** Devices currently being fetched — prevents concurrent duplicate fetches */
  private fetchInProgress = new Set<string>();

  /**
   * Trigger an auto-fetch for a device that just came online.
   * Fully async — does not block the caller (webhook response).
   */
  triggerAutoFetch(registrationId: string): void {
    const cfg = loadAutoFetchConfig();
    if (!cfg.enabled) {
      logger.debug(`[AutoFetch] Disabled in config — skipping auto-fetch for ${registrationId}`);
      return;
    }

    if (this.fetchInProgress.has(registrationId)) {
      logger.debug(`[AutoFetch] Fetch already in progress for ${registrationId} — skipping`);
      return;
    }

    // Fire and forget — run async without blocking caller
    this._runFetch(registrationId, cfg).catch(err =>
      logger.error(`[AutoFetch] Unhandled error for ${registrationId}: ${err.message}`)
    );
  }

  private async _runFetch(registrationId: string, cfg: AutoFetchConfig): Promise<void> {
    this.fetchInProgress.add(registrationId);
    const BRIDGE_URL = process.env.NETSDK_BRIDGE_URL || 'http://localhost:5000';

    try {
      // ── 1. Settle delay — wait for SDK re-login to complete ───────────
      logger.info(`[AutoFetch] Device ${registrationId} online — waiting ${cfg.delaySeconds}s for re-login to stabilise...`);
      await new Promise(resolve => setTimeout(resolve, cfg.delaySeconds * 1000));

      // ── 1b. Verify login handle is valid before querying ──────────────
      // Poll the bridge up to 5 times (1s apart) until LoginHandle > 0
      let loginReady = false;
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          const checkResp = await axios.get(
            `${BRIDGE_URL}/api/devices/${encodeURIComponent(registrationId)}`,
            { timeout: 5000 }
          );
          const loginHandle = checkResp.data?.loginHandle ?? checkResp.data?.LoginHandle ?? 0;
          if (loginHandle && loginHandle > 0) {
            loginReady = true;
            logger.info(`[AutoFetch] Device ${registrationId} login handle confirmed (attempt ${attempt}): ${loginHandle}`);
            break;
          }
          logger.warn(`[AutoFetch] Device ${registrationId} login handle not ready yet (attempt ${attempt}/5), waiting 1s...`);
        } catch (e: any) {
          logger.warn(`[AutoFetch] Bridge check failed (attempt ${attempt}): ${e.message}`);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      if (!loginReady) {
        logger.error(`[AutoFetch] Device ${registrationId} login handle never became ready — aborting auto-fetch`);
        return;
      }

      // ── 2. Determine gap window from lastOnlineAt ──────────────────────
      const device = await deviceService.getByRegistrationId(registrationId);
      const now = new Date();

      let startTime: string;  // full YYYY-MM-DDTHH:MM:SS
      if (device?.lastOnlineAt) {
        // Start from (lastOnlineAt − offsetBeforeOfflineSeconds) to catch
        // records written just before the device lost connection
        const gapStart = new Date(new Date(device.lastOnlineAt).getTime() - cfg.offsetBeforeOfflineSeconds * 1000);
        startTime = formatLocalDateTime(gapStart);
        logger.info(`[AutoFetch] Gap window: ${startTime} (lastOnlineAt=${device.lastOnlineAt} minus ${cfg.offsetBeforeOfflineSeconds}s) → ${formatLocalDateTime(now)}`);
      } else {
        // First time coming online — fetch last 24 hours as a safe default
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        startTime = formatLocalDateTime(yesterday);
        logger.info(`[AutoFetch] No lastOnlineAt for ${registrationId} — fetching last 24h`);
      }

      const endTime = formatLocalDateTime(now);

      // ── 3. Fetch records directly from bridge (bypass device-list filter) ─
      // We call /api/devices/{id}/access-records-module directly instead of
      // going through fetchAndStoreRecords's device-list+online-check pipeline.
      // The device IS online (we just received the webhook), so calling the
      // record endpoint directly is both faster and more reliable.
      logger.info(`[AutoFetch] Fetching offline records for ${registrationId} from ${startTime} to ${endTime}`);

      let fetched = 0;
      let stored = 0;

      try {
        const response = await axios.get(
          `${BRIDGE_URL}/api/devices/${encodeURIComponent(registrationId)}/access-records-module`,
          {
            params: {
              startTime,
              endTime,
              maxRecords: 5000,
            },
            timeout: 60_000,
          }
        );

        const records: any[] = response.data?.records ?? [];
        fetched = records.length;
        logger.info(`[AutoFetch] Bridge returned ${fetched} records for ${registrationId}`);

        if (fetched > 0) {
          stored = await AccessRecordService.getInstance().storeSdkRecords(records);
          logger.info(`[AutoFetch] ✅ ${registrationId}: fetched=${fetched}, stored=${stored} new records`);
        }
      } catch (fetchErr: any) {
        logger.error(`[AutoFetch] Bridge fetch error for ${registrationId}: ${fetchErr.message}`);
        // Don't rethrow — still update lastOnlineAt so next fetch has correct window
      }

      // ── 4. Update lastOnlineAt = now ──────────────────────────────────
      await deviceService.updateLastOnlineAt(registrationId, now.toISOString());

      // ── 5. Emit socket event for frontend notification ─────────────────
      AccessRecordService.getInstance().emit('device:auto-fetch:complete', {
        registrationId,
        deviceName: device?.name ?? registrationId,
        fetched,
        stored,
        startDate: startTime,
        endDate: endTime,
        timestamp: now.toISOString(),
      });

    } catch (err: any) {
      logger.error(`[AutoFetch] Failed for ${registrationId}: ${err.message}`);
    } finally {
      this.fetchInProgress.delete(registrationId);
    }
  }

  /** Check if a device is currently being auto-fetched */
  isFetching(registrationId: string): boolean {
    return this.fetchInProgress.has(registrationId);
  }

  /** Expose current config for the settings API */
  getConfig(): AutoFetchConfig {
    return loadAutoFetchConfig();
  }

  /** Save updated config back to server.config.json */
  saveConfig(updates: Partial<AutoFetchConfig>): AutoFetchConfig {
    const raw = fs.readFileSync(SERVER_CONFIG_PATH, 'utf-8');
    const full = JSON.parse(raw);
    full.autoFetch = { ...full.autoFetch, ...updates };
    fs.writeFileSync(SERVER_CONFIG_PATH, JSON.stringify(full, null, 2), 'utf-8');
    return full.autoFetch;
  }
}

/** Format a Date as YYYY-MM-DD in local time */
function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Format a Date as YYYY-MM-DDTHH:MM:SS in local time */
function formatLocalDateTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${formatLocalDate(d)}T${hh}:${mm}:${ss}`;
}

export default new OfflineRecordFetchService();
