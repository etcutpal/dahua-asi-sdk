/****************************************************************************************************************************
 * Access Control Events Module - Real-time Face/Card/Fingerprint Event Subscription
 * 
 * PURPOSE:
 * Subscribes to access control devices using SDK's RealLoadPicture API to receive
 * real-time unlock events (face recognition, card swipe, fingerprint) with snapshot images.
 * 
 * ARCHITECTURE:
 * 1. After device login → Call SubscribeToDeviceEvents()
 * 2. SDK calls fAnalyzerDataCallBack → Parse NET_DEV_EVENT_ACCESS_CTL_INFO
 * 3. Extract event details (card number, user ID, open method, success status, images)
 * 4. Send structured event data to backend webhook
 * 5. On device disconnect → Call UnsubscribeFromDeviceEvents()
 * 
 * USAGE:
 * var module = new AccessControlEventsModule(logger, httpClient, webhookUrl);
 * await module.SubscribeToDeviceEvents(deviceId, loginHandle, deviceIP);
 * 
 * BASED ON:
 * - FaceOpenDoorDemo from official NetSDK
 * - Section 4.11 of Access Control API Guide (Subscribing for Events)
 * - Section 5.6 (Unlocking Records Format)
 ***************************************************************************************************************************/

using System;
using System.Collections.Concurrent;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using NetSDKCS;

#nullable disable

namespace NetSDKBridge.Modules
{
    /// <summary>
    /// Module for subscribing to and processing real-time access control events
    /// </summary>
    public class AccessControlEventsModule : IDisposable
    {
        private readonly ILogger<AccessControlEventsModule> _logger;
        private readonly HttpClient _httpClient;
        private readonly string _backendWebhookUrl;
        private readonly string _backendAccessEventsUrl;

        // Track active event subscriptions: deviceId -> analyzer handle
        private readonly ConcurrentDictionary<string, IntPtr> _activeSubscriptions = new();

        // Callback delegate (must be kept alive to prevent GC)
        private fAnalyzerDataCallBack _analyzerCallback;

        public AccessControlEventsModule(ILogger<AccessControlEventsModule> logger, HttpClient httpClient, string backendWebhookUrl)
        {
            _logger = logger;
            _httpClient = httpClient;
            _backendWebhookUrl = backendWebhookUrl;
            
            // Derive access events URL from webhook URL (replace /device-status with /access-events)
            if (!string.IsNullOrEmpty(backendWebhookUrl))
            {
                _backendAccessEventsUrl = backendWebhookUrl.Replace("/device-status", "/access-events");
            }
            
            _analyzerCallback = AnalyzerDataCallBack;
        }

        /// <summary>
        /// Subscribe to access control events for a specific device
        /// Must be called AFTER successful device login
        /// </summary>
        /// <param name="deviceId">Device identifier (Registration ID)</param>
        /// <param name="loginHandle">NetSDK login handle for the device</param>
        /// <param name="deviceIP">Device IP address</param>
        public async Task<bool> SubscribeToDeviceEvents(string deviceId, long loginHandle, string deviceIP)
        {
            try
            {
                // Check if already subscribed
                if (_activeSubscriptions.ContainsKey(deviceId))
                {
                    _logger.LogWarning($"Device {deviceId} already subscribed to events");
                    return true;
                }

                _logger.LogInformation($"📡 Subscribing to access control events for device: {deviceId}");
                _logger.LogInformation($"   Device IP: {deviceIP}");
                _logger.LogInformation($"   Login Handle: {loginHandle}");

                // Subscribe to intelligent events using RealLoadPicture
                // dwAlarmType = EM_EVENT_IVS_TYPE.ACCESS_CTL (0x00000204)
                // bNeedPicFile = true (we want snapshot images)
                IntPtr analyzerHandle = NETClient.RealLoadPicture(
                    (IntPtr)loginHandle,
                    0, // Channel 0 (default for access control)
                    (uint)EM_EVENT_IVS_TYPE.ACCESS_CTL,
                    true, // Request snapshot images
                    _analyzerCallback,
                    IntPtr.Zero,
                    IntPtr.Zero
                );

                if (analyzerHandle == IntPtr.Zero)
                {
                    var errorCode = NETClient.GetLastError();
                    _logger.LogError($"❌ Failed to subscribe to events for device {deviceId}: {errorCode}");
                    return false;
                }

                _activeSubscriptions[deviceId] = analyzerHandle;

                _logger.LogInformation($"✅ Successfully subscribed to access control events for device: {deviceId}");
                _logger.LogInformation($"   Analyzer Handle: {analyzerHandle}");
                _logger.LogInformation($"   Event Type: ACCESS_CTL (Face/Card/Fingerprint events)");
                _logger.LogInformation($"   Snapshots: Enabled");

                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error subscribing to events for device {deviceId}");
                return false;
            }
        }

