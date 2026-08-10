/**
 * ═══════════════════════════════════════════════════════════
 * Test Application Helper
 * Lightweight Express app for testing without full initialization
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const path = require('path');

/**
 * Create a test app with only the specified router
 * Avoids loading the entire application with database connections
 */
function createTestApp(routerPath, mountPath = '/') {
  const app = express();

  // Basic middleware
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Mock user for authenticated routes
  app.use((req, res, next) => {
    req.user = {
      id: 'test-user-123',
      username: 'testuser',
      email: 'test@example.com',
      role: 'admin'
    };
    next();
  });

  // Load the router
  const router = require(routerPath);
  app.use(mountPath, router);

  // Error handler
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({
      success: false,
      error: err.name || 'INTERNAL_ERROR',
      message: err.message
    });
  });

  return app;
}

/**
 * Create test app for lowcode routes
 */
function createLowCodeTestApp(routeName) {
  const routerPath = path.join(__dirname, '../../lowcode/routes', routeName);
  return createTestApp(routerPath, `/lowcode/${routeName}`);
}

/**
 * Create test app for workflow routes
 */
function createWorkflowTestApp(routeName) {
  const routerPath = path.join(__dirname, '../../workflow/routes', routeName);
  return createTestApp(routerPath, `/workflow/${routeName}`);
}

/**
 * Create test app for main application routes
 */
function createMainTestApp(routeName) {
  const routerPath = path.join(__dirname, '../../routes', routeName);
  return createTestApp(routerPath, `/${routeName}`);
}

module.exports = {
  createTestApp,
  createLowCodeTestApp,
  createWorkflowTestApp,
  createMainTestApp
};
