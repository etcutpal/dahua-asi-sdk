# 🚀 Migration Plan: SDK-Native Event Subscription (StartListen Method)

## 📋 Problem Statement

**Current Implementation Issue:**
- The app uses **three parallel event subscription methods**:
  1. **SDK RealLoadPicture** (`AccessControlEventsModule.cs`) - Uses `NETClient.RealLoadPicture()` with `EM_EVENT_IVS_TYPE.ACCESS_CTL`
  2. **HTTP CGI snapManager** (`AccessControlEventsCgiModule.cs`) - Uses `snapManager.cgi?action=attachFileProc&Flags[0]=Event&Events=[AccessControl]`
  3. **HTTP CGI eventManager** (`AccessControlEventsGeneralModule.cs`) - Uses `eventManager.cgi?action=attach&codes=[All]&heartbeat=5`
  
- **Methods 2 & 3 require direct IP access** to the device
- **In real-world deployments**, devices are often behind NAT/routers, making direct IP access impossible
- When using **Auto Registration**, the device initiates the connection to us (port 9500), so we **cannot** reach the device's IP directly
- **Method 1 (RealLoadPicture)** works but is for **intelligent events with images**, not the standard alarm event stream

**Why This Matters:**
- Auto Registration creates a **reverse TCP connection** (device → server)
- We have a login handle, but **not direct HTTP access** to the device
- CGI endpoints won't work in production environments with NAT/firewalls
- The current `MessageCallback` (line 603 in SDKBridgeService.cs) is registered with `SetDVRMessCallBackEx1` but **only logs events, doesn't parse them**

---

## ✅ What You Want to Achieve

1. **Replace CGI-based event subscription** (methods 2 & 3) with SDK-native alarm event subscription
2. **Use the existing global message callback** (`SetDVRMessCallBackEx1`) properly by calling `StartListen()` after device login
3. **Parse alarm events** in `MessageCallback` like AccessDemo2s does (handle `ALARM_ACCESS_CTL_EVENT`, `ALARM_ACCESS_CTL_NOT_CLOSE`, etc.)
4. **Support real-world deployments** where devices are behind NAT/routers
5. **Match the official Dahua demo approach** (`AccessDemo2s/AccessForm.cs`) which is proven to work
6. **Maintain all current functionality**:
   - Live Access Control Events on dashboard
   - Event types: Access, Fail, Duress, Break-in, Door Not Closed, etc.
   - Real-time streaming to frontend via WebSocket
   - Persistent event storage in backend

---

## 🔧 What I Need to Do

### Phase 1: C# NetSDKBridge Changes

#### 1.1. Create New Module: `AccessControlEventsSdkModule.cs`
**Based on:** `AccessDemo2s/AccessDemo2s/AccessForm.cs` (lines 171-443, 663-692)

**Key Difference from Current Implementation:**
- **Current `AccessControlEventsModule.cs`** uses `RealLoadPicture()` for intelligent events with images (different API)
- **New `AccessControlEventsSdkModule.cs`** will use `StartListen()` for standard alarm events (matches AccessDemo2s)
- The `MessageCallback` in `SDKBridgeService.cs` is already registered with `SetDVRMessCallBackEx1` but **doesn't parse events**
- The new module will **parse alarm event structs** and forward to backend

**Tasks:**
- [ ] Create a new module that uses SDK-native alarm event subscription
- [ ] Implement `StartListen()` call after device login:
  ```csharp
  // In SDKBridgeService.cs, after successful login:
  NETClient.StartListen(loginHandle);  // Uses login handle, NOT device IP
  ```
- [ ] Update `MessageCallback()` in `SDKBridgeService.cs` to parse alarm events:
  ```csharp
  private bool MessageCallback(int lCommand, IntPtr lLoginID, IntPtr pBuf, ...)
  {
      EM_ALARM_TYPE type = (EM_ALARM_TYPE)lCommand;
      switch (type)
      {
          case EM_ALARM_TYPE.ALARM_ACCESS_CTL_EVENT:
              var accessInfo = (NET_ALARM_ACCESS_CTL_EVENT_INFO)Marshal.PtrToStructure(pBuf, ...);
              // Parse and forward to backend
              break;
          // ... other event types
      }
  }
  ```
