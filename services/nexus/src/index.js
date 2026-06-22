const express = require('express');
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
const subGroupRoutes = require('./routes/subgroups');

// Import middleware
const errorHandler = require('./middleware/errorHandler');
const requestLogger = require('./middleware/requestLogger');

const app = express();

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
 * Module Initialization
 * ═══════════════════════════════════════════════════════════
 *
 * platform: this service runs in-process behind the unified gateway.
 * init() performs all pre-listen async setup (DB + Redis verification).
 * It NEVER calls app.listen — the gateway owns the HTTP server lifecycle.
 */
async function init(ctx) {
  // Test database connection (moved here from require-time so a failure
  // cannot process.exit the whole platform)
  await sequelize.authenticate();
  logger.info('Database connection verified');

  // Sync database models (disabled due to PostgreSQL 18 permissions)
  // Tables are created via migration scripts instead
  logger.info('Using pre-created database tables');

  // Test Redis connection
  await redis.ping();
  logger.info('Redis connection verified');

  logger.info(`${config.service.name} module initialized`);
  logger.info(`Features: ${JSON.stringify(config.features)}`);
}

module.exports = {
  name: 'nexus',
  app,
  init
};
