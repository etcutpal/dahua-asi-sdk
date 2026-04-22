import express, { Request, Response } from 'express';

const router = express.Router();

import { JsonDeviceGroupRepository } from '../repositories/JsonDeviceRepository';

const groupRepo = new JsonDeviceGroupRepository();

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET all device groups
router.get('/', async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, groups: await groupRepo.findAll() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST create a device group
router.post('/', async (req: Request, res: Response) => {
  try {
    const { id, name, parentId } = req.body;
    if (!id || !name) {
      return res.status(400).json({ success: false, error: 'id and name are required' });
    }
    const groups = await groupRepo.findAll();
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
    await groupRepo.save(groups);
    res.status(201).json({ success: true, group });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE a device group
router.delete('/:groupId', async (req: Request, res: Response) => {
  try {
    const groups = (await groupRepo.findAll()).filter((g: any) => g.id !== req.params.groupId);
    await groupRepo.save(groups);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
