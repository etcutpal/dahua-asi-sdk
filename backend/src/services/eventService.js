/**
 * eventService.js - DEPRECATED
 * 
 * This file is kept for backward compatibility only.
 * All functionality has been moved to accessRecordService.js with repository pattern.
 * 
 * Returns the singleton instance for backward compatibility.
 * 
 * This file will be removed in a future version.
 */

const AccessRecordService = require('./accessRecordService');

// Return the singleton instance
module.exports = AccessRecordService.getInstance();
