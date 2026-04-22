/**
 * AccessRuleService
 *
 * CRUD for access rules + delta-sync logic.
 * Each rule links employee groups / individual employees to devices.
 * On create/update it expands groups → individual persons and creates SyncJobs.
 */

import path from 'path';
import logger from '../utils/logger';
import syncQueueService from './syncQueue.service';
import personService from './person.service';
import deviceService from './device.service';
import { JsonAccessRuleRepository } from '../repositories/JsonAccessRuleRepository';
import { IAccessRuleRepository } from '../repositories/IAccessRuleRepository';
import { IEmployeeRepository, IEmployeeGroupRepository } from '../repositories/IPersonRepository';
import { JsonEmployeeRepository, JsonEmployeeGroupRepository } from '../repositories/JsonPersonRepository';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AccessRule {
  id: string;
  name: string;
  employeeGroupIds: string[];   // person/employee group IDs
  personIds: string[];          // individually added persons
  deviceIds: string[];          // device registrationIds
  createdAt: string;
  updatedAt: string;
}

export interface AccessRuleInput {
  name: string;
  employeeGroupIds?: string[];
  personIds?: string[];
  deviceIds?: string[];
}

// ─── Paths ────────────────────────────────────────────────────────────────────

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

// ─── Service ──────────────────────────────────────────────────────────────────

class AccessRuleService {
  private repo: IAccessRuleRepository;
  private empRepo: IEmployeeRepository;
  private groupRepo: IEmployeeGroupRepository;
  private lock = Promise.resolve();

  /**
   * Pass a custom repository to use a different storage backend (e.g. SQL).
   * Defaults to the JSON file implementation.
   */
  constructor(
    repo: IAccessRuleRepository = new JsonAccessRuleRepository(),
    empRepo: IEmployeeRepository = new JsonEmployeeRepository(),
    groupRepo: IEmployeeGroupRepository = new JsonEmployeeGroupRepository(),
  ) {
    this.repo = repo;
    this.empRepo = empRepo;
    this.groupRepo = groupRepo;
  }

