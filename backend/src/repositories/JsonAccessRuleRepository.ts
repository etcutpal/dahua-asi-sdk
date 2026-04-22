/**
 * JsonAccessRuleRepository.ts — JSON file implementation of IAccessRuleRepository
 *                               and ISyncQueueRepository.
 *
 * Swap this for a SqlAccessRuleRepository when moving to MySQL / SQL Server.
 * The service layer (accessRule.service.ts, syncQueue.service.ts) does NOT
 * need to change — only the repository instance injected in server.ts.
 */

import fsp from 'fs/promises';
import path from 'path';
import { IAccessRuleRepository, ISyncQueueRepository } from './IAccessRuleRepository';
import { AccessRule } from '../services/accessRule.service';
import { SyncJob } from '../services/syncQueue.service';
import logger from '../utils/logger';

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

// ─── Access Rules ─────────────────────────────────────────────────────────────

export class JsonAccessRuleRepository implements IAccessRuleRepository {
  private filePath: string;

  constructor(filePath = path.join(DATA_DIR, 'access-rules.json')) {
    this.filePath = filePath;
  }

  private async read(): Promise<AccessRule[]> {
    try {
      const raw = await fsp.readFile(this.filePath, 'utf-8');
      return JSON.parse(raw).rules || [];
    } catch (err: any) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }

  private async write(rules: AccessRule[]): Promise<void> {
    await fsp.writeFile(this.filePath, JSON.stringify({ rules }, null, 2), 'utf-8');
  }

  async findAll(): Promise<AccessRule[]> {
    return this.read();
  }

  async findById(id: string): Promise<AccessRule | null> {
    const rules = await this.read();
    return rules.find(r => r.id === id) || null;
  }

  async create(rule: AccessRule): Promise<AccessRule> {
    const rules = await this.read();
    rules.push(rule);
    await this.write(rules);
    return rule;
  }

  async update(rule: AccessRule): Promise<AccessRule> {
    const rules = await this.read();
    const idx = rules.findIndex(r => r.id === rule.id);
    if (idx === -1) throw new Error(`AccessRule ${rule.id} not found`);
    rules[idx] = rule;
    await this.write(rules);
    return rule;
  }

  async delete(id: string): Promise<void> {
    const rules = await this.read();
    const filtered = rules.filter(r => r.id !== id);
    if (filtered.length === rules.length) throw new Error(`AccessRule ${id} not found`);
    await this.write(filtered);
  }
}

// ─── Sync Queue ───────────────────────────────────────────────────────────────

export class JsonSyncQueueRepository implements ISyncQueueRepository {
  private filePath: string;

  constructor(filePath = path.join(DATA_DIR, 'sync-queue.json')) {
    this.filePath = filePath;
  }

  private async read(): Promise<SyncJob[]> {
    try {
      const raw = await fsp.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : (parsed.jobs || []);
    } catch (err: any) {
      if (err.code === 'ENOENT') return [];
      logger.warn(`[JsonSyncQueueRepository] Could not read sync-queue.json: ${err.message}`);
      return [];
    }
  }

  private async write(jobs: SyncJob[]): Promise<void> {
    await fsp.writeFile(this.filePath, JSON.stringify(jobs, null, 2), 'utf-8');
  }

  async findAll(): Promise<SyncJob[]> {
    return this.read();
  }

  async saveAll(jobs: SyncJob[]): Promise<void> {
    await this.write(jobs);
  }

  async upsert(job: SyncJob): Promise<void> {
    const jobs = await this.read();
    const idx = jobs.findIndex(j => j.id === job.id);
    if (idx === -1) {
      jobs.push(job);
    } else {
      jobs[idx] = job;
    }
    await this.write(jobs);
  }

  async delete(id: string): Promise<void> {
    const jobs = await this.read();
    await this.write(jobs.filter(j => j.id !== id));
  }
}
