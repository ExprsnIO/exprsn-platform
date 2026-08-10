/**
 * Exprsn Setup Service
 * Service discovery, health monitoring, and configuration management
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const logger = require('./utils/logger');

// Import routes
const servicesRoutes = require('./routes/services');
const databaseRoutes = require('./routes/database');
const configRoutes = require('./routes/config');
const envConfigRoutes = require('./routes/env-config');
const statusRoutes = require('./routes/status');
const scaffoldRoutes = require('./routes/scaffold');
const schemaRoutes = require('./routes/schema');
const adminRoutes = require('./routes/admin');
const sectionsRoutes = require('./routes/sections');
const advancedConfigRoutes = require('./routes/advanced-config');
const caSetupRoutes = require('./routes/caSetup');
const authSetupRoutes = require('./routes/authSetup');
const certificatesAdminRoutes = require('./routes/certificatesAdmin');
const redisAdminRoutes = require('./routes/redisAdmin');
const usersAdminRoutes = require('./routes/usersAdmin');
const tokensAdminRoutes = require('./routes/tokensAdmin');
const databaseAdminRoutes = require('./routes/databaseAdmin');
const heraldAdminRoutes = require('./routes/heraldAdmin');

// Infrastructure routes
const postgresqlInfraRoutes = require('./routes/infrastructure/postgresql');
const redisInfraRoutes = require('./routes/infrastructure/redis');

// Entity management routes
const groupsRoutes = require('./routes/groups');
const rolesRoutes = require('./routes/roles');
const permissionsRoutes = require('./routes/permissions');
const serviceConfigRoutes = require('./routes/serviceConfig');

// Import services for real-time monitoring
const { discoverServices } = require('./services/discovery');
const { checkAllServices, monitorServiceHealth } = require('./services/health');

// Create Express app
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Configuration
const PORT = process.env.PORT || 3015;
const HEALTH_CHECK_INTERVAL = parseInt(process.env.HEALTH_CHECK_INTERVAL) || 5000;

// Middleware
app.use(helmet({
  contentSecurityPolicy: false // Allow inline scripts for development
}));
app.use(cors());
app.use(compression());
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Make io available to routes and globally for ProcessManager
app.set('io', io);
global.io = io;

// API Routes
app.use('/api/services', servicesRoutes);
app.use('/api/database', databaseRoutes);
app.use('/api/config', configRoutes);
app.use('/api/env-config', envConfigRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/scaffold', scaffoldRoutes);
app.use('/api/schema', schemaRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/config', sectionsRoutes);
app.use('/api/advanced-config', advancedConfigRoutes);
app.use('/api/ca', caSetupRoutes);
app.use('/api/auth', authSetupRoutes);
app.use('/api/certificates', certificatesAdminRoutes);
app.use('/api/redis', redisAdminRoutes);
app.use('/api/users', usersAdminRoutes);
app.use('/api/tokens', tokensAdminRoutes);
app.use('/api/database', databaseAdminRoutes);
app.use('/api/herald', heraldAdminRoutes);

// Infrastructure API routes
app.use('/api/infrastructure/postgresql', postgresqlInfraRoutes);
app.use('/api/infrastructure/redis', redisInfraRoutes);

// Entity management API routes
app.use('/api/groups', groupsRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/permissions', permissionsRoutes);

// Service configuration API routes
app.use('/api/service-config', serviceConfigRoutes);

// Health endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'exprsn-setup',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Root endpoint - unified dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard-unified.html'));
});

// Unified dashboard (explicit route)
app.get('/unified', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard-unified.html'));
});

// Dashboard v2 (alternative) - redirect to unified
app.get('/v2', (req, res) => {
  res.redirect('/');
});

// Production dashboard - redirect to unified
app.get('/production', (req, res) => {
  res.redirect('/');
});

// Production dashboard v2 - redirect to unified
app.get('/production-v2', (req, res) => {
  res.redirect('/');
});

// CA Setup dashboard - redirect to setup wizard
app.get('/setup-ca', (req, res) => {
  res.redirect('/setup/ca');
});

// Auth Setup dashboard - redirect to setup wizard
app.get('/setup-auth', (req, res) => {
  res.redirect('/setup/auth');
});

// Certificates Administration dashboard
app.get('/admin/certificates', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-certificates.html'));
});

// Redis & Caching Administration dashboard
app.get('/admin/redis', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-redis.html'));
});

// User Administration dashboard
app.get('/admin/users', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-users.html'));
});

// Token Administration dashboard
app.get('/admin/tokens', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-tokens.html'));
});

// Database Administration dashboard - redirect to PostgreSQL admin
app.get('/admin/database', (req, res) => {
  res.redirect('/admin/postgresql');
});

// Herald (Notifications) Administration dashboard
app.get('/admin/herald', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-herald.html'));
});

// Groups Administration dashboard
app.get('/admin/groups', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-groups.html'));
});

// Roles Administration dashboard
app.get('/admin/roles', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-roles.html'));
});

// PostgreSQL Infrastructure dashboard
app.get('/admin/postgresql', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-postgresql.html'));
});

// Services Overview dashboard
app.get('/admin/services', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-services.html'));
});

// Service Setup Center (landing page for all services)
app.get('/setup', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'setup-index.html'));
});

// Dynamic service setup wizard
app.get('/setup/:serviceId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'setup-wizard.html'));
});

// Legacy dashboards - redirect to unified
app.get('/legacy', (req, res) => {
  res.redirect('/');
});

app.get('/v1', (req, res) => {
  res.redirect('/');
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Express error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

// WebSocket connection handling
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);

  // Send initial service discovery
  discoverServices().then(services => {
    socket.emit('services:all', {
      timestamp: new Date().toISOString(),
      services
    });
  }).catch(error => {
    logger.error('Error in initial service discovery:', error);
    socket.emit('error', {
      message: 'Failed to discover services',
      error: error.message
    });
  });

  // Send initial health check
  checkAllServices().then(healthStatuses => {
    socket.emit('health:all', {
      timestamp: new Date().toISOString(),
      services: healthStatuses
    });
  }).catch(error => {
    logger.error('Error in initial health check:', error);
  });

  // Handle service monitoring requests
  socket.on('monitor:start', async (data) => {
    const { service } = data;
    logger.info(`Starting monitoring for ${service} (client: ${socket.id})`);

    try {
      // Store stop function in socket data
      if (!socket.data.monitors) {
        socket.data.monitors = {};
      }

      if (socket.data.monitors[service]) {
        // Already monitoring this service
        return;
      }

      const stopMonitoring = monitorServiceHealth(
        service,
        (health) => {
          socket.emit('service:health', {
            timestamp: new Date().toISOString(),
            health
          });
        },
        HEALTH_CHECK_INTERVAL
      );

      socket.data.monitors[service] = stopMonitoring;
    } catch (error) {
      logger.error(`Error starting monitoring for ${service}:`, error);
      socket.emit('error', {
        message: `Failed to start monitoring ${service}`,
        error: error.message
      });
    }
  });

  // Handle stop monitoring requests
  socket.on('monitor:stop', (data) => {
    const { service } = data;
    logger.info(`Stopping monitoring for ${service} (client: ${socket.id})`);

    if (socket.data.monitors && socket.data.monitors[service]) {
      socket.data.monitors[service](); // Call stop function
      delete socket.data.monitors[service];
    }
  });

  // Handle database progress updates
  socket.on('database:upload', async (data) => {
    const { database, progress } = data;
    socket.emit('database:progress', {
      timestamp: new Date().toISOString(),
      database,
      progress
    });
  });

  // Handle config save confirmations
  socket.on('config:save', async (data) => {
    const { service, config, section } = data;

    // Broadcast to all clients
    io.emit('config:updated', {
      timestamp: new Date().toISOString(),
      service,
      section,
      config
    });

    socket.emit('config:saved', {
      timestamp: new Date().toISOString(),
      service,
      section,
      message: 'Configuration saved successfully'
    });
  });

  // Handle stats requests
  socket.on('stats:request', async () => {
    try {
      const services = await discoverServices();
      const healthStatuses = await checkAllServices();

      const activeServices = healthStatuses.filter(s => s.status === 'running').length;

      socket.emit('stats:update', {
        timestamp: new Date().toISOString(),
        services: {
          active: activeServices,
          total: services.length
        },
        uptime: process.uptime(),
        connections: io.engine.clientsCount,
        tasks: {
          pending: 0,
          completed: 0
        }
      });
    } catch (error) {
      logger.error('Error fetching stats:', error);
    }
  });

  // Handle log streaming requests
  socket.on('logs:start', (data) => {
    const { serviceId } = data;
    logger.info(`Starting log stream for ${serviceId} (client: ${socket.id})`);

    const processManager = require('./services/processManager');
    const unsubscribe = processManager.streamLogs(serviceId, (error, log) => {
      if (error) {
        socket.emit('logs:error', {
          serviceId,
          error: error.message
        });
        return;
      }

      socket.emit('logs:entry', log);
    });

    // Store unsubscribe function
    if (!socket.data.logStreams) {
      socket.data.logStreams = {};
    }
    socket.data.logStreams[serviceId] = unsubscribe;
  });

  // Handle log streaming stop
  socket.on('logs:stop', (data) => {
    const { serviceId } = data;
    logger.info(`Stopping log stream for ${serviceId} (client: ${socket.id})`);

    if (socket.data.logStreams && socket.data.logStreams[serviceId]) {
      socket.data.logStreams[serviceId]();
      delete socket.data.logStreams[serviceId];
    }
  });

  // Handle service status requests
  socket.on('service:status:request', async (data) => {
    const { serviceId } = data;
    const processManager = require('./services/processManager');

    try {
      const status = await processManager.getServiceStatus(serviceId);
      socket.emit('service:status', {
        timestamp: new Date().toISOString(),
        service: status
      });
    } catch (error) {
      socket.emit('service:error', {
        serviceId,
        error: error.message
      });
    }
  });

  // Cleanup on disconnect
  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);

    // Stop all monitors for this client
    if (socket.data.monitors) {
      Object.values(socket.data.monitors).forEach(stopFn => stopFn());
      socket.data.monitors = {};
    }
  });
});

// Broadcast service status updates to all clients
function broadcastServiceUpdates() {
  setInterval(async () => {
    try {
      const services = await discoverServices();
      io.emit('services:all', {
        timestamp: new Date().toISOString(),
        services
      });

      const healthStatuses = await checkAllServices();
      io.emit('health:all', {
        timestamp: new Date().toISOString(),
        services: healthStatuses
      });
    } catch (error) {
      logger.error('Error broadcasting service updates:', error);
    }
  }, HEALTH_CHECK_INTERVAL);
}

// Start server
server.listen(PORT, () => {
  logger.info(`Exprsn Setup Service listening on port ${PORT}`);
  logger.info(`Web UI available at http://localhost:${PORT}`);
  logger.info(`Health check interval: ${HEALTH_CHECK_INTERVAL}ms`);

  // Start broadcasting service updates
  broadcastServiceUpdates();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

module.exports = { app, server, io };
