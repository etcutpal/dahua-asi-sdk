'use client';

import { useEffect, useState } from 'react';
import { useSocket } from '@/context/SocketContext';
import DeviceList from '@/components/DeviceList';
import EventLog from '@/components/EventLog';
import DeviceLoginDialog from '@/components/DeviceLoginDialog';
import AutoRegControl from '@/components/AutoRegControl';
import AccessControlEventList from '@/components/AccessControlEventList';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Monitor,
  Activity,
  Wifi,
  WifiOff,
  RefreshCw,
  Plus,
  Settings,
  Bell,
  HardDrive,
  DoorOpen,
  Code,
  User,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Device {
  deviceID: string;
  ip: string;
  port: number;
  name: string;
  status: string;
  type: string;
  generation: string;
  isAutoRegistered: boolean;
  loginTime: string;
  serialNumber?: string;
}

export default function Home() {
  const router = useRouter();
  const { socket, isConnected, devices, events } = useSocket();
  const [isLoginDialogOpen, setIsLoginDialogOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRegStatus, setAutoRegStatus] = useState(false);
  const [accessEvents, setAccessEvents] = useState<any[]>([]);

  // Listen for access control events via WebSocket
  useEffect(() => {
    if (!socket) return;

    const handleAccessEvent = (event: any) => {
      console.log('🚪 Access control event received:', event);
      setAccessEvents((prev) => [event, ...prev].slice(0, 50)); // Keep last 50
    };

    socket.on('access:control:event', handleAccessEvent);

    // Fetch initial access events from API
    fetchAccessEvents();

    return () => {
      socket.off('access:control:event', handleAccessEvent);
    };
  }, [socket]);

  const fetchAccessEvents = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${API_URL}/api/events/access-control?limit=20`);
      const data = await response.json();
      if (data.success) {
        setAccessEvents(data.events || []);
      }
    } catch (error) {
      console.error('Error fetching access events:', error);
    }
  };

  const onlineDevices = devices.filter((d: Device) => d.status === 'Online');

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // Trigger a refresh - this would call the API
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Monitor className="h-8 w-8 text-primary-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">NetSDK Device Monitor</h1>
                <p className="text-sm text-gray-500">Real-time Face Access Device Management</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <Badge variant={isConnected ? "default" : "destructive"} className="flex items-center space-x-2">
                {isConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
              </Badge>
              
              <Button onClick={() => setIsLoginDialogOpen(true)} className="flex items-center space-x-2">
                <Plus className="h-4 w-4" />
                <span>Add Device</span>
              </Button>
              
              <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Devices</CardTitle>
              <Monitor className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{devices.length}</div>
              <p className="text-xs text-muted-foreground">
                Registered devices
              </p>
              {devices.length > 0 && (
                <div className="mt-2 text-xs text-gray-500">
                  {devices.map((d: Device) => (
                    <div key={d.deviceID} className="truncate">
                      {d.serialNumber || d.deviceID} - {d.status}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Online Devices</CardTitle>
              <Activity className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{onlineDevices.length}</div>
              <p className="text-xs text-muted-foreground">
                Currently online
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Auto Registration</CardTitle>
              <Settings className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <AutoRegControl onStatusChange={setAutoRegStatus} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Recent Events</CardTitle>
              <Bell className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{events.length}</div>
              <p className="text-xs text-muted-foreground">
                Last 24 hours
              </p>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => router.push('/devices')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                router.push('/devices');
              }
            }}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Device Management</CardTitle>
              <HardDrive className="h-4 w-4 text-primary-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary-600">Manage</div>
              <p className="text-xs text-muted-foreground">
                Configure devices
              </p>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => router.push('/persons')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                router.push('/persons');
              }
            }}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Person Management</CardTitle>
              <User className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">Manage</div>
              <p className="text-xs text-muted-foreground">
                Manage persons
              </p>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => router.push('/api-tester')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                router.push('/api-tester');
              }
            }}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">API Tester</CardTitle>
              <Code className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">Test</div>
              <p className="text-xs text-muted-foreground">
                Call all endpoints
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Device List */}
          <div className="lg:col-span-2">
            <DeviceList devices={devices} />
          </div>

          {/* Event Log */}
          <div className="lg:col-span-1">
            <EventLog events={events} />
          </div>
        </div>

        {/* Access Control Events */}
        {accessEvents.length > 0 && (
          <div className="mt-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex items-center space-x-3">
                  <DoorOpen className="h-5 w-5 text-blue-600" />
                  <CardTitle className="text-lg font-medium">Live Access Control Events</CardTitle>
                  <Badge variant="outline" className="text-xs">
                    {accessEvents.length} events
                  </Badge>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchAccessEvents}
                  className="flex items-center space-x-2"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>Refresh</span>
                </Button>
              </CardHeader>
              <CardContent>
                <AccessControlEventList events={accessEvents} />
              </CardContent>
            </Card>
          </div>
        )}
      </main>

      {/* Login Dialog */}
      <DeviceLoginDialog 
        isOpen={isLoginDialogOpen} 
        onClose={() => setIsLoginDialogOpen(false)} 
      />
    </div>
  );
}
