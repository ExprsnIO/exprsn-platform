/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn FileVault - Main Application
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const https = require('https');
const http = require('http');
const fs = require('fs');
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
// View Engine Setup
// ───────────────────────────────────────────────────────────────────────

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use('/static', express.static(path.join(__dirname, 'public')));

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

// Dashboard routes
app.get('/', (req, res) => {
  res.render('dashboard/index', {
    title: 'FileVault Dashboard',
    user: req.user || null
  });
});

app.get('/dashboard', (req, res) => {
  res.render('dashboard/index', {
    title: 'FileVault Dashboard',
    user: req.user || null
  });
});

// API routes
app.use('/api', require('./routes'));

// WebDAV routes (separate from API routes)
app.use('/webdav', require('./routes/webdav'));

// ───────────────────────────────────────────────────────────────────────
// Error Handling
// ───────────────────────────────────────────────────────────────────────

app.use(notFoundHandler);
app.use(errorHandler);

// ═══════════════════════════════════════════════════════════════════════
// Application Initialization
// ═══════════════════════════════════════════════════════════════════════

async function initialize() {
  try {
    logger.info('Initializing Exprsn FileVault...');

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

    logger.info('Exprsn FileVault initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize application:', error);
    process.exit(1);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Start Server
// ═══════════════════════════════════════════════════════════════════════

async function start() {
  await initialize();

  const servers = [];

  // TLS/HTTPS Configuration
  const tlsEnabled = process.env.TLS_ENABLED !== 'false'; // Enabled by default
  const httpsPort = parseInt(process.env.HTTPS_PORT || '3443');
  const httpPort = parseInt(config.app.port);

  // Start HTTPS server if TLS is enabled
  if (tlsEnabled) {
    try {
      const certPath = process.env.TLS_CERT_PATH || path.join(__dirname, '../ssl/cert.pem');
      const keyPath = process.env.TLS_KEY_PATH || path.join(__dirname, '../ssl/key.pem');

      // Check if certificates exist
      if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
        const httpsOptions = {
          key: fs.readFileSync(keyPath),
          cert: fs.readFileSync(certPath)
        };

        const httpsServer = https.createServer(httpsOptions, app);
        httpsServer.listen(httpsPort, config.app.host, () => {
          logger.info(`Exprsn FileVault (HTTPS) running on https://${config.app.host}:${httpsPort}`);
          logger.info(`Environment: ${config.app.env}`);
          logger.info(`Storage backends: ${Object.keys(storage).join(', ')}`);
        });

        servers.push(httpsServer);

        // HTTP to HTTPS redirect server
        const redirectApp = express();
        redirectApp.use((req, res) => {
          const httpsUrl = `https://${req.hostname}:${httpsPort}${req.url}`;
          logger.info(`Redirecting HTTP -> HTTPS: ${req.url}`);
          res.redirect(301, httpsUrl);
        });

        const httpServer = http.createServer(redirectApp);
        httpServer.listen(httpPort, config.app.host, () => {
          logger.info(`HTTP redirect server running on http://${config.app.host}:${httpPort} -> HTTPS:${httpsPort}`);
        });

        servers.push(httpServer);
      } else {
        logger.warn('TLS certificates not found, falling back to HTTP only');
        logger.warn(`Expected cert: ${certPath}`);
        logger.warn(`Expected key: ${keyPath}`);

        const httpServer = http.createServer(app);
        httpServer.listen(httpPort, config.app.host, () => {
          logger.info(`Exprsn FileVault (HTTP) running on http://${config.app.host}:${httpPort}`);
          logger.info(`Environment: ${config.app.env}`);
          logger.info(`Storage backends: ${Object.keys(storage).join(', ')}`);
        });

        servers.push(httpServer);
      }
    } catch (error) {
      logger.error('Failed to start HTTPS server, falling back to HTTP:', error);

      const httpServer = http.createServer(app);
      httpServer.listen(httpPort, config.app.host, () => {
        logger.info(`Exprsn FileVault (HTTP) running on http://${config.app.host}:${httpPort}`);
        logger.info(`Environment: ${config.app.env}`);
        logger.info(`Storage backends: ${Object.keys(storage).join(', ')}`);
      });

      servers.push(httpServer);
    }
  } else {
    // TLS disabled - HTTP only
    const httpServer = http.createServer(app);
    httpServer.listen(httpPort, config.app.host, () => {
      logger.info(`Exprsn FileVault (HTTP) running on http://${config.app.host}:${httpPort}`);
      logger.info(`Environment: ${config.app.env}`);
      logger.info(`TLS: disabled`);
      logger.info(`Storage backends: ${Object.keys(storage).join(', ')}`);
    });

    servers.push(httpServer);
  }

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully...');

    // Close all servers
    await Promise.all(servers.map(server => new Promise((resolve) => {
      server.close(() => resolve());
    })));

    await db.sequelize.close();
    logger.info('Server shut down successfully');
    process.exit(0);
  });

  return servers;
}

// Start if not required as module
if (require.main === module) {
  start().catch(error => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });
}

module.exports = app;
module.exports.start = start;
