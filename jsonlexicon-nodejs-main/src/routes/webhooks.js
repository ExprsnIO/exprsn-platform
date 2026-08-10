/**
 * Webhooks Routes
 */

const express = require('express');
const router = express.Router();
const webhooksController = require('../controllers/webhooks');
const auth = require('../middleware/auth');
const rateLimit = require('../middleware/rate-limit');
const validation = require('../middleware/validation');

// All routes require authentication
router.use(auth.requireAuth);

// Create webhook subscription
router.post(
  '/',
  rateLimit.webhookRateLimit,
  validation.validateWebhookSubscription,
  webhooksController.createWebhook
);

// List webhook subscriptions
router.get(
  '/',
  validation.validatePagination,
  webhooksController.listWebhooks
);

// Get webhook by ID
router.get(
  '/:id',
  validation.validateUuidParam('id'),
  webhooksController.getWebhook
);

// Update webhook
router.patch(
  '/:id',
  rateLimit.webhookRateLimit,
  validation.validateUuidParam('id'),
  webhooksController.updateWebhook
);

// Delete webhook
router.delete(
  '/:id',
  rateLimit.strictRateLimit,
  validation.validateUuidParam('id'),
  webhooksController.deleteWebhook
);

// Test webhook
router.post(
  '/:id/test',
  rateLimit.webhookRateLimit,
  validation.validateUuidParam('id'),
  webhooksController.testWebhook
);

// Get webhook deliveries
router.get(
  '/:id/deliveries',
  validation.validateUuidParam('id'),
  validation.validatePagination,
  webhooksController.getWebhookDeliveries
);

// Get webhook statistics
router.get(
  '/:id/stats',
  validation.validateUuidParam('id'),
  webhooksController.getWebhookStats
);

module.exports = router;
