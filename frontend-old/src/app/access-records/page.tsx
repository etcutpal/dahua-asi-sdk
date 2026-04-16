'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/')}
                className="mr-2"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Database className="h-8 w-8 text-primary-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Access Records</h1>
                <p className="text-sm text-gray-500">View and manage access control logs</p>
              </div>
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
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
  );
}
