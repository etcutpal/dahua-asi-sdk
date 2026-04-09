const express = require('express');
const router = express.Router();
const deviceService = require('../services/device.service');

// GET all devices
router.get('/', async (req, res) => {
  try {
    const devices = await deviceService.getAll();
    res.json({ success: true, devices });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET device by ID
router.get('/:deviceId', async (req, res) => {
  try {
    const device = await deviceService.getById(req.params.deviceId);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }
    res.json({ success: true, device });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST create device
router.post('/', async (req, res) => {
  try {
    const device = await deviceService.create(req.body);
    res.status(201).json({ success: true, device });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// PUT update device
router.put('/:deviceId', async (req, res) => {
  try {
    const device = await deviceService.update(req.params.deviceId, req.body);
    res.json({ success: true, device });
  } catch (error) {
    if (error.message === 'Device not found') {
      res.status(404).json({ success: false, error: error.message });
    } else {
      res.status(400).json({ success: false, error: error.message });
    }
  }
});

// DELETE device
router.delete('/:deviceId', async (req, res) => {
  try {
    const device = await deviceService.delete(req.params.deviceId);
    res.json({ success: true, device });
  } catch (error) {
    if (error.message === 'Device not found') {
      res.status(404).json({ success: false, error: error.message });
    } else {
      res.status(500).json({ success: false, error: error.message });
    }
  }
});

module.exports = router;
