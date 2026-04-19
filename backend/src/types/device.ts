// Device interface
export interface Device {
  deviceId: string;
  name: string;
  registrationId: string;
  username?: string;
  password?: string;
  ip?: string;
  serial?: string;
  groupId?: string;   // device group membership (null/undefined = "All Devices" default)
  createdAt?: string;
  updatedAt?: string;
  // Additional runtime fields from SDK (PascalCase for compatibility)
  status?: 'online' | 'offline' | 'connecting' | string;
  lastSeen?: string;
  channel?: number;
  // PascalCase variants for SDK compatibility
  DeviceID?: string;
  deviceID?: string;
  Status?: string;
  DeviceName?: string;
  Name?: string;
  IP?: string;
  SerialNumber?: string;
  serialNumber?: string;
  loginHandle?: number;
}

// Device creation input (without auto-generated fields)
export interface DeviceInput {
  name?: string;
  registrationId?: string;
  username?: string;
  password?: string;
  ip?: string;
  serial?: string;
}

// Device update input (all fields optional)
export interface DeviceUpdate extends Partial<DeviceInput> {}
