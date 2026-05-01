/**
 * IAttendanceRepository.ts
 *
 * Defines the storage interface for all attendance configuration data:
 *  Periods, Breaks (library), RulesSettings, Shifts, Schedules, Holidays, LeaveTypes
 */

export interface AttendancePeriod {
  id: string;
  name: string;
  mode: string;
  startTime: string;
  endTime: string;
  requiredWorkTime: number;
  breaks: AttendanceBreak[];
  rules: Record<string, any>;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceBreak {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  mustCheckInOut: boolean;
  validStartTime: string;
  validEndTime: string;
  durationLimit: boolean;
  durationMinutes: number;
  lateType: string;
  createdAt: string;
}

export interface AttendanceRulesSettings {
  roundingRule: string;
  mustCheckInOutForLeave: boolean;
  updatedAt?: string;
}

export interface AttendanceShift {
  id: string;
  name: string;
  periodId: string;
  periodName: string;
  loopMode: string;
  numberOfCycles: number;
  workDays: Record<string, boolean>;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceSchedule {
  id: string;
  shiftId: string;
  shiftName: string;
  startDate: string;
  endDate: string;
  members: Array<{ id: string; name: string; type: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceHoliday {
  id: string;
  name: string;
  date: string;
  recurring: boolean;
  type: string;
  createdAt: string;
}

export interface AttendanceLeaveType {
  id: string;
  name: string;
  paidLeave: boolean;
  daysPerYear: number;
  carryOver: boolean;
  requiresApproval: boolean;
  color: string;
  assignedTo?: Array<{ id: string; name: string; type: string }>;
  createdAt: string;
}

export interface AttendanceLeaveRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  leaveTypeId: string;
  leaveTypeName: string;
  leaveTypeColor: string;
  startDate: string;   // YYYY-MM-DD
  endDate: string;     // YYYY-MM-DD
  days: number;
  notes?: string;
  status: 'approved' | 'taken' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

export interface IAttendanceRepository {
  // ── Periods ──
  getPeriods(): Promise<AttendancePeriod[]>;
  getPeriodById(id: string): Promise<AttendancePeriod | null>;
  createPeriod(period: AttendancePeriod): Promise<AttendancePeriod>;
  updatePeriod(id: string, data: Partial<AttendancePeriod>): Promise<AttendancePeriod>;
  deletePeriod(id: string): Promise<void>;

  // ── Break Library ──
  getBreaks(): Promise<AttendanceBreak[]>;
  createBreak(brk: AttendanceBreak): Promise<AttendanceBreak>;
  updateBreak(id: string, data: Partial<AttendanceBreak>): Promise<AttendanceBreak>;
  deleteBreak(id: string): Promise<void>;

  // ── Rules Settings ──
  getRulesSettings(): Promise<AttendanceRulesSettings>;
  saveRulesSettings(settings: Partial<AttendanceRulesSettings>): Promise<AttendanceRulesSettings>;

  // ── Shifts ──
  getShifts(): Promise<AttendanceShift[]>;
  createShift(shift: AttendanceShift): Promise<AttendanceShift>;
  updateShift(id: string, data: Partial<AttendanceShift>): Promise<AttendanceShift>;
  deleteShift(id: string): Promise<void>;

  // ── Schedules ──
  getSchedules(): Promise<AttendanceSchedule[]>;
  createSchedule(schedule: AttendanceSchedule): Promise<AttendanceSchedule>;
  updateSchedule(id: string, data: Partial<AttendanceSchedule>): Promise<AttendanceSchedule>;
  deleteSchedule(id: string): Promise<void>;

  // ── Holidays ──
  getHolidays(): Promise<AttendanceHoliday[]>;
  createHoliday(holiday: AttendanceHoliday): Promise<AttendanceHoliday>;
  updateHoliday(id: string, data: Partial<AttendanceHoliday>): Promise<AttendanceHoliday>;
  deleteHoliday(id: string): Promise<void>;

  // ── Leave Types ──
  getLeaveTypes(): Promise<AttendanceLeaveType[]>;
  createLeaveType(lt: AttendanceLeaveType): Promise<AttendanceLeaveType>;
  updateLeaveType(id: string, data: Partial<AttendanceLeaveType>): Promise<AttendanceLeaveType>;
  deleteLeaveType(id: string): Promise<void>;

  // ── Leave Records ──
  getLeaveRecords(employeeId?: string): Promise<AttendanceLeaveRecord[]>;
  createLeaveRecord(record: AttendanceLeaveRecord): Promise<AttendanceLeaveRecord>;
  updateLeaveRecord(id: string, data: Partial<AttendanceLeaveRecord>): Promise<AttendanceLeaveRecord>;
  deleteLeaveRecord(id: string): Promise<void>;
}
