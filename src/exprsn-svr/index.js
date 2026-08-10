/**
 * ═══════════════════════════════════════════════════════════
 * Exprsn-SVR - Dynamic HTML Page Server
 * Main application entry point
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const { Server } = require('socket.io');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

const config = require('./config');
const logger = require('./utils/logger');
const { testConnection } = require('./config/database');

// Import middleware
const { errorHandler } = require('./middleware/errorHandler');
const { rateLimiter } = require('./middleware/rateLimiter');

// Import routes
const pageRoutes = require('./routes/pages');
const editorRoutes = require('./routes/editor');
const apiRoutes = require('./routes/api');
const templateRoutes = require('./routes/templates');
const componentRoutes = require('./routes/components');
const assetRoutes = require('./routes/assets');
const analyticsRoutes = require('./routes/analytics');
const markdownRoutes = require('./routes/markdown');
const pluginRoutes = require('./routes/plugins');
const decisionTableRoutes = require('./routes/decisionTables');

// Import Low-Code Platform
const lowcodeRouter = require('./lowcode/index');
const { configureLowCodeViews } = require('./lowcode/index');

// Import Workflow Module
const workflowRouter = require('./workflow/index');
const {
  configureWorkflowViews,
  initializeWorkflowSocketIO,
  initializeWorkflowScheduler,
  shutdownWorkflowServices
} = require('./workflow/index');

// Import Forge Business Platform
const forgeRouter = require('./routes/forge/index');

// Import socket handlers
const socketHandlers = require('./sockets');

/**
 * Initialize Express application
 */
