/**
 * ═══════════════════════════════════════════════════════════════════════
 * Setup & Configuration Management Routes
 * ═══════════════════════════════════════════════════════════════════════
 * Provides comprehensive setup interface for SVR service integration
 * - Service discovery and health monitoring
 * - Database and Redis configuration
 * - Service URL configuration
 * - Environment variable management
 * - Integration testing
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const config = require('../config');
const { sequelize, testConnection } = require('../config/database');
const logger = require('../utils/logger');
const Redis = require('ioredis');

/**
 * ───────────────────────────────────────────────────────────────────────
 * Service Definitions
 * ───────────────────────────────────────────────────────────────────────
 */

const SERVICE_DEFINITIONS = {
  'exprsn-ca': {
    port: 3000,
    name: 'Certificate Authority',
    category: 'core',
    description: 'X.509 CA, OCSP, CRL, CA Tokens',
    endpoints: ['/health', '/api/tokens/issue', '/api/certs/list']
  },
  'exprsn-auth': {
    port: 3001,
    name: 'Authentication & SSO',
    category: 'core',
    description: 'OAuth2, OIDC, SAML, MFA',
    endpoints: ['/health', '/api/auth/status', '/api/users/me']
  },
  'exprsn-spark': {
    port: 3002,
    name: 'Real-time Messaging',
    category: 'messaging',
    description: 'E2EE messaging, Socket.IO',
    endpoints: ['/health', '/api/messages/recent', '/api/rooms/list']
  },
  'exprsn-timeline': {
    port: 3004,
    name: 'Social Feed',
    category: 'content',
    description: 'Posts, interactions, Bull queues',
    endpoints: ['/health', '/api/posts/feed', '/api/stats']
  },
  'exprsn-prefetch': {
    port: 3005,
    name: 'Timeline Prefetching',
    category: 'infrastructure',
    description: 'Timeline cache service',
    endpoints: ['/health', '/api/cache/stats']
  },
  'exprsn-moderator': {
    port: 3006,
    name: 'Content Moderation',
    category: 'content',
    description: 'AI moderation, Herald integration',
    endpoints: ['/health', '/api/moderate', '/api/queue/stats']
  },
  'exprsn-filevault': {
    port: 3007,
    name: 'File Storage',
    category: 'media',
    description: 'S3/Disk/IPFS, versioning, deduplication',
    endpoints: ['/health', '/api/files/stats', '/api/storage/info']
  },
  'exprsn-gallery': {
    port: 3008,
    name: 'Media Galleries',
    category: 'media',
    description: 'Albums, image processing, filters',
    endpoints: ['/health', '/api/galleries/list', '/api/albums/stats']
  },
  'exprsn-live': {
    port: 3009,
    name: 'Live Streaming',
    category: 'media',
    description: 'Cloudflare Stream, WebRTC, recordings',
    endpoints: ['/health', '/api/streams/active', '/api/streams/stats']
  },
  'exprsn-bridge': {
    port: 3010,
    name: 'API Gateway',
    category: 'infrastructure',
    description: 'Proxy, rate limiting, JSONLex',
    endpoints: ['/health', '/api/routes', '/api/stats']
  },
  'exprsn-nexus': {
    port: 3011,
    name: 'Groups & Events',
    category: 'content',
    description: 'CalDAV, CardDAV, trending',
    endpoints: ['/health', '/api/groups/list', '/api/events/upcoming']
  },
  'exprsn-pulse': {
    port: 3012,
    name: 'Analytics & Metrics',
    category: 'infrastructure',
    description: 'Prometheus metrics, tracking',
    endpoints: ['/health', '/api/metrics', '/api/analytics/summary']
  },
  'exprsn-vault': {
    port: 3013,
    name: 'Secrets Management',
    category: 'infrastructure',
    description: 'Encryption keys, credentials',
    endpoints: ['/health', '/api/status', '/api/secrets/list']
  },
  'exprsn-herald': {
    port: 3014,
    name: 'Notifications',
    category: 'messaging',
    description: 'Push, email, SMS, Socket.IO',
    endpoints: ['/health', '/api/notifications/stats', '/api/channels/list']
  },
  'exprsn-setup': {
    port: 3015,
    name: 'Setup & Management',
    category: 'core',
    description: 'Service discovery, configuration',
    endpoints: ['/health', '/api/services', '/api/config/list']
  },
  'exprsn-forge': {
    port: 3016,
    name: 'Business Platform',
    category: 'automation',
    description: 'CRM, Groupware, ERP',
    endpoints: ['/health', '/api/crm/stats', '/api/modules/status']
  },
  'exprsn-workflow': {
    port: 3017,
    name: 'Workflow Automation',
    category: 'automation',
    description: '15 step types, JSONLex, approvals',
    endpoints: ['/health', '/api/workflows/list', '/api/executions/stats']
  }
};

