const express = require('express');
const router = express.Router();
const Joi = require('joi');
const invoiceService = require('../../../services/forge/erp/invoiceService');
const { requirePermission } = require('../../../middleware/auth');
const logger = require('../../../utils/logger');

// ===== Validation Schemas =====

const createInvoiceSchema = Joi.object({
  customerId: Joi.string().uuid().required(),
  invoiceDate: Joi.date().required(),
  dueDate: Joi.date().required(),
  lineItems: Joi.array().items(
    Joi.object({
      productId: Joi.string().uuid().allow(null),
      description: Joi.string().required(),
      quantity: Joi.number().positive().required(),
      unitPrice: Joi.number().min(0).required(),
      discount: Joi.number().min(0).default(0),
      taxAmount: Joi.number().min(0).default(0)
    })
  ).min(1).required(),
  taxRate: Joi.number().min(0).max(100).default(0),
  discountAmount: Joi.number().min(0).default(0),
  shippingCost: Joi.number().min(0).default(0),
  currency: Joi.string().length(3).default('USD'),
  paymentTerms: Joi.string().valid(
    'due_on_receipt', 'net_15', 'net_30', 'net_45', 'net_60', 'net_90', 'custom'
  ).default('net_30'),
  notes: Joi.string().allow(''),
  internalNotes: Joi.string().allow(''),
  purchaseOrderNumber: Joi.string().allow(''),
  tags: Joi.array().items(Joi.string())
});

const updateInvoiceSchema = Joi.object({
  customerId: Joi.string().uuid(),
  invoiceDate: Joi.date(),
  dueDate: Joi.date(),
  lineItems: Joi.array().items(
    Joi.object({
      productId: Joi.string().uuid().allow(null),
      description: Joi.string().required(),
      quantity: Joi.number().positive().required(),
      unitPrice: Joi.number().min(0).required(),
      discount: Joi.number().min(0).default(0),
      taxAmount: Joi.number().min(0).default(0)
    })
  ),
  taxRate: Joi.number().min(0).max(100),
  discountAmount: Joi.number().min(0),
  shippingCost: Joi.number().min(0),
  notes: Joi.string().allow(''),
  internalNotes: Joi.string().allow(''),
  purchaseOrderNumber: Joi.string().allow(''),
  status: Joi.string().valid('draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled', 'void'),
  tags: Joi.array().items(Joi.string())
}).min(1);

const recordPaymentSchema = Joi.object({
  amount: Joi.number().positive().required(),
  paymentDate: Joi.date().default(() => new Date()),
  paymentMethod: Joi.string().valid(
    'cash', 'check', 'credit_card', 'bank_transfer', 'other'
  ).required(),
  referenceNumber: Joi.string().allow(''),
  notes: Joi.string().allow('')
});

const listInvoicesSchema = Joi.object({
  customerId: Joi.string().uuid(),
  status: Joi.string().valid('draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled', 'void'),
  startDate: Joi.date(),
  endDate: Joi.date(),
  minAmount: Joi.number().min(0),
  maxAmount: Joi.number().min(0),
  overdue: Joi.boolean(),
  limit: Joi.number().integer().min(1).max(100).default(50),
  offset: Joi.number().integer().min(0).default(0)
});

const sendInvoiceSchema = Joi.object({
  to: Joi.string().email(),
  cc: Joi.array().items(Joi.string().email()),
  subject: Joi.string(),
  message: Joi.string()
});

// ===== Routes =====

/**
 * POST /api/erp/invoices
 * Create a new invoice
 */
