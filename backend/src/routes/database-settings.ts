/**
 * database-settings.ts
 *
 * Handles:
 *  POST /api/database/test      — test a DB connection (does NOT save)
 *  GET  /api/database/config    — return current saved config (password masked)
 *  POST /api/database/save      — persist config to data/db-config.json
 *  POST /api/database/migrate   — run CREATE TABLE IF NOT EXISTS for all app tables
 */

import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import logger from '../utils/logger';
import RepositoryFactory from '../repositories/RepositoryFactory';

const router = express.Router();

const CONFIG_FILE = path.join(__dirname, '..', '..', 'data', 'db-config.json');

// ─── Schema definitions ───────────────────────────────────────────────────────
// Each entry: { name, createSQL(dbType) }
// The SQL is written for each dialect.

interface TableDef {
  name: string;
  /** Return CREATE TABLE IF NOT EXISTS statement for the given dialect */
  sql: (dialect: DbType) => string;
}

type DbType = 'sqlserver' | 'mysql' | 'postgresql' | 'mongodb';

/** SQL Server does not support CREATE TABLE IF NOT EXISTS — the tableExists() guard handles that */
function createTable(dialect: DbType) {
  return dialect === 'sqlserver' ? 'CREATE TABLE' : 'CREATE TABLE IF NOT EXISTS';
}

/** All app tables use string UUIDs as primary keys — no auto-increment needed */
function pkDef(_dialect: DbType) {
  return 'VARCHAR(64) PRIMARY KEY';
}

function varcharMax(dialect: DbType) {
  return dialect === 'sqlserver' ? 'NVARCHAR(MAX)' : 'TEXT';
}

function datetime(dialect: DbType) {
  return dialect === 'sqlserver' ? 'DATETIME2' : 'TIMESTAMP';
}

function boolDef(dialect: DbType) {
  return dialect === 'sqlserver' ? 'BIT' : 'BOOLEAN';
}

