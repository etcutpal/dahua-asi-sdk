'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/context/SocketContext';
import DeviceModal from '@/components/DeviceModal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Monitor,
  Plus,
  Edit,
  Trash2,
  Wifi,
  WifiOff,
  Search,
  RefreshCw,
  ArrowLeft,
} from 'lucide-react';

interface Device {
  deviceId: string;
  name: string;
  registrationId: string;
  username: string;
  password: string;
  ip: string;
  serial: string;
  createdAt: string;
  updatedAt: string;
  status?: 'online' | 'offline';
}

export default function DeviceManagementPage() {
  const router = useRouter();
  const { devices: connectedDevices } = useSocket();
  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  // Load devices from backend
  const loadDevices = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_URL}/api/devices`);
      const data = await response.json();
      if (data.success) {
        const storedDevices = data.devices || [];
        
        // Auto-populate IP and Serial from connected devices
        const updatedDevices = storedDevices.map(device => {
          const connectedDevice = connectedDevices.find(
            (d: any) => d.serialNumber === device.registrationId || d.deviceID === device.registrationId
          );
          
          if (connectedDevice && connectedDevice.status === 'Online') {
            // Update IP and Serial if they're different or empty
            const newIp = connectedDevice.ip || device.ip;
            const newSerial = connectedDevice.serialNumber || device.serial;
            
            if (newIp !== device.ip || newSerial !== device.serial) {
              // Update the device in background (don't await, just trigger update)
              fetch(`${API_URL}/api/devices/${device.deviceId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  ip: newIp,
                  serial: newSerial,
                  updatedAt: new Date().toISOString()
                })
              }).catch(err => console.error('Failed to update device IP/Serial:', err));
              
              return { ...device, ip: newIp, serial: newSerial };
            }
          }
          
          return device;
        });
        
        setDevices(updatedDevices);
      }
    } catch (error) {
      console.error('Error loading devices:', error);
      setDevices([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDevices();
  }, [connectedDevices]); // Re-run when connected devices change

  // Refresh devices
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadDevices();
    setIsRefreshing(false);
  };

  // Get device online status from connected devices
  const getDeviceStatus = (registrationId: string): 'online' | 'offline' => {
    const connectedDevice = connectedDevices.find(
      (d: any) => d.serialNumber === registrationId || d.deviceID === registrationId
    );
    return connectedDevice?.status === 'Online' ? 'online' : 'offline';
  };

  // Filter devices by search term
  const filteredDevices = devices.filter(device =>
    device.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    device.deviceId.includes(searchTerm) ||
    device.registrationId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    device.ip.includes(searchTerm)
  );

  // Handle add device
  const handleAddDevice = () => {
    setEditingDevice(null);
    setIsModalOpen(true);
  };

  // Handle edit device
  const handleEditDevice = (device: Device) => {
    setEditingDevice(device);
    setIsModalOpen(true);
  };

  // Handle delete device
  const handleDeleteDevice = async (deviceId: string) => {
    if (!confirm('Are you sure you want to delete this device?')) {
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/api/devices/${deviceId}`,
        { method: 'DELETE' }
      );
      const data = await response.json();
      if (data.success) {
        await loadDevices();
      } else {
        alert('Failed to delete device: ' + data.error);
      }
    } catch (error) {
      console.error('Error deleting device:', error);
      alert('Error deleting device');
    }
  };

  // Handle modal save
  const handleModalSave = async (deviceData: Partial<Device>) => {
    try {
      const url = editingDevice
        ? `${API_URL}/api/devices/${editingDevice.deviceId}`
        : `${API_URL}/api/devices`;

      const method = editingDevice ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deviceData),
      });

      const data = await response.json();

      if (data.success) {
        setIsModalOpen(false);
        setEditingDevice(null);
        await loadDevices();
        return true;
      } else {
        alert('Failed to save device: ' + data.error);
        return false;
      }
    } catch (error) {
      console.error('Error saving device:', error);
      alert('Error saving device');
      return false;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                onClick={() => router.push('/')}
                className="flex items-center space-x-2"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </Button>
              <div className="flex items-center space-x-3">
                <Monitor className="h-8 w-8 text-primary-600" />
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Device Management</h1>
                  <p className="text-sm text-gray-500">Manage your access control devices</p>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <Button
                variant="outline"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex items-center space-x-2"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </Button>
              <Button
                onClick={handleAddDevice}
                className="flex items-center space-x-2"
              >
                <Plus className="h-4 w-4" />
                <span>Add Device</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Devices</CardTitle>
              <Monitor className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{devices.length}</div>
              <p className="text-xs text-muted-foreground">Configured devices</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Online Devices</CardTitle>
              <Wifi className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {devices.filter(d => getDeviceStatus(d.registrationId) === 'online').length}
              </div>
              <p className="text-xs text-muted-foreground">Currently online</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Offline Devices</CardTitle>
              <WifiOff className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {devices.filter(d => getDeviceStatus(d.registrationId) === 'offline').length}
              </div>
              <p className="text-xs text-muted-foreground">Currently offline</p>
            </CardContent>
          </Card>
        </div>

        {/* Search Bar */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by device name, ID, registration ID, or IP..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </CardContent>
        </Card>

        {/* Device List */}
        <Card>
          <CardHeader>
            <CardTitle>Devices ({filteredDevices.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin text-primary-600" />
              </div>
            ) : filteredDevices.length === 0 ? (
              <div className="text-center py-12">
                <Monitor className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 mb-4">No devices found</p>
                <Button onClick={handleAddDevice} className="flex items-center space-x-2">
                  <Plus className="h-4 w-4" />
                  <span>Add Your First Device</span>
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Device ID</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Name</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Registration ID</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">IP Address</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Serial</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Status</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDevices.map((device) => {
                      const status = getDeviceStatus(device.registrationId);
                      return (
                        <tr key={device.deviceId} className="border-b hover:bg-gray-50">
                          <td className="py-3 px-4">
                            <div className="flex flex-col">
                              <span className="font-mono text-sm font-bold text-primary-600">{device.deviceId}</span>
                              <span className="text-xs text-gray-400">Permanent ID</span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-sm font-medium">{device.name}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-sm font-mono text-gray-600">{device.registrationId}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-sm font-mono text-gray-500">{device.ip || <span className="text-gray-300 italic">Auto-detected</span>}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-sm font-mono text-gray-500">{device.serial || <span className="text-gray-300 italic">Auto-detected</span>}</span>
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant={status === 'online' ? 'default' : 'destructive'} className="flex items-center space-x-1">
                              {status === 'online' ? (
                                <Wifi className="h-3 w-3" />
                              ) : (
                                <WifiOff className="h-3 w-3" />
                              )}
                              <span>{status === 'online' ? 'Online' : 'Offline'}</span>
                            </Badge>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center space-x-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditDevice(device)}
                                className="flex items-center space-x-1"
                              >
                                <Edit className="h-4 w-4" />
                                <span>Edit</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteDevice(device.deviceId)}
                                className="flex items-center space-x-1 text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="h-4 w-4" />
                                <span>Delete</span>
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
          </CardContent>
        </Card>
      </main>

      {/* Device Modal */}
      <DeviceModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingDevice(null);
        }}
        onSave={handleModalSave}
        device={editingDevice}
      />
    </div>
  );
}
