/**
 * SqlDeviceRepository.ts
 *
 * SQL implementations of IDeviceRepository and IDeviceGroupRepository.
 *
 * Uses the IDbConnection wrapper for dialect-agnostic queries
 * (SQL Server, MySQL, PostgreSQL).
 */

import { IDbConnection } from './DatabaseConnection';
import { IDeviceRepository, IDeviceGroupRepository } from './IDeviceRepository';
import { Device } from '../types';

// ─── datetime helper ──────────────────────────────────────────────────────────
function toDate(v: any): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// ─── row → camelCase ──────────────────────────────────────────────────────────

function rowToDevice(row: any): Device {
  return {
    deviceId:       row.id ?? row.device_id,
    name:           row.name,
    registrationId: row.registration_id,
    username:       row.username  ?? undefined,
    password:       row.password  ?? undefined,
    ip:             row.ip        ?? undefined,
    serial:         row.serial    ?? undefined,
    groupId:        row.group_id  ?? undefined,
    status:         row.status    ?? 'Offline',
    createdAt:      row.created_at instanceof Date ? row.created_at.toISOString() : (row.created_at ?? undefined),
    updatedAt:      row.updated_at instanceof Date ? row.updated_at.toISOString() : (row.updated_at ?? undefined),
  };
}

function rowToGroup(row: any): any {
  return {
    id:        row.id,
    name:      row.name,
    parentId:  row.parent_id  ?? null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : (row.created_at ?? null),
  };
}

// ─── Device Repository ────────────────────────────────────────────────────────

export class SqlDeviceRepository implements IDeviceRepository {
  constructor(private db: IDbConnection) {}

  async findAll(): Promise<Device[]> {
    const rows = await this.db.query('SELECT * FROM devices ORDER BY name');
    return rows.map(rowToDevice);
  }

  async findById(deviceId: string): Promise<Device | undefined> {
    const rows = await this.db.query(
      'SELECT * FROM devices WHERE id = ?',
      [deviceId],
    );
    return rows.length ? rowToDevice(rows[0]) : undefined;
  }

  async findByRegistrationId(registrationId: string): Promise<Device | undefined> {
    const rows = await this.db.query(
      'SELECT * FROM devices WHERE registration_id = ?',
      [registrationId],
    );
    return rows.length ? rowToDevice(rows[0]) : undefined;
  }

  async create(device: Device): Promise<Device> {
    await this.db.query(
      `INSERT INTO devices
         (id, registration_id, name, ip, port, serial, username, password, status, group_id, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        device.deviceId,
        device.registrationId,
        device.name,
        device.ip        ?? null,
        null,
        device.serial    ?? null,
        device.username  ?? null,
        device.password  ?? null,
        device.status    ?? 'Offline',
        device.groupId   ?? null,
        toDate(device.createdAt) ?? new Date(),
        toDate(device.updatedAt) ?? new Date(),
      ],
    );
    return device;
  }

  async update(device: Device): Promise<Device> {
    await this.db.query(
      `UPDATE devices SET
         name=?, ip=?, serial=?, username=?, password=?, status=?, group_id=?, updated_at=?
       WHERE id=?`,
      [
        device.name,
        device.ip       ?? null,
        device.serial   ?? null,
        device.username ?? null,
        device.password ?? null,
        device.status   ?? 'Offline',
        device.groupId  ?? null,
        toDate(device.updatedAt) ?? new Date(),
        device.deviceId,
      ],
    );
    return device;
  }

  async delete(deviceId: string): Promise<void> {
    await this.db.query('DELETE FROM devices WHERE id = ?', [deviceId]);
  }
}

// ─── Device Group Repository ──────────────────────────────────────────────────

export class SqlDeviceGroupRepository implements IDeviceGroupRepository {
  constructor(private db: IDbConnection) {}

  async findAll(): Promise<any[]> {
    const rows = await this.db.query('SELECT * FROM device_groups ORDER BY name');
    return rows.map(rowToGroup);
  }

  async findById(id: string): Promise<any | null> {
    const rows = await this.db.query('SELECT * FROM device_groups WHERE id = ?', [id]);
    return rows.length ? rowToGroup(rows[0]) : null;
  }

  async save(groups: any[]): Promise<void> {
    await this.db.query('DELETE FROM device_groups WHERE 1=1', []);
    for (const g of groups) {
      await this.db.query(
        `INSERT INTO device_groups (id, name, parent_id, created_at) VALUES (?,?,?,?)`,
        [g.id, g.name, g.parentId ?? null, toDate(g.createdAt) ?? new Date()],
      );
    }
  }
}
