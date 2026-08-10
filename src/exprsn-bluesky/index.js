const express = require('express');
const http = require('http');
const https = require('https');
const socketIo = require('socket.io');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const { logger, errorHandler, notFoundHandler } = require('@exprsn/shared');
const { initializeDatabase } = require('./config/database');
const { initializeRedis } = require('./config/redis');
const { setupSocketHandlers } = require('./services/socketService');
const { startFirehose } = require('./services/firehoseService');
const { getTLSCredentials, getCertificateInfo } = require('./utils/tlsCertGenerator');
require('dotenv').config();

const app = express();

// TLS/HTTPS Support
const tlsCredentials = getTLSCredentials();
const server = tlsCredentials
    ? https.createServer(tlsCredentials, app)
    : http.createServer(app);

const protocol = tlsCredentials ? 'https' : 'http';
const io = socketIo(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3018;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Make io available to routes
app.set('io', io);

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdn.socket.io"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"]
    }
  }
}));

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// Hot reload route registration
let routes;
const loadRoutes = () => {
  if (NODE_ENV === 'development') {
    // Clear require cache for hot reload
    Object.keys(require.cache).forEach(key => {
      if (key.includes('/routes/') || key.includes('/controllers/')) {
        delete require.cache[key];
      }
    });
  }
  routes = require('./routes');
  logger.info('Routes loaded/reloaded');
};

// Initial route load
loadRoutes();

// Hot reload endpoint (development only)
if (NODE_ENV === 'development') {
  app.post('/api/admin/reload', (req, res) => {
    try {
      loadRoutes();

      // Reload socket handlers
      setupSocketHandlers(io, true);

      res.json({
        success: true,
        message: 'Routes and socket handlers reloaded',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to reload routes', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'RELOAD_FAILED',
        message: error.message
      });
    }
  });
}

// Mount routes (use function to get latest routes)
app.use((req, res, next) => {
  routes(req, res, next);
});

// Health check
app.get('/health', async (req, res) => {
  try {
    const { sequelize } = require('./models');
    const redis = require('./config/redis').getRedisClient();

    const dbHealthy = await sequelize.authenticate().then(() => true).catch(() => false);
    const redisHealthy = redis ? await redis.ping().then(() => true).catch(() => false) : false;

    const health = {
      status: dbHealthy && redisHealthy ? 'healthy' : 'degraded',
      service: 'exprsn-bluesky',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      checks: {
        database: dbHealthy ? 'up' : 'down',
        redis: redisHealthy ? 'up' : 'down',
        socketio: io.engine.clientsCount !== undefined ? 'up' : 'down'
      },
      connections: {
        websockets: io.engine.clientsCount || 0
      }
    };

    res.status(dbHealthy && redisHealthy ? 200 : 503).json(health);
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    res.status(503).json({
      status: 'unhealthy',
      service: 'exprsn-bluesky',
      error: error.message
    });
  }
});

// Error handlers (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

// Socket.IO setup
setupSocketHandlers(io);

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down gracefully...');

  server.close(() => {
    logger.info('HTTP server closed');
  });

  io.close(() => {
    logger.info('Socket.IO server closed');
  });

  const { sequelize } = require('./models');
  await sequelize.close();
  logger.info('Database connections closed');

  const redis = require('./config/redis').getRedisClient();
  if (redis) {
    await redis.quit();
    logger.info('Redis connection closed');
  }

  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Initialize and start server
async function start() {
  try {
    logger.info('Starting Bluesky PDS Service...');

    // Initialize database
    await initializeDatabase();
    logger.info('Database initialized');

    // Initialize Redis
    await initializeRedis();
    logger.info('Redis initialized');

    // Start firehose (background event stream)
    if (process.env.FIREHOSE_ENABLED !== 'false') {
      startFirehose(io);
      logger.info('Firehose started');
    }

    // Start server
    server.listen(PORT, () => {
      logger.info(`Bluesky PDS Service running on port ${PORT}`);
      logger.info(`Environment: ${NODE_ENV}`);
      logger.info(`Protocol: ${protocol.toUpperCase()}`);

      // Log TLS certificate information
      if (tlsCredentials) {
        const certInfo = getCertificateInfo(tlsCredentials);
        logger.info(`TLS Certificate: ${certInfo.source}`, {
          certPath: certInfo.certPath,
          keyPath: certInfo.keyPath
        });
        if (certInfo.source === 'self-signed') {
          logger.warn('Using self-signed certificate - Not suitable for production!');
          logger.warn('To use your own certificate, set TLS_CERT_PATH and TLS_KEY_PATH in .env');
        }
      }

      logger.info(`Web UI: ${protocol}://localhost:${PORT}/`);
      logger.info(`Admin UI: ${protocol}://localhost:${PORT}/admin`);
      logger.info(`AT Protocol endpoint: ${protocol}://localhost:${PORT}/xrpc`);
    });
  } catch (error) {
    logger.error('Failed to start server', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

// Only start server if this file is run directly (not required by tests)
if (require.main === module) {
  start();
}

module.exports = { app, server, io, start };
