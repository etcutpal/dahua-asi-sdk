/**
 * SqlAccessRuleRepository.ts
 *
 * SQL implementations of IAccessRuleRepository and ISyncQueueRepository.
 *
 * Access rules store their JSON arrays (employeeGroupIds, personIds, deviceIds)
 * as serialised JSON text in NVARCHAR(MAX)/TEXT columns — consistent with how
 * the migration creates the table and with what the service layer expects.
 *
 * SyncJob.history is also stored as JSON text.
 */

import { IDbConnection } from './DatabaseConnection';
import { IAccessRuleRepository, ISyncQueueRepository } from './IAccessRuleRepository';
import { AccessRule } from '../services/accessRule.service';
import { SyncJob } from '../services/syncQueue.service';

// ─── datetime helper ──────────────────────────────────────────────────────────
function toDate(v: any): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// ─── row mappers ──────────────────────────────────────────────────────────────

function rowToRule(row: any): AccessRule {
  return {
    id:               row.id,
    name:             row.name,
    employeeGroupIds: row.employee_group_ids ? JSON.parse(row.employee_group_ids) : [],
    personIds:        row.person_ids         ? JSON.parse(row.person_ids)         : [],
    deviceIds:        row.device_ids         ? JSON.parse(row.device_ids)         : [],
    createdAt:        row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt:        row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

function rowToJob(row: any): SyncJob {
  return {
    id:             row.id,
    ruleId:         row.rule_id,
    ruleName:       row.rule_name,
    personId:       row.person_id,
    personName:     row.person_name,
    deviceId:       row.device_id,
    deviceName:     row.device_name,
    operation:      row.operation,
    status:         row.status,
    attempts:       row.attempts    ?? 0,
    maxAttempts:    row.max_attempts ?? 3,
    failReason:     row.fail_reason  ?? null,
    history:        row.history      ? JSON.parse(row.history) : [],
    createdAt:      row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    lastAttemptAt:  row.last_attempt_at instanceof Date ? row.last_attempt_at.toISOString() : (row.last_attempt_at ?? null),
    completedAt:    row.completed_at  instanceof Date ? row.completed_at.toISOString()  : (row.completed_at  ?? null),
  };
}

// ─── Access Rule Repository ───────────────────────────────────────────────────

export class SqlAccessRuleRepository implements IAccessRuleRepository {
  constructor(private db: IDbConnection) {}

  async findAll(): Promise<AccessRule[]> {
    const rows = await this.db.query('SELECT * FROM access_rules ORDER BY name');
    return rows.map(rowToRule);
  }

  async findById(id: string): Promise<AccessRule | null> {
    const rows = await this.db.query('SELECT * FROM access_rules WHERE id = ?', [id]);
    return rows.length ? rowToRule(rows[0]) : null;
  }

  async create(rule: AccessRule): Promise<AccessRule> {
    await this.db.query(
      `INSERT INTO access_rules
         (id, name, employee_group_ids, person_ids, device_ids, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?)`,
      [
        rule.id, rule.name,
        JSON.stringify(rule.employeeGroupIds),
        JSON.stringify(rule.personIds),
        JSON.stringify(rule.deviceIds),
        toDate(rule.createdAt) ?? new Date(),
        toDate(rule.updatedAt) ?? new Date(),
      ],
    );
    return rule;
  }

  async update(rule: AccessRule): Promise<AccessRule> {
    await this.db.query(
      `UPDATE access_rules SET
         name=?, employee_group_ids=?, person_ids=?, device_ids=?, updated_at=?
       WHERE id=?`,
      [
        rule.name,
        JSON.stringify(rule.employeeGroupIds),
        JSON.stringify(rule.personIds),
        JSON.stringify(rule.deviceIds),
        toDate(rule.updatedAt) ?? new Date(),
        rule.id,
      ],
    );
    return rule;
  }

  async delete(id: string): Promise<void> {
    await this.db.query('DELETE FROM access_rules WHERE id = ?', [id]);
  }
}

// ─── Sync Queue Repository ────────────────────────────────────────────────────

export class SqlSyncQueueRepository implements ISyncQueueRepository {
  constructor(private db: IDbConnection) {}

  async findAll(): Promise<SyncJob[]> {
    const rows = await this.db.query('SELECT * FROM sync_queue ORDER BY created_at');
    return rows.map(rowToJob);
  }

  async saveAll(jobs: SyncJob[]): Promise<void> {
    // Full replacement — mirrors JSON behaviour
    await this.db.query('DELETE FROM sync_queue WHERE 1=1', []);
    for (const job of jobs) {
      await this._insert(job);
    }
  }

  async upsert(job: SyncJob): Promise<void> {
    const rows = await this.db.query('SELECT id FROM sync_queue WHERE id = ?', [job.id]);
    if (rows.length) {
      await this.db.query(
        `UPDATE sync_queue SET
           rule_id=?, rule_name=?, person_id=?, person_name=?,
           device_id=?, device_name=?, operation=?, status=?,
           attempts=?, max_attempts=?, fail_reason=?, history=?,
           last_attempt_at=?, completed_at=?
         WHERE id=?`,
        [
          job.ruleId,   job.ruleName,
          job.personId, job.personName,
          job.deviceId, job.deviceName,
          job.operation, job.status,
          job.attempts,  job.maxAttempts,
          job.failReason ?? null,
          JSON.stringify(job.history),
          toDate(job.lastAttemptAt) ?? null,
          toDate(job.completedAt)   ?? null,
          job.id,
        ],
      );
    } else {
      await this._insert(job);
    }
  }

  async delete(id: string): Promise<void> {
    await this.db.query('DELETE FROM sync_queue WHERE id = ?', [id]);
  }

  private async _insert(job: SyncJob): Promise<void> {
    await this.db.query(
      `INSERT INTO sync_queue
         (id, rule_id, rule_name, person_id, person_name, device_id, device_name,
          operation, status, attempts, max_attempts, fail_reason, history,
          created_at, last_attempt_at, completed_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        job.id,
        job.ruleId,    job.ruleName,
        job.personId,  job.personName,
        job.deviceId,  job.deviceName,
        job.operation, job.status,
        job.attempts,  job.maxAttempts,
        job.failReason ?? null,
        JSON.stringify(job.history),
        toDate(job.createdAt)     ?? new Date(),
        toDate(job.lastAttemptAt) ?? null,
        toDate(job.completedAt)   ?? null,
      ],
    );
  }
}
