# 📝 Comprehensive Logging Guide

## 📂 Log File Location

```
NetSDKBridge/logs/netsdk-bridge.log
```

Logs are also saved with timestamp:
```
NetSDKBridge/logs/netsdk-bridge-2026-04-08-14-30-00.log
```

---

## 🎯 What You'll See in Logs

### 1️⃣ **When Service Starts**

```
[2026-04-08 14:30:00.123] [INFO] [NetSDKBridge.Program] ============================================================
[2026-04-08 14:30:00.125] [INFO] [NetSDKBridge.Program] NetSDK Bridge Service Starting
[2026-04-08 14:30:00.126] [INFO] [NetSDKBridge.Program] ============================================================
[2026-04-08 14:30:00.234] [INFO] [NetSDKBridge.Program] Setting platform credentials...
[2026-04-08 14:30:00.235] [INFO] [NetSDKBridge.Program] ✅ Platform credentials set - Username: admin, Password: [HIDDEN]
[2026-04-08 14:30:00.236] [INFO] [NetSDKBridge.Program] Initializing NetSDK...
[2026-04-08 14:30:00.456] [INFO] [NetSDKBridge.SDKBridgeService] ✅ NetSDK initialized successfully
[2026-04-08 14:30:00.457] [INFO] [NetSDKBridge.Program] Starting Auto Registration Server...
[2026-04-08 14:30:00.458] [INFO] [NetSDKBridge.SDKBridgeService] Starting Auto Registration Server on 192.168.100.10:9500...
[2026-04-08 14:30:00.459] [INFO] [NetSDKBridge.SDKBridgeService] Platform Credentials - Username: admin, Password: [HIDDEN]
[2026-04-08 14:30:00.567] [INFO] [NetSDKBridge.SDKBridgeService] ✅ Auto Registration Server is listening...
[2026-04-08 14:30:00.568] [INFO] [NetSDKBridge.SDKBridgeService]    Server IP: 192.168.100.10
[2026-04-08 14:30:00.569] [INFO] [NetSDKBridge.SDKBridgeService]    Port: 9500
[2026-04-08 14:30:00.570] [INFO] [NetSDKBridge.SDKBridgeService]    Configure devices to connect here
[2026-04-08 14:30:00.571] [INFO] [NetSDKBridge.Program] ============================================================
[2026-04-08 14:30:00.572] [INFO] [NetSDKBridge.Program] ✅ NetSDK Bridge Service is READY
[2026-04-08 14:30:00.573] [INFO] [NetSDKBridge.Program] ============================================================
```

---

### 2️⃣ **When Device "ASI11" Connects**

```
[2026-04-08 14:31:15.234] [INFO] [NetSDKBridge.SDKBridgeService] ======================================================================
[2026-04-08 14:31:15.235] [INFO] [NetSDKBridge.SDKBridgeService] 📨 SERVICE CALLBACK RECEIVED
[2026-04-08 14:31:15.236] [INFO] [NetSDKBridge.SDKBridgeService] ======================================================================
[2026-04-08 14:31:15.237] [INFO] [NetSDKBridge.SDKBridgeService]    Event Type: NET_DVR_SERIAL_RETURN (1)
[2026-04-08 14:31:15.238] [INFO] [NetSDKBridge.SDKBridgeService]    Device IP: 192.168.100.50
[2026-04-08 14:31:15.239] [INFO] [NetSDKBridge.SDKBridgeService]    Device Port: 37777
[2026-04-08 14:31:15.240] [INFO] [NetSDKBridge.SDKBridgeService]    Registration ID Length: 4
[2026-04-08 14:31:15.241] [INFO] [NetSDKBridge.SDKBridgeService]    Registration ID: 'ASI11'
[2026-04-08 14:31:15.242] [INFO] [NetSDKBridge.SDKBridgeService]    Login Handle: 0
[2026-04-08 14:31:15.243] [INFO] [NetSDKBridge.SDKBridgeService] ======================================================================
[2026-04-08 14:31:15.244] [INFO] [NetSDKBridge.SDKBridgeService] 
[2026-04-08 14:31:15.245] [INFO] [NetSDKBridge.SDKBridgeService] 📱 DEVICE AUTO-REGISTRATION ATTEMPT
[2026-04-08 14:31:15.246] [INFO] [NetSDKBridge.SDKBridgeService]    Registration ID: ASI11
[2026-04-08 14:31:15.247] [INFO] [NetSDKBridge.SDKBridgeService]    Device IP: 192.168.100.50
[2026-04-08 14:31:15.248] [INFO] [NetSDKBridge.SDKBridgeService]    Device Port: 37777
[2026-04-08 14:31:15.249] [INFO] [NetSDKBridge.SDKBridgeService] ✅ NEW DEVICE DETECTED
[2026-04-08 14:31:15.250] [INFO] [NetSDKBridge.SDKBridgeService]    Registration ID: ASI11
[2026-04-08 14:31:15.251] [INFO] [NetSDKBridge.SDKBridgeService]    Device IP: 192.168.100.50
[2026-04-08 14:31:15.252] [INFO] [NetSDKBridge.SDKBridgeService]    Device Port: 37777
[2026-04-08 14:31:15.253] [INFO] [NetSDKBridge.SDKBridgeService]    Action: Starting login process...
```

