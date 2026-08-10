/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Gallery Service - Main Application
 * Version: 1.0.0
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const config = require('./config');
const logger = require('./utils/logger');
const { testConnection } = require('./config/database');

// Import routes
const albumRoutes = require('./routes/albums');
const mediaRoutes = require('./routes/media');
const timelineRoutes = require('./routes/timeline');
const healthRoutes = require('./routes/health');
const shareLinksRoutes = require('./routes/shareLinks');
const contributorsRoutes = require('./routes/contributors');
const processingRoutes = require('./routes/processing');
const configRoutes = require('./routes/config');

// Create Express app
const app = express();

// ═══════════════════════════════════════════════════════════════════════
// Middleware
// ═══════════════════════════════════════════════════════════════════════

// Security headers
app.use(helmet());

// CORS
if (config.cors.enabled) {
  app.use(cors({
    origin: config.cors.origin,
    credentials: config.cors.credentials
  }));
}

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression
app.use(compression());

// Request logging
app.use(logger.requestLogger);

// Static files (for thumbnails, etc.)
app.use('/thumbnails', express.static(path.join(config.media.localStoragePath, 'thumbnails')));

// ═══════════════════════════════════════════════════════════════════════
// Routes
// ═══════════════════════════════════════════════════════════════════════

// Health check
app.use('/health', healthRoutes);

// API routes
app.use('/api/config', configRoutes);
app.use('/api/albums', albumRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/timeline', timelineRoutes);
app.use('/api/share', shareLinksRoutes);
app.use('/api/processing', processingRoutes);
app.use('/api', contributorsRoutes);

// WebDAV routes (separate from API routes)
app.use('/webdav', require('./routes/webdav'));

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Exprsn Gallery',
    version: '1.0.0',
    description: 'Versioned and Tokenized Media Galleries',
    endpoints: {
      health: '/health',
      albums: '/api/albums',
      media: '/api/media',
      timeline: '/api/timeline'
    },
    documentation: 'https://github.com/ExprsnIO/Exprsn'
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Error Handling
// ═══════════════════════════════════════════════════════════════════════

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: 'Endpoint not found',
    path: req.path
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    path: req.path
  });

  res.status(err.status || 500).json({
    error: err.name || 'INTERNAL_ERROR',
    message: config.service.env === 'production'
      ? 'An error occurred'
      : err.message,
    ...(config.service.env !== 'production' && { stack: err.stack })
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Server Startup
// ═══════════════════════════════════════════════════════════════════════

async function startServer() {
  try {
    // Test database connection
    logger.info('Testing database connection...');
    const dbConnected = await testConnection();

    if (!dbConnected) {
      logger.error('Database connection failed. Exiting...');
      process.exit(1);
    }

    // Create required directories
    const fs = require('fs').promises;
    const dirs = [
      config.media.localStoragePath,
      path.join(config.media.localStoragePath, 'media'),
      path.join(config.media.localStoragePath, 'thumbnails'),
      config.upload.tempDir,
      config.logging.dir
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }

    logger.info('Required directories created/verified');

    // Start server
    const port = config.service.port;
    const host = config.service.host;

    app.listen(port, host, () => {
      logger.info(`Gallery service started`, {
        port,
        host,
        env: config.service.env,
        pid: process.pid
      });

      logger.info('Service configuration:', {
        database: `${config.database.host}:${config.database.port}/${config.database.database}`,
        redis: config.redis.enabled ? `${config.redis.host}:${config.redis.port}` : 'disabled',
        storage: config.media.storageBackend,
        timeline: config.timeline.enabled ? config.timeline.serviceUrl : 'disabled',
        filevault: config.filevault.enabled ? config.filevault.serviceUrl : 'disabled'
      });
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Process Handlers
// ═══════════════════════════════════════════════════════════════════════

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection:', {
    reason,
    promise
  });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Start the server
if (require.main === module) {
  startServer();
}

module.exports = app;