- [ ] Handle these event types from the callback:
  | Event Type | SDK Constant | Description |
  |-----------|--------------|-------------|
  | Access Control Event | `ALARM_ACCESS_CTL_EVENT` | Door entry/exit (card, face, fingerprint) |
  | Door Not Closed | `ALARM_ACCESS_CTL_NOT_CLOSE` | Door left open alarm |
  | Break-in | `ALARM_ACCESS_CTL_BREAK_IN` | Forced entry alarm |
  | Repeat Entry | `ALARM_ACCESS_CTL_REPEAT_ENTER` | Anti-passback violation |
  | Duress | `ALARM_ACCESS_CTL_DURESS` | Coerced access alarm |
  | Chassis Intrusion | `ALARM_CHASSISINTRUDED` | Anti-tamper alarm |
  | External Alarm | `ALARM_ALARM_EX2` | External sensor alarm |
  | Malicious Opening | `ALARM_ACCESS_CTL_MALICIOUS` | Forced door opening |

- [ ] Parse event structures (use structs from `NetSDKStruct.cs`):
  - `NET_ALARM_ACCESS_CTL_EVENT_INFO` - Main access control event data
  - Extract: userId, cardNumber, door number, open method, success status, timestamp, temperature
- [ ] Forward parsed events to backend via webhook (same as current):
  ```csharp
  POST http://localhost:3001/api/access-events
  ```

#### 1.2. Modify `SDKBridgeService.cs`
**File:** `NetSDKBridge/SDKBridgeService.cs`

**Tasks:**
- [ ] After device login (auto-reg or manual), call `StartListen()`:
  ```csharp
  // In LoginAutoRegDevice(), after successful login:
  bool listenResult = NETClient.StartListen(loginID);
  if (!listenResult)
  {
      _logger.LogWarning($"StartListen failed for device {registrationID}: {NETClient.GetLastError()}");
  }
  else
  {
      _logger.LogInformation($"✅ StartListen successful for device {registrationID}");
  }
  ```
- [ ] Update `MessageCallback()` to parse alarm events (see 1.1 above)
- [ ] Replace current calls to CGI subscription methods:
  ```csharp
  // REMOVE these (or comment out):
  // await _accessControlEventsCgiModule.SubscribeToDeviceEvents(...)
  // await _accessControlEventsGeneralModule.SubscribeToDeviceEvents(...)
  ```
- [ ] Keep `RealLoadPicture` subscription (Method 1) **optional** - it provides snapshot images
- [ ] Ensure proper cleanup on device disconnect:
  ```csharp
  // In ServiceCallback for NET_DVR_DISCONNECT:
  NETClient.StopListen(loginID);
  _accessControlEventsModule?.UnsubscribeFromDeviceEvents(registrationID);  // Keep for RealLoadPicture
  // CGI modules no longer needed
  ```

