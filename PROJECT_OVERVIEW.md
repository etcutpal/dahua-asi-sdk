# NetSDK Bridge System - Project Overview

## 1. Executive Summary
This project connects **Dahua ASI Face Access Terminals** to a web application using a custom **C# NetSDK Bridge**. The system replaces the proprietary SDK with modern HTTP/WebSocket APIs, enabling real-time device monitoring, access record retrieval, and device management from a Next.js frontend.

## 2. System Architecture
The system consists of three main layers:

### A. Device Layer (Dahua ASI)
- **Hardware**: Dahua ASI Face Recognition Terminals (e.g., ASI11, ASI12).
- **Communication**: Connects to the NetSDK Bridge via **Auto-Registration** (TCP/9500).
- **Protocols**: 
  - **Dahua NetSDK**: Primary protocol for all communication (connection, events, access records).
  - **CGI**: Secondary/fallback for access records if SDK method fails.
- **Network Model**: 
  - Device initiates connection to server (outbound TCP to port 9500).
  - Works through NAT/firewall — no port forwarding needed.
  - Server and device can be in completely different locations.

### B. NetSDK Bridge Layer (C# / .NET 8.0)
- **Purpose**: Wraps the unmanaged Dahua C++ SDK (`dhnetsdk.dll`) into a safe C# service.
- **Features**:
  - **Auto-Registration Server**: Listens for devices connecting to port 9500.
  - **HTTP API**: Exposes REST endpoints for Backend integration.
  - **Webhook Client**: Pushes real-time status updates to the Node.js Backend when devices connect/disconnect.
  - **Hardware Serial Fetching**: Automatically retrieves the unique hardware serial number upon device login (optimized to fetch only once per session).
  - **Access Control Events (Real-time)**: Subscribes to live access control events using **three parallel methods**:
    - **SDK Method**: `RealLoadPicture` API with `ACCESS_CTL` event type
    - **Intelligent Events CGI**: `snapManager.cgi` with `Events=[AccessControl]`
    - **General Events CGI**: `eventManager.cgi` with `codes=[All]` ← **Primary working method**
  - **Multipart MIME Parser**: Handles device event streams in multipart format with JSON extraction
  - **Access Control Records (NAT Traversal)**: Queries card swipe/entry logs via **NetSDK FindRecord API** over the existing TCP connection.
    - **Primary Method**: `FindRecord()` / `FindNextRecord()` SDK APIs (works through NAT/firewall)
    - **Fallback Method**: `recordFinder.cgi` HTTP endpoint (requires direct device IP)
    - No port forwarding or direct device HTTP access needed.
  - **Door Control**: Open/Close door commands via `accessControl.cgi`.
  - **Type 5 Packet Handling**: Handles specific Keep-Alive/Registration packets (Type 5) sent by newer ASI devices to maintain connection stability.
- **Key Files**:
  - `SDKBridgeService.cs`: Core service managing SDK lifecycle, device tracking, and webhooks.
  - `HttpApiServer.cs`: Kestrel HTTP server exposing REST endpoints.
  - `NetSDK.cs`: Wrapper for the Dahua SDK functions.
  - `Modules/AccessControlEventsModule.cs`: SDK-based event subscription (RealLoadPicture).
  - `Modules/AccessControlEventsCgiModule.cs`: Intelligent Events subscription (snapManager.cgi).
  - `Modules/AccessControlEventsGeneralModule.cs`: General Events subscription (eventManager.cgi) - **Active method**.

### C. Backend Layer (Node.js / Express / Socket.IO)
- **Purpose**: Middleware between the Bridge and the Frontend. Handles business logic and real-time broadcasting.
- **Features**:
  - **REST API**: CRUD operations for device management (`/api/devices`).
  - **Webhook Receiver**: Receives real-time status updates from the C# Bridge (`/api/webhooks/device-status`).
  - **Access Events Webhook**: Receives live access control events (`/api/webhooks/access-events`).
  - **Startup Sync**: Synchronizes device state from Bridge on startup to ensure accuracy.
  - **WebSocket Server**: Broadcasts device status changes AND access control events to the Frontend via Socket.IO.
  - **Event Persistence**: Stores access control events in `backend/data/access-events.json` (last 500 events).
  - **JSON Storage**: Persists device configurations in `backend/data/devices.json`.
