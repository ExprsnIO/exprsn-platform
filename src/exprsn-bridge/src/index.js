/**
 * Exprsn Bridge - Service Integration & API Gateway
 *
 * This service acts as an API gateway and service mesh for the Exprsn ecosystem,
 * routing requests to appropriate microservices and handling cross-service communication.
 *
 * Supports JSON Lexicon Specification v1.0 for declarative routing.
 */

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const rateLimit = require('express-rate-limit');
const http = require('http');
const socketIO = require('socket.io');
const config = require('./config');
const logger = require('./config/logger');
const LexiconLoader = require('./lexicon/loader');
const { applyLexicon } = require('./middleware/lexicon');
const { HTTPSServerManager } = require('../../shared/utils/httpsServer');
const { bypassAll, logBypassStatus } = require('../../shared/middleware/devBypass');

const app = express();

// Log bypass status on startup
logBypassStatus();

// Create HTTP server for Socket.IO
const httpServer = http.createServer(app);

// Initialize Socket.IO
const io = socketIO(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling']
});

// Initialize IPC Router
const IPCRouter = require('./ipc/IPCRouter');
let ipcRouter;

// Wait for Socket.IO to be ready
io.on('connection', (socket) => {
  logger.debug('Socket.IO client connected', { id: socket.id });
});

// Initialize lexicon loader
const lexiconLoader = new LexiconLoader({
  lexiconDir: config.lexiconDir || __dirname + '/config/lexicons',
  watchForChanges: process.env.NODE_ENV !== 'production'
});

// Store lexicon loader in app locals for admin routes
app.locals.lexiconLoader = lexiconLoader;

// Security
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

app.use(express.json());

// Rate limiting (per IP)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' }
});

app.use(limiter);

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, { ip: req.ip });
  next();
});

// Mount admin and discovery routes
const adminRoutes = require('./routes/admin');
const discoveryRoutes = require('./routes/discovery');

app.use('/api/admin', adminRoutes);
app.use('/api/discovery', discoveryRoutes);

