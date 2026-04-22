// Access Event interface (raw events from devices)
export interface AccessEvent {
  id: string;
  type: string;
  deviceId: string;
  timestamp: string;
  data: Record<string, any>;
  storedAt: string;
}

// Access Record interface (formatted records)
export interface AccessRecord {
  id: string;
  deviceId: string;
  deviceName?: string;
  recordNumber: number;
  userID: string;
  userName: string;
  cardNumber: string;
  swipeTime: string;
  doorNumber: number;
  readerNo: string;
  cardType: string;
  openMethod: string;
  status: 'Success' | 'Failed';
  storedAt: string;
}

// Repository interface for access data
export interface IAccessRepository {
  storeEvent(event: AccessEvent): Promise<void>;
  getRecentEvents(limit?: number): Promise<AccessEvent[]>;
  getEventsByDevice(deviceId: string, limit?: number): Promise<AccessEvent[]>;
  deleteOldEvents(keepCount?: number): Promise<number>;
  storeRecord(record: AccessRecord): Promise<void>;
  getRecords(filters?: RecordFilters): Promise<{ records: AccessRecord[]; pagination: PaginationInfo }>;
  getAllRecords(): Promise<AccessRecord[]>;
  getRecordsCount(startDate: Date, endDate: Date): Promise<number>;
  clearEvents(): Promise<void>;
  clearRecords(): Promise<void>;
  initialize(): Promise<void>;
  forceSave?(): Promise<void>;
}

// Filter options for querying records
export interface RecordFilters {
  date?: string;
  startDate?: string;
  endDate?: string;
  deviceId?: string;
  filter?: 'all' | 'authorized' | 'unauthorized';
  page?: number;
  limit?: number;
}

// Pagination info
export interface PaginationInfo {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Webhook event data structure
export interface WebhookEventData {
  type: string;
  deviceId: string;
  timestamp?: string;
  data: Record<string, any>;
}
