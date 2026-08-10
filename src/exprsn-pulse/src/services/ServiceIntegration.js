/**
 * Service Integration
 * Manages integration with other Exprsn services (Auth, Setup, Bridge)
 */

const axios = require('axios');
const logger = require('../utils/logger');

class ServiceIntegration {
  constructor() {
    this.services = {
      ca: process.env.CA_URL || 'http://localhost:3000',
      auth: process.env.AUTH_URL || 'http://localhost:3001',
      setup: process.env.SETUP_URL || 'http://localhost:3015',
      bridge: process.env.BRIDGE_URL || 'http://localhost:3010'
    };

    this.serviceToken = null;
    this.tokenExpiresAt = null;
    this.registrationId = null;
  }

  /**
   * Register service with exprsn-setup for discovery
   */
  async registerWithSetup() {
    try {
      const serviceInfo = {
        name: 'exprsn-pulse',
        displayName: 'Exprsn Pulse',
        description: 'Analytics & Business Intelligence Service',
        version: '1.0.0',
        port: process.env.PULSE_PORT || 3012,
        httpsPort: process.env.TLS_ENABLED === 'true' ? (process.env.HTTPS_PORT || 3443) : null,
        protocol: process.env.TLS_ENABLED === 'true' ? 'https' : 'http',
        healthEndpoint: '/health',
        metricsEndpoint: '/metrics',
        capabilities: [
          'analytics',
          'dashboards',
          'reports',
          'visualizations',
          'real-time-updates',
          'scheduled-reports'
        ],
        dependencies: ['exprsn-ca', 'exprsn-auth'],
        tags: ['analytics', 'business-intelligence', 'reporting']
      };

      const response = await axios.post(
        `${this.services.setup}/api/services/register`,
        serviceInfo,
        {
          timeout: 5000,
          headers: { 'Content-Type': 'application/json' }
        }
      );

      this.registrationId = response.data.id;

      logger.info('Service registered with exprsn-setup', {
        registrationId: this.registrationId,
        setupUrl: this.services.setup
      });

      // Start heartbeat
      this.startHeartbeat();

      return response.data;
    } catch (error) {
      logger.warn('Failed to register with exprsn-setup (service discovery disabled)', {
        error: error.message,
        setupUrl: this.services.setup
      });
      return null;
    }
  }

  /**
   * Send heartbeat to exprsn-setup
   */
  startHeartbeat() {
    // Send heartbeat every 30 seconds
    this.heartbeatInterval = setInterval(async () => {
      try {
        await axios.post(
          `${this.services.setup}/api/services/${this.registrationId}/heartbeat`,
          {
            status: 'healthy',
            timestamp: new Date().toISOString()
          },
          { timeout: 3000 }
        );

        logger.debug('Heartbeat sent to exprsn-setup');
      } catch (error) {
        logger.warn('Failed to send heartbeat to exprsn-setup', {
          error: error.message
        });
      }
    }, 30000);
  }

  /**
   * Stop heartbeat
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Deregister from exprsn-setup
   */
  async deregister() {
    try {
      this.stopHeartbeat();

      if (this.registrationId) {
        await axios.delete(
          `${this.services.setup}/api/services/${this.registrationId}`,
          { timeout: 3000 }
        );

        logger.info('Service deregistered from exprsn-setup');
      }
    } catch (error) {
      logger.warn('Failed to deregister from exprsn-setup', {
        error: error.message
      });
    }
  }

