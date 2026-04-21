'use client';

import { useState, useEffect } from 'react';
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

type TabType = 'rules' | 'periods' | 'shifts' | 'schedules';
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
                  <div className="ml-4 space-y-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={attendanceRules.overtimeFrom} onChange={() => toggleAttendanceRule('overtimeFrom')}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
                      <span className="text-sm text-gray-700">Overtime work is calculated from</span>
                      <input type="number" defaultValue="60" step="0.01" disabled={!attendanceRules.overtimeFrom}
                        className={`px-2 py-1 border border-gray-300 rounded-md text-sm w-20 focus:ring-2 focus:ring-blue-500 ${!attendanceRules.overtimeFrom ? 'bg-gray-100 text-gray-400' : ''}`} />
                      <span className="text-sm text-gray-600">minutes after the end of work.</span>
                    </label>
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
      const body = { name: periodName, mode: attendanceMode, startTime: '09:00', endTime: '18:00', requiredWorkTime: 480, breaks: currentBreaks };
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
    setGeneralTab('general');
    setShowPeriodModal(true);
  };

  const handleAddPeriod = () => {
    setIsEditing(false);
    setEditingPeriodId(null);
    setPeriodName('');
    setAttendanceMode('fixed');
    setCurrentBreaks([]);
    setGeneralTab('general');
    setShowPeriodModal(true);
  };

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
    } else {
      setIsLoading(false);
      loadPeriods();
      loadBreaks();
      loadRulesSettings();
    }
  }, [isAuthenticated, router]);

  const tabs = [
    { id: 'rules' as TabType, label: 'Attendance Rules', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { id: 'periods' as TabType, label: 'Attendance Periods', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    { id: 'shifts' as TabType, label: 'Attendance Shifts', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
    { id: 'schedules' as TabType, label: 'Shift Schedules', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
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
                    <p className="text-sm text-gray-500 mt-1">Create and manage shift definitions with specific working hours</p>
                  </div>
                  <button className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors">
                    Add Shift
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white border border-gray-200 rounded-lg p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">Morning Shift</h3>
                        <p className="text-xs text-gray-500 mt-1">Standard day shift</p>
                      </div>
                      <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">Active</span>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Start Time</span>
                        <span className="font-medium text-gray-900">09:00</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">End Time</span>
                        <span className="font-medium text-gray-900">18:00</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Break</span>
                        <span className="font-medium text-gray-900">1 hour</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Working Hours</span>
                        <span className="font-medium text-gray-900">8 hours</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white border border-gray-200 rounded-lg p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">Evening Shift</h3>
                        <p className="text-xs text-gray-500 mt-1">Extended evening coverage</p>
                      </div>
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">Inactive</span>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Start Time</span>
                        <span className="font-medium text-gray-900">14:00</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">End Time</span>
                        <span className="font-medium text-gray-900">23:00</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Break</span>
                        <span className="font-medium text-gray-900">1 hour</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Working Hours</span>
                        <span className="font-medium text-gray-900">8 hours</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Shift Schedules Tab */}
            {activeTab === 'schedules' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Shift Schedules</h2>
                    <p className="text-sm text-gray-500 mt-1">Assign shifts to employees or departments on a weekly/monthly basis</p>
                  </div>
                  <button className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors">
                    Create Schedule
                  </button>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-900">Weekly Schedule - April 2026</h3>
                  </div>
                  <p className="p-6 text-gray-500 text-center">Schedule information will be displayed here</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
