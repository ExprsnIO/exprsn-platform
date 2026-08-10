const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { validateCAToken, requirePermissions, asyncHandler } = require('@exprsn/shared');
const chargebackService = require('../services/chargebackService');

/**
 * Validation schemas
 */
const createChargebackSchema = Joi.object({
  transactionId: Joi.string().uuid().required(),
  provider: Joi.string().valid('stripe', 'paypal', 'authorize_net').required(),
  providerChargebackId: Joi.string().required(),
  reason: Joi.string().valid(
    'fraudulent',
    'duplicate',
    'product_not_received',
    'product_unacceptable',
    'subscription_canceled',
    'credit_not_processed',
    'general',
    'other'
  ).required(),
  amount: Joi.number().min(0).required(),
  currency: Joi.string().length(3).uppercase().default('USD'),
  evidence: Joi.object().default({}),
  metadata: Joi.object().default({})
});

const submitEvidenceSchema = Joi.object({
  // Customer information
  customerName: Joi.string().max(255),
  customerEmail: Joi.string().email(),
  billingAddress: Joi.string().max(500),
  customerSignature: Joi.string().uri(),

  // Shipping information
  shippingCarrier: Joi.string().max(100),
  shippingTrackingNumber: Joi.string().max(100),
  shippingDate: Joi.date(),
  shippingDocumentation: Joi.string().uri(),

  // Product/Service information
  productDescription: Joi.string().max(1000),
  serviceDocumentation: Joi.string().uri(),

  // Transaction documentation
  receiptUrl: Joi.string().uri(),
  customerCommunication: Joi.string().max(5000),
  duplicateChargeDocumentation: Joi.string().uri(),

  // Policies
  refundPolicy: Joi.string().max(2000),
  cancellationPolicy: Joi.string().max(2000),

  // Additional metadata
  metadata: Joi.object().default({})
}).min(1);

const acceptChargebackSchema = Joi.object({
  reason: Joi.string().max(500).allow(null)
});

/**
 * @route   POST /api/chargebacks
 * @desc    Create a new chargeback record
 * @access  Private (requires write permission)
 */
router.post('/',
  validateCAToken,
  requirePermissions({ write: true }),
  asyncHandler(async (req, res) => {
    // Validate request body
    const { error, value } = createChargebackSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    // Create chargeback
    const chargeback = await chargebackService.createChargeback(value);

    res.status(201).json({
      success: true,
      data: chargeback
    });
  })
);

/**
 * @route   GET /api/chargebacks/:id
 * @desc    Get chargeback by ID
 * @access  Private (requires read permission)
 */
router.get('/:id',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const chargeback = await chargebackService.getChargeback(req.params.id);

    res.json({
      success: true,
      data: chargeback
    });
  })
);

/**
 * @route   GET /api/chargebacks
 * @desc    List chargebacks with filters
 * @access  Private (requires read permission)
 */
router.get('/',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { customerId, transactionId, status, provider, limit = 20, offset = 0 } = req.query;

    const chargebacks = await chargebackService.listChargebacks({
      customerId,
      transactionId,
      status,
      provider,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: chargebacks.rows,
      pagination: {
        total: chargebacks.count,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  })
);

/**
 * @route   GET /api/chargebacks/customer/:customerId
 * @desc    List customer chargebacks
 * @access  Private (requires read permission)
 */
router.get('/customer/:customerId',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { status, provider, limit = 20, offset = 0 } = req.query;

    const chargebacks = await chargebackService.listChargebacks({
      customerId: req.params.customerId,
      status,
      provider,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: chargebacks.rows,
      pagination: {
        total: chargebacks.count,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  })
);

/**
 * @route   POST /api/chargebacks/:id/evidence
 * @desc    Submit evidence for dispute
 * @access  Private (requires update permission)
 */
router.post('/:id/evidence',
  validateCAToken,
  requirePermissions({ update: true }),
  asyncHandler(async (req, res) => {
    // Validate request body
    const { error, value } = submitEvidenceSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const chargeback = await chargebackService.submitEvidence(req.params.id, value);

    res.json({
      success: true,
      data: chargeback,
      message: 'Evidence submitted successfully'
    });
  })
);

/**
 * @route   POST /api/chargebacks/:id/accept
 * @desc    Accept chargeback (merchant loses)
 * @access  Private (requires delete permission)
 */
router.post('/:id/accept',
  validateCAToken,
  requirePermissions({ delete: true }),
  asyncHandler(async (req, res) => {
    // Validate request body
    const { error, value } = acceptChargebackSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const chargeback = await chargebackService.acceptChargeback(req.params.id, value.reason);

    res.json({
      success: true,
      data: chargeback,
      message: 'Chargeback accepted'
    });
  })
);

/**
 * @route   GET /api/chargebacks/stats/summary
 * @desc    Get chargeback statistics
 * @access  Private (requires read permission)
 */
router.get('/stats/summary',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { customerId, startDate, endDate } = req.query;

    const dateRange = startDate && endDate ? {
      startDate: new Date(startDate),
      endDate: new Date(endDate)
    } : null;

    const stats = await chargebackService.getChargebackStats(customerId, dateRange);

    res.json({
      success: true,
      data: stats
    });
  })
);

/**
 * @route   GET /api/chargebacks/attention/needed
 * @desc    Get chargebacks needing attention (response deadline approaching)
 * @access  Private (requires read permission)
 */
router.get('/attention/needed',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const chargebacks = await chargebackService.getChargebacksNeedingAttention();

    res.json({
      success: true,
      data: chargebacks,
      count: chargebacks.length
    });
  })
);

/**
 * @route   POST /api/chargebacks/webhooks/:provider
 * @desc    Handle chargeback webhook events
 * @access  Public (webhook signature validated)
 */
router.post('/webhooks/:provider',
  asyncHandler(async (req, res) => {
    const { provider } = req.params;

    // TODO: Add webhook signature validation for each provider
    // For Stripe: use stripe.webhooks.constructEvent()
    // For PayPal: verify signature header
    // For Authorize.Net: verify callback authentication

    await chargebackService.handleWebhookEvent(provider, req.body);

    res.json({ received: true });
  })
);

module.exports = router;
