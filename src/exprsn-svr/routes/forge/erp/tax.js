const express = require('express');
const router = express.Router();
const Joi = require('joi');
const taxService = require('../../../services/forge/erp/taxService');
const { requirePermission } = require('../../../middleware/auth');
const logger = require('../../../utils/logger');

// ===== Validation Schemas =====

const createTaxRateSchema = Joi.object({
  code: Joi.string().max(50).required(),
  name: Joi.string().max(255).required(),
  description: Joi.string().allow(''),
  taxType: Joi.string().valid('sales', 'purchase', 'both', 'withholding', 'service', 'excise').default('sales'),
  rate: Joi.number().min(0).max(100).precision(4).required(),
  rateType: Joi.string().valid('percentage', 'fixed').default('percentage'),
  country: Joi.string().length(2).uppercase().allow(null),
  state: Joi.string().max(50).allow(null),
  jurisdiction: Joi.string().max(100).allow(null),
  isCompound: Joi.boolean().default(false),
  components: Joi.array().items(Joi.object({
    name: Joi.string().required(),
    rate: Joi.number().min(0).required(),
    order: Joi.number().integer().min(1).required()
  })).optional(),
  applicableOn: Joi.string().valid('subtotal', 'subtotal_with_discount', 'line_item').default('subtotal'),
  includedInPrice: Joi.boolean().default(false),
  isActive: Joi.boolean().default(true),
  effectiveFrom: Joi.date().allow(null),
  effectiveTo: Joi.date().greater(Joi.ref('effectiveFrom')).allow(null),
  accountId: Joi.string().uuid().allow(null),
  recoverable: Joi.boolean().default(false),
  reportingCategory: Joi.string().max(100).allow(null),
  priority: Joi.number().integer().min(0).default(0),
  rules: Joi.object().optional()
});

const updateTaxRateSchema = Joi.object({
  name: Joi.string().max(255),
  description: Joi.string().allow(''),
  rate: Joi.number().min(0).max(100).precision(4),
  rateType: Joi.string().valid('percentage', 'fixed'),
  country: Joi.string().length(2).uppercase().allow(null),
  state: Joi.string().max(50).allow(null),
  jurisdiction: Joi.string().max(100).allow(null),
  isCompound: Joi.boolean(),
  components: Joi.array().items(Joi.object({
    name: Joi.string().required(),
    rate: Joi.number().min(0).required(),
    order: Joi.number().integer().min(1).required()
  })),
  applicableOn: Joi.string().valid('subtotal', 'subtotal_with_discount', 'line_item'),
  includedInPrice: Joi.boolean(),
  isActive: Joi.boolean(),
  effectiveFrom: Joi.date().allow(null),
  effectiveTo: Joi.date().allow(null),
  accountId: Joi.string().uuid().allow(null),
  recoverable: Joi.boolean(),
  reportingCategory: Joi.string().max(100).allow(null),
  priority: Joi.number().integer().min(0),
  rules: Joi.object()
}).min(1);

const createTaxExemptionSchema = Joi.object({
  exemptionNumber: Joi.string().max(100).required(),
  entityType: Joi.string().valid('customer', 'product', 'transaction', 'category').required(),
  entityId: Joi.string().uuid().allow(null),
  exemptionType: Joi.string().valid('full', 'partial', 'specific_tax').default('full'),
  taxRateIds: Joi.array().items(Joi.string().uuid()).optional(),
  reason: Joi.string().max(255).required(),
  certificateNumber: Joi.string().max(100).allow(null),
  issuingAuthority: Joi.string().max(255).allow(null),
  country: Joi.string().length(2).uppercase().allow(null),
  state: Joi.string().max(50).allow(null),
  effectiveFrom: Joi.date().required(),
  effectiveTo: Joi.date().greater(Joi.ref('effectiveFrom')).allow(null),
  isActive: Joi.boolean().default(true),
  autoRenew: Joi.boolean().default(false),
  attachments: Joi.array().items(Joi.object({
    name: Joi.string().required(),
    url: Joi.string().uri().required(),
    uploadedAt: Joi.date().required()
  })).optional(),
  conditions: Joi.object().optional()
});

