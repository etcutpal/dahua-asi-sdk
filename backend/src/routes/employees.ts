import express, { Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import netSdkService from '../services/netSdkService';
import accessRuleService from '../services/accessRule.service';
import syncQueueService from '../services/syncQueue.service';
import logger from '../utils/logger';
import RepositoryFactory from '../repositories/RepositoryFactory';

const router = express.Router();

// ─── Paths ────────────────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, '../../data');
const IMAGES_DIR = path.join(DATA_DIR, 'employee_images');
const FACE_DIR = path.join(IMAGES_DIR, 'face_pictures');
const PROFILE_DIR = path.join(IMAGES_DIR, 'profile_pictures');

// ─── Repositories ─────────────────────────────────────────────────────────────
// Called as functions (not cached constants) so RepositoryFactory's singleton
// is resolved at request time, after initialize() has run in startServer().
function employeeRepo() { return RepositoryFactory.employees(); }
function groupRepo()    { return RepositoryFactory.employeeGroups(); }

// Ensure image directories exist
[IMAGES_DIR, FACE_DIR, PROFILE_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ─── Image helpers ────────────────────────────────────────────────────────────
/**
 * Save a base64 data URL to disk. Returns the relative path under IMAGES_DIR
 * (e.g. "face_pictures/1713456789_abc.jpg") or null if dataUrl is not a valid data URI.
 */
function saveBase64Image(dataUrl: string, subDir: string): string | null {
  if (!dataUrl || !dataUrl.startsWith('data:')) return null;
  const m = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/s);
  if (!m) return null;
  const mime = m[1];
  const base64Data = m[2];
  const ext = mime.split('/')[1]?.replace('jpeg', 'jpg').replace('svg+xml', 'svg') || 'jpg';
  const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${ext}`;
  const absDir = path.join(IMAGES_DIR, subDir);
  if (!fs.existsSync(absDir)) fs.mkdirSync(absDir, { recursive: true });
  fs.writeFileSync(path.join(absDir, filename), Buffer.from(base64Data, 'base64'));
  return `${subDir}/${filename}`;  // relative to IMAGES_DIR
}

/** Delete an image file given its relative path under IMAGES_DIR (or null to skip). */
function deleteImageFile(relativePath: string | null | undefined) {
  if (!relativePath) return;
  const abs = path.join(IMAGES_DIR, relativePath);
  if (fs.existsSync(abs)) {
    try { fs.unlinkSync(abs); } catch (_) {}
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function readEmployees(): Promise<any[]> {
  return employeeRepo().findAll();
}

async function writeEmployees(employees: any[]): Promise<void> {
  await employeeRepo().save(employees);
}

async function readGroups(): Promise<any[]> {
  return groupRepo().findAll();
}

async function writeGroups(groups: any[]): Promise<void> {
  await groupRepo().save(groups);
}

// ─── Multer (face images via multipart upload) ────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, FACE_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `employee_${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

// ─── Static image serving ─────────────────────────────────────────────────────
// Supports: /images/face_pictures/<file>  and  /images/profile_pictures/<file>
router.get('/images/*', (req: Request, res: Response) => {
  const relativePath = (req.params as any)[0] as string;
  const filePath = path.join(IMAGES_DIR, relativePath);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: 'Image not found' });
  }
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(filePath);
});

