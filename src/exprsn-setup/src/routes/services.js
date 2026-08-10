/**
 * Services Routes
 * API endpoints for service discovery and management
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const {
  discoverServices,
  getServiceDetails,
  isServiceRunning,
  getProductionReadyServices,
  getServiceDefinitions
} = require('../services/discovery');
const { performHealthCheck } = require('../services/health');
const processManager = require('../services/processManager');

/**
 * GET /api/services
 * List all services with current status
 */
router.get('/', async (req, res) => {
  try {
    const services = await discoverServices();

    res.json({
      success: true,
      count: services.length,
      running: services.filter(s => s.running).length,
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
 * GET /api/services/definitions
 * Get service definitions (without runtime status)
 */
router.get('/definitions', (req, res) => {
  try {
    const definitions = getServiceDefinitions();

    res.json({
      success: true,
      definitions
    });
  } catch (error) {
    logger.error('Error getting service definitions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get service definitions',
      message: error.message
    });
  }
});

/**
 * GET /api/services/production-ready
 * Get production-ready services
 */
router.get('/production-ready', async (req, res) => {
  try {
    const services = await getProductionReadyServices();

    res.json({
      success: true,
      count: services.length,
      services
    });
  } catch (error) {
    logger.error('Error getting production-ready services:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get production-ready services',
      message: error.message
    });
  }
});

/**
 * GET /api/services/discover
 * Discover all services (alias for GET /)
 */
router.get('/discover', async (req, res) => {
  try {
    const services = await discoverServices();

    res.json({
      success: true,
      count: services.length,
      running: services.filter(s => s.running).length,
      services
    });
  } catch (error) {
    logger.error('Error discovering services:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to discover services',
      message: error.message
    });
  }
});

/**
 * GET /api/services/health/all
 * Check health of all services
 */
router.get('/health/all', async (req, res) => {
  try {
    const { checkAllServices } = require('../services/health');
    const services = await checkAllServices();

    res.json({
      success: true,
      count: services.length,
      services
    });
  } catch (error) {
    logger.error('Error checking all services health:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check all services health',
      message: error.message
    });
  }
});

/**
 * GET /api/services/:name
 * Get detailed information about a specific service
 */
router.get('/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const details = await getServiceDetails(name);

    if (!details) {
      return res.status(404).json({
        success: false,
        error: 'Service not found'
      });
    }

    res.json({
      success: true,
      service: details
    });
  } catch (error) {
    logger.error(`Error getting service details for ${req.params.name}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get service details',
      message: error.message
    });
  }
});

/**
 * GET /api/services/:name/status
 * Check if service is running
 */
router.get('/:name/status', async (req, res) => {
  try {
    const { name } = req.params;
    const running = await isServiceRunning(name);

    res.json({
      success: true,
      service: name,
      running
    });
  } catch (error) {
    logger.error(`Error checking service status for ${req.params.name}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to check service status',
      message: error.message
    });
  }
});

/**
 * GET /api/services/:name/health
 * Check service health
 */
router.get('/:name/health', async (req, res) => {
  try {
    const { name } = req.params;
    const health = await performHealthCheck(name);

    res.json({
      success: true,
      health
    });
  } catch (error) {
    logger.error(`Error checking service health for ${req.params.name}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to check service health',
      message: error.message
    });
  }
});

/**
 * POST /api/services/:id/start
 * Start a service
 */
router.post('/:id/start', async (req, res) => {
  try {
    const { id } = req.params;
    logger.info(`Starting service: ${id}`);

    const result = await processManager.startService(id);

    // Broadcast status update via Socket.IO
    if (req.app.get('io')) {
      const status = await processManager.getServiceStatus(id);
      req.app.get('io').emit('service:status', {
        timestamp: new Date().toISOString(),
        service: status
      });
    }

    res.json(result);
  } catch (error) {
    logger.error(`Failed to start service ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/services/:id/stop
 * Stop a service
 */
router.post('/:id/stop', async (req, res) => {
  try {
    const { id } = req.params;
    logger.info(`Stopping service: ${id}`);

    const result = await processManager.stopService(id);

    // Broadcast status update via Socket.IO
    if (req.app.get('io')) {
      const status = await processManager.getServiceStatus(id);
      req.app.get('io').emit('service:status', {
        timestamp: new Date().toISOString(),
        service: status
      });
    }

    res.json(result);
  } catch (error) {
    logger.error(`Failed to stop service ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/services/:id/restart
 * Restart a service
 */
router.post('/:id/restart', async (req, res) => {
  try {
    const { id } = req.params;
    logger.info(`Restarting service: ${id}`);

    const result = await processManager.restartService(id);

    // Broadcast status update via Socket.IO
    if (req.app.get('io')) {
      const status = await processManager.getServiceStatus(id);
      req.app.get('io').emit('service:status', {
        timestamp: new Date().toISOString(),
        service: status
      });
    }

    res.json(result);
  } catch (error) {
    logger.error(`Failed to restart service ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/services/:id/logs
 * Get service logs
 */
router.get('/:id/logs', async (req, res) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit) || 50;

    const logs = processManager.getServiceLogs(id, limit);

    res.json({
      success: true,
      service: id,
      logs,
      count: logs.length
    });
  } catch (error) {
    logger.error(`Failed to get logs for service ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
