/**
 * ═══════════════════════════════════════════════════════════
 * Exprsn Timeline Service
 * Social Feed & Timeline Management System
 * ═══════════════════════════════════════════════════════════
 */

require('dotenv').config();
const express = require('express');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const { createLogger } = require('@exprsn/shared');
const { errorHandler, notFoundHandler } = require('@exprsn/shared');
const { initRedisClient } = require('@exprsn/shared');
const config = require('./config');
const db = require('./models');
const socketHandler = require('./socket');
const { initializeQueues, closeQueues } = require('./config/queue');
const elasticsearchService = require('./services/elasticsearchService');
const heraldService = require('./services/heraldService');
const sparkService = require('./services/sparkService');
const prefetchService = require('./services/prefetchService');
const { HTTPSServerManager } = require('../../shared/utils/httpsServer');
const IPCWorker = require('../../shared/ipc/IPCWorker');
const { bypassAll, logBypassStatus } = require('../../shared/middleware/devBypass');

// Rate limiting
const {
  globalRateLimiter,
  postCreationRateLimiter,
  interactionRateLimiter,
  searchRateLimiter,
  timelineRateLimiter,
  closeRateLimitRedis
} = require('./middleware/rateLimit');

// Routes
const postRoutes = require('./routes/posts');
const timelineRoutes = require('./routes/timeline');
const interactionRoutes = require('./routes/interactions');
const listRoutes = require('./routes/lists');
const searchRoutes = require('./routes/search');
const jobRoutes = require('./routes/jobs');
const healthRoutes = require('./routes/health');
const viewRoutes = require('./routes/views');
const webhookRoutes = require('./routes/webhooks');
const attachmentRoutes = require('./routes/attachments');

// Logger
const logger = createLogger('exprsn-timeline');

// Log bypass status
logBypassStatus();

// Express app
const app = express();

// Initialize IPC Worker
const ipc = new IPCWorker({
  serviceName: 'exprsn-timeline',
  namespace: 'ipc'
});

// IPC Ready handler
ipc.on('ready', () => {
  logger.info('IPC Worker ready for inter-service communication');
});

// IPC Error handler
ipc.on('error', (error) => {
  logger.error('IPC Worker error', {
    error: error.message,
    stack: error.stack
  });
});

/**
 * ═══════════════════════════════════════════════════════════
 * View Engine Configuration
 * ═══════════════════════════════════════════════════════════
 */

// Set up EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

/**
 * ═══════════════════════════════════════════════════════════
 * Middleware
 * ═══════════════════════════════════════════════════════════
 */

// Helmet with CSP configured for external CDN resources
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.socket.io", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
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

// Dev bypass middleware (MUST come before auth/CA middleware)
app.use(bypassAll);

// Global rate limiting (baseline for all routes)
app.use(globalRateLimiter);

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Request logging
app.use((req, res, next) => {
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip
  });
  next();
});

// Attach Socket.IO and IPC to request context (will be set after server creation)
let io;
app.use((req, res, next) => {
  if (io) {
    req.io = io;
  }
  req.ipc = ipc; // Make IPC available to all routes
  next();
});

/**
 * ═══════════════════════════════════════════════════════════
 * Routes
 * ═══════════════════════════════════════════════════════════
 */

// View routes (server-side rendered pages)
app.use('/', viewRoutes);

