import express, { Request, Response } from 'express';
import accessRuleService from '../services/accessRule.service';
import syncQueueService from '../services/syncQueue.service';
import logger from '../utils/logger';

const router = express.Router();

// GET all rules
router.get('/', async (_req: Request, res: Response) => {
  try {
    const rules = await accessRuleService.getAll();
    const allJobs = syncQueueService.getJobs();

    // Build stats for each rule in parallel
    const rulesWithStats = await Promise.all(rules.map(async rule => {
      const jobs = allJobs.filter(j => j.ruleId === rule.id);

      // unique_persons = current live membership (expand groups now), NOT job history
      const currentPersonIds = await accessRuleService.expandPersonIds(rule);
      const uniquePersons = currentPersonIds.length;

      // unique_devices = what the rule currently targets
      const uniqueDevices = rule.deviceIds.length;

      // success = add-success jobs whose personId is still in the current rule
      const currentPersonSet = new Set(currentPersonIds);
      const successCount = jobs.filter(
        j => j.status === 'success' && j.operation === 'add' && currentPersonSet.has(j.personId)
      ).length;

      return {
        ...rule,
        syncStats: {
          total: jobs.filter(j => j.operation === 'add').length,
          pending: jobs.filter(j => j.status === 'pending').length,
          sending: jobs.filter(j => j.status === 'sending').length,
          success: successCount,
          failed: jobs.filter(j => j.status === 'failed').length,
          queued_offline: jobs.filter(j => j.status === 'queued_offline').length,
          unique_persons: uniquePersons,
          unique_devices: uniqueDevices,
        },
      };
    }));

    res.json({ success: true, rules: rulesWithStats });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET single rule
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const rule = await accessRuleService.getById(req.params.id);
    if (!rule) return res.status(404).json({ success: false, error: 'Rule not found' });
    res.json({ success: true, rule });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST create rule
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, employeeGroupIds, personIds, deviceIds } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, error: 'Rule name is required' });
    const rule = await accessRuleService.create({ name, employeeGroupIds, personIds, deviceIds });
    res.status(201).json({ success: true, rule });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// PUT update rule
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const rule = await accessRuleService.update(req.params.id, req.body);
    res.json({ success: true, rule });
  } catch (err: any) {
    if (err.message === 'Rule not found') return res.status(404).json({ success: false, error: err.message });
    res.status(400).json({ success: false, error: err.message });
  }
});

// DELETE rule
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await accessRuleService.delete(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    if (err.message === 'Rule not found') return res.status(404).json({ success: false, error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST resync rule
// ?force=true  → re-send even persons already confirmed on device (use when device was wiped)
// default      → smart re-sync: skip persons already successfully synced
router.post('/:id/resync', async (req: Request, res: Response) => {
  try {
    const force = req.query.force === 'true';
    const result = await accessRuleService.resync(req.params.id, force);
    res.json({ success: true, queued: result.queued, skipped: result.skipped });
  } catch (err: any) {
    if (err.message === 'Rule not found') return res.status(404).json({ success: false, error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
