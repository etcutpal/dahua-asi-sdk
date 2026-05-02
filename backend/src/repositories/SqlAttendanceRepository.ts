/**
 * SqlAttendanceRepository.ts
 *
 * SQL implementation of IAttendanceRepository.
 *
 * Complex JSON columns (breaks, rules, workDays, members, assignedTo) are
 * stored as TEXT/NVARCHAR(MAX) and serialised/deserialised with JSON.stringify.
 *
 * Compatible with SQL Server, MySQL, and PostgreSQL via the IDbConnection
 * ? placeholder convention (DatabaseConnection handles dialect differences).
 */

import { IDbConnection } from './DatabaseConnection';
import {
  IAttendanceRepository,
  AttendancePeriod, AttendanceBreak, AttendanceRulesSettings,
  AttendanceShift, AttendanceSchedule, AttendanceHoliday, AttendanceLeaveType, AttendanceLeaveRecord,
} from './IAttendanceRepository';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDate(v: any): Date {
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? new Date() : d;
}

function fromDate(v: any): string {
  if (!v) return new Date().toISOString();
  if (v instanceof Date) return v.toISOString();
  return v;
}

function parseBool(v: any): boolean {
  if (typeof v === 'boolean') return v;
  if (v === 1 || v === '1') return true;
  return false;
}

function parseJson<T>(v: any, fallback: T): T {
  if (!v) return fallback;
  if (typeof v === 'object') return v as T;
  try { return JSON.parse(v) as T; } catch { return fallback; }
}

// ─── Row mappers ──────────────────────────────────────────────────────────────

function rowToPeriod(row: any): AttendancePeriod {
  const isFlexible = row.mode === 'flexible';
  return {
    id:               row.id,
    name:             row.name,
    mode:             isFlexible ? 'flexible' : (row.mode || 'fixed'),
    startTime:        isFlexible ? null : (row.start_time || '09:00'),
    endTime:          isFlexible ? null : (row.end_time   || '18:00'),
    requiredWorkTime: row.required_work_time ?? 480,
    breaks:           parseJson<AttendanceBreak[]>(row.breaks, []),
    rules:            parseJson<Record<string, any>>(row.rules, {}),
    status:           row.status || 'ACTIVE',
    createdAt:        fromDate(row.created_at),
    updatedAt:        fromDate(row.updated_at),
  };
}

function rowToBreak(row: any): AttendanceBreak {
  return {
    id:             row.id,
    name:           row.name,
    startTime:      row.start_time,
    endTime:        row.end_time,
    mustCheckInOut: parseBool(row.must_check_in_out),
    validStartTime: row.valid_start_time || row.start_time,
    validEndTime:   row.valid_end_time   || row.end_time,
    durationLimit:  parseBool(row.duration_limit),
    durationMinutes: row.duration_minutes ?? 120,
    lateType:       row.late_type || 'Late',
    createdAt:      fromDate(row.created_at),
  };
}

function rowToShift(row: any): AttendanceShift {
  return {
    id:             row.id,
    name:           row.name,
    periodId:       row.period_id   || '',
    periodName:     row.period_name || '',
    loopMode:       row.loop_mode   || 'week',
    numberOfCycles: row.number_of_cycles ?? 7,
    workDays:       parseJson<Record<string, boolean>>(row.work_days, {}),
    createdAt:      fromDate(row.created_at),
    updatedAt:      fromDate(row.updated_at),
  };
}

function rowToSchedule(row: any): AttendanceSchedule {
  const rawEnd = row.end_date;
  return {
    id:        row.id,
    shiftId:   row.shift_id   || '',
    shiftName: row.shift_name || '',
    startDate: row.start_date || '',
    // Treat NULL and empty-string as null (unbounded)
    endDate:   (rawEnd && rawEnd.toString().trim() !== '') ? rawEnd : null,
    members:   parseJson<AttendanceSchedule['members']>(row.members, []),
    createdAt: fromDate(row.created_at),
    updatedAt: fromDate(row.updated_at),
  };
}

function rowToHoliday(row: any): AttendanceHoliday {
  return {
    id:        row.id,
    name:      row.name,
    date:      row.date,
    recurring: parseBool(row.recurring),
    type:      row.type || 'company',
    createdAt: fromDate(row.created_at),
  };
}

