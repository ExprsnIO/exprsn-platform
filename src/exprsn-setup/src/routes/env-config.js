/**
 * ═══════════════════════════════════════════════════════════════════════
 * Environment Configuration Routes
 * Direct .env file management using ConfigManager
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const configManager = require('../services/configManager');
const processManager = require('../services/processManager');

/**
 * GET /api/env-config/:serviceId
 * Read current .env configuration for a service
 */
router.get('/:serviceId', async (req, res) => {
  try {
    const { serviceId } = req.params;
    const config = await configManager.readConfig(serviceId);

    res.json({
      success: true,
      service: serviceId,
      config,
      keysCount: Object.keys(config).length
    });
  } catch (error) {
    logger.error(`Failed to read config for ${req.params.serviceId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/env-config/:serviceId/template
 * Get configuration template for a service
 */
router.get('/:serviceId/template', (req, res) => {
  try {
    const { serviceId } = req.params;
    const template = configManager.getConfigTemplate(serviceId);

    res.json({
      success: true,
      service: serviceId,
      template
    });
  } catch (error) {
    logger.error(`Failed to get template for ${req.params.serviceId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/env-config/:serviceId
 * Write complete .env configuration for a service
 * Body: { config: { KEY: 'value', ... }, backup: true/false, restartService: true/false }
 */
router.post('/:serviceId', async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { config, backup = true, restartService = false } = req.body;

    if (!config || typeof config !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Configuration object is required'
      });
    }

    // Validate configuration
    const validation = configManager.validateConfig(serviceId, config);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Configuration validation failed',
        errors: validation.errors,
        warnings: validation.warnings
      });
    }

    // Write configuration
    const result = await configManager.writeConfig(serviceId, config, { backup });

    // Optionally restart service
    let restartResult = null;
    if (restartService) {
      try {
        restartResult = await processManager.restartService(serviceId);

        // Broadcast status update
        if (req.app.get('io')) {
          const status = await processManager.getServiceStatus(serviceId);
          req.app.get('io').emit('service:status', {
            timestamp: new Date().toISOString(),
            service: status
          });
        }
      } catch (restartError) {
        logger.warn(`Config saved but restart failed for ${serviceId}:`, restartError);
        result.restartError = restartError.message;
      }
    }

    res.json({
      success: true,
      service: serviceId,
      ...result,
      validation,
      restarted: restartService,
      restartResult
    });
  } catch (error) {
    logger.error(`Failed to write config for ${req.params.serviceId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PATCH /api/env-config/:serviceId
 * Update specific keys in .env configuration
 * Body: { updates: { KEY: 'value', ... }, backup: true/false, restartService: true/false }
 */
router.patch('/:serviceId', async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { updates, backup = true, restartService = false } = req.body;

    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Updates object is required'
      });
    }

    // Update configuration
    const result = await configManager.updateConfig(serviceId, updates, { backup });

    // Optionally restart service
    let restartResult = null;
    if (restartService) {
      try {
        restartResult = await processManager.restartService(serviceId);

        // Broadcast status update
        if (req.app.get('io')) {
          const status = await processManager.getServiceStatus(serviceId);
          req.app.get('io').emit('service:status', {
            timestamp: new Date().toISOString(),
            service: status
          });
        }
      } catch (restartError) {
        logger.warn(`Config updated but restart failed for ${serviceId}:`, restartError);
        result.restartError = restartError.message;
      }
    }

    res.json({
      success: true,
      service: serviceId,
      ...result,
      restarted: restartService,
      restartResult
    });
  } catch (error) {
    logger.error(`Failed to update config for ${req.params.serviceId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/env-config/:serviceId/validate
 * Validate configuration without saving
 * Body: { config: { KEY: 'value', ... } }
 */
router.post('/:serviceId/validate', (req, res) => {
  try {
    const { serviceId } = req.params;
    const { config } = req.body;

    if (!config || typeof config !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Configuration object is required'
      });
    }

    const validation = configManager.validateConfig(serviceId, config);

    res.json({
      success: true,
      service: serviceId,
      ...validation
    });
  } catch (error) {
    logger.error(`Failed to validate config for ${req.params.serviceId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/env-config/:serviceId/backups
 * List all backups for a service
 */
router.get('/:serviceId/backups', async (req, res) => {
  try {
    const { serviceId } = req.params;
    const backups = await configManager.listBackups(serviceId);

    res.json({
      success: true,
      service: serviceId,
      count: backups.length,
      backups
    });
  } catch (error) {
    logger.error(`Failed to list backups for ${req.params.serviceId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/env-config/:serviceId/backup
 * Create a backup of current configuration
 */
router.post('/:serviceId/backup', async (req, res) => {
  try {
    const { serviceId } = req.params;
    const backupPath = await configManager.backupConfig(serviceId);

    if (!backupPath) {
      return res.status(404).json({
        success: false,
        error: 'No configuration file to backup'
      });
    }

    res.json({
      success: true,
      service: serviceId,
      backupPath
    });
  } catch (error) {
    logger.error(`Failed to backup config for ${req.params.serviceId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/env-config/:serviceId/restore
 * Restore configuration from a backup
 * Body: { backupPath: '/path/to/backup', restartService: true/false }
 */
router.post('/:serviceId/restore', async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { backupPath, restartService = false } = req.body;

    if (!backupPath) {
      return res.status(400).json({
        success: false,
        error: 'Backup path is required'
      });
    }

    // Restore configuration
    const result = await configManager.restoreConfig(serviceId, backupPath);

    // Optionally restart service
    let restartResult = null;
    if (restartService) {
      try {
        restartResult = await processManager.restartService(serviceId);

        // Broadcast status update
        if (req.app.get('io')) {
          const status = await processManager.getServiceStatus(serviceId);
          req.app.get('io').emit('service:status', {
            timestamp: new Date().toISOString(),
            service: status
          });
        }
      } catch (restartError) {
        logger.warn(`Config restored but restart failed for ${serviceId}:`, restartError);
        result.restartError = restartError.message;
      }
    }

    res.json({
      success: true,
      service: serviceId,
      ...result,
      restarted: restartService,
      restartResult
    });
  } catch (error) {
    logger.error(`Failed to restore config for ${req.params.serviceId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/env-config/:serviceId/backups
 * Delete a specific backup
 * Body: { backupPath: '/path/to/backup' }
 */
router.delete('/:serviceId/backups', async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { backupPath } = req.body;

    if (!backupPath) {
      return res.status(400).json({
        success: false,
        error: 'Backup path is required'
      });
    }

    const result = await configManager.deleteBackup(serviceId, backupPath);

    res.json({
      success: true,
      service: serviceId,
      ...result
    });
  } catch (error) {
    logger.error(`Failed to delete backup for ${req.params.serviceId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
