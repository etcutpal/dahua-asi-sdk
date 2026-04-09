# NetSDK Bridge System - Project Overview

## 1. Executive Summary
This project connects **Dahua ASI Face Access Terminals** to a web application using a custom **C# NetSDK Bridge**. The system replaces the proprietary SDK with modern HTTP/WebSocket APIs, enabling real-time device monitoring, access record retrieval, and device management from a Next.js frontend.

## 2. System Architecture
The system consists of three main layers:

### A. Device Layer (Dahua ASI)
- **Hardware**: Dahua ASI Face Recognition Terminals (e.g., ASI11, ASI12).
- **Communication**: Connects to the NetSDK Bridge via **Auto-Registration** (TCP/9500).
- **Protocols**: Dahua NetSDK (for connection/status) and CGI (for data retrieval like access records).

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
  - **Access Control Records**: Queries card swipe/entry logs via device CGI interface (`recordFinder.cgi`).
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

### 3.3 Access Record Retrieval
1. **Request**: Frontend calls `GET /api/devices/{deviceId}/access-records`.
2. **Bridge Action**:
   - Constructs CGI URL: `http://{device_ip}/cgi-bin/recordFinder.cgi?action=find&name=AccessControlCardRec`.
   - Authenticates using device credentials.
   - Parses the text response from the CGI endpoint.
   - Returns JSON array of records (RecNo, CardNo, UserID, Time, Status).

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

### B. Bridge APIs (C# - Port 5000)
These are used by the Backend to control the Bridge and Device.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/sdk/init` | Initialize the Dahua SDK. |
| `POST` | `/api/autoreg/start` | Start listening for devices on Port 9500. |
| `POST` | `/api/autoreg/stop` | Stop listening for devices. |
| `GET` | `/api/devices` | Get list of connected devices from Bridge. |
| `POST` | `/api/devices/login` | Manually login to a device (not auto-reg). |
| `POST` | `/api/devices/{id}/logout` | Logout from a device. |
| `GET` | `/api/devices/{id}/access-records` | **Fetch Access Records** via CGI. |
| `POST` | `/api/devices/{id}/simulate-event` | Test event handling (Development). |

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

## 10. Contact / Context for AI Agents
If you are an AI agent reading this:
- The system is functional and currently running.
- The C# Bridge is the source of truth for device connectivity.
- The Node.js Backend is the source of truth for user-configured device data.
- **Access control events are now working via `eventManager.cgi` (General Events method).**
- **Always check `backend/data/access-events.json` for event storage.**
- **If events stop flowing, check the C# Bridge logs for MIME parsing errors.**
- **The multipart MIME parser in `AccessControlEventsGeneralModule.cs` is the active event handler.**
- **Event flow**: Device → eventManager.cgi → C# Bridge → Backend webhook → WebSocket → Frontend dashboard.