// IPC statistics endpoint
app.get('/api/ipc/stats', async (req, res) => {
  try {
    if (!ipcRouter) {
      return res.status(503).json({
        error: 'IPC Router not initialized'
      });
    }

    const stats = await ipcRouter.getStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Failed to get IPC stats', { error: error.message });
    res.status(500).json({
      error: 'Failed to retrieve IPC statistics'
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'exprsn-bridge',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Load and apply lexicons
async function loadLexicons() {
  try {
    logger.info('Loading lexicons...');
    await lexiconLoader.loadAllLexicons();

    const lexicons = lexiconLoader.getAllLexicons();
    logger.info(`Loaded ${lexicons.size} lexicon(s)`);

    // Apply each lexicon to create routes
    for (const [filename, lexicon] of lexicons) {
      try {
        applyLexicon(app, lexicon);
      } catch (error) {
        logger.error(`Failed to apply lexicon ${filename}:`, error);
      }
    }

    // Set up hot-reload listener
    if (process.env.NODE_ENV !== 'production') {
      lexiconLoader.on('lexiconReloaded', (filename) => {
        logger.warn(`Lexicon ${filename} was reloaded but routes are not updated. Restart server to apply changes.`);
      });
    }
  } catch (error) {
    logger.error('Failed to load lexicons:', error);
    // Continue with fallback routes
    setupFallbackRoutes();
  }
}

// Fallback routes if lexicons fail to load
function setupFallbackRoutes() {
  logger.warn('Setting up fallback proxy routes');

  const serviceRoutes = {
    '/api/auth': process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
    '/api/spark': process.env.SPARK_SERVICE_URL || 'http://localhost:3002',
    '/api/timeline': process.env.TIMELINE_SERVICE_URL || 'http://localhost:3004',
    '/api/prefetch': process.env.PREFETCH_SERVICE_URL || 'http://localhost:3005',
    '/api/moderator': process.env.MODERATOR_SERVICE_URL || 'http://localhost:3006',
    '/api/filevault': process.env.FILEVAULT_SERVICE_URL || 'http://localhost:3007',
    '/api/gallery': process.env.GALLERY_SERVICE_URL || 'http://localhost:3008',
    '/api/live': process.env.LIVE_SERVICE_URL || 'http://localhost:3009'
  };

  Object.entries(serviceRoutes).forEach(([path, target]) => {
    app.use(path, createProxyMiddleware({
      target,
      changeOrigin: true,
      pathRewrite: { [`^${path}`]: '/api' },
      onProxyReq: (proxyReq, req, res) => {
        if (req.headers.authorization) {
          proxyReq.setHeader('Authorization', req.headers.authorization);
        }
        proxyReq.setHeader('X-Forwarded-For', req.ip);
        proxyReq.setHeader('X-Forwarded-Proto', req.protocol);
        proxyReq.setHeader('X-Forwarded-Host', req.get('host'));
      },
      onError: (err, req, res) => {
        logger.error(`Proxy error for ${path}:`, err);
        res.status(502).json({ error: 'Service unavailable' });
      }
    }));
  });
}

// Root endpoint
app.get('/', (req, res) => {
  const lexicons = lexiconLoader.getAllLexicons();
  const routes = lexiconLoader.getAllRoutes();

  res.json({
    service: 'Exprsn Bridge',
    version: '1.0.0',
    description: 'Service Integration & API Gateway with JSON Lexicon Support',
    lexicons: Array.from(lexicons.values()).map(l => ({
      name: l.lexicon.service.name,
      version: l.lexicon.service.version,
      description: l.lexicon.service.description,
      routes: l.lexicon.routes.length
    })),
    totalRoutes: routes.length,
    features: [
      'Token-based authentication',
      'Permission validation',
      'Request validation',
      'Rate limiting',
      'Hot-reload (development)',
      'JSON Lexicon v1.0'
    ]
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Application error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function startServer() {
  try {
    // Load lexicons first
    await loadLexicons();

    // Initialize IPC Router
    logger.info('Initializing IPC Router...');
    ipcRouter = new IPCRouter(io, {
      serviceName: 'exprsn-bridge'
    });

    // Start HTTPS server
    const serverManager = new HTTPSServerManager({
      serviceName: 'exprsn-bridge',
      port: config.port || 3010,
      httpsPort: config.port || 3010,
      httpPort: process.env.BRIDGE_HTTP_PORT || 8010, // HTTP on 8010 to avoid port conflicts
      enableHTTP: process.env.NODE_ENV !== 'development', // Disable HTTP in dev mode
      redirectHTTP: process.env.NODE_ENV !== 'development' // Disable redirect in dev mode
    });

    const servers = await serverManager.start(app);

    // If HTTPS is enabled, attach Socket.IO to HTTPS server
    if (servers.https) {
      // Transfer Socket.IO to HTTPS server
      const httpsIO = socketIO(servers.https, {
        cors: {
          origin: process.env.CORS_ORIGIN || '*',
          credentials: true,
          methods: ['GET', 'POST']
        },
        transports: ['websocket', 'polling']
      });

      // Re-initialize IPC Router with HTTPS Socket.IO
      ipcRouter = new IPCRouter(httpsIO, {
        serviceName: 'exprsn-bridge'
      });

      logger.info('IPC Router attached to HTTPS server');
    } else {
      // Use HTTP server for Socket.IO
      httpServer.listen(config.port || 3010, () => {
        logger.info(`Exprsn Bridge HTTP listening on port ${config.port || 3010}`);
      });
    }

    logger.info('JSON Lexicon support enabled');
    const lexicons = lexiconLoader.getAllLexicons();
    logger.info(`Active lexicons: ${lexicons.size}`);
    logger.info('IPC Router ready for inter-service communication');

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully...');
      await shutdown();
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down gracefully...');
      await shutdown();
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown handler
async function shutdown() {
  try {
    logger.info('Shutting down Bridge service...');

    // Shutdown IPC Router
    if (ipcRouter) {
      await ipcRouter.shutdown();
    }

    // Close Socket.IO
    if (io) {
      io.close();
    }

    logger.info('Bridge service shut down successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

module.exports = app;
