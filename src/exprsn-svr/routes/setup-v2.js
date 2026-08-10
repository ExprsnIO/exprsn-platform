/**
 * ═══════════════════════════════════════════════════════════════════════
 * Setup Routes V2 - Enhanced Administrative Dashboard
 * ═══════════════════════════════════════════════════════════════════════
 * PowerApps-inspired unified admin interface
 * Consolidates service, Low-Code, and Forge management
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();

// Controllers
const HomeController = require('../controllers/setup/HomeController');

// Middleware (TODO: Add authentication middleware)
// const { requireAdmin } = require('../middleware/auth');

/**
 * ───────────────────────────────────────────────────────────────────────
 * Home Dashboard Routes
 * ───────────────────────────────────────────────────────────────────────
 */

// Main dashboard
router.get('/', HomeController.index.bind(HomeController));

// Dashboard API endpoints
router.get('/api/home/cards', HomeController.getCards.bind(HomeController));
router.post('/api/home/cards/layout', HomeController.saveCardLayout.bind(HomeController));
router.post('/api/home/cards/reset', HomeController.resetCardLayout.bind(HomeController));
router.get('/api/home/dashboard-data', HomeController.getDashboardData.bind(HomeController));

/**
 * ───────────────────────────────────────────────────────────────────────
 * Environment Management Routes (Phase 1 - Placeholder)
 * ───────────────────────────────────────────────────────────────────────
 */

router.get('/environments', (req, res) => {
  res.render('setup/environments', {
    title: 'Environment Management',
    currentPath: req.path,
    user: req.user || null
  });
});

/**
 * ───────────────────────────────────────────────────────────────────────
 * Service Health Routes
 * ───────────────────────────────────────────────────────────────────────
 */

router.get('/services', (req, res) => {
  res.render('setup/services', {
    title: 'Service Health',
    currentPath: req.path,
    user: req.user || null
  });
});

/**
 * ───────────────────────────────────────────────────────────────────────
 * Database & Schema Routes (Phase 2 - Placeholder)
 * ───────────────────────────────────────────────────────────────────────
 */

router.get('/database', (req, res) => {
  res.render('setup/database', {
    title: 'Database Management',
    currentPath: req.path,
    user: req.user || null
  });
});

router.get('/database/migrations', (req, res) => {
  res.render('setup/migrations', {
    title: 'Migration Dashboard',
    currentPath: req.path,
    user: req.user || null
  });
});

router.get('/database/schema', (req, res) => {
  res.render('setup/schema-designer', {
    title: 'Schema Designer',
    currentPath: req.path,
    user: req.user || null
  });
});

/**
 * ───────────────────────────────────────────────────────────────────────
 * Application Management Routes (Phase 3 - Placeholder)
 * ───────────────────────────────────────────────────────────────────────
 */

router.get('/applications', (req, res) => {
  res.render('setup/applications', {
    title: 'Applications',
    currentPath: req.path,
    user: req.user || null
  });
});

/**
 * ───────────────────────────────────────────────────────────────────────
 * Security & Users Routes (Phase 4 - Placeholder)
 * ───────────────────────────────────────────────────────────────────────
 */

router.get('/security', (req, res) => {
  res.render('setup/security', {
    title: 'Security & Users',
    currentPath: req.path,
    user: req.user || null
  });
});

router.get('/security/users', (req, res) => {
  res.render('setup/users', {
    title: 'User Management',
    currentPath: req.path,
    user: req.user || null
  });
});

router.get('/security/roles', (req, res) => {
  res.render('setup/roles', {
    title: 'Role Management',
    currentPath: req.path,
    user: req.user || null
  });
});

/**
 * ───────────────────────────────────────────────────────────────────────
 * Analytics Routes (Phase 5 - Placeholder)
 * ───────────────────────────────────────────────────────────────────────
 */

router.get('/analytics', (req, res) => {
  res.render('setup/analytics', {
    title: 'Analytics & Monitoring',
    currentPath: req.path,
    user: req.user || null
  });
});

/**
 * ───────────────────────────────────────────────────────────────────────
 * Development Tools Routes
 * ───────────────────────────────────────────────────────────────────────
 */

router.get('/git', (req, res) => {
  res.render('setup/git', {
    title: 'Git Repository Management',
    currentPath: req.path,
    user: req.user || null
  });
});

/**
 * ───────────────────────────────────────────────────────────────────────
 * Settings Routes
 * ───────────────────────────────────────────────────────────────────────
 */

router.get('/settings', (req, res) => {
  res.render('setup/settings', {
    title: 'System Settings',
    currentPath: req.path,
    user: req.user || null
  });
});

module.exports = router;