        /// <summary>
        /// Unsubscribe from events for a specific device
        /// Called when device disconnects or is removed
        /// </summary>
        public void UnsubscribeFromDeviceEvents(string deviceId)
        {
            if (_activeSubscriptions.TryRemove(deviceId, out IntPtr analyzerHandle))
            {
                try
                {
                    bool result = NETClient.StopLoadPic(analyzerHandle);
                    if (result)
                    {
                        _logger.LogInformation($"Stopped event subscription for device: {deviceId}");
                    }
                    else
                    {
                        _logger.LogWarning($"Failed to stop event subscription for device: {deviceId}");
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, $"Error unsubscribing device {deviceId} from events");
                }
            }
        }

        /// <summary>
        /// Unsubscribe from all device events (called during shutdown)
        /// </summary>
        public void UnsubscribeAll()
        {
            foreach (var deviceId in _activeSubscriptions.Keys)
            {
                UnsubscribeFromDeviceEvents(deviceId);
            }
            _activeSubscriptions.Clear();
        }

        /// <summary>
        /// Callback invoked by SDK when an access control event occurs
        /// This is called synchronously by the SDK, so we process asynchronously
        /// </summary>
        private int AnalyzerDataCallBack(IntPtr lAnalyzerHandle, uint dwEventType, IntPtr pEventInfo,
            IntPtr pBuffer, uint dwBufSize, IntPtr dwUser, int nSequence, IntPtr reserved)
        {
            try
            {
                EM_EVENT_IVS_TYPE eventType = (EM_EVENT_IVS_TYPE)dwEventType;

                // LOG ALL EVENT TYPES FOR DEBUGGING
                _logger.LogInformation("🔔 [SDK] CALLBACK FIRED - Event Type: {eventType} (0x{eventType:X}), Analyzer Handle: {analyzerHandle}", 
                    eventType, dwEventType, lAnalyzerHandle);

                if (eventType == EM_EVENT_IVS_TYPE.ACCESS_CTL)
                {
                    // Parse the access control event data
                    var accessInfo = (NET_DEV_EVENT_ACCESS_CTL_INFO)Marshal.PtrToStructure(
                        pEventInfo, 
                        typeof(NET_DEV_EVENT_ACCESS_CTL_INFO)
                    );

                    // Extract event details (pass pBuffer and dwBufSize for image extraction)
                    var eventData = ParseAccessControlEvent(accessInfo, pBuffer, dwBufSize);
                    
                    // Find which device this event belongs to
                    string deviceId = FindDeviceByAnalyzerHandle(lAnalyzerHandle);

                    // Log the event
                    _logger.LogInformation("=".PadRight(70, '='));
                    _logger.LogInformation("🚪 ACCESS CONTROL EVENT RECEIVED");
                    _logger.LogInformation("=".PadRight(70, '='));
                    _logger.LogInformation($"   Device ID: {deviceId}");
                    _logger.LogInformation($"   Event Type: {eventData.OpenMethod}");
                    _logger.LogInformation($"   User ID: {eventData.UserID}");
                    _logger.LogInformation($"   Card Number: {eventData.CardNumber}");
                    _logger.LogInformation($"   Card Name: {eventData.CardName}");
                    _logger.LogInformation($"   Status: {(eventData.IsSuccess ? "✅ SUCCESS" : "❌ FAILED")}");
                    _logger.LogInformation($"   Door: {eventData.Door}");
                    _logger.LogInformation($"   Timestamp (UTC): {eventData.Timestamp}");
                    
                    if (accessInfo.bManTemperature)
                    {
                        _logger.LogInformation($"   Temperature: {accessInfo.stuManTemperatureInfo.fCurrentTemperature}°C");
                        _logger.LogInformation($"   Over Temperature: {accessInfo.stuManTemperatureInfo.bIsOverTemperature}");
                    }
                    
                    if (eventData.HasSnapshotImage)
                    {
                        _logger.LogInformation($"   Snapshot Image: {eventData.SnapshotImageSize} bytes");
                    }
                    
                    _logger.LogInformation("=".PadRight(70, '='));

                    // Send to backend webhook (fire-and-forget)
                    _ = SendEventToBackendAsync(deviceId, eventData);

                    // Trigger local event for real-time processing
                    AccessControlEventReceived?.Invoke(this, new AccessControlEventArgs
                    {
                        DeviceID = deviceId,
                        EventData = eventData
                    });
                }
                else
                {
                    _logger.LogDebug($"Received non-access-control event: {eventType}");
                }

                return 0;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in AnalyzerDataCallBack");
                return 0;
            }
        }

