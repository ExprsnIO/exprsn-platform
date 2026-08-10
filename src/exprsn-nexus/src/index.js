const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const logger = require('./utils/logger');
const sequelize = require('./config/database');
const redis = require('./config/redis');

// Import routes
const groupRoutes = require('./routes/groups');
const membershipRoutes = require('./routes/memberships');
const eventRoutes = require('./routes/events');
const governanceRoutes = require('./routes/governance');
const healthRoutes = require('./routes/health');
const trendingRoutes = require('./routes/trending');
const recommendationRoutes = require('./routes/recommendations');
const moderationRoutes = require('./routes/moderation');
const calendarRoutes = require('./routes/calendar');
const viewRoutes = require('./routes/views');
const subGroupRoutes = require('./routes/subgroups');

// Import middleware
const errorHandler = require('./middleware/errorHandler');
const requestLogger = require('./middleware/requestLogger');

const app = express();

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
 * Middleware Configuration
 * ═══════════════════════════════════════════════════════════
 */

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"]
    }
  }
}));

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Request logging
app.use(requestLogger);

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

// Health checks (no rate limiting)
app.use('/health', healthRoutes);

// API routes
app.use('/api/groups', groupRoutes);
app.use('/api/memberships', membershipRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/governance', governanceRoutes);
app.use('/api/trending', trendingRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/moderation', moderationRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/subgroups', subGroupRoutes);
app.use('/api/config', require('./routes/config'));

// View routes (server-side rendered pages)
app.use('/', viewRoutes);

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
app.use(errorHandler);

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

    // Sync database models (disabled due to PostgreSQL 18 permissions)
    // Tables are created via migration scripts instead
    // if (config.env === 'development') {
    //   await sequelize.sync({ alter: false });
    //   logger.info('Database models synchronized');
    // }
    logger.info('Using pre-created database tables');

    // Test Redis connection
    await redis.ping();
    logger.info('Redis connection verified');

    // Start HTTP server
    const server = app.listen(config.service.port, config.service.host, () => {
      logger.info(`${config.service.name} listening on ${config.service.host}:${config.service.port}`);
      logger.info(`Environment: ${config.env}`);
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

          await redis.quit();
          logger.info('Redis connection closed');

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
