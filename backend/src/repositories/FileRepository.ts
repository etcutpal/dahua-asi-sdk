/**
 * FileRepository.ts - File-based implementation of IAccessRepository
 *
 * Uses JSON files for storage. Perfect for development and small deployments.
 * When ready for production with 100+ devices, switch to SQLRepository.
 */

import fs from 'fs/promises';
import path from 'path';
import { IAccessRepository } from './IAccessRepository';
import { AccessEvent, AccessRecord, RecordFilters, PaginationInfo } from '../types';
import logger from '../utils/logger';

class FileRepository extends IAccessRepository {
  private eventsPath: string;
  private recordsPath: string;
  private maxEvents: number;
  private maxRecords: number;
  private events: AccessEvent[];
  private records: AccessRecord[];

  constructor() {
    super();
    this.eventsPath = path.join(__dirname, '..', '..', 'data', 'access-events.json');
    this.recordsPath = path.join(__dirname, '..', '..', 'data', 'access-record.json');
    this.maxEvents = 100;        // Keep only last 100 events (real-time)
    this.maxRecords = 50000;     // Keep up to 50K records (history)
    this.events = [];
    this.records = [];
  }

  /**
   * Initialize repository - load existing data from files
   */
  async initialize(): Promise<void> {
    try {
      await Promise.all([
        this.loadEvents(),
        this.loadRecords()
      ]);
      logger.info(`FileRepository initialized: ${this.events.length} events, ${this.records.length} records`);
    } catch (error) {
      logger.error('Failed to initialize FileRepository:', error);
      this.events = [];
      this.records = [];
    }
  }

