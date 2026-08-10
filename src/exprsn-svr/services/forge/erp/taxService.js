const { Op } = require('sequelize');
const { TaxRate, TaxExemption, Customer, Product } = require('../../../models/forge');
const logger = require('../../../utils/logger');
const { sequelize } = require('../../../config/database');

/**
 * Tax Management Service
 *
 * Handles tax rate management, tax calculations, exemptions, and compliance.
 * Supports simple and compound taxes, jurisdiction-based selection, and exemptions.
 */

// ===== Tax Rate Management =====

/**
 * Create a tax rate
 */
async function createTaxRate({
  code,
  name,
  description,
  taxType = 'sales',
  rate,
  rateType = 'percentage',
  country,
  state,
  jurisdiction,
  isCompound = false,
  components = [],
  applicableOn = 'subtotal',
  includedInPrice = false,
  isActive = true,
  effectiveFrom,
  effectiveTo,
  accountId,
  recoverable = false,
  reportingCategory,
  priority = 0,
  rules = {}
}) {
  try {
    // Validate compound tax components
    if (isCompound && (!components || components.length === 0)) {
      throw new Error('Compound tax must have at least one component');
    }

    // Validate rate
    if (rate < 0) {
      throw new Error('Tax rate cannot be negative');
    }

    const taxRate = await TaxRate.create({
      code,
      name,
      description,
      taxType,
      rate,
      rateType,
      country,
      state,
      jurisdiction,
      isCompound,
      components,
      applicableOn,
      includedInPrice,
      isActive,
      effectiveFrom,
      effectiveTo,
      accountId,
      recoverable,
      reportingCategory,
      priority,
      rules
    });

    logger.info('Tax rate created', {
      taxRateId: taxRate.id,
      code: taxRate.code,
      rate: taxRate.rate
    });

    return taxRate;
  } catch (error) {
    logger.error('Failed to create tax rate', {
      code,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get tax rate by ID
 */
async function getTaxRateById(taxRateId) {
  try {
    const taxRate = await TaxRate.findByPk(taxRateId);

    if (!taxRate) {
      throw new Error(`Tax rate not found: ${taxRateId}`);
    }

    return taxRate;
  } catch (error) {
    logger.error('Failed to get tax rate', {
      taxRateId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get tax rate by code
 */
async function getTaxRateByCode(code) {
  try {
    const taxRate = await TaxRate.findOne({
      where: { code }
    });

    if (!taxRate) {
      throw new Error(`Tax rate not found: ${code}`);
    }

    return taxRate;
  } catch (error) {
    logger.error('Failed to get tax rate by code', {
      code,
      error: error.message
    });
    throw error;
  }
}

/**
 * List tax rates with filters
 */
async function listTaxRates({
  taxType,
  country,
  state,
  isActive,
  includedInPrice,
  recoverable,
  search,
  limit = 50,
  offset = 0,
  sortBy = 'priority',
  sortOrder = 'DESC'
}) {
  try {
    const where = {};

    if (taxType) where.taxType = taxType;
    if (country) where.country = country;
    if (state) where.state = state;
    if (isActive !== undefined) where.isActive = isActive;
    if (includedInPrice !== undefined) where.includedInPrice = includedInPrice;
    if (recoverable !== undefined) where.recoverable = recoverable;

    if (search) {
      where[Op.or] = [
        { code: { [Op.iLike]: `%${search}%` } },
        { name: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } }
      ];
    }

    // Only include active and currently effective tax rates by default
    const now = new Date();
    where[Op.and] = [
      {
        [Op.or]: [
          { effectiveFrom: null },
          { effectiveFrom: { [Op.lte]: now } }
        ]
      },
      {
        [Op.or]: [
          { effectiveTo: null },
          { effectiveTo: { [Op.gte]: now } }
        ]
      }
    ];

    const { count, rows } = await TaxRate.findAndCountAll({
      where,
      limit,
      offset,
      order: [[sortBy, sortOrder]]
    });

    return {
      taxRates: rows,
      total: count,
      limit,
      offset
    };
  } catch (error) {
    logger.error('Failed to list tax rates', {
      error: error.message
    });
    throw error;
  }
}

/**
 * Update tax rate
 */
async function updateTaxRate(taxRateId, updates) {
  try {
    const taxRate = await getTaxRateById(taxRateId);

    // Validate compound tax components if updated
    if (updates.isCompound && (!updates.components || updates.components.length === 0)) {
      throw new Error('Compound tax must have at least one component');
    }

    // Update fields
    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined) {
        taxRate[key] = updates[key];
      }
    });

    await taxRate.save();

    logger.info('Tax rate updated', {
      taxRateId,
      updates: Object.keys(updates)
    });

    return taxRate;
  } catch (error) {
    logger.error('Failed to update tax rate', {
      taxRateId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Delete tax rate
 */
async function deleteTaxRate(taxRateId) {
  try {
    const taxRate = await getTaxRateById(taxRateId);
    await taxRate.destroy();

    logger.info('Tax rate deleted', { taxRateId });

    return { success: true };
  } catch (error) {
    logger.error('Failed to delete tax rate', {
      taxRateId,
      error: error.message
    });
    throw error;
  }
}

// ===== Tax Exemption Management =====

/**
 * Create tax exemption
 */
async function createTaxExemption({
  exemptionNumber,
  entityType,
  entityId,
  exemptionType = 'full',
  taxRateIds = [],
  reason,
  certificateNumber,
  issuingAuthority,
  country,
  state,
  effectiveFrom,
  effectiveTo,
  isActive = true,
  autoRenew = false,
  attachments = [],
  conditions = {}
}) {
  try {
    // Validate specific tax exemptions have tax rate IDs
    if (exemptionType === 'specific_tax' && (!taxRateIds || taxRateIds.length === 0)) {
      throw new Error('Specific tax exemptions must specify at least one tax rate');
    }

    const exemption = await TaxExemption.create({
      exemptionNumber,
      entityType,
      entityId,
      exemptionType,
      taxRateIds,
      reason,
      certificateNumber,
      issuingAuthority,
      country,
      state,
      effectiveFrom,
      effectiveTo,
      isActive,
      autoRenew,
      attachments,
      conditions
    });

    logger.info('Tax exemption created', {
      exemptionId: exemption.id,
      exemptionNumber: exemption.exemptionNumber,
      entityType,
      entityId
    });

    return exemption;
  } catch (error) {
    logger.error('Failed to create tax exemption', {
      exemptionNumber,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get tax exemption by ID
 */
async function getTaxExemptionById(exemptionId) {
  try {
    const exemption = await TaxExemption.findByPk(exemptionId);

    if (!exemption) {
      throw new Error(`Tax exemption not found: ${exemptionId}`);
    }

    return exemption;
  } catch (error) {
    logger.error('Failed to get tax exemption', {
      exemptionId,
      error: error.message
    });
    throw error;
  }
}

/**
 * List tax exemptions
 */
async function listTaxExemptions({
  entityType,
  entityId,
  exemptionType,
  isActive,
  country,
  state,
  search,
  limit = 50,
  offset = 0
}) {
  try {
    const where = {};

    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    if (exemptionType) where.exemptionType = exemptionType;
    if (isActive !== undefined) where.isActive = isActive;
    if (country) where.country = country;
    if (state) where.state = state;

    if (search) {
      where[Op.or] = [
        { exemptionNumber: { [Op.iLike]: `%${search}%` } },
        { reason: { [Op.iLike]: `%${search}%` } },
        { certificateNumber: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows } = await TaxExemption.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']]
    });

    return {
      exemptions: rows,
      total: count,
      limit,
      offset
    };
  } catch (error) {
    logger.error('Failed to list tax exemptions', {
      error: error.message
    });
    throw error;
  }
}

/**
 * Update tax exemption
 */
async function updateTaxExemption(exemptionId, updates) {
  try {
    const exemption = await getTaxExemptionById(exemptionId);

    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined) {
        exemption[key] = updates[key];
      }
    });

    await exemption.save();

    logger.info('Tax exemption updated', {
      exemptionId,
      updates: Object.keys(updates)
    });

    return exemption;
  } catch (error) {
    logger.error('Failed to update tax exemption', {
      exemptionId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Delete tax exemption
 */
async function deleteTaxExemption(exemptionId) {
  try {
    const exemption = await getTaxExemptionById(exemptionId);
    await exemption.destroy();

    logger.info('Tax exemption deleted', { exemptionId });

    return { success: true };
  } catch (error) {
    logger.error('Failed to delete tax exemption', {
      exemptionId,
      error: error.message
    });
    throw error;
  }
}

// ===== Tax Calculation =====

/**
 * Determine applicable tax rates based on jurisdiction and entity
 */
async function determineApplicableTaxRates({
  country,
  state,
  jurisdiction,
  customerId,
  productId,
  taxType = 'sales',
  transactionDate = new Date()
}) {
  try {
    // Check for customer exemptions
    if (customerId) {
      const customerExemptions = await TaxExemption.findAll({
        where: {
          entityType: 'customer',
          entityId: customerId,
          isActive: true,
          effectiveFrom: { [Op.lte]: transactionDate },
          [Op.or]: [
            { effectiveTo: null },
            { effectiveTo: { [Op.gte]: transactionDate } }
          ]
        }
      });

      // If full exemption exists, return empty array
      if (customerExemptions.some(ex => ex.exemptionType === 'full')) {
        return {
          taxRates: [],
          exemptions: customerExemptions,
          totalRate: 0
        };
      }
    }

    // Find applicable tax rates
    const where = {
      taxType: ['both', taxType],
      isActive: true,
      effectiveFrom: { [Op.lte]: transactionDate },
      [Op.or]: [
        { effectiveTo: null },
        { effectiveTo: { [Op.gte]: transactionDate } }
      ]
    };

    // Jurisdiction matching (most specific first)
    const jurisdictionConditions = [];

    if (jurisdiction) {
      jurisdictionConditions.push({
        country,
        state,
        jurisdiction
      });
    }

    if (state) {
      jurisdictionConditions.push({
        country,
        state,
        jurisdiction: null
      });
    }

    if (country) {
      jurisdictionConditions.push({
        country,
        state: null,
        jurisdiction: null
      });
    }

    // Global/default tax rates
    jurisdictionConditions.push({
      country: null,
      state: null,
      jurisdiction: null
    });

    const taxRates = await TaxRate.findAll({
      where: {
        ...where,
        [Op.or]: jurisdictionConditions
      },
      order: [['priority', 'DESC'], ['createdAt', 'ASC']]
    });

    // Calculate total rate
    let totalRate = 0;
    taxRates.forEach(taxRate => {
      if (taxRate.rateType === 'percentage') {
        totalRate += parseFloat(taxRate.rate);
      }
    });

    return {
      taxRates,
      exemptions: [],
      totalRate
    };
  } catch (error) {
    logger.error('Failed to determine applicable tax rates', {
      country,
      state,
      error: error.message
    });
    throw error;
  }
}

/**
 * Calculate tax for a single line item
 */
function calculateLineItemTax(lineItem, taxRate, baseAmount) {
  let taxAmount = 0;

  if (taxRate.rateType === 'percentage') {
    // Simple percentage tax
    if (!taxRate.isCompound) {
      taxAmount = (baseAmount * parseFloat(taxRate.rate)) / 100;
    } else {
      // Compound tax - calculate each component
      taxRate.components.forEach(component => {
        const componentTax = (baseAmount * parseFloat(component.rate)) / 100;
        taxAmount += componentTax;
      });
    }
  } else {
    // Fixed amount tax
    taxAmount = parseFloat(taxRate.rate) * lineItem.quantity;
  }

  return parseFloat(taxAmount.toFixed(2));
}

/**
 * Calculate tax for an invoice or order
 */
async function calculateTax({
  lineItems,
  customerId,
  country,
  state,
  jurisdiction,
  taxType = 'sales',
  discountAmount = 0,
  transactionDate = new Date()
}) {
  try {
    // Calculate subtotal
    const subtotal = lineItems.reduce((sum, item) => {
      return sum + (item.quantity * item.unitPrice);
    }, 0);

    // Determine applicable tax rates
    const { taxRates, exemptions } = await determineApplicableTaxRates({
      country,
      state,
      jurisdiction,
      customerId,
      taxType,
      transactionDate
    });

    // If exempt, return zero tax
    if (taxRates.length === 0 && exemptions.length > 0) {
      return {
        subtotal,
        taxAmount: 0,
        total: subtotal - discountAmount,
        taxBreakdown: [],
        appliedTaxRates: [],
        exemptions
      };
    }

    // Calculate tax for each applicable tax rate
    const taxBreakdown = [];
    let totalTaxAmount = 0;

    for (const taxRate of taxRates) {
      let baseAmount = subtotal;

      // Apply discount before tax if applicable
      if (taxRate.applicableOn === 'subtotal_with_discount') {
        baseAmount = subtotal - discountAmount;
      }

      let taxAmount = 0;

      // Calculate tax on each line item or on subtotal
      if (taxRate.applicableOn === 'line_item') {
        lineItems.forEach(lineItem => {
          const lineBaseAmount = lineItem.quantity * lineItem.unitPrice;
          taxAmount += calculateLineItemTax(lineItem, taxRate, lineBaseAmount);
        });
      } else {
        taxAmount = calculateLineItemTax({ quantity: 1 }, taxRate, baseAmount);
      }

      taxBreakdown.push({
        taxRateId: taxRate.id,
        taxCode: taxRate.code,
        taxName: taxRate.name,
        rate: taxRate.rate,
        rateType: taxRate.rateType,
        baseAmount,
        taxAmount,
        includedInPrice: taxRate.includedInPrice
      });

      totalTaxAmount += taxAmount;
    }

    const total = subtotal - discountAmount + totalTaxAmount;

    return {
      subtotal,
      discountAmount,
      taxAmount: parseFloat(totalTaxAmount.toFixed(2)),
      total: parseFloat(total.toFixed(2)),
      taxBreakdown,
      appliedTaxRates: taxRates.map(tr => ({
        id: tr.id,
        code: tr.code,
        name: tr.name,
        rate: tr.rate
      })),
      exemptions
    };
  } catch (error) {
    logger.error('Failed to calculate tax', {
      error: error.message
    });
    throw error;
  }
}

/**
 * Reverse-calculate tax (extract tax from price that includes tax)
 */
function reverseTaxCalculation(totalWithTax, taxRate) {
  const rate = parseFloat(taxRate.rate);
  const taxAmount = (totalWithTax * rate) / (100 + rate);
  const subtotal = totalWithTax - taxAmount;

  return {
    subtotal: parseFloat(subtotal.toFixed(2)),
    taxAmount: parseFloat(taxAmount.toFixed(2)),
    total: totalWithTax
  };
}

// ===== Tax Reporting =====

/**
 * Generate tax report for a period
 */
async function generateTaxReport({
  startDate,
  endDate,
  taxRateIds = [],
  country,
  state,
  reportType = 'summary'
}) {
  try {
    // This would query invoices, sales orders, and other taxable transactions
    // For now, returning a basic structure
    const report = {
      period: {
        startDate,
        endDate
      },
      filters: {
        taxRateIds,
        country,
        state
      },
      summary: {
        totalTaxCollected: 0,
        totalTaxable: 0,
        totalExempt: 0,
        transactionCount: 0
      },
      byTaxRate: [],
      details: reportType === 'detailed' ? [] : undefined
    };

    logger.info('Tax report generated', {
      startDate,
      endDate,
      reportType
    });

    return report;
  } catch (error) {
    logger.error('Failed to generate tax report', {
      error: error.message
    });
    throw error;
  }
}

module.exports = {
  // Tax Rate Management
  createTaxRate,
  getTaxRateById,
  getTaxRateByCode,
  listTaxRates,
  updateTaxRate,
  deleteTaxRate,

  // Tax Exemption Management
  createTaxExemption,
  getTaxExemptionById,
  listTaxExemptions,
  updateTaxExemption,
  deleteTaxExemption,

  // Tax Calculation
  determineApplicableTaxRates,
  calculateTax,
  reverseTaxCalculation,

  // Tax Reporting
  generateTaxReport
};
