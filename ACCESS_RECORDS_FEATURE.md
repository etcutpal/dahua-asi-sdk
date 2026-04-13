# Access Records Feature

## Overview
A dedicated page for viewing access control records (card swipe/entry logs) with date filtering, authorization status filtering, and pagination.

## Features
- ✅ **Date Picker**: Select specific date to view records (defaults to today)
- ✅ **Authorization Filter**: Filter by Authorized/Unauthorized/All
- ✅ **Pagination**: 20 records per page
- ✅ **SDK-only Method**: Uses NetSDK FindRecord API (works through NAT/firewall)
- ✅ **Persistent Storage**: Records stored in `backend/data/access-record.json`
- ✅ **Fetch from Devices**: Button to retrieve records from all online devices

## Architecture

### Backend
```
backend/
├── src/
│   ├── services/
│   │   └── accessRecordService.js    # New service for record management
│   └── routes/
│       └── access-records.js         # Updated with new endpoints
└── data/
    └── access-record.json            # Persistent storage (auto-created)
```

### Frontend
```
frontend/
└── src/
    └── app/
        └── access-records/
            └── page.tsx              # New access records page
```

## API Endpoints

### 1. Fetch and Store Records
```http
POST /api/access-records/fetch-and-store
Content-Type: application/json

Body:
{
  "date": "2026-04-13"  // Optional, defaults to today
}

Response:
{
  "success": true,
  "totalStored": 150,
  "results": [
    {
      "deviceId": "ASI12",
      "fetched": 150,
      "stored": 150
    }
  ]
}
```

**What it does:**
- Fetches records from all online devices via SDK
- Stores only authorized (Success) and unauthorized (Failed) access attempts
- Filters out non-access records (e.g., system events)
- Defaults to selected date or today

### 2. Get Stored Records
```http
GET /api/access-records/stored?date=2026-04-13&filter=all&page=1&limit=20

Query Parameters:
- date: ISO date string (YYYY-MM-DD) - Optional
- filter: "all" | "authorized" | "unauthorized" - Optional
- page: Page number (default: 1)
- limit: Records per page (default: 20)

Response:
{
  "success": true,
  "records": [...],
  "pagination": {
    "currentPage": 1,
    "totalPages": 8,
    "totalRecords": 150,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

### 3. Clear Records
```http
DELETE /api/access-records/stored

Response:
{
  "success": true,
  "message": "All access records cleared"
}
```

## Data Model

### Stored Record Structure
```json
{
  "id": "1713024000000-abc123-12",
  "recordNumber": 12,
  "cardNumber": "448008",
  "userID": "448008",
  "userName": "",
  "swipeTime": "2026-04-13T10:40:46Z",
  "doorNumber": 0,
  "readerNo": "",
  "cardType": "Normal",
  "status": "Success",
  "storedAt": "2026-04-13T11:00:00Z"
}
```

### Status Values
- **Success**: Authorized access (valid card/user, access granted)
- **Failed**: Unauthorized access attempt (invalid card, blacklisted, etc.)

### Card Types
- Normal
- VIP
- Guest
- Patrol
- Blacklisted
- Coercion
- Unknown

## Usage

### 1. Access the Page
Navigate to `/access-records` from the dashboard or directly via URL.

### 2. Fetch Records
1. Select a date using the date picker (defaults to today)
2. Click **"Fetch from Devices"** button
3. System retrieves records from all online devices via SDK
4. Records are automatically stored in `access-record.json`

### 3. Filter Records
- **All**: Show all records
- **Authorized**: Show only successful accesses (status = "Success")
- **Unauthorized**: Show only failed attempts (status = "Failed")

### 4. Navigate Pages
- Use pagination controls at the bottom
- 20 records displayed per page
- Shows current range (e.g., "Showing 1 to 20 of 150 records")

## Technical Details

### SDK Method (Primary)
- Uses `FindRecord()` / `FindNextRecord()` APIs
- Works through auto-registration TCP connection (port 9500)
- **No direct device HTTP access needed**
- Works when device is behind NAT/firewall
- Server and device can be in different locations

### Storage
- File: `backend/data/access-record.json`
- Max records: 5000 (oldest are trimmed)
- Auto-saves after each fetch operation
- Persists across server restarts

### Filtering Logic
```javascript
// Date filter: Matches records within selected date (00:00:00 to 23:59:59)
const startOfDay = new Date(filterDate.getFullYear(), filterDate.getMonth(), filterDate.getDate());
const endOfDay = new Date(filterDate.getFullYear(), filterDate.getMonth(), filterDate.getDate(), 23, 59, 59, 999);

