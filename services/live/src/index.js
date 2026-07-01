/**
 * Exprsn Live - Live Streaming & Video Chat Platform
 * In-process module behind the unified platform gateway.
 */

require('dotenv').config();
const express = require('express');
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
const groupStreamRoutes = require('./routes/groupStreams');
const roomRoutes = require('./routes/rooms');
const simulcastRoutes = require('./routes/simulcast');
const destinationRoutes = require('./routes/destinations');

// Create Express app
const app = express();

// Socket handler is created in registerSockets(io) against the /live namespace
let socketHandler = null;

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

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// Attach socketHandler to requests (io is owned by the shared gateway)
app.use((req, res, next) => {
  req.socketHandler = socketHandler;
  if (socketHandler) {
    req.io = socketHandler.io;
  }
  next();
});

/**
 * Routes
 */

app.use('/health', healthRoutes);
app.use('/api/streams', streamRoutes);
app.use('/api/groups', groupStreamRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/rooms', require('./routes/roomCollab'));
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
      rooms: '/api/rooms'
    }
  });
});

// Socket.IO stats endpoint
app.get('/api/stats', (req, res) => {
  if (!socketHandler) {
    return res.json({ success: true, stats: {} });
  }
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
 * Attach realtime socket handlers to the shared Socket.IO server.
 *
 * The /live namespace uses optional-auth: anonymous stream viewers may connect
 * (HLS playback + viewer tracking carry no privilege), but publish/host actions
 * (join-room, participant-state, and all WebRTC signaling) are gated on a
 * validated CA bearer inside SocketHandler (SP-7 / STATUS #11).
 */
function registerSockets(io) {
  const nsp = io.of('/live');
  socketHandler = new SocketHandler(nsp);
  logger.info('Socket.IO signaling enabled on /live namespace (publish actions require CA bearer)');
  return socketHandler;
}

/**
 * Async setup that previously ran before server.listen().
 * NEVER call listen() here — the gateway owns the HTTP server.
 */
async function init(ctx) {
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

    logger.info('Exprsn Live module initialized', {
      env: config.service.env,
      provider: config.streaming.provider
    });
  } catch (error) {
    logger.error('Failed to initialize Live module:', error);
    throw error;
  }
}

// Graceful shutdown of module-owned resources (gateway owns the server)
async function shutdown() {
  logger.info('Shutting down Live module');
  await orchestrator.shutdown();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = {
  name: 'live',
  app,
  registerSockets,
  init,
  shutdown
};
