/**
 * accessRecordFetchService.js - Service for fetching access records from devices via SDK
 * 
 * This service fetches historical access records from devices using the SDK TCP method
 * (via auto-registration connection on port 9500).
 * 
 * Architecture:
 * 1. Request records from all online devices via C# Bridge module endpoint
 * 2. Store fetched records in access-record.json via repository
 * 3. Return results with statistics
 */

const axios = require('axios');
const logger = require('../utils/logger');
const AccessRecordService = require('./accessRecordService');

class AccessRecordFetchService {
  constructor() {
    this.bridgeUrl = process.env.NETSDK_BRIDGE_URL || 'http://localhost:5000';
    // Get the singleton instance
    this.accessRecordService = AccessRecordService.getInstance();
  }

  /**
   * Fetch and store access records from all online devices
   * 
   * @param {Object} options
   * @param {string} options.deviceId - Specific device ID (optional, fetches from all if not provided)
   * @param {string} options.startDate - Start date (YYYY-MM-DD)
   * @param {string} options.endDate - End date (YYYY-MM-DD)
   * @param {number} options.maxRecords - Max records per device (default 1000)
   * @returns {Promise<Object>} Results with statistics
   */
  async fetchAndStoreRecords(options = {}) {
    const {
      deviceId,
      startDate,
      endDate,
      maxRecords = 1000
    } = options;

    try {
      logger.info(`📥 Fetching access records from devices...`);
      logger.info(`   Date Range: ${startDate || '7 days ago'} to ${endDate || 'now'}`);
      logger.info(`   Max Records Per Device: ${maxRecords}`);

      // Get all devices
      logger.info('📡 Fetching devices from C# Bridge...');
      const devicesResponse = await axios.get(`${this.bridgeUrl}/api/devices`);
      logger.info(`📥 Bridge response: ${JSON.stringify(devicesResponse.data, null, 2)}`);
      
      // Bridge returns array directly, not wrapped in object
      const allDevices = Array.isArray(devicesResponse.data) 
        ? devicesResponse.data 
        : devicesResponse.data.devices || devicesResponse.data.value || [];
      
      logger.info(`📊 Total devices found: ${allDevices.length}`);
      logger.info(`📋 Devices: ${JSON.stringify(allDevices.map(d => ({ id: d.deviceID || d.DeviceID, status: d.status || d.Status, loginHandle: d.loginHandle })), null, 2)}`);

      // Filter to specific device if requested
      let devices = allDevices;
      if (deviceId) {
        devices = devices.filter(d =>
          d.deviceID === deviceId || d.DeviceID === deviceId || d.deviceId === deviceId
        );
        logger.info(`🎯 Filtered to device: ${deviceId}`);
      }

      // Filter only online devices
      const onlineDevices = devices.filter(d => {
        const isOnline = d.status === 'Online' || d.Status === 'Online' || (d.loginHandle && d.loginHandle > 0);
        if (!isOnline) {
          logger.warn(`⚠️ Device ${d.deviceID || d.DeviceID} not online - status: ${d.status || d.Status}, loginHandle: ${d.loginHandle}`);
        }
        return isOnline;
      });

      logger.info(`✅ Online devices: ${onlineDevices.length}`);

      if (onlineDevices.length === 0) {
        return {
          success: false,
          error: 'No online devices available',
          totalFetched: 0,
          totalStored: 0,
          deviceResults: []
        };
      }

      logger.info(`🔍 Found ${onlineDevices.length} online device(s)`);

      let totalFetched = 0;
      let totalStored = 0;
      const deviceResults = [];

      // Fetch records from each online device
      for (const device of onlineDevices) {
        const devId = device.deviceID || device.DeviceID || device.deviceId;

        try {
          logger.info(`📡 Fetching records from device: ${devId}`);

          // Build query parameters
          const params = { maxRecords };
          if (startDate) params.startTime = new Date(startDate).toISOString();
          if (endDate) {
            const endDateTime = new Date(endDate);
            endDateTime.setHours(23, 59, 59, 999);
            params.endTime = endDateTime.toISOString();
          }

          // Call the module endpoint (TCP method via FindRecord API)
          const response = await axios.get(
            `${this.bridgeUrl}/api/devices/${devId}/access-records-module`,
            { params }
          );

          const records = response.data.records || [];
          logger.info(`✅ Fetched ${records.length} records from ${devId}`);

          if (records.length > 0) {
            // Store records using accessRecordService
            const stored = await this.accessRecordService.storeSdkRecords(records);
            totalFetched += records.length;
            totalStored += stored;

            deviceResults.push({
              deviceId: devId,
              fetched: records.length,
              stored
            });
          } else {
            deviceResults.push({
              deviceId: devId,
              fetched: 0,
              stored: 0,
              message: 'No records found'
            });
          }
        } catch (error) {
          logger.error(`❌ Error fetching records from ${devId}: ${error.message}`);
          deviceResults.push({
            deviceId: devId,
            error: error.message
          });
        }
      }

      const result = {
        success: true,
        totalFetched,
        totalStored,
        deviceResults,
        summary: {
          devicesQueried: onlineDevices.length,
          devicesWithRecords: deviceResults.filter(r => r.fetched > 0).length,
          dateRange: {
            start: startDate || '7 days ago',
            end: endDate || 'now'
          }
        }
      };

      logger.info(`✅ Fetch complete: ${totalFetched} fetched, ${totalStored} stored`);
      return result;
    } catch (error) {
      logger.error('❌ Error in fetchAndStoreRecords:', error.message);
      throw error;
    }
  }

  /**
   * Get fetch statistics
   * 
   * @returns {Promise<Object>} Statistics
   */
  async getStatistics() {
    try {
      const allRecords = await this.accessRecordService.getAllRecords();
      
      const stats = {
        totalRecords: allRecords.length,
        authorized: allRecords.filter(r => r.status === 'Success').length,
        unauthorized: allRecords.filter(r => r.status === 'Failed').length,
        uniqueUsers: new Set(allRecords.filter(r => r.userID).map(r => r.userID)).size,
        uniqueDevices: new Set(allRecords.filter(r => r.deviceId).map(r => r.deviceId)).size
      };

      return {
        success: true,
        stats
      };
    } catch (error) {
      logger.error('Error getting statistics:', error.message);
      throw error;
    }
  }
}

module.exports = new AccessRecordFetchService();
