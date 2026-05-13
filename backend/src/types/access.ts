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
  registrationId: string;  // SDK registration ID (e.g. "ASI12") — was device_id
  deviceId: string;        // internal devices.deviceId (UUID/numeric)
  deviceName?: string;
  recordNumber: number | null;  // null for live events (SDK doesn't expose nRecNo in real-time callbacks); real sequential number for fetch path
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
  renameDevice(oldRegistrationId: string, newRegistrationId: string): Promise<number>;
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
  userId?: string;
  userIds?: string[];
  page?: number;
  limit?: number;
}

// Pagination info
export interface PaginationInfo {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  // Frontend-friendly aliases
  totalRecords: number;
  currentPage: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

// Webhook event data structure
export interface WebhookEventData {
  type: string;
  deviceId: string;
  timestamp?: string;
  data: Record<string, any>;
}
