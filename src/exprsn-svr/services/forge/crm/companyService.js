const { Company, Contact } = require('../../../models/forge');
const { Op } = require('sequelize');
const logger = require('../../../utils/logger');

/**
 * Company Service
 * Business logic for company management, hierarchy, and relationships
 */

/**
 * Find potential duplicate companies
 * @param {string} name - Company name
 * @param {string} ownerId - Owner ID
 * @returns {Promise<Array>} Array of potential duplicates
 */
const findDuplicates = async (name, ownerId) => {
  const duplicates = await Company.findAll({
    where: {
      ownerId,
      [Op.or]: [
        { name: { [Op.iLike]: name } },
        { legalName: { [Op.iLike]: name } }
      ]
    },
    limit: 10
  });

  return duplicates;
};

/**
 * Get company hierarchy (parent and subsidiaries)
 * @param {string} companyId - Company ID
 * @returns {Promise<Object>} Company hierarchy
 */
const getCompanyHierarchy = async (companyId) => {
  const company = await Company.findByPk(companyId);

  if (!company) {
    throw new Error('Company not found');
  }

  // Get parent company
  let parent = null;
  if (company.parentCompanyId) {
    parent = await Company.findByPk(company.parentCompanyId);
  }

  // Get subsidiaries
  const subsidiaries = await Company.findAll({
    where: {
      parentCompanyId: companyId
    },
    order: [['name', 'ASC']]
  });

  return {
    company,
    parent,
    subsidiaries
  };
};

/**
 * Merge two companies
 * @param {string} sourceId - Source company ID (will be merged into target)
 * @param {string} targetId - Target company ID (will receive merged data)
 * @param {Object} options - Merge options
 * @returns {Promise<Object>} Merged company
 */
const mergeCompanies = async (sourceId, targetId, options = {}) => {
  const source = await Company.findByPk(sourceId);
  const target = await Company.findByPk(targetId);

  if (!source || !target) {
    throw new Error('Source or target company not found');
  }

  if (source.ownerId !== target.ownerId) {
    throw new Error('Cannot merge companies from different owners');
  }

  // Merge data (target takes precedence unless option specifies otherwise)
  const mergedData = {
    ...source.toJSON(),
    ...target.toJSON(),
    id: target.id,
    // Combine tags
    tags: [...new Set([...(source.tags || []), ...(target.tags || [])])],
    // Merge custom fields
    customFields: {
      ...source.customFields,
      ...target.customFields
    }
  };

  // Update target company
  await target.update(mergedData);

  // Update all contacts to point to target company
  await Contact.update(
    { companyId: targetId },
    { where: { companyId: sourceId } }
  );

  // Archive or delete source company
  if (options.deleteSource) {
    await source.destroy();
  } else {
    await source.update({
      status: 'archived',
      metadata: {
        ...source.metadata,
        mergedInto: targetId,
        mergedAt: new Date()
      }
    });
  }

  logger.info('Companies merged', {
    sourceId,
    targetId,
    deleteSource: options.deleteSource
  });

  return target;
};

/**
 * Get company statistics
 * @param {string} ownerId - Owner ID
 * @returns {Promise<Object>} Company statistics
 */
const getCompanyStats = async (ownerId) => {
  const totalCompanies = await Company.count({ where: { ownerId } });

  const byAccountType = await Company.findAll({
    where: { ownerId },
    attributes: [
      'accountType',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count']
    ],
    group: ['accountType'],
    raw: true
  });

  const byIndustry = await Company.findAll({
    where: { ownerId, industry: { [Op.ne]: null } },
    attributes: [
      'industry',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count']
    ],
    group: ['industry'],
    order: [[sequelize.fn('COUNT', sequelize.col('id')), 'DESC']],
    limit: 10,
    raw: true
  });

  const totalRevenue = await Company.findOne({
    where: { ownerId, accountType: 'customer' },
    attributes: [[sequelize.fn('SUM', sequelize.col('annual_revenue')), 'totalRevenue']],
    raw: true
  });

  return {
    total: totalCompanies,
    byAccountType: byAccountType.reduce((acc, item) => {
      acc[item.accountType] = parseInt(item.count);
      return acc;
    }, {}),
    topIndustries: byIndustry.map(item => ({
      industry: item.industry,
      count: parseInt(item.count)
    })),
    totalRevenue: parseFloat(totalRevenue.totalRevenue) || 0
  };
};

/**
 * Get company contacts
 * @param {string} companyId - Company ID
 * @param {Object} options - Query options (limit, offset)
 * @returns {Promise<Object>} Contacts and count
 */
const getCompanyContacts = async (companyId, options = {}) => {
  const { limit = 50, offset = 0 } = options;

  const { count, rows } = await Contact.findAndCountAll({
    where: { companyId },
    limit,
    offset,
    order: [['createdAt', 'DESC']]
  });

  return {
    contacts: rows,
    total: count
  };
};

/**
 * Calculate company value/score
 * @param {Object} company - Company data
 * @returns {number} Company value score (0-100)
 */
const calculateCompanyValue = (company) => {
  let score = 0;

  // Revenue contribution (up to 40 points)
  if (company.annualRevenue) {
    if (company.annualRevenue >= 10000000) score += 40; // $10M+
    else if (company.annualRevenue >= 1000000) score += 30; // $1M+
    else if (company.annualRevenue >= 100000) score += 20; // $100K+
    else if (company.annualRevenue > 0) score += 10;
  }

  // Employee count (up to 20 points)
  if (company.employeeCount) {
    if (company.employeeCount >= 1000) score += 20;
    else if (company.employeeCount >= 100) score += 15;
    else if (company.employeeCount >= 10) score += 10;
    else if (company.employeeCount > 0) score += 5;
  }

  // Account type (up to 20 points)
  const accountTypeScores = {
    customer: 20,
    partner: 15,
    prospect: 10,
    vendor: 5,
    competitor: 0,
    former_customer: 5
  };
  score += accountTypeScores[company.accountType] || 0;

  // Data completeness (up to 20 points)
  const fields = ['website', 'email', 'phone', 'billingAddress', 'industry'];
  const completedFields = fields.filter(field => company[field]).length;
  score += (completedFields / fields.length) * 20;

  return Math.min(score, 100);
};

/**
 * Bulk company import with deduplication
 * @param {Array} companiesData - Array of company objects
 * @param {string} ownerId - Owner ID
 * @returns {Promise<Object>} Import results
 */
const bulkImportCompanies = async (companiesData, ownerId) => {
  const results = {
    created: 0,
    skipped: 0,
    errors: []
  };

  for (const companyData of companiesData) {
    try {
      // Check for duplicates by name
      const duplicates = await findDuplicates(companyData.name, ownerId);

      if (duplicates.length > 0) {
        results.skipped++;
        continue;
      }

      // Create company
      await Company.create({
        ...companyData,
        ownerId
      });

      results.created++;
    } catch (error) {
      results.errors.push({
        data: companyData,
        error: error.message
      });
    }
  }

  logger.info('Bulk company import completed', {
    total: companiesData.length,
    created: results.created,
    skipped: results.skipped,
    errors: results.errors.length
  });

  return results;
};

module.exports = {
  findDuplicates,
  getCompanyHierarchy,
  mergeCompanies,
  getCompanyStats,
  getCompanyContacts,
  calculateCompanyValue,
  bulkImportCompanies
};
