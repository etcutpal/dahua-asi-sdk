const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

class EventService extends EventEmitter {
  constructor() {
    super();
    this.eventHistory = [];
    this.accessControlEvents = [];
    this.maxHistorySize = 1000; // Keep last 1000 events
    this.maxAccessEvents = 500; // Keep last 500 access events
    this.dataPath = path.join(__dirname, '..', '..', 'data', 'access-events.json');
    
    // Load existing events on startup
    this.loadAccessEvents();
  }

  emit(eventName, data) {
    // Add timestamp if not present
    const eventData = {
      ...data,
      timestamp: data.timestamp || new Date().toISOString(),
    };

    // Add to history
    this.eventHistory.push({
      eventName,
      data: eventData,
    });

    // Trim history if needed
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }

    logger.debug(`Event emitted: ${eventName}`, eventData);
    return super.emit(eventName, eventData);
  }

  /**
   * Store access control event with file persistence
   */
  async storeAccessEvent(eventData) {
    try {
      const event = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        ...eventData,
        storedAt: new Date().toISOString()
      };

      // Add to in-memory cache
      this.accessControlEvents.push(event);

      // Trim if needed
      if (this.accessControlEvents.length > this.maxAccessEvents) {
        this.accessControlEvents = this.accessControlEvents.slice(-this.maxAccessEvents);
      }

      // Save to file
      await this.saveAccessEvents();

      logger.info(`✅ Access event stored: ${eventData.deviceId} - ${eventData.type}`);
      
      return event;
    } catch (error) {
      logger.error('Error storing access event:', error.message);
      throw error;
    }
  }

  /**
   * Load access events from file
   */
  async loadAccessEvents() {
    try {
      const data = await fs.readFile(this.dataPath, 'utf-8');
      const parsed = JSON.parse(data);
      this.accessControlEvents = parsed.events || [];
      logger.info(`Loaded ${this.accessControlEvents.length} access events from file`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.accessControlEvents = [];
        logger.info('No existing access events file found, starting fresh');
      } else {
        logger.error('Error loading access events:', error.message);
        this.accessControlEvents = [];
      }
    }
  }

  /**
   * Save access events to file
   */
  async saveAccessEvents() {
    try {
      const data = {
        events: this.accessControlEvents,
        lastUpdated: new Date().toISOString()
      };
      
      await fs.writeFile(
        this.dataPath,
        JSON.stringify(data, null, 2),
        'utf-8'
      );
      
      logger.debug(`Saved ${this.accessControlEvents.length} access events to file`);
    } catch (error) {
      logger.error('Error saving access events:', error.message);
      throw error;
    }
  }

  /**
   * Get access control events
   */
  getAccessControlEvents(limit = 50) {
    return this.accessControlEvents.slice(-limit).reverse(); // Most recent first
  }

  /**
   * Get access events by device
   */
  getAccessEventsByDevice(deviceId, limit = 50) {
    return this.accessControlEvents
      .filter(event => event.deviceId === deviceId)
      .slice(-limit)
      .reverse();
  }

  /**
   * Clear access control event history
   */
  async clearAccessEventHistory() {
    this.accessControlEvents = [];
    await this.saveAccessEvents();
    logger.info('Access event history cleared');
  }

  getEventHistory(limit = 50) {
    return this.eventHistory.slice(-limit);
  }

  getEventsByDevice(deviceId, limit = 50) {
    return this.eventHistory
      .filter(event => event.data.deviceId === deviceId || event.data.deviceID === deviceId)
      .slice(-limit);
  }

  getEventsByType(eventType, limit = 50) {
    return this.eventHistory
      .filter(event => event.data.eventType === eventType)
      .slice(-limit);
  }

  async clearHistory() {
    this.eventHistory = [];
    logger.info('Event history cleared');
  }
}

module.exports = new EventService();
