# SDK Integration Guide for Express.js + Next.js Projects

This guide explains how to integrate the Dahua ASI Face Access Terminal SDK functionality into a new Express.js backend and Next.js frontend project.

---

## 📋 Architecture Overview

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│  Dahua ASI      │◄───────►│  C# SDKBridge    │◄───────►│  Express.js     │
│  Device         │  TCP    │  (Port 5000)     │  HTTP   │  Backend        │
│  (ASI11/ASI12)  │  :9500  │                  │  REST   │  (Port 3001)    │
└─────────────────┘         └──────────────────┘         └────────┬────────┘
                                                                   │
                                                         WebSocket │
                                                         Socket.IO │
                                                                   ▼
                                                          ┌─────────────────┐
                                                          │  Next.js        │
                                                          │  Frontend       │
                                                          │  (Port 3000)    │
                                                          └─────────────────┘
```

### Why C# Bridge?
The Dahua NetSDK is a **native C/C++ SDK** with only official C# wrappers (`NetSDK.cs`). The C# bridge handles:
- SDK initialization and lifecycle management
- Auto-registration server (devices connect to it)
- Device login/authentication
- Real-time event subscription (3 methods)
- Access record queries via SDK
- Webhook notifications to Express.js backend

---

## 🚀 Option 1: Full Integration (Recommended for Production)

This approach uses the C# SDKBridge for complete SDK functionality.

### Step 1: Copy the C# SDKBridge

1. **Copy the entire `NetSDKBridge` folder** to your new project:
   ```
   your-project/
   ├── sdks-bridge/
   │   └── NetSDKBridge/          # Copy entire NetSDKBridge folder here
   │       ├── Program.cs
   │       ├── SDKBridgeService.cs
   │       ├── HttpApiServer.cs
   │       ├── NetSDK.cs
   │       ├── NetSDKStruct.cs
   │       ├── OriginalSDK.cs
   │       ├── Modules/
   │       ├── NetSDKBridge.csproj
   │       └── dhnetsdk.dll, dhconfigsdk.dll, avnetsdk.dll, Infra.dll
   ```

2. **Ensure .NET 8.0 SDK is installed** on the target system:
   ```bash
   dotnet --version  # Should show 8.0.x
   ```

3. **Build the C# bridge**:
   ```bash
   cd sdks-bridge/NetSDKBridge
   dotnet restore
   dotnet build
   dotnet run  # Starts on port 5000 by default
   ```

---

### Step 2: Set Up Express.js Backend

#### 2.1 Initialize Express.js Project

```bash
mkdir backend && cd backend
npm init -y
npm install express socket.io axios cors dotenv winston
npm install -D nodemon
```

#### 2.2 Create Backend Structure

```
backend/
├── src/
│   ├── server.js                    # Main Express + Socket.IO server
│   ├── services/
│   │   ├── netSdkService.js         # HTTP client to C# bridge
│   │   ├── eventService.js          # Event management & broadcasting
│   │   └── device.service.js        # Device configuration CRUD
│   ├── routes/
│   │   ├── devices.js               # Device CRUD routes
│   │   ├── autoreg.js               # Auto-registration control
│   │   ├── events.js                # Event query routes
│   │   ├── webhooks.js              # Webhook receivers from C# bridge
│   │   └── access-records.js        # Access record queries
│   ├── utils/
│   │   └── logger.js                # Winston logger
│   └── middleware/
│       └── error.js                 # Error handling middleware
├── data/
│   ├── devices.json                 # Device configurations
│   └── access-events.json           # Event storage (last 500)
├── .env                             # Environment variables
└── package.json
```

#### 2.3 Create Core Service Files

**`src/services/netSdkService.js`** - Communicates with C# Bridge:

```javascript
const axios = require('axios');
const logger = require('../utils/logger');

const BRIDGE_URL = process.env.CSHARP_BRIDGE_URL || 'http://localhost:5000';

class NetSdkService {
  constructor() {
    this.api = axios.create({
      baseURL: BRIDGE_URL,
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' }
    });
    this.deviceCache = new Map();
  }

  // Initialize SDK
  async initialize() {
    try {
      const response = await this.api.post('/api/sdk/init');
      logger.info('SDK initialized successfully');
      return response.data;
    } catch (error) {
      logger.error('Failed to initialize SDK:', error.message);
      throw error;
    }
  }

