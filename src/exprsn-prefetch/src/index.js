/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Prefetch - Main Application
 * Enhanced with comprehensive error handling, rate limiting, and monitoring
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const { errorHandler, notFoundHandler, createRateLimiter } = require('@exprsn/shared');
const config = require('./config');
const logger = require('./utils/logger');
const ActivityBasedStrategy = require('./strategies/activityBased');
const RedisCache = require('./cache/redis');
const metricsService = require('./services/metricsService');

// Initialize Express
const app = express();

// Initialize strategies
const activityStrategy = new ActivityBasedStrategy();

// Initialize cache instances (for graceful shutdown)
const hotCache = new RedisCache('hot');
const warmCache = new RedisCache('warm');

// ═══════════════════════════════════════════════════════════════════════
// Middleware
// ═══════════════════════════════════════════════════════════════════════

// Security
app.use(helmet());

// CORS
app.use(cors({
  origin: config.app.env === 'production' ? config.app.host : '*',
  credentials: true
}));

// Compression
app.use(compression());

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Global rate limiting (baseline for all routes)
const globalRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,  // 1 minute
  max: 300,  // 300 requests per minute globally
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});
app.use(globalRateLimiter);

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// ═══════════════════════════════════════════════════════════════════════
// Routes
// ═══════════════════════════════════════════════════════════════════════

// Health routes (comprehensive monitoring)
const healthRoutes = require('./routes/health');
app.use('/health', healthRoutes);

// Create route-specific rate limiters
const prefetchRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,  // 1 minute
  max: 100,  // 100 prefetch requests per minute
  message: 'Too many prefetch requests, please try again later'
});

const cacheReadLimiter = createRateLimiter({
  windowMs: 60 * 1000,  // 1 minute
  max: 300,  // Higher limit for cache reads
  message: 'Too many cache read requests'
});

// API Routes
const configRoutes = require('./routes/config');
const prefetchRoutes = require('./routes/prefetch');
app.use('/api/config', configRoutes);
app.use('/api/prefetch', prefetchRateLimiter, prefetchRoutes);
app.use('/api/cache', cacheReadLimiter, prefetchRoutes);

// ═══════════════════════════════════════════════════════════════════════
// Error Handling (must be after all routes)
// ═══════════════════════════════════════════════════════════════════════

app.use(notFoundHandler);
app.use(errorHandler);

// ═══════════════════════════════════════════════════════════════════════
// Prefetch Scheduler (uses Bull queues)
// ═══════════════════════════════════════════════════════════════════════

function startPrefetchScheduler() {
  if (config.strategies.activityBased) {
    const interval = config.strategies.activityCheckInterval;

    setInterval(async () => {
      logger.debug('Scheduling activity-based prefetch jobs');
      try {
        await activityStrategy.schedule();  // Uses queue
      } catch (error) {
        logger.error('Error scheduling prefetch jobs:', { error: error.message });
      }
    }, interval);

    logger.info(`Activity-based prefetch scheduler started (interval: ${interval}ms)`);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Start Server
// ═══════════════════════════════════════════════════════════════════════

async function startServer() {
  try {
    // Start listening
    app.listen(config.app.port, () => {
      logger.info(`Prefetch service started on port ${config.app.port}`);
      logger.info(`Environment: ${config.app.env}`);

      // Start prefetch scheduler
      startPrefetchScheduler();
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Graceful Shutdown
// ═══════════════════════════════════════════════════════════════════════

async function gracefulShutdown(signal) {
  logger.info(`${signal} received, shutting down gracefully`);

  try {
    // Close queue processing
    logger.info('Closing prefetch queue...');
    const { closePrefetchQueue } = require('./queues/prefetchQueue');
    await closePrefetchQueue();

    // Destroy token cache
    logger.info('Destroying token cache...');
    const { destroyTokenCache } = require('./utils/caClient');
    destroyTokenCache();

    // Close Redis connections
    logger.info('Closing Redis connections...');
    await Promise.all([
      hotCache.close(),
      warmCache.close(),
      metricsService.close()
    ]);

    logger.info('Shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start the server
if (require.main === module) {
  startServer();
}

// Export for testing
module.exports = { app, activityStrategy };
