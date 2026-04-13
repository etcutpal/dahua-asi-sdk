# 🔍 Access Control Events - Issues to Check

## Current Issues

### 1. Snapshot Images Not Showing
**Status**: ⚠️ Known SDK limitation

**Problem**: 
- Live events via `StartListen` (SDK alarm callback) do NOT include snapshot images
- Frontend shows "No image" placeholder

**Why This Happens**:
- `StartListen` method works through auto-registration (reverse TCP)
- Alarm events are text-only (user ID, card number, timestamp, etc.)
- Snapshot images require separate image download APIs

**What Needs Investigation**:

#### Option A: Check if device populates `szSnapURL` field
- [ ] Check NetSDKBridge logs for any `szSnapURL` values
- [ ] Compare with AccessDemo2s to see if they get snapshot URLs in alarm events
- [ ] Test with device directly on same network (not auto-reg)

#### Option B: Enable RealLoadPicture alongside StartListen
- [ ] Check if RealLoadPicture subscription is actually connecting
- [ ] Verify device IP is reachable: `ping <device_ip>`
- [ ] Check logs for `📷 [OPTIONAL] Attempting RealLoadPicture subscription`
- [ ] Look for any `AnalyzerDataCallBack` events in logs

#### Option C: Fetch snapshot separately after event received
- [ ] Research if Dahua SDK has API to fetch last snapshot by event ID
- [ ] Check if device stores recent snapshots locally
- [ ] Explore `snapManager.cgi` for on-demand snapshot (requires IP access)

#### Option D: Use device's local storage
- [ ] Device may store snapshots internally
- [ ] Check if there's an API to retrieve recent images
- [ ] Explore `NETClient.DownloadRemoteFile()` or similar methods

**Resources**:
- AccessDemo2s/AccessDemo2s/OpenDoorEventForm.cs - Uses RealLoadPicture for images
- AccessDemo2s/AccessDemo2s/AccessForm.cs - Uses StartListen (no images, just like us)
- NetSDK documentation: Section on snapshot retrieval

---

### 2. Door Name Shows "Door N/A"
**Status**: ⚠️ Data issue from device

**Problem**:
- Door number coming as `0` from device
- Frontend displays "Door N/A" when door is 0

**What Needs Investigation**:

#### Check SDK Struct Mapping
- [ ] Verify `NET_ALARM_ACCESS_CTL_EVENT_INFO.nDoor` is correctly mapped
- [ ] Check if device uses 0-based indexing (Door 0 = actual Door 1)
- [ ] Compare with AccessDemo2s - what door numbers do they receive?

#### Possible Fixes:
1. **If device uses 0-based indexing**:
   ```csharp
   // In AccessControlEventsSdkModule.cs
   Door = accessInfo.nDoor + 1,  // Convert 0→1, 1→2, etc.
   ```

2. **If device doesn't populate door field**:
   - Check `szDoorName` field instead (may have door name)
   - Use `ReaderID` field as fallback
   - Query device config to get door count and map accordingly

3. **Frontend display logic**:
   ```typescript
   // In AccessControlEventList.tsx
   <span>Door {event.data?.door ? event.data.door + 1 : 'N/A'}</span>
   ```

**What to Check**:
- [ ] Look at raw event data in `backend/data/access-events.json`
- [ ] Check what `nDoor` value is actually coming from SDK
- [ ] Compare with AccessDemo2s logs/output
- [ ] Check device web interface to see door numbering scheme

---

## How to Test

### 1. Check Current Event Data
```powershell
# View latest events
cd backend/data
Get-Content access-events.json -Tail 100
```

Look for:
```json
{
  "door": 0,                    // ← Is this 0 or actual number?
  "hasSnapshot": false,         // ← Always false with StartListen
  "snapshotBase64": "",         // ← Empty with StartListen
  "snapshotUrl": "",            // ← Empty with StartListen
  "source": "SDK_STARTLISTEN"   // ← Confirming source
}
```

### 2. Check NetSDKBridge Logs
```powershell
# Check latest logs
cd NetSDKBridge/logs
Get-ChildItem | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | Get-Content -Tail 200
```

Look for:
- `✅ SDK StartListen enabled for device`
- `🚪 ACCESS CONTROL EVENT (StartListen)`
- `szSnapURL` or snapshot-related messages
- Door number values in parsed events

### 3. Compare with AccessDemo2s
1. Open `AccessDemo2s/AccessDemo2s/bin/Debug/AccessDemo2s.exe`
2. Login to device
3. Click "StartListen" button
4. Trigger face/card access
5. Check what data they receive:
   - Door number value
   - Any snapshot URL or image data
   - Event structure

### 4. Test Device IP Connectivity
```powershell
# If device IP is 192.168.1.100 (check your device)
ping 192.168.1.100
Test-NetConnection -ComputerName 192.168.1.100 -Port 80
Test-NetConnection -ComputerName 192.168.1.100 -Port 37777
```

If reachable, RealLoadPicture might work for snapshots.

---

## Next Steps (Priority Order)

1. **Fix Door Number Display** (Easy - 30 min)
   - Check if 0-based indexing
   - Update code to add +1 or use ReaderID
   - Update frontend to display correctly

2. **Research Snapshot APIs** (Medium - 2-3 hours)
   - Review Dahua SDK documentation
   - Check AccessDemo2s for snapshot retrieval methods
   - Test if RealLoadPicture works with auto-reg

3. **Implement Snapshot Workaround** (Hard - 4-6 hours)
   - If RealLoadPicture works: integrate it
   - If not: explore device local storage APIs
   - If nothing works: document limitation for client

---

## Files Involved

### Backend (C#)
- `NetSDKBridge/Modules/AccessControlEventsSdkModule.cs` - Main event handler
- `NetSDKBridge/SDKBridgeService.cs` - Service orchestration
- `NetSDKBridge/NetSDKStruct.cs` - SDK struct definitions (line 18863+)

### Frontend (React/Next.js)
- `frontend/src/components/AccessControlEventList.tsx` - Event display
- `frontend/src/app/page.tsx` - Main dashboard

### Data
- `backend/data/access-events.json` - Stored events
- `NetSDKBridge/logs/` - Application logs

### Reference
- `AccessDemo2s/AccessDemo2s/AccessForm.cs` - Official demo (StartListen)
- `AccessDemo2s/AccessDemo2s/OpenDoorEventForm.cs` - Official demo (RealLoadPicture)
- `MIGRATION_PLAN_SDK_EVENTS.md` - Implementation plan

---

## Quick Reference: Event Sources

| Method | Works with Auto-Reg | Has Snapshots | Status |
|--------|-------------------|---------------|--------|
| **StartListen** (SDK Alarm) | ✅ Yes | ❌ No | ✅ Primary |
| **RealLoadPicture** (SDK) | ❌ Needs IP | ✅ Yes | ⚠️ Optional |
| **snapManager.cgi** | ❌ Needs IP | ✅ Yes | ❌ Deprecated |
| **eventManager.cgi** | ❌ Needs IP | ❌ No | ❌ Deprecated |

---

*Created: 2026-04-13*  
*Last Updated: 2026-04-13*  
*Status: Investigation needed for snapshots and door number*
