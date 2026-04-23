'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSocket } from '@/context/SocketContext';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar from '@/components/Sidebar';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SyncStats {
  total: number;
  pending: number;
  sending: number;
  success: number;
  failed: number;
  queued_offline: number;
  unique_persons?: number;
  unique_devices?: number;
}

interface AccessRule {
  id: string;
  name: string;
  employeeGroupIds: string[];
  personIds: string[];
  deviceIds: string[];
  createdAt: string;
  updatedAt: string;
  syncStats?: SyncStats;
}

interface EmployeeGroup {
  id: string;
  name: string;
  parentId: string | null;
  isDefault?: boolean;
}

interface Employee {
  id: string;
  personId: string;
  name: string;
  department?: string;
}

interface Device {
  deviceId: string;
  name: string;
  ip: string;
  registrationId: string;
  status?: 'online' | 'offline';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function apiFetch(path: string, options?: RequestInit) {
  const token = localStorage.getItem('auth_token');
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers || {}),
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ─── Sync Progress Bar ───────────────────────────────────────────────────────

function SyncProgressBar({ stats }: { stats: SyncStats }) {
  const { total, success, failed, sending, pending, queued_offline, unique_persons, unique_devices } = stats;
  if (total === 0) return <span className="text-xs text-gray-400">No jobs</span>;

  const successPct = (success / total) * 100;
  const failedPct = (failed / total) * 100;
  const sendingPct = (sending / total) * 100;
  const waitingPct = ((pending + queued_offline) / total) * 100;

  // Build a human-readable summary line
  const parts: string[] = [];
  if (unique_persons != null) parts.push(`${unique_persons} employee${unique_persons !== 1 ? 's' : ''}`);
  if (unique_devices != null) parts.push(`${unique_devices} device${unique_devices !== 1 ? 's' : ''}`);
  const contextLabel = parts.length ? parts.join(' · ') + ' · ' : '';

  const statusParts: string[] = [];
  if (success > 0) statusParts.push(`${success} synced`);
  if (sending > 0) statusParts.push(`${sending} sending`);
  if (failed > 0) statusParts.push(`${failed} failed`);
  if (queued_offline > 0) statusParts.push(`${queued_offline} offline`);
  if (pending > 0 && sending === 0) statusParts.push(`${pending} pending`);
  const statusLabel = statusParts.join(' · ') || 'waiting';

  return (
    <div className="mt-2">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-gray-500">
          {contextLabel}{statusLabel}
        </span>
        {sending > 0 && (
          <span className="text-xs text-blue-600 font-medium animate-pulse">Syncing…</span>
        )}
      </div>
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden flex">
        <div className="h-full bg-green-500 transition-all duration-500" style={{ width: `${successPct}%` }} />
        <div className="h-full bg-red-400 transition-all duration-500" style={{ width: `${failedPct}%` }} />
        <div className="h-full bg-blue-400 animate-pulse transition-all duration-500" style={{ width: `${sendingPct}%` }} />
        <div className="h-full bg-amber-200 transition-all duration-500" style={{ width: `${waitingPct}%` }} />
      </div>
      <div className="flex gap-3 mt-1">
        {success > 0 && <span className="flex items-center gap-1 text-xs text-gray-500"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Done</span>}
        {failed > 0 && <span className="flex items-center gap-1 text-xs text-gray-500"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />Failed</span>}
        {(pending + queued_offline) > 0 && <span className="flex items-center gap-1 text-xs text-gray-500"><span className="w-2 h-2 rounded-full bg-amber-300 inline-block" />Waiting</span>}
      </div>
    </div>
  );
}

// ─── Group Tree View ──────────────────────────────────────────────────────────

function GroupTreeNode({
  group,
  groups,
  groupIds,
  onToggle,
  depth,
}: {
  group: EmployeeGroup;
  groups: EmployeeGroup[];
  groupIds: string[];
  onToggle: (id: string) => void;
  depth: number;
}) {
  const children = groups.filter(g => g.parentId === group.id && !g.isDefault);
  const checked = groupIds.includes(group.id);

  return (
    <div>
      <label
        className={`flex items-center gap-3 px-3 py-2 hover:bg-blue-50 cursor-pointer ${checked ? 'bg-blue-50/60' : ''}`}
        style={{ paddingLeft: `${12 + depth * 20}px` }}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onToggle(group.id)}
          className="accent-blue-600 w-4 h-4 flex-shrink-0"
        />
        {depth > 0 && (
          <span className="text-gray-300 text-xs mr-0.5">└</span>
        )}
        <span className="text-sm text-gray-800 flex-1">{group.name}</span>
        {group.isDefault && (
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Default</span>
        )}
        {children.length > 0 && (
          <span className="text-xs text-gray-400">{children.length} sub</span>
        )}
      </label>
      {children.map(child => (
        <GroupTreeNode
          key={child.id}
          group={child}
          groups={groups}
          groupIds={groupIds}
          onToggle={onToggle}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}

// ─── Rule Editor Panel ────────────────────────────────────────────────────────

function RuleEditor({
  rule,
  groups,
  employees,
  devices,
  onSave,
  onCancel,
}: {
  rule: Partial<AccessRule> | null;
  groups: EmployeeGroup[];
  employees: Employee[];
  devices: Device[];
  onSave: (r: Partial<AccessRule>) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(rule?.name ?? '');
  const [groupIds, setGroupIds] = useState<string[]>(rule?.employeeGroupIds ?? []);
  const [personIds, setPersonIds] = useState<string[]>(rule?.personIds ?? []);
  const [deviceIds, setDeviceIds] = useState<string[]>(rule?.deviceIds ?? []);
  const [tab, setTab] = useState<'who' | 'where'>('who');
  const [personSearch, setPersonSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleGroup = (id: string) => {
    if (id === 'all') {
      // "All Person" — if toggling on, select every group; if toggling off, deselect all
      const allIds = groups.map(g => g.id);
      const allSelected = allIds.every(gid => groupIds.includes(gid));
      setGroupIds(allSelected ? [] : allIds);
    } else {
      setGroupIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    }
  };
  const togglePerson = (id: string) =>
    setPersonIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleDevice = (id: string) =>
    setDeviceIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const filteredEmployees = employees.filter(e =>
    !personSearch ||
    (e.name || '').toLowerCase().includes(personSearch.toLowerCase()) ||
    (e.personId || '').toLowerCase().includes(personSearch.toLowerCase())
  );

  async function handleSave() {
    if (!name.trim()) { setError('Rule name is required'); return; }
    setSaving(true); setError('');
    try {
      await onSave({ ...rule, name: name.trim(), employeeGroupIds: groupIds, personIds, deviceIds });
    } catch (e: any) {
      setError(e.message || 'Save failed');
      setSaving(false);
    }
  }

  const offlineSelected = deviceIds.some(id => devices.find(d => d.registrationId === id)?.status !== 'online');

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-800">
          {rule?.id ? 'Edit Rule' : 'New Access Rule'}
        </h2>
        <button onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-600 rounded">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Rule name */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Rule Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. All Staff → Main Gate"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          {(['who', 'where'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium ${
                tab === t ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'who' ? '👥 Who' : '📍 Where'}
            </button>
          ))}
        </div>

        {tab === 'who' && (
          <div className="space-y-4">
            {/* Employee Groups */}
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Employee Groups</p>
              {groups.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No groups found</p>
              ) : (
                <div className="border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100 max-h-56 overflow-y-auto">
                  {/* Root nodes: the default "All Person" + any root-level groups */}
                  {groups.filter(g => g.isDefault || g.parentId === null || g.parentId === undefined).map(g => (
                    <GroupTreeNode
                      key={g.id}
                      group={g}
                      groups={groups}
                      groupIds={groupIds}
                      onToggle={toggleGroup}
                      depth={0}
                    />
                  ))}
                  {/* Any groups whose parent isn't in our list (orphaned) */}
                  {groups.filter(g => !g.isDefault && g.parentId !== null && g.parentId !== undefined && !groups.find(p => p.id === g.parentId)).map(g => (
                    <GroupTreeNode
                      key={g.id}
                      group={g}
                      groups={groups}
                      groupIds={groupIds}
                      onToggle={toggleGroup}
                      depth={0}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Individual Employees */}
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Individual Employees</p>
              <input
                value={personSearch}
                onChange={e => setPersonSearch(e.target.value)}
                placeholder="Search by name or ID…"
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
              />
              {filteredEmployees.length === 0 ? (
                <p className="text-sm text-gray-400 italic">{personSearch ? 'No matches' : 'No employees found'}</p>
              ) : (
                <div className="border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100 max-h-48 overflow-y-auto">
                  {filteredEmployees.map(e => (
                    <label key={e.personId} className="flex items-center gap-3 px-3 py-2 hover:bg-blue-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={personIds.includes(e.personId)}
                        onChange={() => togglePerson(e.personId)}
                        className="accent-blue-600 w-4 h-4 flex-shrink-0"
                      />
                      <span className="text-sm text-gray-800 flex-1">{e.name}</span>
                      <span className="text-xs text-gray-400">{e.personId}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'where' && (
          <div>
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Devices</p>
            {devices.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No devices found</p>
            ) : (
              <div className="border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100 max-h-72 overflow-y-auto">
                {devices.map(d => (
                  <label key={d.registrationId} className={`flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-blue-50 cursor-pointer ${deviceIds.includes(d.registrationId) ? 'bg-blue-50/50' : ''}`}>
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={deviceIds.includes(d.registrationId)}
                        onChange={() => toggleDevice(d.registrationId)}
                        className="accent-blue-600 w-4 h-4 flex-shrink-0"
                      />
                      <div>
                        <span className="text-sm text-gray-800 font-medium">{d.name}</span>
                        <span className="ml-2 text-xs text-gray-400">{d.ip}</span>
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      d.status === 'online'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {d.status === 'online' ? 'Online' : 'Offline'}
                    </span>
                  </label>
                ))}
              </div>
            )}
            {offlineSelected && (
              <div className="mt-2 flex items-start gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                <svg className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                <p className="text-xs text-amber-700">Some selected devices are offline. Sync will be queued and retried automatically when they come online.</p>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-gray-200 flex gap-2 justify-end bg-gray-50">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg border border-gray-200 hover:border-gray-300 bg-white"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 shadow-sm"
        >
          {saving ? 'Saving…' : rule?.id ? 'Save Changes' : 'Create Rule'}
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const DEFAULT_GROUP: EmployeeGroup = { id: 'all', name: 'All Person', parentId: null, isDefault: true };

export default function AccessControlPage() {
  const { socket } = useSocket();
  const { logout } = useAuth();

  const [rules, setRules] = useState<AccessRule[]>([]);
  const [groups, setGroups] = useState<EmployeeGroup[]>([DEFAULT_GROUP]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRule, setSelectedRule] = useState<Partial<AccessRule> | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [resyncId, setResyncId] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Auto-fetch settings
  const [autoFetchConfig, setAutoFetchConfig] = useState<{
    enabled: boolean; delaySeconds: number; offsetBeforeOfflineSeconds: number;
  } | null>(null);
  const [autoFetchSaving, setAutoFetchSaving] = useState(false);
  const [showAutoFetchSettings, setShowAutoFetchSettings] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [rulesData, devicesData, employeesData, groupsData, autoFetchData] = await Promise.all([
        apiFetch('/api/access-rules'),
        apiFetch('/api/devices'),
        apiFetch('/api/employees').catch(() => ({ employees: [] })),
        apiFetch('/api/employees/groups').catch(() => ({ groups: [] })),
        apiFetch('/api/settings/auto-fetch').catch(() => null),
      ]);
      setRules(rulesData.rules || []);

      // Build device list — normalize status to lowercase
      const deviceList: Device[] = (devicesData.devices || []).map((d: any) => ({
        deviceId: d.deviceId,
        name: d.name,
        ip: d.ip,
        registrationId: d.registrationId,
        status: (d.status || 'offline').toLowerCase() as 'online' | 'offline',
      }));
      setDevices(deviceList);

      // GET /api/employees returns { data: [...] }
      const empList: Employee[] = ((employeesData.data || employeesData.employees) || []).map((e: any) => ({
        id: e.id || e.personId,
        personId: e.personId || e.id,
        name: e.name,
        department: e.department,
      }));
      setEmployees(empList);

      // Always include the virtual "All Person" default group
      const apiGroups: EmployeeGroup[] = (groupsData.groups || []).filter((g: EmployeeGroup) => g.id !== 'all');
      setGroups([DEFAULT_GROUP, ...apiGroups]);

      if (autoFetchData?.config) {
        setAutoFetchConfig(autoFetchData.config);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  const saveAutoFetchConfig = async (updates: Partial<typeof autoFetchConfig>) => {
    setAutoFetchSaving(true);
    try {
      const data = await apiFetch('/api/settings/auto-fetch', {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      if (data.config) setAutoFetchConfig(data.config);
    } catch (e: any) {
      setError(e.message || 'Failed to save auto-fetch settings');
    } finally {
      setAutoFetchSaving(false);
    }
  };

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (!socket) return;
    const handler = () => loadAll();
    socket.on('sync:queue:updated', handler);
    socket.on('device:status:changed', handler);
    return () => {
      socket.off('sync:queue:updated', handler);
      socket.off('device:status:changed', handler);
    };
  }, [socket, loadAll]);

  async function handleSave(ruleData: Partial<AccessRule>) {
    if (ruleData.id) {
      await apiFetch(`/api/access-rules/${ruleData.id}`, { method: 'PUT', body: JSON.stringify(ruleData) });
    } else {
      await apiFetch('/api/access-rules', { method: 'POST', body: JSON.stringify(ruleData) });
    }
    setShowEditor(false);
    setSelectedRule(null);
    await loadAll();
  }

  async function handleDelete(id: string) {
    await apiFetch(`/api/access-rules/${id}`, { method: 'DELETE' });
    setDeleteId(null);
    await loadAll();
  }

  async function handleResync(id: string, force = false) {
    setResyncId(id);
    try {
      const url = `/api/access-rules/${id}/resync${force ? '?force=true' : ''}`;
      const data = await apiFetch(url, { method: 'POST' });
      if (data.queued === 0 && !force) {
        // All employees already confirmed on all devices — tell the user
        alert(`✅ All employees are already synced to all devices.\n\nIf a device was wiped or replaced, use "Force Re-sync" to re-send everyone.`);
      }
      await loadAll();
    } finally {
      setResyncId(null);
    }
  }

  function getSyncBadge(stats?: SyncStats) {
    if (!stats || stats.total === 0) return null;
    const { sending, failed, pending, queued_offline } = stats;
    if (sending > 0) return <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium animate-pulse">Syncing…</span>;
    if (failed > 0) return <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">{failed} failed</span>;
    if (pending + queued_offline > 0) return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">{pending + queued_offline} pending</span>;
    return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">✓ Synced</span>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Sidebar currentPath="/access-control" onLogout={logout} />

      <div className="lg:ml-64 pt-16 lg:pt-0">
        <div className="p-4 sm:p-6 lg:p-8">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Access Rules</h1>
              <p className="text-gray-500 text-sm mt-1">Define who can access which devices</p>
            </div>
            <div className="flex gap-2">
              {/* Auto-fetch settings toggle */}
              <button
                onClick={() => setShowAutoFetchSettings(prev => !prev)}
                title="Auto-fetch settings"
                className={`inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border shadow-sm transition-colors ${
                  showAutoFetchSettings
                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Auto-fetch
                {autoFetchConfig && (
                  <span className={`w-1.5 h-1.5 rounded-full ${autoFetchConfig.enabled ? 'bg-green-500' : 'bg-gray-400'}`} />
                )}
              </button>
              <Link
                href="/access-control/sync-status"
                className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white text-gray-600 hover:text-gray-900 hover:border-gray-300 shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                Sync Status
              </Link>
              <button
                onClick={() => { setSelectedRule({}); setShowEditor(true); }}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                New Rule
              </button>
            </div>
          </div>

          {/* Auto-fetch settings panel */}
          {showAutoFetchSettings && autoFetchConfig && (
            <div className="mb-5 bg-white rounded-2xl border border-blue-100 shadow-sm p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                  <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 text-sm">Auto-fetch Offline Records</h3>
                  <p className="text-xs text-gray-500">When a device comes back online, automatically fetch records missed while it was offline.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Enable/disable toggle */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200">
                  <div>
                    <div className="text-sm font-medium text-gray-700">Enabled</div>
                    <div className="text-xs text-gray-400">Fetch on device reconnect</div>
                  </div>
                  <button
                    onClick={() => saveAutoFetchConfig({ enabled: !autoFetchConfig.enabled })}
                    disabled={autoFetchSaving}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      autoFetchConfig.enabled ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      autoFetchConfig.enabled ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>
                {/* Delay before fetching */}
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                  <div className="text-sm font-medium text-gray-700 mb-1">Delay before fetch</div>
                  <div className="text-xs text-gray-400 mb-2">Seconds to wait after device comes online</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={60}
                      value={autoFetchConfig.delaySeconds}
                      onChange={e => setAutoFetchConfig(prev => prev ? { ...prev, delaySeconds: Number(e.target.value) } : prev)}
                      onBlur={() => saveAutoFetchConfig({ delaySeconds: autoFetchConfig.delaySeconds })}
                      className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                    <span className="text-xs text-gray-500">seconds</span>
                  </div>
                </div>
                {/* Buffer before offline */}
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                  <div className="text-sm font-medium text-gray-700 mb-1">Buffer before disconnect</div>
                  <div className="text-xs text-gray-400 mb-2">Start fetching from N seconds before device went offline</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={300}
                      value={autoFetchConfig.offsetBeforeOfflineSeconds}
                      onChange={e => setAutoFetchConfig(prev => prev ? { ...prev, offsetBeforeOfflineSeconds: Number(e.target.value) } : prev)}
                      onBlur={() => saveAutoFetchConfig({ offsetBeforeOfflineSeconds: autoFetchConfig.offsetBeforeOfflineSeconds })}
                      className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                    <span className="text-xs text-gray-500">seconds</span>
                  </div>
                </div>
              </div>
              {autoFetchSaving && (
                <p className="text-xs text-blue-500 mt-2 flex items-center gap-1">
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  Saving…
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
          )}

          {/* Content area */}
          <div className="flex gap-5">
            {/* Rules list */}
            <div className={`flex-1 min-w-0 ${showEditor ? 'hidden lg:block' : ''}`}>
              {loading ? (
                <div className="flex items-center justify-center h-48 text-gray-400">
                  <svg className="w-6 h-6 animate-spin mr-2" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  Loading…
                </div>
              ) : rules.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-12 flex flex-col items-center text-center">
                  <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                  </div>
                  <h3 className="text-gray-700 font-semibold mb-1">No access rules yet</h3>
                  <p className="text-gray-400 text-sm mb-4">Create a rule to control which employees can access which devices.</p>
                  <button
                    onClick={() => { setSelectedRule({}); setShowEditor(true); }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium"
                  >
                    Create First Rule
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {rules.map(rule => {
                    const ruleDevices = devices.filter(d => rule.deviceIds.includes(d.registrationId));
                    const onlineCount = ruleDevices.filter(d => d.status === 'online').length;
                    return (
                      <div key={rule.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 hover:border-blue-200 hover:shadow-md transition-all">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            {/* Title row */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-gray-900">{rule.name}</h3>
                              {getSyncBadge(rule.syncStats)}
                            </div>

                            {/* Subtitle */}
                            <div className="mt-1.5 flex flex-wrap gap-4 text-sm text-gray-500">
                              <span className="flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                                {rule.employeeGroupIds.length} group{rule.employeeGroupIds.length !== 1 ? 's' : ''}
                                {rule.personIds.length > 0 && `, ${rule.personIds.length} individual${rule.personIds.length !== 1 ? 's' : ''}`}
                              </span>
                              <span className="flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                {ruleDevices.length} device{ruleDevices.length !== 1 ? 's' : ''}
                                {ruleDevices.length > 0 && (
                                  <span className={onlineCount > 0 ? 'text-green-600' : 'text-gray-400'}>
                                    {' '}({onlineCount} online)
                                  </span>
                                )}
                              </span>
                            </div>

                            {/* Device chips */}
                            {ruleDevices.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {ruleDevices.slice(0, 5).map(d => (
                                  <span key={d.deviceId} className={`text-xs px-2 py-0.5 rounded-full border ${
                                    d.status === 'online'
                                      ? 'bg-green-50 text-green-700 border-green-200'
                                      : 'bg-gray-50 text-gray-500 border-gray-200'
                                  }`}>
                                    {d.name}
                                  </span>
                                ))}
                                {ruleDevices.length > 5 && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                                    +{ruleDevices.length - 5} more
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Progress bar */}
                            {rule.syncStats && rule.syncStats.total > 0 && (
                              <SyncProgressBar stats={rule.syncStats} />
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {/* Re-sync dropdown */}
                            <div className="relative group">
                              <button
                                onClick={() => handleResync(rule.id)}
                                disabled={resyncId === rule.id}
                                title="Re-sync missing only"
                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                              >
                                <svg className={`w-4 h-4 ${resyncId === rule.id ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                              </button>
                              {/* Hover tooltip with force option */}
                              <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-20 hidden group-hover:block">
                                <button
                                  onClick={() => handleResync(rule.id, false)}
                                  disabled={resyncId === rule.id}
                                  className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 flex items-start gap-2"
                                >
                                  <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                  <div>
                                    <div className="font-medium">Smart Re-sync</div>
                                    <div className="text-xs text-gray-400">Only send missing employees</div>
                                  </div>
                                </button>
                                <button
                                  onClick={() => handleResync(rule.id, true)}
                                  disabled={resyncId === rule.id}
                                  className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-700 flex items-start gap-2"
                                >
                                  <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                  <div>
                                    <div className="font-medium">Force Re-sync</div>
                                    <div className="text-xs text-gray-400">Re-send everyone (device wiped?)</div>
                                  </div>
                                </button>
                              </div>
                            </div>
                            <button
                              onClick={() => { setSelectedRule(rule); setShowEditor(true); }}
                              title="Edit"
                              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            <button
                              onClick={() => setDeleteId(rule.id)}
                              title="Delete"
                              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Editor panel */}
            {showEditor && (
              <div className="flex-shrink-0 w-full lg:w-[400px] bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100vh - 8rem)' }}>
                <RuleEditor
                  rule={selectedRule}
                  groups={groups}
                  employees={employees}
                  devices={devices}
                  onSave={handleSave}
                  onCancel={() => { setShowEditor(false); setSelectedRule(null); }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete confirm modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full border border-gray-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              </div>
              <h3 className="text-base font-semibold text-gray-900">Delete Rule?</h3>
            </div>
            <p className="text-sm text-gray-500 mb-5">This will remove the rule and queue delete operations for all persons on assigned devices. This cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg border border-gray-200 hover:border-gray-300 bg-white">Cancel</button>
              <button onClick={() => handleDelete(deleteId)} className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium shadow-sm">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