**Then immediately after:**

```
[2026-04-08 14:31:15.353] [INFO] [NetSDKBridge.SDKBridgeService] ======================================================================
[2026-04-08 14:31:15.354] [INFO] [NetSDKBridge.SDKBridgeService] 🔑 STARTING AUTO-REG DEVICE LOGIN
[2026-04-08 14:31:15.355] [INFO] [NetSDKBridge.SDKBridgeService] ======================================================================
[2026-04-08 14:31:15.356] [INFO] [NetSDKBridge.SDKBridgeService]    Registration ID: ASI11
[2026-04-08 14:31:15.357] [INFO] [NetSDKBridge.SDKBridgeService]    Device IP: 192.168.100.50
[2026-04-08 14:31:15.358] [INFO] [NetSDKBridge.SDKBridgeService]    Device Port: 37777
[2026-04-08 14:31:15.359] [INFO] [NetSDKBridge.SDKBridgeService]    Platform Username: admin
[2026-04-08 14:31:15.360] [INFO] [NetSDKBridge.SDKBridgeService]    Platform Password: [HIDDEN]
[2026-04-08 14:31:15.361] [INFO] [NetSDKBridge.SDKBridgeService]    Login Mode: SERVER_CONN (required for auto-reg)
[2026-04-08 14:31:15.362] [INFO] [NetSDKBridge.SDKBridgeService] ======================================================================
[2026-04-08 14:31:15.363] [INFO] [NetSDKBridge.SDKBridgeService]    Calling NETClient.LoginWithHighLevelSecurity...
```

**If Login SUCCEEDS:**

```
[2026-04-08 14:31:15.678] [INFO] [NetSDKBridge.SDKBridgeService] ======================================================================
[2026-04-08 14:31:15.679] [INFO] [NetSDKBridge.SDKBridgeService] ✅ LOGIN SUCCESSFUL
[2026-04-08 14:31:15.680] [INFO] [NetSDKBridge.SDKBridgeService] ======================================================================
[2026-04-08 14:31:15.681] [INFO] [NetSDKBridge.SDKBridgeService]    Registration ID: ASI11
[2026-04-08 14:31:15.682] [INFO] [NetSDKBridge.SDKBridgeService]    Device IP: 192.168.100.50
[2026-04-08 14:31:15.683] [INFO] [NetSDKBridge.SDKBridgeService]    Login Handle: 123456789
[2026-04-08 14:31:15.684] [INFO] [NetSDKBridge.SDKBridgeService]    Device Serial: ASI11
[2026-04-08 14:31:15.685] [INFO] [NetSDKBridge.SDKBridgeService]    Device Channels: 1
[2026-04-08 14:31:15.686] [INFO] [NetSDKBridge.SDKBridgeService] ======================================================================
[2026-04-08 14:31:15.687] [INFO] [NetSDKBridge.SDKBridgeService]    Creating new device record
[2026-04-08 14:31:15.688] [INFO] [NetSDKBridge.SDKBridgeService]    Device added to registry: ASI11
[2026-04-08 14:31:15.689] [INFO] [NetSDKBridge.SDKBridgeService] 
[2026-04-08 14:31:15.690] [INFO] [NetSDKBridge.SDKBridgeService] 🎉 DEVICE FULLY CONNECTED AND READY
[2026-04-08 14:31:15.691] [INFO] [NetSDKBridge.SDKBridgeService]    Registration ID: ASI11
[2026-04-08 14:31:15.692] [INFO] [NetSDKBridge.SDKBridgeService]    Status: Online
[2026-04-08 14:31:15.693] [INFO] [NetSDKBridge.SDKBridgeService]    Events will flow through global callback
```

