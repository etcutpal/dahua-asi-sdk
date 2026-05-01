/**
 * DatabaseConnection.ts
 *
 * Singleton that reads data/db-config.json and provides a live connection
 * to whichever database was configured (SQL Server, MySQL, PostgreSQL, MongoDB).
 *
 * If no config file exists → returns null (app falls back to JSON files).
 *
 * Usage:
 *   const db = await DatabaseConnection.getInstance().getConnection();
 *   if (!db) { /* use JSON repos * / }
 */

import path from 'path';
import fs   from 'fs';
import logger from '../utils/logger';

const CONFIG_FILE = path.join(__dirname, '..', '..', 'data', 'db-config.json');

export type DbType = 'sqlserver' | 'mysql' | 'postgresql' | 'mongodb';

export interface DbConfig {
  type: DbType;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  useSSL?: boolean;
}

// ─── Unified "connection" type ─────────────────────────────────────────────
// Whatever the driver returns, we wrap it in a duck-typed object so the
// factory can use it without knowing the underlying driver.

export interface IDbConnection {
  type: DbType;
  config: DbConfig;
  /** Run a parameterised SQL query — returns rows as plain objects */
  query(sql: string, params?: any[]): Promise<any[]>;
  /** Lightweight liveness check — throws if connection is dead */
  ping(): Promise<void>;
  /** Close / release the connection */
  close(): Promise<void>;
}

// ─── Concrete wrappers ──────────────────────────────────────────────────────

class MssqlConnection implements IDbConnection {
  type: DbType = 'sqlserver';
  config: DbConfig;
  private pool: any;
  constructor(pool: any, config: DbConfig) { this.pool = pool; this.config = config; }
  async query(sql: string, params: any[] = []): Promise<any[]> {
    const req = this.pool.request();
    params.forEach((p, i) => req.input(`p${i}`, p));
    // Replace ? with @p0, @p1 … for mssql named params
    let idx = 0;
    const namedSql = sql.replace(/\?/g, () => `@p${idx++}`);
    const result = await req.query(namedSql);
    return result.recordset;
  }
  async ping(): Promise<void> { await this.pool.request().query('SELECT 1'); }
  async close(): Promise<void> { await this.pool.close(); }
}

class MysqlConnection implements IDbConnection {
  type: DbType = 'mysql';
  config: DbConfig;
  private conn: any;
  constructor(conn: any, config: DbConfig) { this.conn = conn; this.config = config; }
  async query(sql: string, params: any[] = []): Promise<any[]> {
    const [rows] = await this.conn.execute(sql, params);
    return rows as any[];
  }
  async ping(): Promise<void> { await this.conn.ping(); }
  async close(): Promise<void> { await this.conn.end(); }
}

class PgConnection implements IDbConnection {
  type: DbType = 'postgresql';
  config: DbConfig;
  private client: any;
  constructor(client: any, config: DbConfig) { this.client = client; this.config = config; }
  async query(sql: string, params: any[] = []): Promise<any[]> {
    // Convert ? placeholders to $1, $2 … for pg
    let idx = 1;
    const pgSql = sql.replace(/\?/g, () => `$${idx++}`);
    const res = await this.client.query(pgSql, params);
    return res.rows;
  }
  async ping(): Promise<void> { await this.client.query('SELECT 1'); }
  async close(): Promise<void> { await this.client.end(); }
}

class MongoConnection implements IDbConnection {
  type: DbType = 'mongodb';
  config: DbConfig;
  private client: any;
  private db: any;
  constructor(client: any, db: any, config: DbConfig) {
    this.client = client; this.db = db; this.config = config;
  }
  /** For MongoDB, "sql" is actually a JSON string: { collection, op, filter?, doc? } */
  async query(_sql: string, _params?: any[]): Promise<any[]> {
    throw new Error('Use MongoDbConnection.db directly for MongoDB operations');
  }
  /** Expose the raw Mongo db handle for MongoDB-specific repos */
  getDb() { return this.db; }
  async ping(): Promise<void> { await this.client.db('admin').command({ ping: 1 }); }
  async close(): Promise<void> { await this.client.close(); }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

export class DatabaseConnection {
  private static instance: DatabaseConnection;
  private connection: IDbConnection | null = null;
  private connectPromise: Promise<IDbConnection | null> | null = null;

