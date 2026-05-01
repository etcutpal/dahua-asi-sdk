/**
 * RepositoryFactory.ts
 *
 * Single entry-point for getting repository instances.
 * Reads the database config and returns the right implementation:
 *
 *   • No db-config.json         → JsonXxxRepository  (JSON files, current default)
 *   • type: sqlserver/mysql/postgresql → SqlXxxRepository  (SQL via db connection)
 *   • type: mongodb              → MongoXxxRepository (MongoDB collections)
 *
 * How services use it:
 *
 *   // In server.ts startup:
 *   await RepositoryFactory.initialize();
 *
 *   // Anywhere a repo is needed:
 *   const empRepo  = RepositoryFactory.employees();
 *   const grpRepo  = RepositoryFactory.employeeGroups();
 *   const ruleRepo = RepositoryFactory.accessRules();
 *   const sqRepo   = RepositoryFactory.syncQueue();
 *
 * When you want to add a new DB backend later (e.g. SQLite), you only need to:
 *   1. Add a new class that implements the interface
 *   2. Add a case in RepositoryFactory.initialize()
 *   That's it — zero changes to services or routes.
 */

import logger from '../utils/logger';
import dbConnection, { DatabaseConnection, IDbConnection } from './DatabaseConnection';

// ─── Interfaces ──────────────────────────────────────────────────────────────
import { IAccessRuleRepository, ISyncQueueRepository } from './IAccessRuleRepository';
import { IEmployeeRepository, IEmployeeGroupRepository, IPersonRepository } from './IPersonRepository';
import { IDeviceRepository, IDeviceGroupRepository } from './IDeviceRepository';
import { IAccessRepository } from './IAccessRepository';

// ─── JSON implementations (current default) ──────────────────────────────────
import { JsonAccessRuleRepository, JsonSyncQueueRepository } from './JsonAccessRuleRepository';
import { JsonEmployeeRepository, JsonEmployeeGroupRepository, JsonPersonRepository } from './JsonPersonRepository';
import { JsonDeviceRepository, JsonDeviceGroupRepository } from './JsonDeviceRepository';
import FileRepository from './FileRepository';

// ─── SQL implementations ──────────────────────────────────────────────────────
import { SqlPersonRepository, SqlEmployeeRepository, SqlEmployeeGroupRepository } from './SqlPersonRepository';
import { SqlDeviceRepository, SqlDeviceGroupRepository } from './SqlDeviceRepository';
import { SqlAccessRuleRepository, SqlSyncQueueRepository } from './SqlAccessRuleRepository';
import { SqlAccessRecordRepository } from './SqlAccessRecordRepository';

// ─── Attendance repositories ──────────────────────────────────────────────────
import { IAttendanceRepository } from './IAttendanceRepository';
import { JsonAttendanceRepository } from './JsonAttendanceRepository';
import { SqlAttendanceRepository } from './SqlAttendanceRepository';

// ─── Factory ─────────────────────────────────────────────────────────────────

type StorageBackend = 'json' | 'sql' | 'mongodb';

class RepositoryFactoryClass {
  private backend: StorageBackend = 'json';
  private conn: IDbConnection | null = null;
  private initialized = false;

  // ── Singletons ─────────────────────────────────────────────────────────────
  private _employees: IEmployeeRepository | null = null;
  private _employeeGroups: IEmployeeGroupRepository | null = null;
  private _persons: IPersonRepository | null = null;
  private _accessRules: IAccessRuleRepository | null = null;
  private _syncQueue: ISyncQueueRepository | null = null;
  private _devices: IDeviceRepository | null = null;
  private _deviceGroups: IDeviceGroupRepository | null = null;
  private _accessRecords: IAccessRepository | null = null;
  private _attendance: IAttendanceRepository | null = null;

