using System;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace NetSDKBridge
{
    class BridgeConfig
    {
        public PortsConfig Ports { get; set; } = new();
        public NetworkConfig Network { get; set; } = new();
        public BridgeCredentials Bridge { get; set; } = new();
    }
    class PortsConfig
    {
        public int Frontend { get; set; } = 3000;
        public int Backend { get; set; } = 3001;
        public int Bridge { get; set; } = 5000;
        public int AutoReg { get; set; } = 9500;
    }
    class NetworkConfig
    {
        public string LocalAccessIp { get; set; } = "127.0.0.1";
        public string DeviceRegistrationIp { get; set; } = "127.0.0.1";
    }
    class BridgeCredentials
    {
        public string PlatformUsername { get; set; } = "admin";
        public string PlatformPassword { get; set; } = "admin123";
    }

    class Program
    {
        static BridgeConfig LoadConfig()
        {
            // Look for shared/server.config.json relative to the exe or solution root
            var candidates = new[]
            {
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", "..", "..", "..", "shared", "server.config.json"),
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "shared", "server.config.json"),
                Path.Combine(Directory.GetCurrentDirectory(), "..", "shared", "server.config.json"),
            };
            foreach (var candidate in candidates)
            {
                var full = Path.GetFullPath(candidate);
                if (File.Exists(full))
                {
                    try
                    {
                        var json = File.ReadAllText(full);
                        var opts = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                        var cfg = JsonSerializer.Deserialize<BridgeConfig>(json, opts);
                        Console.WriteLine($"✅ Loaded config from: {full}");
                        return cfg ?? new BridgeConfig();
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"⚠️  Failed to parse config at {full}: {ex.Message}");
                    }
                }
            }
            Console.WriteLine("⚠️  shared/server.config.json not found — using defaults");
            return new BridgeConfig();
        }

        static async Task Main(string[] args)
        {
            Console.WriteLine("╔══════════════════════════════════════════════════════════╗");
            Console.WriteLine("║           NetSDK Bridge Service v1.0                     ║");
            Console.WriteLine("║     Auto Registration & Device Management Server         ║");
            Console.WriteLine("╚══════════════════════════════════════════════════════════╝");
            Console.WriteLine();

            // Load shared configuration
            var bridgeCfg = LoadConfig();

            // Setup logging with file output
            var services = new ServiceCollection();
            
            // Create logs directory if it doesn't exist
            string logDirectory = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "logs");
            if (!Directory.Exists(logDirectory))
            {
                Directory.CreateDirectory(logDirectory);
            }

            // Generate log file name with timestamp
            string logFileName = $"netsdk-bridge-{DateTime.Now:yyyy-MM-dd-HH-mm-ss}.log";
            string logFilePath = Path.Combine(logDirectory, logFileName);

            Console.WriteLine($"📝 Log file: {logFilePath}");
            Console.WriteLine();

            services.AddLogging(builder =>
            {
                builder.AddConsole();
                builder.AddFile(Path.Combine(logDirectory, "netsdk-bridge.log"), dailyRotation: true);
                builder.SetMinimumLevel(LogLevel.Debug); // Set to Debug for detailed logging
            });
            
            services.AddSingleton<SDKBridgeService>();
            services.AddSingleton<HttpApiServer>();

            var serviceProvider = services.BuildServiceProvider();
            var sdkService = serviceProvider.GetRequiredService<SDKBridgeService>();
            var httpServer = serviceProvider.GetRequiredService<HttpApiServer>();
            var logger = serviceProvider.GetRequiredService<ILogger<Program>>();

            logger.LogInformation("=".PadRight(60, '='));
            logger.LogInformation("NetSDK Bridge Service Starting");
            logger.LogInformation("=".PadRight(60, '='));

            // Handle graceful shutdown
            Console.CancelKeyPress += async (sender, e) =>
            {
                Console.WriteLine("\n⚠️  Shutting down...");
                logger.LogInformation("Shutdown signal received");
                await sdkService.Cleanup();
                await httpServer.StopAsync();
                logger.LogInformation("Shutdown complete");
                Environment.Exit(0);
            };

            try
            {
                // Start HTTP API Server (port from config)
                int httpPort = bridgeCfg.Ports.Bridge;
                if (args.Length > 0 && int.TryParse(args[0], out int port))
                {
                    httpPort = port;
                }

                logger.LogInformation($"HTTP API Server will start on port {httpPort}");

                // Start HTTP server in background
                var httpTask = httpServer.StartAsync();

                // Server IP is now configured via environment variable
                string serverIP = sdkService.GetServerIP();
                logger.LogInformation($"Server IP from environment: {serverIP}");

                // Set the username/password that devices will use to authenticate
                // These MUST match what you configured on your Access Control Device
                logger.LogInformation("Setting platform credentials...");
                sdkService.SetPlatformCredentials(bridgeCfg.Bridge.PlatformUsername, bridgeCfg.Bridge.PlatformPassword);
                logger.LogInformation($"✅ Platform credentials set - Username: {bridgeCfg.Bridge.PlatformUsername}, Password: [HIDDEN]");

                // Configure Webhook URL for real-time status updates (replaces polling)
                logger.LogInformation("Configuring Webhook for real-time updates...");
                string webhookUrl = $"http://localhost:{bridgeCfg.Ports.Backend}/api/webhooks/device-status";
                sdkService.SetBackendWebhookUrl(webhookUrl);
                logger.LogInformation($"✅ Webhook configured: {webhookUrl}");

                // Auto-initialize SDK
                logger.LogInformation("Initializing NetSDK...");
                await sdkService.InitializeSDK();

                logger.LogInformation("Starting Auto Registration Server...");
                await sdkService.StartAutoRegServer(bridgeCfg.Ports.AutoReg);

                logger.LogInformation("=".PadRight(60, '='));
                logger.LogInformation("✅ NetSDK Bridge Service is READY");
                logger.LogInformation("=".PadRight(60, '='));
                logger.LogInformation("");
                logger.LogInformation("📋 Configuration:");
                logger.LogInformation($"   Server IP: {serverIP}");
                logger.LogInformation($"   Auto-Reg Port: {bridgeCfg.Ports.AutoReg}");
                logger.LogInformation($"   Platform Username: {bridgeCfg.Bridge.PlatformUsername}");
                logger.LogInformation($"   Platform Password: [HIDDEN]");
                logger.LogInformation("");
                logger.LogInformation("📱 Expected Device Configuration:");
                logger.LogInformation($"   Registration ID: ASI11");
                logger.LogInformation($"   Device Username: {bridgeCfg.Bridge.PlatformUsername}");
                logger.LogInformation($"   Device Password: [HIDDEN]");
                logger.LogInformation($"   Server IP: {serverIP}");
                logger.LogInformation($"   Server Port: {bridgeCfg.Ports.AutoReg}");
                logger.LogInformation("");
                logger.LogInformation("🔍 Waiting for device connection...");
                logger.LogInformation("   Check logs in: " + logFilePath);
                logger.LogInformation("");

                // Wait for HTTP server task
                await httpTask;
            }
            catch (Exception ex)
            {
                logger.LogCritical(ex, "Fatal error occurred");
                Console.WriteLine($"❌ Fatal error: {ex.Message}");
                Console.WriteLine(ex.StackTrace);
            }
        }
    }
}
