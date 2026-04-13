# userName Field Analysis

## Issue
Some access records have empty `userName` field even though the device has user names configured.

## Root Cause

### ✅ Name IS Being Stored (When Available)
Example from `access-record.json`:
```json
{
  "userName": "Utpal Mandal",  // ✅ Name present
  "userID": "448008",
  "status": "Success"
}
```

### ❌ Name Missing in Some Records
Example from `access-record.json`:
```json
{
  "userName": "",  // ❌ Empty
  "userID": "448008",
  "status": "Success"
}
```

## Why Some Records Have Names and Some Don't

### Source 1: Live Events (Webhook) - ✅ HAS NAME
When device sends real-time events via webhook:
```json
{
  "rawJson": "{
    \"CardName\" : \"Utpal Mandal\",
    \"UserID\" : \"448008\",
    ...
  }"
}
```

**Processing:**
```javascript
// accessRecordService.js line 128
userName: rawJsonData.CardName || ''
```

✅ **Result:** Name is extracted and stored correctly!

---

### Source 2: SDK Query (Fetch from Devices) - ❌ NO NAME
When fetching historical records via SDK:

**Manufacturer SDK Structure:**
```c
// NET_RECORDSET_ACCESS_CTL_CARDREC (from NetSDKStruct.cs line 20823)
public struct NET_RECORDSET_ACCESS_CTL_CARDREC
{
    public int nRecNo;           // Record number
    public string szCardNo;      // Card number ✅
    public string szUserID;      // User ID ✅
    public NET_TIME stuTime;     // Swipe time ✅
    public bool bStatus;         // Status ✅
    // NO szCardName field! ❌
}
```

**Manufacturer Code (SDKBridgeService.cs line 1296):**
```csharp
var result = new AccessRecordResult
{
    RecordNumber = record.nRecNo,
    CardNumber = record.szCardNo?.Trim() ?? "",
    UserID = record.szUserID?.Trim() ?? "",
    UserName = "",  // ❌ SDK doesn't provide name in this structure
    SwipeTime = swipeTimeString,
    ...
};
```

❌ **Result:** Name is empty because SDK doesn't return it in card record queries.

---

## Manufacturer's Documentation

From `NetSDKBridge\Modules\ACCESS_CONTROL_EVENTS_MODULE.md`:
```json
{
  "eventType": "Face",
  "userId": "12345",
  "cardNumber": "12001",
  "cardName": "Zhang San",    // ✅ Name available in EVENTS
  ...
}
```

From `NetSDKBridge\SDKBridgeService.cs` line 1427 (comment):
```csharp
// records[0].CardNo=12001
// records[0].CardName=ZhangSan   // Only available in HTTP CGI method
// records[0].UserID=ZhangSan
```

---

## Summary

| Data Source | Has userName? | Reason |
|------------|---------------|--------|
| **Live Webhook Events** | ✅ Yes | Device sends full JSON with CardName |
| **SDK Query (TCP)** | ❌ No | SDK structure doesn't include name |
| **HTTP CGI Method** | ✅ Yes | HTTP response includes CardName |

---

## Current Implementation Status

### ✅ Working Correctly
Your application **IS** storing the userName when it's available:

**From your data (access-record.json):**
```json
{
  "id": "1775914152000-795ygywee",
  "userID": "448008",
  "userName": "Utpal Mandal",  // ✅ Name captured from live event
  "status": "Success"
}
```

### ❌ Missing Names
Records with empty userName are from:
1. **SDK queries** - Device doesn't return name in this query mode
2. **Failed access attempts** - Device may not have name for unknown users
3. **System events** - Some events don't have user association

---

## Solutions

### Option 1: Use HTTP CGI Method Instead of SDK (Recommended)
The HTTP CGI method returns CardName, but requires:
- Device must be on same network (no NAT)
- HTTP port must be accessible
- Slower than SDK TCP

**Change in C# Bridge:**
```csharp
// Instead of SDK TCP query, use HTTP CGI
// See AccessControlEventsCgiModule.cs for implementation
```

### Option 2: Cache User Names (Best Performance)
Maintain a user cache:
```javascript
// When live event comes with name, cache it
userCache['448008'] = 'Utpal Mandal';

// When SDK query returns empty name, use cache
userName: userCache[userID] || '';
```

**Implementation:**
1. Create `backend/data/user-cache.json`
2. When live event has CardName, store it
3. When SDK query has no name, look it up from cache
4. Update cache periodically from device

### Option 3: Accept Current Behavior (Simplest)
- Live events will have names ✅
- Historical SDK queries won't have names ❌
- This is a **device/SDK limitation**, not an app bug

---

## Recommendation

**For now, accept current behavior** because:
1. ✅ Your code IS working correctly
2. ✅ Names ARE being stored when available
3. ❌ Missing names is an SDK/device limitation
4. Option 2 (user cache) can be added later if needed

**When you migrate to SQL database:**
- Add a `users` table with ID and name
- Join with access_records to get names
- Update names when live events arrive

---

## Verification

Your application is working correctly! Test it:

1. **Trigger a live event** (swipe card/use face on device)
2. **Check access-record.json** - name should be present
3. **Check Access Records page** - name should display

The empty names you see are from historical SDK queries, which is expected behavior.

---

**Status**: ✅ Working as designed (SDK limitation)
**Date**: 2026-04-13
