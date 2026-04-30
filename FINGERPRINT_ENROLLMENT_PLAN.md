# Fingerprint Enrollment — Implementation Record

> **Device:** Dahua ASI6214S-D (built-in fingerprint scanner)  
> **SDK:** Dahua NetSDK (C#) via NetSDKBridge  
> **Completed:** April 28, 2026  
> **Status:** ✅ Working end-to-end

---

## Overview

Fingerprint enrollment uses the **Access Control Built-in Scanner** on the Dahua ASI6214S-D device. The device handles the 3-touch fusion internally and returns a single merged template per finger via an SDK alarm callback. Templates are stored in the database and pushed to the device when the employee record is saved.

---

## How It Works — End to End

```
[Employee Form] "Capture Finger N" button clicked
        │
        │  POST /api/scanner/capture
        │  { deviceId, slot, userID, timeoutMs:30000 }
        ▼
[backend/routes/scanner.ts]
        │  Resolves: deviceService.getById(deviceId) → device.registrationId
        │  Forwards to: POST http://localhost:<BRIDGE_PORT>/scanner/capture
        ▼
[NetSDKBridge / HttpApiServer.cs]
        │  Calls: FingerprintEnrollmentModule.StartCaptureAsync(loginHandle, ...)
        │      ├─ NET_CTRL_CAPTURE_FINGER_PRINT struct built
        │      ├─ NETClient.ControlDeviceEx(CAPTURE_FINGER_PRINT) → Device LED activates
        │      └─ Awaits TaskCompletionSource (up to 30 s)
        │
        │          Employee places finger 3× on device scanner
        │          Device fuses 3 touches → 1 template
        │                   ▼
        │  MessageCallback fires  (lCommand = 0x318d = ALARM_FINGER_PRINT)
        │  → pBuf marshalled to NET_ALARM_CAPTURE_FINGER_PRINT_INFO
        │  → HandleFingerprintAlarm(info) called
        │      ├─ bCollectResult = true  → raw bytes copied, base64 encoded
        │      │                           TCS resolved with EnrollResult
        │      └─ bCollectResult = false → error code mapped to message
        │                                  TCS resolved with failure EnrollResult
        │
        │  Response: { success, template, packetLen, packetNum, slot }
        ▼
[backend/routes/scanner.ts]  → returns response to frontend
        ▼
[frontend / employees/page.tsx]
        └─ Stores fingerprint as object:
           { index: slot-1, dataBase64: template, packetLen, packetCount: packetNum }
           Appended to employeeForm.fingerprints[]

[Admin fills rest of form and clicks Save]
        │
        │  POST /api/persons?syncToDevice=true&deviceId=<id>
        │  body.fingerprints = [{ index, dataBase64, packetLen, packetCount }, ...]
        ▼
[backend/routes/persons.ts]
        │  SqlPersonRepository saves fingerprints as JSON to employees.fingerprints
        │  Calls: netSdkService.addPersonToDevice(...)
        ▼
[NetSDKBridge / SDKBridgeService.cs → AddPersonToDeviceViaSdk]
        │  InsertOperateAccessUserService (creates user on device)
        └─ InsertOperateAccessFingerprintService per template (writes biometric data)
           → Employee can now authenticate by fingerprint at the door
```

---

## Architecture Decisions & Why

### Capture-Only Module — No Device Writes During Capture

**Decision:** `FingerprintEnrollmentModule` only captures and returns the template. It does **not** write anything to the device.

**Why:** If an admin starts capturing but then cancels the form, any user/fingerprint record already written to the device becomes a permanent orphan (no way to clean it up, device has no transaction rollback). Keeping capture pure and writing only on explicit employee save means the device is only modified when the admin confirms the record.

### `_activeTcs` Primary Path — Bypasses `szUserID` Matching

**Problem discovered:** The `szUserID` field in the `NET_ALARM_CAPTURE_FINGER_PRINT_INFO` callback was arriving as an empty string, even though we sent a valid `szUserID` in the trigger struct. This caused the `ConcurrentDictionary` lookup by user ID to always miss, and our 30-second timeout fired instead of the real template.

**Fix:** Added `_activeTcs` (a single `volatile TaskCompletionSource<EnrollResult>`) as the **primary** resolution path. When a callback arrives, `_activeTcs` is checked first and resolved immediately — no `szUserID` matching needed. The `_pending[userID]` dictionary is kept as a fallback for future concurrent-session support.

### Fingerprint Stored as Object, Not Plain Base64 String

**Problem:** Early implementation stored only `data.template` (a plain base64 string) into `employeeForm.fingerprints[]`. When saved, `AddPersonToDeviceViaSdk` expects `{ index, dataBase64, packetLen, packetCount }` — it needs `packetLen` to correctly size the `NET_ACCESS_FINGERPRINT_INFO` struct byte array. Without it, the struct was skipped or sent with garbage length and the device rejected the fingerprint silently.

**Fix:** Frontend now stores the full object:
```typescript
const fpEntry = {
  index: (data.slot ?? slot) - 1,   // 0-based index for device API
  dataBase64: data.template,
  packetLen: data.packetLen,
  packetCount: data.packetNum ?? 1,
};
```
This matches the same format used when importing fingerprints directly from the device.

### `deviceId` → `registrationId` Resolution in Backend Proxy

**Why:** The frontend knows the device by its internal database ID (`deviceId`). The bridge knows devices by the ID used at login (`registrationId` / serial number). The backend `scanner.ts` route resolves this mapping via `deviceService.getById(deviceId)` before forwarding to the bridge.

### HTTP 200 Always From Bridge

The bridge returns HTTP 200 even for capture failures (`success: false`). HTTP error codes are reserved for infrastructure problems (device not found, request malformed). This prevents Axios from throwing on expected failure outcomes like "no finger detected".

---

## File-by-File Changes Made

### `NetSDKBridge/Modules/FingerprintEnrollmentModule.cs` *(Created)*

```
Fields:
  _activeTcs      — volatile TCS<EnrollResult>, primary single-session path
  _activeUserID   — volatile string, tracks current session user ID
  _pending        — ConcurrentDictionary<string, TCS<EnrollResult>>, fallback by userID

StartCaptureAsync(loginHandle, channelId, readerID, userID, fingerSlot=1, timeoutMs=30000):
  1. Build NET_CTRL_CAPTURE_FINGER_PRINT with nChannelID, szReaderID, szUserID, emFingerIndex
  2. NETClient.ControlDeviceEx(CAPTURE_FINGER_PRINT) — returns false → EnrollResult{ErrorCode=-1}
  3. Register _activeTcs and _pending[userID]
  4. Timeout task: fires at timeoutMs with ErrorCode=-10 ("Timed out — no finger detected")
  5. await Task.WhenAny(tcs.Task, timeoutTask) → cancel the other
  6. Return EnrollResult

HandleFingerprintAlarm(NET_ALARM_CAPTURE_FINGER_PRINT_INFO info):
  1. Resolve TCS: _activeTcs first, then _pending[info.szUserID]
  2. Clear _activeTcs and _activeUserID
  3. bCollectResult = true:
       - Copy nPacketLen * nPacketNum bytes from szFingerPrintInfo
       - base64 encode
       - Return EnrollResult{ Success=true, TemplateBase64, PacketLen, PacketNum }
  4. bCollectResult = false:
       - MapErrorCode(nErrorCode) → friendly message
       - Return EnrollResult{ Success=false, ErrorCode, ErrorMessage }

Error code map:
  -10 = Our timeout ("Timed out — no finger detected")
   -1 = Activate failed
    0 = Success
    2 = Place finger firmly
    3 = Touches inconsistent — try again
    5 = Device timeout / no finger
    6 = Device busy
    7 = Finger already enrolled
    9 = Fingerprint storage full
```

### `NetSDKBridge/SDKBridgeService.cs` *(Modified)*

- Added `_fingerprintEnrollmentModule` field and instantiation in constructor.
- `MessageCallback`: added `if (lCommand == 0x318d)` block:
  - Logs Info: `UserID, CardNo, CollectResult, ErrorCode, PacketLen, PacketNum`
  - Calls `_fingerprintEnrollmentModule.HandleFingerprintAlarm(fpInfo)`
- Exposed `public FingerprintEnrollmentModule FingerprintEnrollment` property.

### `NetSDKBridge/HttpApiServer.cs` *(Modified)*

- Added `POST /scanner/capture` endpoint.
- `ScannerCaptureRequest` model: `DeviceId`, `Slot`, `UserID`, `ChannelId`, `ReaderID`, `TimeoutMs`.
- Device not found → HTTP 200 `{success:false, errorCode:-2}` (not HTTP 400).
- Calls `StartCaptureAsync` → returns `{success, template, packetLen, packetNum, slot}`.

### `backend/src/routes/scanner.ts` *(Created)*

```typescript
POST /api/scanner/capture
  - Validates: deviceId, userID present; slot 1–5
  - deviceService.getById(deviceId) → device.registrationId (bridge uses registrationId)
  - axios.post(BRIDGE_URL/scanner/capture, { deviceId: registrationId, slot, userID, ... })
  - Always returns HTTP 200 with bridge response body
  - Axios timeout: timeoutMs + 5000 ms (headroom for network)
```

### `frontend/src/app/employees/page.tsx` *(Modified)*

- Single `fetch` with `AbortController` (no retry loop).
- `captureAbortRef.current?.abort()` wired to the ✕ cancel button.
- On success, stores full object `{ index, dataBase64, packetLen, packetCount }` instead of plain string.
- `selectedScannerType === 'access-control'` gate guards the device path.

---

## SDK Structs & Constants Used

| Item | Value / Location |
|---|---|
| `ALARM_FINGER_PRINT` lCommand | `0x318d` |
| `NET_CTRL_CAPTURE_FINGER_PRINT` | Input struct for `ControlDeviceEx` — `nChannelID`, `szReaderID`, `szUserID`, `emFingerIndex` |
| `NET_ALARM_CAPTURE_FINGER_PRINT_INFO` | Callback result — `bCollectResult`, `nErrorCode`, `szUserID`, `szFingerPrintInfo`, `nPacketLen`, `nPacketNum` |
| `EM_CtrlType.CAPTURE_FINGER_PRINT` | Enum passed to `ControlDeviceEx` |
| `InsertOperateAccessFingerprintService` | Writes template to device (called at employee save, not at capture) |
| `InsertOperateAccessUserService` | Creates user record on device (called at employee save) |

---

## Data Storage Format

Fingerprints are stored in `employees.fingerprints` as a JSON array of objects:

```json
[
  {
    "index": 0,
    "dataBase64": "<base64 of raw template bytes>",
    "packetLen": 810,
    "packetCount": 1
  },
  {
    "index": 1,
    "dataBase64": "<base64 of raw template bytes>",
    "packetLen": 810,
    "packetCount": 1
  }
]
```

- `index` — 0-based finger slot (0 = finger 1, …, 4 = finger 5)
- `dataBase64` — raw SDK template bytes, base64 encoded
- `packetLen` — byte length of one packet (required by `NET_ACCESS_FINGERPRINT_INFO.nPacketLen`)
- `packetCount` — always 1 per entry (each array element = one finger)

---

## Bugs Found and Fixed During Implementation

| Bug | Root Cause | Fix |
|---|---|---|
| Progress spinner never stopped | 3× retry loop × 30 s = 90 s lock | Removed retry loop; single fetch |
| Cancel button did nothing | `stopFingerprintCapture` only cleared a simulated timer | Added `captureAbortRef` + `AbortController.abort()` |
| "No finger detected" despite touching | `szUserID` in callback = `""`, TCS dict lookup missed, 30 s timeout fired as code 5 | `_activeTcs` primary path bypasses szUserID matching; own timeout uses distinct code -10 |
| Template returned but not saved to device | Capture module returned base64 but never called `InsertFingerprintToDevice` | Added device write (later removed — wrong design) |
| `NO_RECORD` FailCode on device write | User didn't exist on device yet | Added `EnsureUserExistsOnDevice` (later removed — wrong design) |
| Orphan users left on device if form cancelled | Writing to device during capture, before admin confirms save | **Removed all device writes from capture module.** Device only written in `AddPersonToDeviceViaSdk` at employee save |
| Fingerprint silently skipped on device write | Frontend stored plain base64 string; bridge needed `{ index, dataBase64, packetLen, packetCount }` | Frontend now stores full object with all fields from capture response |

---

## Testing Checklist

### NetSDKBridge
- [x] `ControlDeviceEx(CAPTURE_FINGER_PRINT)` activates scanner LED on device
- [x] `MessageCallback` receives `ALARM_FINGER_PRINT` (0x318d) after touches
- [x] `NET_ALARM_CAPTURE_FINGER_PRINT_INFO` marshalled correctly
- [x] Template bytes returned as valid base64
- [x] Timeout fires with code -10 when no touch within `timeoutMs`
- [x] `_activeTcs` resolves correctly regardless of `szUserID` content in callback

### Backend
- [x] `POST /api/scanner/capture` proxies to bridge and returns response
- [x] `registrationId` resolved from `deviceId` before forwarding to bridge

### Frontend
- [x] Device dropdown shows only online devices
- [x] Single capture attempt per click (no retry loop)
- [x] ✕ button aborts in-flight request
- [x] Template stored as `{ index, dataBase64, packetLen, packetCount }`

### End-to-End
- [x] Capture Finger 1 → 3 touches → template stored correctly in DB
- [x] Save employee → template written to device via `InsertOperateAccessFingerprintService`
- [x] Employee can authenticate by fingerprint at door
- [x] Multiple fingerprints (up to 5) supported

---

## Security Notes

- Fingerprint templates are biometric data — handle with care.
- Do not log raw template bytes — log only slot index, `packetLen`, and result.
- Restrict `/api/scanner/capture` to admin roles.
- Use HTTPS in production.
- On employee deletion, call `RemoveOperateAccessFingerprintService` and clear `employees.fingerprints`.
- Retain consent records if required by local data protection regulations.