  // Start auto-registration server
  async startAutoReg(ip = '0.0.0.0', port = 9500) {
    try {
      const response = await this.api.post('/api/autoreg/start', { ip, port });
      logger.info(`Auto-reg server started on ${ip}:${port}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to start auto-reg:', error.message);
      throw error;
    }
  }

  // Get all devices
  async getDevices() {
    try {
      const response = await this.api.get('/api/devices');
      this.deviceCache = new Map(response.data.map(d => [d.deviceId, d]));
      return response.data;
    } catch (error) {
      logger.error('Failed to get devices:', error.message);
      throw error;
    }
  }

  // Handle device status webhook from C# bridge
  handleDeviceStatusUpdate(deviceData) {
    const { deviceId, status, registrationId } = deviceData;
    this.deviceCache.set(deviceId, { ...this.deviceCache.get(deviceId), status });
    logger.info(`Device ${deviceId} status changed to: ${status}`);
    return this.deviceCache.get(deviceId);
  }

  // Handle access event webhook from C# bridge
  handleAccessEvent(eventData) {
    logger.info('Received access event:', eventData);
    return eventData;
  }
}

module.exports = new NetSdkService();
```

**`src/services/eventService.js`** - Event Management:

```javascript
const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

const EVENTS_FILE = path.join(__dirname, '../../data/access-events.json');
const MAX_EVENTS = 500;

class EventService extends EventEmitter {
  constructor() {
    super();
    this.events = [];
    this.loadEvents();
  }

  async loadEvents() {
    try {
      const data = await fs.readFile(EVENTS_FILE, 'utf8');
      this.events = JSON.parse(data);
      logger.info(`Loaded ${this.events.length} events from file`);
    } catch (error) {
      this.events = [];
    }
  }

  async saveEvents() {
    try {
      await fs.writeFile(EVENTS_FILE, JSON.stringify(this.events, null, 2));
    } catch (error) {
      logger.error('Failed to save events:', error.message);
    }
  }

  addEvent(eventData) {
    this.events.unshift(eventData);
    if (this.events.length > MAX_EVENTS) {
      this.events = this.events.slice(0, MAX_EVENTS);
    }
    this.saveEvents();
    this.emit('new:event', eventData);
  }

  getEvents(filters = {}) {
    let filtered = this.events;
    
    if (filters.deviceId) {
      filtered = filtered.filter(e => e.deviceId === filters.deviceId);
    }
    if (filters.eventType) {
      filtered = filtered.filter(e => e.eventType === filters.eventType);
    }
    if (filters.startTime) {
      filtered = filtered.filter(e => e.timestamp >= filters.startTime);
    }
    if (filters.endTime) {
      filtered = filtered.filter(e => e.timestamp <= filters.endTime);
    }
    
    return filtered;
  }
}

module.exports = new EventService();
```

**`src/server.js`** - Main Server:

```javascript
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const logger = require('./utils/logger');
const netSdkService = require('./services/netSdkService');
const eventService = require('./services/eventService');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

// Routes
app.use('/api/devices', require('./routes/devices'));
app.use('/api/autoreg', require('./routes/autoreg'));
app.use('/api/events', require('./routes/events'));
app.use('/api/webhooks', require('./routes/webhooks'));
app.use('/api/access-records', require('./routes/access-records'));

// Socket.IO connection handling
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);

  // Send current devices on connect
  socket.emit('devices:update', Array.from(netSdkService.deviceCache.values()));

  socket.on('device:join', (deviceId) => {
    socket.join(`device:${deviceId}`);
    logger.info(`Client ${socket.id} joined device room: ${deviceId}`);
  });

  socket.on('device:leave', (deviceId) => {
    socket.leave(`device:${deviceId}`);
  });

  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// Broadcast events to Socket.IO
eventService.on('new:event', (eventData) => {
  io.emit('access:control:event', eventData);
});

// Startup
async function start() {
  try {
    // Initialize SDK
    await netSdkService.initialize();
    await netSdkService.startAutoReg();

    const PORT = process.env.PORT || 3001;
    server.listen(PORT, () => {
      logger.info(`Backend server running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

module.exports = { app, io, server };
```

**`src/routes/webhooks.js`** - Receive events from C# bridge:

```javascript
const express = require('express');
const router = express.Router();
const netSdkService = require('../services/netSdkService');
const eventService = require('../services/eventService');
const logger = require('../utils/logger');

// Receive device status updates from C# bridge
router.post('/device-status', (req, res) => {
  try {
    const deviceData = req.body;
    logger.info('Received device status webhook:', deviceData);
    
    const updatedDevice = netSdkService.handleDeviceStatusUpdate(deviceData);
    
    // Broadcast to frontend
    req.app.get('io')?.emit('device:status:changed', updatedDevice);
    
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Error handling device status webhook:', error);
    res.status(500).json({ error: error.message });
  }
});

// Receive access control events from C# bridge
router.post('/access-events', (req, res) => {
  try {
    const eventData = req.body;
    logger.info('Received access event webhook:', eventData);
    
    // Store and broadcast event
    eventService.addEvent(eventData);
    
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Error handling access event webhook:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

---

### Step 3: Set Up Next.js Frontend

#### 3.1 Create Next.js Project

```bash
npx create-next-app@latest frontend
cd frontend
npm install socket.io-client axios
```

#### 3.2 Create Frontend Structure

```
frontend/
├── src/
│   ├── app/
│   │   ├── layout.js
│   │   ├── page.js                      # Dashboard page
│   │   └── api/                         # API routes (optional)
│   ├── components/
│   │   ├── DeviceList.js                # Display connected devices
│   │   ├── EventLog.js                  # Real-time event log
│   │   └── AccessControlPanel.js        # Door control UI
│   ├── hooks/
│   │   └── useSocket.js                 # Socket.IO hook
│   ├── services/
│   │   └── api.js                       # API client
│   └── context/
│       └── SocketContext.js             # Socket.IO context
├── .env.local
└── package.json
```

#### 3.3 Create Socket.IO Integration

**`src/context/SocketContext.js`**:

```javascript
'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import io from 'socket.io-client';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [devices, setDevices] = useState([]);
  const [events, setEvents] = useState([]);

  useEffect(() => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
    const socketInstance = io(backendUrl);

    socketInstance.on('connect', () => {
      console.log('Connected to backend');
    });

    socketInstance.on('devices:update', (deviceList) => {
      setDevices(deviceList);
    });

    socketInstance.on('device:status:changed', (device) => {
      setDevices(prev => 
        prev.map(d => d.deviceId === device.deviceId ? device : d)
      );
    });

    socketInstance.on('access:control:event', (eventData) => {
      setEvents(prev => [eventData, ...prev].slice(0, 100));
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket, devices, events }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
```

**`src/app/layout.js`**:

```javascript
import { SocketProvider } from '@/context/SocketContext';

export const metadata = {
  title: 'Dahua ASI Dashboard',
  description: 'Face Access Terminal Management',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <SocketProvider>
          {children}
        </SocketProvider>
      </body>
    </html>
  );
}
```

**`src/app/page.js`**:

```javascript
'use client';
import { useSocket } from '@/context/SocketContext';
import DeviceList from '@/components/DeviceList';
import EventLog from '@/components/EventLog';

export default function Home() {
  const { devices, events } = useSocket();

  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold mb-8">Dahua ASI Dashboard</h1>
      
      <div className="grid grid-cols-2 gap-8">
        <div>
          <h2 className="text-2xl font-semibold mb-4">Connected Devices</h2>
          <DeviceList devices={devices} />
        </div>
        
        <div>
          <h2 className="text-2xl font-semibold mb-4">Recent Events</h2>
          <EventLog events={events} />
        </div>
      </div>
    </main>
  );
}
```

---

## 🔧 Option 2: CGI-Only Integration (No C# Required)

If you can't use the C# bridge, you can implement CGI methods directly in Express.js. This works only for **devices on the same LAN**.

### Direct CGI Integration in Express.js:

```javascript
const axios = require('axios');

class DirectCgiService {
  constructor() {
    this.sessions = new Map();
  }

  // Subscribe to events via eventManager.cgi
  async subscribeToEvents(deviceIp, username, password) {
    const auth = Buffer.from(`${username}:${password}`).toString('base64');
    const url = `http://${deviceIp}/cgi-bin/eventManager.cgi?action=attach&codes=[All]`;
    
    const response = await axios.get(url, {
      auth: { username, password },
      responseType: 'stream',
      timeout: 0
    });

    // Parse multipart stream...
    // (Implement multipart MIME parser from AccessControlEventsGeneralModule.cs)
  }

  // Query access records via recordFinder.cgi
  async getAccessRecords(deviceIp, username, password, startTime, endTime) {
    const url = `http://${deviceIp}/cgi-bin/recordFinder.cgi?action=find&name=AccessControlCardRec&startTime=${startTime}&endTime=${endTime}`;
    
    const response = await axios.get(url, {
      auth: { username, password }
    });

    return response.data;
  }

  // Control door via accessControl.cgi
  async openDoor(deviceIp, username, password, doorIndex = 1) {
    const url = `http://${deviceIp}/cgi-bin/accessControl.cgi?action=openDoor&door=${doorIndex}`;
    
    const response = await axios.get(url, {
      auth: { username, password }
    });

    return response.data;
  }
}

module.exports = new DirectCgiService();
```

**Limitations of CGI-only approach:**
- ❌ Requires direct LAN access to devices (no NAT/firewall traversal)
- ❌ No auto-registration support
- ❌ Must manage device connections manually
- ❌ Less reliable event streaming
- ✅ Simpler deployment (no C# runtime needed)

---

## 📦 Environment Variables

**Backend `.env`**:
```env
PORT=3001
CSHARP_BRIDGE_URL=http://localhost:5000
FRONTEND_URL=http://localhost:3000
NODE_ENV=development
```

**Frontend `.env.local`**:
```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
```

---

## 🚀 Running the Complete System

### 1. Start C# SDKBridge:
```bash
cd sdks-bridge/NetSDKBridge
dotnet run
```

### 2. Start Express.js Backend:
```bash
cd backend
npm run dev  # or: node src/server.js
```

### 3. Start Next.js Frontend:
```bash
cd frontend
npm run dev
```

### 4. Access Dashboard:
Open `http://localhost:3000` in your browser.

---

## 📊 API Endpoints Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/sdk/init` | Initialize SDK |
| POST | `/api/autoreg/start` | Start auto-reg server |
| POST | `/api/autoreg/stop` | Stop auto-reg server |
| GET | `/api/devices` | List all devices |
| GET | `/api/events` | Get event history |
| GET | `/api/access-records/sdk/:deviceId` | Query access records via SDK |
| POST | `/api/webhooks/device-status` | Receive device status (from C# bridge) |
| POST | `/api/webhooks/access-events` | Receive access events (from C# bridge) |

---

## 🔍 Key Implementation Details

### Device Auto-Registration Flow:
1. Device connects to C# bridge on port 9500
2. Bridge receives `NET_DVR_SERIAL_RETURN` packet with registration ID
3. Bridge logs in using `LoginWithHighLevelSecurity()` with `SERVER_CONN` mode
4. Bridge subscribes to events via 3 methods (SDK + 2 CGI methods)
5. Bridge sends webhook to Express.js: `POST /api/webhooks/device-status`
6. Express.js broadcasts via Socket.IO: `device:status:changed`

### Event Flow:
1. User authenticates at device (face/card/fingerprint)
2. Device sends event to C# bridge
3. Bridge parses multipart MIME stream
4. Bridge sends webhook: `POST /api/webhooks/access-events`
5. Express.js stores event and broadcasts: `access:control:event`
6. Next.js frontend receives and displays event in real-time

---

## 🐛 Troubleshooting

### C# Bridge won't start:
- Ensure .NET 8.0 SDK is installed: `dotnet --version`
- Check if port 5000 is available: `netstat -ano | findstr :5000`
- Verify DLL files are in the output directory

### Devices not connecting:
- Ensure port 9500 is open on firewall
- Check device network settings
- Verify registration ID matches device serial number

### Events not received:
- Check webhook URLs in C# bridge configuration
- Verify Express.js webhook routes are mounted
- Check Socket.IO connection in browser dev tools

---

## 📚 Additional Resources

- `PROJECT_OVERVIEW.md` - Original project architecture
- `NETSDK_INTEGRATION_COMPLETE.md` - SDK integration details
- `ACCESS_CONTROL_EVENTS_GUIDE.md` - Event subscription methods
- `AUTO_REG_CONFIG.md` - Auto-registration configuration
- `SERVER_IP_CONFIG.md` - Server IP configuration

---

## ✅ Migration Checklist

- [ ] Copy `NetSDKBridge` folder to new project
- [ ] Install .NET 8.0 SDK on target system
- [ ] Build and test C# bridge independently
- [ ] Set up Express.js project structure
- [ ] Create service files (netSdkService, eventService, device.service)
- [ ] Create route files (webhooks, devices, events, access-records)
- [ ] Set up Socket.IO broadcasting
- [ ] Set up Next.js project
- [ ] Create SocketContext for real-time updates
- [ ] Test device auto-registration
- [ ] Test real-time event reception
- [ ] Test access record queries
- [ ] Deploy to production environment

---

## 🎯 Recommendation

**Use Option 1 (Full Integration)** for:
- Production deployments
- Devices behind NAT/firewall
- Reliable auto-registration
- Complete SDK functionality

**Use Option 2 (CGI-Only)** for:
- Quick prototypes/POCs
- All devices on same LAN
- Environments where C# runtime isn't available
- Simple use cases (no auto-reg needed)

---

For questions or issues, refer to the original documentation files or the detailed comments in `SDKBridgeService.cs`.