// Authorization filter
if (filter === 'authorized') {
  records.filter(r => r.status === 'Success');
} else if (filter === 'unauthorized') {
  records.filter(r => r.status === 'Failed');
}
```

## Frontend UI Components

### Header
- Back button to dashboard
- Page title and description
- "Fetch from Devices" button

### Filter Bar
- Date picker (calendar icon)
- Filter buttons: All / Authorized / Unauthorized
- Refresh button

### Records Display
**Desktop**: Table view with columns:
- Status (Authorized/Unauthorized badge)
- User (ID + Name if available)
- Card number
- Card type badge
- Door number
- Swipe time (formatted)

**Mobile**: Card layout for responsive design

### Pagination
- Total records count badge
- Previous/Next buttons
- Page number buttons (shows 5 pages max)
- "Showing X to Y of Z records" text

## Error Handling

### No Online Devices
```json
{
  "success": false,
  "error": "No online devices available"
}
```

### SDK Query Failed
```json
{
  "success": true,
  "totalStored": 0,
  "results": [
    {
      "deviceId": "ASI12",
      "error": "Device not logged in"
    }
  ]
}
```

### No Records Found
- Frontend shows empty state message
- "Click Fetch from Devices to retrieve access records"

## Security Considerations

### Authorization
- Currently no authentication (add middleware if needed)
- Consider adding role-based access control

### Data Privacy
- Records contain user IDs and card numbers
- Consider encryption for sensitive data
- Implement data retention policies

### Rate Limiting
- Add rate limiting to prevent abuse
- Consider caching for frequently accessed dates

## Future Enhancements

### Planned Features
- [ ] Export to CSV/Excel
- [ ] Advanced date range selection
- [ ] Search by user ID or card number
- [ ] Statistics and analytics dashboard
- [ ] Real-time updates via WebSocket
- [ ] Bulk delete operations
- [ ] Automated daily sync scheduler

### Performance Optimizations
- [ ] Database backend (PostgreSQL/MongoDB)
- [ ] Indexing for faster queries
- [ ] Pagination caching
- [ ] Incremental record fetching

## Troubleshooting

### Records Not Showing
1. Ensure device is online (check dashboard)
2. Click "Fetch from Devices" button
3. Check backend logs for SDK errors
4. Verify `backend/data/access-record.json` exists

### Empty Results
- Device may not have any access records for selected date
- Try selecting a different date range
- Check if device has access control enabled

### SDK Errors
- **"Device not logged in"**: Wait for auto-registration to complete
- **"FindRecord failed"**: Check device connection and SDK initialization
- **"No online devices"**: Ensure at least one device is connected

## Testing

### Manual Test Flow
1. Start C# Bridge: `cd NetSDKBridge && dotnet run`
2. Start Backend: `cd backend && npm run dev`
3. Start Frontend: `cd frontend && npm run dev`
4. Navigate to `http://localhost:3000/access-records`
5. Click "Fetch from Devices"
6. Verify records appear in table
7. Test date picker and filters
8. Test pagination

### API Testing (curl)
```bash
# Fetch records from devices
curl -X POST http://localhost:3001/api/access-records/fetch-and-store \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-04-13"}'

# Get stored records
curl "http://localhost:3001/api/access-records/stored?date=2026-04-13&filter=all&page=1&limit=20"

# Get only authorized records
curl "http://localhost:3001/api/access-records/stored?filter=authorized&page=1"

# Clear all records
curl -X DELETE http://localhost:3001/api/access-records/stored
```

## Notes
- **CGI method is NOT used** - only SDK method via auto-registration TCP
- Works with devices behind NAT/firewall
- No port forwarding required
- Server only needs outbound access to device (or vice versa for auto-reg)

---

**Created**: 2026-04-13
**Last Updated**: 2026-04-13
