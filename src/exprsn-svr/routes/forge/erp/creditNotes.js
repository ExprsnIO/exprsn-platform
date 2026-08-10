const express = require('express');
const router = express.Router();
const Joi = require('joi');
const creditNoteService = require('../../../services/forge/erp/creditNoteService');
const { requirePermission } = require('../../../middleware/auth');
const logger = require('../../../utils/logger');

// ===== Validation Schemas =====

const createCreditNoteSchema = Joi.object({
  invoiceId: Joi.string().uuid().allow(null),
  customerId: Joi.string().uuid().required(),
  issueDate: Joi.date().required(),
  reason: Joi.string().max(500).required(),
  creditType: Joi.string().valid('full_refund', 'partial_refund', 'price_adjustment', 'return', 'error_correction', 'discount', 'other').required(),
  lineItems: Joi.array().items(Joi.object({
    productId: Joi.string().uuid().allow(null),
    description: Joi.string().max(500).required(),
    quantity: Joi.number().positive().required(),
    unitPrice: Joi.number().min(0).required(),
    taxAmount: Joi.number().min(0).default(0)
  })).min(1).required(),
  refundMethod: Joi.string().valid('original_payment', 'bank_transfer', 'check', 'cash', 'store_credit', 'none').allow(null),
  notes: Joi.string().allow(''),
  internalNotes: Joi.string().allow('')
});

const updateCreditNoteSchema = Joi.object({
  reason: Joi.string().max(500),
  creditType: Joi.string().valid('full_refund', 'partial_refund', 'price_adjustment', 'return', 'error_correction', 'discount', 'other'),
  lineItems: Joi.array().items(Joi.object({
    productId: Joi.string().uuid().allow(null),
    description: Joi.string().max(500).required(),
    quantity: Joi.number().positive().required(),
    unitPrice: Joi.number().min(0).required(),
    taxAmount: Joi.number().min(0).default(0)
  })).min(1),
  refundMethod: Joi.string().valid('original_payment', 'bank_transfer', 'check', 'cash', 'store_credit', 'none').allow(null),
  notes: Joi.string().allow(''),
  internalNotes: Joi.string().allow('')
}).min(1);

const applyCreditSchema = Joi.object({
  invoiceId: Joi.string().uuid().required(),
  amount: Joi.number().positive().required()
});

const processRefundSchema = Joi.object({
  refundMethod: Joi.string().valid('original_payment', 'bank_transfer', 'check', 'cash', 'store_credit').required(),
  refundReference: Joi.string().max(100).required()
});

const voidCreditNoteSchema = Joi.object({
  voidReason: Joi.string().max(500).required()
});

// ===== Routes =====

// List credit notes
router.get('/',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const {
        customerId,
        invoiceId,
        status,
        creditType,
        refundStatus,
        startDate,
        endDate,
        search,
        page = 1,
        limit = 50,
        sortBy = 'issueDate',
        sortOrder = 'DESC'
      } = req.query;

      const offset = (page - 1) * limit;

      const result = await creditNoteService.listCreditNotes({
        customerId,
        invoiceId,
        status,
        creditType,
        refundStatus,
        startDate,
        endDate,
        search,
        limit: parseInt(limit),
        offset,
        sortBy,
        sortOrder
      });

      res.json({
        success: true,
        creditNotes: result.creditNotes,
        pagination: {
          total: result.total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(result.total / limit)
        }
      });
    } catch (error) {
      logger.error('Failed to list credit notes', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to list credit notes'
      });
    }
  }
);

// Get credit note by ID
router.get('/:id',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const creditNote = await creditNoteService.getCreditNoteById(req.params.id, true);

      res.json({
        success: true,
        creditNote
      });
    } catch (error) {
      logger.error('Failed to get credit note', { error: error.message });
      res.status(404).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Create credit note
router.post('/',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = createCreditNoteSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const creditNote = await creditNoteService.createCreditNote({
        ...value,
        userId: req.user.id
      });

      res.status(201).json({
        success: true,
        creditNote
      });
    } catch (error) {
      logger.error('Failed to create credit note', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Update credit note
router.put('/:id',
  
  requirePermission('update'),
  async (req, res) => {
    try {
      const { error, value } = updateCreditNoteSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const creditNote = await creditNoteService.updateCreditNote(req.params.id, value);

      res.json({
        success: true,
        creditNote
      });
    } catch (error) {
      logger.error('Failed to update credit note', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Delete credit note
router.delete('/:id',
  
  requirePermission('delete'),
  async (req, res) => {
    try {
      await creditNoteService.deleteCreditNote(req.params.id);

      res.json({
        success: true,
        message: 'Credit note deleted successfully'
      });
    } catch (error) {
      logger.error('Failed to delete credit note', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Issue credit note
router.post('/:id/issue',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const creditNote = await creditNoteService.issueCreditNote(
        req.params.id,
        req.user.id
      );

      res.json({
        success: true,
        creditNote
      });
    } catch (error) {
      logger.error('Failed to issue credit note', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Apply credit note to invoice
router.post('/:id/apply',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = applyCreditSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const result = await creditNoteService.applyCreditNoteToInvoice({
        creditNoteId: req.params.id,
        ...value,
        userId: req.user.id
      });

      res.json({
        success: true,
        creditNote: result.creditNote,
        invoice: result.invoice
      });
    } catch (error) {
      logger.error('Failed to apply credit note', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Process refund
router.post('/:id/refund',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = processRefundSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const creditNote = await creditNoteService.processRefund({
        creditNoteId: req.params.id,
        ...value,
        userId: req.user.id
      });

      res.json({
        success: true,
        creditNote
      });
    } catch (error) {
      logger.error('Failed to process refund', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Void credit note
router.post('/:id/void',
  
  requirePermission('delete'),
  async (req, res) => {
    try {
      const { error, value } = voidCreditNoteSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const creditNote = await creditNoteService.voidCreditNote(
        req.params.id,
        value.voidReason,
        req.user.id
      );

      res.json({
        success: true,
        creditNote
      });
    } catch (error) {
      logger.error('Failed to void credit note', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Get customer credit balance
router.get('/customer/:customerId/balance',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const balance = await creditNoteService.getCustomerCreditBalance(req.params.customerId);

      res.json({
        success: true,
        balance
      });
    } catch (error) {
      logger.error('Failed to get customer credit balance', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

module.exports = router;
