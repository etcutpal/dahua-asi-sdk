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
  id                   VARCHAR(64)   PRIMARY KEY,
  person_id            VARCHAR(64)   NOT NULL UNIQUE,
  name                 VARCHAR(255)  NOT NULL,
  department           VARCHAR(64),
  group_id             VARCHAR(64),
  card_number          VARCHAR(64),
  face_image_path      VARCHAR(512),
  profile_image_path   VARCHAR(512),
  password             VARCHAR(128),
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
  username         VARCHAR(128),
  password         VARCHAR(128),
  status           VARCHAR(32)   DEFAULT 'Offline',
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
  id              ${pkDef(d)},
  event_id        VARCHAR(64)   UNIQUE,
  device_id       VARCHAR(64),
  device_name     VARCHAR(255),
  person_id       VARCHAR(64),
  person_name     VARCHAR(255),
  card_number     VARCHAR(64),
  event_type      VARCHAR(64),
  direction       VARCHAR(16),
  door_number     INT,
  access_result   VARCHAR(32),
  snapshot_path   VARCHAR(512),
  event_time      ${datetime(d)},
  created_at      ${datetime(d)} NOT NULL
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
    const pool = await mssql.connect({
      server: cfg.host,
      port: cfg.port,
      database: cfg.database,
      user: cfg.user,
      password: cfg.password,
      options: { encrypt: cfg.useSSL ?? false, trustServerCertificate: true, connectTimeout: 5000 },
    }).catch((err: any) => { throw err; });
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
      }
    } catch (err: any) {
      results.push({ table: table.name, status: 'error', error: err.message });
    }
  }

  await execSQL.close();
  return results;
}

// Build a unified SQL executor for the three SQL dialects
async function buildSQLExecutor(cfg: DbConfig) {
  if (cfg.type === 'sqlserver') {
    const mssql = await import('mssql');
    const pool = await mssql.connect({
      server: cfg.host, port: cfg.port, database: cfg.database, user: cfg.user, password: cfg.password,
      options: { encrypt: cfg.useSSL ?? false, trustServerCertificate: true },
    });
    return {
      tableExists: async (name: string) => {
        const r = await pool.request().query(
          `SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='${name}'`
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
