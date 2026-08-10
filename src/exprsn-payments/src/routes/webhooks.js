const express = require('express');
const router = express.Router();
const { asyncHandler, logger } = require('@exprsn/shared');
const { Webhook, PaymentConfiguration } = require('../models');
const PaymentGatewayFactory = require('../services/PaymentGatewayFactory');

/**
 * POST /api/webhooks/stripe
 * Handle Stripe webhooks
 */
router.post('/stripe',
  express.raw({ type: 'application/json' }),
  asyncHandler(async (req, res) => {
    const signature = req.headers['stripe-signature'];
    const payload = req.body;

    logger.info('Received Stripe webhook', {
      signature: signature?.substring(0, 20) + '...'
    });

    // Create webhook record
    const webhook = await Webhook.create({
      provider: 'stripe',
      eventType: 'pending', // Will be updated after parsing
      status: 'pending',
      payload: payload.toString(),
      signature
    });

    try {
      // Find a Stripe configuration to get webhook secret
      // In production, you might want to pass the config ID in metadata
      const config = await PaymentConfiguration.findOne({
        where: {
          provider: 'stripe',
          isActive: true
        }
      });

      if (!config || !config.webhookSecret) {
        logger.warn('No Stripe configuration with webhook secret found');
        return res.status(400).json({
          success: false,
          error: 'WEBHOOK_SECRET_NOT_CONFIGURED'
        });
      }

      // Verify webhook signature
      const gateway = PaymentGatewayFactory.createGateway(
        'stripe',
        config.credentials,
        config.testMode
      );

      const isValid = gateway.verifyWebhookSignature(
        payload,
        signature,
        config.webhookSecret
      );

      await webhook.update({ signatureVerified: isValid });

      if (!isValid) {
        logger.warn('Invalid Stripe webhook signature');
        return res.status(400).json({
          success: false,
          error: 'INVALID_SIGNATURE'
        });
      }

      // Parse webhook event
      const parsedPayload = JSON.parse(payload);
      const event = gateway.parseWebhookEvent(parsedPayload);

      await webhook.update({
        providerEventId: event.id,
        eventType: event.type,
        payload: parsedPayload,
        status: 'processing'
      });

      // TODO: Process webhook event (update transaction, send notifications, etc.)
      // This should be moved to a queue for async processing

      logger.info('Stripe webhook processed', {
        eventId: event.id,
        eventType: event.type
      });

      await webhook.update({
        status: 'processed',
        processedAt: new Date()
      });

      res.json({ success: true, received: true });
    } catch (error) {
      logger.error('Error processing Stripe webhook:', error);

      await webhook.update({
        status: 'failed',
        errorMessage: error.message,
        attempts: webhook.attempts + 1,
        lastAttemptAt: new Date()
      });

      res.status(500).json({
        success: false,
        error: 'WEBHOOK_PROCESSING_FAILED'
      });
    }
  })
);

/**
 * POST /api/webhooks/paypal
 * Handle PayPal webhooks
 */
router.post('/paypal',
  express.json(),
  asyncHandler(async (req, res) => {
    const payload = req.body;
    const headers = req.headers;

    logger.info('Received PayPal webhook', {
      eventType: payload.event_type
    });

    // Create webhook record
    const webhook = await Webhook.create({
      provider: 'paypal',
      providerEventId: payload.id,
      eventType: payload.event_type,
      status: 'pending',
      payload
    });

    try {
      // Find PayPal configuration
      const config = await PaymentConfiguration.findOne({
        where: {
          provider: 'paypal',
          isActive: true
        }
      });

      if (!config) {
        logger.warn('No PayPal configuration found');
        return res.status(400).json({
          success: false,
          error: 'PAYPAL_CONFIG_NOT_FOUND'
        });
      }

      // Verify webhook (simplified - use PayPal SDK in production)
      const gateway = PaymentGatewayFactory.createGateway(
        'paypal',
        config.credentials,
        config.testMode
      );

      const isValid = gateway.verifyWebhookSignature(
        payload,
        headers,
        config.webhookSecret
      );

      await webhook.update({ signatureVerified: isValid });

      // Parse event
      const event = gateway.parseWebhookEvent(payload);

      await webhook.update({
        status: 'processing'
      });

      // TODO: Process webhook event

      logger.info('PayPal webhook processed', {
        eventId: event.id,
        eventType: event.type
      });

      await webhook.update({
        status: 'processed',
        processedAt: new Date()
      });

      res.json({ success: true, received: true });
    } catch (error) {
      logger.error('Error processing PayPal webhook:', error);

      await webhook.update({
        status: 'failed',
        errorMessage: error.message,
        attempts: webhook.attempts + 1,
        lastAttemptAt: new Date()
      });

      res.status(500).json({
        success: false,
        error: 'WEBHOOK_PROCESSING_FAILED'
      });
    }
  })
);

/**
 * POST /api/webhooks/authorizenet
 * Handle Authorize.Net webhooks
 */
router.post('/authorizenet',
  express.json(),
  asyncHandler(async (req, res) => {
    const payload = req.body;
    const signature = req.headers['x-anet-signature'];

    logger.info('Received Authorize.Net webhook', {
      eventType: payload.eventType
    });

    // Create webhook record
    const webhook = await Webhook.create({
      provider: 'authorizenet',
      providerEventId: payload.webhookId,
      eventType: payload.eventType,
      status: 'pending',
      payload,
      signature
    });

    try {
      // Find Authorize.Net configuration
      const config = await PaymentConfiguration.findOne({
        where: {
          provider: 'authorizenet',
          isActive: true
        }
      });

      if (!config || !config.webhookSecret) {
        logger.warn('No Authorize.Net configuration with signature key found');
        return res.status(400).json({
          success: false,
          error: 'WEBHOOK_SECRET_NOT_CONFIGURED'
        });
      }

      // Verify webhook signature
      const gateway = PaymentGatewayFactory.createGateway(
        'authorizenet',
        config.credentials,
        config.testMode
      );

      const isValid = gateway.verifyWebhookSignature(
        payload,
        signature,
        config.webhookSecret
      );

      await webhook.update({ signatureVerified: isValid });

      if (!isValid) {
        logger.warn('Invalid Authorize.Net webhook signature');
        return res.status(400).json({
          success: false,
          error: 'INVALID_SIGNATURE'
        });
      }

      // Parse event
      const event = gateway.parseWebhookEvent(payload);

      await webhook.update({
        status: 'processing'
      });

      // TODO: Process webhook event

      logger.info('Authorize.Net webhook processed', {
        eventId: event.id,
        eventType: event.type
      });

      await webhook.update({
        status: 'processed',
        processedAt: new Date()
      });

      res.json({ success: true, received: true });
    } catch (error) {
      logger.error('Error processing Authorize.Net webhook:', error);

      await webhook.update({
        status: 'failed',
        errorMessage: error.message,
        attempts: webhook.attempts + 1,
        lastAttemptAt: new Date()
      });

      res.status(500).json({
        success: false,
        error: 'WEBHOOK_PROCESSING_FAILED'
      });
    }
  })
);

/**
 * GET /api/webhooks
 * List webhook events
 */
router.get('/',
  asyncHandler(async (req, res) => {
    const {
      provider,
      status,
      eventType,
      limit = 50,
      offset = 0
    } = req.query;

    const where = {};
    if (provider) where.provider = provider;
    if (status) where.status = status;
    if (eventType) where.eventType = eventType;

    const { count, rows } = await Webhook.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      data: rows,
      meta: {
        total: count,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: offset + parseInt(limit) < count
      }
    });
  })
);

module.exports = router;