  /**
   * Call once at app startup (in server.ts).
   * Reads the config file and sets up the backend.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Clear any singletons cached before initialize() ran
    // (e.g. AccessRecordService.getInstance() called at module load)
    this._employees     = null;
    this._employeeGroups = null;
    this._persons       = null;
    this._accessRules   = null;
    this._syncQueue     = null;
    this._devices       = null;
    this._deviceGroups  = null;
    this._accessRecords = null;
    this._attendance    = null;

    const cfg = DatabaseConnection.loadConfig();

    if (!cfg) {
      this.backend = 'json';
      logger.info('[RepositoryFactory] Backend: JSON files (no db-config.json found)');
    } else if (cfg.type === 'mongodb') {
      this.conn = await dbConnection.getConnection();
      this.backend = this.conn ? 'mongodb' : 'json';
      logger.info(`[RepositoryFactory] Backend: ${this.backend === 'mongodb' ? 'MongoDB' : 'JSON (MongoDB fallback)'}`);
    } else {
      this.conn = await dbConnection.getConnection();
      this.backend = this.conn ? 'sql' : 'json';
      logger.info(`[RepositoryFactory] Backend: ${this.backend === 'sql' ? cfg.type.toUpperCase() : 'JSON (SQL fallback)'}`);
    }

    this.initialized = true;
  }

  /** Force re-initialize (call after saving new DB config) */
  async reinitialize(): Promise<void> {
    await dbConnection.reset();
    this.conn = null;
    this.initialized = false;

    // Clear cached instances so they're rebuilt with new backend
    this._employees = null;
    this._employeeGroups = null;
    this._persons = null;
    this._accessRules = null;
    this._syncQueue = null;
    this._devices = null;
    this._deviceGroups = null;
    this._accessRecords = null;
    this._attendance = null;

    await this.initialize();
    logger.info('[RepositoryFactory] Re-initialized with new database config');
  }

  /** Which backend is currently active */
  getBackend(): StorageBackend { return this.backend; }
  getConnection(): IDbConnection | null { return this.conn; }
  isInitialized(): boolean { return this.initialized; }

  // ── Repository accessors ───────────────────────────────────────────────────
  // Each accessor returns a cached singleton.
  // SQL/Mongo backends are used when a connection is available.

  employees(): IEmployeeRepository {
    if (!this._employees) {
      this._employees = this.conn && this.backend === 'sql'
        ? new SqlEmployeeRepository(this.conn)
        : new JsonEmployeeRepository();
    }
    return this._employees;
  }

  employeeGroups(): IEmployeeGroupRepository {
    if (!this._employeeGroups) {
      this._employeeGroups = this.conn && this.backend === 'sql'
        ? new SqlEmployeeGroupRepository(this.conn)
        : new JsonEmployeeGroupRepository();
    }
    return this._employeeGroups;
  }

  persons(): IPersonRepository {
    if (!this._persons) {
      this._persons = this.conn && this.backend === 'sql'
        ? new SqlPersonRepository(this.conn)
        : new JsonPersonRepository();
    }
    return this._persons;
  }

  accessRules(): IAccessRuleRepository {
    if (!this._accessRules) {
      this._accessRules = this.conn && this.backend === 'sql'
        ? new SqlAccessRuleRepository(this.conn)
        : new JsonAccessRuleRepository();
    }
    return this._accessRules;
  }

  syncQueue(): ISyncQueueRepository {
    if (!this._syncQueue) {
      this._syncQueue = this.conn && this.backend === 'sql'
        ? new SqlSyncQueueRepository(this.conn)
        : new JsonSyncQueueRepository();
    }
    return this._syncQueue;
  }

  devices(): IDeviceRepository {
    if (!this._devices) {
      this._devices = this.conn && this.backend === 'sql'
        ? new SqlDeviceRepository(this.conn)
        : new JsonDeviceRepository();
    }
    return this._devices;
  }

  deviceGroups(): IDeviceGroupRepository {
    if (!this._deviceGroups) {
      this._deviceGroups = this.conn && this.backend === 'sql'
        ? new SqlDeviceGroupRepository(this.conn)
        : new JsonDeviceGroupRepository();
    }
    return this._deviceGroups;
  }

  accessRecords(): IAccessRepository {
    if (!this._accessRecords) {
      this._accessRecords = this.conn && this.backend === 'sql'
        ? new SqlAccessRecordRepository(this.conn)
        : new FileRepository();
    }
    return this._accessRecords;
  }

  attendance(): IAttendanceRepository {
    if (!this._attendance) {
      this._attendance = this.conn && this.backend === 'sql'
        ? new SqlAttendanceRepository(this.conn)
        : new JsonAttendanceRepository();
    }
    return this._attendance;
  }
}

export const RepositoryFactory = new RepositoryFactoryClass();
export default RepositoryFactory;
