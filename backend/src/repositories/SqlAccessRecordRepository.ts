/**
 * SqlAccessRecordRepository.ts
 *
 * SQL implementation of IAccessRepository (extends the abstract base class
 * so it can be a drop-in replacement for FileRepository).
 *
 * Works with SQL Server, MySQL and PostgreSQL via IDbConnection.
 *
 * Note: "events" (real-time, short-lived) are stored in the access_events
 * table (capped at maxEvents rows).  "records" (persistent history) go into
 * the access_records table.
 */

import { IAccessRepository } from './IAccessRepository';
import { IDbConnection } from './DatabaseConnection';
import { AccessEvent, AccessRecord, RecordFilters, PaginationInfo } from '../types';
import logger from '../utils/logger';

// ─── datetime helper ──────────────────────────────────────────────────────────
function toDate(v: any): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// ─── row mappers ──────────────────────────────────────────────────────────────

function rowToEvent(row: any): AccessEvent {
  return {
    id:        row.id,
    type:      row.type,
    deviceId:  row.device_id,
    timestamp: row.timestamp  instanceof Date ? row.timestamp.toISOString()   : row.timestamp,
    data:      row.data       ? JSON.parse(row.data) : {},
    storedAt:  row.stored_at  instanceof Date ? row.stored_at.toISOString()   : row.stored_at,
  };
}

function rowToRecord(row: any): AccessRecord {
  return {
    id:           row.id,
    deviceId:     row.device_id,
    deviceName:   row.device_name ?? '',
    recordNumber: row.record_number ?? 0,
    userID:       row.user_id   ?? '',
    userName:     row.user_name ?? '',
    cardNumber:   row.card_number ?? '',
    swipeTime:    row.swipe_time instanceof Date ? row.swipe_time.toISOString() : row.swipe_time,
    doorNumber:   row.door_number  ?? 0,
    readerNo:     row.reader_no    ?? '',
    cardType:     row.card_type    ?? '',
    openMethod:   row.open_method  ?? '',
    status:       row.status       ?? 'Failed',
    storedAt:     row.stored_at instanceof Date  ? row.stored_at.toISOString()  : row.stored_at,
  };
}

// ─── Repository ───────────────────────────────────────────────────────────────

export class SqlAccessRecordRepository extends IAccessRepository {
  private maxEvents  = 100;
  private maxRecords = 50_000;

  constructor(private db: IDbConnection) {
    super();
  }

  async initialize(): Promise<void> {
    // Tables are created by the migration — nothing to do here.
    logger.info('[SqlAccessRecordRepository] Ready');
  }

  // ── Events ────────────────────────────────────────────────────────────────

  async storeEvent(event: AccessEvent): Promise<void> {
    await this.db.query(
      `INSERT INTO access_events (id, type, device_id, timestamp, data, stored_at)
       VALUES (?,?,?,?,?,?)`,
      [event.id, event.type, event.deviceId,
       toDate(event.timestamp) ?? new Date(),
       JSON.stringify(event.data),
       toDate(event.storedAt) ?? new Date()],
    );
    // Trim old events
    await this.deleteOldEvents(this.maxEvents);
  }

  async getRecentEvents(limit = 100): Promise<AccessEvent[]> {
    const rows = await this.db.query(
      'SELECT * FROM access_events ORDER BY stored_at DESC',
      [],
    );
    return rows.slice(0, limit).map(rowToEvent);
  }

  async getEventsByDevice(deviceId: string, limit = 50): Promise<AccessEvent[]> {
    const rows = await this.db.query(
      'SELECT * FROM access_events WHERE device_id = ? ORDER BY stored_at DESC',
      [deviceId],
    );
    return rows.slice(0, limit).map(rowToEvent);
  }

  async deleteOldEvents(keepCount = 100): Promise<number> {
    // Count total
    const countRows = await this.db.query('SELECT COUNT(*) AS cnt FROM access_events', []);
    const total = Number(countRows[0]?.cnt ?? countRows[0]?.['COUNT(*)'] ?? 0);
    const toDelete = total - keepCount;
    if (toDelete <= 0) return 0;

    // Delete the oldest N
    await this.db.query(
      `DELETE FROM access_events WHERE id IN (
         SELECT id FROM access_events ORDER BY stored_at ASC OFFSET 0 ROWS FETCH NEXT ? ROWS ONLY
       )`,
      [toDelete],
    );
    return toDelete;
  }

