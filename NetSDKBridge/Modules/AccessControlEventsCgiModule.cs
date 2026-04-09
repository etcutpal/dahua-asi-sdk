/****************************************************************************************************************************
 * Access Control Events Module - HTTP CGI Subscription Method
 * 
 * PURPOSE:
 * Subscribes to access control devices using HTTP CGI endpoint to receive
 * real-time unlock events (face recognition, card swipe, fingerprint) with snapshot images.
 * 
 * BASED ON:
 * - Section 4.11.2 of Access Control API Guide (Subscribing for Intelligent Events)
 * - URL Pattern: http://{device_ip}/cgi-bin/snapManager.cgi?action=attachFileProc&Flags[0]=Event&Events=[AccessControl]&heartbeat=5
 * 
 * ARCHITECTURE:
 * 1. After device login → Start HTTP long-poll to CGI endpoint
 * 2. Device streams events in real-time via HTTP multipart response
 * 3. Parse JSON/XML event data
 * 4. Extract event details (card number, user ID, open method, success status)
 * 5. Download snapshot images separately if URL provided
 * 6. Send structured event data to backend webhook
 * 7. Handle heartbeat/keepalive automatically
 * 8. On device disconnect → Stop HTTP subscription
 * 
 * USAGE:
 * var module = new AccessControlEventsCgiModule(logger, httpClientFactory, webhookUrl);
 * await module.SubscribeToDeviceEvents(deviceId, deviceIP, username, password);
 * 
 * ADVANTAGES OVER SDK METHOD:
 * - Cleaner JSON parsing
 * - Built-in snapshot URLs
 * - No native callback complexity
 * - Better error handling
 * - Easier to debug with browser/curl
 ***************************************************************************************************************************/

using System;
using System.Collections.Concurrent;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

#nullable disable

namespace NetSDKBridge.Modules
{
    /// <summary>
    /// Module for subscribing to access control events via HTTP CGI subscription
    /// </summary>
    public class AccessControlEventsCgiModule : IDisposable
    {
        private readonly ILogger<AccessControlEventsCgiModule> _logger;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly string _backendWebhookUrl;
        private readonly string _backendAccessEventsUrl;

        // Track active subscriptions: deviceId -> subscription state
        private readonly ConcurrentDictionary<string, CgiSubscription> _activeSubscriptions = new();

        // HTTP client for downloading snapshots (separate from streaming client)
        private readonly HttpClient _snapshotHttpClient;

        public AccessControlEventsCgiModule(ILogger<AccessControlEventsCgiModule> logger, IHttpClientFactory httpClientFactory, string backendWebhookUrl)
        {
            _logger = logger;
            _httpClientFactory = httpClientFactory;
            _backendWebhookUrl = backendWebhookUrl;
            
            // Derive access events URL from webhook URL (replace /device-status with /access-events)
            if (!string.IsNullOrEmpty(backendWebhookUrl))
            {
                _backendAccessEventsUrl = backendWebhookUrl.Replace("/device-status", "/access-events");
            }
            
            _snapshotHttpClient = new HttpClient();
        }

