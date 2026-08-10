/**
 * ═══════════════════════════════════════════════════════════════════════
 * Configuration Management Routes
 * ═══════════════════════════════════════════════════════════════════════
 * API endpoints for enterprise-level .env file generation and management
 * Features:
 * - Schema-driven validation with detailed error reporting
 * - Environment-specific configuration (dev/staging/production)
 * - Configuration comparison and diff
 * - Schema introspection for dynamic UI generation
 * - Configuration backup and versioning
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const {
  getConfigTemplate,
  getSchemaInfo,
  generateConfig,
  saveConfig,
  loadConfig,
  validateConfig,
  compareConfigs,
  generateAllConfigs,
  saveAllConfigs,
  listAllConfigs,
  CONFIG_TEMPLATES
} = require('../services/config');

/**
 * ───────────────────────────────────────────────────────────────────────
 * Service Discovery & Metadata
 * ───────────────────────────────────────────────────────────────────────
 */

/**
 * GET /api/config/services
 * List all available services with configuration metadata
 */
router.get('/services', (req, res) => {
  try {
    const services = listAllConfigs();

    res.json({
      success: true,
      count: services.length,
      services
    });
  } catch (error) {
    logger.error('Error listing services:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list services',
      message: error.message
    });
  }
});

/**
 * GET /api/config/templates
 * Get all configuration templates (legacy format)
 */
router.get('/templates', (req, res) => {
  try {
    res.json({
      success: true,
      templates: CONFIG_TEMPLATES
    });
  } catch (error) {
    logger.error('Error getting config templates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get config templates',
      message: error.message
    });
  }
});

/**
 * ───────────────────────────────────────────────────────────────────────
 * Schema Introspection
 * ───────────────────────────────────────────────────────────────────────
 */

/**
 * GET /api/config/schema/:service
 * Get schema information for a service (for dynamic UI generation)
 */
