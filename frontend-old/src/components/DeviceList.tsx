'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Monitor, Wifi, WifiOff, LogOut, Activity } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

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
  macAddress?: string;
  serialNumber?: string;
}

interface DeviceListProps {
  devices: Device[];
}

export default function DeviceList({ devices }: DeviceListProps) {
  const handleLogout = async (deviceId: string) => {
    if (!confirm('Are you sure you want to logout from this device?')) {
      return;
    }

    try {
      const response = await fetch(`/api/devices/${deviceId}/logout`, {
        method: 'POST',
      });
      
      if (response.ok) {
        console.log('Successfully logged out from device');
      }
    } catch (error) {
      console.error('Error logging out from device:', error);
    }
  };

  if (devices.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Monitor className="h-5 w-5" />
            <span>Devices</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-gray-500">
            <Monitor className="h-16 w-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium mb-2">No devices connected</p>
            <p className="text-sm">Add a device or enable auto registration</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Monitor className="h-5 w-5" />
            <span>Devices ({devices.length})</span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {devices.map((device) => (
            <div
              key={device.deviceID}
              className="border rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className="font-semibold text-lg">{device.name}</h3>
                    <Badge variant={device.status === 'Online' ? 'default' : 'secondary'}>
                      {device.status === 'Online' ? (
                        <Wifi className="h-3 w-3 mr-1" />
                      ) : (
                        <WifiOff className="h-3 w-3 mr-1" />
                      )}
                      {device.status}
                    </Badge>
                    {device.isAutoRegistered && (
                      <Badge variant="outline">Auto-Reg</Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                    <div>
                      <span className="font-medium">IP:</span> {device.ip}:{device.port}
                    </div>
                    <div>
                      <span className="font-medium">Type:</span> {device.type}
                    </div>
                    <div>
                      <span className="font-medium">Generation:</span> {device.generation}
                    </div>
                    <div>
                      <span className="font-medium">Connected:</span>{' '}
                      {device.loginTime 
                        ? formatDistanceToNow(new Date(device.loginTime), { addSuffix: true })
                        : 'N/A'}
                    </div>
                    {device.macAddress && (
                      <div>
                        <span className="font-medium">MAC:</span> {device.macAddress}
                      </div>
                    )}
                    {device.serialNumber && (
                      <div>
                        <span className="font-medium">Serial:</span> {device.serialNumber}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-2 ml-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleLogout(device.deviceID)}
                    disabled={device.status !== 'Online'}
                  >
                    <LogOut className="h-4 w-4 mr-1" />
                    Logout
                  </Button>
                </div>
              </div>

              {/* Quick actions */}
              <div className="mt-3 pt-3 border-t flex items-center space-x-2">
                <Button variant="ghost" size="sm" className="text-xs">
                  <Activity className="h-3 w-3 mr-1" />
                  View Events
                </Button>
                <Button variant="ghost" size="sm" className="text-xs">
                  Settings
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