function createApp() {
  const app = express();

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "blob:"],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        connectSrc: ["'self'", "ws:", "wss:", "http://localhost:5001", "ws://localhost:5001", "https://localhost:5001", "wss://localhost:5001"],
        fontSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com", "data:"],
        workerSrc: ["'self'", "blob:"],
        childSrc: ["'self'", "blob:"],
        objectSrc: ["'none'"],
        frameSrc: ["'self'"]
      }
    },
    hsts: false, // Disable HSTS in development to avoid TLS issues
    crossOriginEmbedderPolicy: false // Allow loading external resources
  }));

  // CORS
  app.use(cors({
    origin: config.security.allowedOrigins.length > 0
      ? config.security.allowedOrigins
      : '*',
    credentials: true
  }));

  // Compression
  app.use(compression());

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // Request logging
  if (config.env === 'development') {
    app.use(morgan('dev'));
  } else {
    app.use(morgan('combined', {
      stream: {
        write: (message) => logger.info(message.trim())
      }
    }));
  }

  // Static files
  app.use('/static', express.static(path.join(__dirname, 'public')));
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
  app.use('/lowcode/static', express.static(path.join(__dirname, 'lowcode/public')));

  // Note: DO NOT serve public at root level here - it conflicts with the explicit '/' route
  // The '/' route handler will serve public/index.html explicitly

  // Serve shared assets (CSS, JS, etc.) from exprsn-shared
  const sharedPublicDir = path.join(__dirname, '../shared/public');
  app.use('/shared', express.static(sharedPublicDir));

  // Serve Exprsn theme from root-level theme directory
  const themeDir = path.join(__dirname, '../../theme');
  app.use('/theme', express.static(themeDir));

  // Also serve public directory files directly for /css and /js paths
  app.use('/css', express.static(path.join(__dirname, 'public/css')));
  app.use('/js', express.static(path.join(__dirname, 'public/js')));

  // Serve Exprsn Kicks from root node_modules (monorepo)
  app.use('/node_modules/exprsn-kicks', express.static(path.join(__dirname, '../../node_modules/exprsn-kicks')));

  // View engine
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  // Configure Low-Code Platform views
  configureLowCodeViews(app);

  // Configure Workflow Module views
  configureWorkflowViews(app);

  // Rate limiting
  app.use('/api', rateLimiter);

  // Health check
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      service: config.serviceName,
      timestamp: new Date().toISOString()
    });
  });

  // Mount routes
  app.use('/pages', pageRoutes);
  app.use('/editor', editorRoutes);
  app.use('/api', apiRoutes);
  app.use('/api/templates', templateRoutes);
  app.use('/api/components', componentRoutes);
  app.use('/api/assets', assetRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/markdown', markdownRoutes);
  app.use('/api/config', require('./routes/config'));
  app.use('/api/plugins', pluginRoutes);
  app.use('/api/decision-tables', decisionTableRoutes);

  // Mount Setup & Configuration (V2 - Enhanced Admin Dashboard)
  app.use('/setup', require('./routes/setup-v2'));

  // Override CSP for Low-Code Platform to allow inline event handlers
  app.use('/lowcode', (req, res, next) => {
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com blob:; " +
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.googleapis.com; " +
      "img-src 'self' data: https: blob:; " +
      "font-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.gstatic.com data:; " +
      "connect-src 'self' ws: wss: http://localhost:5001 ws://localhost:5001 https://localhost:5001 wss://localhost:5001; " +
      "worker-src 'self' blob:; " +
      "child-src 'self' blob:; " +
      "object-src 'none'; " +
      "frame-src 'self'"
    );
    next();
  });

  // Mount Low-Code Platform
  app.use('/lowcode', lowcodeRouter);

  // Mount Workflow Module
  app.use('/workflow', workflowRouter);

  // Override CSP for Forge to allow inline event handlers
  app.use('/forge', (req, res, next) => {
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://d3js.org blob:; " +
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.googleapis.com; " +
      "img-src 'self' data: https: blob:; " +
      "font-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.gstatic.com data:; " +
      "connect-src 'self' ws: wss: http://localhost:5001 ws://localhost:5001 https://localhost:5001 wss://localhost:5001 http://localhost:5443 https://localhost:5443 wss://localhost:5443; " +
      "worker-src 'self' blob:; " +
      "child-src 'self' blob:; " +
      "object-src 'none'; " +
      "frame-src 'self'"
    );
    next();
  });

  // Mount Forge Business Platform (CRM, ERP, Groupware)
  app.use('/forge', forgeRouter);

  // Override CSP for Git Setup to allow inline event handlers
  app.use('/git', (req, res, next) => {
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com blob:; " +
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.googleapis.com; " +
      "img-src 'self' data: https: blob:; " +
      "font-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.gstatic.com data:; " +
      "connect-src 'self' ws: wss: http://localhost:5001 ws://localhost:5001 https://localhost:5001 wss://localhost:5001; " +
      "worker-src 'self' blob:; " +
      "child-src 'self' blob:; " +
      "object-src 'none'; " +
      "frame-src 'self'"
    );
    next();
  });

  // Git Setup & Configuration Routes
  // Redirect to working lowcode git dashboard
  app.get('/git', (req, res) => {
    res.redirect('/lowcode/git/dashboard');
  });

  app.get('/git/dashboard', (req, res) => {
    res.redirect('/lowcode/git/dashboard');
  });

  app.get('/git/setup/config', (req, res) => {
    res.render('git-setup-config', {
      title: 'System Configuration - Git Setup',
      currentPath: req.path,
      user: req.user || null
    });
  });

  app.get('/git/auth', (req, res) => {
    res.render('git-auth-manager', {
      title: 'Authentication Management - Git Setup',
      currentPath: req.path,
      user: req.user || null
    });
  });

  app.get('/git/policies', (req, res) => {
    res.render('git-policy-manager', {
      title: 'Repository Policies - Git Setup',
      currentPath: req.path,
      user: req.user || null
    });
  });

  app.get('/git/runners', (req, res) => {
    res.render('git-runner-dashboard', {
      title: 'CI/CD Runners - Git Setup',
      currentPath: req.path,
      user: req.user || null
    });
  });

  app.get('/git/security', (req, res) => {
    res.render('git-security-dashboard', {
      title: 'Security Scanning - Git Setup',
      currentPath: req.path,
      user: req.user || null
    });
  });

  app.get('/git/environments', (req, res) => {
    res.render('git-environment-manager', {
      title: 'Deployment Environments - Git Setup',
      currentPath: req.path,
      user: req.user || null
    });
  });

  // Root route - Serve Application Picker
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  // Error handling
  app.use(errorHandler);

  return app;
}

/**
 * Initialize Socket.IO server
 */
function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    path: config.socketIO.path,
    cors: {
      origin: config.socketIO.corsOrigins.length > 0
        ? config.socketIO.corsOrigins
        : '*',
      credentials: true
    }
  });

  // Configure Redis adapter for horizontal scaling
  if (config.redis.enabled) {
    try {
      const { createAdapter } = require('@socket.io/redis-adapter');
      const { createClient } = require('redis');

      const pubClient = createClient({
        socket: {
          host: config.redis.host,
          port: config.redis.port
        },
        password: config.redis.password
      });

      const subClient = pubClient.duplicate();

      Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
        io.adapter(createAdapter(pubClient, subClient));
        logger.info('Socket.IO Redis adapter configured for horizontal scaling');
      }).catch(err => {
        logger.error('Failed to connect Redis adapter:', err);
      });
    } catch (error) {
      logger.warn('Redis adapter not available, Socket.IO will run in single-instance mode');
    }
  }

  // Initialize socket handlers
  socketHandlers(io);

  logger.info('Socket.IO server initialized');
  return io;
}

/**
 * Start the server
 */
