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

// Get access control events
router.get('/access-control', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const events = eventService.getAccessControlEvents(limit);
    res.json({ success: true, events });
  } catch (error) {
    logger.error('Error fetching access control events:', error);
    res.status(500).json({ error: 'Failed to fetch access control events' });
  }
});

// Get access control events by device
router.get('/access-control/device/:deviceId', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const events = eventService.getAccessEventsByDevice(req.params.deviceId, limit);
    res.json({ success: true, events });
  } catch (error) {
    logger.error(`Error fetching access events for device ${req.params.deviceId}:`, error);
    res.status(500).json({ error: 'Failed to fetch device access events' });
  }
});

// Clear access control event history
router.delete('/access-control', async (req, res) => {
  try {
    await eventService.clearAccessEventHistory();
    res.json({ success: true, message: 'Access event history cleared' });
  } catch (error) {
    logger.error('Error clearing access event history:', error);
    res.status(500).json({ error: 'Failed to clear access event history' });
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
