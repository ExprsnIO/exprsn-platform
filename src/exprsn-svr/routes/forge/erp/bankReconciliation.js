const express = require('express');
const router = express.Router();
const Joi = require('joi');
const bankReconciliationService = require('../../../services/forge/erp/bankReconciliationService');
const { requirePermission } = require('../../../middleware/auth');
const logger = require('../../../utils/logger');

// ===== Validation Schemas =====

const importBankStatementSchema = Joi.object({
  accountId: Joi.string().uuid().required(),
  statementDate: Joi.date().required(),
  openingBalance: Joi.number().required(),
  closingBalance: Joi.number().required(),
  transactions: Joi.array().items(Joi.object({
    date: Joi.date().required(),
    description: Joi.string().max(500).required(),
    reference: Joi.string().max(100).allow('', null),
    amount: Joi.number().required(),
    type: Joi.string().valid('debit', 'credit').required(),
    balance: Joi.number().allow(null)
  })).min(1).required()
});

const matchTransactionSchema = Joi.object({
  accountId: Joi.string().uuid().required(),
  statementDate: Joi.date().required(),
  transactionIndex: Joi.number().integer().min(0).required(),
  matchType: Joi.string().valid('payment', 'journal_entry').required(),
  matchId: Joi.string().uuid().required()
});

const unmatchTransactionSchema = Joi.object({
  accountId: Joi.string().uuid().required(),
  statementDate: Joi.date().required(),
  transactionIndex: Joi.number().integer().min(0).required(),
  reason: Joi.string().max(500).required()
});

const createAdjustmentSchema = Joi.object({
  accountId: Joi.string().uuid().required(),
  statementDate: Joi.date().required(),
  transactionIndex: Joi.number().integer().min(0).required(),
  adjustmentType: Joi.string().valid('bank_fee', 'interest', 'error', 'other').required(),
  description: Joi.string().max(500).allow('')
});

const completeReconciliationSchema = Joi.object({
  accountId: Joi.string().uuid().required(),
  statementDate: Joi.date().required(),
  notes: Joi.string().max(1000).allow('')
});

// ===== Routes =====

// Import bank statement
router.post('/import',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = importBankStatementSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const result = await bankReconciliationService.importBankStatement({
        ...value,
        userId: req.user.id
      });

      res.status(201).json({
        success: true,
        ...result
      });
    } catch (error) {
      logger.error('Failed to import bank statement', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Match transaction
router.post('/match',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = matchTransactionSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const transaction = await bankReconciliationService.matchTransaction({
        ...value,
        userId: req.user.id
      });

      res.json({
        success: true,
        transaction
      });
    } catch (error) {
      logger.error('Failed to match transaction', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Unmatch transaction
router.post('/unmatch',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = unmatchTransactionSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const transaction = await bankReconciliationService.unmatchTransaction({
        ...value,
        userId: req.user.id
      });

      res.json({
        success: true,
        transaction
      });
    } catch (error) {
      logger.error('Failed to unmatch transaction', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Create adjustment entry
router.post('/adjustment',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = createAdjustmentSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const result = await bankReconciliationService.createAdjustmentEntry({
        ...value,
        userId: req.user.id
      });

      res.status(201).json({
        success: true,
        ...result
      });
    } catch (error) {
      logger.error('Failed to create adjustment entry', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Complete reconciliation
router.post('/complete',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = completeReconciliationSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const result = await bankReconciliationService.completeReconciliation({
        ...value,
        userId: req.user.id
      });

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      logger.error('Failed to complete reconciliation', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Get reconciliation status
router.get('/status/:accountId',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const { accountId } = req.params;
      const { statementDate } = req.query;

      const status = await bankReconciliationService.getReconciliationStatus(
        accountId,
        statementDate || null
      );

      res.json({
        success: true,
        status
      });
    } catch (error) {
      logger.error('Failed to get reconciliation status', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Get unreconciled transactions
router.get('/unreconciled/:accountId',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const { accountId } = req.params;
      const { startDate, endDate, type } = req.query;

      const transactions = await bankReconciliationService.getUnreconciledTransactions(
        accountId,
        { startDate, endDate, type }
      );

      res.json({
        success: true,
        transactions,
        count: transactions.length
      });
    } catch (error) {
      logger.error('Failed to get unreconciled transactions', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

module.exports = router;