async function startServer() {
  try {
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      logger.error('Failed to connect to database. Exiting...');
      process.exit(1);
    }

    // Initialize Low-Code Platform models
    try {
      const lowcodeModels = require('./lowcode/models');
      await lowcodeModels.Application.sync({ alter: false });
      await lowcodeModels.Entity.sync({ alter: false });
      await lowcodeModels.AppForm.sync({ alter: false });
      await lowcodeModels.Grid.sync({ alter: false });
      await lowcodeModels.DataSource.sync({ alter: false });
      logger.info('Low-Code Platform models synchronized');
    } catch (error) {
      logger.warn('Failed to sync Low-Code models:', error.message);
    }

    // Initialize Plugin Manager
    try {
      const pluginManager = require('./services/pluginManager');
      await pluginManager.initialize();
      logger.info('Plugin Manager initialized');
    } catch (error) {
      logger.warn('Failed to initialize Plugin Manager:', error.message);
    }

    // Create Express app
    const app = createApp();

    // Import TLS configuration
    const tlsConfig = require('../shared/tls-config');

    // Configure HTTPS with HTTP redirect (like other Exprsn services)
    let httpsServer;
    let httpServer;
    let protocol = 'http';
    const httpsPort = 5443; // HTTPS port for exprsn-svr

    if (tlsConfig.isTLSEnabled()) {
      try {
        // Create HTTPS server
        httpsServer = tlsConfig.createHTTPSServer(app);
        protocol = 'https';
        logger.info('TLS enabled - starting HTTPS server');

        // Create HTTP redirect server
        const redirectApp = express();
        redirectApp.use((req, res) => {
          const httpsUrl = `https://${req.hostname}:${httpsPort}${req.url}`;
          logger.info(`Redirecting HTTP -> HTTPS: ${req.url}`);
          res.redirect(301, httpsUrl);
        });
        httpServer = http.createServer(redirectApp);

      } catch (error) {
        logger.warn('Failed to create HTTPS server, falling back to HTTP:', error.message);
        httpServer = http.createServer(app);
        httpsServer = null;
      }
    } else {
      httpServer = http.createServer(app);
      httpsServer = null;
    }

    // Use HTTPS server for Socket.IO if available, otherwise HTTP
    const socketServer = httpsServer || httpServer;

    // Initialize Socket.IO if enabled
    let io;
    if (config.socketIO.enabled) {
      io = createSocketServer(socketServer);

      // Attach io to app for access in routes
      app.set('io', io);

      // Initialize Workflow Socket.IO handlers
      initializeWorkflowSocketIO(io);
    }

    // Initialize Workflow Scheduler
    await initializeWorkflowScheduler();

    // Initialize Hot Reload System (development only)
    if (config.env === 'development') {
      const hotReload = require('./utils/hotReload');
      hotReload.initialize(app, io);
      logger.info('Hot reload system enabled');
    }

    // Start HTTPS server if enabled
    if (httpsServer) {
      httpsServer.listen(httpsPort, () => {
        logger.info(`${config.serviceName} HTTPS started on port ${httpsPort}`);
        logger.info(`Protocol: ${protocol}`);
        logger.info(`Environment: ${config.env}`);
        logger.info(`Socket.IO: ${config.socketIO.enabled ? 'enabled' : 'disabled'}`);
        logger.info(`Hot Reload: ${config.env === 'development' ? 'enabled' : 'disabled'}`);
        logger.info(`HTTPS URL: https://localhost:${httpsPort}/`);
      });

      // Start HTTP redirect server
      httpServer.listen(config.port, () => {
        logger.info(`HTTP redirect server started on port ${config.port} -> HTTPS:${httpsPort}`);
      });
    } else {
      // HTTP only mode
      httpServer.listen(config.port, () => {
        logger.info(`${config.serviceName} started on port ${config.port}`);
        logger.info(`Protocol: ${protocol}`);
        logger.info(`Environment: ${config.env}`);
        logger.info(`Socket.IO: ${config.socketIO.enabled ? 'enabled' : 'disabled'}`);
        logger.info(`Hot Reload: ${config.env === 'development' ? 'enabled' : 'disabled'}`);
      });
    }

    // Graceful shutdown
    const gracefulShutdown = () => {
      // Shutdown hot reload
      if (config.env === 'development') {
        const hotReload = require('./utils/hotReload');
        hotReload.shutdown();
      }

      shutdownWorkflowServices();

      // Close both HTTP and HTTPS servers if they exist
      let serversToClose = 0;
      let serversClosed = 0;

      const checkAllClosed = () => {
        serversClosed++;
        if (serversClosed === serversToClose) {
          logger.info('All servers closed');
          process.exit(0);
        }
      };

      if (httpsServer) {
        serversToClose++;
        httpsServer.close(checkAllClosed);
      }

      if (httpServer) {
        serversToClose++;
        httpServer.close(checkAllClosed);
      }

      if (serversToClose === 0) {
        process.exit(0);
      }
    };

    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully...');
      gracefulShutdown();
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT received, shutting down gracefully...');
      gracefulShutdown();
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start server if this file is run directly
if (require.main === module) {
  startServer();
}

module.exports = { createApp, createSocketServer, startServer };