- **Key Files**:
  - `netSdkService.js`: Service communicating with C# Bridge.
  - `eventService.js`: Event storage, file persistence, and WebSocket broadcasting.
  - `server.js`: Express server and Socket.IO setup.
  - `device.service.js`: JSON file database handler.
  - `routes/webhooks.js`: Webhook endpoints for device status and access events.
  - `routes/events.js`: REST API for querying access control events.

### D. Frontend Layer (Next.js / React)
- **Purpose**: User interface for monitoring and managing devices.
- **Features**:
  - **Dashboard**: Real-time device status (Online/Offline), auto-registration control, and **Live Access Control Events**.
  - **Device Management**: Add/Edit/Delete devices using a Modal UI.
  - **Access Records**: View entry logs fetched from the device.
  - **Real-time Updates**: Uses Socket.IO to update UI instantly without refreshing.
  - **Live Events Display**: Shows face/card/fingerprint authentication events in real-time with:
    - User ID, Card Number, Open Method (Face/Card/Fingerprint)
    - Similarity score (for face recognition)
    - Success/Fail status with color-coded badges
    - Timestamps and door information
- **Key Files**:
  - `app/page.tsx`: Main dashboard with live access control events section.
  - `app/devices/page.tsx`: Device management list.
  - `components/DeviceModal.tsx`: Add/Edit device form.
  - `components/AccessControlEventList.tsx`: Real-time event display component.
  - `context/SocketContext.tsx`: WebSocket connection and event handling.

## 3. Key Workflows

### 3.1 Device Connection (Auto-Registration)
1. **Configuration**: User adds a device in the Frontend (Name, Registration ID, IP, Username, Password).
2. **Device Action**: Device is configured to point to the Bridge IP (e.g., `192.168.100.10`) on Port 9500.
3. **Bridge Action**:
   - `fServiceCallBack` triggers on connection (handles both Type 1 and Type 5 packets).
   - Bridge extracts the **Registration ID** from the callback payload.
   - Bridge logs into the device using `SERVER_CONN` mode.
   - Bridge fetches the **Hardware Serial Number** (only if not fetched this session).
   - Bridge updates device status to "Online".
   - Bridge sends a **Webhook** POST to `http://localhost:3001/api/webhooks/device-status`.
4. **Backend Action**:
   - Receives Webhook.
   - Broadcasts status change to Frontend via Socket.IO.

### 3.2 Device Disconnection
1. **Trigger**: Device loses network or is powered off.
2. **Bridge Action**:
   - `fDisConnectCallBack` triggers.
   - Bridge updates status to "Offline".
   - Bridge clears the "Hardware Serial Fetched" cache for this device.
   - Bridge sends **Webhook** to Backend.

### 3.3 Access Record Retrieval (NAT Traversal)
1. **Request**: Frontend calls `GET /api/access-records/sdk/{deviceId}`.
2. **Backend Action**: Forwards request to Bridge: `GET /api/devices/{deviceId}/access-records-sdk`.
3. **Bridge Action (Primary - SDK TCP Method)**:
   - Uses existing auto-registration TCP connection (port 9500).
   - Calls `FindRecord()` API with `ACCESSCTLCARDREC_EX` type.
   - Calls `QueryRecordCount()` to get total record count.
   - Calls `FindNextRecord()` in batches to retrieve records.
   - Calls `FindRecordClose()` to clean up.
   - **No direct HTTP access to device IP needed** — works through NAT/firewall.
4. **Bridge Action (Fallback - CGI Method)**:
   - Constructs CGI URL: `http://{device_ip}/cgi-bin/recordFinder.cgi?action=find&name=AccessControlCardRec`.
   - Authenticates using device credentials.
   - Parses the text response from the CGI endpoint.
