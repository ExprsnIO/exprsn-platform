/**
 * ═══════════════════════════════════════════════════════════
 * Exprsn Workflow Module
 * Visual workflow automation and process orchestration
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const path = require('path');
const logger = require('./utils/logger');

// Create router
const router = express.Router();

/**
 * ═══════════════════════════════════════════════════════════
 * Static File Middleware
 * ═══════════════════════════════════════════════════════════
 */

// Serve workflow static files
router.use('/static', express.static(path.join(__dirname, 'public')));

/**
 * ═══════════════════════════════════════════════════════════
 * API Routes
 * ═══════════════════════════════════════════════════════════
 */

const workflowRoutes = require('./routes/workflows');
const executionRoutes = require('./routes/executions');
const monitoringRoutes = require('./routes/monitoring');
const approvalsRoutes = require('./routes/approvals');
const auditRoutes = require('./routes/audit');
const retentionRoutes = require('./routes/retention');
const schedulerRoutes = require('./routes/scheduler');
const webhookRoutes = require('./routes/webhooks');
const importExportRoutes = require('./routes/importExport');
const stepRoutes = require('./routes/steps');
const tagRoutes = require('./routes/tags');
const favoriteRoutes = require('./routes/favorites');
const shortcutRoutes = require('./routes/shortcuts');
const templateRoutes = require('./routes/templates');
const viewRoutes = require('./routes/views');
const configRoutes = require('./routes/config');
const testingRoutes = require('./routes/testing');
const analyticsRoutes = require('./routes/analytics');

// Mount routes
router.use('/', viewRoutes);                          // View routes (SSR pages)
router.use('/api/workflows', workflowRoutes);
router.use('/api/executions', executionRoutes);
router.use('/api/monitor', monitoringRoutes);
router.use('/api/executions', approvalsRoutes);
router.use('/api/workflows', executionRoutes);        // Also mount under workflows for /:workflowId/execute
router.use('/api/audit', auditRoutes);
router.use('/api/retention', retentionRoutes);
router.use('/api/scheduler', schedulerRoutes);
router.use('/api/webhooks', webhookRoutes);
router.use('/api/workflows', importExportRoutes);     // Import/export routes
router.use('/api/workflows', stepRoutes);             // Step routes
router.use('/api/workflows', tagRoutes);              // Tag routes
router.use('/api/workflows', favoriteRoutes);         // Favorite routes
router.use('/api/shortcuts', shortcutRoutes);
router.use('/api/templates', templateRoutes);
router.use('/api/config', configRoutes);
router.use('/api/workflows', testingRoutes);     // Testing routes
router.use('/api/analytics', analyticsRoutes);   // Analytics routes

/**
 * ═══════════════════════════════════════════════════════════
 * Workflow Module Configuration
 * ═══════════════════════════════════════════════════════════
 */

/**
 * Configure workflow views in the parent app
 * @param {Express.Application} app - The Express application
 */
function configureWorkflowViews(app) {
  const existingViews = app.get('views');
  const workflowViews = path.join(__dirname, 'views');

  // Add workflow views directory to views array
  if (Array.isArray(existingViews)) {
    app.set('views', [...existingViews, workflowViews]);
  } else {
    app.set('views', [existingViews, workflowViews]);
  }
}

/**
 * Initialize workflow Socket.IO handlers
 * @param {SocketIO.Server} io - Socket.IO server instance
 */
function initializeWorkflowSocketIO(io) {
  // Create workflow namespace
  const workflowNamespace = io.of('/workflow');

  workflowNamespace.on('connection', (socket) => {
    logger.info('Workflow client connected', { socketId: socket.id });

    // Join execution room
    socket.on('subscribe:execution', (executionId) => {
      socket.join(`execution:${executionId}`);
      logger.debug('Client subscribed to execution', {
        socketId: socket.id,
        executionId
      });
    });

    // Leave execution room
    socket.on('unsubscribe:execution', (executionId) => {
      socket.leave(`execution:${executionId}`);
      logger.debug('Client unsubscribed from execution', {
        socketId: socket.id,
        executionId
      });
    });

    // Join workflow room
    socket.on('subscribe:workflow', (workflowId) => {
      socket.join(`workflow:${workflowId}`);
      logger.debug('Client subscribed to workflow', {
        socketId: socket.id,
        workflowId
      });
    });

    // Leave workflow room
    socket.on('unsubscribe:workflow', (workflowId) => {
      socket.leave(`workflow:${workflowId}`);
      logger.debug('Client unsubscribed from workflow', {
        socketId: socket.id,
        workflowId
      });
    });

    socket.on('disconnect', () => {
      logger.info('Workflow client disconnected', { socketId: socket.id });
    });
  });

  // Make workflow namespace globally available
  global.workflowIO = workflowNamespace;

  logger.info('Workflow Socket.IO handlers initialized');
}

/**
 * Initialize workflow scheduler
 */
async function initializeWorkflowScheduler() {
  try {
    const schedulerService = require('./services/schedulerService');
    await schedulerService.initialize();
    logger.info('Workflow scheduler initialized');
  } catch (error) {
    logger.warn('Failed to initialize workflow scheduler. Scheduled workflows will not run.', {
      error: error.message
    });
  }
}

/**
 * Shutdown workflow services gracefully
 */
function shutdownWorkflowServices() {
  try {
    const schedulerService = require('./services/schedulerService');
    schedulerService.shutdown();
    logger.info('Workflow services shutdown complete');
  } catch (error) {
    logger.error('Error during workflow services shutdown', {
      error: error.message
    });
  }
}

/**
 * ═══════════════════════════════════════════════════════════
 * Exports
 * ═══════════════════════════════════════════════════════════
 */

module.exports = router;
module.exports.configureWorkflowViews = configureWorkflowViews;
module.exports.initializeWorkflowSocketIO = initializeWorkflowSocketIO;
module.exports.initializeWorkflowScheduler = initializeWorkflowScheduler;
module.exports.shutdownWorkflowServices = shutdownWorkflowServices;
