# 🔍 Access Control Events Debug Instructions

## Current Status
- ✅ Device ASI12 is connected and online
- ✅ Event subscriptions are successful (both SDK and CGI methods)
- ✅ CGI event stream is active (receiving heartbeats every 5 seconds)
- ❌ **NO events received** when face authentication succeeds
- ❌ Neither SDK callback nor CGI stream events are triggering

## What Was Changed
Added **DETAILED DEBUG LOGGING** to see what's happening:

### SDK Method Logging
Now logs EVERY callback (even non-access-control events):
```
🔔 [SDK] CALLBACK FIRED - Event Type: {eventType} (0x{eventType:X}), Analyzer Handle: {handle}
```

### CGI Method Logging
Now logs EVERY event received from the stream:
```
📨 [CGI] EVENT RECEIVED from ASI12: {first 200 chars of JSON}
```

Then checks if it's access control related:
```
✅ [CGI] Access control event detected: {method}
```
OR
```
⚠️  [CGI] Event method not recognized for access control: '{method}'
```

---

## 📋 Test Steps

### Step 1: STOP All Services
Close all running terminal windows or press `Ctrl+C` in each.

### Step 2: REBUILD C# Bridge
The code was modified but NOT compiled because the bridge was running.

```cmd
cd "d:\Experimental Data\NODE\learning\ASI SDK CS\NetSDKBridge"
dotnet build
```

Expected: Build succeeds with warnings (no errors)

### Step 3: START All Services
```cmd
cd "d:\Experimental Data\NODE\learning\ASI SDK CS"
start-all.bat
```

### Step 4: Wait for Device to Connect
Watch the C# Bridge terminal. You should see:
```
✅ DEVICE FULLY CONNECTED AND READY
📡 Subscribing to access control events for device: ASI12
✅ Successfully subscribed to access control events for device: ASI12
📡 [CGI] Attempting HTTP CGI subscription for device: ASI12
✅ [CGI] Successfully subscribed to access control events for device: ASI12
```

### Step 5: Test Face Authentication
1. Go to your access control device
2. Successfully authenticate with your face (2-3 times)
3. **IMMEDIATELY** check the C# Bridge terminal logs

### Step 6: Check Logs for Events

#### What to Look For in C# Bridge Terminal:

**Option A: SDK Callback Fired**
```
🔔 [SDK] CALLBACK FIRED - Event Type: ACCESS_CTL (0x204), Analyzer Handle: XXX
🚪 ACCESS CONTROL EVENT RECEIVED
   Device ID: ASI12
   Event Type: Face
   ...
📡 Sending access event to backend: http://...
```

**Option B: CGI Event Received**
```
📨 [CGI] EVENT RECEIVED from ASI12: {"method":"notifyAccessControl",...}
✅ [CGI] Access control event detected: notifyAccessControl
```

**Option C: Events Received But Not Recognized**
```
📨 [CGI] EVENT RECEIVED from ASI12: {"method":"somethingElse",...}
⚠️  [CGI] Event method not recognized for access control: 'somethingElse'
```

**Option D: NOTHING**
```
(No event-related logs appear at all)
```

### Step 7: Share the Logs

**Copy and share these log sections:**

1. **From C# Bridge terminal** (last 50 lines after face auth)
2. **From log file:** `NetSDKBridge\bin\Debug\net8.0\logs\netsdk-bridge.log` (last 100 lines)

---

## 🎯 Expected Outcomes

### Scenario 1: SDK Callback Fires ✅
If you see `🔔 [SDK] CALLBACK FIRED`, the subscription works!
- **Fix:** Event parsing or backend webhook issue

### Scenario 2: CGI Events Received ✅
If you see `📨 [CGI] EVENT RECEIVED`, the device IS sending events!
- **Fix:** Event filter was too strict (now fixed)

### Scenario 3: Nothing at All ❌
If NO event logs appear:
- **Possible causes:**
  1. Device not configured to send events to server
  2. Device doesn't support RealLoadPicture API
  3. Event subscription API not compatible with this device model
- **Next steps:**
  - Check device web interface for "Event Center" or "Alarm Center" settings
  - Verify device is configured to send events to your server IP
  - May need to use different SDK API (CLIENT_AttachRecordFile, etc.)

---

## 📸 What to Capture

When testing, please share:

1. **C# Bridge terminal output** (the window showing the logs)
2. **Device configuration screenshot** showing:
   - Event center / alarm center settings
   - Server IP configuration
   - Event upload settings
3. **Any error messages** that appear

This will help identify the exact root cause!