5. **Response**: Returns JSON array of records (RecNo, CardNo, UserID, Time, Status, CardType, DoorNumber).

### 3.4 Live Access Control Events (Real-time)
1. **Subscription**: When device connects, Bridge subscribes using three methods:
   - SDK: `RealLoadPicture` with `ACCESS_CTL` event type
   - CGI: `snapManager.cgi?action=attachFileProc&Events=[AccessControl]`
   - CGI: `eventManager.cgi?action=attach&codes=[All]` ← **Working method**
2. **Device Action**: User authenticates (face/card/fingerprint) at the device.
3. **Bridge Action**:
   - Receives multipart MIME event stream from `eventManager.cgi`.
   - Parses MIME boundaries and extracts JSON objects.
   - Extracts: UserID, CardNo, Method (15=Face), Similarity, Door, Status.
   - Sends webhook to Backend: `POST http://localhost:3001/api/webhooks/access-events`.
4. **Backend Action**:
   - Receives webhook payload.
   - Stores event in `backend/data/access-events.json` (file persistence).
   - Broadcasts via WebSocket: `socket.emit('access:control:event', data)`.
5. **Frontend Action**:
   - Socket.IO listener receives event.
   - Updates `accessEvents` state in dashboard.
   - Displays event in "Live Access Control Events" section with badges and icons.

## 4. Recent Developments & Optimizations

### 4.1 Webhook Implementation (Replaces Polling)
- **Problem**: The Backend was polling the Bridge every 5 seconds, causing high CPU/Network load.
- **Solution**: Implemented a Webhook system.
  - C# Bridge now pushes status changes to Backend instantly.
  - Polling code removed from `netSdkService.js`.
  - **Result**: Zero periodic requests; instant real-time updates.

### 4.2 Hardware Serial Fetching Optimization
- **Problem**: Serial number was re-fetched on every reconnect, causing latency.
- **Solution**: In-memory tracking (`_hasFetchedHardwareSerial`).
  - Serial is fetched **once** when device comes online.
  - Subsequent reconnects use cached serial.
  - Cache clears only on **Offline** event.

### 4.3 Type 5 Packet Handling Fix
- **Problem**: Newer ASI devices (e.g., ASI12) send "Type 5" packets (Keep-Alive/Alternate Registration) which the Bridge was ignoring, causing devices to show "Offline".
- **Solution**: Added a specific handler for `EM_LISTEN_TYPE` 5 in `ServiceCallback`.
  - The Bridge now recognizes Type 5 packets as valid connection signals.
  - It processes the Registration ID if present and acknowledges the Keep-Alive.
  - **Result**: Devices now stay "Online" consistently.

### 4.4 Backend Startup Sync
- **Problem**: On restart, the Backend lost track of already-connected devices.
- **Solution**: Added `syncDevices()` to `netSdkService.js`.
  - Fetches current state from Bridge immediately on startup.
  - Ensures Frontend displays correct status without waiting for a change event.

### 4.5 Live Access Control Events (Real-time Event Subscription)
- **Problem**: Access control events (face/card/fingerprint authentications) were not being received by the server.
- **Root Cause**: 
  - Device sends events in **multipart MIME format** with `--myboundary` separators
  - Events were fragmented when reading line-by-line
  - Event filter was too strict (only accepted `notifyAccessControl`)
- **Solution**: Implemented three parallel subscription methods:
  1. **SDK Method**: `RealLoadPicture` API with `ACCESS_CTL` event type
  2. **Intelligent Events CGI**: `snapManager.cgi` (receiving heartbeats but no events)
  3. **General Events CGI**: `eventManager.cgi` ← **Working method!**
- **Technical Implementation**:
  - Created multipart MIME parser to handle `--myboundary` format
  - Added JSON object extractor that matches braces to find complete JSON
  - Relaxed event filter to accept multiple event types
  - Implemented webhook endpoint `/api/webhooks/access-events` in Backend
  - Added file persistence in `backend/data/access-events.json`
  - Created real-time dashboard component `AccessControlEventList.tsx`
