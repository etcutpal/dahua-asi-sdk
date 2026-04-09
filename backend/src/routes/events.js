const express = require('express');
const router = express.Router();
const eventService = require('../services/eventService');
const logger = require('../utils/logger');

// Get event history
router.get('/history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const events = eventService.getEventHistory(limit);
    res.json(events);
  } catch (error) {
    logger.error('Error fetching event history:', error);
    res.status(500).json({ error: 'Failed to fetch event history' });
  }
});

// Get events by device
router.get('/device/:deviceId', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const events = eventService.getEventsByDevice(req.params.deviceId, limit);
    res.json(events);
  } catch (error) {
    logger.error(`Error fetching events for device ${req.params.deviceId}:`, error);
    res.status(500).json({ error: 'Failed to fetch device events' });
  }
});

// Get events by type
router.get('/type/:eventType', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const events = eventService.getEventsByType(req.params.eventType, limit);
    res.json(events);
  } catch (error) {
    logger.error(`Error fetching events of type ${req.params.eventType}:`, error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// Clear event history
router.delete('/history', (req, res) => {
  try {
    eventService.clearHistory();
    res.json({ success: true, message: 'Event history cleared' });
  } catch (error) {
    logger.error('Error clearing event history:', error);
    res.status(500).json({ error: 'Failed to clear event history' });
  }
});

module.exports = router;
