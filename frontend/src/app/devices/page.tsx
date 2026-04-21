'use client';

import { useState, useEffect, useRef } from 'react';
import { useSocket } from '@/context/SocketContext';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar from '@/components/Sidebar';
import DeviceModal from '@/components/DeviceModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, Edit, Trash2, Wifi, WifiOff, Search, RefreshCw } from 'lucide-react';

const Icon = ({ path, className = 'w-5 h-5' }: { path: string; className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d={path} />
  </svg>
);

interface DeviceGroup {
  id: string;
  name: string;
  parentId: string | null;
  isDefault?: boolean;
}

interface Device {
  deviceId: string;
  name: string;
  registrationId: string;
  username: string;
  password: string;
  ip: string;
  serial: string;
  groupId?: string;
  createdAt: string;
  updatedAt: string;
  status?: 'online' | 'offline';
}

// ─── TreeDropdown (must be outside main component to avoid remount on re-render) ──

type HierarchicalGroup = DeviceGroup & { level: number };

function TreeDropdown({
  value,
  onChange,
  label,
  groups,
  hierarchicalGroups,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  groups: DeviceGroup[];
  hierarchicalGroups: HierarchicalGroup[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">{label}</label>
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-left flex items-center justify-between text-sm text-gray-700 hover:border-gray-300 transition-colors"
      >
        <span className="text-gray-900">
          {groups.find(g => g.id === value)?.name || 'Select...'}
        </span>
        <Icon className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} path="M19 9l-7 7-7-7" />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          <div className="p-3">
            {hierarchicalGroups.map((group, index) => {
              const isSelected = value === group.id;
              return (
                <div key={group.id} className="relative">
                  <div className="flex items-center">
                    {/* Dotted tree lines container */}
                    <div className="flex-shrink-0 relative" style={{ width: `${group.level * 24}px`, height: '32px' }}>
                      {Array.from({ length: group.level }).map((_, levelIdx) => {
                        const hasSiblingBelow = hierarchicalGroups.slice(index + 1).some(g => g.level === levelIdx);
                        return (
                          <span key={levelIdx}>
                            {hasSiblingBelow && (
                              <div className="absolute top-0 bottom-0" style={{ left: `${levelIdx * 24}px`, width: '1px', borderLeft: '2px dotted #d1d5db' }} />
                            )}
                            {levelIdx === group.level - 1 && (
                              <div className="absolute" style={{ top: '50%', left: `${levelIdx * 24}px`, width: '24px', borderTop: '2px dotted #d1d5db' }} />
                            )}
                            {levelIdx === group.level - 1 && (
                              <div className="absolute rounded-full bg-gray-300" style={{ top: 'calc(50% - 2px)', left: `${levelIdx * 24 - 2}px`, width: '4px', height: '4px' }} />
                            )}
                          </span>
                        );
                      })}
                    </div>
                    {/* Clickable row */}
                    <button
                      type="button"
                      onClick={() => { onChange(group.id); setIsOpen(false); }}
                      className={`flex-1 flex items-center py-1.5 px-2 rounded-md transition-colors ${isSelected ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'}`}
                    >
                      {group.level > 0 && <div className="w-1.5 h-1.5 rounded-full bg-gray-400 mr-2 flex-shrink-0" />}
                      <span className="text-sm">{group.name}</span>
                      {group.isDefault && (
                        <span className="ml-2 text-xs text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">Default</span>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DeviceManagementPage() {
  const { logout } = useAuth();
  const { devices: connectedDevices } = useSocket();

  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceGroups, setDeviceGroups] = useState<DeviceGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Group management
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['all']));
  const [newGroupParentId, setNewGroupParentId] = useState<string>('all');

  // Selection & bulk actions
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set());
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showMoveToModal, setShowMoveToModal] = useState(false);
  const [moveToGroupId, setMoveToGroupId] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(10);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const DEFAULT_GROUP: DeviceGroup = { id: 'all', name: 'All Devices', parentId: null, isDefault: true };

  useEffect(() => { loadAll(); }, []);
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadAll = async () => { await Promise.all([loadDevices(), loadGroups()]); };

  // ─── Group helpers ──────────────────────────────────────────────────────────

  const toggleGroup = (groupId: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupId)) newExpanded.delete(groupId);
    else newExpanded.add(groupId);
    setExpandedGroups(newExpanded);
  };

  const getChildGroups = (parentId: string | null) =>
    deviceGroups.filter(g => g.parentId === parentId);

  const getHierarchicalGroups = (parentId: string | null = null, level: number = 0): Array<DeviceGroup & { level: number }> => {
    const children = getChildGroups(parentId);
    let result: Array<DeviceGroup & { level: number }> = [];
    children.forEach(child => {
      result.push({ ...child, level });
      result = [...result, ...getHierarchicalGroups(child.id, level + 1)];
    });
    return result;
  };

  // ─── Recursive group tree ───────────────────────────────────────────────────

  const renderGroupTree = (parentId: string | null, level: number = 0): React.ReactNode => {
    return getChildGroups(parentId).map(group => {
      const hasChildren = deviceGroups.some(g => g.parentId === group.id);
      const isExpanded = expandedGroups.has(group.id);
      const isSelected = selectedGroupId === group.id;
      const count = getGroupDeviceCount(group.id);

      return (
        <div key={group.id} className="group">
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
              isSelected ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'
            }`}
            style={{ paddingLeft: `${level * 16 + 12}px` }}
          >
            {hasChildren ? (
              <button
                onClick={e => { e.stopPropagation(); toggleGroup(group.id); }}
                className="w-5 h-5 flex items-center justify-center flex-shrink-0 text-gray-400 hover:text-gray-600"
              >
                <Icon className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} path="M9 5l7 7-7 7" />
              </button>
            ) : (
              <div className="w-5" />
            )}

            <Icon className="w-4 h-4 text-gray-500 flex-shrink-0" path="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />

            <span
              className={`flex-1 text-sm ${isSelected ? 'text-blue-700 font-medium' : 'text-gray-700'}`}
              onClick={() => { setSelectedGroupId(group.id); setSelectedDevices(new Set()); setCurrentPage(1); }}
            >
              {group.name}
            </span>

            {group.isDefault && (
              <span className="text-xs text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full font-medium">Default</span>
            )}

            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{count}</span>

            {!group.isDefault && (
              <button
                onClick={e => { e.stopPropagation(); handleDeleteGroup(group.id); }}
                className="p-1 text-gray-400 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
              >
                <Icon className="w-3 h-3" path="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </button>
            )}
          </div>

          {hasChildren && isExpanded && (
            <div className="mt-1">{renderGroupTree(group.id, level + 1)}</div>
          )}
        </div>
      );
    });
  };

  // ─── Groups ────────────────────────────────────────────────────────────────

  const loadGroups = async () => {
    try {
      const res = await fetch(`${API_URL}/api/device-groups`);
      if (res.ok) {
        const data = await res.json();
        const apiGroups: DeviceGroup[] = data.groups || [];
        setDeviceGroups([DEFAULT_GROUP, ...apiGroups.filter((g: DeviceGroup) => g.id !== 'all')]);
      } else {
        setDeviceGroups([DEFAULT_GROUP]);
      }
    } catch {
      setDeviceGroups([DEFAULT_GROUP]);
    }
  };

  const handleAddGroup = async () => {
    if (!newGroupName.trim()) return;
    const newGroup: DeviceGroup = {
      id: `dg_${Date.now()}`,
      name: newGroupName.trim(),
      parentId: newGroupParentId === 'all' ? null : newGroupParentId,
    };
    try {
      const res = await fetch(`${API_URL}/api/device-groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newGroup),
      });
      const data = res.ok ? await res.json() : null;
      setDeviceGroups(prev => [...prev, data?.group || newGroup]);
    } catch {
      setDeviceGroups(prev => [...prev, newGroup]);
    }
    setExpandedGroups(prev => new Set([...prev, newGroupParentId]));
    setNewGroupName('');
    setNewGroupParentId('all');
    setShowAddGroupModal(false);
  };

  const handleDeleteGroup = async (groupId: string) => {
    const group = deviceGroups.find(g => g.id === groupId);
    if (group?.isDefault) return;
    const hasChildren = deviceGroups.some(g => g.parentId === groupId);
    if (hasChildren) {
      alert('Cannot delete a group that has child groups.');
      return;
    }
    const hasDevices = devices.some(d => d.groupId === groupId);
    if (hasDevices) {
      alert('Cannot delete a group that has devices. Move or delete the devices first.');
      return;
    }
    try { await fetch(`${API_URL}/api/device-groups/${groupId}`, { method: 'DELETE' }); } catch {}
    setDeviceGroups(prev => prev.filter(g => g.id !== groupId));
    if (selectedGroupId === groupId) setSelectedGroupId('all');
  };

  const getGroupDeviceCount = (groupId: string) =>
    groupId === 'all' ? devices.length : devices.filter(d => d.groupId === groupId).length;

  // ─── Selection & bulk actions ───────────────────────────────────────────────

  const toggleDeviceSelection = (deviceId: string) => {
    setSelectedDevices(prev => {
      const next = new Set(prev);
      if (next.has(deviceId)) next.delete(deviceId);
      else next.add(deviceId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedDevices.size === filteredDevices.length) {
      setSelectedDevices(new Set());
    } else {
      setSelectedDevices(new Set(filteredDevices.map(d => d.deviceId)));
    }
  };

  const handleBulkMove = async () => {
    if (selectedDevices.size === 0) return;
    try {
      for (const deviceId of selectedDevices) {
        await fetch(`${API_URL}/api/devices/${deviceId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupId: moveToGroupId === 'all' ? null : moveToGroupId }),
        });
      }
      setDevices(prev => prev.map(d =>
        selectedDevices.has(d.deviceId) ? { ...d, groupId: moveToGroupId === 'all' ? undefined : moveToGroupId } : d
      ));
    } catch (e) { console.error('Error moving devices:', e); }
    setSelectedDevices(new Set());
    setShowMoreMenu(false);
    setShowMoveToModal(false);
    setMoveToGroupId('all');
  };

  // ─── Devices ───────────────────────────────────────────────────────────────

  const loadDevices = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_URL}/api/devices`);
      const data = await response.json();
      if (data.success) {
        const storedDevices = data.devices || [];
        const updatedDevices = storedDevices.map((device: any) => {
          const connected = connectedDevices.find((d: any) => d.deviceID === device.registrationId);
          if (connected?.status === 'Online') {
            const newSerial = (connected as any).serialNumber || device.serial;
            if (newSerial && newSerial !== device.serial) {
              fetch(`${API_URL}/api/devices/${device.deviceId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ serial: newSerial, updatedAt: new Date().toISOString() }),
              }).catch(() => {});
              return { ...device, serial: newSerial };
            }
          }
          return device;
        });
        setDevices(updatedDevices);
      }
    } catch { setDevices([]); }
    finally { setIsLoading(false); }
  };

  const handleRefresh = async () => { setIsRefreshing(true); await loadAll(); setIsRefreshing(false); };

  const getDeviceStatus = (registrationId: string): 'online' | 'offline' => {
    const c = connectedDevices.find((d: any) => d.deviceID === registrationId);
    return c?.status === 'Online' ? 'online' : 'offline';
  };

  const handleAddDevice = () => { setEditingDevice(null); setIsModalOpen(true); };
  const handleEditDevice = (device: Device) => { setEditingDevice(device); setIsModalOpen(true); };

  const handleDeleteDevice = async (deviceId: string) => {
    if (!confirm('Are you sure you want to delete this device?')) return;
    try {
      const response = await fetch(`${API_URL}/api/devices/${deviceId}`, { method: 'DELETE' });
      const data = await response.json();
      if (data.success) await loadDevices();
      else alert('Failed to delete device: ' + data.error);
    } catch { alert('Error deleting device'); }
  };

  const handleModalSave = async (deviceData: Partial<Device>) => {
    try {
      const url = editingDevice ? `${API_URL}/api/devices/${editingDevice.deviceId}` : `${API_URL}/api/devices`;
      const method = editingDevice ? 'PUT' : 'POST';
      const payload = {
        ...deviceData,
        groupId: deviceData.groupId ?? editingDevice?.groupId ?? (selectedGroupId !== 'all' ? selectedGroupId : undefined),
      };
      const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (data.success) { setIsModalOpen(false); setEditingDevice(null); await loadDevices(); return true; }
      else { alert('Failed to save device: ' + data.error); return false; }
    } catch { alert('Error saving device'); return false; }
  };

  const filteredDevices = devices.filter(device => {
    const inGroup = selectedGroupId === 'all' || device.groupId === selectedGroupId;
    const matchSearch = !searchTerm ||
      device.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      device.deviceId.includes(searchTerm) ||
      device.registrationId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (device.ip || '').includes(searchTerm);
    return inGroup && matchSearch;
  });

  const totalPages = Math.ceil(filteredDevices.length / recordsPerPage);
  const indexOfLastRecord = currentPage * recordsPerPage;
  const indexOfFirstRecord = indexOfLastRecord - recordsPerPage;
  const paginatedDevices = filteredDevices.slice(indexOfFirstRecord, indexOfLastRecord);

  const onlineCount = devices.filter(d => getDeviceStatus(d.registrationId) === 'online').length;
  const offlineCount = devices.filter(d => getDeviceStatus(d.registrationId) === 'offline').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100" onClick={() => setShowMoreMenu(false)}>
      <Sidebar currentPath="/devices" onLogout={logout} />

      <div className="lg:ml-64">
        {/* ── Full-width heading ──────────────────────────────────────────── */}
        <div className="px-4 lg:px-8 pt-16 lg:pt-8 pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-gray-800">Device Management</h1>
              <p className="text-gray-500 mt-1 text-sm lg:text-base">
                {selectedGroupId === 'all'
                  ? 'All devices'
                  : `Group: ${deviceGroups.find(g => g.id === selectedGroupId)?.name}`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:gap-3">
              <div className="text-right hidden sm:block">
                <div className="text-base lg:text-xl font-bold text-gray-800">
                  {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </div>
                <div className="text-gray-500 text-xs">
                  {currentTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
              </div>

              <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing} className="flex items-center gap-2">
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
              <Button onClick={handleAddDevice} className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Add Device</span>
              </Button>
            </div>
          </div>
        </div>

        {/* ── Body: stacks vertically on small screens ─────────────────────── */}
        <div className="flex flex-col lg:flex-row px-4 lg:px-8 pb-8 gap-6" style={{ minHeight: 'calc(100vh - 140px)' }}>

          {/* Left: Device Groups tree ──────────────────────────────────────── */}
          <div className="w-full lg:w-1/4 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
            <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Device Groups</h3>
              <button
                onClick={() => setShowAddGroupModal(true)}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-xs font-medium flex items-center"
              >
                <Icon className="w-3 h-3 mr-1" path="M12 4v16m8-8H4" />
                Add
              </button>
            </div>

            <div className="p-3 overflow-y-auto flex-1">
              <div className="space-y-1">
                {renderGroupTree(null)}
              </div>
            </div>
          </div>

          {/* Right: stats + search + table ────────────────────────────────── */}
          <div className="flex-1 flex flex-col gap-6 min-w-0">

            {/* Stats Cards */}
            {(() => {
              const onlinePct = devices.length > 0 ? Math.round((onlineCount / devices.length) * 100) : 0;
              const offlinePct = devices.length > 0 ? Math.round((offlineCount / devices.length) * 100) : 0;
              // Mini bar heights – decorative, reflect relative counts
              const barData = (max: number, count: number) =>
                [0.4, 0.6, 0.5, 0.8, 0.65, 0.9, 0.75, 1.0].map(h =>
                  Math.max(3, Math.round(h * Math.min(32, count > 0 ? (count / max) * 32 + 8 : 6)))
                );
              const totalBars = barData(Math.max(devices.length, 1), devices.length);
              const onlineBars = barData(Math.max(devices.length, 1), onlineCount);
              // SVG ring for offline
              const radius = 22;
              const circumference = 2 * Math.PI * radius;
              const ringOffset = circumference - (offlinePct / 100) * circumference;

              return (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Total Devices */}
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col justify-between min-h-[130px]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                          <Icon path="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" className="w-4 h-4 text-blue-500" />
                        </div>
                        <span className="text-sm font-medium text-gray-500">Total Devices</span>
                      </div>
                    </div>

                    <div className="flex items-end justify-between mt-2">
                      <div>
                        <p className="text-3xl font-bold text-gray-800 leading-none">{devices.length}</p>
                        <div className="flex items-center gap-1.5 mt-2">
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-600">
                            {onlinePct}% active
                          </span>
                          <span className="text-xs text-gray-400">of total</span>
                        </div>
                      </div>
                      {/* Mini bar chart */}
                      <div className="flex items-end gap-0.5 h-9 pb-0.5">
                        {totalBars.map((h, i) => (
                          <div
                            key={i}
                            className="w-1.5 rounded-full bg-blue-200"
                            style={{ height: `${h}px`, opacity: 0.5 + (i / totalBars.length) * 0.5 }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Online */}
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col justify-between min-h-[130px]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                          <Wifi className="w-4 h-4 text-emerald-500" />
                        </div>
                        <span className="text-sm font-medium text-gray-500">Online</span>
                      </div>
                    </div>

                    <div className="flex items-end justify-between mt-2">
                      <div>
                        <p className="text-3xl font-bold text-emerald-600 leading-none">{onlineCount}</p>
                        <div className="flex items-center gap-1.5 mt-2">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            {onlinePct}%
                          </span>
                          <span className="text-xs text-gray-400">connected</span>
                        </div>
                      </div>
                      {/* Mini bar chart */}
                      <div className="flex items-end gap-0.5 h-9 pb-0.5">
                        {onlineBars.map((h, i) => (
                          <div
                            key={i}
                            className="w-1.5 rounded-full bg-emerald-300"
                            style={{ height: `${h}px`, opacity: 0.4 + (i / onlineBars.length) * 0.6 }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Offline */}
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col justify-between min-h-[130px]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                          <WifiOff className="w-4 h-4 text-red-400" />
                        </div>
                        <span className="text-sm font-medium text-gray-500">Offline</span>
                      </div>
                    </div>

                    <div className="flex items-end justify-between mt-2">
                      <div>
                        <p className="text-3xl font-bold text-red-500 leading-none">{offlineCount}</p>
                        <div className="flex items-center gap-1.5 mt-2">
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-500">
                            {offlinePct}%
                          </span>
                          <span className="text-xs text-gray-400">unreachable</span>
                        </div>
                      </div>
                      {/* Ring chart */}
                      <svg width="52" height="52" className="-rotate-90">
                        <circle cx="26" cy="26" r={radius} fill="none" stroke="#fee2e2" strokeWidth="5" />
                        <circle
                          cx="26" cy="26" r={radius} fill="none"
                          stroke="#f87171" strokeWidth="5"
                          strokeLinecap="round"
                          strokeDasharray={circumference}
                          strokeDashoffset={ringOffset}
                          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              );
            })()}


            {/* Device Table */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex-1 flex flex-col">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-800 flex-shrink-0">Devices ({filteredDevices.length})</h2>
                {/* Right side: Search + More button */}
                <div className="flex items-center gap-3">
                  <div className="relative" style={{ width: '240px' }}>
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search devices..."
                      value={searchTerm}
                      onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                      className="w-full pl-9 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                {/* More button */}
                <div className="relative">
                  <button
                    onClick={e => { e.stopPropagation(); setShowMoreMenu(prev => !prev); }}
                    disabled={selectedDevices.size === 0}
                    className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center text-sm ${
                      selectedDevices.size === 0
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-gray-800 text-white hover:bg-gray-900'
                    }`}
                  >
                    <Icon className="w-4 h-4 mr-2" path="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                    More
                    {selectedDevices.size > 0 && (
                      <span className="ml-2 px-1.5 py-0.5 bg-white/20 text-white rounded text-xs">{selectedDevices.size}</span>
                    )}
                  </button>
                  {showMoreMenu && selectedDevices.size > 0 && (
                    <div
                      className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50"
                      onClick={e => e.stopPropagation()}
                    >
                      <button
                        onClick={() => { setShowMoreMenu(false); setShowMoveToModal(true); }}
                        className="w-full px-4 py-3 text-left text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors flex items-center"
                      >
                        <Icon className="w-4 h-4 mr-2" path="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        Move to Group
                      </button>
                    </div>
                  )}
                </div>
                </div>{/* end right-side group */}
              </div>{/* end heading */}
              <div className="p-6 flex-1 overflow-auto">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                  </div>
                ) : filteredDevices.length === 0 ? (
                  <div className="text-center py-12">
                    <Icon path="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    {searchTerm ? (
                      <p className="text-gray-500">No devices match &ldquo;{searchTerm}&rdquo;</p>
                    ) : (
                      <>
                        <p className="text-gray-500 mb-4">No devices found</p>
                        <Button onClick={handleAddDevice} className="flex items-center gap-2">
                          <Plus className="h-4 w-4" /> Add Your First Device
                        </Button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="py-3 px-4 w-10">
                            <input
                              type="checkbox"
                              checked={filteredDevices.length > 0 && selectedDevices.size === filteredDevices.length}
                              onChange={toggleSelectAll}
                              className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                            />
                          </th>
                          {['Device ID', 'Name', 'Registration ID', 'Group', 'Local IP', 'Serial', 'Status', 'Actions'].map(h => (
                            <th key={h} className="text-left py-3 px-4 text-sm font-medium text-gray-500">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedDevices.map(device => {
                          const status = getDeviceStatus(device.registrationId);
                          const groupName = deviceGroups.find(g => g.id === device.groupId)?.name;
                          const isSelected = selectedDevices.has(device.deviceId);
                          return (
                            <tr key={device.deviceId} className={`border-b transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                              <td className="py-3 px-4">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleDeviceSelection(device.deviceId)}
                                  className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                                />
                              </td>
                              <td className="py-3 px-4">
                                <span className="font-mono text-sm font-bold text-blue-600">{device.deviceId}</span>
                                <div className="text-xs text-gray-400">Permanent ID</div>
                              </td>
                              <td className="py-3 px-4 text-sm font-medium">{device.name}</td>
                              <td className="py-3 px-4 font-mono text-sm text-gray-600">{device.registrationId}</td>
                              <td className="py-3 px-4">
                                {groupName
                                  ? <span className="text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-full">{groupName}</span>
                                  : <span className="text-gray-300 italic text-sm">—</span>}
                              </td>
                              <td className="py-3 px-4">
                                {device.ip ? <span className="font-mono text-sm text-gray-600">{device.ip}</span> : <span className="text-gray-300 italic text-sm">Not set</span>}
                              </td>
                              <td className="py-3 px-4">
                                <span className="font-mono text-sm text-gray-500">{device.serial || <span className="text-gray-300 italic">Auto-detected</span>}</span>
                              </td>
                              <td className="py-3 px-4">
                                <Badge variant={status === 'online' ? 'default' : 'destructive'} className="flex items-center gap-1 w-fit">
                                  {status === 'online' ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                                  {status === 'online' ? 'Online' : 'Offline'}
                                </Badge>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  <Button variant="ghost" size="sm" onClick={() => handleEditDevice(device)} className="flex items-center gap-1">
                                    <Edit className="h-4 w-4" /> Edit
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => handleDeleteDevice(device.deviceId)} className="flex items-center gap-1 text-red-600 hover:text-red-700">
                                    <Trash2 className="h-4 w-4" /> Delete
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Pagination Footer */}
              {filteredDevices.length > 0 && (
                <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-4 flex-shrink-0">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span>
                      {filteredDevices.length > 0
                        ? <>Showing <span className="font-medium text-gray-900">{indexOfFirstRecord + 1}</span>–<span className="font-medium text-gray-900">{Math.min(indexOfLastRecord, filteredDevices.length)}</span> of <span className="font-medium text-gray-900">{filteredDevices.length}</span></>
                        : 'No results'}
                    </span>
                    <span className="text-gray-300">|</span>
                    <label className="text-gray-500">Show</label>
                    <select
                      value={recordsPerPage}
                      onChange={e => { setRecordsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                      className="border border-gray-200 rounded-md px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700"
                    >
                      {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <span>per page</span>
                  </div>
                  {totalPages > 1 && (
                    <nav className="flex items-center gap-1">
                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="px-2 py-1 rounded border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >‹</button>
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum: number;
                        if (totalPages <= 5) pageNum = i + 1;
                        else if (currentPage <= 3) pageNum = i + 1;
                        else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                        else pageNum = currentPage - 2 + i;
                        return (
                          <button
                            key={pageNum}
                            onClick={() => setCurrentPage(pageNum)}
                            className={`w-8 h-8 rounded border text-sm font-medium transition-colors ${
                              currentPage === pageNum
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                          >{pageNum}</button>
                        );
                      })}
                      <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="px-2 py-1 rounded border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >›</button>
                    </nav>
                  )}
                </div>
              )}
            </div>

          </div>{/* end right column */}
        </div>{/* end two-column body */}
      </div>{/* end ml-64 */}

      {/* Device Modal */}
      <DeviceModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingDevice(null); }}
        onSave={handleModalSave}
        device={editingDevice}
        deviceGroups={deviceGroups.filter(g => !g.isDefault)}
      />

      {/* Add Group Modal */}
      {showAddGroupModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg w-96 p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Add Device Group</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Group Name</label>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter group name"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleAddGroup()}
                />
              </div>
              <TreeDropdown
                value={newGroupParentId}
                onChange={setNewGroupParentId}
                label="Parent Group"
                groups={deviceGroups}
                hierarchicalGroups={getHierarchicalGroups()}
              />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => { setShowAddGroupModal(false); setNewGroupName(''); setNewGroupParentId('all'); }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddGroup}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-cyan-700 transition-all"
              >
                Add Group
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move to Group Modal */}
      {showMoveToModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg w-96 p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Move to Group</h3>
            <p className="text-sm text-gray-600 mb-4">
              Move {selectedDevices.size} selected device{selectedDevices.size !== 1 ? 's' : ''} to:
            </p>
            <TreeDropdown
              value={moveToGroupId}
              onChange={setMoveToGroupId}
              label="Select Group"
              groups={deviceGroups}
              hierarchicalGroups={getHierarchicalGroups()}
            />
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => { setShowMoveToModal(false); setMoveToGroupId('all'); }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkMove}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-cyan-700 transition-all"
              >
                Move
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
