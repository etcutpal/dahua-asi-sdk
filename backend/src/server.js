const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const logger = require('./utils/logger');
const netSdkService = require('./services/netSdkService');
const eventService = require('./services/eventService');
const personService = require('./services/person.service');

const app = express();
const server = http.createServer(app);

// CORS configuration
const io = socketIo(server, {
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
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/devices', require('./routes/devices'));
app.use('/api/autoreg', require('./routes/autoreg'));
app.use('/api/events', require('./routes/events'));
app.use('/api/webhooks', require('./routes/webhooks'));
app.use('/api/access-records', require('./routes/access-records'));
app.use('/api/persons', require('./routes/persons'));

// Health check
app.get('/api/health', (req, res) => {
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
  socket.on('device:join', (deviceId) => {
    socket.join(`device:${deviceId}`);
    logger.info(`Client ${socket.id} joined device room: ${deviceId}`);
  });

  // Handle client leaving a device room
  socket.on('device:leave', (deviceId) => {
    socket.leave(`device:${deviceId}`);
    logger.info(`Client ${socket.id} left device room: ${deviceId}`);
  });
});

// Event service integration - broadcast events to WebSocket clients
eventService.on('device:status:changed', (data) => {
  io.emit('device:status:changed', data);
});

eventService.on('device:event:received', (data) => {
  io.emit('device:event:received', data);

  // Also emit to specific device room
  if (data.deviceId) {
    io.to(`device:${data.deviceId}`).emit('device:event', data);
  }
});

// Broadcast access control events to all clients
eventService.on('access:control:event', (data) => {
  io.emit('access:control:event', data);
  
  logger.info(`📡 WebSocket broadcast: access control event for device ${data.deviceId}`);
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(err.status || 500).json({
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

    server.listen(PORT, HOST, () => {
      logger.info(`Express server running on ${HOST}:${PORT}`);
      logger.info(`WebSocket server ready`);
      logger.info(`NetSDK Bridge: ${process.env.NETSDK_BRIDGE_URL}`);
    });
  } catch (error) {
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

module.exports = { app, server, io };
