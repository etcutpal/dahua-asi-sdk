import fs from 'fs/promises';
import path from 'path';
import { Device, DeviceInput } from '../types';

class DeviceService {
  private dataPath: string;
  private devices: Device[];
  private lock: Promise<void>;

  constructor() {
    this.dataPath = path.join(__dirname, '..', '..', 'data', 'devices.json');
    this.devices = [];
    this.lock = Promise.resolve();
  }

  async load(): Promise<Device[]> {
    try {
      const data = await fs.readFile(this.dataPath, 'utf-8');
      const parsed = JSON.parse(data);
      this.devices = parsed.devices || [];
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        this.devices = [];
      } else {
        console.error('Error loading devices:', error);
        this.devices = [];
      }
    }
    return this.devices;
  }

  async save(): Promise<void> {
    try {
      await fs.writeFile(this.dataPath, JSON.stringify({ devices: this.devices }, null, 2), 'utf-8');
    } catch (error) {
      console.error('Error saving devices:', error);
      throw error;
    }
  }

  generateDeviceId(): string {
    // Generate 8-digit unique number
    let id: string;
    let attempts = 0;
    do {
      id = Math.floor(10000000 + Math.random() * 90000000).toString();
      attempts++;
      if (attempts > 100) {
        throw new Error('Unable to generate unique device ID');
      }
    } while (this.devices.some(d => d.deviceId === id));
    return id;
  }

  async getAll(): Promise<Device[]> {
    await this.load();
    return this.devices;
  }

  async getById(deviceId: string): Promise<Device | undefined> {
    await this.load();
    return this.devices.find(d => d.deviceId === deviceId);
  }

  async create(deviceData: DeviceInput): Promise<Device> {
    await this.load();

    // Check for duplicate registrationId
    if (deviceData.registrationId && this.devices.some(d => d.registrationId === deviceData.registrationId)) {
      throw new Error('Registration ID already exists');
    }

    const device: Device = {
      deviceId: this.generateDeviceId(),
      name: deviceData.name || '',
      registrationId: deviceData.registrationId || '',
      username: deviceData.username || 'admin',
      password: deviceData.password || '',
      ip: deviceData.ip || '',
      serial: deviceData.serial || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.devices.push(device);
    await this.save();
    return device;
  }

  async update(deviceId: string, deviceData: DeviceInput): Promise<Device> {
    await this.load();

    const index = this.devices.findIndex(d => d.deviceId === deviceId);
    if (index === -1) {
      throw new Error('Device not found');
    }

    // Check for duplicate registrationId (excluding current device)
    if (deviceData.registrationId && this.devices.some(d => d.registrationId === deviceData.registrationId && d.deviceId !== deviceId)) {
      throw new Error('Registration ID already exists');
    }

    this.devices[index] = {
      ...this.devices[index],
      ...deviceData,
      updatedAt: new Date().toISOString()
    };

    await this.save();
    return this.devices[index];
  }

  async delete(deviceId: string): Promise<Device> {
    await this.load();

    const index = this.devices.findIndex(d => d.deviceId === deviceId);
    if (index === -1) {
      throw new Error('Device not found');
    }

    const [deleted] = this.devices.splice(index, 1);
    await this.save();
    return deleted;
  }
}

export default new DeviceService();
