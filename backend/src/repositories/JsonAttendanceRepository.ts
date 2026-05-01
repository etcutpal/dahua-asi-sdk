/**
 * JsonAttendanceRepository.ts
 *
 * JSON-file fallback for attendance data.
 * Reads/writes backend/data/attendance/attendance-period.json
 * Mirrors the original periods.ts logic so no data is lost during migration.
 */

import fs from 'fs';
import path from 'path';
import {
  IAttendanceRepository,
  AttendancePeriod, AttendanceBreak, AttendanceRulesSettings,
  AttendanceShift, AttendanceSchedule, AttendanceHoliday, AttendanceLeaveType, AttendanceLeaveRecord,
} from './IAttendanceRepository';

const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'attendance', 'attendance-period.json');

const DEFAULT_SETTINGS: AttendanceRulesSettings = {
  roundingRule: 'roundDown',
  mustCheckInOutForLeave: true,
};

interface FileStore {
  periods: AttendancePeriod[];
  breaks: AttendanceBreak[];
  rulesSettings: AttendanceRulesSettings | null;
  shifts: AttendanceShift[];
  schedules: AttendanceSchedule[];
  holidays: AttendanceHoliday[];
  leaveTypes: AttendanceLeaveType[];
  leaveRecords: AttendanceLeaveRecord[];
}

function readFile(): FileStore {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(DATA_FILE)) {
      const empty: FileStore = { periods: [], breaks: [], rulesSettings: null, shifts: [], schedules: [], holidays: [], leaveTypes: [], leaveRecords: [] };
      fs.writeFileSync(DATA_FILE, JSON.stringify(empty, null, 2));
      return empty;
    }
    const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    return {
      periods: d.periods || [], breaks: d.breaks || [], rulesSettings: d.rulesSettings ?? null,
      shifts: d.shifts || [], schedules: d.schedules || [],
      holidays: d.holidays || [], leaveTypes: d.leaveTypes || [], leaveRecords: d.leaveRecords || [],
    };
  } catch {
    return { periods: [], breaks: [], rulesSettings: null, shifts: [], schedules: [], holidays: [], leaveTypes: [], leaveRecords: [] };
  }
}

function writeFile(data: FileStore) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

export class JsonAttendanceRepository implements IAttendanceRepository {

  // ── Periods ──────────────────────────────────────────────────────────────

  async getPeriods() { return readFile().periods; }

  async getPeriodById(id: string) {
    return readFile().periods.find(p => p.id === id) ?? null;
  }

  async createPeriod(period: AttendancePeriod) {
    const data = readFile();
    data.periods.push(period);
    writeFile(data);
    return period;
  }

  async updatePeriod(id: string, updates: Partial<AttendancePeriod>) {
    const data = readFile();
    const idx = data.periods.findIndex(p => p.id === id);
    if (idx === -1) throw new Error('Period not found');
    data.periods[idx] = { ...data.periods[idx], ...updates, id, updatedAt: new Date().toISOString() };
    writeFile(data);
    return data.periods[idx];
  }

  async deletePeriod(id: string) {
    const data = readFile();
    data.periods = data.periods.filter(p => p.id !== id);
    writeFile(data);
  }

  // ── Break Library ─────────────────────────────────────────────────────────

  async getBreaks() { return readFile().breaks; }

  async createBreak(brk: AttendanceBreak) {
    const data = readFile();
    data.breaks.push(brk);
    writeFile(data);
    return brk;
  }

  async updateBreak(id: string, updates: Partial<AttendanceBreak>) {
    const data = readFile();
    const idx = data.breaks.findIndex(b => b.id === id);
    if (idx === -1) throw new Error('Break not found');
    data.breaks[idx] = { ...data.breaks[idx], ...updates, id };
    writeFile(data);
    return data.breaks[idx];
  }

  async deleteBreak(id: string) {
    const data = readFile();
    data.breaks = data.breaks.filter(b => b.id !== id);
    writeFile(data);
  }

  // ── Rules Settings ────────────────────────────────────────────────────────

  async getRulesSettings() {
    return readFile().rulesSettings ?? { ...DEFAULT_SETTINGS };
  }

  async saveRulesSettings(settings: Partial<AttendanceRulesSettings>) {
    const data = readFile();
    const current = data.rulesSettings ?? { ...DEFAULT_SETTINGS };
    const updated: AttendanceRulesSettings = { ...current, ...settings, updatedAt: new Date().toISOString() };
    data.rulesSettings = updated;
    writeFile(data);
    return updated;
  }