/**
 * ───────────────────────────────────────────────────────────────────────
 * Helper Functions
 * ───────────────────────────────────────────────────────────────────────
 */

/**
 * Check if a service is running
 * @param {number} port - Service port
 * @param {number} timeout - Request timeout in ms
 * @returns {Promise<Object>} Service status
 */
async function checkService(port, timeout = 2000) {
  try {
    const response = await axios.get(`http://localhost:${port}/health`, {
      timeout,
      validateStatus: () => true
    });

    return {
      running: response.status < 500,
      status: response.status,
      data: response.data || {},
      error: null
    };
  } catch (error) {
    return {
      running: false,
      status: 0,
      data: {},
      error: error.code || error.message
    };
  }
}

/**
 * Test PostgreSQL connection
 * @returns {Promise<Object>} Connection status
 */
async function testPostgresConnection() {
  try {
    await sequelize.authenticate();
    const result = await sequelize.query('SELECT version();');
    return {
      connected: true,
      version: result[0][0].version,
      database: config.database.name,
      host: config.database.host,
      port: config.database.port,
      error: null
    };
  } catch (error) {
    return {
      connected: false,
      error: error.message,
      database: config.database.name,
      host: config.database.host,
      port: config.database.port
    };
  }
}

/**
 * Test Redis connection
 * @returns {Promise<Object>} Connection status
 */
async function testRedisConnection() {
  if (!config.redis.enabled) {
    return {
      enabled: false,
      connected: false,
      message: 'Redis is disabled in configuration'
    };
  }

  let client;
  try {
    client = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password || undefined,
      db: config.redis.db,
      retryStrategy: () => null, // Don't retry
      lazyConnect: true
    });

    await client.connect();
    await client.ping();
    const info = await client.info('server');

    const versionMatch = info.match(/redis_version:([^\r\n]+)/);
    const version = versionMatch ? versionMatch[1] : 'unknown';

    await client.quit();

    return {
      enabled: true,
      connected: true,
      host: config.redis.host,
      port: config.redis.port,
      db: config.redis.db,
      version,
      error: null
    };
  } catch (error) {
    if (client) {
      try { await client.quit(); } catch (e) { /* ignore */ }
    }
    return {
      enabled: true,
      connected: false,
      host: config.redis.host,
      port: config.redis.port,
      error: error.message
    };
  }
}

/**
 * Discover all services
 * @returns {Promise<Array>} Array of service statuses
 */
async function discoverServices() {
  const results = [];

  for (const [serviceId, serviceDef] of Object.entries(SERVICE_DEFINITIONS)) {
    const status = await checkService(serviceDef.port);
    results.push({
      id: serviceId,
      name: serviceDef.name,
      port: serviceDef.port,
      category: serviceDef.category,
      description: serviceDef.description,
      running: status.running,
      health: status.data,
      endpoints: serviceDef.endpoints,
      url: `http://localhost:${serviceDef.port}`
    });
  }

  return results;
}

/**
 * ───────────────────────────────────────────────────────────────────────
 * Routes
 * ───────────────────────────────────────────────────────────────────────
 */

/**
 * GET /setup
 * Main setup page
 */