- **Event Data Captured**:
  - UserID, CardNo, CardName (e.g., "Utpal Mandal")
  - Open Method: 15=Face, 1=Card, 6=Fingerprint, etc.
  - Similarity score (e.g., 99% for face recognition)
  - Door number, Status (Open/Close), Timestamp
- **Result**: ✅ **Live events flowing to dashboard in real-time!**
  - User authenticates → Event appears on dashboard within 1-2 seconds
  - Events persist across server restarts (last 500 events)
  - WebSocket broadcast ensures instant UI updates

## 5. CGI API Configuration on Device
To use features like Access Record Retrieval, the **CGI API** must be enabled on the Dahua device.

**Steps to Enable CGI API:**
1. **Login** to the device web interface (http://{device_ip}).
2. Go to **Network** -> **Basic Services** (or **TCP/IP** -> **Port**).
3. Ensure **HTTP Port** is enabled (default: 80).
4. Ensure **HTTPS Port** is enabled if using secure connections.
5. Go to **Network** -> **Basic Services** -> **Service**.
6. Check the box for **CGI** or **HTTP Service** to allow CGI commands.
7. Click **Apply** or **Save**.
8. **Reboot** the device if changes do not take effect immediately.

**Note**: The Bridge uses the device's Username/Password (configured in the Auto-Registration settings) to authenticate CGI requests.

## 6. Current API Endpoints

### A. Backend APIs (Node.js - Port 3001)
These are used by the Frontend.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Check Backend health. |
| `GET` | `/api/devices` | List all configured devices. |
| `POST` | `/api/devices` | Add a new device configuration. |
| `PUT` | `/api/devices/{id}` | Update device configuration. |
| `DELETE` | `/api/devices/{id}` | Delete a device configuration. |
| `POST` | `/api/webhooks/device-status` | **Internal**: Receives status updates from C# Bridge. |
| `POST` | `/api/webhooks/access-events` | **Internal**: Receives access control events from C# Bridge. |
| `GET` | `/api/events/access-control` | Get access control event history (paginated). |
| `GET` | `/api/events/access-control/device/{deviceId}` | Get events for specific device. |
| `DELETE` | `/api/events/access-control` | Clear access event history. |
| `POST` | `/api/autoreg/start` | Start Auto-Registration server on Bridge. |
| `POST` | `/api/autoreg/stop` | Stop Auto-Registration server on Bridge. |
| `GET` | `/api/access-records/sdk/{deviceId}` | **Query access records via SDK TCP** (NAT traversal). Uses `FindRecord()` API over auto-registration connection. Supports `startTime`, `endTime`, `cardNumber`, `maxRecords` query params. Defaults to last 7 days. |

### B. Bridge APIs (C# - Port 5000)
These are used by the Backend to control the Bridge and Device.

#### B1. NAT Traversal Endpoints (Work over Internet)
These endpoints use the existing auto-registration TCP connection (port 9500). **No direct device IP or port forwarding needed.**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/devices` | Get list of connected devices from Bridge. |
| `GET` | `/api/devices/{id}/access-records-sdk` | **Access Records via SDK TCP** (primary). Uses `FindRecord()` API over auto-registration connection. Supports `startTime`, `endTime`, `cardNumber`, `maxRecords`. |
| `POST` | `/api/sdk/init` | Initialize the Dahua SDK. |
| `POST` | `/api/autoreg/start` | Start listening for devices on Port 9500. |
| `POST` | `/api/autoreg/stop` | Stop listening for devices. |
| `POST` | `/api/devices/login` | Manually login to a device (not auto-reg). |
| `POST` | `/api/devices/{id}/logout` | Logout from a device. |
| `POST` | `/api/devices/{id}/simulate-event` | Test event handling (Development). |

#### B2. Local IP Endpoints (LAN Only)
These endpoints make HTTP requests directly to the device IP. **Device must be on the same network or have port forwarding configured.**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/devices/{id}/access-records` | Access Records via CGI (`recordFinder.cgi`). Fallback method. |
| `GET` | `/api/devices/{id}/door-status` | Get current door status via CGI. |
| `POST` | `/api/devices/{id}/open-door` | Open a door remotely via CGI. |
| `POST` | `/api/devices/{id}/close-door` | Close a door remotely via CGI. |

### C. Access Records API Detail

**Endpoint**: `GET /api/access-records/sdk/{deviceId}`

**Query Parameters**:
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `startTime` | ISO DateTime | No | 7 days ago | Filter from timestamp |
| `endTime` | ISO DateTime | No | Now | Filter to timestamp |
| `cardNumber` | String | No | - | Filter by card number |
| `maxRecords` | Integer | No | 100 | Maximum records to return |

**Example Requests**:
```bash
# Last 7 days (default)
curl "http://localhost:3001/api/access-records/sdk/ASI12?maxRecords=100"

# Specific date range
curl "http://localhost:3001/api/access-records/sdk/ASI12?startTime=2026-04-01T00:00:00&endTime=2026-04-10T23:59:59&maxRecords=500"

# Filter by card number
curl "http://localhost:3001/api/access-records/sdk/ASI12?cardNumber=448008&maxRecords=50"
```

**Example Response**:
```json
{
  "success": true,
  "count": 254,
  "records": [
    {
      "recordNumber": 12,
      "cardNumber": "448008",
      "userID": "448008",
      "userName": "",
      "swipeTime": "2026-04-01T10:40:46Z",
      "doorNumber": 0,
      "readerNo": "",
      "cardType": "Normal",
      "status": "1"
    }
  ]
}
```

**How It Works (NAT Traversal)**:
```
Your Server (Public IP)          Device (Behind NAT/Firewall)
     │                               │
     │◄──── Auto-Reg TCP ───────────►│  ← Device initiates this connection
     │     (port 9500)               │
     │                               │
     │── FindRecord() ──────────────►│  ← Server queries via existing TCP
     │◄─── Records ─────────────────│  ← Data flows back through same socket
     │                               │
```

**Key Advantages**:
- ✅ Works when device is behind NAT/firewall
- ✅ No port forwarding needed on device side
- ✅ Server and device can be in completely different locations
- ✅ Only needs outbound internet from device → server public IP
- ✅ Uses existing auto-registration TCP connection

## 7. Future Roadmap (See `TODO_REDIS_IMPLEMENTATION.md`)
1. **Redis Integration**: Replace JSON storage and in-memory tracking with Redis for persistence and multi-instance support.
2. **Universal CGI Proxy**: A generic endpoint to call any CGI command on the device without hardcoding paths.
3. **Snapshot Image Retrieval**: Fetch face snapshots associated with access events and display them in the dashboard.
4. **Advanced Event Filtering**: Add date range filters, event type filters, and export to CSV/PDF for audit trails.
5. **Real-time Notifications**: Browser push notifications for failed access attempts or security alerts.
6. **Analytics Dashboard**: Statistics showing successful vs failed attempts, peak hours, most active users.

## 8. Development Environment
- **C# Bridge**: .NET 8.0, NetSDK (Dahua), VS Code / Visual Studio.
- **Backend**: Node.js 18+, Express, Socket.IO.
- **Frontend**: Next.js 14, React, Tailwind CSS.
- **Database**: Currently `backend/data/devices.json` (Local File).
- **Event Storage**: `backend/data/access-events.json` (last 500 events with file persistence).
- **Cache**: In-memory `ConcurrentDictionary` (C#) and `Map` (Node.js).

## 9. Documentation Files
- `PROJECT_OVERVIEW.md` - This file: Complete system architecture and workflows.
- `ACCESS_CONTROL_EVENTS_GUIDE.md` - Guide for access control events implementation.
- `IMPLEMENTATION_COMPLETE.md` - Implementation status and technical details.
- `MULTIPART_FIX.md` - Multipart MIME parser implementation notes.
- `THREE_METHODS_FIX.md` - Three event subscription methods explanation.
- `EVENT_DEBUG_INSTRUCTIONS.md` - Debug instructions for event troubleshooting.
- `TODO_REDIS_IMPLEMENTATION.md` - Future Redis integration plans.
- `AUTO_REG_CONFIG.md` - Auto-registration configuration guide.
- `SERVER_IP_CONFIG.md` - Server IP configuration guide.

## 10. API Tester Page
The frontend includes an **API Tester** page at `/api-tester` that allows you to:
- Call every available API endpoint from the UI
- Configure method, URL, headers, and body
- View raw JSON responses in a formatted textarea
- Understand endpoint behavior without external tools

**Access**: Navigate to `http://localhost:3000/api-tester` (Next.js frontend)

## 11. Contact / Context for AI Agents
If you are an AI agent reading this:

### System Status
- The system is functional and currently running.
- The C# Bridge is the source of truth for device connectivity.
- The Node.js Backend is the source of truth for user-configured device data.

### Access Control Events (Real-time)
- **Working method**: `eventManager.cgi` (General Events) via multipart MIME streaming.
- Events flow: Device → `eventManager.cgi` → C# Bridge MIME parser → Backend webhook → WebSocket → Frontend dashboard.
- Event storage: `backend/data/access-events.json` (last 500 events).
- If events stop flowing, check C# Bridge logs for MIME parsing errors.
- The MIME parser is in `AccessControlEventsGeneralModule.cs`.

### Access Records (Historical Queries)
- **Primary method**: NetSDK `FindRecord()` / `FindNextRecord()` APIs over the existing auto-registration TCP connection (port 9500).
- **Works over NAT/firewall** — no direct device HTTP access or port forwarding needed.
- Query flow: Server → `FindRecord()` via TCP → Device → Records via TCP → Server → Backend → Frontend.
- Endpoint: `GET /api/devices/{id}/access-records-sdk` (Bridge) or `GET /api/access-records/sdk/{deviceId}` (Backend).
- Supports `startTime`, `endTime`, `cardNumber`, `maxRecords` query params. Defaults to last 7 days.
- **CGI fallback**: `recordFinder.cgi` (needs direct device IP, LAN only) — at `/api/devices/{id}/access-records`.

### NAT Traversal Architecture
- Device initiates outbound TCP connection to server on port 9500 (auto-registration).
- All primary features work through this single connection: live events, access records, device status.
- **Device only needs outbound internet to server's public IP** — no inbound ports open on device side.
- Endpoints requiring direct device IP (CGI): door control, CGI access records fallback.

### Key Files
- `SDKBridgeService.cs`: Core service — device tracking, SDK lifecycle, `QueryAccessRecordsBySDK()`, `QueryAccessRecords()`.
- `HttpApiServer.cs`: Kestrel HTTP server exposing Bridge REST endpoints.
- `NetSDK.cs`: SDK wrapper — `FindRecord()`, `FindNextRecord()`, `QueryRecordCount()`.
- `Modules/AccessControlEventsGeneralModule.cs`: Multipart MIME parser for live events.
- `backend/src/services/netSdkService.js`: Backend ↔ Bridge communication.
- `backend/src/routes/access-records.js`: Backend access records route.
- `frontend/src/app/api-tester/page.tsx`: API testing UI with grouped endpoints (NAT vs Local IP).

### Development Tips
- Use `/api-tester` page (port 3000) to debug any endpoint. It groups endpoints by network mode (NAT traversal vs Local IP).
- Before rebuilding C# Bridge, always stop the running process: `taskkill /F /IM NetSDKBridge.exe`.
- Bridge logs are at: `NetSDKBridge/bin/Debug/net8.0/logs/netsdk-bridge.log`.
- All API calls through the Backend (port 3001) are preferred over direct Bridge calls (port 5000).
