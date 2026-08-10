/**
 * ═══════════════════════════════════════════════════════════
 * Exprsn Spark Service
 * Real-time User & Group Messaging Platform
 * ═══════════════════════════════════════════════════════════
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const https = require('https');
const path = require('path');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const { createLogger } = require('@exprsn/shared');
const { errorHandler, notFoundHandler } = require('@exprsn/shared');
const { initRedisClient } = require('@exprsn/shared');
const tlsConfig = require('../../shared/tls-config');
const config = require('./config');
const db = require('./models');
const socketHandler = require('./socket');

// Routes
const conversationRoutes = require('./routes/conversations');
const messageRoutes = require('./routes/messages');
const attachmentRoutes = require('./routes/attachments');
const enhancedRoutes = require('./routes/enhanced');
const queueRoutes = require('./routes/queues');
const healthRoutes = require('./routes/health');
const encryptionRoutes = require('./routes/encryption');

// Logger
const logger = createLogger('exprsn-spark');

// Express app
const app = express();

// Create server (HTTP or HTTPS based on TLS configuration)
let server;
let protocol = 'http';

if (tlsConfig.isTLSEnabled()) {
  try {
    server = tlsConfig.createHTTPSServer(app);
    protocol = 'https';
    logger.info('TLS enabled - starting HTTPS server');
  } catch (error) {
    logger.warn('Failed to create HTTPS server, falling back to HTTP:', error.message);
    server = http.createServer(app);
  }
} else {
  server = http.createServer(app);
}

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
  },
  path: '/socket.io'
});

/**
 * ═══════════════════════════════════════════════════════════
 * Middleware
 * ═══════════════════════════════════════════════════════════
 */

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.socket.io", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
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

// Attach Socket.IO to request context
app.use((req, res, next) => {
  req.io = io;
  next();
});

/**
 * ═══════════════════════════════════════════════════════════
 * Routes
 * ═══════════════════════════════════════════════════════════
 */

app.use('/health', healthRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/attachments', attachmentRoutes);
app.use('/api/queues', queueRoutes);
app.use('/api/encryption', encryptionRoutes);
app.use('/api/config', require('./routes/config'));
app.use('/api', enhancedRoutes);

/**
 * ═══════════════════════════════════════════════════════════
 * Error Handling
 * ═══════════════════════════════════════════════════════════
 */

app.use(notFoundHandler);
app.use(errorHandler);

/**
 * ═══════════════════════════════════════════════════════════
 * Socket.IO Integration
 * ═══════════════════════════════════════════════════════════
 */

socketHandler(io);

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

      // Setup Socket.IO Redis adapter for horizontal scaling
      const pubClient = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379'
      });
      const subClient = pubClient.duplicate();

      await Promise.all([
        pubClient.connect(),
        subClient.connect()
      ]);

      io.adapter(createAdapter(pubClient, subClient));
      logger.info('Socket.IO Redis adapter configured for clustering');
    }

    // Sync database
    await db.sequelize.authenticate();
    logger.info('Database connection established');

    // Sync models (in development)
    if (process.env.NODE_ENV === 'development') {
      try {
        // Use force: false, alter: false to avoid dropping/altering existing tables
        // Tables should be created by database migrations or setup scripts
        await db.sequelize.sync({ force: false, alter: false });
        logger.info('Database models synchronized');
      } catch (syncError) {
        logger.warn('Database sync encountered issues, tables may already exist', {
          error: syncError.message
        });
        // Continue anyway - models can still work with existing tables
      }
    }

    // Start server
    const port = process.env.SPARK_SERVICE_PORT || 3002;
    server.listen(port, () => {
      logger.info(`Exprsn Spark service listening on port ${port}`);
      logger.info(`Protocol: ${protocol}`);
      logger.info(`Socket.IO enabled at ${protocol === 'https' ? 'wss' : 'ws'}://localhost:${port}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`TLS: ${tlsConfig.isTLSEnabled() ? 'enabled' : 'disabled'}`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// Handle shutdown gracefully
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  io.close();
  await db.sequelize.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  io.close();
  await db.sequelize.close();
  process.exit(0);
});

// Start server
startServer();

module.exports = { app, server, io };
