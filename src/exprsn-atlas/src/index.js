const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const logger = require('./utils/logger');
const sequelize = require('./config/database');
const redis = require('./config/redis');

const app = express();

/**
 * ═══════════════════════════════════════════════════════════
 * Middleware Configuration
 * ═══════════════════════════════════════════════════════════
 */

// Security middleware
app.use(helmet());

// CORS
app.use(cors(config.cors));

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging (development)
if (config.env === 'development') {
  const morgan = require('morgan');
  app.use(morgan('dev'));
}

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', limiter);

/**
 * ═══════════════════════════════════════════════════════════
 * Routes
 * ═══════════════════════════════════════════════════════════
 */

// Health check
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    await sequelize.authenticate();

    // Check PostGIS
    const [result] = await sequelize.query("SELECT PostGIS_Version() as version");

    // Check Redis
    await redis.ping();

    res.json({
      status: 'healthy',
      service: 'exprsn-atlas',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      database: 'connected',
      postgis: result[0].version,
      redis: config.redis.enabled ? 'connected' : 'disabled',
      features: config.features
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      service: 'exprsn-atlas',
      error: error.message
    });
  }
});

// API routes
app.use('/api/spatial', require('./routes/spatial'));
app.use('/api/places', require('./routes/places'));
app.use('/api/geofences', require('./routes/geofences'));
app.use('/api/geocode', require('./routes/geocoding'));
app.use('/api/routing', require('./routes/routing'));
app.use('/api/elevation', require('./routes/elevation'));
app.use('/api/heatmap', require('./routes/heatmap'));

// Bridge integration (simplified service-to-service endpoints)
app.use('/api/bridge', require('./routes/bridge'));

/**
 * ═══════════════════════════════════════════════════════════
 * Error Handling
 * ═══════════════════════════════════════════════════════════
 */

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `Route ${req.method} ${req.path} not found`,
    path: req.path,
    method: req.method
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);

  res.status(err.status || 500).json({
    error: err.name || 'INTERNAL_ERROR',
    message: config.env === 'production' ? 'An error occurred' : err.message,
    ...(config.env !== 'production' && { stack: err.stack })
  });
});

/**
 * ═══════════════════════════════════════════════════════════
 * Server Initialization
 * ═══════════════════════════════════════════════════════════
 */

async function startServer() {
  try {
    // Test database connection
    await sequelize.authenticate();
    logger.info('Database connection verified');

    // Initialize PostGIS (if needed)
    try {
      const { initializePostGIS } = require('./config/database');
      await initializePostGIS();
    } catch (postgisError) {
      logger.warn('PostGIS initialization skipped (may already be enabled):', postgisError.message);
    }

    // Test Redis connection
    if (config.redis.enabled) {
      await redis.ping();
      logger.info('Redis connection verified');
    } else {
      logger.info('Redis disabled - using mock client');
    }

    // Start HTTP server
    const server = app.listen(config.service.port, config.service.host, () => {
      logger.info(`${config.service.name} listening on ${config.service.host}:${config.service.port}`);
      logger.info(`Environment: ${config.env}`);
      logger.info(`PostGIS enabled: true`);
      logger.info(`Features: ${JSON.stringify(config.features)}`);
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`${signal} received, shutting down gracefully`);

      server.close(async () => {
        logger.info('HTTP server closed');

        try {
          await sequelize.close();
          logger.info('Database connection closed');

          if (config.redis.enabled) {
            await redis.quit();
            logger.info('Redis connection closed');
          }

          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown:', error);
          process.exit(1);
        }
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
if (require.main === module) {
  startServer();
}

module.exports = app;
