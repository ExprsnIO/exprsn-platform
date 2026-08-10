/**
 * ═══════════════════════════════════════════════════════════
 * Setup Routes - System Configuration Wizard
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const SetupService = require('../services/SetupService');

/**
 * GET /setup
 * Main setup wizard page
 */
router.get('/', async (req, res) => {
  try {
    const setupRequired = await SetupService.isSetupRequired();
    const status = await SetupService.getSetupStatus();

    //  Extract stats and database info for the template
    const stats = {
      runningServices: status.services?.running?.length || 0,
      totalServices: (status.services?.running?.length || 0) + (status.services?.stopped?.length || 0)
    };

    // Get application config
    const appConfig = require('../../config');

    res.render('setup', {
      title: 'Low-Code Platform Setup',
      setupRequired,
      status,
      stats,
      database: status.database || { connected: false, host: 'localhost', port: 5432, database: 'exprsn_svr' },
      redis: status.redis || { enabled: false, connected: false, host: 'localhost', port: 6379, db: 0 },
      services: [...(status.services?.running || []), ...(status.services?.stopped || [])],
      config: {
        env: appConfig.env || 'development',
        port: appConfig.port || 5001,
        serviceName: appConfig.serviceName || 'exprsn-svr',
        socketIO: appConfig.socketIO || { enabled: false },
        database: appConfig.database || {},
        redis: appConfig.redis || {},
        security: appConfig.security || { enableSQLInjectionDetection: false, enableXSSProtection: false, allowedOrigins: [] }
      },
      envTemplate: SetupService.getEnvTemplate()
    });
  } catch (error) {
    console.error('[Setup] Error rendering setup page:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error.message,
        statusCode: 500,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    });
  }
});

/**
 * GET /setup/status
 * Get current setup status (API)
 */
router.get('/status', async (req, res) => {
  try {
    const setupRequired = await SetupService.isSetupRequired();
    const status = await SetupService.getSetupStatus();

    res.json({
      success: true,
      setupRequired,
      ...status
    });
  } catch (error) {
    console.error('[Setup] Error getting status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /setup/environment
 * Update environment configuration
 */
router.post('/environment', async (req, res) => {
  try {
    const config = req.body;

    const result = await SetupService.updateEnvironment(config);

    res.json(result);
  } catch (error) {
    console.error('[Setup] Error updating environment:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /setup/test-database
 * Test database connection
 */
router.post('/test-database', async (req, res) => {
  try {
    const dbStatus = await SetupService.checkDatabase();

    res.json({
      success: dbStatus.connected,
      ...dbStatus
    });
  } catch (error) {
    console.error('[Setup] Error testing database:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /setup/initialize-database
 * Initialize database (run migrations)
 */
router.post('/initialize-database', async (req, res) => {
  try {
    const result = await SetupService.initializeDatabase();

    res.json(result);
  } catch (error) {
    console.error('[Setup] Error initializing database:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /setup/check-services
 * Check all service connections
 */
router.get('/check-services', async (req, res) => {
  try {
    const services = await SetupService.checkServices();

    res.json({
      success: true,
      ...services
    });
  } catch (error) {
    console.error('[Setup] Error checking services:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /setup/complete
 * Complete setup process
 */
router.post('/complete', async (req, res) => {
  try {
    const options = req.body;

    const result = await SetupService.completeSetup(options);

    res.json(result);
  } catch (error) {
    console.error('[Setup] Error completing setup:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /setup/env-template
 * Download .env template
 */
router.get('/env-template', (req, res) => {
  const template = SetupService.getEnvTemplate();

  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', 'attachment; filename=".env.template"');
  res.send(template);
});

module.exports = router;
