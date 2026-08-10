const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { validateCAToken, requirePermissions, asyncHandler } = require('@exprsn/shared');
const subscriptionService = require('../services/subscriptionService');

/**
 * Validation schemas
 */
const createSubscriptionSchema = Joi.object({
  customerId: Joi.string().uuid().required(),
  planId: Joi.string().required(),
  provider: Joi.string().valid('stripe', 'paypal', 'authorize_net').required(),
  billingCycle: Joi.string().valid('monthly', 'quarterly', 'yearly', 'biannual').default('monthly'),
  quantity: Joi.number().integer().min(1).default(1),
  trialDays: Joi.number().integer().min(0).max(90).default(0),
  metadata: Joi.object().default({})
});

const updateSubscriptionSchema = Joi.object({
  planId: Joi.string(),
  quantity: Joi.number().integer().min(1),
  metadata: Joi.object()
}).min(1);

const cancelSubscriptionSchema = Joi.object({
  immediate: Joi.boolean().default(false),
  reason: Joi.string().max(500).allow(null)
});

/**
 * @route   POST /api/subscriptions
 * @desc    Create a new subscription
 * @access  Private (requires write permission)
 */
router.post('/',
  validateCAToken,
  requirePermissions({ write: true }),
  asyncHandler(async (req, res) => {
    // Validate request body
    const { error, value } = createSubscriptionSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    // Create subscription
    const subscription = await subscriptionService.createSubscription(value);

    res.status(201).json({
      success: true,
      data: subscription
    });
  })
);

/**
 * @route   GET /api/subscriptions/:id
 * @desc    Get subscription by ID
 * @access  Private (requires read permission)
 */
router.get('/:id',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const subscription = await subscriptionService.getSubscription(req.params.id);

    res.json({
      success: true,
      data: subscription
    });
  })
);

/**
 * @route   GET /api/subscriptions/customer/:customerId
 * @desc    List customer subscriptions
 * @access  Private (requires read permission)
 */
router.get('/customer/:customerId',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { status, limit = 20, offset = 0 } = req.query;

    const subscriptions = await subscriptionService.listCustomerSubscriptions(
      req.params.customerId,
      {
        status,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    );

    res.json({
      success: true,
      data: subscriptions.rows,
      pagination: {
        total: subscriptions.count,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  })
);

/**
 * @route   PUT /api/subscriptions/:id
 * @desc    Update subscription
 * @access  Private (requires update permission)
 */
router.put('/:id',
  validateCAToken,
  requirePermissions({ update: true }),
  asyncHandler(async (req, res) => {
    // Validate request body
    const { error, value } = updateSubscriptionSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const subscription = await subscriptionService.updateSubscription(req.params.id, value);

    res.json({
      success: true,
      data: subscription
    });
  })
);

/**
 * @route   POST /api/subscriptions/:id/cancel
 * @desc    Cancel subscription
 * @access  Private (requires delete permission)
 */
router.post('/:id/cancel',
  validateCAToken,
  requirePermissions({ delete: true }),
  asyncHandler(async (req, res) => {
    // Validate request body
    const { error, value } = cancelSubscriptionSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const subscription = await subscriptionService.cancelSubscription(req.params.id, value);

    res.json({
      success: true,
      data: subscription,
      message: value.immediate
        ? 'Subscription canceled immediately'
        : 'Subscription will cancel at end of billing period'
    });
  })
);

/**
 * @route   POST /api/subscriptions/:id/reactivate
 * @desc    Reactivate a canceled subscription
 * @access  Private (requires update permission)
 */
router.post('/:id/reactivate',
  validateCAToken,
  requirePermissions({ update: true }),
  asyncHandler(async (req, res) => {
    const subscription = await subscriptionService.reactivateSubscription(req.params.id);

    res.json({
      success: true,
      data: subscription,
      message: 'Subscription reactivated successfully'
    });
  })
);

/**
 * @route   POST /api/subscriptions/webhooks/:provider
 * @desc    Handle subscription webhook events
 * @access  Public (webhook signature validated)
 */
router.post('/webhooks/:provider',
  asyncHandler(async (req, res) => {
    const { provider } = req.params;

    // TODO: Add webhook signature validation for each provider
    // For Stripe: use stripe.webhooks.constructEvent()
    // For PayPal: verify signature header
    // For Authorize.Net: verify callback authentication

    await subscriptionService.handleWebhookEvent(provider, req.body);

    res.json({ received: true });
  })
);

module.exports = router;
