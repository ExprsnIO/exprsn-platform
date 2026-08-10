/**
 * ═══════════════════════════════════════════════════════════════════════
 * Service Configuration Routes
 * API endpoints for managing service configurations with Socket.IO updates
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { ServiceConfiguration } = require('../models');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

/**
 * ═══════════════════════════════════════════════════════════════════════
 * SERVICE CONFIGURATION CRUD OPERATIONS
 * ═══════════════════════════════════════════════════════════════════════
 */

// GET /api/service-config - List all service configurations
router.get('/', async (req, res) => {
  try {
    const {
      enabled,
      status,
      setupCompleted,
      search
    } = req.query;

    const where = {};

    if (enabled !== undefined) where.enabled = enabled === 'true';
    if (status) where.status = status;
    if (setupCompleted !== undefined) where.setupCompleted = setupCompleted === 'true';

    if (search) {
      where[Op.or] = [
        { serviceId: { [Op.iLike]: `%${search}%` } },
        { serviceName: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const services = await ServiceConfiguration.findAll({
      where,
      order: [
        ['port', 'ASC']
      ]
    });

    res.json({
      success: true,
      services
    });
  } catch (error) {
    logger.error('Failed to list service configurations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list service configurations',
      message: error.message
    });
  }
});

// GET /api/service-config/stats - Get configuration statistics
router.get('/stats', async (req, res) => {
  try {
    const totalServices = await ServiceConfiguration.count();
    const configuredServices = await ServiceConfiguration.count({ where: { setupCompleted: true } });
    const enabledServices = await ServiceConfiguration.count({ where: { enabled: true } });
    const runningServices = await ServiceConfiguration.count({ where: { status: 'running' } });

    res.json({
      success: true,
      stats: {
        totalServices,
        configuredServices,
        enabledServices,
        runningServices,
        notConfigured: totalServices - configuredServices
      }
    });
  } catch (error) {
    logger.error('Failed to get service statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get service statistics',
      message: error.message
    });
  }
});

// GET /api/service-config/:serviceId - Get specific service configuration
router.get('/:serviceId', async (req, res) => {
  try {
    const { serviceId } = req.params;

    const service = await ServiceConfiguration.findOne({
      where: { serviceId }
    });

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Service not found'
      });
    }

    res.json({
      success: true,
      service
    });
  } catch (error) {
    logger.error(`Failed to get service configuration ${req.params.serviceId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get service configuration',
      message: error.message
    });
  }
});

// PUT /api/service-config/:serviceId - Update service configuration
router.put('/:serviceId', async (req, res) => {
  try {
    const { serviceId } = req.params;
    const {
      enabled,
      status,
      port,
      databaseEnabled,
      databaseName,
      redisEnabled,
      redisPrefix,
      config,
      envVars,
      features,
      healthCheckUrl,
      healthCheckInterval,
      dependencies,
      version,
      description,
      notes,
      setupSteps
    } = req.body;

    const service = await ServiceConfiguration.findOne({
      where: { serviceId }
    });

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Service not found'
      });
    }

    // Update fields
    const updates = {};
    if (enabled !== undefined) updates.enabled = enabled;
    if (status) updates.status = status;
    if (port !== undefined) updates.port = port;
    if (databaseEnabled !== undefined) updates.databaseEnabled = databaseEnabled;
    if (databaseName) updates.databaseName = databaseName;
    if (redisEnabled !== undefined) updates.redisEnabled = redisEnabled;
    if (redisPrefix) updates.redisPrefix = redisPrefix;
    if (config) updates.config = { ...service.config, ...config };
    if (envVars) updates.envVars = { ...service.envVars, ...envVars };
    if (features) updates.features = { ...service.features, ...features };
    if (healthCheckUrl) updates.healthCheckUrl = healthCheckUrl;
    if (healthCheckInterval !== undefined) updates.healthCheckInterval = healthCheckInterval;
    if (dependencies) updates.dependencies = dependencies;
    if (version) updates.version = version;
    if (description) updates.description = description;
    if (notes) updates.notes = notes;
    if (setupSteps) updates.setupSteps = { ...service.setupSteps, ...setupSteps };

    updates.lastConfiguredAt = new Date();

    await service.update(updates);

    logger.info(`Updated service configuration: ${service.serviceName} (${serviceId})`);

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('service-config:updated', {
        serviceId,
        updates,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      service
    });
  } catch (error) {
    logger.error(`Failed to update service configuration ${req.params.serviceId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to update service configuration',
      message: error.message
    });
  }
});