router.post('/',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = createInvoiceSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const invoice = await invoiceService.createInvoice(value);

      res.status(201).json({
        success: true,
        invoice
      });
    } catch (err) {
      logger.error('Failed to create invoice', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * GET /api/erp/invoices
 * List invoices with filters
 */
router.get('/',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const { error, value } = listInvoicesSchema.validate(req.query);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const result = await invoiceService.listInvoices(value);

      res.json({
        success: true,
        ...result
      });
    } catch (err) {
      logger.error('Failed to list invoices', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * GET /api/erp/invoices/statistics
 * Get invoice statistics
 */
router.get('/statistics',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const { customerId } = req.query;
      const stats = await invoiceService.getInvoiceStatistics(customerId);

      res.json({
        success: true,
        statistics: stats
      });
    } catch (err) {
      logger.error('Failed to get invoice statistics', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * GET /api/erp/invoices/:id
 * Get invoice by ID
 */
router.get('/:id',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const invoice = await invoiceService.getInvoiceById(req.params.id);

      res.json({
        success: true,
        invoice
      });
    } catch (err) {
      const status = err.message === 'Invoice not found' ? 404 : 500;
      logger.error('Failed to get invoice', { error: err.message, invoiceId: req.params.id });
      res.status(status).json({
        success: false,
        error: status === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * PUT /api/erp/invoices/:id
 * Update invoice
 */
router.put('/:id',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = updateInvoiceSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const invoice = await invoiceService.updateInvoice(req.params.id, value);

      res.json({
        success: true,
        invoice
      });
    } catch (err) {
      const status = err.message === 'Invoice not found' ? 404 : 400;
      logger.error('Failed to update invoice', { error: err.message, invoiceId: req.params.id });
      res.status(status).json({
        success: false,
        error: status === 404 ? 'NOT_FOUND' : 'UPDATE_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * DELETE /api/erp/invoices/:id
 * Delete (cancel) invoice
 */
router.delete('/:id',
  
  requirePermission('delete'),
  async (req, res) => {
    try {
      const invoice = await invoiceService.deleteInvoice(req.params.id);

      res.json({
        success: true,
        invoice,
        message: 'Invoice cancelled successfully'
      });
    } catch (err) {
      const status = err.message === 'Invoice not found' ? 404 : 400;
      logger.error('Failed to delete invoice', { error: err.message, invoiceId: req.params.id });
      res.status(status).json({
        success: false,
        error: status === 404 ? 'NOT_FOUND' : 'DELETE_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * POST /api/erp/invoices/:id/send
 * Send invoice via email
 */
router.post('/:id/send',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = sendInvoiceSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const invoice = await invoiceService.sendInvoice(req.params.id, value);

      res.json({
        success: true,
        invoice,
        message: 'Invoice sent successfully'
      });
    } catch (err) {
      const status = err.message === 'Invoice not found' ? 404 : 400;
      logger.error('Failed to send invoice', { error: err.message, invoiceId: req.params.id });
      res.status(status).json({
        success: false,
        error: status === 404 ? 'NOT_FOUND' : 'SEND_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * POST /api/erp/invoices/:id/pay
 * Record payment on invoice
 */
router.post('/:id/pay',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = recordPaymentSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const invoice = await invoiceService.recordPayment(req.params.id, value);

      res.json({
        success: true,
        invoice,
        message: 'Payment recorded successfully'
      });
    } catch (err) {
      const status = err.message === 'Invoice not found' ? 404 : 400;
      logger.error('Failed to record payment', { error: err.message, invoiceId: req.params.id });
      res.status(status).json({
        success: false,
        error: status === 404 ? 'NOT_FOUND' : 'PAYMENT_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * GET /api/erp/invoices/:id/pdf
 * Generate and download invoice PDF
 */
router.get('/:id/pdf',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const pdfPath = await invoiceService.generatePDF(req.params.id);

      res.download(pdfPath, (err) => {
        if (err) {
          logger.error('Failed to download PDF', { error: err.message });
        }

        // Clean up temp file
        const fs = require('fs');
        fs.unlink(pdfPath, (unlinkErr) => {
          if (unlinkErr) {
            logger.error('Failed to delete temp PDF', { error: unlinkErr.message });
          }
        });
      });
    } catch (err) {
      const status = err.message === 'Invoice not found' ? 404 : 500;
      logger.error('Failed to generate PDF', { error: err.message, invoiceId: req.params.id });
      res.status(status).json({
        success: false,
        error: status === 404 ? 'NOT_FOUND' : 'PDF_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * POST /api/erp/invoices/:id/line-items
 * Add line item to invoice
 */
router.post('/:id/line-items',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const lineItemSchema = Joi.object({
        productId: Joi.string().uuid().allow(null),
        description: Joi.string().required(),
        quantity: Joi.number().positive().required(),
        unitPrice: Joi.number().min(0).required(),
        discount: Joi.number().min(0).default(0),
        taxAmount: Joi.number().min(0).default(0)
      });

      const { error, value } = lineItemSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const invoice = await invoiceService.addLineItem(req.params.id, value);

      res.json({
        success: true,
        invoice,
        message: 'Line item added successfully'
      });
    } catch (err) {
      const status = err.message === 'Invoice not found' ? 404 : 400;
      logger.error('Failed to add line item', { error: err.message, invoiceId: req.params.id });
      res.status(status).json({
        success: false,
        error: status === 404 ? 'NOT_FOUND' : 'ADD_ITEM_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * DELETE /api/erp/invoices/:id/line-items/:lineItemId
 * Remove line item from invoice
 */
router.delete('/:id/line-items/:lineItemId',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const invoice = await invoiceService.removeLineItem(
        req.params.id,
        req.params.lineItemId
      );

      res.json({
        success: true,
        invoice,
        message: 'Line item removed successfully'
      });
    } catch (err) {
      const status = err.message === 'Invoice not found' ? 404 : 400;
      logger.error('Failed to remove line item', { error: err.message, invoiceId: req.params.id });
      res.status(status).json({
        success: false,
        error: status === 404 ? 'NOT_FOUND' : 'REMOVE_ITEM_ERROR',
        message: err.message
      });
    }
  }
);

module.exports = router;
