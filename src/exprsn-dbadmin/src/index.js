require('dotenv').config();
const express = require('express');
const http = require('http');
const https = require('https');
const socketIO = require('socket.io');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const { logger, errorHandler } = require('@exprsn/shared');
const db = require('./models');
const routes = require('./routes');
const socketHandlers = require('./sockets');
const { getTLSOptions, getCertificateInfo } = require('./utils/tls');

const app = express();
const PORT = process.env.PORT || 3018;
const NODE_ENV = process.env.NODE_ENV || 'development';
const FORCE_HTTP = process.env.FORCE_HTTP === 'true';

// Determine if we should use TLS
let server;
let io;
let isSecure = false;
let httpsServer = null;
let httpFallbackServer = null;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "cdn.jsdelivr.net", "cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net", "cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "cdn.jsdelivr.net", "cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      workerSrc: ["'self'", "blob:", "cdnjs.cloudflare.com"],
      upgradeInsecureRequests: isSecure ? [] : null
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// CORS
app.use(cors());

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Request logging
app.use((req, res, next) => {
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    secure: req.secure,
    protocol: req.protocol,
    userAgent: req.get('user-agent')
  });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  const certInfo = getCertificateInfo();

  res.json({
    status: 'healthy',
    service: 'exprsn-dbadmin',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: NODE_ENV,
    tls: {
      enabled: isSecure,
      protocol: req.secure ? 'https' : 'http',
      ...(certInfo && {
        certificate: {
          subject: certInfo.subject,
          issuer: certInfo.issuer
        }
      })
    }
  });
});

// TLS information endpoint
app.get('/api/tls/info', (req, res) => {
  const certInfo = getCertificateInfo();

  res.json({
    success: true,
    data: {
      enabled: isSecure,
      protocol: req.secure ? 'https' : 'http',
      certificate: certInfo || null,
      supportedProtocols: ['TLSv1.2', 'TLSv1.3']
    }
  });
});

// API routes
app.use('/api', routes);

// Root route - render main UI
app.get('/', (req, res) => {
  res.render('index', {
    title: 'Exprsn DB Admin',
    version: '1.0.0'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'NOT_FOUND',
    message: 'The requested resource was not found'
  });
});

// Error handler (must be last)
app.use(errorHandler);

/**
 * Create and configure servers
 */
function createServers() {
  if (FORCE_HTTP) {
    logger.info('TLS disabled via FORCE_HTTP environment variable');
    server = http.createServer(app);
    isSecure = false;
    return;
  }

  // Try to get TLS options
  const tlsOptions = getTLSOptions();

  if (tlsOptions) {
    try {
      // Create HTTPS server
      httpsServer = https.createServer(tlsOptions, app);
      server = httpsServer;
      isSecure = true;

      const certInfo = getCertificateInfo();
      logger.info('HTTPS server created with TLS enabled', {
        minVersion: tlsOptions.minVersion,
        maxVersion: tlsOptions.maxVersion,
        certificate: certInfo ? {
          subject: certInfo.subject,
          issuer: certInfo.issuer
        } : 'self-signed'
      });

      // Also create HTTP redirect server (optional)
      if (process.env.HTTP_REDIRECT === 'true') {
        const redirectPort = parseInt(process.env.HTTP_REDIRECT_PORT || '3080');
        const redirectApp = express();

        redirectApp.use((req, res) => {
          const httpsUrl = `https://${req.hostname}:${PORT}${req.url}`;
          logger.info('Redirecting HTTP to HTTPS', { from: req.url, to: httpsUrl });
          res.redirect(301, httpsUrl);
        });

        httpFallbackServer = http.createServer(redirectApp);
        httpFallbackServer.listen(redirectPort, () => {
          logger.info(`HTTP redirect server listening on port ${redirectPort} (redirects to HTTPS ${PORT})`);
        });
      }

    } catch (error) {
      logger.error('Failed to create HTTPS server, falling back to HTTP', {
        error: error.message
      });
      server = http.createServer(app);
      isSecure = false;
    }
  } else {
    logger.warn('TLS options not available, using HTTP server as fallback');
    server = http.createServer(app);
    isSecure = false;
  }

  // Create Socket.IO instance
  io = socketIO(server, {
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST']
    },
    transports: ['websocket', 'polling'],
    secure: isSecure
  });

  // Make io accessible in routes
  app.set('io', io);

  // Socket.IO connection handling
  socketHandlers(io);
}

// Database connection and server startup
async function startServer() {
  try {
    // Test database connection
    await db.sequelize.authenticate();
    logger.info('Database connection established successfully');

    // Sync models (create tables if they don't exist)
    if (NODE_ENV === 'development') {
      await db.sequelize.sync({ alter: false });
      logger.info('Database models synchronized');
    }

    // Create servers (HTTPS with HTTP fallback)
    createServers();

    // Start server
    server.listen(PORT, () => {
      const protocol = isSecure ? 'https' : 'http';
      const url = `${protocol}://localhost:${PORT}`;

      logger.info(`Exprsn DB Admin service started`, {
        port: PORT,
        protocol,
        url,
        environment: NODE_ENV,
        processId: process.pid,
        tls: {
          enabled: isSecure,
          version: isSecure ? 'TLSv1.2/TLSv1.3' : 'N/A'
        }
      });

      // Log access instructions
      console.log('\n' + '='.repeat(60));
      console.log('🔐 Exprsn DB Admin - TLS Enabled');
      console.log('='.repeat(60));
      console.log(`\n📍 URL: ${url}`);
      console.log(`🔒 Protocol: ${protocol.toUpperCase()}`);
      console.log(`🌍 Environment: ${NODE_ENV}`);

      if (isSecure) {
        console.log(`\n⚠️  Using self-signed certificate for localhost`);
        console.log(`   Your browser may show a security warning - this is expected.`);
        console.log(`   Click "Advanced" and "Proceed" to continue.\n`);

        if (process.env.TLS_CERT_PATH) {
          console.log(`📜 Certificate: ${process.env.TLS_CERT_PATH}`);
        } else {
          const { CERT_PATH } = require('./utils/tls');
          console.log(`📜 Certificate: ${CERT_PATH}`);
        }
      } else {
        console.log(`\n⚠️  Running in HTTP mode (TLS disabled)`);
        console.log(`   For production, enable TLS in .env\n`);
      }

      console.log('='.repeat(60) + '\n');
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
  logger.info('SIGTERM received, shutting down gracefully');

  server.close(async () => {
    if (httpFallbackServer) {
      httpFallbackServer.close();
    }
    await db.sequelize.close();
    logger.info('Server closed');
    process.exit(0);
  });

  // Force close after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');

  server.close(async () => {
    if (httpFallbackServer) {
      httpFallbackServer.close();
    }
    await db.sequelize.close();
    logger.info('Server closed');
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

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', {
    reason,
    promise
  });
});

// Start the server
startServer();

module.exports = { app, server, io };
