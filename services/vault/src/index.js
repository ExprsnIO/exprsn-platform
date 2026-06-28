/**
 * Exprsn Vault - Secure Secrets & Credentials Management
 *
 * This service provides secure storage and retrieval of secrets,
 * API keys, credentials, and other sensitive data for the Exprsn ecosystem.
 *
 * Platform module: runs in-process behind the unified gateway.
 * No server/listen, no view engine, no static assets.
 */

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const {
  errorHandler,
  notFoundHandler,
  logger,
  initRedisClient
} = require('@exprsn/shared');

const app = express();

// Security - adjusted for API usage
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
      fontSrc: ["'self'", 'https://cdn.jsdelivr.net'],
      imgSrc: ["'self'", 'data:']
    }
  }
}));
// CORS: explicit comma-separated allowlist; deny cross-origin when unset.
// A wildcard origin must never be combined with credentials.
const corsOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
app.use(cors({
  origin: corsOrigins.length > 0 ? corsOrigins : false,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'exprsn-vault',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/api/config', require('./routes/config'));
app.use('/api/secrets', require('./routes/secrets'));
app.use('/api/groups', require('./routes/groupSecrets'));
app.use('/api/keys', require('./routes/keys'));
app.use('/api/credentials', require('./routes/credentials'));
app.use('/api/dynamic', require('./routes/dynamic'));
app.use('/api/audit', require('./routes/audit'));
app.use('/api/admin', require('./routes/admin'));

// 404 handler - use shared middleware
app.use(notFoundHandler);

// Error handler - use shared middleware with proper error formatting
app.use(errorHandler);

const socketService = require('./services/socketService');

module.exports = {
  name: 'vault',
  app,

  /**
   * Attach realtime handlers to the shared Socket.IO instance.
   * TODO(platform): verify socket auth/namespace wiring
   */
  registerSockets(io) {
    const nsp = io.of('/vault');
    socketService.initialize(nsp);
    logger.info('Socket.IO enabled for real-time updates on /vault');
  },

  /**
   * Pre-listen async setup: db, redis, secrets engine init.
   * NEVER listen here — the gateway owns the HTTP server.
   */
  async init(ctx) {
    // Initialize Redis for rate limiting
    try {
      await initRedisClient();
      logger.info('Redis connected for rate limiting');
    } catch (err) {
      logger.warn('Redis connection failed, rate limiting may not work', { error: err.message });
    }

    // Initialize database (Sequelize authenticates on require)
    require('./models');

    // Initialize Redis cache for tokens (secrets engine support)
    require('./services/redisCache');

    logger.info('Exprsn Vault module initialized');
  }
};