        /// <summary>
        /// Subscribe to access control events for a specific device via HTTP CGI
        /// Must be called AFTER successful device login
        /// </summary>
        /// <param name="deviceId">Device identifier (Registration ID)</param>
        /// <param name="deviceIP">Device IP address</param>
        /// <param name="username">Device username (for HTTP auth if needed)</param>
        /// <param name="password">Device password (for HTTP auth if needed)</param>
        public async Task<bool> SubscribeToDeviceEvents(string deviceId, string deviceIP, string username = "admin", string password = "admin123")
        {
            try
            {
                // Check if already subscribed
                if (_activeSubscriptions.ContainsKey(deviceId))
                {
                    _logger.LogWarning($"Device {deviceId} already subscribed to events via CGI");
                    return true;
                }

                _logger.LogInformation($"📡 [CGI] Subscribing to access control events for device: {deviceId}");
                _logger.LogInformation($"   Device IP: {deviceIP}");

                // Build CGI subscription URL (Section 4.11.2 from docs)
                // Events=[AccessControl] subscribes to all access control events
                // heartbeat=5 keeps connection alive
                var subscriptionUrl = $"http://{deviceIP}/cgi-bin/snapManager.cgi?action=attachFileProc&Flags[0]=Event&Events=[AccessControl]&heartbeat=5";
                
                _logger.LogInformation($"   Subscription URL: {subscriptionUrl}");

                // Create HTTP client for this subscription
                HttpClient subscriptionClient;
                
                // Add authentication (try Digest first, then Basic)
                if (!string.IsNullOrEmpty(username) && !string.IsNullOrEmpty(password))
                {
                    var handler = new HttpClientHandler
                    {
                        Credentials = new NetworkCredential(username, password),
                        PreAuthenticate = true
                    };
                    
                    subscriptionClient = new HttpClient(handler)
                    {
                        Timeout = TimeSpan.FromHours(1)
                    };
                    
                    _logger.LogInformation($"   Authentication: Basic/Digest (username: {username})");
                }
                else
                {
                    subscriptionClient = new HttpClient
                    {
                        Timeout = TimeSpan.FromHours(1)
                    };
                }

                // Create subscription state
                var subscription = new CgiSubscription
                {
                    DeviceId = deviceId,
                    DeviceIP = deviceIP,
                    SubscriptionUrl = subscriptionUrl,
                    HttpClient = subscriptionClient,
                    CancellationTokenSource = new CancellationTokenSource()
                };

                _activeSubscriptions[deviceId] = subscription;

                // Start streaming in background (fire-and-forget)
                _ = Task.Run(async () =>
                {
                    await StartEventStreamingAsync(deviceId, subscription);
                });

                // Wait a moment to verify connection
                await Task.Delay(1000);

                if (subscription.IsStreaming)
                {
                    _logger.LogInformation($"✅ [CGI] Successfully subscribed to access control events for device: {deviceId}");
                    _logger.LogInformation($"   Event Type: AccessControl (Face/Card/Fingerprint events)");
                    _logger.LogInformation($"   Heartbeat: 5 seconds");
                    _logger.LogInformation($"   Streaming: Active");
                    return true;
                }
                else
                {
                    _logger.LogError($"❌ [CGI] Failed to establish event stream for device: {deviceId}");
                    _activeSubscriptions.TryRemove(deviceId, out _);
                    return false;
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error subscribing to events via CGI for device {deviceId}");
                return false;
            }
        }

        /// <summary>
        /// Start streaming events from the CGI endpoint
        /// </summary>
        private async Task StartEventStreamingAsync(string deviceId, CgiSubscription subscription)
        {
            try
            {
                subscription.IsStreaming = true;
                
                _logger.LogInformation($"🔄 [CGI] Starting event stream for device: {deviceId}");

                // Make HTTP GET request - this will stream events continuously
                using var request = new HttpRequestMessage(HttpMethod.Get, subscription.SubscriptionUrl);
                using var response = await subscription.HttpClient.SendAsync(
                    request, 
                    HttpCompletionOption.ResponseHeadersRead, 
                    subscription.CancellationTokenSource.Token
                );

                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogError($"❌ [CGI] Failed to subscribe: HTTP {response.StatusCode}");
                    subscription.IsStreaming = false;
                    return;
                }

                _logger.LogInformation($"✅ [CGI] Event stream connection established for device: {deviceId}");

                // Read stream content line by line
                using var stream = await response.Content.ReadAsStreamAsync();
                using var reader = new StreamReader(stream);
                string line;

                while ((line = await reader.ReadLineAsync()) != null && !subscription.CancellationTokenSource.Token.IsCancellationRequested)
                {
                    line = line.Trim();

                    // Skip empty lines
                    if (string.IsNullOrEmpty(line))
                        continue;

                    // Parse event data (JSON format based on documentation)
                    if (line.Contains('{') && line.Contains('}'))
                    {
                        try
                        {
                            // Extract JSON from the line
                            var jsonStart = line.IndexOf('{');
                            var jsonEnd = line.LastIndexOf('}');
                            if (jsonStart >= 0 && jsonEnd > jsonStart)
                            {
                                var json = line.Substring(jsonStart, jsonEnd - jsonStart + 1);
                                await ProcessEventAsync(deviceId, json, subscription);
                            }
                        }
                        catch (JsonException ex)
                        {
                            _logger.LogDebug(ex, $"Failed to parse event JSON for device {deviceId}");
                        }
                    }
                    else
                    {
                        // Could be heartbeat or status message
                        _logger.LogDebug($"[CGI] Received from device {deviceId}: {line.Substring(0, Math.Min(100, line.Length))}");
                    }
                }
            }
            catch (OperationCanceledException)
            {
                _logger.LogInformation($"ℹ️  [CGI] Event stream cancelled for device: {deviceId}");
            }
            catch (HttpRequestException httpEx)
            {
                _logger.LogError(httpEx, $"❌ [CGI] HTTP error in event stream for device {deviceId}: {httpEx.Message}");
                _logger.LogError($"   StatusCode: {httpEx.StatusCode}");
                _logger.LogError($"   SubscriptionUrl: {subscription.SubscriptionUrl}");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"❌ [CGI] Error in event stream for device {deviceId}");
                _logger.LogError($"   Exception Type: {ex.GetType().Name}");
                _logger.LogError($"   Message: {ex.Message}");
                _logger.LogError($"   StackTrace: {ex.StackTrace}");
            }
            finally
            {
                subscription.IsStreaming = false;
                _logger.LogInformation($"⛔ [CGI] Event stream ended for device: {deviceId}");
            }
        }

