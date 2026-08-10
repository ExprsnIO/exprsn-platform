const axios = require('axios');
const logger = require('../../utils/logger');
const redis = require('../../config/redis');

const SETUP_SERVICE_URL = process.env.SETUP_SERVICE_URL || 'http://localhost:3015';
const SERVICE_DISCOVERY_ENABLED = process.env.SERVICE_DISCOVERY_ENABLED !== 'false';
const CACHE_TTL = parseInt(process.env.SERVICE_CACHE_TTL) || 300; // 5 minutes

class ServiceDiscovery {
  constructor() {
    this.services = new Map();
    this.setupUrl = SETUP_SERVICE_URL;
    this.enabled = SERVICE_DISCOVERY_ENABLED;
  }

  /**
   * Register this service with Setup service
   */
  async register() {
    if (!this.enabled) {
      logger.info('Service discovery disabled');
      return true;
    }

    try {
      const response = await axios.post(
        `${this.setupUrl}/api/services/register`,
        {
          name: 'exprsn-forge',
          port: parseInt(process.env.FORGE_PORT) || 3016,
          version: '1.0.0',
          status: 'running',
          features: {
            groupware: process.env.ENABLE_GROUPWARE === 'true',
            crm: process.env.ENABLE_CRM === 'true',
            erp: process.env.ENABLE_ERP === 'true',
            workflows: process.env.ENABLE_WORKFLOWS === 'true',
            reporting: process.env.ENABLE_REPORTING === 'true'
          },
          metadata: {
            description: 'Forge Business Management Platform',
            modules: ['groupware', 'crm', 'erp']
          }
        },
        { timeout: 5000 }
      );

      logger.info('Service registered with Setup service', {
        service: 'exprsn-forge',
        setupUrl: this.setupUrl
      });

      return response.data.success;
    } catch (error) {
      logger.error('Failed to register service', {
        error: error.message,
        setupUrl: this.setupUrl
      });
      return false;
    }
  }

  /**
   * Discover service URL by name
   */
  async discover(serviceName) {
    if (!this.enabled) {
      // Return default URLs when discovery is disabled
      return this.getDefaultUrl(serviceName);
    }

    // Check cache first
    const cacheKey = `forge:service:${serviceName}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return cached.url;
    }

    try {
      const response = await axios.get(
        `${this.setupUrl}/api/services/${serviceName}`,
        { timeout: 5000 }
      );

      if (response.data.success && response.data.service) {
        const serviceUrl = `http://${response.data.service.host || 'localhost'}:${response.data.service.port}`;

        // Cache the result
        await redis.set(cacheKey, { url: serviceUrl }, CACHE_TTL);

        this.services.set(serviceName, serviceUrl);

        logger.debug('Service discovered', {
          service: serviceName,
          url: serviceUrl
        });

        return serviceUrl;
      }

      throw new Error('Service not found');
    } catch (error) {
      logger.error('Service discovery failed', {
        service: serviceName,
        error: error.message
      });

      // Fallback to default URL
      return this.getDefaultUrl(serviceName);
    }
  }

  /**
   * Get default service URL
   */
  getDefaultUrl(serviceName) {
    const defaults = {
      'exprsn-ca': process.env.CA_SERVICE_URL || 'http://localhost:3000',
      'exprsn-auth': process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
      'exprsn-spark': process.env.SPARK_SERVICE_URL || 'http://localhost:3002',
      'exprsn-timeline': process.env.TIMELINE_SERVICE_URL || 'http://localhost:3004',
      'exprsn-prefetch': process.env.PREFETCH_SERVICE_URL || 'http://localhost:3005',
      'exprsn-moderator': process.env.MODERATOR_SERVICE_URL || 'http://localhost:3006',
      'exprsn-filevault': process.env.FILEVAULT_SERVICE_URL || 'http://localhost:3007',
      'exprsn-gallery': process.env.GALLERY_SERVICE_URL || 'http://localhost:3008',
      'exprsn-live': process.env.LIVE_SERVICE_URL || 'http://localhost:3009',
      'exprsn-bridge': process.env.BRIDGE_SERVICE_URL || 'http://localhost:3010',
      'exprsn-nexus': process.env.NEXUS_SERVICE_URL || 'http://localhost:3011',
      'exprsn-pulse': process.env.PULSE_SERVICE_URL || 'http://localhost:3012',
      'exprsn-vault': process.env.VAULT_SERVICE_URL || 'http://localhost:3013',
      'exprsn-herald': process.env.HERALD_SERVICE_URL || 'http://localhost:3014',
      'exprsn-setup': process.env.SETUP_SERVICE_URL || 'http://localhost:3015',
      'exprsn-workflow': process.env.WORKFLOW_SERVICE_URL || 'http://localhost:3017'
    };

    return defaults[serviceName] || null;
  }

  /**
   * Get all available services
   */
  async getAllServices() {
    if (!this.enabled) {
      return Object.keys(this.getDefaultUrl(''));
    }

    try {
      const response = await axios.get(
        `${this.setupUrl}/api/services`,
        { timeout: 5000 }
      );

      if (response.data.success) {
        return response.data.services;
      }

      return [];
    } catch (error) {
      logger.error('Failed to get all services', {
        error: error.message
      });
      return [];
    }
  }

  /**
   * Check service health
   */
  async checkHealth(serviceName) {
    try {
      const serviceUrl = await this.discover(serviceName);
      if (!serviceUrl) {
        return { healthy: false, error: 'Service not found' };
      }

      const response = await axios.get(
        `${serviceUrl}/health`,
        { timeout: 3000 }
      );

      return {
        healthy: response.status === 200,
        data: response.data
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }

  /**
   * Send heartbeat to Setup service
   */
  async sendHeartbeat() {
    if (!this.enabled) {
      return true;
    }

    try {
      await axios.post(
        `${this.setupUrl}/api/services/heartbeat`,
        {
          name: 'exprsn-forge',
          status: 'running',
          timestamp: Date.now()
        },
        { timeout: 3000 }
      );

      return true;
    } catch (error) {
      logger.error('Heartbeat failed', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Start heartbeat interval
   */
  startHeartbeat(intervalMs = 30000) {
    if (!this.enabled) {
      return;
    }

    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, intervalMs);

    logger.info('Heartbeat started', { interval: intervalMs });
  }

  /**
   * Stop heartbeat interval
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      logger.info('Heartbeat stopped');
    }
  }
}

module.exports = new ServiceDiscovery();
