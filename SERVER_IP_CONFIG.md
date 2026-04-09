# Server IP Configuration Guide

## Overview
The server IP address is now configured via environment variables instead of being hardcoded in the source code.

## How to Change the Server IP

### 1. Update `.env` File
Edit `backend\.env` and change the `SERVER_IP` value:

```env
# Server IP for Auto Registration (used by NetSDKBridge)
# 0.0.0.0 = listen on ALL interfaces (recommended for external access)
# 127.0.0.1 = localhost only (devices on same PC)
# <your-ip> = listen on specific interface only
SERVER_IP=0.0.0.0
```

**Binding Options:**
| Value | Behavior |
|---|---|
| `0.0.0.0` | **Recommended** - Listens on ALL interfaces (localhost + LAN + public) |
| `127.0.0.1` | Localhost only - only same-PC connections work |
| `192.168.x.x` | LAN only - listens on specific LAN interface |
| `103.x.x.x` | Public IP only - listens on specific public interface |

### 2. Restart Services
Stop all running services and restart using:
```bash
start-all.bat
```

The batch file will automatically:
- Read the `SERVER_IP` from `backend\.env`
- Pass it to the NetSDKBridge process
- Display the current IP in the console output

## What Changed

### Files Modified:

1. **`backend\.env`**
   - Added `SERVER_IP` environment variable

2. **`NetSDKBridge\SDKBridgeService.cs`**
   - Changed hardcoded IP to read from environment variable:
     ```csharp
     private string _autoRegServerIP = Environment.GetEnvironmentVariable("SERVER_IP") ?? "127.0.0.1";
     ```
   - Added `GetServerIP()` method

3. **`NetSDKBridge\Program.cs`**
   - Removed hardcoded `SetServerIP("192.168.100.10")` call
   - Now reads IP from environment variable automatically
   - Log messages now show the configured IP dynamically

4. **`start-all.bat`**
   - Reads `SERVER_IP` from `backend\.env`
   - Passes it to the NetSDKBridge process
   - Displays the IP in the startup banner

## Finding Your Current IP

To find your current PC's IP address:
```cmd
ipconfig
```

Look for the IPv4 Address under your active network adapter.

## Device Configuration

After changing the server IP, you must also update your devices to point to the **actual reachable IP** of your PC:

- **Server IP**: Your PC's actual IP (LAN IP like `192.168.1.x` or public IP)
  - ⚠️ **Do NOT** use `0.0.0.0` on the device — that's a server binding address, not a connection address
- **Server Port**: 9500
- **Username**: admin
- **Password**: admin123

## Troubleshooting

### Devices not connecting?
1. Verify `SERVER_IP=0.0.0.0` in `backend\.env` (listens on all interfaces)
2. Check Windows Firewall allows inbound connections on port 9500
3. Ensure devices are configured with your **actual PC IP** (not `0.0.0.0`)
4. Check logs in: `NetSDKBridge\bin\Debug\net8.0\logs\netsdk-bridge.log`

### Service won't start?
1. Make sure no other instance is running
2. Check that the IP is valid and reachable
3. Verify `.env` file syntax (no spaces around `=`)
