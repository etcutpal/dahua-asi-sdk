/**
 * AccessRecordService.ts - Unified Service for Access Events & Records
 *
 * This service handles:
 * 1. Real-time access events (stored in access-events.json) - Last 100 only
 * 2. Access records history (stored in access-record.json) - Unlimited
 *
 * Uses Repository Pattern for easy database migration later.
 * Current: FileRepository (JSON files)
 * Future: SQLRepository (MySQL/SQL Server) - Just swap the repository!
 */

import { EventEmitter } from 'events';
import logger from '../utils/logger';
import { IAccessRepository, AccessEvent, AccessRecord, WebhookEventData, RecordFilters, PaginationInfo } from '../types';
import RepositoryFactory from '../repositories/RepositoryFactory';
import fs from 'fs/promises';
import path from 'path';

export class AccessRecordService extends EventEmitter {
  private static instance: AccessRecordService | null = null;
  protected repository: IAccessRepository;
  private cardTypeMap: Record<number, string>;
  private userCache: Record<string, string>;
  private userCachePath: string;

  constructor(repository: IAccessRepository) {
    super();
    this.repository = repository;

    // Card type mapping from device numeric codes to readable strings
    this.cardTypeMap = {
      0: 'Normal',
      1: 'VIP',
      2: 'Guest',
      3: 'Patrol',
      4: 'Blacklisted',
      5: 'Coercion'
    };

    // User name cache - stores userId -> userName mapping
    this.userCache = {};
    this.userCachePath = path.join(__dirname, '..', '..', 'data', 'user-cache.json');
    this.loadUserCache();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): AccessRecordService {
    if (!AccessRecordService.instance) {
      const repository = RepositoryFactory.accessRecords();
      AccessRecordService.instance = new AccessRecordService(repository);
    }
    return AccessRecordService.instance;
  }

  /**
   * Swap the underlying repository to the one now provided by RepositoryFactory.
   * Call this in startServer() after RepositoryFactory.initialize() so the
   * already-exported singleton switches to the SQL backend without needing
   * a new object reference.
   */
  static reinitialize(): void {
    const svc = AccessRecordService.getInstance();
    svc.repository = RepositoryFactory.accessRecords();
  }

