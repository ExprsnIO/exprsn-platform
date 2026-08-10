const express = require('express');
const router = express.Router();
const Joi = require('joi');
const financialReportsService = require('../../../services/forge/erp/financialReportsService');
const { requirePermission } = require('../../../middleware/auth');
const logger = require('../../../utils/logger');

// ===== Validation Schemas =====

const balanceSheetSchema = Joi.object({
  asOfDate: Joi.date().default(() => new Date()),
  compareToDate: Joi.date().allow(null),
  includeSubAccounts: Joi.boolean().default(true)
});

const profitAndLossSchema = Joi.object({
  startDate: Joi.date().required(),
  endDate: Joi.date().greater(Joi.ref('startDate')).required(),
  compareStartDate: Joi.date().allow(null),
  compareEndDate: Joi.date().when('compareStartDate', {
    is: Joi.exist(),
    then: Joi.date().greater(Joi.ref('compareStartDate')).required(),
    otherwise: Joi.allow(null)
  })
});

const cashFlowSchema = Joi.object({
  startDate: Joi.date().required(),
  endDate: Joi.date().greater(Joi.ref('startDate')).required()
});

const financialMetricsSchema = Joi.object({
  startDate: Joi.date().required(),
  endDate: Joi.date().greater(Joi.ref('startDate')).required()
});

// ===== Routes =====

// Generate Balance Sheet
router.post('/balance-sheet',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const { error, value } = balanceSheetSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const report = await financialReportsService.generateBalanceSheet(value);

      res.json({
        success: true,
        report
      });
    } catch (error) {
      logger.error('Failed to generate balance sheet', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Generate Profit & Loss Statement
router.post('/profit-and-loss',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const { error, value } = profitAndLossSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const report = await financialReportsService.generateProfitAndLoss(value);

      res.json({
        success: true,
        report
      });
    } catch (error) {
      logger.error('Failed to generate P&L statement', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Generate Cash Flow Statement
router.post('/cash-flow',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const { error, value } = cashFlowSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const report = await financialReportsService.generateCashFlowStatement(value);

      res.json({
        success: true,
        report
      });
    } catch (error) {
      logger.error('Failed to generate cash flow statement', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Generate Financial Metrics
router.post('/metrics',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const { error, value } = financialMetricsSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const metrics = await financialReportsService.generateFinancialMetrics(value);

      res.json({
        success: true,
        metrics
      });
    } catch (error) {
      logger.error('Failed to generate financial metrics', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

module.exports = router;
