import axios from 'axios';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';
import AccessRecordService from './accessRecordService';
import { Device } from '../types';

// ─── AutoReg credentials persistence ─────────────────────────────────────────
const AUTOREG_CONFIG_FILE = path.join(__dirname, '../../data/autoreg-config.json');

function readAutoRegConfig(): { username: string; password: string } {
  try {
    if (fs.existsSync(AUTOREG_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(AUTOREG_CONFIG_FILE, 'utf-8'));
    }
  } catch {}
  return { username: 'admin', password: '' };
}

function writeAutoRegConfig(config: { username: string; password: string }) {
  const dir = path.dirname(AUTOREG_CONFIG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(AUTOREG_CONFIG_FILE, JSON.stringify(config, null, 2));
}

interface BridgeResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  result?: any;
  count?: number;
  records?: any[];
  device?: Device;
}

interface DeviceLoginParams {
  ip: string;
  port: number;
  username: string;
  password: string;
}

interface EventSimulationParams {
  eventType: string;
  eventData: Record<string, any>;
}

class NetSdkService {
  private bridgeUrl: string;
  private isInitialized: boolean;
  private devices: Device[];
  private credentialsPushed: boolean = false;

  constructor() {
    this.bridgeUrl = process.env.NETSDK_BRIDGE_URL || 'http://localhost:5000';
    this.isInitialized = false;
    this.devices = [];
  }

