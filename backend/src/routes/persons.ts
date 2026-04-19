import express, { Request, Response } from 'express';
import multer from 'multer';
import personService from '../services/person.service';
import netSdkService from '../services/netSdkService';
import logger from '../utils/logger';
import { logPersonOperation, logPersonError, logPersonDeviceSync } from '../utils/personLogger';
import deviceService from '../services/device.service';

const router = express.Router();

// Custom request type with query and params
interface PersonRequest extends Request {
  query: Record<string, any>;
  params: Record<string, any>;
  body: Record<string, any>;
  file?: Express.Multer.File;
}

// Configure multer for face image upload
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// GET all persons
router.get('/', async (req: PersonRequest, res: Response) => {
  try {
    const persons = await personService.getAll();
    res.json({ success: true, persons });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET person by ID
router.get('/:personId', async (req: PersonRequest, res: Response) => {
  try {
    const person = await personService.getById(req.params.personId);
    if (!person) {
      return res.status(404).json({ success: false, error: 'Person not found' });
    }
    res.json({ success: true, person });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET person face image
router.get('/:personId/image', async (req: PersonRequest, res: Response) => {
  try {
    const person = await personService.getById(req.params.personId);
    if (!person) {
      return res.status(404).json({ success: false, error: 'Person not found' });
    }

    if (!person.faceImagePath) {
      return res.status(404).json({ success: false, error: 'No face image available' });
    }

    // Add cache-control headers to prevent browser caching
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const imageBuffer = await personService.getFaceImage(person.faceImagePath);
    const ext = person.faceImagePath.split('.').pop();

    res.set('Content-Type', `image/${ext}`);
    res.send(imageBuffer);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST create person with optional face image
router.post('/', upload.single('faceImage'), async (req: PersonRequest, res: Response) => {
  let personData: any;

  try {
    personData = typeof (req as any).body.personData === 'string'
      ? JSON.parse((req as any).body.personData)
      : (req as any).body.personData;

    logger.info(`📝 Creating person with ID: ${personData?.personId || 'auto-generated'}, Name: ${personData?.name || 'N/A'}`);

    const file = req.file || null;

    // Step 1: Save person to local JSON file
    const person = await personService.create(
      personData,
      file ? file.buffer : null,
      file ? file.originalname : null
    );

    // Step 2: Optionally sync to device if deviceId is provided
    const syncToDevice = req.query.syncToDevice === 'true';
    let deviceId = req.query.deviceId as string;

    let deviceSyncResult: any = null;

    if (syncToDevice && deviceId) {
      try {
        // Check if deviceId is a local device ID (8-digit number) and translate to registrationId
        if (/^\d{8}$/.test(deviceId)) {
          // It's a local device ID, fetch the device to get registrationId
          const device = await deviceService.getById(deviceId);
          if (device && device.registrationId) {
            logger.info(`Translating local device ID ${deviceId} to registration ID ${device.registrationId}`);
            deviceId = device.registrationId;
          } else {
            throw new Error(`Device ${deviceId} not found in local config`);
          }
        }

        logger.info(`Syncing person ${person.personId} to device ${deviceId}`);
        logger.info(`📸 Face image: ${file ? file.originalname : 'none'}, Card: ${person.cardNumbers?.[0] || 'none'}`);

        deviceSyncResult = await netSdkService.addPersonToDevice(
          deviceId,
          person.personId,
          person.name,
          file ? file.buffer : null,
          file ? file.originalname : null,
          person.cardNumbers.length > 0 ? person.cardNumbers[0] : null
        );

        logger.info(`✅ Device sync completed for person ${person.personId}`);
        (person as any).deviceSyncResult = deviceSyncResult;
      } catch (error: any) {
        logger.error(`❌ Failed to sync person ${person.personId} to device ${deviceId}:`, error);

        // Get detailed error information
        let detailedError = error.message;
        if (error.response) {
          // Error from C# Bridge
          detailedError = error.response.data?.error || error.response.data?.result?.error || error.message;
          logger.error(`Bridge response: ${JSON.stringify(error.response.data)}`);
        }

        // Don't fail the request - person is saved locally even if device sync fails
        (person as any).deviceSyncResult = {
          success: false,
          error: detailedError,
          message: 'Person saved locally but failed to sync to device'
        };
      }
    }

    res.status(201).json({
      success: true,
      person,
      syncedToDevice: syncToDevice && deviceSyncResult?.success
    });
  } catch (error: any) {
    logger.error(`❌ Error saving person:`, error);

    // Provide more specific error messages
    let errorMessage = error.message;
    if (errorMessage.includes('Person ID already exists')) {
      const personId = personData?.personId || (req as any).body?.personId || 'unknown';
      errorMessage = `Person ID "${personId}" already exists. Please use a different ID.`;
      logger.error(`❌ Duplicate Person ID attempt: ${personId}`);
    } else if (errorMessage.includes('ENOENT') || errorMessage.includes('EACCES')) {
      errorMessage = 'File system error. Check if backend/data directory exists and is writable.';
    }

    res.status(400).json({
      success: false,
      error: errorMessage,
      code: (error as any).code
    });
  }
});

// PUT update person with optional face image and device sync
router.put('/:personId', upload.single('faceImage'), async (req: PersonRequest, res: Response) => {
  const startTime = Date.now();
  let personId = req.params.personId;

  try {
    const personData = typeof (req as any).body.personData === 'string'
      ? JSON.parse((req as any).body.personData)
      : (req as any).body.personData;

    const file = req.file || null;

    // Log UPDATE operation start
    logPersonOperation('PERSON_UPDATE_START', {
      personId,
      name: personData?.name,
      newCardNumber: personData?.cardNumbers?.[0] || null,
      hasFaceImage: !!file,
      faceImageSize: file ? file.buffer.length : 0,
      syncToDevice: req.query.syncToDevice === 'true',
      deviceId: req.query.deviceId as string || null
    });

    // Get person BEFORE update to capture old card number (needed for device sync)
    const oldPerson = await personService.getById(req.params.personId);
    const oldCardNumber = oldPerson?.cardNumbers?.[0] || null;

    logPersonOperation('PERSON_OLD_DATA', {
      personId,
      oldName: oldPerson?.name,
      oldCardNumber,
      oldFaceImagePath: oldPerson?.faceImagePath || null
    });

    const person = await personService.update(
      req.params.personId,
      personData,
      file ? file.buffer : null,
      file ? file.originalname : null
    );

    logPersonOperation('PERSON_UPDATED_LOCALLY', {
      personId: person.personId,
      name: person.name,
      newCardNumber: person.cardNumbers?.[0] || null,
      newFaceImagePath: person.faceImagePath || null
    });

    // Check if device sync is requested
    const syncToDevice = req.query.syncToDevice === 'true';
    let deviceId = req.query.deviceId as string;
    let deviceSyncResult: any = null;

    if (syncToDevice && deviceId) {
      try {
        logPersonDeviceSync('DEVICE_SYNC_START', {
          personId,
          deviceId,
          isUpdateMode: true,
          oldCardNumber,
          newCardNumber: person.cardNumbers?.[0] || null,
          hasFaceImage: !!file
        });

        // Check if deviceId is a local device ID and translate to registrationId
        if (/^\d{8}$/.test(deviceId)) {
          const device = await deviceService.getById(deviceId);
          if (device && device.registrationId) {
            logPersonDeviceSync('DEVICE_ID_TRANSLATED', {
              localDeviceId: deviceId,
              registrationId: device.registrationId
            });
            deviceId = device.registrationId;
          } else {
            throw new Error(`Device ${deviceId} not found in local config`);
          }
        }

        const newCardNumber = person.cardNumbers.length > 0 ? person.cardNumbers[0] : null;
        logPersonDeviceSync('SENDING_TO_BRIDGE', {
          personId,
          deviceId,
          isUpdate: true,
          oldCardNumber,
          newCardNumber,
          faceImageSize: file ? file.buffer.length : 0
        });

        // Pass old card number to bridge so it can remove it before adding new one
        deviceSyncResult = await netSdkService.addPersonToDevice(
          deviceId,
          person.personId,
          person.name,
          file ? file.buffer : null,
          file ? file.originalname : null,
          newCardNumber,
          true,  // isUpdate flag = true for UPDATE operations
          oldCardNumber  // old card number for removal
        );

        const elapsed = Date.now() - startTime;
        logPersonDeviceSync('DEVICE_SYNC_SUCCESS', {
          personId,
          deviceId,
          elapsedMs: elapsed,
          userAdded: deviceSyncResult.userAdded,
          cardAdded: deviceSyncResult.cardAdded,
          faceAdded: deviceSyncResult.faceAdded,
          success: deviceSyncResult.success,
          message: deviceSyncResult.message,
          error: deviceSyncResult.error
        });

        logPersonOperation('PERSON_UPDATE_COMPLETE', {
          personId,
          success: true,
          syncedToDevice: true,
          elapsedMs: elapsed
        });
      } catch (error: any) {
        const elapsed = Date.now() - startTime;
        logPersonError('DEVICE_SYNC_FAILED', error, {
          personId,
          deviceId,
          elapsedMs: elapsed,
          isUpdate: true,
          oldCardNumber,
          newCardNumber: person.cardNumbers?.[0] || null
        });

        let detailedError = error.message;
        if (error.response) {
          detailedError = error.response.data?.error || error.response.data?.result?.error || error.message;
          logPersonError('BRIDGE_ERROR_DETAILS', new Error(detailedError), {
            bridgeResponse: error.response.data,
            bridgeStatus: error.response.status
          });
        }

        (person as any).deviceSyncResult = {
          success: false,
          error: detailedError,
          message: 'Person updated locally but failed to sync to device'
        };

        logPersonOperation('PERSON_UPDATE_COMPLETE_WITH_DEVICE_ERROR', {
          personId,
          success: true,
          syncedToDevice: false,
          error: detailedError
        });
      }
    } else {
      logPersonOperation('PERSON_UPDATE_COMPLETE_NO_SYNC', {
        personId,
        syncToDevice,
        reason: !deviceId ? 'No deviceId provided' : 'syncToDevice=false'
      });
    }

    res.json({
      success: true,
      person,
      syncedToDevice: syncToDevice && deviceSyncResult?.success
    });
  } catch (error: any) {
    logPersonError('PERSON_UPDATE_FAILED', error, { personId });

    if (error.message === 'Person not found') {
      res.status(404).json({ success: false, error: error.message });
    } else {
      res.status(400).json({ success: false, error: error.message });
    }
  }
});

// DELETE person
router.delete('/:personId', async (req: PersonRequest, res: Response) => {
  try {
    const person = await personService.delete(req.params.personId);
    res.json({ success: true, person });
  } catch (error: any) {
    if (error.message === 'Person not found') {
      res.status(404).json({ success: false, error: error.message });
    } else {
      res.status(500).json({ success: false, error: error.message });
    }
  }
});

// POST send person to device
router.post('/:personId/send-to-device', async (req: PersonRequest, res: Response) => {
  try {
    const { deviceId } = req.body;

    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'deviceId is required' });
    }

    // Get person from database
    const person = await personService.getById(req.params.personId);
    if (!person) {
      return res.status(404).json({ success: false, error: 'Person not found' });
    }

    // Check if deviceId is a local device ID (8-digit number) and translate to registrationId
    let finalDeviceId = deviceId;
    if (/^\d{8}$/.test(deviceId)) {
      const device = await deviceService.getById(deviceId);
      if (device && device.registrationId) {
        logger.info(`Translating local device ID ${deviceId} to registration ID ${device.registrationId}`);
        finalDeviceId = device.registrationId;
      } else {
        throw new Error(`Device ${deviceId} not found in local config`);
      }
    }

    logger.info(`Sending person ${person.personId} to device ${finalDeviceId}`);

    // Get face image if available
    let faceImageBuffer: Buffer | null = null;
    let faceImageFilename: string | null = null;

    if (person.faceImagePath) {
      try {
        faceImageBuffer = await personService.getFaceImage(person.faceImagePath);
        // Extract just the filename from the path
        faceImageFilename = person.faceImagePath.split(/[\\/]/).pop() || 'face.jpg';
        logger.info(`[SEND-TO-DEVICE] Face image loaded: ${person.faceImagePath}, Size: ${faceImageBuffer ? (faceImageBuffer.length / 1024).toFixed(2) : 0} KB, Filename: ${faceImageFilename}`);
      } catch (imageError: any) {
        logger.error(`[SEND-TO-DEVICE] Failed to load face image: ${person.faceImagePath}`, imageError.message);
        faceImageBuffer = null;
        faceImageFilename = null;
      }
    } else {
      logger.info(`[SEND-TO-DEVICE] No face image path for person ${person.personId}`);
    }

    // Send to device using UPDATE mode
    let deviceSyncResult: any;
    try {
      logger.info(`[SEND-TO-DEVICE] Attempting UPDATE operation for person ${person.personId}`);
      deviceSyncResult = await netSdkService.addPersonToDevice(
        finalDeviceId,
        person.personId,
        person.name,
        faceImageBuffer,
        faceImageFilename,
        person.cardNumbers.length > 0 ? person.cardNumbers[0] : null,
        true  // isUpdate=true for UPDATE mode
      );

      logger.info(`✅ Device sync completed for person ${person.personId} to device ${finalDeviceId}`);
      logger.info(`  📝 User upserted: ${deviceSyncResult.userAdded}`);
      logger.info(`  🆔 Card added: ${deviceSyncResult.cardAdded}`);
      logger.info(`  🖼️  Face updated: ${deviceSyncResult.faceAdded}`);

      res.json({
        success: true,
        result: {
          ...deviceSyncResult,
          message: `Person sent to device successfully! Person sent successfully. User: ${deviceSyncResult.userAdded ? '✅' : '❌'}, Card: ${deviceSyncResult.cardAdded ? '✅' : '❌'}, Face: ${deviceSyncResult.faceAdded ? '✅' : '❌'}`
        }
      });
    } catch (syncError: any) {
      const errorMessage = syncError.message || '';
      const lowerError = errorMessage.toLowerCase();

      logger.error(`[SEND-TO-DEVICE] UPDATE failed: ${errorMessage}`);

      // Return the error
      let detailedError = errorMessage;
      if (syncError.response) {
        detailedError = syncError.response.data?.error || syncError.response.data?.result?.error || errorMessage;
      }

      res.status(400).json({
        success: false,
        error: detailedError,
        message: 'Failed to send person to device'
      });
    }
  } catch (error: any) {
    logger.error(`❌ Failed to send person to device:`, error);

    let detailedError = error.message;
    if ((error as any).response) {
      detailedError = (error as any).response.data?.error || (error as any).response.data?.result?.error || error.message;
      logger.error(`Bridge response: ${JSON.stringify((error as any).response.data)}`);
    }

    res.status(400).json({
      success: false,
      error: detailedError,
      message: 'Failed to send person to device'
    });
  }
});

// POST import persons from device
router.post('/import-from-device', async (req: PersonRequest, res: Response) => {
  try {
    const { deviceId, conflictMode = 'skip' } = req.body as {
      deviceId?: string;
      conflictMode?: 'skip' | 'overwrite';
    };

    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'deviceId is required' });
    }

    // Resolve registration ID if a local device ID was passed
    let finalDeviceId = deviceId;
    if (/^\d{8}$/.test(deviceId)) {
      const device = await deviceService.getById(deviceId);
      if (device && device.registrationId) {
        finalDeviceId = device.registrationId;
      } else {
        return res.status(404).json({ success: false, error: `Device ${deviceId} not found in local config` });
      }
    }

    logger.info(`[ImportFromDevice] Fetching users from device ${finalDeviceId}, conflictMode=${conflictMode}`);

    // 1. Get all users from device via C# bridge
    const deviceUsers = await netSdkService.getDeviceUsers(finalDeviceId);
    logger.info(`[ImportFromDevice] Got ${deviceUsers.length} users from device`);

    // 2. Get existing local persons for duplicate check
    const existingPersons = await personService.getAll();
    const existingIds = new Set(existingPersons.map((p: any) => p.personId));

    let imported = 0;
    let skipped = 0;
    let updated = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const u of deviceUsers) {
      if (!u.userId) { failed++; continue; }

      try {
        if (existingIds.has(u.userId)) {
          if (conflictMode === 'skip') {
            skipped++;
            continue;
          }
          // overwrite
          await personService.update(
            u.userId,
            {
              name: u.name || u.userId,
              cardNumbers: [],
            },
            null,
            null
          );
          updated++;
        } else {
          await personService.create(
            {
              personId: u.userId,
              name: u.name || u.userId,
              cardNumbers: [],
            },
            null,
            null
          );
          imported++;
        }
      } catch (e: any) {
        failed++;
        errors.push(`${u.userId}: ${e.message}`);
        logger.error(`[ImportFromDevice] Error importing user ${u.userId}:`, e.message);
      }
    }

    logger.info(`[ImportFromDevice] Done — imported: ${imported}, updated: ${updated}, skipped: ${skipped}, failed: ${failed}`);

    res.json({
      success: true,
      totalOnDevice: deviceUsers.length,
      imported,
      updated,
      skipped,
      failed,
      errors: errors.slice(0, 20), // cap error list
    });
  } catch (error: any) {
    logger.error('[ImportFromDevice] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
