'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Link from 'next/link';
import { useConfig } from '@/context/ConfigContext';
import { useSocket } from '@/context/SocketContext';
import { useSettings } from '@/context/SettingsContext';
import { formatDate as fmtDate, formatTime as fmtTime } from '@/lib/formatDateTime';

const Icon = ({ path, className = 'w-5 h-5' }: { path: string; className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d={path} />
  </svg>
);

// --------- Types ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  status: 'present' | 'absent' | 'late' | 'leave' | 'holiday';
  workMinutes?: number;
  overtimeMinutes?: number;
  lateMinutes?: number;
  periodName?: string;
  shiftName?: string;
  notes?: string;
}

interface ReportSummary {
  total: number;
  present: number;
  absent: number;
  late: number;
  leave: number;
  holiday: number;
  totalWorkMinutes: number;
  totalOvertimeMinutes: number;
}

interface Employee {
  id: string;
  name: string;
  personId?: string;
  employeeId?: string;  // alias for personId (legacy)
  groups?: string[];
}

interface EmployeeGroup {
  id: string;
  name: string;
  description?: string;
  parentId?: string | null;
}

// --------- Selection model ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// selector.type = 'all'   --- no employee filter
// selector.type = 'group' --- filter by groupId
// selector.type = 'emp'   --- filter by single employee id
interface PersonSelection {
  type: 'all' | 'group' | 'emp';
  id?: string;
  label?: string;
}

// --------- Constants ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const STATUS_STYLES: Record<string, string> = {
  present: 'bg-green-100 text-green-700 border border-green-200',
  absent:  'bg-red-100 text-red-600 border border-red-200',
  late:    'bg-yellow-100 text-yellow-700 border border-yellow-200',
  leave:   'bg-blue-100 text-blue-700 border border-blue-200',
  holiday: 'bg-purple-100 text-purple-700 border border-purple-200',
};

const STATUS_LABEL: Record<string, string> = {
  present: 'Present',
  absent:  'Absent',
  late:    'Late',
  leave:   'On Leave',
  holiday: 'Holiday',
};

