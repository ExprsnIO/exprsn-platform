/**
 * Exprsn Live - Live Streaming & Video Chat Platform
 * Main Application Entry Point
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const helmet = require('helmet');
const cors = require('cors');
const config = require('./config');
const logger = require('./utils/logger');

// Socket.IO handler
const SocketHandler = require('./sockets');

// Services
const orchestrator = require('./services/orchestrator');
const ffmpegService = require('./services/ffmpeg');

// Routes
const healthRoutes = require('./routes/health');
const streamRoutes = require('./routes/streams');
const roomRoutes = require('./routes/rooms');
const simulcastRoutes = require('./routes/simulcast');
const destinationRoutes = require('./routes/destinations');

// Create Express app
const app = express();
const server = http.createServer(app);

// Socket.IO for real-time signaling
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
  },
  path: '/socket.io',
  transports: ['websocket', 'polling']
});

// Initialize Socket.IO handler
const socketHandler = new SocketHandler(io);

/**
 * Middleware
 */

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdn.socket.io"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "data:"]
    }
  }
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (UI)
app.use('/static', express.static(path.join(__dirname, 'public')));

// Request logging
app.use((req, res, next) => {
  if (!req.path.startsWith('/static')) {
    logger.info(`${req.method} ${req.path}`, {
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
  }
  next();
});

// Attach io and socketHandler to requests
app.use((req, res, next) => {
  req.io = io;
  req.socketHandler = socketHandler;
  next();
});

/**
 * Routes
 */

app.use('/health', healthRoutes);
app.use('/api/streams', streamRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/config', require('./routes/config'));
app.use('/api/simulcast', simulcastRoutes);
app.use('/api/destinations', destinationRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Exprsn Live',
    version: '1.0.0',
    description: 'Live Streaming & Video Chat Platform',
    endpoints: {
      health: '/health',
      streams: '/api/streams',
      rooms: '/api/rooms',
      ui: '/static/index.html'
    }
  });
});

// Socket.IO stats endpoint
app.get('/api/stats', (req, res) => {
  const stats = socketHandler.getStats();
  res.json({
    success: true,
    stats
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `Route ${req.method} ${req.path} not found`
  });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Application error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

/**
 * Server Startup
 */

async function startServer() {
  try {
    // Initialize FFmpeg
    logger.info('Initializing FFmpeg...');
    const ffmpegReady = await ffmpegService.initialize();
    if (ffmpegReady) {
      logger.info('FFmpeg initialized successfully');
    } else {
      logger.warn('FFmpeg not available - streaming features will be limited');
    }

    // Initialize orchestrator
    logger.info('Initializing streaming orchestrator...');
    await orchestrator.initialize();
    logger.info('Orchestrator initialized');

    const port = config.service.port;
    const host = config.service.host;

    server.listen(port, host, () => {
      logger.info(`Exprsn Live service started`, {
        port,
        host,
        env: config.service.env
      });
      logger.info(`Socket.IO signaling enabled`);
      logger.info(`Streaming provider: ${config.streaming.provider}`);
      logger.info(`Multi-platform simulcasting: enabled`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await orchestrator.shutdown();
  io.close();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await orchestrator.shutdown();
  io.close();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

// Start the server
if (require.main === module) {
  startServer();
}

module.exports = { app, server, io, socketHandler };