**If Login FAILS:**

```
[2026-04-08 14:31:15.678] [ERROR] [NetSDKBridge.SDKBridgeService] ======================================================================
[2026-04-08 14:31:15.679] [ERROR] [NetSDKBridge.SDKBridgeService] ❌ LOGIN FAILED
[2026-04-08 14:31:15.680] [ERROR] [NetSDKBridge.SDKBridgeService] ======================================================================
[2026-04-08 14:31:15.681] [ERROR] [NetSDKBridge.SDKBridgeService]    Registration ID: ASI11
[2026-04-08 14:31:15.682] [ERROR] [NetSDKBridge.SDKBridgeService]    Device IP: 192.168.100.50
[2026-04-08 14:31:15.683] [ERROR] [NetSDKBridge.SDKBridgeService]    Error Code: NETSDK_NOT_INITALIZED
[2026-04-08 14:31:15.684] [ERROR] [NetSDKBridge.SDKBridgeService]    Troubleshooting:
[2026-04-08 14:31:15.685] [ERROR] [NetSDKBridge.SDKBridgeService]      1. Check if device username/password match server credentials
[2026-04-08 14:31:15.686] [ERROR] [NetSDKBridge.SDKBridgeService]      2. Check if device Registration ID matches what server expects
[2026-04-08 14:31:15.687] [ERROR] [NetSDKBridge.SDKBridgeService]      3. Check if device is on same network
[2026-04-08 14:31:15.688] [ERROR] [NetSDKBridge.SDKBridgeService]      4. Check firewall settings
[2026-04-08 14:31:15.689] [ERROR] [NetSDKBridge.SDKBridgeService] ======================================================================
```

---

### 3️⃣ **When Device Disconnects**

**Via Disconnect Callback (most common):**

```
[2026-04-08 14:45:30.123] [INFO] [NetSDKBridge.SDKBridgeService] ======================================================================
[2026-04-08 14:45:30.124] [INFO] [NetSDKBridge.SDKBridgeService] 🔌 DISCONNECT CALLBACK FIRED
[2026-04-08 14:45:30.125] [INFO] [NetSDKBridge.SDKBridgeService] ======================================================================
[2026-04-08 14:45:30.126] [INFO] [NetSDKBridge.SDKBridgeService]    Device IP: 192.168.100.50
[2026-04-08 14:45:30.127] [INFO] [NetSDKBridge.SDKBridgeService]    Device Port: 37777
[2026-04-08 14:45:30.128] [INFO] [NetSDKBridge.SDKBridgeService]    Login ID: 123456789
[2026-04-08 14:45:30.129] [INFO] [NetSDKBridge.SDKBridgeService] ======================================================================
[2026-04-08 14:45:30.130] [INFO] [NetSDKBridge.SDKBridgeService] ✅ DEVICE FOUND BY IP+PORT
[2026-04-08 14:45:30.131] [INFO] [NetSDKBridge.SDKBridgeService]    Registration ID: ASI11
[2026-04-08 14:45:30.132] [INFO] [NetSDKBridge.SDKBridgeService]    Previous Status: Online
[2026-04-08 14:45:30.133] [INFO] [NetSDKBridge.SDKBridgeService]    Login Handle: 123456789
[2026-04-08 14:45:30.134] [INFO] [NetSDKBridge.SDKBridgeService]    Login handle cleared
[2026-04-08 14:45:30.135] [INFO] [NetSDKBridge.SDKBridgeService]    Status changed to: OFFLINE
```

