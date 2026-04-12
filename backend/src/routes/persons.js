const express = require('express');
const router = express.Router();
const multer = require('multer');
const personService = require('../services/person.service');
const netSdkService = require('../services/netSdkService');
const logger = require('../utils/logger');
const personLogger = require('../utils/personLogger');

// Configure multer for face image upload
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// GET all persons
router.get('/', async (req, res) => {
  try {
    const persons = await personService.getAll();
    res.json({ success: true, persons });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET person by ID
router.get('/:personId', async (req, res) => {
  try {
    const person = await personService.getById(req.params.personId);
    if (!person) {
      return res.status(404).json({ success: false, error: 'Person not found' });
    }
    res.json({ success: true, person });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET person face image
router.get('/:personId/image', async (req, res) => {
  try {
    const person = await personService.getById(req.params.personId);
    if (!person) {
      return res.status(404).json({ success: false, error: 'Person not found' });
    }
    
    if (!person.faceImagePath) {
      return res.status(404).json({ success: false, error: 'No face image available' });
    }

    // Add cache-control headers to prevent browser caching
    // This allows images to update immediately without page reload
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const imageBuffer = await personService.getFaceImage(person.faceImagePath);
    const ext = person.faceImagePath.split('.').pop();
    
    res.set('Content-Type', `image/${ext}`);
    res.send(imageBuffer);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST create person with optional face image
router.post('/', upload.single('faceImage'), async (req, res) => {
  let personData;
  
  try {
    personData = typeof req.body.personData === 'string'
      ? JSON.parse(req.body.personData)
      : req.body.personData;

    logger.info(`📝 Creating person with ID: ${personData?.personId || 'auto-generated'}, Name: ${personData?.name || 'N/A'}`);

    // Step 1: Save person to local JSON file
    const person = await personService.create(
      personData,
      req.file ? req.file.buffer : null,
      req.file ? req.file.originalname : null
    );

    // Step 2: Optionally sync to device if deviceId is provided
    const syncToDevice = req.query.syncToDevice === 'true';
    let deviceId = req.query.deviceId;

    let deviceSyncResult = null;

    if (syncToDevice && deviceId) {
      try {
        // Check if deviceId is a local device ID (8-digit number) and translate to registrationId
        if (/^\d{8}$/.test(deviceId)) {
          // It's a local device ID, fetch the device to get registrationId
          const deviceService = require('../services/device.service');
          const device = await deviceService.getById(deviceId);
          if (device && device.registrationId) {
            logger.info(`Translating local device ID ${deviceId} to registration ID ${device.registrationId}`);
            deviceId = device.registrationId;
          } else {
            throw new Error(`Device ${deviceId} not found in local config`);
          }
        }

        logger.info(`Syncing person ${person.personId} to device ${deviceId}`);
        logger.info(`📸 Face image: ${req.file ? req.file.originalname : 'none'}, Card: ${person.cardNumbers?.[0] || 'none'}`);

        deviceSyncResult = await netSdkService.addPersonToDevice(
          deviceId,
          person.personId,
          person.name,
          req.file ? req.file.buffer : null,
          req.file ? req.file.originalname : null,
          person.cardNumbers.length > 0 ? person.cardNumbers[0] : null
        );

        logger.info(`✅ Device sync completed for person ${person.personId}`);
        person.deviceSyncResult = deviceSyncResult;
      } catch (error) {
        logger.error(`❌ Failed to sync person ${person.personId} to device ${deviceId}:`, error);
        
        // Get detailed error information
        let detailedError = error.message;
        if (error.response) {
          // Error from C# Bridge
          detailedError = error.response.data?.error || error.response.data?.result?.error || error.message;
          logger.error(`Bridge response: ${JSON.stringify(error.response.data)}`);
        }
        
        // Don't fail the request - person is saved locally even if device sync fails
        person.deviceSyncResult = {
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
  } catch (error) {
    logger.error(`❌ Error saving person:`, error);

    // Provide more specific error messages
    let errorMessage = error.message;
    if (errorMessage.includes('Person ID already exists')) {
      const personId = personData?.personId || req.body?.personId || 'unknown';
      errorMessage = `Person ID "${personId}" already exists. Please use a different ID.`;
      logger.error(`❌ Duplicate Person ID attempt: ${personId}`);
    } else if (errorMessage.includes('ENOENT') || errorMessage.includes('EACCES')) {
      errorMessage = 'File system error. Check if backend/data directory exists and is writable.';
    }

    res.status(400).json({
      success: false,
      error: errorMessage,
      code: error.code
    });
  }
});

// PUT update person with optional face image and device sync
router.put('/:personId', upload.single('faceImage'), async (req, res) => {
  const startTime = Date.now();
  let personId = req.params.personId;
  
  try {
    const personData = typeof req.body.personData === 'string'
      ? JSON.parse(req.body.personData)
      : req.body.personData;

    // Log UPDATE operation start
    personLogger.logPersonOperation('PERSON_UPDATE_START', {
      personId,
      name: personData?.name,
      newCardNumber: personData?.cardNumbers?.[0] || null,
      hasFaceImage: !!req.file,
      faceImageSize: req.file ? req.file.buffer.length : 0,
      syncToDevice: req.query.syncToDevice === 'true',
      deviceId: req.query.deviceId || null
    });

    // Get person BEFORE update to capture old card number (needed for device sync)
    const oldPerson = await personService.getById(req.params.personId);
    const oldCardNumber = oldPerson?.cardNumbers?.[0] || null;
    
    personLogger.logPersonOperation('PERSON_OLD_DATA', {
      personId,
      oldName: oldPerson?.name,
      oldCardNumber,
      oldFaceImagePath: oldPerson?.faceImagePath || null
    });

    const person = await personService.update(
      req.params.personId,
      personData,
      req.file ? req.file.buffer : null,
      req.file ? req.file.originalname : null
    );

    personLogger.logPersonOperation('PERSON_UPDATED_LOCALLY', {
      personId: person.personId,
      name: person.name,
      newCardNumber: person.cardNumbers?.[0] || null,
      newFaceImagePath: person.faceImagePath || null
    });

    // Check if device sync is requested
    const syncToDevice = req.query.syncToDevice === 'true';
    let deviceId = req.query.deviceId;
    let deviceSyncResult = null;

    if (syncToDevice && deviceId) {
      try {
        personLogger.logPersonDeviceSync('DEVICE_SYNC_START', {
          personId,
          deviceId,
          isUpdateMode: true,
          oldCardNumber,
          newCardNumber: person.cardNumbers?.[0] || null,
          hasFaceImage: !!req.file
        });

        // Check if deviceId is a local device ID and translate to registrationId
        if (/^\d{8}$/.test(deviceId)) {
          const deviceService = require('../services/device.service');
          const device = await deviceService.getById(deviceId);
          if (device && device.registrationId) {
            personLogger.logPersonDeviceSync('DEVICE_ID_TRANSLATED', {
              localDeviceId: deviceId,
              registrationId: device.registrationId
            });
            deviceId = device.registrationId;
          } else {
            throw new Error(`Device ${deviceId} not found in local config`);
          }
        }

        const newCardNumber = person.cardNumbers.length > 0 ? person.cardNumbers[0] : null;
        personLogger.logPersonDeviceSync('SENDING_TO_BRIDGE', {
          personId,
          deviceId,
          isUpdate: true,
          oldCardNumber,
          newCardNumber,
          faceImageSize: req.file ? req.file.buffer.length : 0
        });

        // Pass old card number to bridge so it can remove it before adding new one
        deviceSyncResult = await netSdkService.addPersonToDevice(
          deviceId,
          person.personId,
          person.name,
          req.file ? req.file.buffer : null,
          req.file ? req.file.originalname : null,
          newCardNumber,
          true,  // isUpdate flag = true for UPDATE operations
          oldCardNumber  // old card number for removal
        );

        const elapsed = Date.now() - startTime;
        personLogger.logPersonDeviceSync('DEVICE_SYNC_SUCCESS', {
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

        personLogger.logPersonOperation('PERSON_UPDATE_COMPLETE', {
          personId,
          success: true,
          syncedToDevice: true,
          elapsedMs: elapsed
        });
      } catch (error) {
        const elapsed = Date.now() - startTime;
        personLogger.logPersonError('DEVICE_SYNC_FAILED', error, {
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
          personLogger.logPersonError('BRIDGE_ERROR_DETAILS', new Error(detailedError), {
            bridgeResponse: error.response.data,
            bridgeStatus: error.response.status
          });
        }

        person.deviceSyncResult = {
          success: false,
          error: detailedError,
          message: 'Person updated locally but failed to sync to device'
        };

        personLogger.logPersonOperation('PERSON_UPDATE_COMPLETE_WITH_DEVICE_ERROR', {
          personId,
          success: true,
          syncedToDevice: false,
          error: detailedError
        });
      }
    } else {
      personLogger.logPersonOperation('PERSON_UPDATE_COMPLETE_NO_SYNC', {
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
  } catch (error) {
    personLogger.logPersonError('PERSON_UPDATE_FAILED', error, { personId });
    
    if (error.message === 'Person not found') {
      res.status(404).json({ success: false, error: error.message });
    } else {
      res.status(400).json({ success: false, error: error.message });
    }
  }
});

// DELETE person
router.delete('/:personId', async (req, res) => {
  try {
    const person = await personService.delete(req.params.personId);
    res.json({ success: true, person });
  } catch (error) {
    if (error.message === 'Person not found') {
      res.status(404).json({ success: false, error: error.message });
    } else {
      res.status(500).json({ success: false, error: error.message });
    }
  }
});

// POST send person to device
router.post('/:personId/send-to-device', async (req, res) => {
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
      const deviceService = require('../services/device.service');
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
    let faceImageBuffer = null;
    let faceImageFilename = null;

    if (person.faceImagePath) {
      try {
        faceImageBuffer = await personService.getFaceImage(person.faceImagePath);
        // Extract just the filename from the path (remove directory separators)
        faceImageFilename = person.faceImagePath.split(/[\\/]/).pop() || 'face.jpg';
        logger.info(`[SEND-TO-DEVICE] Face image loaded: ${person.faceImagePath}, Size: ${faceImageBuffer ? (faceImageBuffer.length / 1024).toFixed(2) : 0} KB, Filename: ${faceImageFilename}`);
      } catch (imageError) {
        logger.error(`[SEND-TO-DEVICE] Failed to load face image: ${person.faceImagePath}`, imageError.message);
        // Continue without face image
        faceImageBuffer = null;
        faceImageFilename = null;
      }
    } else {
      logger.info(`[SEND-TO-DEVICE] No face image path for person ${person.personId}`);
    }

    // Send to device
    // STRATEGY: Use UPDATE mode (isUpdate=true) because the person likely already exists on the device
    // The bridge will:
    // 1. Upsert the user (INSERT is an upsert operation)
    // 2. Remove existing face for this user
    // 3. Add new face
    // 4. Add new card (if provided)
    // 
    // This ensures clean updates without accumulating duplicate cards or keeping old faces
    let deviceSyncResult;
    try {
      logger.info(`[SEND-TO-DEVICE] Attempting UPDATE operation for person ${person.personId}`);
      deviceSyncResult = await netSdkService.addPersonToDevice(
        finalDeviceId,
        person.personId,
        person.name,
        faceImageBuffer,
        faceImageFilename,
        person.cardNumbers.length > 0 ? person.cardNumbers[0] : null,
        true  // isUpdate=true for UPDATE mode - bridge will remove old face/cards before adding new ones
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
    } catch (syncError) {
      // UPDATE failed
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
  } catch (error) {
    logger.error(`❌ Failed to send person to device:`, error);

    let detailedError = error.message;
    if (error.response) {
      detailedError = error.response.data?.error || error.response.data?.result?.error || error.message;
      logger.error(`Bridge response: ${JSON.stringify(error.response.data)}`);
    }

    res.status(400).json({
      success: false,
      error: detailedError,
      message: 'Failed to send person to device'
    });
  }
});

module.exports = router;
