'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Link from 'next/link';

const API = 'http://localhost:3001';

const Icon = ({ path, className = "w-5 h-5" }: { path: string; className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d={path} />
  </svg>
);

type TabType = 'rules' | 'periods' | 'shifts' | 'schedules' | 'holidays';
type AttendanceRuleKey = 'overtimeFrom' | 'allowedLate' | 'lateForAbsent' | 'allowedLeave' | 'leaveForAbsent' | 'minOvertime' | 'maxOvertime';

interface BreakItem {
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
}

interface Period {
  id: string;
  name: string;
  mode: 'fixed' | 'flexible';
  startTime: string;
  endTime: string;
  requiredWorkTime: number;
  breaks: BreakItem[];
  status: string;
  rules?: PeriodRuleValues;
}

interface PeriodRuleValues {
  overtimeFromMinutes: number;
  allowedLateMinutes: number;
  lateForAbsentMinutes: number;
  allowedLeaveEarlyMinutes: number;
  earlyLeaveForAbsentMinutes: number;
  overtimeEnabled: boolean;
  minOvertimeMinutes: number;
  maxOvertimeMinutes: number;
}

const DEFAULT_PERIOD_RULES: PeriodRuleValues = {
  overtimeFromMinutes: 60,
  allowedLateMinutes: 15,
  lateForAbsentMinutes: 120,
  allowedLeaveEarlyMinutes: 15,
  earlyLeaveForAbsentMinutes: 120,
  overtimeEnabled: true,
  minOvertimeMinutes: 60,
  maxOvertimeMinutes: 300,
};

interface Holiday {
  id: string;
  name: string;
  date: string;
  recurring: boolean;
  type: 'public' | 'company';
}

interface LeaveType {
  id: string;
  name: string;
  paidLeave: boolean;
  daysPerYear: number;
  carryOver: boolean;
  requiresApproval: boolean;
  color: string;
  assignedTo?: AssignedMember[]; // empty / undefined = applies to all employees
}

interface LeaveRecord {
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

type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
const ALL_DAYS: { key: DayKey; label: string }[] = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

interface WorkDays {
  mon: boolean; tue: boolean; wed: boolean; thu: boolean;
  fri: boolean; sat: boolean; sun: boolean;
}

interface ShiftItem {
  id: string;
  name: string;
  periodId: string;
  periodName: string;
  loopMode: 'day' | 'week';
  numberOfCycles: number;
  workDays: WorkDays;
}

interface AssignedMember {
  id: string;
  name: string;
  type: 'employee' | 'group';
}

interface ShiftSchedule {
  id: string;
  shiftId: string;
  shiftName: string;
  startDate: string;
  endDate: string;
  members: AssignedMember[];
}

// ─── Add Break Modal ──────────────────────────────────────────────────────────
function AddBreakModal({
  show,
  editBreak,
  onSave,
  onClose,
}: {
  show: boolean;
  editBreak: BreakItem | null;
  onSave: (b: BreakItem) => void;
  onClose: () => void;
}) {
  const blank: BreakItem = { id: '', name: '', startTime: '12:00', endTime: '13:00', mustCheckInOut: true, validStartTime: '11:30', validEndTime: '13:30', durationLimit: false, durationMinutes: 120, lateType: 'Late' };
  const [form, setForm] = useState<BreakItem>(blank);

  useEffect(() => {
    setForm(editBreak ? { ...editBreak } : { ...blank });
  }, [editBreak, show]);

  if (!show) return null;

  const set = (k: keyof BreakItem, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  const handleOk = () => {
    if (!form.name.trim()) { alert('Break Name is required'); return; }
    onSave({ ...form, id: form.id || `break_${Date.now()}` });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-lg shadow-2xl w-[700px] max-h-[90vh] overflow-hidden">
        <div className="px-5 py-3 bg-gray-50 border-b flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">{editBreak ? 'Edit Break' : 'Add New Break'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><Icon path="M6 18L18 6M6 6l12 12" className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Break Name */}
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-700 w-36">Break Name <span className="text-red-500">*</span></label>
            <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
              className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
          </div>
          {/* Start / End Time */}
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-700 w-36">Start Time</label>
            <input type="time" value={form.startTime} onChange={e => set('startTime', e.target.value)}
              className="px-2 py-1.5 border border-gray-300 rounded-md text-sm w-32 focus:ring-2 focus:ring-blue-500" />
            <label className="text-sm text-gray-700 ml-4">End Time</label>
            <input type="time" value={form.endTime} onChange={e => set('endTime', e.target.value)}
              className="px-2 py-1.5 border border-gray-300 rounded-md text-sm w-32 focus:ring-2 focus:ring-blue-500" />
          </div>
          {/* Must Check In/Out */}
          <div className="flex items-center gap-6">
            <label className="text-sm text-gray-700 w-36">Must Check In/Out</label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={form.mustCheckInOut} onChange={() => set('mustCheckInOut', true)}
                className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500" />
              <span className="text-sm text-gray-700">Yes</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={!form.mustCheckInOut} onChange={() => set('mustCheckInOut', false)}
                className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500" />
              <span className="text-sm text-gray-700">No</span>
            </label>
          </div>
          {/* Valid Start / End Time */}
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-700 w-36">Valid Start Time</label>
            <input type="time" value={form.validStartTime} onChange={e => set('validStartTime', e.target.value)}
              className="px-2 py-1.5 border border-gray-300 rounded-md text-sm w-32 focus:ring-2 focus:ring-blue-500" />
            <label className="text-sm text-gray-700 ml-4">Valid End Time</label>
            <input type="time" value={form.validEndTime} onChange={e => set('validEndTime', e.target.value)}
              className="px-2 py-1.5 border border-gray-300 rounded-md text-sm w-32 focus:ring-2 focus:ring-blue-500" />
          </div>
          {/* Duration Limit row */}
          <div className="flex items-center gap-2 flex-wrap">
            <input type="checkbox" checked={form.durationLimit} onChange={e => set('durationLimit', e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
            <span className="text-sm text-gray-700">Breaks that last longer than</span>
            <input type="number" value={form.durationMinutes} step="0.01"
              onChange={e => set('durationMinutes', parseFloat(e.target.value) || 0)}
              disabled={!form.durationLimit}
              className={`px-2 py-1 border border-gray-300 rounded text-sm w-24 focus:ring-2 focus:ring-blue-500 ${!form.durationLimit ? 'bg-gray-100 text-gray-400' : ''}`} />
            <span className="text-sm text-gray-700">minutes will be</span>
            <select value={form.lateType} onChange={e => set('lateType', e.target.value)}
              disabled={!form.durationLimit}
              className={`px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 ${!form.durationLimit ? 'bg-gray-100 text-gray-400' : ''}`}>
              <option>Late</option>
              <option>Absent</option>
              <option>None</option>
            </select>
          </div>
        </div>
        <div className="px-5 py-3 bg-gray-50 border-t flex justify-end gap-2">
          <button onClick={handleOk} className="px-5 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors">OK</button>
          <button onClick={onClose} className="px-5 py-2 bg-gray-200 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-300 transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Select Break Modal ───────────────────────────────────────────────────────
function SelectBreakModal({
  show,
  allBreaks,
  onSelect,
  onClose,
  onEditBreak,
  onDeleteBreak,
}: {
  show: boolean;
  allBreaks: BreakItem[];
  onSelect: (selected: BreakItem[]) => void;
  onClose: () => void;
  onEditBreak: (b: BreakItem) => void;
  onDeleteBreak: (id: string) => void;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [editTarget, setEditTarget] = useState<BreakItem | null>(null);

  useEffect(() => { if (show) { setChecked(new Set()); setEditTarget(null); } }, [show]);

  if (!show) return null;

  const toggle = (id: string) => setChecked(prev => {
    const s = new Set(prev);
    s.has(id) ? s.delete(id) : s.add(id);
    return s;
  });

  const handleOk = () => {
    const selected = allBreaks.filter(b => checked.has(b.id)).map(b => ({ ...b, id: `break_${Date.now()}_${Math.random().toString(36).slice(2,5)}` }));
    onSelect(selected);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Delete this break from the library?')) return;
    onDeleteBreak(id);
    setChecked(prev => { const s = new Set(prev); s.delete(id); return s; });
  };

  // If editing inline — delegate to AddBreakModal via parent
  const handleEditClick = (e: React.MouseEvent, b: BreakItem) => {
    e.stopPropagation();
    setEditTarget(b);
  };

  return (
    <>
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-lg shadow-2xl w-[620px] max-h-[80vh] overflow-hidden flex flex-col">
        <div className="px-5 py-3 bg-gray-50 border-b flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Select Break</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><Icon path="M6 18L18 6M6 6l12 12" className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="w-10 px-3 py-2"></th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Name</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Start</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">End</th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {allBreaks.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-400">No breaks available. Use "Add New Break" to create one.</td></tr>
              ) : allBreaks.map(b => (
                <tr key={b.id} className={`${checked.has(b.id) ? 'bg-blue-50' : 'hover:bg-gray-50'} cursor-pointer`} onClick={() => toggle(b.id)}>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" checked={checked.has(b.id)} onChange={() => toggle(b.id)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" onClick={e => e.stopPropagation()} />
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-900 font-medium">{b.name}</td>
                  <td className="px-3 py-2 text-sm text-gray-600">{b.startTime}</td>
                  <td className="px-3 py-2 text-sm text-gray-600">{b.endTime}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={(e) => handleEditClick(e, b)}
                        className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors" title="Edit">
                        <Icon path="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={(e) => handleDelete(e, b.id)}
                        className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors" title="Delete">
                        <Icon path="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 bg-gray-50 border-t flex justify-end gap-2">
          <button onClick={handleOk} disabled={checked.size === 0}
            className="px-5 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            OK {checked.size > 0 && `(${checked.size})`}
          </button>
          <button onClick={onClose} className="px-5 py-2 bg-gray-200 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-300 transition-colors">Cancel</button>
        </div>
      </div>
    </div>

    {/* Inline edit via AddBreakModal */}
    <AddBreakModal
      show={editTarget !== null}
      editBreak={editTarget}
      onSave={(updated) => { onEditBreak(updated); setEditTarget(null); }}
      onClose={() => setEditTarget(null)}
    />
    </>
  );
}

// ─── Period Details Modal ─────────────────────────────────────────────────────
function PeriodDetailsModal({
  show,
  isEditing,
  attendanceMode,
  setAttendanceMode,
  generalTab,
  setGeneralTab,
  periodName,
  setPeriodName,
  attendanceRules,
  toggleAttendanceRule,
  overtimeEnabled,
  setOvertimeEnabled,
  periodRules = DEFAULT_PERIOD_RULES,
  setPeriodRules,
  handleSavePeriod,
  onClose,
  breaks,
  allBreaks,
  onAddBreak,
  onEditBreak,
  onDeleteBreak,
  breakLibrary,
  onSaveBreakToLibrary,
  onUpdateBreakInLibrary,
  onDeleteBreakFromLibrary,
}: {
  show: boolean;
  isEditing: boolean;
  attendanceMode: 'fixed' | 'flexible';
  setAttendanceMode: (mode: 'fixed' | 'flexible') => void;
  generalTab: 'general' | 'break';
  setGeneralTab: (tab: 'general' | 'break') => void;
  periodName: string;
  setPeriodName: (name: string) => void;
  attendanceRules: Record<AttendanceRuleKey, boolean>;
  toggleAttendanceRule: (key: AttendanceRuleKey) => void;
  overtimeEnabled: boolean;
  setOvertimeEnabled: (enabled: boolean) => void;
  periodRules: PeriodRuleValues;
  setPeriodRules: (r: PeriodRuleValues) => void;
  handleSavePeriod: () => void;
  onClose: () => void;
  breaks: BreakItem[];
  allBreaks: BreakItem[];
  onAddBreak: (b: BreakItem) => void;
  onEditBreak: (b: BreakItem) => void;
  onDeleteBreak: (id: string) => void;
  breakLibrary: BreakItem[];
  onSaveBreakToLibrary: (b: BreakItem) => void;
  onUpdateBreakInLibrary: (b: BreakItem) => void;
  onDeleteBreakFromLibrary: (id: string) => void;
}) {
  const [showAddBreak, setShowAddBreak] = useState(false);
  const [showSelectBreak, setShowSelectBreak] = useState(false);
  const [editingBreak, setEditingBreak] = useState<BreakItem | null>(null);
  const [workStart, setWorkStart] = useState('10:00');
  const [workEnd, setWorkEnd] = useState('19:00');
  const [reqWorkTime, setReqWorkTime] = useState(540);

  // Auto-calculate required work time whenever working times change
  useEffect(() => {
    const [sh, sm] = workStart.split(':').map(Number);
    const [eh, em] = workEnd.split(':').map(Number);
    let mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins < 0) mins += 24 * 60;
    setReqWorkTime(mins);
  }, [workStart, workEnd]);

  if (!show) return null;

  const openAddBreak = () => { setEditingBreak(null); setShowAddBreak(true); };
  const openEditBreak = (b: BreakItem) => { setEditingBreak(b); setShowAddBreak(true); };
  const handleBreakSave = (b: BreakItem) => {
    editingBreak ? onEditBreak(b) : onAddBreak(b);
    if (!editingBreak) onSaveBreakToLibrary(b);  // persist new break to library
    setShowAddBreak(false);
  };
  const handleSelectBreaks = (selected: BreakItem[]) => {
    selected.forEach(b => onAddBreak(b));
    setShowSelectBreak(false);
  };

  return (
    <>
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-[95%] max-w-6xl max-h-[90vh] overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEditing ? 'Edit Period' : 'Add Period'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <Icon path="M6 18L18 6M6 6l12 12" className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="overflow-y-auto max-h-[calc(90vh-140px)] p-6">
          {/* Attendance Mode Tabs */}
          <div className="mb-6">
            <div className="flex border-b border-gray-200">
              <button
                onClick={() => setAttendanceMode('fixed')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  attendanceMode === 'fixed'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Fixed Attendance
              </button>
              <button
                onClick={() => setAttendanceMode('flexible')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  attendanceMode === 'flexible'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Flexible Attendance
              </button>
            </div>
          </div>

          {/* General / Break Tabs */}
          {attendanceMode === 'fixed' && (
            <div className="px-4 pt-4">
              <div className="flex gap-1">
                <button
                  onClick={() => setGeneralTab('general')}
                  className={`px-4 py-2 text-xs font-medium rounded-t-md transition-colors ${
                    generalTab === 'general'
                      ? 'bg-white text-blue-600 border border-gray-200 border-b-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  General
                </button>
                <button
                  onClick={() => setGeneralTab('break')}
                  className={`px-4 py-2 text-xs font-medium rounded-t-md transition-colors ${
                    generalTab === 'break'
                      ? 'bg-white text-blue-600 border border-gray-200 border-b-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Break
                </button>
              </div>
            </div>
          )}

          {/* General / Break Tab Content for Fixed mode */}
          {attendanceMode === 'fixed' && generalTab === 'general' && (
            <div className="p-4">
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-4">Basic Info</h4>
              <div className="space-y-4">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-700">Period Name <span className="text-red-500">*</span></label>
                    <input type="text" value={periodName} onChange={(e) => setPeriodName(e.target.value)}
                      className="px-3 py-1.5 border border-gray-300 rounded-md text-sm w-40 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                  </div>
                </div>
                <div>
                  <label className="text-sm text-gray-700 block mb-2">Attendance Period:</label>
                  <div className="flex items-center gap-2 ml-4">
                    <span className="text-sm text-gray-600">Working Time:</span>
                    <input type="time" value={workStart} onChange={e => setWorkStart(e.target.value)}
                      className="px-2 py-1.5 border border-gray-300 rounded-md text-sm w-28 focus:ring-2 focus:ring-blue-500" />
                    <span className="text-gray-500">-</span>
                    <input type="time" value={workEnd} onChange={e => setWorkEnd(e.target.value)}
                      className="px-2 py-1.5 border border-gray-300 rounded-md text-sm w-28 focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <label className="text-sm text-gray-700">Required Work Time:</label>
                  <input type="number" value={reqWorkTime} readOnly
                    className="px-2 py-1.5 border border-gray-300 rounded-md text-sm w-24 bg-gray-100 text-gray-700" />
                  <span className="text-sm text-gray-600">minutes</span>
                </div>
                <div className="pt-4 border-t border-gray-200">
                  <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-4">Attendance Rule:</h4>
                  <div className="ml-2 space-y-3">
                    {/* Overtime from */}
                    <label className="flex items-center gap-2 cursor-pointer flex-wrap">
                      <input type="checkbox" checked={attendanceRules.overtimeFrom} onChange={() => toggleAttendanceRule('overtimeFrom')}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 flex-shrink-0" />
                      <span className="text-sm text-gray-700">Overtime work is calculated from</span>
                      <input type="number" value={periodRules.overtimeFromMinutes} min={0} step={1}
                        disabled={!attendanceRules.overtimeFrom}
                        onChange={e => setPeriodRules({ ...periodRules, overtimeFromMinutes: Number(e.target.value) })}
                        className={`px-2 py-1 border border-gray-300 rounded-md text-sm w-20 focus:ring-2 focus:ring-blue-500 ${!attendanceRules.overtimeFrom ? 'bg-gray-100 text-gray-400' : ''}`} />
                      <span className="text-sm text-gray-600">minutes after the end of work.</span>
                    </label>
                    {/* Allowed late */}
                    <label className="flex items-center gap-2 cursor-pointer flex-wrap">
                      <input type="checkbox" checked={attendanceRules.allowedLate} onChange={() => toggleAttendanceRule('allowedLate')}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 flex-shrink-0" />
                      <span className="text-sm text-gray-700">Allowed to be</span>
                      <input type="number" value={periodRules.allowedLateMinutes} min={0} step={1}
                        disabled={!attendanceRules.allowedLate}
                        onChange={e => setPeriodRules({ ...periodRules, allowedLateMinutes: Number(e.target.value) })}
                        className={`px-2 py-1 border border-gray-300 rounded-md text-sm w-20 focus:ring-2 focus:ring-blue-500 ${!attendanceRules.allowedLate ? 'bg-gray-100 text-gray-400' : ''}`} />
                      <span className="text-sm text-gray-600">minutes late.</span>
                    </label>
                    {/* Late = absent */}
                    <label className="flex items-center gap-2 cursor-pointer flex-wrap">
                      <input type="checkbox" checked={attendanceRules.lateForAbsent} onChange={() => toggleAttendanceRule('lateForAbsent')}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 flex-shrink-0" />
                      <span className="text-sm text-gray-700">Being late for more than</span>
                      <input type="number" value={periodRules.lateForAbsentMinutes} min={0} step={1}
                        disabled={!attendanceRules.lateForAbsent}
                        onChange={e => setPeriodRules({ ...periodRules, lateForAbsentMinutes: Number(e.target.value) })}
                        className={`px-2 py-1 border border-gray-300 rounded-md text-sm w-20 focus:ring-2 focus:ring-blue-500 ${!attendanceRules.lateForAbsent ? 'bg-gray-100 text-gray-400' : ''}`} />
                      <span className="text-sm text-gray-600">minutes is considered as absent.</span>
                    </label>
                    {/* Allowed leave early */}
                    <label className="flex items-center gap-2 cursor-pointer flex-wrap">
                      <input type="checkbox" checked={attendanceRules.allowedLeave} onChange={() => toggleAttendanceRule('allowedLeave')}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 flex-shrink-0" />
                      <span className="text-sm text-gray-700">Allowed to leave</span>
                      <input type="number" value={periodRules.allowedLeaveEarlyMinutes} min={0} step={1}
                        disabled={!attendanceRules.allowedLeave}
                        onChange={e => setPeriodRules({ ...periodRules, allowedLeaveEarlyMinutes: Number(e.target.value) })}
                        className={`px-2 py-1 border border-gray-300 rounded-md text-sm w-20 focus:ring-2 focus:ring-blue-500 ${!attendanceRules.allowedLeave ? 'bg-gray-100 text-gray-400' : ''}`} />
                      <span className="text-sm text-gray-600">minutes early.</span>
                    </label>
                    {/* Early leave = absent */}
                    <label className="flex items-center gap-2 cursor-pointer flex-wrap">
                      <input type="checkbox" checked={attendanceRules.leaveForAbsent} onChange={() => toggleAttendanceRule('leaveForAbsent')}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 flex-shrink-0" />
                      <span className="text-sm text-gray-700">Leaving early for more than</span>
                      <input type="number" value={periodRules.earlyLeaveForAbsentMinutes} min={0} step={1}
                        disabled={!attendanceRules.leaveForAbsent}
                        onChange={e => setPeriodRules({ ...periodRules, earlyLeaveForAbsentMinutes: Number(e.target.value) })}
                        className={`px-2 py-1 border border-gray-300 rounded-md text-sm w-20 focus:ring-2 focus:ring-blue-500 ${!attendanceRules.leaveForAbsent ? 'bg-gray-100 text-gray-400' : ''}`} />
                      <span className="text-sm text-gray-600">minutes is considered as absent.</span>
                    </label>
                  </div>
                  {/* Overtime Rule toggle */}
                  <div className="mt-4 ml-2">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-sm font-medium text-gray-700">Overtime Rule</span>
                      <button type="button" onClick={() => setPeriodRules({ ...periodRules, overtimeEnabled: !periodRules.overtimeEnabled })}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${periodRules.overtimeEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}>
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${periodRules.overtimeEnabled ? 'translate-x-4' : 'translate-x-1'}`} />
                      </button>
                    </div>
                    {periodRules.overtimeEnabled && (
                      <div className="ml-2 space-y-3">
                        <label className="flex items-center gap-2 cursor-pointer flex-wrap">
                          <input type="checkbox" checked={attendanceRules.minOvertime} onChange={() => toggleAttendanceRule('minOvertime')}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 flex-shrink-0" />
                          <span className="text-sm text-gray-700">The minimum overtime is</span>
                          <input type="number" value={periodRules.minOvertimeMinutes} min={0} step={1}
                            disabled={!attendanceRules.minOvertime}
                            onChange={e => setPeriodRules({ ...periodRules, minOvertimeMinutes: Number(e.target.value) })}
                            className={`px-2 py-1 border border-gray-300 rounded-md text-sm w-20 focus:ring-2 focus:ring-blue-500 ${!attendanceRules.minOvertime ? 'bg-gray-100 text-gray-400' : ''}`} />
                          <span className="text-sm text-gray-600">minutes. If it is insufficient, it will be recorded as no overtime.</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer flex-wrap">
                          <input type="checkbox" checked={attendanceRules.maxOvertime} onChange={() => toggleAttendanceRule('maxOvertime')}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 flex-shrink-0" />
                          <span className="text-sm text-gray-700">The maximum overtime is</span>
                          <input type="number" value={periodRules.maxOvertimeMinutes} min={0} step={1}
                            disabled={!attendanceRules.maxOvertime}
                            onChange={e => setPeriodRules({ ...periodRules, maxOvertimeMinutes: Number(e.target.value) })}
                            className={`px-2 py-1 border border-gray-300 rounded-md text-sm w-20 focus:ring-2 focus:ring-blue-500 ${!attendanceRules.maxOvertime ? 'bg-gray-100 text-gray-400' : ''}`} />
                          <span className="text-sm text-gray-600">minutes</span>
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Break Tab Content */}
          {attendanceMode === 'fixed' && generalTab === 'break' && (
            <div className="p-4">
              {/* Action row */}
              <div className="flex items-center justify-between mb-4">
                <button onClick={openAddBreak}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors">
                  <Icon path="M12 4v16m8-8H4" className="w-3.5 h-3.5" />
                  Add New Break
                </button>
                <button onClick={() => setShowSelectBreak(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
                  <Icon path="M4 6h16M4 12h16M4 18h7" className="w-3.5 h-3.5" />
                  Select Break
                </button>
              </div>
              {/* Breaks table */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Name</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Start Time</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">End Time</th>
                      <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {breaks.length === 0 ? (
                      <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-400">No breaks added yet</td></tr>
                    ) : breaks.map(b => (
                      <tr key={b.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-sm text-gray-900">{b.name}</td>
                        <td className="px-4 py-2 text-sm text-gray-600">{b.startTime}</td>
                        <td className="px-4 py-2 text-sm text-gray-600">{b.endTime}</td>
                        <td className="px-4 py-2">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => openEditBreak(b)} className="text-blue-600 hover:text-blue-800 p-1">
                              <Icon path="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" className="w-4 h-4" />
                            </button>
                            <button onClick={() => onDeleteBreak(b.id)} className="text-red-600 hover:text-red-800 p-1">
                              <Icon path="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Flexible Attendance Tab Content */}
          {attendanceMode === 'flexible' && (
            <div className="p-4">
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-4">Basic Info</h4>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-700">Period Name <span className="text-red-500">*</span></label>
                  <input type="text" value={periodName} onChange={(e) => setPeriodName(e.target.value)}
                    className="px-3 py-1.5 border border-gray-300 rounded-md text-sm w-40 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div className="flex items-center justify-center gap-2">
                  <label className="text-sm text-gray-700">Required Work Time:</label>
                  <input type="number" defaultValue="480"
                    className="px-2 py-1.5 border border-gray-300 rounded-md text-sm w-24 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                  <span className="text-sm text-gray-600">minutes</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-2">
          <button onClick={handleSavePeriod} className="px-6 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors">Save</button>
          <button onClick={onClose} className="px-6 py-2 bg-gray-200 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-300 transition-colors">Cancel</button>
        </div>
      </div>
    </div>

    {/* Sub-modals */}
    <AddBreakModal show={showAddBreak} editBreak={editingBreak} onSave={handleBreakSave} onClose={() => setShowAddBreak(false)} />
    <SelectBreakModal
      show={showSelectBreak}
      allBreaks={breakLibrary}
      onSelect={handleSelectBreaks}
      onClose={() => setShowSelectBreak(false)}
      onEditBreak={onUpdateBreakInLibrary}
      onDeleteBreak={onDeleteBreakFromLibrary}
    />
    </>
  );
}

// ─── Shift Modal ──────────────────────────────────────────────────────────────
function ShiftModal({
  show,
  editShift,
  periods,
  onSave,
  onClose,
}: {
  show: boolean;
  editShift: ShiftItem | null;
  periods: Period[];
  onSave: (s: ShiftItem) => void;
  onClose: () => void;
}) {
  const blank: ShiftItem = {
    id: '', name: '', periodId: '', periodName: '', loopMode: 'week', numberOfCycles: 7,
    workDays: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false },
  };
  const [form, setForm] = useState<ShiftItem>(blank);
  // days user marks as "off / rest" — freely configurable, no hardcoded weekend
  // workDays: true = working, false = off

  useEffect(() => {
    setForm(editShift ? { ...editShift } : { ...blank });
  }, [editShift, show]);

  if (!show) return null;

  const set = <K extends keyof ShiftItem>(k: K, v: ShiftItem[K]) => setForm(prev => ({ ...prev, [k]: v }));
  const toggleDay = (day: DayKey) =>
    setForm(prev => ({ ...prev, workDays: { ...prev.workDays, [day]: !prev.workDays[day] } }));

  const handlePeriodChange = (id: string) => {
    const p = periods.find(x => x.id === id);
    setForm(prev => ({ ...prev, periodId: id, periodName: p?.name || '' }));
  };

  const handleOk = () => {
    if (!form.name.trim()) { alert('Shift name is required'); return; }
    if (!form.periodId) { alert('Please select an Attendance Period'); return; }
    onSave({ ...form, id: form.id || `shift_${Date.now()}` });
  };

  const workDayCount = ALL_DAYS.filter(d => form.workDays[d.key]).length;
  const offDayCount = 7 - workDayCount;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-[560px] max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-gray-50 border-b flex items-center justify-between flex-shrink-0">
          <h3 className="text-base font-semibold text-gray-900">{editShift ? 'Edit Shift' : 'Add New Shift'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <Icon path="M6 18L18 6M6 6l12 12" className="w-5 h-5" />
          </button>
        </div>
        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Shift Name */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700 w-40">Shift Name <span className="text-red-500">*</span></label>
            <input type="text" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Morning Shift"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          {/* Attendance Period */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700 w-40">
              Attendance Period <span className="text-red-500">*</span>
            </label>
            <select value={form.periodId} onChange={e => handlePeriodChange(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white">
              <option value="">— Select a period —</option>
              {periods.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.startTime}–{p.endTime})</option>
              ))}
            </select>
          </div>
          {periods.length === 0 && (
            <p className="text-xs text-amber-600 -mt-3 ml-[168px]">⚠ No periods found. Create one in the Attendance Periods tab first.</p>
          )}
          {/* Loop Mode */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700 w-40">Loop Mode</label>
            <div className="flex gap-4">
              {(['day', 'week'] as const).map(m => (
                <label key={m} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={form.loopMode === m} onChange={() => set('loopMode', m)}
                    className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500" />
                  <span className="text-sm text-gray-700 capitalize">{m}</span>
                </label>
              ))}
            </div>
          </div>
          {/* Number of Cycles */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700 w-40">Number of Cycles</label>
            <select value={form.numberOfCycles} onChange={e => set('numberOfCycles', Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-40 focus:ring-2 focus:ring-blue-500 outline-none bg-white">
              {Array.from({ length: 30 }, (_, i) => i + 1).map(n => (
                <option key={n} value={n}>{n} {form.loopMode === 'day' ? 'day(s)' : 'week(s)'}</option>
              ))}
            </select>
            <span className="text-xs text-gray-400">(Default: 7)</span>
          </div>
          {/* Work Days — fully configurable, no hardcoded weekend */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-gray-700">Work Days</label>
              <span className="text-xs text-gray-400">{workDayCount} work · {offDayCount} off</span>
            </div>
            <p className="text-xs text-gray-400 mb-3">Click a day to toggle between work day and off day. Off days act as rest/holiday days for this shift.</p>
            <div className="flex gap-2 flex-wrap">
              {ALL_DAYS.map(({ key, label }) => {
                const isWork = form.workDays[key];
                return (
                  <button key={key} type="button" onClick={() => toggleDay(key)}
                    className={`px-4 py-2.5 rounded-lg text-xs font-semibold border-2 transition-all select-none min-w-[52px] ${
                      isWork
                        ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                        : 'bg-gray-100 border-gray-200 text-gray-400'
                    }`}>
                    <span className="block">{label}</span>
                    <span className="block text-[9px] font-normal mt-0.5 opacity-80">{isWork ? 'Work' : 'Off'}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t flex justify-end gap-2 flex-shrink-0">
          <button onClick={handleOk} className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            {editShift ? 'Update' : 'Add Shift'}
          </button>
          <button onClick={onClose} className="px-5 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Schedule Modal ───────────────────────────────────────────────────────────
function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: { id: string; name: string }[];
  value: string;
  onChange: (id: string, name: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.id === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = query.trim()
    ? options.filter(o => o.name.toLowerCase().includes(query.toLowerCase()))
    : options;

  return (
    <div ref={ref} className="relative flex-1">
      <button
        type="button"
        onClick={() => { setOpen(v => !v); setQuery(''); }}
        className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none text-left"
      >
        <span className={selected ? 'text-gray-900' : 'text-gray-400'}>
          {selected ? selected.name : placeholder}
        </span>
        <Icon path="M19 9l-7 7-7-7" className="w-4 h-4 text-gray-400 flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search..."
              className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-sm text-gray-400 text-center">No results found</div>
            ) : (
              filtered.map(o => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => { onChange(o.id, o.name); setOpen(false); setQuery(''); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors ${value === o.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-800'}`}
                >
                  {o.name}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ScheduleModal({
  show,
  editSchedule,
  shifts,
  onSave,
  onClose,
}: {
  show: boolean;
  editSchedule: ShiftSchedule | null;
  shifts: ShiftItem[];
  onSave: (s: ShiftSchedule) => void;
  onClose: () => void;
}) {
  const blank: ShiftSchedule = { id: '', shiftId: '', shiftName: '', startDate: '', endDate: '', members: [] };
  const [form, setForm] = useState<ShiftSchedule>(blank);
  const [assignType, setAssignType] = useState<'employee' | 'group'>('employee');
  const [assignId, setAssignId] = useState('');
  const [assignName, setAssignName] = useState('');
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    setForm(editSchedule ? { ...editSchedule, members: [...(editSchedule.members || [])] } : { ...blank });
    setAssignType('employee');
    setAssignId('');
    setAssignName('');
  }, [editSchedule, show]);

  useEffect(() => {
    if (!show) return;
    setLoadingData(true);
    const API = 'http://localhost:3001';
    Promise.all([
      fetch(`${API}/api/employees`).then(r => r.json()).catch(() => null),
      fetch(`${API}/api/employees/groups`).then(r => r.json()).catch(() => null),
    ]).then(([empData, grpData]) => {
      if (empData?.success) {
        const list = (empData.data || empData.employees || []);
        setEmployees(list.map((e: any) => ({ id: e.id, name: e.name || `${e.firstName || ''} ${e.lastName || ''}`.trim() || e.personId || e.id })));
      }
      if (grpData?.success) {
        setGroups((grpData.groups || []).map((g: any) => ({ id: g.id, name: g.name })));
      }
    }).finally(() => setLoadingData(false));
  }, [show]);

  if (!show) return null;

  const set = <K extends keyof ShiftSchedule>(k: K, v: ShiftSchedule[K]) => setForm(prev => ({ ...prev, [k]: v }));

  const handleShiftChange = (id: string) => {
    const s = shifts.find(x => x.id === id);
    setForm(prev => ({ ...prev, shiftId: id, shiftName: s?.name || '' }));
  };

  const handleAddMember = () => {
    if (!assignId || !assignName) return;
    if (form.members.some(m => m.id === assignId)) return;
    const member: AssignedMember = { id: assignId, name: assignName, type: assignType };
    setForm(prev => ({ ...prev, members: [...prev.members, member] }));
    setAssignId(''); setAssignName('');
  };

  const handleRemoveMember = (id: string) =>
    setForm(prev => ({ ...prev, members: prev.members.filter(m => m.id !== id) }));

  const handleOk = () => {
    if (!form.shiftId) { alert('Please select a shift'); return; }
    if (!form.startDate) { alert('Shift Start Date is required'); return; }
    if (form.members.length === 0) { alert('Please assign at least one employee or group'); return; }
    onSave({ ...form, id: form.id || `schedule_${Date.now()}` });
  };

  const currentList = assignType === 'employee' ? employees : groups;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-[620px] max-h-[92vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-gray-50 border-b flex items-center justify-between flex-shrink-0">
          <h3 className="text-base font-semibold text-gray-900">{editSchedule ? 'Edit Schedule' : 'Create Schedule'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <Icon path="M6 18L18 6M6 6l12 12" className="w-5 h-5" />
          </button>
        </div>
        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Choose Shift */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700 w-36">Choose Shift <span className="text-red-500">*</span></label>
            <select value={form.shiftId} onChange={e => handleShiftChange(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white">
              <option value="">— Select a shift —</option>
              {shifts.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          {/* Shift Start Date */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700 w-36">Start Date <span className="text-red-500">*</span></label>
            <input type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-48 focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          {/* Shift End Date (optional) */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700 w-36">
              End Date
              <span className="ml-1 text-xs text-gray-400 font-normal">(optional)</span>
            </label>
            <input type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-48 focus:ring-2 focus:ring-blue-500 outline-none" />
            {form.endDate && (
              <button type="button" onClick={() => set('endDate', '')} className="text-xs text-red-500 hover:underline">Clear</button>
            )}
          </div>
          {!form.endDate && (
            <p className="text-xs text-gray-400 -mt-3 ml-[156px]">If not set, the schedule will continue indefinitely.</p>
          )}
          {/* Assign To */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Assign To</label>
            <div className="flex gap-3 mb-3">
              {(['employee', 'group'] as const).map(t => (
                <label key={t} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={assignType === t} onChange={() => { setAssignType(t); setAssignId(''); setAssignName(''); }}
                    className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500" />
                  <span className="text-sm text-gray-700 capitalize">{t === 'group' ? 'Employee Group' : 'Single Employee'}</span>
                </label>
              ))}
            </div>
            {loadingData ? (
              <div className="flex items-center gap-2 py-2 text-sm text-gray-400">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Loading {assignType === 'group' ? 'groups' : 'employees'}...
              </div>
            ) : (
              <div className="flex gap-2">
                <SearchableSelect
                  options={currentList}
                  value={assignId}
                  onChange={(id, name) => { setAssignId(id); setAssignName(name); }}
                  placeholder={`— Search ${assignType === 'group' ? 'group' : 'employee'} —`}
                />
                <button onClick={handleAddMember}
                  disabled={!assignId}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  Add
                </button>
              </div>
            )}
            {!loadingData && currentList.length === 0 && (
              <p className="text-xs text-amber-600 mt-1.5">
                No {assignType === 'group' ? 'groups' : 'employees'} found. Please add them first.
              </p>
            )}
          </div>
          {/* Assigned Members List */}
          {form.members.length > 0 && (
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">Assigned ({form.members.length})</label>
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
                {form.members.map(m => (
                  <div key={m.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50">
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${m.type === 'group' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {m.type === 'group' ? 'Group' : 'Emp'}
                      </span>
                      <span className="text-sm text-gray-800">{m.name}</span>
                    </div>
                    <button onClick={() => handleRemoveMember(m.id)} className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors">
                      <Icon path="M6 18L18 6M6 6l12 12" className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t flex justify-end gap-2 flex-shrink-0">
          <button onClick={handleOk} className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            {editSchedule ? 'Update' : 'Create Schedule'}
          </button>
          <button onClick={onClose} className="px-5 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Holiday Assign Modal ─────────────────────────────────────────────────────
// ─── Leave Assign Modal ───────────────────────────────────────────────────────
function LeaveAssignModal({
  show,
  leaveType,
  onSave,
  onClose,
}: {
  show: boolean;
  leaveType: LeaveType | null;
  onSave: (leaveTypeId: string, members: AssignedMember[]) => void;
  onClose: () => void;
}) {
  const [members, setMembers] = useState<AssignedMember[]>([]);
  const [assignType, setAssignType] = useState<'employee' | 'group'>('employee');
  const [assignId, setAssignId] = useState('');
  const [assignName, setAssignName] = useState('');
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!show || !leaveType) return;
    setMembers(leaveType.assignedTo ? [...leaveType.assignedTo] : []);
  }, [show, leaveType]);

  useEffect(() => {
    if (!show) return;
    const API = 'http://localhost:3001';
    Promise.all([
      fetch(`${API}/api/employees`).then(r => r.json()).catch(() => null),
      fetch(`${API}/api/employees/groups`).then(r => r.json()).catch(() => null),
    ]).then(([empData, grpData]) => {
      if (empData?.success) {
        const list = (empData.data || empData.employees || []);
        setEmployees(list.map((e: any) => ({ id: e.id, name: e.name || `${e.firstName || ''} ${e.lastName || ''}`.trim() || e.personId || e.id })));
      }
      if (grpData?.success) {
        setGroups((grpData.groups || []).map((g: any) => ({ id: g.id, name: g.name })));
      }
    }).catch(() => {});
  }, [show]);

  if (!show || !leaveType) return null;

  const currentList = assignType === 'employee' ? employees : groups;

  const handleAdd = () => {
    if (!assignId || !assignName) return;
    if (members.some(m => m.id === assignId)) return;
    setMembers(prev => [...prev, { id: assignId, name: assignName, type: assignType }]);
    setAssignId(''); setAssignName('');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: leaveType.color }} />
              <h2 className="text-base font-semibold text-gray-900">Assign Leave Type</h2>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{leaveType.name} · {leaveType.daysPerYear} days/year</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <Icon path="M6 18L18 6M6 6l12 12" className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-700">
            {members.length === 0
              ? 'ℹ No specific assignment — this leave type is available to ALL employees.'
              : `This leave type is assigned to ${members.length} specific employee(s)/group(s) only.`}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Add Employee or Group</label>
            <div className="flex gap-2 mb-2">
              <button onClick={() => setAssignType('employee')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${assignType === 'employee' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                Employee
              </button>
              <button onClick={() => setAssignType('group')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${assignType === 'group' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                Group
              </button>
            </div>
            <div className="flex gap-2">
              <SearchableSelect
                options={currentList}
                value={assignId}
                onChange={(id, name) => { setAssignId(id); setAssignName(name); }}
                placeholder={`Search ${assignType}...`}
              />
              <button onClick={handleAdd}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors">
                Add
              </button>
            </div>
          </div>

          {members.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Assigned to ({members.length})</label>
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                {members.map(m => (
                  <div key={m.id} className="flex items-center gap-1.5 bg-gray-100 rounded-lg px-3 py-1.5 group">
                    <span className={`text-[10px] font-bold uppercase ${m.type === 'group' ? 'text-purple-600' : 'text-blue-600'}`}>
                      {m.type === 'group' ? 'G' : 'E'}
                    </span>
                    <span className="text-xs text-gray-800">{m.name}</span>
                    <button onClick={() => setMembers(prev => prev.filter(x => x.id !== m.id))}
                      className="ml-1 text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                      <Icon path="M6 18L18 6M6 6l12 12" className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex gap-2 justify-between">
          <button onClick={() => setMembers([])}
            className="px-4 py-2 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
            Clear (Available to Everyone)
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={() => onSave(leaveType.id, members)}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              Save Assignment
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function AttendanceConfigPage() {
  const router = useRouter();
  const { isAuthenticated, logout } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('rules');
  const [showSuccess, setShowSuccess] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [attendanceMode, setAttendanceMode] = useState<'fixed' | 'flexible'>('fixed');
  const [generalTab, setGeneralTab] = useState<'general' | 'break'>('general');
  const [periodName, setPeriodName] = useState('');
  const [overtimeEnabled, setOvertimeEnabled] = useState(true);
  const [showPeriodModal, setShowPeriodModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [attendancePeriods, setAttendancePeriods] = useState<Period[]>([]);
  const [currentBreaks, setCurrentBreaks] = useState<BreakItem[]>([]);
  const [breakLibrary, setBreakLibrary] = useState<BreakItem[]>([]);

  // ── Shifts state ──
  const [shifts, setShifts] = useState<ShiftItem[]>([]);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [editingShift, setEditingShift] = useState<ShiftItem | null>(null);

  // ── Schedules state ──
  const [schedules, setSchedules] = useState<ShiftSchedule[]>([]);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ShiftSchedule | null>(null);

  // ── Holidays state ──
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [showHolidayForm, setShowHolidayForm] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [holidayForm, setHolidayForm] = useState<Omit<Holiday, 'id'>>({ name: '', date: '', recurring: false, type: 'company' });
  const [showLeaveAssign, setShowLeaveAssign] = useState(false);
  const [assigningLeave, setAssigningLeave] = useState<LeaveType | null>(null);

  // ── Leave Types state ──
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [editingLeave, setEditingLeave] = useState<LeaveType | null>(null);
  const [leaveForm, setLeaveForm] = useState<Omit<LeaveType, 'id'>>({ name: '', paidLeave: true, daysPerYear: 0, carryOver: false, requiresApproval: true, color: '#3B82F6' });

  // ── Leave Records state ──
  const [leaveRecords, setLeaveRecords] = useState<LeaveRecord[]>([]);
  const [showLeaveRecordModal, setShowLeaveRecordModal] = useState(false);
  const [editingLeaveRecord, setEditingLeaveRecord] = useState<LeaveRecord | null>(null);
  const [leaveRecordFilter, setLeaveRecordFilter] = useState('');
  const [employeeList, setEmployeeList] = useState<{ id: string; name: string }[]>([]);
  const BLANK_LEAVE_RECORD_FORM = { employeeId: '', employeeName: '', leaveTypeId: '', leaveTypeName: '', leaveTypeColor: '#3B82F6', startDate: '', endDate: '', days: 1, notes: '', status: 'approved' as const };
  const [leaveRecordForm, setLeaveRecordForm] = useState<Omit<LeaveRecord, 'id' | 'createdAt' | 'updatedAt'>>(BLANK_LEAVE_RECORD_FORM);

  // ── Period rules (per-period attendance rule values) ──
  const [periodRules, setPeriodRules] = useState<PeriodRuleValues>({ ...DEFAULT_PERIOD_RULES });

  const [attendanceRules, setAttendanceRules] = useState({
    overtimeFrom: true,
    allowedLate: true,
    lateForAbsent: true,
    allowedLeave: true,
    leaveForAbsent: true,
    minOvertime: true,
    maxOvertime: true,
  });
  const [rulesSettings, setRulesSettings] = useState({
    roundingRule: 'roundDown' as 'roundDown' | 'roundUp',
    mustCheckInOutForLeave: true,
  });
  const [savedRulesSettings, setSavedRulesSettings] = useState<typeof rulesSettings | null>(null);

  // All breaks from all periods (for Select Break modal)
  const allBreaks: BreakItem[] = attendancePeriods.flatMap(p => p.breaks || []);

  const handleSaveRules = async () => {
    // Only save if something actually changed
    if (savedRulesSettings &&
        rulesSettings.roundingRule === savedRulesSettings.roundingRule &&
        rulesSettings.mustCheckInOutForLeave === savedRulesSettings.mustCheckInOutForLeave) {
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
      return;
    }
    try {
      const res = await fetch(`${API}/api/attendance/rulesSettings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rulesSettings),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setSavedRulesSettings({ ...rulesSettings });
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (e: any) { alert(`Save failed: ${e.message}`); }
  };

  const loadRulesSettings = async () => {
    try {
      const res = await fetch(`${API}/api/attendance/rulesSettings`);
      const data = await res.json();
      if (data.success) {
        const s = {
          roundingRule: (data.rulesSettings.roundingRule || 'roundDown') as 'roundDown' | 'roundUp',
          mustCheckInOutForLeave: data.rulesSettings.mustCheckInOutForLeave ?? true,
        };
        setRulesSettings(s);
        setSavedRulesSettings(s);
      }
    } catch (e) { console.error('Failed to load rules settings', e); }
  };

  const handleSavePeriod = async () => {
    if (!periodName.trim()) { alert('Period Name is required'); return; }
    try {
      const body = {
        name: periodName, mode: attendanceMode, startTime: '09:00', endTime: '18:00',
        requiredWorkTime: 480, breaks: currentBreaks,
        rules: periodRules,
      };
      let res: Response;
      if (isEditing && editingPeriodId) {
        res = await fetch(`${API}/api/attendance/periods/${editingPeriodId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } else {
        res = await fetch(`${API}/api/attendance/periods`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      await loadPeriods();
      setShowPeriodModal(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (e: any) { alert(`Save failed: ${e.message}`); }
  };

  const loadPeriods = async () => {
    try {
      const res = await fetch(`${API}/api/attendance/periods`);
      const data = await res.json();
      if (data.success) setAttendancePeriods(data.periods);
    } catch (e) { console.error('Failed to load periods', e); }
  };

  const loadBreaks = async () => {
    try {
      const res = await fetch(`${API}/api/attendance/breaks`);
      const data = await res.json();
      if (data.success) setBreakLibrary(data.breaks);
    } catch (e) { console.error('Failed to load break library', e); }
  };

  const handleSaveBreakToLibrary = async (b: BreakItem) => {
    try {
      const res = await fetch(`${API}/api/attendance/breaks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(b),
      });
      const data = await res.json();
      if (data.success) setBreakLibrary(prev => [...prev, data.break]);
    } catch (e) { console.error('Failed to save break to library', e); }
  };

  const handleUpdateBreakInLibrary = async (b: BreakItem) => {
    try {
      const res = await fetch(`${API}/api/attendance/breaks/${b.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(b),
      });
      const data = await res.json();
      if (data.success) setBreakLibrary((prev: BreakItem[]) => prev.map((x: BreakItem) => x.id === b.id ? data.break : x));
    } catch (e) { console.error('Failed to update break in library', e); }
  };

  const handleDeleteBreakFromLibrary = async (id: string) => {
    try {
      const res = await fetch(`${API}/api/attendance/breaks/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) setBreakLibrary((prev: BreakItem[]) => prev.filter((x: BreakItem) => x.id !== id));
    } catch (e) { console.error('Failed to delete break from library', e); }
  };

  const toggleAttendanceRule = (key: keyof typeof attendanceRules) => {
    setAttendanceRules(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleDeletePeriod = async (id: string) => {
    if (!confirm('Delete this period?')) return;
    try {
      const res = await fetch(`${API}/api/attendance/periods/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setAttendancePeriods(prev => prev.filter(p => p.id !== id));
      if (selectedPeriod === id) setSelectedPeriod(null);
    } catch (e: any) { alert(`Delete failed: ${e.message}`); }
  };

  const handleEditPeriod = (id: string) => {
    const period = attendancePeriods.find(p => p.id === id);
    if (!period) return;
    setSelectedPeriod(id);
    setIsEditing(true);
    setEditingPeriodId(id);
    setPeriodName(period.name);
    setAttendanceMode(period.mode || 'fixed');
    setCurrentBreaks(period.breaks || []);
    setPeriodRules(period.rules ? { ...DEFAULT_PERIOD_RULES, ...period.rules } : { ...DEFAULT_PERIOD_RULES });
    setGeneralTab('general');
    setShowPeriodModal(true);
  };

  const handleAddPeriod = () => {
    setIsEditing(false);
    setEditingPeriodId(null);
    setPeriodName('');
    setAttendanceMode('fixed');
    setCurrentBreaks([]);
    setPeriodRules({ ...DEFAULT_PERIOD_RULES });
    setGeneralTab('general');
    setShowPeriodModal(true);
  };

  // ── Shifts DB ──
  const loadShifts = async () => {
    try {
      const res = await fetch(`${API}/api/attendance/shifts`);
      const data = await res.json();
      if (data.success) setShifts(data.shifts);
    } catch (e) { console.error('Failed to load shifts', e); }
  };

  const handleSaveShift = async (s: ShiftItem) => {
    try {
      const isNew = !shifts.find(x => x.id === s.id);
      const res = await fetch(
        isNew ? `${API}/api/attendance/shifts` : `${API}/api/attendance/shifts/${s.id}`,
        { method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) }
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      await loadShifts();
      setShowShiftModal(false);
    } catch (e: any) { alert(`Save failed: ${e.message}`); }
  };

  const handleDeleteShift = async (id: string, name: string) => {
    if (!confirm(`Delete shift "${name}"?`)) return;
    try {
      await fetch(`${API}/api/attendance/shifts/${id}`, { method: 'DELETE' });
      await loadShifts();
    } catch (e: any) { alert(`Delete failed: ${e.message}`); }
  };

  // ── Schedules DB ──
  const loadSchedules = async () => {
    try {
      const res = await fetch(`${API}/api/attendance/schedules`);
      const data = await res.json();
      if (data.success) setSchedules(data.schedules);
    } catch (e) { console.error('Failed to load schedules', e); }
  };

  const handleSaveSchedule = async (s: ShiftSchedule) => {
    try {
      const isNew = !schedules.find(x => x.id === s.id);
      const res = await fetch(
        isNew ? `${API}/api/attendance/schedules` : `${API}/api/attendance/schedules/${s.id}`,
        { method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) }
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      await loadSchedules();
      setShowScheduleModal(false);
    } catch (e: any) { alert(`Save failed: ${e.message}`); }
  };

  const handleDeleteSchedule = async (id: string) => {
    if (!confirm('Delete this schedule?')) return;
    try {
      await fetch(`${API}/api/attendance/schedules/${id}`, { method: 'DELETE' });
      await loadSchedules();
    } catch (e: any) { alert(`Delete failed: ${e.message}`); }
  };

  const handleUpdateScheduleMembers = async (scheduleId: string, members: AssignedMember[]) => {
    try {
      const schedule = schedules.find(s => s.id === scheduleId);
      if (!schedule) return;
      const res = await fetch(`${API}/api/attendance/schedules/${scheduleId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...schedule, members }),
      });
      const data = await res.json();
      if (data.success) setSchedules(prev => prev.map(s => s.id === scheduleId ? data.schedule : s));
    } catch (e) { console.error('Failed to update members', e); }
  };

  // ── Holidays DB ──
  const loadHolidays = async () => {
    try {
      const res = await fetch(`${API}/api/attendance/holidays`);
      const data = await res.json();
      if (data.success) setHolidays(data.holidays);
    } catch (e) { console.error('Failed to load holidays', e); }
  };

  const handleSaveHoliday = async () => {
    if (!holidayForm.name.trim() || !holidayForm.date) { alert('Name and Date are required'); return; }
    try {
      const isNew = !editingHoliday;
      const res = await fetch(
        isNew ? `${API}/api/attendance/holidays` : `${API}/api/attendance/holidays/${editingHoliday!.id}`,
        { method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(holidayForm) }
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      await loadHolidays();
      setShowHolidayForm(false); setEditingHoliday(null);
      setHolidayForm({ name: '', date: '', recurring: false, type: 'company' });
    } catch (e: any) { alert(`Save failed: ${e.message}`); }
  };

  const handleDeleteHoliday = async (id: string) => {
    if (!confirm('Delete this holiday?')) return;
    try {
      await fetch(`${API}/api/attendance/holidays/${id}`, { method: 'DELETE' });
      await loadHolidays();
    } catch (e: any) { alert(`Delete failed: ${e.message}`); }
  };

  const handleAssignLeaveType = async (leaveTypeId: string, members: AssignedMember[]) => {
    try {
      const lt = leaveTypes.find(l => l.id === leaveTypeId);
      if (!lt) return;
      const res = await fetch(`${API}/api/attendance/leave-types/${leaveTypeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...lt, assignedTo: members }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      await loadLeaveTypes();
      setShowLeaveAssign(false);
      setAssigningLeave(null);
    } catch (e: any) { alert(`Assignment failed: ${e.message}`); }
  };

  // ── Leave Types DB ──
  const loadLeaveTypes = async () => {
    try {
      const res = await fetch(`${API}/api/attendance/leave-types`);
      const data = await res.json();
      if (data.success) setLeaveTypes(data.leaveTypes);
    } catch (e) { console.error('Failed to load leave types', e); }
  };

  const handleSaveLeaveType = async () => {
    if (!leaveForm.name.trim()) { alert('Name is required'); return; }
    try {
      const isNew = !editingLeave;
      const res = await fetch(
        isNew ? `${API}/api/attendance/leave-types` : `${API}/api/attendance/leave-types/${editingLeave!.id}`,
        { method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(leaveForm) }
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      await loadLeaveTypes();
      setShowLeaveForm(false); setEditingLeave(null);
      setLeaveForm({ name: '', paidLeave: true, daysPerYear: 0, carryOver: false, requiresApproval: true, color: '#3B82F6' });
    } catch (e: any) { alert(`Save failed: ${e.message}`); }
  };

  const handleDeleteLeaveType = async (id: string) => {
    if (!confirm('Delete this leave type?')) return;
    try {
      await fetch(`${API}/api/attendance/leave-types/${id}`, { method: 'DELETE' });
      await loadLeaveTypes();
    } catch (e: any) { alert(`Delete failed: ${e.message}`); }
  };

  // ── Leave Records DB ──
  const loadLeaveRecords = async () => {
    try {
      const res = await fetch(`${API}/api/attendance/leave-records`);
      const data = await res.json();
      if (data.success) setLeaveRecords(data.leaveRecords);
    } catch (e) { console.error('Failed to load leave records', e); }
  };

  const loadEmployeeList = async () => {
    try {
      const res = await fetch(`${API}/api/employees`);
      const data = await res.json();
      if (data.success) setEmployeeList((data.data || []).map((e: any) => ({ id: e.id || e.employeeId, name: e.name || e.employeeName })));
    } catch (e) { console.error('Failed to load employees', e); }
  };

  const handleSaveLeaveRecord = async () => {
    const f = leaveRecordForm;
    if (!f.employeeId || !f.leaveTypeId || !f.startDate || !f.endDate) {
      alert('Employee, Leave Type, Start Date and End Date are required');
      return;
    }
    try {
      const isNew = !editingLeaveRecord;
      const res = await fetch(
        isNew ? `${API}/api/attendance/leave-records` : `${API}/api/attendance/leave-records/${editingLeaveRecord!.id}`,
        { method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) }
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      await loadLeaveRecords();
      setShowLeaveRecordModal(false);
      setEditingLeaveRecord(null);
      setLeaveRecordForm(BLANK_LEAVE_RECORD_FORM);
    } catch (e: any) { alert(`Save failed: ${e.message}`); }
  };

  const handleDeleteLeaveRecord = async (id: string) => {
    if (!confirm('Delete this leave record?')) return;
    try {
      await fetch(`${API}/api/attendance/leave-records/${id}`, { method: 'DELETE' });
      await loadLeaveRecords();
    } catch (e: any) { alert(`Delete failed: ${e.message}`); }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
    } else {
      setIsLoading(false);
      loadPeriods();
      loadBreaks();
      loadRulesSettings();
      loadShifts();
      loadSchedules();
      loadHolidays();
      loadLeaveTypes();
      loadLeaveRecords();
      loadEmployeeList();
    }
  }, [isAuthenticated, router]);

  const tabs = [
    { id: 'rules' as TabType, label: 'Attendance Rules', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { id: 'periods' as TabType, label: 'Attendance Periods', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    { id: 'shifts' as TabType, label: 'Attendance Shifts', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
    { id: 'schedules' as TabType, label: 'Shift Schedules', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
    { id: 'holidays' as TabType, label: 'Holidays', icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z' },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading Attendance Configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Sidebar currentPath="/settings/attendance" onLogout={logout} />

      {/* Main Content */}
      <div className="lg:ml-64 p-4 lg:p-8 pt-16 lg:pt-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <Link href="/settings" className="hover:text-blue-600 transition-colors">Settings</Link>
            <Icon path="M9 5l7 7-7 7" className="w-3 h-3" />
            <span className="text-gray-900 font-medium">Attendance Configuration</span>
          </div>
          <h1 className="text-xl lg:text-2xl font-semibold text-gray-900 tracking-tight">Attendance Configuration</h1>
          <p className="text-sm text-gray-500 mt-1">Manage attendance rules, periods, shifts, and schedules</p>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="border-b border-gray-200 overflow-x-auto">
            <nav className="flex min-w-max">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon path={tab.icon} className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {/* Attendance Rules Tab */}
            {activeTab === 'rules' && (
              <div>
                {/* Calculation Rule Section */}
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4 pb-3 border-b border-gray-200">Calculation Rule</h3>
                  
                  <div className="mb-6">
                    <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Attendance Calculation Accuracy Config</h4>
                    <p className="text-sm text-gray-500 mb-4">Minimum attendance unit is 1 minute.</p>

                    <div className="space-y-3">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="radio"
                          name="roundingRule"
                          checked={rulesSettings.roundingRule === 'roundDown'}
                          onChange={() => setRulesSettings(prev => ({ ...prev, roundingRule: 'roundDown' }))}
                          className="mt-1 w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                        />
                        <div>
                          <span className="text-sm font-medium text-gray-900">Round Down</span>
                          <p className="text-xs text-gray-500 mt-1">
                            Swiping the card at 9:00:01 will be recorded as 9:01:00.
                          </p>
                        </div>
                      </label>
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="radio"
                          name="roundingRule"
                          checked={rulesSettings.roundingRule === 'roundUp'}
                          onChange={() => setRulesSettings(prev => ({ ...prev, roundingRule: 'roundUp' }))}
                          className="mt-1 w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                        />
                        <div>
                          <span className="text-sm font-medium text-gray-900">Round Up</span>
                          <p className="text-xs text-gray-500 mt-1">
                            Swiping the card at 9:00:01 will be recorded as 9:00:00.
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="mb-6">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rulesSettings.mustCheckInOutForLeave}
                        onChange={e => setRulesSettings(prev => ({ ...prev, mustCheckInOutForLeave: e.target.checked }))}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-900">Must Check In/Out for Leave</span>
                    </label>
                  </div>
                </div>

                {/* Save Button */}
                {(() => {
                  const hasChanges = !savedRulesSettings ||
                    rulesSettings.roundingRule !== savedRulesSettings.roundingRule ||
                    rulesSettings.mustCheckInOutForLeave !== savedRulesSettings.mustCheckInOutForLeave;
                  return (
                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                      {hasChanges && (
                        <span className="text-xs text-amber-600 font-medium">● Unsaved changes</span>
                      )}
                      <button
                        onClick={handleSaveRules}
                        className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${
                          hasChanges
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-gray-200 text-gray-500 cursor-default'
                        }`}
                      >
                        Save
                      </button>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Attendance Periods Tab */}
            {activeTab === 'periods' && (
              <div>
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-end">
                    <button 
                      onClick={handleAddPeriod}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
                    >
                      <Icon path="M12 4v16m8-8H4" className="w-3.5 h-3.5" />
                      Add
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Period Name</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Start Time</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">End Time</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Required Work (min)</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {attendancePeriods.length === 0 && (
                          <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">No periods yet. Click Add to create one.</td></tr>
                        )}
                        {attendancePeriods.map((period) => (
                          <tr
                            key={period.id}
                            className={`${selectedPeriod === period.id ? 'bg-blue-50' : 'hover:bg-gray-50'} transition-colors`}
                          >
                            <td className="px-4 py-3">
                              <span className="text-sm font-medium text-gray-900">{period.name}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-sm text-gray-600">{period.startTime}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-sm text-gray-600">{period.endTime}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-sm text-gray-600">{period.requiredWorkTime}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                period.status === 'ACTIVE' 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-gray-100 text-gray-800'
                              }`}>
                                {period.status}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => handleEditPeriod(period.id)}
                                  className="text-blue-600 hover:text-blue-800 transition-colors p-1"
                                  title="Edit"
                                >
                                  <Icon path="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeletePeriod(period.id)}
                                  className="text-red-600 hover:text-red-800 transition-colors p-1"
                                  title="Delete"
                                >
                                  <Icon path="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <PeriodDetailsModal
                  show={showPeriodModal}
                  isEditing={isEditing}
                  attendanceMode={attendanceMode}
                  setAttendanceMode={setAttendanceMode}
                  generalTab={generalTab}
                  setGeneralTab={setGeneralTab}
                  periodName={periodName}
                  setPeriodName={setPeriodName}
                  attendanceRules={attendanceRules}
                  toggleAttendanceRule={toggleAttendanceRule}
                  overtimeEnabled={overtimeEnabled}
                  setOvertimeEnabled={setOvertimeEnabled}
                  periodRules={periodRules}
                  setPeriodRules={setPeriodRules}
                  handleSavePeriod={handleSavePeriod}
                  onClose={() => setShowPeriodModal(false)}
                  breaks={currentBreaks}
                  allBreaks={allBreaks}
                  onAddBreak={(b) => setCurrentBreaks(prev => [...prev, b])}
                  onEditBreak={(b) => setCurrentBreaks(prev => prev.map(x => x.id === b.id ? b : x))}
                  onDeleteBreak={(id) => setCurrentBreaks(prev => prev.filter(x => x.id !== id))}
                  breakLibrary={breakLibrary}
                  onSaveBreakToLibrary={handleSaveBreakToLibrary}
                  onUpdateBreakInLibrary={handleUpdateBreakInLibrary}
                  onDeleteBreakFromLibrary={handleDeleteBreakFromLibrary}
                />
              </div>
            )}

            {/* Attendance Shifts Tab */}
            {activeTab === 'shifts' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Attendance Shifts</h2>
                    <p className="text-sm text-gray-500 mt-1">Create and manage shift definitions with loop cycle and work day configuration</p>
                  </div>
                  <button
                    onClick={() => { setEditingShift(null); setShowShiftModal(true); }}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
                    <Icon path="M12 4v16m8-8H4" className="w-4 h-4" />
                    Add Shift
                  </button>
                </div>

                {shifts.length === 0 ? (
                  <div className="text-center py-16 text-gray-400">
                    <Icon path="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No shifts created yet. Click <strong>Add Shift</strong> to get started.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {shifts.map(shift => {
                      const workDayCount = ALL_DAYS.filter(d => shift.workDays[d.key]).length;
                      return (
                        <div key={shift.id} className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow group">
                          <div className="flex items-start justify-between mb-4">
                            <div>
                              <h3 className="text-sm font-semibold text-gray-900">{shift.name}</h3>
                              <span className="text-xs text-gray-400 mt-0.5 block">
                                {shift.loopMode === 'week' ? 'Weekly' : 'Daily'} loop · {shift.numberOfCycles} cycle{shift.numberOfCycles > 1 ? 's' : ''}
                              </span>
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => { setEditingShift(shift); setShowShiftModal(true); }}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                                <Icon path="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDeleteShift(shift.id, shift.name)}
                                className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                <Icon path="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          <div className="space-y-3 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="text-gray-500">Period</span>
                              <span className="font-semibold text-gray-900">{shift.periodName || '—'}</span>
                            </div>
                            <div>
                              <span className="text-gray-500 text-xs block mb-1.5">Work Days</span>
                              <div className="flex gap-1 flex-wrap">
                                {ALL_DAYS.map(({ key, label }) => {
                                  const isWork = shift.workDays[key];
                                  return (
                                    <span key={key} className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                                      isWork ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-300'
                                    }`}>{label}</span>
                                  );
                                })}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 pt-1 border-t border-gray-100 text-xs text-gray-500">
                              <span>{workDayCount} work day{workDayCount !== 1 ? 's' : ''}</span>
                              <span className="text-gray-400">· {7 - workDayCount} off</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <ShiftModal
                  show={showShiftModal}
                  editShift={editingShift}
                  periods={attendancePeriods}
                  onSave={s => {
                    handleSaveShift(s);
                    setShowShiftModal(false);
                  }}
                  onClose={() => setShowShiftModal(false)}
                />
              </div>
            )}

            {/* Shift Schedules Tab */}
            {activeTab === 'schedules' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Shift Schedules</h2>
                    <p className="text-sm text-gray-500 mt-1">Assign shifts to employees or groups with start/end dates</p>
                  </div>
                  <button
                    onClick={() => { setEditingSchedule(null); setShowScheduleModal(true); }}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
                    <Icon path="M12 4v16m8-8H4" className="w-4 h-4" />
                    Create Schedule
                  </button>
                </div>

                {schedules.length === 0 ? (
                  <div className="text-center py-16 text-gray-400">
                    <Icon path="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No schedules yet. Click <strong>Create Schedule</strong> to assign a shift.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {schedules.map(schedule => (
                      <div key={schedule.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
                        <div className="px-5 py-4 flex items-center justify-between border-b border-gray-100 bg-gray-50">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-semibold text-gray-900">{schedule.shiftName || '—'}</span>
                            <span className="text-xs text-gray-500">
                              {schedule.startDate}
                              {schedule.endDate ? ` → ${schedule.endDate}` : ' → Ongoing'}
                            </span>
                            {!schedule.endDate && (
                              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-[11px] font-semibold">Ongoing</span>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => { setEditingSchedule(schedule); setShowScheduleModal(true); }}
                              className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors">
                              <Icon path="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDeleteSchedule(schedule.id)}
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                              <Icon path="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <div className="px-5 py-3">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Assigned ({schedule.members.length})</span>
                          </div>
                          {schedule.members.length === 0 ? (
                            <p className="text-xs text-gray-400">No members assigned</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {schedule.members.map(m => (
                                <div key={m.id} className="flex items-center gap-1.5 bg-gray-100 rounded-lg px-3 py-1.5 group/member">
                                  <span className={`text-[10px] font-bold uppercase ${m.type === 'group' ? 'text-purple-600' : 'text-blue-600'}`}>
                                    {m.type === 'group' ? 'G' : 'E'}
                                  </span>
                                  <span className="text-xs text-gray-800">{m.name}</span>
                                  <button
                                    onClick={() => handleUpdateScheduleMembers(schedule.id, schedule.members.filter(x => x.id !== m.id))}
                                    className="ml-1 text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover/member:opacity-100">
                                    <Icon path="M6 18L18 6M6 6l12 12" className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <ScheduleModal
                  show={showScheduleModal}
                  editSchedule={editingSchedule}
                  shifts={shifts}
                  onSave={s => {
                    handleSaveSchedule(s);
                    setShowScheduleModal(false);
                  }}
                  onClose={() => setShowScheduleModal(false)}
                />
              </div>
            )}

            {/* Custom Holidays Tab */}
            {activeTab === 'holidays' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Custom Holidays</h2>
                    <p className="text-sm text-gray-500 mt-1">Define public and company holidays for attendance calculation</p>
                  </div>
                  <button
                    onClick={() => {
                      setEditingHoliday(null);
                      setHolidayForm({ name: '', date: '', recurring: false, type: 'company' });
                      setShowHolidayForm(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
                    <Icon path="M12 4v16m8-8H4" className="w-4 h-4" />
                    Add Holiday
                  </button>
                </div>

                {/* Inline form */}
                {showHolidayForm && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6">
                    <h3 className="text-sm font-semibold text-blue-800 mb-4">{editingHoliday ? 'Edit Holiday' : 'New Holiday'}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Holiday Name</label>
                        <input
                          type="text"
                          value={holidayForm.name}
                          onChange={e => setHolidayForm(f => ({ ...f, name: e.target.value }))}
                          placeholder="e.g. New Year's Day"
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                        <input
                          type="date"
                          value={holidayForm.date}
                          onChange={e => setHolidayForm(f => ({ ...f, date: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                        <div className="flex gap-3">
                          {(['public', 'company'] as const).map(t => (
                            <label key={t} className="flex items-center gap-2 cursor-pointer">
                              <input type="radio" name="holidayType" value={t} checked={holidayForm.type === t}
                                onChange={() => setHolidayForm(f => ({ ...f, type: t }))}
                                className="accent-blue-600" />
                              <span className="text-sm text-gray-700 capitalize">{t === 'public' ? 'Public Holiday' : 'Company Holiday'}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <input type="checkbox" id="recurringCheck" checked={holidayForm.recurring}
                          onChange={e => setHolidayForm(f => ({ ...f, recurring: e.target.checked }))}
                          className="accent-blue-600 w-4 h-4" />
                        <label htmlFor="recurringCheck" className="text-sm text-gray-700 cursor-pointer">Repeat every year (recurring)</label>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-4 justify-end">
                      <button onClick={() => { setShowHolidayForm(false); setEditingHoliday(null); }}
                        className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                      <button onClick={handleSaveHoliday}
                        className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                        {editingHoliday ? 'Update' : 'Save Holiday'}
                      </button>
                    </div>
                  </div>
                )}

                {holidays.length === 0 && !showHolidayForm ? (
                  <div className="text-center py-16 text-gray-400">
                    <Icon path="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No holidays defined. Click <strong>Add Holiday</strong> to get started.</p>
                  </div>
                ) : holidays.length > 0 ? (
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                          <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                          <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                          <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Recurring</th>
                          <th className="px-5 py-3"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {holidays.map(h => (
                          <tr key={h.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-5 py-3 font-medium text-gray-900">{h.name}</td>
                            <td className="px-5 py-3 text-gray-600">{h.date}</td>
                            <td className="px-5 py-3">
                              <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                h.type === 'public' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                              }`}>{h.type === 'public' ? 'Public' : 'Company'}</span>
                            </td>
                            <td className="px-5 py-3 text-gray-500">
                              {h.recurring ? (
                                <span className="text-green-600 font-medium">✓ Yes</span>
                              ) : (
                                <span className="text-gray-400">No</span>
                              )}
                            </td>
                            <td className="px-5 py-3">
                              <div className="flex gap-1 justify-end">
                                <button onClick={() => {
                                  setEditingHoliday(h);
                                  setHolidayForm({ name: h.name, date: h.date, recurring: h.recurring, type: h.type });
                                  setShowHolidayForm(true);
                                }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                                  <Icon path="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleDeleteHoliday(h.id)}
                                  className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                  <Icon path="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            )}

            {/* Leave Types & Records → moved to Leave Management page */}
            {(activeTab as string) === 'leave' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Leave Types</h2>
                    <p className="text-sm text-gray-500 mt-1">Configure leave categories available to employees</p>
                  </div>
                  <button
                    onClick={() => {
                      setEditingLeave(null);
                      setLeaveForm({ name: '', paidLeave: true, daysPerYear: 0, carryOver: false, requiresApproval: true, color: '#3B82F6' });
                      setShowLeaveForm(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
                    <Icon path="M12 4v16m8-8H4" className="w-4 h-4" />
                    Add Leave Type
                  </button>
                </div>

                {/* Inline form */}
                {showLeaveForm && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6">
                    <h3 className="text-sm font-semibold text-blue-800 mb-4">{editingLeave ? 'Edit Leave Type' : 'New Leave Type'}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Leave Name</label>
                        <input
                          type="text"
                          value={leaveForm.name}
                          onChange={e => setLeaveForm(f => ({ ...f, name: e.target.value }))}
                          placeholder="e.g. Annual Leave"
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Color</label>
                        <div className="flex items-center gap-3">
                          <input type="color" value={leaveForm.color}
                            onChange={e => setLeaveForm(f => ({ ...f, color: e.target.value }))}
                            className="w-10 h-10 rounded cursor-pointer border border-gray-200" />
                          <span className="text-sm text-gray-500">{leaveForm.color}</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Days Per Year</label>
                        <input
                          type="number"
                          min={0}
                          value={leaveForm.daysPerYear}
                          onChange={e => setLeaveForm(f => ({ ...f, daysPerYear: Number(e.target.value) }))}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="space-y-2 pt-1">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={leaveForm.paidLeave}
                            onChange={e => setLeaveForm(f => ({ ...f, paidLeave: e.target.checked }))}
                            className="accent-blue-600 w-4 h-4" />
                          <span className="text-sm text-gray-700">Paid Leave</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={leaveForm.carryOver}
                            onChange={e => setLeaveForm(f => ({ ...f, carryOver: e.target.checked }))}
                            className="accent-blue-600 w-4 h-4" />
                          <span className="text-sm text-gray-700">Allow Carry Over</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={leaveForm.requiresApproval}
                            onChange={e => setLeaveForm(f => ({ ...f, requiresApproval: e.target.checked }))}
                            className="accent-blue-600 w-4 h-4" />
                          <span className="text-sm text-gray-700">Requires Approval</span>
                        </label>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-4 justify-end">
                      <button onClick={() => { setShowLeaveForm(false); setEditingLeave(null); }}
                        className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                      <button onClick={handleSaveLeaveType}
                        className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                        {editingLeave ? 'Update' : 'Save Leave Type'}
                      </button>
                    </div>
                  </div>
                )}

                {leaveTypes.length === 0 && !showLeaveForm ? (
                  <div className="text-center py-16 text-gray-400">
                    <Icon path="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No leave types defined. Click <strong>Add Leave Type</strong> to get started.</p>
                  </div>
                ) : leaveTypes.length > 0 ? (
                  <>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {leaveTypes.map(lt => (
                      <div key={lt.id} className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow group">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: lt.color }} />
                            <h3 className="text-sm font-semibold text-gray-900">{lt.name}</h3>
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setAssigningLeave(lt); setShowLeaveAssign(true); }}
                              className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="Assign to employees/groups">
                              <Icon path="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" className="w-4 h-4" />
                            </button>
                            <button onClick={() => {
                              setEditingLeave(lt);
                              setLeaveForm({ name: lt.name, paidLeave: lt.paidLeave, daysPerYear: lt.daysPerYear, carryOver: lt.carryOver, requiresApproval: lt.requiresApproval, color: lt.color });
                              setShowLeaveForm(true);
                            }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                              <Icon path="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDeleteLeaveType(lt.id)}
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                              <Icon path="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <div className="space-y-1.5 text-xs text-gray-500">
                          <div className="flex items-center justify-between">
                            <span>Days/Year</span>
                            <span className="font-semibold text-gray-800">{lt.daysPerYear}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${lt.paidLeave ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                              {lt.paidLeave ? 'Paid' : 'Unpaid'}
                            </span>
                            {lt.carryOver && (
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-100 text-purple-700">Carry Over</span>
                            )}
                            {lt.requiresApproval && (
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-yellow-100 text-yellow-700">Approval Required</span>
                            )}
                          </div>
                          <div className="pt-1.5 border-t border-gray-100 mt-1.5">
                            {!lt.assignedTo || lt.assignedTo.length === 0 ? (
                              <span className="text-[11px] text-gray-400 italic">Available to all employees</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {lt.assignedTo.slice(0, 2).map(m => (
                                  <span key={m.id} className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${m.type === 'group' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>{m.name}</span>
                                ))}
                                {lt.assignedTo.length > 2 && <span className="text-[10px] text-gray-400">+{lt.assignedTo.length - 2} more</span>}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <LeaveAssignModal
                    show={showLeaveAssign}
                    leaveType={assigningLeave}
                    onSave={handleAssignLeaveType}
                    onClose={() => { setShowLeaveAssign(false); setAssigningLeave(null); }}
                  />
                  </>
                ) : null}
              </div>
            )}
          </div>

          {/* Leave Records Tab */}
          {(activeTab as string) === 'leave-records' && (
            <div>
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Leave Records</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Assign leave days directly to specific employees</p>
                </div>
                <button
                  onClick={() => { setEditingLeaveRecord(null); setLeaveRecordForm(BLANK_LEAVE_RECORD_FORM); setShowLeaveRecordModal(true); }}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Icon path="M12 4v16m8-8H4" className="w-4 h-4" />
                  Add Leave Record
                </button>
              </div>

              {/* Filter */}
              <div className="mb-4">
                <input
                  type="text"
                  placeholder="Search by employee name or leave type..."
                  value={leaveRecordFilter}
                  onChange={e => setLeaveRecordFilter(e.target.value)}
                  className="w-full sm:w-80 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Table */}
              {leaveRecords.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <Icon path="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-medium">No leave records yet</p>
                  <p className="text-xs mt-1">Click &quot;Add Leave Record&quot; to assign leave to an employee</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        <th className="text-left py-3 pr-4">Employee</th>
                        <th className="text-left py-3 pr-4">Leave Type</th>
                        <th className="text-left py-3 pr-4">Period</th>
                        <th className="text-center py-3 pr-4">Days</th>
                        <th className="text-left py-3 pr-4">Status</th>
                        <th className="text-left py-3 pr-4">Notes</th>
                        <th className="text-right py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {leaveRecords
                        .filter(r => !leaveRecordFilter || r.employeeName.toLowerCase().includes(leaveRecordFilter.toLowerCase()) || r.leaveTypeName.toLowerCase().includes(leaveRecordFilter.toLowerCase()))
                        .map(r => (
                        <tr key={r.id} className="group hover:bg-gray-50 transition-colors">
                          <td className="py-3 pr-4 font-medium text-gray-900">{r.employeeName}</td>
                          <td className="py-3 pr-4">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold text-white" style={{ backgroundColor: r.leaveTypeColor || '#3B82F6' }}>
                              {r.leaveTypeName}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-gray-600 text-xs">
                            {r.startDate === r.endDate ? r.startDate : `${r.startDate} → ${r.endDate}`}
                          </td>
                          <td className="py-3 pr-4 text-center">
                            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">{r.days}</span>
                          </td>
                          <td className="py-3 pr-4">
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              r.status === 'approved' ? 'bg-green-100 text-green-700' :
                              r.status === 'taken' ? 'bg-blue-100 text-blue-700' :
                              'bg-red-100 text-red-500'
                            }`}>
                              {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-gray-500 text-xs max-w-[160px] truncate">{r.notes || '—'}</td>
                          <td className="py-3 text-right">
                            <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => {
                                  setEditingLeaveRecord(r);
                                  setLeaveRecordForm({ employeeId: r.employeeId, employeeName: r.employeeName, leaveTypeId: r.leaveTypeId, leaveTypeName: r.leaveTypeName, leaveTypeColor: r.leaveTypeColor, startDate: r.startDate, endDate: r.endDate, days: r.days, notes: r.notes || '', status: r.status });
                                  setShowLeaveRecordModal(true);
                                }}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              >
                                <Icon path="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteLeaveRecord(r.id)}
                                className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <Icon path="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Add/Edit Leave Record Modal */}
              {showLeaveRecordModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
                    <div className="px-6 py-5 border-b border-gray-200">
                      <h2 className="text-lg font-semibold text-gray-900">{editingLeaveRecord ? 'Edit Leave Record' : 'Add Leave Record'}</h2>
                      <p className="text-xs text-gray-500 mt-0.5">Assign leave to a specific employee for specific dates</p>
                    </div>
                    <div className="px-6 py-5 space-y-4">
                      {/* Employee */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">Employee <span className="text-red-500">*</span></label>
                        <SearchableSelect
                          options={employeeList}
                          value={leaveRecordForm.employeeId}
                          onChange={(id, name) => setLeaveRecordForm(p => ({ ...p, employeeId: id, employeeName: name }))}
                          placeholder="Search employee..."
                        />
                      </div>
                      {/* Leave Type */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">Leave Type <span className="text-red-500">*</span></label>
                        <SearchableSelect
                          options={leaveTypes.map(lt => ({ id: lt.id, name: lt.name }))}
                          value={leaveRecordForm.leaveTypeId}
                          onChange={(id, name) => {
                            const lt = leaveTypes.find(l => l.id === id);
                            setLeaveRecordForm(p => ({ ...p, leaveTypeId: id, leaveTypeName: name, leaveTypeColor: lt?.color || '#3B82F6' }));
                          }}
                          placeholder="Select leave type..."
                        />
                      </div>
                      {/* Dates */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1.5">Start Date <span className="text-red-500">*</span></label>
                          <input
                            type="date"
                            value={leaveRecordForm.startDate}
                            onChange={e => {
                              const s = e.target.value;
                              setLeaveRecordForm(p => {
                                const end = p.endDate && p.endDate >= s ? p.endDate : s;
                                const d = end && s ? Math.round((new Date(end).getTime() - new Date(s).getTime()) / 86400000) + 1 : 1;
                                return { ...p, startDate: s, endDate: end, days: d };
                              });
                            }}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1.5">End Date <span className="text-red-500">*</span></label>
                          <input
                            type="date"
                            value={leaveRecordForm.endDate}
                            min={leaveRecordForm.startDate}
                            onChange={e => {
                              const end = e.target.value;
                              setLeaveRecordForm(p => {
                                const d = end && p.startDate ? Math.round((new Date(end).getTime() - new Date(p.startDate).getTime()) / 86400000) + 1 : 1;
                                return { ...p, endDate: end, days: d };
                              });
                            }}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      {/* Days calculated */}
                      {leaveRecordForm.startDate && leaveRecordForm.endDate && (
                        <div className="flex items-center gap-2 text-xs text-gray-600 bg-blue-50 rounded-lg px-3 py-2">
                          <Icon path="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" className="w-4 h-4 text-blue-600" />
                          <span><strong className="text-blue-700">{leaveRecordForm.days}</strong> working day{leaveRecordForm.days !== 1 ? 's' : ''} assigned</span>
                        </div>
                      )}
                      {/* Status */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">Status</label>
                        <select
                          value={leaveRecordForm.status}
                          onChange={e => setLeaveRecordForm(p => ({ ...p, status: e.target.value as LeaveRecord['status'] }))}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="approved">Approved</option>
                          <option value="taken">Taken</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </div>
                      {/* Notes */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">Notes</label>
                        <textarea
                          value={leaveRecordForm.notes}
                          onChange={e => setLeaveRecordForm(p => ({ ...p, notes: e.target.value }))}
                          placeholder="Optional notes..."
                          rows={2}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        />
                      </div>
                    </div>
                    <div className="px-6 py-4 border-t border-gray-200 flex gap-2 justify-end">
                      <button onClick={() => { setShowLeaveRecordModal(false); setEditingLeaveRecord(null); setLeaveRecordForm(BLANK_LEAVE_RECORD_FORM); }}
                        className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                        Cancel
                      </button>
                      <button onClick={handleSaveLeaveRecord}
                        className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                        {editingLeaveRecord ? 'Save Changes' : 'Add Record'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
