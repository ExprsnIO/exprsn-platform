const express = require('express');
const router = express.Router();
const Joi = require('joi');
const accountingService = require('../../../services/forge/erp/accountingService');
const { requirePermission } = require('../../../middleware/auth');
const logger = require('../../../utils/logger');

// ===== Validation Schemas =====

// Account Schemas
const createAccountSchema = Joi.object({
  accountNumber: Joi.string().max(50).required(),
  accountName: Joi.string().max(255).required(),
  accountType: Joi.string().valid(
    'asset', 'liability', 'equity', 'revenue', 'expense',
    'accounts_receivable', 'accounts_payable', 'cash', 'bank',
    'fixed_asset', 'other_current_asset', 'other_asset',
    'credit_card', 'long_term_liability', 'other_current_liability',
    'cost_of_goods_sold'
  ).required(),
  normalBalance: Joi.string().valid('debit', 'credit').required(),
  description: Joi.string().allow(''),
  parentAccountId: Joi.string().uuid().allow(null),
  currency: Joi.string().length(3).default('USD'),
  bankAccountNumber: Joi.string().allow(''),
  bankRoutingNumber: Joi.string().allow(''),
  bankName: Joi.string().allow(''),
  taxAccount: Joi.boolean().default(false),
  taxRate: Joi.number().min(0).max(100)
});

const updateAccountSchema = Joi.object({
  accountName: Joi.string().max(255),
  description: Joi.string().allow(''),
  parentAccountId: Joi.string().uuid().allow(null),
  isActive: Joi.boolean(),
  bankAccountNumber: Joi.string().allow(''),
  bankRoutingNumber: Joi.string().allow(''),
  bankName: Joi.string().allow(''),
  taxRate: Joi.number().min(0).max(100)
}).min(1);

// Journal Entry Schemas
const lineItemSchema = Joi.object({
  accountId: Joi.string().uuid().required(),
  accountNumber: Joi.string().required(),
  accountName: Joi.string().required(),
  debit: Joi.number().min(0).default(0),
  credit: Joi.number().min(0).default(0),
  description: Joi.string().allow('')
});

const createJournalEntrySchema = Joi.object({
  entryDate: Joi.date().required(),
  entryType: Joi.string().valid(
    'standard', 'adjusting', 'closing', 'reversing',
    'recurring', 'opening_balance', 'year_end', 'other'
  ).default('standard'),
  reference: Joi.string().allow(''),
  description: Joi.string().required(),
  lineItems: Joi.array().items(lineItemSchema).min(2).required(),
  currency: Joi.string().length(3).default('USD'),
  isRecurring: Joi.boolean().default(false),
  recurringFrequency: Joi.string().valid('monthly', 'quarterly', 'annually'),
  notes: Joi.string().allow(''),
  tags: Joi.array().items(Joi.string())
});

// Payment Schemas
const createPaymentSchema = Joi.object({
  paymentDate: Joi.date().required(),
  paymentType: Joi.string().valid(
    'customer_payment', 'vendor_payment', 'employee_reimbursement', 'other'
  ).required(),
  paymentMethod: Joi.string().valid(
    'cash', 'check', 'credit_card', 'debit_card', 'bank_transfer',
    'ach', 'wire', 'paypal', 'stripe', 'other'
  ).required(),
  customerId: Joi.string().uuid(),
  supplierId: Joi.string().uuid(),
  employeeId: Joi.string().uuid(),
  amount: Joi.number().positive().required(),
  currency: Joi.string().length(3).default('USD'),
  depositToAccountId: Joi.string().uuid().required(),
  referenceNumber: Joi.string().allow(''),
  checkNumber: Joi.string().allow(''),
  notes: Joi.string().allow('')
});

const applyPaymentSchema = Joi.object({
  invoiceAllocations: Joi.array().items(
    Joi.object({
      invoiceId: Joi.string().uuid().required(),
      invoiceNumber: Joi.string().required(),
      amount: Joi.number().positive().required()
    })
  ).min(1).required()
});

// ===== Chart of Accounts Routes =====

/**
 * POST /api/erp/accounts
 * Create new account
 */
