'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/context/SocketContext';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar from '@/components/Sidebar';
import DeviceModal from '@/components/DeviceModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Plus,
  Edit,
  Trash2,
  Wifi,
  WifiOff,
  Search,
  RefreshCw,
  Monitor,
} from 'lucide-react';

const Icon = ({ path, className = "w-5 h-5" }: { path: string; className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d={path} />
  </svg>
);

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
  const { logout } = useAuth();
  const { devices: connectedDevices } = useSocket();
  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  useEffect(() => {
    loadDevices();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Load devices from backend
  const loadDevices = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_URL}/api/devices`);
      const data = await response.json();

      if (data.success) {
        const storedDevices = data.devices || [];

        // Auto-populate IP and Serial from connected devices
        const updatedDevices = storedDevices.map((device: any) => {
          const connectedDevice = connectedDevices.find(
            (d: any) => d.serialNumber === device.registrationId || d.deviceID === device.registrationId
          );

          if (connectedDevice && connectedDevice.status === 'Online') {
            const newIp = connectedDevice.ip || device.ip;
            const newSerial = (connectedDevice as any).serialNumber || device.serial;

            if (newIp !== device.ip || newSerial !== device.serial) {
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

  const onlineCount = devices.filter(d => getDeviceStatus(d.registrationId) === 'online').length;
  const offlineCount = devices.filter(d => getDeviceStatus(d.registrationId) === 'offline').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Sidebar currentPath="/devices" onLogout={logout} />

      {/* Main Content */}
      <div className="ml-64 p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">Device Management</h1>
              <p className="text-gray-500 mt-1">Manage your access control devices</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right mr-4">
                <div className="text-2xl font-bold text-gray-800">
                  {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </div>
                <div className="text-gray-500 text-sm">
                  {currentTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
              </div>
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

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Devices</p>
                <p className="text-3xl font-bold text-gray-800 mt-2">{devices.length}</p>
              </div>
              <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
                <Icon path="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Online Devices</p>
                <p className="text-3xl font-bold text-green-600 mt-2">{onlineCount}</p>
              </div>
              <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center">
                <Icon path="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Offline Devices</p>
                <p className="text-3xl font-bold text-red-600 mt-2">{offlineCount}</p>
              </div>
              <div className="w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center">
                <Icon path="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by device name, ID, registration ID, or IP..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Device List */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-800">Devices ({filteredDevices.length})</h2>
          </div>
          <div className="p-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : filteredDevices.length === 0 ? (
              <div className="text-center py-12">
                <Icon path="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" className="w-12 h-12 text-gray-400 mx-auto mb-4" />
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
                              <span className="font-mono text-sm font-bold text-blue-600">{device.deviceId}</span>
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
          </div>
        </div>
      </div>

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