        /// <summary>
        /// Process a single event from the stream
        /// Based on Section 5.6.1 Format of Unlocking Records from docs
        /// </summary>
        private async Task ProcessEventAsync(string deviceId, string json, CgiSubscription subscription)
        {
            try
            {
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;

                // LOG ALL EVENTS FOR DEBUGGING
                _logger.LogInformation("📨 [CGI] EVENT RECEIVED from {deviceId}: {json}", deviceId, json.Substring(0, Math.Min(200, json.Length)));

                // Extract event data - be more permissive to catch all event types
                if (!root.TryGetProperty("method", out var method))
                {
                    _logger.LogWarning("⚠️  [CGI] Event has no 'method' field, skipping");
                    return;
                }

                var methodStr = method.GetString() ?? "";
                
                // Check if this is an access control or related event
                // Accept multiple possible method names
                bool isAccessControlEvent = methodStr.Contains("notifyAccessControl") ||
                                           methodStr.Contains("AccessCtl") ||
                                           methodStr.Contains("AccessControl") ||
                                           methodStr.Contains("Unlock") ||
                                           methodStr.Contains("Door") ||
                                           methodStr.Contains("Access");

                if (!isAccessControlEvent)
                {
                    _logger.LogWarning("⚠️  [CGI] Event method not recognized for access control: '{method}'", methodStr);
                    return;
                }

                _logger.LogInformation("✅ [CGI] Access control event detected: {method}", methodStr);

                if (!root.TryGetProperty("params", out var parameters))
                    return;

                // Parse event details based on Section 5.6.1 documentation
                var eventData = new AccessControlEventData();

                // Required fields
                if (parameters.TryGetProperty("UserID", out var userId))
                    eventData.UserID = userId.GetString() ?? "";
                
                if (parameters.TryGetProperty("CardNo", out var cardNo))
                    eventData.CardNumber = cardNo.GetString() ?? "";
                
                if (parameters.TryGetProperty("CardName", out var cardName))
                    eventData.CardName = cardName.GetString() ?? "";

                // Event type (Entry/Exit)
                if (parameters.TryGetProperty("Type", out var type))
                    eventData.EventType = type.GetString() ?? "";

                // Status (0=Failed, 1=Success)
                if (parameters.TryGetProperty("Status", out var status))
                    eventData.IsSuccess = status.GetInt32() == 1;

                // Open method (0=Password, 1=Card, 2=Password+Card, 3=Card+Password, 
                //             6=Fingerprint, 15=Face, etc.)
                if (parameters.TryGetProperty("Method", out var methodProp))
                {
                    var methodCode = methodProp.GetInt32();
                    eventData.OpenMethod = ParseOpenMethod(methodCode);
                }

                // Door number
                if (parameters.TryGetProperty("Door", out var door))
                    eventData.Door = door.GetInt32();

                // Reader ID
                if (parameters.TryGetProperty("ReaderID", out var readerId))
                    eventData.ReaderID = readerId.GetString() ?? "";

                // Timestamp
                if (parameters.TryGetProperty("CreateTime", out var createTime))
                {
                    var utcTime = createTime.GetInt64();
                    eventData.Timestamp = DateTimeOffset.FromUnixTimeSeconds(utcTime)
                        .ToString("yyyy-MM-dd HH:mm:ss");
                }

                // Temperature (if device supports it)
                if (parameters.TryGetProperty("IsOverTemperature", out var isOverTemp))
                    eventData.IsOverTemperature = isOverTemp.GetBoolean();
                
                if (parameters.TryGetProperty("CurrentTemperature", out var currentTemp))
                    eventData.Temperature = (float)currentTemp.GetDouble();

                // Snapshot URL (download separately if needed)
                if (parameters.TryGetProperty("URL", out var snapshotUrl))
                {
                    eventData.SnapshotUrl = snapshotUrl.GetString();
                    eventData.HasSnapshotImage = !string.IsNullOrEmpty(eventData.SnapshotUrl);

                    // Download snapshot if URL provided
                    if (eventData.HasSnapshotImage)
                    {
                        await DownloadSnapshotAsync(subscription, eventData);
                    }
                }

                // Log the event
                _logger.LogInformation("=".PadRight(70, '='));
                _logger.LogInformation("🚪 [CGI] ACCESS CONTROL EVENT RECEIVED");
                _logger.LogInformation("=".PadRight(70, '='));
                _logger.LogInformation($"   Device ID: {deviceId}");
                _logger.LogInformation($"   Event Type: {eventData.OpenMethod}");
                _logger.LogInformation($"   User ID: {eventData.UserID}");
                _logger.LogInformation($"   Card Number: {eventData.CardNumber}");
                _logger.LogInformation($"   Card Name: {eventData.CardName}");
                _logger.LogInformation($"   Status: {(eventData.IsSuccess ? "✅ SUCCESS" : "❌ FAILED")}");
                _logger.LogInformation($"   Door: {eventData.Door}");
                _logger.LogInformation($"   Timestamp (UTC): {eventData.Timestamp}");
                
                if (eventData.Temperature.HasValue)
                {
                    _logger.LogInformation($"   Temperature: {eventData.Temperature.Value}°C");
                    if (eventData.IsOverTemperature)
                        _logger.LogWarning($"   ⚠️  OVER TEMPERATURE DETECTED!");
                }
                
                if (eventData.HasSnapshotImage)
                {
                    _logger.LogInformation($"   Snapshot: Downloaded ({eventData.SnapshotImageSize} bytes)");
                }
                
                _logger.LogInformation("=".PadRight(70, '='));

                // Send to backend webhook
                await SendEventToBackendAsync(deviceId, eventData);

                // Trigger local event
                AccessControlEventReceived?.Invoke(this, new AccessControlEventArgs
                {
                    DeviceID = deviceId,
                    EventData = eventData
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error processing event for device {deviceId}");
            }
        }

        /// <summary>
        /// Download snapshot image from device
        /// Based on Section 5.5.3 Getting Snapshot Image from docs
        /// URL format: http://{device_ip}/cgi-bin/snapshot.cgi?channel=1
        /// </summary>
        private async Task DownloadSnapshotAsync(CgiSubscription subscription, AccessControlEventData eventData)
        {
            try
            {
                var snapshotUrl = eventData.SnapshotUrl;
                
                // If relative URL, make it absolute
                if (snapshotUrl.StartsWith("/"))
                {
                    snapshotUrl = $"http://{subscription.DeviceIP}{snapshotUrl}";
                }

                // Add auth header
                using var request = new HttpRequestMessage(HttpMethod.Get, snapshotUrl);
                
                // Use subscription client to maintain auth
                using var response = await subscription.HttpClient.SendAsync(request);
                
                if (response.IsSuccessStatusCode)
                {
                    eventData.SnapshotImage = await response.Content.ReadAsByteArrayAsync();
                    eventData.SnapshotImageSize = eventData.SnapshotImage.Length;
                    eventData.SnapshotImageType = "JPEG";
                    
                    _logger.LogInformation($"📸 [CGI] Snapshot downloaded: {eventData.SnapshotImageSize} bytes");
                }
                else
                {
                    _logger.LogWarning($"⚠️  [CGI] Failed to download snapshot: HTTP {response.StatusCode}");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error downloading snapshot for device {subscription.DeviceId}");
            }
        }

        /// <summary>
        /// Parse open method code to human-readable string
        /// Based on Section 5.6.1 documentation
        /// </summary>
        private string ParseOpenMethod(int methodCode)
        {
            return methodCode switch
            {
                0 => "Password",
                1 => "Card",
                2 => "Password+Card",
                3 => "Card+Password",
                6 => "Fingerprint",
                15 => "Face",
                _ => $"Method({methodCode})"
            };
        }

        /// <summary>
        /// Send access control event to backend webhook
        /// </summary>
        private async Task SendEventToBackendAsync(string deviceId, AccessControlEventData eventData)
        {
            if (string.IsNullOrEmpty(_backendAccessEventsUrl))
            {
                _logger.LogWarning("[CGI] Backend access events URL not configured, skipping event forwarding");
                return;
            }

            try
            {
                var payload = new
                {
                    type = "access_control_event_cgi",
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
                        temperature = eventData.Temperature,
                        isOverTemperature = eventData.IsOverTemperature,
                        hasSnapshot = eventData.HasSnapshotImage,
                        snapshotSize = eventData.SnapshotImageSize,
                        source = "CGI_HTTP"
                    }
                };

                var json = JsonSerializer.Serialize(payload, new JsonSerializerOptions
                {
                    WriteIndented = false
                });

                using var httpClient = new HttpClient();
                var content = new StringContent(json, Encoding.UTF8, "application/json");
                
                _logger.LogInformation($"📡 [CGI] Sending access event to backend: {_backendAccessEventsUrl}");
                using var response = await httpClient.PostAsync(_backendAccessEventsUrl, content);

                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogWarning($"[CGI] Webhook failed for device {deviceId}: HTTP {response.StatusCode}");
                    var responseBody = await response.Content.ReadAsStringAsync();
                    _logger.LogWarning($"[CGI] Response: {responseBody}");
                }
                else
                {
                    _logger.LogInformation($"✅ [CGI] Event sent to backend for device: {deviceId}");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"[CGI] Error sending event to backend for device {deviceId}");
            }
        }

        /// <summary>
        /// Unsubscribe from events for a specific device
        /// </summary>
        public void UnsubscribeFromDeviceEvents(string deviceId)
        {
            if (_activeSubscriptions.TryRemove(deviceId, out var subscription))
            {
                try
                {
                    subscription.CancellationTokenSource?.Cancel();
                    subscription.HttpClient?.Dispose();
                    _logger.LogInformation($"[CGI] Stopped event subscription for device: {deviceId}");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, $"[CGI] Error unsubscribing device {deviceId} from events");
                }
            }
        }

        /// <summary>
        /// Unsubscribe from all device events
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
        /// Event raised when an access control event is received
        /// </summary>
        public event EventHandler<AccessControlEventArgs> AccessControlEventReceived;

        /// <summary>
        /// Dispose resources
        /// </summary>
        public void Dispose()
        {
            UnsubscribeAll();
            _snapshotHttpClient?.Dispose();
        }

        /// <summary>
        /// Internal class to track subscription state
        /// </summary>
        private class CgiSubscription
        {
            public string DeviceId { get; set; }
            public string DeviceIP { get; set; }
            public string SubscriptionUrl { get; set; }
            public HttpClient HttpClient { get; set; }
            public CancellationTokenSource CancellationTokenSource { get; set; }
            public bool IsStreaming { get; set; }
        }
    }
}
