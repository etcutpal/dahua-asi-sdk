# Database Migration Quick Reference

## SQL Schema (Copy-Paste Ready)

### MySQL Schema

```sql
-- Create database
CREATE DATABASE IF NOT EXISTS access_control CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE access_control;

-- Table 1: Raw Access Events (Real-time WebSocket streaming)
-- Purpose: Store raw device events for real-time frontend updates
-- Retention: Keep only last 100 records (configurable)

CREATE TABLE IF NOT EXISTS access_events (
    id VARCHAR(36) PRIMARY KEY,
    device_id VARCHAR(50) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    user_id VARCHAR(50) DEFAULT NULL,
    card_number VARCHAR(50) DEFAULT NULL,
    is_success BOOLEAN DEFAULT FALSE,
    similarity INT DEFAULT 0,
    open_method VARCHAR(50) DEFAULT 'Unknown',
    raw_data JSON,
    timestamp DATETIME NOT NULL,
    stored_at DATETIME NOT NULL,
    source VARCHAR(50) DEFAULT 'GENERAL_EVENT_MANAGER',
    INDEX idx_device_id (device_id),
    INDEX idx_timestamp (timestamp),
    INDEX idx_stored_at (stored_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table 2: Access Records (Access Records page display)
-- Purpose: Store formatted access records for history/analytics
-- Retention: Keep ALL records (unlimited history)

CREATE TABLE IF NOT EXISTS access_records (
    id VARCHAR(36) PRIMARY KEY,
    device_id VARCHAR(50) NOT NULL,
    record_number BIGINT DEFAULT 0,
    user_id VARCHAR(50) DEFAULT '',
    user_name VARCHAR(100) DEFAULT '',
    card_number VARCHAR(50) DEFAULT '',
    swipe_time DATETIME NOT NULL,
    door_number INT DEFAULT 0,
    reader_no VARCHAR(20) DEFAULT '',
    card_type VARCHAR(20) DEFAULT 'Unknown',
    status ENUM('Success', 'Failed') NOT NULL,
    stored_at DATETIME NOT NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_device_id (device_id),
    INDEX idx_swipe_time (swipe_time),
    INDEX idx_status (status),
    INDEX idx_card_number (card_number),
    INDEX idx_stored_at (stored_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### SQL Server Schema

```sql
-- Create database
CREATE DATABASE access_control;
GO
USE access_control;
GO

-- Table 1: Raw Access Events
CREATE TABLE access_events (
    id VARCHAR(36) PRIMARY KEY,
    device_id VARCHAR(50) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    user_id VARCHAR(50) NULL,
    card_number VARCHAR(50) NULL,
    is_success BIT DEFAULT 0,
    similarity INT DEFAULT 0,
    open_method VARCHAR(50) DEFAULT 'Unknown',
    raw_data NVARCHAR(MAX),  -- JSON stored as string
    timestamp DATETIME2 NOT NULL,
    stored_at DATETIME2 NOT NULL,
    source VARCHAR(50) DEFAULT 'GENERAL_EVENT_MANAGER'
);
GO

CREATE INDEX idx_device_id ON access_events(device_id);
CREATE INDEX idx_timestamp ON access_events(timestamp);
CREATE INDEX idx_stored_at ON access_events(stored_at);
GO

-- Table 2: Access Records
CREATE TABLE access_records (
    id VARCHAR(36) PRIMARY KEY,
    device_id VARCHAR(50) NOT NULL,
    record_number BIGINT DEFAULT 0,
    user_id VARCHAR(50) DEFAULT '',
    user_name VARCHAR(100) DEFAULT '',
    card_number VARCHAR(50) DEFAULT '',
    swipe_time DATETIME2 NOT NULL,
    door_number INT DEFAULT 0,
    reader_no VARCHAR(20) DEFAULT '',
    card_type VARCHAR(20) DEFAULT 'Unknown',
    status VARCHAR(10) NOT NULL CHECK (status IN ('Success', 'Failed')),
    stored_at DATETIME2 NOT NULL
);
GO

CREATE INDEX idx_user_id ON access_records(user_id);
CREATE INDEX idx_device_id ON access_records(device_id);
CREATE INDEX idx_swipe_time ON access_records(swipe_time);
CREATE INDEX idx_status ON access_records(status);
CREATE INDEX idx_card_number ON access_records(card_number);
CREATE INDEX idx_stored_at ON access_records(stored_at);
GO
```

## Migration Script Template

```javascript
// migrate-to-sql.js
const mysql = require('mysql2/promise');
const FileRepository = require('./src/repositories/FileRepository');
const SQLRepository = require('./src/repositories/SQLRepository');

async function migrate() {
  console.log('📊 Starting migration from JSON to MySQL...');

  // 1. Connect to MySQL
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'access_control',
    connectionLimit: 10
  });

  console.log('✅ Connected to MySQL');

  // 2. Initialize repositories
  const fileRepo = new FileRepository();
  await fileRepo.initialize();

  const sqlRepo = new SQLRepository(pool);
  await sqlRepo.initialize();

  // 3. Migrate access records
  const records = await fileRepo.getAllRecords();
  console.log(`📝 Migrating ${records.length} access records...`);

  for (const record of records) {
    await sqlRepo.storeRecord(record);
  }

  console.log(`✅ Migrated ${records.length} records`);

  // 4. Migrate recent events
  const events = await fileRepo.getRecentEvents(1000);
  console.log(`📝 Migrating ${events.length} events...`);

  for (const event of events) {
    await sqlRepo.storeEvent(event);
  }

  console.log(`✅ Migrated ${events.length} events`);

  // 5. Verify migration
  const recordCount = await sqlRepo.getRecordsCount(
    new Date('2020-01-01'),
    new Date('2030-12-31')
  );
  console.log(`📊 Total records in SQL: ${recordCount}`);

  // 6. Update server.js to use SQLRepository
  console.log('\n✅ Migration complete!');
  console.log('📝 Now update server.js:');
  console.log('   const sqlRepository = new SQLRepository(pool);');
  console.log('   const accessRecordService = new AccessRecordService(sqlRepository);');

  await pool.end();
}

migrate().catch(console.error);
```

## Environment Variables

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=access_control
DB_CONNECTION_LIMIT=20
```

## Quick Commands

```bash
# Test MySQL connection
mysql -u root -p -e "SHOW DATABASES;"

# Import schema
mysql -u root -p < schema.sql

# Run migration
node migrate-to-sql.js

# Verify data
mysql -u root -p -e "SELECT COUNT(*) FROM access_control.access_records;"
```

## Performance Comparison

| Operation | JSON File | MySQL (100 devices) |
|-----------|-----------|---------------------|
| Write speed | ~10-50/sec | 1000+/sec |
| Query 10K records | 5-10 sec | 0.01 sec |
| Concurrent writes | Risk of corruption | Safe (ACID) |
| File size limit | ~100MB practical | Unlimited |
| Backup/Restore | Manual dump | Automated |

---

**Ready to migrate?** Just create `SQLRepository.js` following the interface in `IAccessRepository.js`!
