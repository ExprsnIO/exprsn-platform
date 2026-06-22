/**
 * ═══════════════════════════════════════════════════════════
 * Exprsn Timeline Module
 * Social Feed & Timeline Management System
 *
 * In-process module behind the unified platform gateway.
 * Exposes { name, app, registerSockets, init } — no server/listen.
 * ═══════════════════════════════════════════════════════════
 */

require('dotenv').config();
const express = require('express');
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
const webhookRoutes = require('./routes/webhooks');
const attachmentRoutes = require('./routes/attachments');

// Logger
const logger = createLogger('exprsn-timeline');

// Log bypass status
logBypassStatus();

// Express app (mounted by the gateway — NO server/listen here)
const app = express();

// Socket.IO namespace (set by registerSockets) used for broadcasting
let nsp;

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
app.use(express.json({
  limit: '10mb',
  // Preserve the raw request body for HMAC webhook signature verification
  // (see src/routes/webhooks.js)
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true }));

// Dev bypass middleware (MUST come before auth/CA middleware)
app.use(bypassAll);

// Global rate limiting (baseline for all routes)
app.use(globalRateLimiter);

// Request logging
app.use((req, res, next) => {
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip
  });
  next();
});

// Attach Socket.IO namespace and IPC to request context
app.use((req, res, next) => {
  if (nsp) {
    req.io = nsp;
  }
  req.ipc = ipc; // Make IPC available to all routes
  next();
});

/**
 * ═══════════════════════════════════════════════════════════
 * Routes (JSON API only — frontend/view rendering removed)
 * ═══════════════════════════════════════════════════════════
 */

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
 * Socket.IO Registration
 * ═══════════════════════════════════════════════════════════
 */

/**
 * Attach the timeline realtime handlers to the gateway's io instance.
 * TODO(platform): verify socket auth/namespace wiring
 */
function registerSockets(io) {
  nsp = io.of('/timeline');
  socketHandler(nsp);
  logger.info('Socket.IO namespace /timeline registered');
  return nsp;
}

/**
 * ═══════════════════════════════════════════════════════════
 * Module Initialization
 * Pre-listen async setup: db, redis, bull queues, elasticsearch.
 * NEVER listens — the gateway owns the HTTP/HTTPS server.
 * ═══════════════════════════════════════════════════════════
 */

async function init(ctx) {
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
      // Emit to connected clients via Socket.IO namespace
      if (nsp) {
        nsp.emit('post:created', data);
      }
    });

    ipc.on('post:updated', async (data, meta) => {
      logger.debug('IPC: Post updated event received', {
        postId: data.id,
        source: meta.source
      });
      if (nsp) {
        nsp.emit('post:updated', data);
      }
    });

    ipc.on('post:deleted', async (data, meta) => {
      logger.debug('IPC: Post deleted event received', {
        postId: data.id,
        source: meta.source
      });
      if (nsp) {
        nsp.emit('post:deleted', data);
      }
    });

    logger.info(`Timeline module initialized (env: ${process.env.NODE_ENV || 'development'})`);
  } catch (error) {
    logger.error('Failed to initialize timeline module', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Graceful resource teardown (invoked by the gateway on shutdown).
 */
async function shutdown() {
  logger.info('Timeline module shutting down resources');
  if (ipc) await ipc.disconnect();
  await closeQueues();
  await closeRateLimitRedis();
  await elasticsearchService.closeClient();
  await db.sequelize.close();
}

module.exports = {
  name: 'timeline',
  app,
  registerSockets,
  init,
  shutdown
};
