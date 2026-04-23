/**
 * JsonDeviceRepository.ts — JSON file implementation of IDeviceRepository.
 *
 * Swap for SqlDeviceRepository when moving to a database.
 */

import fsp from 'fs/promises';
import fs from 'fs';
import path from 'path';
import { IDeviceRepository, IDeviceGroupRepository } from './IDeviceRepository';
import { Device } from '../types';

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

export class JsonDeviceRepository implements IDeviceRepository {
  private filePath: string;

  constructor(filePath = path.join(DATA_DIR, 'devices.json')) {
    this.filePath = filePath;
  }

  private async read(): Promise<Device[]> {
    try {
      const raw = await fsp.readFile(this.filePath, 'utf-8');
      return JSON.parse(raw).devices || [];
    } catch (err: any) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }

  private async write(devices: Device[]): Promise<void> {
    await fsp.writeFile(this.filePath, JSON.stringify({ devices }, null, 2), 'utf-8');
  }

  async findAll(): Promise<Device[]> {
    return this.read();
  }

  async findById(deviceId: string): Promise<Device | undefined> {
    const devices = await this.read();
    return devices.find(d => d.deviceId === deviceId);
  }

  async findByRegistrationId(registrationId: string): Promise<Device | undefined> {
    const devices = await this.read();
    return devices.find(d => d.registrationId === registrationId);
  }

  async create(device: Device): Promise<Device> {
    const devices = await this.read();
    devices.push(device);
    await this.write(devices);
    return device;
  }

  async update(device: Device): Promise<Device> {
    const devices = await this.read();
    const idx = devices.findIndex(d => d.deviceId === device.deviceId);
    if (idx === -1) throw new Error(`Device ${device.deviceId} not found`);
    devices[idx] = device;
    await this.write(devices);
    return device;
  }

  async delete(deviceId: string): Promise<void> {
    const devices = await this.read();
    const filtered = devices.filter(d => d.deviceId !== deviceId);
    if (filtered.length === devices.length) throw new Error(`Device ${deviceId} not found`);
    await this.write(filtered);
  }

  async updateLastOnlineAt(registrationId: string, timestamp: string): Promise<void> {
    const devices = await this.read();
    const idx = devices.findIndex(d => d.registrationId === registrationId);
    if (idx !== -1) {
      devices[idx] = { ...devices[idx], lastOnlineAt: timestamp };
      await this.write(devices);
    }
  }
}

// ─── Device Groups ────────────────────────────────────────────────────────────

export class JsonDeviceGroupRepository implements IDeviceGroupRepository {
  private filePath: string;

  constructor(filePath = path.join(DATA_DIR, 'device-groups.json')) {
    this.filePath = filePath;
    // Ensure file exists
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify({ groups: [] }, null, 2), 'utf-8');
    }
  }

  private read(): any[] {
    try {
      return JSON.parse(fs.readFileSync(this.filePath, 'utf-8')).groups || [];
    } catch {
      return [];
    }
  }

  private write(groups: any[]): void {
    fs.writeFileSync(this.filePath, JSON.stringify({ groups }, null, 2), 'utf-8');
  }

  async findAll(): Promise<any[]> {
    return this.read();
  }

  async findById(id: string): Promise<any | null> {
    return this.read().find((g: any) => g.id === id) || null;
  }

  async save(groups: any[]): Promise<void> {
    this.write(groups);
  }
}
