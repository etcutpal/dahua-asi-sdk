const express = require('express');
const router = express.Router();
const netSdkService = require('../services/netSdkService');
const eventService = require('../services/eventService');
const logger = require('../utils/logger');

// Receive device status updates from C# Bridge
router.post('/device-status', async (req, res) => {
  try {
    const { deviceId, status, timestamp } = req.body;

    if (!deviceId || !status) {
      return res.status(400).json({ success: false, error: 'deviceId and status required' });
    }

    logger.info(`Webhook received: Device ${deviceId} is ${status}`);

    // Update internal state and broadcast to frontend
    await netSdkService.updateDeviceStatus(deviceId, status, timestamp);

    res.json({ success: true });
  } catch (error) {
    logger.error('Error processing webhook:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Receive access control events from C# Bridge
router.post('/access-events', async (req, res) => {
  try {
    const { type, deviceId, timestamp, data } = req.body;

    if (!deviceId || !type) {
      return res.status(400).json({ success: false, error: 'deviceId and type required' });
    }

    logger.info(`🚪 Access control event received: ${type} from device ${deviceId}`);
    logger.info(`   Event Data: ${JSON.stringify(data, null, 2)}`);

    // Store event in persistent storage
    await eventService.storeAccessEvent({
      type,
      deviceId,
      timestamp: timestamp || new Date().toISOString(),
      data
    });

    // Broadcast to all connected frontend clients via WebSocket
    eventService.emit('access:control:event', {
      type,
      deviceId,
      timestamp: timestamp || new Date().toISOString(),
      data
    });

    res.json({ success: true });
  } catch (error) {
    logger.error('Error processing access control event:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