  async initialize(): Promise<boolean> {
    try {
      logger.info('Initializing NetSDK Service...');

      // Initialize SDK via bridge
      const response = await axios.post<BridgeResponse>(`${this.bridgeUrl}/api/sdk/init`);

      if (response.data.success) {
        this.isInitialized = true;
        logger.info('NetSDK initialized successfully');

        // Sync initial state from Bridge immediately
        await this.syncDevices();

        return true;
      } else {
        throw new Error(response.data.message || 'SDK initialization failed');
      }
    } catch (error: any) {
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
  async syncDevices(): Promise<void> {
    try {
      const response = await axios.get<Device[]>(`${this.bridgeUrl}/api/devices`);
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
      AccessRecordService.getInstance().emit('devices:update', this.devices);

      logger.info(`Device state synced from Bridge: ${this.devices.length} devices found.`);
    } catch (error: any) {
      logger.error('Failed to sync devices from Bridge:', error.message);
    }
  }

  async startAutoReg(port: number = 9500): Promise<BridgeResponse> {
    try {
      const response = await axios.post<BridgeResponse>(`${this.bridgeUrl}/api/autoreg/start`, { port });

      if (response.data.success) {
        logger.info(`Auto Registration Server started on port ${port}`);
        return response.data;
      } else {
        throw new Error(response.data.message || 'Failed to start auto-registration');
      }
    } catch (error: any) {
      logger.error('Failed to start Auto Registration:', error.message);
      throw error;
    }
  }

  async stopAutoReg(): Promise<BridgeResponse> {
    try {
      const response = await axios.post<BridgeResponse>(`${this.bridgeUrl}/api/autoreg/stop`);

      if (response.data.success) {
        logger.info('Auto Registration Server stopped');
        return response.data;
      } else {
        throw new Error(response.data.message || 'Failed to stop auto-registration');
      }
    } catch (error: any) {
      logger.error('Failed to stop Auto Registration:', error.message);
      throw error;
    }
  }

  // Save credentials to JSON and push to bridge
  async setPlatformCredentials(username: string, password: string): Promise<BridgeResponse> {
    try {
      writeAutoRegConfig({ username, password });
      const response = await axios.post<BridgeResponse>(`${this.bridgeUrl}/api/autoreg/credentials`, { username, password });
      logger.info(`[AutoReg] Platform credentials updated — Username: ${username}`);
      return response.data;
    } catch (error: any) {
      logger.error('Failed to set platform credentials:', error.message);
      throw error;
    }
  }

  // Push per-device credentials to bridge (call after create/update device)
  async pushDeviceCredentials(registrationId: string, username: string, password: string): Promise<void> {
    try {
      await axios.post(`${this.bridgeUrl}/api/devices/credentials`, { registrationId, username, password });
      logger.info(`[Bridge] Device credentials pushed for: ${registrationId}`);
    } catch (error: any) {
      logger.warn(`[Bridge] Could not push device credentials for ${registrationId}: ${error.message}`);
    }
  }

  // Push all stored device credentials to bridge (call on startup)
  async pushAllDeviceCredentials(devices: Array<{ registrationId: string; username: string; password: string }>): Promise<void> {
    for (const d of devices) {
      if (d.registrationId) {
        await this.pushDeviceCredentials(d.registrationId, d.username || 'admin', d.password || '');
      }
    }
    logger.info(`[Bridge] Pushed credentials for ${devices.length} devices`);
  }

  // Push all device credentials with retry until bridge is ready (background task)
  async pushAllDeviceCredentialsWithRetry(devices: Array<{ registrationId: string; username: string; password: string }>): Promise<void> {
    const maxAttempts = 10;
    const delayMs = 3000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Test bridge is alive first
        await axios.get(`${this.bridgeUrl}/api/health`, { timeout: 2000 });

        // Bridge is ready — push all credentials
        for (const d of devices) {
          if (d.registrationId) {
            await this.pushDeviceCredentials(d.registrationId, d.username || 'admin', d.password || '');
          }
        }
        this.credentialsPushed = true;
        logger.info(`[Bridge] ✅ All device credentials pushed successfully (attempt ${attempt})`);
        return;
      } catch (err: any) {
        logger.warn(`[Bridge] Attempt ${attempt}/${maxAttempts} — bridge not ready yet, retrying in ${delayMs/1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    logger.error(`[Bridge] ❌ Could not push device credentials after ${maxAttempts} attempts — bridge may be down`);
  }

  // Load persisted credentials from JSON and push to bridge (call on startup)
  async loadAndApplyCredentials(): Promise<void> {
    try {
      const config = readAutoRegConfig();
      if (config.username || config.password) {
        await axios.post<BridgeResponse>(`${this.bridgeUrl}/api/autoreg/credentials`, config);
        logger.info(`[AutoReg] Restored platform credentials for username: ${config.username}`);
      }
    } catch (error: any) {
      logger.warn(`[AutoReg] Could not restore credentials to bridge (bridge may not be ready): ${error.message}`);
    }
  }

  // Get saved credentials (password masked)
  getSavedCredentials(): { username: string; passwordSet: boolean } {
    const config = readAutoRegConfig();
    return { username: config.username, passwordSet: !!config.password };
  }

  async getAllDevices(): Promise<Device[]> {
    // Always sync from Bridge to ensure we have latest status
    // This is important for the Person Management sync feature
    try {
      await this.syncDevices();
    } catch (error: any) {
      logger.warn('Failed to sync devices, returning cached list:', error.message);
    }
    return this.devices;
  }

  async getDevice(deviceId: string): Promise<Device> {
    try {
      const response = await axios.get<Device>(`${this.bridgeUrl}/api/devices/${deviceId}`);
      return response.data;
    } catch (error: any) {
      logger.error(`Failed to get device ${deviceId}:`, error.message);
      throw error;
    }
  }

  async loginToDevice(ip: string, port: number, username: string, password: string): Promise<Device> {
    try {
      const response = await axios.post<BridgeResponse>(`${this.bridgeUrl}/api/devices/login`, {
        ip,
        port: port || 37777,
        username,
        password,
      });

      if (response.data.success) {
        logger.info(`Successfully logged in to device: ${ip}`);
        // Refresh cache after login
        await this.syncDevices();
        return response.data.device as Device;
      } else {
        throw new Error(response.data.error || 'Login failed');
      }
    } catch (error: any) {
      logger.error(`Failed to login to device ${ip}:`, error.message);
      throw error;
    }
  }

  async logoutFromDevice(deviceId: string): Promise<boolean> {
    try {
      const response = await axios.post<BridgeResponse>(`${this.bridgeUrl}/api/devices/${deviceId}/logout`);

      if (response.data.success) {
        logger.info(`Successfully logged out from device: ${deviceId}`);
        await this.syncDevices();
        return true;
      } else {
        throw new Error(response.data.error || 'Logout failed');
      }
    } catch (error: any) {
      logger.error(`Failed to logout from device ${deviceId}:`, error.message);
      throw error;
    }
  }

  async simulateEvent(deviceId: string, eventType: string, eventData: Record<string, any>): Promise<boolean> {
    try {
      const response = await axios.post<BridgeResponse>(`${this.bridgeUrl}/api/devices/${deviceId}/simulate-event`, {
        eventType,
        eventData,
      });

      if (response.data.success) {
        logger.info(`Event simulated for device: ${deviceId}`);
        return true;
      } else {
        throw new Error(response.data.error || 'Event simulation failed');
      }
    } catch (error: any) {
      logger.error(`Failed to simulate event for device ${deviceId}:`, error.message);
      throw error;
    }
  }

  /**
   * Query access control records via NetSDK (Works over Internet/NAT)
   * Uses the existing TCP connection, so it works even when device is behind NAT/firewall.
   */
  async queryAccessRecordsBySDK(
    deviceId: string,
    startTime?: string,
    endTime?: string,
    cardNumber?: string,
    maxRecords: number = 100
  ): Promise<any[]> {
    try {
      const params = new URLSearchParams();
      if (startTime) params.append('startTime', startTime);
      if (endTime) params.append('endTime', endTime);
      if (cardNumber) params.append('cardNumber', cardNumber);
      if (maxRecords) params.append('maxRecords', maxRecords.toString());

      const response = await axios.get<BridgeResponse>(
        `${this.bridgeUrl}/api/devices/${deviceId}/access-records-sdk?${params.toString()}`
      );

      if (response.data.success) {
        logger.info(`Retrieved ${response.data.count} access records via NetSDK for device: ${deviceId}`);
        return response.data.records || [];
      } else {
        throw new Error(response.data.error || 'Failed to query access records via SDK');
      }
    } catch (error: any) {
      logger.error(`Failed to query access records via SDK for device ${deviceId}:`, error.message);
      throw error;
    }
  }

  /**
   * Called by the C# Bridge via Webhook when device status changes.
   * Replaces the polling mechanism.
   */
  async updateDeviceStatus(deviceId: string, status: string, timestamp?: string): Promise<boolean> {
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
        this.devices[deviceIndex].status = status as any;
        this.devices[deviceIndex].Status = status as any;
        logger.debug(`Updated device in cache: ${deviceId} -> ${status}`);
      } else {
        // Device not in cache yet - fetch it from Bridge or create a placeholder
        logger.warn(`Device ${deviceId} not found in cache, will be included in next sync`);
      }

      // Emit socket event to frontend immediately
      AccessRecordService.getInstance().emit('device:status:changed', {
        deviceID: deviceId,
        deviceId: deviceId,
        status: status,
        timestamp: timestamp || new Date().toISOString()
      });

      // Async refresh full list from Bridge to ensure all data is up to date
      // This will repopulate the cache with fresh data including status
      this.syncDevices().catch(err => logger.error('Sync after status update failed:', err.message));

      return true;
    } catch (error: any) {
      logger.error(`Error updating device status for ${deviceId}:`, error.message);
      throw error;
    }
  }

  /**
   * Add person to access control device via NET SDK
   */
  async addPersonToDevice(
    deviceId: string,
    personId: string,
    personName: string,
    faceImageBuffer: Buffer | null,
    faceImageFilename: string | null,
    cardNumber?: string | null,
    isUpdate: boolean = false,
    oldCardNumber?: string | null,
    allCardNumbers?: string[],
    password?: string,
    fingerprintTemplates?: Array<{ index: number; dataBase64: string; packetLen: number; packetCount: number }>
  ): Promise<any> {
    try {
      const operation = isUpdate ? 'Updating' : 'Adding';
      logger.info(`${operation} person ${personId} (${personName}) on device ${deviceId}`);
      logger.info(`📊 Face image size: ${faceImageBuffer ? `${(faceImageBuffer.length / 1024).toFixed(2)} KB` : 'none'}, Cards: ${allCardNumbers?.length ?? (cardNumber ? 1 : 0)}, Password: ${password ? '[set]' : 'none'}, Fingerprints: ${fingerprintTemplates?.length ?? 0}`);

      // Create FormData for multipart request
      const FormData = require('form-data');
      const formData = new FormData();

      formData.append('deviceId', deviceId);
      formData.append('personId', personId);
      formData.append('personName', personName);
      formData.append('isUpdate', isUpdate ? 'true' : 'false');

      // Primary card (first card or single card for backward compat)
      const primaryCard = (allCardNumbers && allCardNumbers.length > 0) ? allCardNumbers[0] : (cardNumber || null);
      if (primaryCard) {
        formData.append('cardNumber', primaryCard);
      }

      if (oldCardNumber) {
        formData.append('oldCardNumber', oldCardNumber);
      }

      // All card numbers as JSON array
      if (allCardNumbers && allCardNumbers.length > 0) {
        formData.append('allCardNumbers', JSON.stringify(allCardNumbers));
      }

      // Door password
      if (password) {
        formData.append('password', password);
      }

      // Fingerprint templates as JSON
      if (fingerprintTemplates && fingerprintTemplates.length > 0) {
        formData.append('fingerprints', JSON.stringify(fingerprintTemplates));
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

      const response = await axios.post<BridgeResponse>(
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
    } catch (error: any) {
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

  /**
   * Fetch all users stored on a device (for "Import from Device" feature)
   */
  async getDeviceUsers(deviceId: string): Promise<{ userId: string; name: string; userType: string; userStatus: number; validBegin: string; validEnd: string; firstEnter: boolean }[]> {
    try {
      logger.info(`Fetching all users from device ${deviceId}`);
      const response = await axios.get(
        `${this.bridgeUrl}/api/devices/${encodeURIComponent(deviceId)}/users`,
        { timeout: 60000 }
      );
      if (response.data.success) {
        logger.info(`Retrieved ${response.data.count} users from device ${deviceId}`);
        return (response.data.users as any[]).map(u => ({
          userId: u.userID,
          name: u.name,
          userType: u.userType,
          userStatus: u.userStatus,
          validBegin: u.validBegin,
          validEnd: u.validEnd,
          firstEnter: u.firstEnter
        }));
      } else {
        throw new Error(response.data.error || 'Failed to get device users');
      }
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('C# Bridge is not running. Please start it first.');
      }
      logger.error(`Error fetching users from device ${deviceId}:`, error.message);
      throw error;
    }
  }

  async getDeviceUserDetails(deviceId: string, userId: string): Promise<{
    password: string;
    cardNumber: string;       // first card (backward compat)
    cardNumbers: string[];    // all cards (up to 5)
    fingerprints: Array<{ index: number; dataBase64: string; packetLen: number; packetCount: number }>;
    faceImageBase64: string;
    faceImageMimeType: string;
  }> {
    try {
      const response = await axios.get(
        `${this.bridgeUrl}/api/devices/${encodeURIComponent(deviceId)}/users/${encodeURIComponent(userId)}/details`,
        { timeout: 30000 }
      );
      if (response.data.success) {
        const d = response.data.details;
        return {
          password: d.password || '',
          cardNumbers: Array.isArray(d.cardNumbers) ? d.cardNumbers : (d.cardNumber ? [d.cardNumber] : []),
          cardNumber: d.cardNumber || (Array.isArray(d.cardNumbers) && d.cardNumbers[0]) || '',
          fingerprints: Array.isArray(d.fingerprints) ? d.fingerprints.map((f: any) => ({
            index: f.index ?? 0,
            dataBase64: f.dataBase64 || '',
            packetLen: f.packetLen ?? 0,
            packetCount: f.packetCount ?? 0,
          })) : [],
          faceImageBase64: d.faceImageBase64 || '',
          faceImageMimeType: d.faceImageMimeType || 'image/jpeg',
        };
      } else {
        throw new Error(response.data.error || 'Failed to get user details');
      }
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('C# Bridge is not running. Please start it first.');
      }
      logger.error(`Error fetching user details from device ${deviceId} user ${userId}:`, error.message);
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    try {
      if (this.isInitialized) {
        logger.info('Cleaning up NetSDK Service...');
        // Optionally call cleanup endpoint on bridge
        this.isInitialized = false;
      }
    } catch (error: any) {
      logger.error('Error during cleanup:', error.message);
    }
  }
}

export default new NetSdkService();