**OR via Service Callback (NET_DVR_DISCONNECT):**

```
[2026-04-08 14:45:30.234] [INFO] [NetSDKBridge.SDKBridgeService] ======================================================================
[2026-04-08 14:45:30.235] [INFO] [NetSDKBridge.SDKBridgeService] 📨 SERVICE CALLBACK RECEIVED
[2026-04-08 14:45:30.236] [INFO] [NetSDKBridge.SDKBridgeService] ======================================================================
[2026-04-08 14:45:30.237] [INFO] [NetSDKBridge.SDKBridgeService]    Event Type: NET_DVR_DISCONNECT (-1)
[2026-04-08 14:45:30.238] [INFO] [NetSDKBridge.SDKBridgeService]    Device IP: 192.168.100.50
[2026-04-08 14:45:30.239] [INFO] [NetSDKBridge.SDKBridgeService]    Device Port: 37777
[2026-04-08 14:45:30.240] [INFO] [NetSDKBridge.SDKBridgeService]    Registration ID Length: 4
[2026-04-08 14:45:30.241] [INFO] [NetSDKBridge.SDKBridgeService]    Registration ID: 'ASI11'
[2026-04-08 14:45:30.242] [INFO] [NetSDKBridge.SDKBridgeService] ======================================================================
[2026-04-08 14:45:30.243] [INFO] [NetSDKBridge.SDKBridgeService] 
[2026-04-08 14:45:30.244] [INFO] [NetSDKBridge.SDKBridgeService] ⚠️  DEVICE DISCONNECT DETECTED (NET_DVR_DISCONNECT)
[2026-04-08 14:45:30.245] [INFO] [NetSDKBridge.SDKBridgeService]    Registration ID: ASI11
[2026-04-08 14:45:30.246] [INFO] [NetSDKBridge.SDKBridgeService]    Device IP: 192.168.100.50
[2026-04-08 14:45:30.247] [INFO] [NetSDKBridge.SDKBridgeService]    Found device in registry: YES
[2026-04-08 14:45:30.248] [INFO] [NetSDKBridge.SDKBridgeService]    Previous Status: Online
[2026-04-08 14:45:30.249] [INFO] [NetSDKBridge.SDKBridgeService]    Login Handle: 123456789
[2026-04-08 14:45:30.250] [INFO] [NetSDKBridge.SDKBridgeService]    Login handle cleared
[2026-04-08 14:45:30.251] [INFO] [NetSDKBridge.SDKBridgeService] ✅ Device marked as OFFLINE
```

---

### 4️⃣ **When Device Reconnects**

```
[2026-04-08 14:50:00.123] [INFO] [NetSDKBridge.SDKBridgeService] ======================================================================
[2026-04-08 14:50:00.124] [INFO] [NetSDKBridge.SDKBridgeService] 📨 SERVICE CALLBACK RECEIVED
[2026-04-08 14:50:00.125] [INFO] [NetSDKBridge.SDKBridgeService] ======================================================================
[2026-04-08 14:50:00.126] [INFO] [NetSDKBridge.SDKBridgeService]    Event Type: NET_DVR_SERIAL_RETURN (1)
[2026-04-08 14:50:00.127] [INFO] [NetSDKBridge.SDKBridgeService]    Registration ID: 'ASI11'
[2026-04-08 14:50:00.128] [INFO] [NetSDKBridge.SDKBridgeService] ======================================================================
[2026-04-08 14:50:00.129] [INFO] [NetSDKBridge.SDKBridgeService] 🔄 DEVICE RECONNECTION DETECTED
[2026-04-08 14:50:00.130] [INFO] [NetSDKBridge.SDKBridgeService]    Registration ID: ASI11
[2026-04-08 14:50:00.131] [INFO] [NetSDKBridge.SDKBridgeService]    Old IP: 192.168.100.50
[2026-04-08 14:50:00.132] [INFO] [NetSDKBridge.SDKBridgeService]    New IP: 192.168.100.50
[2026-04-08 14:50:00.133] [INFO] [NetSDKBridge.SDKBridgeService]    Previous Status: Offline
[2026-04-08 14:50:00.134] [INFO] [NetSDKBridge.SDKBridgeService] ✅ Device reconnected successfully
```

