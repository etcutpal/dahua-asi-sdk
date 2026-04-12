const express = require('express');
const router = express.Router();
const deviceService = require('../services/device.service');
const netSdkService = require('../services/netSdkService');
const logger = require('../utils/logger');

// GET all devices - merge local config with real-time SDK status
router.get('/', async (req, res) => {
  try {
    // Get local device configurations
    const localDevices = await deviceService.getAll();
    
    // Get real-time device status from NetSDK (this will sync from Bridge)
    const sdkDevices = await netSdkService.getAllDevices();
    
    logger.debug(`Merging devices: ${localDevices.length} local, ${sdkDevices.length} from SDK`);
    logger.debug(`SDK devices: ${JSON.stringify(sdkDevices.map(d => ({ id: d.DeviceID || d.deviceId, status: d.status || d.Status })))}`);
    
    // Helper function to find matching device
    const findMatchingSdkDevice = (localDevice) => {
      return sdkDevices.find(sdk => {
        const sdkId = sdk.DeviceID || sdk.deviceId || sdk.deviceID;
        const localId = localDevice.registrationId || localDevice.deviceId;
        
        return sdkId === localId || 
               sdk.registrationId === localDevice.registrationId ||
               sdk.SerialNumber === localDevice.serial ||
               sdk.serialNumber === localDevice.serial;
      });
    };
    
    // Merge: start with local devices and add status from SDK
    const mergedDevices = localDevices.map(localDevice => {
      const sdkDevice = findMatchingSdkDevice(localDevice);
      const status = sdkDevice ? (sdkDevice.Status || sdkDevice.status || 'Offline') : 'Offline';
      
      logger.debug(`Device ${localDevice.name} (${localDevice.registrationId}): ${status}`);
      
      // Normalize to camelCase for frontend compatibility
      return {
        deviceId: localDevice.deviceId,
        name: localDevice.name,
        registrationId: localDevice.registrationId,
        username: localDevice.username,
        ip: localDevice.ip || (sdkDevice && (sdkDevice.IP || sdkDevice.ip)) || '',
        serial: localDevice.serial || (sdkDevice && (sdkDevice.SerialNumber || sdkDevice.serialNumber)) || '',
        status: status,
        // Include PascalCase for backward compatibility
        DeviceID: sdkDevice ? sdkDevice.DeviceID : undefined,
        Status: status,
        DeviceName: sdkDevice ? sdkDevice.Name : undefined,
      };
    });
    
    // Also include any SDK devices that aren't in local config yet (auto-registered devices)
    const localRegIds = new Set(localDevices.map(d => d.registrationId).filter(Boolean));
    const localDeviceIds = new Set(localDevices.map(d => d.deviceId));
    
    sdkDevices.forEach(sdkDevice => {
      const regId = sdkDevice.DeviceID || sdkDevice.deviceID || sdkDevice.registrationId;
      const deviceId = regId; // Use registration ID as device ID for SDK-only devices
      
      if (!localRegIds.has(regId) && !localDeviceIds.has(deviceId)) {
        const status = sdkDevice.Status || sdkDevice.status || 'Offline';
        
        logger.debug(`Auto-registered device: ${regId} - ${status}`);
        
        // Add SDK device with normalized structure
        mergedDevices.push({
          deviceId: deviceId,
          name: sdkDevice.Name || sdkDevice.name || `Device ${deviceId}`,
          registrationId: regId,
          status: status,
          ip: sdkDevice.IP || sdkDevice.ip || '',
          serial: sdkDevice.SerialNumber || sdkDevice.serialNumber || '',
          // Include PascalCase for backward compatibility
          DeviceID: sdkDevice.DeviceID,
          Status: status,
          DeviceName: sdkDevice.Name,
        });
      }
    });
    
    const onlineCount = mergedDevices.filter(d => d.status === 'Online').length;
    logger.info(`Returning ${mergedDevices.length} devices (${onlineCount} online)`);
    res.json({ success: true, devices: mergedDevices });
  } catch (error) {
    logger.error('Error getting devices:', error);
    // Fallback to local devices only
    try {
      const localDevices = await deviceService.getAll();
      res.json({ success: true, devices: localDevices });
    } catch (fallbackError) {
      logger.error('Fallback also failed:', fallbackError);
      res.json({ success: true, devices: [] });
    }
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
