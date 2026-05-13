'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar from '@/components/Sidebar';
import { useSettings } from '@/context/SettingsContext';
import { formatDate as fmtDate, formatTime as fmtTime, formatDateTime as fmtDateTime } from '@/lib/formatDateTime';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Calendar,
  Filter,
  RefreshCw,
  Shield,
  ShieldOff,
  ChevronLeft,
  ChevronRight,
  Database,
  User,
  CreditCard,
  DoorOpen,
  Clock,
  ScanFace,
  Fingerprint,
  Lock,
  QrCode,
  KeyRound,
  LogIn,
  LogOut,
  Monitor,
} from 'lucide-react';
import io from 'socket.io-client';

interface AccessRecord {
  id: string;
  recordNumber: number | null;
  cardNumber: string;
  userID: string;
  userName: string;
  swipeTime: string;
  doorNumber: number;
  registrationId?: string;
  deviceId?: string;
  deviceName?: string;
  readerNo: string;
  cardType: string;
  openMethod?: string;
  status: 'Success' | 'Failed';
  storedAt: string;
}

interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  totalRecords: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

interface Employee {
  id: string;
  name: string;
  personId?: string;
  groups?: string[];
}

interface EmployeeGroup {
  id: string;
  name: string;
}

interface PersonSelection {
  type: 'all' | 'group' | 'emp';
  id?: string;
  label?: string;
}

