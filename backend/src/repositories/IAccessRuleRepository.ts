/**
 * IAccessRuleRepository.ts — Repository interface for Access Rules and Sync Queue
 *
 * Implement this interface to swap storage backends:
 *   - JsonAccessRuleRepository  → current (JSON files)
 *   - SqlAccessRuleRepository   → future  (MySQL / SQL Server)
 *
 * SQL schema hints:
 *
 *   CREATE TABLE access_rules (
 *     id            VARCHAR(64)  PRIMARY KEY,
 *     name          VARCHAR(255) NOT NULL,
 *     created_at    DATETIME     NOT NULL,
 *     updated_at    DATETIME     NOT NULL
 *   );
 *
 *   CREATE TABLE access_rule_groups (
 *     rule_id   VARCHAR(64) NOT NULL REFERENCES access_rules(id) ON DELETE CASCADE,
 *     group_id  VARCHAR(64) NOT NULL,
 *     PRIMARY KEY (rule_id, group_id)
 *   );
 *
 *   CREATE TABLE access_rule_persons (
 *     rule_id   VARCHAR(64) NOT NULL REFERENCES access_rules(id) ON DELETE CASCADE,
 *     person_id VARCHAR(64) NOT NULL,
 *     PRIMARY KEY (rule_id, person_id)
 *   );
 *
 *   CREATE TABLE access_rule_devices (
 *     rule_id   VARCHAR(64) NOT NULL REFERENCES access_rules(id) ON DELETE CASCADE,
 *     device_id VARCHAR(64) NOT NULL,
 *     PRIMARY KEY (rule_id, device_id)
 *   );
 *
 *   CREATE TABLE sync_jobs (
 *     id               VARCHAR(64)  PRIMARY KEY,
 *     rule_id          VARCHAR(64)  NOT NULL,
 *     rule_name        VARCHAR(255) NOT NULL,
 *     person_id        VARCHAR(64)  NOT NULL,
 *     person_name      VARCHAR(255) NOT NULL,
 *     device_id        VARCHAR(64)  NOT NULL,
 *     device_name      VARCHAR(255) NOT NULL,
 *     operation        ENUM('add','delete') NOT NULL,
 *     status           ENUM('pending','sending','success','failed','queued_offline') NOT NULL,
 *     attempts         INT          NOT NULL DEFAULT 0,
 *     max_attempts     INT          NOT NULL DEFAULT 3,
 *     fail_reason      TEXT,
 *     history          JSON,
 *     created_at       DATETIME     NOT NULL,
 *     last_attempt_at  DATETIME,
 *     completed_at     DATETIME,
 *     INDEX idx_rule   (rule_id),
 *     INDEX idx_status (status),
 *     INDEX idx_person (person_id, device_id)
 *   );
 */

import { AccessRule, AccessRuleInput } from '../services/accessRule.service';
import { SyncJob } from '../services/syncQueue.service';

// ─── Access Rule Repository ───────────────────────────────────────────────────

export interface IAccessRuleRepository {
  /** Return all rules. */
  findAll(): Promise<AccessRule[]>;

  /** Return a single rule by id, or null. */
  findById(id: string): Promise<AccessRule | null>;

  /** Persist a new rule and return it. */
  create(rule: AccessRule): Promise<AccessRule>;

  /** Overwrite an existing rule. Throws if not found. */
  update(rule: AccessRule): Promise<AccessRule>;

  /** Remove a rule. Throws if not found. */
  delete(id: string): Promise<void>;
}

// ─── Sync Queue Repository ────────────────────────────────────────────────────

export interface ISyncQueueRepository {
  /** Return all jobs (all statuses). */
  findAll(): Promise<SyncJob[]>;

  /** Persist the full job list (replaces everything — used by JSON impl). */
  saveAll(jobs: SyncJob[]): Promise<void>;

  /** Upsert a single job (insert or replace by id). */
  upsert(job: SyncJob): Promise<void>;

  /** Delete a single job by id. */
  delete(id: string): Promise<void>;
}
