import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import { Server as SocketIO } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

import logger from './utils/logger';
import netSdkService from './services/netSdkService';
import personService from './services/person.service';
import deviceService from './services/device.service';
import AccessRecordService from './services/accessRecordService';
import devicesRouter from './routes/devices';
import deviceGroupsRouter from './routes/device-groups';
import autoregRouter from './routes/autoreg';
import eventsRouter from './routes/events';
import webhooksRouter from './routes/webhooks';
import accessRecordsRouter from './routes/access-records';
import personsRouter from './routes/persons';
import employeesRouter from './routes/employees';
import attendanceRouter from './routes/attendance/periods';
import systemRouter from './routes/system';
import accessRulesRouter from './routes/access-rules';
import syncQueueRouter from './routes/sync-queue';
import syncQueueService from './services/syncQueue.service';

// Load environment variables
dotenv.config();

// Get singleton instance (creates with FileRepository automatically)
const accessRecordService = AccessRecordService.getInstance();

// For backward compatibility - alias as eventService
const eventService = accessRecordService;

// Export for other modules (if needed)
export { accessRecordService, eventService };

const app = express();
const server = http.createServer(app);

// CORS configuration
const io = new SocketIO(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/devices', devicesRouter);
app.use('/api/device-groups', deviceGroupsRouter);
app.use('/api/autoreg', autoregRouter);
app.use('/api/events', eventsRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/access-records', accessRecordsRouter);
app.use('/api/persons', personsRouter);
app.use('/api/employees', employeesRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/system', systemRouter);
app.use('/api/access-rules', accessRulesRouter);
app.use('/api/sync-queue', syncQueueRouter);

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Dashboard devices — same merged list used by the socket, consumed by the dashboard widget
app.get('/api/dashboard/devices', async (req: Request, res: Response) => {
  try {
    const devices = await getMergedDevicesForSocket();
    res.json(devices);
  } catch (error: any) {
    logger.error('Error in /api/dashboard/devices:', error);
    res.json([]);
  }
});

// Helper: build a merged device list (devices.json + live status from bridge).
// This is the single source of truth for what the frontend should see.
// Only devices registered in devices.json are shown; unknown bridge devices
// (e.g. a device whose registration ID was changed on the frontend) stay hidden.
async function getMergedDevicesForSocket() {
  const [storedDevices, bridgeDevices] = await Promise.all([
    deviceService.getAll(),
    netSdkService.getAllDevices(),
  ]);

  return storedDevices.map((d: any) => {
    const bridgeDev = bridgeDevices.find(
      (b: any) => (b.DeviceID || b.deviceID) === d.registrationId
    );
    const status = bridgeDev ? (bridgeDev.Status || bridgeDev.status || 'Offline') : 'Offline';
    return {
      ...d,
      deviceID: d.registrationId,
      status,
      Status: status,
    };
  });
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);

  // Send merged devices (only devices.json entries with live status) to newly connected client
  getMergedDevicesForSocket()
    .then(devices => {
      socket.emit('devices:update', devices);
    })
    .catch(err => {
      logger.error('Error sending devices to client:', err);
    });

  // Handle client disconnection
  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });

  // Handle client joining a device room
  socket.on('device:join', (deviceId: string) => {
    socket.join(`device:${deviceId}`);
    logger.info(`Client ${socket.id} joined device room: ${deviceId}`);
  });

  // Handle client leaving a device room
  socket.on('device:leave', (deviceId: string) => {
    socket.leave(`device:${deviceId}`);
    logger.info(`Client ${socket.id} left device room: ${deviceId}`);
  });
});

// Event service integration - broadcast events to WebSocket clients
eventService.on('device:status:changed', (data: any) => {
  io.emit('device:status:changed', data);

  // ── Flush queued_offline jobs when a device comes back online ──────────
  const status = (data.status || data.Status || '').toLowerCase();
  const deviceId = data.deviceId || data.DeviceID || data.deviceID;
  if (status === 'online' && deviceId) {
    syncQueueService.flushDevice(deviceId).catch((err: any) =>
      logger.warn(`[SyncQueue] flushDevice error: ${err.message}`)
    );
  }
});

eventService.on('device:event:received', (data: any) => {
  io.emit('device:event:received', data);

  // Also emit to specific device room
  if (data.deviceId) {
    io.to(`device:${data.deviceId}`).emit('device:event', data);
  }
});

// Broadcast access control events to all clients
eventService.on('access:control:event', (data: any) => {
  io.emit('access:control:event', data);

  logger.info(`📡 WebSocket broadcast: access control event for device ${data.deviceId}`);
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error(err.stack);
  const status = (err as any).status || 500;
  res.status(status).json({
    error: err.message || 'Internal Server Error',
  });
});

// Start server
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0'; // Bind to all interfaces by default

async function startServer() {
  try {
    // Initialize NetSDK Service
    await netSdkService.initialize();

    // Restore persisted auto-reg platform credentials to bridge
    await netSdkService.loadAndApplyCredentials();

    // Push all stored device credentials to bridge (with retry — bridge may not be ready yet)
    const storedDevices = await deviceService.getAll();
    netSdkService.pushAllDeviceCredentialsWithRetry(
      storedDevices.map(d => ({ registrationId: d.registrationId, username: d.username, password: d.password }))
    ).catch((e: any) => logger.warn(`[Startup] Credential push background task failed: ${e.message}`));

    // Initialize Person Service
    await personService.initialize();

    // Initialize Access Record Service
    await accessRecordService.initialize();

    // Initialize Sync Queue Service
    await syncQueueService.initialize();

    // Broadcast sync-queue updates to all connected clients
    syncQueueService.on('queue:updated', (summary: any) => {
      io.emit('sync:queue:updated', summary);
    });

    // ── Auto-resync rules that have no queued jobs (e.g. after a fresh restart) ──
    // This ensures that if the backend restarts with existing rules but an empty
    // queue, the persons are re-synced to devices automatically.
    setImmediate(async () => {
      try {
        const accessRuleService = (await import('./services/accessRule.service')).default;
        const rules = await accessRuleService.getAll();
        const jobs = syncQueueService.getJobs();
        for (const rule of rules) {
          const hasActiveJobs = jobs.some(j => j.ruleId === rule.id && j.status !== 'success');
          if (!hasActiveJobs) {
            logger.info(`[Startup] Rule "${rule.name}" has no active jobs — queuing full resync`);
            await accessRuleService.resync(rule.id).catch((e: any) =>
              logger.warn(`[Startup] Resync for rule ${rule.id} failed: ${e.message}`)
            );
          }
        }
      } catch (e: any) {
        logger.warn(`[Startup] Auto-resync failed: ${e.message}`);
      }
    });

    const port = parseInt(PORT as string, 10) || 3001;
    server.listen(port, HOST, () => {
      logger.info(`Express server running on ${HOST}:${port}`);
      logger.info(`WebSocket server ready`);
      logger.info(`NetSDK Bridge: ${process.env.NETSDK_BRIDGE_URL}`);
    }).on('error', (error: any) => {
      logger.error('Server error:', error);
    });
  } catch (error: any) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(async () => {
    await netSdkService.cleanup();
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT signal received: closing HTTP server');
  server.close(async () => {
    await netSdkService.cleanup();
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

startServer();

export { app, server, io };
