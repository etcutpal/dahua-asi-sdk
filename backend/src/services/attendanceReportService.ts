/**
 * attendanceReportService.ts
 *
 * Computes daily attendance records for employees by combining:
 *  - Access swipe records (check-in / check-out)
 *  - Attendance configuration (periods, shifts, schedules)
 *  - Holidays & leave records
 *
 * Returns an array of AttendanceReportRecord — one row per employee per working day.
 */

import RepositoryFactory from '../repositories/RepositoryFactory';
import { AccessRecord } from '../types/access';
import {
  AttendancePeriod,
  AttendanceShift,
  AttendanceSchedule,
  AttendanceHoliday,
  AttendanceLeaveRecord,
} from '../repositories/IAttendanceRepository';
import logger from '../utils/logger';

export interface AttendanceReportRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;            // YYYY-MM-DD
  checkIn?: string;        // HH:MM
  checkOut?: string;       // HH:MM
  status: 'present' | 'absent' | 'late' | 'leave' | 'holiday';
  workMinutes?: number;
  overtimeMinutes?: number;
  lateMinutes?: number;
  periodName?: string;
  shiftName?: string;
  notes?: string;
}

export interface ReportFilters {
  startDate?: string;    // YYYY-MM-DD, default = start of current month
  endDate?: string;      // YYYY-MM-DD, default = today
  employeeId?: string;   // single employee (legacy)
  employeeIds?: string[]; // multiple employees (union with groupId)
  groupId?: string;      // filter by employee group ('all' = no filter)
  status?: string;
}