const updateTaxExemptionSchema = Joi.object({
  exemptionType: Joi.string().valid('full', 'partial', 'specific_tax'),
  taxRateIds: Joi.array().items(Joi.string().uuid()),
  reason: Joi.string().max(255),
  certificateNumber: Joi.string().max(100).allow(null),
  issuingAuthority: Joi.string().max(255).allow(null),
  country: Joi.string().length(2).uppercase().allow(null),
  state: Joi.string().max(50).allow(null),
  effectiveFrom: Joi.date(),
  effectiveTo: Joi.date().allow(null),
  isActive: Joi.boolean(),
  autoRenew: Joi.boolean(),
  attachments: Joi.array().items(Joi.object({
    name: Joi.string().required(),
    url: Joi.string().uri().required(),
    uploadedAt: Joi.date().required()
  })),
  conditions: Joi.object()
}).min(1);

const calculateTaxSchema = Joi.object({
  lineItems: Joi.array().items(Joi.object({
    productId: Joi.string().uuid().allow(null),
    description: Joi.string().required(),
    quantity: Joi.number().positive().required(),
    unitPrice: Joi.number().min(0).required()
  })).min(1).required(),
  customerId: Joi.string().uuid().allow(null),
  country: Joi.string().length(2).uppercase().allow(null),
  state: Joi.string().max(50).allow(null),
  jurisdiction: Joi.string().max(100).allow(null),
  taxType: Joi.string().valid('sales', 'purchase').default('sales'),
  discountAmount: Joi.number().min(0).default(0),
  transactionDate: Joi.date().default(() => new Date())
});

const determineTaxRatesSchema = Joi.object({
  country: Joi.string().length(2).uppercase().allow(null),
  state: Joi.string().max(50).allow(null),
  jurisdiction: Joi.string().max(100).allow(null),
  customerId: Joi.string().uuid().allow(null),
  productId: Joi.string().uuid().allow(null),
  taxType: Joi.string().valid('sales', 'purchase').default('sales'),
  transactionDate: Joi.date().default(() => new Date())
});

const reverseTaxSchema = Joi.object({
  totalWithTax: Joi.number().positive().required(),
  taxRateId: Joi.string().uuid().required()
});

const taxReportSchema = Joi.object({
  startDate: Joi.date().required(),
  endDate: Joi.date().greater(Joi.ref('startDate')).required(),
  taxRateIds: Joi.array().items(Joi.string().uuid()).optional(),
  country: Joi.string().length(2).uppercase().allow(null),
  state: Joi.string().max(50).allow(null),
  reportType: Joi.string().valid('summary', 'detailed').default('summary')
});

// ===== Tax Rate Routes =====

// List tax rates
router.get('/rates',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const {
        taxType,
        country,
        state,
        isActive,
        includedInPrice,
        recoverable,
        search,
        page = 1,
        limit = 50,
        sortBy = 'priority',
        sortOrder = 'DESC'
      } = req.query;

      const offset = (page - 1) * limit;

      const result = await taxService.listTaxRates({
        taxType,
        country,
        state,
        isActive: isActive !== undefined ? isActive === 'true' : undefined,
        includedInPrice: includedInPrice !== undefined ? includedInPrice === 'true' : undefined,
        recoverable: recoverable !== undefined ? recoverable === 'true' : undefined,
        search,
        limit: parseInt(limit),
        offset,
        sortBy,
        sortOrder
      });

      res.json({
        success: true,
        taxRates: result.taxRates,
        pagination: {
          total: result.total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(result.total / limit)
        }
      });
    } catch (error) {
      logger.error('Failed to list tax rates', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to list tax rates'
      });
    }
  }
);

