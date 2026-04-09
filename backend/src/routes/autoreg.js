const express = require('express');
const router = express.Router();
const netSdkService = require('../services/netSdkService');
const logger = require('../utils/logger');

// Start Auto Registration Server
router.post('/start', async (req, res) => {
  try {
    const { port } = req.body;
    const result = await netSdkService.startAutoReg(port || 9500);
    res.json(result);
  } catch (error) {
    logger.error('Error starting Auto Registration:', error);
    res.status(500).json({ error: error.message || 'Failed to start Auto Registration' });
  }
});

// Stop Auto Registration Server
router.post('/stop', async (req, res) => {
  try {
    const result = await netSdkService.stopAutoReg();
    res.json(result);
  } catch (error) {
    logger.error('Error stopping Auto Registration:', error);
    res.status(500).json({ error: error.message || 'Failed to stop Auto Registration' });
  }
});

// Get Auto Registration status
router.get('/status', (req, res) => {
  // This would check the actual status from the bridge
  res.json({
    running: true,
    port: 9500,
    message: 'Auto Registration Server status',
  });
});

module.exports = router;
