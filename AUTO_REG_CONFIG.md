# 🔐 Auto Registration Configuration Guide

## 📋 Server Configuration

### Your Server Details:
- **Server IP:** `192.168.100.10`
- **Auto Registration Port:** `9500`
- **Platform Username:** `admin`
- **Platform Password:** `admin` (default - change in code if needed)

---

## 🎯 How Auto Registration Works

### Important Concept:
**The Access Control Device authenticates to YOUR server**, not the other way around!

```
┌─────────────────────────────────────┐
│  Your Access Control Device         │
│  - Already has credentials set      │
│  - Knows: Username, Password        │
│  - Knows: Server IP & Port          │
└────────┬────────────────────────────┘
         │
         │ Device initiates connection
         │ Sends its credentials
         ▼
┌─────────────────────────────────────┐
│  Your C# Server (192.168.100.10)    │
│  - Listening on port 9500           │
│  - Receives device connection       │
│  - Validates credentials            │
│  - Adds device to dashboard         │
└─────────────────────────────────────┘
```

---

## ⚙️ Configure Your Access Control Device

### Step 1: Access Device Web Interface

1. Open browser
2. Navigate to your device IP (e.g., `http://192.168.100.XX`)
3. Login with device admin credentials

### Step 2: Navigate to Platform/Auto Registration Settings

**Path varies by device model:**
- `Settings` → `Network` → `Platform Access`
- OR `Settings` → `System` → `Auto Register`
- OR `Configuration` → `Network` → `DHCP/Platform`

### Step 3: Enter Server Information

Fill in these fields on the **DEVICE**:

| Field | Value | Description |
|-------|-------|-------------|
| **Server IP** / **Platform IP** | `192.168.100.10` | Your server's IP address |
| **Port** | `9500` | Auto registration port |
| **Username** | `admin` | Platform username (matches server) |
| **Password** | `admin` | Platform password (matches server) |
| **Registration ID** / **Serial** | *(Leave blank or auto)* | Device identifies itself |
| **Enable** | ✅ Checked | Enable auto registration |

### Step 4: Save and Apply

- Click **Save** or **Apply**
- Device may reboot
- Device will attempt to connect to server

---

## 🔧 Change Platform Credentials (If Needed)

If you set different username/password on your device:

### Edit `Program.cs`:

```csharp
// Line ~72 in NetSDKBridge/Program.cs

// Change these to match what you configured on the device
sdkService.SetPlatformCredentials("admin", "admin");

// Example: If you set username="platform" and password="mypassword123"
sdkService.SetPlatformCredentials("platform", "mypassword123");
```

### Then rebuild:

```bash
cd NetSDKBridge
dotnet build
dotnet run
```

---

## 📊 What Happens When Device Connects

When your Access Control Device connects, you'll see:

### In C# Console:
```
✅ Auto Registration Server is listening...
   Server IP: 192.168.100.10
   Port: 9500
   Configure devices to connect here

📱 Device attempting auto-registration from: 192.168.100.XX
✅ Device auto-registered: 192.168.100.XX (Handle: 12345678)
   Device added to dashboard
   Listening for events...
```

### In Your Dashboard (http://localhost:3000):
- Device appears in device list
- Status shows "Online" with green indicator
- Device name shows IP address
- Auto-Reg badge visible
- Events start flowing in real-time

---

## 🔍 Troubleshooting

### Device Won't Connect

**Check these on the DEVICE:**
1. ✅ Server IP is exactly `192.168.100.10`
2. ✅ Port is exactly `9500`
3. ✅ Username matches server (`admin` by default)
4. ✅ Password matches server (`admin` by default)
5. ✅ Auto Registration is **Enabled**
6. ✅ Device and server are on same network

**Test network connectivity:**
```bash
# From device web interface or SSH to server
ping 192.168.100.10

# From server to device
ping <device-ip>
```

### Server Not Receiving Connections

**Check firewall on server:**
```bash
# Windows Firewall - Allow port 9500
netsh advfirewall firewall add rule name="NetSDK AutoReg" dir=in action=allow protocol=TCP localport=9500
```

**Check C# service is running:**
```bash
# Should see "Auto Registration Server is listening..."
# Check output of: dotnet run
```

### Credentials Mismatch

If device logs show "Authentication Failed" or "Login Error":

1. Check device logs for exact error
2. Verify username/password match exactly
3. Try changing credentials in `Program.cs`
4. Rebuild and restart C# service

---

## 🎓 Understanding the Flow

### What You Set on Device:
- **Registration ID** → Device's own identifier (serial number)
- **Username** → Authenticates to YOUR server
- **Password** → Authenticates to YOUR server
- **Server IP** → Where to connect (192.168.100.10)
- **Port** → Which port (9500)

### What Server Receives:
- Device's IP address
- Device's serial number/handle
- Authentication credentials
- Connection request

### What Server Does:
1. Listens on port 9500
2. Accepts incoming device connections
3. Validates credentials
4. Creates device entry in dashboard
5. Starts listening for events
6. Broadcasts to frontend via WebSocket

---

## 🚀 Quick Start Checklist

- [ ] C# Bridge running (`dotnet run` in NetSDKBridge)
- [ ] See "Auto Registration Server is listening..."
- [ ] Access device web interface
- [ ] Navigate to Platform/Auto Registration settings
- [ ] Enter Server IP: `192.168.100.10`
- [ ] Enter Port: `9500`
- [ ] Enter Username: `admin` (or your custom)
- [ ] Enter Password: `admin` (or your custom)
- [ ] Enable Auto Registration
- [ ] Save and Apply
- [ ] Watch console for "Device auto-registered..."
- [ ] Open dashboard at http://localhost:3000
- [ ] See device online! 🎉

---

## 📝 Configuration Files

### Where Credentials Are Stored:

**File:** `NetSDKBridge/Program.cs` (Line ~72)
```csharp
sdkService.SetPlatformCredentials("admin", "admin");
```

**File:** `NetSDKBridge/SDKBridgeService.cs` (Line ~29)
```csharp
private string _autoRegServerIP = "192.168.100.10";
private string _platformUsername = "admin";
private string _platformPassword = "";
```

**Change these if needed, then:**
```bash
dotnet build
dotnet run
```

---

## ✨ Summary

**You don't configure credentials on the server for the device to know.**

**Instead:**
1. Device already has credentials configured
2. Device connects to server using those credentials
3. Server validates and accepts the device
4. Server must have matching credentials to validate

**Think of it like:**
- Device = Client with username/password
- Server = Server that validates username/password
- Device initiates connection
- Server accepts and registers device

---

**Need help? Check console output for detailed logs!** 🔍
