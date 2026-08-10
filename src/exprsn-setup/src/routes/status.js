/**
 * Status Routes
 * API endpoints for installation status and overall system health
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { discoverServices, getProductionReadyServices } = require('../services/discovery');
const { getSystemHealthSummary } = require('../services/health');
const { SERVICE_DATABASES } = require('../services/database');

/**
 * GET /api/status/installation
 * Get overall installation status
 */
router.get('/installation', async (req, res) => {
  try {
    const services = await discoverServices();
    const healthSummary = await getSystemHealthSummary();

    const status = {
      timestamp: new Date().toISOString(),
      overall: 'incomplete',
      services: {
        total: services.length,
        running: services.filter(s => s.running).length,
        production: services.filter(s => s.implementationStatus === 'production').length,
        partial: services.filter(s => s.implementationStatus === 'partial').length
      },
      health: {
        healthy: healthSummary.healthy,
        degraded: healthSummary.degraded,
        unhealthy: healthSummary.unhealthy,
        unreachable: healthSummary.unreachable,
        systemStatus: healthSummary.systemStatus
      },
      databases: {
        configured: Object.keys(SERVICE_DATABASES).length
      }
    };

    // Determine overall installation status
    if (status.services.running === status.services.total &&
        status.health.systemStatus === 'healthy') {
      status.overall = 'complete';
    } else if (status.services.running > 0) {
      status.overall = 'partial';
    } else {
      status.overall = 'not-started';
    }

    res.json({
      success: true,
      status
    });
  } catch (error) {
    logger.error('Error getting installation status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get installation status',
      message: error.message
    });
  }
});

/**
 * GET /api/status/production-ready
 * Check if all production-ready services are healthy
 */
router.get('/production-ready', async (req, res) => {
  try {
    const prodServices = await getProductionReadyServices();
    const healthSummary = await getSystemHealthSummary();

    const prodServiceIds = prodServices.map(s => s.id);
    const prodHealthStatuses = healthSummary.services.filter(
      s => prodServiceIds.includes(s.service)
    );

    const allHealthy = prodHealthStatuses.every(s => s.overall === 'healthy');
    const allRunning = prodServices.every(s => s.running);

    const status = {
      timestamp: new Date().toISOString(),
      ready: allHealthy && allRunning,
      services: {
        total: prodServices.length,
        running: prodServices.filter(s => s.running).length,
        healthy: prodHealthStatuses.filter(s => s.overall === 'healthy').length
      },
      details: prodHealthStatuses.map(health => {
        const service = prodServices.find(s => s.id === health.service);
        return {
          service: health.service,
          name: service?.name,
          running: service?.running,
          health: health.overall
        };
      })
    };

    res.json({
      success: true,
      status
    });
  } catch (error) {
    logger.error('Error checking production-ready status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check production-ready status',
      message: error.message
    });
  }
});

/**
 * GET /api/status/system-health
 * Get system-wide health summary
 */
router.get('/system-health', async (req, res) => {
  try {
    const summary = await getSystemHealthSummary();

    res.json({
      success: true,
      health: summary
    });
  } catch (error) {
    logger.error('Error getting system health:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get system health',
      message: error.message
    });
  }
});

module.exports = router;
