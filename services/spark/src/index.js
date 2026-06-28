/**
 * ═══════════════════════════════════════════════════════════
 * Exprsn Spark Module
 * Real-time User & Group Messaging Platform
 *
 * In-process module behind the unified Exprsn gateway.
 * Exposes: { name, app, registerSockets(io), init(ctx) }
 * NO server creation, NO listen, NO static SPA serving.
 * ═══════════════════════════════════════════════════════════
 */

require('dotenv').config();
const express = require('express');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const { createLogger } = require('@exprsn/shared');
const { errorHandler, notFoundHandler } = require('@exprsn/shared');
const { initRedisClient } = require('@exprsn/shared');
const config = require('./config');
const db = require('./models');
const socketHandler = require('./socket');

// Routes
const conversationRoutes = require('./routes/conversations');
const groupChannelRoutes = require('./routes/groupChannels');
const messageRoutes = require('./routes/messages');
const attachmentRoutes = require('./routes/attachments');
const enhancedRoutes = require('./routes/enhanced');
const queueRoutes = require('./routes/queues');
const healthRoutes = require('./routes/health');
const encryptionRoutes = require('./routes/encryption');

// Logger
const logger = createLogger('exprsn-spark');

// Express app (mounted by the gateway; no server/listen here)
const app = express();

// Hold a reference to the Socket.IO server provided by the gateway so that
// `req.io` can be populated and the redis adapter can be applied in init().
let io = null;

/**
 * ═══════════════════════════════════════════════════════════
 * Middleware
 * ═══════════════════════════════════════════════════════════
 */

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.socket.io", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"]
    }
  }
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip
  });
  next();
});

// Attach Socket.IO to request context (set during registerSockets/init)
app.use((req, res, next) => {
  req.io = io;
  next();
});

/**
 * ═══════════════════════════════════════════════════════════
 * Routes (JSON API only)
 * ═══════════════════════════════════════════════════════════
 */

app.use('/health', healthRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/groups', groupChannelRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/attachments', attachmentRoutes);
app.use('/api/queues', queueRoutes);
app.use('/api/encryption', encryptionRoutes);
app.use('/api/config', require('./routes/config'));
app.use('/api', enhancedRoutes);

/**
 * ═══════════════════════════════════════════════════════════
 * Error Handling
 * ═══════════════════════════════════════════════════════════
 */

app.use(notFoundHandler);
app.use(errorHandler);

/**
 * ═══════════════════════════════════════════════════════════
 * Socket.IO Integration
 * Attach spark's realtime handlers onto the `/spark` namespace of the
 * gateway-owned Socket.IO server.
 * ═══════════════════════════════════════════════════════════
 */
function registerSockets(ioServer) {
  io = ioServer;
  // TODO(platform): verify socket auth + redis adapter wiring
  const nsp = io.of('/spark');
  socketHandler(nsp);
  logger.info('Spark socket handlers attached to /spark namespace');
}

/**
 * ═══════════════════════════════════════════════════════════
 * Module Initialization
 * Performs pre-listen async setup: db, redis (incl. socket.io redis
 * adapter), bull queues, elasticsearch. NEVER listens.
 * ═══════════════════════════════════════════════════════════
 */
async function init(ctx = {}) {
  try {
    // Allow the gateway to inject the Socket.IO server via ctx if sockets
    // were not registered yet.
    if (!io && ctx.io) {
      io = ctx.io;
    }

    // Initialize Redis if enabled
    if (process.env.REDIS_ENABLED === 'true') {
      await initRedisClient();
      logger.info('Redis client initialized');

      // Setup Socket.IO Redis adapter for horizontal scaling
      // TODO(platform): verify socket auth + redis adapter wiring
      if (io) {
        const pubClient = createClient({
          url: process.env.REDIS_URL || 'redis://localhost:6379'
        });
        const subClient = pubClient.duplicate();

        await Promise.all([
          pubClient.connect(),
          subClient.connect()
        ]);

        io.adapter(createAdapter(pubClient, subClient));
        logger.info('Socket.IO Redis adapter configured for clustering');
      } else {
        logger.warn('Socket.IO server not available; redis adapter not applied');
      }
    }

    // Database (bull queues + elasticsearch are initialized on require)
    await db.sequelize.authenticate();
    logger.info('Database connection established');

    // Sync models (in development)
    if (process.env.NODE_ENV === 'development') {
      try {
        // Use force: false, alter: false to avoid dropping/altering existing tables
        // Tables should be created by database migrations or setup scripts
        await db.sequelize.sync({ force: false, alter: false });
        logger.info('Database models synchronized');
      } catch (syncError) {
        logger.warn('Database sync encountered issues, tables may already exist', {
          error: syncError.message
        });
        // Continue anyway - models can still work with existing tables
      }
    }

    logger.info('Spark module initialized');
  } catch (error) {
    logger.error('Failed to initialize spark module', { error: error.message, stack: error.stack });
    throw error;
  }
}

module.exports = {
  name: 'spark',
  app,
  registerSockets,
  init
};