const TABLES: TableDef[] = [
  {
    name: 'persons',
    sql: (d) => `
${createTable(d)} persons (
  id              ${pkDef(d)},
  person_id       VARCHAR(64)   NOT NULL UNIQUE,
  name            VARCHAR(255)  NOT NULL,
  card_number     VARCHAR(64),
  face_image_path VARCHAR(512),
  password        VARCHAR(128),
  group_id        VARCHAR(64),
  department      VARCHAR(64),
  created_at      ${datetime(d)} NOT NULL,
  updated_at      ${datetime(d)} NOT NULL
);`.trim(),
  },
  {
    name: 'employees',
    sql: (d) => `
${createTable(d)} employees (
  id                   VARCHAR(64)    PRIMARY KEY,
  person_id            VARCHAR(64)    NOT NULL UNIQUE,
  name                 VARCHAR(255)   NOT NULL,
  department           VARCHAR(64),
  group_id             VARCHAR(64),
  card_numbers         ${varcharMax(d)},
  face_picture         VARCHAR(512),
  profile_picture      VARCHAR(512),
  password             VARCHAR(128),
  fingerprints         ${varcharMax(d)},
  gender               VARCHAR(16),
  title                VARCHAR(32),
  nickname             VARCHAR(128),
  date_of_birth        VARCHAR(32),
  phone                VARCHAR(64),
  occupation           VARCHAR(128),
  email                VARCHAR(255),
  address              ${varcharMax(d)},
  remarks              ${varcharMax(d)},
  effective_start      ${datetime(d)},
  effective_end        ${datetime(d)},
  created_at           ${datetime(d)} NOT NULL,
  updated_at           ${datetime(d)} NOT NULL
);`.trim(),
  },
  {
    name: 'employee_groups',
    sql: (d) => `
${createTable(d)} employee_groups (
  id          VARCHAR(64)   PRIMARY KEY,
  name        VARCHAR(255)  NOT NULL,
  description ${varcharMax(d)},
  parent_id   VARCHAR(64),
  created_at  ${datetime(d)} NOT NULL
);`.trim(),
  },
  {
    name: 'devices',
    sql: (d) => `
${createTable(d)} devices (
  id               ${pkDef(d)},
  registration_id  VARCHAR(64)   NOT NULL UNIQUE,
  name             VARCHAR(255)  NOT NULL,
  ip               VARCHAR(64),
  port             INT,
  serial           VARCHAR(128),
  username         VARCHAR(128),
  password         VARCHAR(128),
  status           VARCHAR(32)   DEFAULT 'Offline',
  group_id         VARCHAR(64),
  created_at       ${datetime(d)} NOT NULL,
  updated_at       ${datetime(d)} NOT NULL
);`.trim(),
  },
  {
    name: 'access_rules',
    sql: (d) => `
${createTable(d)} access_rules (
  id                   VARCHAR(64)   PRIMARY KEY,
  name                 VARCHAR(255)  NOT NULL,
  employee_group_ids   ${varcharMax(d)} NOT NULL,
  person_ids           ${varcharMax(d)} NOT NULL,
  device_ids           ${varcharMax(d)} NOT NULL,
  created_at           ${datetime(d)} NOT NULL,
  updated_at           ${datetime(d)} NOT NULL
);`.trim(),
  },
  {
    name: 'sync_queue',
    sql: (d) => `
${createTable(d)} sync_queue (
  id               VARCHAR(64)   PRIMARY KEY,
  rule_id          VARCHAR(64),
  rule_name        VARCHAR(255),
  person_id        VARCHAR(64)   NOT NULL,
  person_name      VARCHAR(255),
  device_id        VARCHAR(64)   NOT NULL,
  device_name      VARCHAR(255),
  operation        VARCHAR(16)   NOT NULL,
  status           VARCHAR(32)   NOT NULL,
  attempts         INT           DEFAULT 0,
  max_attempts     INT           DEFAULT 3,
  fail_reason      ${varcharMax(d)},
  history          ${varcharMax(d)},
  created_at       ${datetime(d)} NOT NULL,
  last_attempt_at  ${datetime(d)},
  completed_at     ${datetime(d)}
);`.trim(),
  },
  {
    name: 'access_records',
    sql: (d) => `
${createTable(d)} access_records (
  id                  ${pkDef(d)},
  registration_id     VARCHAR(64),
  device_id_internal  VARCHAR(64),
  device_name         VARCHAR(255),
  record_number       INT           DEFAULT 0,
  user_id             VARCHAR(64),
  user_name           VARCHAR(255),
  card_number         VARCHAR(64),
  swipe_time          ${datetime(d)},
  door_number         INT           DEFAULT 0,
  reader_no           VARCHAR(32),
  card_type           VARCHAR(64),
  open_method         VARCHAR(64),
  status              VARCHAR(32)   DEFAULT 'Failed',
  stored_at           ${datetime(d)} NOT NULL
);`.trim(),
  },
  {
    name: 'device_groups',
    sql: (d) => `
${createTable(d)} device_groups (
  id          VARCHAR(64)   PRIMARY KEY,
  name        VARCHAR(255)  NOT NULL,
  parent_id   VARCHAR(64),
  created_at  ${datetime(d)} NOT NULL
);`.trim(),
  },
  {
    name: 'access_events',
    sql: (d) => `
${createTable(d)} access_events (
  id         VARCHAR(64)    PRIMARY KEY,
  type       VARCHAR(64)    NOT NULL,
  device_id  VARCHAR(64)    NOT NULL,
  timestamp  ${datetime(d)} NOT NULL,
  data       ${varcharMax(d)},
  stored_at  ${datetime(d)} NOT NULL
);`.trim(),
  },
  {
    name: 'attendance_periods',
    sql: (d) => `
${createTable(d)} attendance_periods (
  id                 VARCHAR(64)    PRIMARY KEY,
  name               VARCHAR(255)   NOT NULL,
  mode               VARCHAR(32),
  start_time         VARCHAR(10),
  end_time           VARCHAR(10),
  required_work_time INT,
  rules              ${varcharMax(d)},
  breaks             ${varcharMax(d)},
  status             VARCHAR(32)    DEFAULT 'ACTIVE',
  created_at         ${datetime(d)} NOT NULL,
  updated_at         ${datetime(d)} NOT NULL
);`.trim(),
  },
  {
    name: 'attendance_breaks',
    sql: (d) => `
${createTable(d)} attendance_breaks (
  id                 VARCHAR(64)    PRIMARY KEY,
  name               VARCHAR(255)   NOT NULL,
  start_time         VARCHAR(10)    NOT NULL,
  end_time           VARCHAR(10)    NOT NULL,
  must_check_in_out  ${boolDef(d)}  DEFAULT ${d === 'sqlserver' ? '1' : 'TRUE'},
  valid_start_time   VARCHAR(10),
  valid_end_time     VARCHAR(10),
  duration_limit     ${boolDef(d)}  DEFAULT ${d === 'sqlserver' ? '0' : 'FALSE'},
  duration_minutes   INT            DEFAULT 120,
  late_type          VARCHAR(32),
  created_at         ${datetime(d)} NOT NULL
);`.trim(),
  },
  {
    name: 'attendance_rules_settings',
    sql: (d) => `
${createTable(d)} attendance_rules_settings (
  id                          VARCHAR(64)   PRIMARY KEY,
  rounding_rule               VARCHAR(32)   DEFAULT 'roundDown',
  must_check_in_out_for_leave ${boolDef(d)} DEFAULT ${d === 'sqlserver' ? '1' : 'TRUE'},
  updated_at                  ${datetime(d)}
);`.trim(),
  },
  {
    name: 'attendance_shifts',
    sql: (d) => `
${createTable(d)} attendance_shifts (
  id               VARCHAR(64)    PRIMARY KEY,
  name             VARCHAR(255)   NOT NULL,
  period_id        VARCHAR(64),
  period_name      VARCHAR(255),
  loop_mode        VARCHAR(32),
  number_of_cycles INT,
  work_days        ${varcharMax(d)},
  created_at       ${datetime(d)} NOT NULL,
  updated_at       ${datetime(d)} NOT NULL
);`.trim(),
  },
  {
    name: 'attendance_schedules',
    sql: (d) => `
${createTable(d)} attendance_schedules (
  id           VARCHAR(64)    PRIMARY KEY,
  shift_id     VARCHAR(64),
  shift_name   VARCHAR(255),
  start_date   VARCHAR(32),
  end_date     VARCHAR(32),
  members      ${varcharMax(d)},
  created_at   ${datetime(d)} NOT NULL,
  updated_at   ${datetime(d)} NOT NULL
);`.trim(),
  },
  {
    name: 'attendance_holidays',
    sql: (d) => `
${createTable(d)} attendance_holidays (
  id         VARCHAR(64)    PRIMARY KEY,
  name       VARCHAR(255)   NOT NULL,
  date       VARCHAR(32)    NOT NULL,
  recurring  ${d === 'postgresql' ? 'BOOLEAN' : 'TINYINT'} DEFAULT 0,
  type       VARCHAR(32),
  created_at ${datetime(d)} NOT NULL
);`.trim(),
  },
  {
    name: 'attendance_leave_types',
    sql: (d) => `
${createTable(d)} attendance_leave_types (
  id                VARCHAR(64)    PRIMARY KEY,
  name              VARCHAR(255)   NOT NULL,
  paid_leave        ${d === 'postgresql' ? 'BOOLEAN' : 'TINYINT'} DEFAULT 1,
  days_per_year     INT            DEFAULT 0,
  carry_over        ${d === 'postgresql' ? 'BOOLEAN' : 'TINYINT'} DEFAULT 0,
  requires_approval ${d === 'postgresql' ? 'BOOLEAN' : 'TINYINT'} DEFAULT 1,
  color             VARCHAR(32),
  assigned_to       ${varcharMax(d)},
  created_at        ${datetime(d)} NOT NULL
);`.trim(),
  },
  {
    name: 'attendance_leave_records',
    sql: (d) => `
${createTable(d)} attendance_leave_records (
  id                VARCHAR(64)    PRIMARY KEY,
  employee_id       VARCHAR(64)    NOT NULL,
  employee_name     VARCHAR(255)   NOT NULL,
  leave_type_id     VARCHAR(64)    NOT NULL,
  leave_type_name   VARCHAR(255)   NOT NULL,
  leave_type_color  VARCHAR(32),
  start_date        VARCHAR(32)    NOT NULL,
  end_date          VARCHAR(32)    NOT NULL,
  days              INT            NOT NULL DEFAULT 1,
  notes             ${varcharMax(d)},
  status            VARCHAR(32)    DEFAULT 'approved',
  created_at        ${datetime(d)} NOT NULL,
  updated_at        ${datetime(d)} NOT NULL
);`.trim(),
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

export interface DbConfig {
  type: DbType;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  useSSL?: boolean;
}

// ─── Column migrations (add missing columns to existing tables) ───────────────
// These run AFTER table creation to add columns introduced in schema updates.
// Each entry is idempotent: we check if the column exists before ALTERing.

interface ColumnMigration {
  table: string;
  column: string;
  sql: (dialect: DbType) => string;  // full ALTER TABLE ... ADD COLUMN ... statement
}

const COLUMN_MIGRATIONS: ColumnMigration[] = [
  { table: 'employees', column: 'card_numbers',      sql: d => `ALTER TABLE employees ADD card_numbers ${varcharMax(d)}` },
  { table: 'employees', column: 'face_picture',      sql: _d => `ALTER TABLE employees ADD face_picture VARCHAR(512)` },
  { table: 'employees', column: 'profile_picture',   sql: _d => `ALTER TABLE employees ADD profile_picture VARCHAR(512)` },
  { table: 'employees', column: 'fingerprints',      sql: d => `ALTER TABLE employees ADD fingerprints ${varcharMax(d)}` },
  { table: 'employees', column: 'gender',            sql: _d => `ALTER TABLE employees ADD gender VARCHAR(16)` },
  { table: 'employees', column: 'title',             sql: _d => `ALTER TABLE employees ADD title VARCHAR(32)` },
  { table: 'employees', column: 'nickname',          sql: _d => `ALTER TABLE employees ADD nickname VARCHAR(128)` },
  { table: 'employees', column: 'date_of_birth',     sql: _d => `ALTER TABLE employees ADD date_of_birth VARCHAR(32)` },
  { table: 'employees', column: 'phone',             sql: _d => `ALTER TABLE employees ADD phone VARCHAR(64)` },
  { table: 'employees', column: 'occupation',        sql: _d => `ALTER TABLE employees ADD occupation VARCHAR(128)` },
  { table: 'employees', column: 'email',             sql: _d => `ALTER TABLE employees ADD email VARCHAR(255)` },
  { table: 'employees', column: 'address',           sql: d => `ALTER TABLE employees ADD address ${varcharMax(d)}` },
  { table: 'employees', column: 'remarks',           sql: d => `ALTER TABLE employees ADD remarks ${varcharMax(d)}` },
  { table: 'employees', column: 'group_id',          sql: _d => `ALTER TABLE employees ADD group_id VARCHAR(64)` },
  { table: 'devices',        column: 'group_id',          sql: _d => `ALTER TABLE devices ADD group_id VARCHAR(64)` },
  { table: 'devices',        column: 'serial',             sql: _d => `ALTER TABLE devices ADD serial VARCHAR(128)` },
  { table: 'devices',        column: 'last_online_at',     sql: d  => `ALTER TABLE devices ADD last_online_at ${d === 'mysql' ? 'DATETIME' : d === 'postgresql' ? 'TIMESTAMPTZ' : 'DATETIME2'}` },
  { table: 'access_records', column: 'device_name',        sql: _d => `ALTER TABLE access_records ADD device_name VARCHAR(255)` },
  // Schema v2: rename old device_id → registration_id, add device_id_internal
  { table: 'access_records', column: 'registration_id',    sql: _d => `ALTER TABLE access_records ADD registration_id VARCHAR(64)` },
  { table: 'access_records', column: 'device_id_internal', sql: _d => `ALTER TABLE access_records ADD device_id_internal VARCHAR(64)` },
];

// ─── Index migrations ─────────────────────────────────────────────────────────
// Unique indexes that enforce dedup at the DB level (race-condition safety).
interface IndexMigration {
  name: string;   // index name — used to check existence
  table: string;
  sql: (dialect: DbType) => string;
}

const INDEX_MIGRATIONS: IndexMigration[] = [
  {
    // Guarantees one row per (device, swipe moment, user).
    // - Handles 100 devices swiping at the same second: registration_id differs → no collision.
    // - Handles 2 people on the same door same second: user_id differs → both stored.
    // - Race condition safety: concurrent INSERTs for identical swipes → only one succeeds.
    // user_id is coalesced to '' for NULL values (ISNULL/COALESCE per dialect).
    name:  'uq_access_records_swipe',
    table: 'access_records',
    sql: (d) => {
      if (d === 'sqlserver') {
        return `CREATE UNIQUE INDEX uq_access_records_swipe ON access_records (registration_id, swipe_time, ISNULL(user_id, '')) WHERE registration_id IS NOT NULL AND swipe_time IS NOT NULL`;
      }
      if (d === 'mysql') {
        // MySQL: filtered indexes not supported, use a generated column or just index normally
        // COALESCE in index expression supported in MySQL 8+
        return `CREATE UNIQUE INDEX uq_access_records_swipe ON access_records (registration_id, swipe_time, user_id)`;
      }
      // postgresql
      return `CREATE UNIQUE INDEX uq_access_records_swipe ON access_records (registration_id, swipe_time, COALESCE(user_id, '')) WHERE registration_id IS NOT NULL AND swipe_time IS NOT NULL`;
    },
  },
];
function loadConfig(): DbConfig | null {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return null;
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

function saveConfig(cfg: DbConfig): void {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
}

// ─── Connection tester ────────────────────────────────────────────────────────

async function testConnection(cfg: DbConfig): Promise<{ success: boolean; message: string; version?: string }> {
  if (cfg.type === 'mongodb') {
    const { MongoClient } = await import('mongodb');
    const uri = `mongodb://${cfg.user ? `${encodeURIComponent(cfg.user)}:${encodeURIComponent(cfg.password)}@` : ''}${cfg.host}:${cfg.port}/${cfg.database}`;
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    try {
      await client.connect();
      const info = await client.db().admin().serverInfo();
      await client.close();
      return { success: true, message: 'Connected successfully', version: `MongoDB ${info.version}` };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  if (cfg.type === 'sqlserver') {
    const mssql = await import('mssql');
    // Use an isolated ConnectionPool (NOT mssql.connect) so closing it
    // does NOT destroy the shared global pool used by the repositories.
    const pool = new mssql.ConnectionPool({
      server: cfg.host,
      port: cfg.port,
      database: cfg.database,
      user: cfg.user,
      password: cfg.password,
      options: { encrypt: cfg.useSSL ?? false, trustServerCertificate: true, connectTimeout: 5000 },
    });
    await pool.connect();
    const result = await pool.request().query('SELECT @@VERSION AS version');
    const version = (result.recordset[0] as any)?.version?.split('\n')[0] ?? 'SQL Server';
    await pool.close();
    return { success: true, message: 'Connected successfully', version };
  }

  if (cfg.type === 'mysql') {
    const mysql = await import('mysql2/promise');
    const conn = await mysql.createConnection({
      host: cfg.host, port: cfg.port, database: cfg.database,
      user: cfg.user, password: cfg.password, connectTimeout: 5000,
      ssl: cfg.useSSL ? {} : undefined,
    });
    const [rows] = await conn.query('SELECT VERSION() AS version');
    const version = (rows as any[])[0]?.version ?? 'MySQL';
    await conn.end();
    return { success: true, message: 'Connected successfully', version: `MySQL ${version}` };
  }

  if (cfg.type === 'postgresql') {
    const { Client } = await import('pg');
    const client = new Client({
      host: cfg.host, port: cfg.port, database: cfg.database,
      user: cfg.user, password: cfg.password, connectionTimeoutMillis: 5000,
      ssl: cfg.useSSL ? { rejectUnauthorized: false } : undefined,
    });
    await client.connect();
    const res = await client.query('SELECT version()');
    const version = res.rows[0]?.version?.split(',')[0] ?? 'PostgreSQL';
    await client.end();
    return { success: true, message: 'Connected successfully', version };
  }

  return { success: false, message: 'Unknown database type' };
}

// ─── Table runner ─────────────────────────────────────────────────────────────

interface MigrateResult {
  table: string;
  status: 'created' | 'exists' | 'error';
  error?: string;
}

async function runMigrations(cfg: DbConfig): Promise<MigrateResult[]> {
  const results: MigrateResult[] = [];

  if (cfg.type === 'mongodb') {
    // MongoDB: ensure collections exist
    const { MongoClient } = await import('mongodb');
    const uri = `mongodb://${cfg.user ? `${encodeURIComponent(cfg.user)}:${encodeURIComponent(cfg.password)}@` : ''}${cfg.host}:${cfg.port}/${cfg.database}`;
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db(cfg.database);
    const existing = (await db.listCollections().toArray()).map(c => c.name);
    const collections = ['persons', 'employees', 'employee_groups', 'devices', 'access_rules', 'sync_queue', 'access_records'];
    for (const name of collections) {
      if (existing.includes(name)) {
        results.push({ table: name, status: 'exists' });
      } else {
        await db.createCollection(name);
        results.push({ table: name, status: 'created' });
      }
    }
    await client.close();
    return results;
  }

  // SQL databases — run CREATE TABLE IF NOT EXISTS per table
  const execSQL = await buildSQLExecutor(cfg);

  for (const table of TABLES) {
    const sql = table.sql(cfg.type);
    try {
      const existsBefore = await execSQL.tableExists(table.name);
      if (existsBefore) {
        results.push({ table: table.name, status: 'exists' });
      } else {
        await execSQL.run(sql);
        results.push({ table: table.name, status: 'created' });

        // ── Seed default rows for freshly-created tables ──────────────────
        if (table.name === 'employee_groups') {
          const now = new Date().toISOString();
          await execSQL.run(
            cfg.type === 'sqlserver'
              ? `INSERT INTO employee_groups (id, name, description, parent_id, created_at) VALUES ('all', 'All Employees', 'Default group — all employees', NULL, '${now}')`
              : `INSERT INTO employee_groups (id, name, description, parent_id, created_at) VALUES ('all', 'All Employees', 'Default group — all employees', NULL, '${now}')`
          );
          logger.info('[Migration] Seeded default employee group "All Employees"');
        }

        if (table.name === 'device_groups') {
          const now = new Date().toISOString();
          await execSQL.run(
            `INSERT INTO device_groups (id, name, parent_id, created_at) VALUES ('all', 'All Devices', NULL, '${now}')`
          );
          logger.info('[Migration] Seeded default device group "All Devices"');
        }
      }
    } catch (err: any) {
      results.push({ table: table.name, status: 'error', error: err.message });
    }
  }

  // Run column migrations (add missing columns to existing tables)
  for (const cm of COLUMN_MIGRATIONS) {
    try {
      const hasCol = await execSQL.columnExists(cm.table, cm.column);
      if (!hasCol) {
        await execSQL.run(cm.sql(cfg.type));
        logger.info(`[Migration] Added column ${cm.table}.${cm.column}`);
      }
    } catch (err: any) {
      logger.warn(`[Migration] Failed to add column ${cm.table}.${cm.column}: ${err.message}`);
    }
  }

  // Run index migrations (unique constraints for race-condition safety)
  for (const im of INDEX_MIGRATIONS) {
    try {
      const hasIdx = await execSQL.indexExists(im.name, im.table);
      if (!hasIdx) {
        await execSQL.run(im.sql(cfg.type));
        logger.info(`[Migration] Created index ${im.name} on ${im.table}`);
      }
    } catch (err: any) {
      logger.warn(`[Migration] Failed to create index ${im.name}: ${err.message}`);
    }
  }

  await execSQL.close();
  return results;
}

// Build a unified SQL executor for the three SQL dialects
async function buildSQLExecutor(cfg: DbConfig) {
  if (cfg.type === 'sqlserver') {
    const mssql = await import('mssql');
    // Use an isolated ConnectionPool (NOT mssql.connect) so closing it
    // does NOT destroy the shared global pool used by DatabaseConnection.
    const pool = new mssql.ConnectionPool({
      server: cfg.host, port: cfg.port, database: cfg.database, user: cfg.user, password: cfg.password,
      options: { encrypt: cfg.useSSL ?? false, trustServerCertificate: true },
    });
    await pool.connect();
    return {
      tableExists: async (name: string) => {
        const r = await pool.request().query(
          `SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='${name}'`
        );
        return r.recordset.length > 0;
      },
      columnExists: async (table: string, column: string) => {
        const r = await pool.request().query(
          `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='${table}' AND COLUMN_NAME='${column}'`
        );
        return r.recordset.length > 0;
      },
      indexExists: async (indexName: string, _table: string) => {
        const r = await pool.request().query(
          `SELECT 1 FROM sys.indexes WHERE name='${indexName}'`
        );
        return r.recordset.length > 0;
      },
      run: async (sql: string) => pool.request().query(sql),
      close: async () => pool.close(),
    };
  }

  if (cfg.type === 'mysql') {
    const mysql = await import('mysql2/promise');
    const conn = await mysql.createConnection({
      host: cfg.host, port: cfg.port, database: cfg.database, user: cfg.user, password: cfg.password,
      ssl: cfg.useSSL ? {} : undefined,
    });
    return {
      tableExists: async (name: string) => {
        const [rows] = await conn.query(
          `SELECT 1 FROM information_schema.tables WHERE table_schema=? AND table_name=?`,
          [cfg.database, name],
        );
        return (rows as any[]).length > 0;
      },
      columnExists: async (table: string, column: string) => {
        const [rows] = await conn.query(
          `SELECT 1 FROM information_schema.columns WHERE table_schema=? AND table_name=? AND column_name=?`,
          [cfg.database, table, column],
        );
        return (rows as any[]).length > 0;
      },
      indexExists: async (indexName: string, table: string) => {
        const [rows] = await conn.query(
          `SELECT 1 FROM information_schema.statistics WHERE table_schema=? AND table_name=? AND index_name=?`,
          [cfg.database, table, indexName],
        );
        return (rows as any[]).length > 0;
      },
      run: async (sql: string) => conn.query(sql),
      close: async () => conn.end(),
    };
  }

  // postgresql
  const { Client } = await import('pg');
  const client = new Client({
    host: cfg.host, port: cfg.port, database: cfg.database, user: cfg.user, password: cfg.password,
    ssl: cfg.useSSL ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  return {
    tableExists: async (name: string) => {
      const r = await client.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
        [name],
      );
      return r.rows.length > 0;
    },
    columnExists: async (table: string, column: string) => {
      const r = await client.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
        [table, column],
      );
      return r.rows.length > 0;
    },
    indexExists: async (indexName: string, _table: string) => {
      const r = await client.query(
        `SELECT 1 FROM pg_indexes WHERE indexname=$1`,
        [indexName],
      );
      return r.rows.length > 0;
    },
    run: async (sql: string) => client.query(sql),
    close: async () => client.end(),
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/** GET /api/database/config — return current config (password masked) */
router.get('/config', (_req: Request, res: Response) => {
  const cfg = loadConfig();
  if (!cfg) return res.json({ success: true, config: null });
  res.json({
    success: true,
    config: { ...cfg, password: cfg.password ? '••••••••' : '' },
  });
});

/** POST /api/database/test — test connection without saving */
router.post('/test', async (req: Request, res: Response) => {
  const cfg: DbConfig = req.body;
  if (!cfg.type || !cfg.host || !cfg.database) {
    return res.status(400).json({ success: false, message: 'type, host, and database are required' });
  }
  // If password is masked (user re-tested with existing saved config), load real password
  if (cfg.password === '••••••••') {
    const saved = loadConfig();
    if (saved) cfg.password = saved.password;
  }
  try {
    const result = await testConnection(cfg);
    res.json(result);
  } catch (err: any) {
    logger.error('[DB Settings] Test connection error:', err.message);
    res.json({ success: false, message: err.message });
  }
});

/** POST /api/database/save — save config and run migrations */
router.post('/save', async (req: Request, res: Response) => {
  const cfg: DbConfig = req.body;
  if (!cfg.type || !cfg.host || !cfg.database) {
    return res.status(400).json({ success: false, message: 'type, host, and database are required' });
  }
  // Unmask password if needed
  if (cfg.password === '••••••••') {
    const saved = loadConfig();
    if (saved) cfg.password = saved.password;
  }
  try {
    // Verify connection before saving
    const testResult = await testConnection(cfg);
    if (!testResult.success) {
      return res.status(400).json({ success: false, message: `Connection failed: ${testResult.message}` });
    }

    // Save config
    saveConfig(cfg);
    logger.info(`[DB Settings] Config saved — type:${cfg.type} host:${cfg.host} db:${cfg.database}`);

    // Re-initialize the repository factory with the new connection
    await RepositoryFactory.reinitialize();
    logger.info('[DB Settings] RepositoryFactory re-initialized');

    // Run migrations
    const migrations = await runMigrations(cfg);
    const created = migrations.filter(m => m.status === 'created').length;
    const existed = migrations.filter(m => m.status === 'exists').length;
    const errors  = migrations.filter(m => m.status === 'error').length;

    logger.info(`[DB Settings] Migrations — ${created} created, ${existed} already existed, ${errors} errors`);

    res.json({
      success: true,
      message: `Configuration saved. ${created} table(s) created, ${existed} already existed.`,
      version: testResult.version,
      migrations,
    });
  } catch (err: any) {
    logger.error('[DB Settings] Save error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

/** POST /api/database/migrate — run migrations only (config must already be saved) */
router.post('/migrate', async (_req: Request, res: Response) => {
  const cfg = loadConfig();
  if (!cfg) return res.status(400).json({ success: false, message: 'No database configuration saved yet.' });
  try {
    const migrations = await runMigrations(cfg);
    res.json({ success: true, migrations });
  } catch (err: any) {
    logger.error('[DB Settings] Migration error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

/** GET /api/database/status — returns which backend is currently active */
router.get('/status', (_req: Request, res: Response) => {
  const cfg = loadConfig();
  const backend = RepositoryFactory.getBackend();
  res.json({
    backend,
    initialized: RepositoryFactory.isInitialized(),
    type: cfg?.type ?? null,
    host: cfg?.host ?? null,
    database: cfg?.database ?? null,
  });
});

export default router;

/**
 * Run schema migrations automatically at server startup.
 * Only applies when a SQL database is configured.
 * Safe to call every time — all operations are idempotent.
 */
export async function autoMigrateOnStartup(): Promise<void> {
  const cfg = loadConfig();
  if (!cfg || cfg.type === 'mongodb') return;   // JSON or MongoDB — no SQL migrations needed
  try {
    const results = await runMigrations(cfg);
    const created = results.filter(r => r.status === 'created').map(r => r.table);
    const errors  = results.filter(r => r.status === 'error');
    if (created.length) logger.info(`[AutoMigrate] Created tables: ${created.join(', ')}`);
    if (errors.length)  logger.warn(`[AutoMigrate] Errors: ${errors.map(r => `${r.table}: ${r.error}`).join('; ')}`);

    // ── Data cleanup: null-out SDK sentinel dates (1970/1900/0000) ──────────
    // These are stored when Dahua device returns zero-initialized NET_TIME structs.
    try {
      const execSQL = await buildSQLExecutor(cfg);
      await execSQL.run(
        cfg.type === 'sqlserver'
          ? `UPDATE employees SET effective_start = NULL WHERE effective_start < '2000-01-01'`
          : `UPDATE employees SET effective_start = NULL WHERE effective_start < '2000-01-01 00:00:00'`
      );
      await execSQL.run(
        cfg.type === 'sqlserver'
          ? `UPDATE employees SET effective_end = NULL WHERE effective_end < '2000-01-01'`
          : `UPDATE employees SET effective_end = NULL WHERE effective_end < '2000-01-01 00:00:00'`
      );
      await execSQL.close();
      logger.info('[AutoMigrate] Cleaned up SDK sentinel dates.');
    } catch (cleanErr: any) {
      logger.warn(`[AutoMigrate] Date cleanup skipped: ${cleanErr.message}`);
    }

    // ── Backfill access_records: old device_id column stored the device serial ──
    // Match serial → devices table to get proper registration_id and internal device id.
    try {
      const execSQL = await buildSQLExecutor(cfg);

      // Step 1: where a devices row has a matching serial, use its registration_id + id
      await execSQL.run(
        cfg.type === 'sqlserver'
          ? `UPDATE ar
             SET ar.registration_id   = d.registration_id,
                 ar.device_id_internal = d.id
             FROM access_records ar
             INNER JOIN devices d ON d.serial = ar.device_id
             WHERE ar.registration_id IS NULL`
          : `UPDATE access_records ar
             INNER JOIN devices d ON d.serial = ar.device_id
             SET ar.registration_id   = d.registration_id,
                 ar.device_id_internal = d.id
             WHERE ar.registration_id IS NULL`
      );

      // Step 2: for rows still unmatched (no device with that serial), store the
      // serial in registration_id as a best-effort placeholder so the column is
      // never NULL — it can be corrected manually if needed.
      await execSQL.run(
        `UPDATE access_records SET registration_id = device_id WHERE registration_id IS NULL AND device_id IS NOT NULL`
      );

      await execSQL.close();
      logger.info('[AutoMigrate] Backfilled access_records registration_id/device_id_internal from devices table.');
    } catch (backfillErr: any) {
      logger.warn(`[AutoMigrate] access_records backfill skipped: ${backfillErr.message}`);
    }

    logger.info('[AutoMigrate] Schema up-to-date.');
  } catch (err: any) {
    logger.warn(`[AutoMigrate] Migration skipped: ${err.message}`);
  }
}
