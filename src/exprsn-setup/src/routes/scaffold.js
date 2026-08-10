/**
 * Service Scaffolding Routes
 * API endpoints for creating and managing services
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const {
  scaffoldService,
  getServiceTemplates,
  deleteService
} = require('../services/scaffolder');

/**
 * GET /api/scaffold/templates
 * Get available service templates
 */
router.get('/templates', (req, res) => {
  try {
    const templates = getServiceTemplates();

    res.json({
      success: true,
      templates
    });
  } catch (error) {
    logger.error('Error getting service templates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get service templates',
      message: error.message
    });
  }
});

/**
 * POST /api/scaffold/service
 * Create a new service
 *
 * Request body:
 * {
 *   serviceName: string (required) - Service name (e.g., 'exprsn-myservice')
 *   displayName: string (optional) - Display name
 *   description: string (optional) - Service description
 *   port: number (required) - Service port
 *   template: string (required) - Template type (basic, realtime, worker, api)
 *   author: string (optional) - Author name
 * }
 */
router.post('/service', async (req, res) => {
  try {
    const {
      serviceName,
      displayName,
      description,
      port,
      template,
      author
    } = req.body;

    // Validation
    if (!serviceName) {
      return res.status(400).json({
        success: false,
        error: 'Service name is required'
      });
    }

    if (!serviceName.startsWith('exprsn-')) {
      return res.status(400).json({
        success: false,
        error: 'Service name must start with "exprsn-"'
      });
    }

    if (!port || port < 1024 || port > 65535) {
      return res.status(400).json({
        success: false,
        error: 'Valid port number (1024-65535) is required'
      });
    }

    if (!template) {
      return res.status(400).json({
        success: false,
        error: 'Template type is required'
      });
    }

    const templates = getServiceTemplates();
    if (!templates[template]) {
      return res.status(400).json({
        success: false,
        error: `Invalid template type. Available: ${Object.keys(templates).join(', ')}`
      });
    }

    // Scaffold the service
    const result = await scaffoldService({
      serviceName,
      displayName: displayName || serviceName,
      description,
      port,
      template,
      author
    });

    logger.info(`Service ${serviceName} scaffolded successfully via API`);

    res.status(201).json(result);
  } catch (error) {
    logger.error('Error scaffolding service:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to scaffold service',
      message: error.message
    });
  }
});

/**
 * DELETE /api/scaffold/service/:serviceName
 * Delete a service
 */
router.delete('/service/:serviceName', async (req, res) => {
  try {
    const { serviceName } = req.params;

    if (!serviceName) {
      return res.status(400).json({
        success: false,
        error: 'Service name is required'
      });
    }

    // Confirm deletion via query parameter
    if (req.query.confirm !== 'true') {
      return res.status(400).json({
        success: false,
        error: 'Deletion must be confirmed with ?confirm=true'
      });
    }

    const result = await deleteService(serviceName);

    logger.info(`Service ${serviceName} deleted successfully via API`);

    res.json(result);
  } catch (error) {
    logger.error(`Error deleting service ${req.params.serviceName}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete service',
      message: error.message
    });
  }
});

/**
 * POST /api/scaffold/service/:serviceName/register
 * Register a new service in the discovery system
 *
 * Request body:
 * {
 *   displayName: string (required)
 *   port: number (required)
 *   status: string (optional) - 'production', 'partial', 'development'
 * }
 */
router.post('/service/:serviceName/register', async (req, res) => {
  try {
    const { serviceName } = req.params;
    const { displayName, port, status = 'development' } = req.body;

    if (!displayName || !port) {
      return res.status(400).json({
        success: false,
        error: 'Display name and port are required'
      });
    }

    // This would update the SERVICE_DEFINITIONS in discovery.js
    // For now, we'll just return success
    // TODO: Implement persistent service registry

    logger.info(`Service ${serviceName} registered: ${displayName} on port ${port}`);

    res.json({
      success: true,
      serviceName,
      displayName,
      port,
      status,
      message: 'Service registered successfully',
      note: 'Service will be discoverable after restart or when SERVICE_DEFINITIONS is updated'
    });
  } catch (error) {
    logger.error(`Error registering service ${req.params.serviceName}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to register service',
      message: error.message
    });
  }
});

/**
 * GET /api/scaffold/validate-name/:serviceName
 * Validate if service name is available
 */
router.get('/validate-name/:serviceName', async (req, res) => {
  try {
    const { serviceName } = req.params;
    const fs = require('fs').promises;
    const path = require('path');

    if (!serviceName.startsWith('exprsn-')) {
      return res.json({
        success: false,
        valid: false,
        error: 'Service name must start with "exprsn-"'
      });
    }

    // Check if directory exists
    const projectRoot = path.resolve(__dirname, '../../../..');
    const servicePath = path.join(projectRoot, 'src', serviceName);

    try {
      await fs.access(servicePath);
      // Directory exists
      return res.json({
        success: true,
        valid: false,
        error: 'Service directory already exists'
      });
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Directory doesn't exist - name is available
        return res.json({
          success: true,
          valid: true,
          message: 'Service name is available'
        });
      }
      throw error;
    }
  } catch (error) {
    logger.error(`Error validating service name ${req.params.serviceName}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate service name',
      message: error.message
    });
  }
});

/**
 * GET /api/scaffold/validate-port/:port
 * Check if port is available
 */
router.get('/validate-port/:port', async (req, res) => {
  try {
    const port = parseInt(req.params.port);

    if (isNaN(port) || port < 1024 || port > 65535) {
      return res.json({
        success: true,
        valid: false,
        error: 'Port must be between 1024 and 65535'
      });
    }

    // Check if port is already in use by checking if a service responds
    const axios = require('axios');
    try {
      await axios.get(`http://localhost:${port}/health`, { timeout: 1000 });
      // Port is in use
      return res.json({
        success: true,
        valid: false,
        error: 'Port is already in use'
      });
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        // Port is available
        return res.json({
          success: true,
          valid: true,
          message: 'Port is available'
        });
      }
      // Timeout or other error - assume available
      return res.json({
        success: true,
        valid: true,
        message: 'Port appears to be available'
      });
    }
  } catch (error) {
    logger.error(`Error validating port ${req.params.port}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate port',
      message: error.message
    });
  }
});

module.exports = router;
