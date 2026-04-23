import express, { Request, Response } from 'express';
import deviceService from '../services/device.service';
import netSdkService from '../services/netSdkService';
import syncQueueService from '../services/syncQueue.service';
import accessRuleService from '../services/accessRule.service';
import deviceCache from '../services/deviceCache';
import accessRecordService from '../services/accessRecordService';
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
    // Refresh device cache so new device is available for access record enrichment
    deviceCache.refresh().catch(() => {});
    res.status(201).json({ success: true, device });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// PUT update device
router.put('/:deviceId', async (req: Request, res: Response) => {
  try {
    // Capture old registrationId before update
    const oldDevice = await deviceService.getById(req.params.deviceId);
    const oldRegistrationId = oldDevice?.registrationId;

    const device = await deviceService.update(req.params.deviceId, req.body);

    // Push updated credentials to bridge if username/password changed
    if (device.registrationId && (req.body.username !== undefined || req.body.password !== undefined)) {
      await netSdkService.pushDeviceCredentials(device.registrationId, device.username || 'admin', device.password || '');
    }

    // ── Propagate registrationId change to rules and sync queue ────────────
    const newRegistrationId = device.registrationId;
    if (oldRegistrationId && newRegistrationId && oldRegistrationId !== newRegistrationId) {
      logger.info(`[Devices] registrationId changed: ${oldRegistrationId} → ${newRegistrationId} — updating rules and sync queue`);

      // Update all access rules that reference the old registrationId
      const allRules = await accessRuleService.getAll();
      for (const rule of allRules) {
        if (rule.deviceIds.includes(oldRegistrationId)) {
          const updatedDeviceIds = rule.deviceIds.map(id => id === oldRegistrationId ? newRegistrationId : id);
          await accessRuleService.update(rule.id, { deviceIds: updatedDeviceIds }).catch((e: any) =>
            logger.warn(`[Devices] Failed to update rule ${rule.id}: ${e.message}`)
          );
        }
      }

      // Update all queued jobs referencing the old registrationId
      await syncQueueService.renameDevice(oldRegistrationId, newRegistrationId, device.name);

      // Migrate all historical access records to the new registrationId so they
      // remain visible under the same logical device (door/location) after
      // the physical device is replaced.
      const migratedCount = await accessRecordService.getInstance().renameDevice(oldRegistrationId, newRegistrationId);
      logger.info(`[Devices] Migrated ${migratedCount} access records from ${oldRegistrationId} → ${newRegistrationId}`);

      // Push new credentials to bridge under the new registrationId
      await netSdkService.pushDeviceCredentials(newRegistrationId, device.username || 'admin', device.password || '');
    }

    // Refresh device cache so updated name/id is available for access record enrichment
    deviceCache.refresh().catch(() => {});
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
    // Refresh device cache so deleted device is removed from enrichment lookups
    deviceCache.refresh().catch(() => {});
    res.json({ success: true, device });
  } catch (error: any) {
    if (error.message === 'Device not found') {
      res.status(404).json({ success: false, error: error.message });
    } else {
      res.status(500).json({ success: false, error: error.message });
    }
  }
});

// GET /api/devices/:deviceId/users — fetch all persons stored on the device via SDK bridge
router.get('/:deviceId/users', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    logger.info(`[DeviceUsers] Fetching users from device ${deviceId}`);
    const users = await netSdkService.getDeviceUsers(deviceId);
    logger.info(`[DeviceUsers] Got ${users.length} users from device ${deviceId}`);
    res.json({ success: true, count: users.length, users });
  } catch (error: any) {
    logger.error(`[DeviceUsers] Error fetching users from device ${req.params.deviceId}:`, error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH move device to group
router.patch('/:deviceId/group', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.body;
    if (typeof groupId === 'undefined') return res.status(400).json({ success: false, error: 'groupId is required' });

    const device = await deviceService.getById(req.params.deviceId);
    if (!device) return res.status(404).json({ success: false, error: 'Device not found' });

    const updated = await deviceService.update(req.params.deviceId, { groupId });
    res.json({ success: true, device: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