// Health and API routes (with specific rate limiters)
app.use('/health', healthRoutes);
app.use('/api/posts', postRoutes); // Post creation rate limiting applied in route
app.use('/api/timeline', timelineRateLimiter, timelineRoutes);
app.use('/api/interactions', interactionRateLimiter, interactionRoutes);
app.use('/api/lists', listRoutes);
app.use('/api/search', searchRateLimiter, searchRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/attachments', attachmentRoutes);
app.use('/api/config', require('./routes/config'));
app.use('/api/webhooks', webhookRoutes);

/**
 * ═══════════════════════════════════════════════════════════
 * Error Handling
 * ═══════════════════════════════════════════════════════════
 */

app.use(notFoundHandler);
app.use(errorHandler);

/**
 * ═══════════════════════════════════════════════════════════
 * Server Initialization
 * ═══════════════════════════════════════════════════════════
 */

async function startServer() {
  try {
    // Initialize Redis if enabled
    if (process.env.REDIS_ENABLED === 'true') {
      await initRedisClient();
      logger.info('Redis client initialized');
    }

    // Sync database
    await db.sequelize.authenticate();
    logger.info('Database connection established');

    // Sync models (in development)
    if (process.env.NODE_ENV === 'development') {
      await db.sequelize.sync({ alter: true });
      logger.info('Database models synchronized');
    }

    // Initialize job queues
    if (process.env.ENABLE_JOBS !== 'false') {
      initializeQueues();
      logger.info('Job queues initialized');
    }

    // Initialize ElasticSearch client
    if (process.env.ELASTICSEARCH_ENABLED === 'true') {
      elasticsearchService.initClient();
      logger.info('ElasticSearch client initialized');

      // Create indices if they don't exist
      const indexResult = await elasticsearchService.createPostsIndex();
      if (indexResult.success) {
        logger.info('ElasticSearch posts index ready');
      } else {
        logger.warn('Failed to create ElasticSearch posts index', {
          error: indexResult.error
        });
      }
    }

    // Check service integrations health
    logger.info('Checking service integrations...');

    const heraldHealth = await heraldService.checkHealth();
    if (heraldHealth.healthy) {
      logger.info('Herald service connected');
    } else {
      logger.warn('Herald service unavailable', { error: heraldHealth.error });
    }

    const sparkHealth = await sparkService.checkHealth();
    if (sparkHealth.healthy) {
      logger.info('Spark service connected');
    } else {
      logger.warn('Spark service unavailable', { error: sparkHealth.error });
    }

    const prefetchHealth = await prefetchService.checkHealth();
    if (prefetchHealth.healthy) {
      logger.info('Prefetch service connected');
    } else {
      logger.warn('Prefetch service unavailable', { error: prefetchHealth.error });
    }

    // Setup IPC event handlers for post events
    ipc.on('post:created', async (data, meta) => {
      logger.debug('IPC: Post created event received', {
        postId: data.id,
        source: meta.source
      });
      // Emit to connected clients via Socket.IO
      if (io) {
        io.emit('post:created', data);
      }
    });

    ipc.on('post:updated', async (data, meta) => {
      logger.debug('IPC: Post updated event received', {
        postId: data.id,
        source: meta.source
      });
      if (io) {
        io.emit('post:updated', data);
      }
    });

    ipc.on('post:deleted', async (data, meta) => {
      logger.debug('IPC: Post deleted event received', {
        postId: data.id,
        source: meta.source
      });
      if (io) {
        io.emit('post:deleted', data);
      }
    });

    // Configure server using HTTPSServerManager
    const port = process.env.TIMELINE_SERVICE_PORT || 3004;

    const serverManager = new HTTPSServerManager({
      serviceName: 'exprsn-timeline',
      port: port,
      httpsPort: port,
      httpPort: port - 1, // HTTP on 3003 for redirect
      enableHTTP: true,
      redirectHTTP: true
    });

    const servers = await serverManager.start(app);
    const server = servers.https || servers.http;

    // Socket.IO setup (after server creation)
    io = new Server(server, {
      cors: {
        origin: process.env.CORS_ORIGIN || '*',
        credentials: true
      },
      path: '/socket.io'
    });

    // Initialize Socket.IO handlers
    socketHandler(io);

    // Log server status
    const protocol = servers.https ? 'https' : 'http';
    logger.info(`Socket.IO enabled at ${protocol === 'https' ? 'wss' : 'ws'}://localhost:${port}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);

    // Return server for module export
    return server;
  } catch (error) {
    logger.error('Failed to start server', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// Handle shutdown gracefully
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  if (io) io.close();
  if (ipc) await ipc.disconnect();
  await closeQueues();
  await closeRateLimitRedis();
  await elasticsearchService.closeClient();
  await db.sequelize.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  if (io) io.close();
  if (ipc) await ipc.disconnect();
  await closeQueues();
  await closeRateLimitRedis();
  await elasticsearchService.closeClient();
  await db.sequelize.close();
  process.exit(0);
});

// Start server
let server;
startServer().then(srv => {
  server = srv;
});

module.exports = {
  app,
  getServer: () => server,
  getIO: () => io,
  getIPC: () => ipc
};
