/**
 * SyncQueueService — Core engine for queued person-to-device sync.
 *
 * Responsibilities:
 *  - Accept add/delete jobs (one per person-device pair)
 *  - Process pending jobs every 10 s via setInterval
 *  - Skip offline devices (mark queued_offline) → retry when device comes online
 *  - Overwrite on conflict (with a note in history)
 *  - Track per-attempt history with fail reason
 *  - Emit socket events so the frontend status page updates live
 */

import fs from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';
import logger from '../utils/logger';
import netSdkService from './netSdkService';
import personService from './person.service';
import deviceService from './device.service';
import { ISyncQueueRepository } from '../repositories/IAccessRuleRepository';
import { IEmployeeRepository } from '../repositories/IPersonRepository';
import RepositoryFactory from '../repositories/RepositoryFactory';

// ─── Employee images dir ──────────────────────────────────────────────────────
const EMP_IMAGES_DIR = path.join(__dirname, '..', '..', 'data', 'employee_images');

// ─── Types ────────────────────────────────────────────────────────────────────

export type SyncOperation = 'add' | 'delete';
export type SyncStatus =
  | 'pending'
  | 'sending'
  | 'success'
  | 'failed'
  | 'queued_offline';

export interface SyncHistoryEntry {
  attemptAt: string;
  status: 'success' | 'failed';
  message: string;
}

export interface SyncJob {
  id: string;
  ruleId: string;
  ruleName: string;
  personId: string;
  personName: string;
  deviceId: string;       // registrationId
  deviceName: string;
  operation: SyncOperation;
  status: SyncStatus;
  attempts: number;
  maxAttempts: number;    // default 3
  failReason: string | null;
  history: SyncHistoryEntry[];
  createdAt: string;
  lastAttemptAt: string | null;
  completedAt: string | null;
}

// ─── Service ──────────────────────────────────────────────────────────────────

const HEARTBEAT_INTERVAL_MS = 15_000;
const MAX_JOBS_PER_DEVICE   = 1;
const MAX_DEVICES_PARALLEL  = 10;
const MAX_ATTEMPTS          = 3;

class SyncQueueService extends EventEmitter {
  private get repo()    { return RepositoryFactory.syncQueue(); }
  private get empRepo() { return RepositoryFactory.employees(); }
  private jobs: SyncJob[] = [];
  private timer: NodeJS.Timer | null = null;
  private processing = false;
  private initialized = false;

  constructor(_repo?: ISyncQueueRepository, _empRepo?: IEmployeeRepository) {
    super();
    // repos resolved lazily via getters
  }

