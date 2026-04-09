const express = require('express');
const router = express.Router();
const netSdkService = require('../services/netSdkService');
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

module.exports = router;