router.post('/accounts',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = createAccountSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const account = await accountingService.createAccount(value);

      res.status(201).json({
        success: true,
        account
      });
    } catch (err) {
      logger.error('Failed to create account', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * GET /api/erp/accounts
 * List accounts
 */
router.get('/accounts',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const { accountType, isActive, parentAccountId, includeBalance } = req.query;

      const accounts = await accountingService.listAccounts({
        accountType,
        isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
        parentAccountId,
        includeBalance: includeBalance !== 'false'
      });

      res.json({
        success: true,
        accounts
      });
    } catch (err) {
      logger.error('Failed to list accounts', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * GET /api/erp/accounts/:id
 * Get account by ID
 */
router.get('/accounts/:id',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const account = await accountingService.getAccountById(req.params.id);

      res.json({
        success: true,
        account
      });
    } catch (err) {
      const status = err.message === 'Account not found' ? 404 : 500;
      logger.error('Failed to get account', { error: err.message, accountId: req.params.id });
      res.status(status).json({
        success: false,
        error: status === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * PUT /api/erp/accounts/:id
 * Update account
 */
router.put('/accounts/:id',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = updateAccountSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const account = await accountingService.updateAccount(req.params.id, value);

      res.json({
        success: true,
        account
      });
    } catch (err) {
      const status = err.message === 'Account not found' ? 404 : 400;
      logger.error('Failed to update account', { error: err.message, accountId: req.params.id });
      res.status(status).json({
        success: false,
        error: status === 404 ? 'NOT_FOUND' : 'UPDATE_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * DELETE /api/erp/accounts/:id
 * Deactivate account
 */
router.delete('/accounts/:id',
  
  requirePermission('delete'),
  async (req, res) => {
    try {
      const account = await accountingService.deactivateAccount(req.params.id);

      res.json({
        success: true,
        account,
        message: 'Account deactivated successfully'
      });
    } catch (err) {
      const status = err.message === 'Account not found' ? 404 : 400;
      logger.error('Failed to deactivate account', { error: err.message, accountId: req.params.id });
      res.status(status).json({
        success: false,
        error: status === 404 ? 'NOT_FOUND' : 'DEACTIVATE_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * GET /api/erp/accounts/:id/balance
 * Get account balance as of date
 */
router.get('/accounts/:id/balance',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const asOfDate = req.query.asOfDate ? new Date(req.query.asOfDate) : new Date();
      const balance = await accountingService.getAccountBalance(req.params.id, asOfDate);

      res.json({
        success: true,
        balance
      });
    } catch (err) {
      const status = err.message === 'Account not found' ? 404 : 500;
      logger.error('Failed to get account balance', { error: err.message, accountId: req.params.id });
      res.status(status).json({
        success: false,
        error: status === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR',
        message: err.message
      });
    }
  }
);

// ===== Journal Entry Routes =====

/**
 * POST /api/erp/journal-entries
 * Create journal entry
 */
router.post('/journal-entries',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = createJournalEntrySchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const entry = await accountingService.createJournalEntry(value);

      res.status(201).json({
        success: true,
        entry
      });
    } catch (err) {
      logger.error('Failed to create journal entry', { error: err.message });
      res.status(400).json({
        success: false,
        error: 'CREATION_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * GET /api/erp/journal-entries
 * List journal entries
 */
router.get('/journal-entries',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const filters = {
        entryType: req.query.entryType,
        status: req.query.status,
        isPosted: req.query.isPosted === 'true' ? true : req.query.isPosted === 'false' ? false : undefined,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        limit: parseInt(req.query.limit) || 50,
        offset: parseInt(req.query.offset) || 0
      };

      const result = await accountingService.listJournalEntries(filters);

      res.json({
        success: true,
        ...result
      });
    } catch (err) {
      logger.error('Failed to list journal entries', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * GET /api/erp/journal-entries/:id
 * Get journal entry by ID
 */
router.get('/journal-entries/:id',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const entry = await accountingService.getJournalEntryById(req.params.id);

      res.json({
        success: true,
        entry
      });
    } catch (err) {
      const status = err.message === 'Journal entry not found' ? 404 : 500;
      logger.error('Failed to get journal entry', { error: err.message, entryId: req.params.id });
      res.status(status).json({
        success: false,
        error: status === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * POST /api/erp/journal-entries/:id/post
 * Post journal entry (make permanent)
 */
router.post('/journal-entries/:id/post',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const entry = await accountingService.postJournalEntry(req.params.id);

      res.json({
        success: true,
        entry,
        message: 'Journal entry posted successfully'
      });
    } catch (err) {
      const status = err.message === 'Journal entry not found' ? 404 : 400;
      logger.error('Failed to post journal entry', { error: err.message, entryId: req.params.id });
      res.status(status).json({
        success: false,
        error: status === 404 ? 'NOT_FOUND' : 'POST_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * POST /api/erp/journal-entries/:id/reverse
 * Reverse journal entry
 */
router.post('/journal-entries/:id/reverse',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Reversal reason is required'
        });
      }

      const reversingEntry = await accountingService.reverseJournalEntry(req.params.id, reason);

      res.json({
        success: true,
        entry: reversingEntry,
        message: 'Journal entry reversed successfully'
      });
    } catch (err) {
      const status = err.message === 'Journal entry not found' ? 404 : 400;
      logger.error('Failed to reverse journal entry', { error: err.message, entryId: req.params.id });
      res.status(status).json({
        success: false,
        error: status === 404 ? 'NOT_FOUND' : 'REVERSE_ERROR',
        message: err.message
      });
    }
  }
);

// ===== Payment Routes =====

/**
 * POST /api/erp/payments
 * Create payment
 */
router.post('/payments',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = createPaymentSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const payment = await accountingService.createPayment(value);

      res.status(201).json({
        success: true,
        payment
      });
    } catch (err) {
      logger.error('Failed to create payment', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * GET /api/erp/payments
 * List payments
 */
router.get('/payments',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const filters = {
        paymentType: req.query.paymentType,
        customerId: req.query.customerId,
        supplierId: req.query.supplierId,
        status: req.query.status,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        limit: parseInt(req.query.limit) || 50,
        offset: parseInt(req.query.offset) || 0
      };

      const result = await accountingService.listPayments(filters);

      res.json({
        success: true,
        ...result
      });
    } catch (err) {
      logger.error('Failed to list payments', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * GET /api/erp/payments/:id
 * Get payment by ID
 */
router.get('/payments/:id',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const payment = await accountingService.getPaymentById(req.params.id);

      res.json({
        success: true,
        payment
      });
    } catch (err) {
      const status = err.message === 'Payment not found' ? 404 : 500;
      logger.error('Failed to get payment', { error: err.message, paymentId: req.params.id });
      res.status(status).json({
        success: false,
        error: status === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * POST /api/erp/payments/:id/apply
 * Apply payment to invoices
 */
router.post('/payments/:id/apply',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = applyPaymentSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const payment = await accountingService.applyPaymentToInvoices(
        req.params.id,
        value.invoiceAllocations
      );

      res.json({
        success: true,
        payment,
        message: 'Payment applied to invoices successfully'
      });
    } catch (err) {
      const status = err.message === 'Payment not found' ? 404 : 400;
      logger.error('Failed to apply payment', { error: err.message, paymentId: req.params.id });
      res.status(status).json({
        success: false,
        error: status === 404 ? 'NOT_FOUND' : 'APPLY_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * POST /api/erp/payments/:id/reconcile
 * Reconcile payment (mark as cleared)
 */
router.post('/payments/:id/reconcile',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const payment = await accountingService.reconcilePayment(req.params.id);

      res.json({
        success: true,
        payment,
        message: 'Payment reconciled successfully'
      });
    } catch (err) {
      const status = err.message === 'Payment not found' ? 404 : 400;
      logger.error('Failed to reconcile payment', { error: err.message, paymentId: req.params.id });
      res.status(status).json({
        success: false,
        error: status === 404 ? 'NOT_FOUND' : 'RECONCILE_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * POST /api/erp/payments/:id/refund
 * Refund payment
 */
router.post('/payments/:id/refund',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Refund reason is required'
        });
      }

      const payment = await accountingService.refundPayment(req.params.id, reason);

      res.json({
        success: true,
        payment,
        message: 'Payment refunded successfully'
      });
    } catch (err) {
      const status = err.message === 'Payment not found' ? 404 : 400;
      logger.error('Failed to refund payment', { error: err.message, paymentId: req.params.id });
      res.status(status).json({
        success: false,
        error: status === 404 ? 'NOT_FOUND' : 'REFUND_ERROR',
        message: err.message
      });
    }
  }
);

module.exports = router;
