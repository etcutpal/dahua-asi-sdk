'use client';

import { useState, useEffect, useTransition } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useSocket } from '@/context/SocketContext';
import { useRouter } from 'next/navigation';
import { CheckCircle, XCircle } from 'lucide-react';
import Sidebar from '@/components/Sidebar';

const Icon = ({ path, className = "w-5 h-5" }: { path: string; className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d={path} />
  </svg>
);

interface DashboardSummary {
  totalEmployees: number;
  presentToday: number;
  absentToday: number;
  lateArrivals: number;
  todayAccessRecords: number;
  devicesOnline: number;
  devicesOffline: number;
  // Comparison data
  employeeChange: number;
  presentChange: number;
  lateChange: number;
  accessChange: number;
  presentYesterday: number;
  lateYesterday: number;
  accessYesterday: number;
}

interface AccessEvent {
  id?: string;
  type?: string;
  deviceId?: string;
  timestamp?: string;
  data?: {
    UserID?: string;
    userId?: string;
    CardNo?: string;
    CardName?: string;
    cardName?: string;
    Method?: number;
    openMethod?: string | number;
    OpenMethod?: number;
    Similarity?: number;
    similarity?: number;
    Door?: number;
    door?: number;
    Status?: string;
    isSuccess?: boolean;
    Time?: string;
    Timestamp?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

interface Device {
  id: string;
  name: string;
  ipAddress: string;
  status: 'online' | 'offline';
  lastSeen: string;
  location: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated, logout } = useAuth();
  const { socket, devices: socketDevices } = useSocket();
  const [isPending, startTransition] = useTransition();
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [summary, setSummary] = useState<DashboardSummary>({
    totalEmployees: 0,
    presentToday: 0,
    absentToday: 0,
    lateArrivals: 0,
    todayAccessRecords: 0,
    devicesOnline: 0,
    devicesOffline: 0,
    employeeChange: 0,
    presentChange: 0,
    lateChange: 0,
    accessChange: 0,
    presentYesterday: 0,
    lateYesterday: 0,
    accessYesterday: 0,
  });
  const [devices, setDevices] = useState<Device[]>([]);
  const [accessEvents, setAccessEvents] = useState<AccessEvent[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
    } else {
      // Wrap data loading in transition for smooth navigation
      startTransition(() => {
        Promise.all([
          loadDashboardData(),
          fetchInitialAccessEvents()
        ]).then(() => {
          // Mark initial loading as complete
          setIsInitialLoading(false);
        });
      });
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch initial access events from backend API (persisted in access-events.json)
  const fetchInitialAccessEvents = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${API_URL}/api/events/access-control?limit=50`);
      const data = await response.json();
      if (data.success && data.events) {
        console.log(`📦 Loaded ${data.events.length} stored access events from backend`);
        setAccessEvents(data.events);
      }
    } catch (error) {
      console.error('Error fetching initial access events:', error);
    }
  };

  // Listen for live access control events via WebSocket
  useEffect(() => {
    if (!socket) return;

    const handleAccessEvent = (payload: any) => {
      console.log('🚪 Live access event received:', payload);

      // The backend emits { event, record } where:
      //   event  = raw SDK event (has data.UserID, data.CardName etc. — may be incomplete)
      //   record = enriched AccessRecord (has userName, userID, cardNumber — always correct)
      // Merge record fields into the top-level so getEventData() can find them.
      const enriched = payload.record
        ? { ...payload.event, record: payload.record }
        : payload;

      setAccessEvents((prev) => [enriched, ...prev].slice(0, 500));
    };

    socket.on('access:control:event', handleAccessEvent);

    return () => {
      socket.off('access:control:event', handleAccessEvent);
    };
  }, [socket]);

  // Log when access events change (for debugging)
  useEffect(() => {
    if (accessEvents.length > 0) {
      console.log(`📊 Dashboard: ${accessEvents.length} access events in context`);
      console.log('Latest event:', accessEvents[0]);
    }
  }, [accessEvents]);

  const getEventData = (event: AccessEvent) => {
    // 1. Check for enriched record (from WebSocket live events — has userName etc.)
    const rec = (event as any).record;
    if (rec) {
      return {
        userID: rec.userID || '',
        cardNo: rec.cardNumber || '',
        cardName: rec.userName || rec.cardNumber || '',
        method: rec.openMethod || 'Unknown',
        similarity: undefined,
        door: rec.doorNumber ?? 0,
        status: rec.status || '',
        isSuccess: rec.status === 'Success',
        time: rec.swipeTime || event.timestamp || '',
      };
    }

    // 2. Fall back to raw event data (from HTTP API fetch)
    const data = event.data || event;

    // Parse rawJson if it exists (contains additional fields like Method, UserID, etc.)
    let rawJsonData: Record<string, any> = {};
    if (data.rawJson) {
      try {
        rawJsonData = typeof data.rawJson === 'string' ? JSON.parse(data.rawJson) : data.rawJson;
      } catch (e) {
        // Ignore if rawJson is invalid
      }
    }

    // Merge data with rawJson for complete event info
    const mergedData = { ...data, ...rawJsonData };

    return {
      userID: mergedData.UserID || mergedData.userId || data.userId || event.deviceId || '',
      cardNo: mergedData.CardNo || mergedData.cardNumber || data.cardNumber || '',
      cardName: mergedData.CardName || mergedData.cardName || data.cardName || '',
      method: mergedData.Method ?? mergedData.openMethod ?? mergedData.OpenMethod ?? data.openMethod ?? data.Method,
      similarity: mergedData.Similarity ?? mergedData.similarity ?? data.similarity,
      door: mergedData.Door ?? mergedData.door ?? data.door,
      status: mergedData.Status ?? data.Status ?? (data.isSuccess === true ? 'Success' : data.isSuccess === false ? 'Failed' : ''),
      isSuccess: data.isSuccess ?? mergedData.isSuccess,
      time: mergedData.Time || mergedData.Timestamp || mergedData.swipeTime || data.Timestamp || event.timestamp || ''
    };
  };

  const getMethodName = (method?: number | string): string => {
    if (!method && method !== 0) return 'Unknown';

    // Handle string values (e.g., "Face", "Card", "Fingerprint", "FaceRecognition")
    if (typeof method === 'string') {
      const lowerMethod = method.toLowerCase();
      if (lowerMethod.includes('face')) return 'Face';
      if (lowerMethod.includes('finger')) return 'Fingerprint';
      if (lowerMethod.includes('card')) return 'Card';
      if (lowerMethod.includes('pin')) return 'PIN';
      if (lowerMethod.includes('password')) return 'Password';
      if (lowerMethod.includes('qrcode') || lowerMethod.includes('qr')) return 'QR Code';
      return method; // Return original string if not recognized
    }
    
    // Handle numeric codes
    const num = typeof method === 'number' ? method : parseInt(method);
    switch (num) {
      case 15: return 'Face';
      case 1: return 'Card';
      case 6: return 'Fingerprint';
      case 2: return 'PIN';
      case 3: return 'Password';
      case 4: return 'FingerVein';
      case 5: return 'Iris';
      default: return `Code ${num}`;
    }
  };

  const getStatusColor = (status?: string, isSuccess?: boolean): string => {
    if (status?.toLowerCase().includes('success') || status === '1' || isSuccess === true) {
      return 'bg-green-100 text-green-700';
    }
    if (status?.toLowerCase().includes('fail') || status === '0' || isSuccess === false) {
      return 'bg-red-100 text-red-700';
    }
    return 'bg-gray-100 text-gray-700';
  };

  const getStatusText = (status?: string, isSuccess?: boolean): string => {
    if (status?.toLowerCase().includes('success') || status === '1' || isSuccess === true) {
      return 'Success';
    }
    if (status?.toLowerCase().includes('fail') || status === '0' || isSuccess === false) {
      return 'Failed';
    }
    return status || 'Unknown';
  };

  const formatEventTime = (timestamp?: string): string => {
    if (!timestamp) return 'Just now';
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return 'Just now';
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const getDisplayName = (event: AccessEvent): string => {
    const data = getEventData(event);
    return data.cardName || data.userID || data.cardNo || 'Unknown User';
  };

  const getDisplayId = (event: AccessEvent): string => {
    const data = getEventData(event);
    return data.userID || data.cardNo || 'N/A';
  };

  const loadDashboardData = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

      const [summaryRes, devicesRes] = await Promise.all([
        fetch(`${API_URL}/api/dashboard/summary`),
        fetch(`${API_URL}/api/dashboard/devices`)
      ]);

      if (summaryRes.ok) {
        const summaryData = await summaryRes.json();
        setSummary(summaryData);
      }

      if (devicesRes.ok) {
        const devicesData = await devicesRes.json();
        setDevices(devicesData);
      }
      // No fallback to raw socketDevices — unrecognised devices must not appear
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    }
  };

  // Show loading only on initial load, not on navigation transitions
  if (isInitialLoading && isPending) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Sidebar currentPath="/" onLogout={logout} />

      {/* Main Content */}
      <div className="lg:ml-64 p-4 lg:p-8 pt-16 lg:pt-8">
        {/* Header */}
        <div className="mb-6 lg:mb-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-gray-800">Dashboard</h1>
              <p className="text-gray-500 mt-1 text-sm lg:text-base">Overview of your access control system</p>
            </div>
            <div className="text-right">
              <div className="text-lg lg:text-2xl font-bold text-gray-800">
                {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
              <div className="text-gray-500 text-xs lg:text-sm">
                {currentTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-6 lg:mb-8">
          {/* Card 1: Total Employees - Blue */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
            <div className="flex">
              <div className="w-[72px] lg:w-[80px] bg-blue-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-7 h-7 lg:w-8 lg:h-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <div className="flex-1 px-4 py-3.5 lg:px-5 lg:py-4 min-w-0">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide truncate">Total Employees</p>
                <p className="text-2xl lg:text-[28px] font-bold text-gray-800 leading-tight mt-0.5">{summary.totalEmployees.toLocaleString()}</p>
                <div className="flex items-center gap-1 mt-1">
                  <span className={`inline-flex items-center text-xs font-semibold ${summary.employeeChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    <svg className="w-3 h-3 mr-0.5" viewBox="0 0 24 24" fill="currentColor">
                      {summary.employeeChange >= 0 ? (
                        <path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z" />
                      ) : (
                        <path d="M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z" />
                      )}
                    </svg>
                    {Math.abs(summary.employeeChange)}
                  </span>
                  <span className="text-xs text-gray-400 truncate">{summary.employeeChange >= 0 ? 'more' : 'less'} vs last month</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Today's Present - Green */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
            <div className="flex">
              <div className="w-[72px] lg:w-[80px] bg-green-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-7 h-7 lg:w-8 lg:h-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <div className="flex-1 px-4 py-3.5 lg:px-5 lg:py-4 min-w-0">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide truncate">Today's Present</p>
                <p className="text-2xl lg:text-[28px] font-bold text-gray-800 leading-tight mt-0.5">{summary.presentToday.toLocaleString()}</p>
                <div className="flex items-center gap-1 mt-1">
                  <span className={`inline-flex items-center text-xs font-semibold ${summary.presentChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    <svg className="w-3 h-3 mr-0.5" viewBox="0 0 24 24" fill="currentColor">
                      {summary.presentChange >= 0 ? (
                        <path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z" />
                      ) : (
                        <path d="M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z" />
                      )}
                    </svg>
                    {Math.abs(summary.presentChange)}
                  </span>
                  <span className="text-xs text-gray-400 truncate">{summary.presentChange >= 0 ? 'more' : 'less'} vs yesterday</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Today's Late Arrival - Orange */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
            <div className="flex">
              <div className="w-[72px] lg:w-[80px] bg-orange-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-7 h-7 lg:w-8 lg:h-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div className="flex-1 px-4 py-3.5 lg:px-5 lg:py-4 min-w-0">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide truncate">Today's Late Arrival</p>
                <p className="text-2xl lg:text-[28px] font-bold text-gray-800 leading-tight mt-0.5">{summary.lateArrivals.toLocaleString()}</p>
                <div className="flex items-center gap-1 mt-1">
                  <span className={`inline-flex items-center text-xs font-semibold ${summary.lateChange >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                    <svg className="w-3 h-3 mr-0.5" viewBox="0 0 24 24" fill="currentColor">
                      {summary.lateChange >= 0 ? (
                        <path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z" />
                      ) : (
                        <path d="M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z" />
                      )}
                    </svg>
                    {Math.abs(summary.lateChange)}
                  </span>
                  <span className="text-xs text-gray-400 truncate">{summary.lateChange >= 0 ? 'more' : 'less'} vs yesterday</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 4: Today's Access Records - Purple */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
            <div className="flex">
              <div className="w-[72px] lg:w-[80px] bg-purple-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-7 h-7 lg:w-8 lg:h-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
              </div>
              <div className="flex-1 px-4 py-3.5 lg:px-5 lg:py-4 min-w-0">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide truncate">Today's Access Records</p>
                <p className="text-2xl lg:text-[28px] font-bold text-gray-800 leading-tight mt-0.5">{summary.todayAccessRecords.toLocaleString()}</p>
                <div className="flex items-center gap-1 mt-1">
                  <span className={`inline-flex items-center text-xs font-semibold ${summary.accessChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    <svg className="w-3 h-3 mr-0.5" viewBox="0 0 24 24" fill="currentColor">
                      {summary.accessChange >= 0 ? (
                        <path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z" />
                      ) : (
                        <path d="M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z" />
                      )}
                    </svg>
                    {Math.abs(summary.accessChange)}
                  </span>
                  <span className="text-xs text-gray-400 truncate">{summary.accessChange >= 0 ? 'more' : 'less'} vs yesterday</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Recent Attendance - Live Access Events */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">Live Access Events</h2>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-gray-500">{accessEvents.length} events</span>
              </div>
            </div>
            <div className="p-6">
              {accessEvents.length > 0 ? (
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {accessEvents.slice(0, 10).map((event, index) => {
                    const eventData = getEventData(event);
                    return (
                      <div key={event.id || index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-full flex items-center justify-center text-white font-semibold">
                            {getDisplayName(event).charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-gray-800">{getDisplayName(event)}</p>
                            <p className="text-sm text-gray-500">
                              ID: {getDisplayId(event)} • {getMethodName(eventData.method)}
                              {eventData.similarity && eventData.similarity > 0 && (
                                <span className="ml-1">({eventData.similarity}%)</span>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-gray-800">{formatEventTime(eventData.time)}</p>
                          <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(eventData.status, eventData.isSuccess)}`}>
                            {eventData.isSuccess || eventData.status?.toLowerCase().includes('success') || eventData.status === '1' ? (
                              <>
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Success
                              </>
                            ) : (
                              <>
                                <XCircle className="h-3 w-3 mr-1" />
                                Failed
                              </>
                            )}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Icon path="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                  <p>No access events yet</p>
                  <p className="text-sm mt-1">Events will appear here in real-time</p>
                </div>
              )}
            </div>
          </div>

          {/* Device Status */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800">Device Status</h2>
            </div>
            <div className="p-6">
              {devices.length > 0 ? (
                <div className="space-y-4">
                  {devices.map((device) => (
                    <div key={device.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${
                          device.status === 'online' ? 'bg-green-500' : 'bg-red-500'
                        }`}></div>
                        <div>
                          <p className="font-medium text-gray-800">{device.name}</p>
                          <p className="text-sm text-gray-500">{device.ipAddress}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-600">{device.location}</p>
                        <p className="text-xs text-gray-500">Last seen: {device.lastSeen}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Icon path="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                  <p>No devices configured</p>
                </div>
              )}
            </div>
          </div>
        </div>
        {/* Quick Actions */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Manual Check In */}
            <Link href="/access-control" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md hover:border-blue-200 transition-all group">
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center mb-3 group-hover:bg-green-100 transition-colors">
                  <Icon path="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" className="w-6 h-6 text-green-600" />
                </div>
                <h3 className="font-medium text-gray-800">Manual Check In</h3>
                <p className="text-sm text-gray-500 mt-1">Record employee check-in</p>
              </div>
            </Link>

            {/* Manual Check Out */}
            <Link href="/access-control" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md hover:border-orange-200 transition-all group">
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 bg-orange-50 rounded-lg flex items-center justify-center mb-3 group-hover:bg-orange-100 transition-colors">
                  <Icon path="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" className="w-6 h-6 text-orange-600" />
                </div>
                <h3 className="font-medium text-gray-800">Manual Check Out</h3>
                <p className="text-sm text-gray-500 mt-1">Record employee check-out</p>
              </div>
            </Link>

            {/* Add New Employee */}
            <Link href="/employees" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md hover:border-purple-200 transition-all group">
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 bg-purple-50 rounded-lg flex items-center justify-center mb-3 group-hover:bg-purple-100 transition-colors">
                  <Icon path="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" className="w-6 h-6 text-purple-600" />
                </div>
                <h3 className="font-medium text-gray-800">Add New Employee</h3>
                <p className="text-sm text-gray-500 mt-1">Create employee record</p>
              </div>
            </Link>

            {/* Device Card */}
            <Link href="/devices" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md hover:border-blue-200 transition-all group">
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center mb-3 group-hover:bg-blue-100 transition-colors">
                  <Icon path="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="font-medium text-gray-800">Manage Devices</h3>
                <p className="text-sm text-gray-500 mt-1">Configure access devices</p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
