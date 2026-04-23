/**
 * deviceCache.ts
 *
 * In-memory cache: registrationId → { deviceId, name }
 * Secondary index:  serial         → { deviceId, name }
 *
 * Loaded once at startup, then refreshed whenever a device is
 * created, updated, or deleted (routes/devices.ts calls refresh()).
 */

import deviceService from './device.service';
import logger from '../utils/logger';

interface CacheEntry {
  deviceId:       string;   // devices.deviceId (internal UUID/numeric)
  name:           string;   // human-readable device name
  registrationId: string;   // SDK registration ID stored in DB
}

class DeviceCache {
  /** Primary index: registrationId → entry */
  private byRegId  = new Map<string, CacheEntry>();
  /** Secondary index: hardware serial → entry (fallback lookup) */
  private bySerial = new Map<string, CacheEntry>();

  /** Load (or reload) all devices from the repository into memory. */
  async load(): Promise<void> {
    try {
      const devices = await deviceService.getAll();
      this.byRegId.clear();
      this.bySerial.clear();

      for (const d of devices) {
        const entry: CacheEntry = {
          deviceId:       d.deviceId,
          name:           d.name,
          registrationId: d.registrationId,
        };
        // Primary lookup — by registration ID
        if (d.registrationId) {
          this.byRegId.set(d.registrationId, entry);
        }
        // Secondary lookup — by hardware serial (for devices whose DB entry
        // was created using the serial number before auto-reg was set up)
        if (d.serial) {
          this.bySerial.set(d.serial, entry);
        }
      }
      logger.info(`[DeviceCache] Loaded ${this.byRegId.size} device(s) (${this.bySerial.size} with serial index)`);
    } catch (err: any) {
      logger.warn(`[DeviceCache] Failed to load: ${err.message}`);
    }
  }

  /** Alias for load() — call after any device create/update/delete. */
  async refresh(): Promise<void> {
    await this.load();
    logger.debug('[DeviceCache] Refreshed');
  }

  /**
   * Look up by registrationId first, then fall back to hardware serial.
   * Returns null when neither key matches.
   */
  get(id: string): CacheEntry | null {
    return this.byRegId.get(id) ?? this.bySerial.get(id) ?? null;
  }
}

export default new DeviceCache();