function rowToLeaveType(row: any): AttendanceLeaveType {
  return {
    id:               row.id,
    name:             row.name,
    paidLeave:        parseBool(row.paid_leave),
    daysPerYear:      row.days_per_year ?? 0,
    carryOver:        parseBool(row.carry_over),
    requiresApproval: parseBool(row.requires_approval),
    color:            row.color || '#3B82F6',
    assignedTo:       parseJson<AttendanceLeaveType['assignedTo']>(row.assigned_to, []),
    createdAt:        fromDate(row.created_at),
  };
}

// ─── SQL Attendance Repository ────────────────────────────────────────────────

export class SqlAttendanceRepository implements IAttendanceRepository {
  constructor(private db: IDbConnection) {}

  // ── Periods ──────────────────────────────────────────────────────────────

  async getPeriods(): Promise<AttendancePeriod[]> {
    const rows = await this.db.query('SELECT * FROM attendance_periods ORDER BY created_at');
    return rows.map(rowToPeriod);
  }

  async getPeriodById(id: string): Promise<AttendancePeriod | null> {
    const rows = await this.db.query('SELECT * FROM attendance_periods WHERE id = ?', [id]);
    return rows.length ? rowToPeriod(rows[0]) : null;
  }

  async createPeriod(p: AttendancePeriod): Promise<AttendancePeriod> {
    await this.db.query(
      `INSERT INTO attendance_periods
         (id, name, mode, start_time, end_time, required_work_time, rules, breaks, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        p.id, p.name, p.mode, p.startTime, p.endTime, p.requiredWorkTime,
        JSON.stringify(p.rules), JSON.stringify(p.breaks),
        p.status || 'ACTIVE',
        toDate(p.createdAt), toDate(p.updatedAt),
      ],
    );
    return p;
  }

  async updatePeriod(id: string, upd: Partial<AttendancePeriod>): Promise<AttendancePeriod> {
    const now = new Date();
    // Build SET clause dynamically — only update fields that are present
    const sets: string[] = [];
    const vals: any[] = [];
    if (upd.name !== undefined)             { sets.push('name=?'); vals.push(upd.name); }
    if (upd.mode !== undefined)             { sets.push('mode=?'); vals.push(upd.mode); }
    if (upd.startTime !== undefined)        { sets.push('start_time=?'); vals.push(upd.startTime); }
    if (upd.endTime !== undefined)          { sets.push('end_time=?'); vals.push(upd.endTime); }
    if (upd.requiredWorkTime !== undefined) { sets.push('required_work_time=?'); vals.push(upd.requiredWorkTime); }
    if (upd.rules !== undefined)            { sets.push('rules=?'); vals.push(JSON.stringify(upd.rules)); }
    if (upd.breaks !== undefined)           { sets.push('breaks=?'); vals.push(JSON.stringify(upd.breaks)); }
    if (upd.status !== undefined)           { sets.push('status=?'); vals.push(upd.status); }
    sets.push('updated_at=?'); vals.push(now);
    vals.push(id);

    await this.db.query(`UPDATE attendance_periods SET ${sets.join(', ')} WHERE id=?`, vals);
    const updated = await this.getPeriodById(id);
    if (!updated) throw new Error('Period not found after update');
    return updated;
  }

  async deletePeriod(id: string): Promise<void> {
    await this.db.query('DELETE FROM attendance_periods WHERE id = ?', [id]);
  }

  // ── Break Library ─────────────────────────────────────────────────────────

  async getBreaks(): Promise<AttendanceBreak[]> {
    const rows = await this.db.query('SELECT * FROM attendance_breaks ORDER BY created_at');
    return rows.map(rowToBreak);
  }

  async createBreak(b: AttendanceBreak): Promise<AttendanceBreak> {
    await this.db.query(
      `INSERT INTO attendance_breaks
         (id, name, start_time, end_time, must_check_in_out, valid_start_time, valid_end_time,
          duration_limit, duration_minutes, late_type, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        b.id, b.name, b.startTime, b.endTime,
        b.mustCheckInOut ? 1 : 0, b.validStartTime, b.validEndTime,
        b.durationLimit ? 1 : 0, b.durationMinutes, b.lateType,
        toDate(b.createdAt),
      ],
    );
    return b;
  }