  async clearEvents(): Promise<void> {
    await this.db.query('DELETE FROM access_events WHERE 1=1', []);
    logger.info('[SqlAccessRecordRepository] All events cleared');
  }

  // ── Records ───────────────────────────────────────────────────────────────

  async storeRecord(record: AccessRecord): Promise<void> {
    // Skip if already exists (idempotent)
    const existing = await this.db.query(
      'SELECT id FROM access_records WHERE id = ?',
      [record.id],
    );
    if (existing.length) return;

    await this.db.query(
      `INSERT INTO access_records
         (id, device_id, device_name, record_number, user_id, user_name, card_number,
          swipe_time, door_number, reader_no, card_type, open_method, status, stored_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        record.id,
        record.deviceId,
        record.deviceName ?? '',
        record.recordNumber,
        record.userID,
        record.userName,
        record.cardNumber,
        toDate(record.swipeTime) ?? new Date(),
        record.doorNumber,
        record.readerNo,
        record.cardType,
        record.openMethod,
        record.status,
        toDate(record.storedAt) ?? new Date(),
      ],
    );
  }

  async getRecords(
    filters: RecordFilters = {},
  ): Promise<{ records: AccessRecord[]; pagination: PaginationInfo }> {
    const {
      date, startDate, endDate, deviceId,
      filter = 'all', page = 1, limit = 20,
    } = filters;

    const conditions: string[] = [];
    const params: any[] = [];

    // Date filtering
    if (date && !startDate && !endDate) {
      // For SQL Server: CAST(swipe_time AS DATE) = CAST(? AS DATE)
      conditions.push('CAST(swipe_time AS DATE) = CAST(? AS DATE)');
      params.push(new Date(date));
    } else {
      if (startDate) { conditions.push('swipe_time >= ?'); params.push(new Date(startDate + 'T00:00:00')); }
      if (endDate)   { conditions.push('swipe_time <= ?'); params.push(new Date(endDate   + 'T23:59:59')); }
    }

    if (deviceId) { conditions.push('device_id = ?'); params.push(deviceId); }
    if (filter === 'authorized')   { conditions.push("status = 'Success'"); }
    if (filter === 'unauthorized') { conditions.push("status = 'Failed'"); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    // Count
    const countRows = await this.db.query(
      `SELECT COUNT(*) AS cnt FROM access_records ${where}`,
      params,
    );
    const total = Number(countRows[0]?.cnt ?? countRows[0]?.['COUNT(*)'] ?? 0);
    const totalPages = Math.ceil(total / limit) || 1;
    const currentPage = Math.min(Math.max(1, page), totalPages);
    const offset = (currentPage - 1) * limit;

    const rows = await this.db.query(
      `SELECT * FROM access_records ${where} ORDER BY swipe_time DESC OFFSET ? ROWS FETCH NEXT ? ROWS ONLY`,
      [...params, offset, limit],
    );

    return {
      records: rows.map(rowToRecord),
      pagination: { total, page: currentPage, limit, totalPages },
    };
  }

  async getAllRecords(): Promise<AccessRecord[]> {
    const rows = await this.db.query(
      'SELECT * FROM access_records ORDER BY swipe_time DESC',
      [],
    );
    return rows.map(rowToRecord);
  }

  async getRecordsCount(startDate: Date, endDate: Date): Promise<number> {
    const rows = await this.db.query(
      'SELECT COUNT(*) AS cnt FROM access_records WHERE swipe_time >= ? AND swipe_time <= ?',
      [startDate, endDate],
    );
    return Number(rows[0]?.cnt ?? rows[0]?.['COUNT(*)'] ?? 0);
  }

  async clearRecords(): Promise<void> {
    await this.db.query('DELETE FROM access_records WHERE 1=1', []);
    logger.info('[SqlAccessRecordRepository] All records cleared');
  }

  async forceSave(): Promise<void> {
    // No-op for SQL — every write is immediate
  }
}
