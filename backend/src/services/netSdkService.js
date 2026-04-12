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

      // Normalize devices to have both camelCase and PascalCase fields
      this.devices = devices.map(device => ({
        ...device,
        // Ensure both cases are available
        deviceId: device.DeviceID || device.deviceId || device.deviceID,
        deviceID: device.DeviceID || device.deviceID,
        DeviceID: device.DeviceID || device.deviceID,
        status: device.Status || device.status || 'Offline',
        Status: device.Status || device.status || 'Offline',
      }));

      // Broadcast to frontend
      eventService.emit('devices:update', this.devices);

      logger.info(`Device state synced from Bridge: ${this.devices.length} devices found.`);
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
    // Always sync from Bridge to ensure we have latest status
    // This is important for the Person Management sync feature
    try {
      await this.syncDevices();
    } catch (error) {
      logger.warn('Failed to sync devices, returning cached list:', error.message);
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
      let deviceIndex = this.devices.findIndex(d => 
        d.DeviceID === deviceId || 
        d.deviceID === deviceId ||
        d.registrationId === deviceId ||
        d.deviceId === deviceId
      );
      
      if (deviceIndex !== -1) {
        // Update existing device in cache
        this.devices[deviceIndex].status = status;
        this.devices[deviceIndex].Status = status;
        logger.debug(`Updated device in cache: ${deviceId} -> ${status}`);
      } else {
        // Device not in cache yet - fetch it from Bridge or create a placeholder
        logger.warn(`Device ${deviceId} not found in cache, will be included in next sync`);
      }

      // Emit socket event to frontend immediately
      eventService.emit('device:status:changed', {
        deviceID: deviceId,
        deviceId: deviceId,
        status: status,
        timestamp: timestamp || new Date().toISOString()
      });

      // Async refresh full list from Bridge to ensure all data is up to date
      // This will repopulate the cache with fresh data including status
      this.syncDevices().catch(err => logger.error('Sync after status update failed:', err.message));

      return true;
    } catch (error) {
      logger.error(`Error updating device status for ${deviceId}:`, error.message);
      throw error;
    }
  }

  /**
   * Add person to access control device via NET SDK
   * @param {string} deviceId - Device ID (serial number)
   * @param {string} personId - Person ID
   * @param {string} personName - Person name
   * @param {Buffer} faceImageBuffer - Face image binary data
   * @param {string} faceImageFilename - Original filename
   * @param {string} cardNumber - Card number (optional)
   * @param {boolean} isUpdate - Whether this is an UPDATE operation (default: false for CREATE)
   * @param {string} oldCardNumber - Previous card number to remove (for UPDATE operations)
   */
  async addPersonToDevice(deviceId, personId, personName, faceImageBuffer, faceImageFilename, cardNumber, isUpdate = false, oldCardNumber = null) {
    try {
      const operation = isUpdate ? 'Updating' : 'Adding';
      logger.info(`${operation} person ${personId} (${personName}) on device ${deviceId}`);
      logger.info(`📊 Face image size: ${faceImageBuffer ? `${(faceImageBuffer.length / 1024).toFixed(2)} KB` : 'none'}, Card: ${cardNumber || 'none'}, Old card: ${oldCardNumber || 'none'}`);

      // Create FormData for multipart request
      const FormData = require('form-data');
      const formData = new FormData();

      formData.append('deviceId', deviceId);
      formData.append('personId', personId);
      formData.append('personName', personName);
      formData.append('isUpdate', isUpdate ? 'true' : 'false');  // Pass update flag

      if (cardNumber) {
        formData.append('cardNumber', cardNumber);
      }

      if (oldCardNumber) {
        formData.append('oldCardNumber', oldCardNumber);
      }

      if (faceImageBuffer && faceImageFilename) {
        formData.append('faceImage', faceImageBuffer, {
          filename: faceImageFilename,
          contentType: faceImageFilename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'
        });
        logger.info(`🖼️ Face image attached: ${faceImageFilename}, Size: ${(faceImageBuffer.length / 1024).toFixed(2)} KB`);
      } else {
        logger.warn(`⚠️ No face image included in request`);
      }

      logger.info(`📡 Sending request to C# Bridge: ${this.bridgeUrl}/api/persons/add-to-device`);
      const startTime = Date.now();

      const response = await axios.post(
        `${this.bridgeUrl}/api/persons/add-to-device`,
        formData,
        {
          headers: formData.getHeaders(),
          timeout: 60000 // 60 second timeout for face upload (increased from 30s)
        }
      );

      const elapsed = Date.now() - startTime;
      logger.info(`⏱️ Bridge response time: ${elapsed}ms`);

      if (response.data.success) {
        logger.info(`✅ Successfully ${isUpdate ? 'updated' : 'added'} person ${personId} to device ${deviceId}`);
        logger.info(`  - User added: ${response.data.result.userAdded}`);
        logger.info(`  - Card added: ${response.data.result.cardAdded}`);
        logger.info(`  - Face added: ${response.data.result.faceAdded}`);
        return response.data.result;
      } else {
        logger.error(`❌ Bridge returned failure: ${response.data.result?.error || response.data.error}`);
        throw new Error(response.data.result?.error || response.data.error || `Failed to ${isUpdate ? 'update' : 'add'} person to device`);
      }
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        logger.error(`⏰ Bridge request TIMEOUT (60s exceeded)`);
        throw new Error(`Device sync timeout - the C# Bridge is not responding. Check if it's running.`);
      } else if (error.code === 'ECONNREFUSED') {
        logger.error(`🚫 C# Bridge connection refused at ${this.bridgeUrl}`);
        throw new Error(`C# Bridge is not running. Please start it first.`);
      } else if (error.response) {
        logger.error(`❌ Bridge error response: ${JSON.stringify(error.response.data)}`);
        logger.error(`❌ Bridge status: ${error.response.status}`);
        throw new Error(error.response.data?.error || error.response.data?.message || error.message);
      } else {
        logger.error(`❌ Network error adding person to device:`, error);
        throw new Error(`Device sync failed: ${error.message}`);
      }
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
