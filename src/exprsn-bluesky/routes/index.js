const express = require('express');
const router = express.Router();

// Import route modules
const xrpcRoutes = require('./xrpc');
const accountRoutes = require('./account');
const adminRoutes = require('./admin');
const webhookRoutes = require('./webhook');
const webRoutes = require('./web');
const apiRoutes = require('./api');

// Mount API routes first (for AJAX endpoints)
router.use('/api', apiRoutes);

// Mount AT Protocol and account routes
router.use('/xrpc', xrpcRoutes);
router.use('/api/accounts', accountRoutes);
router.use('/admin', adminRoutes);
router.use('/webhooks', webhookRoutes);

// Mount web routes last (for page serving)
router.use('/', webRoutes);

module.exports = router;
