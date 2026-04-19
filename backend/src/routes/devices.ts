import express, { Request, Response } from 'express';
import deviceService from '../services/device.service';
import netSdkService from '../services/netSdkService';
import logger from '../utils/logger';
import { Device } from '../types';

const router = express.Router();

// GET all devices - merge local config with real-time SDK status
router.get('/', async (req: Request, res: Response) => {
  try {
    // Get local device configurations
    const localDevices = await deviceService.getAll();

    // Get real-time device status from NetSDK (this will sync from Bridge)
    const sdkDevices = await netSdkService.getAllDevices();

    logger.debug(`Merging devices: ${localDevices.length} local, ${sdkDevices.length} from SDK`);
    logger.debug(`SDK devices: ${JSON.stringify(sdkDevices.map((d: any) => ({ id: d.DeviceID || d.deviceId, status: d.status || d.Status })))}`);

    // Helper function to find matching device — match ONLY by registrationId
    // (serial number match is intentionally excluded: serial must never make an
    //  unrecognised device appear online when its registration ID has changed)
    const findMatchingSdkDevice = (localDevice: Device): any => {
      return sdkDevices.find((sdk: any) => {
        const sdkId = sdk.DeviceID || sdk.deviceId || sdk.deviceID;
        return sdkId === localDevice.registrationId;
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

    const onlineCount = mergedDevices.filter((d: any) => d.status === 'Online').length;
    logger.info(`Returning ${mergedDevices.length} devices (${onlineCount} online)`);
    res.json({ success: true, devices: mergedDevices });
  } catch (error: any) {
    logger.error('Error getting devices:', error);
    // Fallback to local devices only
    try {
      const localDevices = await deviceService.getAll();
      res.json({ success: true, devices: localDevices });
    } catch (fallbackError: any) {
      logger.error('Fallback also failed:', fallbackError);
      res.json({ success: true, devices: [] });
    }
  }
});

// GET device by ID
router.get('/:deviceId', async (req: Request, res: Response) => {
  try {
    const device = await deviceService.getById(req.params.deviceId);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }
    res.json({ success: true, device });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST create device
router.post('/', async (req: Request, res: Response) => {
  try {
    const device = await deviceService.create(req.body);
    // Push this device's credentials to bridge immediately
    if (device.registrationId) {
      await netSdkService.pushDeviceCredentials(device.registrationId, device.username || 'admin', device.password || '');
    }
    res.status(201).json({ success: true, device });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// PUT update device
router.put('/:deviceId', async (req: Request, res: Response) => {
  try {
    const device = await deviceService.update(req.params.deviceId, req.body);
    // Push updated credentials to bridge if username/password changed
    if (device.registrationId && (req.body.username !== undefined || req.body.password !== undefined)) {
      await netSdkService.pushDeviceCredentials(device.registrationId, device.username || 'admin', device.password || '');
    }
    res.json({ success: true, device });
  } catch (error: any) {
    if (error.message === 'Device not found') {
      res.status(404).json({ success: false, error: error.message });
    } else {
      res.status(400).json({ success: false, error: error.message });
    }
  }
});

// DELETE device
router.delete('/:deviceId', async (req: Request, res: Response) => {
  try {
    const device = await deviceService.delete(req.params.deviceId);
    res.json({ success: true, device });
  } catch (error: any) {
    if (error.message === 'Device not found') {
      res.status(404).json({ success: false, error: error.message });
    } else {
      res.status(500).json({ success: false, error: error.message });
    }
  }
});

export default router;
