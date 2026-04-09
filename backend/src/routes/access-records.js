const express = require('express');
const router = express.Router();
const netSdkService = require('../services/netSdkService');
const logger = require('../utils/logger');

// Query access control records via NetSDK (Works over Internet/NAT)
router.get('/sdk/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { startTime, endTime, cardNumber, maxRecords } = req.query;

    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'Device ID required' });
    }

    logger.info(`Querying access records via NetSDK for device: ${deviceId}`);
    logger.info(`  Start: ${startTime || 'Beginning'}`);
    logger.info(`  End: ${endTime || 'Now'}`);
    logger.info(`  Max: ${maxRecords || 100} records`);

    const records = await netSdkService.queryAccessRecordsBySDK(
      deviceId,
      startTime,
      endTime,
      cardNumber,
      parseInt(maxRecords) || 100
    );

    res.json({
      success: true,
      count: records.length,
      records
    });
  } catch (error) {
    logger.error('Error querying access records via SDK:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
