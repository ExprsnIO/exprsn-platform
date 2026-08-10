/**
 * Express Application Setup
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
const config = require('./config');
const logger = require('./utils/logger');

const app = express();

// Trust proxy (for NGINX)
app.set('trust proxy', 1);

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/admin');
app.set('layout extractScripts', true);
app.set('layout extractStyles', true);

// Security middleware (relaxed for admin panel with CDN resources)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdn.socket.io"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net"],
      connectSrc: ["'self'", "ws:", "wss:"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS
app.use(cors({
  origin: config.cors.origin,
  credentials: config.cors.credentials,
  maxAge: config.cors.maxAge,
}));

// Compression
app.use(compression());

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if (config.env !== 'test') {
  app.use(morgan('combined', {
    stream: {
      write: (message) => logger.info(message.trim()),
    },
  }));
}

// Custom headers middleware
app.use((req, res, next) => {
  const requestId = req.headers[`${config.customHeaderPrefix}request-id`] || require('uuid').v4();
  req.requestId = requestId;
  res.setHeader(`${config.customHeaderPrefix}request-id`, requestId);
  res.setHeader(`${config.customHeaderPrefix}api-version`, config.api.version);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'exprsn-api',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Ready check endpoint
app.get('/ready', async (req, res) => {
  try {
    const database = require('./config/database');
    const redis = require('./config/redis');

    // Check database
    await database.query('SELECT 1');

    // Check Redis
    await redis.client.ping();

    res.json({
      status: 'ready',
      checks: {
        database: 'ok',
        redis: 'ok',
      },
    });
  } catch (error) {
    logger.error('Readiness check failed', { error: error.message });
    res.status(503).json({
      status: 'not ready',
      error: error.message,
    });
  }
});

// API routes
const usersRoutes = require('./routes/users');
const certificatesRoutes = require('./routes/certificates');
const tokensRoutes = require('./routes/tokens');
const webhooksRoutes = require('./routes/webhooks');
const ocspRoutes = require('./routes/ocsp');
const crlRoutes = require('./routes/crl');
const adminRoutes = require('./routes/admin');

// Mount routes
app.use('/api/users', usersRoutes);
app.use('/api/certificates', certificatesRoutes);
app.use('/api/tokens', tokensRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/ocsp', ocspRoutes);
app.use('/api/crl', crlRoutes);

// Admin panel routes
app.use('/admin', adminRoutes);

// API index endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'Exprsn Platform API',
    version: '1.0.0',
    description: 'Certificate Authority and Token Management Platform',
    documentation: '/api/docs',
    endpoints: {
      health: '/health',
      ready: '/ready',
      users: '/api/users',
      certificates: '/api/certificates',
      tokens: '/api/tokens',
      webhooks: '/api/webhooks',
      ocsp: '/api/ocsp',
      crl: '/api/crl',
    },
  });
});

// Metrics endpoint (if enabled)
if (config.metrics.enabled) {
  const promClient = require('prom-client');
  const register = new promClient.Registry();

  promClient.collectDefaultMetrics({ register });

  app.get(config.metrics.path, async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'The requested resource was not found',
      path: req.path,
      requestId: req.requestId,
    },
  });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Request error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    requestId: req.requestId,
  });

  const statusCode = err.statusCode || 500;
  const message = config.env === 'production' ? 'Internal server error' : err.message;

  res.status(statusCode).json({
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message,
      requestId: req.requestId,
      ...(config.env !== 'production' && { stack: err.stack }),
    },
  });
});

module.exports = app;