router.get('/schema/:service', (req, res) => {
  try {
    const { service } = req.params;
    const schemaInfo = getSchemaInfo(service);

    if (!schemaInfo) {
      return res.status(404).json({
        success: false,
        error: 'No enterprise schema available for this service',
        message: `Service ${service} does not have an enterprise schema. Using legacy template.`,
        service
      });
    }

    res.json({
      success: true,
      ...schemaInfo
    });
  } catch (error) {
    logger.error(`Error getting schema for ${req.params.service}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get schema information',
      message: error.message
    });
  }
});

/**
 * ───────────────────────────────────────────────────────────────────────
 * Template & Configuration Generation
 * ───────────────────────────────────────────────────────────────────────
 */

/**
 * GET /api/config/template/:service
 * Get configuration template for a specific service
 * Query params: environment (development/staging/production)
 */
router.get('/template/:service', (req, res) => {
  try {
    const { service } = req.params;
    const { environment = 'development' } = req.query;

    const template = getConfigTemplate(service, environment);

    res.json({
      success: true,
      service,
      environment,
      template
    });
  } catch (error) {
    logger.error(`Error getting config template for ${req.params.service}:`, error);
    res.status(404).json({
      success: false,
      error: 'Template not found',
      message: error.message
    });
  }
});

/**
 * POST /api/config/generate
 * Generate configuration for a service
 * Body: { service, environment?, overrides?, validate? }
 */
router.post('/generate', async (req, res) => {
  try {
    const {
      service,
      environment = 'development',
      overrides = {},
      validate = true
    } = req.body;

    if (!service) {
      return res.status(400).json({
        success: false,
        error: 'Service name is required',
        details: 'Request body must include "service" field'
      });
    }

    const result = await generateConfig(service, {
      environment,
      overrides,
      validate
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('Error generating config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate config',
      message: error.message
    });
  }
});

/**
 * POST /api/config/generate-all
 * Generate configurations for all services
 * Body: { environment?, globalOverrides? }
 */
router.post('/generate-all', async (req, res) => {
  try {
    const {
      environment = 'development',
      globalOverrides = {}
    } = req.body;

    const results = await generateAllConfigs({
      environment,
      globalOverrides
    });

    const successCount = results.filter(r => r.valid).length;

    res.json({
      success: true,
      environment,
      total: results.length,
      successful: successCount,
      failed: results.length - successCount,
      results
    });
  } catch (error) {
    logger.error('Error generating all configs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate all configs',
      message: error.message
    });
  }
});

/**
 * ───────────────────────────────────────────────────────────────────────
 * Validation
 * ───────────────────────────────────────────────────────────────────────
 */

/**
 * POST /api/config/validate
 * Validate configuration against schema
 * Body: { service, config }
 */
router.post('/validate', (req, res) => {
  try {
    const { service, config } = req.body;

    if (!service || !config) {
      return res.status(400).json({
        success: false,
        error: 'Service name and configuration are required',
        details: 'Request body must include "service" and "config" fields'
      });
    }

    const validation = validateConfig(service, config);

    res.json({
      success: validation.valid,
      service,
      ...validation
    });
  } catch (error) {
    logger.error('Error validating config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate config',
      message: error.message
    });
  }
});

/**
 * ───────────────────────────────────────────────────────────────────────
 * Configuration Persistence
 * ───────────────────────────────────────────────────────────────────────
 */

/**
 * POST /api/config/save
 * Save configuration to .env file
 * Body: { service, config, backup?, validate? }
 */
router.post('/save', async (req, res) => {
  try {
    const {
      service,
      config,
      backup = true,
      validate = true
    } = req.body;

    if (!service || !config) {
      return res.status(400).json({
        success: false,
        error: 'Service name and configuration are required',
        details: 'Request body must include "service" and "config" fields'
      });
    }

    const result = await saveConfig(service, config, {
      backup,
      validate
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('Error saving config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save config',
      message: error.message,
      details: error.stack
    });
  }
});

/**
 * POST /api/config/save-all
 * Save configurations for all services
 * Body: { environment?, globalOverrides?, backup? }
 */
router.post('/save-all', async (req, res) => {
  try {
    const {
      environment = 'development',
      globalOverrides = {},
      backup = true
    } = req.body;

    const results = await saveAllConfigs({
      environment,
      globalOverrides,
      backup
    });

    const successCount = results.filter(r => r.success).length;

    res.json({
      success: true,
      environment,
      total: results.length,
      successful: successCount,
      failed: results.length - successCount,
      results
    });
  } catch (error) {
    logger.error('Error saving all configs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save all configs',
      message: error.message
    });
  }
});

/**
 * GET /api/config/load/:service
 * Load configuration from .env file
 */
router.get('/load/:service', async (req, res) => {
  try {
    const { service } = req.params;
    const result = await loadConfig(service);

    res.json({
      success: result.exists,
      ...result
    });
  } catch (error) {
    logger.error(`Error loading config for ${req.params.service}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to load config',
      message: error.message
    });
  }
});

/**
 * ───────────────────────────────────────────────────────────────────────
 * Configuration Comparison & Diff
 * ───────────────────────────────────────────────────────────────────────
 */

/**
 * POST /api/config/compare
 * Compare two configurations
 * Body: { config1, config2, labels? }
 */
router.post('/compare', (req, res) => {
  try {
    const {
      config1,
      config2,
      labels = { config1: 'Configuration 1', config2: 'Configuration 2' }
    } = req.body;

    if (!config1 || !config2) {
      return res.status(400).json({
        success: false,
        error: 'Both configurations are required',
        details: 'Request body must include "config1" and "config2" fields'
      });
    }

    const comparison = compareConfigs(config1, config2);

    res.json({
      success: true,
      labels,
      ...comparison
    });
  } catch (error) {
    logger.error('Error comparing configs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to compare configs',
      message: error.message
    });
  }
});

/**
 * POST /api/config/diff/:service
 * Compare service's current config with a new/template config
 * Body: { newConfig?, environment?, useTemplate? }
 */