  /**
   * Load events from file
   */
  private async loadEvents(): Promise<void> {
    try {
      const data = await fs.readFile(this.eventsPath, 'utf-8');
      const parsed = JSON.parse(data);
      this.events = parsed.events || [];
      logger.info(`Loaded ${this.events.length} events from file`);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        this.events = [];
        logger.info('No events file found, starting fresh');
      } else {
        logger.error(`Error loading events: ${error.message}`);
        this.events = [];
      }
    }
  }

  /**
   * Load records from file
   */
  private async loadRecords(): Promise<void> {
    try {
      const data = await fs.readFile(this.recordsPath, 'utf-8');
      const parsed = JSON.parse(data);
      this.records = parsed.records || [];
      logger.info(`Loaded ${this.records.length} records from file`);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        this.records = [];
        logger.info('No records file found, starting fresh');
      } else {
        logger.error(`Error loading records: ${error.message}`);
        this.records = [];
      }
    }
  }

  /**
   * Save events to file
   */
  private async saveEvents(): Promise<void> {
    try {
      const data = {
        events: this.events,
        lastUpdated: new Date().toISOString(),
        count: this.events.length
      };

      await fs.writeFile(
        this.eventsPath,
        JSON.stringify(data, null, 2),
        'utf-8'
      );

      logger.debug(`Saved ${this.events.length} events to file`);
    } catch (error) {
      logger.error('Error saving events:', error);
      throw error;
    }
  }

  /**
   * Save records to file
   */
  private async saveRecords(): Promise<void> {
    try {
      const data = {
        records: this.records,
        lastUpdated: new Date().toISOString(),
        count: this.records.length
      };

      await fs.writeFile(
        this.recordsPath,
        JSON.stringify(data, null, 2),
        'utf-8'
      );

      logger.debug(`Saved ${this.records.length} records to file`);
    } catch (error) {
      logger.error('Error saving records:', error);
      throw error;
    }
  }

  /**
   * Store a raw access event
   */
  async storeEvent(event: AccessEvent): Promise<void> {
    this.events.push(event);

    // Trim old events if exceeding limit
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // Save to file periodically (every 10 events to reduce I/O)
    if (this.events.length % 10 === 0 || this.events.length <= 10) {
      await this.saveEvents();
    }
  }

  /**
   * Get recent events
   */
  async getRecentEvents(limit: number = 100): Promise<AccessEvent[]> {
    // Return most recent first
    return this.events.slice(-limit).reverse();
  }

  /**
   * Get events by device
   */
  async getEventsByDevice(deviceId: string, limit: number = 50): Promise<AccessEvent[]> {
    return this.events
      .filter(event => event.deviceId === deviceId)
      .slice(-limit)
      .reverse();
  }

  /**
   * Delete old events, keep only recent N
   */
  async deleteOldEvents(keepCount: number = 100): Promise<number> {
    const before = this.events.length;
    if (this.events.length > keepCount) {
      this.events = this.events.slice(-keepCount);
      await this.saveEvents();
      logger.info(`Deleted ${before - this.events.length} old events`);
    }
    return before - this.events.length;
  }

  /**
   * Store a formatted access record
   */
  async storeRecord(record: AccessRecord): Promise<void> {
    // ── Dedup strategy ────────────────────────────────────────────────────
    // A physical swipe is uniquely identified by (registrationId, swipeTime).
    // Live events have recordNumber=null; fetch events have a real recordNumber.
    // Cross-path: if a live row exists, enrich it with the fetch recordNumber
    // rather than inserting a duplicate.
    if (record.registrationId && record.swipeTime) {
      const existingIdx = this.records.findIndex(
        r => r.registrationId === record.registrationId &&
             r.swipeTime      === record.swipeTime &&
             (r.userID ?? '')  === (record.userID ?? '')
      );
      if (existingIdx !== -1) {
        const existingRow = this.records[existingIdx];
        // Enrich: stored row has no recordNumber but incoming fetch record does
        if (existingRow.recordNumber == null && record.recordNumber != null) {
          this.records[existingIdx] = { ...existingRow, recordNumber: record.recordNumber, id: record.id };
          logger.debug(`[FileRepo] Enriched live record ${existingRow.id} → recordNumber=${record.recordNumber}`);
          await this.saveRecords();
        }
        return; // Either enriched or fully duplicate — do not insert
      }
    } else {
      // Fallback: dedup by id
      if (this.records.some(r => r.id === record.id)) return;
    }

    this.records.push(record);

    // Trim old records if exceeding limit
    if (this.records.length > this.maxRecords) {
      this.records = this.records.slice(-this.maxRecords);
      logger.warn(`Records exceeded ${this.maxRecords}, trimmed to max`);
    }

    // Save to file periodically (every 10 records)
    if (this.records.length % 10 === 0 || this.records.length <= 10) {
      await this.saveRecords();
    }
  }

  /**
   * Force save all records to file immediately
   */
  async forceSave(): Promise<void> {
    await this.saveRecords();
    logger.info(`Force saved ${this.records.length} records to file`);
  }

  /**
   * Get records with filtering and pagination
   */
  async getRecords(filters: RecordFilters = {}): Promise<{ records: AccessRecord[]; pagination: PaginationInfo }> {
    const { date, startDate, endDate, deviceId, filter = 'all', page = 1, limit = 20 } = filters;

    let filteredRecords = [...this.records];

    // Filter by single date (for backward compatibility)
    if (date && !startDate && !endDate) {
      const filterDate = new Date(date);
      const startOfDay = new Date(filterDate.getFullYear(), filterDate.getMonth(), filterDate.getDate());
      const endOfDay = new Date(filterDate.getFullYear(), filterDate.getMonth(), filterDate.getDate(), 23, 59, 59, 999);

      filteredRecords = filteredRecords.filter(record => {
        const swipeTime = new Date(record.swipeTime);
        return swipeTime >= startOfDay && swipeTime <= endOfDay;
      });
    }
    // Filter by date range
    else if (startDate || endDate) {
      const start = startDate
        ? new Date(startDate)
        : new Date('1970-01-01');
      start.setHours(0, 0, 0, 0);

      const end = endDate
        ? new Date(endDate)
        : new Date('2099-12-31');
      end.setHours(23, 59, 59, 999);

      filteredRecords = filteredRecords.filter(record => {
        const swipeTime = new Date(record.swipeTime);
        return swipeTime >= start && swipeTime <= end;
      });
    }

    // Filter by device
    if (deviceId) {
      filteredRecords = filteredRecords.filter(record => record.deviceId === deviceId);
    }

    // Filter by authorization status
    if (filter === 'authorized') {
      filteredRecords = filteredRecords.filter(record => record.status === 'Success');
    } else if (filter === 'unauthorized') {
      filteredRecords = filteredRecords.filter(record => record.status === 'Failed');
    }

    // Sort by swipe time (newest first)
    filteredRecords.sort((a, b) => new Date(b.swipeTime).getTime() - new Date(a.swipeTime).getTime());

    // Pagination
    const totalRecords = filteredRecords.length;
    const totalPages = Math.ceil(totalRecords / limit) || 1;
    const currentPage = Math.min(Math.max(1, page), totalPages);
    const startIndex = (currentPage - 1) * limit;
    const endIndex = startIndex + limit;

    const paginatedRecords = filteredRecords.slice(startIndex, endIndex);

    const pagination: PaginationInfo = {
      total: totalRecords,
      page: currentPage,
      limit,
      totalPages,
      totalRecords,
      currentPage,
      hasNextPage: currentPage < totalPages,
      hasPrevPage: currentPage > 1,
    };

    return {
      records: paginatedRecords,
      pagination
    };
  }

  /**
   * Get all records
   */
  async getAllRecords(): Promise<AccessRecord[]> {
    return this.records;
  }

  /**
   * Get records count by date range
   */
  async getRecordsCount(startDate: Date, endDate: Date): Promise<number> {
    return this.records.filter(record => {
      const swipeTime = new Date(record.swipeTime);
      return swipeTime >= startDate && swipeTime <= endDate;
    }).length;
  }

  /**
   * Clear all events
   */
  async clearEvents(): Promise<void> {
    this.events = [];
    await this.saveEvents();
    logger.info('All events cleared');
  }

  /**
   * Clear all records
   */
  async clearRecords(): Promise<void> {
    this.records = [];
    await this.saveRecords();
    logger.info('All records cleared');
  }

  async renameDevice(oldRegistrationId: string, newRegistrationId: string): Promise<number> {
    // Migrate all historical records to the new registrationId
    let count = 0;
    this.records = this.records.map(r => {
      if (r.registrationId === oldRegistrationId) {
        count++;
        return { ...r, registrationId: newRegistrationId };
      }
      return r;
    });
    if (count > 0) {
      await this.saveRecords();
      logger.info(`[FileRepository] Renamed registration_id ${oldRegistrationId} → ${newRegistrationId} for ${count} records`);
    }
    return count;
  }
}

export default FileRepository;
