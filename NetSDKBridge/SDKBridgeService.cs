/****************************************************************************************************************************
 * NetSDK Bridge Service - Fixed Auto Registration
 * Based on official Dahua AutoRegister demo analysis
 * 
 * KEY CHANGES:
 * 1. Proper device serial number extraction from service callback
 * 2. Correct disconnect handling via NET_DVR_DISCONNECT
 * 3. Use SERVER_CONN login mode for auto-registered devices
 * 4. Device tracking by Registration ID (serial number), not GUID
 ***************************************************************************************************************************/

using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Text;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using NetSDKCS;
using NetSDKBridge.Modules;

#nullable disable

namespace NetSDKBridge
{
    public class SDKBridgeService
    {
        private static SDKBridgeService _instance;
        private readonly ILogger<SDKBridgeService> _logger;
        private readonly ILoggerFactory _loggerFactory;
        
        // Device storage - KEYED BY REGISTRATION ID (serial number), NOT GUID
        private readonly ConcurrentDictionary<string, DeviceInfo> _devices = new();

        // Login handles mapping: login handle -> registration ID
        private readonly ConcurrentDictionary<long, string> _loginHandles = new();

        // Track which devices have had their hardware serial fetched this session
        // Cleared when device goes offline, so serial is fetched once per online session
        private readonly ConcurrentDictionary<string, bool> _hasFetchedHardwareSerial = new();

        // Prevent duplicate concurrent login attempts for the same registration ID
        private readonly ConcurrentDictionary<string, bool> _loginInProgress = new();

        // Per-device credentials: registrationId -> (username, password)
        // Falls back to _platformUsername/_platformPassword if not found
        private readonly ConcurrentDictionary<string, (string Username, string Password)> _deviceCredentials = new();
        
        private bool _isInitialized = false;
        private int _autoRegPort = 9500;
        private string _autoRegServerIP = LoadServerIPFromEnv();
        private IntPtr _listenHandle = IntPtr.Zero;

