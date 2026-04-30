import express, { Request, Response } from 'express';
import axios from 'axios';
import logger from '../utils/logger';
import deviceService from '../services/device.service';

const router = express.Router();

const BRIDGE_URL = process.env.NETSDK_BRIDGE_URL || 'http://localhost:5000';

/**
 * POST /api/scanner/capture
 * Triggers the built-in fingerprint scanner on the specified Dahua device
 * and returns the captured template as a base64 string.
 *
 * Body: { deviceId, slot, userID, channelId?, readerID?, timeoutMs? }
 */
router.post('/capture', async (req: Request, res: Response) => {
  const { deviceId, slot, userID, channelId = 0, readerID = '1', timeoutMs = 30000 } = req.body;

  // Basic validation
  if (!deviceId) {
    return res.status(400).json({ success: false, error: 'deviceId is required' });
  }
  if (!userID) {
    return res.status(400).json({ success: false, error: 'userID is required' });
  }
  if (slot === undefined || slot < 1 || slot > 5) {
    return res.status(400).json({ success: false, error: 'slot must be between 1 and 5' });
  }

  logger.info(`[SCANNER] Capture request — Device:${deviceId} UserID:${userID} Slot:${slot}`);

  // Resolve numeric deviceId → registrationId (the key the bridge uses internally)
  const device = await deviceService.getById(String(deviceId));
  if (!device) {
    logger.warn(`[SCANNER] Device not found in DB — deviceId:${deviceId}`);
    return res.json({ success: false, error: 'Device not found', errorCode: -3 });
  }
  const bridgeDeviceId = device.registrationId || device.deviceId;
  logger.info(`[SCANNER] Resolved bridgeDeviceId:${bridgeDeviceId} (registrationId) for deviceId:${deviceId}`);

  try {
    const bridgeRes = await axios.post(
      `${BRIDGE_URL}/scanner/capture`,
      { deviceId: bridgeDeviceId, slot, userID, channelId, readerID, timeoutMs },
      {
        timeout: timeoutMs + 5000,
        // Never throw on HTTP error codes — always forward the bridge response body
        validateStatus: () => true,
      }
    );

    const data = bridgeRes.data;

    if (data.success) {
      logger.info(`[SCANNER] ✅ Captured — Device:${bridgeDeviceId} UserID:${userID} Slot:${slot} PacketLen:${data.packetLen}`);
    } else {
      logger.warn(`[SCANNER] ❌ Failed — Device:${bridgeDeviceId} UserID:${userID} Slot:${slot} Error:${data.error} Code:${data.errorCode ?? bridgeRes.status}`);
    }

    // Always return 200 to the frontend — success field conveys outcome
    return res.json(data);
  } catch (err: any) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ECONNRESET') {
      logger.error(`[SCANNER] Bridge unreachable — ${BRIDGE_URL}`);
      return res.status(503).json({ success: false, error: 'Scanner service is offline' });
    }
    logger.error(`[SCANNER] Unexpected error: ${err.message}`);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/scanner/read-card
 * Waits for the next card swipe on the device's built-in or externally connected
 * (Wiegand / RS485) card reader and returns the card number string.
 *
 * Body: { deviceId, channelId?, readerID?, timeoutMs? }
 */
router.post('/read-card', async (req: Request, res: Response) => {
  const { deviceId, channelId = 0, readerID = '1', timeoutMs = 15000 } = req.body;

  if (!deviceId) {
    return res.status(400).json({ success: false, error: 'deviceId is required' });
  }

  logger.info(`[CARD-ENROLL] Read-card request — Device:${deviceId} Channel:${channelId} Reader:${readerID} Timeout:${timeoutMs}ms`);

  // Resolve numeric deviceId → registrationId (bridge key)
  const device = await deviceService.getById(String(deviceId));
  if (!device) {
    logger.warn(`[CARD-ENROLL] Device not found in DB — deviceId:${deviceId}`);
    return res.json({ success: false, error: 'Device not found', errorCode: -3 });
  }
  const bridgeDeviceId = device.registrationId || device.deviceId;
  logger.info(`[CARD-ENROLL] Resolved bridgeDeviceId:${bridgeDeviceId} for deviceId:${deviceId}`);

  try {
    const bridgeRes = await axios.post(
      `${BRIDGE_URL}/card/read`,
      { deviceId: bridgeDeviceId, channelId, readerID, timeoutMs },
      {
        timeout: timeoutMs + 5000,
        validateStatus: () => true, // never throw on HTTP error codes
      }
    );

    const data = bridgeRes.data;

    if (data.success) {
      logger.info(`[CARD-ENROLL] ✅ Card read — Device:${bridgeDeviceId} Card:${data.cardNumber?.slice(0, 4)}****`);
    } else {
      logger.warn(`[CARD-ENROLL] ❌ Failed — Device:${bridgeDeviceId} Error:${data.error} Code:${data.errorCode ?? bridgeRes.status}`);
    }

    return res.json(data);
  } catch (err: any) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ECONNRESET') {
      logger.error(`[CARD-ENROLL] Bridge unreachable — ${BRIDGE_URL}`);
      return res.status(503).json({ success: false, error: 'Scanner service is offline' });
    }
    logger.error(`[CARD-ENROLL] Unexpected error: ${err.message}`);
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
