const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { validateCAToken, requirePermissions, asyncHandler } = require('@exprsn/shared');
const PaymentService = require('../services/PaymentService');

// Validation schemas
const createPaymentSchema = Joi.object({
  configurationId: Joi.string().uuid(),
  provider: Joi.string().valid('stripe', 'paypal', 'authorizenet'),
  amount: Joi.number().positive().required(),
  currency: Joi.string().length(3).uppercase().default('USD'),
  customerId: Joi.string().uuid(),
  paymentMethodId: Joi.string(),
  description: Joi.string().max(500),
  metadata: Joi.object().default({}),
  idempotencyKey: Joi.string(),
  returnUrl: Joi.string().uri(),
  cancelUrl: Joi.string().uri()
});

const createRefundSchema = Joi.object({
  transactionId: Joi.string().uuid().required(),
  amount: Joi.number().positive(),
  reason: Joi.string().valid('duplicate', 'fraudulent', 'requested_by_customer', 'other'),
  description: Joi.string().max(500)
});

const createCustomerSchema = Joi.object({
  provider: Joi.string().valid('stripe', 'paypal', 'authorizenet').required(),
  email: Joi.string().email().required(),
  name: Joi.string().max(255),
  phone: Joi.string().max(50),
  description: Joi.string().max(500),
  metadata: Joi.object().default({})
});

/**
 * POST /api/transactions/payment
 * Process a payment
 */
router.post('/payment',
  validateCAToken,
  requirePermissions({ write: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = createPaymentSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const transaction = await PaymentService.processPayment(
      value,
      req.user.id,
      req.body.organizationId || null
    );

    res.status(201).json({
      success: true,
      data: transaction
    });
  })
);

/**
 * POST /api/transactions/refund
 * Process a refund
 */
router.post('/refund',
  validateCAToken,
  requirePermissions({ write: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = createRefundSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const refund = await PaymentService.processRefund(value, req.user.id);

    res.status(201).json({
      success: true,
      data: refund
    });
  })
);

/**
 * GET /api/transactions
 * List transactions
 */
router.get('/',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const {
      provider,
      status,
      type,
      startDate,
      endDate,
      limit = 50,
      offset = 0,
      orderBy = 'createdAt',
      orderDirection = 'DESC'
    } = req.query;

    const result = await PaymentService.listTransactions(
      {
        userId: req.user.id,
        provider,
        status,
        type,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null
      },
      {
        limit: parseInt(limit),
        offset: parseInt(offset),
        orderBy,
        orderDirection
      }
    );

    res.json({
      success: true,
      data: result.transactions,
      meta: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.offset + result.limit < result.total
      }
    });
  })
);

/**
 * GET /api/transactions/:id
 * Get transaction details
 */
router.get('/:id',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const transaction = await PaymentService.getTransaction(
      req.params.id,
      req.user.id
    );

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Transaction not found'
      });
    }

    res.json({
      success: true,
      data: transaction
    });
  })
);

/**
 * POST /api/transactions/customer
 * Create a customer
 */
router.post('/customer',
  validateCAToken,
  requirePermissions({ write: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = createCustomerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const customer = await PaymentService.createCustomer(
      value,
      req.user.id,
      value.provider
    );

    res.status(201).json({
      success: true,
      data: customer
    });
  })
);

/**
 * POST /api/transactions/:id/capture
 * Capture an authorized payment
 */
router.post('/:id/capture',
  validateCAToken,
  requirePermissions({ write: true }),
  asyncHandler(async (req, res) => {
    const { amount } = req.body;

    const transaction = await PaymentService.getTransaction(
      req.params.id,
      req.user.id
    );

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Transaction not found'
      });
    }

    if (transaction.type !== 'authorization') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_TRANSACTION_TYPE',
        message: 'Can only capture authorization transactions'
      });
    }

    // TODO: Implement capture logic through PaymentService
    res.status(501).json({
      success: false,
      error: 'NOT_IMPLEMENTED',
      message: 'Capture functionality coming soon'
    });
  })
);

/**
 * POST /api/transactions/:id/void
 * Void an authorized payment
 */
router.post('/:id/void',
  validateCAToken,
  requirePermissions({ write: true }),
  asyncHandler(async (req, res) => {
    const transaction = await PaymentService.getTransaction(
      req.params.id,
      req.user.id
    );

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Transaction not found'
      });
    }

    if (transaction.type !== 'authorization') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_TRANSACTION_TYPE',
        message: 'Can only void authorization transactions'
      });
    }

    // TODO: Implement void logic through PaymentService
    res.status(501).json({
      success: false,
      error: 'NOT_IMPLEMENTED',
      message: 'Void functionality coming soon'
    });
  })
);

module.exports = router;