        /// <summary>
        /// Parse NET_DEV_EVENT_ACCESS_CTL_INFO into a structured event object
        /// </summary>
        private AccessControlEventData ParseAccessControlEvent(NET_DEV_EVENT_ACCESS_CTL_INFO info, IntPtr pBuffer, uint dwBufSize)
        {
            var eventData = new AccessControlEventData
            {
                Timestamp = info.UTC.ToDateTime().ToString("yyyy-MM-dd HH:mm:ss"),
                UserID = info.szUserID ?? "",
                CardNumber = info.szCardNo ?? "",
                CardName = info.szCardName ?? "",
                Door = info.nChannelID,
                ReaderID = info.szReaderID ?? "",
                IsSuccess = info.bStatus,
                ErrorCode = info.nErrorCode,
                HasSnapshotImage = pBuffer != IntPtr.Zero && dwBufSize > 0
            };

            // Determine open method (face/card/fingerprint/etc)
            eventData.OpenMethod = info.emOpenMethod switch
            {
                EM_ACCESS_DOOROPEN_METHOD.PWD_ONLY => "Password",
                EM_ACCESS_DOOROPEN_METHOD.CARD => "Card",
                EM_ACCESS_DOOROPEN_METHOD.FINGERPRINT => "Fingerprint",
                EM_ACCESS_DOOROPEN_METHOD.FACE_RECOGNITION => "Face",
                EM_ACCESS_DOOROPEN_METHOD.CARD_AND_FACE => "Card+Face",
                EM_ACCESS_DOOROPEN_METHOD.CARD_FINGERPRINT => "Card+Fingerprint",
                EM_ACCESS_DOOROPEN_METHOD.FINGERPRINT_AND_FACE => "Face+Fingerprint",
                EM_ACCESS_DOOROPEN_METHOD.PWD_CARD_FINGERPRINT => "Password+Card+Fingerprint",
                EM_ACCESS_DOOROPEN_METHOD.REMOTE => "Remote",
                EM_ACCESS_DOOROPEN_METHOD.BUTTON => "LocalButton",
                EM_ACCESS_DOOROPEN_METHOD.QRCODE => "QRCode",
                EM_ACCESS_DOOROPEN_METHOD.BLUETOOTH => "Bluetooth",
                _ => $"Unknown({(int)info.emOpenMethod})"
            };

            // Extract snapshot image from pBuffer (if available)
            if (eventData.HasSnapshotImage)
            {
                byte[] imageBytes = new byte[dwBufSize];
                Marshal.Copy(pBuffer, imageBytes, 0, (int)dwBufSize);
                eventData.SnapshotImage = imageBytes;
                eventData.SnapshotImageSize = imageBytes.Length;
                
                // Determine image type from metadata (if available)
                if (info.nImageInfoCount > 0 && info.stuImageInfo != null)
                {
                    var firstImage = info.stuImageInfo[0];
                    eventData.SnapshotImageType = firstImage.emType switch
                    {
                        EM_ACCESS_CTL_IMAGE_TYPE.LOCAL => "LocalFaceDB",
                        EM_ACCESS_CTL_IMAGE_TYPE.SCENE => "Scene",
                        EM_ACCESS_CTL_IMAGE_TYPE.FACE => "Face",
                        EM_ACCESS_CTL_IMAGE_TYPE.INFRARED => "Infrared",
                        _ => $"Type{(int)firstImage.emType}"
                    };
                }
            }

            return eventData;
        }

