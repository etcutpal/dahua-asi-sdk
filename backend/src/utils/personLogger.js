const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'person-operations.log');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function getTimestamp() {
  return new Date().toISOString();
}

function formatLog(level, operation, details) {
  const timestamp = getTimestamp();
  const separator = '='.repeat(80);
  return [
    separator,
    `[${timestamp}] [${level}] [${operation}]`,
    JSON.stringify(details, null, 2),
    separator,
    ''
  ].join('\n');
}

function appendToLog(content) {
  fs.appendFileSync(LOG_FILE, content + '\n', 'utf8');
}

function logPersonOperation(operation, details) {
  const logEntry = formatLog('INFO', operation, details);
  appendToLog(logEntry);
  console.log(`[PERSON-LOG] ${operation}: ${JSON.stringify(details)}`);
}

function logPersonError(operation, error, details = {}) {
  const logEntry = formatLog('ERROR', operation, { ...details, error: error.message || error, stack: error.stack });
  appendToLog(logEntry);
  console.error(`[PERSON-LOG ERROR] ${operation}: ${error.message || error}`);
}

function logPersonDeviceSync(operation, details) {
  const logEntry = formatLog('DEVICE-SYNC', operation, details);
  appendToLog(logEntry);
  console.log(`[PERSON-DEVICE-SYNC] ${operation}: ${JSON.stringify(details)}`);
}

// Initialize log file with header on first use
if (!fs.existsSync(LOG_FILE)) {
  const header = `
================================================================================
PERSON OPERATIONS LOG
Created: ${getTimestamp()}
Tracks: Person CREATE, UPDATE, DELETE, and Device Sync operations
================================================================================

`;
  fs.writeFileSync(LOG_FILE, header, 'utf8');
}

module.exports = {
  logPersonOperation,
  logPersonError,
  logPersonDeviceSync
};
