const express = require('express');
const router = express.Router();
const accessRecordService = require('../services/accessRecordService').getInstance();
const logger = require('../utils/logger');

// Get event history - DEPRECATED (now returns recent events)
router.get('/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const events = await accessRecordService.getRecentEvents(limit);
    res.json(events);
  } catch (error) {
    logger.error('Error fetching event history:', error);
    res.status(500).json({ error: 'Failed to fetch event history' });
  }
});

// Get access control events
router.get('/access-control', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const events = await accessRecordService.getRecentEvents(limit);
    res.json({ success: true, events });
  } catch (error) {
    logger.error('Error fetching access control events:', error);
    res.status(500).json({ error: 'Failed to fetch access control events' });
  }
});

// Get access control events by device
router.get('/access-control/device/:deviceId', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const events = await accessRecordService.getEventsByDevice(req.params.deviceId, limit);
    res.json({ success: true, events });
  } catch (error) {
    logger.error(`Error fetching access events for device ${req.params.deviceId}:`, error);
    res.status(500).json({ error: 'Failed to fetch device access events' });
  }
});

// Clear access control event history
router.delete('/access-control', async (req, res) => {
  try {
    await accessRecordService.clearEvents();
    res.json({ success: true, message: 'Access event history cleared' });
  } catch (error) {
    logger.error('Error clearing access event history:', error);
    res.status(500).json({ error: 'Failed to clear access event history' });
  }
});

// Get events by device - DEPRECATED (use /access-control/device/:deviceId)
router.get('/device/:deviceId', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const events = await accessRecordService.getEventsByDevice(req.params.deviceId, limit);
    res.json(events);
  } catch (error) {
    logger.error(`Error fetching events for device ${req.params.deviceId}:`, error);
    res.status(500).json({ error: 'Failed to fetch device events' });
  }
});

// Get events by type - DEPRECATED (returns all recent events)
router.get('/type/:eventType', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const events = await accessRecordService.getRecentEvents(limit);
    res.json(events);
  } catch (error) {
    logger.error(`Error fetching events of type ${req.params.eventType}:`, error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// Clear event history - DEPRECATED
router.delete('/history', async (req, res) => {
  try {
    await accessRecordService.clearEvents();
    res.json({ success: true, message: 'Event history cleared' });
  } catch (error) {
    logger.error('Error clearing event history:', error);
    res.status(500).json({ error: 'Failed to clear event history' });
  }
});

module.exports = router;