  // ── Init & Persistence ───────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.jobs = await this.repo.findAll();
    // Reset any "sending" jobs left over from a crashed process
    for (const job of this.jobs) {
      if (job.status === 'sending') {
        job.status = 'pending';
      }
    }
    await this.repo.saveAll(this.jobs);
    this.startTimer();
    this.initialized = true;
    logger.info(`[SyncQueue] Initialized — ${this.jobs.length} jobs loaded`);
  }

  private async save(): Promise<void> {
    await this.repo.saveAll(this.jobs);
  }

  // ── Timer ────────────────────────────────────────────────────────────────

  private startTimer(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.processQueue(), HEARTBEAT_INTERVAL_MS);
    logger.info(`[SyncQueue] Processor started (heartbeat ${HEARTBEAT_INTERVAL_MS / 1000}s)`);
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Add a single job. Deduplicates by ruleId+personId+deviceId+operation.
   *
   * Default behaviour (force = false):
   *   • If a SUCCESS job already exists → skip (person is already on the device).
   *     This is the smart-sync path: re-sync only sends what's missing.
   *   • If a pending/sending/failed/queued_offline job exists → replace it,
   *     so clicking re-sync a second time never stacks duplicates.
   *
   * Force behaviour (force = true):
   *   • Replaces even SUCCESS jobs → used when a device is wiped or
   *     person data (face/card) has changed and must be pushed again.
   *
   * Returns the new job, or null if skipped (already succeeded).
   */
  async addJob(params: {
    ruleId: string;
    ruleName: string;
    personId: string;
    personName: string;
    deviceId: string;
    deviceName: string;
    operation: SyncOperation;
    force?: boolean;
  }): Promise<SyncJob | null> {
    const existing = this.jobs.find(
      j =>
        j.ruleId    === params.ruleId    &&
        j.personId  === params.personId  &&
        j.deviceId  === params.deviceId  &&
        j.operation === params.operation
    );

    if (existing) {
      if (existing.status === 'success' && !params.force) {
        // Already on device — nothing to do.
        return null;
      }
      // Remove the stale job so we replace it cleanly.
      this.jobs = this.jobs.filter(j => j.id !== existing.id);
    }

    const job: SyncJob = {
      id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ruleId: params.ruleId,
      ruleName: params.ruleName,
      personId: params.personId,
      personName: params.personName,
      deviceId: params.deviceId,
      deviceName: params.deviceName,
      operation: params.operation,
      status: 'pending',
      attempts: 0,
      maxAttempts: MAX_ATTEMPTS,
      failReason: null,
      history: [],
      createdAt: new Date().toISOString(),
      lastAttemptAt: null,
      completedAt: null,
    };

    this.jobs.push(job);
    await this.save();
    this.emit('queue:updated', this.getSummary());
    logger.info(`[SyncQueue] Job added: ${job.operation} ${job.personId} → ${job.deviceId}`);

    // Kick off processing immediately (don't wait for timer)
    setImmediate(() => this.processQueue());

    return job;
  }

  /**
   * Called when a device comes Online — re-queue all queued_offline jobs for it.
   */
  async flushDevice(deviceId: string): Promise<void> {
    let flushed = 0;
    for (const job of this.jobs) {
      if (job.deviceId === deviceId && job.status === 'queued_offline') {
        job.status = 'pending';
        flushed++;
      }
    }
    if (flushed > 0) {
      await this.save();
      logger.info(`[SyncQueue] Device ${deviceId} online — flushed ${flushed} queued jobs`);
      this.emit('queue:updated', this.getSummary());
      setImmediate(() => this.processQueue());
    }
  }

  /**
   * Manual retry for a specific failed job.
   */
  async retryJob(jobId: string): Promise<void> {
    const job = this.jobs.find(j => j.id === jobId);
    if (!job) throw new Error('Job not found');
    job.status = 'pending';
    job.attempts = 0;
    job.failReason = null;
    await this.save();
    this.emit('queue:updated', this.getSummary());
    setImmediate(() => this.processQueue());
  }

  /**
   * Update all jobs referencing oldRegistrationId to use newRegistrationId.
   * Called when a device's registrationId is changed in Edit Device.
   */
  async renameDevice(oldId: string, newId: string, newName?: string): Promise<void> {
    let changed = 0;
    for (const job of this.jobs) {
      if (job.deviceId === oldId) {
        job.deviceId = newId;
        if (newName) job.deviceName = newName;
        changed++;
      }
    }
    if (changed > 0) {
      await this.save();
      this.emit('queue:updated', this.getSummary());
      logger.info(`[SyncQueue] Renamed device ${oldId} → ${newId} in ${changed} jobs`);
    }
  }

  /** Delete a job by id */
  async deleteJob(jobId: string): Promise<void> {
    this.jobs = this.jobs.filter(j => j.id !== jobId);
    await this.save();
    this.emit('queue:updated', this.getSummary());
  }

  /** Delete all jobs for a rule (used when rule is deleted) */
  async deleteJobsByRule(ruleId: string): Promise<void> {
    this.jobs = this.jobs.filter(j => j.ruleId !== ruleId);
    await this.save();
    this.emit('queue:updated', this.getSummary());
  }

  getJobs(): SyncJob[] {
    return [...this.jobs];
  }

  getSummary() {
    const pending        = this.jobs.filter(j => j.status === 'pending').length;
    const sending        = this.jobs.filter(j => j.status === 'sending').length;
    const success        = this.jobs.filter(j => j.status === 'success').length;
    const failed         = this.jobs.filter(j => j.status === 'failed').length;
    const queued_offline = this.jobs.filter(j => j.status === 'queued_offline').length;
    return { pending, sending, success, failed, queued_offline, total: this.jobs.length };
  }

  // ── Core Processor ───────────────────────────────────────────────────────

  /**
   * Main drain loop.
   *
   * Strategy:
   *   1. Build the set of online devices (one HTTP call to bridge).
   *   2. Pick ONE pending job per device (respects SDK serialisation per device).
   *      Cap at MAX_DEVICES_PARALLEL devices in one cycle.
   *   3. Run those jobs in parallel with Promise.all — different devices = truly parallel.
   *   4. Persist + emit progress after every cycle.
   *   5. If there are STILL pending jobs after the cycle, immediately start the next
   *      cycle (setImmediate) — no 10 s wait. This drains large queues as fast as
   *      the SDK allows without blocking the Node.js event loop.
   *   6. The heartbeat timer (15 s) acts as a fallback to catch offline→online
   *      transitions or anything else that bypasses the immediate re-trigger.
   */
  async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      // ── 0. Reset stale 'sending' jobs ───────────────────────────────────
      // A job stuck in 'sending' means the process crashed or the bridge
      // timed out without the catch block running. Reset them so they retry.
      const STALE_SENDING_MS = 60_000; // 60s — any job sending longer than this is orphaned
      const now = Date.now();
      for (const job of this.jobs) {
        if (job.status === 'sending' && job.lastAttemptAt) {
          const age = now - new Date(job.lastAttemptAt).getTime();
          if (age > STALE_SENDING_MS) {
            logger.warn(`[SyncQueue] Resetting stale 'sending' job ${job.id} (stuck for ${Math.round(age/1000)}s)`);
            job.status = job.attempts >= job.maxAttempts ? 'failed' : 'pending';
            if (job.status === 'failed') job.failReason = 'Timed out (bridge crash or restart)';
          }
        }
      }
      const liveDevices   = await netSdkService.getAllDevices().catch(() => []);
      const localDevices  = await deviceService.getAll().catch(()  => []);
      const localRegIdByDeviceId = new Map<string, string>(
        localDevices.map((d: any) => [d.deviceId, d.registrationId] as [string, string])
      );

      const onlineRegistrationIds = new Set<string>();
      for (const d of liveDevices) {
        const rawId: string = (d.DeviceID || d.deviceID || d.deviceId || '') as string;
        const status = (d.Status || d.status || '').toLowerCase();
        if (status !== 'online') continue;
        onlineRegistrationIds.add(rawId);
        const regId = localRegIdByDeviceId.get(rawId);
        if (regId) onlineRegistrationIds.add(regId);
      }

      // ── 2. Pick one pending job per device ──────────────────────────────
      //
      //  Why one per device?
      //  The Dahua SDK serialises all calls for a given login handle (per device).
      //  Sending two jobs to the same device concurrently just means one waits
      //  inside the bridge mutex — no real parallelism, plus higher chance of
      //  timeout. One job per device is the sweet spot.
      //
      //  Why multiple devices in parallel?
      //  Jobs for *different* devices use different login handles and can run
      //  truly concurrently (separate TCP connections to separate hardware).
      const devicesSeen = new Set<string>();
      const batch: SyncJob[] = [];

      for (const job of this.jobs) {
        if (job.status !== 'pending') continue;
        if (devicesSeen.has(job.deviceId)) continue;
        if (batch.length >= MAX_DEVICES_PARALLEL) break;
        devicesSeen.add(job.deviceId);
        batch.push(job);
      }

      if (batch.length === 0) {
        logger.debug('[SyncQueue] No pending jobs — idle');
        return;
      }

      logger.info(
        `[SyncQueue] Cycle: ${batch.length} jobs across ${devicesSeen.size} device(s) ` +
        `(${this.jobs.filter(j => j.status === 'pending').length} total pending, ` +
        `${onlineRegistrationIds.size} online)`
      );

      // ── 3. Run jobs in parallel ─────────────────────────────────────────
      await Promise.all(batch.map(job => this.processJob(job, onlineRegistrationIds)));

      // ── 4. Persist + broadcast ──────────────────────────────────────────
      await this.save();
      this.emit('queue:updated', this.getSummary());

      // ── 5. Drain: immediately start next cycle if work remains ──────────
      const stillPending = this.jobs.some(j => j.status === 'pending');
      if (stillPending) {
        // Release the event loop briefly (so HTTP requests etc. can be served),
        // then continue draining without waiting for the heartbeat timer.
        setImmediate(() => this.processQueue());
      }
    } catch (err: any) {
      logger.error('[SyncQueue] Processor error:', err.message);
    } finally {
      this.processing = false;
    }
  }

  private async processJob(job: SyncJob, onlineIds: Set<string>): Promise<void> {
    if (!onlineIds.has(job.deviceId)) {
      job.status = 'queued_offline';
      logger.info(`[SyncQueue] ${job.deviceId} offline — job ${job.id} queued`);
      return;
    }

    job.status = 'sending';
    job.attempts += 1;
    job.lastAttemptAt = new Date().toISOString();

    try {
      if (job.operation === 'add') {
        await this.sendPersonToDevice(job);
      } else {
        await this.deletePersonFromDevice(job);
      }

      job.status = 'success';
      job.failReason = null;
      job.completedAt = new Date().toISOString();
      job.history.push({ attemptAt: job.lastAttemptAt, status: 'success', message: 'Sent successfully' });
      logger.info(`[SyncQueue] ✅ Job ${job.id}: ${job.operation} ${job.personId} → ${job.deviceId}`);

      // After a successful delete, purge any prior add/success jobs for the same
      // person+device so the rule stats don't show a stale "synced" count.
      if (job.operation === 'delete') {
        const staleAddJobs = this.jobs.filter(
          j => j.id !== job.id &&
               j.personId === job.personId &&
               j.deviceId === job.deviceId &&
               j.operation === 'add' &&
               j.status === 'success'
        );
        if (staleAddJobs.length > 0) {
          this.jobs = this.jobs.filter(j => !staleAddJobs.includes(j));
          logger.info(`[SyncQueue] Removed ${staleAddJobs.length} stale add-success job(s) for ${job.personId} → ${job.deviceId}`);
        }
      }
    } catch (err: any) {
      const reason = err.message || 'Unknown error';
      job.history.push({ attemptAt: job.lastAttemptAt!, status: 'failed', message: reason });

      if (job.attempts >= job.maxAttempts) {
        job.status = 'failed';
        job.failReason = reason;
        logger.error(`[SyncQueue] ❌ Job ${job.id} permanently failed after ${job.attempts} attempts: ${reason}`);
      } else {
        job.status = 'pending';
        logger.warn(`[SyncQueue] ⚠️ Job ${job.id} attempt ${job.attempts} failed (will retry): ${reason}`);
      }
    }
  }

  private async sendPersonToDevice(job: SyncJob): Promise<void> {
    // Primary source: persons.json (legacy). Fallback: employees.json
    let person = await personService.getById(job.personId).catch(() => null);

    // ── Normalise from employees.json if not in persons.json ──────────────
    let faceBuffer: Buffer | null = null;
    let faceName: string | null = null;
    let cardNumbers: string[] = [];
    let password: string | undefined;
    let fingerprints: any[] = [];

    if (person) {
      // persons.json record
      if (person.faceImagePath) {
        try {
          const absPath = path.isAbsolute(person.faceImagePath)
            ? person.faceImagePath
            : path.join(__dirname, '..', '..', 'data', person.faceImagePath);
          faceBuffer = await fs.readFile(absPath);
          faceName = path.basename(absPath);
        } catch {
          logger.warn(`[SyncQueue] Could not read face image for ${job.personId} from persons`);
        }
      }
      cardNumbers = (person as any).cardNumbers || [];
      password = (person as any).password || undefined;
      fingerprints = (person.fingerprints?.filter((f: any) => f?.dataBase64) || []) as any;
    } else {
      // Try employees repository
      const emp = await this.empRepo.findByPersonId(job.personId);
      if (!emp) {
        throw new Error(`Person ${job.personId} not found in employees or persons DB`);
      }
      logger.info(`[SyncQueue] Using employees.json record for ${job.personId}`);

      // Resolve face image from _faceImageFilename (relative to employee_images dir)
      if (emp._faceImageFilename) {
        try {
          const absPath = path.join(EMP_IMAGES_DIR, emp._faceImageFilename);
          faceBuffer = await fs.readFile(absPath);
          faceName = path.basename(absPath);
          logger.info(`[SyncQueue] Face image loaded: ${absPath} (${faceBuffer.length} bytes)`);
        } catch {
          logger.warn(`[SyncQueue] Could not read face image for ${job.personId} at ${emp._faceImageFilename}`);
        }
      }
      cardNumbers = Array.isArray(emp.cardNumbers) ? emp.cardNumbers : (emp.cardNumbers ? [emp.cardNumbers] : []);
      password = emp.password || undefined;
      fingerprints = Array.isArray(emp.fingerprints)
        ? emp.fingerprints.filter((f: any) => f?.dataBase64)
        : [];

      // Build a minimal person-like object for the call below
      person = {
        personId: emp.personId || emp.id,
        name: emp.name,
        cardNumbers,
        password,
        fingerprints,
        faceImagePath: emp._faceImageFilename || null,
      } as any;
    }

    await netSdkService.addPersonToDevice(
      job.deviceId,
      person!.personId,
      person!.name,
      faceBuffer,
      faceName,
      cardNumbers[0] || null,
      true,   // always isUpdate=true → bridge uses modify-or-create logic
      null,
      cardNumbers,
      password,
      fingerprints
    );
  }

  private async deletePersonFromDevice(job: SyncJob): Promise<void> {
    // Call bridge delete endpoint
    const bridgeUrl = (netSdkService as any).bridgeUrl as string;
    const axios = require('axios');
    const response = await axios.post(
      `${bridgeUrl}/api/persons/delete-from-device`,
      { deviceId: job.deviceId, personId: job.personId },
      { timeout: 30_000 }
    );
    if (!response.data.success) {
      throw new Error(response.data.error || 'Delete failed');
    }
  }
}

export const syncQueueService = new SyncQueueService();
export default syncQueueService;