// POST /api/service-config/:serviceId/complete-setup - Mark setup as completed
router.post('/:serviceId/complete-setup', async (req, res) => {
  try {
    const { serviceId } = req.params;

    const service = await ServiceConfiguration.findOne({
      where: { serviceId }
    });

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Service not found'
      });
    }

    await service.markConfigured();

    logger.info(`Completed setup for service: ${service.serviceName} (${serviceId})`);

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('service-config:setup-completed', {
        serviceId,
        serviceName: service.serviceName,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      service
    });
  } catch (error) {
    logger.error(`Failed to complete setup for ${req.params.serviceId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete setup',
      message: error.message
    });
  }
});

// POST /api/service-config/:serviceId/enable - Enable service
router.post('/:serviceId/enable', async (req, res) => {
  try {
    const { serviceId } = req.params;

    const service = await ServiceConfiguration.findOne({
      where: { serviceId }
    });

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Service not found'
      });
    }

    await service.enable();

    logger.info(`Enabled service: ${service.serviceName} (${serviceId})`);

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('service-config:enabled', {
        serviceId,
        serviceName: service.serviceName,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      service
    });
  } catch (error) {
    logger.error(`Failed to enable service ${req.params.serviceId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to enable service',
      message: error.message
    });
  }
});

// POST /api/service-config/:serviceId/disable - Disable service
router.post('/:serviceId/disable', async (req, res) => {
  try {
    const { serviceId } = req.params;

    const service = await ServiceConfiguration.findOne({
      where: { serviceId }
    });

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Service not found'
      });
    }

    await service.disable();

    logger.info(`Disabled service: ${service.serviceName} (${serviceId})`);

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('service-config:disabled', {
        serviceId,
        serviceName: service.serviceName,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      service
    });
  } catch (error) {
    logger.error(`Failed to disable service ${req.params.serviceId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to disable service',
      message: error.message
    });
  }
});

// PUT /api/service-config/:serviceId/config - Update service-specific config
router.put('/:serviceId/config', async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { config } = req.body;

    if (!config || typeof config !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Config object is required'
      });
    }

    const service = await ServiceConfiguration.findOne({
      where: { serviceId }
    });

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Service not found'
      });
    }

    await service.updateConfig(config);

    logger.info(`Updated config for service: ${service.serviceName} (${serviceId})`);

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('service-config:config-updated', {
        serviceId,
        config,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      service
    });
  } catch (error) {
    logger.error(`Failed to update config for ${req.params.serviceId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to update config',
      message: error.message
    });
  }
});

// PUT /api/service-config/:serviceId/env - Update environment variables
router.put('/:serviceId/env', async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { envVars } = req.body;

    if (!envVars || typeof envVars !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'envVars object is required'
      });
    }

    const service = await ServiceConfiguration.findOne({
      where: { serviceId }
    });

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Service not found'
      });
    }

    service.envVars = { ...service.envVars, ...envVars };
    service.lastConfiguredAt = new Date();
    await service.save();

    logger.info(`Updated environment variables for service: ${service.serviceName} (${serviceId})`);

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('service-config:env-updated', {
        serviceId,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      service
    });
  } catch (error) {
    logger.error(`Failed to update env vars for ${req.params.serviceId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to update environment variables',
      message: error.message
    });
  }
});

// PUT /api/service-config/:serviceId/features - Update feature flags
router.put('/:serviceId/features', async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { features } = req.body;

    if (!features || typeof features !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'features object is required'
      });
    }

    const service = await ServiceConfiguration.findOne({
      where: { serviceId }
    });

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Service not found'
      });
    }

    service.features = { ...service.features, ...features };
    service.lastConfiguredAt = new Date();
    await service.save();

    logger.info(`Updated feature flags for service: ${service.serviceName} (${serviceId})`);

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('service-config:features-updated', {
        serviceId,
        features,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      service
    });
  } catch (error) {
    logger.error(`Failed to update features for ${req.params.serviceId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to update feature flags',
      message: error.message
    });
  }
});

