require('dotenv').config();
const express = require('express');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');
const { testConnection, syncModels } = require('./config/database');

// Initialize app
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
const io = socketIo(server, {
  cors: {
    origin: process.env.SOCKETIO_CORS_ORIGIN || '*',
    methods: ['GET', 'POST']
  },
  path: process.env.SOCKETIO_PATH || '/socket.io'
});

// Make io globally available
global.io = io;

/**
 * ═══════════════════════════════════════════════════════════
 * View Engine Configuration
 * ═══════════════════════════════════════════════════════════
 */

// Set up EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

/**
 * ═══════════════════════════════════════════════════════════
 * Middleware Configuration
 * ═══════════════════════════════════════════════════════════
 */

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://cdn.socket.io"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:", "http:", "https:"],
      upgradeInsecureRequests: null
    }
  },
  hsts: false
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: process.env.CORS_CREDENTIALS === 'true'
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: (parseInt(process.env.RATE_LIMIT_WINDOW, 10) || 15) * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 1000,
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', limiter);

// Serve static files (workflow designer)
app.use(express.static(path.join(__dirname, '../public')));

// Serve Exprsn Kicks static files from root node_modules (monorepo)
app.use('/node_modules/exprsn-kicks', express.static(path.join(__dirname, '../../../node_modules/exprsn-kicks')));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'exprsn-workflow',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API Routes
const workflowRoutes = require('./routes/workflows');
const executionRoutes = require('./routes/executions');
const monitoringRoutes = require('./routes/monitoring');
const approvalsRoutes = require('./routes/approvals');
const auditRoutes = require('./routes/audit');
const retentionRoutes = require('./routes/retention');
const schedulerRoutes = require('./routes/scheduler');
const webhookRoutes = require('./routes/webhooks');
const importExportRoutes = require('./routes/importExport');
const stepRoutes = require('./routes/steps');
const tagRoutes = require('./routes/tags');
const favoriteRoutes = require('./routes/favorites');
const shortcutRoutes = require('./routes/shortcuts');
const templateRoutes = require('./routes/templates');
const viewRoutes = require('./routes/views');

// View routes (server-side rendered pages)
app.use('/', viewRoutes);

app.use('/api/workflows', workflowRoutes);
app.use('/api/executions', executionRoutes);
app.use('/api/monitor', monitoringRoutes);
app.use('/api/executions', approvalsRoutes);
app.use('/api/workflows', executionRoutes); // Also mount execution routes under workflows for /:workflowId/execute
app.use('/api/audit', auditRoutes);
app.use('/api/retention', retentionRoutes);
app.use('/api/scheduler', schedulerRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/workflows', importExportRoutes);
app.use('/api/workflows', stepRoutes);
app.use('/api/workflows', tagRoutes);
app.use('/api/workflows', favoriteRoutes);
app.use('/api/shortcuts', shortcutRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/config', require('./routes/config'));

// Socket.IO event handlers
if (process.env.SOCKETIO_ENABLED !== 'false') {
  io.on('connection', (socket) => {
    logger.info('Client connected', { socketId: socket.id });

    // Join execution room
    socket.on('subscribe:execution', (executionId) => {
      socket.join(`execution:${executionId}`);
      logger.debug('Client subscribed to execution', {
        socketId: socket.id,
        executionId
      });
    });

    // Leave execution room
    socket.on('unsubscribe:execution', (executionId) => {
      socket.leave(`execution:${executionId}`);
      logger.debug('Client unsubscribed from execution', {
        socketId: socket.id,
        executionId
      });
    });

    // Join workflow room
    socket.on('subscribe:workflow', (workflowId) => {
      socket.join(`workflow:${workflowId}`);
      logger.debug('Client subscribed to workflow', {
        socketId: socket.id,
        workflowId
      });
    });

    // Leave workflow room
    socket.on('unsubscribe:workflow', (workflowId) => {
      socket.leave(`workflow:${workflowId}`);
      logger.debug('Client unsubscribed from workflow', {
        socketId: socket.id,
        workflowId
      });
    });

    socket.on('disconnect', () => {
      logger.info('Client disconnected', { socketId: socket.id });
    });
  });

  // Make io available to other modules
  app.set('io', io);
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path
  });

  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message
  });
});

// Graceful shutdown
const gracefulShutdown = async () => {
  logger.info('Shutting down gracefully...');

  // Shutdown scheduler
  const schedulerService = require('./services/schedulerService');
  schedulerService.shutdown();

  server.close(() => {
    logger.info('HTTP server closed');
  });

  // Close database connections
  const { sequelize } = require('./config/database');
  await sequelize.close();

  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
const PORT = process.env.PORT || 3017;

const startServer = async () => {
  try {
    // Test database connection
    const dbConnected = await testConnection();

    if (!dbConnected) {
      logger.warn('Database not connected. Service will start without database features.');
    } else {
      // Sync models (in development)
      if (process.env.NODE_ENV === 'development') {
        const synced = await syncModels({ alter: true });
        if (!synced) {
          logger.warn('Failed to sync models. Some features may not work.');
        }
      }

      // Initialize scheduler
      try {
        const schedulerService = require('./services/schedulerService');
        await schedulerService.initialize();
      } catch (error) {
        logger.warn('Failed to initialize scheduler. Scheduled workflows will not run.', {
          error: error.message
        });
      }
    }

    // Start HTTP server
    server.listen(PORT, () => {
      logger.info(`Exprsn Workflow service started`, {
        port: PORT,
        nodeEnv: process.env.NODE_ENV,
        socketIoEnabled: process.env.SOCKETIO_ENABLED !== 'false',
        schedulerEnabled: true
      });

      logger.info(`Health check: http://localhost:${PORT}/health`);
      logger.info(`API documentation: http://localhost:${PORT}/api/docs`);
    });
  } catch (error) {
    logger.error('Failed to start server', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
};

startServer();

module.exports = { app, server, io };
