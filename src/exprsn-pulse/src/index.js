/**
 * Exprsn Pulse - Analytics & Business Intelligence Service
 *
 * Comprehensive analytics platform with dashboards, reports, visualizations,
 * and real-time data updates for the Exprsn ecosystem.
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const https = require('https');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const { createClient } = require('redis');
const client = require('prom-client');
const path = require('path');
const config = require('./config');
const logger = require('./utils/logger');
const { sequelize } = require('./models');
const RealtimeService = require('./services/RealtimeService');
const ScheduleService = require('./services/ScheduleService');
const ServiceIntegration = require('./services/ServiceIntegration');
const RedisService = require('./services/RedisService');
const { getCertificates, getCertificateInfo } = require('./utils/certificate');

// Import authentication middleware from @exprsn/shared
const {
  validateCAToken,
  optionalToken,
  requireRole,
  autoAudit,
  errorHandler: sharedErrorHandler
} = require('@exprsn/shared');

const app = express();

// Check if TLS/HTTPS is enabled
const TLS_ENABLED = process.env.TLS_ENABLED === 'true';
let httpServer, httpsServer;

// Initialize Prometheus metrics
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ prefix: 'exprsn_pulse_' });

// Custom metrics
const httpRequestsTotal = new client.Counter({
  name: 'exprsn_pulse_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status']
});

const httpRequestDuration = new client.Histogram({
  name: 'exprsn_pulse_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path'],
  buckets: [0.1, 0.5, 1, 2, 5]
});

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Security
app.use(helmet({
  contentSecurityPolicy: false // Allow chart libraries to work
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Global rate limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX || '1000'), // Limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

app.use(globalLimiter);

// Session configuration with Redis store if enabled
let sessionConfig = {
  secret: process.env.SESSION_SECRET || 'exprsn-pulse-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.TLS_ENABLED === 'true',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
  }
};

// Use Redis store if Redis is enabled
if (process.env.REDIS_ENABLED === 'true') {
  try {
    const redisClient = createClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      legacyMode: true
    });

    redisClient.connect().then(() => {
      logger.info('Redis session store connected', {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379
      });
    }).catch(err => {
      logger.warn('Failed to connect to Redis for sessions, using in-memory store', {
        error: err.message
      });
    });

    sessionConfig.store = new RedisStore({ client: redisClient });
  } catch (error) {
    logger.warn('Failed to initialize Redis session store, using in-memory store', {
      error: error.message
    });
  }
}

app.use(session(sessionConfig));

// Static files for web UI
app.use('/static', express.static(path.join(__dirname, '../public')));

// Request tracking middleware
app.use((req, res, next) => {
  const start = Date.now();

  // Track response
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;

    // Update Prometheus metrics
    httpRequestsTotal.labels(req.method, req.path, res.statusCode).inc();
    httpRequestDuration.labels(req.method, req.path).observe(duration);
  });

  next();
});

// Health check
app.get('/health', async (req, res) => {
  let dbStatus = 'disconnected';

  try {
    await sequelize.authenticate();
    dbStatus = 'connected';
  } catch (error) {
    logger.error('Database health check failed', { error: error.message });
  }

  const realtimeStats = RealtimeService.getStatistics();
  const cacheHealth = await RedisService.getHealth();

  res.json({
    status: dbStatus === 'connected' ? 'healthy' : 'degraded',
    service: 'exprsn-pulse',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    database: dbStatus,
    cache: {
      enabled: cacheHealth.enabled,
      connected: cacheHealth.connected,
      healthy: cacheHealth.healthy
    },
    realtime: {
      connections: realtimeStats.totalConnections,
      dashboards: realtimeStats.dashboardSubscriptions
    }
  });
});

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', client.register.contentType);
    res.end(await client.register.metrics());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Strict rate limiter for admin operations
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit admin operations to 100 requests per 15 minutes
  message: 'Too many admin requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

// Cache statistics endpoint (admin only)
app.get('/api/cache/stats', validateCAToken, requireRole(['admin']), adminLimiter, async (req, res) => {
  try {
    const stats = await RedisService.getStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Flush cache endpoint (admin only)
app.post('/api/cache/flush', validateCAToken, requireRole(['admin']), adminLimiter, autoAudit, async (req, res) => {
  try {
    const { type, id } = req.body;

    let result;
    if (type && id) {
      // Invalidate specific item
      result = await RedisService.invalidateItem(type, id);
    } else if (type) {
      // Invalidate type
      result = await RedisService.invalidateType(type);
    } else {
      // Flush all
      result = await RedisService.flushAll();
    }

    res.json({
      success: true,
      message: 'Cache flushed successfully',
      data: { invalidated: result }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Frontend Routes (Web UI) - Optional token for user context (skip in development)
if (process.env.NODE_ENV === 'production') {
  app.use('/', optionalToken, require('./routes/frontend'));
} else {
  // Development mode: skip CA token validation for faster UI testing
  app.use('/', require('./routes/frontend'));
}

// API Routes - Require valid CA token and audit logging
const apiRoutes = [
  '/api/datasources',
  '/api/queries',
  '/api/datasets',
  '/api/visualizations',
  '/api/dashboards',
  '/api/reports',
  '/api/schedules',
  '/api/analytics',
  '/api/events'
];

// Apply authentication and audit logging to all API routes
app.use(apiRoutes, validateCAToken, autoAudit);

app.use('/api/datasources', require('./routes/datasources'));
app.use('/api/queries', require('./routes/queries'));
app.use('/api/datasets', require('./routes/datasets'));
app.use('/api/visualizations', require('./routes/visualizations'));
app.use('/api/dashboards', require('./routes/dashboards'));
app.use('/api/reports', require('./routes/reportsRoutes'));
app.use('/api/schedules', require('./routes/schedules'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/events', require('./routes/events'));

// Real-time statistics endpoint
app.get('/api/realtime/stats', (req, res) => {
  res.json({
    success: true,
    data: RealtimeService.getStatistics()
  });
});

// Error handler - Use shared error handler from @exprsn/shared
app.use(sharedErrorHandler);

// Initialize services
async function initialize() {
  try {
    // Test database connection
    await sequelize.authenticate();
    logger.info('Database connection established');

    // Initialize Redis cache
    await RedisService.initialize();

    const port = process.env.PULSE_PORT || config.port || 3012;

    if (TLS_ENABLED) {
      // Get or generate certificates
      const { key, cert } = getCertificates();
      const certInfo = getCertificateInfo();

      if (certInfo) {
        logger.info('TLS certificate loaded', {
          subject: certInfo.subject.commonName,
          validUntil: certInfo.validity.notAfter
        });
      }

      // Create HTTPS server
      httpsServer = https.createServer({ key, cert }, app);

      // Initialize Socket.IO on HTTPS server
      await RealtimeService.initialize(httpsServer);
      logger.info('Real-time service initialized (HTTPS)');

      // Create HTTP server for redirect to HTTPS
      httpServer = http.createServer((req, res) => {
        const httpsPort = process.env.HTTPS_PORT || 3443;
        res.writeHead(301, {
          Location: `https://${req.headers.host.split(':')[0]}:${httpsPort}${req.url}`
        });
        res.end();
      });

      // Initialize scheduled report cron jobs
      try {
        await ScheduleService.initializeAll();
        logger.info('Scheduled reports initialized');
      } catch (error) {
        logger.warn('Failed to initialize scheduled reports (will retry later)', {
          error: error.message
        });
        // Don't fail startup - retry in 30 seconds
        setTimeout(async () => {
          try {
            await ScheduleService.initializeAll();
            logger.info('Scheduled reports initialized on retry');
          } catch (retryError) {
            logger.error('Failed to initialize schedules on retry', {
              error: retryError.message
            });
          }
        }, 30000);
      }

      // Start HTTPS server
      const httpsPort = process.env.HTTPS_PORT || 3443;
      httpsServer.listen(httpsPort, () => {
        logger.info(`Exprsn Pulse HTTPS started on port ${httpsPort}`, {
          environment: process.env.NODE_ENV || 'development',
          certificate: certInfo ? {
            subject: certInfo.subject,
            issuer: certInfo.issuer,
            validUntil: certInfo.validity.notAfter
          } : 'Self-signed',
          metricsUrl: `https://localhost:${httpsPort}/metrics`,
          realtimeUrl: `https://localhost:${httpsPort}/pulse-realtime`,
          apiDocs: `https://localhost:${httpsPort}/`
        });
      });

      // Start HTTP redirect server
      httpServer.listen(port, () => {
        logger.info(`HTTP redirect server started on port ${port}`, {
          redirectTo: `https://localhost:${httpsPort}`
        });
      });
    } else {
      // HTTP only mode
      httpServer = http.createServer(app);

      // Initialize Socket.IO on HTTP server
      await RealtimeService.initialize(httpServer);
      logger.info('Real-time service initialized (HTTP)');

      // Initialize scheduled report cron jobs
      try {
        await ScheduleService.initializeAll();
        logger.info('Scheduled reports initialized');
      } catch (error) {
        logger.warn('Failed to initialize scheduled reports (will retry later)', {
          error: error.message
        });
        // Don't fail startup - retry in 30 seconds
        setTimeout(async () => {
          try {
            await ScheduleService.initializeAll();
            logger.info('Scheduled reports initialized on retry');
          } catch (retryError) {
            logger.error('Failed to initialize schedules on retry', {
              error: retryError.message
            });
          }
        }, 30000);
      }

      // Start HTTP server
      httpServer.listen(port, () => {
        logger.info(`Exprsn Pulse HTTP started on port ${port}`, {
          environment: process.env.NODE_ENV || 'development',
          metricsUrl: `http://localhost:${port}/metrics`,
          realtimeUrl: `http://localhost:${port}/pulse-realtime`,
          apiDocs: `http://localhost:${port}/`
        });
      });
    }

    // Register with exprsn-setup for service discovery
    try {
      await ServiceIntegration.registerWithSetup();
    } catch (error) {
      logger.warn('Service discovery registration failed (non-fatal)', {
        error: error.message
      });
    }
  } catch (error) {
    logger.error('Failed to initialize service', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');

  // Deregister from service discovery
  await ServiceIntegration.deregister();

  // Stop scheduled jobs
  ScheduleService.stopAll();

  // Close Redis connection
  await RedisService.close();

  // Close database connection
  await sequelize.close();

  // Close servers
  const closeServers = [];

  if (httpServer) {
    closeServers.push(new Promise((resolve) => {
      httpServer.close(() => {
        logger.info('HTTP server closed');
        resolve();
      });
    }));
  }

  if (httpsServer) {
    closeServers.push(new Promise((resolve) => {
      httpsServer.close(() => {
        logger.info('HTTPS server closed');
        resolve();
      });
    }));
  }

  await Promise.all(closeServers);
  logger.info('All servers closed');
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');

  // Deregister from service discovery
  await ServiceIntegration.deregister();

  // Stop scheduled jobs
  ScheduleService.stopAll();

  // Close Redis connection
  await RedisService.close();

  // Close database connection
  await sequelize.close();

  // Close servers
  const closeServers = [];

  if (httpServer) {
    closeServers.push(new Promise((resolve) => {
      httpServer.close(() => {
        logger.info('HTTP server closed');
        resolve();
      });
    }));
  }

  if (httpsServer) {
    closeServers.push(new Promise((resolve) => {
      httpsServer.close(() => {
        logger.info('HTTPS server closed');
        resolve();
      });
    }));
  }

  await Promise.all(closeServers);
  logger.info('All servers closed');
  process.exit(0);
});

// Start the service
initialize();

module.exports = { app, httpServer, httpsServer };
