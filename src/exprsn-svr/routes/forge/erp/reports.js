const express = require('express');
const router = express.Router();
const Joi = require('joi');
const financialReportingService = require('../../../services/forge/erp/financialReportingService');
const { requirePermission } = require('../../../middleware/auth');
const logger = require('../../../utils/logger');

// ===== Validation Schemas =====

const dateRangeSchema = Joi.object({
  startDate: Joi.date().required(),
  endDate: Joi.date().required()
});

const asOfDateSchema = Joi.object({
  asOfDate: Joi.date().default(() => new Date())
});

const generalLedgerSchema = Joi.object({
  accountId: Joi.string().uuid().required(),
  startDate: Joi.date().required(),
  endDate: Joi.date().required()
});

// ===== Routes =====

/**
 * GET /api/erp/reports
 * List available reports
 */
router.get('/',
  
  requirePermission('read'),
  (req, res) => {
    res.json({
      success: true,
      reports: {
        balanceSheet: {
          endpoint: '/api/erp/reports/balance-sheet',
          description: 'Statement of financial position showing assets, liabilities, and equity',
          parameters: ['asOfDate']
        },
        profitAndLoss: {
          endpoint: '/api/erp/reports/profit-loss',
          description: 'Income statement showing revenue, expenses, and net income',
          parameters: ['startDate', 'endDate']
        },
        cashFlow: {
          endpoint: '/api/erp/reports/cash-flow',
          description: 'Cash flow statement showing operating, investing, and financing activities',
          parameters: ['startDate', 'endDate']
        },
        trialBalance: {
          endpoint: '/api/erp/reports/trial-balance',
          description: 'Trial balance showing all account balances with debits and credits',
          parameters: ['asOfDate']
        },
        generalLedger: {
          endpoint: '/api/erp/reports/general-ledger/:accountId',
          description: 'Detailed transaction history for a specific account',
          parameters: ['accountId', 'startDate', 'endDate']
        },
        arAging: {
          endpoint: '/api/erp/reports/ar-aging',
          description: 'Accounts receivable aging report (30/60/90 days)',
          parameters: []
        },
        apAging: {
          endpoint: '/api/erp/reports/ap-aging',
          description: 'Accounts payable aging report',
          parameters: []
        },
        financialRatios: {
          endpoint: '/api/erp/reports/financial-ratios',
          description: 'Key financial ratios including liquidity, profitability, and efficiency metrics',
          parameters: ['asOfDate']
        }
      }
    });
  }
);

/**
 * GET /api/erp/reports/balance-sheet
 * Generate Balance Sheet
 */
router.get('/balance-sheet',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const { error, value } = asOfDateSchema.validate(req.query);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const balanceSheet = await financialReportingService.generateBalanceSheet(value.asOfDate);

      res.json({
        success: true,
        report: 'Balance Sheet',
        balanceSheet
      });
    } catch (err) {
      logger.error('Failed to generate balance sheet', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'REPORT_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * GET /api/erp/reports/profit-loss
 * Generate Profit and Loss Statement (Income Statement)
 */
router.get('/profit-loss',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const { error, value } = dateRangeSchema.validate(req.query);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const profitLoss = await financialReportingService.generateProfitAndLoss(
        new Date(value.startDate),
        new Date(value.endDate)
      );

      res.json({
        success: true,
        report: 'Profit & Loss Statement',
        profitLoss
      });
    } catch (err) {
      logger.error('Failed to generate profit and loss', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'REPORT_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * GET /api/erp/reports/cash-flow
 * Generate Cash Flow Statement
 */
router.get('/cash-flow',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const { error, value } = dateRangeSchema.validate(req.query);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const cashFlow = await financialReportingService.generateCashFlowStatement(
        new Date(value.startDate),
        new Date(value.endDate)
      );

      res.json({
        success: true,
        report: 'Cash Flow Statement',
        cashFlow
      });
    } catch (err) {
      logger.error('Failed to generate cash flow statement', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'REPORT_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * GET /api/erp/reports/trial-balance
 * Generate Trial Balance
 */
router.get('/trial-balance',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const { error, value } = asOfDateSchema.validate(req.query);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const trialBalance = await financialReportingService.generateTrialBalance(value.asOfDate);

      res.json({
        success: true,
        report: 'Trial Balance',
        trialBalance
      });
    } catch (err) {
      logger.error('Failed to generate trial balance', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'REPORT_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * GET /api/erp/reports/general-ledger/:accountId
 * Generate General Ledger for specific account
 */
router.get('/general-ledger/:accountId',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const schema = Joi.object({
        accountId: Joi.string().uuid().required(),
        startDate: Joi.date().required(),
        endDate: Joi.date().required()
      });

      const { error, value } = schema.validate({
        accountId: req.params.accountId,
        ...req.query
      });

      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const generalLedger = await financialReportingService.generateGeneralLedger(
        value.accountId,
        new Date(value.startDate),
        new Date(value.endDate)
      );

      res.json({
        success: true,
        report: 'General Ledger',
        generalLedger
      });
    } catch (err) {
      logger.error('Failed to generate general ledger', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'REPORT_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * GET /api/erp/reports/ar-aging
 * Generate Accounts Receivable Aging Report
 */
router.get('/ar-aging',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const agingReport = await financialReportingService.generateAccountsReceivableAging();

      res.json({
        success: true,
        report: 'Accounts Receivable Aging',
        agingReport
      });
    } catch (err) {
      logger.error('Failed to generate AR aging report', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'REPORT_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * GET /api/erp/reports/ap-aging
 * Generate Accounts Payable Aging Report
 */
router.get('/ap-aging',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const agingReport = await financialReportingService.generateAccountsPayableAging();

      res.json({
        success: true,
        report: 'Accounts Payable Aging',
        agingReport
      });
    } catch (err) {
      logger.error('Failed to generate AP aging report', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'REPORT_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * GET /api/erp/reports/financial-ratios
 * Calculate Financial Ratios
 */
router.get('/financial-ratios',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const { error, value } = asOfDateSchema.validate(req.query);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const ratios = await financialReportingService.calculateFinancialRatios(value.asOfDate);

      res.json({
        success: true,
        report: 'Financial Ratios',
        ratios
      });
    } catch (err) {
      logger.error('Failed to calculate financial ratios', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'REPORT_ERROR',
        message: err.message
      });
    }
  }
);

module.exports = router;
