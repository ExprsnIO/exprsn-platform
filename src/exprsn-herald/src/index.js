/**
 * Exprsn Herald - Notifications & Alerts Service
 *
 * This service handles all notification delivery across the Exprsn ecosystem,
 * including push notifications, email, SMS, and in-app notifications.
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const helmet = require('helmet');
const cors = require('cors');
const config = require('./config');
const logger = require('./utils/logger');
const { sequelize } = require('./models');
const { socketAuth } = require('./middleware/auth');

const app = express();
const server = http.createServer(app);

// Socket.IO for real-time notifications
const io = new Server(server, {
  cors: {
    origin: config.cors.origin,
    credentials: config.cors.credentials
  }
});

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: config.cors.origin,
    credentials: config.cors.credentials
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip
  });
  next();
});

// Health check endpoints
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    await sequelize.authenticate();

    res.json({
      status: 'healthy',
      service: 'exprsn-herald',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      database: 'connected',
      uptime: process.uptime()
    });
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    res.status(503).json({
      status: 'unhealthy',
      service: 'exprsn-herald',
      error: error.message
    });
  }
});

app.get('/health/db', async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({ status: 'connected' });
  } catch (error) {
    res.status(503).json({ status: 'disconnected', error: error.message });
  }
});

app.get('/health/queue', (req, res) => {
  // Check if Bull queues are initialized
  const queues = require('./jobs');
  res.json({
    status: 'ok',
    queues: {
      email: !!queues.emailQueue,
      push: !!queues.pushQueue,
      sms: !!queues.smsQueue,
      digest: !!queues.digestQueue,
      cleanup: !!queues.cleanupQueue
    }
  });
});

// API Routes
app.use('/api/config', require('./routes/config'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/preferences', require('./routes/preferences'));
app.use('/api/templates', require('./routes/templates'));
app.use('/api/devices', require('./routes/devices'));

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Exprsn Herald',
    version: '1.0.0',
    description: 'Notifications & Alerts Service',
    status: 'running',
    endpoints: {
      health: '/health',
      notifications: '/api/notifications',
      preferences: '/api/preferences',
      templates: '/api/templates'
    },
    features: config.features
  });
});

// Socket.IO connection handling
io.use(socketAuth);

io.on('connection', (socket) => {
  const userId = socket.user.id;

  logger.info('Client connected', {
    socketId: socket.id,
    userId
  });

  // Auto-subscribe user to their notification channel
  socket.join(`user:${userId}`);
  logger.info(`User ${userId} subscribed to notifications`);

  // Handle manual subscribe (optional, already auto-subscribed)
  socket.on('subscribe', (subscribeUserId) => {
    // Only allow subscribing to own user ID
    if (subscribeUserId === userId) {
      socket.join(`user:${subscribeUserId}`);
      logger.info(`User ${subscribeUserId} manually subscribed`);
      socket.emit('subscribed', { userId: subscribeUserId });
    } else {
      socket.emit('error', { message: 'Cannot subscribe to other users' });
    }
  });

  // Handle unsubscribe
  socket.on('unsubscribe', () => {
    socket.leave(`user:${userId}`);
    logger.info(`User ${userId} unsubscribed from notifications`);
    socket.emit('unsubscribed', { userId });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    logger.info('Client disconnected', {
      socketId: socket.id,
      userId
    });
  });
});

// Attach io to app for route access
app.set('io', io);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path
  });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Application error', {
    error: err.message,
    stack: err.stack,
    path: req.path
  });

  res.status(500).json({
    error: 'Internal server error',
    message: config.env === 'development' ? err.message : undefined
  });
});

// Initialize database and start server
async function start() {
  try {
    // Test database connection
    logger.info('Connecting to database...');
    await sequelize.authenticate();
    logger.info('Database connected successfully');

    // Sync database models (create tables if they don't exist)
    if (config.env === 'development') {
      logger.info('Syncing database models...');
      await sequelize.sync({ alter: false });
      logger.info('Database models synced');
    }

    // Initialize job queues
    logger.info('Initializing job queues...');
    require('./jobs');
    logger.info('Job queues initialized');

    // Start server
    const port = config.port;
    server.listen(port, () => {
      logger.info(`Exprsn Herald started on port ${port}`, {
        env: config.env,
        port,
        features: config.features,
        healthCheck: `http://localhost:${port}/health`
      });
    });
  } catch (error) {
    logger.error('Failed to start server', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');

  server.close(async () => {
    logger.info('HTTP server closed');

    try {
      await sequelize.close();
      logger.info('Database connection closed');
    } catch (error) {
      logger.error('Error closing database', { error: error.message });
    }

    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');

  server.close(async () => {
    logger.info('HTTP server closed');

    try {
      await sequelize.close();
      logger.info('Database connection closed');
    } catch (error) {
      logger.error('Error closing database', { error: error.message });
    }

    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', {
    reason,
    promise
  });
});

// Start the server
start();

module.exports = { app, io, server };
