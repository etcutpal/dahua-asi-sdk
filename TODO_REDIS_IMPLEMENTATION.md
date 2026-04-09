# TODO: Redis Implementation for Device State Management

## Status: **Webhook System Implemented** ✅
- **Polling has been replaced with real-time Webhooks.**
- C# Bridge now sends instant status updates to Backend when a device connects or disconnects.
- Redis is no longer required for status synchronization, but still recommended for persistence.

## Overview
Replace in-memory device state tracking with Redis for persistent, scalable device state management.

## Current Implementation
- In-memory `ConcurrentDictionary` for device storage
- In-memory `ConcurrentDictionary` for login handle mapping
- In-memory `ConcurrentDictionary` for hardware serial fetch tracking (`_hasFetchedHardwareSerial`)
- State is lost when the NetSDKBridge service restarts
- **Webhook system sends real-time status updates to Backend**

## Why Redis?
1. **Persistence**: Device state survives service restarts
2. **Scalability**: Multiple bridge instances can share state
3. **Distributed**: Supports horizontal scaling across multiple servers
4. **Performance**: Sub-millisecond read/write operations
5. **Pub/Sub**: Real-time event broadcasting to multiple subscribers

## What to Implement

### 1. Device State Storage
```csharp
// Current (In-Memory)
private readonly ConcurrentDictionary<string, DeviceInfo> _devices = new();

// Future (Redis)
private readonly IDatabase _redisDb;
// Store devices as Redis Hash with device ID as key
// Key: "device:{deviceId}"
// Fields: name, registrationId, ip, serial, status, loginHandle, etc.
```

### 2. Hardware Serial Fetch Tracking
```csharp
// Current (In-Memory)
private readonly ConcurrentDictionary<string, bool> _hasFetchedHardwareSerial = new();

// Future (Redis)
// Key: "device:serial_fetched:{deviceId}"
// Value: "true" or "false"
// TTL: None (managed manually - cleared on disconnect)
```

### 3. Login Handle Mapping
```csharp
// Current (In-Memory)
private readonly ConcurrentDictionary<long, string> _loginHandles = new();

// Future (Redis)
// Key: "device:login_handle:{handleId}"
// Value: "{deviceId}"
// TTL: None (managed manually)
```

## Key Requirements

### On Device Online (Auto-Registration)
1. Check Redis for `_hasFetchedHardwareSerial:{deviceId}`
2. If `false` or not exists:
   - Fetch hardware serial from device via SDK/CGI
   - Update device record in Redis
   - Set `_hasFetchedHardwareSerial:{deviceId} = true`
3. If `true`:
   - Use existing serial from Redis
   - Only update status to "Online"
   - Update IP and login handle

### On Device Offline (Disconnect)
1. Update device status to "Offline" in Redis
2. Clear `_hasFetchedHardwareSerial:{deviceId}` (delete key)
3. Clear `device:login_handle:{handleId}` (delete key)
4. Log disconnect event

### On User Edit Device
1. Update device record in Redis
2. No need to re-fetch hardware serial
3. Only update user-provided fields (name, username, password)

### On Service Startup
1. Connect to Redis
2. Load all devices from Redis
3. Clear all `_hasFetchedHardwareSerial:*` keys (assume all devices need serial fetch on fresh start)
4. Clear all `device:login_handle:*` keys (no active connections)
5. Set all device statuses to "Offline" (assume all disconnected during restart)

## Redis Data Structure

### Device Hash
```
Key: device:86012117
Fields:
  - deviceId: "86012117"
  - name: "AE0550FPAJ48EDA"
  - registrationId: "ASI11"
  - username: "admin"
  - password: "encrypted_password"
  - ip: "192.168.100.111"
  - serial: "AE0550FPAJ48EDA"
  - status: "Online"
  - loginHandle: "1876758740080"
  - port: "59122"
  - type: "Face Recognition Terminal"
  - generation: "2nd Generation"
  - channelCount: "1"
  - isAutoRegistered: "true"
  - createdAt: "2026-04-08T18:37:44Z"
  - updatedAt: "2026-04-08T18:45:00Z"
```

### Serial Fetch Tracking
```
Key: device:serial_fetched:86012117
Value: "true"
```

### Login Handle Mapping
```
Key: device:login_handle:1876758740080
Value: "86012117"
```

### Device Index (for listing all devices)
```
Key: devices:index
Type: Set
Members: ["86012117", "37677997", ...]
```

## Implementation Steps

1. **Install Redis Package**
   ```bash
   dotnet add package StackExchange.Redis
   ```

2. **Add Redis Configuration**
   - Add to `appsettings.json`:
     ```json
     "Redis": {
       "ConnectionString": "localhost:6379",
       "InstanceName": "NetSDKBridge:"
     }
     ```

3. **Create Redis Service**
   - `RedisService.cs` - Wrapper for Redis operations
   - Methods: `GetDeviceAsync`, `SetDeviceAsync`, `DeleteDeviceAsync`, `GetAllDevicesAsync`
   - Methods: `SetSerialFetchedAsync`, `ClearSerialFetchedAsync`, `IsSerialFetchedAsync`
   - Methods: `SetLoginHandleAsync`, `RemoveLoginHandleAsync`, `GetDeviceByHandleAsync`

4. **Update SDKBridgeService**
   - Replace `ConcurrentDictionary` with Redis calls
   - Update all read/write operations to use async Redis methods
   - Add error handling for Redis connection failures
   - Implement fallback to in-memory if Redis is unavailable

5. **Add Redis Connection Health Check**
   - Monitor Redis connectivity
   - Auto-reconnect on connection loss
   - Queue operations during disconnection

6. **Add Password Encryption**
   - Encrypt device passwords before storing in Redis
   - Use AES-256 encryption
   - Store encryption key in environment variable or key vault

7. **Update Frontend**
   - No changes needed - API remains the same
   - Backend handles Redis abstraction

## Migration Plan

1. **Phase 1**: Dual-write (write to both memory and Redis)
2. **Phase 2**: Read from Redis, fallback to memory
3. **Phase 3**: Remove in-memory storage completely
4. **Phase 4**: Add Redis clustering for high availability

## Estimated Effort
- **Development**: 2-3 days
- **Testing**: 1-2 days
- **Total**: 3-5 days

## Dependencies
- Redis Server 6.0+ (or compatible like KeyDB, DragonflyDB)
- StackExchange.Redis NuGet package
- Encryption library (built-in .NET `System.Security.Cryptography`)

## Notes
- Use Redis Hash for device data (efficient partial updates)
- Use Redis Set for device index (fast iteration)
- Use Redis String for flags and mappings
- Set appropriate TTL for temporary data
- Consider using Redis Pub/Sub for real-time notifications
- Implement connection retry policy with exponential backoff
