# Automatic Access Record Fetch

Automatically fetches access records that were stored on a device **while it was offline** (disconnected from the backend), as soon as the device reconnects.

---

## Overview

When a Dahua/ASI device disconnects, it continues to store access records internally (face scans, card swipes, etc.). The moment the device reconnects, this service detects the transition and retrieves only the records from the offline gap — not the entire device history.

```
Device disconnects          Device reconnects
      │                            │
      ▼                            ▼
[lastOnlineAt saved]     [webhook: status → Online]
                                   │
                         [wait delaySeconds for SDK handshake]
                                   │
                         [poll login handle until ready]
                                   │
                         [fetch gap: lastOnlineAt-15s → now]
                                   │
                         [store new records, skip duplicates]
                                   │
                         [update lastOnlineAt = now]
                                   │
                         [emit socket event to frontend]
```

---

## How It Works — Step by Step

### 1. Reconnection Detection (C# Bridge)

The C# bridge (`NetSDKBridge/SDKBridgeService.cs`) receives two types of SDK callbacks:

| Callback | Meaning |
|---|---|
| `NET_DVR_SERIAL_RETURN` | Device auto-registered (first contact) |
| `Event Type 5` | Keep-alive heartbeat OR genuine reconnection |

Both handlers check `wasOffline` before firing a webhook. If the device was **already Online**, the event is logged at debug level only (no webhook). Only a genuine **Offline → Online** transition fires the webhook and queues a re-login.

```csharp
// Only fire webhook + re-login on a genuine reconnection
bool wasOffline = existingDevice.Status != "Online";
if (wasOffline) {
    SendWebhook(registrationId, ip, port, "Online");
    LoginAutoRegDevice(registrationId, ip, port);
}
```

### 2. Webhook → Node.js Backend

The bridge sends `POST /api/webhooks/device-status` to the backend with:
```json
{ "registrationId": "600I", "status": "Online", "ip": "192.168.1.150" }
```

`netSdkService.updateDeviceStatus()` uses a `_lastWebhookStatus` Map to deduplicate:
- If `newStatus === previousStatus` → ignored (no duplicate fetch)
- If `previousStatus` was `"offline"` or unknown → triggers `offlineRecordFetchService.triggerAutoFetch()`

### 3. Auto-Fetch: Login Handle Readiness

After reconnection, the SDK needs a moment to complete login. The service:
1. Waits `delaySeconds` (default: **5s**) for the handshake to stabilise
2. Polls `GET /bridge/api/devices/{id}` up to **5 times** (1s apart)
3. Checks that `loginHandle > 0` before proceeding
4. Aborts with a warning if the handle never becomes ready

```
[AutoFetch] Device 600I online — waiting 5s for re-login to stabilise...
[AutoFetch] Device 600I login handle confirmed (attempt 1): 3382396764272
```

### 4. Gap Window Calculation

The fetch window is calculated from `device.lastOnlineAt` (stored in the DB when the device last went offline):

```
gapStart = lastOnlineAt − offsetBeforeOfflineSeconds (default: 15s)
gapEnd   = now
```

The 15-second buffer ensures records written in the final moments before disconnection are captured.

**Example:**
```
lastOnlineAt = 2026-04-23T22:58:53
offsetBefore = 15s
gapStart     = 2026-04-23T22:58:38
gapEnd       = 2026-04-23T23:02:44

→ Bridge query: startTime=2026-04-23T22:58:38 & endTime=2026-04-23T23:02:44
```

If `lastOnlineAt` has never been set (device connecting for the first time), the service falls back to **last 24 hours**.

### 5. Bridge Record Query

The service calls the C# bridge directly:

```
GET http://localhost:5000/api/devices/{registrationId}/access-records-module
    ?startTime=2026-04-23T22:58:38
    &endTime=2026-04-23T23:02:44
    &maxRecords=5000
```

This bypasses the device-list pipeline entirely — no race conditions with online status checks.

### 6. Storage with Deduplication

Records are stored via `accessRecordService.storeSdkRecords()` → `SqlAccessRecordRepository.storeRecord()`.

