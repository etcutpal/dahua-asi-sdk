import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import logger from '../../utils/logger';

const router = express.Router();

const DATA_FILE = path.join(__dirname, '../../../data/attendance/attendance-period.json');

// Ensure directory + file exist
const dir = path.dirname(DATA_FILE);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ periods: [], breaks: [], rulesSettings: null }, null, 2));

// ─── Helpers ─────────────────────────────────────────────────────────────────
function read(): { periods: any[], breaks: any[], rulesSettings: any } {
  try {
    const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    return { periods: d.periods || [], breaks: d.breaks || [], rulesSettings: d.rulesSettings ?? null };
  }
  catch { return { periods: [], breaks: [], rulesSettings: null }; }
}
function write(data: { periods: any[], breaks: any[], rulesSettings: any }) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}
function makeId(prefix: string) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`; }

// ─── Periods CRUD ─────────────────────────────────────────────────────────────
router.get('/periods', (_req: Request, res: Response) => {
  try { res.json({ success: true, periods: read().periods }); }
  catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/periods', (req: Request, res: Response) => {
  try {
    const { name, mode, startTime, endTime, requiredWorkTime, rules } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'name is required' });
    const data = read();
    const period = {
      id: makeId('period'),
      name,
      mode: mode || 'fixed',
      startTime: startTime || '09:00',
      endTime: endTime || '18:00',
      requiredWorkTime: requiredWorkTime ?? 480,
      breaks: [],
      rules: rules || {},
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    data.periods.push(period);
    write(data);
    logger.info(`[ATTENDANCE] Created period: ${period.name}`);
    res.status(201).json({ success: true, period });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/periods/:id', (req: Request, res: Response) => {
  try {
    const data = read();
    const idx = data.periods.findIndex((p: any) => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Period not found' });
    data.periods[idx] = { ...data.periods[idx], ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
    write(data);
    logger.info(`[ATTENDANCE] Updated period: ${req.params.id}`);
    res.json({ success: true, period: data.periods[idx] });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/periods/:id', (req: Request, res: Response) => {
  try {
    const data = read();
    data.periods = data.periods.filter((p: any) => p.id !== req.params.id);
    write(data);
    logger.info(`[ATTENDANCE] Deleted period: ${req.params.id}`);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// ─── Breaks CRUD ──────────────────────────────────────────────────────────────
router.post('/periods/:id/breaks', (req: Request, res: Response) => {
  try {
    const { name, startTime, endTime, mustCheckInOut, validStartTime, validEndTime, durationLimit, lateType } = req.body;
    if (!name || !startTime || !endTime) return res.status(400).json({ success: false, error: 'name, startTime and endTime are required' });
    const data = read();
    const idx = data.periods.findIndex((p: any) => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Period not found' });
    const brk = {
      id: makeId('break'),
      name,
      startTime,
      endTime,
      mustCheckInOut: mustCheckInOut ?? true,
      validStartTime: validStartTime || startTime,
      validEndTime: validEndTime || endTime,
      durationLimit: durationLimit ?? null,
      lateType: lateType || 'None',
      createdAt: new Date().toISOString(),
    };
    data.periods[idx].breaks = data.periods[idx].breaks || [];
    data.periods[idx].breaks.push(brk);
    data.periods[idx].updatedAt = new Date().toISOString();
    write(data);
    logger.info(`[ATTENDANCE] Added break "${brk.name}" to period ${req.params.id}`);
    res.status(201).json({ success: true, break: brk });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/periods/:id/breaks/:breakId', (req: Request, res: Response) => {
  try {
    const data = read();
    const pIdx = data.periods.findIndex((p: any) => p.id === req.params.id);
    if (pIdx === -1) return res.status(404).json({ success: false, error: 'Period not found' });
    const bIdx = (data.periods[pIdx].breaks || []).findIndex((b: any) => b.id === req.params.breakId);
    if (bIdx === -1) return res.status(404).json({ success: false, error: 'Break not found' });
    data.periods[pIdx].breaks[bIdx] = { ...data.periods[pIdx].breaks[bIdx], ...req.body, id: req.params.breakId };
    data.periods[pIdx].updatedAt = new Date().toISOString();
    write(data);
    res.json({ success: true, break: data.periods[pIdx].breaks[bIdx] });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/periods/:id/breaks/:breakId', (req: Request, res: Response) => {
  try {
    const data = read();
    const pIdx = data.periods.findIndex((p: any) => p.id === req.params.id);
    if (pIdx === -1) return res.status(404).json({ success: false, error: 'Period not found' });
    data.periods[pIdx].breaks = (data.periods[pIdx].breaks || []).filter((b: any) => b.id !== req.params.breakId);
    data.periods[pIdx].updatedAt = new Date().toISOString();
    write(data);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// ─── Break Library CRUD (global breaks, not tied to a period) ─────────────────
router.get('/breaks', (_req: Request, res: Response) => {
  try { res.json({ success: true, breaks: read().breaks }); }
  catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/breaks', (req: Request, res: Response) => {
  try {
    const { name, startTime, endTime, mustCheckInOut, validStartTime, validEndTime, durationLimit, durationMinutes, lateType } = req.body;
    if (!name || !startTime || !endTime) return res.status(400).json({ success: false, error: 'name, startTime, endTime required' });
    const data = read();
    const brk = {
      id: makeId('break'),
      name, startTime, endTime,
      mustCheckInOut: mustCheckInOut ?? true,
      validStartTime: validStartTime || startTime,
      validEndTime: validEndTime || endTime,
      durationLimit: durationLimit ?? false,
      durationMinutes: durationMinutes ?? 120,
      lateType: lateType || 'Late',
      createdAt: new Date().toISOString(),
    };
    data.breaks.push(brk);
    write(data);
    logger.info(`[ATTENDANCE] Break library: created "${brk.name}"`);
    res.status(201).json({ success: true, break: brk });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/breaks/:id', (req: Request, res: Response) => {
  try {
    const data = read();
    const idx = data.breaks.findIndex((b: any) => b.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Break not found' });
    data.breaks[idx] = { ...data.breaks[idx], ...req.body, id: req.params.id };
    write(data);
    res.json({ success: true, break: data.breaks[idx] });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/breaks/:id', (req: Request, res: Response) => {
  try {
    const data = read();
    data.breaks = data.breaks.filter((b: any) => b.id !== req.params.id);
    write(data);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// ─── Attendance Rules Settings ────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  roundingRule: 'roundDown',       // 'roundDown' | 'roundUp'
  mustCheckInOutForLeave: true,
};

router.get('/rulesSettings', (_req: Request, res: Response) => {
  try {
    const data = read();
    res.json({ success: true, rulesSettings: data.rulesSettings ?? DEFAULT_SETTINGS });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/rulesSettings', (req: Request, res: Response) => {
  try {
    const { roundingRule, mustCheckInOutForLeave } = req.body;
    const data = read();
    const current = data.rulesSettings ?? DEFAULT_SETTINGS;
    const updated = {
      ...current,
      ...(roundingRule !== undefined ? { roundingRule } : {}),
      ...(mustCheckInOutForLeave !== undefined ? { mustCheckInOutForLeave } : {}),
      updatedAt: new Date().toISOString(),
    };
    data.rulesSettings = updated;
    write(data);
    logger.info(`[ATTENDANCE] Rules settings saved`);
    res.json({ success: true, rulesSettings: updated });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

export default router;
