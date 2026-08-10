/**
 * ═══════════════════════════════════════════════════════════════════════
 * Service Health Service
 * ═══════════════════════════════════════════════════════════════════════
 * Monitors health of all 21 Exprsn microservices
 * ═══════════════════════════════════════════════════════════════════════
 */

const axios = require('axios');
const logger = require('../../utils/logger');
const { sequelize } = require('../../config/database');
const Redis = require('ioredis');
const config = require('../../config');

const SERVICE_DEFINITIONS = {
  'exprsn-ca': { port: 3000, name: 'Certificate Authority', category: 'core' },
  'exprsn-auth': { port: 3001, name: 'Authentication & SSO', category: 'core' },
  'exprsn-spark': { port: 3002, name: 'Real-time Messaging', category: 'messaging' },
  'exprsn-timeline': { port: 3004, name: 'Social Feed', category: 'content' },
  'exprsn-prefetch': { port: 3005, name: 'Timeline Prefetching', category: 'infrastructure' },
  'exprsn-moderator': { port: 3006, name: 'Content Moderation', category: 'content' },
  'exprsn-filevault': { port: 3007, name: 'File Storage', category: 'media' },
  'exprsn-gallery': { port: 3008, name: 'Media Galleries', category: 'media' },
  'exprsn-live': { port: 3009, name: 'Live Streaming', category: 'media' },
  'exprsn-bridge': { port: 3010, name: 'API Gateway', category: 'infrastructure' },
  'exprsn-nexus': { port: 3011, name: 'Groups & Events', category: 'content' },
  'exprsn-pulse': { port: 3012, name: 'Analytics & Metrics', category: 'infrastructure' },
  'exprsn-vault': { port: 3013, name: 'Secrets Management', category: 'infrastructure' },
  'exprsn-herald': { port: 3014, name: 'Notifications', category: 'messaging' },
  'exprsn-setup': { port: 3015, name: 'Setup & Management', category: 'core' },
  'exprsn-forge': { port: 3016, name: 'Business Platform', category: 'automation' },
  'exprsn-workflow': { port: 3017, name: 'Workflow Automation', category: 'automation' },
  'exprsn-payments': { port: 3018, name: 'Payment Processing', category: 'commerce' },
  'exprsn-atlas': { port: 3019, name: 'Geospatial Services', category: 'infrastructure' },
  'exprsn-svr': { port: 5001, name: 'Business Hub (SVR)', category: 'automation' }
};

class ServiceHealthService {
  /**
   * Get complete system health overview
   */
  async getSystemHealth() {
    try {
      const [serviceHealth, databaseHealth, redisHealth] = await Promise.all([
        this.checkAllServices(),
        this.checkDatabase(),
        this.checkRedis()
      ]);

      const servicesRunning = serviceHealth.filter(s => s.status === 'running').length;
      const totalServices = serviceHealth.length;

      return {
        overall: {
          status: this.calculateOverallStatus(serviceHealth, databaseHealth, redisHealth),
          timestamp: new Date().toISOString()
        },
        services: {
          running: servicesRunning,
          total: totalServices,
          percentage: Math.round((servicesRunning / totalServices) * 100),
          details: serviceHealth
        },
        database: databaseHealth,
        redis: redisHealth
      };
    } catch (error) {
      logger.error('Error getting system health:', error);
      throw error;
    }
  }

  /**
   * Check all microservices
   */
  async checkAllServices() {
    const results = [];

    for (const [serviceId, serviceDef] of Object.entries(SERVICE_DEFINITIONS)) {
      const health = await this.checkService(serviceDef.port);
      results.push({
        id: serviceId,
        name: serviceDef.name,
        category: serviceDef.category,
        port: serviceDef.port,
        status: health.running ? 'running' : 'stopped',
        responseTime: health.responseTime,
        uptime: health.uptime,
        url: `http://localhost:${serviceDef.port}`
      });
    }

    return results;
  }

  /**
   * Check individual service
   */
  async checkService(port, timeout = 2000) {
    const startTime = Date.now();

    try {
      const response = await axios.get(`http://localhost:${port}/health`, {
        timeout,
        validateStatus: () => true
      });

      const responseTime = Date.now() - startTime;

      return {
        running: response.status < 500,
        responseTime,
        uptime: response.data?.uptime || null,
        data: response.data || {}
      };
    } catch (error) {
      return {
        running: false,
        responseTime: Date.now() - startTime,
        uptime: null,
        error: error.code || error.message
      };
    }
  }

  /**
   * Check database health
   */
  async checkDatabase() {
    try {
      await sequelize.authenticate();
      const [result] = await sequelize.query('SELECT version();');

      return {
        status: 'healthy',
        connected: true,
        version: result[0].version,
        database: config.database.name,
        host: config.database.host,
        port: config.database.port
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        connected: false,
        error: error.message,
        database: config.database.name,
        host: config.database.host,
        port: config.database.port
      };
    }
  }

  /**
   * Check Redis health
   */
  async checkRedis() {
    if (!config.redis.enabled) {
      return {
        status: 'disabled',
        enabled: false,
        connected: false
      };
    }

    let client;
    try {
      client = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password || undefined,
        db: config.redis.db,
        retryStrategy: () => null,
        lazyConnect: true
      });

      await client.connect();
      await client.ping();
      const info = await client.info('server');

      const versionMatch = info.match(/redis_version:([^\r\n]+)/);
      const version = versionMatch ? versionMatch[1] : 'unknown';

      await client.quit();

      return {
        status: 'healthy',
        enabled: true,
        connected: true,
        host: config.redis.host,
        port: config.redis.port,
        version
      };
    } catch (error) {
      if (client) {
        try { await client.quit(); } catch (e) { /* ignore */ }
      }
      return {
        status: 'unhealthy',
        enabled: true,
        connected: false,
        host: config.redis.host,
        port: config.redis.port,
        error: error.message
      };
    }
  }

  /**
   * Calculate overall system status
   */
  calculateOverallStatus(services, database, redis) {
    // Critical services that must be running
    const criticalServices = ['exprsn-ca', 'exprsn-svr'];
    const criticalRunning = services
      .filter(s => criticalServices.includes(s.id))
      .every(s => s.status === 'running');

    if (!criticalRunning || !database.connected) {
      return 'critical';
    }

    const servicesRunningPct = services.filter(s => s.status === 'running').length / services.length;

    if (servicesRunningPct >= 0.9) {
      return 'healthy';
    } else if (servicesRunningPct >= 0.7) {
      return 'degraded';
    } else {
      return 'unhealthy';
    }
  }

  /**
   * Get service categories with health status
   */
  async getServicesByCategory() {
    const services = await this.checkAllServices();
    const categories = {};

    for (const service of services) {
      if (!categories[service.category]) {
        categories[service.category] = {
          name: service.category,
          services: [],
          running: 0,
          total: 0
        };
      }

      categories[service.category].services.push(service);
      categories[service.category].total++;
      if (service.status === 'running') {
        categories[service.category].running++;
      }
    }

    return Object.values(categories);
  }
}

module.exports = new ServiceHealthService();
