# Repository Pattern Architecture

## Overview

This backend now uses the **Repository Pattern** to handle access events and records storage. This architecture makes it easy to switch between JSON files and a real database (MySQL/SQL Server) without changing any business logic code.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Webhook Request                          │
│              POST /api/webhooks/access-events                │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    webhooks.js                               │
│              (Route Handler)                                 │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              accessRecordService.js                          │
│                (Unified Service)                             │
│                                                              │
│  • storeAccessEvent() - handles both storage types          │
│  • getRecentEvents() - real-time events (100 limit)         │
│  • getRecords() - access records (unlimited)                │
│  • Emits WebSocket events for real-time updates             │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              IAccessRepository.js                            │
│              (Interface/Contract)                            │
│                                                              │
│  Defines methods that all repositories must implement:       │
│  • storeEvent(event)                                         │
│  • storeRecord(record)                                       │
│  • getRecentEvents(limit)                                    │
│  • getRecords(filters)                                       │
│  • etc...                                                    │
└────────────────────────┬────────────────────────────────────┘
                         │
          ┌──────────────┴──────────────┐
          │                             │
          ▼                             ▼
┌──────────────────┐          ┌──────────────────┐
│ FileRepository   │          │ SQLRepository    │
│ (Current)        │          │ (Future)         │
│                  │          │                  │
│ access-events    │          │ access_events    │
│ .json            │          │ table            │
│ (100 records)    │          │                  │
│                  │          │ access_records   │
│ access-record    │          │ table            │
│ .json            │          │ (unlimited)      │
│ (50K records)    │          │                  │
└──────────────────┘          └──────────────────┘
```

## File Structure

```
backend/
├── src/
│   ├── repositories/
│   │   ├── IAccessRepository.js      # Interface (contract)
│   │   └── FileRepository.js         # Current implementation (JSON files)
│   │
│   ├── services/
│   │   ├── accessRecordService.js    # Unified service (main)
│   │   └── eventService.js           # DEPRECATED - use accessRecordService
│   │
│   ├── routes/
│   │   ├── webhooks.js               # Uses accessRecordService
│   │   ├── events.js                 # Uses accessRecordService
│   │   └── access-records.js         # Uses accessRecordService
│   │
│   └── server.js                     # Initializes repository + service
│
└── data/
    ├── access-events.json            # Real-time events (last 100)
    └── access-record.json            # Access records history (unlimited)
```

## How It Works

### 1. Initialization (server.js)

```javascript
// Create repository
const fileRepository = new FileRepository();

// Create service with repository injection
const accessRecordService = new AccessRecordService(fileRepository);

// Initialize
await accessRecordService.initialize();
```

### 2. Storing Events (webhooks.js)

```javascript
// When webhook receives event
await accessRecordService.storeAccessEvent({
  type: 'access_control_event',
  deviceId: 'ASI12',
  timestamp: '2026-04-13T10:30:00Z',
  data: { ... }
});

// Service automatically:
// 1. Stores raw event → access-events.json (via repository)
// 2. Extracts & stores record → access-record.json (via repository)
// 3. Emits WebSocket event for real-time updates
```

### 3. Repository Handles Storage

```javascript
// FileRepository does:
await this.storeEvent(event);     // Writes to access-events.json
await this.storeRecord(record);   // Writes to access-record.json

// Future SQLRepository will do:
await pool.query('INSERT INTO access_events ...', [event]);
await pool.query('INSERT INTO access_records ...', [record]);
```

## Storage Strategy

### access-events.json (Real-time Events)
- **Purpose**: Real-time WebSocket streaming to frontend
- **Limit**: Last 100 records only
- **Why**: Frontend only needs recent events for live updates
- **Auto-trim**: Old events deleted automatically

### access-record.json (Access Records)
- **Purpose**: Access Records page display, filtering, pagination
- **Limit**: Up to 50,000 records (configurable)
- **Why**: Full history for auditing and analytics
- **Auto-trim**: Only when exceeding max limit

## Database Migration

### When to Migrate?

Migrate to MySQL/SQL Server when:
- You have 10+ devices sending events
- JSON file size exceeds 10MB
- Query time becomes noticeable (>1 second)
- You need concurrent write safety
- You want better backup/restore capabilities

### How to Migrate?

**Step 1**: Install SQL driver
```bash
npm install mysql2
# or
npm install tedious  # For SQL Server
```

**Step 2**: Create SQLRepository.js
```javascript
// See IAccessRepository.js for complete schema design
class SQLRepository extends IAccessRepository {
  constructor(connectionPool) {
    super();
    this.pool = connectionPool;
  }

  async storeEvent(event) {
    await this.pool.query(
      'INSERT INTO access_events (id, device_id, ...) VALUES (?, ?, ...)',
      [event.id, event.deviceId, ...]
    );
    // ... implement other methods
  }

  // ... implement all interface methods
}
```

**Step 3**: Update server.js
```javascript
// OLD (File):
const fileRepository = new FileRepository();

// NEW (SQL):
const mysql = require('mysql2/promise');
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 20
});

const sqlRepository = new SQLRepository(pool);
const accessRecordService = new AccessRecordService(sqlRepository);
```

**Step 4**: Run migration script
```javascript
// Migrate existing JSON data to SQL
const FileRepository = require('./repositories/FileRepository');
const SQLRepository = require('./repositories/SQLRepository');

const fileRepo = new FileRepository();
await fileRepo.initialize();

const sqlRepo = new SQLRepository(pool);
const records = await fileRepo.getAllRecords();
const events = await fileRepo.getRecentEvents(1000);

for (const record of records) {
  await sqlRepo.storeRecord(record);
}
for (const event of events) {
  await sqlRepo.storeEvent(event);
}
```

**That's it!** No changes needed in routes or services.

## Database Schema

Complete SQL schema with indexes is documented in:
- `src/repositories/IAccessRepository.js` (lines 10-100)

### Tables:
1. **access_events** - Raw events for real-time streaming
2. **access_records** - Formatted records for history/analytics

### Features:
- Connection pooling for concurrent writes
- Indexes for fast queries
- Monthly partitioning for large datasets
- Bulk insert support

## Benefits of This Architecture

✅ **Zero code changes** when migrating to database
✅ **Test everything** with JSON files first
✅ **Just swap repository** when database is ready
✅ **Single service** writes to both files (no duplication)
✅ **Clear separation** of concerns
✅ **Easy to test** each component independently
✅ **Scalable** - handles 100+ devices with SQL
✅ **Maintainable** - change storage without touching business logic

## Current Limits

| Storage | Limit | Auto-Trim |
|---------|-------|-----------|
| access-events.json | 100 records | Yes (keeps last 100) |
| access-record.json | 50,000 records | Yes (trims to 50K) |

These limits are configurable in `FileRepository.js`:
```javascript
this.maxEvents = 100;      // Change this
this.maxRecords = 50000;   // Change this
```

## Future Enhancements

1. **SQLRepository implementation** for MySQL/SQL Server
2. **Caching layer** (Redis) for frequently accessed records
3. **Archive old records** to separate tables by month
4. **Bulk insert** optimization for high-throughput scenarios
5. **WebSocket rooms** for device-specific real-time updates
6. **Analytics API** for access pattern insights

---

**Created**: 2026-04-13
**Last Updated**: 2026-04-13
**Version**: 2.0 (Repository Pattern)
