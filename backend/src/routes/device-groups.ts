import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

const router = express.Router();

const DATA_DIR = path.join(__dirname, '../../data');
const GROUPS_FILE = path.join(DATA_DIR, 'device-groups.json');

// Ensure file exists on startup
if (!fs.existsSync(GROUPS_FILE)) {
  fs.writeFileSync(GROUPS_FILE, JSON.stringify({ groups: [] }, null, 2));
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

// GET all device groups
router.get('/', (_req: Request, res: Response) => {
  try {
    res.json({ success: true, groups: readGroups() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST create a device group
router.post('/', (req: Request, res: Response) => {
  try {
    const { id, name, parentId } = req.body;
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
      parentId: parentId || null,
      createdAt: new Date().toISOString(),
    };
    groups.push(group);
    writeGroups(groups);
    res.status(201).json({ success: true, group });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE a device group
router.delete('/:groupId', (req: Request, res: Response) => {
  try {
    const groups = readGroups().filter((g: any) => g.id !== req.params.groupId);
    writeGroups(groups);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
