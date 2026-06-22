/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn FileVault - Platform Module
 * ═══════════════════════════════════════════════════════════════════════
 * In-process module mounted behind the unified platform gateway.
 * Exports { name, app, init }. The gateway owns TLS, the HTTP→HTTPS
 * redirect, and the network listener — this module never listens.
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const config = require('./config');
const logger = require('./utils/logger');
const db = require('./models');
const storage = require('./storage');
const { errorHandler, notFoundHandler } = require('./middleware');

// ═══════════════════════════════════════════════════════════════════════
// Initialize Express Application
// ═══════════════════════════════════════════════════════════════════════

const app = express();

// ───────────────────────────────────────────────────────────────────────
// Middleware
// ───────────────────────────────────────────────────────────────────────

// Security
const isProduction = config.app.env === 'production';
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'"],
      // Only upgrade in production
      ...(isProduction && { upgradeInsecureRequests: [] })
    }
  },
  hsts: {
    maxAge: isProduction ? 31536000 : 0,
    includeSubDomains: true,
    preload: true
  }
}));

// CORS
app.use(cors({
  origin: config.app.corsOrigins,
  credentials: true
}));

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// Request ID
app.use((req, res, next) => {
  req.id = require('uuid').v4();
  next();
});

// ───────────────────────────────────────────────────────────────────────
// Routes
// ───────────────────────────────────────────────────────────────────────

// API routes
app.use('/api', require('./routes'));

// WebDAV routes (protocol API, separate from API routes)
app.use('/webdav', require('./routes/webdav'));

// ───────────────────────────────────────────────────────────────────────
// Error Handling
// ───────────────────────────────────────────────────────────────────────

app.use(notFoundHandler);
app.use(errorHandler);

// ═══════════════════════════════════════════════════════════════════════
// Module Initialization
// ═══════════════════════════════════════════════════════════════════════
// Pre-listen async setup (db, storage backends, etc.). Invoked by the
// platform gateway. NEVER creates a server or listens.

async function init(ctx) {
  logger.info('Initializing Exprsn FileVault module...');

  // Initialize database
  logger.info('Connecting to database...');
  await db.sequelize.authenticate();
  logger.info('Database connected successfully');

  // Sync database models (use migrations in production)
  if (config.app.env === 'development') {
    try {
      await db.sequelize.sync({ force: false, alter: false });
      logger.info('Database models synchronized');
    } catch (syncError) {
      logger.warn('Database sync encountered issues, tables may already exist', {
        error: syncError.message
      });
      // Continue anyway - models can still work with existing tables
    }
  }

  // Initialize storage backends
  logger.info('Initializing storage backends...');
  await storage.initializeStorage();
  logger.info('Storage backends initialized successfully');

  logger.info('Exprsn FileVault module initialized successfully');
}

module.exports = {
  name: 'filevault',
  app,
  init
};
