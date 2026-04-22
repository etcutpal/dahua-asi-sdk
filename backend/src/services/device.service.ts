import { Device, DeviceInput } from '../types';
import RepositoryFactory from '../repositories/RepositoryFactory';

class DeviceService {
  private get repo() {
    return RepositoryFactory.devices();
  }

  private generateDeviceId(existing: Device[]): string {
    let id: string;
    let attempts = 0;
    do {
      id = Math.floor(10000000 + Math.random() * 90000000).toString();
      if (++attempts > 100) throw new Error('Unable to generate unique device ID');
    } while (existing.some(d => d.deviceId === id));
    return id;
  }

  async getAll(): Promise<Device[]> {
    return this.repo.findAll();
  }

  async getById(deviceId: string): Promise<Device | undefined> {
    return this.repo.findById(deviceId);
  }

  async create(deviceData: DeviceInput): Promise<Device> {
    const all = await this.repo.findAll();

    if (deviceData.registrationId && all.some(d => d.registrationId === deviceData.registrationId)) {
      throw new Error('Registration ID already exists');
    }

    const device: Device = {
      deviceId:       this.generateDeviceId(all),
      name:           deviceData.name           || '',
      registrationId: deviceData.registrationId || '',
      username:       deviceData.username        || 'admin',
      password:       deviceData.password        || '',
      ip:             deviceData.ip              || '',
      serial:         deviceData.serial          || '',
      createdAt:      new Date().toISOString(),
      updatedAt:      new Date().toISOString(),
    };

    return this.repo.create(device);
  }

  async update(deviceId: string, deviceData: DeviceInput): Promise<Device> {
    const existing = await this.repo.findById(deviceId);
    if (!existing) throw new Error('Device not found');

    const all = await this.repo.findAll();
    if (
      deviceData.registrationId &&
      all.some(d => d.registrationId === deviceData.registrationId && d.deviceId !== deviceId)
    ) {
      throw new Error('Registration ID already exists');
    }

    const updated: Device = {
      ...existing,
      ...deviceData,
      deviceId,
      updatedAt: new Date().toISOString(),
    };

    return this.repo.update(updated);
  }

  async delete(deviceId: string): Promise<Device> {
    const existing = await this.repo.findById(deviceId);
    if (!existing) throw new Error('Device not found');
    await this.repo.delete(deviceId);
    return existing;
  }
}

export default new DeviceService();
