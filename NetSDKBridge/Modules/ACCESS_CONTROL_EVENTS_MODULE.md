# Access Control Events Module

## Overview
This module subscribes to real-time access control events (face recognition, card swipe, fingerprint) from connected devices using the NetSDK's `RealLoadPicture` API.

## Architecture

### Flow Diagram
```
Device (Face/Card/Fingerprint Event)
    ↓
NetSDK Callback (fAnalyzerDataCallBack)
    ↓
AccessControlEventsModule.AnalyzerDataCallBack()
    ↓
Parse NET_DEV_EVENT_ACCESS_CTL_INFO
    ↓
Extract: UserID, CardNumber, OpenMethod, Success/Fail, Temperature, Snapshot
    ↓
Send to Backend Webhook → Store in Database
    ↓
Trigger Local Event → Real-time Updates
```

### Key Components

1. **Subscription Manager**
   - `SubscribeToDeviceEvents()` - Called after device login
   - `UnsubscribeFromDeviceEvents()` - Called on device disconnect
   - Uses SDK's `RealLoadPicture` with `EM_EVENT_IVS_TYPE.ACCESS_CTL`

2. **Event Parser**
   - Parses `NET_DEV_EVENT_ACCESS_CTL_INFO` structure
   - Extracts:
     - User ID
     - Card Number & Name
     - Open Method (Face/Card/Fingerprint/Password/etc.)
     - Success/Failure status
     - Error codes
     - Door & Reader ID
     - Body temperature (if available)
     - Snapshot image (JPEG binary)

3. **Webhook Sender**
   - Sends structured JSON to backend
   - Fire-and-forget (non-blocking)
   - Includes event metadata

## Supported Events

| Open Method | Description |
|------------|-------------|
| `Face` | Face recognition unlock |
| `Card` | Card swipe unlock |
| `Fingerprint` | Fingerprint unlock |
| `Password` | Password unlock |
| `Card+Face` | Card + Face combination |
| `Card+Fingerprint` | Card + Fingerprint combination |
| `Face+Fingerprint` | Face + Fingerprint combination |
| `Password+Card+Fingerprint` | All three methods |
| `Remote` | Remote unlock (platform/indoor unit) |
| `LocalButton` | Physical button press |
| `QRCode` | QR code scan |
| `Bluetooth` | Bluetooth unlock |

## Event Data Structure

### JSON Payload Sent to Backend
```json
{
  "type": "access_control_event",
  "deviceId": "ASI11",
  "timestamp": "2026-04-09 14:30:25",
  "data": {
    "eventType": "Face",
    "userId": "zhangsan",
    "cardNumber": "12001",
    "cardName": "Zhang San",
    "isSuccess": true,
    "door": 1,
    "readerId": "Reader01",
    "errorCode": 0,
    "temperature": 36.5,
    "hasSnapshot": true,
    "snapshotSize": 45230
  }
}
```

### NET_DEV_EVENT_ACCESS_CTL_INFO Fields (SDK Structure)
```csharp
public struct NET_DEV_EVENT_ACCESS_CTL_INFO
{
    public int nChannelID;              // Door channel number
    public NET_TIME_EX UTC;             // Event timestamp
    public string szUserID;             // User ID
    public string szCardNo;             // Card number
    public string szCardName;           // Card name
    public EM_ACCESS_DOOROPEN_METHOD emOpenMethod;  // Open method
    public bool bStatus;                // Success/failure
    public int nErrorCode;              // Error code (if failed)
    public string szReaderID;           // Reader ID
    public bool bManTemperature;        // Temperature valid flag
    public NET_MAN_TEMPERATURE_INFO stuManTemperatureInfo; // Temperature data
    public NET_DEV_ACCESS_CTL_IMAGE_INFO[] stuImageInfo;  // Image metadata
    public int nImageInfoCount;         // Number of images
}
```

## Error Codes

