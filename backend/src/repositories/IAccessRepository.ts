/**
 * IAccessRepository.ts - Repository Interface for Access Data
 *
 * This interface defines the contract for data storage operations.
 * Two implementations exist:
 * 1. FileRepository - Uses JSON files (current)
 * 2. SQLRepository - Uses MySQL/SQL Server (future)
 *
 * To switch to database, just change the repository instance in server.ts
 * No changes needed in routes or services!
 */

import { AccessEvent, AccessRecord, IAccessRepository as IAccessRepo, RecordFilters } from '../types';

export abstract class IAccessRepository implements IAccessRepo {
  /**
   * Store a raw access event (for real-time WebSocket streaming)
   */
  abstract storeEvent(event: AccessEvent): Promise<void>;

  /**
   * Get recent access events (for real-time display)
   */
  abstract getRecentEvents(limit?: number): Promise<AccessEvent[]>;

  /**
   * Get events by device ID
   */
  abstract getEventsByDevice(deviceId: string, limit?: number): Promise<AccessEvent[]>;

  /**
   * Delete old events, keeping only the most recent N records
   */
  abstract deleteOldEvents(keepCount?: number): Promise<number>;

  /**
   * Store a formatted access record (for Access Records page)
   */
  abstract storeRecord(record: AccessRecord): Promise<void>;

  /**
   * Get access records with filtering and pagination
   */
  abstract getRecords(filters?: RecordFilters): Promise<{ records: AccessRecord[]; pagination: any }>;

  /**
   * Get all records (for export/backup)
   */
  abstract getAllRecords(): Promise<AccessRecord[]>;

  /**
   * Get records count by date range
   */
  abstract getRecordsCount(startDate: Date, endDate: Date): Promise<number>;

  /**
   * Clear all events
   */
  abstract clearEvents(): Promise<void>;

  /**
   * Clear all records
   */
  abstract clearRecords(): Promise<void>;

  /**
   * Delete access records older than the given cutoff date.
   * Returns the number of records deleted.
   * Used by the retention cleanup service.
   */
  abstract deleteOlderThan(cutoff: Date): Promise<number>;

  /**
   * Migrate all access records from oldRegistrationId to newRegistrationId.
   * Called when a device's Registration ID is changed (e.g. broken device replaced).
   * Returns the number of records migrated.
   */
  abstract renameDevice(oldRegistrationId: string, newRegistrationId: string): Promise<number>;

  /**
   * Initialize repository (load data, create tables, etc.)
   */
  abstract initialize(): Promise<void>;

  /**
   * Force save (optional, used by FileRepository)
   */
  abstract forceSave?(): Promise<void>;
}
