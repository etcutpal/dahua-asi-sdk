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
import deviceCache from './deviceCache';
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
        logger.error(`Error loading user cache: ${error.message}`);
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
      logger.error(`Error saving user cache: ${error.message}`);
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
      logger.error(`❌ Failed to initialize AccessRecordService: ${error.message}`);
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
      let record: AccessRecord | undefined;
      if (eventData.data && typeof eventData.data.isSuccess === 'boolean') {
        record = this.formatAccessRecord(eventData, event);
        await this.repository.storeRecord(record);
        logger.info(`✅ Access record stored: ${record.userID || 'N/A'} - ${record.status}`);
      }

      logger.info(`✅ Access event stored: ${eventData.deviceId} - ${eventData.type}`);

      // Emit event for real-time WebSocket broadcast — include enriched record if available
      this.emit('access:control:event', { event, record });

      return event;
    } catch (error: any) {
      logger.error(`❌ Error storing access event: ${error.message}`);
      throw error;
    }
  }

  /**
   * Derive a card type label from the open method when the device does not
   * supply a numeric CardType (e.g. real-time SDK StartListen callback).
   */
  private deriveCardType(openMethod: string): string {
    const m = openMethod.toLowerCase();
    if (m.includes('face'))                       return 'Face';
    if (m.includes('fingerprint'))                return 'Fingerprint';
    if (m.includes('userid+password')
     || m.includes('userid and password')
     || m.includes('custompassword')
     || m.includes('custom_password')
     || m === 'password')                         return 'Password';
    if (m.includes('password'))                   return 'Password';
    if (m.includes('card'))                       return 'Card';
    if (m.includes('qrcode') || m.includes('qr')) return 'QRCode';
    if (m.includes('bluetooth'))                  return 'Bluetooth';
    if (m.includes('remote'))                     return 'Remote';
    if (m.includes('button'))                     return 'LocalButton';
    if (m.includes('key'))                        return 'Key';
    if (m.includes('duress'))                     return 'Duress';
    return 'Unknown';
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
    // SDK callback (StartListen) sends it as data.eventType
    // Fetch path sends it as data.openMethod or rawJson.Method / rawJson.OpenMethod
    const openMethod = data.openMethod || data.eventType || rawJsonData.Method || rawJsonData.OpenMethod || 'Unknown';

    // Enrich with device info from in-memory cache (loaded from `devices` table)
    const registrationId = eventData.deviceId;
    const cachedDevice = deviceCache.get(registrationId);
    const internalDeviceId = cachedDevice?.deviceId ?? '';
    // Device name comes ONLY from the devices DB — never from the webhook payload
    const deviceName = cachedDevice?.name ?? '';

    // Create formatted record
    const swipeTimestamp = data.timestamp || eventData.timestamp;
    const record: AccessRecord = {
      id: event.id,
      registrationId,
      deviceId: internalDeviceId,
      deviceName,
      // recordNumber: live path sends nPunchingRecNo as data.recordNumber.
      // Real-time alarm events (StartListen) always return 0 for nPunchingRecNo —
      // the SDK only populates it in FindRecord (fetch path).
      // Store null when not available so it doesn't conflict with real fetch-path
      // record numbers (e.g. 427). Both paths now store the real device value.
      recordNumber: (data.recordNumber || rawJsonData.recordNumber || null) as number | null,
      userID: userId,
      userName: userName,
      cardNumber: data.cardNumber || rawJsonData.CardNo || rawJsonData.SN || '',
      swipeTime: swipeTimestamp,
      doorNumber: rawJsonData.Door !== undefined ? rawJsonData.Door : (data.door ?? 0),
      readerNo: rawJsonData.ReaderID || rawJsonData.readID || data.readerId || '',
      // cardType: live path now sends emCardType string directly as data.cardType
      cardType: data.cardType || this.cardTypeMap[rawJsonData.CardType] || this.deriveCardType(openMethod),
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
      logger.error(`Error getting recent events: ${error.message}`);
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
      logger.error(`Error getting events by device: ${error.message}`);
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
      logger.error(`Error getting records: ${error.message}`);
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
      logger.error(`Error getting all records: ${error.message}`);
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
      logger.error(`Error getting records count: ${error.message}`);
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
      logger.error(`Error clearing events: ${error.message}`);
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
      logger.error(`Error clearing records: ${error.message}`);
      throw error;
    }
  }

  /**
   * Migrate all access records from old registrationId to new registrationId.
   * Called when a device's Registration ID is changed (e.g. broken device replaced).
   */
  async renameDevice(oldRegistrationId: string, newRegistrationId: string): Promise<number> {
    try {
      return await this.repository.renameDevice(oldRegistrationId, newRegistrationId);
    } catch (error: any) {
      logger.error(`Error renaming device in access records: ${error.message}`);
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

          // ── Device enrichment ──────────────────────────────────────────
          // deviceCache is loaded from the `devices` table at startup and
          // refreshed on every device create/update/delete.
          // Cache: registrationId → { deviceId (internal UUID), name, registrationId }
          //
          // The bridge's DeviceID = the registrationId we passed to QueryRecords.
          // Secondary serial lookup handles the edge case where a device was
          // registered in the DB using its hardware serial as the registrationId.
          const rawId = record.DeviceID || record.deviceId || record.DeviceId || '';
          const serialFromBridge = record.SerialNumber || record.serialNumber || '';

          const cachedDevice =
            deviceCache.get(rawId) ||
            (serialFromBridge ? deviceCache.get(serialFromBridge) : null);

          // Always use the canonical registrationId from the devices DB if found.
          // This ensures access_records.registration_id always equals devices.registration_id.
          const registrationId = cachedDevice?.registrationId || rawId;
          const internalDeviceId = cachedDevice?.deviceId ?? '';
          // Device name comes ONLY from the devices DB (what the user entered).
          // Never use the bridge's DeviceName (which is the hardware serial) or
          // the serial number itself as a name.
          const deviceName = cachedDevice?.name ?? '';

          if (!cachedDevice) {
            logger.warn(`[storeSdkRecords] No device cache match for id="${rawId}" serial="${serialFromBridge}" — deviceName/deviceId will be empty`);
          }

          // ── User name enrichment ───────────────────────────────────────
          // The SDK fetch path (FindRecord) may return an empty CardName.
          // Fall back to the user name cache (populated by real-time events).
          const userId = record.UserID || record.userID || '';
          let userName = record.UserName || record.userName || '';
          if (!userName && userId) {
            userName = this.getUserName(userId);
          }
          // Cache the name so future records for this user are also enriched
          if (userName && userId) {
            this.cacheUser(userId, userName);
          }

          const swipeTimeRaw = record.SwipeTime || record.swipeTime || '';
          const rawRecordNumber = record.RecordNumber ?? record.recordNumber ?? null;
          // FindRecord (fetch path) returns real nRecNo values from device.
          // Use null (not a timestamp fallback) when not available, so both paths
          // store consistent types — real sequential numbers or null.
          const recordNumber: number | null = rawRecordNumber || null;

          const recordEntry: AccessRecord = {
            // Deterministic ID: device+recordNumber+swipeTime so the same physical
            // record is never inserted twice (works for both SQL and file repos).
            id: `sdk-${registrationId}-${recordNumber ?? 'null'}-${swipeTimeRaw.replace(/[^0-9]/g, '')}`,
            registrationId,
            deviceId: internalDeviceId,
            deviceName,
            recordNumber,
            userID: userId,
            userName,
            cardNumber: record.CardNumber || record.cardNumber || '',
            swipeTime: swipeTimeRaw,
            doorNumber: record.DoorNumber ?? record.doorNumber ?? 0,
            readerNo: record.ReaderNo || record.readerNo || '',
            cardType: record.CardType || record.cardType || 'Unknown',
            openMethod: record.OpenMethod || record.openMethod || 'Unknown',
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

        // Emit event so frontend can auto-refresh the attendance report.
        // Collect the unique dates from the newly stored records so the UI
        // knows which date range was affected.
        const affectedDates = [...new Set(
          newRecords
            .map(r => (r.SwipeTime || r.swipeTime || '').slice(0, 10))
            .filter(Boolean)
        )].sort();
        this.emit('attendance:updated', { storedCount, affectedDates });
      }

      return storedCount;
    } catch (error: any) {
      logger.error(`Error storing SDK records: ${error.message}`);
      throw error;
    }
  }
}

export default AccessRecordService;