---

## 🔍 Common Issues & What Logs Show

### ❌ Problem: "Device connected but NO registration ID provided"

```
[WARN] ⚠️  Device connected but NO registration ID provided
[WARN]    Device IP: 192.168.100.50
[WARN]    This usually means the device is not configured with a Registration ID
```

**Solution:** 
- Check device web interface
- Ensure "Registration ID" is set to `ASI11`
- Save and restart device

---

### ❌ Problem: "LOGIN FAILED - Error Code: NETSDK_LOGIN_PASSWORD"

```
[ERROR] ❌ LOGIN FAILED
[ERROR]    Error Code: NETSDK_LOGIN_PASSWORD
[ERROR]    Troubleshooting:
[ERROR]      1. Check if device username/password match server credentials
```

**Solution:**
- Device username: `admin`
- Device password: `admin123`
- Server must match: Check `Program.cs` has `SetPlatformCredentials("admin", "admin123")`

---

### ❌ Problem: "Device NOT FOUND in registry"

```
[WARN] ⚠️  DEVICE NOT FOUND by IP+Port
[WARN]    Searching by login handle instead...
[WARN] ❌ DEVICE NOT FOUND in registry
[WARN]    This may be a device that was already removed
```

**Solution:**
- This is normal if device was manually removed from frontend
- No action needed

---

### ❌ Problem: No callbacks firing at all

```
(No SERVICE CALLBACK logs appear)
```

**Solution:**
- Check device configured with correct server IP: `192.168.100.10`
- Check device configured with correct port: `9500`
- Check firewall allows port 9500
- Check device and server on same network
- Try pinging server from device

---

## 📊 Log Level Guide

| Level | Icon | Description |
|-------|------|-------------|
| DEBUG | 🔍 | Detailed internal operations |
| INFO  | ℹ️  | Normal operations (what you'll see most) |
| WARN  | ⚠️  | Potential issues that need attention |
| ERROR | ❌  | Operations that failed |
| CRITICAL | 🚨 | Fatal errors that stop the service |

---

## 🎯 Your Device Configuration

Based on what you provided:

### Device Side (Face Access Device):
- **Registration ID:** `ASI11`
- **Username:** `admin`
- **Password:** `admin123`
- **Server IP:** `192.168.100.10`
- **Server Port:** `9500`

### Server Side (Your Application):
- **Listening IP:** `192.168.100.10`
- **Listening Port:** `9500`
- **Platform Username:** `admin`
- **Platform Password:** `admin123`

---

## 🚀 How to Monitor Logs in Real-Time

### Windows PowerShell:
```powershell
Get-Content "NetSDKBridge\logs\netsdk-bridge.log" -Wait -Tail 50
```

### Windows Command Prompt:
```cmd
type NetSDKBridge\logs\netsdk-bridge.log
```
*(Press F5 to refresh)*

### Visual Studio Code:
1. Open folder `NetSDKBridge\logs\`
2. Click on `netsdk-bridge.log`
3. File will auto-update as new entries are written

---

## 📝 Log File Structure

```
NetSDKBridge/
├── logs/
│   ├── netsdk-bridge.log                    ← Current log file
│   └── netsdk-bridge-2026-04-08-14-30-00.log ← Timestamped backup
├── Program.cs
├── SDKBridgeService.cs
└── ...
```

---

**Now you have complete visibility into everything happening in the background!** 🎉

---

**Created:** April 8, 2026  
**Device:** ASI11  
**Server:** 192.168.100.10:9500