export default function AccessRecordsPage() {
  const router = useRouter();
  const { isAuthenticated, logout } = useAuth();
  const [records, setRecords] = useState<AccessRecord[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    currentPage: 1,
    totalPages: 0,
    totalRecords: 0,
    hasNextPage: false,
    hasPrevPage: false,
  });
  const toLocalDateString = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const [startDate, setStartDate] = useState<string>(
    (() => {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      return toLocalDateString(d);
    })()
  );
  const [endDate, setEndDate] = useState<string>(
    toLocalDateString(new Date())
  );
  const [filter, setFilter] = useState<string>('all');
  const [page, setPage] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [fetching, setFetching] = useState<boolean>(false);
  const [devices, setDevices] = useState<any[]>([]);
  const [autoFetchNotif, setAutoFetchNotif] = useState<{
    deviceName: string; fetched: number; stored: number; startDate: string; endDate: string;
  } | null>(null);
  const [showAutoFetchNotifications, setShowAutoFetchNotifications] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('autoFetchNotifications') !== 'false';
    }
    return true;
  });

  // ─── Person selector state ──────────────────────────────────────────────
  const [personSelection, setPersonSelection] = useState<PersonSelection>({ type: 'all', label: 'All Records' });
  const [personSearch, setPersonSearch] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [groups, setGroups] = useState<EmployeeGroup[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, router]);

  // Load employees & groups for person selector
  useEffect(() => {
    const load = async () => {
      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        const [empRes, grpRes] = await Promise.all([
          fetch(`${API_URL}/api/employees`),
          fetch(`${API_URL}/api/employees/groups`),
        ]);
        const [empData, grpData] = await Promise.all([empRes.json(), grpRes.json()]);
        if (empData.success) {
          setEmployees((empData.data || empData.employees || []).map((e: any) => ({
            ...e,
            groups: e.groups || (e.groupId ? [e.groupId] : []),
          })));
        }
        if (grpData.success) setGroups(grpData.groups || []);
      } catch {}
    };
    load();
  }, []);

  // Real-time: listen for SDK access control events and prepend to the list
  useEffect(() => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const socket = io(API_URL, { transports: ['websocket', 'polling'] });

    socket.on('access:control:event', (payload: { event: any; record?: AccessRecord }) => {
      if (payload.record) {
        setRecords(prev => [payload.record as AccessRecord, ...prev]);
      }
    });

    socket.on('device:auto-fetch:complete', (payload: {
      registrationId: string; deviceName: string; fetched: number; stored: number;
      startDate: string; endDate: string; timestamp: string;
    }) => {
      // Auto-refresh the record list
      fetchRecords();
      // Show notification if enabled
      setShowAutoFetchNotifications(prev => {
        if (prev) {
          setAutoFetchNotif({
            deviceName: payload.deviceName || payload.registrationId,
            fetched: payload.fetched,
            stored: payload.stored,
            startDate: payload.startDate,
            endDate: payload.endDate,
          });
        }
        return prev;
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Fetch devices list for name lookup
  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        const response = await fetch(`${API_URL}/api/devices`);
        const data = await response.json();
        if (data.devices || data.value) {
          setDevices(data.devices || data.value);
        }
      } catch (error) {
        console.error('Error fetching devices:', error);
      }
    };
    fetchDevices();
  }, []);

  // Helper to get device name from deviceId
  const getDeviceName = (deviceId: string) => {
    const device = devices.find(d => (d.deviceID || d.DeviceID || d.deviceId) === deviceId);
    return device ? (device.name || device.Name || device.deviceID || device.DeviceID) : null;
  };

  // Fetch records on mount and when filters change
  useEffect(() => {
    fetchRecords();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, filter, page, personSelection]);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
      });

      // Use date range if start and end dates are set
      if (startDate) {
        params.append('startDate', startDate);
      }
      if (endDate) {
        params.append('endDate', endDate);
      }
      if (filter !== 'all') {
        params.append('filter', filter);
      }
      if (personSelection.type === 'emp' && personSelection.id) {
        const emp = employees.find(e => e.id === personSelection.id);
        if (emp) params.append('userId', emp.personId || emp.id);
      } else if (personSelection.type === 'group' && personSelection.id) {
        const groupEmps = employees.filter(e => e.groups?.includes(personSelection.id!));
        const deviceIds = groupEmps.map(e => e.personId || e.id).filter(Boolean);
        if (deviceIds.length === 0) {
          // Group has no employees — show empty results without querying
          setRecords([]);
          setPagination({ currentPage: 1, totalPages: 0, totalRecords: 0, hasNextPage: false, hasPrevPage: false });
          setLoading(false);
          return;
        }
        params.append('userIds', deviceIds.join(','));
      }

      const response = await fetch(`${API_URL}/api/access-records/stored?${params.toString()}`);
      const data = await response.json();

      if (data.success) {
        setRecords(data.records || []);
        setPagination(data.pagination);
      }
    } catch (error) {
      console.error('Error fetching access records:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAndStoreRecords = async () => {
    setFetching(true);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${API_URL}/api/access-records/fetch-and-store`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate,
          endDate,
        }),
      });

      const data = await response.json();

      if (data.success) {
        console.log(`Stored ${data.totalStored} records`);
        // Refresh the records display
        await fetchRecords();
      } else {
        console.error('Error fetching records:', data.error);
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error fetching and storing records:', error);
      alert('Failed to fetch records from devices');
    } finally {
      setFetching(false);
    }
  };

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStartDate = e.target.value;
    setStartDate(newStartDate);
    
    // If end date is before start date, update end date
    if (endDate && endDate < newStartDate) {
      setEndDate(newStartDate);
    }
    
    setPage(1); // Reset to first page on date change
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEndDate = e.target.value;
    setEndDate(newEndDate);
    
    // If start date is after end date, update start date
    if (startDate && startDate > newEndDate) {
      setStartDate(newEndDate);
    }
    
    setPage(1); // Reset to first page on date change
  };

  const handleFilterChange = (newFilter: string) => {
    setFilter(newFilter);
    setPage(1); // Reset to first page on filter change
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const { settings } = useSettings();

  const formatDate = (dateString: string) =>
    fmtDateTime(dateString, settings.dateFormat, settings.timeFormat, settings.timeZone);

  const getStatusBadge = (status: 'Success' | 'Failed') => {
    if (status === 'Success') {
      return (
        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
          <Shield className="h-3 w-3 mr-1" />
          Authorized
        </Badge>
      );
    } else {
      return (
        <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
          <ShieldOff className="h-3 w-3 mr-1" />
          Unauthorized
        </Badge>
      );
    }
  };

  const getOpenMethodIcon = (method: string) => {
    const m = method.toLowerCase();

    // Compound biometric + password
    if (m.includes('face') && m.includes('password'))
      return { icon: ScanFace, color: 'text-purple-600', label: 'Face + Password' };
    if (m.includes('fingerprint') && m.includes('password'))
      return { icon: Fingerprint, color: 'text-green-600', label: 'Fingerprint + Password' };
    if (m.includes('fingerprint') && m.includes('face'))
      return { icon: Fingerprint, color: 'text-teal-600', label: 'Fingerprint + Face' };
    if (m.includes('card') && (m.includes('password') || m.includes('pwd')))
      return { icon: CreditCard, color: 'text-blue-600', label: 'Card + Password' };
    if (m.includes('face') && m.includes('idcard'))
      return { icon: ScanFace, color: 'text-violet-600', label: 'Face + ID Card' };
    // Compound user+password (no biometric)
    if (m.includes('userid') && m.includes('password'))
      return { icon: KeyRound, color: 'text-orange-600', label: 'UserID + Password' };
    // Single methods
    if (m.includes('face'))
      return { icon: ScanFace, color: 'text-purple-600', label: 'Face Recognition' };
    if (m.includes('fingerprint') || m.includes('finger'))
      return { icon: Fingerprint, color: 'text-green-600', label: 'Fingerprint' };
    if (m.includes('card') || m.includes('swipe'))
      return { icon: CreditCard, color: 'text-blue-600', label: 'Card Swipe' };
    if (m.includes('password') || m.includes('pwd') || m.includes('pin'))
      return { icon: KeyRound, color: 'text-orange-600', label: 'Password/PIN' };
    if (m.includes('qr') || m.includes('qrcode'))
      return { icon: QrCode, color: 'text-cyan-600', label: 'QR Code' };
    if (m.includes('remote') || m.includes('unlock'))
      return { icon: Lock, color: 'text-yellow-600', label: 'Remote Unlock' };
    if (m.includes('bluetooth'))
      return { icon: Lock, color: 'text-sky-600', label: 'Bluetooth' };
    if (m.includes('duress') || m.includes('coerce'))
      return { icon: KeyRound, color: 'text-red-600', label: 'Duress' };
    if (m.includes('key'))
      return { icon: KeyRound, color: 'text-amber-600', label: 'Key' };
    if (m.includes('multi') || m.includes('persons'))
      return { icon: ScanFace, color: 'text-indigo-600', label: 'Multi-Person' };

    return { icon: DoorOpen, color: 'text-gray-600', label: method || 'Unknown' };
  };

  const getCardTypeBadge = (cardType: string) => {
    const colors: Record<string, string> = {
      Normal: 'bg-blue-100 text-blue-800',
      VIP: 'bg-purple-100 text-purple-800',
      Guest: 'bg-yellow-100 text-yellow-800',
      Patrol: 'bg-indigo-100 text-indigo-800',
      Blacklisted: 'bg-red-100 text-red-800',
      Coercion: 'bg-orange-100 text-orange-800',
      Unknown: 'bg-gray-100 text-gray-800',
    };
    const colorClass = colors[cardType] || colors.Unknown;
    return <Badge className={`${colorClass} hover:${colorClass}`}>{cardType}</Badge>;
  };

  // reader_no "1" = Enter, "2" = Exit, anything else = Unknown
  const getDirection = (readerNo: string) => {
    if (readerNo === '1' || readerNo === '01')
      return { label: 'Enter', icon: LogIn,  color: 'text-emerald-600', bg: 'bg-emerald-50 text-emerald-700' };
    if (readerNo === '2' || readerNo === '02')
      return { label: 'Exit',  icon: LogOut, color: 'text-rose-600',    bg: 'bg-rose-50 text-rose-700' };
    return   { label: '—',     icon: Monitor, color: 'text-gray-400',   bg: 'bg-gray-100 text-gray-500' };
  };

  const formatDateTime = (dateString: string) => ({
    date: fmtDate(dateString, settings.dateFormat, settings.timeZone),
    time: fmtTime(dateString, settings.timeFormat, settings.timeZone),
  });

  // ─── Person selector helpers ──────────────────────────────────────────
  const lowerSearch = personSearch.toLowerCase();
  const arMatchedEmps = employees.filter(e =>
    !lowerSearch ||
    e.name.toLowerCase().includes(lowerSearch) ||
    (e.personId || e.id).toLowerCase().includes(lowerSearch)
  );
  const arEmpsByGroup = new Map<string, Employee[]>();
  arEmpsByGroup.set('ungrouped', []);
  groups.forEach(g => arEmpsByGroup.set(g.id, []));
  arMatchedEmps.forEach(e => {
    const grpIds = e.groups || [];
    if (grpIds.length === 0) {
      arEmpsByGroup.get('ungrouped')!.push(e);
    } else {
      grpIds.forEach(gid => {
        if (arEmpsByGroup.has(gid)) arEmpsByGroup.get(gid)!.push(e);
        else arEmpsByGroup.get('ungrouped')!.push(e);
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

  function selectPerson(sel: PersonSelection) {
    setPersonSelection(sel);
    setPage(1);
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950">
      {/* Sidebar */}
      <Sidebar currentPath="/access-records" onLogout={() => { logout(); router.push('/login'); }} />

      {/* Auto-fetch notification toast */}
      {autoFetchNotif && (
        <div className="fixed top-4 right-4 z-50 max-w-sm w-full animate-in slide-in-from-top-2">
          <div className="bg-white dark:bg-gray-800 border border-green-200 rounded-xl shadow-lg p-4 flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">Auto-fetch Complete</p>
              <p className="text-xs text-gray-500 mt-0.5">
                <span className="font-medium text-gray-700">{autoFetchNotif.deviceName}</span>
                {' — '}{autoFetchNotif.stored} new record{autoFetchNotif.stored !== 1 ? 's' : ''} stored
                {autoFetchNotif.fetched !== autoFetchNotif.stored && ` (${autoFetchNotif.fetched} fetched)`}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Records list has been refreshed.</p>
            </div>
            <button
              onClick={() => setAutoFetchNotif(null)}
              className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 lg:ml-64 flex flex-col">
        {/* Header */}
        <div className="px-4 lg:px-8 pt-16 lg:pt-8 pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-gray-800">Access Records</h1>
              <p className="text-gray-500 mt-1 text-sm lg:text-base">
                {personSelection.type === 'all' ? 'All employees' : personSelection.label}
                {' \u00b7 '}View and manage access control logs
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Auto-fetch notification toggle */}
              <button
                onClick={() => {
                  setShowAutoFetchNotifications(prev => {
                    const next = !prev;
                    if (typeof window !== 'undefined') localStorage.setItem('autoFetchNotifications', String(next));
                    return next;
                  });
                }}
                title={showAutoFetchNotifications ? 'Disable auto-fetch notifications' : 'Enable auto-fetch notifications'}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg border transition-colors ${
                  showAutoFetchNotifications
                    ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
                    : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {showAutoFetchNotifications ? 'Notifs On' : 'Notifs Off'}
              </button>
              <Button
                onClick={fetchAndStoreRecords}
                disabled={fetching}
                className="flex items-center space-x-2"
              >
                <RefreshCw className={`h-4 w-4 ${fetching ? 'animate-spin' : ''}`} />
                <span>{fetching ? 'Fetching...' : 'Fetch from Devices'}</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Two-column body */}
        <div className="flex flex-1 px-4 lg:px-8 pb-8 gap-5 min-h-0">

          {/* ──── Left panel: Person Selector ───────────────────────────────────────── */}
          <div className="w-64 shrink-0 flex flex-col">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 flex flex-col overflow-hidden" style={{ maxHeight: 'calc(100vh - 200px)' }}>
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Filter by Person</p>
                <div className="relative">
                  <svg className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
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
                {/* All Records */}
                <button
                  onClick={() => selectPerson({ type: 'all', label: 'All Records' })}
                  className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 transition-colors ${
                    personSelection.type === 'all' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <svg className="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  All Records
                  <span className="ml-auto text-xs text-gray-400">{employees.length > 0 ? employees.length : ''}</span>
                </button>

                <div className="my-1 border-t border-gray-100" />

                {/* Groups */}
                {groups.map(g => {
                  const grpEmps = arEmpsByGroup.get(g.id) || [];
                  if (personSearch && grpEmps.length === 0) return null;
                  const isExpanded = expandedGroups.has(g.id);
                  const isSelected = personSelection.type === 'group' && personSelection.id === g.id;
                  return (
                    <div key={g.id}>
                      <div className={`flex items-center gap-1 px-3 py-1.5 transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                        <button onClick={() => toggleGroup(g.id)} className="p-0.5 text-gray-400 hover:text-gray-600">
                          <svg className="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d={isExpanded ? 'M19 9l-7 7-7-7' : 'M9 5l7 7-7 7'} />
                          </svg>
                        </button>
                        <button
                          onClick={() => selectPerson({ type: 'group', id: g.id, label: g.name })}
                          className={`flex-1 text-left text-sm flex items-center gap-1.5 ${isSelected ? 'text-blue-700 font-semibold' : 'text-gray-700'}`}
                        >
                          <svg className="w-3.5 h-3.5 shrink-0 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                          </svg>
                          <span className="truncate">{g.name}</span>
                          <span className="ml-auto text-xs text-gray-400 shrink-0">{grpEmps.length}</span>
                        </button>
                      </div>
                      {isExpanded && grpEmps.map(e => (
                        <button
                          key={e.id}
                          onClick={() => selectPerson({ type: 'emp', id: e.id, label: e.name })}
                          className={`w-full text-left px-8 py-1.5 text-xs flex items-center gap-2 transition-colors ${
                            personSelection.type === 'emp' && personSelection.id === e.id
                              ? 'bg-blue-50 text-blue-700 font-semibold'
                              : 'text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          <svg className="w-3.5 h-3.5 shrink-0 text-gray-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          <span className="truncate">{e.name}</span>
                          {e.personId && (
                            <span className="ml-auto text-gray-400 font-mono shrink-0">{e.personId}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  );
                })}

                {/* Ungrouped employees */}
                {(() => {
                  const ungrouped = arEmpsByGroup.get('ungrouped') || [];
                  if (ungrouped.length === 0) return null;
                  const isExpanded = expandedGroups.has('ungrouped');
                  return (
                    <div>
                      <div className="flex items-center gap-1 px-3 py-1.5 hover:bg-gray-50">
                        <button onClick={() => toggleGroup('ungrouped')} className="p-0.5 text-gray-400 hover:text-gray-600">
                          <svg className="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d={isExpanded ? 'M19 9l-7 7-7-7' : 'M9 5l7 7-7 7'} />
                          </svg>
                        </button>
                        <span className="flex-1 text-xs text-gray-400 pl-1">No Group</span>
                        <span className="text-xs text-gray-400">{ungrouped.length}</span>
                      </div>
                      {isExpanded && ungrouped.map(e => (
                        <button
                          key={e.id}
                          onClick={() => selectPerson({ type: 'emp', id: e.id, label: e.name })}
                          className={`w-full text-left px-8 py-1.5 text-xs flex items-center gap-2 transition-colors ${
                            personSelection.type === 'emp' && personSelection.id === e.id
                              ? 'bg-blue-50 text-blue-700 font-semibold'
                              : 'text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          <svg className="w-3.5 h-3.5 shrink-0 text-gray-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          <span className="truncate">{e.name}</span>
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* ──── Right panel: Records ─────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0 flex flex-col gap-4">

        <main>
        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6 pb-4">
            <div className="flex flex-wrap items-center gap-4">
              {/* Date Range Picker */}
              <div className="flex items-center space-x-2">
                <Calendar className="h-4 w-4 text-gray-500" />
                <label className="text-sm font-medium text-gray-700">Date Range:</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="date"
                    value={startDate}
                    onChange={handleStartDateChange}
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <span className="text-gray-500">to</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={handleEndDateChange}
                    min={startDate}
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              {/* Filter Buttons */}
              <div className="flex items-center space-x-2">
                <Filter className="h-4 w-4 text-gray-500" />
                <label className="text-sm font-medium text-gray-700">Filter:</label>
                <div className="flex space-x-2">
                  <Button
                    variant={filter === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleFilterChange('all')}
                  >
                    All
                  </Button>
                  <Button
                    variant={filter === 'authorized' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleFilterChange('authorized')}
                  >
                    <Shield className="h-3 w-3 mr-1" />
                    Authorized
                  </Button>
                  <Button
                    variant={filter === 'unauthorized' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleFilterChange('unauthorized')}
                  >
                    <ShieldOff className="h-3 w-3 mr-1" />
                    Unauthorized
                  </Button>
                </div>
              </div>

              {/* Refresh Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={fetchRecords}
                disabled={loading}
                className="ml-auto"
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Records Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Access Records</span>
              <Badge variant="outline">
                {pagination.totalRecords} records
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center items-center py-8">
                <RefreshCw className="h-8 w-8 animate-spin text-primary-600" />
              </div>
            ) : records.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Database className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-lg">No access records found</p>
                <p className="text-sm mt-2">
                  Click "Fetch from Devices" to retrieve access records
                </p>
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b">
                      <tr className="bg-gray-50">
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Device</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Auth Method</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Direction</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {records.map((record) => {
                        const { date, time } = formatDateTime(record.swipeTime);
                        const { icon: MethodIcon, color: methodColor, label: methodLabel } = getOpenMethodIcon(record.openMethod || '');
                        const { icon: DirIcon, label: dirLabel, bg: dirBg } = getDirection(record.readerNo || '');
                        const deviceLabel = record.deviceName || getDeviceName(record.registrationId || record.deviceId || '') || '—';
                        return (
                          <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                            {/* Date */}
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="flex items-center gap-1.5 text-sm text-gray-900">
                                <Calendar className="h-3.5 w-3.5 text-gray-400" />
                                {date}
                              </div>
                            </td>
                            {/* Time */}
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="flex items-center gap-1.5 text-sm text-gray-900">
                                <Clock className="h-3.5 w-3.5 text-gray-400" />
                                {time}
                              </div>
                            </td>
                            {/* User */}
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-gray-400 shrink-0" />
                                <div>
                                  <div className="text-sm font-medium text-gray-900">{record.userName || record.userID || 'N/A'}</div>
                                  {record.userName && record.userID && (
                                    <div className="text-xs text-gray-400">ID: {record.userID}</div>
                                  )}
                                </div>
                              </div>
                            </td>
                            {/* Device */}
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="flex items-center gap-1.5 text-sm text-gray-900">
                                <Monitor className="h-3.5 w-3.5 text-gray-400" />
                                {deviceLabel}
                              </div>
                            </td>
                            {/* Auth Method */}
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className={`flex items-center gap-1.5 text-sm ${methodColor}`}>
                                <MethodIcon className="h-4 w-4" />
                                {methodLabel}
                              </div>
                            </td>
                            {/* Direction */}
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${dirBg}`}>
                                <DirIcon className="h-3 w-3" />
                                {dirLabel}
                              </span>
                            </td>
                            {/* Status */}
                            <td className="px-4 py-3 whitespace-nowrap">
                              {getStatusBadge(record.status)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden space-y-3">
                  {records.map((record) => {
                    const { date, time } = formatDateTime(record.swipeTime);
                    const { icon: MethodIcon, color: methodColor, label: methodLabel } = getOpenMethodIcon(record.openMethod || '');
                    const { icon: DirIcon, label: dirLabel, bg: dirBg } = getDirection(record.readerNo || '');
                    const deviceLabel = record.deviceName || getDeviceName(record.registrationId || record.deviceId || '') || '—';
                    return (
                      <Card key={record.id} className="overflow-hidden">
                        <CardContent className="p-4">
                          {/* Top row: date/time + status */}
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <div className="text-sm font-semibold text-gray-900">{date}</div>
                              <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                <Clock className="h-3 w-3" />{time}
                              </div>
                            </div>
                            {getStatusBadge(record.status)}
                          </div>
                          {/* User */}
                          <div className="flex items-center gap-2 mb-2">
                            <User className="h-4 w-4 text-gray-400 shrink-0" />
                            <div>
                              <span className="text-sm font-medium text-gray-900">{record.userName || record.userID || 'N/A'}</span>
                              {record.userName && record.userID && (
                                <span className="text-xs text-gray-400 ml-1">({record.userID})</span>
                              )}
                            </div>
                          </div>
                          {/* Device */}
                          <div className="flex items-center gap-2 mb-2">
                            <Monitor className="h-4 w-4 text-gray-400 shrink-0" />
                            <span className="text-sm text-gray-700">{deviceLabel}</span>
                          </div>
                          {/* Auth method + Direction */}
                          <div className="flex items-center gap-3 mt-2">
                            <div className={`flex items-center gap-1 text-sm ${methodColor}`}>
                              <MethodIcon className="h-4 w-4" />
                              {methodLabel}
                            </div>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${dirBg}`}>
                              <DirIcon className="h-3 w-3" />
                              {dirLabel}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {/* Pagination */}
                {pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-6 pt-6 border-t">
                    <div className="text-sm text-gray-700">
                      Showing{' '}
                      <span className="font-medium">
                        {(pagination.currentPage - 1) * 20 + 1}
                      </span>
                      to{' '}
                      <span className="font-medium">
                        {Math.min(pagination.currentPage * 20, pagination.totalRecords)}
                      </span>{' '}
                      of{' '}
                      <span className="font-medium">{pagination.totalRecords}</span>{' '}
                      records
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(pagination.currentPage - 1)}
                        disabled={!pagination.hasPrevPage}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </Button>
                      <div className="flex items-center space-x-1">
                        {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                          let pageNum;
                          if (pagination.totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (pagination.currentPage <= 3) {
                            pageNum = i + 1;
                          } else if (pagination.currentPage >= pagination.totalPages - 2) {
                            pageNum = pagination.totalPages - 4 + i;
                          } else {
                            pageNum = pagination.currentPage - 2 + i;
                          }

                          return (
                            <Button
                              key={pageNum}
                              variant={pagination.currentPage === pageNum ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => handlePageChange(pageNum)}
                              className="w-8 h-8 p-0"
                            >
                              {pageNum}
                            </Button>
                          );
                        })}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(pagination.currentPage + 1)}
                        disabled={!pagination.hasNextPage}
                      >
                        Next
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
        </main>
          </div>
        </div>
      </div>
    </div>
  );
}
