using System;
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

            // Get all devices
            _app.MapGet("/api/devices", context =>
            {
                var devices = _sdkService.GetAllDevices();
                return context.Response.WriteAsJsonAsync(devices);
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

            // Query access records
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
