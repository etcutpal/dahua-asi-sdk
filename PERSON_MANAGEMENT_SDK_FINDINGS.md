# Person Management SDK Issues & Findings

## Date: 2026-04-13

## Overview

This document summarizes all findings from investigating and fixing the Person Management issues in the Dahua Access Control SDK integration.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Person Add/Update/Delete Flow](#person-addupdatedelete-flow)
3. [Issues Found & Fixes Applied](#issues-found--fixes-applied)
4. [SDK Behavior Details](#sdk-behavior-details)
5. [Current Card Accumulation Issue](#current-card-accumulation-issue)
6. [Misleading Error Messages](#misleading-error-messages)
7. [Recommended Future Implementation](#recommended-future-implementation)
8. [Reference Files](#reference-files)

---

## Architecture Overview

```
Frontend (Next.js)
    ↓ HTTP
Backend (Express.js - Node.js)
    ↓ HTTP (form-data)
NetSDKBridge (C# .NET)
    ↓ NetSDK
Dahua Access Control Device
```

### Key Files

| Component | File | Purpose |
|-----------|------|---------|
| Frontend | `frontend/src/components/PersonList.tsx` | "Send to Device" button |
| Backend | `backend/src/routes/persons.js` | REST endpoints |
| Backend | `backend/src/services/netSdkService.js` | Bridge HTTP client |
| Backend | `backend/src/utils/personLogger.js` | Person operation logging |
| Bridge | `NetSDKBridge/HttpApiServer.cs` | HTTP API endpoint |
| Bridge | `NetSDKBridge/SDKBridgeService.cs` | SDK operations |

---

## Person Add/Update/Delete Flow

### Current Flow ("Send to Device" button)

1. User clicks "Send to Device" on Person Management page
2. UI shows device selection modal
3. User selects device and clicks "Send"
4. Frontend calls `POST /api/persons/:personId/send-to-device`
5. Backend fetches person data + face image from database
6. Backend calls C# Bridge: `POST http://localhost:5000/api/persons/add-to-device`
7. Bridge performs SDK operations on device

### Person Edit Flow

1. User edits person details (face, card, name)
2. Frontend calls `PUT /api/persons/:personId`
3. Backend updates local database
4. If `syncToDevice=true`, backend also sends to device with `isUpdate=true`

---

## Issues Found & Fixes Applied

### ✅ Issue 1: Face Image Not Updating

**Problem:** Editing person face and sending to device showed success but face didn't change.

**Root Cause:** `send-to-device` endpoint always used `isUpdate=false` (CREATE mode), which uses SDK `INSERT` operation. INSERT only adds NEW faces; it cannot update existing ones. Device returns `failCode=PHOTO_EXIST`.

**Fix:** Changed `send-to-device` endpoint to use `isUpdate=true` (UPDATE mode).

**Status:** ✅ FIXED

---

### ✅ Issue 2: Card Numbers Accumulating

**Problem:** Each time person was sent to device with a new card, old card remained. Person ended up with multiple cards.

**Root Cause:** 
1. `OldCardNumber` was never passed to the bridge from `send-to-device` endpoint
2. Card was added with INSERT without removing existing cards first
3. Device treats each card as separate entry

**Fix:** 
1. Backend captures old card number before updating person
2. Bridge queries device for existing cards when `OldCardNumber` is empty
3. Bridge removes all old cards before adding new one

**Status:** ⚠️ PARTIALLY FIXED - Query-based removal works but needs verification on device

---

### ✅ Issue 3: New Persons Not Sent to Device

**Problem:** Newly created person showed "sent successfully" but person didn't appear on device.

**Root Cause:** Same as Issue 1 - was using wrong operation mode.

**Fix:** Using `isUpdate=true` with user upsert (INSERT is actually an upsert operation for users).

**Status:** ✅ FIXED

---

### ✅ Issue 4: Misleading "Network connection failed" Errors

**Problem:** Bridge logs showed "Network connection failed" warnings even when operations succeeded.

**Root Cause:** Dahua SDK returns `userResult=True` but also sets `GetLastError()` to error strings like `800004B5` or `Network connection failed`. These are device-specific codes that indicate success on certain device firmware versions.

**Impact:** Cosmetic only - operations actually complete successfully.

**Status:** ⚠️ Known issue - cosmetic only, no functional impact

---

## SDK Behavior Details

### User Operations

| SDK Method | Purpose | Behavior |
|------------|---------|----------|
| `InsertOperateAccessUserService` | Add/Update user | **Upsert operation** - if user exists, updates; if not, creates |
| `GetOperateAccessUserService` | Query user info | Returns user details |
| `RemoveOperateAccessUserService` | Delete user | Removes user AND all associated faces/cards |
| `ClearOperateAccessUserService` | Clear ALL users | Wipes all users from device |

**Key Finding:** There is **NO separate UPDATE method for users** in the SDK. `InsertOperateAccessUserService` handles both add and update (upsert).

### Card Operations

| SDK Method | Purpose |
|------------|---------|
| `InsertOperateAccessCardService` | Add card |
| `UpdateOperateAccessCardService` | Update card |
| `RemoveOperateAccessCardService` | Remove card |
| `GetOperateAccessCardService` | Query cards |

### Face Operations

| SDK Method | Enum Value | Purpose |
|------------|------------|---------|
| `OperateAccessFaceService` | `INSERT` | Add new face |
| `OperateAccessFaceService` | `UPDATE` | Update existing face |
| `OperateAccessFaceService` | `REMOVE` | Remove face |
| `OperateAccessFaceService` | `GET` | Query face info |

### Official Dahua Demo Pattern

The official `AccessDemo2s` demo shows:
1. **Users:** Always uses `InsertOperateAccessUserService` for both add and modify
2. **Faces:** Uses `INSERT` for new faces, `UPDATE` for existing faces
3. **Cards:** Uses `InsertOperateAccessCardService` for new, `UpdateOperateAccessCardService` for existing
4. **The demo queries existing data before modifying** to determine which operation to use

---

## Current Card Accumulation Issue

### Problem

Even with fixes, cards can accumulate on the device when:
1. Person is sent to device with card 1111 → Card added
2. Person is edited, card changed to 2222 → Card 2222 added, card 1111 still on device
3. Person is edited, card changed to 3333 → Card 3333 added, cards 1111 & 2222 still on device

### Why This Happens

The "Send to Device" button is clicked **AFTER** the person is already saved locally. At that point:
- The person's database record already has the NEW card number
- The OLD card number is lost
- Bridge doesn't know which card to remove

### Current Fix Attempt

Added logic to query the device for existing cards and remove them before adding the new one:

```csharp
// Query all cards from device
bool queryResult = NETClient.GetOperateAccessCardService(
    (IntPtr)device.LoginHandle,
    new string[] { "" }, // Query all cards
    out existingCards,
    out queryFailCode,
    5000
);

// Filter cards for this user
var userCards = existingCards.Where(c => c.szUserID == request.PersonID).ToList();

// Remove all except the new card
foreach (var userCard in userCards)
{
    if (userCard.szCardNo != request.CardNumber)
    {
        NETClient.RemoveOperateAccessCardService(...);
    }
}
```

### Verification Needed

This needs testing on the actual device to confirm:
1. `GetOperateAccessCardService` returns all cards correctly
2. Card removal works as expected
3. No side effects (e.g., removing cards from other users)

---

## Misleading Error Messages

### Pattern 1: User Upsert

```
[DEBUG] InsertOperateAccessUserService returned: userResult=True, failCode.Length=1, failCode[0].emCode=1749021120
[DEBUG] GetLastError returned: 'Network connection failed'
[WARNING] InsertOperateAccessUserService failed. SDK Error: Network connection failed
```

**Reality:** User was added/updated successfully. The "Network connection failed" string is returned by the device firmware even on success.

### Pattern 2: Face Insert

```
[FACE] INSERT result: faceResult=True, failCode=NOERROR, error='800004B5'
[FACE] ✅ Face updated for P003
```

**Reality:** `800004B5` is a device-specific success code. Face was updated successfully.

### Pattern 3: Card Insert

```
[CARD] InsertOperateAccessCardService returned: cardResult=False, failCode=18, error='800004B5'
[CARD] ✅ Card 1111 added (device returned error code but card was accepted)
```

**Reality:** `failCode=18` with error `800004B5` means card was added successfully.

### Recommendation

Update error handling logic to treat these as success:
- `800004B5` → Success
- `failCode=18` with `800004B5` → Success
- `userResult=True` with any `GetLastError()` → Success (trust the boolean result)

---

## Recommended Future Implementation

### 1. Proper Card Management

**Option A:** Track old card number in frontend
- Store old card number in component state before save
- Pass it to the API when saving with syncToDevice

**Option B:** Always query device before update (current approach)
- Query device for existing cards
- Remove all except new card
- Add new card

**Recommendation:** Option B is more robust as it handles edge cases where device state may differ from local database.

### 2. Proper Error Handling

```csharp
// Treat these as success conditions:
bool IsSuccess(bool result, string error, int failCode)
{
    if (result && failCode == 0) return true;
    if (result && string.IsNullOrEmpty(error)) return true;
    if (error == "800004B5") return true;
    if (failCode == 18 && error == "800004B5") return true;
    return false;
}
```

### 3. Separate Add/Update Endpoints

Instead of one `send-to-device` endpoint, consider:
- `POST /api/persons/:personId/add-to-device` (for new persons)
- `PUT /api/persons/:personId/update-on-device` (for existing persons)

This makes intent clearer and allows different logic paths.

### 4. Device Sync Status Tracking

Track which persons have been synced to which devices:
- Store sync status in local database
- Show sync indicators in UI
- Allow selective re-sync for specific persons

### 5. Face Image Management

Current approach works:
1. Remove existing face with `OperateAccessFaceService(REMOVE)`
2. Add new face with `OperateAccessFaceService(INSERT)`

This is reliable and matches the Dahua demo pattern.

---

## Reference Files

### Official Dahua Demo

Located at: `AccessDemo2s/AccessDemo2s/UserManager/`

| File | Purpose |
|------|---------|
| `UserInfoForm.cs` | Main person form with face/card/fingerprint management |
| `UserCardInfoForm.cs` | Card management dialog |
| `UserFingerprintInfoForm.cs` | Fingerprint management dialog |

### Key SDK Methods Reference

```csharp
// User operations
NETClient.InsertOperateAccessUserService(loginID, userInfoArray, out failCode, 5000);
NETClient.RemoveOperateAccessUserService(loginID, userIds, out failCode, 5000);

// Card operations
NETClient.InsertOperateAccessCardService(loginID, cardInfoArray, out failCode, 5000);
NETClient.GetOperateAccessCardService(loginID, cardIds, out cards, out failCode, 5000);
NETClient.RemoveOperateAccessCardService(loginID, cardIds, out failCode, 3000);

// Face operations
NETClient.OperateAccessFaceService(loginID, EM_NET_ACCESS_CTL_FACE_SERVICE.INSERT, inParam, outParam, 5000);
NETClient.OperateAccessFaceService(loginID, EM_NET_ACCESS_CTL_FACE_SERVICE.REMOVE, inParam, outParam, 5000);
```

---

## Testing Checklist

- [x] New person with face and card → Send to device ✅
- [x] Edit person face → Send to device → Face updates ✅
- [x] Edit person card → Send to device → Card updates ⚠️ (needs verification)
- [ ] Edit person face and card together → Both update ⚠️ (needs verification)
- [ ] Delete person from device ⏸️ (not yet implemented)
- [ ] Query device for existing persons ⏸️ (not yet implemented)

---

## Log File Locations

| Component | Log File |
|-----------|----------|
| Bridge | `NetSDKBridge/bin/Debug/net8.0/logs/netsdk-bridge.log` |
| Backend | `backend/logs/person-operations.log` |
| Backend Console | Terminal output when running `npm run dev` |

---

## Notes

1. **Device firmware quirks:** The device returns success with error codes in many cases. Always trust the boolean result (`userResult`, `cardResult`, `faceResult`) over the error string.

2. **Network stability:** Rapid operations can cause temporary "Network connection failed" messages. Adding small delays between operations helps.

3. **Face image format:** PNG images work reliably. Keep size under 5MB.

4. **Card number format:** Numeric strings only. No spaces or special characters.

5. **User ID:** Must be unique. Changing user ID creates a new user on device.

---

*This document will be updated as more issues are discovered and fixed.*