// Get tax rate by ID
router.get('/rates/:id',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const taxRate = await taxService.getTaxRateById(req.params.id);

      res.json({
        success: true,
        taxRate
      });
    } catch (error) {
      logger.error('Failed to get tax rate', { error: error.message });
      res.status(404).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Get tax rate by code
router.get('/rates/code/:code',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const taxRate = await taxService.getTaxRateByCode(req.params.code);

      res.json({
        success: true,
        taxRate
      });
    } catch (error) {
      logger.error('Failed to get tax rate by code', { error: error.message });
      res.status(404).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Create tax rate
router.post('/rates',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = createTaxRateSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const taxRate = await taxService.createTaxRate(value);

      res.status(201).json({
        success: true,
        taxRate
      });
    } catch (error) {
      logger.error('Failed to create tax rate', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Update tax rate
router.put('/rates/:id',
  
  requirePermission('update'),
  async (req, res) => {
    try {
      const { error, value } = updateTaxRateSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const taxRate = await taxService.updateTaxRate(req.params.id, value);

      res.json({
        success: true,
        taxRate
      });
    } catch (error) {
      logger.error('Failed to update tax rate', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Delete tax rate
router.delete('/rates/:id',
  
  requirePermission('delete'),
  async (req, res) => {
    try {
      await taxService.deleteTaxRate(req.params.id);

      res.json({
        success: true,
        message: 'Tax rate deleted successfully'
      });
    } catch (error) {
      logger.error('Failed to delete tax rate', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// ===== Tax Exemption Routes =====

// List tax exemptions
router.get('/exemptions',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const {
        entityType,
        entityId,
        exemptionType,
        isActive,
        country,
        state,
        search,
        page = 1,
        limit = 50
      } = req.query;

      const offset = (page - 1) * limit;

      const result = await taxService.listTaxExemptions({
        entityType,
        entityId,
        exemptionType,
        isActive: isActive !== undefined ? isActive === 'true' : undefined,
        country,
        state,
        search,
        limit: parseInt(limit),
        offset
      });

      res.json({
        success: true,
        exemptions: result.exemptions,
        pagination: {
          total: result.total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(result.total / limit)
        }
      });
    } catch (error) {
      logger.error('Failed to list tax exemptions', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to list tax exemptions'
      });
    }
  }
);

// Get tax exemption by ID
router.get('/exemptions/:id',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const exemption = await taxService.getTaxExemptionById(req.params.id);

      res.json({
        success: true,
        exemption
      });
    } catch (error) {
      logger.error('Failed to get tax exemption', { error: error.message });
      res.status(404).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Create tax exemption
router.post('/exemptions',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = createTaxExemptionSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const exemption = await taxService.createTaxExemption(value);

      res.status(201).json({
        success: true,
        exemption
      });
    } catch (error) {
      logger.error('Failed to create tax exemption', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Update tax exemption
router.put('/exemptions/:id',
  
  requirePermission('update'),
  async (req, res) => {
    try {
      const { error, value } = updateTaxExemptionSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const exemption = await taxService.updateTaxExemption(req.params.id, value);

      res.json({
        success: true,
        exemption
      });
    } catch (error) {
      logger.error('Failed to update tax exemption', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Delete tax exemption
router.delete('/exemptions/:id',
  
  requirePermission('delete'),
  async (req, res) => {
    try {
      await taxService.deleteTaxExemption(req.params.id);

      res.json({
        success: true,
        message: 'Tax exemption deleted successfully'
      });
    } catch (error) {
      logger.error('Failed to delete tax exemption', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// ===== Tax Calculation Routes =====

// Calculate tax for transaction
router.post('/calculate',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const { error, value } = calculateTaxSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const result = await taxService.calculateTax(value);

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      logger.error('Failed to calculate tax', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Determine applicable tax rates
router.post('/determine',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const { error, value } = determineTaxRatesSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const result = await taxService.determineApplicableTaxRates(value);

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      logger.error('Failed to determine tax rates', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Reverse-calculate tax
router.post('/reverse-calculate',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const { error, value } = reverseTaxSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const taxRate = await taxService.getTaxRateById(value.taxRateId);
      const result = taxService.reverseTaxCalculation(value.totalWithTax, taxRate);

      res.json({
        success: true,
        ...result,
        taxRate: {
          id: taxRate.id,
          code: taxRate.code,
          name: taxRate.name,
          rate: taxRate.rate
        }
      });
    } catch (error) {
      logger.error('Failed to reverse-calculate tax', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// ===== Tax Reporting Routes =====

// Generate tax report
router.post('/reports',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const { error, value } = taxReportSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const report = await taxService.generateTaxReport(value);

      res.json({
        success: true,
        report
      });
    } catch (error) {
      logger.error('Failed to generate tax report', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

module.exports = router;
