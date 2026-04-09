# 🚪 Access Control Events Implementation Guide

## Overview
This guide explains how access control events (face/card/fingerprint authorizations) flow from your device to the dashboard.

---

## 📋 What Was Implemented

### ✅ Completed Features

1. **Backend Event Reception** (`backend/src/routes/webhooks.js`)
   - New endpoint: `POST /api/webhooks/access-events`
   - Receives access control events from C# Bridge
   - Stores events with file persistence
   - Broadcasts via WebSocket to frontend

2. **Event Storage Service** (`backend/src/services/eventService.js`)
   - Persistent file-based storage (`backend/data/access-events.json`)
   - Keeps last 500 events in memory
   - Auto-saves to disk on every event
   - REST API endpoints to query events

3. **WebSocket Broadcast** (`backend/src/server.js`)
   - Real-time event broadcasting via Socket.IO
   - Event: `access:control:event`
   - Frontend receives events instantly

4. **C# Bridge Updates** (`NetSDKBridge/Modules/`)
   - `AccessControlEventsModule.cs` - SDK method
   - `AccessControlEventsCgiModule.cs` - HTTP CGI method
   - Both now send to `/api/webhooks/access-events` endpoint
   - Improved error logging

5. **Frontend Dashboard** (`frontend/src/app/page.tsx`)
   - New "Live Access Control Events" section
   - Real-time event display with WebSocket
   - Shows: User ID, Card Number, Open Method, Success/Fail, Temperature
   - Auto-refreshes on page load

---

## 🔄 Event Flow (End-to-End)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. USER AUTHORIZATES AT DOOR                                │
│    - Face recognition                                       │
│    - Card swipe                                             │
│    - Fingerprint                                            │
│    - Password/PIN                                           │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. DEVICE SENDS EVENT TO C# BRIDGE (Port 9500)              │
│    Via:                                                     │
│    - SDK: NETClient.RealLoadPicture(ACCESS_CTL)             │
│    - CGI: HTTP long-poll to snapManager.cgi                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. C# BRIDGE PROCESSES EVENT                                │
│    - Parses NET_DEV_EVENT_ACCESS_CTL_INFO structure         │
│    - Extracts: User ID, Card No, Open Method, Success, etc. │
│    - Sends HTTP POST to backend webhook                     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. BACKEND RECEIVES EVENT (Port 3001)                       │
│    POST /api/webhooks/access-events                         │
│    - Stores in memory cache                                 │
│    - Saves to file (data/access-events.json)                │
│    - Emits via WebSocket: access:control:event              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. FRONTEND DASHBOARD RECEIVES EVENT                        │
│    - Socket.IO listener: socket.on('access:control:event')  │
│    - Updates UI in real-time                                │
│    - Shows event in "Live Access Control Events" section    │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 How to Test

### Step 1: Stop All Running Services
If services are currently running, stop them:
- Close any open terminal windows running the services
- Or press `Ctrl+C` in each window

### Step 2: Restart All Services
Use the startup script:
```cmd
start-all.bat
```

This will:
1. Start C# NetSDKBridge (port 5000, auto-reg port 9500)
2. Start Express Backend (port 3001)
3. Start Next.js Frontend (port 3000)

### Step 3: Verify Device is Online
1. Open browser: `http://localhost:3000`
2. Check that your device shows as "Online" (green badge)
3. If offline, ensure device is configured with:
   - Server IP: Your server's public IP (or `0.0.0.0` for local)
   - Port: `9500`
   - Username: `admin`
   - Password: `admin123`

### Step 4: Test Access Control Event
**Option A: Use Physical Device**
1. Go to your access control device
2. Authorize yourself (face/card/fingerprint)
3. Watch the dashboard - event should appear within 1-2 seconds

**Option B: Check Logs**
If no event appears, check the logs:

**C# Bridge Logs:**
```
NetSDKBridge/logs/netsdk-bridge-*.log
```
Look for:
```
🚪 ACCESS CONTROL EVENT RECEIVED
📡 Sending access event to backend: http://localhost:3001/api/webhooks/access-events
✅ Event sent to backend for device: ASI12
```