  /**
   * Get user details from exprsn-auth
   */
  async getUserDetails(userId, token) {
    try {
      const response = await axios.get(
        `${this.services.auth}/api/users/${userId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          },
          timeout: 5000
        }
      );

      return response.data.data;
    } catch (error) {
      logger.error('Failed to fetch user details from exprsn-auth', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get multiple users from exprsn-auth
   */
  async getUsers(userIds, token) {
    try {
      const response = await axios.post(
        `${this.services.auth}/api/users/batch`,
        { userIds },
        {
          headers: {
            Authorization: `Bearer ${token}`
          },
          timeout: 5000
        }
      );

      return response.data.data;
    } catch (error) {
      logger.error('Failed to fetch users from exprsn-auth', {
        userIds,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Get user roles from exprsn-auth
   */
  async getUserRoles(userId, token) {
    try {
      const response = await axios.get(
        `${this.services.auth}/api/users/${userId}/roles`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          },
          timeout: 5000
        }
      );

      return response.data.data;
    } catch (error) {
      logger.error('Failed to fetch user roles from exprsn-auth', {
        userId,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Get all roles from exprsn-auth
   */
  async getAllRoles(token) {
    try {
      const response = await axios.get(
        `${this.services.auth}/api/roles`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          },
          timeout: 5000
        }
      );

      return response.data.data;
    } catch (error) {
      logger.error('Failed to fetch roles from exprsn-auth', {
        error: error.message
      });
      return [];
    }
  }

  /**
   * Get all permissions from exprsn-auth
   */
  async getAllPermissions(token) {
    try {
      const response = await axios.get(
        `${this.services.auth}/api/permissions`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          },
          timeout: 5000
        }
      );

      return response.data.data;
    } catch (error) {
      logger.error('Failed to fetch permissions from exprsn-auth', {
        error: error.message
      });
      return [];
    }
  }

  /**
   * Discover available services via exprsn-setup
   */
  async discoverServices() {
    try {
      const response = await axios.get(
        `${this.services.setup}/api/services`,
        { timeout: 5000 }
      );

      const services = response.data.data;

      logger.info('Discovered services via exprsn-setup', {
        count: services.length,
        services: services.map(s => s.name)
      });

      return services;
    } catch (error) {
      logger.warn('Failed to discover services via exprsn-setup', {
        error: error.message
      });
      return [];
    }
  }

  /**
   * Get service URL by name
   */
  async getServiceUrl(serviceName) {
    try {
      const response = await axios.get(
        `${this.services.setup}/api/services/${serviceName}`,
        { timeout: 3000 }
      );

      const service = response.data.data;
      const protocol = service.httpsPort ? 'https' : 'http';
      const port = service.httpsPort || service.port;

      return `${protocol}://localhost:${port}`;
    } catch (error) {
      logger.warn(`Failed to get URL for service ${serviceName}`, {
        error: error.message
      });

      // Fallback to default URLs
      const defaults = {
        'exprsn-ca': 'http://localhost:3000',
        'exprsn-auth': 'http://localhost:3001',
        'exprsn-bridge': 'http://localhost:3010',
        'exprsn-setup': 'http://localhost:3015'
      };

      return defaults[serviceName] || null;
    }
  }

  /**
   * Check if a service is available
   */
  async isServiceAvailable(serviceName) {
    try {
      const url = await this.getServiceUrl(serviceName);
      if (!url) return false;

      const response = await axios.get(`${url}/health`, {
        timeout: 2000,
        validateStatus: (status) => status < 500
      });

      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get service health status
   */
  async getServiceHealth(serviceName) {
    try {
      const url = await this.getServiceUrl(serviceName);
      if (!url) {
        return { status: 'unavailable', service: serviceName };
      }

      const response = await axios.get(`${url}/health`, {
        timeout: 3000
      });

      return response.data;
    } catch (error) {
      return {
        status: 'unavailable',
        service: serviceName,
        error: error.message
      };
    }
  }

  /**
   * Update service URLs from environment
   */
  updateServiceUrls() {
    this.services = {
      ca: process.env.CA_URL || this.services.ca,
      auth: process.env.AUTH_URL || this.services.auth,
      setup: process.env.SETUP_URL || this.services.setup,
      bridge: process.env.BRIDGE_URL || this.services.bridge
    };

    logger.info('Service URLs updated', this.services);
  }
}

module.exports = new ServiceIntegration();
