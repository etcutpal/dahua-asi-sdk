import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import { Server as SocketIO } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

import logger from './utils/logger';
import netSdkService from './services/netSdkService';
import personService from './services/person.service';
import AccessRecordService from './services/accessRecordService';
import devicesRouter from './routes/devices';
import autoregRouter from './routes/autoreg';
import eventsRouter from './routes/events';
import webhooksRouter from './routes/webhooks';
import accessRecordsRouter from './routes/access-records';
import personsRouter from './routes/persons';
import employeesRouter from './routes/employees';
import attendanceRouter from './routes/attendance/periods';

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
app.use('/api/autoreg', autoregRouter);
app.use('/api/events', eventsRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/access-records', accessRecordsRouter);
app.use('/api/persons', personsRouter);
app.use('/api/employees', employeesRouter);
app.use('/api/attendance', attendanceRouter);

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);

  // Send current devices to newly connected client
  netSdkService.getAllDevices()
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

    // Initialize Person Service
    await personService.initialize();

    // Initialize Access Record Service
    await accessRecordService.initialize();

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
