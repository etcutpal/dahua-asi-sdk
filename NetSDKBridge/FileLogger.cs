using System;
using System.IO;
using Microsoft.Extensions.Logging;
using System.Timers;

namespace NetSDKBridge
{
    /// <summary>
    /// Simple file logger extension for Microsoft.Extensions.Logging
    /// Supports daily log rotation at midnight
    /// </summary>
    public static class FileLoggerExtensions
    {
        public static ILoggingBuilder AddFile(this ILoggingBuilder builder, string filePath, bool dailyRotation = false)
        {
            builder.AddProvider(new FileLoggerProvider(filePath, dailyRotation));
            return builder;
        }
    }

    public class FileLoggerProvider : ILoggerProvider
    {
        private readonly string _filePath;
        private readonly bool _dailyRotation;

        public FileLoggerProvider(string filePath, bool dailyRotation = false)
        {
            _filePath = filePath;
            _dailyRotation = dailyRotation;
        }

        public ILogger CreateLogger(string categoryName)
        {
            return new FileLogger(_filePath, categoryName, _dailyRotation);
        }

        public void Dispose() { }
    }

    public class FileLogger : ILogger
    {
        private readonly string _baseFilePath;
        private readonly string _categoryName;
        private readonly bool _dailyRotation;
        private readonly object _lock = new object();
        private string _currentFilePath;
        private string _currentDate;
        private readonly System.Timers.Timer _rotationTimer;

        public FileLogger(string filePath, string categoryName, bool dailyRotation = false)
        {
            _baseFilePath = filePath;
            _categoryName = categoryName;
            _dailyRotation = dailyRotation;
            _currentDate = DateTime.Now.ToString("yyyy-MM-dd");
            _currentFilePath = dailyRotation ? GetDailyLogPath(filePath) : filePath;

            if (dailyRotation)
            {
                // Calculate time until next midnight
                var now = DateTime.Now;
                var nextMidnight = now.Date.AddDays(1); // Next midnight
                var timeUntilMidnight = nextMidnight - now;

                // Setup timer for daily rotation
                _rotationTimer = new System.Timers.Timer(timeUntilMidnight.TotalMilliseconds);
                _rotationTimer.Elapsed += RotateLog;
                _rotationTimer.AutoReset = true;
                _rotationTimer.Start();
            }
        }

        private string GetDailyLogPath(string basePath)
        {
            var today = DateTime.Now.ToString("yyyy-MM-dd");
            var directory = Path.GetDirectoryName(basePath);
            var fileNameWithoutExt = Path.GetFileNameWithoutExtension(basePath);
            var extension = Path.GetExtension(basePath);
            
            return Path.Combine(directory, $"{fileNameWithoutExt}-{today}{extension}");
        }

        private void RotateLog(object sender, ElapsedEventArgs e)
        {
            lock (_lock)
            {
                var newDate = DateTime.Now.ToString("yyyy-MM-dd");
                if (newDate != _currentDate)
                {
                    _currentDate = newDate;
                    _currentFilePath = GetDailyLogPath(_baseFilePath);
                    
                    // Log the rotation event
                    var timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff");
                    var logEntry = $"[{timestamp}] [INFO] [FileLogger] Log file rotated. New file: {Path.GetFileName(_currentFilePath)}{Environment.NewLine}";
                    
                    try
                    {
                        File.AppendAllText(_currentFilePath, logEntry);
                    }
                    catch
                    {
                        // Silently fail
                    }
                }
            }
        }

        public IDisposable BeginScope<TState>(TState state) => null;

        public bool IsEnabled(LogLevel logLevel) => logLevel >= LogLevel.Debug;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception exception, Func<TState, Exception, string> formatter)
        {
            if (!IsEnabled(logLevel))
            {
                return;
            }

            var message = formatter(state, exception);
            var timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff");
            var level = logLevel.ToString().ToUpper();

            var logEntry = $"[{timestamp}] [{level}] [{_categoryName}] {message}{Environment.NewLine}";

            if (exception != null)
            {
                logEntry += $"Exception: {exception}{Environment.NewLine}";
            }

            lock (_lock)
            {
                try
                {
                    File.AppendAllText(_currentFilePath, logEntry);
                }
                catch
                {
                    // Silently fail if can't write to file
                }
            }
        }
    }
}