  async updateBreak(id: string, upd: Partial<AttendanceBreak>): Promise<AttendanceBreak> {
    await this.db.query(
      `UPDATE attendance_breaks SET
         name=?, start_time=?, end_time=?, must_check_in_out=?, valid_start_time=?,
         valid_end_time=?, duration_limit=?, duration_minutes=?, late_type=?
       WHERE id=?`,
      [
        upd.name, upd.startTime, upd.endTime,
        upd.mustCheckInOut ? 1 : 0, upd.validStartTime, upd.validEndTime,
        upd.durationLimit ? 1 : 0, upd.durationMinutes, upd.lateType, id,
      ],
    );
    const rows = await this.db.query('SELECT * FROM attendance_breaks WHERE id = ?', [id]);
    if (!rows.length) throw new Error('Break not found after update');
    return rowToBreak(rows[0]);
  }

  async deleteBreak(id: string): Promise<void> {
    await this.db.query('DELETE FROM attendance_breaks WHERE id = ?', [id]);
  }

  // ── Rules Settings ────────────────────────────────────────────────────────
  // Stored as a single row with id = 'global'.
  // If no row exists yet, defaults are auto-seeded so the table is never empty.

  private readonly DEFAULT_RULES: AttendanceRulesSettings = {
    roundingRule: 'roundDown',
    mustCheckInOutForLeave: true,
  };

  async getRulesSettings(): Promise<AttendanceRulesSettings> {
    const rows = await this.db.query('SELECT * FROM attendance_rules_settings WHERE id = ?', ['global']);
    if (!rows.length) {
      // Auto-seed defaults on first read so the table always has data
      await this.saveRulesSettings(this.DEFAULT_RULES);
      return { ...this.DEFAULT_RULES, updatedAt: new Date().toISOString() };
    }
    return {
      roundingRule:           rows[0].rounding_rule || 'roundDown',
      mustCheckInOutForLeave: parseBool(rows[0].must_check_in_out_for_leave),
      updatedAt:              fromDate(rows[0].updated_at),
    };
  }

  async saveRulesSettings(settings: Partial<AttendanceRulesSettings>): Promise<AttendanceRulesSettings> {
    const rows = await this.db.query('SELECT id, rounding_rule, must_check_in_out_for_leave FROM attendance_rules_settings WHERE id = ?', ['global']);
    const current: AttendanceRulesSettings = rows.length ? {
      roundingRule: rows[0].rounding_rule || 'roundDown',
      mustCheckInOutForLeave: parseBool(rows[0].must_check_in_out_for_leave),
    } : { ...this.DEFAULT_RULES };
    const updated: AttendanceRulesSettings = { ...current, ...settings, updatedAt: new Date().toISOString() };
    if (rows.length) {
      await this.db.query(
        `UPDATE attendance_rules_settings SET rounding_rule=?, must_check_in_out_for_leave=?, updated_at=? WHERE id=?`,
        [updated.roundingRule, updated.mustCheckInOutForLeave ? 1 : 0, toDate(updated.updatedAt), 'global'],
      );
    } else {
      await this.db.query(
        `INSERT INTO attendance_rules_settings (id, rounding_rule, must_check_in_out_for_leave, updated_at) VALUES (?,?,?,?)`,
        ['global', updated.roundingRule, updated.mustCheckInOutForLeave ? 1 : 0, toDate(updated.updatedAt)],
      );
    }
    return updated;
  }

  // ── Shifts ────────────────────────────────────────────────────────────────

  async getShifts(): Promise<AttendanceShift[]> {
    const rows = await this.db.query('SELECT * FROM attendance_shifts ORDER BY created_at');
    return rows.map(rowToShift);
  }

