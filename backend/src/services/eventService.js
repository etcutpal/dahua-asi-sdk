const EventEmitter = require('events');
const logger = require('../utils/logger');

class EventService extends EventEmitter {
  constructor() {
    super();
    this.eventHistory = [];
    this.maxHistorySize = 1000; // Keep last 1000 events
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

  clearHistory() {
    this.eventHistory = [];
    logger.info('Event history cleared');
  }
}

module.exports = new EventService();
