/**
 * AccessRecordFetchService.ts - Service for fetching access records from devices via SDK
 */

import axios from 'axios';
import logger from '../utils/logger';
import AccessRecordService from './accessRecordService';

interface FetchOptions {
  deviceId?: string;
  startDate?: string;
  endDate?: string;
  maxRecords?: number;
}

interface DeviceResult {
  deviceId: string;
  fetched?: number;
  stored?: number;
  message?: string;
  error?: string;
}

interface FetchResult {
  success: boolean;
  totalFetched: number;
  totalStored: number;
  deviceResults: DeviceResult[];
  summary?: {
    devicesQueried: number;
    devicesWithRecords: number;
    dateRange: {
      start: string;
      end: string;
    };
  };
  error?: string;
}

interface Statistics {
  totalRecords: number;
  authorized: number;
  unauthorized: number;
  uniqueUsers: number;
  uniqueDevices: number;
}

class AccessRecordFetchService {
  private bridgeUrl: string;
  private accessRecordService: AccessRecordService;

  constructor() {
    this.bridgeUrl = process.env.NETSDK_BRIDGE_URL || 'http://localhost:5000';
    this.accessRecordService = AccessRecordService.getInstance();
  }

  /**
   * Fetch and store access records from all online devices
   */
  async fetchAndStoreRecords(options: FetchOptions = {}): Promise<FetchResult> {
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
      const devicesResponse = await axios.get<any[]>(`${this.bridgeUrl}/api/devices`);
      logger.info(`📥 Bridge response: ${JSON.stringify(devicesResponse.data, null, 2)}`);

      // Bridge returns array directly, not wrapped in object
      const allDevices = Array.isArray(devicesResponse.data)
        ? devicesResponse.data
        : (devicesResponse.data as any).devices || (devicesResponse.data as any).value || [];

      logger.info(`📊 Total devices found: ${allDevices.length}`);
      logger.info(`📋 Devices: ${JSON.stringify(allDevices.map((d: any) => ({ id: d.deviceID || d.DeviceID, status: d.status || d.Status, loginHandle: d.loginHandle })), null, 2)}`);

      // Filter to specific device if requested
      let devices = allDevices;
      if (deviceId) {
        devices = devices.filter((d: any) =>
          d.deviceID === deviceId || d.DeviceID === deviceId || d.deviceId === deviceId
        );
        logger.info(`🎯 Filtered to device: ${deviceId}`);
      }

      // Filter only online devices
      const onlineDevices = devices.filter((d: any) => {
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
      const deviceResults: DeviceResult[] = [];

      // Fetch records from each online device
      for (const device of onlineDevices) {
        const devId = device.deviceID || device.DeviceID || device.deviceId;

        try {
          logger.info(`📡 Fetching records from device: ${devId}`);

          // Build query parameters
          // Use local datetime strings (not UTC ISO) so the device—which stores
          // times in local timezone and queries with bRealUTCTimeEnable=false—
          // receives correct start/end times without offset drift.
          const params: Record<string, any> = { maxRecords };
          if (startDate) {
            // Midnight local time on start day
            params.startTime = `${startDate}T00:00:00`;
          }
          if (endDate) {
            // End of day local time on end day
            params.endTime = `${endDate}T23:59:59`;
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
        } catch (error: any) {
          logger.error(`❌ Error fetching records from ${devId}: ${error.message}`);
          deviceResults.push({
            deviceId: devId,
            error: error.message
          });
        }
      }

      const result: FetchResult = {
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
    } catch (error: any) {
      logger.error('❌ Error in fetchAndStoreRecords:', error.message);
      throw error;
    }
  }

  /**
   * Get fetch statistics
   */
  async getStatistics(): Promise<{ success: boolean; stats: Statistics }> {
    try {
      const allRecords = await this.accessRecordService.getAllRecords();

      const stats: Statistics = {
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
    } catch (error: any) {
      logger.error('Error getting statistics:', error.message);
      throw error;
    }
  }
}

export default new AccessRecordFetchService();