#### 1.3. Update `Modules/AccessControlEventsGeneralModule.cs`
**Tasks:**
- [ ] Mark as **deprecated** (keep for reference, but don't use)
- [ ] Add comment: `// DEPRECATED: CGI method doesn't work with auto-registration (requires direct IP access)`
- [ ] Do NOT delete - keep as fallback option for manual login scenarios

#### 1.4. Update `Modules/AccessControlEventsCgiModule.cs`
**Tasks:**
- [ ] Mark as **deprecated** (keep for reference, but don't use)
- [ ] Add comment: `// DEPRECATED: CGI method doesn't work with auto-registration (requires direct IP access)`
- [ ] Do NOT delete - keep as fallback option for manual login scenarios

#### 1.5. Update `Modules/AccessControlEventsModule.cs` (RealLoadPicture)
**Tasks:**
- [ ] Keep as **optional/secondary** method - it provides snapshot images which alarm events don't
- [ ] Add comment: `// OPTIONAL: Provides snapshot images, but requires direct IP access. Use with AccessControlEventsSdkModule for complete coverage.`
- [ ] Consider making it configurable (enable/disable via environment variable)

---

### Phase 2: Backend Changes (Minimal)

#### 2.1. `backend/src/routes/webhooks.js`
**Tasks:**
- [ ] No changes needed - webhook endpoint stays the same
- [ ] The SDK module will POST to the same `/api/access-events` endpoint
- [ ] Event format should match current structure

#### 2.2. `backend/src/services/eventService.js`
**Tasks:**
- [ ] No changes needed - event storage logic remains identical

#### 2.3. `backend/src/services/netSdkService.js`
**Tasks:**
- [ ] No changes needed - device status management is separate

---

### Phase 3: Frontend Changes (Minimal)

#### 3.1. `frontend/src/app/page.tsx`
**Tasks:**
- [ ] No changes needed - WebSocket listener stays the same
- [ ] Still listens to `access:control:event` events
- [ ] Still fetches from `/api/events/access-control` for initial load

#### 3.2. `frontend/src/components/AccessControlEventList.tsx`
**Tasks:**
- [ ] No changes needed - UI component is independent of event source
- [ ] Event structure from SDK matches current structure

---

### Phase 4: Testing & Validation

#### 4.1. Test Scenarios
- [ ] **Auto-registration device comes online** → `StartListen()` called, events flow via SDK alarm callback
- [ ] **Device disconnects** → `StopListen()` called, cleanup happens
- [ ] **Multiple devices online** → Each has independent `StartListen()` call
- [ ] **Event types** → All 8+ event types are received and parsed correctly
- [ ] **Backend webhook** → Events are stored and broadcast correctly
- [ ] **Frontend display** → Events appear in "Live Access Control Events" section
- [ ] **No direct IP access** → Verify events work even when device IP is unreachable
- [ ] **RealLoadPicture optional** → If enabled, verify snapshot images still work

#### 4.2. Comparison Testing
- [ ] Compare events received via StartListen vs CGI (should be same or better)
- [ ] Verify event parsing accuracy (userId, cardNumber, door, etc.)
- [ ] Test with actual face access, card access, fingerprint access
- [ ] Verify `MessageCallback` fires for all event types

---

## 📁 Files to Reference

### Official Dahua Demo (Source of Truth)
| File | Purpose | Key Lines |
|------|---------|-----------|
| `AccessDemo2s/AccessDemo2s/AccessForm.cs` | Main event subscription with StartListen | 171-443 (AlarmCallBack), 663-692 (StartListen/StopListen) |
| `AccessDemo2s/AccessDemo2s/OpenDoorEventForm.cs` | Intelligent events with images (RealLoadPicture) | 58 (RealLoadPicture), 101-230 (AnalyzerDataCallBack) |
| `AccessDemo2s/NetSDKCS/NetSDK.cs` | SDK wrapper functions | 1620-1648 (SetDVRMessCallBackEx1, StartListen, StopListen) |
| `AccessDemo2s/NetSDKCS/OriginalSDK.cs` | P/Invoke declarations | 142, 145, 1219 |
| `AccessDemo2s/NetSDKCS/NetSDKStruct.cs` | Event structs and enums | `NET_ALARM_ACCESS_CTL_EVENT_INFO`, `EM_ALARM_TYPE` |

### Current App Files to Modify
| File | Current Role | Change |
|------|-------------|--------|
| `NetSDKBridge/SDKBridgeService.cs` | Manages device connections + has global MessageCallback | Add StartListen call, update MessageCallback to parse events |
| `NetSDKBridge/Modules/AccessControlEventsModule.cs` | SDK RealLoadPicture (intelligent events with images) | **Keep as optional** - provides snapshot images |
| `NetSDKBridge/Modules/AccessControlEventsGeneralModule.cs` | CGI eventManager.cgi streaming | **Deprecate** |
| `NetSDKBridge/Modules/AccessControlEventsCgiModule.cs` | CGI snapManager.cgi streaming | **Deprecate** |

### Files to Create
| File | Purpose |
|------|---------|
| `NetSDKBridge/Modules/AccessControlEventsSdkModule.cs` | **NEW** - Helper module for StartListen-based alarm events (or integrate into SDKBridgeService.cs directly like AccessDemo2s) |

**Note:** AccessDemo2s handles alarm events **directly in the main form** (AccessForm.cs) without a separate module. You can either:
1. **Option A:** Create a separate module for cleaner separation
2. **Option B:** Parse events directly in `SDKBridgeService.cs`'s `MessageCallback` (simpler, matches AccessDemo2s pattern)

### Files That Stay Unchanged
| File | Reason |
|------|--------|
| `backend/src/routes/webhooks.js` | Webhook endpoint format stays same |
| `backend/src/services/eventService.js` | Event storage logic unchanged |
| `frontend/src/app/page.tsx` | WebSocket listener unchanged |
| `frontend/src/components/AccessControlEventList.tsx` | UI component unchanged |

---

## 🔑 Key SDK APIs to Use

### 1. Event Subscription (StartListen Method)
```csharp
// Already registered in SDKBridgeService.cs (line 248):
NETClient.SetDVRMessCallBackEx1(_messageCallback, IntPtr.Zero);

// After device login, call StartListen:
bool success = NETClient.StartListen(loginHandle);  // Uses login handle, NOT device IP

// On disconnect/cleanup:
bool success = NETClient.StopListen(loginHandle);
```

### 2. Callback Signature (Already in SDKBridgeService.cs)
```csharp
// Line 117: private fMessCallBackEx _messageCallback;
// Line 235: _messageCallback = MessageCallback;
// Line 248: NETClient.SetDVRMessCallBackEx1(_messageCallback, IntPtr.Zero);
// Line 603: private bool MessageCallback(int lCommand, IntPtr lLoginID, IntPtr pBuf, ...)

// Current implementation only logs events - needs to parse alarm event structs
```

### 3. Event Types to Handle (from AccessDemo2s/AccessForm.cs)
```csharp
// These are ALARM types (not EM_EVENT_IVS_TYPE used by RealLoadPicture)
// AccessDemo2s/AccessForm.cs line 176-350+ handles these:

EM_ALARM_TYPE.ALARM_ACCESS_CTL_EVENT         // Main access control event
EM_ALARM_TYPE.ALARM_ACCESS_CTL_NOT_CLOSE     // Door not closed
EM_ALARM_TYPE.ALARM_ACCESS_CTL_BREAK_IN      // Break-in
EM_ALARM_TYPE.ALARM_ACCESS_CTL_REPEAT_ENTER  // Anti-passback
EM_ALARM_TYPE.ALARM_ACCESS_CTL_DURESS        // Duress
EM_ALARM_TYPE.ALARM_CHASSISINTRUDED          // Anti-tamper
EM_ALARM_TYPE.ALARM_ALARM_EX2                // External alarm
EM_ALARM_TYPE.ALARM_ACCESS_CTL_MALICIOUS     // Malicious opening
// ... more in NetSDKStruct.cs enum EM_ALARM_TYPE (line ~5090)
```

### 4. Event Data Structures (from NetSDKStruct.cs)
```csharp
// Main access control alarm event (used in AccessDemo2s line 178):
struct NET_ALARM_ACCESS_CTL_EVENT_INFO {
    public int nUserID;                       // User ID
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
    public string szUserID;                   // User ID string
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
    public string szCardNo;                   // Card number string
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
    public string szCardName;                 // Card name
    public int nDoor;                          // Door number
    public EM_ACCESS_DOOROPEN_METHOD emOpenMethod;  // Open method (face, card, etc.)
    public bool bStatus;                       // Success (true) or Fail (false)
    public SYSTEMTIME stuTime;                // Timestamp
    // ... more fields
}

// Door not closed event (AccessDemo2s line 210):
struct NET_ALARM_ACCESS_CTL_NOT_CLOSE_INFO {
    public SYSTEMTIME stuTime;
    public int nDoor;
    public int nAction;  // ALARM_START or ALARM_STOP
}

// Break-in event (AccessDemo2s line 241):
struct NET_ALARM_ACCESS_CTL_BREAK_IN_INFO {
    public SYSTEMTIME stuTime;
    public int nDoor;
}
```

### 5. Comparison: RealLoadPicture vs StartListen
| Feature | RealLoadPicture (Current Module) | StartListen (New) |
|---------|----------------------------------|-------------------|
| API | `NETClient.RealLoadPicture()` | `NETClient.StartListen()` |
| Event Type | `EM_EVENT_IVS_TYPE.ACCESS_CTL` | `EM_ALARM_TYPE.ALARM_ACCESS_CTL_EVENT` |
| Callback | `fAnalyzerDataCallBack` | `fMessCallBackEx` (already registered) |
| Data Struct | `NET_DEV_EVENT_ACCESS_CTL_INFO` | `NET_ALARM_ACCESS_CTL_EVENT_INFO` |
| Snapshot Images | ✅ Yes (inline in callback) | ❌ No (alarm events don't include images) |
| Works with Auto-Reg | ❌ Requires IP (may work if device reachable) | ✅ Yes (uses login handle) |
| AccessDemo2s Example | `OpenDoorEventForm.cs` | `AccessForm.cs` (main approach) |
| Use Case | Intelligent events with images | Standard alarm/access events |

---

## ⚠️ Important Notes

1. **Do NOT break current functionality** - The migration should be transparent to frontend
2. **Event format must match** - Backend expects specific JSON structure for access events
3. **One StartListen per login handle** - Don't call multiple times for same device
4. **Proper cleanup on disconnect** - Call `StopListen()` when device disconnects
5. **Thread safety** - Callbacks fire on SDK threads, use proper synchronization (AccessDemo2s uses `this.BeginInvoke`)
6. **Login handle is key** - Everything uses `lLoginID` from auto-registration login, never device IP
7. **Keep CGI modules for reference** - Don't delete, just deprecate with comments
8. **MessageCallback already exists** - Line 603 in SDKBridgeService.cs, just needs to parse events like AccessDemo2s
9. **SetDVRMessCallBackEx1 already called** - Line 248 in SDKBridgeService.cs, no need to register again
10. **RealLoadPicture is complementary** - Can keep it for snapshot images if device IP is reachable

---

## 📊 Expected Outcome

After implementation:
- ✅ Events work with auto-registration (no direct IP needed)
- ✅ Events work behind NAT/routers
- ✅ All current event types still received (via StartListen alarm callback)
- ✅ Frontend unchanged (same WebSocket events)
- ✅ Backend unchanged (same webhook endpoint)
- ✅ Matches official Dahua demo approach (AccessDemo2s/AccessForm.cs)
- ✅ Production-ready for real-world deployments
- ✅ Optional: Snapshot images still available via RealLoadPicture if device IP reachable

---

## 🚦 Status

- [ ] Phase 1: C# NetSDKBridge Changes
  - [ ] Create AccessControlEventsSdkModule.cs (or integrate into SDKBridgeService.cs)
  - [ ] Add StartListen() call after device login
  - [ ] Update MessageCallback() to parse alarm events
  - [ ] Deprecate CGI modules
- [ ] Phase 2: Backend Changes (Minimal - likely none needed)
- [ ] Phase 3: Frontend Changes (Minimal - likely none needed)
- [ ] Phase 4: Testing & Validation

**Status:** 📋 Planned - Not started yet

---

*Created: 2026-04-13*  
*Updated: 2026-04-13 (aligned with AccessDemo2s implementation analysis)*  
*Based on: AccessDemo2s official Dahua demo analysis + current NetSDKBridge codebase review*  
*Goal: SDK-native event subscription via StartListen for production-ready auto-registration support*
