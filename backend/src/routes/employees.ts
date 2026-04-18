import express, { Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import netSdkService from '../services/netSdkService';
import logger from '../utils/logger';

const router = express.Router();

// ─── Paths ────────────────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, '../../data');
const EMPLOYEES_FILE = path.join(DATA_DIR, 'employees.json');
const GROUPS_FILE = path.join(DATA_DIR, 'employee-groups.json');
const IMAGES_DIR = path.join(DATA_DIR, 'employee_images');
const FACE_DIR = path.join(IMAGES_DIR, 'face_pictures');
const PROFILE_DIR = path.join(IMAGES_DIR, 'profile_pictures');

// Ensure directories & files exist
[IMAGES_DIR, FACE_DIR, PROFILE_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });
if (!fs.existsSync(EMPLOYEES_FILE)) fs.writeFileSync(EMPLOYEES_FILE, JSON.stringify({ employees: [] }, null, 2));
if (!fs.existsSync(GROUPS_FILE)) fs.writeFileSync(GROUPS_FILE, JSON.stringify({ groups: [] }, null, 2));

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
function readEmployees(): any[] {
  try {
    const raw = fs.readFileSync(EMPLOYEES_FILE, 'utf-8');
    return JSON.parse(raw).employees || [];
  } catch {
    return [];
  }
}

function writeEmployees(employees: any[]) {
  fs.writeFileSync(EMPLOYEES_FILE, JSON.stringify({ employees }, null, 2));
}

function readGroups(): any[] {
  try {
    const raw = fs.readFileSync(GROUPS_FILE, 'utf-8');
    return JSON.parse(raw).groups || [];
  } catch {
    return [];
  }
}

function writeGroups(groups: any[]) {
  fs.writeFileSync(GROUPS_FILE, JSON.stringify({ groups }, null, 2));
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
router.get('/groups', (_req: Request, res: Response) => {
  try {
    res.json({ success: true, groups: readGroups() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/groups', (req: Request, res: Response) => {
  try {
    const { id, name, description, parentId } = req.body;
    if (!id || !name) {
      return res.status(400).json({ success: false, error: 'id and name are required' });
    }
    const groups = readGroups();
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
    writeGroups(groups);
    res.status(201).json({ success: true, group });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/groups/:groupId', (req: Request, res: Response) => {
  try {
    const groups = readGroups().filter((g: any) => g.id !== req.params.groupId);
    writeGroups(groups);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Employees ────────────────────────────────────────────────────────────────
router.get('/', (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: readEmployees() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const emp = readEmployees().find((e: any) => e.id === req.params.id);
    if (!emp) return res.status(404).json({ success: false, error: 'Employee not found' });
    res.json({ success: true, data: emp });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', upload.single('faceImage'), (req: Request, res: Response) => {
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

    const employees = readEmployees();

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
    writeEmployees(employees);

    res.status(201).json({ success: true, data: employeeData });
  } catch (err: any) {
    logger.error('Error saving employee:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/:id', upload.single('faceImage'), (req: Request, res: Response) => {
  try {
    const employees = readEmployees();
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
    writeEmployees(employees);

    res.json({ success: true, data: employeeData });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    const employees = readEmployees();
    const emp = employees.find((e: any) => e.id === req.params.id);
    if (emp) {
      deleteImageFile(emp._faceImageFilename);
      deleteImageFile(emp._profileImageFilename);
      logger.info(`[EMPLOYEES] Deleted images for employee ${emp.personId}`);
    }
    const updated = employees.filter((e: any) => e.id !== req.params.id);
    writeEmployees(updated);
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

    const employee = readEmployees().find((e: any) => e.id === req.params.id);
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

    // Try disk file first (_faceImageFilename is relative to IMAGES_DIR)
    if (employee._faceImageFilename) {
      const faceFilePath = path.join(IMAGES_DIR, employee._faceImageFilename);
      if (fs.existsSync(faceFilePath)) {
        faceImageBuffer = fs.readFileSync(faceFilePath);
        faceImageFilename = path.basename(employee._faceImageFilename);
        logger.info(`[EMPLOYEE SEND-TO-DEVICE] Face read from disk: ${employee._faceImageFilename}, size: ${(faceImageBuffer.length / 1024).toFixed(2)} KB`);
      } else {
        logger.warn(`[EMPLOYEE SEND-TO-DEVICE] Face file not found on disk: ${faceFilePath}`);
      }
    }

    // Fall back to inline base64 (legacy records that haven't been migrated)
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

    // Card number — must be a non-empty string
    const cardNumber = (employee.cardNumber && employee.cardNumber.toString().trim())
      ? employee.cardNumber.toString().trim()
      : null;

    logger.info(`[EMPLOYEE SEND-TO-DEVICE] Employee ${employee.personId} (${employee.name}) → device ${finalDeviceId}`);
    logger.info(`[EMPLOYEE SEND-TO-DEVICE] Card: ${cardNumber || '(none)'}, Face: ${faceImageFilename || '(none)'}`);

    const result = await netSdkService.addPersonToDevice(
      finalDeviceId,
      employee.personId,
      employee.name,
      faceImageBuffer,
      faceImageFilename,
      cardNumber,
      true  // isUpdate = true (upsert mode like persons route)
    );

    logger.info(`✅ Employee ${employee.personId} sent to device. User:${result.userAdded} Card:${result.cardAdded} Face:${result.faceAdded}`);

    // If no card was provided, cardAdded from the bridge is misleading — override to false
    const cardActuallySent = cardNumber !== null;

    res.json({
      success: true,
      result: {
        ...result,
        cardAdded: cardActuallySent ? result.cardAdded : false,
        cardSent: cardActuallySent,
        message: `Person sent to device successfully! User: ${result.userAdded ? '✅' : '❌'}, Card: ${cardActuallySent ? (result.cardAdded ? '✅' : '❌') : '⚠️ No card number'}, Face: ${result.faceAdded ? '✅' : '❌'}`
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

export default router;
