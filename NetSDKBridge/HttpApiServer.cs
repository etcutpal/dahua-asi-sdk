using System;
using System.IO;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace NetSDKBridge
{
    /// <summary>
    /// HTTP API Server that exposes REST endpoints for the SDK Bridge
    /// This allows Express.js to communicate with the C# NetSDK
    /// </summary>
    public class HttpApiServer
    {
        private readonly ILogger<HttpApiServer> _logger;
        private readonly SDKBridgeService _sdkService;
        private WebApplication? _app;
        private readonly int _port;

        public HttpApiServer(ILogger<HttpApiServer> logger, SDKBridgeService sdkService, int port = 5000)
        {
            _logger = logger;
            _sdkService = sdkService;
            _port = port;
        }

        public async Task StartAsync()
        {
            var builder = WebApplication.CreateBuilder();
            builder.Services.AddLogging();
            builder.WebHost.UseUrls($"http://*:{_port}");

            _app = builder.Build();

            // CORS headers for Express.js
            _app.Use(async (context, next) =>
            {
                context.Response.Headers.Add("Access-Control-Allow-Origin", "*");
                context.Response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
                context.Response.Headers.Add("Access-Control-Allow-Headers", "Content-Type, Authorization");
                
                if (context.Request.Method == "OPTIONS")
                {
                    context.Response.StatusCode = 200;
                    return;
                }
                
                await next();
            });

            _app.UseRouting();

            // Health check endpoint
            _app.MapGet("/api/health", async context =>
            {
                await context.Response.WriteAsJsonAsync(new { status = "ok", message = "NetSDK Bridge is running" });
            });

            // Initialize SDK
            _app.MapPost("/api/sdk/init", async context =>
            {
                try
                {
                    var result = await _sdkService.InitializeSDK();
                    await context.Response.WriteAsJsonAsync(new { success = result, message = result ? "SDK initialized" : "SDK initialization failed" });
                }
                catch (Exception ex)
                {
                    context.Response.StatusCode = 500;
                    await context.Response.WriteAsJsonAsync(new { success = false, error = ex.Message });
                }
            });

            // Start Auto Registration Server
            _app.MapPost("/api/autoreg/start", async context =>
            {
                try
                {
                    var json = await System.Text.Json.JsonSerializer.DeserializeAsync<StartAutoRegRequest>(context.Request.Body);
                    var port = json?.Port ?? 9500;
                    var result = await _sdkService.StartAutoRegServer(port);
                    await context.Response.WriteAsJsonAsync(new { success = result, message = result ? "Auto Reg Server started" : "Failed to start", port = port });
                }
                catch (Exception ex)
                {
                    context.Response.StatusCode = 500;
                    await context.Response.WriteAsJsonAsync(new { success = false, error = ex.Message });
                }
            });

            // Stop Auto Registration Server
            _app.MapPost("/api/autoreg/stop", async context =>
            {
                try
                {
                    var result = await _sdkService.StopAutoRegServer();
                    await context.Response.WriteAsJsonAsync(new { success = result, message = result ? "Auto Reg Server stopped" : "Failed to stop" });
                }
                catch (Exception ex)
                {
                    context.Response.StatusCode = 500;
                    await context.Response.WriteAsJsonAsync(new { success = false, error = ex.Message });
                }
            });

            // Set platform credentials (username/password used to log in to auto-registered devices)
            _app.MapPost("/api/autoreg/credentials", async context =>
            {
                try
                {
                    var json = await System.Text.Json.JsonSerializer.DeserializeAsync<PlatformCredentialsRequest>(context.Request.Body,
                        new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                    if (json == null || string.IsNullOrEmpty(json.Username))
                    {
                        context.Response.StatusCode = 400;
                        await context.Response.WriteAsJsonAsync(new { success = false, error = "username is required" });
                        return;
                    }
                    _sdkService.SetPlatformCredentials(json.Username, json.Password ?? "");
                    _logger.LogInformation($"[API] Platform credentials updated — Username: {json.Username}");
                    await context.Response.WriteAsJsonAsync(new { success = true, message = "Credentials updated", username = json.Username });
                }
                catch (Exception ex)
                {
                    context.Response.StatusCode = 500;
                    await context.Response.WriteAsJsonAsync(new { success = false, error = ex.Message });
                }
            });

            // Get current platform credentials (username only, password hidden)
            _app.MapGet("/api/autoreg/credentials", async context =>
            {
                try
                {
                    var username = _sdkService.GetPlatformUsername();
                    await context.Response.WriteAsJsonAsync(new { success = true, username = username });
                }
                catch (Exception ex)
                {
                    context.Response.StatusCode = 500;
                    await context.Response.WriteAsJsonAsync(new { success = false, error = ex.Message });
                }
            });

            // Get all devices
            _app.MapGet("/api/devices", context =>
            {
                var devices = _sdkService.GetAllDevices();
                return context.Response.WriteAsJsonAsync(devices);
            });

            // Register per-device credentials (registrationId, username, password)
            _app.MapPost("/api/devices/credentials", async context =>
            {
                try
                {
                    var json = await System.Text.Json.JsonSerializer.DeserializeAsync<DeviceCredentialsRequest>(context.Request.Body,
                        new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                    if (json == null || string.IsNullOrEmpty(json.RegistrationId))
                    {
                        context.Response.StatusCode = 400;
                        await context.Response.WriteAsJsonAsync(new { success = false, error = "registrationId is required" });
                        return;
                    }
                    _sdkService.SetDeviceCredentials(json.RegistrationId, json.Username ?? "admin", json.Password ?? "");
                    _logger.LogInformation($"[API] Per-device credentials set for: {json.RegistrationId}");
                    await context.Response.WriteAsJsonAsync(new { success = true, message = "Device credentials registered", registrationId = json.RegistrationId });
                }
                catch (Exception ex)
                {
                    context.Response.StatusCode = 500;
                    await context.Response.WriteAsJsonAsync(new { success = false, error = ex.Message });
                }
            });

            // Get specific device
            _app.MapGet("/api/devices/{deviceId}", async context =>
            {
                var deviceId = context.Request.RouteValues["deviceId"]?.ToString();
                if (string.IsNullOrEmpty(deviceId))
                {
                    context.Response.StatusCode = 400;
                    await context.Response.WriteAsJsonAsync(new { error = "Device ID required" });
                    return;
                }

                var device = _sdkService.GetDevice(deviceId);
                if (device == null)
                {
                    context.Response.StatusCode = 404;
                    await context.Response.WriteAsJsonAsync(new { error = "Device not found" });
                    return;
                }

                await context.Response.WriteAsJsonAsync(device);
            });

            // Login to device
            _app.MapPost("/api/devices/login", async context =>
            {
                try
                {
                    var json = await System.Text.Json.JsonSerializer.DeserializeAsync<LoginRequest>(context.Request.Body);
                    if (json == null || string.IsNullOrEmpty(json.IP))
                    {
                        context.Response.StatusCode = 400;
                        await context.Response.WriteAsJsonAsync(new { error = "IP address required" });
                        return;
                    }

                    var device = await _sdkService.LoginToDevice(json.IP, json.Port, json.Username, json.Password);
                    if (device == null)
                    {
                        context.Response.StatusCode = 401;
                        await context.Response.WriteAsJsonAsync(new { error = "Failed to login to device" });
                        return;
                    }

                    await context.Response.WriteAsJsonAsync(new { success = true, device });
                }
                catch (Exception ex)
                {
                    context.Response.StatusCode = 500;
                    await context.Response.WriteAsJsonAsync(new { success = false, error = ex.Message });
                }
            });

            // Logout from device
            _app.MapPost("/api/devices/{deviceId}/logout", async context =>
            {
                try
                {
                    var deviceId = context.Request.RouteValues["deviceId"]?.ToString();
                    if (string.IsNullOrEmpty(deviceId))
                    {
                        context.Response.StatusCode = 400;
                        await context.Response.WriteAsJsonAsync(new { error = "Device ID required" });
                        return;
                    }

                    var result = await _sdkService.LogoutFromDevice(deviceId);
                    await context.Response.WriteAsJsonAsync(new { success = result });
                }
                catch (Exception ex)
                {
                    context.Response.StatusCode = 500;
                    await context.Response.WriteAsJsonAsync(new { success = false, error = ex.Message });
                }
            });

            // Simulate device event (for testing)
            _app.MapPost("/api/devices/{deviceId}/simulate-event", async context =>
            {
                try
                {
                    var deviceId = context.Request.RouteValues["deviceId"]?.ToString();
                    var json = await System.Text.Json.JsonSerializer.DeserializeAsync<EventRequest>(context.Request.Body);

                    if (string.IsNullOrEmpty(deviceId) || json == null)
                    {
                        context.Response.StatusCode = 400;
                        await context.Response.WriteAsJsonAsync(new { error = "Device ID and event data required" });
                        return;
                    }

                    _sdkService.SimulateDeviceEvent(deviceId, json.EventType, json.EventData);
                    await context.Response.WriteAsJsonAsync(new { success = true, message = "Event simulated" });
                }
                catch (Exception ex)
                {
                    context.Response.StatusCode = 500;
                    await context.Response.WriteAsJsonAsync(new { success = false, error = ex.Message });
                }
            });

            // Get device capabilities
            _app.MapGet("/api/devices/{deviceId}/capabilities", async context =>
            {
                var deviceId = context.Request.RouteValues["deviceId"]?.ToString();
                if (string.IsNullOrEmpty(deviceId))
                {
                    context.Response.StatusCode = 400;
                    await context.Response.WriteAsJsonAsync(new { error = "Device ID required" });
                    return;
                }

                var capabilities = await _sdkService.GetDeviceCapabilities(deviceId);
                if (capabilities == null)
                {
                    context.Response.StatusCode = 404;
                    await context.Response.WriteAsJsonAsync(new { error = "Device not found or not logged in" });
                    return;
                }

                await context.Response.WriteAsJsonAsync(capabilities);
            });

            // Query access records via CGI (LAN only - requires direct HTTP access to device)
            _app.MapGet("/api/devices/{deviceId}/access-records", async context =>
            {
                try
                {
                    var deviceId = context.Request.RouteValues["deviceId"]?.ToString();
                    if (string.IsNullOrEmpty(deviceId))
                    {
                        context.Response.StatusCode = 400;
                        await context.Response.WriteAsJsonAsync(new { error = "Device ID required" });
                        return;
                    }

                    var startTimeStr = context.Request.Query["startTime"];
                    var endTimeStr = context.Request.Query["endTime"];
                    var cardNumber = context.Request.Query["cardNumber"];
                    var maxRecordsStr = context.Request.Query["maxRecords"];

                    DateTime? startTime = null;
                    DateTime? endTime = null;
                    int maxRecords = 100;

                    if (!string.IsNullOrEmpty(startTimeStr) && DateTime.TryParse(startTimeStr, out var st))
                        startTime = st;
                    if (!string.IsNullOrEmpty(endTimeStr) && DateTime.TryParse(endTimeStr, out var et))
                        endTime = et;
                    if (!string.IsNullOrEmpty(maxRecordsStr) && int.TryParse(maxRecordsStr, out var mr))
                        maxRecords = mr;

                    var records = await _sdkService.QueryAccessRecords(deviceId, startTime, endTime, cardNumber, maxRecords);
                    await context.Response.WriteAsJsonAsync(new { success = true, count = records.Count, records });
                }
                catch (Exception ex)
                {
                    context.Response.StatusCode = 500;
                    await context.Response.WriteAsJsonAsync(new { success = false, error = ex.Message });
                }
            });

            // Query access records via NetSDK (Works over Internet/NAT - uses existing TCP connection)
            _app.MapGet("/api/devices/{deviceId}/access-records-sdk", async context =>
            {
                try
                {
                    var deviceId = context.Request.RouteValues["deviceId"]?.ToString();
                    if (string.IsNullOrEmpty(deviceId))
                    {
                        context.Response.StatusCode = 400;
                        await context.Response.WriteAsJsonAsync(new { error = "Device ID required" });
                        return;
                    }

                    var startTimeStr = context.Request.Query["startTime"];
                    var endTimeStr = context.Request.Query["endTime"];
                    var cardNumber = context.Request.Query["cardNumber"];
                    var maxRecordsStr = context.Request.Query["maxRecords"];

                    DateTime? startTime = null;
                    DateTime? endTime = null;
                    int maxRecords = 100;

                    if (!string.IsNullOrEmpty(startTimeStr) && DateTime.TryParse(startTimeStr, out var st))
                        startTime = st;
                    if (!string.IsNullOrEmpty(endTimeStr) && DateTime.TryParse(endTimeStr, out var et))
                        endTime = et;
                    if (!string.IsNullOrEmpty(maxRecordsStr) && int.TryParse(maxRecordsStr, out var mr))
                        maxRecords = mr;

                    var records = await _sdkService.QueryAccessRecordsBySDK(deviceId, startTime, endTime, cardNumber, maxRecords);
                    await context.Response.WriteAsJsonAsync(new { success = true, count = records.Count, records });
                }
                catch (Exception ex)
                {
                    context.Response.StatusCode = 500;
                    await context.Response.WriteAsJsonAsync(new { success = false, error = ex.Message });
                }
            });

            // Query access records via Module (TCP method - modular approach)
            _app.MapGet("/api/devices/{deviceId}/access-records-module", async context =>
            {
                try
                {
                    var deviceId = context.Request.RouteValues["deviceId"]?.ToString();
                    if (string.IsNullOrEmpty(deviceId))
                    {
                        context.Response.StatusCode = 400;
                        await context.Response.WriteAsJsonAsync(new { error = "Device ID required" });
                        return;
                    }

                    var startTimeStr = context.Request.Query["startTime"];
                    var endTimeStr = context.Request.Query["endTime"];
                    var cardNumber = context.Request.Query["cardNumber"];
                    var maxRecordsStr = context.Request.Query["maxRecords"];

                    DateTime? startTime = null;
                    DateTime? endTime = null;
                    int maxRecords = 1000;

                    if (!string.IsNullOrEmpty(startTimeStr) && DateTime.TryParse(startTimeStr, out var st))
                        startTime = st;
                    if (!string.IsNullOrEmpty(endTimeStr) && DateTime.TryParse(endTimeStr, out var et))
                        endTime = et;
                    if (!string.IsNullOrEmpty(maxRecordsStr) && int.TryParse(maxRecordsStr, out var mr))
                        maxRecords = mr;

                    var records = await _sdkService.QueryAccessRecordsViaModule(deviceId, startTime, endTime, cardNumber, maxRecords);
                    await context.Response.WriteAsJsonAsync(new { success = true, count = records.Count, records });
                }
                catch (Exception ex)
                {
                    context.Response.StatusCode = 500;
                    await context.Response.WriteAsJsonAsync(new { success = false, error = ex.Message });
                }
            });

            // Get door status
            _app.MapGet("/api/devices/{deviceId}/door-status", async context =>
            {
                try
                {
                    var deviceId = context.Request.RouteValues["deviceId"]?.ToString();
                    if (string.IsNullOrEmpty(deviceId))
                    {
                        context.Response.StatusCode = 400;
                        await context.Response.WriteAsJsonAsync(new { error = "Device ID required" });
                        return;
                    }

                    var channelStr = context.Request.Query["channel"];
                    int channel = 1;
                    if (!string.IsNullOrEmpty(channelStr) && int.TryParse(channelStr, out var ch))
                        channel = ch;

                    var result = await _sdkService.GetDoorStatus(deviceId, channel);
                    await context.Response.WriteAsJsonAsync(result);
                }
                catch (Exception ex)
                {
                    context.Response.StatusCode = 500;
                    await context.Response.WriteAsJsonAsync(new { success = false, error = ex.Message });
                }
            });

            // Open door
            _app.MapPost("/api/devices/{deviceId}/open-door", async context =>
            {
                try
                {
                    var deviceId = context.Request.RouteValues["deviceId"]?.ToString();
                    if (string.IsNullOrEmpty(deviceId))
                    {
                        context.Response.StatusCode = 400;
                        await context.Response.WriteAsJsonAsync(new { error = "Device ID required" });
                        return;
                    }

                    var channelStr = context.Request.Query["channel"];
                    int channel = 1;
                    if (!string.IsNullOrEmpty(channelStr) && int.TryParse(channelStr, out var ch))
                        channel = ch;

                    var result = await _sdkService.OpenDoor(deviceId, channel);
                    await context.Response.WriteAsJsonAsync(result);
                }
                catch (Exception ex)
                {
                    context.Response.StatusCode = 500;
                    await context.Response.WriteAsJsonAsync(new { success = false, error = ex.Message });
                }
            });

            // Close door
            _app.MapPost("/api/devices/{deviceId}/close-door", async context =>
            {
                try
                {
                    var deviceId = context.Request.RouteValues["deviceId"]?.ToString();
                    if (string.IsNullOrEmpty(deviceId))
                    {
                        context.Response.StatusCode = 400;
                        await context.Response.WriteAsJsonAsync(new { error = "Device ID required" });
                        return;
                    }

                    var channelStr = context.Request.Query["channel"];
                    int channel = 1;
                    if (!string.IsNullOrEmpty(channelStr) && int.TryParse(channelStr, out var ch))
                        channel = ch;

                    var result = await _sdkService.CloseDoor(deviceId, channel);
                    await context.Response.WriteAsJsonAsync(result);
                }
                catch (Exception ex)
                {
                    context.Response.StatusCode = 500;
                    await context.Response.WriteAsJsonAsync(new { success = false, error = ex.Message });
                }
            });

            // Add person to device
            _app.MapPost("/api/persons/add-to-device", async context =>
            {
                // IMMEDIATE console logging to verify endpoint is hit
                Console.WriteLine("================================================================================");
                Console.WriteLine("🔔 HTTP ENDPOINT HIT: /api/persons/add-to-device");
                Console.WriteLine($"   Timestamp: {DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}");
                Console.WriteLine("================================================================================");
                
                try
                {
                    // Read the multipart form data
                    var form = await context.Request.ReadFormAsync();

                    var deviceId = form["deviceId"].ToString();
                    var personId = form["personId"].ToString();
                    var personName = form["personName"].ToString();
                    var cardNumber = form["cardNumber"].ToString();
                    var oldCardNumber = form["oldCardNumber"].ToString();
                    var isUpdateStr = form["isUpdate"].ToString();
                    bool isUpdate = isUpdateStr?.ToLower() == "true";

                    _logger.LogInformation($"[HTTP-ENDPOINT] Received request - DeviceId: {deviceId}, PersonId: {personId}, PersonName: {personName}, CardNumber: {cardNumber}, OldCardNumber: {oldCardNumber}, IsUpdate: {isUpdate}");
                    _logger.LogInformation($"[HTTP-ENDPOINT] Face image file: {form.Files["faceImage"]?.FileName ?? "none"}, Size: {form.Files["faceImage"]?.Length ?? 0} bytes");

                    if (string.IsNullOrEmpty(deviceId) || string.IsNullOrEmpty(personId))
                    {
                        context.Response.StatusCode = 400;
                        await context.Response.WriteAsJsonAsync(new { success = false, error = "Device ID and Person ID are required" });
                        return;
                    }

                    var request = new AddPersonRequest
                    {
                        DeviceID = deviceId,
                        PersonID = personId,
                        PersonName = personName,
                        CardNumber = cardNumber,
                        OldCardNumber = oldCardNumber,
                        IsUpdate = isUpdate
                    };

                    // Read face image if provided
                    var faceImageFile = form.Files["faceImage"];
                    if (faceImageFile != null && faceImageFile.Length > 0)
                    {
                        using var memoryStream = new MemoryStream();
                        await faceImageFile.CopyToAsync(memoryStream);
                        request.FaceImage = memoryStream.ToArray();
                        request.FaceImageType = faceImageFile.ContentType?.Split('/')[1] ?? "jpeg";
                        _logger.LogInformation($"[UPLOAD] Received face image: {faceImageFile.FileName}, Size: {request.FaceImage.Length} bytes ({request.FaceImage.Length / 1024.0:F2} KB), Content-Type: {faceImageFile.ContentType}");
                    }
                    else
                    {
                        _logger.LogInformation($"[UPLOAD] No face image received in request");
                    }

                    var result = await _sdkService.AddPersonToDeviceAsync(request);
                    await context.Response.WriteAsJsonAsync(new { success = result.Success, result });
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error adding person to device");
                    context.Response.StatusCode = 500;
                    await context.Response.WriteAsJsonAsync(new { success = false, error = ex.Message });
                }
            });

            _logger.LogInformation($"HTTP API Server starting on port {_port}");
            await _app.RunAsync();
        }

        public async Task StopAsync()
        {
            if (_app != null)
            {
                await _app.StopAsync();
                _logger.LogInformation("HTTP API Server stopped");
            }
        }
    }

    // Request models
    public class StartAutoRegRequest
    {
        public int Port { get; set; } = 9500;
    }

    public class PlatformCredentialsRequest
    {
        public string Username { get; set; } = "admin";
        public string Password { get; set; } = string.Empty;
    }

    public class DeviceCredentialsRequest
    {
        public string RegistrationId { get; set; } = string.Empty;
        public string Username { get; set; } = "admin";
        public string Password { get; set; } = string.Empty;
    }

    public class LoginRequest
    {
        public string IP { get; set; } = string.Empty;
        public int Port { get; set; } = 37777;
        public string Username { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
    }

    public class EventRequest
    {
        public string EventType { get; set; } = string.Empty;
        public string EventData { get; set; } = string.Empty;
    }
}
