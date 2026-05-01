'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Link from 'next/link';

const API = 'http://localhost:3001';

const Icon = ({ path, className = 'w-5 h-5' }: { path: string; className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d={path} />
  </svg>
);

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

function minutesToHM(mins?: number) {
  if (!mins || mins <= 0) return 'â€”';
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

function exportCSV(records: AttendanceRecord[], summary: ReportSummary) {
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
  const csv = [header, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `attendance-report-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AttendanceRecordsPage() {
  const router = useRouter();
  const { isAuthenticated, logout } = useAuth();

  const defaults = getDefaultRange();
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return; }
    loadReport();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const loadReport = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ startDate, endDate });
      const res = await fetch(`${API}/api/attendance/records?${params}`);
      const data = await res.json();
      if (data.success) {
        setRecords(data.records || []);
        setSummary(data.summary || null);
      } else {
        setError(data.error || 'Failed to load report');
      }
    } catch (e) {
      setError('Could not connect to server');
    } finally {
      setIsLoading(false);
    }
  }, [startDate, endDate]);

  const filtered = records.filter(r => {
    if (filterEmployee && !r.employeeName.toLowerCase().includes(filterEmployee.toLowerCase())) return false;
    if (filterStatus && r.status !== filterStatus) return false;
    return true;
  });

  if (!isAuthenticated) return null;

  const summaryCards = summary ? [
    { label: 'Present',  value: summary.present,  color: 'text-green-600',  bg: 'bg-green-50',  border: 'border-green-200', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: 'Absent',   value: summary.absent,   color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200',   icon: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: 'Late',     value: summary.late,     color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200',icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: 'On Leave', value: summary.leave,    color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-200',  icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
    { label: 'Holiday',  value: summary.holiday,  color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200',icon: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z' },
  ] : [];

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Sidebar currentPath="/attendance/records" onLogout={logout} />
      <div className="flex-1 lg:ml-64 p-6 lg:p-8">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <Link href="/" className="hover:text-blue-600">Dashboard</Link>
            <Icon path="M9 5l7 7-7 7" className="w-3 h-3" />
            <span className="text-gray-900 font-medium">Attendance Records</span>
          </div>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-xl lg:text-2xl font-semibold text-gray-900 tracking-tight">Attendance Report</h1>
              <p className="text-sm text-gray-500 mt-1">Daily attendance computed from device swipes and shift schedules</p>
            </div>
            <div className="flex items-center gap-2">
              {summary && filtered.length > 0 && (
                <button
                  onClick={() => exportCSV(filtered, summary)}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Icon path="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" className="w-4 h-4" />
                  Export CSV
                </button>
              )}
              <button
                onClick={loadReport}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 border border-gray-200 bg-white rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Icon path="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" className="w-4 h-4" />
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Date Range + Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-5">
          <div className="flex flex-wrap gap-4 items-end">
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
              onClick={loadReport}
              className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Generate Report
            </button>
            <div className="border-l border-gray-200 pl-4 flex flex-wrap gap-3">
              <input
                type="text"
                placeholder="Search employeeâ€¦"
                value={filterEmployee}
                onChange={e => setFilterEmployee(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-44"
              />
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Statuses</option>
                <option value="present">Present</option>
                <option value="absent">Absent</option>
                <option value="late">Late</option>
                <option value="leave">On Leave</option>
                <option value="holiday">Holiday</option>
              </select>
              {(filterEmployee || filterStatus) && (
                <button onClick={() => { setFilterEmployee(''); setFilterStatus(''); }}
                  className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        {summary && !isLoading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
            {summaryCards.map(c => (
              <div key={c.label} className={`rounded-xl border ${c.border} ${c.bg} p-4 flex items-center gap-3`}>
                <div className={`p-2 rounded-lg bg-white shadow-sm`}>
                  <Icon path={c.icon} className={`w-5 h-5 ${c.color}`} />
                </div>
                <div>
                  <div className={`text-xl font-bold ${c.color}`}>{c.value}</div>
                  <div className="text-xs text-gray-500 font-medium">{c.label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Work Hours Summary */}
        {summary && !isLoading && (summary.totalWorkMinutes > 0 || summary.totalOvertimeMinutes > 0) && (
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gray-50">
                <Icon path="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" className="w-5 h-5 text-gray-500" />
              </div>
              <div>
                <div className="text-xl font-bold text-gray-800">{minutesToHM(summary.totalWorkMinutes)}</div>
                <div className="text-xs text-gray-500 font-medium">Total Work Time</div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-indigo-100 shadow-sm p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-50">
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
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5 text-sm text-red-600 flex items-center gap-2">
            <Icon path="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="w-5 h-5 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
              <p className="text-sm text-gray-400">Generating attendance reportâ€¦</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-24 text-gray-400">
              <Icon path="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" className="w-14 h-14 mx-auto mb-3 opacity-25" />
              <p className="text-sm font-medium">No attendance records found</p>
              <p className="text-xs mt-1 text-gray-400">
                {records.length === 0
                  ? 'Configure shifts & schedules, then swipe data will generate records'
                  : 'No records match the current filters'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50/60">
                    <th className="text-left px-5 py-3">Employee</th>
                    <th className="text-left px-5 py-3">Date</th>
                    <th className="text-left px-5 py-3">Status</th>
                    <th className="text-left px-5 py-3">Check In</th>
                    <th className="text-left px-5 py-3">Check Out</th>
                    <th className="text-left px-5 py-3">Work Time</th>
                    <th className="text-left px-5 py-3">Overtime</th>
                    <th className="text-left px-5 py-3">Late</th>
                    <th className="text-left px-5 py-3">Shift / Period</th>
                    <th className="text-left px-5 py-3">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-5 py-3 font-medium text-gray-900 whitespace-nowrap">{r.employeeName}</td>
                      <td className="px-5 py-3 text-gray-600 font-mono text-xs whitespace-nowrap">{r.date}</td>
                      <td className="px-5 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_STYLES[r.status] || 'bg-gray-100 text-gray-600'}`}>
                          {STATUS_LABEL[r.status] || r.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-gray-700">{r.checkIn || 'â€”'}</td>
                      <td className="px-5 py-3 font-mono text-xs text-gray-700">{r.checkOut || 'â€”'}</td>
                      <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{minutesToHM(r.workMinutes)}</td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        {r.overtimeMinutes ? (
                          <span className="text-indigo-600 font-semibold">{minutesToHM(r.overtimeMinutes)}</span>
                        ) : 'â€”'}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        {r.lateMinutes ? (
                          <span className="text-yellow-600 font-semibold">{minutesToHM(r.lateMinutes)}</span>
                        ) : 'â€”'}
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-500">
                        {r.shiftName && <span className="font-medium text-gray-700">{r.shiftName}</span>}
                        {r.shiftName && r.periodName && <span className="text-gray-400 mx-1">Â·</span>}
                        {r.periodName && <span>{r.periodName}</span>}
                        {!r.shiftName && !r.periodName && 'â€”'}
                      </td>
                      <td className="px-5 py-3 text-gray-400 text-xs max-w-[140px] truncate">{r.notes || 'â€”'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer */}
          {!isLoading && filtered.length > 0 && (
            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
              <span>Showing {filtered.length} of {records.length} records &nbsp;Â·&nbsp; {startDate} â†’ {endDate}</span>
              <span>
                {summary && (
                  <>
                    <span className="text-green-600 font-medium">{summary.present} present</span>
                    {summary.late > 0 && <span className="text-yellow-600 font-medium ml-3">{summary.late} late</span>}
                    {summary.absent > 0 && <span className="text-red-500 font-medium ml-3">{summary.absent} absent</span>}
                  </>
                )}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
