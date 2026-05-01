'use client';

import { useState, useEffect, useRef } from 'react';
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface LeaveRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  leaveTypeId: string;
  leaveTypeName: string;
  leaveTypeColor: string;
  startDate: string;
  endDate: string;
  days: number;
  notes?: string;
  status: 'approved' | 'taken' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

interface LeaveType {
  id: string;
  name: string;
  paidLeave: boolean;
  daysPerYear: number;
  carryOver: boolean;
  requiresApproval: boolean;
  color: string;
  assignedTo?: AssignedMember[];
}

interface Employee {
  id: string;
  name: string;
  personId?: string;
  employeeId?: string;
}

interface AssignedMember {
  id: string;
  name: string;
  type: 'employee' | 'group';
}

type StatusFilter = 'all' | 'approved' | 'taken' | 'cancelled';
type PageTab = 'records' | 'leave-types';

const STATUS_COLORS: Record<string, string> = {
  approved: 'bg-green-100 text-green-700',
  taken: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-red-100 text-red-500',
};

const PRESET_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

// ─── SearchableSelect ─────────────────────────────────────────────────────────

function SearchableSelect({
  options, value, onChange, placeholder,
}: {
  options: { id: string; name: string }[];
  value: string;
  onChange: (id: string, name: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selectedLabel = options.find(o => o.id === value)?.name || '';

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = options.filter(o => !query || o.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div ref={ref} className="relative">
      <input
        type="text" readOnly={!open}
        value={open ? query : selectedLabel}
        onFocus={() => { setOpen(true); setQuery(''); }}
        onChange={e => setQuery(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
      />
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filtered.length === 0
            ? <p className="px-4 py-3 text-xs text-gray-400">No results</p>
            : filtered.map(o => (
              <button key={o.id} onMouseDown={() => { onChange(o.id, o.name); setOpen(false); setQuery(''); }}
                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 hover:text-blue-700 transition-colors ${o.id === value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'}`}>
                {o.name}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

// ─── Leave Assign Modal ───────────────────────────────────────────────────────

function LeaveAssignModal({
  show, leaveType, onSave, onClose,
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
  const [empList, setEmpList] = useState<{ id: string; name: string }[]>([]);
  const [grpList, setGrpList] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!show || !leaveType) return;
    setMembers(leaveType.assignedTo ? [...leaveType.assignedTo] : []);
  }, [show, leaveType]);

  useEffect(() => {
    if (!show) return;
    Promise.all([
      fetch(`${API}/api/employees`).then(r => r.json()).catch(() => null),
      fetch(`${API}/api/employees/groups`).then(r => r.json()).catch(() => null),
    ]).then(([empData, grpData]) => {
      if (empData?.success) setEmpList((empData.data || []).map((e: any) => ({ id: e.id, name: e.name || e.employeeName || e.id })));
      if (grpData?.success) setGrpList((grpData.groups || []).map((g: any) => ({ id: g.id, name: g.name })));
    });
  }, [show]);

  if (!show || !leaveType) return null;
  const currentList = assignType === 'employee' ? empList : grpList;
  const handleAdd = () => {
    if (!assignId || !assignName || members.some(m => m.id === assignId)) return;
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
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <Icon path="M6 18L18 6M6 6l12 12" className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-700">
            {members.length === 0
              ? 'ℹ No specific assignment — this leave type is available to ALL employees.'
              : `Assigned to ${members.length} specific employee(s)/group(s) only.`}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Add Employee or Group</label>
            <div className="flex gap-2 mb-2">
              {(['employee', 'group'] as const).map(t => (
                <button key={t} onClick={() => setAssignType(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize ${assignType === t ? (t === 'employee' ? 'bg-blue-600 text-white' : 'bg-purple-600 text-white') : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {t}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <SearchableSelect options={currentList} value={assignId}
                onChange={(id, name) => { setAssignId(id); setAssignName(name); }} placeholder={`Search ${assignType}...`} />
              <button onClick={handleAdd} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Add</button>
            </div>
          </div>
          {members.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Assigned to ({members.length})</label>
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                {members.map(m => (
                  <div key={m.id} className="flex items-center gap-1.5 bg-gray-100 rounded-lg px-3 py-1.5 group">
                    <span className={`text-[10px] font-bold uppercase ${m.type === 'group' ? 'text-purple-600' : 'text-blue-600'}`}>{m.type === 'group' ? 'G' : 'E'}</span>
                    <span className="text-xs text-gray-800">{m.name}</span>
                    <button onClick={() => setMembers(prev => prev.filter(x => x.id !== m.id))}
                      className="ml-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100">
                      <Icon path="M6 18L18 6M6 6l12 12" className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex gap-2 justify-between">
          <button onClick={() => setMembers([])} className="px-4 py-2 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
            Clear (Available to Everyone)
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={() => onSave(leaveType.id, members)} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              Save Assignment
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Blank forms ──────────────────────────────────────────────────────────────

const BLANK_RECORD_FORM = {
  employeeId: '', employeeName: '',
  leaveTypeId: '', leaveTypeName: '', leaveTypeColor: '#3B82F6',
  startDate: '', endDate: '', days: 1, notes: '', status: 'approved' as const,
};

const BLANK_LT_FORM: Omit<LeaveType, 'id'> = {
  name: '', paidLeave: true, daysPerYear: 0, carryOver: false, requiresApproval: true, color: '#3B82F6',
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LeaveManagementPage() {
  const router = useRouter();
  const { isAuthenticated, logout } = useAuth();

  // ── Data state ──
  const [records, setRecords] = useState<LeaveRecord[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empSearch, setEmpSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // ── Page tab ──
  const [pageTab, setPageTab] = useState<PageTab>('records');

  // ── Records filters ──
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterLeaveType, setFilterLeaveType] = useState('');
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // ── Employee detail selection ──
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);

  // ── Record modal ──
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<LeaveRecord | null>(null);
  const [form, setForm] = useState<Omit<LeaveRecord, 'id' | 'createdAt' | 'updatedAt'>>(BLANK_RECORD_FORM);
  const [saving, setSaving] = useState(false);

  // ── Export modal ──
  const [showExport, setShowExport] = useState(false);
  const [exportFrom, setExportFrom] = useState('');
  const [exportTo, setExportTo] = useState('');
  const [exporting, setExporting] = useState(false);

  // ── Leave Type modal ──
  const [showLtForm, setShowLtForm] = useState(false);
  const [editingLt, setEditingLt] = useState<LeaveType | null>(null);
  const [ltForm, setLtForm] = useState<Omit<LeaveType, 'id'>>(BLANK_LT_FORM);
  const [savingLt, setSavingLt] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assigningLt, setAssigningLt] = useState<LeaveType | null>(null);

  // ── Load ──
  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return; }
    loadAll();
  }, [isAuthenticated]);

  async function loadAll() {
    setIsLoading(true);
    try {
      const [recRes, ltRes, empRes] = await Promise.all([
        fetch(`${API}/api/attendance/leave-records`),
        fetch(`${API}/api/attendance/leave-types`),
        fetch(`${API}/api/employees`),
      ]);
      const [recData, ltData, empData] = await Promise.all([recRes.json(), ltRes.json(), empRes.json()]);
      if (recData.success) setRecords(recData.leaveRecords || []);
      if (ltData.success) setLeaveTypes(ltData.leaveTypes || []);
      if (empData.success) setEmployees((empData.data || []).map((e: any) => ({
        id: e.id || e.employeeId,
        name: e.name || e.employeeName,
        personId: e.personId || e.person_id || '',
        employeeId: e.employeeId || e.id,
      })));
    } catch (e) { console.error('Load failed', e); }
    finally { setIsLoading(false); }
  }

  // ─── Record CRUD ─────────────────────────────────────────────────────────────

  function openAdd() { setEditing(null); setForm(BLANK_RECORD_FORM); setShowModal(true); }

  function openEdit(r: LeaveRecord) {
    setEditing(r);
    setForm({ employeeId: r.employeeId, employeeName: r.employeeName, leaveTypeId: r.leaveTypeId, leaveTypeName: r.leaveTypeName, leaveTypeColor: r.leaveTypeColor, startDate: r.startDate, endDate: r.endDate, days: r.days, notes: r.notes || '', status: r.status });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.employeeId || !form.leaveTypeId || !form.startDate || !form.endDate) {
      alert('Employee, Leave Type, Start Date and End Date are required.'); return;
    }
    setSaving(true);
    try {
      const url = editing ? `${API}/api/attendance/leave-records/${editing.id}` : `${API}/api/attendance/leave-records`;
      const res = await fetch(url, { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      await loadAll(); setShowModal(false);
    } catch (e: any) { alert(`Save failed: ${e.message}`); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Remove leave record for ${name}?`)) return;
    await fetch(`${API}/api/attendance/leave-records/${id}`, { method: 'DELETE' }).catch(e => alert(e.message));
    await loadAll();
  }

  async function handleStatusChange(id: string, status: LeaveRecord['status']) {
    const res = await fetch(`${API}/api/attendance/leave-records/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    const data = await res.json();
    if (data.success) setRecords(prev => prev.map(r => r.id === id ? { ...r, status } : r));
  }

  function onStartDate(s: string) {
    setForm(p => { const end = p.endDate && p.endDate >= s ? p.endDate : s; return { ...p, startDate: s, endDate: end, days: calcDays(s, end) }; });
  }
  function onEndDate(end: string) { setForm(p => ({ ...p, endDate: end, days: calcDays(p.startDate, end) })); }
  function calcDays(start: string, end: string) {
    if (!start || !end) return 1;
    return Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1);
  }

  // ─── Export Excel ─────────────────────────────────────────────────────────────

  async function handleExport() {
    setExporting(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Leave Report');

      let exportRecords = records;
      if (exportFrom) exportRecords = exportRecords.filter(r => r.startDate >= exportFrom);
      if (exportTo) exportRecords = exportRecords.filter(r => r.endDate <= exportTo);

      const uniqueEmpIds = [...new Set(exportRecords.map(r => r.employeeId))];
      const totalDays = exportRecords.filter(r => r.status !== 'cancelled').reduce((s, r) => s + r.days, 0);
      const rangeLabel = (exportFrom || exportTo) ? `${exportFrom || '...'} - ${exportTo || '...'}` : 'All Dates';

      // Title
      ws.mergeCells('A1:G1');
      const titleCell = ws.getCell('A1');
      titleCell.value = 'LEAVE REPORT';
      titleCell.font = { bold: true, size: 14 };
      titleCell.alignment = { horizontal: 'center' };

      // Summary
      ws.getCell('A3').value = 'Report Range'; ws.getCell('B3').value = rangeLabel; ws.getCell('A3').font = { bold: true };
      ws.getCell('A4').value = 'Total Employee'; ws.getCell('B4').value = uniqueEmpIds.length; ws.getCell('A4').font = { bold: true };
      ws.getCell('A5').value = 'Total Leave Taken'; ws.getCell('B5').value = `${totalDays} Days`; ws.getCell('A5').font = { bold: true };

      // Table header
      const headerRow = ws.getRow(7);
      ['Employee ID', 'Name', 'Leave Type', 'Start Date', 'End Date', 'Days', 'Note'].forEach((h, i) => {
        const cell = headerRow.getCell(i + 1);
        cell.value = h;
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      });

      // Group by employee
      const grouped = new Map<string, LeaveRecord[]>();
      exportRecords.forEach(r => { if (!grouped.has(r.employeeId)) grouped.set(r.employeeId, []); grouped.get(r.employeeId)!.push(r); });

      let rowIdx = 8;
      grouped.forEach(empRecords => {
        const emp = employees.find(e => e.id === empRecords[0].employeeId);
        empRecords.forEach((r, i) => {
          const row = ws.getRow(rowIdx);
          row.getCell(1).value = i === 0 ? (emp?.personId || r.employeeId) : '';
          row.getCell(2).value = i === 0 ? r.employeeName : '';
          row.getCell(3).value = r.leaveTypeName;
          row.getCell(4).value = r.startDate;
          row.getCell(5).value = r.endDate;
          row.getCell(6).value = r.days;
          row.getCell(7).value = r.notes || '';
          for (let c = 1; c <= 7; c++) row.getCell(c).border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
          rowIdx++;
        });
      });

      ws.columns = [{ width: 14 }, { width: 22 }, { width: 18 }, { width: 13 }, { width: 13 }, { width: 8 }, { width: 28 }];

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `Leave_Report_${exportFrom || 'all'}_${exportTo || 'all'}.xlsx`; a.click();
      URL.revokeObjectURL(url);
      setShowExport(false);
    } catch (e: any) { alert(`Export failed: ${e.message}`); }
    finally { setExporting(false); }
  }

  // ─── Leave Type CRUD ──────────────────────────────────────────────────────────

  function openAddLt() { setEditingLt(null); setLtForm(BLANK_LT_FORM); setShowLtForm(true); }
  function openEditLt(lt: LeaveType) {
    setEditingLt(lt);
    setLtForm({ name: lt.name, paidLeave: lt.paidLeave, daysPerYear: lt.daysPerYear, carryOver: lt.carryOver, requiresApproval: lt.requiresApproval, color: lt.color });
    setShowLtForm(true);
  }

  async function handleSaveLt() {
    if (!ltForm.name.trim()) { alert('Name is required'); return; }
    setSavingLt(true);
    try {
      const isNew = !editingLt;
      const res = await fetch(
        isNew ? `${API}/api/attendance/leave-types` : `${API}/api/attendance/leave-types/${editingLt!.id}`,
        { method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ltForm) }
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      await loadAll(); setShowLtForm(false); setEditingLt(null);
    } catch (e: any) { alert(`Save failed: ${e.message}`); }
    finally { setSavingLt(false); }
  }

  async function handleDeleteLt(id: string, name: string) {
    if (!confirm(`Delete leave type "${name}"?`)) return;
    await fetch(`${API}/api/attendance/leave-types/${id}`, { method: 'DELETE' }).catch(e => alert(e.message));
    await loadAll();
  }

  async function handleAssignLt(leaveTypeId: string, members: AssignedMember[]) {
    const lt = leaveTypes.find(l => l.id === leaveTypeId);
    if (!lt) return;
    const res = await fetch(`${API}/api/attendance/leave-types/${leaveTypeId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...lt, assignedTo: members }),
    });
    const data = await res.json();
    if (!data.success) { alert(`Assignment failed: ${data.error}`); return; }
    await loadAll(); setShowAssignModal(false); setAssigningLt(null);
  }

  // ─── Derived ──────────────────────────────────────────────────────────────────

  const filteredRecords = records.filter(r => {
    if (filterEmployee && !r.employeeName.toLowerCase().includes(filterEmployee.toLowerCase())) return false;
    if (filterLeaveType && r.leaveTypeId !== filterLeaveType) return false;
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    if (filterDateFrom && r.startDate < filterDateFrom) return false;
    if (filterDateTo && r.endDate > filterDateTo) return false;
    if (selectedEmpId && r.employeeId !== selectedEmpId) return false;
    return true;
  });

  const employeesWithRecords = employees
    .filter(e => records.some(r => r.employeeId === e.id))
    .filter(e => !empSearch ||
      e.name.toLowerCase().includes(empSearch.toLowerCase()) ||
      (e.personId && e.personId.toLowerCase().includes(empSearch.toLowerCase()))
    );

  const selectedEmp = selectedEmpId ? employees.find(e => e.id === selectedEmpId) : null;
  const selectedEmpActiveRecords = selectedEmpId
    ? records.filter(r => r.employeeId === selectedEmpId && r.status !== 'cancelled')
    : [];
  const selectedEmpDetail = leaveTypes.map(lt => {
    const taken = selectedEmpActiveRecords.filter(r => r.leaveTypeId === lt.id).reduce((s, r) => s + r.days, 0);
    const remaining = lt.daysPerYear > 0 ? Math.max(0, lt.daysPerYear - taken) : null;
    return { ...lt, taken, remaining };
  }).filter(lt => lt.taken > 0 || lt.daysPerYear > 0);

  // Export preview counts
  const exportPreviewRecords = records.filter(r =>
    (!exportFrom || r.startDate >= exportFrom) && (!exportTo || r.endDate <= exportTo)
  );
  const exportPreviewDays = exportPreviewRecords.filter(r => r.status !== 'cancelled').reduce((s, r) => s + r.days, 0);
  const exportPreviewEmps = new Set(exportPreviewRecords.map(r => r.employeeId)).size;

  if (!isAuthenticated) return null;

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Sidebar currentPath="/attendance/leave" onLogout={logout} />
      <div className="flex-1 lg:ml-64 p-6 lg:p-8">

        {/* ── Header ── */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <Link href="/" className="hover:text-blue-600">Dashboard</Link>
            <Icon path="M9 5l7 7-7 7" className="w-3 h-3" />
            <span className="text-gray-900 font-medium">Leave Management</span>
          </div>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-xl lg:text-2xl font-semibold text-gray-900 tracking-tight">Leave Management</h1>
              <p className="text-sm text-gray-500 mt-1">Manage leave records and configure leave types</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={loadAll} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 bg-white transition-colors">
                <Icon path="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" className="w-4 h-4" />
                Refresh
              </button>
              {pageTab === 'records' && (
                <>
                  <button onClick={() => setShowExport(true)} className="flex items-center gap-2 px-4 py-2 text-sm text-green-700 border border-green-200 bg-green-50 rounded-lg hover:bg-green-100 transition-colors">
                    <Icon path="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" className="w-4 h-4" />
                    Export Excel
                  </button>
                  <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors">
                    <Icon path="M12 4v16m8-8H4" className="w-4 h-4" />
                    Assign Leave
                  </button>
                </>
              )}
              {pageTab === 'leave-types' && (
                <button onClick={openAddLt} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors">
                  <Icon path="M12 4v16m8-8H4" className="w-4 h-4" />
                  Add Leave Type
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Page Tabs ── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-6">
          <nav className="flex border-b border-gray-100">
            {([
              { id: 'records' as PageTab, label: 'Leave Records', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
              { id: 'leave-types' as PageTab, label: 'Leave Types', icon: 'M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z' },
            ]).map(tab => (
              <button key={tab.id} onClick={() => setPageTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors ${pageTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                <Icon path={tab.icon} className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/*  LEAVE RECORDS TAB                                                     */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        {pageTab === 'records' && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Total Records', value: records.length, color: 'bg-blue-100 text-blue-700' },
                { label: 'Approved', value: records.filter(r => r.status === 'approved').length, color: 'bg-green-100 text-green-700' },
                { label: 'Taken', value: records.filter(r => r.status === 'taken').length, color: 'bg-indigo-100 text-indigo-700' },
                { label: 'Cancelled', value: records.filter(r => r.status === 'cancelled').length, color: 'bg-red-100 text-red-500' },
              ].map(c => (
                <div key={c.label} className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${c.color}`}>
                    <span className="text-lg font-bold">{c.value}</span>
                  </div>
                  <span className="text-sm text-gray-600 font-medium">{c.label}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">

              {/* ── Left: Employee selector ── */}
              <div className="xl:col-span-1 space-y-4">
                {/* Employee list */}
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <h3 className="text-sm font-semibold text-gray-900">Employees</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Click to view individual details</p>
                  </div>
                  <div className="px-3 py-2 border-b border-gray-100">
                    <input
                      type="text"
                      value={empSearch}
                      onChange={ev => setEmpSearch(ev.target.value)}
                      placeholder="Search by name or ID..."
                      className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                    />
                  </div>
                  <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
                    <button onClick={() => setSelectedEmpId(null)}
                      className={`w-full text-left px-4 py-3 text-sm transition-colors flex items-center gap-2 ${!selectedEmpId ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}>
                      <Icon path="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" className="w-4 h-4 flex-shrink-0" />
                      All Employees
                    </button>
                    {isLoading ? (
                      <div className="px-4 py-6 text-center">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                      </div>
                    ) : employeesWithRecords.length === 0 ? (
                      <p className="px-4 py-4 text-xs text-gray-400 text-center">No leave data yet</p>
                    ) : employeesWithRecords.map(e => {
                      const empDays = records.filter(r => r.employeeId === e.id && r.status !== 'cancelled').reduce((s, r) => s + r.days, 0);
                      return (
                        <button key={e.id} onClick={() => setSelectedEmpId(selectedEmpId === e.id ? null : e.id)}
                          className={`w-full text-left px-4 py-3 transition-colors ${selectedEmpId === e.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${selectedEmpId === e.id ? 'bg-blue-200 text-blue-800' : 'bg-gray-200 text-gray-600'}`}>
                              {e.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className={`font-medium text-sm truncate ${selectedEmpId === e.id ? 'text-blue-700' : 'text-gray-800'}`}>{e.name}</div>
                              <div className="text-xs text-gray-400">
                                {e.personId && <span className="mr-1">#{e.personId} ·</span>}
                                {empDays} day{empDays !== 1 ? 's' : ''} used
                              </div>
                            </div>
                            {selectedEmpId === e.id && (
                              <Icon path="M9 5l7 7-7 7" className="w-3 h-3 text-blue-500 flex-shrink-0" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* ── Employee Detail Panel ── */}
                {selectedEmp && (
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                    {/* Gradient header */}
                    <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                          {selectedEmp.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-white font-semibold text-sm">{selectedEmp.name}</div>
                          {selectedEmp.personId && <div className="text-blue-200 text-xs">ID: {selectedEmp.personId}</div>}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1 bg-white/10 rounded-lg px-3 py-2 text-center">
                          <div className="text-white font-bold text-xl leading-none">
                            {selectedEmpActiveRecords.reduce((s, r) => s + r.days, 0)}
                          </div>
                          <div className="text-blue-200 text-[10px] mt-0.5">Days Used</div>
                        </div>
                        <div className="flex-1 bg-white/10 rounded-lg px-3 py-2 text-center">
                          <div className="text-white font-bold text-xl leading-none">
                            {records.filter(r => r.employeeId === selectedEmpId).length}
                          </div>
                          <div className="text-blue-200 text-[10px] mt-0.5">Records</div>
                        </div>
                        <div className="flex-1 bg-white/10 rounded-lg px-3 py-2 text-center">
                          <div className="text-white font-bold text-xl leading-none">
                            {records.filter(r => r.employeeId === selectedEmpId && r.status === 'approved').length}
                          </div>
                          <div className="text-blue-200 text-[10px] mt-0.5">Pending</div>
                        </div>
                      </div>
                    </div>

                    {/* Leave breakdown by type */}
                    <div className="px-4 py-2.5 border-b border-gray-100">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Leave by Type</h4>
                    </div>
                    <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
                      {selectedEmpDetail.length === 0 ? (
                        <p className="px-4 py-4 text-xs text-gray-400 text-center">No leave records</p>
                      ) : selectedEmpDetail.map(lt => (
                        <div key={lt.id} className="px-4 py-3">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: lt.color }}></div>
                              <span className="text-xs font-medium text-gray-800 truncate">{lt.name}</span>
                            </div>
                            <span className="text-[10px] text-gray-400 flex-shrink-0 ml-1">{lt.paidLeave ? 'Paid' : 'Unpaid'}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-gray-500">
                              Taken: <span className="font-semibold text-gray-800">{lt.taken}d</span>
                              {lt.daysPerYear > 0 && <span className="text-gray-400"> / {lt.daysPerYear}d</span>}
                            </span>
                            {lt.remaining !== null ? (
                              <span className={`font-semibold ${lt.remaining === 0 ? 'text-red-500' : lt.remaining <= 3 ? 'text-amber-500' : 'text-green-600'}`}>
                                {lt.remaining}d left
                              </span>
                            ) : (
                              <span className="text-gray-400 text-[10px]">Unlimited</span>
                            )}
                          </div>
                          {lt.daysPerYear > 0 && (
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all"
                                style={{ width: `${Math.min(100, (lt.taken / lt.daysPerYear) * 100)}%`, backgroundColor: lt.taken >= lt.daysPerYear ? '#EF4444' : lt.color }} />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Right: Records table ── */}
              <div className="xl:col-span-3">
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
                  {/* Filters */}
                  <div className="p-4 border-b border-gray-100 flex flex-wrap gap-3 items-center">
                    <input type="text" placeholder="Search employee..." value={filterEmployee}
                      onChange={e => setFilterEmployee(e.target.value)}
                      className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-44" />
                    <select value={filterLeaveType} onChange={e => setFilterLeaveType(e.target.value)}
                      className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">All Leave Types</option>
                      {leaveTypes.map(lt => <option key={lt.id} value={lt.id}>{lt.name}</option>)}
                    </select>
                    <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as StatusFilter)}
                      className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="all">All Statuses</option>
                      <option value="approved">Approved</option>
                      <option value="taken">Taken</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                    <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
                      className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
                      className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    {(filterEmployee || filterLeaveType || filterStatus !== 'all' || filterDateFrom || filterDateTo || selectedEmpId) && (
                      <button onClick={() => { setFilterEmployee(''); setFilterLeaveType(''); setFilterStatus('all'); setFilterDateFrom(''); setFilterDateTo(''); setSelectedEmpId(null); }}
                        className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">Clear All</button>
                    )}
                    <span className="ml-auto text-xs text-gray-400">{filteredRecords.length} record{filteredRecords.length !== 1 ? 's' : ''}</span>
                  </div>

                  {isLoading ? (
                    <div className="flex items-center justify-center py-20">
                      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                    </div>
                  ) : filteredRecords.length === 0 ? (
                    <div className="text-center py-20 text-gray-400">
                      <Icon path="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p className="text-sm font-medium">No leave records found</p>
                      <p className="text-xs mt-1">Click &quot;Assign Leave&quot; to create the first record</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            <th className="text-left px-5 py-3">Employee</th>
                            <th className="text-left px-5 py-3">Leave Type</th>
                            <th className="text-left px-5 py-3">Period</th>
                            <th className="text-center px-5 py-3">Days</th>
                            <th className="text-left px-5 py-3">Status</th>
                            <th className="text-left px-5 py-3">Notes</th>
                            <th className="text-right px-5 py-3">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {filteredRecords.map(r => (
                            <tr key={r.id} className="group hover:bg-gray-50 transition-colors">
                              <td className="px-5 py-3 font-medium text-gray-900">{r.employeeName}</td>
                              <td className="px-5 py-3">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold text-white" style={{ backgroundColor: r.leaveTypeColor || '#3B82F6' }}>
                                  {r.leaveTypeName}
                                </span>
                              </td>
                              <td className="px-5 py-3 text-gray-600 text-xs">
                                {r.startDate === r.endDate ? r.startDate : `${r.startDate} → ${r.endDate}`}
                              </td>
                              <td className="px-5 py-3 text-center">
                                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">{r.days}</span>
                              </td>
                              <td className="px-5 py-3">
                                <select value={r.status} onChange={e => handleStatusChange(r.id, e.target.value as LeaveRecord['status'])}
                                  className={`px-2 py-1 rounded-full text-xs font-semibold border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 ${STATUS_COLORS[r.status]}`}>
                                  <option value="approved">Approved</option>
                                  <option value="taken">Taken</option>
                                  <option value="cancelled">Cancelled</option>
                                </select>
                              </td>
                              <td className="px-5 py-3 text-gray-400 text-xs max-w-[160px] truncate">{r.notes || '—'}</td>
                              <td className="px-5 py-3 text-right">
                                <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button onClick={() => openEdit(r)} title="Edit"
                                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                                    <Icon path="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => handleDelete(r.id, r.employeeName)} title="Delete"
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
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/*  LEAVE TYPES TAB                                                       */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        {pageTab === 'leave-types' && (
          <>
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
              </div>
            ) : leaveTypes.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm text-center py-20 text-gray-400">
                <Icon path="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">No leave types configured</p>
                <p className="text-xs mt-1 mb-4">Create leave types like Annual Leave, Sick Leave, etc.</p>
                <button onClick={openAddLt} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
                  Add First Leave Type
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {leaveTypes.map(lt => {
                  const usedDays = records.filter(r => r.leaveTypeId === lt.id && r.status !== 'cancelled').reduce((s, r) => s + r.days, 0);
                  return (
                    <div key={lt.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                      <div className="h-1.5" style={{ backgroundColor: lt.color }} />
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: lt.color + '22' }}>
                              <svg className="w-5 h-5" style={{ color: lt.color }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                            <div>
                              <h3 className="font-semibold text-gray-900 text-sm">{lt.name}</h3>
                              <p className="text-xs text-gray-400">{lt.daysPerYear > 0 ? `${lt.daysPerYear} days/year` : 'Unlimited'}</p>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => openEditLt(lt)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                              <Icon path="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDeleteLt(lt.id, lt.name)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                              <Icon path="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1.5 mb-3">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${lt.paidLeave ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                            {lt.paidLeave ? 'Paid' : 'Unpaid'}
                          </span>
                          {lt.carryOver && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-100 text-purple-700">Carry Over</span>}
                          {lt.requiresApproval && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700">Needs Approval</span>}
                        </div>

                        <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                          <span>Used this period</span>
                          <span className="font-semibold text-gray-700">{usedDays} day{usedDays !== 1 ? 's' : ''}</span>
                        </div>

                        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                          <span className="text-xs text-gray-500">
                            {!lt.assignedTo || lt.assignedTo.length === 0
                              ? 'All employees'
                              : `${lt.assignedTo.length} assignment${lt.assignedTo.length !== 1 ? 's' : ''}`}
                          </span>
                          <button onClick={() => { setAssigningLt(lt); setShowAssignModal(true); }}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                            Manage assignments →
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/*  ASSIGN / EDIT RECORD MODAL                                            */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="px-6 py-5 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl">
                <h2 className="text-lg font-semibold text-gray-900">{editing ? 'Edit Leave Record' : 'Assign Leave'}</h2>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Employee <span className="text-red-500">*</span></label>
                  <SearchableSelect options={employees} value={form.employeeId}
                    onChange={(id, name) => setForm(p => ({ ...p, employeeId: id, employeeName: name }))}
                    placeholder="Search and select employee..." />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Leave Type <span className="text-red-500">*</span></label>
                  {leaveTypes.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-gray-500 bg-yellow-50 border border-yellow-200 rounded-lg">
                      No leave types. Go to the <button onClick={() => { setShowModal(false); setPageTab('leave-types'); }} className="text-blue-600 underline">Leave Types tab</button> to add one.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {leaveTypes.map(lt => (
                        <button key={lt.id} onClick={() => setForm(p => ({ ...p, leaveTypeId: lt.id, leaveTypeName: lt.name, leaveTypeColor: lt.color }))}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 text-left transition-colors ${form.leaveTypeId === lt.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: lt.color }}></div>
                          <div>
                            <div className="font-medium text-gray-900 text-xs">{lt.name}</div>
                            <div className="text-[11px] text-gray-400">{lt.paidLeave ? 'Paid' : 'Unpaid'} · {lt.daysPerYear > 0 ? `${lt.daysPerYear}d/yr` : 'Unlimited'}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Start Date <span className="text-red-500">*</span></label>
                    <input type="date" value={form.startDate} onChange={e => onStartDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">End Date <span className="text-red-500">*</span></label>
                    <input type="date" value={form.endDate} min={form.startDate} onChange={e => onEndDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                {form.startDate && form.endDate && (
                  <div className="flex items-center gap-2.5 bg-blue-50 rounded-lg px-3 py-2.5">
                    <Icon path="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    <span className="text-sm text-blue-700"><strong>{form.days}</strong> day{form.days !== 1 ? 's' : ''} assigned</span>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Status</label>
                  <div className="flex gap-2">
                    {(['approved', 'taken', 'cancelled'] as const).map(s => (
                      <button key={s} onClick={() => setForm(p => ({ ...p, status: s }))}
                        className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors capitalize ${form.status === s ? `${STATUS_COLORS[s]} ring-2 ring-offset-1 ring-current` : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Notes</label>
                  <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                    placeholder="Optional notes..." rows={2}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-200 flex gap-2 justify-end sticky bottom-0 bg-white rounded-b-2xl">
                <button onClick={() => { setShowModal(false); setEditing(null); }}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={handleSave} disabled={saving}
                  className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
                  {saving && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {editing ? 'Save Changes' : 'Assign Leave'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/*  EXPORT MODAL                                                          */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        {showExport && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
              <div className="px-6 py-5 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Icon path="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" className="w-5 h-5 text-green-600" />
                  Export Leave Report
                </h2>
                <p className="text-xs text-gray-500 mt-1">Download a formatted Excel (.xlsx) report</p>
              </div>
              <div className="px-6 py-5 space-y-4">
                {/* Live preview */}
                <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                  <div className="bg-gray-200 px-4 py-2 text-xs font-bold text-gray-600 uppercase tracking-wide text-center">
                    Leave Report Preview
                  </div>
                  <div className="p-4 space-y-1.5 text-xs text-gray-700">
                    <div className="flex gap-3"><span className="font-bold w-36">Report Range</span><span>{(exportFrom || exportTo) ? `${exportFrom || '...'} - ${exportTo || '...'}` : 'All Dates'}</span></div>
                    <div className="flex gap-3"><span className="font-bold w-36">Total Employee</span><span>{exportPreviewEmps}</span></div>
                    <div className="flex gap-3"><span className="font-bold w-36">Total Leave Taken</span><span>{exportPreviewDays} Days</span></div>
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <div className="grid grid-cols-7 gap-1 text-[10px] font-bold text-gray-500 uppercase">
                        <span>EMP ID</span><span className="col-span-2">NAME</span><span>LEAVE TYPE</span><span>START</span><span>END</span><span>DAYS</span>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1 italic">Records grouped by employee...</p>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">From Date</label>
                    <input type="date" value={exportFrom} onChange={e => setExportFrom(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">To Date</label>
                    <input type="date" value={exportTo} onChange={e => setExportTo(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <p className="text-xs text-gray-400">Leave both dates empty to export all records.</p>
              </div>
              <div className="px-6 py-4 border-t border-gray-200 flex gap-2 justify-end">
                <button onClick={() => setShowExport(false)}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={handleExport} disabled={exporting}
                  className="px-5 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60 flex items-center gap-2">
                  {exporting
                    ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <Icon path="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" className="w-4 h-4" />}
                  Download Excel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/*  ADD / EDIT LEAVE TYPE MODAL                                           */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        {showLtForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
              <div className="px-6 py-5 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">{editingLt ? 'Edit Leave Type' : 'Add Leave Type'}</h2>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Name <span className="text-red-500">*</span></label>
                  <input type="text" value={ltForm.name} onChange={e => setLtForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Annual Leave, Sick Leave..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Color</label>
                  <div className="flex items-center gap-3">
                    <div className="flex gap-2 flex-wrap">
                      {PRESET_COLORS.map(c => (
                        <button key={c} onClick={() => setLtForm(p => ({ ...p, color: c }))}
                          className={`w-7 h-7 rounded-full transition-all ${ltForm.color === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-105'}`}
                          style={{ backgroundColor: c }} />
                      ))}
                    </div>
                    <input type="color" value={ltForm.color} onChange={e => setLtForm(p => ({ ...p, color: e.target.value }))}
                      className="w-8 h-8 rounded border border-gray-200 cursor-pointer" title="Custom colour" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Days Per Year</label>
                    <input type="number" min={0} value={ltForm.daysPerYear} onChange={e => setLtForm(p => ({ ...p, daysPerYear: +e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <p className="text-[10px] text-gray-400 mt-1">0 = unlimited</p>
                  </div>
                  <div className="space-y-3 pt-1">
                    {([
                      { key: 'paidLeave', label: 'Paid Leave' },
                      { key: 'carryOver', label: 'Carry Over' },
                      { key: 'requiresApproval', label: 'Requires Approval' },
                    ] as { key: keyof Omit<LeaveType, 'id' | 'name' | 'color' | 'assignedTo'>; label: string }[]).map(({ key, label }) => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={ltForm[key] as boolean}
                          onChange={e => setLtForm(p => ({ ...p, [key]: e.target.checked }))}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500" />
                        <span className="text-xs text-gray-700">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-200 flex gap-2 justify-end">
                <button onClick={() => { setShowLtForm(false); setEditingLt(null); }}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={handleSaveLt} disabled={savingLt}
                  className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
                  {savingLt && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {editingLt ? 'Save Changes' : 'Add Leave Type'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Leave Assign Modal */}
        <LeaveAssignModal
          show={showAssignModal}
          leaveType={assigningLt}
          onSave={handleAssignLt}
          onClose={() => { setShowAssignModal(false); setAssigningLt(null); }}
        />

      </div>
    </div>
  );
}