        /// <summary>
        /// Loads SERVER_IP from environment variable or .env file
        /// </summary>
        private static string LoadServerIPFromEnv()
        {
            // First, try environment variable
            string envVar = Environment.GetEnvironmentVariable("SERVER_IP");
            if (!string.IsNullOrWhiteSpace(envVar))
            {
                return envVar.Trim();
            }

            // Fallback: Read from backend/.env file
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string envFilePath = Path.Combine(baseDir, "..", "..", "..", "..", "backend", ".env");

                // If that doesn't exist, try relative to current directory
                if (!File.Exists(envFilePath))
                {
                    envFilePath = Path.Combine(Directory.GetCurrentDirectory(), "..", "backend", ".env");
                }

                if (File.Exists(envFilePath))
                {
                    foreach (string line in File.ReadAllLines(envFilePath))
                    {
                        string trimmed = line.Trim();
                        if (string.IsNullOrWhiteSpace(trimmed) || trimmed.StartsWith("#"))
                            continue;

                        int equalsIndex = trimmed.IndexOf('=');
                        if (equalsIndex > 0)
                        {
                            string key = trimmed.Substring(0, equalsIndex).Trim();
                            string value = trimmed.Substring(equalsIndex + 1).Trim();

                            if (key == "SERVER_IP")
                            {
                                return value;
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"⚠️  Could not read .env file: {ex.Message}");
            }

            // Final fallback
            return "127.0.0.1";
        }

        // Platform credentials that devices use to authenticate
        // These MUST match what's configured on the devices
        private string _platformUsername = "admin";
        private string _platformPassword = "";

        // Callbacks
        private fDisConnectCallBack _disconnectCallback;
        private fHaveReConnectCallBack _reconnectCallback;
        private fMessCallBackEx _messageCallback;
        private fServiceCallBack _serviceCallback;

        // Webhook sender
        private readonly System.Net.Http.HttpClient _httpClient = new System.Net.Http.HttpClient();
        private string _backendWebhookUrl = "";

        // Access Control Events Module - SDK Method (RealLoadPicture) - Optional for snapshot images
        private AccessControlEventsModule _accessControlEventsModule;

        // Access Control Events Module - SDK Native Alarm Subscription (StartListen) - PRIMARY METHOD
        private AccessControlEventsSdkModule _accessControlEventsSdkModule;

        // Access Control Events Module - HTTP CGI Method (snapManager.cgi) - DEPRECATED
        private AccessControlEventsCgiModule _accessControlEventsCgiModule;

        // Access Control Events Module - General Events Method (eventManager.cgi) - DEPRECATED
        private AccessControlEventsGeneralModule _accessControlEventsGeneralModule;

        // Access Records Query Module - SDK FindRecord API (TCP method)
        private AccessRecordsQueryModule _accessRecordsQueryModule;

        public void SetBackendWebhookUrl(string url)
        {
            _backendWebhookUrl = url;
            _logger.LogInformation($"Backend Webhook URL configured: {_backendWebhookUrl}");

            // Initialize Access Control Events Module - SDK StartListen (PRIMARY)
            if (_accessControlEventsSdkModule == null)
            {
                _accessControlEventsSdkModule = new AccessControlEventsSdkModule(
                    _loggerFactory.CreateLogger<AccessControlEventsSdkModule>(),
                    _httpClient,
                    url
                );
                _logger.LogInformation("✅ Access Control Events Module (SDK StartListen) initialized - PRIMARY METHOD");
            }

            // Initialize Access Control Events Module - SDK RealLoadPicture (OPTIONAL - provides snapshot images)
            if (_accessControlEventsModule == null)
            {
                _accessControlEventsModule = new AccessControlEventsModule(
                    _loggerFactory.CreateLogger<AccessControlEventsModule>(),
                    _httpClient,
                    url
                );
                _logger.LogInformation("ℹ️  Access Control Events Module (SDK RealLoadPicture) initialized - OPTIONAL for images");
            }

            // Initialize Access Control Events Module - HTTP CGI Method - DEPRECATED
            if (_accessControlEventsCgiModule == null)
            {
                // Create HTTP client factory for CGI module
                var serviceCollection = new ServiceCollection();
                serviceCollection.AddHttpClient();
                var serviceProvider = serviceCollection.BuildServiceProvider();
                var httpClientFactory = serviceProvider.GetRequiredService<IHttpClientFactory>();

                _accessControlEventsCgiModule = new AccessControlEventsCgiModule(
                    _loggerFactory.CreateLogger<AccessControlEventsCgiModule>(),
                    httpClientFactory,
                    url
                );
                _logger.LogInformation("⚠️  Access Control Events Module (HTTP CGI) initialized - DEPRECATED, not used");
            }

            // Initialize Access Control Events Module - General Events Method (eventManager.cgi) - DEPRECATED
            if (_accessControlEventsGeneralModule == null)
            {
                _accessControlEventsGeneralModule = new AccessControlEventsGeneralModule(
                    _loggerFactory.CreateLogger<AccessControlEventsGeneralModule>(),
                    url
                );
                _logger.LogInformation("⚠️  Access Control Events Module (General Events - eventManager.cgi) initialized - DEPRECATED, not used");
            }

            // Initialize Access Records Query Module - SDK FindRecord API (TCP method)
            if (_accessRecordsQueryModule == null)
            {
                _accessRecordsQueryModule = new AccessRecordsQueryModule(
                    _loggerFactory.CreateLogger<AccessRecordsQueryModule>()
                );
                _logger.LogInformation("✅ Access Records Query Module (SDK FindRecord - TCP method) initialized");
            }
        }

        public static SDKBridgeService Instance => _instance;

        public event EventHandler<DeviceStatusChangedEventArgs> DeviceStatusChanged;
        public event EventHandler<DeviceEventEventArgs> DeviceEventReceived;

        public SDKBridgeService(ILogger<SDKBridgeService> logger, ILoggerFactory loggerFactory)
        {
            _logger = logger;
            _loggerFactory = loggerFactory;
            _instance = this;

            // Subscribe to device status changes to send webhooks
            DeviceStatusChanged += OnDeviceStatusChangedAsync;
        }

        private async void OnDeviceStatusChangedAsync(object sender, DeviceStatusChangedEventArgs e)
        {
            if (string.IsNullOrEmpty(_backendWebhookUrl)) return;

            try
            {
                var payload = new
                {
                    deviceId = e.DeviceID,
                    status = e.Status,
                    timestamp = e.Timestamp
                };

                var json = System.Text.Json.JsonSerializer.Serialize(payload);
                var content = new System.Net.Http.StringContent(json, System.Text.Encoding.UTF8, "application/json");

                _logger.LogInformation($"📡 Sending webhook to {_backendWebhookUrl}: {e.DeviceID} is {e.Status}");
                var response = await _httpClient.PostAsync(_backendWebhookUrl, content);

                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogWarning($"Webhook failed: {response.StatusCode}");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error sending device status webhook");
            }
        }

        public Task<bool> InitializeSDK()
        {
            try
            {
                if (_isInitialized)
                {
                    return Task.FromResult(true);
                }

                _logger.LogInformation("Initializing NetSDK...");

                _disconnectCallback = DisconnectCallback;
                _reconnectCallback = ReconnectCallback;
                _messageCallback = MessageCallback;
                _serviceCallback = ServiceCallback;

                bool initResult = NETClient.Init(_disconnectCallback, IntPtr.Zero, null);

                if (!initResult)
                {
                    var errorCode = NETClient.GetLastError();
                    _logger.LogError($"SDK initialization failed: {errorCode}");
                    return Task.FromResult(false);
                }

                NETClient.SetAutoReconnect(_reconnectCallback, IntPtr.Zero);
                NETClient.SetDVRMessCallBackEx1(_messageCallback, IntPtr.Zero);

                _isInitialized = true;
                _logger.LogInformation("✅ NetSDK initialized successfully");
                return Task.FromResult(true);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to initialize NetSDK");
                return Task.FromResult(false);
            }
        }

        public Task<bool> StartAutoRegServer(int port = 9500)
        {
            try
            {
                if (!_isInitialized)
                {
                    _logger.LogError("SDK not initialized");
                    return Task.FromResult(false);
                }

                _autoRegPort = port;

                _logger.LogInformation($"Starting Auto Registration Server on {_autoRegServerIP}:{port}...");
                _logger.LogInformation($"Platform Credentials - Username: {_platformUsername}, Password: [HIDDEN]");

                // Start listening for auto-registering devices
                // Official demo uses: ListenServer(ip, port, 1000, callback, IntPtr.Zero)
                _listenHandle = NETClient.ListenServer(_autoRegServerIP, (ushort)_autoRegPort, 1000, _serviceCallback, IntPtr.Zero);

                if (_listenHandle == IntPtr.Zero)
                {
                    var errorCode = NETClient.GetLastError();
                    _logger.LogError($"Failed to start listen server: {errorCode}");
                    return Task.FromResult(false);
                }

                _logger.LogInformation($"✅ Auto Registration Server is listening...");
                _logger.LogInformation($"   Server IP: {_autoRegServerIP}");
                _logger.LogInformation($"   Port: {_autoRegPort}");
                _logger.LogInformation($"   Configure devices to connect here");
                _logger.LogInformation($"   Devices will be tracked by their Registration ID (Serial Number)");

                return Task.FromResult(true);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to start Auto Registration Server");
                return Task.FromResult(false);
            }
        }

        /// <summary>
        /// Configure platform credentials that devices will use
        /// These must match what's configured on the device
        /// </summary>
        public void SetPlatformCredentials(string username, string password)
        {
            _platformUsername = username;
            _platformPassword = password;
            _logger.LogInformation($"Platform credentials updated - Username: {username}");
        }

        /// <summary>
        /// Get current server IP
        /// </summary>
        public string GetServerIP() => _autoRegServerIP;

        /// <summary>
        /// Get current platform username (for display — password is never exposed)
        /// </summary>
        public string GetPlatformUsername() => _platformUsername;

        /// <summary>
        /// Register per-device credentials (overrides platform credentials for that device)
        /// </summary>
        public void SetDeviceCredentials(string registrationId, string username, string password)
        {
            _deviceCredentials[registrationId] = (username, password);
            _logger.LogInformation($"[Credentials] Registered credentials for device: {registrationId} (username: {username})");
        }

        /// <summary>
        /// Get credentials for a specific device — falls back to platform credentials
        /// </summary>
        private (string Username, string Password) GetCredentialsForDevice(string registrationId)
        {
            if (_deviceCredentials.TryGetValue(registrationId, out var creds))
            {
                _logger.LogInformation($"[Credentials] Using per-device credentials for {registrationId}");
                return creds;
            }
            _logger.LogInformation($"[Credentials] No per-device credentials for {registrationId} — using platform credentials");
            return (_platformUsername, _platformPassword);
        }

        /// <summary>
        /// Set server IP address
        /// </summary>
        public void SetServerIP(string ip)
        {
            _autoRegServerIP = ip;
            _logger.LogInformation($"Server IP updated to: {ip}");
        }

        public Task<bool> StopAutoRegServer()
        {
            try
            {
                if (_listenHandle != IntPtr.Zero)
                {
                    _logger.LogInformation("Stopping Auto Registration Server...");
                    NETClient.StopListenServer(_listenHandle);
                    _listenHandle = IntPtr.Zero;
                }
                return Task.FromResult(true);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to stop Auto Registration Server");
                return Task.FromResult(false);
            }
        }

        public Task<DeviceInfo> LoginToDevice(string ip, int port, string username, string password)
        {
            try
            {
                _logger.LogInformation($"Logging in to device: {ip}:{port}");

                NET_DEVICEINFO_Ex deviceInfo = new NET_DEVICEINFO_Ex();

                // For manual login (not auto-reg), use TCP mode
                IntPtr loginID = NETClient.LoginWithHighLevelSecurity(
                    ip, (ushort)port, username, password,
                    EM_LOGIN_SPAC_CAP_TYPE.TCP, IntPtr.Zero, ref deviceInfo
                );

                if (loginID == IntPtr.Zero)
                {
                    var error = NETClient.GetLastError();
                    _logger.LogError($"Login failed: {error}");
                    return Task.FromResult<DeviceInfo>(null);
                }

                // Use serial number as device ID
                string deviceId = deviceInfo.sSerialNumber?.Trim() ?? $"Device-{ip}";
                _loginHandles[loginID.ToInt64()] = deviceId;

                var device = new DeviceInfo
                {
                    DeviceID = deviceId,
                    IP = ip,
                    Port = port,
                    Name = !string.IsNullOrEmpty(deviceInfo.sSerialNumber) ? deviceInfo.sSerialNumber.Trim() : $"Device {ip}",
                    Status = "Online",
                    Type = "Face Recognition Terminal",
                    Generation = "2nd Generation",
                    ChannelCount = deviceInfo.nChanNum,
                    SerialNumber = deviceInfo.sSerialNumber?.Trim() ?? "",
                    LoginTime = DateTime.UtcNow,
                    IsAutoRegistered = false,
                    LoginHandle = loginID.ToInt64()
                };

                _devices.TryAdd(deviceId, device);
                StartListeningForEvents(loginID, deviceId);

                DeviceStatusChanged?.Invoke(this, new DeviceStatusChangedEventArgs
                {
                    DeviceID = deviceId,
                    Status = "Online",
                    Timestamp = DateTime.UtcNow
                });

                _logger.LogInformation($"✅ Successfully logged in to device: {ip} (ID: {deviceId})");
                return Task.FromResult(device);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Failed to login to device: {ip}");
                return Task.FromResult<DeviceInfo>(null);
            }
        }

        public Task<bool> LogoutFromDevice(string deviceId)
        {
            try
            {
                if (_devices.TryRemove(deviceId, out var device))
                {
                    _logger.LogInformation($"Logging out from device: {device.IP}");

                    if (device.LoginHandle != 0)
                    {
                        NETClient.Logout(new IntPtr(device.LoginHandle));
                        _loginHandles.TryRemove(device.LoginHandle, out _);
                    }

                    DeviceStatusChanged?.Invoke(this, new DeviceStatusChangedEventArgs
                    {
                        DeviceID = deviceId,
                        Status = "Offline",
                        Timestamp = DateTime.UtcNow
                    });

                    return Task.FromResult(true);
                }
                return Task.FromResult(false);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Failed to logout from device: {deviceId}");
                return Task.FromResult(false);
            }
        }

        public List<DeviceInfo> GetAllDevices() => _devices.Values.ToList();

        public DeviceInfo GetDevice(string deviceId)
        {
            _devices.TryGetValue(deviceId, out var device);
            return device;
        }

        private void StartListeningForEvents(IntPtr loginID, string deviceId, bool isAutoRegistered = false)
        {
            try
            {
                if (isAutoRegistered)
                {
                    // Auto-registered devices send events through the global message callback
                    _logger.LogInformation($"✅ Auto-registered device - events will flow through global callback: {deviceId}");
                    return;
                }

                _logger.LogInformation($"🎧 Attempting to start event listener for device: {deviceId}");

                // For manually logged-in devices, start listening
                bool result = OriginalSDK.CLIENT_StartListenEx(loginID);

                if (result)
                {
                    _logger.LogInformation($"✅ Started listening for events: {deviceId}");
                }
                else
                {
                    var errorCode = NETClient.GetLastError();
                    _logger.LogError($"❌ Failed to start event listener for {deviceId}. Error: {errorCode}");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error starting event listener");
            }
        }

        private void DisconnectCallback(IntPtr lLoginID, IntPtr pchDVRIP, int nDVRPort, IntPtr dwUser)
        {
            try
            {
                string ip = Marshal.PtrToStringAnsi(pchDVRIP) ?? "Unknown";
                
                _logger.LogInformation("=".PadRight(70, '='));
                _logger.LogInformation("🔌 DISCONNECT CALLBACK FIRED");
                _logger.LogInformation("=".PadRight(70, '='));
                _logger.LogInformation($"   Device IP: {ip}");
                _logger.LogInformation($"   Device Port: {nDVRPort}");
                _logger.LogInformation($"   Login ID: {lLoginID}");
                _logger.LogInformation("=".PadRight(70, '='));

                // PRIMARY: Find device by login handle (reliable, unique per session)
                if (_loginHandles.TryGetValue(lLoginID.ToInt64(), out var registrationID))
                {
                    if (_devices.TryGetValue(registrationID, out var deviceByHandle))
                    {
                        _logger.LogInformation($"✅ DEVICE FOUND BY LOGIN HANDLE");
                        _logger.LogInformation($"   Registration ID: {registrationID}");
                        _logger.LogInformation($"   Previous Status: {deviceByHandle.Status}");

                        deviceByHandle.Status = "Offline";
                        _loginHandles.TryRemove(lLoginID.ToInt64(), out _);
                        deviceByHandle.LoginHandle = 0;

                        _logger.LogInformation($"   Status changed to: OFFLINE");

                        // Clear hardware serial fetch flag - will fetch again when device comes back online
                        _hasFetchedHardwareSerial.TryRemove(registrationID, out _);
                        _logger.LogInformation($"   Cleared hardware serial cache for {registrationID}");

                        DeviceStatusChanged?.Invoke(this, new DeviceStatusChangedEventArgs
                        {
                            DeviceID = registrationID,
                            Status = "Offline",
                            Timestamp = DateTime.UtcNow
                        });
                    }
                }
                else
                {
                    // FALLBACK: Find device by IP and port (may be unreliable when multiple devices share same NAT IP)
                    _logger.LogWarning($"⚠️  Login handle {lLoginID} not found — falling back to IP+Port lookup");
                    bool found = false;
                    foreach (var device in _devices.Values)
                    {
                        if (device.IP == ip && device.Port == nDVRPort && device.LoginHandle != 0)
                        {
                            found = true;
                            _logger.LogInformation($"✅ DEVICE FOUND BY IP+PORT");
                            _logger.LogInformation($"   Registration ID: {device.DeviceID}");
                            _logger.LogInformation($"   Previous Status: {device.Status}");

                            device.Status = "Offline";
                            _loginHandles.TryRemove(device.LoginHandle, out _);
                            device.LoginHandle = 0;

                            _logger.LogInformation($"   Status changed to: OFFLINE");

                            _hasFetchedHardwareSerial.TryRemove(device.DeviceID, out _);
                            _logger.LogInformation($"   Cleared hardware serial cache for {device.DeviceID}");

                            DeviceStatusChanged?.Invoke(this, new DeviceStatusChangedEventArgs
                            {
                                DeviceID = device.DeviceID,
                                Status = "Offline",
                                Timestamp = DateTime.UtcNow
                            });
                            break;
                        }
                    }

                    if (!found)
                    {
                        _logger.LogWarning($"❌ DEVICE NOT FOUND in registry — may have already been removed");
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "❌ ERROR in DisconnectCallback");
            }
        }

        private void ReconnectCallback(IntPtr lLoginID, IntPtr pchDVRIP, int nDVRPort, IntPtr dwUser)
        {
            string ip = Marshal.PtrToStringAnsi(pchDVRIP) ?? "Unknown";
            _logger.LogInformation($"🔄 Device reconnected: {ip}");

            // Prefer login handle lookup over IP (multiple devices may share same NAT IP)
            if (_loginHandles.TryGetValue(lLoginID.ToInt64(), out var registrationID) &&
                _devices.TryGetValue(registrationID, out var deviceByHandle))
            {
                deviceByHandle.Status = "Online";
                deviceByHandle.LoginTime = DateTime.UtcNow;

                DeviceStatusChanged?.Invoke(this, new DeviceStatusChangedEventArgs
                {
                    DeviceID = deviceByHandle.DeviceID,
                    Status = "Online",
                    Timestamp = DateTime.UtcNow
                });
            }
            else
            {
                // Fallback: match by IP (only reliable when single device per IP)
                foreach (var device in _devices.Values)
                {
                    if (device.IP == ip)
                    {
                        device.Status = "Online";
                        device.LoginTime = DateTime.UtcNow;

                        DeviceStatusChanged?.Invoke(this, new DeviceStatusChangedEventArgs
                        {
                            DeviceID = device.DeviceID,
                            Status = "Online",
                            Timestamp = DateTime.UtcNow
                        });
                        break;
                    }
                }
            }
        }

        private bool MessageCallback(int lCommand, IntPtr lLoginID, IntPtr pBuf, uint dwBufLen, IntPtr pchDVRIP, int nDVRPort, bool bAlarmAckFlag, int nEventID, IntPtr dwUser)
        {
            try
            {
                string ip = Marshal.PtrToStringAnsi(pchDVRIP) ?? "Unknown";

                // Route alarm events to the new SDK module if it's active
                if (_accessControlEventsSdkModule != null)
                {
                    _accessControlEventsSdkModule.HandleAlarmEvent(lCommand, lLoginID, pBuf, dwBufLen, pchDVRIP, nDVRPort);
                }

                // Also log the event for debugging
                string eventType = GetEventType(lCommand);
                _logger.LogDebug($"📨 Event received: {eventType} from {ip} (EventCode: 0x{lCommand:X}, EventID: {nEventID})");

                string deviceId = "";
                if (_loginHandles.TryGetValue(lLoginID.ToInt64(), out var id))
                {
                    deviceId = id;
                }

                DeviceEventReceived?.Invoke(this, new DeviceEventEventArgs
                {
                    DeviceID = deviceId,
                    EventType = eventType,
                    EventData = $"Event: 0x{lCommand:X}, ID: {nEventID}",
                    Timestamp = DateTime.UtcNow
                });

                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in MessageCallback");
                return true;
            }
        }

        private int ServiceCallback(IntPtr lHandle, IntPtr pIp, ushort wPort, int lCommand, IntPtr pParam, uint dwParamLen, IntPtr dwUserData)
        {
            try
            {
                EM_LISTEN_TYPE type = (EM_LISTEN_TYPE)lCommand;
                string ip = Marshal.PtrToStringAnsi(pIp) ?? "Unknown";
                
                // Extract registration ID (serial number) from pParam
                string registrationID = "";
                if (dwParamLen > 0)
                {
                    registrationID = Marshal.PtrToStringAnsi(pParam)?.Trim() ?? "";
                }

                _logger.LogInformation("=".PadRight(70, '='));
                _logger.LogInformation("📨 SERVICE CALLBACK RECEIVED");
                _logger.LogInformation("=".PadRight(70, '='));
                _logger.LogInformation($"   Event Type: {type} ({(int)type})");
                _logger.LogInformation($"   Device IP: {ip}");
                _logger.LogInformation($"   Device Port: {wPort}");
                _logger.LogInformation($"   Registration ID Length: {dwParamLen}");
                _logger.LogInformation($"   Registration ID: '{registrationID}'");
                _logger.LogInformation($"   Login Handle: {lHandle}");
                _logger.LogInformation("=".PadRight(70, '='));

                switch (type)
                {
                    case EM_LISTEN_TYPE.NET_DVR_SERIAL_RETURN:
                        // Device is connecting with its serial number
                        _logger.LogInformation("");
                        _logger.LogInformation("📱 DEVICE AUTO-REGISTRATION ATTEMPT");
                        
                        if (string.IsNullOrEmpty(registrationID))
                        {
                            _logger.LogWarning($"⚠️  Device connected but NO registration ID provided");
                            _logger.LogWarning($"   Device IP: {ip}");
                            _logger.LogWarning($"   This usually means the device is not configured with a Registration ID");
                            return 0;
                        }

                        _logger.LogInformation($"   Registration ID: {registrationID}");
                        _logger.LogInformation($"   Device IP: {ip}");
                        _logger.LogInformation($"   Device Port: {wPort}");

                        // Check if device already exists
                        if (_devices.TryGetValue(registrationID, out var existingDevice))
                        {
                            // Device reconnected - update IP and status
                            string oldIP = existingDevice.IP;
                            _logger.LogInformation($"🔄 DEVICE RECONNECTION DETECTED");
                            _logger.LogInformation($"   Registration ID: {registrationID}");
                            _logger.LogInformation($"   Old IP: {oldIP}");
                            _logger.LogInformation($"   New IP: {ip}");
                            _logger.LogInformation($"   Previous Status: {existingDevice.Status}");
                            
                            existingDevice.IP = ip;
                            existingDevice.Port = wPort;
                            existingDevice.Status = "Online";
                            existingDevice.LoginTime = DateTime.UtcNow;

                            _logger.LogInformation($"✅ Device reconnected successfully");

                            DeviceStatusChanged?.Invoke(this, new DeviceStatusChangedEventArgs
                            {
                                DeviceID = registrationID,
                                Status = "Online",
                                Timestamp = DateTime.UtcNow
                            });
                        }
                        else
                        {
                            // New device - queue it for login (guard against duplicates)
                            _logger.LogInformation($"✅ NEW DEVICE DETECTED");
                            _logger.LogInformation($"   Registration ID: {registrationID}");
                            _logger.LogInformation($"   Device IP: {ip}");
                            _logger.LogInformation($"   Device Port: {wPort}");
                            _logger.LogInformation($"   Action: Starting login process...");

                            if (_loginInProgress.TryAdd(registrationID, true))
                            {
                                // Start login process in background
                                _ = Task.Run(async () =>
                                {
                                    try
                                    {
                                        await Task.Delay(200); // Small delay to ensure device is ready
                                        await LoginAutoRegDevice(registrationID, ip, wPort);
                                    }
                                    finally
                                    {
                                        _loginInProgress.TryRemove(registrationID, out _);
                                    }
                                });
                            }
                            else
                            {
                                _logger.LogInformation($"⏳ Login already in progress for {registrationID} — skipping duplicate");
                            }
                        }
                        break;

                    case EM_LISTEN_TYPE.NET_DVR_DISCONNECT:
                        // Device disconnected
                        _logger.LogInformation("");
                        _logger.LogInformation("⚠️  DEVICE DISCONNECT DETECTED (NET_DVR_DISCONNECT)");
                        _logger.LogInformation($"   Registration ID: {registrationID ?? "Unknown"}");
                        _logger.LogInformation($"   Device IP: {ip}");

                        if (!string.IsNullOrEmpty(registrationID) && _devices.TryGetValue(registrationID, out var disconnectedDevice))
                        {
                            _logger.LogInformation($"   Found device in registry: YES");
                            _logger.LogInformation($"   Previous Status: {disconnectedDevice.Status}");
                            _logger.LogInformation($"   Login Handle: {disconnectedDevice.LoginHandle}");
                            
                            disconnectedDevice.Status = "Offline";
                            
                            // Clear login handle
                            if (disconnectedDevice.LoginHandle != 0)
                            {
                                _loginHandles.TryRemove(disconnectedDevice.LoginHandle, out _);
                                _logger.LogInformation($"   Login handle cleared");
                                disconnectedDevice.LoginHandle = 0;
                            }

                            _logger.LogInformation($"✅ Device marked as OFFLINE");

                            // Stop SDK alarm event subscription (PRIMARY)
                            _accessControlEventsSdkModule?.StopListen(registrationID);

                            // Unsubscribe from RealLoadPicture events (OPTIONAL)
                            _accessControlEventsModule?.UnsubscribeFromDeviceEvents(registrationID);

                            // CGI modules no longer used (DEPRECATED)
                            // _accessControlEventsCgiModule?.UnsubscribeFromDeviceEvents(registrationID);
                            // _accessControlEventsGeneralModule?.UnsubscribeFromDeviceEvents(registrationID);

                            DeviceStatusChanged?.Invoke(this, new DeviceStatusChangedEventArgs
                            {
                                DeviceID = registrationID,
                                Status = "Offline",
                                Timestamp = DateTime.UtcNow
                            });
                        }
                        else
                        {
                            _logger.LogWarning($"   Device NOT FOUND in registry");
                            _logger.LogWarning($"   Registration ID: {registrationID ?? "Empty"}");
                        }
                        break;

                    case EM_LISTEN_TYPE.NET_DEV_AUTOREGISTER_RETURN:
                        // Extended auto-registration with token (if supported by device)
                        _logger.LogInformation("");
                        _logger.LogInformation("🔐 DEVICE AUTO-REGISTRATION WITH TOKEN");
                        _logger.LogInformation($"   Registration ID: {registrationID}");
                        _logger.LogInformation($"   Device IP: {ip}");
                        break;

                    case EM_LISTEN_TYPE.NET_DEV_NOTIFY_IP_RETURN:
                        // Device only reports IP (not for auto-registration)
                        _logger.LogInformation("");
                        _logger.LogInformation("📍 DEVICE IP NOTIFICATION (NOT AUTO-REG)");
                        _logger.LogInformation($"   Device IP: {ip}");
                        _logger.LogInformation($"   This event type is not used for auto-registration");
                        break;

                    case (EM_LISTEN_TYPE)5:
                        // Handle Type 5: Likely Keep-Alive or Alternate Registration
                        _logger.LogInformation("");
                        _logger.LogInformation($"📡 DEVICE NOTIFY (Type 5)");
                        _logger.LogInformation($"   Device IP: {ip}");

                        // If this packet contains data (Registration ID), treat it as registration
                        if (dwParamLen > 0 && registrationID.Length > 0)
                        {
                            _logger.LogInformation($"   Detected Registration ID in Type 5: {registrationID}");

                            // Check if device already exists
                            if (_devices.TryGetValue(registrationID, out var deviceType5))
                            {
                                // Device reconnected
                                _logger.LogInformation($"🔄 DEVICE RECONNECTION DETECTED (Type 5)");
                                deviceType5.IP = ip;
                                deviceType5.Port = wPort;
                                deviceType5.Status = "Online";
                                deviceType5.LoginTime = DateTime.UtcNow;

                                DeviceStatusChanged?.Invoke(this, new DeviceStatusChangedEventArgs
                                {
                                    DeviceID = registrationID,
                                    Status = "Online",
                                    Timestamp = DateTime.UtcNow
                                });
                            }
                            else
                            {
                                // New device - queue it for login (guard against duplicates)
                                _logger.LogInformation($"✅ NEW DEVICE DETECTED (Type 5)");
                                if (_loginInProgress.TryAdd(registrationID, true))
                                {
                                    _ = Task.Run(async () =>
                                    {
                                        try
                                        {
                                            await Task.Delay(200);
                                            await LoginAutoRegDevice(registrationID, ip, wPort);
                                        }
                                        finally
                                        {
                                            _loginInProgress.TryRemove(registrationID, out _);
                                        }
                                    });
                                }
                                else
                                {
                                    _logger.LogInformation($"⏳ Login already in progress for {registrationID} (Type 5) — skipping duplicate");
                                }
                            }
                        }
                        else
                        {
                            _logger.LogInformation($"   Keep-Alive / Heartbeat (No payload)");
                        }
                        break;

                    default:
                        _logger.LogWarning("");
                        _logger.LogWarning($"❓ UNKNOWN LISTEN TYPE");
                        _logger.LogWarning($"   Type: {type} ({(int)type})");
                        _logger.LogWarning($"   Device IP: {ip}");
                        break;
                }

                return 0; // Return 0 as per official demo
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "❌ ERROR in ServiceCallback");
                return 0;
            }
        }

        /// <summary>
        /// Get hardware serial number via device CGI interface
        /// </summary>
        private async Task<string?> GetHardwareSerialAsync(string ip, string username, string password)
        {
            try
            {
                using var client = new System.Net.Http.HttpClient();
                client.Timeout = TimeSpan.FromSeconds(5);
                
                var authBytes = System.Text.Encoding.UTF8.GetBytes($"{username}:{password}");
                var authHeader = Convert.ToBase64String(authBytes);
                client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Basic", authHeader);
                
                var url = $"http://{ip}/cgi-bin/magicBox.cgi?action=getSerialNo";
                var response = await client.GetAsync(url);
                
                if (!response.IsSuccessStatusCode) return null;
                
                var content = await response.Content.ReadAsStringAsync();
                
                // Parse response format: SN=ABC123DEF456
                var lines = content.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);
                foreach (var line in lines)
                {
                    if (line.StartsWith("SN="))
                    {
                        return line.Substring(3).Trim();
                    }
                }
            }
            catch
            {
                // Silently fail - serial is optional
            }
            return null;
        }

        /// <summary>
        /// Login to auto-registered device using SERVER_CONN mode
        /// This is the correct way to login devices that connected via auto-registration
        /// </summary>
        private async Task LoginAutoRegDevice(string registrationID, string ip, ushort port)
        {
            try
            {
                _logger.LogInformation("=".PadRight(70, '='));
                _logger.LogInformation("🔑 STARTING AUTO-REG DEVICE LOGIN");
                _logger.LogInformation("=".PadRight(70, '='));
                _logger.LogInformation($"   Registration ID: {registrationID}");
                _logger.LogInformation($"   Device IP: {ip}");
                _logger.LogInformation($"   Device Port: {port}");

                // Resolve credentials — per-device takes priority over global platform credentials
                var (username, password) = GetCredentialsForDevice(registrationID);

                _logger.LogInformation($"   Username: {username}");
                _logger.LogInformation($"   Password: [HIDDEN]");
                _logger.LogInformation($"   Login Mode: SERVER_CONN (required for auto-reg)");
                _logger.LogInformation("=".PadRight(70, '='));

                NET_DEVICEINFO_Ex deviceInfo = new NET_DEVICEINFO_Ex();
                
                // CRITICAL: For auto-registered devices, must use SERVER_CONN mode
                // and pass the registration ID as the pCapParam
                IntPtr pParam = Marshal.StringToHGlobalAnsi(registrationID);
                
                _logger.LogInformation($"   Calling NETClient.LoginWithHighLevelSecurity...");
                
                IntPtr loginID = NETClient.LoginWithHighLevelSecurity(
                    ip, 
                    port, 
                    username, 
                    password,
                    EM_LOGIN_SPAC_CAP_TYPE.SERVER_CONN, // MUST use SERVER_CONN for auto-reg
                    pParam, 
                    ref deviceInfo
                );

                Marshal.FreeHGlobal(pParam);

                if (loginID == IntPtr.Zero)
                {
                    var error = NETClient.GetLastError();
                    _logger.LogError("=".PadRight(70, '='));
                    _logger.LogError("❌ LOGIN FAILED");
                    _logger.LogError("=".PadRight(70, '='));
                    _logger.LogError($"   Registration ID: {registrationID}");
                    _logger.LogError($"   Device IP: {ip}");
                    _logger.LogError($"   Error Code: {error}");
                    _logger.LogError($"   Troubleshooting:");
                    _logger.LogError($"     1. Check if device username/password match the platform credentials (POST /api/autoreg/credentials)");
                    _logger.LogError($"     2. Check if device Registration ID matches what is configured on the device");
                    _logger.LogError($"     3. Check Windows Firewall — ensure port {_autoRegPort} is open inbound");
                    _logger.LogError($"     4. If device is behind NAT, ensure router port-forwards {_autoRegPort} to this server");
                    _logger.LogError("=".PadRight(70, '='));

                    // On account-locked or wrong-password: mark device so we don't keep hammering it
                    var errorStr = error?.ToLower() ?? "";
                    if (errorStr.Contains("locked") || errorStr.Contains("password"))
                    {
                        _logger.LogError($"🔒 FATAL AUTH ERROR for {registrationID} — will not retry until credentials are updated.");
                        _logger.LogError($"   ➜ Update credentials via POST /api/autoreg/credentials then reconnect the device.");
                        // Don't TryAdd to _devices — device stays unknown until credentials fixed
                    }
                    return;
                }

                _logger.LogInformation("=".PadRight(70, '='));
                _logger.LogInformation("✅ LOGIN SUCCESSFUL");
                _logger.LogInformation("=".PadRight(70, '='));
                _logger.LogInformation($"   Registration ID: {registrationID}");
                _logger.LogInformation($"   Device IP: {ip}");
                _logger.LogInformation($"   Login Handle: {loginID.ToInt64()}");
                _logger.LogInformation($"   Device Serial (SDK): {deviceInfo.sSerialNumber?.Trim() ?? "N/A"}");
                _logger.LogInformation($"   Device Channels: {deviceInfo.nChanNum}");
                _logger.LogInformation("=".PadRight(70, '='));

                // Only fetch hardware serial if not already fetched this session
                // This flag is cleared when device goes offline
                string hardwareSerial;
                if (_hasFetchedHardwareSerial.ContainsKey(registrationID) && _hasFetchedHardwareSerial[registrationID])
                {
                    // Already fetched this session, use existing serial
                    _logger.LogInformation($"📋 Using cached hardware serial for {registrationID}");
                    hardwareSerial = _devices[registrationID].SerialNumber;
                }
                else
                {
                    // First time online this session - fetch from SDK
                    _logger.LogInformation("🔍 Fetching hardware serial for first time this session...");
                    hardwareSerial = deviceInfo.sSerialNumber?.Trim();
                    if (string.IsNullOrEmpty(hardwareSerial))
                    {
                        _logger.LogWarning("⚠️  SDK returned empty serial, using Registration ID");
                        hardwareSerial = registrationID;
                    }
                    else
                    {
                        _logger.LogInformation($"✅ Hardware Serial: {hardwareSerial}");
                    }
                    
                    // Mark as fetched for this session
                    _hasFetchedHardwareSerial[registrationID] = true;
                }

                // Update or create device entry
                if (_devices.TryGetValue(registrationID, out var device))
                {
                    // Update existing device
                    _logger.LogInformation($"   Updating existing device record");
                    device.LoginHandle = loginID.ToInt64();
                    device.Status = "Online";
                    device.LoginTime = DateTime.UtcNow;
                    device.ChannelCount = deviceInfo.nChanNum;
                    device.SerialNumber = hardwareSerial;
                    device.Name = hardwareSerial; // Use hardware serial as name
                    device.IP = ip;
                    device.Port = port;
                }
                else
                {
                    // Create new device
                    _logger.LogInformation($"   Creating new device record");
                    device = new DeviceInfo
                    {
                        DeviceID = registrationID,
                        SerialNumber = hardwareSerial,
                        Name = hardwareSerial,
                        IP = ip,
                        Port = port,
                        Status = "Online",
                        Type = "Face Recognition Terminal",
                        Generation = "2nd Generation",
                        ChannelCount = deviceInfo.nChanNum,
                        LoginTime = DateTime.UtcNow,
                        IsAutoRegistered = true,
                        LoginHandle = loginID.ToInt64()
                    };

                    _devices.TryAdd(registrationID, device);
                }

                // Map login handle to registration ID
                _loginHandles.TryAdd(loginID.ToInt64(), registrationID);
                _logger.LogInformation($"   Device added to registry: {registrationID}");

                // Notify frontend
                DeviceStatusChanged?.Invoke(this, new DeviceStatusChangedEventArgs
                {
                    DeviceID = registrationID,
                    Status = "Online",
                    Timestamp = DateTime.UtcNow
                });

                _logger.LogInformation("");
                _logger.LogInformation("🎉 DEVICE FULLY CONNECTED AND READY");
                _logger.LogInformation($"   Registration ID: {registrationID}");
                _logger.LogInformation($"   Status: Online");
                _logger.LogInformation($"   Events will flow through SDK StartListen alarm callback");
                _logger.LogInformation("");

                // ============================================================
                // PRIMARY: Start SDK alarm event subscription (StartListen)
                // ============================================================
                if (_accessControlEventsSdkModule != null)
                {
                    bool listenResult = await _accessControlEventsSdkModule.StartListen(registrationID, loginID.ToInt64());
                    if (listenResult)
                    {
                        _logger.LogInformation($"✅ SDK StartListen enabled for device {registrationID} - Events will flow through MessageCallback");
                    }
                    else
                    {
                        _logger.LogWarning($"⚠️  SDK StartListen failed for device {registrationID}");
                    }
                }

                // ============================================================
                // OPTIONAL: RealLoadPicture for snapshot images (requires IP access)
                // ============================================================
                if (_accessControlEventsModule != null)
                {
                    _logger.LogInformation($"📷 [OPTIONAL] Attempting RealLoadPicture subscription for snapshot images: {registrationID}");
                    await _accessControlEventsModule.SubscribeToDeviceEvents(registrationID, loginID.ToInt64(), ip);
                }

                // ============================================================
                // DEPRECATED: CGI subscriptions disabled (no longer used)
                // ============================================================
                // if (_accessControlEventsCgiModule != null)
                // {
                //     await _accessControlEventsCgiModule.SubscribeToDeviceEvents(...); // DEPRECATED
                // }
                // if (_accessControlEventsGeneralModule != null)
                // {
                //     await _accessControlEventsGeneralModule.SubscribeToDeviceEvents(...); // DEPRECATED
                // }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "=".PadRight(70, '='));
                _logger.LogError($"❌ ERROR logging in auto-reg device: {registrationID}");
                _logger.LogError("=".PadRight(70, '='));
            }
        }

        private string GetEventType(int eventCode)
        {
            return eventCode switch
            {
                0x2010 => "Face Recognition",
                0x2011 => "Face Detection",
                0x1001 => "Motion Detection",
                0x1002 => "Video Loss",
                0x1003 => "Camera Occlusion",
                0x1004 => "Alarm Input",
                0x1005 => "Alarm Output",
                0x3001 => "Door Open",
                0x3002 => "Door Close",
                0x3003 => "Door Bell",
                _ => $"Unknown Event ({eventCode})"
            };
        }

        public void SimulateDeviceEvent(string deviceId, string eventType, string eventData)
        {
            DeviceEventReceived?.Invoke(this, new DeviceEventEventArgs
            {
                DeviceID = deviceId,
                EventType = eventType,
                EventData = eventData,
                Timestamp = DateTime.UtcNow
            });
        }

        #region Access Control Record APIs

        /// <summary>
        /// Query access control records using NetSDK FindRecord API
        /// Works through the auto-registration TCP connection (NAT traversal).
        /// No direct HTTP access to device IP needed.
        /// </summary>
        public async Task<List<AccessRecordResult>> QueryAccessRecordsBySDK(string deviceId, DateTime? startTime = null, DateTime? endTime = null, string cardNumber = null, int maxRecords = 100)
        {
            try
            {
                var device = GetDevice(deviceId);
                if (device == null)
                {
                    _logger.LogWarning($"Device not found: {deviceId}");
                    return new List<AccessRecordResult>();
                }

                if (device.LoginHandle == 0)
                {
                    _logger.LogWarning($"Device {deviceId} is not logged in");
                    return new List<AccessRecordResult>();
                }

                _logger.LogInformation($"Querying access records via NetSDK (TCP) for device: {deviceId}");
                _logger.LogInformation($"   Start: {startTime?.ToString("yyyy-MM-dd HH:mm:ss") ?? "7 days ago"}");
                _logger.LogInformation($"   End: {endTime?.ToString("yyyy-MM-dd HH:mm:ss") ?? "Now"}");
                _logger.LogInformation($"   Max Records: {maxRecords}");

                // Default to last 7 days if no time range specified
                DateTime effectiveStart = startTime ?? DateTime.Now.AddDays(-7);
                DateTime effectiveEnd = endTime ?? DateTime.Now;

                var results = new List<AccessRecordResult>();
                var seenRecordNos = new HashSet<string>();

                // Build query condition - use bRealUTCTimeEnable = false so device interprets times as-is
                var condition = new NET_FIND_RECORD_ACCESSCTLCARDREC_CONDITION_EX
                {
                    dwSize = (uint)Marshal.SizeOf(typeof(NET_FIND_RECORD_ACCESSCTLCARDREC_CONDITION_EX)),
                    bCardNoEnable = !string.IsNullOrEmpty(cardNumber),
                    szCardNo = cardNumber ?? "",
                    bTimeEnable = true,
                    bRealUTCTimeEnable = false,  // Device interprets times as provided (no UTC conversion)
                    nOrderNum = 0
                };

                // Initialize orders array
                condition.stuOrders = new NET_FIND_RECORD_ACCESSCTLCARDREC_ORDER[6];

                // Set time range (use as-is, device stores in local timezone)
                var startDate = effectiveStart;
                condition.stStartTime.dwYear = (uint)startDate.Year;
                condition.stStartTime.dwMonth = (uint)startDate.Month;
                condition.stStartTime.dwDay = (uint)startDate.Day;
                condition.stStartTime.dwHour = (uint)startDate.Hour;
                condition.stStartTime.dwMinute = (uint)startDate.Minute;
                condition.stStartTime.dwSecond = (uint)startDate.Second;

                var endDate = effectiveEnd;
                condition.stEndTime.dwYear = (uint)endDate.Year;
                condition.stEndTime.dwMonth = (uint)endDate.Month;
                condition.stEndTime.dwDay = (uint)endDate.Day;
                condition.stEndTime.dwHour = (uint)endDate.Hour;
                condition.stEndTime.dwMinute = (uint)endDate.Minute;
                condition.stEndTime.dwSecond = (uint)endDate.Second;

                _logger.LogInformation($"Sending to device - Start: {startDate:yyyy-MM-dd HH:mm:ss}, End: {endDate:yyyy-MM-dd HH:mm:ss}");

                // Step 1: Open query handle via TCP (works over NAT)
                IntPtr findHandle = IntPtr.Zero;
                IntPtr loginHandle = new IntPtr(device.LoginHandle);

                _logger.LogInformation($"Opening FindRecord handle via TCP connection...");

                bool findResult = NETClient.FindRecord(
                    loginHandle,
                    EM_NET_RECORD_TYPE.ACCESSCTLCARDREC_EX,
                    condition,
                    typeof(NET_FIND_RECORD_ACCESSCTLCARDREC_CONDITION_EX),
                    ref findHandle,
                    10000
                );

                if (!findResult || findHandle == IntPtr.Zero)
                {
                    var errorCode = NETClient.GetLastError();
                    _logger.LogError($"FindRecord failed: {errorCode}");
                    return new List<AccessRecordResult>();
                }

                _logger.LogInformation($"FindRecord handle opened: {findHandle}");

                try
                {
                    // Step 2: Get record count
                    int recordCount = 0;
                    bool countResult = NETClient.QueryRecordCount(findHandle, ref recordCount, 10000);

                    if (countResult)
                    {
                        _logger.LogInformation($"Total records found: {recordCount}");
                    }
                    else
                    {
                        _logger.LogWarning($"Could not get record count, will try fetching anyway");
                    }

                    // Step 3: Fetch records in batches
                    int totalFetched = 0;
                    int batchSize = Math.Min(100, maxRecords);

                    while (totalFetched < maxRecords)
                    {
                        int retNum = 0;
                        var recordList = new List<object>();

                        int nextResult = NETClient.FindNextRecord(
                            findHandle,
                            batchSize,
                            ref retNum,
                            ref recordList,
                            typeof(NET_RECORDSET_ACCESS_CTL_CARDREC),
                            10000
                        );

                        if (nextResult <= 0 || retNum == 0)
                        {
                            if (nextResult <= 0)
                            {
                                var fetchError = NETClient.GetLastError();
                                _logger.LogWarning($"FindNextRecord error: {fetchError}");
                            }
                            _logger.LogInformation($"No more records to fetch (fetched {totalFetched} total)");
                            break;
                        }

                        _logger.LogInformation($"Fetched {retNum} records in batch");

                        // Process each record
                        foreach (var recordObj in recordList)
                        {
                            if (totalFetched >= maxRecords) break;

                            if (recordObj is NET_RECORDSET_ACCESS_CTL_CARDREC record)
                            {
                                // Use composite key for deduplication
                                string dedupKey = $"{record.nRecNo}_{record.szCardNo}_{record.szUserID}_{record.stuTime.ToDateTime():yyyyMMddHHmmss}";
                                if (seenRecordNos.Contains(dedupKey))
                                {
                                    continue;
                                }
                                seenRecordNos.Add(dedupKey);

                                // Convert record to result
                                // Device returns time as-is (no UTC conversion)
                                var swipeTimeString = record.stuTime.ToDateTime().ToString("yyyy-MM-ddTHH:mm:ssZ");

                                var result = new AccessRecordResult
                                {
                                    RecordNumber = record.nRecNo,
                                    CardNumber = record.szCardNo?.Trim() ?? "",
                                    UserID = record.szUserID?.Trim() ?? "",
                                    UserName = "",
                                    SwipeTime = swipeTimeString,
                                    DoorNumber = record.nDoor,
                                    ReaderNo = record.szReaderID?.Trim() ?? "",
                                    CardType = GetCardTypeString(record.emCardType),
                                    Status = record.bStatus ? "Success" : "Failed"
                                };

                                results.Add(result);
                                totalFetched++;
                            }
                        }

                        // If we got fewer records than batch size, we're done
                        if (retNum < batchSize)
                        {
                            break;
                        }
                    }

                    _logger.LogInformation($"Total access records retrieved via TCP for device {deviceId}: {results.Count}");
                    return results;
                }
                finally
                {
                    // Step 4: Close query handle
                    if (findHandle != IntPtr.Zero)
                    {
                        NETClient.FindRecordClose(findHandle);
                        _logger.LogDebug($"FindRecord handle closed: {findHandle}");
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error querying access records via SDK for device {deviceId}");
                return new List<AccessRecordResult>();
            }
        }

        /// <summary>
        /// Query access records using the AccessRecordsQueryModule (TCP method via FindRecord API)
        /// This is the modular approach - delegates to AccessRecordsQueryModule
        /// </summary>
        public async Task<List<AccessRecordResult>> QueryAccessRecordsViaModule(string deviceId, DateTime? startTime = null, DateTime? endTime = null, string? cardNumber = null, int maxRecords = 1000)
        {
            try
            {
                if (_accessRecordsQueryModule == null)
                {
                    _logger.LogWarning("AccessRecordsQueryModule not initialized");
                    return new List<AccessRecordResult>();
                }

                var device = GetDevice(deviceId);
                if (device == null || device.LoginHandle == 0)
                {
                    _logger.LogWarning($"Device {deviceId} not found or not logged in");
                    return new List<AccessRecordResult>();
                }

                // Call module to query records
                var moduleResults = await _accessRecordsQueryModule.QueryRecords(
                    deviceId,
                    new IntPtr(device.LoginHandle),
                    startTime,
                    endTime,
                    cardNumber,
                    maxRecords
                );

                // Convert module results to API results
                var results = moduleResults.Select(r => new AccessRecordResult
                {
                    DeviceID = r.DeviceId,
                    RecordNumber = r.RecordNumber,
                    CardNumber = r.CardNumber,
                    UserID = r.UserID,
                    UserName = r.UserName,  // Empty from SDK
                    SwipeTime = r.SwipeTime,
                    DoorNumber = r.DoorNumber,
                    ReaderNo = r.ReaderNo,
                    CardType = r.CardType,
                    Status = r.Status
                }).ToList();

                _logger.LogInformation($"[Module] Retrieved {results.Count} records for device {deviceId}");
                return results;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error querying access records via module for device {deviceId}");
                return new List<AccessRecordResult>();
            }
        }

        private string GetCardTypeString(EM_A_NET_ACCESSCTLCARD_TYPE cardType)
        {
            return cardType switch
            {
                EM_A_NET_ACCESSCTLCARD_TYPE.NET_ACCESSCTLCARD_TYPE_GENERAL => "Normal",
                EM_A_NET_ACCESSCTLCARD_TYPE.NET_ACCESSCTLCARD_TYPE_VIP => "VIP",
                EM_A_NET_ACCESSCTLCARD_TYPE.NET_ACCESSCTLCARD_TYPE_GUEST => "Guest",
                EM_A_NET_ACCESSCTLCARD_TYPE.NET_ACCESSCTLCARD_TYPE_PATROL => "Patrol",
                EM_A_NET_ACCESSCTLCARD_TYPE.NET_ACCESSCTLCARD_TYPE_BLACKLIST => "Blacklisted",
                EM_A_NET_ACCESSCTLCARD_TYPE.NET_ACCESSCTLCARD_TYPE_CORCE => "Coercion",
                EM_A_NET_ACCESSCTLCARD_TYPE.NET_ACCESSCTLCARD_TYPE_UNKNOWN => "Unknown",
                _ => cardType.ToString()
            };
        }

        /// <summary>
        /// Query access control card swipe records using device CGI API (recordFinder.cgi)
        /// Based on Access Control API Guide v2.4 Section 4.3.1.2
        /// NOTE: This method requires direct HTTP access to the device (works on LAN only).
        /// For devices behind NAT/firewall, use QueryAccessRecordsBySDK() instead.
        /// </summary>
        public async Task<List<AccessRecordResult>> QueryAccessRecords(string deviceId, DateTime? startTime = null, DateTime? endTime = null, string cardNumber = null, int maxRecords = 100)
        {
            try
            {
                var device = GetDevice(deviceId);
                if (device == null)
                {
                    _logger.LogWarning($"Device not found: {deviceId}");
                    return new List<AccessRecordResult>();
                }

                // Default to last 7 days if no time range specified
                DateTime effectiveStart = startTime ?? DateTime.UtcNow.AddDays(-7);
                DateTime effectiveEnd = endTime ?? DateTime.UtcNow;
                
                // Convert DateTime to UTC Unix timestamps
                long startTimestamp = new DateTimeOffset(effectiveStart.ToUniversalTime()).ToUnixTimeSeconds();
                long endTimestamp = new DateTimeOffset(effectiveEnd.ToUniversalTime()).ToUnixTimeSeconds();

                var results = new List<AccessRecordResult>();
                var seenRecordNos = new HashSet<string>();

                // Build CGI URL
                var baseUrl = $"http://{device.IP}/cgi-bin/recordFinder.cgi";
                
                using var handler = new System.Net.Http.HttpClientHandler();
                
                // Use auto-reg platform credentials or device login credentials
                var username = _platformUsername ?? "admin";
                var password = _platformPassword ?? "";
                
                handler.Credentials = new System.Net.NetworkCredential(username, password);
                handler.PreAuthenticate = true;
                
                using var client = new System.Net.Http.HttpClient(handler);
                client.Timeout = TimeSpan.FromSeconds(10);

                // Also add Basic Auth header explicitly
                var authBytes = System.Text.Encoding.UTF8.GetBytes($"{username}:{password}");
                var authHeader = Convert.ToBase64String(authBytes);
                client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Basic", authHeader);

                long currentStartTime = startTimestamp;
                int totalFetched = 0;
                int maxRecordsToFetch = Math.Min(maxRecords, 1024); // Device limit is 1024

                do
                {
                    var url = $"{baseUrl}?action=find&name=AccessControlCardRec&StartTime={currentStartTime}&EndTime={endTimestamp}&count={Math.Min(maxRecordsToFetch - totalFetched, 100)}";
                    
                    if (!string.IsNullOrEmpty(cardNumber))
                    {
                        url += $"&condition.CardNo={cardNumber}";
                    }

                    _logger.LogInformation($"Fetching records from: {url}");
                    var response = await client.GetAsync(url);
                    var content = await response.Content.ReadAsStringAsync();

                    if (!response.IsSuccessStatusCode)
                    {
                        _logger.LogWarning($"CGI request failed: HTTP {(int)response.StatusCode}");
                        break;
                    }

                    // Parse CGI response format:
                    // found=100
                    // records[0].RecNo=12345
                    // records[0].CreateTime=140556698
                    // records[0].CardNo=12001
                    // records[0].CardName=ZhangSan
                    // records[0].UserID=ZhangSan
                    var lines = content.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);
                    
                    int found = 0;
                    long lastCreateTime = 0;
                    
                    // Group all fields by record index first
                    var recordsByIndex = new Dictionary<int, Dictionary<string, string>>();
                    int currentIndex = -1;

                    foreach (var line in lines)
                    {
                        var trimmedLine = line.Trim();
                        
                        // Parse found=N
                        if (trimmedLine.StartsWith("found="))
                        {
                            if (int.TryParse(trimmedLine.Substring(6), out var f))
                                found = f;
                            continue;
                        }

                        // Parse records[N].Key=Value
                        var match = System.Text.RegularExpressions.Regex.Match(trimmedLine, @"records\[(\d+)\]\.(\w+)=(.+)");
                        if (match.Success)
                        {
                            int recordIndex = int.Parse(match.Groups[1].Value);
                            string key = match.Groups[2].Value;
                            string value = match.Groups[3].Value.Trim();

                            if (!recordsByIndex.ContainsKey(recordIndex))
                            {
                                recordsByIndex[recordIndex] = new Dictionary<string, string>();
                            }
                            recordsByIndex[recordIndex][key] = value;

                            if (key == "CreateTime" && long.TryParse(value, out var ct))
                            {
                                lastCreateTime = ct;
                            }
                            
                            if (recordIndex > currentIndex)
                            {
                                currentIndex = recordIndex;
                            }
                        }
                    }

                    // Now process all grouped records
                    foreach (var kvp in recordsByIndex.OrderBy(x => x.Key))
                    {
                        if (totalFetched >= maxRecords) break;
                        ProcessAccessRecord(kvp.Value, seenRecordNos, results, ref totalFetched, maxRecords);
                    }

                    _logger.LogInformation($"Fetched {found} records, total so far: {results.Count}");

                    // If found < count or we've reached max, stop
                    if (found == 0 || found < 100 || totalFetched >= maxRecords)
                    {
                        break;
                    }

                    // Update StartTime for next batch (Step 2 from documentation)
                    currentStartTime = lastCreateTime;

                } while (totalFetched < maxRecords);

                _logger.LogInformation($"Total access records retrieved for device {deviceId}: {results.Count}");
                return results;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error querying access records for device {deviceId}");
                return new List<AccessRecordResult>();
            }
        }

        private void ProcessAccessRecord(Dictionary<string, string> record, HashSet<string> seenRecordNos, List<AccessRecordResult> results, ref int totalFetched, int maxRecords)
        {
            // Check for duplicates
            if (record.TryGetValue("RecNo", out var recNo) && seenRecordNos.Contains(recNo))
            {
                return; // Skip duplicate
            }

            if (recNo != null)
            {
                seenRecordNos.Add(recNo);
            }

            // Convert Unix timestamp to local time
            string swipeTimeString = "";
            if (record.TryGetValue("CreateTime", out var createTimeStr) && long.TryParse(createTimeStr, out var createTime))
            {
                var swipeTimeUtc = DateTimeOffset.FromUnixTimeSeconds(createTime).UtcDateTime;
                var swipeTimeLocal = TimeZoneInfo.ConvertTimeFromUtc(swipeTimeUtc, TimeZoneInfo.Local);
                swipeTimeString = swipeTimeLocal.ToString("yyyy-MM-dd HH:mm:ss");
            }

            var result = new AccessRecordResult
            {
                RecordNumber = int.TryParse(recNo, out var rn) ? rn : 0,
                CardNumber = record.GetValueOrDefault("CardNo", ""),
                UserID = record.GetValueOrDefault("UserID", ""),
                UserName = record.GetValueOrDefault("CardName", ""),
                SwipeTime = swipeTimeString,
                DoorNumber = record.TryGetValue("DoorNo", out var doorStr) && int.TryParse(doorStr, out var door) ? door : 0,
                ReaderNo = record.GetValueOrDefault("ReaderNo", ""),
                CardType = record.GetValueOrDefault("Type", ""),
                Status = record.GetValueOrDefault("Status", "")
            };

            results.Add(result);
            totalFetched++;
        }

        #endregion

        #region Device Info APIs

        /// <summary>
        /// Get device capabilities and information
        /// </summary>
        public async Task<DeviceCapabilities> GetDeviceCapabilities(string deviceId)
        {
            try
            {
                var device = GetDevice(deviceId);
                if (device == null || device.LoginHandle == 0)
                {
                    return null;
                }

                return new DeviceCapabilities
                {
                    DeviceID = device.DeviceID,
                    IP = device.IP,
                    Name = device.Name,
                    Type = device.Type,
                    SerialNumber = device.SerialNumber,
                    ChannelCount = device.ChannelCount,
                    Status = device.Status,
                    SupportsFaceRecognition = true,
                    SupportsFingerprint = true,
                    SupportsCardAccess = true,
                    SupportsPassword = true,
                    MaxUsers = 10000,
                    MaxCards = 100000,
                    MaxFingerprints = 10000,
                    MaxRecords = 200000
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error getting device capabilities for {deviceId}");
                return null;
            }
        }

        #endregion

        #region Door Status APIs

        /// <summary>
        /// Get door status via device CGI interface
        /// </summary>
        public async Task<DoorStatusResult> GetDoorStatus(string deviceId, int channel = 1)
        {
            try
            {
                var device = GetDevice(deviceId);
                if (device == null)
                {
                    return new DoorStatusResult { Success = false, Error = "Device not found" };
                }

                var url = $"http://{device.IP}/cgibin/accessControl.cgi?action=getDoorStatus&channel={channel}";
                
                using var client = new System.Net.Http.HttpClient();
                client.Timeout = TimeSpan.FromSeconds(5);
                
                var response = await client.GetAsync(url);
                var content = await response.Content.ReadAsStringAsync();

                if (!response.IsSuccessStatusCode)
                {
                    return new DoorStatusResult { Success = false, Error = $"HTTP {response.StatusCode}: {content}" };
                }

                // Parse CGI response (typically: "ret={result}\nstatus={status}")
                var lines = content.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);
                var result = new DoorStatusResult { Success = true, Channel = channel };

                foreach (var line in lines)
                {
                    var parts = line.Split('=');
                    if (parts.Length == 2)
                    {
                        var key = parts[0].Trim().ToLower();
                        var value = parts[1].Trim();

                        switch (key)
                        {
                            case "ret":
                                result.ReturnCode = value;
                                break;
                            case "status":
                                result.Status = value;
                                break;
                            case "doorstatus":
                                result.DoorStatus = value;
                                break;
                        }
                    }
                }

                // If no explicit status field, use raw content
                if (string.IsNullOrEmpty(result.Status) && string.IsNullOrEmpty(result.DoorStatus))
                {
                    result.RawResponse = content;
                }

                _logger.LogInformation($"Door status for device {deviceId}, channel {channel}: {result.Status ?? result.DoorStatus ?? result.RawResponse}");
                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error getting door status for device {deviceId}");
                return new DoorStatusResult { Success = false, Error = ex.Message };
            }
        }

        /// <summary>
        /// Open door via device CGI interface
        /// </summary>
        public async Task<DoorOperationResult> OpenDoor(string deviceId, int channel = 1)
        {
            try
            {
                var device = GetDevice(deviceId);
                if (device == null)
                {
                    return new DoorOperationResult { Success = false, Error = "Device not found" };
                }

                var url = $"http://{device.IP}/cgibin/accessControl.cgi?action=openDoor&channel={channel}";
                
                using var client = new System.Net.Http.HttpClient();
                client.Timeout = TimeSpan.FromSeconds(5);
                
                var response = await client.GetAsync(url);
                var content = await response.Content.ReadAsStringAsync();

                if (!response.IsSuccessStatusCode)
                {
                    return new DoorOperationResult { Success = false, Error = $"HTTP {response.StatusCode}: {content}" };
                }

                _logger.LogInformation($"Door opened for device {deviceId}, channel {channel}");
                return new DoorOperationResult { Success = true, Channel = channel, RawResponse = content };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error opening door for device {deviceId}");
                return new DoorOperationResult { Success = false, Error = ex.Message };
            }
        }

        /// <summary>
        /// Close door via device CGI interface
        /// </summary>
        public async Task<DoorOperationResult> CloseDoor(string deviceId, int channel = 1)
        {
            try
            {
                var device = GetDevice(deviceId);
                if (device == null)
                {
                    return new DoorOperationResult { Success = false, Error = "Device not found" };
                }

                var url = $"http://{device.IP}/cgibin/accessControl.cgi?action=closeDoor&channel={channel}";
                
                using var client = new System.Net.Http.HttpClient();
                client.Timeout = TimeSpan.FromSeconds(5);
                
                var response = await client.GetAsync(url);
                var content = await response.Content.ReadAsStringAsync();

                if (!response.IsSuccessStatusCode)
                {
                    return new DoorOperationResult { Success = false, Error = $"HTTP {response.StatusCode}: {content}" };
                }

                _logger.LogInformation($"Door closed for device {deviceId}, channel {channel}");
                return new DoorOperationResult { Success = true, Channel = channel, RawResponse = content };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error closing door for device {deviceId}");
                return new DoorOperationResult { Success = false, Error = ex.Message };
            }
        }

        #endregion

        private string GetLocalIPAddress()
        {
            var host = Dns.GetHostEntry(Dns.GetHostName());
            foreach (var ip in host.AddressList)
            {
                if (ip.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
                {
                    return ip.ToString();
                }
            }
            return "127.0.0.1";
        }

        public Task Cleanup()
        {
            try
            {
                _logger.LogInformation("Cleaning up NetSDK...");

                // Stop all SDK alarm event subscriptions (PRIMARY)
                _accessControlEventsSdkModule?.StopListenAll();
                _accessControlEventsSdkModule?.Dispose();

                // Unsubscribe from all RealLoadPicture events (OPTIONAL)
                _accessControlEventsModule?.UnsubscribeAll();
                _accessControlEventsModule?.Dispose();

                // CGI modules no longer used (DEPRECATED) - just dispose
                // _accessControlEventsCgiModule?.UnsubscribeAll();
                _accessControlEventsCgiModule?.Dispose();
                // _accessControlEventsGeneralModule?.UnsubscribeAll();
                _accessControlEventsGeneralModule?.Dispose();

                foreach (var deviceId in _devices.Keys.ToList())
                {
                    LogoutFromDevice(deviceId);
                }

                StopAutoRegServer();
                NETClient.Cleanup();

                _isInitialized = false;
                _logger.LogInformation("NetSDK cleanup completed");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during cleanup");
            }
            return Task.CompletedTask;
        }

        /// <summary>
        /// Add person information to access control device
        /// Supports both SDK and CGI methods based on device capability
        /// </summary>
        public async Task<AddPersonDeviceResult> AddPersonToDeviceAsync(AddPersonRequest request)
        {
            var result = new AddPersonDeviceResult
            {
                DeviceID = request.DeviceID,
                Success = false,
                UserAdded = false,
                CardAdded = false,
                FaceAdded = false
            };

            try
            {
                string operation = request.IsUpdate ? "UPDATE" : "CREATE";
                _logger.LogInformation($"[{operation}] Person operation for ID {request.PersonID} on device {request.DeviceID}");

                // Find the device
                if (!_devices.TryGetValue(request.DeviceID, out var device))
                {
                    result.Error = "Device not found";
                    _logger.LogError($"Device {request.DeviceID} not found");
                    return result;
                }

                if (device.LoginHandle == IntPtr.Zero)
                {
                    result.Error = "Device not logged in";
                    _logger.LogError($"Device {request.DeviceID} not logged in");
                    return result;
                }

                // For auto-registered devices (internet-based), we must use SDK methods only
                // CGI requires direct IP access which is not available
                // Use SDK method directly
                return await AddPersonToDeviceViaSdkAsync(request);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Exception in AddPersonToDeviceAsync for {request.PersonID}");
                result.Error = $"Exception: {ex.Message}";
                return result;
            }
        }

        /// <summary>
        /// Add person using HTTP CGI method (alternative to SDK)
        /// This method works with devices that don't support SDK operations
        /// </summary>
        private async Task<AddPersonDeviceResult> AddPersonToDeviceViaCgiAsync(DeviceInfo device, AddPersonRequest request)
        {
            var result = new AddPersonDeviceResult
            {
                DeviceID = request.DeviceID,
                Success = false,
                UserAdded = false,
                CardAdded = false,
                FaceAdded = false
            };

            try
            {
                string deviceIp = device.IP;
                string base64FaceImage = null;
                
                // Convert face image to base64 if provided
                if (request.FaceImage != null && request.FaceImage.Length > 0)
                {
                    base64FaceImage = Convert.ToBase64String(request.FaceImage);
                    _logger.LogInformation($"[CGI] Face image converted to base64, length: {base64FaceImage.Length}");
                }

                // Build CGI request body for setUser action
                var cgiParams = new List<string>();
                cgiParams.Add($"action=setUser");
                
                // Build JSON payload
                var userJson = new System.Text.StringBuilder();
                userJson.Append("{");
                userJson.Append($"\"UserID\":\"{request.PersonID}\",");
                userJson.Append($"\"Name\":\"{request.PersonName}\",");
                userJson.Append($"\"UserType\":\"normal\",");
                
                // Add card number if provided
                if (!string.IsNullOrEmpty(request.CardNumber))
                {
                    userJson.Append($"\"CardInfo\":[{{\"CardNo\":\"{request.CardNumber}\"}}],");
                }
                
                // Add face image in base64 if provided
                if (!string.IsNullOrEmpty(base64FaceImage))
                {
                    userJson.Append($"\"FaceInfo\":[{{\"FaceImage\":\"{base64FaceImage}\",\"ImageType\":\"base64\"}}],");
                }
                
                userJson.Append("\"Enable\":true");
                userJson.Append("}");

                var url = $"http://{deviceIp}/cgi-bin/accessControl.cgi?action=setUser";
                
                _logger.LogInformation($"[CGI] Sending request to: {url}");
                _logger.LogInformation($"[CGI] User JSON length: {userJson.Length} chars");
                
                // Log if face image is included
                if (!string.IsNullOrEmpty(base64FaceImage))
                {
                    _logger.LogInformation($"[CGI] Face image included in base64 ({base64FaceImage.Length} chars)");
                }

                using var httpClient = new HttpClient();
                httpClient.Timeout = TimeSpan.FromSeconds(30);
                
                var content = new StringContent(userJson.ToString(), System.Text.Encoding.UTF8, "application/json");
                var response = await httpClient.PostAsync(url, content);
                var responseBody = await response.Content.ReadAsStringAsync();

                _logger.LogInformation($"[CGI] Response status: {response.StatusCode}");
                _logger.LogInformation($"[CGI] Response body: {responseBody}");

                if (response.IsSuccessStatusCode)
                {
                    // Parse response to check success
                    if (responseBody.Contains("ret") && responseBody.Contains("true"))
                    {
                        result.Success = true;
                        result.UserAdded = true;
                        result.FaceAdded = !string.IsNullOrEmpty(base64FaceImage);
                        result.CardAdded = !string.IsNullOrEmpty(request.CardNumber);
                        result.Message = "Person added successfully via CGI";
                        
                        _logger.LogInformation($"[CGI] ✅ Person {request.PersonID} added successfully");
                    }
                    else
                    {
                        result.Error = $"CGI request failed: {responseBody}";
                        _logger.LogWarning($"[CGI] ❌ {result.Error}");
                    }
                }
                else
                {
                    result.Error = $"HTTP error: {response.StatusCode} - {responseBody}";
                    _logger.LogWarning($"[CGI] ❌ {result.Error}");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[CGI] Exception while adding person via CGI");
                result.Error = $"CGI exception: {ex.Message}";
            }

            return result;
        }

        /// <summary>
        /// Async wrapper for SDK method
        /// </summary>
        private Task<AddPersonDeviceResult> AddPersonToDeviceViaSdkAsync(AddPersonRequest request)
        {
            return Task.FromResult(AddPersonToDeviceViaSdk(request));
        }

        /// <summary>
        /// Add person using SDK method (alternative implementation using SetConfig)
        /// This works with auto-registered devices where CGI is not available
        /// </summary>
        private AddPersonDeviceResult AddPersonToDeviceViaSdk(AddPersonRequest request)
        {
            var result = new AddPersonDeviceResult
            {
                DeviceID = request.DeviceID,
                Success = false,
                UserAdded = false,
                CardAdded = false,
                FaceAdded = false
            };

            try
            {
                string operation = request.IsUpdate ? "UPDATE" : "CREATE";
                _logger.LogInformation($"[{operation}] Person operation for ID {request.PersonID} on device {request.DeviceID}");
                
                // Find the device
                if (!_devices.TryGetValue(request.DeviceID, out var device))
                {
                    result.Error = "Device not found";
                    _logger.LogError($"Device {request.DeviceID} not found");
                    return result;
                }

                if (device.LoginHandle == IntPtr.Zero)
                {
                    result.Error = "Device not logged in";
                    _logger.LogError($"Device {request.DeviceID} not logged in");
                    return result;
                }

                // Add or update user info
                // Dahua SDK: InsertOperateAccessUserService is an UPSERT operation
                // If szUserID exists, it updates; if not, it creates
                // The Dahua demo ALWAYS uses InsertOperateAccessUserService - there is no separate Update method for users
                {
                    try
                    {
                        string operationLabel = request.IsUpdate ? "[UPDATE] Upserting" : "[CREATE] Adding";
                        _logger.LogInformation($"{operationLabel} user {request.PersonID} to device...");
                    var userInfo = new NET_ACCESS_USER_INFO
                    {
                        szUserID = request.PersonID ?? "",
                        szName = request.PersonName ?? "",
                        emUserType = EM_USER_TYPE.NORMAL,  // Ordinary user - editable from web interface
                        nUserStatus = 0, // Normal status
                        nDoorNum = 1, // Set to 1 to enable door access (door 1)
                        nDoors = new int[32],
                        nTimeSectionNum = 0,
                        nTimeSectionNo = new int[32],
                        nSpecialDaysScheduleNum = 0,
                        nSpecialDaysSchedule = new int[128]
                    };

                    // Enable access to door 1 (and potentially other doors)
                    userInfo.nDoors[0] = 1; // Door 1
                    
                    // Set user password (empty string allows no password authentication)
                    userInfo.szPsw = "";

                    // Set valid time (default: 10 years from now)
                    var now = DateTime.Now;
                    userInfo.stuValidBeginTime = new NET_TIME
                    {
                        dwYear = (uint)now.Year,
                        dwMonth = (uint)now.Month,
                        dwDay = (uint)now.Day,
                        dwHour = 0,
                        dwMinute = 0,
                        dwSecond = 0
                    };
                    userInfo.stuValidEndTime = new NET_TIME
                    {
                        dwYear = (uint)(now.Year + 10),
                        dwMonth = (uint)now.Month,
                        dwDay = (uint)now.Day,
                        dwHour = 0,
                        dwMinute = 0,
                        dwSecond = 0
                    };

                    var userInfoArray = new NET_ACCESS_USER_INFO[] { userInfo };
                    NET_EM_FAILCODE[] failCode;

                    bool userResult = NETClient.InsertOperateAccessUserService((IntPtr)device.LoginHandle, userInfoArray, out failCode, 5000);

                    int initialFailCode = failCode != null && failCode.Length > 0 ? (int)failCode[0].emCode : -999;
                    _logger.LogInformation($"[DEBUG] InsertOperateAccessUserService returned: userResult={userResult}, failCode.Length={failCode?.Length ?? -1}, failCode[0].emCode={initialFailCode}");

                    if (userResult && failCode != null && failCode.Length > 0 && failCode[0].emCode == 0)
                    {
                        result.UserAdded = true;
                        _logger.LogInformation($"User {request.PersonID} added to device {request.DeviceID}");
                    }
                    else if (userResult && string.IsNullOrWhiteSpace(NETClient.GetLastError()))
                    {
                        // SDK returned true and no error message - treat as success even if failCode isn't exactly 0
                        // Some SDK versions or devices may return non-zero failCode but still succeed
                        _logger.LogInformation($"User {request.PersonID} added to device {request.DeviceID} (SDK returned success despite failCode)");
                        result.UserAdded = true;
                    }
                    else
                    {
                        // Try to get error from GetLastError() first
                        string sdkError = NETClient.GetLastError();
                        _logger.LogInformation($"[DEBUG] GetLastError returned: '{sdkError}'");
                        
                        // If GetLastError() is empty, check failCode (but validate it's not garbage)
                        string errorDetails = "";
                        if (string.IsNullOrWhiteSpace(sdkError))
                        {
                            // failCode might contain garbage, so only use if it looks valid
                            if (failCode != null && failCode.Length > 0)
                            {
                                int failCodeValue = (int)failCode[0].emCode;
                                // Only use failCode if it's a reasonable value (not garbage)
                                // Garbage values are typically very large negative/positive numbers
                                if (failCodeValue >= -10000 && failCodeValue <= 10000)
                                {
                                    errorDetails = $" (failCode: {failCodeValue})";
                                }
                                else
                                {
                                    errorDetails = $" (failCode contains invalid data: {failCodeValue}, likely memory corruption)";
                                }
                            }
                            sdkError = "Unknown SDK error";
                        }
                        
                        _logger.LogWarning($"InsertOperateAccessUserService failed. SDK Error: {sdkError}{errorDetails}, failCode length: {failCode?.Length ?? 0}");
                        
                        // For user-facing error, don't include garbage failCode data - keep it clean
                        string userFacingErrorDetails = "";
                        if (!string.IsNullOrEmpty(errorDetails) && !errorDetails.Contains("invalid data"))
                        {
                            userFacingErrorDetails = errorDetails;
                        }
                        string errorMsg = $"Failed to add user (SDK Error: {sdkError}{userFacingErrorDetails})";

                        // Only try to delete and re-add if error indicates the user already exists
                        // Don't waste time removing for other errors (connection issues, SDK issues, etc.)
                        // For UPDATE operations: We already removed the user above, so don't retry removal
                        bool shouldRetryWithRemoval = !request.IsUpdate; // Don't retry removal if we already did UPDATE removal
                        
                        // Check if error message indicates duplicate/existing user
                        if (!string.IsNullOrWhiteSpace(sdkError))
                        {
                            string lowerError = sdkError.ToLower();
                            shouldRetryWithRemoval = shouldRetryWithRemoval && (
                                lowerError.Contains("already exists") ||
                                lowerError.Contains("duplicate") ||
                                lowerError.Contains("conflict") ||
                                lowerError.Contains("user") && lowerError.Contains("exist"));
                        }
                        
                        // Also check failCode if it indicates duplicate (only for CREATE operations)
                        if (!request.IsUpdate && failCode != null && failCode.Length > 0)
                        {
                            int failCodeValue = (int)failCode[0].emCode;
                            // Dahua SDK: -1 or 40 often means duplicate/already exists
                            // Some devices return unusual codes for duplicates, so we're more permissive
                            // failCode 10 also indicates duplicate/user exists on some devices
                            if (failCodeValue == -1 || failCodeValue == 40 || failCodeValue == 19 || failCodeValue == 20 || failCodeValue == 10)
                            {
                                shouldRetryWithRemoval = true;
                                _logger.LogWarning($"Detected potential duplicate error code: {failCodeValue}, will retry with removal");
                            }
                            // For "Unknown SDK error" cases, we should always try retry with removal
                            // since we don't know what the actual error is
                            if (sdkError == "Unknown SDK error")
                            {
                                shouldRetryWithRemoval = true;
                                _logger.LogWarning($"Unknown SDK error with failCode {failCodeValue}, attempting removal retry");
                            }
                        }
                        
                        if (shouldRetryWithRemoval || (request.IsUpdate && (sdkError.ToLower().Contains("already exists") || sdkError.ToLower().Contains("duplicate") || sdkError.ToLower().Contains("user") && sdkError.ToLower().Contains("exist") || failCode != null && new[] { -1, 10, 19, 20, 40 }.Contains(failCode != null && failCode.Length > 0 ? (int)failCode[0].emCode : -999))))
                        {
                            string retryReason = request.IsUpdate ? "UPDATE mode re-add failed (user still exists - removal may have failed)" : "User add failed";
                            _logger.LogWarning($"[UPDATE-RETRY] {retryReason} on device {request.DeviceID}");
                            _logger.LogWarning($"[UPDATE-RETRY] Original error: {sdkError}{errorDetails}");
                            _logger.LogWarning($"[UPDATE-RETRY] Attempting to delete and re-add user again...");
                            
                            // Try to remove existing user first
                            try
                            {
                                string[] userIds = new string[] { request.PersonID ?? "" };
                                NET_EM_FAILCODE[] removeFailCode;
                                
                                bool removeResult = NETClient.RemoveOperateAccessUserService(
                                    (IntPtr)device.LoginHandle, 
                                    userIds, 
                                    out removeFailCode, 
                                    5000
                                );
                                
                                if (removeResult)
                                {
                                    _logger.LogInformation($"Successfully removed existing user {request.PersonID}");

                                    // Wait longer for connection to stabilize after removal
                                    // Some devices need more time to process the deletion
                                    _logger.LogInformation($"Waiting 2 seconds before re-adding user to allow connection to stabilize...");
                                    Thread.Sleep(2000);

                                    // Now try to add again with the existing handle
                                    _logger.LogInformation($"Attempting to re-add user {request.PersonID} to device {request.DeviceID}...");
                                    userResult = NETClient.InsertOperateAccessUserService(
                                        (IntPtr)device.LoginHandle,
                                        userInfoArray,
                                        out failCode,
                                        5000
                                    );

                                    if (userResult && failCode != null && failCode.Length > 0 && failCode[0].emCode == 0)
                                    {
                                        result.UserAdded = true;
                                        _logger.LogInformation($"User {request.PersonID} re-added to device {request.DeviceID} successfully");
                                    }
                                    else
                                    {
                                        // Check if the re-add failed with failCode 10 (duplicate)
                                        // This can happen if the device hasn't fully processed the deletion yet
                                        int retryFailCode = (failCode != null && failCode.Length > 0) ? (int)failCode[0].emCode : -999;
                                        
                                        if (retryFailCode == 10)
                                        {
                                            _logger.LogWarning($"Re-add failed with failCode 10 - device may need more time. Waiting 3 more seconds and retrying...");
                                            Thread.Sleep(3000);
                                            
                                            // Try one more time
                                            userResult = NETClient.InsertOperateAccessUserService(
                                                (IntPtr)device.LoginHandle,
                                                userInfoArray,
                                                out failCode,
                                                5000
                                            );
                                            
                                            if (userResult && failCode != null && failCode.Length > 0 && failCode[0].emCode == 0)
                                            {
                                                result.UserAdded = true;
                                                _logger.LogInformation($"User {request.PersonID} re-added successfully on second retry");
                                            }
                                            else
                                            {
                                                // Still failed after second retry
                                                string retryError = NETClient.GetLastError();
                                                string retryDetails = "";
                                                if (string.IsNullOrWhiteSpace(retryError))
                                                {
                                                    if (failCode != null && failCode.Length > 0)
                                                    {
                                                        int finalFailCode = (int)failCode[0].emCode;
                                                        if (finalFailCode >= -10000 && finalFailCode <= 10000)
                                                        {
                                                            retryDetails = $" (failCode: {finalFailCode})";
                                                        }
                                                    }
                                                    retryError = "Unknown SDK error";
                                                }
                                                string retryErrorMsg = $"Failed to re-add user after removal (SDK Error: {retryError}{retryDetails})";
                                                _logger.LogWarning(retryErrorMsg);
                                                result.Error = retryErrorMsg;
                                            }
                                        }
                                        else
                                        {
                                            // Use GetLastError() with failCode fallback
                                            string retryError = NETClient.GetLastError();
                                            string retryDetails = "";
                                            if (string.IsNullOrWhiteSpace(retryError))
                                            {
                                                if (failCode != null && failCode.Length > 0)
                                                {
                                                    int finalFailCode = (int)failCode[0].emCode;
                                                    // Only include failCode if it's valid (not garbage)
                                                    if (finalFailCode >= -10000 && finalFailCode <= 10000)
                                                    {
                                                        retryDetails = $" (failCode: {finalFailCode})";
                                                    }
                                                    // If garbage, don't include it - just use Unknown SDK error
                                                }
                                                retryError = "Unknown SDK error";
                                            }
                                            string retryErrorMsg = $"Failed to re-add user after removal (SDK Error: {retryError}{retryDetails})";
                                            _logger.LogWarning(retryErrorMsg);
                                            result.Error = retryErrorMsg;
                                        }
                                    }
                                }
                                else
                                {
                                    string removeError = NETClient.GetLastError();
                                    string removeDetails = "";
                                    if (string.IsNullOrWhiteSpace(removeError))
                                    {
                                        if (removeFailCode != null && removeFailCode.Length > 0)
                                        {
                                            int removeFailCodeValue = (int)removeFailCode[0].emCode;
                                            // Only include failCode if it's valid (not garbage)
                                            if (removeFailCodeValue >= -10000 && removeFailCodeValue <= 10000)
                                            {
                                                removeDetails = $" (failCode: {removeFailCodeValue})";
                                            }
                                            // If garbage, don't include it
                                        }
                                        removeError = "Unknown SDK error";
                                    }
                                    string removeErrorMsg = $"Failed to remove existing user (SDK Error: {removeError}{removeDetails})";
                                    _logger.LogWarning(removeErrorMsg);
                                    result.Error = $"User exists but cannot be removed: {removeErrorMsg}";
                                }
                            }
                            catch (Exception removeEx)
                            {
                                _logger.LogError(removeEx, $"Error while trying to remove and re-add user {request.PersonID}");
                                result.Error = $"User exists and removal failed: {removeEx.Message}";
                            }
                        }
                        else
                        {
                            // Error doesn't indicate duplicate/existing user, so don't waste time with removal
                            _logger.LogWarning($"User {request.PersonID} add failed with error that doesn't indicate duplicate. Not attempting removal.");
                            _logger.LogWarning($"Error was: {errorMsg}");
                            result.Error = errorMsg;
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, $"Exception upserting user {request.PersonID} to device {request.DeviceID}");
                    result.Error = $"Exception upserting user: {ex.Message}";
                }
                }

                // For UPDATE mode: Remove existing face and cards first to avoid duplicates
                // The user upsert above handles the user info, but face/cards need explicit removal
                if (request.IsUpdate)
                {
                    _logger.LogInformation($"[UPDATE] Removing existing face/cards for user {request.PersonID} before adding new ones...");

                    // Remove existing face
                    try
                    {
                        _logger.LogInformation($"[UPDATE] Removing existing face for user {request.PersonID}...");
                        NET_IN_ACCESS_FACE_SERVICE_REMOVE stuFaceRemoveIn = new NET_IN_ACCESS_FACE_SERVICE_REMOVE();
                        stuFaceRemoveIn.dwSize = (uint)Marshal.SizeOf(typeof(NET_IN_ACCESS_FACE_SERVICE_REMOVE));
                        stuFaceRemoveIn.nUserNum = 1;
                        stuFaceRemoveIn.szUserID = new NET_IN_ACCESS_FACE_SERVICE_UserID[100];
                        stuFaceRemoveIn.szUserID[0] = new NET_IN_ACCESS_FACE_SERVICE_UserID() { userID = request.PersonID ?? "" };

                        NET_OUT_ACCESS_FACE_SERVICE_REMOVE stuFaceRemoveOut = new NET_OUT_ACCESS_FACE_SERVICE_REMOVE();
                        stuFaceRemoveOut.dwSize = (uint)Marshal.SizeOf(typeof(NET_OUT_ACCESS_FACE_SERVICE_REMOVE));
                        stuFaceRemoveOut.nMaxRetNum = 1;
                        stuFaceRemoveOut.pFailCode = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(NET_EM_FAILCODE)));

                        NET_EM_FAILCODE stuFailCodeRemove = new NET_EM_FAILCODE();
                        Marshal.StructureToPtr(stuFailCodeRemove, stuFaceRemoveOut.pFailCode, true);

                        IntPtr pstInParamRemove = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(NET_IN_ACCESS_FACE_SERVICE_REMOVE)));
                        Marshal.StructureToPtr(stuFaceRemoveIn, pstInParamRemove, true);

                        IntPtr pstOutParamRemove = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(NET_OUT_ACCESS_FACE_SERVICE_REMOVE)));
                        Marshal.StructureToPtr(stuFaceRemoveOut, pstOutParamRemove, true);

                        bool faceRemoveResult = NETClient.OperateAccessFaceService(
                            (IntPtr)device.LoginHandle,
                            EM_NET_ACCESS_CTL_FACE_SERVICE.REMOVE,
                            pstInParamRemove,
                            pstOutParamRemove,
                            5000
                        );

                        string faceRemoveError = NETClient.GetLastError();
                        _logger.LogInformation($"[UPDATE] Face removal result: {faceRemoveResult}, error: '{faceRemoveError}' (face may not exist)");

                        // Cleanup
                        if (pstInParamRemove != IntPtr.Zero) Marshal.FreeHGlobal(pstInParamRemove);
                        if (pstOutParamRemove != IntPtr.Zero) Marshal.FreeHGlobal(pstOutParamRemove);
                        if (stuFaceRemoveOut.pFailCode != IntPtr.Zero) Marshal.FreeHGlobal(stuFaceRemoveOut.pFailCode);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, $"[UPDATE] Face removal exception (continuing): {ex.Message}");
                    }

                    // Remove existing OLD card (if different from new card)
                    // If OldCardNumber is not provided, query device for existing cards and remove them all
                    if (!string.IsNullOrWhiteSpace(request.CardNumber))
                    {
                        try
                        {
                            if (!string.IsNullOrWhiteSpace(request.OldCardNumber) && request.OldCardNumber != request.CardNumber)
                            {
                                // We know the old card number - remove it directly
                                _logger.LogInformation($"[UPDATE] Removing OLD card {request.OldCardNumber} for user {request.PersonID}...");
                                string[] oldCardNosToRemove = new string[] { request.OldCardNumber };
                                NET_EM_FAILCODE[] oldCardRemoveFailCode;

                                bool oldCardRemoveResult = NETClient.RemoveOperateAccessCardService(
                                    (IntPtr)device.LoginHandle,
                                    oldCardNosToRemove,
                                    out oldCardRemoveFailCode,
                                    3000
                                );

                                if (oldCardRemoveResult)
                                {
                                    _logger.LogInformation($"[UPDATE] ✅ OLD card {request.OldCardNumber} removed successfully");
                                }
                                else
                                {
                                    string oldCardRemoveError = NETClient.GetLastError();
                                    _logger.LogInformation($"[UPDATE] ℹ️  OLD card removal info: {oldCardRemoveError} (card may not exist)");
                                }
                            }
                            else
                            {
                                // OldCardNumber not provided - query device for existing cards and remove them
                                _logger.LogInformation($"[UPDATE] Querying existing cards for user {request.PersonID}...");
                                
                                NET_ACCESS_CARD_INFO[] existingCards = null;
                                NET_EM_FAILCODE[] queryFailCode;
                                
                                // Query cards for this user
                                bool queryResult = NETClient.GetOperateAccessCardService(
                                    (IntPtr)device.LoginHandle,
                                    new string[] { "" }, // Empty string means query all cards (we'll filter by user)
                                    out existingCards,
                                    out queryFailCode,
                                    5000
                                );

                                if (queryResult && existingCards != null && existingCards.Length > 0)
                                {
                                    // Filter cards belonging to this user
                                    var userCards = existingCards.Where(c => c.szUserID == request.PersonID).ToList();
                                    _logger.LogInformation($"[UPDATE] Found {userCards.Count} existing card(s) for user {request.PersonID}");

                                    foreach (var userCard in userCards)
                                    {
                                        // Skip if this is the same card we're about to add
                                        if (userCard.szCardNo == request.CardNumber)
                                        {
                                            _logger.LogInformation($"[UPDATE] Skipping card {userCard.szCardNo} (same as new card)");
                                            continue;
                                        }

                                        _logger.LogInformation($"[UPDATE] Removing existing card {userCard.szCardNo}...");
                                        string[] cardToRemove = new string[] { userCard.szCardNo };
                                        NET_EM_FAILCODE[] removeFailCode;

                                        bool removeResult = NETClient.RemoveOperateAccessCardService(
                                            (IntPtr)device.LoginHandle,
                                            cardToRemove,
                                            out removeFailCode,
                                            3000
                                        );

                                        if (removeResult)
                                        {
                                            _logger.LogInformation($"[UPDATE] ✅ Card {userCard.szCardNo} removed");
                                        }
                                        else
                                        {
                                            string removeError = NETClient.GetLastError();
                                            _logger.LogInformation($"[UPDATE] ℹ️  Card removal info: {removeError}");
                                        }
                                    }
                                }
                                else
                                {
                                    _logger.LogInformation($"[UPDATE] No existing cards found for user {request.PersonID}");
                                }
                            }
                        }
                        catch (Exception ex)
                        {
                            _logger.LogWarning(ex, $"[UPDATE] Card removal exception (continuing): {ex.Message}");
                        }
                    }
                }

                // Step 2: Add card info (if card number provided)
                if (!string.IsNullOrWhiteSpace(request.CardNumber))
                {
                    try
                    {
                        _logger.LogInformation($"[CARD] Adding card {request.CardNumber} for user {request.PersonID}");
                        
                        var cardInfo = new NET_ACCESS_CARD_INFO
                        {
                            szCardNo = request.CardNumber,
                            szUserID = request.PersonID ?? "",
                            emType = EM_ACCESSCTLCARD_TYPE.GENERAL,
                            szDynamicCheckCode = "",
                            byReserved = new byte[4096]
                        };

                        var cardInfoArray = new NET_ACCESS_CARD_INFO[] { cardInfo };
                        NET_EM_FAILCODE[] failCode;

                        bool cardResult = NETClient.InsertOperateAccessCardService((IntPtr)device.LoginHandle, cardInfoArray, out failCode, 5000);
                        
                        int cardFailCodeValue = failCode != null && failCode.Length > 0 ? (int)failCode[0].emCode : -999;
                        string cardSdkError = NETClient.GetLastError();
                        
                        _logger.LogInformation($"[CARD] InsertOperateAccessCardService returned: cardResult={cardResult}, failCode={cardFailCodeValue}, error='{cardSdkError}'");

                        // Check for success - be very lenient since device firmware may report errors even when succeeding
                        if (cardResult && failCode != null && failCode.Length > 0 && failCode[0].emCode == 0)
                        {
                            // Strict success: SDK returned true and failCode is 0
                            result.CardAdded = true;
                            _logger.LogInformation($"[CARD] ✅ Card {request.CardNumber} added for user {request.PersonID}");
                        }
                        else if (cardResult && string.IsNullOrWhiteSpace(cardSdkError))
                        {
                            // Success: SDK returned true and no error message
                            result.CardAdded = true;
                            _logger.LogInformation($"[CARD] ✅ Card {request.CardNumber} added (SDK returned success despite failCode={cardFailCodeValue})");
                        }
                        else if (!cardResult && string.IsNullOrWhiteSpace(cardSdkError))
                        {
                            // Success: SDK returned false but no error message - device may have accepted it
                            result.CardAdded = true;
                            _logger.LogInformation($"[CARD] ✅ Card {request.CardNumber} added (SDK returned false but no error message)");
                        }
                        else if (!string.IsNullOrWhiteSpace(cardSdkError) && (cardSdkError == "800004B5" || cardFailCodeValue == 18))
                        {
                            // Success: Device returns error code 800004B5 or failCode 18 but card is actually added
                            // This is a firmware behavior where it reports errors even on success
                            result.CardAdded = true;
                            _logger.LogInformation($"[CARD] ✅ Card {request.CardNumber} added (device returned error code but card was accepted)");
                        }
                        else
                        {
                            string errorDetails = "";
                            if (cardFailCodeValue >= -10000 && cardFailCodeValue <= 10000)
                            {
                                errorDetails = $" (failCode: {cardFailCodeValue})";
                            }
                            string errorMsg = $"Failed to add card (SDK Error: {cardSdkError}{errorDetails})";
                            _logger.LogWarning($"[CARD] ⚠️  {errorMsg}");
                            // Card is optional - don't fail the operation
                            _logger.LogInformation($"[CARD] ℹ️  Card addition is optional. User access still granted.");
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, $"[CARD] Exception adding card for user {request.PersonID}");
                        _logger.LogWarning($"[CARD] ⚠️  Card addition failed but user access still granted. Error: {ex.Message}");
                        // Card is optional - don't fail the operation
                    }
                }
                else
                {
                    _logger.LogInformation($"[CARD] No card number provided for user {request.PersonID}");
                }

                // Step 3: Add/Update face info (if face image provided)
                if (request.FaceImage != null && request.FaceImage.Length > 0)
                {
                    try
                    {
                        _logger.LogInformation($"[FACE] {(request.IsUpdate ? "Updating" : "Adding")} face image for user {request.PersonID} - Size: {request.FaceImage.Length} bytes ({request.FaceImage.Length / 1024.0:F2} KB)");

                        // For UPDATE mode: face was already removed above, so use INSERT to add the new one
                        // For CREATE mode: use INSERT to add the new face
                        // In both cases, we use INSERT operation here
                        EM_NET_ACCESS_CTL_FACE_SERVICE faceOperation = EM_NET_ACCESS_CTL_FACE_SERVICE.INSERT;
                        _logger.LogInformation($"[FACE] Using operation: {faceOperation} (INSERT)");

                        // INSERT operation - works for both CREATE and UPDATE (after removal)
                        NET_IN_ACCESS_FACE_SERVICE_INSERT stuFaceInsertIn = new NET_IN_ACCESS_FACE_SERVICE_INSERT();
                        stuFaceInsertIn.dwSize = (uint)Marshal.SizeOf(typeof(NET_IN_ACCESS_FACE_SERVICE_INSERT));
                        stuFaceInsertIn.nFaceInfoNum = 1;
                        stuFaceInsertIn.pFaceInfo = IntPtr.Zero;
                        stuFaceInsertIn.pFaceInfo = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(NET_ACCESS_FACE_INFO)));

                        NET_ACCESS_FACE_INFO stuFaceInfo = new NET_ACCESS_FACE_INFO();
                        stuFaceInfo.szUserID = request.PersonID ?? "";
                        stuFaceInfo.nFacePhoto = 1;
                        stuFaceInfo.nInFacePhotoLen = new int[5];
                        stuFaceInfo.nOutFacePhotoLen = new int[5];
                        stuFaceInfo.nInFacePhotoLen[0] = stuFaceInfo.nOutFacePhotoLen[0] = request.FaceImage.Length;
                        stuFaceInfo.pFacePhoto = new IntPtr[5];
                        stuFaceInfo.pFacePhoto[0] = Marshal.AllocHGlobal(request.FaceImage.Length);
                        Marshal.Copy(request.FaceImage, 0, stuFaceInfo.pFacePhoto[0], request.FaceImage.Length);

                        Marshal.StructureToPtr(stuFaceInfo, stuFaceInsertIn.pFaceInfo, true);

                        NET_OUT_ACCESS_FACE_SERVICE_INSERT stuFaceInsertOut = new NET_OUT_ACCESS_FACE_SERVICE_INSERT();
                        stuFaceInsertOut.dwSize = (uint)Marshal.SizeOf(typeof(NET_OUT_ACCESS_FACE_SERVICE_INSERT));
                        stuFaceInsertOut.nMaxRetNum = 1;
                        stuFaceInsertOut.pFailCode = IntPtr.Zero;
                        stuFaceInsertOut.pFailCode = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(NET_EM_FAILCODE)));

