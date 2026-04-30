# Card Number Enrollment — Implementation Record

> **Device:** Dahua ASI6214S-D (built-in card reader + Wiegand / RS485 external readers)
> **SDK:** Dahua NetSDK (C#) via NetSDKBridge
> **Completed:** April 30, 2026
> **Status:** ✅ Working end-to-end

---

## Overview

Card enrollment lets an admin add card numbers to an employee record either by:

1. **Manual Entry** — type the card number directly into the text field.
2. **Device Reader Capture** — click **Read Card**, pick the device and reader, then swipe the
   physical card on the device's built-in reader or on an externally connected Wiegand / RS485
   reader. The card number is returned automatically.

Numbers are stored in `employees.cardNumbers[]` and written to the device only when the admin
saves the employee record — the same safe "capture first, write on save" pattern used for
fingerprint enrollment.

---

## How It Works — End to End

```
[Employee Form] "Read Card" button clicked
        │
        │  "Card Reader Settings" panel appears:
        │   - Device dropdown  (online devices from /api/devices)
        │   - Reader dropdown  (Built-in / Wiegand-RS485 / Reader 3 / Reader 4)
        │   - Channel ID field (advanced, default 0)
        │   Click "Start Reading"
        │
        │  POST /api/scanner/read-card
        │  { deviceId, channelId, readerID, timeoutMs:15000 }
        ▼
[backend/src/routes/scanner.ts]
        │  Resolves registrationId from deviceId (same as fingerprint path)
        │  Forwards to: POST http://localhost:<BRIDGE_PORT>/card/read
        ▼
[NetSDKBridge / HttpApiServer.cs]
        │  Calls: CardEnrollmentModule.StartReadAsync(timeoutMs)
        │      └─ Parks _activeTcs  (NO SDK activation command needed)
        │
        │          Employee swipes card on reader
        │                   ▼
        │  MessageCallback fires  (lCommand = 0x3181 = ALARM_ACCESS_CTL_EVENT)
        │  → pBuf marshalled to NET_ALARM_ACCESS_CTL_EVENT_INFO
        │  → CardEnrollmentModule.HandleCardSwipeEvent(info) called
        │      ├─ if szCardNo is empty → ignore event, keep waiting
        │      └─ szCardNo non-empty  → _activeTcs resolved with card number
        │
        │  Response: { success:true, cardNumber:"12345678", readerID:"1" }
        ▼
[backend/src/routes/scanner.ts]  → returns to frontend
        ▼
[frontend / employees/page.tsx]
        └─ Card number appended to employeeForm.cardNumbers[]
           (duplicate detection prevents same number being added twice)

[Admin saves employee]
        └─ Existing AddPersonToDeviceViaSdk writes cardNumbers to device
           via InsertOperateAccessCardService — no change needed here
```

---

## Architecture Decisions

### No SDK Activation Command Needed

Unlike fingerprint capture (`ControlDeviceEx(CAPTURE_FINGER_PRINT)`), the card reader is always
listening.  `StartReadAsync` simply parks a `TaskCompletionSource` and waits for the next
`ALARM_ACCESS_CTL_EVENT` callback that contains a non-empty `szCardNo`.  This makes the module
lighter than the fingerprint module.

### Non-Destructive Tap on `ALARM_ACCESS_CTL_EVENT`

The `0x3181` callback fires for every card swipe — including rejected/unknown cards and ordinary
door-open events.  `HandleCardSwipeEvent` checks `_activeTcs == null` first; if no enrollment
session is in progress it returns immediately, so live access-event streaming is completely
unaffected.

### Empty `szCardNo` Events Are Ignored

When someone authenticates by face, fingerprint, or QR code the device still fires
`ALARM_ACCESS_CTL_EVENT` but `szCardNo` is empty.  The module ignores those events and keeps
waiting so it only resolves on a genuine card swipe.

### Capture-Only — Device Written on Save

No card data is written to the device during capture.  If the admin cancels the form, the device
is untouched and there are no orphan records to clean up.

### Duplicate-Card Guard on Frontend

Before appending the captured card number the frontend checks whether it already exists in
`employeeForm.cardNumbers` and shows an info message instead of adding a duplicate.

---

## File-by-File Changes

### `NetSDKBridge/Modules/CardEnrollmentModule.cs` *(New file)*

| Member | Purpose |
|---|---|
| `_activeTcs` | `volatile TaskCompletionSource<CardReadResult>` — single-session primary path |
| `StartReadAsync(timeoutMs)` | Parks TCS, registers cancellation token, returns awaited result |
| `HandleCardSwipeEvent(info)` | Called from `MessageCallback`; resolves TCS when `szCardNo` is non-empty |
| `CancelRead()` | Resolves TCS with `ErrorCode -20 / "Cancelled"` (used if modal is closed mid-read) |
| `CardReadResult` | `{ Success, CardNumber, ReaderID, ErrorCode, ErrorMessage }` |

Error codes:

| Code | Meaning |
|---|---|
| 0 | Success |
| -2 | Device not connected in bridge |
| -3 | Session already busy |
| -10 | Timeout — no card swiped |
| -20 | Cancelled by caller |

### `NetSDKBridge/SDKBridgeService.cs` *(Modified)*

- Added `_cardEnrollmentModule` field and `CardEnrollment` public property.
- Instantiated `CardEnrollmentModule` in the constructor alongside `FingerprintEnrollmentModule`.
- In `MessageCallback`: added a non-destructive tap after the fingerprint block:
  ```csharp
  const int ALARM_ACCESS_CTL_EVENT = 0x3181;
  if (lCommand == ALARM_ACCESS_CTL_EVENT && _cardEnrollmentModule != null ...)
  {
      var evtInfo = Marshal.PtrToStructure<NET_ALARM_ACCESS_CTL_EVENT_INFO>(pBuf);
      _cardEnrollmentModule.HandleCardSwipeEvent(evtInfo);
  }
  ```

### `NetSDKBridge/HttpApiServer.cs` *(Modified)*

- Added `POST /card/read` endpoint before `/scanner/capture`.
- Added `CardReadRequest` model: `DeviceId`, `ChannelId` (default 0), `ReaderID` (default "1"),
  `TimeoutMs` (default 15000).
- Returns `{ success, cardNumber, readerID }` on success or `{ success, errorCode, error }` on
  failure — always HTTP 200.

### `backend/src/routes/scanner.ts` *(Modified)*

- Added `POST /api/scanner/read-card` route.
- Resolves `registrationId` from `deviceId` (same pattern as `/capture`).
- Forwards to bridge `POST /card/read` with `axios` timeout = `timeoutMs + 5000`.
- Always returns HTTP 200; `success` field conveys outcome.

### `frontend/src/app/employees/page.tsx` *(Modified)*

**New state:**

| Variable | Type | Purpose |
|---|---|---|
| `isReadingCard` | `boolean` | Shows spinner / "Waiting for card swipe…" |
| `cardReadMsg` | `string \| null` | Success / error message below the buttons |
| `cardReadAbortRef` | `Ref<AbortController>` | Abort in-flight request on cancel |
| `selectedCardDeviceId` | `string` | Selected device for card read |
| `selectedCardChannelId` | `number` | Channel ID (advanced, default 0) |
| `selectedCardReaderId` | `string` | Reader ID ("1"–"4") |
| `showCardDevicePanel` | `boolean` | Toggles the device/reader picker panel |
| `cardDevicePanelRef` | `Ref<HTMLDivElement>` | Closes panel on outside click |
| `readerOptions` | static array | Built-in / Wiegand-RS485 / Reader 3 / Reader 4 |

**UI behaviour:**

- The **"Add Card"** dashed button remains always visible (manual entry).
- When `selectedCardReaderType === 'access-control'` a **"Read Card ▾"** button appears.
- Clicking it opens a small panel with:
  - **Device** dropdown — populated from the same `scannerDevices` list as the fingerprint scanner.
  - **Reader** dropdown — Built-in (1), Wiegand/RS485 (2), Reader 3, Reader 4.
  - **Channel ID** number input (advanced, default 0).
  - **"Start Reading"** button.
- During reading the button is replaced with a pulsing blue "Waiting for card swipe…" label and a
  **✕ cancel** button.
- On success the card number is appended to `employeeForm.cardNumbers[]`; a green ✅ message is
  shown below.
- On failure / timeout a red ❌ message is shown.
- The panel closes on outside click (separate `useEffect` + `cardDevicePanelRef`).

---

## Differences vs Fingerprint Enrollment

| | Fingerprint | Card Read |
|---|---|---|
| SDK activation call | `ControlDeviceEx(CAPTURE_FINGER_PRINT)` | ❌ None — reader always on |
| Callback command | `0x318d` | `0x3181` |
| Empty-event handling | N/A | Ignores events with empty `szCardNo` |
| Data returned | Base64 template + lengths | Plain card number string |
| Stored format | `{ index, dataBase64, packetLen, packetCount }` | `string` in `cardNumbers[]` |
| Timeout default | 30 000 ms | 15 000 ms |
| External reader support | Built-in scanner only | ✅ Wiegand / RS485 too |

---

## Testing Checklist

### NetSDKBridge
- [x] `CardEnrollmentModule` builds without errors
- [x] `StartReadAsync` parks TCS; returns timeout error after `timeoutMs`
- [x] `HandleCardSwipeEvent` ignores events with empty `szCardNo`
- [x] `HandleCardSwipeEvent` resolves TCS with card number on valid swipe
- [x] `CancelRead` resolves TCS immediately with code -20
- [x] Live access-event streaming unaffected when no session is active

### Backend
- [x] `POST /api/scanner/read-card` proxies to bridge
- [x] `registrationId` resolved from `deviceId` before forwarding

### Frontend
- [x] "Read Card" button only visible when reader type is "Access Control Built-in Reader"
- [x] Panel shows correct device / reader / channel selectors
- [x] Spinner + cancel button shown during reading
- [x] ✕ button aborts in-flight request
- [x] Card number appended to `cardNumbers[]` on success
- [x] Duplicate card numbers blocked with info message
- [x] Panel closes on outside click
- [x] Manual entry ("Add Card") still works alongside device read

### End-to-End
- [x] Select device → select reader → click Start Reading → swipe card → number appears in list
- [x] Save employee → card written to device via existing `InsertOperateAccessCardService`
- [x] Employee can authenticate by card at door

---

## Security Notes

- Card numbers are access credentials — do not log them in full; backend logs only first 4 digits.
- Restrict `POST /api/scanner/read-card` to admin roles.
- On employee deletion, call `RemoveOperateAccessCardService` and clear `employees.cardNumbers`.
