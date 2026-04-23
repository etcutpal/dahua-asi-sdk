/****************************************************************************************************************************
 * Access Control Events Module - SDK Native Alarm Subscription (StartListen Method)
 *
 * PURPOSE:
 * Subscribes to access control devices using SDK's StartListen API to receive
 * real-time alarm events (face recognition, card swipe, fingerprint, door status, etc.)
 * This method works with auto-registration (no direct IP access needed).
 *
 * ARCHITECTURE:
 * 1. After device login → Call NETClient.StartListen(loginHandle)
 * 2. SDK calls MessageCallback (fMessCallBackEx) → Route to this module
 * 3. Parse alarm event structs (NET_ALARM_ACCESS_CTL_EVENT_INFO, etc.)
 * 4. Extract event details (card number, user ID, open method, success status)
 * 5. Send structured event data to backend webhook
 * 6. On device disconnect → Call NETClient.StopListen(loginHandle)
 *
 * USAGE:
 * var module = new AccessControlEventsSdkModule(logger, httpClient, webhookUrl);
 * await module.StartListen(deviceId, loginHandle);
 * // In SDKBridgeService.MessageCallback:
 * module.HandleAlarmEvent(lCommand, lLoginID, pBuf, dwBufLen, pchDVRIP, nDVRPort);
 *
 * BASED ON:
 * - AccessDemo2s/AccessForm.cs (lines 171-443, 663-692)
 * - Official Dahua NetSDK AutoRegister demo
 * - Section 4.10 of Access Control API Guide (Alarm Subscription)
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
    /// Module for subscribing to and processing real-time access control alarm events via SDK StartListen
    /// </summary>
    public class AccessControlEventsSdkModule : IDisposable
    {
        private readonly ILogger<AccessControlEventsSdkModule> _logger;
        private readonly HttpClient _httpClient;
        private readonly string _backendWebhookUrl;
        private readonly string _backendAccessEventsUrl;

        // Track active StartListen subscriptions: deviceId -> loginHandle
        private readonly ConcurrentDictionary<string, long> _activeSubscriptions = new();

        // Track which login handles are currently listening: loginHandle -> deviceId
        private readonly ConcurrentDictionary<long, string> _loginHandleMap = new();

        public AccessControlEventsSdkModule(ILogger<AccessControlEventsSdkModule> logger, HttpClient httpClient, string backendWebhookUrl)
        {
            _logger = logger;
            _httpClient = httpClient;
            _backendWebhookUrl = backendWebhookUrl;

            // Derive access events URL from webhook URL (replace /device-status with /access-events)
            if (!string.IsNullOrEmpty(backendWebhookUrl))
            {
                _backendAccessEventsUrl = backendWebhookUrl.Replace("/device-status", "/access-events");
            }
        }

        /// <summary>
        /// Start listening for alarm events on a device (calls NETClient.StartListen)
        /// Must be called AFTER successful device login
        /// </summary>
        /// <param name="deviceId">Device identifier (Registration ID)</param>
        /// <param name="loginHandle">NetSDK login handle for the device</param>
        public Task<bool> StartListen(string deviceId, long loginHandle)
        {
            try
            {
                // Check if already listening
                if (_activeSubscriptions.ContainsKey(deviceId))
                {
                    _logger.LogWarning($"Device {deviceId} already has StartListen active");
                    return Task.FromResult(true);
                }

                _logger.LogInformation($"📡 Starting StartListen for device: {deviceId} (LoginHandle: {loginHandle})");

                bool result = NETClient.StartListen((IntPtr)loginHandle);

                if (!result)
                {
                    var errorCode = NETClient.GetLastError();
                    _logger.LogError($"❌ Failed to StartListen for device {deviceId}: {errorCode}");
                    return Task.FromResult(false);
                }

                _activeSubscriptions[deviceId] = loginHandle;
                _loginHandleMap[loginHandle] = deviceId;

                _logger.LogInformation($"✅ Successfully started StartListen for device: {deviceId}");
                _logger.LogInformation($"   Events will flow through global MessageCallback");

                return Task.FromResult(true);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error starting StartListen for device {deviceId}");
                return Task.FromResult(false);
            }
        }

        /// <summary>
        /// Stop listening for alarm events on a specific device (calls NETClient.StopListen)
        /// Called when device disconnects or is removed
        /// </summary>
        public void StopListen(string deviceId)
        {
            if (_activeSubscriptions.TryRemove(deviceId, out long loginHandle))
            {
                try
                {
                    _loginHandleMap.TryRemove(loginHandle, out _);

                    bool result = NETClient.StopListen((IntPtr)loginHandle);
                    if (result)
                    {
                        _logger.LogInformation($"✅ Stopped StartListen for device: {deviceId}");
                    }
                    else
                    {
                        _logger.LogWarning($"Failed to stop StartListen for device: {deviceId}");
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, $"Error stopping StartListen for device {deviceId}");
                }
            }
        }

        /// <summary>
        /// Stop listening for all device events (called during shutdown)
        /// </summary>
        public void StopListenAll()
        {
            foreach (var deviceId in _activeSubscriptions.Keys)
            {
                StopListen(deviceId);
            }
            _activeSubscriptions.Clear();
            _loginHandleMap.Clear();
        }

        /// <summary>
        /// Handle an alarm event received from the SDK global callback
        /// This method is called by SDKBridgeService.MessageCallback
        /// </summary>
        public void HandleAlarmEvent(int lCommand, IntPtr lLoginID, IntPtr pBuf, uint dwBufLen, IntPtr pchDVRIP, int nDVRPort)
        {
            try
            {
                EM_ALARM_TYPE eventType = (EM_ALARM_TYPE)lCommand;
                string ip = Marshal.PtrToStringAnsi(pchDVRIP) ?? "Unknown";

                // Find which device this event belongs to
                string deviceId = "";
                if (_loginHandleMap.TryGetValue(lLoginID.ToInt64(), out var id))
                {
                    deviceId = id;
                }

                // Handle different alarm event types
                switch (eventType)
                {
                    case EM_ALARM_TYPE.ALARM_ACCESS_CTL_EVENT:
                        HandleAccessControlEvent(pBuf, dwBufLen, deviceId, ip);
                        break;

                    case EM_ALARM_TYPE.ALARM_ACCESS_CTL_NOT_CLOSE:
                        HandleDoorNotClosedEvent(pBuf, dwBufLen, deviceId, ip);
                        break;

                    case EM_ALARM_TYPE.ALARM_ACCESS_CTL_BREAK_IN:
                        HandleBreakInEvent(pBuf, dwBufLen, deviceId, ip);
                        break;

                    case EM_ALARM_TYPE.ALARM_ACCESS_CTL_REPEAT_ENTER:
                        HandleRepeatEnterEvent(pBuf, dwBufLen, deviceId, ip);
                        break;

                    case EM_ALARM_TYPE.ALARM_ACCESS_CTL_DURESS:
                        HandleDuressEvent(pBuf, dwBufLen, deviceId, ip);
                        break;

                    case EM_ALARM_TYPE.ALARM_CHASSISINTRUDED:
                        HandleChassisIntrusionEvent(pBuf, dwBufLen, deviceId, ip);
                        break;

                    case EM_ALARM_TYPE.URGENCY_ALARM_EX2:
                        HandleUrgencyAlarmEvent(pBuf, dwBufLen, deviceId, ip);
                        break;

                    case EM_ALARM_TYPE.ALARM_ACCESS_CTL_MALICIOUS:
                        HandleMaliciousOpeningEvent(pBuf, dwBufLen, deviceId, ip);
                        break;

                    case (EM_ALARM_TYPE)0x3491:
                        // Undocumented event fired by device after face data upload (face processing status)
                        // Intentionally silenced — not an access control event
                        break;

                    default:
                        _logger.LogDebug($"Unhandled alarm event type: {eventType} (0x{lCommand:X}) from {ip}");
                        break;
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in HandleAlarmEvent");
            }
        }

        /// <summary>
        /// Handle main access control event (card/face/fingerprint access)
        /// </summary>
        private async void HandleAccessControlEvent(IntPtr pBuf, uint dwBufLen, string deviceId, string ip)
        {
            try
            {
                var accessInfo = (NET_ALARM_ACCESS_CTL_EVENT_INFO)Marshal.PtrToStructure(
                    pBuf,
                    typeof(NET_ALARM_ACCESS_CTL_EVENT_INFO)
                );

                var eventData = new AccessControlEventData
                {
                    Timestamp = accessInfo.stuTime.ToDateTime().ToString("yyyy-MM-ddTHH:mm:ssZ"),
                    UserID = accessInfo.szUserID ?? "",
                    CardNumber = accessInfo.szCardNo ?? "",
                    CardName = accessInfo.szCardName?.Trim() ?? "",
                    Door = accessInfo.nDoor,
                    ReaderID = accessInfo.szReaderID ?? "",
                    IsSuccess = accessInfo.bStatus,
                    ErrorCode = accessInfo.nErrorCode,
                    EventType = accessInfo.emEventType.ToString(),
                    RecordNumber = accessInfo.nPunchingRecNo,
                    CardType = accessInfo.emCardType switch
                    {
                        EM_A_NET_ACCESSCTLCARD_TYPE.NET_ACCESSCTLCARD_TYPE_GENERAL   => "Normal",
                        EM_A_NET_ACCESSCTLCARD_TYPE.NET_ACCESSCTLCARD_TYPE_VIP       => "VIP",
                        EM_A_NET_ACCESSCTLCARD_TYPE.NET_ACCESSCTLCARD_TYPE_GUEST     => "Guest",
                        EM_A_NET_ACCESSCTLCARD_TYPE.NET_ACCESSCTLCARD_TYPE_PATROL    => "Patrol",
                        EM_A_NET_ACCESSCTLCARD_TYPE.NET_ACCESSCTLCARD_TYPE_BLACKLIST => "Blacklisted",
                        EM_A_NET_ACCESSCTLCARD_TYPE.NET_ACCESSCTLCARD_TYPE_CORCE     => "Coercion",
                        _ => "Unknown"
                    },
                    HasSnapshotImage = false,
                    SnapshotUrl = ""
                };

                // Note: Alarm events (StartListen) don't include snapshot images
                // Snapshots are only available via RealLoadPicture method
                // The szSnapURL field exists but is typically not populated in alarm events
                if (!string.IsNullOrEmpty(accessInfo.szSnapURL))
                {
                    _logger.LogDebug($"Snapshot URL available but not downloading: {accessInfo.szSnapURL}");
                    // Could download here if needed, but typically empty
                }

                // Determine open method (face/card/fingerprint/etc)
                eventData.OpenMethod = accessInfo.emOpenMethod switch
                {
                    EM_ACCESS_DOOROPEN_METHOD.PWD_ONLY              => "Password",
                    EM_ACCESS_DOOROPEN_METHOD.CARD                  => "Card",
                    EM_ACCESS_DOOROPEN_METHOD.CARD_FIRST            => "Card+Password",
                    EM_ACCESS_DOOROPEN_METHOD.PWD_FIRST             => "Password+Card",
                    EM_ACCESS_DOOROPEN_METHOD.FINGERPRINT           => "Fingerprint",
                    EM_ACCESS_DOOROPEN_METHOD.FACE_RECOGNITION      => "Face",
                    EM_ACCESS_DOOROPEN_METHOD.FACEIDCARD            => "Face+IDCard",
                    EM_ACCESS_DOOROPEN_METHOD.FACEIDCARD_AND_IDCARD => "IDCard+Face+IDCard",
                    EM_ACCESS_DOOROPEN_METHOD.CARD_AND_FACE         => "Card+Face",
                    EM_ACCESS_DOOROPEN_METHOD.CARD_FINGERPRINT      => "Card+Fingerprint",
                    EM_ACCESS_DOOROPEN_METHOD.FINGERPRINT_AND_FACE  => "Fingerprint+Face",
                    EM_ACCESS_DOOROPEN_METHOD.FINGERPRINT_AND_PWD   => "Fingerprint+Password",
                    EM_ACCESS_DOOROPEN_METHOD.FINGERPRINT_OR_PWD    => "Fingerprint/Password",
                    EM_ACCESS_DOOROPEN_METHOD.FINGERPRINT_OR_FACE   => "Fingerprint/Face",
                    EM_ACCESS_DOOROPEN_METHOD.FACE_AND_PWD          => "Face+Password",
                    EM_ACCESS_DOOROPEN_METHOD.FACE_OR_PWD           => "Face/Password",
                    EM_ACCESS_DOOROPEN_METHOD.PWD_CARD_FINGERPRINT  => "Password+Card+Fingerprint",
                    EM_ACCESS_DOOROPEN_METHOD.PWD_FINGERPRINT       => "Password+Fingerprint",
                    EM_ACCESS_DOOROPEN_METHOD.CUSTOM_PASSWORD       => "CustomPassword",
                    EM_ACCESS_DOOROPEN_METHOD.USERID_AND_PWD        => "UserID+Password",
                    EM_ACCESS_DOOROPEN_METHOD.PERSONS               => "MultiPerson",
                    EM_ACCESS_DOOROPEN_METHOD.KEY                   => "Key",
                    EM_ACCESS_DOOROPEN_METHOD.COERCE_PWD            => "DuressPassword",
                    EM_ACCESS_DOOROPEN_METHOD.REMOTE                => "Remote",
                    EM_ACCESS_DOOROPEN_METHOD.BUTTON                => "LocalButton",
                    EM_ACCESS_DOOROPEN_METHOD.QRCODE                => "QRCode",
                    EM_ACCESS_DOOROPEN_METHOD.BLUETOOTH             => "Bluetooth",
                    EM_ACCESS_DOOROPEN_METHOD.UNKNOWN               => "Unknown",
                    _ => $"Other({(int)accessInfo.emOpenMethod})"
                };

                // Log the event
                _logger.LogInformation("=".PadRight(70, '='));
                _logger.LogInformation("🚪 ACCESS CONTROL EVENT (StartListen)");
                _logger.LogInformation("=".PadRight(70, '='));
                _logger.LogInformation($"   Device ID: {deviceId}");
                _logger.LogInformation($"   Event Type: {eventData.OpenMethod}");
                _logger.LogInformation($"   User ID: {eventData.UserID}");
                _logger.LogInformation($"   Card Number: {eventData.CardNumber}");
                _logger.LogInformation($"   Status: {(eventData.IsSuccess ? "✅ SUCCESS" : "❌ FAILED")}");
                _logger.LogInformation($"   Door: {eventData.Door}");
                _logger.LogInformation($"   Timestamp (UTC): {eventData.Timestamp}");
                _logger.LogInformation($"   Error Code: 0x{eventData.ErrorCode:X}");
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
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error handling ALARM_ACCESS_CTL_EVENT");
            }
        }

        /// <summary>
        /// Handle door not closed event
        /// </summary>
        private void HandleDoorNotClosedEvent(IntPtr pBuf, uint dwBufLen, string deviceId, string ip)
        {
            try
            {
                var eventInfo = (NET_ALARM_ACCESS_CTL_NOT_CLOSE_INFO)Marshal.PtrToStructure(
                    pBuf,
                    typeof(NET_ALARM_ACCESS_CTL_NOT_CLOSE_INFO)
                );

                _logger.LogWarning($"⚠️ DOOR NOT CLOSED - Device: {deviceId}, Door: {eventInfo.nDoor}, Action: {eventInfo.nAction}");

                var eventData = new AccessControlEventData
                {
                    Timestamp = eventInfo.stuTime.ToDateTime().ToString("yyyy-MM-ddTHH:mm:ssZ"),
                    UserID = "",
                    CardNumber = "",
                    OpenMethod = "DoorNotClosed",
                    Door = eventInfo.nDoor,
                    IsSuccess = false,
                    ErrorCode = eventInfo.nAction,
                    EventType = "ALARM_ACCESS_CTL_NOT_CLOSE",
                    HasSnapshotImage = false
                };

                _ = SendEventToBackendAsync(deviceId, eventData);

                AccessControlEventReceived?.Invoke(this, new AccessControlEventArgs
                {
                    DeviceID = deviceId,
                    EventData = eventData
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error handling ALARM_ACCESS_CTL_NOT_CLOSE");
            }
        }

        /// <summary>
        /// Handle break-in event
        /// </summary>
        private void HandleBreakInEvent(IntPtr pBuf, uint dwBufLen, string deviceId, string ip)
        {
            try
            {
                var eventInfo = (NET_ALARM_ACCESS_CTL_BREAK_IN_INFO)Marshal.PtrToStructure(
                    pBuf,
                    typeof(NET_ALARM_ACCESS_CTL_BREAK_IN_INFO)
                );

                _logger.LogWarning($"🚨 BREAK-IN DETECTED - Device: {deviceId}, Door: {eventInfo.nDoor}");

                var eventData = new AccessControlEventData
                {
                    Timestamp = eventInfo.stuTime.ToDateTime().ToString("yyyy-MM-ddTHH:mm:ssZ"),
                    UserID = "",
                    CardNumber = "",
                    OpenMethod = "BreakIn",
                    Door = eventInfo.nDoor,
                    IsSuccess = false,
                    ErrorCode = 0,
                    EventType = "ALARM_ACCESS_CTL_BREAK_IN",
                    HasSnapshotImage = false
                };

                _ = SendEventToBackendAsync(deviceId, eventData);

                AccessControlEventReceived?.Invoke(this, new AccessControlEventArgs
                {
                    DeviceID = deviceId,
                    EventData = eventData
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error handling ALARM_ACCESS_CTL_BREAK_IN");
            }
        }

        /// <summary>
        /// Handle repeat enter (anti-passback violation)
        /// </summary>
        private void HandleRepeatEnterEvent(IntPtr pBuf, uint dwBufLen, string deviceId, string ip)
        {
            try
            {
                _logger.LogWarning($"🔄 REPEAT ENTER - Device: {deviceId}");

                var eventData = new AccessControlEventData
                {
                    Timestamp = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ"),
                    UserID = "",
                    CardNumber = "",
                    OpenMethod = "RepeatEnter",
                    Door = 0,
                    IsSuccess = false,
                    ErrorCode = 0,
                    EventType = "ALARM_ACCESS_CTL_REPEAT_ENTER",
                    HasSnapshotImage = false
                };

                _ = SendEventToBackendAsync(deviceId, eventData);

                AccessControlEventReceived?.Invoke(this, new AccessControlEventArgs
                {
                    DeviceID = deviceId,
                    EventData = eventData
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error handling ALARM_ACCESS_CTL_REPEAT_ENTER");
            }
        }

        /// <summary>
        /// Handle duress event (coerced access)
        /// </summary>
        private void HandleDuressEvent(IntPtr pBuf, uint dwBufLen, string deviceId, string ip)
        {
            try
            {
                _logger.LogWarning($"🚨 DURESS ALERT - Device: {deviceId}");

                var eventData = new AccessControlEventData
                {
                    Timestamp = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ"),
                    UserID = "",
                    CardNumber = "",
                    OpenMethod = "Duress",
                    Door = 0,
                    IsSuccess = false,
                    ErrorCode = 0,
                    EventType = "ALARM_ACCESS_CTL_DURESS",
                    HasSnapshotImage = false
                };

                _ = SendEventToBackendAsync(deviceId, eventData);

                AccessControlEventReceived?.Invoke(this, new AccessControlEventArgs
                {
                    DeviceID = deviceId,
                    EventData = eventData
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error handling ALARM_ACCESS_CTL_DURESS");
            }
        }

        /// <summary>
        /// Handle chassis intrusion (anti-tamper)
        /// </summary>
        private void HandleChassisIntrusionEvent(IntPtr pBuf, uint dwBufLen, string deviceId, string ip)
        {
            try
            {
                _logger.LogWarning($"🔒 CHASSIS INTRUSION - Device: {deviceId}");

                var eventData = new AccessControlEventData
                {
                    Timestamp = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ"),
                    UserID = "",
                    CardNumber = "",
                    OpenMethod = "ChassisIntrusion",
                    Door = 0,
                    IsSuccess = false,
                    ErrorCode = 0,
                    EventType = "ALARM_CHASSISINTRUDED",
                    HasSnapshotImage = false
                };

                _ = SendEventToBackendAsync(deviceId, eventData);

                AccessControlEventReceived?.Invoke(this, new AccessControlEventArgs
                {
                    DeviceID = deviceId,
                    EventData = eventData
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error handling ALARM_CHASSISINTRUDED");
            }
        }

        /// <summary>
        /// Handle urgency alarm (emergency button)
        /// </summary>
        private void HandleUrgencyAlarmEvent(IntPtr pBuf, uint dwBufLen, string deviceId, string ip)
        {
            try
            {
                _logger.LogWarning($"🚨 URGENCY ALARM - Device: {deviceId}");

                var eventData = new AccessControlEventData
                {
                    Timestamp = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ"),
                    UserID = "",
                    CardNumber = "",
                    OpenMethod = "UrgencyAlarm",
                    Door = 0,
                    IsSuccess = false,
                    ErrorCode = 0,
                    EventType = "URGENCY_ALARM_EX2",
                    HasSnapshotImage = false
                };

                _ = SendEventToBackendAsync(deviceId, eventData);

                AccessControlEventReceived?.Invoke(this, new AccessControlEventArgs
                {
                    DeviceID = deviceId,
                    EventData = eventData
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error handling URGENCY_ALARM_EX2");
            }
        }

        /// <summary>
        /// Handle malicious opening event
        /// </summary>
        private void HandleMaliciousOpeningEvent(IntPtr pBuf, uint dwBufLen, string deviceId, string ip)
        {
            try
            {
                _logger.LogWarning($"🚨 MALICIOUS OPENING - Device: {deviceId}");

                var eventData = new AccessControlEventData
                {
                    Timestamp = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ"),
                    UserID = "",
                    CardNumber = "",
                    OpenMethod = "MaliciousOpening",
                    Door = 0,
                    IsSuccess = false,
                    ErrorCode = 0,
                    EventType = "ALARM_ACCESS_CTL_MALICIOUS",
                    HasSnapshotImage = false
                };

                _ = SendEventToBackendAsync(deviceId, eventData);

                AccessControlEventReceived?.Invoke(this, new AccessControlEventArgs
                {
                    DeviceID = deviceId,
                    EventData = eventData
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error handling ALARM_ACCESS_CTL_MALICIOUS");
            }
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
                // Convert snapshot image to base64 if available
                string snapshotBase64 = "";
                if (eventData.HasSnapshotImage && eventData.SnapshotImage != null && eventData.SnapshotImage.Length > 0)
                {
                    snapshotBase64 = Convert.ToBase64String(eventData.SnapshotImage);
                }

                // Create JSON payload
                var payload = new
                {
                    type = "access_control_event_sdk",
                    deviceId = deviceId,
                    timestamp = eventData.Timestamp,
                    data = new
                    {
                        eventType = eventData.OpenMethod,
                        alarmEventType = eventData.EventType,
                        userId = eventData.UserID,
                        cardNumber = eventData.CardNumber,
                        cardName = eventData.CardName,
                        cardType = eventData.CardType,
                        recordNumber = eventData.RecordNumber,
                        isSuccess = eventData.IsSuccess,
                        door = eventData.Door,
                        readerId = eventData.ReaderID,
                        errorCode = eventData.ErrorCode,
                        hasSnapshot = eventData.HasSnapshotImage,
                        snapshotBase64 = snapshotBase64,
                        snapshotUrl = eventData.SnapshotUrl ?? "",
                        source = "SDK_STARTLISTEN"
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
        /// Event raised when an access control event is received
        /// </summary>
        public event EventHandler<AccessControlEventArgs> AccessControlEventReceived;

        /// <summary>
        /// Dispose resources
        /// </summary>
        public void Dispose()
        {
            StopListenAll();
        }
    }
}
