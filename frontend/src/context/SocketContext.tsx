'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import io, { Socket } from 'socket.io-client';
import { useConfig } from './ConfigContext';

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
}

interface Event {
  eventName: string;
  data: {
    deviceID?: string;
    deviceId?: string;
    eventType?: string;
    timestamp: string;
    [key: string]: any;
  };
}

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  devices: Device[];
  events: Event[];
  accessEvents: any[];
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [accessEvents, setAccessEvents] = useState<any[]>([]);
  const { apiUrl, isLoaded } = useConfig();

  useEffect(() => {
    if (!isLoaded) return; // Wait until config is loaded
    // Initialize socket connection
    const socketUrl = apiUrl;
    const socketInstance = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    // Connection events
    socketInstance.on('connect', () => {
      console.log('Socket connected');
      setIsConnected(true);
    });

    socketInstance.on('disconnect', () => {
      console.log('Socket disconnected');
      setIsConnected(false);
    });

    // Device updates
    socketInstance.on('devices:update', (updatedDevices: Device[]) => {
      // Normalize device data - handle both camelCase and PascalCase from C#
      const normalized = updatedDevices.map((dev: any) => ({
        deviceID: dev.deviceID || dev.DeviceID || dev.deviceid,
        ip: dev.ip || dev.IP,
        port: dev.port || dev.Port,
        name: dev.name || dev.Name,
        status: dev.status || dev.Status,
        type: dev.type || dev.Type,
        generation: dev.generation || dev.Generation,
        isAutoRegistered: dev.isAutoRegistered || dev.IsAutoRegistered,
        loginTime: dev.loginTime || dev.LoginTime,
        serialNumber: dev.serialNumber || dev.SerialNumber,
        ...dev
      }));
      setDevices(normalized);
    });

    socketInstance.on('device:status:changed', (data: any) => {
      const deviceId = data.deviceID || data.deviceId;
      setDevices((prevDevices) =>
        prevDevices.map((device) =>
          device.deviceID === deviceId
            ? { ...device, status: data.status }
            : device
        )
      );
    });

    // Event updates
    socketInstance.on('device:event:received', (event: Event) => {
      setEvents((prevEvents) => [event, ...prevEvents].slice(0, 100));
    });

    // Access control event updates (live events from devices)
    socketInstance.on('access:control:event', (event: any) => {
      console.log('🔌 SocketContext: access control event received', event);
      setAccessEvents((prev) => [event, ...prev].slice(0, 500));
    });

    setSocket(socketInstance);

    // Cleanup on unmount
    return () => {
      socketInstance.disconnect();
    };
  }, [apiUrl, isLoaded]);

  return (
    <SocketContext.Provider value={{ socket, isConnected, devices, events, accessEvents }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}
