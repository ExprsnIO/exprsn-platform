/**
 * Admin Routes
 * Routes for administrative dashboard and management
 */

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin');
const auth = require('../middleware/auth');
const rateLimit = require('../middleware/rate-limit');

// All admin routes require authentication and admin role
router.use(auth.requireAuth);
router.use(auth.attachUser);
router.use(auth.requireRoles('admin'));

// View routes - render EJS pages
router.get('/', adminController.renderDashboard);
router.get('/dashboard', adminController.renderDashboard);

// Users management views
router.get('/users', adminController.renderUsersList);
router.get('/users/:id', adminController.renderUserDetails);

// Certificates management views
router.get('/certificates', adminController.renderCertificatesList);
router.get('/certificates/:id', adminController.renderCertificateDetails);

// Tokens management views
router.get('/tokens', adminController.renderTokensList);
router.get('/tokens/:id', adminController.renderTokenDetails);

// Webhooks management views
router.get('/webhooks', adminController.renderWebhooksList);

// API routes - return JSON data for AJAX/Socket.io
router.get('/api/stats', rateLimit.authenticatedRateLimit, adminController.getStats);
router.get('/api/users', rateLimit.authenticatedRateLimit, adminController.getUsers);
router.get('/api/certificates', rateLimit.authenticatedRateLimit, adminController.getCertificates);
router.get('/api/tokens', rateLimit.authenticatedRateLimit, adminController.getTokens);
router.get('/api/webhooks', rateLimit.authenticatedRateLimit, adminController.getWebhooks);

module.exports = router;
