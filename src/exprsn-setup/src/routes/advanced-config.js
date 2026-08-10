/**
 * ═══════════════════════════════════════════════════════════════════════
 * Advanced Configuration Management Routes
 * ═══════════════════════════════════════════════════════════════════════
 * Comprehensive service configuration including:
 * - TLS/SSL Certificate Management
 * - Redis Configuration
 * - Database Administration per Service
 * - JWT Key Management
 * - Service Linking (Bridge, Auth Tokens)
 * - CSP/Security Headers
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * ═══════════════════════════════════════════════════════════════════════
 * SERVICE CONFIGURATION ENDPOINTS
 * ═══════════════════════════════════════════════════════════════════════
 */

// GET /api/advanced-config/services - Get all configurable services with categories
router.get('/services', async (req, res) => {
  try {
    const services = {
      core: [
        {
          key: 'ca',
          name: 'Certificate Authority',
          port: 3000,
          hasDatabase: true,
          hasRedis: true,
          hasTLS: true,
          hasJWT: true,
          description: 'Core PKI and token generation service'
        },
        {
          key: 'setup',
          name: 'Setup & Management',
          port: 3015,
          hasDatabase: false,
          hasRedis: false,
          hasTLS: true,
          hasJWT: false,
          description: 'Service discovery and configuration'
        }
      ],
      auth: [
        {
          key: 'auth',
          name: 'Authentication & SSO',
          port: 3001,
          hasDatabase: true,
          hasRedis: true,
          hasTLS: true,
          hasJWT: true,
          description: 'OAuth2/OIDC, SAML SSO, MFA'
        }
      ],
      communication: [
        {
          key: 'spark',
          name: 'Real-time Messaging',
          port: 3002,
          hasDatabase: true,
          hasRedis: true,
          hasTLS: true,
          hasJWT: false,
          description: 'End-to-end encrypted messaging'
        },
        {
          key: 'herald',
          name: 'Notifications & Alerts',
          port: 3014,
          hasDatabase: true,
          hasRedis: true,
          hasTLS: false,
          hasJWT: false,
          description: 'Multi-channel notifications'
        }
      ],
      social: [
        {
          key: 'timeline',
          name: 'Social Feed',
          port: 3004,
          hasDatabase: true,
          hasRedis: true,
          hasTLS: false,
          hasJWT: false,
          description: 'Social timeline and posts'
        },
        {
          key: 'prefetch',
          name: 'Timeline Prefetching',
          port: 3005,
          hasDatabase: false,
          hasRedis: true,
          hasTLS: false,
          hasJWT: false,
          description: 'Two-tier caching system'
        }
      ],
      content: [
        {
          key: 'moderator',
          name: 'Content Moderation',
          port: 3006,
          hasDatabase: true,
          hasRedis: true,
          hasTLS: false,
          hasJWT: false,
          description: 'AI-powered content moderation'
        },
        {
          key: 'filevault',
          name: 'File Storage',
          port: 3007,
          hasDatabase: true,
          hasRedis: false,
          hasTLS: true,
          hasJWT: false,
          description: 'Versioning and tokenized file storage'
        },
        {
          key: 'gallery',
          name: 'Media Galleries',
          port: 3008,
          hasDatabase: true,
          hasRedis: true,
          hasTLS: false,
          hasJWT: false,
          description: 'Media galleries with processing'
        },
        {
          key: 'live',
          name: 'Live Streaming',
          port: 3009,
          hasDatabase: true,
          hasRedis: true,
          hasTLS: true,
          hasJWT: false,
          description: 'Live streaming with Cloudflare'
        }
      ],
      infrastructure: [
        {
          key: 'bridge',
          name: 'API Gateway',
          port: 3010,
          hasDatabase: false,
          hasRedis: true,
          hasTLS: true,
          hasJWT: false,
          description: 'Rate limiting and CA token forwarding'
        },
        {
          key: 'pulse',
          name: 'Analytics & Metrics',
          port: 3012,
          hasDatabase: true,
          hasRedis: true,
          hasTLS: false,
          hasJWT: false,
          description: 'Prometheus metrics and analytics'
        },
        {
          key: 'vault',
          name: 'Secrets Management',
          port: 3013,
          hasDatabase: true,
          hasRedis: false,
          hasTLS: true,
          hasJWT: false,
          description: 'Encrypted secrets storage'
        }
      ],
      business: [
        {
          key: 'nexus',
          name: 'Groups & Events',
          port: 3011,
          hasDatabase: true,
          hasRedis: true,
          hasTLS: false,
          hasJWT: false,
          description: 'Groups, events, CalDAV/CardDAV'
        },
        {
          key: 'forge',
          name: 'Business Platform',
          port: 3016,
          hasDatabase: true,
          hasRedis: true,
          hasTLS: true,
          hasJWT: false,
          hasForgeSchemas: true,
          description: 'CRM, Groupware, ERP'
        },
        {
          key: 'workflow',
          name: 'Workflow Automation',
          port: 3017,
          hasDatabase: true,
          hasRedis: true,
          hasTLS: false,
          hasJWT: false,
          description: 'Visual workflow automation'
        }
      ],
      frontend: [
        {
          key: 'svr',
          name: 'Dynamic Page Server',
          port: 5001,
          hasDatabase: false,
          hasRedis: false,
          hasTLS: true,
          hasJWT: false,
          description: 'EJS and Socket.IO server'
        }
      ]
    };

    res.json({
      success: true,
      categories: Object.keys(services),
      services
    });
  } catch (error) {
    logger.error('Error fetching services:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/advanced-config/:service/full - Get complete configuration for a service
router.get('/:service/full', async (req, res) => {
  try {
    const { service } = req.params;
    const envPath = path.join(__dirname, '../../../../', `.env.${service}`);

    let config = {};
    try {
      const envContent = await fs.readFile(envPath, 'utf-8');
      config = parseEnvFile(envContent);
    } catch (error) {
      // File doesn't exist yet
      config = {};
    }

    res.json({
      success: true,
      service,
      config,
      sections: categorizeConfig(config, service)
    });
  } catch (error) {
    logger.error(`Error fetching config for ${req.params.service}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/advanced-config/:service/save - Save complete service configuration
router.post('/:service/save', async (req, res) => {
  try {
    const { service } = req.params;
    const { config, sections } = req.body;

    // Merge sections if provided
    let finalConfig = config;
    if (sections) {
      finalConfig = mergeSections(sections);
    }

    // Generate .env content
    const envContent = generateEnvFile(finalConfig, service);

    // Save to appropriate .env file
    const envPath = path.join(__dirname, '../../../../', `.env.${service}`);
    await fs.writeFile(envPath, envContent, 'utf-8');

    // Also update main .env if it's a global service
    if (['ca', 'auth'].includes(service)) {
      const mainEnvPath = path.join(__dirname, '../../../../', '.env');
      const mainEnv = await fs.readFile(mainEnvPath, 'utf-8');
      const updatedMainEnv = mergeEnvConfig(mainEnv, finalConfig);
      await fs.writeFile(mainEnvPath, updatedMainEnv, 'utf-8');
    }

    res.json({
      success: true,
      message: `Configuration saved for ${service}`,
      service,
      path: envPath
    });
  } catch (error) {
    logger.error(`Error saving config for ${req.params.service}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * TLS/SSL CONFIGURATION
 * ═══════════════════════════════════════════════════════════════════════
 */

// GET /api/advanced-config/:service/tls - Get TLS configuration
router.get('/:service/tls', async (req, res) => {
  try {
    const { service } = req.params;
    const config = await loadServiceConfig(service);

    const tlsConfig = {
      enabled: config.TLS_ENABLED === 'true',
      port: config.TLS_PORT || (parseInt(config.PORT) + 443),
      certPath: config.TLS_CERT_PATH || '',
      keyPath: config.TLS_KEY_PATH || '',
      caPath: config.TLS_CA_PATH || '',
      minVersion: config.TLS_MIN_VERSION || 'TLSv1.2',
      ciphers: config.TLS_CIPHERS || 'ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384',
      requireClientCert: config.TLS_REQUIRE_CLIENT_CERT === 'true',
      rejectUnauthorized: config.TLS_REJECT_UNAUTHORIZED !== 'false'
    };

    res.json({
      success: true,
      service,
      tls: tlsConfig
    });
  } catch (error) {
    logger.error(`Error fetching TLS config for ${req.params.service}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/advanced-config/:service/tls - Update TLS configuration
router.post('/:service/tls', async (req, res) => {
  try {
    const { service } = req.params;
    const { tls } = req.body;

    const config = await loadServiceConfig(service);

    config.TLS_ENABLED = tls.enabled ? 'true' : 'false';
    config.TLS_PORT = tls.port;
    config.TLS_CERT_PATH = tls.certPath;
    config.TLS_KEY_PATH = tls.keyPath;
    config.TLS_CA_PATH = tls.caPath;
    config.TLS_MIN_VERSION = tls.minVersion;
    config.TLS_CIPHERS = tls.ciphers;
    config.TLS_REQUIRE_CLIENT_CERT = tls.requireClientCert ? 'true' : 'false';
    config.TLS_REJECT_UNAUTHORIZED = tls.rejectUnauthorized ? 'true' : 'false';

    await saveServiceConfig(service, config);

    res.json({
      success: true,
      message: 'TLS configuration updated',
      service
    });
  } catch (error) {
    logger.error(`Error updating TLS config for ${req.params.service}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * REDIS CONFIGURATION
 * ═══════════════════════════════════════════════════════════════════════
 */

// GET /api/advanced-config/:service/redis - Get Redis configuration
router.get('/:service/redis', async (req, res) => {
  try {
    const { service } = req.params;
    const config = await loadServiceConfig(service);

    const redisConfig = {
      enabled: config.REDIS_ENABLED !== 'false',
      host: config.REDIS_HOST || 'localhost',
      port: parseInt(config.REDIS_PORT) || 6379,
      password: config.REDIS_PASSWORD || '',
      db: parseInt(config.REDIS_DB) || 0,
      keyPrefix: config.REDIS_KEY_PREFIX || `exprsn:${service}:`,
      tls: config.REDIS_TLS === 'true',
      maxRetriesPerRequest: parseInt(config.REDIS_MAX_RETRIES) || 3,
      enableReadyCheck: config.REDIS_READY_CHECK !== 'false',
      connectTimeout: parseInt(config.REDIS_CONNECT_TIMEOUT) || 10000
    };

    res.json({
      success: true,
      service,
      redis: redisConfig
    });
  } catch (error) {
    logger.error(`Error fetching Redis config for ${req.params.service}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/advanced-config/:service/redis - Update Redis configuration
router.post('/:service/redis', async (req, res) => {
  try {
    const { service } = req.params;
    const { redis } = req.body;

    const config = await loadServiceConfig(service);

    config.REDIS_ENABLED = redis.enabled ? 'true' : 'false';
    config.REDIS_HOST = redis.host;
    config.REDIS_PORT = redis.port;
    config.REDIS_PASSWORD = redis.password;
    config.REDIS_DB = redis.db;
    config.REDIS_KEY_PREFIX = redis.keyPrefix;
    config.REDIS_TLS = redis.tls ? 'true' : 'false';
    config.REDIS_MAX_RETRIES = redis.maxRetriesPerRequest;
    config.REDIS_READY_CHECK = redis.enableReadyCheck ? 'true' : 'false';
    config.REDIS_CONNECT_TIMEOUT = redis.connectTimeout;

    await saveServiceConfig(service, config);

    res.json({
      success: true,
      message: 'Redis configuration updated',
      service
    });
  } catch (error) {
    logger.error(`Error updating Redis config for ${req.params.service}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * DATABASE ADMINISTRATION
 * ═══════════════════════════════════════════════════════════════════════
 */

// GET /api/advanced-config/:service/database - Get database configuration
router.get('/:service/database', async (req, res) => {
  try {
    const { service } = req.params;
    const config = await loadServiceConfig(service);

    const dbConfig = {
      host: config[`${service.toUpperCase()}_DB_HOST`] || config.DB_HOST || 'localhost',
      port: parseInt(config[`${service.toUpperCase()}_DB_PORT`] || config.DB_PORT) || 5432,
      database: config[`${service.toUpperCase()}_DB_NAME`] || config.DB_NAME || `exprsn_${service}`,
      user: config[`${service.toUpperCase()}_DB_USER`] || config.DB_USER || 'postgres',
      password: config[`${service.toUpperCase()}_DB_PASSWORD`] || config.DB_PASSWORD || '',
      ssl: config[`${service.toUpperCase()}_DB_SSL`] || config.DB_SSL === 'true',
      poolMin: parseInt(config.DB_POOL_MIN) || 2,
      poolMax: parseInt(config.DB_POOL_MAX) || 10,
      dialect: config.DB_DIALECT || 'postgres'
    };

    res.json({
      success: true,
      service,
      database: dbConfig
    });
  } catch (error) {
    logger.error(`Error fetching database config for ${req.params.service}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/advanced-config/:service/database - Update database configuration
router.post('/:service/database', async (req, res) => {
  try {
    const { service } = req.params;
    const { database } = req.body;

    const config = await loadServiceConfig(service);

    const prefix = `${service.toUpperCase()}_DB_`;
    config[`${prefix}HOST`] = database.host;
    config[`${prefix}PORT`] = database.port;
    config[`${prefix}NAME`] = database.database;
    config[`${prefix}USER`] = database.user;
    config[`${prefix}PASSWORD`] = database.password;
    config[`${prefix}SSL`] = database.ssl ? 'true' : 'false';
    config.DB_POOL_MIN = database.poolMin;
    config.DB_POOL_MAX = database.poolMax;

    await saveServiceConfig(service, config);

    res.json({
      success: true,
      message: 'Database configuration updated',
      service
    });
  } catch (error) {
    logger.error(`Error updating database config for ${req.params.service}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * JWT KEY MANAGEMENT
 * ═══════════════════════════════════════════════════════════════════════
 */

// GET /api/advanced-config/jwt/keys - Get JWT keys status
router.get('/jwt/keys', async (req, res) => {
  try {
    const mainConfig = await loadServiceConfig('main');

    const jwtKeys = {
      hasPrivateKey: !!mainConfig.JWT_PRIVATE_KEY,
      hasPublicKey: !!mainConfig.JWT_PUBLIC_KEY,
      algorithm: mainConfig.JWT_ALGORITHM || 'RS256',
      issuer: mainConfig.JWT_ISSUER || 'exprsn-ca',
      accessTokenExpiry: parseInt(mainConfig.JWT_ACCESS_TOKEN_EXPIRY) || 3600,
      refreshTokenExpiry: parseInt(mainConfig.JWT_REFRESH_TOKEN_EXPIRY) || 2592000
    };

    res.json({
      success: true,
      jwt: jwtKeys
    });
  } catch (error) {
    logger.error('Error fetching JWT keys:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/advanced-config/jwt/status - Get JWT keys status (simplified)
router.get('/jwt/status', async (req, res) => {
  try {
    const mainConfig = await loadServiceConfig('main');

    res.json({
      success: true,
      data: {
        privateKeySet: !!mainConfig.JWT_PRIVATE_KEY,
        publicKeySet: !!mainConfig.JWT_PUBLIC_KEY,
        algorithm: mainConfig.JWT_ALGORITHM || 'RS256'
      }
    });
  } catch (error) {
    logger.error('Error fetching JWT status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/advanced-config/jwt/generate - Generate new JWT keys
router.post('/jwt/generate', async (req, res) => {
  try {
    const { keySize = 4096 } = req.body;

    // Generate RSA key pair
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: keySize,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });

    // Base64 encode for .env storage
    const privateKeyBase64 = Buffer.from(privateKey).toString('base64');
    const publicKeyBase64 = Buffer.from(publicKey).toString('base64');

    res.json({
      success: true,
      message: 'JWT keys generated (not yet saved)',
      data: {
        privateKey: privateKeyBase64,
        publicKey: publicKeyBase64,
        keySize
      }
    });
  } catch (error) {
    logger.error('Error generating JWT keys:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/advanced-config/jwt/save - Save JWT keys to .env files
router.post('/jwt/save', async (req, res) => {
  try {
    const { privateKey, publicKey } = req.body;

    if (!privateKey || !publicKey) {
      return res.status(400).json({
        success: false,
        error: 'Both privateKey and publicKey are required'
      });
    }

    // Load main .env config
    const config = await loadServiceConfig('main');
    config.JWT_PRIVATE_KEY = privateKey;
    config.JWT_PUBLIC_KEY = publicKey;

    // Save to main .env
    await saveServiceConfig('main', config);

    // Also update auth service .env if it exists
    try {
      const authConfig = await loadServiceConfig('auth');
      authConfig.JWT_PRIVATE_KEY = privateKey;
      authConfig.JWT_PUBLIC_KEY = publicKey;
      await saveServiceConfig('auth', authConfig);
    } catch (error) {
      logger.warn('Could not update auth .env:', error.message);
    }

    res.json({
      success: true,
      message: 'JWT keys saved successfully to .env files'
    });
  } catch (error) {
    logger.error('Error saving JWT keys:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * CSP/SECURITY HEADERS
 * ═══════════════════════════════════════════════════════════════════════
 */

// GET /api/advanced-config/:service/security - Get security configuration
router.get('/:service/security', async (req, res) => {
  try {
    const { service } = req.params;
    const config = await loadServiceConfig(service);

    const securityConfig = {
      cspEnabled: config.CSP_ENABLED !== 'false',
      cspDefaultSrc: config.CSP_DEFAULT_SRC || "'self'",
      cspScriptSrc: config.CSP_SCRIPT_SRC || "'self' 'unsafe-inline'",
      cspStyleSrc: config.CSP_STYLE_SRC || "'self' 'unsafe-inline'",
      cspImgSrc: config.CSP_IMG_SRC || "'self' data: https:",
      corsOrigins: config.CORS_ORIGINS || '*',
      rateLimitEnabled: config.RATE_LIMIT_ENABLED !== 'false',
      rateLimitWindow: parseInt(config.RATE_LIMIT_WINDOW_MS) || 900000,
      rateLimitMax: parseInt(config.RATE_LIMIT_MAX_REQUESTS) || 100
    };

    res.json({
      success: true,
      service,
      security: securityConfig
    });
  } catch (error) {
    logger.error(`Error fetching security config for ${req.params.service}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/advanced-config/:service/security - Update security configuration
router.post('/:service/security', async (req, res) => {
  try {
    const { service } = req.params;
    const { security } = req.body;

    const config = await loadServiceConfig(service);

    config.CSP_ENABLED = security.cspEnabled ? 'true' : 'false';
    config.CSP_DEFAULT_SRC = security.cspDefaultSrc;
    config.CSP_SCRIPT_SRC = security.cspScriptSrc;
    config.CSP_STYLE_SRC = security.cspStyleSrc;
    config.CSP_IMG_SRC = security.cspImgSrc;
    config.CORS_ORIGINS = security.corsOrigins;
    config.RATE_LIMIT_ENABLED = security.rateLimitEnabled ? 'true' : 'false';
    config.RATE_LIMIT_WINDOW_MS = security.rateLimitWindow;
    config.RATE_LIMIT_MAX_REQUESTS = security.rateLimitMax;

    await saveServiceConfig(service, config);

    res.json({
      success: true,
      message: 'Security configuration updated',
      service
    });
  } catch (error) {
    logger.error(`Error updating security config for ${req.params.service}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * SERVICE LINKING (BRIDGE, AUTH TOKENS)
 * ═══════════════════════════════════════════════════════════════════════
 */

// GET /api/advanced-config/:service/linking - Get service linking configuration
router.get('/:service/linking', async (req, res) => {
  try {
    const { service } = req.params;
    const config = await loadServiceConfig(service);

    const linkingConfig = {
      caUrl: config.CA_URL || 'http://localhost:3000',
      authUrl: config.AUTH_URL || 'http://localhost:3001',
      bridgeUrl: config.BRIDGE_URL || 'http://localhost:3010',
      serviceToken: config.SERVICE_TOKEN || '',
      useBridge: config.USE_BRIDGE === 'true',
      requireAuth: config.REQUIRE_AUTH !== 'false'
    };

    res.json({
      success: true,
      service,
      linking: linkingConfig
    });
  } catch (error) {
    logger.error(`Error fetching linking config for ${req.params.service}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/advanced-config/:service/linking - Update service linking
router.post('/:service/linking', async (req, res) => {
  try {
    const { service } = req.params;
    const { linking } = req.body;

    const config = await loadServiceConfig(service);

    config.CA_URL = linking.caUrl;
    config.AUTH_URL = linking.authUrl;
    config.BRIDGE_URL = linking.bridgeUrl;
    config.SERVICE_TOKEN = linking.serviceToken;
    config.USE_BRIDGE = linking.useBridge ? 'true' : 'false';
    config.REQUIRE_AUTH = linking.requireAuth ? 'true' : 'false';

    await saveServiceConfig(service, config);

    res.json({
      success: true,
      message: 'Service linking updated',
      service
    });
  } catch (error) {
    logger.error(`Error updating linking config for ${req.params.service}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * HELPER FUNCTIONS
 * ═══════════════════════════════════════════════════════════════════════
 */

function parseEnvFile(content) {
  const config = {};
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();

      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      config[key] = value;
    }
  }

  return config;
}

function generateEnvFile(config, service) {
  const sections = categorizeConfig(config, service);
  let content = `# Exprsn ${service.charAt(0).toUpperCase() + service.slice(1)} Configuration\n`;
  content += `# Generated: ${new Date().toISOString()}\n\n`;

  for (const [sectionName, sectionConfig] of Object.entries(sections)) {
    content += `# ${sectionName}\n`;
    for (const [key, value] of Object.entries(sectionConfig)) {
      content += `${key}=${value}\n`;
    }
    content += '\n';
  }

  return content;
}

function categorizeConfig(config, service) {
  const sections = {
    'Core Settings': {},
    'Database': {},
    'Redis': {},
    'TLS/Security': {},
    'Service Linking': {},
    'Other': {}
  };

  for (const [key, value] of Object.entries(config)) {
    if (key.includes('DB_') || key.includes('DATABASE')) {
      sections['Database'][key] = value;
    } else if (key.includes('REDIS')) {
      sections['Redis'][key] = value;
    } else if (key.includes('TLS') || key.includes('SSL') || key.includes('CSP') || key.includes('CORS')) {
      sections['TLS/Security'][key] = value;
    } else if (key.includes('_URL') || key.includes('SERVICE_TOKEN') || key.includes('BRIDGE')) {
      sections['Service Linking'][key] = value;
    } else if (key.includes('PORT') || key.includes('HOST') || key.includes('ENV')) {
      sections['Core Settings'][key] = value;
    } else {
      sections['Other'][key] = value;
    }
  }

  return sections;
}

function mergeSections(sections) {
  const config = {};
  for (const section of Object.values(sections)) {
    Object.assign(config, section);
  }
  return config;
}

async function loadServiceConfig(service) {
  const envPath = service === 'main'
    ? path.join(__dirname, '../../../../', '.env')
    : path.join(__dirname, '../../../../', `.env.${service}`);

  try {
    const content = await fs.readFile(envPath, 'utf-8');
    return parseEnvFile(content);
  } catch (error) {
    return {};
  }
}

async function saveServiceConfig(service, config) {
  const envPath = service === 'main'
    ? path.join(__dirname, '../../../../', '.env')
    : path.join(__dirname, '../../../../', `.env.${service}`);

  const content = generateEnvFile(config, service);
  await fs.writeFile(envPath, content, 'utf-8');
}

function mergeEnvConfig(existingContent, newConfig) {
  const existing = parseEnvFile(existingContent);
  const merged = { ...existing, ...newConfig };
  return generateEnvFile(merged, 'main');
}

/**
 * ═══════════════════════════════════════════════════════════════════════
 * FORGE SCHEMA MANAGEMENT
 * ═══════════════════════════════════════════════════════════════════════
 */

const axios = require('axios');

// Helper to proxy requests to Forge service
async function proxyToForge(endpoint, method = 'GET', data = null) {
  const forgeUrl = process.env.FORGE_URL || 'http://localhost:3016';
  const url = `${forgeUrl}${endpoint}`;

  try {
    const response = await axios({
      method,
      url,
      data,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  } catch (error) {
    logger.error(`Forge proxy error (${method} ${endpoint}):`, error.message);
    throw new Error(error.response?.data?.error || error.message);
  }
}

// GET /api/advanced-config/forge/schemas - List all schemas
router.get('/forge/schemas', async (req, res) => {
  try {
    const data = await proxyToForge('/api/schemas', 'GET');
    res.json(data);
  } catch (error) {
    logger.error('Error fetching Forge schemas:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/advanced-config/forge/schemas/statistics - Get schema statistics
router.get('/forge/schemas/statistics', async (req, res) => {
  try {
    const data = await proxyToForge('/api/schemas/statistics', 'GET');
    res.json(data);
  } catch (error) {
    logger.error('Error fetching Forge schema statistics:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/advanced-config/forge/schemas - Create new schema
router.post('/forge/schemas', async (req, res) => {
  try {
    const data = await proxyToForge('/api/schemas', 'POST', req.body);
    res.json(data);
  } catch (error) {
    logger.error('Error creating Forge schema:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/advanced-config/forge/schemas/:id - Get specific schema
router.get('/forge/schemas/:id', async (req, res) => {
  try {
    const data = await proxyToForge(`/api/schemas/${req.params.id}`, 'GET');
    res.json(data);
  } catch (error) {
    logger.error(`Error fetching Forge schema ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// PUT /api/advanced-config/forge/schemas/:id - Update schema
router.put('/forge/schemas/:id', async (req, res) => {
  try {
    const data = await proxyToForge(`/api/schemas/${req.params.id}`, 'PUT', req.body);
    res.json(data);
  } catch (error) {
    logger.error(`Error updating Forge schema ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// DELETE /api/advanced-config/forge/schemas/:id - Delete schema
router.delete('/forge/schemas/:id', async (req, res) => {
  try {
    const data = await proxyToForge(`/api/schemas/${req.params.id}`, 'DELETE');
    res.json(data);
  } catch (error) {
    logger.error(`Error deleting Forge schema ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/advanced-config/forge/schemas/:id/activate - Activate schema
router.post('/forge/schemas/:id/activate', async (req, res) => {
  try {
    const data = await proxyToForge(`/api/schemas/${req.params.id}/activate`, 'POST');
    res.json(data);
  } catch (error) {
    logger.error(`Error activating Forge schema ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/advanced-config/forge/schemas/:id/deprecate - Deprecate schema
router.post('/forge/schemas/:id/deprecate', async (req, res) => {
  try {
    const data = await proxyToForge(`/api/schemas/${req.params.id}/deprecate`, 'POST');
    res.json(data);
  } catch (error) {
    logger.error(`Error deprecating Forge schema ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
