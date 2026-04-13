/**
 * AccessRecordService.js - Unified Service for Access Events & Records
 * 
 * This service handles:
 * 1. Real-time access events (stored in access-events.json) - Last 100 only
 * 2. Access records history (stored in access-record.json) - Unlimited
 * 
 * Uses Repository Pattern for easy database migration later.
 * Current: FileRepository (JSON files)
 * Future: SQLRepository (MySQL/SQL Server) - Just swap the repository!
 * 
 * Architecture:
 *   webhook → service.storeAccessEvent()
 *                    ↓
 *           repository.storeEvent()     → access-events.json (100 limit)
 *           repository.storeRecord()    → access-record.json (unlimited)
 */

const EventEmitter = require('events');
const logger = require('../utils/logger');
const FileRepository = require('../repositories/FileRepository');
const fs = require('fs').promises;
const path = require('path');

class AccessRecordService extends EventEmitter {
  /**
   * @param {IAccessRepository} repository - Repository implementation
   */
  constructor(repository) {
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
    // This solves the SDK limitation where alarm events don't include CardName
    this.userCache = {};
    this.userCachePath = path.join(__dirname, '..', '..', 'data', 'user-cache.json');
    this.loadUserCache();
  }

  /**
   * Load user cache from file
   */
  async loadUserCache() {
    try {
      const data = await fs.readFile(this.userCachePath, 'utf-8');
      this.userCache = JSON.parse(data);
      logger.info(`Loaded user cache with ${Object.keys(this.userCache).length} users`);
    } catch (error) {
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
  async saveUserCache() {
    try {
      await fs.writeFile(
        this.userCachePath,
        JSON.stringify(this.userCache, null, 2),
        'utf-8'
      );
      logger.debug(`Saved user cache with ${Object.keys(this.userCache).length} users`);
    } catch (error) {
      logger.error('Error saving user cache:', error.message);
    }
  }

  /**
   * Cache user name if available
   */
  cacheUser(userId, userName) {
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
  getUserName(userId) {
    return this.userCache[userId] || '';
  }

  /**
   * Initialize service
   */
  async initialize() {
    try {
      await this.repository.initialize();
      logger.info('✅ AccessRecordService initialized successfully');
    } catch (error) {
      logger.error('❌ Failed to initialize AccessRecordService:', error.message);
      throw error;
    }
  }

  /**
   * Store access control event from device webhook
   * This method:
   * 1. Stores raw event for real-time WebSocket streaming (access-events.json)
   * 2. Extracts and stores formatted record for history (access-record.json)
   * 3. Emits event for real-time WebSocket broadcast
   * 
   * @param {Object} eventData - Event data from webhook
   * @param {string} eventData.type - Event type
   * @param {string} eventData.deviceId - Device ID
   * @param {string} eventData.timestamp - Event timestamp
   * @param {Object} eventData.data - Event data payload
   */
  async storeAccessEvent(eventData) {
    try {
      // Create raw event object
      const event = {
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
    } catch (error) {
      logger.error('❌ Error storing access event:', error.message);
      throw error;
    }
  }

  /**
   * Format raw event data into access record format
   * 
   * @param {Object} eventData - Original event data
   * @param {Object} event - Formatted event object
   * @returns {Object} Formatted access record
   */
  formatAccessRecord(eventData, event) {
    const data = eventData.data;
    
    // Parse rawJson to extract additional fields
    let rawJsonData = {};
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
    const record = {
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
   * 
   * @param {number} limit - Number of events to return (default: 100)
   * @returns {Promise<Array>}
   */
  async getRecentEvents(limit = 100) {
    try {
      return await this.repository.getRecentEvents(limit);
    } catch (error) {
      logger.error('Error getting recent events:', error.message);
      throw error;
    }
  }

  /**
   * Get events by device
   * 
   * @param {string} deviceId 
   * @param {number} limit 
   * @returns {Promise<Array>}
   */
  async getEventsByDevice(deviceId, limit = 50) {
    try {
      return await this.repository.getEventsByDevice(deviceId, limit);
    } catch (error) {
      logger.error('Error getting events by device:', error.message);
      throw error;
    }
  }

  /**
   * Get access records with filtering and pagination
   * 
   * @param {Object} filters
   * @param {string} filters.date - Single date filter (YYYY-MM-DD) - for backward compatibility
   * @param {string} filters.startDate - Start date filter (YYYY-MM-DD)
   * @param {string} filters.endDate - End date filter (YYYY-MM-DD)
   * @param {string} filters.deviceId - Device ID filter
   * @param {string} filters.filter - 'all' | 'authorized' | 'unauthorized'
   * @param {number} filters.page - Page number
   * @param {number} filters.limit - Records per page
   * @returns {Promise<Object>}
   */
  async getRecords(filters = {}) {
    try {
      return await this.repository.getRecords(filters);
    } catch (error) {
      logger.error('Error getting records:', error.message);
      throw error;
    }
  }

  /**
   * Get all records (for export/backup)
   * 
   * @returns {Promise<Array>}
   */
  async getAllRecords() {
    try {
      return await this.repository.getAllRecords();
    } catch (error) {
      logger.error('Error getting all records:', error.message);
      throw error;
    }
  }

  /**
   * Get records count by date range
   * 
   * @param {Date} startDate 
   * @param {Date} endDate 
   * @returns {Promise<number>}
   */
  async getRecordsCount(startDate, endDate) {
    try {
      return await this.repository.getRecordsCount(startDate, endDate);
    } catch (error) {
      logger.error('Error getting records count:', error.message);
      throw error;
    }
  }

  /**
   * Clear all events
   * 
   * @returns {Promise<void>}
   */
  async clearEvents() {
    try {
      await this.repository.clearEvents();
      logger.info('✅ All events cleared');
    } catch (error) {
      logger.error('Error clearing events:', error.message);
      throw error;
    }
  }

  /**
   * Clear all records
   * 
   * @returns {Promise<void>}
   */
  async clearRecords() {
    try {
      await this.repository.clearRecords();
      logger.info('✅ All records cleared');
    } catch (error) {
      logger.error('Error clearing records:', error.message);
      throw error;
    }
  }

  /**
   * Fetch and store records from SDK (for existing implementation)
   * This method is for fetching historical records from devices via SDK
   * 
   * @param {Array} newRecords - Records from SDK
   * @returns {Promise<number>} Number of records stored
   */
  async storeSdkRecords(newRecords) {
    try {
      let storedCount = 0;

      for (const record of newRecords) {
        // Only store records with Status field (authorized/unauthorized)
        // SDK returns lowercase 'status' due to JSON camelCase serialization
        const status = record.Status || record.status;
        if (status === 'Success' || status === 'Failed') {
          const recordEntry = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${record.RecordNumber || record.recordNumber}`,
            deviceId: record.DeviceID || record.deviceId || '',
            recordNumber: record.RecordNumber || record.recordNumber,
            cardNumber: record.CardNumber || record.cardNumber || '',
            userID: record.UserID || record.userID || '',
            userName: record.UserName || record.userName || '',
            swipeTime: record.SwipeTime || record.swipeTime,
            doorNumber: record.DoorNumber || record.doorNumber || 0,
            readerNo: record.ReaderNo || record.readerNo || '',
            cardType: record.CardType || record.cardType || 'Unknown',
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
        await this.repository.forceSave();
        logger.info(`💾 Force saved ${storedCount} records to file`);
      }
      
      return storedCount;
    } catch (error) {
      logger.error('Error storing SDK records:', error.message);
      throw error;
    }
  }
}

// Singleton instance - creates one shared instance with FileRepository
let instance = null;

function getInstance() {
  if (!instance) {
    const repository = new FileRepository();
    instance = new AccessRecordService(repository);
  }
  return instance;
}

// Export both class and singleton
module.exports = AccessRecordService;
module.exports.getInstance = getInstance;