Each record has a deterministic ID:
```
sdk-{registrationId}-{recordNumber}-{swipeTimeDigits}
e.g. sdk-600I-723-20260423132345
```

**Dedup strategy (in priority order):**

1. **Natural key check**: `SELECT` where `(registration_id, swipe_time, user_id)` matches  
   - If found with no `record_number` → **enrich** the existing row (live event + fetch merge)  
   - If found with `record_number` → **skip** (already stored)
2. **PK / unique constraint**: If two concurrent requests race past the SELECT, only one INSERT wins; the other catches SQL Server error **2627** (PK) or **2601** (unique index) — logged at `debug`, not `error`

### 7. Post-Fetch Cleanup

After fetching:
- `device.lastOnlineAt` is updated to `now` in the DB (marks the new gap start for the next reconnection)
- A WebSocket event `device:auto-fetch:complete` is emitted to the frontend with `{ fetched, stored, startDate, endDate }`

---

## Configuration

All settings live in `shared/server.config.json`:

```json
{
  "autoFetch": {
    "enabled": true,
    "delaySeconds": 5,
    "offsetBeforeOfflineSeconds": 15
  }
}
```

| Field | Default | Description |
|---|---|---|
| `enabled` | `true` | Master on/off switch for auto-fetch |
| `delaySeconds` | `5` | Seconds to wait after reconnection before fetching (SDK handshake settle time) |
| `offsetBeforeOfflineSeconds` | `15` | Seconds to subtract from `lastOnlineAt` for the gap window start (buffer for records written just before disconnect) |

---

## Log Reference

| Log | Meaning |
|---|---|
| `[AutoFetch] Device 600I came ONLINE (was: offline) — scheduling auto-fetch` | Genuine reconnection detected |
| `[AutoFetch] Device 600I online — waiting 5s for re-login to stabilise...` | Handshake settle delay started |
| `[AutoFetch] Device 600I login handle confirmed (attempt N): XXXXXXX` | SDK ready, proceeding with fetch |
| `[AutoFetch] Device 600I login handle not ready after 5 attempts — aborting` | SDK login failed, fetch skipped |
| `[AutoFetch] Gap window: 2026-04-23T22:58:38 ... → 2026-04-23T23:02:44` | Exact offline gap calculated |
| `[AutoFetch] No lastOnlineAt for 600I — fetching last 24h` | First-time device, fallback window |
| `[AutoFetch] Bridge returned 5 records for 600I` | Records retrieved from bridge |
| `[AutoFetch] ✅ 600I: fetched=5, stored=3 new records` | 3 new, 2 already existed (duplicates skipped) |
| `[AutoFetch] Bridge fetch error for 600I: ...` | Fetch or storage failed |
| `[SqlRepo] Duplicate record ignored (id=sdk-600I-...)` | Duplicate silently skipped (debug level) |

---

## File Locations

| File | Role |
|---|---|
| `backend/src/services/offlineRecordFetchService.ts` | Core auto-fetch logic |
| `backend/src/services/netSdkService.ts` | Webhook receiver, dedup map, triggers auto-fetch |
| `backend/src/repositories/SqlAccessRecordRepository.ts` | SQL storage with PK/duplicate handling |
| `NetSDKBridge/SDKBridgeService.cs` | C# SDK callback handler, offline-check before webhook |
| `shared/server.config.json` | Runtime configuration |

---

## Sequence Diagram

```
Device          C# Bridge         Node.js Backend      SQL Server
  │                 │                    │                  │
  │──reconnects────►│                    │                  │
  │                 │──webhook POST──────►│                  │
  │                 │  (status=Online)   │                  │
  │                 │                    │──[wait 5s]       │
  │                 │◄──GET /devices/id──│                  │
  │                 │──loginHandle──────►│                  │
  │                 │                    │──[calc gap]      │
  │                 │◄──GET records──────│                  │
  │                 │──[105 records]────►│                  │
  │                 │                    │──INSERT records──►│
  │                 │                    │◄──(dupes skipped)─│
  │                 │                    │──UPDATE lastOnlineAt►│
  │                 │                    │──emit WS event   │
```
