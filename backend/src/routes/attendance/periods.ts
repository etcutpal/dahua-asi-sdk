/**
 * attendance/periods.ts
 *
 * All attendance configuration routes:
 *  Periods, Break Library, RulesSettings, Shifts, Schedules, Holidays, LeaveTypes
 *
 * Uses RepositoryFactory.attendance() which returns:
 *  - SqlAttendanceRepository  when a SQL database is configured
 *  - JsonAttendanceRepository when no database is configured (JSON file fallback)
 *
 * The API surface (URLs, request/response shapes) is unchanged — frontend needs no changes.
 */

import express, { Request, Response } from 'express';
import logger from '../../utils/logger';
import RepositoryFactory from '../../repositories/RepositoryFactory';
import attendanceReportService from '../../services/attendanceReportService';

const router = express.Router();

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

const repo = () => RepositoryFactory.attendance();

// ─── Periods CRUD ─────────────────────────────────────────────────────────────

router.get('/periods', async (_req: Request, res: Response) => {
  try { res.json({ success: true, periods: await repo().getPeriods() }); }
  catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/periods', async (req: Request, res: Response) => {
  try {
    const { name, mode, startTime, endTime, requiredWorkTime, rules } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'name is required' });
    const period = await repo().createPeriod({
      id: makeId('period'), name,
      mode: mode || 'fixed',
      startTime: startTime || '09:00',
      endTime: endTime || '18:00',
      requiredWorkTime: requiredWorkTime ?? 480,
      breaks: [], rules: rules || {}, status: 'ACTIVE',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    logger.info(`[ATTENDANCE] Created period: ${period.name}`);
    res.status(201).json({ success: true, period });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/periods/:id', async (req: Request, res: Response) => {
  try {
    const period = await repo().updatePeriod(req.params.id, { ...req.body, updatedAt: new Date().toISOString() });
    logger.info(`[ATTENDANCE] Updated period: ${req.params.id}`);
    res.json({ success: true, period });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/periods/:id', async (req: Request, res: Response) => {
  try {
    await repo().deletePeriod(req.params.id);
    logger.info(`[ATTENDANCE] Deleted period: ${req.params.id}`);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// ─── Period-embedded Breaks ───────────────────────────────────────────────────

router.post('/periods/:id/breaks', async (req: Request, res: Response) => {
  try {
    const { name, startTime, endTime, mustCheckInOut, validStartTime, validEndTime, durationLimit, lateType } = req.body;
    if (!name || !startTime || !endTime)
      return res.status(400).json({ success: false, error: 'name, startTime and endTime are required' });
    const period = await repo().getPeriodById(req.params.id);
    if (!period) return res.status(404).json({ success: false, error: 'Period not found' });
    const brk = {
      id: makeId('break'), name, startTime, endTime,
      mustCheckInOut: mustCheckInOut ?? true,
      validStartTime: validStartTime || startTime,
      validEndTime: validEndTime || endTime,
      durationLimit: durationLimit ?? false,
      durationMinutes: req.body.durationMinutes ?? 120,
      lateType: lateType || 'None',
      createdAt: new Date().toISOString(),
    };
    await repo().updatePeriod(req.params.id, { breaks: [...(period.breaks || []), brk] });
    logger.info(`[ATTENDANCE] Added break "${brk.name}" to period ${req.params.id}`);
    res.status(201).json({ success: true, break: brk });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/periods/:id/breaks/:breakId', async (req: Request, res: Response) => {
  try {
    const period = await repo().getPeriodById(req.params.id);
    if (!period) return res.status(404).json({ success: false, error: 'Period not found' });
    const breaks = (period.breaks || []).map((b: any) =>
      b.id === req.params.breakId ? { ...b, ...req.body, id: req.params.breakId } : b
    );
    await repo().updatePeriod(req.params.id, { breaks });
    res.json({ success: true, break: breaks.find((b: any) => b.id === req.params.breakId) });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/periods/:id/breaks/:breakId', async (req: Request, res: Response) => {
  try {
    const period = await repo().getPeriodById(req.params.id);
    if (!period) return res.status(404).json({ success: false, error: 'Period not found' });
    await repo().updatePeriod(req.params.id, {
      breaks: (period.breaks || []).filter((b: any) => b.id !== req.params.breakId),
    });
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// ─── Break Library CRUD ───────────────────────────────────────────────────────

router.get('/breaks', async (_req: Request, res: Response) => {
  try { res.json({ success: true, breaks: await repo().getBreaks() }); }
  catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/breaks', async (req: Request, res: Response) => {
  try {
    const { name, startTime, endTime, mustCheckInOut, validStartTime, validEndTime, durationLimit, durationMinutes, lateType } = req.body;
    if (!name || !startTime || !endTime)
      return res.status(400).json({ success: false, error: 'name, startTime, endTime required' });
    const brk = await repo().createBreak({
      id: makeId('break'), name, startTime, endTime,
      mustCheckInOut: mustCheckInOut ?? true,
      validStartTime: validStartTime || startTime,
      validEndTime: validEndTime || endTime,
      durationLimit: durationLimit ?? false,
      durationMinutes: durationMinutes ?? 120,
      lateType: lateType || 'Late',
      createdAt: new Date().toISOString(),
    });
    logger.info(`[ATTENDANCE] Break library: created "${brk.name}"`);
    res.status(201).json({ success: true, break: brk });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/breaks/:id', async (req: Request, res: Response) => {
  try {
    const brk = await repo().updateBreak(req.params.id, req.body);
    res.json({ success: true, break: brk });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/breaks/:id', async (req: Request, res: Response) => {
  try {
    await repo().deleteBreak(req.params.id);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// ─── Attendance Rules Settings ────────────────────────────────────────────────

router.get('/rulesSettings', async (_req: Request, res: Response) => {
  try { res.json({ success: true, rulesSettings: await repo().getRulesSettings() }); }
  catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/rulesSettings', async (req: Request, res: Response) => {
  try {
    const { roundingRule, mustCheckInOutForLeave } = req.body;
    const rulesSettings = await repo().saveRulesSettings({ roundingRule, mustCheckInOutForLeave });
    logger.info(`[ATTENDANCE] Rules settings saved`);
    res.json({ success: true, rulesSettings });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// ─── Shifts CRUD ──────────────────────────────────────────────────────────────

router.get('/shifts', async (_req: Request, res: Response) => {
  try { res.json({ success: true, shifts: await repo().getShifts() }); }
  catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/shifts', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (!body.name) return res.status(400).json({ success: false, error: 'name is required' });
    const shift = await repo().createShift({
      id: makeId('shift'), ...body,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    logger.info(`[ATTENDANCE] Created shift: ${shift.name}`);
    res.status(201).json({ success: true, shift });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/shifts/:id', async (req: Request, res: Response) => {
  try {
    const shift = await repo().updateShift(req.params.id, { ...req.body, updatedAt: new Date().toISOString() });
    res.json({ success: true, shift });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/shifts/:id', async (req: Request, res: Response) => {
  try {
    await repo().deleteShift(req.params.id);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// ─── Schedules CRUD ───────────────────────────────────────────────────────────

router.get('/schedules', async (_req: Request, res: Response) => {
  try { res.json({ success: true, schedules: await repo().getSchedules() }); }
  catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/schedules', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (!body.shiftId || !body.startDate)
      return res.status(400).json({ success: false, error: 'shiftId and startDate required' });
    const schedule = await repo().createSchedule({
      id: makeId('schedule'), ...body,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    logger.info(`[ATTENDANCE] Created schedule for shift: ${body.shiftName}`);
    res.status(201).json({ success: true, schedule });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/schedules/:id', async (req: Request, res: Response) => {
  try {
    const schedule = await repo().updateSchedule(req.params.id, { ...req.body, updatedAt: new Date().toISOString() });
    res.json({ success: true, schedule });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/schedules/:id', async (req: Request, res: Response) => {
  try {
    await repo().deleteSchedule(req.params.id);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// ─── Holidays CRUD ────────────────────────────────────────────────────────────

router.get('/holidays', async (_req: Request, res: Response) => {
  try { res.json({ success: true, holidays: await repo().getHolidays() }); }
  catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/holidays', async (req: Request, res: Response) => {
  try {
    const { name, date, recurring, type } = req.body;
    if (!name || !date) return res.status(400).json({ success: false, error: 'name and date required' });
    const holiday = await repo().createHoliday({
      id: makeId('holiday'), name, date,
      recurring: recurring ?? false, type: type || 'company',
      createdAt: new Date().toISOString(),
    });
    res.status(201).json({ success: true, holiday });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/holidays/:id', async (req: Request, res: Response) => {
  try {
    const holiday = await repo().updateHoliday(req.params.id, req.body);
    res.json({ success: true, holiday });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/holidays/:id', async (req: Request, res: Response) => {
  try {
    await repo().deleteHoliday(req.params.id);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// ─── Leave Types CRUD ─────────────────────────────────────────────────────────

router.get('/leave-types', async (_req: Request, res: Response) => {
  try { res.json({ success: true, leaveTypes: await repo().getLeaveTypes() }); }
  catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/leave-types', async (req: Request, res: Response) => {
  try {
    const { name, paidLeave, daysPerYear, carryOver, requiresApproval, color } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'name required' });
    const leaveType = await repo().createLeaveType({
      id: makeId('leave'), name,
      paidLeave: paidLeave ?? true, daysPerYear: daysPerYear ?? 0,
      carryOver: carryOver ?? false, requiresApproval: requiresApproval ?? true,
      color: color || '#3B82F6', assignedTo: [],
      createdAt: new Date().toISOString(),
    });
    res.status(201).json({ success: true, leaveType });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/leave-types/:id', async (req: Request, res: Response) => {
  try {
    const leaveType = await repo().updateLeaveType(req.params.id, req.body);
    res.json({ success: true, leaveType });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/leave-types/:id', async (req: Request, res: Response) => {
  try {
    await repo().deleteLeaveType(req.params.id);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// ─── Leave Records ────────────────────────────────────────────────────────────
router.get('/leave-records', async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.query;
    const leaveRecords = await repo().getLeaveRecords(employeeId as string | undefined);
    res.json({ success: true, leaveRecords });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/leave-records', async (req: Request, res: Response) => {
  try {
    const { employeeId, employeeName, leaveTypeId, leaveTypeName, leaveTypeColor, startDate, endDate, days, notes, status } = req.body;
    if (!employeeId || !leaveTypeId || !startDate || !endDate) {
      return res.status(400).json({ success: false, error: 'employeeId, leaveTypeId, startDate, endDate required' });
    }
    const now = new Date().toISOString();
    const record = await repo().createLeaveRecord({
      id: makeId('lr'), employeeId, employeeName: employeeName || '',
      leaveTypeId, leaveTypeName: leaveTypeName || '', leaveTypeColor: leaveTypeColor || '#3B82F6',
      startDate, endDate, days: days ?? 1, notes: notes || '',
      status: status || 'approved', createdAt: now, updatedAt: now,
    });
    res.status(201).json({ success: true, leaveRecord: record });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/leave-records/:id', async (req: Request, res: Response) => {
  try {
    const leaveRecord = await repo().updateLeaveRecord(req.params.id, { ...req.body, updatedAt: new Date().toISOString() });
    res.json({ success: true, leaveRecord });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/leave-records/:id', async (req: Request, res: Response) => {
  try {
    await repo().deleteLeaveRecord(req.params.id);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// ─── Attendance Report (Records) ──────────────────────────────────────────────
router.get('/records', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, employeeId, status } = req.query;
    const { records, summary } = await attendanceReportService.generateReport({
      startDate: startDate as string | undefined,
      endDate: endDate as string | undefined,
      employeeId: employeeId as string | undefined,
      status: status as string | undefined,
    });
    res.json({ success: true, records, summary });
  } catch (e: any) {
    logger.error('[ATTENDANCE] Error generating attendance report:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