const STATUS_FILTERS = [
  { value: '', label: 'All', color: 'bg-gray-100 text-gray-600 border-gray-200 dark:border-gray-700' },
  { value: 'present', label: 'Present', color: 'bg-green-100 text-green-700 border-green-200' },
  { value: 'absent',  label: 'Absent',  color: 'bg-red-100 text-red-600 border-red-200' },
  { value: 'late',    label: 'Late',    color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  { value: 'leave',   label: 'On Leave',color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'holiday', label: 'Holiday', color: 'bg-purple-100 text-purple-700 border-purple-200' },
];

// --------- Helpers ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
function minutesToHM(mins?: number) {
  if (!mins || mins <= 0) return '-';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function getDefaultRange() {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(today) };
}

function exportCSV(records: AttendanceRecord[], summary: ReportSummary, selectionLabel: string, dateRange: string) {
  const header = ['Employee', 'Date', 'Status', 'Check In', 'Check Out', 'Work Time', 'Overtime', 'Late', 'Shift', 'Period', 'Notes'];
  const rows = records.map(r => [
    r.employeeName,
    r.date,
    STATUS_LABEL[r.status] || r.status,
    r.checkIn || '',
    r.checkOut || '',
    r.workMinutes ? minutesToHM(r.workMinutes) : '',
    r.overtimeMinutes ? minutesToHM(r.overtimeMinutes) : '',
    r.lateMinutes ? minutesToHM(r.lateMinutes) : '',
    r.shiftName || '',
    r.periodName || '',
    r.notes || '',
  ]);
  const meta = [
    [`Attendance Report --- ${selectionLabel}`],
    [`Period: ${dateRange}`],
    [`Total: ${summary.total}  Present: ${summary.present}  Absent: ${summary.absent}  Late: ${summary.late}  Leave: ${summary.leave}  Holiday: ${summary.holiday}`],
    [],
  ];
  const csv = [...meta, header, ...rows]
    .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `attendance-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// --------- Page ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export default function AttendanceRecordsPage() {
  const router = useRouter();
  const { isAuthenticated, logout } = useAuth();
  const { apiUrl } = useConfig();
  const { socket } = useSocket();
  const { settings } = useSettings();

  // Date range
  const defaults = getDefaultRange();
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);

  // Status chip filter (client-side)
  const [filterStatus, setFilterStatus] = useState('');

  // Person selector (left panel)
  const [selection, setSelection] = useState<PersonSelection>({ type: 'all', label: 'All Employees' });
  const [personSearch, setPersonSearch] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [groups, setGroups] = useState<EmployeeGroup[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['all']));

  // Report state
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Auto-refresh notification
  const [autoRefreshPending, setAutoRefreshPending] = useState(false);

  // Keep latest selection/dates in a ref for the socket callback
  const stateRef = useRef({ startDate, endDate, selection });
  useEffect(() => { stateRef.current = { startDate, endDate, selection }; }, [startDate, endDate, selection]);

  // ------ Load employees & groups once ------------------------------------------------------------------------------------------------------------------------------
  useEffect(() => {
    if (!isAuthenticated) return;
    const load = async () => {
      try {
        const [empRes, grpRes] = await Promise.all([
          fetch(`${apiUrl}/api/employees`),
          fetch(`${apiUrl}/api/employees/groups`),
        ]);
        const [empData, grpData] = await Promise.all([empRes.json(), grpRes.json()]);
        if (empData.success) {
          // Backend returns 'data' for employees, normalize 'groups' field from 'groupId'
          const emps = (empData.data || empData.employees || []).map((e: any) => ({
            ...e,
            groups: e.groups || (e.groupId ? [e.groupId] : []),
            employeeId: e.employeeId || e.personId || e.id,
          }));
          setEmployees(emps);
        }
        if (grpData.success) setGroups(grpData.groups || []);
      } catch (_) {}
    };
    load();
  }, [isAuthenticated, apiUrl]);

  // ------ Redirect if not authenticated ---------------------------------------------------------------------------------------------------------------------------
  useEffect(() => {
    if (!isAuthenticated) router.push('/login');
  }, [isAuthenticated, router]);

  // ------ Generate report ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const loadReport = useCallback(async (sel?: PersonSelection, sd?: string, ed?: string) => {
    const s = sel ?? stateRef.current.selection;
    const start = sd ?? stateRef.current.startDate;
    const end = ed ?? stateRef.current.endDate;
    setIsLoading(true);
    setError('');
    setAutoRefreshPending(false);
    try {
      const params = new URLSearchParams({ startDate: start, endDate: end });
      if (s.type === 'emp' && s.id) params.set('employeeId', s.id);
      else if (s.type === 'group' && s.id) params.set('groupId', s.id);
      const res = await fetch(`${apiUrl}/api/attendance/records?${params}`);
      const data = await res.json();
      if (data.success) {
        setRecords(data.records || []);
        setSummary(data.summary || null);
      } else {
        setError(data.error || 'Failed to load report');
      }
    } catch (_) {
      setError('Could not connect to server');
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl]);

  // ------ Socket.IO: auto-refresh when offline records imported ---------------------------------------------------
  useEffect(() => {
    if (!socket) return;
    const handler = (data: { storedCount: number; affectedDates?: string[] }) => {
      const { startDate: sd, endDate: ed } = stateRef.current;
      // Check if any affected date falls within the current report range
      const affected = (data.affectedDates || []).some(d => d >= sd && d <= ed);
      if (affected) {
        setAutoRefreshPending(true);
      }
    };
    socket.on('attendance:updated', handler);
    return () => { socket.off('attendance:updated', handler); };
  }, [socket]);

  // ------ Filtered records (client-side status filter) ------------------------------------------------------------------------------
  const filtered = filterStatus
    ? records.filter(r => r.status === filterStatus)
    : records;

  // ------ Person panel helpers ------------------------------------------------------------------------------------------------------------------------------------------------------
  const lowerSearch = personSearch.toLowerCase();
  const matchedEmployees = employees.filter(e =>
    !lowerSearch ||
    e.name.toLowerCase().includes(lowerSearch) ||
    (e.personId || e.employeeId || e.id).toLowerCase().includes(lowerSearch)
  );

  // Build group --- employees map for the panel
  const empsByGroup = new Map<string, Employee[]>();
  empsByGroup.set('ungrouped', []);
  groups.forEach(g => empsByGroup.set(g.id, []));
  matchedEmployees.forEach(e => {
    const grpIds = e.groups || [];
    if (grpIds.length === 0) {
      empsByGroup.get('ungrouped')!.push(e);
    } else {
      grpIds.forEach(gid => {
        if (empsByGroup.has(gid)) empsByGroup.get(gid)!.push(e);
        else empsByGroup.get('ungrouped')!.push(e);
      });
    }
  });

  function toggleGroup(gid: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid); else next.add(gid);
      return next;
    });
  }

  function selectItem(sel: PersonSelection) {
    setSelection(sel);
    loadReport(sel, startDate, endDate);
  }

  if (!isAuthenticated) return null;

  // ------ Summary cards ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const summaryCards = summary ? [
    { key: 'present', label: 'Present',  value: summary.present,  color: 'text-green-600',  bg: 'bg-green-50',  border: 'border-green-200', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
    { key: 'absent',  label: 'Absent',   value: summary.absent,   color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200',   icon: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z' },
    { key: 'late',    label: 'Late',     value: summary.late,     color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200',icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    { key: 'leave',   label: 'On Leave', value: summary.leave,    color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-200',  icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
    { key: 'holiday', label: 'Holiday',  value: summary.holiday,  color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200',icon: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z' },
  ] : [];

  const selectionLabel = selection.label || 'All Employees';
  const dateRange = `${startDate} to ${endDate}`;

  // ------ Render ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950">
      <Sidebar currentPath="/attendance/records" onLogout={logout} />

      {/* Main area (after sidebar) */}
      <div className="flex-1 lg:ml-64 flex flex-col">

        {/* Top header bar */}
        <div className="px-6 lg:px-8 pt-6 pb-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <Link href="/" className="hover:text-blue-600">Dashboard</Link>
            <Icon path="M9 5l7 7-7 7" className="w-3 h-3" />
            <span className="text-gray-900 dark:text-gray-100 font-medium">Attendance Report</span>
          </div>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-xl lg:text-2xl font-semibold text-gray-900 tracking-tight">Attendance Report</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {selectionLabel} &nbsp;-&nbsp; {dateRange}
                {summary && !isLoading && (
                  <span className="ml-2 text-gray-400">({summary.total} records)</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {summary && filtered.length > 0 && (
                <button
                  onClick={() => exportCSV(filtered, summary, selectionLabel, dateRange)}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Icon path="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" className="w-4 h-4" />
                  Export CSV
                </button>
              )}
              <button
                onClick={() => loadReport()}
                disabled={isLoading}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 border border-gray-200 bg-white rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <Icon path="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Auto-refresh banner */}
        {autoRefreshPending && (
          <div className="mx-6 lg:mx-8 mb-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-amber-800">
            <Icon path="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="w-5 h-5 text-amber-500 shrink-0" />
            <span className="flex-1">New offline records were imported. Attendance data may have changed.</span>
            <button
              onClick={() => loadReport()}
              className="px-3 py-1 bg-amber-600 text-white text-xs rounded-lg hover:bg-amber-700 transition-colors font-medium"
            >
              Refresh Now
            </button>
          </div>
        )}

        {/* Two-column body */}
        <div className="flex flex-1 gap-0 px-6 lg:px-8 pb-8 min-h-0">

          {/* ------ Left panel: Person Selector ------------------------------------------------------------------------------------------ */}
          <div className="w-64 shrink-0 mr-5 flex flex-col">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 flex flex-col overflow-hidden h-full" style={{ maxHeight: 'calc(100vh - 180px)' }}>
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Select People</p>
                <div className="relative">
                  <Icon path="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search name or ID..."
                    value={personSearch}
                    onChange={e => setPersonSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="overflow-y-auto flex-1 py-2">
                {/* All Employees */}
                <button
                  onClick={() => selectItem({ type: 'all', label: 'All Employees' })}
                  className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 transition-colors ${
                    selection.type === 'all'
                      ? 'bg-blue-50 text-blue-700 font-semibold'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon path="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" className="w-4 h-4 shrink-0" />
                  All Employees
                  <span className="ml-auto text-xs text-gray-400">{employees.length}</span>
                </button>

                <div className="my-1 border-t border-gray-100" />

                {/* Groups */}
                {groups.map(g => {
                  const grpEmps = empsByGroup.get(g.id) || [];
                  if (personSearch && grpEmps.length === 0) return null;
                  const isExpanded = expandedGroups.has(g.id);
                  const isSelected = selection.type === 'group' && selection.id === g.id;
                  return (
                    <div key={g.id}>
                      <div className={`flex items-center gap-1 px-3 py-1.5 transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                        <button
                          onClick={() => toggleGroup(g.id)}
                          className="p-0.5 text-gray-400 hover:text-gray-600"
                        >
                          <Icon path={isExpanded ? 'M19 9l-7 7-7-7' : 'M9 5l7 7-7 7'} className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => selectItem({ type: 'group', id: g.id, label: g.name })}
                          className={`flex-1 text-left text-sm flex items-center gap-1.5 ${isSelected ? 'text-blue-700 font-semibold' : 'text-gray-700'}`}
                        >
                          <Icon path="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                          <span className="truncate">{g.name}</span>
                          <span className="ml-auto text-xs text-gray-400 shrink-0">{grpEmps.length}</span>
                        </button>
                      </div>
                      {isExpanded && grpEmps.map(e => (
                        <button
                          key={e.id}
                          onClick={() => selectItem({ type: 'emp', id: e.id, label: e.name })}
                          className={`w-full text-left px-8 py-1.5 text-xs flex items-center gap-2 transition-colors ${
                            selection.type === 'emp' && selection.id === e.id
                              ? 'bg-blue-50 text-blue-700 font-semibold'
                              : 'text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          <Icon path="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" className="w-3.5 h-3.5 shrink-0 text-gray-300" />
                          <span className="truncate">{e.name}</span>
                          {(e.personId || e.employeeId) && (
                            <span className="ml-auto text-gray-400 font-mono shrink-0">{e.personId || e.employeeId}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  );
                })}

                {/* Ungrouped employees */}
                {(() => {
                  const ungrouped = empsByGroup.get('ungrouped') || [];
                  if (ungrouped.length === 0) return null;
                  const isExpanded = expandedGroups.has('ungrouped');
                  return (
                    <div>
                      <div className="flex items-center gap-1 px-3 py-1.5 hover:bg-gray-50">
                        <button onClick={() => toggleGroup('ungrouped')} className="p-0.5 text-gray-400 hover:text-gray-600">
                          <Icon path={isExpanded ? 'M19 9l-7 7-7-7' : 'M9 5l7 7-7 7'} className="w-3.5 h-3.5" />
                        </button>
                        <span className="flex-1 text-xs text-gray-400 pl-1">No Group</span>
                        <span className="text-xs text-gray-400">{ungrouped.length}</span>
                      </div>
                      {isExpanded && ungrouped.map(e => (
                        <button
                          key={e.id}
                          onClick={() => selectItem({ type: 'emp', id: e.id, label: e.name })}
                          className={`w-full text-left px-8 py-1.5 text-xs flex items-center gap-2 transition-colors ${
                            selection.type === 'emp' && selection.id === e.id
                              ? 'bg-blue-50 text-blue-700 font-semibold'
                              : 'text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          <Icon path="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" className="w-3.5 h-3.5 shrink-0 text-gray-300" />
                          <span className="truncate">{e.name}</span>
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* ------ Right panel: Report --------------------------------------------------------------------------------------------------------------- */}
          <div className="flex-1 min-w-0 flex flex-col gap-4">

            {/* Controls row */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                    className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                    className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <button
                  onClick={() => loadReport(undefined, startDate, endDate)}
                  disabled={isLoading}
                  className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
                >
                  Generate Report
                </button>
                {/* Quick-range shortcuts */}
                <div className="flex gap-1.5 ml-auto">
                  {[
                    { label: 'Today', fn: () => { const t = new Date().toISOString().slice(0,10); setStartDate(t); setEndDate(t); loadReport(undefined, t, t); }},
                    { label: 'This Week', fn: () => {
                      const d = new Date(); const day = d.getDay();
                      const mon = new Date(d); mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
                      const s = mon.toISOString().slice(0,10); const e2 = d.toISOString().slice(0,10);
                      setStartDate(s); setEndDate(e2); loadReport(undefined, s, e2);
                    }},
                    { label: 'This Month', fn: () => {
                      const d = new Date(); const s = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
                      const e2 = d.toISOString().slice(0,10);
                      setStartDate(s); setEndDate(e2); loadReport(undefined, s, e2);
                    }},
                  ].map(q => (
                    <button key={q.label} onClick={q.fn}
                      className="px-2.5 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status filter chips */}
              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
                <span className="text-xs text-gray-400 self-center mr-1">Filter:</span>
                {STATUS_FILTERS.map(sf => (
                  <button
                    key={sf.value}
                    onClick={() => setFilterStatus(sf.value)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                      filterStatus === sf.value
                        ? sf.color + ' ring-2 ring-offset-1 ring-blue-400'
                        : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {sf.label}
                    {summary && sf.value && (
                      <span className="ml-1 opacity-70">
                        ({summary[sf.value as keyof ReportSummary] as number ?? 0})
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Summary cards */}
            {summary && !isLoading && (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
                {summaryCards.map(c => (
                  <button
                    key={c.key}
                    onClick={() => setFilterStatus(filterStatus === c.key ? '' : c.key)}
                    className={`rounded-xl border ${c.border} ${c.bg} p-3.5 flex items-center gap-3 transition-all hover:shadow-sm ${filterStatus === c.key ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}
                  >
                    <div className="p-2 rounded-lg bg-white shadow-sm shrink-0">
                      <Icon path={c.icon} className={`w-4 h-4 ${c.color}`} />
                    </div>
                    <div className="text-left">
                      <div className={`text-xl font-bold ${c.color}`}>{c.value}</div>
                      <div className="text-xs text-gray-500 font-medium leading-tight">{c.label}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Work time summary */}
            {summary && !isLoading && (summary.totalWorkMinutes > 0 || summary.totalOvertimeMinutes > 0) && (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gray-50 shrink-0">
                    <Icon path="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" className="w-5 h-5 text-gray-500" />
                  </div>
                  <div>
                    <div className="text-xl font-bold text-gray-800">{minutesToHM(summary.totalWorkMinutes)}</div>
                    <div className="text-xs text-gray-500 font-medium">Total Work Time</div>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-indigo-100 shadow-sm p-4 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-indigo-50 shrink-0">
                    <Icon path="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" className="w-5 h-5 text-indigo-500" />
                  </div>
                  <div>
                    <div className="text-xl font-bold text-indigo-700">{minutesToHM(summary.totalOvertimeMinutes)}</div>
                    <div className="text-xs text-gray-500 font-medium">Total Overtime</div>
                  </div>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600 flex items-center gap-2">
                <Icon path="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="w-5 h-5 shrink-0" />
                {error}
              </div>
            )}

            {/* Table */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 flex-1">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-24 gap-3">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                  <p className="text-sm text-gray-400">Generating attendance report...</p>
                </div>
              ) : !summary ? (
                <div className="text-center py-24 text-gray-400">
                  <Icon path="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" className="w-14 h-14 mx-auto mb-3 opacity-25" />
                  <p className="text-sm font-medium">Select a date range and click Generate Report</p>
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-24 text-gray-400">
                  <Icon path="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" className="w-14 h-14 mx-auto mb-3 opacity-25" />
                  <p className="text-sm font-medium">No records match the current filters</p>
                  {filterStatus && (
                    <button onClick={() => setFilterStatus('')} className="mt-2 text-xs text-blue-600 hover:underline">
                      Clear status filter
                    </button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50/60">
                        <th className="text-left px-4 py-3">Employee</th>
                        <th className="text-left px-4 py-3">Date</th>
                        <th className="text-left px-4 py-3">Status</th>
                        <th className="text-left px-4 py-3">Check In</th>
                        <th className="text-left px-4 py-3">Check Out</th>
                        <th className="text-left px-4 py-3">Work Time</th>
                        <th className="text-left px-4 py-3">Overtime</th>
                        <th className="text-left px-4 py-3">Late</th>
                        <th className="text-left px-4 py-3">Shift / Period</th>
                        <th className="text-left px-4 py-3">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filtered.map(r => (
                        <tr key={r.id} className="hover:bg-gray-50/70 transition-colors">
                          <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">{r.employeeName}</td>
                          <td className="px-4 py-2.5 text-gray-600 font-mono text-xs whitespace-nowrap">{fmtDate(r.date, settings.dateFormat, settings.timeZone)}</td>
                          <td className="px-4 py-2.5">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_STYLES[r.status] || 'bg-gray-100 text-gray-600'}`}>
                              {STATUS_LABEL[r.status] || r.status}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{r.checkIn ? fmtTime(`${r.date}T${r.checkIn}`, settings.timeFormat, settings.timeZone) : '-'}</td>
                          <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{r.checkOut ? fmtTime(`${r.date}T${r.checkOut}`, settings.timeFormat, settings.timeZone) : '-'}</td>
                          <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{minutesToHM(r.workMinutes)}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            {r.overtimeMinutes ? <span className="text-indigo-600 font-semibold">{minutesToHM(r.overtimeMinutes)}</span> : '-'}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            {r.lateMinutes ? <span className="text-yellow-600 font-semibold">{minutesToHM(r.lateMinutes)}</span> : '-'}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                            {r.shiftName && <span className="font-medium text-gray-700">{r.shiftName}</span>}
                            {r.shiftName && r.periodName && <span className="text-gray-400 mx-1">--</span>}
                            {r.periodName && <span>{r.periodName}</span>}
                            {!r.shiftName && !r.periodName && '-'}
                          </td>
                          <td className="px-4 py-2.5 text-gray-400 text-xs max-w-[120px] truncate">{r.notes || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Footer */}
              {!isLoading && summary && filtered.length > 0 && (
                <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
                  <span>
                    Showing <span className="font-medium text-gray-600">{filtered.length}</span> of <span className="font-medium text-gray-600">{records.length}</span> records
                    {filterStatus && <span> (filtered by <span className="text-blue-600">{STATUS_LABEL[filterStatus]}</span>)</span>}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-green-600 font-medium">{summary.present} present</span>
                    {summary.late > 0 && <span className="text-yellow-600 font-medium">{summary.late} late</span>}
                    {summary.absent > 0 && <span className="text-red-500 font-medium">{summary.absent} absent</span>}
                    {summary.leave > 0 && <span className="text-blue-500 font-medium">{summary.leave} leave</span>}
                  </span>
                </div>
              )}
            </div>
          </div>{/* end right panel */}
        </div>{/* end two-column body */}
      </div>{/* end main area */}
    </div>
  );
}