// ─── Groups ───────────────────────────────────────────────────────────────────
router.get('/groups', async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, groups: await readGroups() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/groups', async (req: Request, res: Response) => {
  try {
    const { id, name, description, parentId } = req.body;
    if (!id || !name) {
      return res.status(400).json({ success: false, error: 'id and name are required' });
    }
    const groups = await readGroups();
    if (groups.find((g: any) => g.id === id)) {
      return res.status(409).json({ success: false, error: 'Group ID already exists' });
    }
    const group = {
      id,
      name,
      description: description || '',
      parentId: parentId || null,
      createdAt: new Date().toISOString()
    };
    groups.push(group);
    await writeGroups(groups);
    res.status(201).json({ success: true, group });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/groups/:groupId', async (req: Request, res: Response) => {
  try {
    const groups = (await readGroups()).filter((g: any) => g.id !== req.params.groupId);
    await writeGroups(groups);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Employees ────────────────────────────────────────────────────────────────
router.get('/', async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await readEmployees() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const emp = (await readEmployees()).find((e: any) => e.id === req.params.id);
    if (!emp) return res.status(404).json({ success: false, error: 'Employee not found' });
    res.json({ success: true, data: emp });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', upload.single('faceImage'), async (req: Request, res: Response) => {
  try {
    let employeeData: any;

    // Support both multipart (with faceImage) and plain JSON
    if (req.file) {
      employeeData = typeof req.body.employeeData === 'string'
        ? JSON.parse(req.body.employeeData)
        : req.body;
      const relPath = `face_pictures/${req.file.filename}`;
      employeeData.facePicture = `/api/employees/images/${relPath}`;
      employeeData._faceImageFilename = relPath;
      // Profile picture falls back to face if not provided
      if (!employeeData.profilePicture) {
        employeeData.profilePicture = employeeData.facePicture;
        employeeData._profileImageFilename = relPath;
      }
    } else {
      employeeData = { ...req.body };

      // Save base64 face picture to disk
      if (employeeData.facePicture && employeeData.facePicture.startsWith('data:')) {
        const relPath = saveBase64Image(employeeData.facePicture, 'face_pictures');
        if (relPath) {
          employeeData._faceImageFilename = relPath;
          employeeData.facePicture = `/api/employees/images/${relPath}`;
          logger.info(`[EMPLOYEES] Saved face image → ${relPath}`);
        }
      }

      // Save base64 profile picture to disk
      if (employeeData.profilePicture && employeeData.profilePicture.startsWith('data:')) {
        const relPath = saveBase64Image(employeeData.profilePicture, 'profile_pictures');
        if (relPath) {
          employeeData._profileImageFilename = relPath;
          employeeData.profilePicture = `/api/employees/images/${relPath}`;
          logger.info(`[EMPLOYEES] Saved profile image → ${relPath}`);
        }
      }
    }

    if (!employeeData.personId || !employeeData.name) {
      return res.status(400).json({ success: false, error: 'personId and name are required' });
    }

    const employees = await readEmployees();

    // Check duplicate personId
    if (employees.find((e: any) => e.personId === employeeData.personId && e.id !== employeeData.id)) {
      return res.status(409).json({ success: false, error: `Person ID "${employeeData.personId}" already exists` });
    }

    // Assign id if not present
    if (!employeeData.id) {
      employeeData.id = `emp_${Date.now()}`;
    }
    employeeData.createdAt = employeeData.createdAt || new Date().toISOString();
    employeeData.updatedAt = new Date().toISOString();

    // Remove or update existing entry
    const idx = employees.findIndex((e: any) => e.id === employeeData.id);
    if (idx !== -1) {
      employees[idx] = employeeData;
    } else {
      employees.push(employeeData);
    }
    await writeEmployees(employees);

    // ── Trigger access rule sync for the new/updated employee ──────────────
    // Run asynchronously so response is not delayed
    setImmediate(async () => {
      try {
        const allRules = await accessRuleService.getAll();
        for (const rule of allRules) {
          const personIds = await accessRuleService.expandPersonIds(rule);
          const isInRule = personIds.includes(employeeData.personId);
          if (!isInRule) continue;

          for (const deviceId of rule.deviceIds) {
            try {
              // Resolve device name from devices list
              let deviceName = deviceId;
              try {
                const { default: deviceService } = await import('../services/device.service');
                const allDevices = await deviceService.getAll();
                const dev = allDevices.find((d: any) => d.registrationId === deviceId);
                if (dev) deviceName = dev.name || deviceId;
              } catch (_) {}

              await syncQueueService.addJob({
                ruleId: rule.id,
                ruleName: rule.name,
                personId: employeeData.personId,
                personName: employeeData.name,
                deviceId,
                deviceName,
                operation: 'add',
                force: true,   // new employee — device has never seen them
              });
              logger.info(`[EMPLOYEES] Queued sync add for ${employeeData.personId} → device ${deviceId} (rule: ${rule.name})`);
            } catch (e: any) {
              logger.warn(`[EMPLOYEES] Failed to queue sync for device ${deviceId}: ${e.message}`);
            }
          }
        }
      } catch (e: any) {
        logger.warn(`[EMPLOYEES] Failed to trigger access rule sync: ${e.message}`);
      }
    });

    res.status(201).json({ success: true, data: employeeData });
  } catch (err: any) {
    logger.error('Error saving employee:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/:id', upload.single('faceImage'), async (req: Request, res: Response) => {
  try {
    const employees = await readEmployees();
    const idx = employees.findIndex((e: any) => e.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Employee not found' });

    let employeeData: any = typeof req.body.employeeData === 'string'
      ? JSON.parse(req.body.employeeData)
      : { ...employees[idx], ...req.body };

    if (req.file) {
      // Remove old face image
      deleteImageFile(employees[idx]._faceImageFilename);
      const relPath = `face_pictures/${req.file.filename}`;
      employeeData.facePicture = `/api/employees/images/${relPath}`;
      employeeData._faceImageFilename = relPath;
    } else if (employeeData.facePicture && employeeData.facePicture.startsWith('data:')) {
      // New base64 face — delete old, save new
      deleteImageFile(employees[idx]._faceImageFilename);
      const relPath = saveBase64Image(employeeData.facePicture, 'face_pictures');
      if (relPath) {
        employeeData._faceImageFilename = relPath;
        employeeData.facePicture = `/api/employees/images/${relPath}`;
        logger.info(`[EMPLOYEES] Updated face image → ${relPath}`);
      }
    }

    if (employeeData.profilePicture && employeeData.profilePicture.startsWith('data:')) {
      // New base64 profile — delete old, save new
      deleteImageFile(employees[idx]._profileImageFilename);
      const relPath = saveBase64Image(employeeData.profilePicture, 'profile_pictures');
      if (relPath) {
        employeeData._profileImageFilename = relPath;
        employeeData.profilePicture = `/api/employees/images/${relPath}`;
        logger.info(`[EMPLOYEES] Updated profile image → ${relPath}`);
      }
    }

    employeeData.id = req.params.id;
    employeeData.updatedAt = new Date().toISOString();
    employees[idx] = employeeData;
    await writeEmployees(employees);

    // ── Auto-sync: push updated data to every device this employee is assigned to ──
    // Detect what changed so we know whether to force-update on the device.
    const oldEmp = employees[idx]; // captured before overwrite above? — no, idx is already overwritten.
    // We always force=true on update because the device has stale face/card data.
    const updatedPersonId: string = employeeData.personId;
    const updatedPersonName: string = employeeData.name;

    setImmediate(async () => {
      try {
        const allRules = await accessRuleService.getAll();
        let jobsQueued = 0;
        for (const rule of allRules) {
          const personIds = await accessRuleService.expandPersonIds(rule);
          if (!personIds.includes(updatedPersonId)) continue;

          for (const deviceId of rule.deviceIds) {
            let deviceName = deviceId;
            try {
              const { default: deviceService } = await import('../services/device.service');
              const dev = (await deviceService.getAll()).find((d: any) => d.registrationId === deviceId);
              if (dev) deviceName = dev.name || deviceId;
            } catch (_) {}

            // force=true: device still has old face/card — must overwrite
            const job = await syncQueueService.addJob({
              ruleId: rule.id, ruleName: rule.name,
              personId: updatedPersonId, personName: updatedPersonName,
              deviceId, deviceName,
              operation: 'add', force: true,
            });
            if (job) jobsQueued++;
          }
        }
        logger.info(`[EMPLOYEES] Updated employee ${updatedPersonId} — queued ${jobsQueued} force-sync job(s)`);
      } catch (e: any) {
        logger.warn(`[EMPLOYEES] Failed to trigger sync after update: ${e.message}`);
      }
    });

    res.json({ success: true, data: employeeData });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const employees = await readEmployees();
    const emp = employees.find((e: any) => e.id === req.params.id);
    if (emp) {
      const personId: string = emp.personId || emp.id;
      const personName: string = emp.name || personId;

      // ── Queue delete jobs on all devices where this person has access ──
      try {
        const rules = await accessRuleService.getAll();
        const groups: any[] = await readGroups();

        // Determine which groups this employee belongs to
        const empGroupIds: string[] = [];
        if (emp.department) empGroupIds.push(emp.department);
        if (emp.groupId) empGroupIds.push(emp.groupId);
        if (emp.personGroupId) empGroupIds.push(emp.personGroupId);

        for (const rule of rules) {
          // Check if this person is covered by this rule
          const coveredByAll = rule.employeeGroupIds.includes('all');
          const coveredByGroup = empGroupIds.some(gid => rule.employeeGroupIds.includes(gid));
          const coveredDirectly = rule.personIds.includes(personId);

          if (coveredByAll || coveredByGroup || coveredDirectly) {
            for (const deviceId of rule.deviceIds) {
              const deviceName = deviceId; // best-effort name
              await syncQueueService.addJob({
                ruleId: rule.id,
                ruleName: rule.name,
                personId,
                personName,
                deviceId,
                deviceName,
                operation: 'delete',
                force: true,
              });
              logger.info(`[EMPLOYEES] Queued delete for ${personId} (${personName}) → ${deviceId} (rule: ${rule.name})`);
            }
          }
        }
      } catch (syncErr: any) {
        logger.error(`[EMPLOYEES] Failed to queue device delete jobs for ${personId}: ${syncErr.message}`);
      }

      deleteImageFile(emp._faceImageFilename);
      deleteImageFile(emp._profileImageFilename);
      logger.info(`[EMPLOYEES] Deleted images for employee ${personId}`);
    }
    const updated = employees.filter((e: any) => e.id !== req.params.id);
    await writeEmployees(updated);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Send to Device ───────────────────────────────────────────────────────────
router.post('/:id/send-to-device', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.body;
    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'deviceId is required' });
    }

    const employee = (await readEmployees()).find((e: any) => e.id === req.params.id);
    if (!employee) {
      return res.status(404).json({ success: false, error: 'Employee not found' });
    }

    // Resolve device ID: if 8-digit local ID, translate to registrationId
    let finalDeviceId = deviceId;
    if (/^\d{8}$/.test(deviceId)) {
      try {
        const deviceService = require('../services/device.service').default;
        const device = await deviceService.getById(deviceId);
        if (device && device.registrationId) {
          logger.info(`[EMPLOYEE SEND-TO-DEVICE] Translating local device ID ${deviceId} → ${device.registrationId}`);
          finalDeviceId = device.registrationId;
        } else {
          throw new Error(`Device ${deviceId} not found in local config`);
        }
      } catch (err: any) {
        return res.status(400).json({ success: false, error: err.message });
      }
    }

    // Build face image Buffer from saved disk file
    let faceImageBuffer: Buffer | null = null;
    let faceImageFilename: string | null = null;

    // Helper: try to read a relative path under IMAGES_DIR
    const tryReadFaceFromRelPath = (relPath: string | null | undefined): boolean => {
      if (!relPath) return false;
      const abs = path.join(IMAGES_DIR, relPath);
      if (fs.existsSync(abs)) {
        faceImageBuffer = fs.readFileSync(abs);
        faceImageFilename = path.basename(relPath);
        logger.info(`[EMPLOYEE SEND-TO-DEVICE] Face read from disk: ${relPath}, size: ${(faceImageBuffer.length / 1024).toFixed(2)} KB`);
        return true;
      }
      logger.warn(`[EMPLOYEE SEND-TO-DEVICE] Face file not found: ${abs}`);
      return false;
    };

    // 1. Try _faceImageFilename (relative to IMAGES_DIR — set for in-memory/JSON employees)
    if (!tryReadFaceFromRelPath(employee._faceImageFilename)) {
      // 2. Derive relative path from facePicture URL  "/api/employees/images/<relPath>"
      const facePictureUrl: string = employee.facePicture || employee.profilePicture || '';
      const IMAGE_URL_PREFIX = '/api/employees/images/';
      if (facePictureUrl.startsWith(IMAGE_URL_PREFIX)) {
        const relPath = facePictureUrl.slice(IMAGE_URL_PREFIX.length);
        tryReadFaceFromRelPath(relPath);
      }
    }

    // 3. Fall back to inline base64 (legacy records)
    if (!faceImageBuffer) {
      const faceData: string = employee.facePicture || employee.profilePicture || '';
      if (faceData && faceData.startsWith('data:')) {
        try {
          const matches = faceData.match(/^data:([^;]+);base64,(.+)$/);
          if (matches) {
            const mimeType = matches[1];
            const base64Data = matches[2];
            faceImageBuffer = Buffer.from(base64Data, 'base64');
            const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
            faceImageFilename = `employee_face_${employee.personId}.${ext}`;
            logger.info(`[EMPLOYEE SEND-TO-DEVICE] Face decoded from base64 (legacy): ${faceImageFilename}`);
          }
        } catch (imgErr: any) {
          logger.error('[EMPLOYEE SEND-TO-DEVICE] Failed to decode base64 face:', imgErr.message);
        }
      } else {
        logger.info(`[EMPLOYEE SEND-TO-DEVICE] No face image for employee ${employee.personId}`);
      }
    }

    // Card numbers — full list
    const cardNumbers: string[] = Array.isArray(employee.cardNumbers)
      ? employee.cardNumbers.filter((c: any) => c && c.toString().trim())
      : (employee.cardNumber ? [employee.cardNumber.toString().trim()] : []); // backward compat
    const cardNumber = cardNumbers[0] || null;

    // Password
    const password: string | undefined = employee.password || undefined;

    // Fingerprint templates — only device-format objects with dataBase64
    const fingerprintTemplates = Array.isArray(employee.fingerprints)
      ? employee.fingerprints
          .filter((fp: any) => fp && typeof fp === 'object' && fp.dataBase64)
          .map((fp: any) => ({
            index: fp.index ?? 0,
            dataBase64: fp.dataBase64,
            packetLen: fp.packetLen ?? 0,
            packetCount: fp.packetCount ?? 0
          }))
      : [];

    logger.info(`[EMPLOYEE SEND-TO-DEVICE] Employee ${employee.personId} (${employee.name}) → device ${finalDeviceId}`);
    logger.info(`[EMPLOYEE SEND-TO-DEVICE] Cards: [${cardNumbers.join(', ') || '(none)'}], Password: ${password ? '[set]' : '(none)'}, Fingerprints: ${fingerprintTemplates.length}, Face: ${faceImageFilename || '(none)'}`);

    const result = await netSdkService.addPersonToDevice(
      finalDeviceId,
      employee.personId,
      employee.name,
      faceImageBuffer,
      faceImageFilename,
      cardNumber,
      true,  // isUpdate = true (upsert mode)
      null,  // oldCardNumber
      cardNumbers.length > 0 ? cardNumbers : undefined,
      password,
      fingerprintTemplates.length > 0 ? fingerprintTemplates : undefined
    );

    logger.info(`✅ Employee ${employee.personId} sent to device. User:${result.userAdded} Card:${result.cardAdded} Face:${result.faceAdded}`);

    // If no card was provided, cardAdded from the bridge is misleading — override to false
    const cardActuallySent = cardNumbers.length > 0;

    res.json({
      success: true,
      result: {
        ...result,
        cardAdded: cardActuallySent ? result.cardAdded : false,
        cardSent: cardActuallySent,
        fingerprintsSent: fingerprintTemplates.length,
        message: `Person sent to device successfully! User: ${result.userAdded ? '✅' : '❌'}, Cards: ${cardActuallySent ? `${cardNumbers.length} (${result.cardAdded ? '✅' : '❌'})` : '⚠️ No cards'}, Face: ${result.faceAdded ? '✅' : '❌'}, Fingerprints: ${fingerprintTemplates.length > 0 ? `${fingerprintTemplates.length} sent` : 'none'}`
      }
    });
  } catch (err: any) {
    logger.error('[EMPLOYEE SEND-TO-DEVICE] Error:', err);

    let detailedError = err.message;
    if (err.response) {
      detailedError = err.response.data?.error || err.response.data?.result?.error || err.message;
    }

    res.status(500).json({ success: false, error: detailedError, message: 'Failed to send employee to device' });
  }
});

// ─── Import from Device ────────────────────────────────────────────────────────
router.post('/import-from-device', async (req: Request, res: Response) => {
  try {
    const { deviceId, conflictMode = 'skip', selectedPersonIds, targetGroup = 'all' } = req.body as {
      deviceId?: string;
      conflictMode?: 'skip' | 'overwrite';
      selectedPersonIds?: string[];   // if provided, only import these user IDs
      targetGroup?: string;           // person group/department to assign on import
    };

    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'deviceId is required' });
    }

    logger.info(`[ImportFromDevice] Fetching users from device ${deviceId}, conflictMode=${conflictMode}, targetGroup=${targetGroup}, selected=${selectedPersonIds?.length ?? 'all'}`);

    // Fetch all users from the device via C# bridge
    const deviceUsers = await netSdkService.getDeviceUsers(deviceId);
    logger.info(`[ImportFromDevice] Got ${deviceUsers.length} users from device`);

    // Filter to only selected persons if provided
    const usersToImport = selectedPersonIds && selectedPersonIds.length > 0
      ? deviceUsers.filter(u => selectedPersonIds.includes(String(u.userId)))
      : deviceUsers;

    const employees: any[] = await readEmployees();
    const existingByPersonId = new Map<string, any>(employees.map((e: any) => [String(e.personId), e]));

    const now = new Date();
    const defaultStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}T00:00`;
    const defaultEnd = `${now.getFullYear()+10}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}T23:59`;

    let imported = 0, updated = 0, skipped = 0, failed = 0;
    const errors: string[] = [];

    for (const u of usersToImport) {
      if (!u.userId) { failed++; continue; }
      try {
        const existing = existingByPersonId.get(String(u.userId));
        if (existing) {
          if (conflictMode === 'skip') {
            skipped++;
          } else {
            // overwrite — fetch fresh details from device, update record
            try {
              const details = await netSdkService.getDeviceUserDetails(deviceId, u.userId);
              existing.name = u.name || u.userId;
              // Password
              if (details.password) existing.password = details.password;
              // All cards — store in cardNumbers only
              if (details.cardNumbers.length > 0) {
                existing.cardNumbers = details.cardNumbers;
                delete existing.cardNumber; // remove legacy field if present
              }
              // Fingerprints (replace all)
              if (details.fingerprints.length > 0) {
                existing.fingerprints = details.fingerprints.map(fp => ({
                  index: fp.index,
                  dataBase64: fp.dataBase64,
                  packetLen: fp.packetLen,
                  packetCount: fp.packetCount,
                }));
              }
              // Face image
              if (details.faceImageBase64) {
                deleteImageFile(existing._faceImageFilename);
                const relPath = saveBase64Image(`data:${details.faceImageMimeType};base64,${details.faceImageBase64}`, 'face_pictures');
                if (relPath) {
                  existing._faceImageFilename = relPath;
                  existing.facePicture = `/api/employees/images/${relPath}`;
                  existing.profilePicture = existing.profilePicture || `/api/employees/images/${relPath}`;
                }
              }
              existing.updatedAt = new Date().toISOString();
            } catch (detailErr: any) {
              // If details fail, still update name
              existing.name = u.name || u.userId;
              existing.updatedAt = new Date().toISOString();
              logger.warn(`[ImportFromDevice] Details fetch failed for ${u.userId}: ${detailErr.message}`);
            }
            updated++;
          }
        } else {
          // Fetch all details from device for new employee
          let cardNumbers: string[] = [];
          let password = '';
          let fingerprints: any[] = [];
          let facePicture = '';
          let profilePicture = '';
          let faceImageFilename = '';

          try {
            const details = await netSdkService.getDeviceUserDetails(deviceId, u.userId);
            password = details.password || '';
            cardNumbers = details.cardNumbers || [];
            fingerprints = details.fingerprints.map(fp => ({
              index: fp.index,
              dataBase64: fp.dataBase64,
              packetLen: fp.packetLen,
              packetCount: fp.packetCount,
            }));
            if (details.faceImageBase64) {
              const relPath = saveBase64Image(`data:${details.faceImageMimeType};base64,${details.faceImageBase64}`, 'face_pictures');
              if (relPath) {
                faceImageFilename = relPath;
                facePicture = `/api/employees/images/${relPath}`;
                profilePicture = `/api/employees/images/${relPath}`;
              }
            }
          } catch (detailErr: any) {
            logger.warn(`[ImportFromDevice] Details fetch failed for ${u.userId}: ${detailErr.message}`);
          }

          // SDK returns "0000-00-00", "1900-01-01" or "1970-xx-xx" for unset dates — treat as "not set"
          const isValidSdkDate = (s: string) => {
            if (!s) return false;
            const year = parseInt(s.substring(0, 4), 10);
            return year >= 2000;
          };
          const newEmp: any = {
            id: `emp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            personId: u.userId,
            name: u.name || u.userId,
            department: targetGroup,
            groupId: targetGroup,
            gender: '',
            effectiveStart: isValidSdkDate(u.validBegin) ? `${u.validBegin}T00:00` : defaultStart,
            effectiveEnd: isValidSdkDate(u.validEnd) ? `${u.validEnd}T23:59` : defaultEnd,
            profilePicture,
            facePicture,
            password,
            cardNumbers,
            fingerprints,
            title: '',
            nickname: '',
            dateOfBirth: '',
            phone: '',
            occupation: '',
            email: '',
            address: '',
            remarks: `Imported from device ${deviceId}`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          if (faceImageFilename) {
            newEmp._faceImageFilename = faceImageFilename;
            newEmp._profileImageFilename = faceImageFilename;
          }
          employees.push(newEmp);
          existingByPersonId.set(String(u.userId), newEmp);
          imported++;
        }
      } catch (e: any) {
        failed++;
        errors.push(`${u.userId}: ${e.message}`);
        logger.error(`[ImportFromDevice] Error importing user ${u.userId}:`, e.message);
      }
    }

    await writeEmployees(employees);
    logger.info(`[ImportFromDevice] Done — imported: ${imported}, updated: ${updated}, skipped: ${skipped}, failed: ${failed}`);

    res.json({ success: true, totalOnDevice: deviceUsers.length, totalSelected: usersToImport.length, imported, updated, skipped, failed, errors: errors.slice(0, 20) });
  } catch (err: any) {
    logger.error('[ImportFromDevice] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
