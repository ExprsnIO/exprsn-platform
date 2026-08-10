/**
 * Service Discovery Module
 * Detects running Exprsn services on localhost ports 3000-3014
 */

const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Service definitions with expected ports and metadata
 * Updated to include ALL 18 production services
 */
const SERVICE_DEFINITIONS = {
  'exprsn-ca': { port: 3000, name: 'Certificate Authority', status: 'production', category: 'core', description: 'X.509 CA, OCSP, CRL, CA Tokens' },
  'exprsn-auth': { port: 3001, name: 'Authentication & SSO', status: 'production', category: 'core', description: 'OAuth2, OIDC, SAML, MFA' },
  'exprsn-spark': { port: 3002, name: 'Real-time Messaging', status: 'production', category: 'messaging', description: 'E2EE messaging, Socket.IO' },
  'exprsn-timeline': { port: 3004, name: 'Social Feed', status: 'production', category: 'content', description: 'Posts, interactions, Bull queues' },
  'exprsn-prefetch': { port: 3005, name: 'Timeline Prefetching', status: 'production', category: 'infrastructure', description: 'Timeline cache service' },
  'exprsn-moderator': { port: 3006, name: 'Content Moderation', status: 'production', category: 'content', description: 'AI moderation, Herald integration' },
  'exprsn-filevault': { port: 3007, name: 'File Storage', status: 'production', category: 'media', description: 'S3/Disk/IPFS, versioning, deduplication' },
  'exprsn-gallery': { port: 3008, name: 'Media Galleries', status: 'production', category: 'media', description: 'Albums, image processing, filters' },
  'exprsn-live': { port: 3009, name: 'Live Streaming', status: 'production', category: 'media', description: 'Cloudflare Stream, WebRTC, recordings' },
  'exprsn-bridge': { port: 3010, name: 'API Gateway', status: 'production', category: 'infrastructure', description: 'Proxy, rate limiting, JSONLex, 21 lexicons' },
  'exprsn-nexus': { port: 3011, name: 'Groups & Events', status: 'production', category: 'content', description: 'CalDAV, CardDAV, trending' },
  'exprsn-pulse': { port: 3012, name: 'Analytics & Metrics', status: 'production', category: 'infrastructure', description: 'Prometheus metrics, tracking' },
  'exprsn-vault': { port: 3013, name: 'Secrets Management', status: 'production', category: 'infrastructure', description: 'Encryption keys, credentials' },
  'exprsn-herald': { port: 3014, name: 'Notifications', status: 'production', category: 'messaging', description: 'Push, email, SMS, Socket.IO' },
  'exprsn-setup': { port: 3015, name: 'Setup & Management', status: 'production', category: 'core', description: 'Service discovery, configuration' },
  'exprsn-forge': { port: 3016, name: 'Business Platform', status: 'partial', category: 'automation', description: 'CRM 100%, Groupware 40%, ERP 15%' },
  'exprsn-workflow': { port: 3017, name: 'Workflow Automation', status: 'production', category: 'automation', description: '15 step types, JSONLex, approvals' },
  'exprsn-svr': { port: 5000, name: 'Dynamic Pages', status: 'production', category: 'automation', description: 'EJS templates, server-side execution' }
};

/**
 * Check if a service is running on a specific port
 * @param {number} port - Port to check
 * @param {number} timeout - Request timeout in ms
 * @returns {Promise<Object|null>} Service info or null if not running
 */
async function checkServicePort(port, timeout = 2000) {
  try {
    const response = await axios.get(`http://localhost:${port}/health`, {
      timeout,
      validateStatus: () => true // Accept any status code
    });

    return {
      port,
      running: response.status < 500,
      statusCode: response.status,
      data: response.data || {}
    };
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      return { port, running: false, error: 'Connection refused' };
    }
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      return { port, running: false, error: 'Timeout' };
    }
    return { port, running: false, error: error.message };
  }
}

/**
 * Identify service from health endpoint response
 * @param {Object} healthData - Health endpoint response data
 * @param {number} port - Service port
 * @returns {string|null} Service identifier
 */