export interface ReportSummary {
  total: number;
  present: number;
  absent: number;
  late: number;
  leave: number;
  holiday: number;
  totalWorkMinutes: number;
  totalOvertimeMinutes: number;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Format a Date as YYYY-MM-DD using LOCAL time (not UTC). */
function fmtLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function datesBetween(start: string, end: string): string[] {
  const dates: string[] = [];
  const cur = new Date(start + 'T00:00:00');
  const last = new Date(end + 'T00:00:00');
  while (cur <= last) {
    dates.push(fmtLocal(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function diffMinutes(a: string, b: string): number {
  return toMinutes(b) - toMinutes(a);
}

// Returns 'mon','tue',...'sun' for a YYYY-MM-DD string
function dayKey(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][d.getDay()];
}

// ─── main service ─────────────────────────────────────────────────────────────

class AttendanceReportService {
  async generateReport(filters: ReportFilters = {}): Promise<{
    records: AttendanceReportRecord[];
    summary: ReportSummary;
  }> {
    const now = new Date();
    const today = fmtLocal(now);
    const startOfMonth = today.slice(0, 7) + '-01';

    const startDate = filters.startDate || startOfMonth;
    const endDate = filters.endDate || today;

    const attRepo = RepositoryFactory.attendance();
    const accessRepo = RepositoryFactory.accessRecords();
    const empRepo = RepositoryFactory.employees();

    // ── Load all config in parallel ──────────────────────────────────────────
    const [
      allEmployees,
      allSwipes,
      schedules,
      shifts,
      periods,
      holidays,
      leaveRecords,
    ] = await Promise.all([
      empRepo.findAll(),
      accessRepo.getAllRecords(),
      attRepo.getSchedules(),
      attRepo.getShifts(),
      attRepo.getPeriods(),
      attRepo.getHolidays(),
      attRepo.getLeaveRecords(),
    ]);

    // Filter to requested employee(s) / group
    let employees = allEmployees as any[];
    if (filters.employeeId) {
      employees = employees.filter((e: any) => e.id === filters.employeeId);
    } else if (filters.employeeIds && filters.employeeIds.length > 0) {
      const idSet = new Set(filters.employeeIds);
      employees = employees.filter((e: any) => idSet.has(e.id));
    } else if (filters.groupId && filters.groupId !== 'all') {
      employees = employees.filter((e: any) =>
        Array.isArray(e.groups) && e.groups.includes(filters.groupId)
      );
    }

    if (employees.length === 0) {
      return { records: [], summary: makeSummary([]) };
    }

    // ── Index helpers ────────────────────────────────────────────────────────
    const shiftById = new Map<string, AttendanceShift>(shifts.map(s => [s.id, s]));
    const periodById = new Map<string, AttendancePeriod>(periods.map(p => [p.id, p]));

    // Group swipes by userId+date → sorted list of HH:MM strings
    const swipeMap = new Map<string, string[]>(); // key: "userId|YYYY-MM-DD"
    for (const rec of allSwipes as AccessRecord[]) {
      const d = rec.swipeTime?.slice(0, 10);
      if (!d || d < startDate || d > endDate) continue;
      const hhmm = rec.swipeTime?.slice(11, 16);
      if (!hhmm) continue;
      const key = `${rec.userID}|${d}`;
      if (!swipeMap.has(key)) swipeMap.set(key, []);
      swipeMap.get(key)!.push(hhmm);
    }
    // Sort each bucket
    swipeMap.forEach((arr, k) => swipeMap.set(k, arr.sort()));

    const dates = datesBetween(startDate, endDate);
    const records: AttendanceReportRecord[] = [];

    for (const emp of employees) {
      // Find active schedules for this employee (direct or via group membership)
      const FAR_FUTURE = '9999-12-31';
      const empSchedules = schedules.filter(sc => {
        const sEnd = sc.endDate && sc.endDate.trim() !== '' ? sc.endDate : FAR_FUTURE;
        const inDateRange = sc.startDate <= endDate && sEnd >= startDate;
        if (!inDateRange) return false;
        return sc.members?.some(
          (m: any) =>
            (m.type === 'employee' && m.id === emp.id) ||
            (m.type === 'group' && emp.groups?.includes(m.id))
        );
      });

      for (const dateStr of dates) {
        // ── Holiday check ────────────────────────────────────────────────────
        const isHoliday = holidays.some((h: AttendanceHoliday) => {
          if (h.recurring) return h.date.slice(5) === dateStr.slice(5); // MM-DD match
          return h.date === dateStr;
        });
        if (isHoliday) {
          records.push({
            id: `ar_${emp.id}_${dateStr}`,
            employeeId: emp.id,
            employeeName: emp.name,
            date: dateStr,
            status: 'holiday',
          });
          continue;
        }

        // ── Leave check ──────────────────────────────────────────────────────
        const leaveRec = leaveRecords.find(
          (lr: AttendanceLeaveRecord) =>
            lr.employeeId === emp.id &&
            lr.status !== 'cancelled' &&
            lr.startDate <= dateStr &&
            lr.endDate >= dateStr
        );
        if (leaveRec) {
          records.push({
            id: `ar_${emp.id}_${dateStr}`,
            employeeId: emp.id,
            employeeName: emp.name,
            date: dateStr,
            status: 'leave',
            notes: leaveRec.leaveTypeName,
          });
          continue;
        }

        // ── Find applicable schedule/shift/period ───────────────────────────
        // Use the first schedule active on this date
        const schedule = empSchedules.find(
          sc => {
            const sEnd = sc.endDate && sc.endDate.trim() !== '' ? sc.endDate : FAR_FUTURE;
            return sc.startDate <= dateStr && sEnd >= dateStr;
          }
        );

        if (!schedule) {
          // No schedule configured — skip (don't generate absent for unscheduled employees)
          continue;
        }

        const shift = shiftById.get(schedule.shiftId);
        if (!shift) continue;

        // Check if this day is a working day in the shift
        const dk = dayKey(dateStr);
        const workDays: Record<string, boolean> = shift.workDays || {};
        if (!workDays[dk]) continue; // not a scheduled working day

        const period = shift.periodId ? periodById.get(shift.periodId) : null;
        const rules = period?.rules || {};

        // ── Look up swipes ───────────────────────────────────────────────────
        // Match access records by the employee's identity fields.
        // Access records store userID which corresponds to the device-registered
        // personId (e.g. "448008"), not the internal UUID employee id.
        const possibleIds = [
          emp.personId,
          emp.userId,
          emp.id,
          emp.cardNumber,
          ...(Array.isArray(emp.cardNumbers) ? emp.cardNumbers : []),
        ].filter(Boolean);
        let swipes: string[] = [];
        for (const uid of possibleIds) {
          const key = `${uid}|${dateStr}`;
          if (swipeMap.has(key)) { swipes = swipeMap.get(key)!; break; }
        }

        if (swipes.length === 0) {
          // No swipes — absent
          records.push({
            id: `ar_${emp.id}_${dateStr}`,
            employeeId: emp.id,
            employeeName: emp.name,
            date: dateStr,
            status: 'absent',
            periodName: period?.name,
            shiftName: shift.name,
          });
          continue;
        }

        const checkIn = swipes[0];
        const checkOut = swipes.length > 1 ? swipes[swipes.length - 1] : undefined;

        // ── Compute work metrics ─────────────────────────────────────────────
        let workMinutes: number | undefined;
        let lateMinutes: number | undefined;
        let overtimeMinutes: number | undefined;
        let status: AttendanceReportRecord['status'] = 'present';

        if (period) {
          const isFlexible = period.mode === 'flexible';

          const allowedLate = (rules.allowedLateMinutes ?? 15) as number;
          const lateForAbsent = (rules.lateForAbsentMinutes ?? 120) as number;
          const allowedEarlyLeave = (rules.allowedLeaveEarlyMinutes ?? 15) as number;
          const earlyLeaveForAbsent = (rules.earlyLeaveForAbsentMinutes ?? 120) as number;
          const overtimeFrom = (rules.overtimeFromMinutes ?? 60) as number;
          const overtimeEnabled = rules.overtimeEnabled !== false;
          const minOT = (rules.minOvertimeMinutes ?? 60) as number;
          const maxOT = (rules.maxOvertimeMinutes ?? 300) as number;

          // For flexible mode: no fixed start/end — only check required work time
          if (checkOut) {
            workMinutes = diffMinutes(checkIn, checkOut);
          }

          if (!isFlexible && period.startTime) {
            // Late calculation (fixed mode only)
            const late = diffMinutes(period.startTime, checkIn); // positive = late
            if (late > lateForAbsent) {
              status = 'absent';
              lateMinutes = late;
            } else if (late > allowedLate) {
              status = 'late';
              lateMinutes = late;
            }

            // Early leave & Overtime (fixed mode only)
            if (checkOut) {
              const earlyLeave = diffMinutes(checkOut, period.endTime); // positive = left early
              if (earlyLeave > earlyLeaveForAbsent && status !== 'absent') {
                status = 'absent';
              } else if (earlyLeave > allowedEarlyLeave && status === 'present') {
                status = 'late';
              }

              if (overtimeEnabled) {
                const afterEnd = diffMinutes(period.endTime, checkOut);
                if (afterEnd > overtimeFrom) {
                  let ot = afterEnd - overtimeFrom;
                  if (ot < minOT) ot = 0;
                  if (ot > maxOT) ot = maxOT;
                  if (ot > 0) overtimeMinutes = ot;
                }
              }
            }
          } else if (isFlexible) {
            // Flexible mode: mark absent if work time is too short
            if (workMinutes !== undefined && workMinutes < 60) {
              status = 'absent';
            } else if (workMinutes !== undefined && workMinutes < (period.requiredWorkTime || 480)) {
              status = 'late'; // insufficient work
            }
          } else {
            // Fallback: no startTime configured — basic work time calculation
            if (checkOut) {
              workMinutes = diffMinutes(checkIn, checkOut);
            }
          }
        } else {
          // No period configured — just mark present with basic work time
          if (checkOut) {
            workMinutes = diffMinutes(checkIn, checkOut);
          }
        }

        records.push({
          id: `ar_${emp.id}_${dateStr}`,
          employeeId: emp.id,
          employeeName: emp.name,
          date: dateStr,
          checkIn,
          checkOut,
          status,
          workMinutes,
          overtimeMinutes,
          lateMinutes,
          periodName: period?.name,
          shiftName: shift.name,
        });
      }
    }

    // Apply status filter if given
    const filtered = filters.status
      ? records.filter(r => r.status === filters.status)
      : records;

    // Sort by date desc, then employee name
    filtered.sort((a, b) => {
      if (b.date !== a.date) return b.date.localeCompare(a.date);
      return a.employeeName.localeCompare(b.employeeName);
    });

    return { records: filtered, summary: makeSummary(filtered) };
  }
}

function makeSummary(records: AttendanceReportRecord[]): ReportSummary {
  return {
    total: records.length,
    present: records.filter(r => r.status === 'present').length,
    absent: records.filter(r => r.status === 'absent').length,
    late: records.filter(r => r.status === 'late').length,
    leave: records.filter(r => r.status === 'leave').length,
    holiday: records.filter(r => r.status === 'holiday').length,
    totalWorkMinutes: records.reduce((s, r) => s + (r.workMinutes || 0), 0),
    totalOvertimeMinutes: records.reduce((s, r) => s + (r.overtimeMinutes || 0), 0),
  };
}

export default new AttendanceReportService();