**Backend Logs:**
Check the terminal window running the backend. Look for:
```
🚪 Access control event received: access_control_event from device ASI12
✅ Access event stored: ASI12 - access_control_event
📡 WebSocket broadcast: access control event for device ASI12
```

### Step 5: View Stored Events
You can also view stored events via API:
```cmd
curl http://localhost:3001/api/events/access-control
```

---

## 📊 Event Data Structure

Each access control event contains:

```json
{
  "type": "access_control_event",
  "deviceId": "ASI12",
  "timestamp": "2026-04-09 15:30:45",
  "data": {
    "eventType": "Face",
    "userId": "001",
    "cardNumber": "12345678",
    "cardName": "John Doe",
    "isSuccess": true,
    "door": 1,
    "readerId": "Reader_01",
    "errorCode": 0,
    "temperature": "36.5",
    "hasSnapshot": true,
    "snapshotSize": 15234,
    "source": "SDK"
  }
}
```

---

## 🔍 Troubleshooting

### Issue: No Events Appearing on Dashboard

**Check 1: Is device actually sending events?**
- Access your device's web interface
- Check event logs/access records
- Verify an event was created when you authorized

**Check 2: Is C# Bridge receiving events?**
- Open log file: `NetSDKBridge/logs/netsdk-bridge-*.log`
- Search for "ACCESS CONTROL EVENT RECEIVED"
- If not found, event subscription may have failed

**Check 3: Is C# Bridge sending to backend?**
- Search logs for "Sending access event to backend"
- Should show URL: `http://localhost:3001/api/webhooks/access-events`
- Check for "✅ Event sent to backend"

**Check 4: Is backend receiving the webhook?**
- Check backend terminal logs
- Look for "🚪 Access control event received"
- If you see errors, check the response

**Check 5: Is WebSocket connection working?**
- Open browser console (F12)
- Look for: "Socket connected"
- When event arrives, you should see: "🚪 Access control event received:"

### Issue: Events Show "Failed" Status

This means the device attempted authorization but failed:
- Check `isSuccess: false` in event data
- Review `errorCode` field
- Possible causes:
  - Face/card not recognized
  - User not in database
  - Access denied (time restrictions, etc.)

### Issue: Duplicate Events

If you see duplicate events:
- Both SDK and CGI methods might be active
- This is normal during testing
- One method will eventually be prioritized

---

## 📁 Files Modified

### Backend
- ✅ `backend/src/routes/webhooks.js` - Added `/access-events` endpoint
- ✅ `backend/src/services/eventService.js` - Added file persistence & access event methods
- ✅ `backend/src/routes/events.js` - Added REST endpoints for access events
- ✅ `backend/src/server.js` - Added WebSocket broadcast for access events
- ✅ `backend/data/access-events.json` - Auto-created to store events

### C# Bridge
- ✅ `NetSDKBridge/Modules/AccessControlEventsModule.cs` - Updated webhook URL to `/access-events`
- ✅ `NetSDKBridge/Modules/AccessControlEventsCgiModule.cs` - Updated webhook URL to `/access-events`

### Frontend
- ✅ `frontend/src/app/page.tsx` - Added live access control events section
- ✅ `frontend/src/components/AccessControlEventList.tsx` - New component to display events

---

## 🎯 Next Steps (Optional Enhancements)

1. **Snapshot Images**: Currently events include image size data - you can extend to display actual captured images
2. **Event Filtering**: Add filters by device, date range, or event type
3. **Export Events**: Add CSV/PDF export for audit trails
4. **Real-time Notifications**: Add browser notifications for failed attempts
5. **Analytics Dashboard**: Show statistics like successful vs failed attempts, peak hours, etc.

---

## 📞 Support

If you encounter issues:
1. Check logs in this order: Device → C# Bridge → Backend → Frontend console
2. Verify all services are running
3. Ensure device is configured with correct server IP and port
4. Check firewall isn't blocking port 9500

---

**Last Updated**: April 9, 2026
**Version**: 1.0