  /**
   * Load user cache from file
   */
  private async loadUserCache(): Promise<void> {
    try {
      const data = await fs.readFile(this.userCachePath, 'utf-8');
      this.userCache = JSON.parse(data);
      logger.info(`Loaded user cache with ${Object.keys(this.userCache).length} users`);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        this.userCache = {};
        logger.info('No user cache file found, starting fresh');
      } else {
        logger.error('Error loading user cache:', error.message);
        this.userCache = {};
      }
    }
  }

  /**
   * Save user cache to file
   */
  private async saveUserCache(): Promise<void> {
    try {
      await fs.writeFile(
        this.userCachePath,
        JSON.stringify(this.userCache, null, 2),
        'utf-8'
      );
      logger.debug(`Saved user cache with ${Object.keys(this.userCache).length} users`);
    } catch (error: any) {
      logger.error('Error saving user cache:', error.message);
    }
  }

  /**
   * Cache user name if available
   */
  cacheUser(userId: string, userName: string): void {
    if (userId && userName && userName.trim()) {
      if (!this.userCache[userId]) {
        this.userCache[userId] = userName;
        this.saveUserCache();
        logger.info(`📝 Cached user name: ${userId} -> ${userName}`);
      }
    }
  }

  /**
   * Get user name from cache
   */
  getUserName(userId: string): string {
    return this.userCache[userId] || '';
  }

  /**
   * Initialize service
   */
  async initialize(): Promise<void> {
    try {
      await this.repository.initialize();
      logger.info('✅ AccessRecordService initialized successfully');
    } catch (error: any) {
      logger.error('❌ Failed to initialize AccessRecordService:', error.message);
      throw error;
    }
  }

  /**
   * Store access control event from device webhook
   */
  async storeAccessEvent(eventData: WebhookEventData): Promise<AccessEvent> {
    try {
      // Create raw event object
      const event: AccessEvent = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: eventData.type || 'access_control_event',
        deviceId: eventData.deviceId,
        timestamp: eventData.timestamp || new Date().toISOString(),
        data: eventData.data,
        storedAt: new Date().toISOString()
      };

      // Store raw event (for real-time WebSocket)
      await this.repository.storeEvent(event);

      // Extract and store access record if it has isSuccess field
      if (eventData.data && typeof eventData.data.isSuccess === 'boolean') {
        const record = this.formatAccessRecord(eventData, event);
        await this.repository.storeRecord(record);
        logger.info(`✅ Access record stored: ${record.userID || 'N/A'} - ${record.status}`);
      }

      logger.info(`✅ Access event stored: ${eventData.deviceId} - ${eventData.type}`);

      // Emit event for real-time WebSocket broadcast
      this.emit('access:control:event', event);

      return event;
    } catch (error: any) {
      logger.error('❌ Error storing access event:', error.message);
      throw error;
    }
  }

  /**
   * Format raw event data into access record format
   */
  formatAccessRecord(eventData: WebhookEventData, event: AccessEvent): AccessRecord {
    const data = eventData.data;

    // Parse rawJson to extract additional fields
    let rawJsonData: Record<string, any> = {};
    if (data.rawJson) {
      try {
        rawJsonData = JSON.parse(data.rawJson);
      } catch (e) {
        // Ignore if rawJson is invalid
      }
    }

    // Get user name - priority order:
    // 1. CardName from event (if SDK provides it)
    // 2. CardName from rawJson (if available)
    // 3. Cached name (if we've seen this user before)
    // 4. Empty string
    const userId = data.userId || rawJsonData.UserID || '';
    let userName = data.cardName || rawJsonData.CardName || '';

    // If name not in event, try cache
    if (!userName && userId) {
      userName = this.getUserName(userId);
    }

    // Cache the name if we found one
    if (userName && userId) {
      this.cacheUser(userId, userName);
    }

    // Get open method
    const openMethod = data.openMethod || rawJsonData.Method || rawJsonData.OpenMethod || 'Unknown';

    // Create formatted record
    const record: AccessRecord = {
      id: event.id,
      deviceId: eventData.deviceId,
      recordNumber: rawJsonData.CreateTime || rawJsonData.recordNumber || 0,
      userID: userId,
      userName: userName,
      cardNumber: data.cardNumber || rawJsonData.CardNo || rawJsonData.SN || '',
      swipeTime: data.timestamp || eventData.timestamp,
      doorNumber: rawJsonData.Door !== undefined ? rawJsonData.Door : 0,
      readerNo: rawJsonData.ReaderID || rawJsonData.readID || '',
      cardType: this.cardTypeMap[rawJsonData.CardType] || 'Unknown',
      openMethod: openMethod,
      status: data.isSuccess ? 'Success' : 'Failed',
      storedAt: event.storedAt
    };

    return record;
  }

  /**
   * Get recent access events (for real-time display)
   */
  async getRecentEvents(limit: number = 100): Promise<AccessEvent[]> {
    try {
      return await this.repository.getRecentEvents(limit);
    } catch (error: any) {
      logger.error('Error getting recent events:', error.message);
      throw error;
    }
  }

  /**
   * Get events by device
   */
  async getEventsByDevice(deviceId: string, limit: number = 50): Promise<AccessEvent[]> {
    try {
      return await this.repository.getEventsByDevice(deviceId, limit);
    } catch (error: any) {
      logger.error('Error getting events by device:', error.message);
      throw error;
    }
  }

  /**
   * Get access records with filtering and pagination
   */
  async getRecords(filters: RecordFilters = {}): Promise<{ records: AccessRecord[]; pagination: PaginationInfo }> {
    try {
      return await this.repository.getRecords(filters);
    } catch (error: any) {
      logger.error('Error getting records:', error.message);
      throw error;
    }
  }

  /**
   * Get all records (for export/backup)
   */
  async getAllRecords(): Promise<AccessRecord[]> {
    try {
      return await this.repository.getAllRecords();
    } catch (error: any) {
      logger.error('Error getting all records:', error.message);
      throw error;
    }
  }

  /**
   * Get records count by date range
   */
  async getRecordsCount(startDate: Date, endDate: Date): Promise<number> {
    try {
      return await this.repository.getRecordsCount(startDate, endDate);
    } catch (error: any) {
      logger.error('Error getting records count:', error.message);
      throw error;
    }
  }

  /**
   * Clear all events
   */
  async clearEvents(): Promise<void> {
    try {
      await this.repository.clearEvents();
      logger.info('✅ All events cleared');
    } catch (error: any) {
      logger.error('Error clearing events:', error.message);
      throw error;
    }
  }

  /**
   * Clear all records
   */
  async clearRecords(): Promise<void> {
    try {
      await this.repository.clearRecords();
      logger.info('✅ All records cleared');
    } catch (error: any) {
      logger.error('Error clearing records:', error.message);
      throw error;
    }
  }

  /**
   * Fetch and store records from SDK (for existing implementation)
   */
  async storeSdkRecords(newRecords: any[]): Promise<number> {
    try {
      let storedCount = 0;

      for (const record of newRecords) {
        // Only store records with Status field (authorized/unauthorized)
        // SDK returns lowercase 'status' due to JSON camelCase serialization
        const status = record.Status || record.status;
        if (status === 'Success' || status === 'Failed') {
          const recordEntry: AccessRecord = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${record.RecordNumber || record.recordNumber}`,
            deviceId: record.DeviceID || record.deviceId || '',
            recordNumber: record.RecordNumber || record.recordNumber,
            userID: record.UserID || record.userID || '',
            userName: record.UserName || record.userName || '',
            cardNumber: record.CardNumber || record.cardNumber || '',
            swipeTime: record.SwipeTime || record.swipeTime,
            doorNumber: record.DoorNumber || record.doorNumber || 0,
            readerNo: record.ReaderNo || record.readerNo || '',
            cardType: record.CardType || record.cardType || 'Unknown',
            openMethod: record.OpenMethod || 'Unknown',
            status: status,
            storedAt: new Date().toISOString()
          };

          await this.repository.storeRecord(recordEntry);
          storedCount++;
        }
      }

      logger.info(`✅ Stored ${storedCount} SDK records (total: ${storedCount})`);

      // Force save to ensure all records are written to disk immediately
      if (storedCount > 0) {
        await this.repository.forceSave?.();
        logger.info(`💾 Force saved ${storedCount} records to file`);
      }

      return storedCount;
    } catch (error: any) {
      logger.error('Error storing SDK records:', error.message);
      throw error;
    }
  }
}

export default AccessRecordService;