router.post('/diff/:service', async (req, res) => {
  try {
    const { service } = req.params;
    const {
      newConfig,
      environment = 'development',
      useTemplate = false
    } = req.body;

    // Load current configuration
    const currentResult = await loadConfig(service);
    if (!currentResult.exists) {
      return res.status(404).json({
        success: false,
        error: 'Current configuration not found',
        message: `No .env file exists for ${service}`,
        service
      });
    }

    // Determine comparison target
    let targetConfig;
    if (useTemplate) {
      targetConfig = getConfigTemplate(service, environment);
    } else if (newConfig) {
      targetConfig = newConfig;
    } else {
      return res.status(400).json({
        success: false,
        error: 'Comparison target required',
        details: 'Provide either "newConfig" or set "useTemplate" to true'
      });
    }

    const comparison = compareConfigs(currentResult.config, targetConfig);

    res.json({
      success: true,
      service,
      labels: {
        current: 'Current Configuration',
        target: useTemplate ? `${environment} Template` : 'New Configuration'
      },
      ...comparison
    });
  } catch (error) {
    logger.error(`Error diffing config for ${req.params.service}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to diff config',
      message: error.message
    });
  }
});

/**
 * ───────────────────────────────────────────────────────────────────────
 * Configuration Preview & Dry-Run
 * ───────────────────────────────────────────────────────────────────────
 */

/**
 * POST /api/config/preview
 * Preview configuration in .env format without saving
 * Body: { service, environment?, overrides? }
 */
router.post('/preview', async (req, res) => {
  try {
    const {
      service,
      environment = 'development',
      overrides = {}
    } = req.body;

    if (!service) {
      return res.status(400).json({
        success: false,
        error: 'Service name is required'
      });
    }

    const result = await generateConfig(service, {
      environment,
      overrides,
      validate: true
    });

    res.json({
      success: true,
      service,
      environment,
      envContent: result.envContent,
      config: result.config,
      warnings: result.warnings,
      schemaInfo: result.schemaInfo
    });
  } catch (error) {
    logger.error('Error previewing config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to preview config',
      message: error.message
    });
  }
});

/**
 * ───────────────────────────────────────────────────────────────────────
 * Bulk Operations
 * ───────────────────────────────────────────────────────────────────────
 */

/**
 * GET /api/config/load-all
 * Load configurations for all services
 */
router.get('/load-all', async (req, res) => {
  try {
    const services = Object.keys(CONFIG_TEMPLATES);
    const results = [];

    for (const service of services) {
      try {
        const result = await loadConfig(service);
        results.push(result);
      } catch (error) {
        logger.error(`Error loading config for ${service}:`, error);
        results.push({
          service,
          exists: false,
          error: error.message
        });
      }
    }

    const existingCount = results.filter(r => r.exists).length;

    res.json({
      success: true,
      total: results.length,
      existing: existingCount,
      missing: results.length - existingCount,
      results
    });
  } catch (error) {
    logger.error('Error loading all configs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load all configs',
      message: error.message
    });
  }
});

/**
 * ───────────────────────────────────────────────────────────────────────
 * Health & Status
 * ───────────────────────────────────────────────────────────────────────
 */

/**
 * GET /api/config/status
 * Get configuration management system status
 */
router.get('/status', (req, res) => {
  try {
    const services = listAllConfigs();

    res.json({
      success: true,
      status: 'operational',
      features: {
        schemaValidation: true,
        multiEnvironment: true,
        configComparison: true,
        autoBackup: true,
        enterpriseSchemas: ['exprsn-ca', 'exprsn-timeline', 'exprsn-nexus', 'exprsn-vault']
      },
      services: {
        total: services.length,
        withEnterpriseSchema: services.filter(s => s.hasEnterpriseSchema).length,
        withLegacyTemplate: services.filter(s => !s.hasEnterpriseSchema).length
      },
      environments: ['development', 'staging', 'production']
    });
  } catch (error) {
    logger.error('Error getting config status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get config status',
      message: error.message
    });
  }
});

module.exports = router;
