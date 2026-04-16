import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'person-operations.log');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function getTimestamp(): string {
  return new Date().toISOString();
}

function formatLog(level: string, operation: string, details: Record<string, any>): string {
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

function appendToLog(content: string): void {
  fs.appendFileSync(LOG_FILE, content + '\n', 'utf8');
}

export function logPersonOperation(operation: string, details: Record<string, any>): void {
  const logEntry = formatLog('INFO', operation, details);
  appendToLog(logEntry);
  console.log(`[PERSON-LOG] ${operation}: ${JSON.stringify(details)}`);
}

export function logPersonError(operation: string, error: Error | string, details: Record<string, any> = {}): void {
  const errorMessage = error instanceof Error ? error.message : error;
  const stack = error instanceof Error ? error.stack : undefined;
  const logEntry = formatLog('ERROR', operation, { ...details, error: errorMessage, stack });
  appendToLog(logEntry);
  console.error(`[PERSON-LOG ERROR] ${operation}: ${errorMessage}`);
}

export function logPersonDeviceSync(operation: string, details: Record<string, any>): void {
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
