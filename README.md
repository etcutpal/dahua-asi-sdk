# NetSDK Device Monitor - Complete Setup Guide

A comprehensive web application for monitoring and managing Dahua face access devices (2nd generation) using NetSDK Auto Registration with real-time event streaming.

## 📋 Table of Contents

- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)
- [Setup Instructions](#setup-instructions)
  - [1. C# Bridge Service](#1-c-bridge-service)
  - [2. Express.js Backend](#2-expressjs-backend)
  - [3. Next.js Frontend](#3-nextjs-frontend)
- [Auto Registration Configuration](#auto-registration-configuration)
- [API Documentation](#api-documentation)
- [Running the Application](#running-the-application)
- [Troubleshooting](#troubleshooting)
- [Next Steps](#next-steps)

---

## Architecture Overview

```
┌─────────────────┐
│  Face Access    │
│  Device (2nd    │◄──── Auto Registration (Port 9500)
│  Gen)           │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│  C# NetSDK Bridge       │
│  (Port 5000)            │
│  - NetSDK Integration   │
│  - Device Management    │
│  - Event Handling       │
└────────┬────────────────┘
         │
         │ REST API
         ▼
┌─────────────────────────┐
│  Express.js Backend     │
│  (Port 3001)            │
│  - API Server           │
│  - WebSocket (Socket.IO)│
│  - Event Broadcasting   │
└────────┬────────────────┘
         │
         │ WebSocket
         ▼
┌─────────────────────────┐
│  Next.js Frontend       │
│  (Port 3000)            │
│  - Real-time Dashboard  │
│  - Device Monitoring    │
│  - Event Log            │
└─────────────────────────┘
```

---

## Prerequisites

### Software Requirements

- **.NET 8.0 SDK** or later
- **Node.js** 18.x or later
- **npm** or **yarn**
- **Dahua NetSDK** C# DLLs

### Hardware Requirements

- Dahua Face Access Device (2nd Generation)
- Network connectivity between device and server

---

## Project Structure

```
ASI SDK CS/
├── NetSDKBridge/              # C# Bridge Service
│   ├── NetSDKBridge.csproj
│   ├── Program.cs            # Entry point
│   ├── SDKBridgeService.cs   # Core SDK operations
│   └── HttpApiServer.cs      # REST API server
│
├── backend/                   # Express.js Backend
│   ├── package.json
│   ├── .env                  # Environment variables
│   └── src/
│       ├── server.js         # Main server file
│       ├── services/
│       │   ├── netSdkService.js   # NetSDK communication
│       │   └── eventService.js    # Event management
│       ├── routes/
│       │   ├── devices.js    # Device routes
│       │   ├── autoreg.js    # Auto-reg routes
│       │   └── events.js     # Event routes
│       └── utils/
│           └── logger.js     # Logging utility
│
└── frontend/                  # Next.js Frontend
    ├── package.json
    ├── next.config.js
    ├── tailwind.config.js
    └── src/
        ├── app/
        │   ├── layout.tsx
        │   ├── page.tsx      # Main dashboard
        │   └── globals.css
        ├── components/
        │   ├── DeviceList.tsx
        │   ├── EventLog.tsx
        │   ├── DeviceLoginDialog.tsx
        │   ├── AutoRegControl.tsx
        │   └── ui/           # UI components
        ├── context/
        │   └── SocketContext.tsx  # WebSocket context
        └── lib/
            └── utils.ts
```

---

## Setup Instructions

### 1. C# Bridge Service

#### Step 1.1: Install NetSDK DLLs

1. Download the Dahua NetSDK from the official source
2. Place the following DLLs in the `NetSDKBridge` directory:
   - `NetSDKCS.dll`
   - Any other required SDK dependencies

#### Step 1.2: Update Project References

Edit `NetSDKBridge.csproj` and uncomment the reference section:

```xml
<ItemGroup>
  <Reference Include="NetSDKCS">
    <HintPath>path\to\NetSDKCS.dll</HintPath>
  </Reference>
</ItemGroup>
```

#### Step 1.3: Implement NetSDK Integration

The bridge service has TODO comments where you need to add actual NetSDK calls. Key areas:

- **InitializeSDK()**: Call `NetSDK.NETClient_Init()`
- **StartAutoRegServer()**: Call `NetSDK.NETClient_StartListenEx()`
- **LoginToDevice()**: Call `NetSDK.NETClient_LoginEx2()`
- **LogoutFromDevice()**: Call `NetSDK.NETClient_Logout()`

#### Step 1.4: Build and Run

```bash
cd NetSDKBridge
dotnet restore
dotnet build
dotnet run
```

The service will start on `http://localhost:5000`

---

### 2. Express.js Backend

#### Step 2.1: Install Dependencies

```bash
cd backend
npm install
```

#### Step 2.2: Configure Environment

Edit `.env` file:

```env
NETSDK_BRIDGE_URL=http://localhost:5000
PORT=3001
LOG_LEVEL=info
```

#### Step 2.3: Create Logs Directory

```bash
mkdir logs
```

#### Step 2.4: Start the Server

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

The backend will start on `http://localhost:3001`

---

### 3. Next.js Frontend

#### Step 3.1: Install Dependencies

```bash
cd frontend
npm install
```

#### Step 3.2: Configure Environment (Optional)

Create `.env.local` if needed:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

#### Step 3.3: Start Development Server

```bash
npm run dev
```

The frontend will start on `http://localhost:3000`

---

## Auto Registration Configuration

### Configuring Your Face Access Device

1. **Access Device Web Interface**
   - Open browser and navigate to device IP
   - Login with admin credentials

2. **Navigate to Network Settings**
   - Go to: `Settings` → `Network` → `Platform Access` or `Auto Registration`

3. **Enable Auto Registration**
   - Enable "Auto Register" or "Platform Access"
   - Enter your server IP address
   - Set port to `9500`
   - Save and apply settings

4. **Verify Connection**
   - Device should appear in the dashboard automatically
   - Status will show as "Online"

### Alternative: Direct Device Login

If auto-registration is not configured:

1. Click "Add Device" button in the dashboard
2. Enter device IP, port (default 37777), username, and password
3. Click "Connect"

---

## API Documentation

### C# Bridge Service Endpoints (Port 5000)

#### Initialize SDK
```http
POST /api/sdk/init
Response: { "success": true, "message": "SDK initialized" }
```

#### Start Auto Registration
```http
POST /api/autoreg/start
Body: { "port": 9500 }
Response: { "success": true, "message": "Auto Reg Server started" }
```

#### Stop Auto Registration
```http
POST /api/autoreg/stop
Response: { "success": true, "message": "Auto Reg Server stopped" }
```

#### Get All Devices
```http
GET /api/devices
Response: [{ "deviceID": "...", "ip": "...", "status": "Online", ... }]
```

#### Login to Device
```http
POST /api/devices/login
Body: { "ip": "192.168.1.100", "port": 37777, "username": "admin", "password": "..." }
Response: { "success": true, "device": {...} }
```

#### Logout from Device
```http
POST /api/devices/{deviceId}/logout
Response: { "success": true }
```

### Express.js Backend Endpoints (Port 3001)

All above endpoints are proxied, plus:

#### Get Event History
```http
GET /api/events/history?limit=50
Response: [{ "eventName": "...", "data": {...}, "timestamp": "..." }]
```

#### Get Events by Device
```http
GET /api/events/device/{deviceId}?limit=50
```

#### Simulate Event (Testing)
```http
POST /api/devices/{deviceId}/simulate-event
Body: { "eventType": "FaceRecognition", "eventData": "User recognized" }
```

### WebSocket Events (Socket.IO)

#### Client → Server
- `device:join` - Join specific device room
- `device:leave` - Leave device room

#### Server → Client
- `devices:update` - Updated device list
- `device:status:changed` - Device status change
- `device:event:received` - New device event

---

## Running the Application

### Development Mode

Open three terminal windows:

**Terminal 1 - C# Bridge:**
```bash
cd NetSDKBridge
dotnet run
```

**Terminal 2 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 3 - Frontend:**
```bash
cd frontend
npm run dev
```

### Production Mode

**1. Build C# Service:**
```bash
cd NetSDKBridge
dotnet publish -c Release -o ../publish/bridge
```

**2. Build Frontend:**
```bash
cd frontend
npm run build
npm start
```

**3. Start Backend:**
```bash
cd backend
npm start
```

---

## Troubleshooting

### C# Bridge Service Issues

**Problem:** SDK initialization fails
```
Solution:
1. Verify NetSDK DLLs are present
2. Check DLL architecture matches your system (x64/x86)
3. Ensure you have proper licenses for the SDK
```

**Problem:** Auto Registration doesn't start
```
Solution:
1. Check if port 9500 is available
2. Verify firewall allows incoming connections on port 9500
3. Check device configuration points to correct server IP
```

### Backend Issues

**Problem:** Cannot connect to C# Bridge
```
Solution:
1. Verify bridge service is running on port 5000
2. Check NETSDK_BRIDGE_URL in .env file
3. Check CORS settings if on different machine
```

**Problem:** WebSocket connection fails
```
Solution:
1. Ensure firewall allows WebSocket connections
2. Check CORS configuration for frontend URL
3. Verify Socket.IO client version matches server
```

### Frontend Issues

**Problem:** Devices not showing
```
Solution:
1. Check browser console for errors
2. Verify backend is running on port 3001
3. Check WebSocket connection status
4. Try refreshing the page
```

**Problem:** Real-time updates not working
```
Solution:
1. Verify Socket.IO connection is established
2. Check network tab for WebSocket frames
3. Ensure events are being emitted from backend
```

### Device Connection Issues

**Problem:** Device won't auto-register
```
Solution:
1. Verify device and server are on same network
2. Check device auto-registration settings
3. Verify server IP and port (9500) are correct
4. Check firewall on server machine
5. Try direct login via "Add Device" button
```

**Problem:** Device shows offline
```
Solution:
1. Check device network connection
2. Verify device IP hasn't changed
3. Try logging out and logging back in
4. Check device logs for connection issues
```

---

## Next Steps

### Integrating Actual NetSDK

1. **Obtain NetSDK DLLs**
   - Download from Dahua's official developer portal
   - Ensure version compatibility with your device

2. **Update SDKBridgeService.cs**
   - Replace simulated methods with actual NetSDK calls
   - Implement callback handlers for auto-registration
   - Add event subscription for real-time alerts

3. **Key NetSDK Functions to Implement:**
   ```csharp
   // Initialization
   bool initResult = NetSDK.NETClient_Init(initParam, deviceInfo);
   
   // Auto Registration
   bool listenResult = NetSDK.NETClient_StartListenEx(autoLoginInfo);
   
   // Device Login
   int loginID = NetSDK.NETClient_LoginEx2(ip, port, user, password, ref deviceInfo);
   
   // Subscribe to Events
   int handle = NetSDK.NETClient_RealPlayEx(loginID, channel, IntPtr.Zero, DH_RealplayType);
   
   // Logout
   NetSDK.NETClient_Logout(loginID);
   
   // Cleanup
   NetSDK.NETClient_Cleanup();
   ```

### Adding Features

- **Face Recognition Events**: Subscribe to intelligent events from 2nd gen devices
- **Live Video Streaming**: Implement RTSP/WebRTC streaming
- **Access Control**: Remote door unlock functionality
- **User Management**: Add/remove face recognition users
- **Attendance Reports**: Generate reports from recognition events
- **Push Notifications**: Alert on specific events

### Production Deployment

1. **Security**
   - Add authentication/authorization
   - Use HTTPS for all communication
   - Secure device credentials
   - Implement rate limiting

2. **Monitoring**
   - Add health check endpoints
   - Implement logging aggregation
   - Set up monitoring alerts

3. **Scalability**
   - Use load balancer for multiple instances
   - Implement Redis for session management
   - Database for event persistence

---

## Support & Resources

- **Dahua Developer Portal**: https://www.dahuasecurity.com/support
- **NetSDK Documentation**: Refer to provided PDF manuals
- **API Documentation**: See above API section

---

## License

MIT License - See LICENSE file for details

---

**Created with ❤️ for IoT Device Management**
