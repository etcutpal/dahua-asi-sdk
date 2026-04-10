/****************************************************************************************************************************
 * Access Control Events Module - General Events (eventManager.cgi)
 *
 * PURPOSE:
 * Subscribes to access control devices using the General Events HTTP streaming API
 * as documented in Section 4.11.1 of the HTTP API documentation.
 *
 * URL Pattern: http://{device_ip}/cgi-bin/eventManager.cgi?action=attach&codes=[All]&heartbeat=5
 *
 * This is an ALTERNATIVE method to snapManager.cgi and may work better for some devices.
 ***************************************************************************************************************************/

using System;
using System.Collections.Concurrent;
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
    /// Module for subscribing to access control events via HTTP General Events streaming (eventManager.cgi)
    /// </summary>
    public class AccessControlEventsGeneralModule : IDisposable
    {
        private readonly ILogger<AccessControlEventsGeneralModule> _logger;
        private readonly string _backendAccessEventsUrl;

        // Track active subscriptions: deviceId -> subscription state
        private readonly ConcurrentDictionary<string, GeneralEventSubscription> _activeSubscriptions = new();

        public AccessControlEventsGeneralModule(ILogger<AccessControlEventsGeneralModule> logger, string backendWebhookUrl)
        {
            _logger = logger;
            
            // Derive access events URL from webhook URL
            if (!string.IsNullOrEmpty(backendWebhookUrl))
            {
                _backendAccessEventsUrl = backendWebhookUrl.Replace("/device-status", "/access-events");
            }
        }

        /// <summary>
        /// Subscribe to access control events via General Events HTTP streaming
        /// </summary>
        public async Task<bool> SubscribeToDeviceEvents(string deviceId, string deviceIP, string username = "admin", string password = "admin123")
        {
            try
            {
                // Check if already subscribed
                if (_activeSubscriptions.ContainsKey(deviceId))
                {
                    _logger.LogWarning($"[GENERAL] Device {deviceId} already subscribed to events");
                    return true;
                }

                _logger.LogInformation($"📡 [GENERAL] Subscribing to general events for device: {deviceId}");
                _logger.LogInformation($"   Device IP: {deviceIP}");

                // Build General Events subscription URL (Section 4.11.1 from docs)
                // codes=[All] subscribes to ALL events
                // heartbeat=5 keeps connection alive
                var subscriptionUrl = $"http://{deviceIP}/cgi-bin/eventManager.cgi?action=attach&codes=[All]&heartbeat=5";

                _logger.LogInformation($"   Subscription URL: {subscriptionUrl}");

                // Create HTTP client for this subscription
                var handler = new HttpClientHandler
                {
                    Credentials = new NetworkCredential(username, password),
                    PreAuthenticate = true,
                    ServerCertificateCustomValidationCallback = HttpClientHandler.DangerousAcceptAnyServerCertificateValidator
                };

                var httpClient = new HttpClient(handler)
                {
                    Timeout = TimeSpan.FromHours(1)
                };

                // Create subscription state
                var subscription = new GeneralEventSubscription
                {
                    DeviceId = deviceId,
                    DeviceIP = deviceIP,
                    SubscriptionUrl = subscriptionUrl,
                    HttpClient = httpClient,
                    CancellationTokenSource = new CancellationTokenSource()
                };

                _activeSubscriptions[deviceId] = subscription;

                // Start streaming events in background
                _ = Task.Run(() => StartEventStreamingAsync(deviceId, subscription));

                _logger.LogInformation($"✅ [GENERAL] Successfully subscribed to general events for device: {deviceId}");
                _logger.LogInformation($"   Event Type: All (including AccessControl)");
                _logger.LogInformation($"   Method: HTTP Streaming (eventManager.cgi)");

                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"❌ [GENERAL] Failed to subscribe to events for device: {deviceId}");
                return false;
            }
        }

        /// <summary>
        /// Start streaming events from the device
        /// Handles multipart MIME format (--myboundary separators)
        /// </summary>
        private async Task StartEventStreamingAsync(string deviceId, GeneralEventSubscription subscription)
        {
            try
            {
                subscription.IsStreaming = true;
                _logger.LogInformation($"🔄 [GENERAL] Starting event stream for device: {deviceId}");

                var request = new HttpRequestMessage(HttpMethod.Get, subscription.SubscriptionUrl);
                
                var response = await subscription.HttpClient.SendAsync(
                    request,
                    HttpCompletionOption.ResponseHeadersRead,
                    subscription.CancellationTokenSource.Token
                );

                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogError($"❌ [GENERAL] Failed to subscribe: HTTP {response.StatusCode}");
                    subscription.IsStreaming = false;
                    return;
                }

                _logger.LogInformation($"✅ [GENERAL] Event stream connection established for device: {deviceId}");

                // Read entire stream as string buffer
                using var stream = await response.Content.ReadAsStreamAsync();
                using var reader = new System.IO.StreamReader(stream);
                
                // Multipart MIME parsing
                var buffer = new System.Text.StringBuilder();
                string line;
                string currentBoundary = null;
                var eventParts = new List<string>();
                bool insideEvent = false;

                while ((line = await reader.ReadLineAsync()) != null && !subscription.CancellationTokenSource.Token.IsCancellationRequested)
                {
                    // Detect MIME boundary
                    if (line.StartsWith("--"))
                    {
                        // Process previous event if we have one
                        if (eventParts.Count > 0 && insideEvent)
                        {
                            var fullEvent = string.Join("\n", eventParts);
                            eventParts.Clear();
                            insideEvent = false;

                            // Try to parse and process the event
                            await ProcessMultipartEventAsync(deviceId, fullEvent, subscription);
                        }

                        // Check if this is the end boundary
                        if (line.TrimEnd() == "--")
                        {
                            _logger.LogDebug($"[GENERAL] End of stream boundary detected");
                        }
                        else
                        {
                            currentBoundary = line;
                            _logger.LogDebug($"[GENERAL] New boundary: {line}");
                        }
                        continue;
                    }

                    // Skip MIME headers
                    if (line.StartsWith("Content-") || line.StartsWith("Content-Type") || line.StartsWith("Content-Length"))
                    {
                        continue;
                    }

                    // Collect event data lines
                    if (!string.IsNullOrWhiteSpace(line))
                    {
                        eventParts.Add(line);
                        insideEvent = true;
                    }
                }

                // Process any remaining event data
                if (eventParts.Count > 0)
                {
                    var fullEvent = string.Join("\n", eventParts);
                    await ProcessMultipartEventAsync(deviceId, fullEvent, subscription);
                }
            }
            catch (OperationCanceledException)
            {
                _logger.LogInformation($"ℹ️  [GENERAL] Event stream cancelled for device: {deviceId}");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"❌ [GENERAL] Error in event stream for device {deviceId}");
            }
            finally
            {
                subscription.IsStreaming = false;
                _logger.LogInformation($"⛔ [GENERAL] Event stream ended for device: {deviceId}");
            }
        }

        /// <summary>
        /// Process a multipart event from the stream
        /// Handles both JSON and non-JSON formats
        /// </summary>
        private async Task ProcessMultipartEventAsync(string deviceId, string eventData, GeneralEventSubscription subscription)
        {
            try
            {
                // Log raw event data for debugging
                _logger.LogInformation($"📨 [GENERAL] EVENT DATA from {deviceId}:\n{eventData.Substring(0, Math.Min(500, eventData.Length))}");

                // Skip heartbeat messages
                if (eventData.Trim().Equals("Heartbeat", StringComparison.OrdinalIgnoreCase))
                {
                    _logger.LogDebug($"[GENERAL] Heartbeat received from {deviceId}");
                    return;
                }

                // Try to extract JSON objects from the event data
                var jsonObjects = ExtractJsonObjects(eventData);

                if (jsonObjects.Count == 0)
                {
                    _logger.LogWarning($"⚠️  [GENERAL] No JSON objects found in event from {deviceId}");
                    return;
                }

                // Process each JSON object
                foreach (var json in jsonObjects)
                {
                    await ProcessJsonObjectAsync(deviceId, json);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"[GENERAL] Error processing multipart event for device {deviceId}");
            }
        }

        /// <summary>
        /// Extract JSON objects from event data
        /// Handles fragmented JSON lines
        /// </summary>
        private List<string> ExtractJsonObjects(string eventData)
        {
            var jsonObjects = new List<string>();
            
            // Try to find complete JSON objects by matching braces
            int depth = 0;
            int start = -1;
            
            for (int i = 0; i < eventData.Length; i++)
            {
                if (eventData[i] == '{')
                {
                    if (depth == 0)
                    {
                        start = i;
                    }
                    depth++;
                }
                else if (eventData[i] == '}')
                {
                    depth--;
                    if (depth == 0 && start >= 0)
                    {
                        var json = eventData.Substring(start, i - start + 1);
                        jsonObjects.Add(json);
                        start = -1;
                    }
                }
            }

            return jsonObjects;
        }

        /// <summary>
        /// Process a single JSON object from the event
        /// </summary>
        private async Task ProcessJsonObjectAsync(string deviceId, string json)
        {
            try
            {
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;

                _logger.LogInformation($"✅ [GENERAL] JSON object parsed from {deviceId}");

                // Extract event information
                string eventType = "Unknown";
                string userId = "";
                string cardNumber = "";
                bool isSuccess = false;
                int similarity = 0;
                string openMethod = "Unknown";

                // Extract UserID
                if (root.TryGetProperty("UserID", out var userIdElem))
                {
                    userId = userIdElem.GetString() ?? "";
                }

                // Extract CardNo or CardNumber
                if (root.TryGetProperty("CardNo", out var cardNoElem))
                {
                    cardNumber = cardNoElem.GetString() ?? "";
                }
                else if (root.TryGetProperty("CardNumber", out var cardNumElem))
                {
                    cardNumber = cardNumElem.GetString() ?? "";
                }

                // Extract similarity score (for face recognition)
                if (root.TryGetProperty("Similarity", out var simElem))
                {
                    try
                    {
                        similarity = simElem.GetInt32();
                    }
                    catch
                    {
                        // Try parsing as string if it's not a number
                        var simStr = simElem.GetString();
                        if (!string.IsNullOrEmpty(simStr) && int.TryParse(simStr, out int parsedSim))
                        {
                            similarity = parsedSim;
                        }
                    }
                    
                    if (similarity > 0)
                    {
                        openMethod = "Face";
                        isSuccess = similarity >= 80; // Assume success if similarity >= 80%
                    }
                }

                // Extract event type from method or code field
                if (root.TryGetProperty("method", out var methodElem))
                {
                    eventType = methodElem.GetString() ?? "Unknown";
                }
                else if (root.TryGetProperty("code", out var codeElem))
                {
                    eventType = codeElem.GetString() ?? "Unknown";
                }
                else if (root.TryGetProperty("event", out var eventElem))
                {
                    eventType = eventElem.GetString() ?? "Unknown";
                }

                // Extract status
                if (root.TryGetProperty("Status", out var statusElem))
                {
                    isSuccess = statusElem.GetInt32() == 1;
                }

                // Extract timestamp
                string timestamp = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ");
                if (root.TryGetProperty("RealUTC", out var utcElem))
                {
                    try
                    {
                        var unixTime = utcElem.GetInt64();
                        timestamp = DateTimeOffset.FromUnixTimeSeconds(unixTime).ToString("yyyy-MM-ddTHH:mm:ssZ");
                    }
                    catch
                    {
                        // Ignore timestamp parsing errors
                    }
                }

                // Create structured event data
                var eventDataObj = new
                {
                    eventType = eventType,
                    userId = userId,
                    cardNumber = cardNumber,
                    isSuccess = isSuccess,
                    similarity = similarity,
                    openMethod = openMethod,
                    timestamp = timestamp,
                    rawJson = json,
                    source = "GENERAL_EVENT_MANAGER"
                };

                _logger.LogInformation($"🚪 [GENERAL] Access event detected:");
                _logger.LogInformation($"   Device: {deviceId}");
                _logger.LogInformation($"   Type: {eventType}");
                _logger.LogInformation($"   Method: {openMethod}");
                _logger.LogInformation($"   UserID: {userId}");
                if (!string.IsNullOrEmpty(cardNumber))
                {
                    _logger.LogInformation($"   Card: {cardNumber}");
                }
                if (similarity > 0)
                {
                    _logger.LogInformation($"   Similarity: {similarity}%");
                }
                _logger.LogInformation($"   Success: {isSuccess}");
                _logger.LogInformation($"   Timestamp: {timestamp}");

                // Send to backend
                await SendEventToBackendAsync(deviceId, eventType, eventDataObj);
            }
            catch (JsonException ex)
            {
                _logger.LogWarning(ex, $"[GENERAL] Failed to parse JSON object: {json.Substring(0, Math.Min(100, json.Length))}");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"[GENERAL] Error processing JSON object for device {deviceId}");
            }
        }

        /// <summary>
        /// Send event to backend webhook
        /// </summary>
        private async Task SendEventToBackendAsync(string deviceId, string eventType, object eventDataObj)
        {
            if (string.IsNullOrEmpty(_backendAccessEventsUrl))
            {
                _logger.LogWarning("[GENERAL] Backend URL not configured, skipping event forwarding");
                return;
            }

            try
            {
                var payload = new
                {
                    type = "access_control_event",
                    deviceId = deviceId,
                    timestamp = (eventDataObj as dynamic)?.timestamp ?? DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss"),
                    data = eventDataObj
                };

                var json = JsonSerializer.Serialize(payload, new JsonSerializerOptions
                {
                    WriteIndented = false
                });

                using var httpClient = new HttpClient();
                var content = new StringContent(json, Encoding.UTF8, "application/json");
                
                _logger.LogInformation($"📡 [GENERAL] Sending event to backend: {_backendAccessEventsUrl}");
                var response = await httpClient.PostAsync(_backendAccessEventsUrl, content);

                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogWarning($"[GENERAL] Webhook failed: HTTP {response.StatusCode}");
                    var responseBody = await response.Content.ReadAsStringAsync();
                    _logger.LogWarning($"[GENERAL] Response: {responseBody}");
                }
                else
                {
                    _logger.LogInformation($"✅ [GENERAL] Event sent to backend for device: {deviceId}");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"[GENERAL] Error sending event to backend for device {deviceId}");
            }
        }

        /// <summary>
        /// Unsubscribe from events for a specific device
        /// </summary>
        public void UnsubscribeFromDeviceEvents(string deviceId)
        {
            if (_activeSubscriptions.TryRemove(deviceId, out var subscription))
            {
                _logger.LogInformation($" [GENERAL] Unsubscribing from events for device: {deviceId}");
                
                subscription.CancellationTokenSource?.Cancel();
                subscription.HttpClient?.Dispose();
                
                _logger.LogInformation($"✅ [GENERAL] Unsubscribed from events for device: {deviceId}");
            }
        }

        /// <summary>
        /// Unsubscribe from all devices
        /// </summary>
        public void UnsubscribeAll()
        {
            foreach (var deviceId in _activeSubscriptions.Keys)
            {
                UnsubscribeFromDeviceEvents(deviceId);
            }
        }

        public void Dispose()
        {
            UnsubscribeAll();
        }

        private class GeneralEventSubscription
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
