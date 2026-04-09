using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace NetSDKBridge
{
    class Program
    {
        static async Task Main(string[] args)
        {
            Console.WriteLine("╔══════════════════════════════════════════════════════════╗");
            Console.WriteLine("║           NetSDK Bridge Service v1.0                     ║");
            Console.WriteLine("║     Auto Registration & Device Management Server         ║");
            Console.WriteLine("╚══════════════════════════════════════════════════════════╝");
            Console.WriteLine();

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
                builder.AddFile(Path.Combine(logDirectory, "netsdk-bridge.log"));
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
                // Start HTTP API Server (default port 5000)
                int httpPort = 5000;
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
                sdkService.SetPlatformCredentials("admin", "admin123");
                logger.LogInformation("✅ Platform credentials set - Username: admin, Password: [HIDDEN]");

                // Configure Webhook URL for real-time status updates (replaces polling)
                logger.LogInformation("Configuring Webhook for real-time updates...");
                sdkService.SetBackendWebhookUrl("http://localhost:3001/api/webhooks/device-status");
                logger.LogInformation("✅ Webhook configured - Backend will receive instant status updates");

                // Auto-initialize SDK
                logger.LogInformation("Initializing NetSDK...");
                await sdkService.InitializeSDK();

                logger.LogInformation("Starting Auto Registration Server...");
                await sdkService.StartAutoRegServer(9500);

                logger.LogInformation("=".PadRight(60, '='));
                logger.LogInformation("✅ NetSDK Bridge Service is READY");
                logger.LogInformation("=".PadRight(60, '='));
                logger.LogInformation("");
                logger.LogInformation("📋 Configuration:");
                logger.LogInformation($"   Server IP: {serverIP}");
                logger.LogInformation($"   Auto-Reg Port: 9500");
                logger.LogInformation($"   Platform Username: admin");
                logger.LogInformation($"   Platform Password: [HIDDEN]");
                logger.LogInformation("");
                logger.LogInformation("📱 Expected Device Configuration:");
                logger.LogInformation($"   Registration ID: ASI11");
                logger.LogInformation($"   Device Username: admin");
                logger.LogInformation($"   Device Password: admin123");
                logger.LogInformation($"   Server IP: {serverIP}");
                logger.LogInformation($"   Server Port: 9500");
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