        /// <summary>
        /// Send access control event to backend webhook
        /// </summary>
        private async Task SendEventToBackendAsync(string deviceId, AccessControlEventData eventData)
        {
            if (string.IsNullOrEmpty(_backendAccessEventsUrl))
            {
                _logger.LogWarning("Backend access events URL not configured, skipping event forwarding");
                return;
            }

            try
            {
                // Create JSON payload
                var payload = new
                {
                    type = "access_control_event",
                    deviceId = deviceId,
                    timestamp = eventData.Timestamp,
                    data = new
                    {
                        eventType = eventData.OpenMethod,
                        userId = eventData.UserID,
                        cardNumber = eventData.CardNumber,
                        cardName = eventData.CardName,
                        isSuccess = eventData.IsSuccess,
                        door = eventData.Door,
                        readerId = eventData.ReaderID,
                        errorCode = eventData.ErrorCode,
                        temperature = eventData.Temperature,
                        hasSnapshot = eventData.HasSnapshotImage,
                        snapshotSize = eventData.SnapshotImageSize
                    }
                };

                var json = JsonSerializer.Serialize(payload, new JsonSerializerOptions
                {
                    WriteIndented = false
                });

                var content = new StringContent(json, Encoding.UTF8, "application/json");
                
                _logger.LogInformation($"📡 Sending access event to backend: {_backendAccessEventsUrl}");
                var response = await _httpClient.PostAsync(_backendAccessEventsUrl, content);

                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogWarning($"Webhook failed for device {deviceId}: HTTP {response.StatusCode}");
                    var responseBody = await response.Content.ReadAsStringAsync();
                    _logger.LogWarning($"Response: {responseBody}");
                }
                else
                {
                    _logger.LogInformation($"✅ Event sent to backend for device: {deviceId}");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error sending event to backend for device {deviceId}");
            }
        }

        /// <summary>
        /// Find device ID by analyzer handle
        /// </summary>
        private string FindDeviceByAnalyzerHandle(IntPtr analyzerHandle)
        {
            foreach (var kvp in _activeSubscriptions)
            {
                if (kvp.Value == analyzerHandle)
                {
                    return kvp.Key;
                }
            }
            return "Unknown";
        }

        /// <summary>
        /// Event raised when an access control event is received
        /// </summary>
        public event EventHandler<AccessControlEventArgs> AccessControlEventReceived;

        /// <summary>
        /// Dispose resources
        /// </summary>
        public void Dispose()
        {
            UnsubscribeAll();
        }
    }

    /// <summary>
    /// Structured access control event data (shared between SDK and CGI modules)
    /// </summary>
    public class AccessControlEventData
    {
        public string Timestamp { get; set; }
        public string UserID { get; set; }
        public string CardNumber { get; set; }
        public string CardName { get; set; }
        public string OpenMethod { get; set; } // Face, Card, Fingerprint, Password, etc.
        public string EventType { get; set; } // Entry/Exit (CGI only)
        public bool IsSuccess { get; set; }
        public int Door { get; set; }
        public string ReaderID { get; set; }
        public int ErrorCode { get; set; }
        public float? Temperature { get; set; }
        public bool IsOverTemperature { get; set; } // Temperature alarm flag (CGI only)
        public bool HasSnapshotImage { get; set; }
        public byte[] SnapshotImage { get; set; }
        public int SnapshotImageSize { get; set; }
        public string SnapshotImageType { get; set; }
        public string SnapshotUrl { get; set; } // URL from device before download (CGI only)
    }

    /// <summary>
    /// Event arguments for access control events
    /// </summary>
    public class AccessControlEventArgs : EventArgs
    {
        public string DeviceID { get; set; }
        public AccessControlEventData EventData { get; set; }
    }
}
