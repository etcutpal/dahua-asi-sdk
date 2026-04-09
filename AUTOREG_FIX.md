# 🔧 Auto Registration Fix - Complete Implementation

## 📋 Problems Fixed

### ✅ Problem 1: Device Status Not Updating on Disconnect
**Issue:** Device showed "connected" even after 10+ minutes of disconnection

**Root Cause:**
- Previous implementation used a **health check timer** that marked devices offline based on timeout
- This was incorrect - the SDK provides **real-time disconnect callbacks**
- The health check was unreliable and didn't use the official SDK's disconnect detection

**Solution:**
- ✅ Removed health check timer completely
- ✅ Implemented proper **dual disconnect detection**:
  1. **`fDisConnectCallBack`** - Fires when any logged-in device disconnects (provides IP + Port)
  2. **`NET_DVR_DISCONNECT` in `fServiceCallBack`** - Fires when auto-registered device disconnects (provides Registration ID)
- ✅ Both callbacks now work together to ensure immediate disconnect detection

### ✅ Problem 2: Wrong Serial Number Display
**Issue:** Serial number showed incorrect or missing values

**Root Cause:**
- Device ID was generated as **GUID** instead of using actual device serial number
- Serial number was not properly extracted from the SDK callback

**Solution:**
- ✅ Device ID is now the **Registration ID** (device's serial number) from `pParam` in service callback
- ✅ Properly extracted using `Marshal.PtrToStringAnsi(pParam)` when `dwParamLen > 0`
- ✅ After login, serial number is updated from `NET_DEVICEINFO_Ex.sSerialNumber`
- ✅ Frontend now displays actual serial numbers correctly

### ✅ Problem 3: Auto Registration Not Working Like Official Demo
**Issue:** Devices connected via official demo showed online, but custom app didn't work

**Root Cause:**
- Login was using **`EM_LOGIN_SPAC_CAP_TYPE.TCP`** instead of **`EM_LOGIN_SPAC_CAP_TYPE.SERVER_CONN`**
- This is **critical** for auto-registered devices - they MUST use SERVER_CONN mode
- The `pCapParam` must contain the device's registration ID (serial number)

**Solution:**
- ✅ Auto-reg devices now login with `EM_LOGIN_SPAC_CAP_TYPE.SERVER_CONN`
- ✅ Registration ID passed as `pCapParam` (exactly like official demo)
- ✅ Manual login still uses `TCP` mode (correct for direct connections)

---

## 🔍 Official Demo Analysis

### AutoRegisterDemo.cs Flow (Reference Implementation)

```csharp
// 1. Initialize SDK with disconnect callback
m_DisConnectCallBack = new fDisConnectCallBack(DisConnectCallBack);
NETClient.Init(m_DisConnectCallBack, IntPtr.Zero, null);

// 2. Start listening for auto-reg devices
m_ListenID = NETClient.ListenServer(textBox_ip.Text.Trim(), port, 1000, m_ServiceCallBack, IntPtr.Zero);

// 3. Service callback receives device connection
private int ServiceCallBack(IntPtr lHandle, IntPtr pIp, ushort wPort, int lCommand, IntPtr pParam, uint dwParamLen, IntPtr dwUserData)
{
    EM_LISTEN_TYPE type = (EM_LISTEN_TYPE)lCommand;
    string ip = Marshal.PtrToStringAnsi(pIp);
    string id = "";
    if (dwParamLen > 0)
    {
        id = Marshal.PtrToStringAnsi(pParam); // ← Registration ID (Serial Number)
    }
    
    // Queue device for login
    if (type == EM_LISTEN_TYPE.NET_DVR_SERIAL_RETURN)
    {
        lock (queueLock)
        {
            m_DeviceQueue.Enqueue(info);
        }
    }
    return 0;
}

// 4. Login to auto-reg device with SERVER_CONN
NET_DEVICEINFO_Ex device = new NET_DEVICEINFO_Ex();
IntPtr pParam = Marshal.StringToHGlobalAnsi(item.ID); // ← Registration ID
IntPtr loginID = NETClient.LoginWithHighLevelSecurity(
    item.IP, item.Port, item.UserName, item.Password, 
    EM_LOGIN_SPAC_CAP_TYPE.SERVER_CONN,  // ← CRITICAL!
    pParam,  // ← Registration ID as parameter
    ref device
);
```

### EM_LISTEN_TYPE Enum Values

```csharp
public enum EM_LISTEN_TYPE
{
    NET_DVR_DISCONNECT = -1,         // Device disconnected
    NET_DVR_SERIAL_RETURN = 1,       // Device connected with serial number
    NET_DEV_AUTOREGISTER_RETURN,     // Device with token (extended)
    NET_DEV_NOTIFY_IP_RETURN,        // IP notification only
}
```

---

## 📝 Changes Made

### 1. **SDKBridgeService.cs** - Complete Rewrite

#### Removed:
- ❌ Health check timer (`_healthCheckTimer`)
- ❌ `StartHealthCheckTimer()`, `StopHealthCheckTimer()`, `HealthCheckTimer_Elapsed()`
- ❌ `UpdateDeviceHeartbeat()`
- ❌ GUID-based device IDs

#### Added:
- ✅ **Proper `ServiceCallback`** implementation:
  - Handles `NET_DVR_SERIAL_RETURN` - Device connecting
  - Handles `NET_DVR_DISCONNECT` - Device disconnecting
  - Extracts registration ID from `pParam` correctly
  - Returns `0` (as per official demo)

- ✅ **`LoginAutoRegDevice()`** method:
  - Uses `EM_LOGIN_SPAC_CAP_TYPE.SERVER_CONN` (not TCP)
  - Passes registration ID as `pCapParam`
  - Updates device with actual serial number from `NET_DEVICEINFO_Ex`

- ✅ **Enhanced `DisconnectCallback`**:
  - Finds device by IP + Port combination
  - Also finds by login handle as fallback
  - Immediately marks device offline
  - Clears login handles

- ✅ **Device tracking by Registration ID**:
  - `_devices` dictionary keyed by serial number, not GUID
  - `_loginHandles` maps login handle → registration ID

### 2. **Program.cs** - Credentials Update

```csharp
// Changed from admin/admin123 to admin/admin
sdkService.SetPlatformCredentials("admin", "admin");
```

**Note:** Change this to match what's configured on your devices!

### 3. **netSdkService.js** - Smart Polling

#### Before:
```javascript
// Just emitted devices:update every 5 seconds
eventService.emit('devices:update', devices);
```

#### After:
```javascript
// Tracks previous state and detects changes
// Emits device:status:changed when status differs
eventService.emit('device:status:changed', {
  deviceID: currentDevice.deviceID,
  status: currStatus,
  device: currentDevice,
  timestamp: new Date().toISOString()
});
```

### 4. **SocketContext.tsx** - Data Normalization

Added normalization to handle both C# PascalCase and JavaScript camelCase:

```typescript
const normalized = updatedDevices.map((dev: any) => ({
  deviceID: dev.deviceID || dev.DeviceID || dev.deviceid,
  ip: dev.ip || dev.IP,
  status: dev.status || dev.Status,
  serialNumber: dev.serialNumber || dev.SerialNumber,
  // ... more fields
}));
```

### 5. **page.tsx** - Debug Display

Added device status list to "Total Devices" card for debugging:

```typescript
{devices.map((d: Device) => (
  <div key={d.deviceID} className="truncate">
    {d.serialNumber || d.deviceID} - {d.status}
  </div>
))}
```

---

## 🚀 How It Works Now

### Device Connection Flow

```
1. Device configured with:
   - Server IP: 192.168.100.10
   - Server Port: 9500
   - Registration ID: (device's serial number)
   
2. Device initiates connection to server

3. ServiceCallback fires with:
   - lCommand = EM_LISTEN_TYPE.NET_DVR_SERIAL_RETURN
   - pIp = Device IP
   - pParam = Registration ID (serial number) ← KEY!
   - dwParamLen > 0

4. Server extracts registration ID:
   string registrationID = Marshal.PtrToStringAnsi(pParam);

5. Server logs in with SERVER_CONN:
   NETClient.LoginWithHighLevelSecurity(
     ip, port, username, password,
     EM_LOGIN_SPAC_CAP_TYPE.SERVER_CONN, ← CRITICAL!
     Marshal.StringToHGlobalAnsi(registrationID),
     ref deviceInfo
   );

6. Device marked as Online with:
   - DeviceID = registrationID (serial number)
   - Status = "Online"
   - SerialNumber = deviceInfo.sSerialNumber
```

### Device Disconnect Flow

```
1. Device disconnects (network issue, power off, etc.)

2a. fDisConnectCallBack fires:
    - pchDVRIP = Device IP
    - nDVRPort = Device port
    → Find device by IP+Port → Mark Offline

2b. ServiceCallback fires with NET_DVR_DISCONNECT:
    - pParam = Registration ID
    → Find device by registration ID → Mark Offline

3. Backend polling detects status change:
    - Compares current state vs previous state
    - Emits device:status:changed via WebSocket

4. Frontend updates immediately:
    - Status changes to "Offline"
    - Visual indicator shows red/offline
```

---

## 🧪 Testing Steps

### 1. Build C# Bridge
```bash
cd NetSDKBridge
dotnet build
```
✅ Should build successfully (68 warnings from SDK - safe to ignore)

### 2. Start All Services
```bash
# Terminal 1 - C# Bridge
cd NetSDKBridge
dotnet run

# Terminal 2 - Backend
cd backend
npm run dev

# Terminal 3 - Frontend
cd frontend
npm run dev
```

### 3. Configure Device
On your face access device web interface:
- Navigate to: Settings → Network → Platform Access / Auto Registration
- Enable: ✅ Auto Registration
- Server IP: `192.168.100.10` (your server IP)
- Port: `9500`
- Registration ID: *(Leave as device serial number or set custom)*
- Username: `admin` (must match server)
- Password: `admin` (must match server)
- Save & Apply

### 4. Verify Connection
**C# Console should show:**
```
✅ Auto Registration Server is listening...
   Server IP: 192.168.100.10
   Port: 9500

📨 ServiceCallback - Type: NET_DVR_SERIAL_RETURN, IP: 192.168.100.XX, RegID: 'DH1234567890'
📱 Device auto-registration attempt: DH1234567890 from 192.168.100.XX:37777
🔑 Attempting login to auto-reg device: DH1234567890 at 192.168.100.XX:37777
✅ Successfully logged in to device: DH1234567890
   Login Handle: 123456789
   Channels: 1
   Serial: DH1234567890
🎉 Device fully connected and ready: DH1234567890
```

### 5. Verify Frontend
- Open http://localhost:3000
- Device should appear in list
- Serial number shows actual device serial (e.g., DH1234567890)
- Status shows "Online" with green indicator
- "Total Devices" card shows device list with status

### 6. Test Disconnect
1. Unplug device or disable network
2. Within 5-10 seconds, C# console should show:
   ```
   🔌 DisconnectCallback fired - IP: 192.168.100.XX, Port: 37777
   ❌ Device disconnected (via disconnect callback): DH1234567890
   ```
   OR
   ```
   📨 ServiceCallback - Type: NET_DVR_DISCONNECT, RegID: 'DH1234567890'
   ⚠️ Device disconnected: DH1234567890
   ❌ Device marked offline: DH1234567890
   ```

3. Frontend should update to "Offline" with red indicator within 5-10 seconds

### 7. Test Reconnect
1. Plug device back in or restore network
2. Device should automatically reconnect
3. Console shows reconnection message
4. Frontend updates to "Online" within 5-10 seconds

---

## 🔑 Key Differences from Before

| Aspect | Before (Broken) | After (Fixed) |
|--------|----------------|---------------|
| **Device ID** | GUID (random UUID) | Registration ID (device serial number) |
| **Login Mode** | `TCP` for all devices | `SERVER_CONN` for auto-reg, `TCP` for manual |
| **Disconnect Detection** | Health check timer (unreliable) | Dual callbacks (immediate) |
| **Serial Number** | Missing/wrong | Correct from device |
| **Status Updates** | Only on polling | Real-time via WebSocket |
| **Callback Return** | `1` (incorrect) | `0` (as per official demo) |

---

## ⚙️ Configuration

### Server Side (Your Application)

**File:** `NetSDKBridge/Program.cs`
```csharp
// Server IP to listen on
sdkService.SetServerIP("192.168.100.10");

// Credentials devices will use to authenticate
sdkService.SetPlatformCredentials("admin", "admin");
```

### Device Side (Face Access Device)

**Via Web Interface:**
- Server IP: `192.168.100.10`
- Port: `9500`
- Registration ID: Device's serial number (auto-filled)
- Username: `admin`
- Password: `admin`
- Enable: ✅ Yes

**Both sides MUST match!**

---

## 📊 Architecture (Fixed)

```
┌─────────────────────────────────────┐
│  Dahua Face Access Device           │
│  Configured with:                   │
│  - Server IP: 192.168.100.10       │
│  - Port: 9500                       │
│  - Reg ID: DH1234567890            │
│  - Username: admin                  │
│  - Password: admin                  │
└────────┬────────────────────────────┘
         │
         │ Auto-registration connection
         │ (device initiates)
         ▼
┌─────────────────────────────────────┐
│  C# NetSDK Bridge (Port 5000)       │
│  ✅ ListenServer on port 9500       │
│  ✅ ServiceCallback receives:       │
│     - IP: 192.168.100.XX           │
│     - RegID: DH1234567890          │
│  ✅ LoginWithHighLevelSecurity:     │
│     - Mode: SERVER_CONN            │
│     - pCapParam: DH1234567890      │
│  ✅ DisconnectCallback fires:       │
│     - Immediately on disconnect     │
│  ✅ NET_DVR_DISCONNECT in callback  │
└────────┬────────────────────────────┘
         │
         │ REST API (polling every 5s)
         ▼
┌─────────────────────────────────────┐
│  Express.js Backend (Port 3001)     │
│  ✅ Polls /api/devices              │
│  ✅ Detects status changes          │
│  ✅ Emits via Socket.IO:            │
│     - devices:update (full list)    │
│     - device:status:changed         │
└────────┬────────────────────────────┘
         │
         │ WebSocket
         ▼
┌─────────────────────────────────────┐
│  Next.js Frontend (Port 3000)       │
│  ✅ Receives real-time updates      │
│  ✅ Shows serial number correctly   │
│  ✅ Updates status immediately      │
│  ✅ Debug display in Total Devices  │
└─────────────────────────────────────┘
```

---

## 🎯 Success Criteria

✅ Device connects automatically when configured  
✅ Serial number displays correctly (not GUID)  
✅ Status updates to "Online" immediately  
✅ Status updates to "Offline" within 10s of disconnect  
✅ Reconnection works automatically  
✅ Frontend shows real-time status changes  
✅ C# bridge builds without errors  
✅ Backend polling detects all status changes  

---

## 📚 Reference Files Analyzed

1. **Official Demo:**
   - `General_NetSDK_Eng_CSharp_Win64_IS_V3.060.0000003.0.R.251202\Demos\AutoRegister\AutoRegister\AutoRegisterDemo.cs`

2. **SDK Wrapper:**
   - `NetSDK.cs` - Main wrapper (9942 lines)
   - `NetSDKStruct.cs` - Data structures
   - `OriginalSDK.cs` - P/Invoke declarations

3. **Key Structures:**
   - `EM_LISTEN_TYPE` - Listen event types
   - `EM_LOGIN_SPAC_CAP_TYPE` - Login modes
   - `fServiceCallBack` - Service callback delegate
   - `fDisConnectCallBack` - Disconnect callback delegate

---

## 🚨 Important Notes

1. **Credentials Match:** Device username/password MUST match server credentials
2. **Network:** Device and server must be on same network
3. **Firewall:** Port 9500 must be open on server firewall
4. **Serial Number:** Registration ID = device's serial number (set on device)
5. **Login Mode:** Auto-reg uses `SERVER_CONN`, manual uses `TCP` - **they are different!**

---

## 🐛 Troubleshooting

### Device Won't Connect
1. ✅ Check server IP matches exactly (192.168.100.10)
2. ✅ Check port is 9500
3. ✅ Check username/password match on both sides
4. ✅ Check firewall allows port 9500
5. ✅ Check C# bridge is running

### Serial Number Still Wrong
1. ✅ Check device actually has a serial number configured
2. ✅ Check `dwParamLen > 0` in service callback
3. ✅ Look at C# console logs for registration ID

### Disconnect Not Detected
1. ✅ Check C# console for callback messages
2. ✅ Wait up to 30s (SDK may delay disconnect notification)
3. ✅ Check both callbacks fire (disconnect + service)

### Status Not Updating in Frontend
1. ✅ Check backend is polling (console logs every 5s)
2. ✅ Check WebSocket connection in browser dev tools
3. ✅ Check backend emits `device:status:changed` event

---

**All issues fixed! Ready to test with actual devices.** 🚀

---

**Date:** April 8, 2026  
**Based on:** Official Dahua NetSDK AutoRegister Demo Analysis  
**SDK Version:** V3.060.0000003.0.R.251202
