const express = require('express');
const router = express.Router();
const accessRecordFetchService = require('../services/accessRecordFetchService');
const accessRecordService = require('../services/accessRecordService').getInstance();
const logger = require('../utils/logger');

// Fetch and store access records from all devices via SDK (TCP method)
router.post('/fetch-and-store', async (req, res) => {
  try {
    const { deviceId, startDate, endDate, maxRecords } = req.body;

    logger.info('📥 Fetching and storing access records via SDK module...');

    const result = await accessRecordFetchService.fetchAndStoreRecords({
      deviceId,
      startDate,
      endDate,
      maxRecords: maxRecords || 1000
    });

    if (result.success) {
      res.json({
        success: true,
        totalFetched: result.totalFetched,
        totalStored: result.totalStored,
        deviceResults: result.deviceResults,
        summary: result.summary
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    logger.error('Error fetching and storing access records:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get stored access records with filtering and pagination
router.get('/stored', async (req, res) => {
  try {
    const { date, startDate, endDate, deviceId, filter, page = 1, limit = 20 } = req.query;

    logger.info(`Getting stored access records: startDate=${startDate || 'all'}, endDate=${endDate || 'all'}, filter=${filter || 'all'}, page=${page}`);

    const result = await accessRecordService.getRecords({
      date,
      startDate,
      endDate,
      deviceId,
      filter,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('Error getting stored access records:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Clear stored access records
router.delete('/stored', async (req, res) => {
  try {
    await accessRecordService.clearRecords();
    res.json({
      success: true,
      message: 'All access records cleared'
    });
  } catch (error) {
    logger.error('Error clearing access records:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
