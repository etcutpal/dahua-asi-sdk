'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
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
} from 'lucide-react';

const Icon = ({ path, className = "w-5 h-5" }: { path: string; className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d={path} />
  </svg>
);

interface AccessRecord {
  id: string;
  recordNumber: number;
  cardNumber: string;
  userID: string;
  userName: string;
  swipeTime: string;
  doorNumber: number;
  deviceId?: string;
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
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [startDate, setStartDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [filter, setFilter] = useState<string>('all');
  const [page, setPage] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [fetching, setFetching] = useState<boolean>(false);
  const [devices, setDevices] = useState<any[]>([]);

  // Navigation items
  const navItems = [
    { name: 'Dashboard', path: '/', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { name: 'Access Records', path: '/access-records', icon: 'M9 12l2 2 4-4m7-10a9 9 0 11-18 0 9 9 0 0118 0z' },
    { name: 'Person', path: '/persons', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
    { name: 'Access Control', path: '/access-control', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
    { name: 'Attendance', path: '/attendance', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
    { name: 'Attendance Periods', path: '/attendance-periods', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
    { name: 'Devices', path: '/devices', icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  ];

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, router]);

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
  }, [startDate, endDate, filter, page]);

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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

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
    const methodLower = method.toLowerCase();

    if (methodLower.includes('face')) {
      return { icon: ScanFace, color: 'text-purple-600', label: 'Face Recognition' };
    }
    if (methodLower.includes('fingerprint') || methodLower.includes('finger')) {
      return { icon: Fingerprint, color: 'text-green-600', label: 'Fingerprint' };
    }
    if (methodLower.includes('card') || methodLower.includes('swipe')) {
      return { icon: CreditCard, color: 'text-blue-600', label: 'Card Swipe' };
    }
    if (methodLower.includes('password') || methodLower.includes('pwd') || methodLower.includes('pin')) {
      return { icon: KeyRound, color: 'text-orange-600', label: 'Password/PIN' };
    }
    if (methodLower.includes('qr') || methodLower.includes('code')) {
      return { icon: QrCode, color: 'text-cyan-600', label: 'QR Code' };
    }
    if (methodLower.includes('remote') || methodLower.includes('unlock')) {
      return { icon: Lock, color: 'text-yellow-600', label: 'Remote Unlock' };
    }

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

    return (
      <Badge className={`${colorClass} hover:${colorClass}`}>
        {cardType}
      </Badge>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Sidebar */}
      <div className="fixed left-0 top-0 h-full w-64 bg-gradient-to-b from-slate-900 to-slate-800 text-white">
        <div className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-lg flex items-center justify-center">
              <Icon path="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold">AccessPro</h1>
              <p className="text-xs text-slate-400">Access Control</p>
            </div>
          </div>
        </div>

        <nav className="px-4">
          {navItems.map((item) => (
            <Link
              key={item.path}
              href={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg mb-2 transition-colors ${
                item.path === '/access-records'
                  ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white'
                  : 'text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              <Icon path={item.icon} className="w-5 h-5" />
              <span className="font-medium">{item.name}</span>
            </Link>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4">
          <button
            onClick={() => { logout(); router.push('/login'); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
          >
            <Icon path="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" className="w-5 h-5" />
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="ml-64 p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">Access Records</h1>
              <p className="text-gray-500 mt-1">View and manage access control logs</p>
            </div>
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
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Auth Method
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          User
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Card
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Card Type
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Device
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Time
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {records.map((record) => (
                        <tr key={record.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap">
                            {getStatusBadge(record.status)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {(() => {
                              const { icon: Icon, color, label } = getOpenMethodIcon(record.openMethod || '');
                              return (
                                <div className="flex items-center" title={label}>
                                  <Icon className={`h-5 w-5 ${color}`} />
                                </div>
                              );
                            })()}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center">
                              <User className="h-4 w-4 mr-2 text-gray-400" />
                              <div>
                                <div className="text-sm font-medium text-gray-900">
                                  {record.userID || 'N/A'}
                                </div>
                                {record.userName && (
                                  <div className="text-sm text-gray-500">{record.userName}</div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center">
                              <CreditCard className="h-4 w-4 mr-2 text-gray-400" />
                              <span className="text-sm text-gray-900">
                                {record.cardNumber || 'N/A'}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {getCardTypeBadge(record.cardType)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center">
                              <Database className="h-4 w-4 mr-2 text-gray-400" />
                              <span className="text-sm text-gray-900">
                                {getDeviceName(record.deviceId || '') || (record.doorNumber !== undefined ? `Door ${record.doorNumber}` : 'N/A')}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center">
                              <Clock className="h-4 w-4 mr-2 text-gray-400" />
                              <span className="text-sm text-gray-900">
                                {formatDate(record.swipeTime)}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden space-y-4">
                  {records.map((record) => (
                    <Card key={record.id}>
                      <CardContent className="py-4">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            {getStatusBadge(record.status)}
                            {(() => {
                              const { icon: Icon, color, label } = getOpenMethodIcon(record.openMethod || '');
                              return (
                                <div className="flex items-center" title={label}>
                                  <Icon className={`h-5 w-5 ${color}`} />
                                </div>
                              );
                            })()}
                          </div>
                          <div className="text-xs text-gray-500 text-right -mt-1">
                            {formatDate(record.swipeTime)}
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="text-gray-500">User:</span>
                              <span className="ml-2 font-medium">{record.userID || 'N/A'}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Card:</span>
                              <span className="ml-2 font-medium">{record.cardNumber || 'N/A'}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Type:</span>
                              <span className="ml-2">{record.cardType}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Device:</span>
                              <span className="ml-2">{getDeviceName(record.deviceId || '') || (record.doorNumber !== undefined ? `Door ${record.doorNumber}` : 'N/A')}</span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
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
  );
}
