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
import { IDeviceRepository } from './IDeviceRepository';

// ─── JSON implementations (current default) ──────────────────────────────────
import { JsonAccessRuleRepository, JsonSyncQueueRepository } from './JsonAccessRuleRepository';
import { JsonEmployeeRepository, JsonEmployeeGroupRepository, JsonPersonRepository } from './JsonPersonRepository';
import { JsonDeviceRepository } from './JsonDeviceRepository';

// ─── SQL implementations (future — placeholders until implemented) ────────────
// These will be created when you're ready to migrate.
// For now, the factory falls back to JSON if no SQL impl exists.

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

  /**
   * Call once at app startup (in server.ts).
   * Reads the config file and sets up the backend.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

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

    await this.initialize();
    logger.info('[RepositoryFactory] Re-initialized with new database config');
  }

  /** Which backend is currently active */
  getBackend(): StorageBackend { return this.backend; }
  getConnection(): IDbConnection | null { return this.conn; }
  isInitialized(): boolean { return this.initialized; }

  // ── Repository accessors ───────────────────────────────────────────────────
  // Each accessor returns a cached singleton.
  // Right now they all return JSON implementations.
  // When SQL implementations are ready, add them here under `case 'sql':`.

  employees(): IEmployeeRepository {
    if (!this._employees) {
      // future: if (this.backend === 'sql') this._employees = new SqlEmployeeRepository(this.conn!);
      // future: if (this.backend === 'mongodb') this._employees = new MongoEmployeeRepository(this.conn!);
      this._employees = new JsonEmployeeRepository();
      if (this.backend !== 'json') {
        logger.warn('[RepositoryFactory] SQL/Mongo EmployeeRepository not yet implemented — using JSON');
      }
    }
    return this._employees;
  }

  employeeGroups(): IEmployeeGroupRepository {
    if (!this._employeeGroups) {
      this._employeeGroups = new JsonEmployeeGroupRepository();
      if (this.backend !== 'json') {
        logger.warn('[RepositoryFactory] SQL/Mongo EmployeeGroupRepository not yet implemented — using JSON');
      }
    }
    return this._employeeGroups;
  }

  persons(): IPersonRepository {
    if (!this._persons) {
      this._persons = new JsonPersonRepository();
      if (this.backend !== 'json') {
        logger.warn('[RepositoryFactory] SQL/Mongo PersonRepository not yet implemented — using JSON');
      }
    }
    return this._persons;
  }

  accessRules(): IAccessRuleRepository {
    if (!this._accessRules) {
      this._accessRules = new JsonAccessRuleRepository();
      if (this.backend !== 'json') {
        logger.warn('[RepositoryFactory] SQL/Mongo AccessRuleRepository not yet implemented — using JSON');
      }
    }
    return this._accessRules;
  }

  syncQueue(): ISyncQueueRepository {
    if (!this._syncQueue) {
      this._syncQueue = new JsonSyncQueueRepository();
      if (this.backend !== 'json') {
        logger.warn('[RepositoryFactory] SQL/Mongo SyncQueueRepository not yet implemented — using JSON');
      }
    }
    return this._syncQueue;
  }

  devices(): IDeviceRepository {
    if (!this._devices) {
      this._devices = new JsonDeviceRepository();
      if (this.backend !== 'json') {
        logger.warn('[RepositoryFactory] SQL/Mongo DeviceRepository not yet implemented — using JSON');
      }
    }
    return this._devices;
  }
}

export const RepositoryFactory = new RepositoryFactoryClass();
export default RepositoryFactory;