  async createShift(s: AttendanceShift): Promise<AttendanceShift> {
    await this.db.query(
      `INSERT INTO attendance_shifts
         (id, name, period_id, period_name, loop_mode, number_of_cycles, work_days, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        s.id, s.name, s.periodId, s.periodName, s.loopMode, s.numberOfCycles,
        JSON.stringify(s.workDays), toDate(s.createdAt), toDate(s.updatedAt),
      ],
    );
    return s;
  }

  async updateShift(id: string, upd: Partial<AttendanceShift>): Promise<AttendanceShift> {
    const now = new Date();
    await this.db.query(
      `UPDATE attendance_shifts SET
         name=?, period_id=?, period_name=?, loop_mode=?, number_of_cycles=?, work_days=?, updated_at=?
       WHERE id=?`,
      [upd.name, upd.periodId, upd.periodName, upd.loopMode, upd.numberOfCycles, JSON.stringify(upd.workDays ?? {}), now, id],
    );
    const rows = await this.db.query('SELECT * FROM attendance_shifts WHERE id = ?', [id]);
    if (!rows.length) throw new Error('Shift not found after update');
    return rowToShift(rows[0]);
  }

  async deleteShift(id: string): Promise<void> {
    await this.db.query('DELETE FROM attendance_shifts WHERE id = ?', [id]);
  }

  // ── Schedules ─────────────────────────────────────────────────────────────

  async getSchedules(): Promise<AttendanceSchedule[]> {
    const rows = await this.db.query('SELECT * FROM attendance_schedules ORDER BY created_at');
    return rows.map(rowToSchedule);
  }

  async createSchedule(s: AttendanceSchedule): Promise<AttendanceSchedule> {
    await this.db.query(
      `INSERT INTO attendance_schedules
         (id, shift_id, shift_name, start_date, end_date, members, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [s.id, s.shiftId, s.shiftName, s.startDate, s.endDate, JSON.stringify(s.members), toDate(s.createdAt), toDate(s.updatedAt)],
    );
    return s;
  }

  async updateSchedule(id: string, upd: Partial<AttendanceSchedule>): Promise<AttendanceSchedule> {
    const now = new Date();
    await this.db.query(
      `UPDATE attendance_schedules SET
         shift_id=?, shift_name=?, start_date=?, end_date=?, members=?, updated_at=?
       WHERE id=?`,
      [upd.shiftId, upd.shiftName, upd.startDate, upd.endDate, JSON.stringify(upd.members ?? []), now, id],
    );
    const rows = await this.db.query('SELECT * FROM attendance_schedules WHERE id = ?', [id]);
    if (!rows.length) throw new Error('Schedule not found after update');
    return rowToSchedule(rows[0]);
  }

  async deleteSchedule(id: string): Promise<void> {
    await this.db.query('DELETE FROM attendance_schedules WHERE id = ?', [id]);
  }

  // ── Holidays ──────────────────────────────────────────────────────────────

  async getHolidays(): Promise<AttendanceHoliday[]> {
    const rows = await this.db.query('SELECT * FROM attendance_holidays ORDER BY date');
    return rows.map(rowToHoliday);
  }

  async createHoliday(h: AttendanceHoliday): Promise<AttendanceHoliday> {
    await this.db.query(
      `INSERT INTO attendance_holidays (id, name, date, recurring, type, created_at) VALUES (?,?,?,?,?,?)`,
      [h.id, h.name, h.date, h.recurring ? 1 : 0, h.type, toDate(h.createdAt)],
    );
    return h;
  }

  async updateHoliday(id: string, upd: Partial<AttendanceHoliday>): Promise<AttendanceHoliday> {
    await this.db.query(
      `UPDATE attendance_holidays SET name=?, date=?, recurring=?, type=? WHERE id=?`,
      [upd.name, upd.date, upd.recurring ? 1 : 0, upd.type, id],
    );
    const rows = await this.db.query('SELECT * FROM attendance_holidays WHERE id = ?', [id]);
    if (!rows.length) throw new Error('Holiday not found after update');
    return rowToHoliday(rows[0]);
  }

  async deleteHoliday(id: string): Promise<void> {
    await this.db.query('DELETE FROM attendance_holidays WHERE id = ?', [id]);
  }

  // ── Leave Types ───────────────────────────────────────────────────────────

  async getLeaveTypes(): Promise<AttendanceLeaveType[]> {
    const rows = await this.db.query('SELECT * FROM attendance_leave_types ORDER BY created_at');
    return rows.map(rowToLeaveType);
  }

  async createLeaveType(lt: AttendanceLeaveType): Promise<AttendanceLeaveType> {
    await this.db.query(
      `INSERT INTO attendance_leave_types
         (id, name, paid_leave, days_per_year, carry_over, requires_approval, color, assigned_to, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        lt.id, lt.name,
        lt.paidLeave ? 1 : 0, lt.daysPerYear,
        lt.carryOver ? 1 : 0, lt.requiresApproval ? 1 : 0,
        lt.color, JSON.stringify(lt.assignedTo ?? []),
        toDate(lt.createdAt),
      ],
    );
    return lt;
  }

  async updateLeaveType(id: string, upd: Partial<AttendanceLeaveType>): Promise<AttendanceLeaveType> {
    await this.db.query(
      `UPDATE attendance_leave_types SET
         name=?, paid_leave=?, days_per_year=?, carry_over=?, requires_approval=?, color=?, assigned_to=?
       WHERE id=?`,
      [
        upd.name,
        upd.paidLeave ? 1 : 0, upd.daysPerYear,
        upd.carryOver ? 1 : 0, upd.requiresApproval ? 1 : 0,
        upd.color, JSON.stringify(upd.assignedTo ?? []), id,
      ],
    );
    const rows = await this.db.query('SELECT * FROM attendance_leave_types WHERE id = ?', [id]);
    if (!rows.length) throw new Error('Leave type not found after update');
    return rowToLeaveType(rows[0]);
  }

  async deleteLeaveType(id: string): Promise<void> {
    await this.db.query('DELETE FROM attendance_leave_types WHERE id = ?', [id]);
  }

  // ── Leave Records ──────────────────────────────────────────────────────
  async getLeaveRecords(employeeId?: string): Promise<AttendanceLeaveRecord[]> {
    const rows = employeeId
      ? await this.db.query('SELECT * FROM attendance_leave_records WHERE employee_id = ? ORDER BY start_date DESC', [employeeId])
      : await this.db.query('SELECT * FROM attendance_leave_records ORDER BY start_date DESC');
    return rows.map((r: any) => ({
      id: r.id,
      employeeId: r.employee_id,
      employeeName: r.employee_name,
      leaveTypeId: r.leave_type_id,
      leaveTypeName: r.leave_type_name,
      leaveTypeColor: r.leave_type_color || '#3B82F6',
      startDate: r.start_date,
      endDate: r.end_date,
      days: r.days,
      notes: r.notes || '',
      status: r.status || 'approved',
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
      updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
    }));
  }

  async createLeaveRecord(rec: AttendanceLeaveRecord): Promise<AttendanceLeaveRecord> {
    await this.db.query(
      `INSERT INTO attendance_leave_records
         (id, employee_id, employee_name, leave_type_id, leave_type_name, leave_type_color,
          start_date, end_date, days, notes, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        rec.id, rec.employeeId, rec.employeeName, rec.leaveTypeId, rec.leaveTypeName, rec.leaveTypeColor,
        rec.startDate, rec.endDate, rec.days, rec.notes || '', rec.status,
        toDate(rec.createdAt), toDate(rec.updatedAt),
      ],
    );
    return rec;
  }

  async updateLeaveRecord(id: string, upd: Partial<AttendanceLeaveRecord>): Promise<AttendanceLeaveRecord> {
    await this.db.query(
      `UPDATE attendance_leave_records SET
         employee_id=?, employee_name=?, leave_type_id=?, leave_type_name=?, leave_type_color=?,
         start_date=?, end_date=?, days=?, notes=?, status=?, updated_at=?
       WHERE id=?`,
      [
        upd.employeeId, upd.employeeName, upd.leaveTypeId, upd.leaveTypeName, upd.leaveTypeColor,
        upd.startDate, upd.endDate, upd.days, upd.notes || '', upd.status,
        toDate(upd.updatedAt || new Date().toISOString()), id,
      ],
    );
    const rows = await this.db.query('SELECT * FROM attendance_leave_records WHERE id = ?', [id]);
    if (!rows.length) throw new Error('Leave record not found after update');
    const r = rows[0];
    return {
      id: r.id, employeeId: r.employee_id, employeeName: r.employee_name,
      leaveTypeId: r.leave_type_id, leaveTypeName: r.leave_type_name, leaveTypeColor: r.leave_type_color || '#3B82F6',
      startDate: r.start_date, endDate: r.end_date, days: r.days, notes: r.notes || '',
      status: r.status || 'approved',
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
      updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
    };
  }

  async deleteLeaveRecord(id: string): Promise<void> {
    await this.db.query('DELETE FROM attendance_leave_records WHERE id = ?', [id]);
  }
}