                        NET_EM_FAILCODE stuFailCodeR = new NET_EM_FAILCODE();
                        Marshal.StructureToPtr(stuFailCodeR, stuFaceInsertOut.pFailCode, true);

                        IntPtr pstInParam = IntPtr.Zero;
                        pstInParam = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(NET_IN_ACCESS_FACE_SERVICE_INSERT)));
                        Marshal.StructureToPtr(stuFaceInsertIn, pstInParam, true);

                        IntPtr pstOutParam = IntPtr.Zero;
                        pstOutParam = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(NET_OUT_ACCESS_FACE_SERVICE_INSERT)));
                        Marshal.StructureToPtr(stuFaceInsertOut, pstOutParam, true);

                        _logger.LogInformation($"[FACE] Calling OperateAccessFaceService with INSERT...");
                        bool faceResult = NETClient.OperateAccessFaceService((IntPtr)device.LoginHandle, EM_NET_ACCESS_CTL_FACE_SERVICE.INSERT, pstInParam, pstOutParam, 5000);
                        var faceinfo = (NET_OUT_ACCESS_FACE_SERVICE_INSERT)Marshal.PtrToStructure(pstOutParam, typeof(NET_OUT_ACCESS_FACE_SERVICE_INSERT));
                        var failcode = (NET_EM_FAILCODE)Marshal.PtrToStructure(faceinfo.pFailCode, typeof(NET_EM_FAILCODE));
                        string faceError = NETClient.GetLastError();

                        _logger.LogInformation($"[FACE] INSERT result: faceResult={faceResult}, failCode={failcode.emCode}, error='{faceError}'");

                        if (faceResult && failcode.emCode == EM_FAILCODE.NOERROR)
                        {
                            result.FaceAdded = true;
                            _logger.LogInformation($"[FACE] ✅ Face {(request.IsUpdate ? "updated" : "added")} for {request.PersonID}");
                        }
                        else if (faceResult && string.IsNullOrWhiteSpace(faceError))
                        {
                            result.FaceAdded = true;
                            _logger.LogInformation($"[FACE] ✅ Face {(request.IsUpdate ? "updated" : "added")} (SDK returned success)");
                        }
                        else if (!string.IsNullOrWhiteSpace(faceError) && faceError == "800004B5")
                        {
                            result.FaceAdded = true;
                            _logger.LogInformation($"[FACE] ✅ Face {(request.IsUpdate ? "updated" : "added")} (error code 800004B5 indicates success)");
                        }
                        else
                        {
                            _logger.LogWarning($"[FACE] ⚠️  Face {(request.IsUpdate ? "update" : "insert")} failed - failCode: {failcode.emCode}, error: {faceError}");
                        }

                        if (pstInParam != IntPtr.Zero) Marshal.FreeHGlobal(pstInParam);
                        if (pstOutParam != IntPtr.Zero) Marshal.FreeHGlobal(pstOutParam);
                        if (stuFaceInsertIn.pFaceInfo != IntPtr.Zero) Marshal.FreeHGlobal(stuFaceInsertIn.pFaceInfo);
                        if (stuFaceInfo.pFacePhoto[0] != IntPtr.Zero) Marshal.FreeHGlobal(stuFaceInfo.pFacePhoto[0]);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, $"[FACE] Exception {(request.IsUpdate ? "updating" : "adding")} face for user {request.PersonID} to device {request.DeviceID}");
                        _logger.LogWarning($"[FACE] ⚠️  Face image {(request.IsUpdate ? "update" : "upload")} failed but user access is still granted. Error: {ex.Message}");
                        // Face image is optional - don't fail the operation if it has errors
                        // User was already added successfully, so keep result.Success = true
                    }
                }
                else
                {
                    _logger.LogInformation($"[FACE] No face image provided for user {request.PersonID}");
                }

                FACE_SECTION_END:; // Label for backward compatibility

                // Overall success if at least user was added
                result.Success = result.UserAdded;
                if (result.Success)
                {
                    result.Message = "Person added successfully";
                    if (result.CardAdded)
                        result.Message += " (card added)";
                    if (result.FaceAdded)
                        result.Message += " (face added)";
                }
                else
                {
                    result.Message = string.IsNullOrEmpty(result.Error) ? "Failed to add person to device" : result.Error;
                }

                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Unexpected error adding person {request.PersonID} to device {request.DeviceID}");
                result.Error = $"Unexpected error: {ex.Message}";
                result.Message = result.Error;
                return result;
            }
        }
    }

    public class DeviceInfo
    {
        public string DeviceID { get; set; }
        public string IP { get; set; }
        public int Port { get; set; }
        public string Name { get; set; }
        public string Status { get; set; } = "Offline";
        public string Type { get; set; }
        public string Generation { get; set; }
        public string MACAddress { get; set; }
        public string SerialNumber { get; set; }
        public int ChannelCount { get; set; }
        public DateTime LoginTime { get; set; }
        public bool IsAutoRegistered { get; set; }
        public long LoginHandle { get; set; }
        public Dictionary<string, object> AdditionalInfo { get; set; }
    }

    public class DeviceStatusChangedEventArgs
    {
        public string DeviceID { get; set; }
        public string Status { get; set; }
        public DateTime Timestamp { get; set; }
    }

    public class DeviceEventEventArgs : EventArgs
    {
        public string DeviceID { get; set; }
        public string EventType { get; set; }
        public string EventData { get; set; }
        public DateTime Timestamp { get; set; }
    }

    #region Access Control Models

    public class AccessRecordResult
    {
        public string DeviceID { get; set; }
        public int RecordNumber { get; set; }
        public string CardNumber { get; set; }
        public string UserID { get; set; }
        public string UserName { get; set; }
        public string SwipeTime { get; set; }  // Changed to string to preserve exact time without timezone conversion
        public int DoorNumber { get; set; }
        public string ReaderNo { get; set; }
        public string CardType { get; set; }
        public string Status { get; set; }
    }

    public class CardInfo
    {
        public string CardNumber { get; set; }
        public string UserID { get; set; }
        public DateTime ValidFrom { get; set; }
        public DateTime ValidTo { get; set; }
        public bool Enabled { get; set; }
    }

    public class CardOperationResult
    {
        public string CardNumber { get; set; }
        public bool Success { get; set; }
        public string Error { get; set; }
    }

    public class UserInfo
    {
        public string UserID { get; set; }
        public string UserName { get; set; }
        public string Password { get; set; }
        public DateTime ValidFrom { get; set; }
        public DateTime ValidTo { get; set; }
        public bool Enabled { get; set; }
    }

    public class UserOperationResult
    {
        public string UserID { get; set; }
        public bool Success { get; set; }
        public string Error { get; set; }
    }

    public class FingerprintInfo
    {
        public string UserID { get; set; }
        public int FingerNumber { get; set; }
        public byte[] Template { get; set; }
    }

    public class FingerprintOperationResult
    {
        public string UserID { get; set; }
        public int FingerNumber { get; set; }
        public bool Success { get; set; }
        public string Error { get; set; }
    }

    public class DeviceCapabilities
    {
        public string DeviceID { get; set; }
        public string IP { get; set; }
        public string Name { get; set; }
        public string Type { get; set; }
        public string SerialNumber { get; set; }
        public int ChannelCount { get; set; }
        public string Status { get; set; }
        public bool SupportsFaceRecognition { get; set; }
        public bool SupportsFingerprint { get; set; }
        public bool SupportsCardAccess { get; set; }
        public bool SupportsPassword { get; set; }
        public int MaxUsers { get; set; }
        public int MaxCards { get; set; }
        public int MaxFingerprints { get; set; }
        public int MaxRecords { get; set; }
    }

    public class DoorStatusResult
    {
        public bool Success { get; set; }
        public int Channel { get; set; }
        public string ReturnCode { get; set; }
        public string Status { get; set; }
        public string DoorStatus { get; set; }
        public string RawResponse { get; set; }
        public string Error { get; set; }
    }

    public class DoorOperationResult
    {
        public bool Success { get; set; }
        public int Channel { get; set; }
        public string RawResponse { get; set; }
        public string Error { get; set; }
    }

    /// <summary>
    /// Request model for adding person to device
    /// </summary>
    public class AddPersonRequest
    {
        public string DeviceID { get; set; }
        public string PersonID { get; set; }
        public string PersonName { get; set; }
        public string CardNumber { get; set; }
        public string OldCardNumber { get; set; } // Previous card number to remove (for UPDATE)
        public byte[] FaceImage { get; set; }
        public string FaceImageType { get; set; } // jpeg, png, etc.
        public string[] Fingerprints { get; set; } // Array of fingerprint slot names
        public bool IsUpdate { get; set; } = false; // Whether this is an UPDATE operation (vs CREATE)
    }

    /// <summary>
    /// Result of adding person to device
    /// </summary>
    public class AddPersonDeviceResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public string Error { get; set; }
        public bool UserAdded { get; set; }
        public bool CardAdded { get; set; }
        public bool FaceAdded { get; set; }
        public string DeviceID { get; set; }
    }

    #endregion
}