function identifyService(healthData, port) {
  // Try to identify from health data
  if (healthData.service) {
    return healthData.service;
  }
  if (healthData.name) {
    return healthData.name;
  }

  // Fallback to port-based identification
  for (const [serviceId, config] of Object.entries(SERVICE_DEFINITIONS)) {
    if (config.port === port) {
      return serviceId;
    }
  }

  return null;
}

/**
 * Discover all running Exprsn services
 * @returns {Promise<Array>} Array of discovered services
 */
async function discoverServices() {
  logger.info('Starting service discovery...');

  const discoveryPromises = Object.entries(SERVICE_DEFINITIONS).map(
    async ([serviceId, config]) => {
      const result = await checkServicePort(config.port);

      const service = {
        id: serviceId,
        name: config.name,
        port: config.port,
        running: result.running,
        implementationStatus: config.status,
        health: result.running ? 'healthy' : 'stopped'
      };

      if (result.running) {
        // Extract additional info from health endpoint
        service.version = result.data.version || 'unknown';
        service.uptime = result.data.uptime || 0;
        service.environment = result.data.environment || 'unknown';

        // Check component health
        if (result.data.database !== undefined) {
          service.databaseHealth = result.data.database;
        }
        if (result.data.redis !== undefined) {
          service.redisHealth = result.data.redis;
        }
        if (result.data.status) {
          service.health = result.data.status;
        }

        logger.info(`Discovered ${serviceId} on port ${config.port}`);
      } else {
        service.error = result.error;
        logger.debug(`Service ${serviceId} not running on port ${config.port}: ${result.error}`);
      }

      return service;
    }
  );

  const services = await Promise.all(discoveryPromises);

  const runningCount = services.filter(s => s.running).length;
  logger.info(`Discovery complete: ${runningCount}/${services.length} services running`);

  return services;
}

/**
 * Get detailed information about a specific service
 * @param {string} serviceId - Service identifier
 * @returns {Promise<Object|null>} Service details or null if not found
 */
async function getServiceDetails(serviceId) {
  const config = SERVICE_DEFINITIONS[serviceId];
  if (!config) {
    logger.warn(`Unknown service: ${serviceId}`);
    return null;
  }

  const result = await checkServicePort(config.port, 5000);

  if (!result.running) {
    return {
      id: serviceId,
      name: config.name,
      port: config.port,
      running: false,
      error: result.error
    };
  }

  // Get additional endpoints
  const details = {
    id: serviceId,
    name: config.name,
    port: config.port,
    running: true,
    health: result.data
  };

  // Try to get version info
  try {
    const versionResponse = await axios.get(`http://localhost:${config.port}/api/version`, {
      timeout: 2000,
      validateStatus: () => true
    });
    if (versionResponse.status === 200) {
      details.version = versionResponse.data;
    }
  } catch (error) {
    // Version endpoint not available
  }

  // Try to get stats
  try {
    const statsResponse = await axios.get(`http://localhost:${config.port}/api/stats`, {
      timeout: 2000,
      validateStatus: () => true
    });
    if (statsResponse.status === 200) {
      details.stats = statsResponse.data;
    }
  } catch (error) {
    // Stats endpoint not available
  }

  return details;
}

/**
 * Check if a specific service is running
 * @param {string} serviceId - Service identifier
 * @returns {Promise<boolean>} True if running
 */
async function isServiceRunning(serviceId) {
  const config = SERVICE_DEFINITIONS[serviceId];
  if (!config) {
    return false;
  }

  const result = await checkServicePort(config.port, 1000);
  return result.running;
}

/**
 * Get production-ready services
 * @returns {Promise<Array>} Array of production-ready services
 */
async function getProductionReadyServices() {
  const allServices = await discoverServices();
  return allServices.filter(s => s.implementationStatus === 'production');
}

/**
 * Get service definitions (without runtime status)
 * @returns {Object} Service definitions
 */
function getServiceDefinitions() {
  return SERVICE_DEFINITIONS;
}

module.exports = {
  discoverServices,
  getServiceDetails,
  isServiceRunning,
  getProductionReadyServices,
  getServiceDefinitions,
  checkServicePort,
  SERVICE_DEFINITIONS
};