router.get('/', async (req, res) => {
  try {
    const [services, dbStatus, redisStatus] = await Promise.all([
      discoverServices(),
      testPostgresConnection(),
      testRedisConnection()
    ]);

    const runningServices = services.filter(s => s.running).length;
    const totalServices = services.length;

    res.render('setup', {
      title: 'SVR Setup & Configuration',
      currentPath: req.path,
      config: {
        service: config.serviceName,
        port: config.port,
        env: config.env,
        ...config
      },
      database: dbStatus,
      redis: redisStatus,
      services,
      stats: {
        totalServices,
        runningServices,
        stoppedServices: totalServices - runningServices
      }
    });
  } catch (error) {
    logger.error('Error loading setup page:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /setup/api/status
 * Get complete system status (API endpoint)
 */
router.get('/api/status', async (req, res) => {
  try {
    const [services, dbStatus, redisStatus] = await Promise.all([
      discoverServices(),
      testPostgresConnection(),
      testRedisConnection()
    ]);

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      service: {
        name: config.serviceName,
        port: config.port,
        env: config.env,
        uptime: process.uptime()
      },
      database: dbStatus,
      redis: redisStatus,
      services: services.map(s => ({
        id: s.id,
        name: s.name,
        port: s.port,
        category: s.category,
        running: s.running,
        url: s.url
      })),
      stats: {
        totalServices: services.length,
        runningServices: services.filter(s => s.running).length
      }
    });
  } catch (error) {
    logger.error('Error getting system status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /setup/api/services
 * Get detailed service information
 */
router.get('/api/services', async (req, res) => {
  try {
    const services = await discoverServices();
    res.json({
      success: true,
      services
    });
  } catch (error) {
    logger.error('Error getting services:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /setup/api/services/:serviceId
 * Get detailed information about a specific service
 */
router.get('/api/services/:serviceId', async (req, res) => {
  try {
    const { serviceId } = req.params;
    const serviceDef = SERVICE_DEFINITIONS[serviceId];

    if (!serviceDef) {
      return res.status(404).json({
        success: false,
        error: 'Service not found'
      });
    }

    const status = await checkService(serviceDef.port, 5000);

    // Try to get additional endpoints
    const endpointResults = {};
    if (status.running) {
      for (const endpoint of serviceDef.endpoints) {
        try {
          const response = await axios.get(`http://localhost:${serviceDef.port}${endpoint}`, {
            timeout: 2000,
            validateStatus: () => true
          });
          endpointResults[endpoint] = {
            available: response.status < 400,
            status: response.status,
            data: response.data
          };
        } catch (error) {
          endpointResults[endpoint] = {
            available: false,
            error: error.message
          };
        }
      }
    }

    res.json({
      success: true,
      service: {
        id: serviceId,
        name: serviceDef.name,
        port: serviceDef.port,
        category: serviceDef.category,
        description: serviceDef.description,
        running: status.running,
        health: status.data,
        url: `http://localhost:${serviceDef.port}`,
        endpoints: endpointResults
      }
    });
  } catch (error) {
    logger.error('Error getting service details:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /setup/api/config
 * Get current SVR configuration
 */
router.get('/api/config', (req, res) => {
  try {
    // Return configuration with sensitive values masked
    const safeConfig = {
      application: {
        env: config.env,
        port: config.port,
        serviceName: config.serviceName
      },
      database: {
        host: config.database.host,
        port: config.database.port,
        name: config.database.name,
        username: config.database.username,
        password: config.database.password ? '***MASKED***' : '',
        pool: config.database.pool
      },
      redis: {
        enabled: config.redis.enabled,
        host: config.redis.host,
        port: config.redis.port,
        db: config.redis.db,
        password: config.redis.password ? '***MASKED***' : '',
        cacheTTL: config.redis.cacheTTL
      },
      ca: {
        url: config.ca.url,
        verifyTokens: config.ca.verifyTokens,
        publicKeyPath: config.ca.publicKeyPath
      },
      security: {
        sessionSecret: config.security.sessionSecret ? '***MASKED***' : '',
        jwtSecret: config.security.jwtSecret ? '***MASKED***' : '',
        enableSQLInjectionDetection: config.security.enableSQLInjectionDetection,
        enableXSSProtection: config.security.enableXSSProtection,
        allowedOrigins: config.security.allowedOrigins
      },
      codeExecution: config.codeExecution,
      socketIO: config.socketIO,
      storage: config.storage,
      rateLimit: config.rateLimit,
      logging: config.logging
    };

    res.json({
      success: true,
      config: safeConfig
    });
  } catch (error) {
    logger.error('Error getting configuration:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /setup/api/config/test-db
 * Test database connection
 */
router.post('/api/config/test-db', async (req, res) => {
  try {
    const dbStatus = await testPostgresConnection();
    res.json({
      success: dbStatus.connected,
      status: dbStatus
    });
  } catch (error) {
    logger.error('Error testing database:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /setup/api/config/test-redis
 * Test Redis connection
 */
router.post('/api/config/test-redis', async (req, res) => {
  try {
    const redisStatus = await testRedisConnection();
    res.json({
      success: redisStatus.connected,
      status: redisStatus
    });
  } catch (error) {
    logger.error('Error testing Redis:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /setup/api/config/test-service
 * Test connection to a specific service
 */
router.post('/api/config/test-service', async (req, res) => {
  try {
    const { serviceId } = req.body;

    if (!serviceId) {
      return res.status(400).json({
        success: false,
        error: 'serviceId is required'
      });
    }

    const serviceDef = SERVICE_DEFINITIONS[serviceId];
    if (!serviceDef) {
      return res.status(404).json({
        success: false,
        error: 'Service not found'
      });
    }

    const status = await checkService(serviceDef.port);

    res.json({
      success: status.running,
      service: {
        id: serviceId,
        name: serviceDef.name,
        port: serviceDef.port,
        running: status.running,
        health: status.data,
        error: status.error
      }
    });
  } catch (error) {
    logger.error('Error testing service:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /setup/api/config/env-template
 * Get environment variable template
 */
router.get('/api/config/env-template', (req, res) => {
  try {
    const template = {
      APPLICATION: {
        NODE_ENV: 'development',
        PORT: '5001',
        SERVICE_NAME: 'exprsn-svr'
      },
      DATABASE: {
        DB_HOST: 'localhost',
        DB_PORT: '5432',
        DB_NAME: 'exprsn_svr',
        DB_USER: 'postgres',
        DB_PASSWORD: '',
        DB_POOL_MAX: '20',
        DB_POOL_MIN: '5'
      },
      REDIS: {
        REDIS_ENABLED: 'true',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
        REDIS_PASSWORD: '',
        REDIS_DB: '0',
        CACHE_TTL: '3600'
      },
      CA_INTEGRATION: {
        CA_URL: 'http://localhost:3000',
        CA_VERIFY_TOKENS: 'true',
        CA_PUBLIC_KEY_PATH: './keys/ca-public.pem'
      },
      SECURITY: {
        SESSION_SECRET: '',
        JWT_SECRET: '',
        ENABLE_SQL_INJECTION_DETECTION: 'true',
        ENABLE_XSS_PROTECTION: 'true',
        ALLOWED_ORIGINS: 'http://localhost:3000,http://localhost:3004'
      },
      CODE_EXECUTION: {
        CODE_EXECUTION_ENABLED: 'true',
        CODE_EXECUTION_TIMEOUT: '5000',
        CODE_EXECUTION_MEMORY_LIMIT: '128'
      },
      SOCKET_IO: {
        SOCKET_IO_ENABLED: 'true',
        SOCKET_IO_PATH: '/socket.io',
        SOCKET_IO_CORS_ORIGINS: 'http://localhost:3000,http://localhost:3004'
      },
      STORAGE: {
        MAX_FILE_SIZE: '10485760',
        UPLOAD_DIR: './uploads',
        STATIC_DIR: './public'
      },
      RATE_LIMITING: {
        RATE_LIMIT_WINDOW_MS: '60000',
        RATE_LIMIT_MAX_REQUESTS: '100'
      },
      LOGGING: {
        LOG_LEVEL: 'info',
        LOG_DIR: './logs',
        LOG_MAX_FILES: '30'
      }
    };

    res.json({
      success: true,
      template,
      serviceUrls: Object.entries(SERVICE_DEFINITIONS).reduce((acc, [id, def]) => {
        acc[id.toUpperCase() + '_URL'] = `http://localhost:${def.port}`;
        return acc;
      }, {})
    });
  } catch (error) {
    logger.error('Error getting env template:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
