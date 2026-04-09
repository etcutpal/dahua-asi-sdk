using System;
using System.IO;
using Microsoft.Extensions.Logging;

namespace NetSDKBridge
{
    /// <summary>
    /// Simple file logger extension for Microsoft.Extensions.Logging
    /// </summary>
    public static class FileLoggerExtensions
    {
        public static ILoggingBuilder AddFile(this ILoggingBuilder builder, string filePath)
        {
            builder.AddProvider(new FileLoggerProvider(filePath));
            return builder;
        }
    }

    public class FileLoggerProvider : ILoggerProvider
    {
        private readonly string _filePath;

        public FileLoggerProvider(string filePath)
        {
            _filePath = filePath;
        }

        public ILogger CreateLogger(string categoryName)
        {
            return new FileLogger(_filePath, categoryName);
        }

        public void Dispose() { }
    }

    public class FileLogger : ILogger
    {
        private readonly string _filePath;
        private readonly string _categoryName;
        private readonly object _lock = new object();

        public FileLogger(string filePath, string categoryName)
        {
            _filePath = filePath;
            _categoryName = categoryName;
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
                    File.AppendAllText(_filePath, logEntry);
                }
                catch
                {
                    // Silently fail if can't write to file
                }
            }
        }
    }
}
