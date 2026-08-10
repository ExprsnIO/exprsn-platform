const { Lead, Contact } = require('../../../models/forge');
const { Op } = require('sequelize');
const logger = require('../../../utils/logger');

/**
 * Lead Service
 * Business logic for lead management, scoring, and conversion
 */

/**
 * Calculate lead score based on various factors
 * @param {Object} lead - Lead data
 * @returns {number} Calculated score (0-100)
 */
const calculateLeadScore = (lead) => {
  let score = 0;

  // Email provided (+20 points)
  if (lead.email) score += 20;

  // Phone provided (+10 points)
  if (lead.phone) score += 10;

  // Company provided (+15 points)
  if (lead.company) score += 15;

  // Job title provided (+10 points)
  if (lead.jobTitle) score += 10;

  // Estimated value (+25 points for high value, +15 for medium, +5 for low)
  if (lead.estimatedValue) {
    if (lead.estimatedValue >= 10000) score += 25;
    else if (lead.estimatedValue >= 5000) score += 15;
    else if (lead.estimatedValue > 0) score += 5;
  }

  // Source quality (adjust based on known high-quality sources)
  const highQualitySources = ['referral', 'partner', 'inbound'];
  if (highQualitySources.includes(lead.source)) score += 10;

  // Status progression
  if (lead.status === 'contacted') score += 5;
  if (lead.status === 'qualified') score += 10;

  return Math.min(score, 100); // Cap at 100
};

/**
 * Determine lead rating based on score
 * @param {number} score - Lead score
 * @returns {string} Rating (hot, warm, cold)
 */
const determineRating = (score) => {
  if (score >= 70) return 'hot';
  if (score >= 40) return 'warm';
  return 'cold';
};

/**
 * Update lead score and rating
 * @param {Object} lead - Lead instance
 * @returns {Promise<Object>} Updated lead
 */
const updateLeadScore = async (lead) => {
  const score = calculateLeadScore(lead);
  const rating = determineRating(score);

  await lead.update({ score, rating });

  logger.info('Lead score updated', {
    leadId: lead.id,
    score,
    rating
  });

  return lead;
};

/**
 * Assign lead to a user (round-robin or manual)
 * @param {string} leadId - Lead ID
 * @param {string} userId - User ID to assign to
 * @returns {Promise<Object>} Updated lead
 */
const assignLead = async (leadId, userId) => {
  const lead = await Lead.findByPk(leadId);

  if (!lead) {
    throw new Error('Lead not found');
  }

  await lead.update({ ownerId: userId });

  logger.info('Lead assigned', {
    leadId,
    userId
  });

  return lead;
};

/**
 * Convert lead to contact
 * @param {string} leadId - Lead ID
 * @param {string} userId - User ID performing the conversion
 * @returns {Promise<Object>} Created contact and updated lead
 */
const convertLead = async (leadId, userId) => {
  const lead = await Lead.findByPk(leadId);

  if (!lead) {
    throw new Error('Lead not found');
  }

  if (lead.status === 'converted') {
    throw new Error('Lead already converted');
  }

  // Create contact from lead
  const contact = await Contact.create({
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    phone: lead.phone,
    companyName: lead.company,
    jobTitle: lead.jobTitle,
    source: lead.source,
    tags: lead.tags,
    customFields: lead.customFields,
    ownerId: lead.ownerId
  });

  // Update lead status
  await lead.update({
    status: 'converted',
    convertedContactId: contact.id,
    convertedAt: new Date()
  });

  logger.info('Lead converted', {
    leadId,
    contactId: contact.id,
    userId
  });

  return { lead, contact };
};

/**
 * Qualify or disqualify a lead
 * @param {string} leadId - Lead ID
 * @param {boolean} qualified - Whether lead is qualified
 * @param {string} reason - Reason for qualification/disqualification
 * @returns {Promise<Object>} Updated lead
 */
const qualifyLead = async (leadId, qualified, reason = null) => {
  const lead = await Lead.findByPk(leadId);

  if (!lead) {
    throw new Error('Lead not found');
  }

  const status = qualified ? 'qualified' : 'unqualified';
  const metadata = {
    ...lead.metadata,
    qualificationReason: reason,
    qualifiedAt: new Date()
  };

  await lead.update({ status, metadata });

  // Update score based on qualification
  if (qualified) {
    await updateLeadScore(lead);
  }

  logger.info('Lead qualification updated', {
    leadId,
    qualified,
    status
  });

  return lead;
};

/**
 * Bulk lead import with deduplication
 * @param {Array} leadsData - Array of lead objects
 * @param {string} ownerId - Owner ID for the leads
 * @returns {Promise<Object>} Import results
 */
const bulkImportLeads = async (leadsData, ownerId) => {
  const results = {
    created: 0,
    skipped: 0,
    errors: []
  };

  for (const leadData of leadsData) {
    try {
      // Check for duplicate by email
      if (leadData.email) {
        const existing = await Lead.findOne({
          where: {
            email: leadData.email,
            ownerId
          }
        });

        if (existing) {
          results.skipped++;
          continue;
        }
      }

      // Create lead with auto-scoring
      const lead = await Lead.create({
        ...leadData,
        ownerId
      });

      await updateLeadScore(lead);
      results.created++;
    } catch (error) {
      results.errors.push({
        data: leadData,
        error: error.message
      });
    }
  }

  logger.info('Bulk lead import completed', {
    total: leadsData.length,
    created: results.created,
    skipped: results.skipped,
    errors: results.errors.length
  });

  return results;
};

/**
 * Get lead statistics
 * @param {string} ownerId - Owner ID
 * @returns {Promise<Object>} Lead statistics
 */
const getLeadStats = async (ownerId) => {
  const totalLeads = await Lead.count({ where: { ownerId } });

  const byStatus = await Lead.findAll({
    where: { ownerId },
    attributes: [
      'status',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count']
    ],
    group: ['status'],
    raw: true
  });

  const byRating = await Lead.findAll({
    where: { ownerId, rating: { [Op.ne]: null } },
    attributes: [
      'rating',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count']
    ],
    group: ['rating'],
    raw: true
  });

  const avgScore = await Lead.findOne({
    where: { ownerId },
    attributes: [[sequelize.fn('AVG', sequelize.col('score')), 'avgScore']],
    raw: true
  });

  return {
    total: totalLeads,
    byStatus: byStatus.reduce((acc, item) => {
      acc[item.status] = parseInt(item.count);
      return acc;
    }, {}),
    byRating: byRating.reduce((acc, item) => {
      acc[item.rating] = parseInt(item.count);
      return acc;
    }, {}),
    averageScore: parseFloat(avgScore.avgScore) || 0
  };
};

module.exports = {
  calculateLeadScore,
  determineRating,
  updateLeadScore,
  assignLead,
  convertLead,
  qualifyLead,
  bulkImportLeads,
  getLeadStats
};
