/**
 * IAccessRepository.js - Repository Interface for Access Data
 * 
 * This interface defines the contract for data storage operations.
 * Two implementations exist:
 * 1. FileRepository - Uses JSON files (current)
 * 2. SQLRepository - Uses MySQL/SQL Server (future)
 * 
 * To switch to database, just change the repository instance in server.js
 * No changes needed in routes or services!
 * 
 * =====================================================================
 * DATABASE SCHEMA DESIGN (For Future SQL Implementation)
 * =====================================================================
 * 
 * -- Table 1: Raw Access Events (Real-time WebSocket streaming)
 * -- Purpose: Store raw device events for real-time frontend updates
 * -- Retention: Keep only last 100 records (configurable)
 * 
 * CREATE TABLE IF NOT EXISTS access_events (
 *     id VARCHAR(36) PRIMARY KEY,
 *     device_id VARCHAR(50) NOT NULL,
 *     event_type VARCHAR(50) NOT NULL,
 *     user_id VARCHAR(50) DEFAULT NULL,
 *     card_number VARCHAR(50) DEFAULT NULL,
 *     is_success BOOLEAN DEFAULT FALSE,
 *     similarity INT DEFAULT 0,
 *     open_method VARCHAR(50) DEFAULT 'Unknown',
 *     raw_data JSON,                    -- Full device JSON response
 *     timestamp DATETIME NOT NULL,
 *     stored_at DATETIME NOT NULL,
 *     source VARCHAR(50) DEFAULT 'GENERAL_EVENT_MANAGER',
 *     INDEX idx_device_id (device_id),
 *     INDEX idx_timestamp (timestamp),
 *     INDEX idx_stored_at (stored_at)
 * ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
 * 
 * -- Table 2: Access Records (Access Records page display)
 * -- Purpose: Store formatted access records for history/analytics
 * -- Retention: Keep ALL records (unlimited history)
 * 
 * CREATE TABLE IF NOT EXISTS access_records (
 *     id VARCHAR(36) PRIMARY KEY,
 *     device_id VARCHAR(50) NOT NULL,
 *     record_number BIGINT DEFAULT 0,
 *     user_id VARCHAR(50) DEFAULT '',
 *     user_name VARCHAR(100) DEFAULT '',
 *     card_number VARCHAR(50) DEFAULT '',
 *     swipe_time DATETIME NOT NULL,
 *     door_number INT DEFAULT 0,
 *     reader_no VARCHAR(20) DEFAULT '',
 *     card_type VARCHAR(20) DEFAULT 'Unknown',
 *     status ENUM('Success', 'Failed') NOT NULL,
 *     stored_at DATETIME NOT NULL,
 *     INDEX idx_user_id (user_id),
 *     INDEX idx_device_id (device_id),
 *     INDEX idx_swipe_time (swipe_time),
 *     INDEX idx_status (status),
 *     INDEX idx_card_number (card_number),
 *     INDEX idx_stored_at (stored_at)
 * ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
 * 
 * =====================================================================
 * SQL Implementation Notes:
 * =====================================================================
 * 
 * -- Connection pooling for 100+ devices:
 * const mysql = require('mysql2/promise');
 * const pool = mysql.createPool({
 *   host: process.env.DB_HOST,
 *   user: process.env.DB_USER,
 *   password: process.env.DB_PASSWORD,
 *   database: process.env.DB_NAME,
 *   waitForConnections: true,
 *   connectionLimit: 20,          // Handle concurrent writes
 *   queueLimit: 0
 * });
 * 
 * -- Bulk insert for performance:
 * INSERT INTO access_records (id, device_id, user_id, ...) 
 * VALUES (?, ?, ?, ...), (?, ?, ?, ...), ...
 * ON DUPLICATE KEY UPDATE ...
 * 
 * -- Query with pagination:
 * SELECT * FROM access_records 
 * WHERE DATE(swipe_time) = ? AND status = ?
 * ORDER BY swipe_time DESC
 * LIMIT ? OFFSET ?;
 * 
 * -- Count for pagination:
 * SELECT COUNT(*) as total FROM access_records 
 * WHERE DATE(swipe_time) = ? AND status = ?;
 * 
 * -- Delete old events (keep only 100):
 * DELETE FROM access_events 
 * WHERE id NOT IN (
 *   SELECT id FROM (
 *     SELECT id FROM access_events 
 *     ORDER BY stored_at DESC 
 *     LIMIT 100
 *   ) as temp
 * );
 * 
 * -- Archive old records (monthly partitioning):
 * CREATE TABLE access_records_2026_04 
 * PARTITION OF access_records
 * FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
 * 
 * =====================================================================
 */

class IAccessRepository {
  /**
   * Store a raw access event (for real-time WebSocket streaming)
   * @param {Object} event - Event data
   * @returns {Promise<void>}
   */
  async storeEvent(event) {
    throw new Error('Method not implemented');
  }

  /**
   * Get recent access events (for real-time display)
   * @param {number} limit - Number of recent events to return
   * @returns {Promise<Array>}
   */
  async getRecentEvents(limit = 100) {
    throw new Error('Method not implemented');
  }

  /**
   * Get events by device ID
   * @param {string} deviceId 
   * @param {number} limit 
   * @returns {Promise<Array>}
   */
  async getEventsByDevice(deviceId, limit = 50) {
    throw new Error('Method not implemented');
  }

  /**
   * Delete old events, keeping only the most recent N records
   * @param {number} keepCount - Number of recent events to keep
   * @returns {Promise<number>} Number of deleted events
   */
  async deleteOldEvents(keepCount = 100) {
    throw new Error('Method not implemented');
  }

  /**
   * Store a formatted access record (for Access Records page)
   * @param {Object} record - Record data
   * @returns {Promise<void>}
   */
  async storeRecord(record) {
    throw new Error('Method not implemented');
  }

  /**
   * Get access records with filtering and pagination
   * @param {Object} filters 
   * @param {string} filters.date - Date filter (YYYY-MM-DD)
   * @param {string} filters.deviceId - Device ID filter
   * @param {string} filters.filter - 'all' | 'authorized' | 'unauthorized'
   * @param {number} filters.page - Page number
   * @param {number} filters.limit - Records per page
   * @returns {Promise<Object>} { records, pagination }
   */
  async getRecords(filters = {}) {
    throw new Error('Method not implemented');
  }

  /**
   * Get all records (for export/backup)
   * @returns {Promise<Array>}
   */
  async getAllRecords() {
    throw new Error('Method not implemented');
  }

  /**
   * Get records count by date range
   * @param {Date} startDate 
   * @param {Date} endDate 
   * @returns {Promise<number>}
   */
  async getRecordsCount(startDate, endDate) {
    throw new Error('Method not implemented');
  }

  /**
   * Clear all events
   * @returns {Promise<void>}
   */
  async clearEvents() {
    throw new Error('Method not implemented');
  }

  /**
   * Clear all records
   * @returns {Promise<void>}
   */
  async clearRecords() {
    throw new Error('Method not implemented');
  }

  /**
   * Initialize repository (load data, create tables, etc.)
   * @returns {Promise<void>}
   */
  async initialize() {
    throw new Error('Method not implemented');
  }
}

module.exports = { IAccessRepository };