  // ── Shifts ────────────────────────────────────────────────────────────────

  async getShifts() { return readFile().shifts; }

  async createShift(shift: AttendanceShift) {
    const data = readFile();
    data.shifts.push(shift);
    writeFile(data);
    return shift;
  }

  async updateShift(id: string, updates: Partial<AttendanceShift>) {
    const data = readFile();
    const idx = data.shifts.findIndex(s => s.id === id);
    if (idx === -1) throw new Error('Shift not found');
    data.shifts[idx] = { ...data.shifts[idx], ...updates, id, updatedAt: new Date().toISOString() };
    writeFile(data);
    return data.shifts[idx];
  }

  async deleteShift(id: string) {
    const data = readFile();
    data.shifts = data.shifts.filter(s => s.id !== id);
    writeFile(data);
  }

  // ── Schedules ─────────────────────────────────────────────────────────────

  async getSchedules() { return readFile().schedules; }

  async createSchedule(schedule: AttendanceSchedule) {
    const data = readFile();
    data.schedules.push(schedule);
    writeFile(data);
    return schedule;
  }

  async updateSchedule(id: string, updates: Partial<AttendanceSchedule>) {
    const data = readFile();
    const idx = data.schedules.findIndex(s => s.id === id);
    if (idx === -1) throw new Error('Schedule not found');
    data.schedules[idx] = { ...data.schedules[idx], ...updates, id, updatedAt: new Date().toISOString() };
    writeFile(data);
    return data.schedules[idx];
  }

  async deleteSchedule(id: string) {
    const data = readFile();
    data.schedules = data.schedules.filter(s => s.id !== id);
    writeFile(data);
  }

  // ── Holidays ──────────────────────────────────────────────────────────────

  async getHolidays() { return readFile().holidays; }

  async createHoliday(holiday: AttendanceHoliday) {
    const data = readFile();
    data.holidays.push(holiday);
    writeFile(data);
    return holiday;
  }

  async updateHoliday(id: string, updates: Partial<AttendanceHoliday>) {
    const data = readFile();
    const idx = data.holidays.findIndex(h => h.id === id);
    if (idx === -1) throw new Error('Holiday not found');
    data.holidays[idx] = { ...data.holidays[idx], ...updates, id };
    writeFile(data);
    return data.holidays[idx];
  }

  async deleteHoliday(id: string) {
    const data = readFile();
    data.holidays = data.holidays.filter(h => h.id !== id);
    writeFile(data);
  }

  // ── Leave Types ───────────────────────────────────────────────────────────

  async getLeaveTypes() { return readFile().leaveTypes; }

  async createLeaveType(lt: AttendanceLeaveType) {
    const data = readFile();
    data.leaveTypes.push(lt);
    writeFile(data);
    return lt;
  }

  async updateLeaveType(id: string, updates: Partial<AttendanceLeaveType>) {
    const data = readFile();
    const idx = data.leaveTypes.findIndex(l => l.id === id);
    if (idx === -1) throw new Error('Leave type not found');
    data.leaveTypes[idx] = { ...data.leaveTypes[idx], ...updates, id };
    writeFile(data);
    return data.leaveTypes[idx];
  }

  async deleteLeaveType(id: string) {
    const data = readFile();
    data.leaveTypes = data.leaveTypes.filter(l => l.id !== id);
    writeFile(data);
  }

  // ── Leave Records ──────────────────────────────────────────────────────
  async getLeaveRecords(employeeId?: string) {
    const records = readFile().leaveRecords;
    return employeeId ? records.filter(r => r.employeeId === employeeId) : records;
  }

  async createLeaveRecord(record: AttendanceLeaveRecord) {
    const data = readFile();
    data.leaveRecords.push(record);
    writeFile(data);
    return record;
  }

  async updateLeaveRecord(id: string, updates: Partial<AttendanceLeaveRecord>) {
    const data = readFile();
    const idx = data.leaveRecords.findIndex(r => r.id === id);
    if (idx === -1) throw new Error('Leave record not found');
    data.leaveRecords[idx] = { ...data.leaveRecords[idx], ...updates, id };
    writeFile(data);
    return data.leaveRecords[idx];
  }

  async deleteLeaveRecord(id: string) {
    const data = readFile();
    data.leaveRecords = data.leaveRecords.filter(r => r.id !== id);
    writeFile(data);
  }
}