  private withLock<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.lock.then(fn);
    this.lock = next.then(() => {}, () => {});
    return next;
  }

  // ── Public API ───────────────────────────────────────────────────────────

  async getAll(): Promise<AccessRule[]> {
    return this.repo.findAll();
  }

  async getById(id: string): Promise<AccessRule | null> {
    return this.repo.findById(id);
  }

  async create(input: AccessRuleInput): Promise<AccessRule> {
    return this.withLock(async () => {
      const rule: AccessRule = {
        id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: input.name.trim(),
        employeeGroupIds: input.employeeGroupIds || [],
        personIds: input.personIds || [],
        deviceIds: input.deviceIds || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await this.repo.create(rule);

      // Queue sync for all persons × all devices (force=true: new rule, device has nothing yet)
      await this.enqueueFull(rule, 'add', true);

      logger.info(`[AccessRule] Created rule "${rule.name}" (${rule.id})`);
      return rule;
    });
  }

  async update(id: string, input: Partial<AccessRuleInput>): Promise<AccessRule> {
    return this.withLock(async () => {
      const old = await this.repo.findById(id);
      if (!old) throw new Error('Rule not found');

      const updated: AccessRule = {
        ...old,
        name: input.name?.trim() ?? old.name,
        employeeGroupIds: input.employeeGroupIds ?? old.employeeGroupIds,
        personIds: input.personIds ?? old.personIds,
        deviceIds: input.deviceIds ?? old.deviceIds,
        updatedAt: new Date().toISOString(),
      };
      await this.repo.update(updated);

      // Delta sync:
      // Helper: resolve name for a personId from employees or persons store
      const resolvePersonName = async (personId: string): Promise<string | null> => {
        try {
          const emp = await this.empRepo.findByPersonId(personId);
          if (emp) return emp.name;
        } catch (_) {}
        const p = await personService.getById(personId).catch(() => null);
        return p?.name || null;
      };

      // 1. Devices removed from rule → queue delete jobs for all persons
      const removedDevices = old.deviceIds.filter(d => !updated.deviceIds.includes(d));
      for (const deviceId of removedDevices) {
        const personIds = await this.expandPersonIds(old);
        const deviceName = await this.getDeviceName(deviceId);
        for (const personId of personIds) {
          const personName = await resolvePersonName(personId);
          if (!personName) continue;
          await syncQueueService.addJob({
            ruleId: updated.id, ruleName: updated.name,
            personId, personName, deviceId, deviceName, operation: 'delete',
          });
        }
      }

      // 2. Persons removed from rule → queue delete jobs on all remaining devices
      const addedDevices = updated.deviceIds.filter(d => !old.deviceIds.includes(d));
      const oldPersonIds = await this.expandPersonIds(old);
      const newPersonIds = await this.expandPersonIds(updated);

      const removedPersonIds = oldPersonIds.filter(p => !newPersonIds.includes(p));
      for (const deviceId of old.deviceIds.filter(d => updated.deviceIds.includes(d))) {
        const deviceName = await this.getDeviceName(deviceId);
        for (const personId of removedPersonIds) {
          const personName = await resolvePersonName(personId) ?? personId;
          await syncQueueService.addJob({
            ruleId: updated.id, ruleName: updated.name,
            personId, personName, deviceId, deviceName, operation: 'delete', force: true,
          });
        }
      }

      // New devices: send all current persons
      for (const deviceId of addedDevices) {
        const deviceName = await this.getDeviceName(deviceId);
        for (const personId of newPersonIds) {
          const personName = await resolvePersonName(personId);
          if (!personName) continue;
          await syncQueueService.addJob({
            ruleId: updated.id, ruleName: updated.name,
            personId, personName, deviceId, deviceName, operation: 'add',
          });
        }
      }

      // Existing devices: sync newly added persons
      const addedPersonIds = newPersonIds.filter(p => !oldPersonIds.includes(p));
      for (const deviceId of old.deviceIds.filter(d => updated.deviceIds.includes(d))) {
        const deviceName = await this.getDeviceName(deviceId);
        for (const personId of addedPersonIds) {
          const personName = await resolvePersonName(personId);
          if (!personName) continue;
          await syncQueueService.addJob({
            ruleId: updated.id, ruleName: updated.name,
            personId, personName, deviceId, deviceName, operation: 'add',
          });
        }
      }

      logger.info(`[AccessRule] Updated rule "${updated.name}"`);
      return updated;
    });
  }

  async delete(id: string): Promise<void> {
    return this.withLock(async () => {
      const rule = await this.repo.findById(id);
      if (!rule) throw new Error('Rule not found');

      // Queue delete jobs for all persons × all devices (force: must delete even if success record exists)
      await this.enqueueFull(rule, 'delete', true);

      await this.repo.delete(id);
      logger.info(`[AccessRule] Deleted rule "${rule.name}"`);
    });
  }

  /** Re-sync a whole rule — only queues jobs for persons NOT already on the device */
  async resync(id: string, force = false): Promise<{ queued: number; skipped: number }> {
    const rule = await this.repo.findById(id);
    if (!rule) throw new Error('Rule not found');
    const result = await this.enqueueFull(rule, 'add', force);
    logger.info(`[AccessRule] Re-sync "${rule.name}": ${result.queued} queued, ${result.skipped} already synced (force=${force})`);
    return result;
  }

  /** Update all rules: replace oldRegistrationId with newRegistrationId in deviceIds[] */
  async renameDevice(oldRegistrationId: string, newRegistrationId: string): Promise<void> {
    return this.withLock(async () => {
      const rules = await this.repo.findAll();
      let changed = 0;
      for (const rule of rules) {
        const idx = rule.deviceIds.indexOf(oldRegistrationId);
        if (idx !== -1) {
          rule.deviceIds[idx] = newRegistrationId;
          await this.repo.update(rule);
          changed++;
        }
      }
      if (changed > 0) {
        logger.info(`[AccessRule] renameDevice: updated ${changed} rule(s) (${oldRegistrationId} → ${newRegistrationId})`);
      }
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Expand group IDs + individual personIds → flat list of unique personIds */
  async expandPersonIds(rule: AccessRule): Promise<string[]> {
    const ids = new Set<string>(rule.personIds);

    if (rule.employeeGroupIds.length > 0) {
      try {
        // Read groups and employees from repositories
        const groups: any[] = await this.groupRepo.findAll();
        const employees: any[] = await this.empRepo.findAll();

        // Also check persons.json for persons with groupId
        const allPersons = await personService.getAll();

        for (const groupId of rule.employeeGroupIds) {
          // Special case: 'all' group means every employee
          if (groupId === 'all') {
            for (const emp of employees) {
              if (emp.personId || emp.id) ids.add(emp.personId || emp.id);
            }
            for (const p of allPersons) {
              ids.add(p.personId);
            }
            continue;
          }

          // Add employees in this group — check department, groupId, and personGroupId fields
          for (const emp of employees) {
            if (emp.department === groupId || emp.groupId === groupId || emp.personGroupId === groupId) {
              if (emp.personId || emp.id) ids.add(emp.personId || emp.id);
            }
          }
          // Add persons in this group
          for (const p of allPersons) {
            if ((p as any).department === groupId || (p as any).groupId === groupId || (p as any).personGroupId === groupId) {
              ids.add(p.personId);
            }
          }
          // Also add persons that belong to child groups (flatten recursively)
          const childGroupIds = this.getChildGroupIds(groupId, groups);
          for (const childId of childGroupIds) {
            for (const emp of employees) {
              if (emp.department === childId || emp.groupId === childId) ids.add(emp.personId || emp.id);
            }
            for (const p of allPersons) {
              if ((p as any).department === childId || (p as any).groupId === childId) ids.add(p.personId);
            }
          }
        }
      } catch (err: any) {
        logger.warn(`[AccessRule] Could not expand groups: ${err.message}`);
      }
    }

    return [...ids];
  }

  private getChildGroupIds(parentId: string, groups: any[]): string[] {
    const children = groups
      .filter(g => g.parentId === parentId)
      .map(g => g.id);
    const nested = children.flatMap(c => this.getChildGroupIds(c, groups));
    return [...children, ...nested];
  }

  private async getDeviceName(registrationId: string): Promise<string> {
    try {
      const devices = await deviceService.getAll();
      const dev = devices.find((d: any) => d.registrationId === registrationId);
      return dev?.name || registrationId;
    } catch {
      return registrationId;
    }
  }

  private async enqueueFull(rule: AccessRule, operation: 'add' | 'delete', force = false): Promise<{ queued: number; skipped: number }> {
    const personIds = await this.expandPersonIds(rule);
    logger.info(`[AccessRule] enqueueFull: ${operation} — ${personIds.length} persons × ${rule.deviceIds.length} devices (force=${force})`);

    if (personIds.length === 0) {
      logger.warn(`[AccessRule] No persons resolved for rule "${rule.name}" — nothing to enqueue`);
      return { queued: 0, skipped: 0 };
    }

    // Build a fast employee lookup from employee repository
    let empMap = new Map<string, { personId: string; name: string }>();
    try {
      const emps = await this.empRepo.findAll();
      for (const e of emps) {
        const pid = e.personId || e.id;
        if (pid) empMap.set(pid, { personId: pid, name: e.name });
      }
    } catch (e: any) {
      logger.warn(`[AccessRule] Could not read employees: ${e.message}`);
    }

    let queued = 0;
    let skipped = 0;

    for (const deviceId of rule.deviceIds) {
      const deviceName = await this.getDeviceName(deviceId);
      for (const personId of personIds) {
        let personName = empMap.get(personId)?.name;
        if (!personName) {
          const p = await personService.getById(personId).catch(() => null);
          personName = p?.name;
        }
        if (!personName) {
          logger.warn(`[AccessRule] Person ${personId} not found in employees or persons — skipping`);
          skipped++;
          continue;
        }
        const job = await syncQueueService.addJob({
          ruleId: rule.id, ruleName: rule.name,
          personId, personName, deviceId, deviceName,
          operation, force,
        });
        if (job) {
          queued++;
          logger.info(`[AccessRule] Queued: ${operation} ${personId} (${personName}) → ${deviceId}`);
        } else {
          skipped++;
        }
      }
    }

    logger.info(`[AccessRule] enqueueFull done: ${queued} queued, ${skipped} skipped`);
    return { queued, skipped };
  }
}

export const accessRuleService = new AccessRuleService();
export default accessRuleService;