| Code | Meaning |
|------|---------|
| `0x00` | No error |
| `0x10` | Unauthorized |
| `0x11` | Card lost or cancelled |
| `0x12` | No door permission |
| `0x13` | Unlock mode error |
| `0x14` | Valid period error |
| `0x61` | Card correct, face error |
| `0x64` | Unauthorized (requires platform recognition) |
| `0x65` | High body temperature |
| `0x66` | No mask detected |

## Integration Points

### In SDKBridgeService.cs
```csharp
// 1. Module initialized when webhook URL is set
public void SetBackendWebhookUrl(string url)
{
    _accessControlEventsModule = new AccessControlEventsModule(...);
}

// 2. Subscribe after successful device login
await _accessControlEventsModule.SubscribeToDeviceEvents(
    registrationID, 
    loginHandle, 
    deviceIP
);

// 3. Unsubscribe on device disconnect
_accessControlEventsModule?.UnsubscribeFromDeviceEvents(registrationID);

// 4. Cleanup on shutdown
_accessControlEventsModule?.UnsubscribeAll();
_accessControlEventsModule?.Dispose();
```

## How It Works

### 1. Subscription
```csharp
IntPtr analyzerHandle = NETClient.RealLoadPicture(
    loginHandle,
    0,  // Channel 0
    (uint)EM_EVENT_IVS_TYPE.ACCESS_CTL,
    true,  // Request snapshots
    _analyzerCallback,
    IntPtr.Zero,
    IntPtr.Zero
);
```

### 2. SDK Calls Callback on Event
When someone swipes a card/uses face/fingerprint:
```csharp
private int AnalyzerDataCallBack(
    IntPtr lAnalyzerHandle,    // Subscription handle
    uint dwEventType,          // Event type (ACCESS_CTL)
    IntPtr pEventInfo,         // Pointer to NET_DEV_EVENT_ACCESS_CTL_INFO
    IntPtr pBuffer,            // Pointer to snapshot image data
    uint dwBufSize,            // Image size in bytes
    IntPtr dwUser,
    int nSequence,
    IntPtr reserved
)
```

### 3. Event Processing
1. Parse structure from `pEventInfo`
2. Extract snapshot from `pBuffer`
3. Determine open method from `emOpenMethod`
4. Send to backend webhook
5. Trigger local event

## Temperature Detection
If the device supports temperature measurement:
```json
{
  "temperature": 36.5,
  "isOverTemperature": false
}
```

## Snapshot Images
- Format: JPEG binary
- Available for: Face recognition, card swipe, fingerprint
- Size: Typically 20-100KB
- Stored in `eventData.SnapshotImage` byte array

## Cleanup & Disposal
- **Per-device**: `UnsubscribeFromDeviceEvents(deviceId)` - Stops events for one device
- **All devices**: `UnsubscribeAll()` - Stops all subscriptions
- **Dispose**: Releases all resources

## Testing
1. Connect a face recognition device
2. Configure device to connect to server (IP, port, credentials)
3. Wait for auto-registration
4. Check logs for:
   ```
   📡 Subscribing to access control events for device: ASI11
   ✅ Successfully subscribed to access control events
   🚪 ACCESS CONTROL EVENT RECEIVED
      Event Type: Face
      User ID: zhangsan
      Status: ✅ SUCCESS
   ```

## Troubleshooting

### Events Not Received
- Verify device is connected and online
- Check `RealLoadPicture` subscription succeeded (analyzer handle != IntPtr.Zero)
- Verify device supports intelligent events
- Check SDK logs for errors

### Snapshot Images Missing
- Some devices require `bNeedPicFile = true` (already set)
- Check `dwBufSize > 0` in callback
- Verify device supports snapshots for this event type

### Backend Not Receiving Events
- Check webhook URL is configured
- Verify backend webhook endpoint is running
- Check HTTP response status in logs
- Test webhook endpoint with curl/Postman

## References
- NetSDK Documentation: Section 4.11 (Subscribing for Events)
- Access Control API Guide v2.4: Section 5.6 (Unlocking Records)
- FaceOpenDoorDemo from official NetSDK
- `NET_DEV_EVENT_ACCESS_CTL_INFO` structure definition
