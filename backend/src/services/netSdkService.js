const axios = require('axios');
const logger = require('../utils/logger');
const eventService = require('./eventService');

class NetSdkService {
  constructor() {
    this.bridgeUrl = process.env.NETSDK_BRIDGE_URL || 'http://localhost:5000';
    this.isInitialized = false;
    this.devices = []; // Cache for device state
  }

  async initialize() {
    try {
      logger.info('Initializing NetSDK Service...');

      // Initialize SDK via bridge
      const response = await axios.post(`${this.bridgeUrl}/api/sdk/init`);

      if (response.data.success) {
        this.isInitialized = true;
        logger.info('NetSDK initialized successfully');
        
        // Sync initial state from Bridge immediately
        await this.syncDevices();
        
        return true;
      } else {
        throw new Error(response.data.message || 'SDK initialization failed');
      }
    } catch (error) {
      logger.error('Failed to initialize NetSDK:', error.message);
      // Continue even if SDK init fails (for development/testing)
      this.isInitialized = true;
      await this.syncDevices();
      return true;
    }
  }

  /**
   * Fetch current device list from Bridge and update local cache.
   * This ensures the Backend state matches the Bridge state on startup.
   */
  async syncDevices() {
    try {
      const response = await axios.get(`${this.bridgeUrl}/api/devices`);
      const devices = response.data || [];
      
      // Update cache
      this.devices = devices;
      
      // Broadcast to frontend
      eventService.emit('devices:update', this.devices);
      
      logger.info(`Device state synced from Bridge: ${devices.length} devices found.`);
    } catch (error) {
      logger.error('Failed to sync devices from Bridge:', error.message);
    }
  }

  async startAutoReg(port = 9500) {
    try {
      const response = await axios.post(`${this.bridgeUrl}/api/autoreg/start`, { port });

      if (response.data.success) {
        logger.info(`Auto Registration Server started on port ${port}`);
        return response.data;
      } else {
        throw new Error(response.data.message);
      }
    } catch (error) {
      logger.error('Failed to start Auto Registration:', error.message);
      throw error;
    }
  }

  async stopAutoReg() {
    try {
      const response = await axios.post(`${this.bridgeUrl}/api/autoreg/stop`);

      if (response.data.success) {
        logger.info('Auto Registration Server stopped');
        return response.data;
      } else {
        throw new Error(response.data.message);
      }
    } catch (error) {
      logger.error('Failed to stop Auto Registration:', error.message);
      throw error;
    }
  }

  async getAllDevices() {
    // Return cached list for performance, or fetch if empty
    if (this.devices.length === 0) {
      await this.syncDevices();
    }
    return this.devices;
  }

  async getDevice(deviceId) {
    try {
      const response = await axios.get(`${this.bridgeUrl}/api/devices/${deviceId}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to get device ${deviceId}:`, error.message);
      throw error;
    }
  }

  async loginToDevice(ip, port, username, password) {
    try {
      const response = await axios.post(`${this.bridgeUrl}/api/devices/login`, {
        ip,
        port: port || 37777,
        username,
        password,
      });

      if (response.data.success) {
        logger.info(`Successfully logged in to device: ${ip}`);
        // Refresh cache after login
        await this.syncDevices();
        return response.data.device;
      } else {
        throw new Error(response.data.error || 'Login failed');
      }
    } catch (error) {
      logger.error(`Failed to login to device ${ip}:`, error.message);
      throw error;
    }
  }

  async logoutFromDevice(deviceId) {
    try {
      const response = await axios.post(`${this.bridgeUrl}/api/devices/${deviceId}/logout`);

      if (response.data.success) {
        logger.info(`Successfully logged out from device: ${deviceId}`);
        await this.syncDevices();
        return true;
      } else {
        throw new Error(response.data.error || 'Logout failed');
      }
    } catch (error) {
      logger.error(`Failed to logout from device ${deviceId}:`, error.message);
      throw error;
    }
  }

  async simulateEvent(deviceId, eventType, eventData) {
    try {
      const response = await axios.post(`${this.bridgeUrl}/api/devices/${deviceId}/simulate-event`, {
        eventType,
        eventData,
      });

      if (response.data.success) {
        logger.info(`Event simulated for device: ${deviceId}`);
        return true;
      } else {
        throw new Error(response.data.error || 'Event simulation failed');
      }
    } catch (error) {
      logger.error(`Failed to simulate event for device ${deviceId}:`, error.message);
      throw error;
    }
  }

  /**
   * Query access control records via NetSDK (Works over Internet/NAT)
   * Uses the existing TCP connection, so it works even when device is behind NAT/firewall.
   */
  async queryAccessRecordsBySDK(deviceId, startTime, endTime, cardNumber, maxRecords = 100) {
    try {
      const params = new URLSearchParams();
      if (startTime) params.append('startTime', startTime);
      if (endTime) params.append('endTime', endTime);
      if (cardNumber) params.append('cardNumber', cardNumber);
      if (maxRecords) params.append('maxRecords', maxRecords);

      const response = await axios.get(
        `${this.bridgeUrl}/api/devices/${deviceId}/access-records-sdk?${params.toString()}`
      );

      if (response.data.success) {
        logger.info(`Retrieved ${response.data.count} access records via NetSDK for device: ${deviceId}`);
        return response.data.records;
      } else {
        throw new Error(response.data.error || 'Failed to query access records via SDK');
      }
    } catch (error) {
      logger.error(`Failed to query access records via SDK for device ${deviceId}:`, error.message);
      throw error;
    }
  }

  /**
   * Called by the C# Bridge via Webhook when device status changes.
   * Replaces the polling mechanism.
   */
  async updateDeviceStatus(deviceId, status, timestamp) {
    try {
      logger.info(`🔔 Device status changed via Webhook: ${deviceId} -> ${status}`);

      // Update local cache immediately for responsiveness
      const deviceIndex = this.devices.findIndex(d => d.deviceID === deviceId || d.DeviceID === deviceId);
      if (deviceIndex !== -1) {
        this.devices[deviceIndex].status = status;
        this.devices[deviceIndex].Status = status;
      }

      eventService.emit('device:status:changed', {
        deviceID: deviceId,
        status: status,
        timestamp: timestamp || new Date().toISOString()
      });

      // Async refresh full list from Bridge to ensure all data (IP, Serial) is up to date
      this.syncDevices();

      return true;
    } catch (error) {
      logger.error(`Error updating device status for ${deviceId}:`, error.message);
      throw error;
    }
  }

  async cleanup() {
    try {
      if (this.isInitialized) {
        logger.info('Cleaning up NetSDK Service...');
        // Optionally call cleanup endpoint on bridge
        this.isInitialized = false;
      }
    } catch (error) {
      logger.error('Error during cleanup:', error.message);
    }
  }
}

module.exports = new NetSdkService();
