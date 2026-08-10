const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { validateCAToken, requirePermissions, asyncHandler } = require('@exprsn/shared');
const invoiceService = require('../services/invoiceService');
const pdfGenerator = require('../services/pdfGenerator');

/**
 * Validation schemas
 */
const createInvoiceSchema = Joi.object({
  customerId: Joi.string().uuid().required(),
  subscriptionId: Joi.string().uuid().allow(null),
  provider: Joi.string().valid('stripe', 'paypal', 'authorize_net').required(),
  lineItems: Joi.array().items(Joi.object({
    description: Joi.string().required(),
    quantity: Joi.number().integer().min(1).required(),
    unitPrice: Joi.number().min(0).required(),
    total: Joi.number().min(0).optional()
  })).min(1).required(),
  description: Joi.string().max(1000).allow(null),
  dueDate: Joi.date().allow(null),
  metadata: Joi.object().default({})
});

const markAsPaidSchema = Joi.object({
  transactionId: Joi.string().uuid().allow(null),
  paidAmount: Joi.number().min(0).allow(null),
  paidAt: Joi.date().allow(null)
});

const voidInvoiceSchema = Joi.object({
  reason: Joi.string().max(500).allow(null)
});

const sendInvoiceSchema = Joi.object({
  to: Joi.string().email().allow(null),
  cc: Joi.array().items(Joi.string().email()).default([]),
  bcc: Joi.array().items(Joi.string().email()).default([])
});

/**
 * @route   POST /api/invoices
 * @desc    Create a new invoice
 * @access  Private (requires write permission)
 */
router.post('/',
  validateCAToken,
  requirePermissions({ write: true }),
  asyncHandler(async (req, res) => {
    // Validate request body
    const { error, value } = createInvoiceSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    // Create invoice
    const invoice = await invoiceService.createInvoice(value);

    res.status(201).json({
      success: true,
      data: invoice
    });
  })
);

/**
 * @route   POST /api/invoices/subscription/:subscriptionId
 * @desc    Create invoice from subscription
 * @access  Private (requires write permission)
 */
router.post('/subscription/:subscriptionId',
  validateCAToken,
  requirePermissions({ write: true }),
  asyncHandler(async (req, res) => {
    const invoice = await invoiceService.createInvoiceFromSubscription(req.params.subscriptionId);

    res.status(201).json({
      success: true,
      data: invoice
    });
  })
);

/**
 * @route   GET /api/invoices/:id
 * @desc    Get invoice by ID
 * @access  Private (requires read permission)
 */
router.get('/:id',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const invoice = await invoiceService.getInvoice(req.params.id);

    res.json({
      success: true,
      data: invoice
    });
  })
);

/**
 * @route   GET /api/invoices
 * @desc    List all invoices with optional filters
 * @access  Private (requires read permission)
 */
router.get('/',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { customerId, status, limit = 20, offset = 0 } = req.query;

    const invoices = await invoiceService.listInvoices({
      customerId,
      status,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: invoices.rows,
      pagination: {
        total: invoices.count,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  })
);

/**
 * @route   GET /api/invoices/customer/:customerId
 * @desc    List customer invoices
 * @access  Private (requires read permission)
 */
router.get('/customer/:customerId',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { status, limit = 20, offset = 0 } = req.query;

    const invoices = await invoiceService.listInvoices({
      customerId: req.params.customerId,
      status,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: invoices.rows,
      pagination: {
        total: invoices.count,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  })
);

/**
 * @route   POST /api/invoices/:id/pay
 * @desc    Mark invoice as paid
 * @access  Private (requires update permission)
 */
router.post('/:id/pay',
  validateCAToken,
  requirePermissions({ update: true }),
  asyncHandler(async (req, res) => {
    // Validate request body
    const { error, value } = markAsPaidSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const invoice = await invoiceService.markAsPaid(req.params.id, value);

    res.json({
      success: true,
      data: invoice,
      message: 'Invoice marked as paid successfully'
    });
  })
);

/**
 * @route   POST /api/invoices/:id/void
 * @desc    Void an invoice
 * @access  Private (requires delete permission)
 */
router.post('/:id/void',
  validateCAToken,
  requirePermissions({ delete: true }),
  asyncHandler(async (req, res) => {
    // Validate request body
    const { error, value } = voidInvoiceSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const invoice = await invoiceService.voidInvoice(req.params.id, value.reason);

    res.json({
      success: true,
      data: invoice,
      message: 'Invoice voided successfully'
    });
  })
);

/**
 * @route   POST /api/invoices/:id/send
 * @desc    Send invoice via email
 * @access  Private (requires read permission)
 */
router.post('/:id/send',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    // Validate request body
    const { error, value } = sendInvoiceSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const result = await invoiceService.sendInvoice(req.params.id, value);

    res.json({
      success: true,
      data: result
    });
  })
);

/**
 * @route   GET /api/invoices/:id/pdf
 * @desc    Get invoice PDF
 * @access  Private (requires read permission)
 */
router.get('/:id/pdf',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const invoice = await invoiceService.getInvoice(req.params.id);

    // Generate PDF
    const pdfBuffer = await pdfGenerator.generateInvoicePDF(invoice);

    // Set headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    res.send(pdfBuffer);
  })
);

/**
 * @route   GET /api/invoices/customer/:customerId/upcoming
 * @desc    Get upcoming invoices for customer (subscription-based)
 * @access  Private (requires read permission)
 */
router.get('/customer/:customerId/upcoming',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const upcomingInvoices = await invoiceService.getUpcomingInvoices(req.params.customerId);

    res.json({
      success: true,
      data: upcomingInvoices
    });
  })
);

/**
 * @route   GET /api/invoices/stats
 * @desc    Get invoice statistics
 * @access  Private (requires read permission)
 */
router.get('/stats/all',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { customerId } = req.query;

    const stats = await invoiceService.getInvoiceStats(customerId);

    res.json({
      success: true,
      data: stats
    });
  })
);

/**
 * @route   POST /api/invoices/process-overdue
 * @desc    Process overdue invoices (admin/cron)
 * @access  Private (requires admin role)
 */
router.post('/process-overdue',
  validateCAToken,
  requirePermissions({ update: true }),
  asyncHandler(async (req, res) => {
    const result = await invoiceService.processOverdueInvoices();

    res.json({
      success: true,
      data: result,
      message: `Processed ${result.processed} overdue invoices`
    });
  })
);

module.exports = router;
