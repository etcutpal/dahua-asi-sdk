/**
 * IDeviceRepository.ts — Repository interface for Devices
 *
 * SQL schema hints:
 *
 *   CREATE TABLE devices (
 *     device_id        VARCHAR(64)  PRIMARY KEY,
 *     name             VARCHAR(255) NOT NULL,
 *     registration_id  VARCHAR(64)  NOT NULL UNIQUE,
 *     username         VARCHAR(64)  NOT NULL DEFAULT 'admin',
 *     password         VARCHAR(128) NOT NULL,
 *     ip               VARCHAR(64),
 *     serial           VARCHAR(128),
 *     port             INT          NOT NULL DEFAULT 37777,
 *     stream_port      INT,
 *     created_at       DATETIME     NOT NULL,
 *     updated_at       DATETIME     NOT NULL,
 *     INDEX idx_registration_id (registration_id)
 *   );
 */

import { Device, DeviceInput } from '../types';

export interface IDeviceRepository {
  findAll(): Promise<Device[]>;
  findById(deviceId: string): Promise<Device | undefined>;
  findByRegistrationId(registrationId: string): Promise<Device | undefined>;
  create(device: Device): Promise<Device>;
  update(device: Device): Promise<Device>;
  delete(deviceId: string): Promise<void>;
}

// ─── Device Groups ────────────────────────────────────────────────────────────
// SQL schema hint:
//   CREATE TABLE device_groups (
//     id        VARCHAR(64)   PRIMARY KEY,
//     name      VARCHAR(255)  NOT NULL,
//     parent_id VARCHAR(64)   REFERENCES device_groups(id),
//     created_at DATETIME     NOT NULL
//   );

export interface IDeviceGroupRepository {
  findAll(): Promise<any[]>;
  findById(id: string): Promise<any | null>;
  save(groups: any[]): Promise<void>;
}