// GET /api/service-config/:serviceId/metadata - Get service metadata
router.get('/:serviceId/metadata', async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { getServiceMetadata } = require('../config/serviceMetadata');

    const metadata = getServiceMetadata(serviceId);

    if (!metadata) {
      return res.status(404).json({
        success: false,
        error: 'Service metadata not found'
      });
    }

    res.json({
      success: true,
      metadata
    });
  } catch (error) {
    logger.error(`Failed to get service metadata ${req.params.serviceId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get service metadata',
      message: error.message
    });
  }
});

// GET /api/service-config/metadata/all - Get all service metadata
router.get('/metadata/all', async (req, res) => {
  try {
    const { getAllServiceMetadata } = require('../config/serviceMetadata');
    const metadata = getAllServiceMetadata();

    res.json({
      success: true,
      metadata
    });
  } catch (error) {
    logger.error('Failed to get all service metadata:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get service metadata',
      message: error.message
    });
  }
});

// POST /api/service-config/:serviceId/validate - Validate service configuration
router.post('/:serviceId/validate', async (req, res) => {
  try {
    const { serviceId } = req.params;
    const config = req.body;
    const { validateServiceConfiguration } = require('../config/serviceMetadata');

    const validation = validateServiceConfiguration(serviceId, config);

    res.json({
      success: validation.valid,
      validation
    });
  } catch (error) {
    logger.error(`Failed to validate configuration for ${req.params.serviceId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate configuration',
      message: error.message
    });
  }
});

// POST /api/service-config/initialize-all - Initialize all services from metadata
router.post('/initialize-all', async (req, res) => {
  try {
    const { getAllServiceMetadata } = require('../config/serviceMetadata');
    const metadata = getAllServiceMetadata();

    const initialized = [];
    const updated = [];
    const errors = [];

    for (const [serviceId, meta] of Object.entries(metadata)) {
      try {
        // Check if service already exists
        const existingService = await ServiceConfiguration.findOne({
          where: { serviceId }
        });

        const serviceData = {
          serviceId,
          serviceName: meta.serviceName,
          port: meta.port,
          databaseEnabled: meta.database?.enabled || false,
          databaseName: meta.database?.name || null,
          redisEnabled: meta.redis?.enabled || false,
          redisPrefix: meta.redis?.prefix || null,
          dependencies: meta.dependencies || [],
          version: meta.version || '1.0.0',
          description: meta.description || '',
          healthCheckUrl: `http://localhost:${meta.port}/health`,
          healthCheckInterval: 30000,
          enabled: true,
          status: 'not_configured'
        };

        if (existingService) {
          // Update existing service with metadata (preserve user config)
          await existingService.update({
            serviceName: serviceData.serviceName,
            description: serviceData.description,
            version: serviceData.version,
            port: serviceData.port,
            databaseEnabled: serviceData.databaseEnabled,
            databaseName: serviceData.databaseName,
            redisEnabled: serviceData.redisEnabled,
            redisPrefix: serviceData.redisPrefix,
            dependencies: serviceData.dependencies,
            healthCheckUrl: serviceData.healthCheckUrl
          });
          updated.push(serviceId);
        } else {
          // Create new service
          await ServiceConfiguration.create(serviceData);
          initialized.push(serviceId);
        }
      } catch (error) {
        logger.error(`Failed to initialize service ${serviceId}:`, error);
        errors.push({ serviceId, error: error.message });
      }
    }

    logger.info(`Service initialization complete: ${initialized.length} created, ${updated.length} updated, ${errors.length} errors`);

    res.json({
      success: true,
      summary: {
        initialized: initialized.length,
        updated: updated.length,
        errors: errors.length,
        total: Object.keys(metadata).length
      },
      details: {
        initialized,
        updated,
        errors
      }
    });
  } catch (error) {
    logger.error('Failed to initialize services:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize services',
      message: error.message
    });
  }
});

module.exports = router;