  private constructor() {}

  static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) DatabaseConnection.instance = new DatabaseConnection();
    return DatabaseConnection.instance;
  }

  /** Load config from disk */
  static loadConfig(): DbConfig | null {
    try {
      if (!fs.existsSync(CONFIG_FILE)) return null;
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) as DbConfig;
    } catch {
      return null;
    }
  }

  /**
   * Returns a live connection, or null if no config exists.
   * Caches the connection after first call.
   * Automatically reconnects if the cached connection has been dropped.
   */
  async getConnection(): Promise<IDbConnection | null> {
    if (this.connection) {
      // Health-check the cached connection; reset if it's dead
      try {
        await this.connection.ping();
        return this.connection;
      } catch (err: any) {
        logger.warn(`[DB] Cached connection is dead (${err.message}), reconnecting…`);
        await this.reset();
      }
    }
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = this._connect();
    this.connection = await this.connectPromise;
    this.connectPromise = null;
    return this.connection;
  }

  /** Force-reset (e.g. after config change) */
  async reset(): Promise<void> {
    if (this.connection) {
      try { await this.connection.close(); } catch (_) {}
      this.connection = null;
    }
    this.connectPromise = null;
  }

  private async _connect(): Promise<IDbConnection | null> {
    const cfg = DatabaseConnection.loadConfig();
    if (!cfg) {
      logger.info('[DB] No db-config.json found — using JSON file storage');
      return null;
    }

    logger.info(`[DB] Connecting to ${cfg.type} at ${cfg.host}:${cfg.port}/${cfg.database}…`);

    try {
      switch (cfg.type) {
        case 'sqlserver': {
          const mssql = await import('mssql');
          // Use an isolated ConnectionPool (NOT mssql.connect global singleton)
          // so it can be safely closed/reset without affecting other pools.
          const pool = new mssql.ConnectionPool({
            server: cfg.host, port: cfg.port, database: cfg.database,
            user: cfg.user, password: cfg.password,
            options: { encrypt: cfg.useSSL ?? false, trustServerCertificate: true },
          });
          await pool.connect();
          logger.info('[DB] ✅ SQL Server connected');
          return new MssqlConnection(pool, cfg);
        }
        case 'mysql': {
          const mysql = await import('mysql2/promise');
          const conn = await mysql.createConnection({
            host: cfg.host, port: cfg.port, database: cfg.database,
            user: cfg.user, password: cfg.password,
            ssl: cfg.useSSL ? {} : undefined,
          });
          logger.info('[DB] ✅ MySQL connected');
          return new MysqlConnection(conn, cfg);
        }
        case 'postgresql': {
          const { Client } = await import('pg');
          const client = new Client({
            host: cfg.host, port: cfg.port, database: cfg.database,
            user: cfg.user, password: cfg.password,
            ssl: cfg.useSSL ? { rejectUnauthorized: false } : undefined,
          });
          await client.connect();
          logger.info('[DB] ✅ PostgreSQL connected');
          return new PgConnection(client, cfg);
        }
        case 'mongodb': {
          const { MongoClient } = await import('mongodb');
          const uri = `mongodb://${cfg.user ? `${encodeURIComponent(cfg.user)}:${encodeURIComponent(cfg.password)}@` : ''}${cfg.host}:${cfg.port}/${cfg.database}`;
          const client = new MongoClient(uri);
          await client.connect();
          const db = client.db(cfg.database);
          logger.info('[DB] ✅ MongoDB connected');
          return new MongoConnection(client, db, cfg);
        }
        default:
          logger.warn(`[DB] Unknown database type: ${(cfg as any).type}`);
          return null;
      }
    } catch (err: any) {
      logger.error(`[DB] ❌ Connection failed: ${err.message}`);
      logger.warn('[DB] Falling back to JSON file storage');
      return null;
    }
  }
}

export default DatabaseConnection.getInstance();
