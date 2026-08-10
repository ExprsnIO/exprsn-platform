const { Opportunity, Contact, Company, Product, Activity } = require('../../../models/forge');
const { Op, sequelize } = require('sequelize');
const logger = require('../../../utils/logger');

/**
 * Opportunity Service
 * Business logic for sales pipeline, forecasting, and deal management
 */

/**
 * Default pipeline stages
 */
const DEFAULT_STAGES = [
  { name: 'Prospecting', order: 1, probability: 10 },
  { name: 'Qualification', order: 2, probability: 20 },
  { name: 'Needs Analysis', order: 3, probability: 40 },
  { name: 'Proposal', order: 4, probability: 60 },
  { name: 'Negotiation', order: 5, probability: 80 },
  { name: 'Closed Won', order: 6, probability: 100 },
  { name: 'Closed Lost', order: 7, probability: 0 }
];

/**
 * Move opportunity to next stage
 * @param {string} opportunityId - Opportunity ID
 * @param {string} newStage - New stage name
 * @param {string} userId - User making the change
 * @returns {Promise<Object>} Updated opportunity
 */
const moveToStage = async (opportunityId, newStage, userId) => {
  const opportunity = await Opportunity.findByPk(opportunityId);

  if (!opportunity) {
    throw new Error('Opportunity not found');
  }

  const previousStage = opportunity.stage;

  // Update probability based on stage
  const stageConfig = DEFAULT_STAGES.find(s => s.name === newStage);
  const probability = stageConfig ? stageConfig.probability : opportunity.probability;

  await opportunity.update({
    stage: newStage,
    probability,
    stageHistory: [
      ...(opportunity.stageHistory || []),
      {
        from: previousStage,
        to: newStage,
        changedBy: userId,
        changedAt: new Date()
      }
    ]
  });

  // Create activity for stage change
  await Activity.create({
    activityType: 'stage_change',
    subject: `Opportunity moved to ${newStage}`,
    description: `Stage changed from ${previousStage} to ${newStage}`,
    opportunityId: opportunity.id,
    contactId: opportunity.contactId,
    companyId: opportunity.companyId,
    userId,
    metadata: { previousStage, newStage }
  });

  logger.info('Opportunity stage changed', {
    opportunityId,
    previousStage,
    newStage,
    probability
  });

  return opportunity;
};

/**
 * Mark opportunity as won
 * @param {string} opportunityId - Opportunity ID
 * @param {Object} winData - Win details
 * @returns {Promise<Object>} Updated opportunity
 */
const markAsWon = async (opportunityId, winData = {}) => {
  const opportunity = await Opportunity.findByPk(opportunityId);

  if (!opportunity) {
    throw new Error('Opportunity not found');
  }

  if (opportunity.stage === 'Closed Won') {
    throw new Error('Opportunity already marked as won');
  }

  const {
    actualAmount = opportunity.amount,
    actualCloseDate = new Date(),
    winReason = null,
    userId = null
  } = winData;

  await opportunity.update({
    stage: 'Closed Won',
    probability: 100,
    status: 'won',
    actualAmount,
    actualCloseDate,
    winLossReason: winReason,
    metadata: {
      ...(opportunity.metadata || {}),
      wonAt: new Date(),
      wonBy: userId
    }
  });

  // Create activity for won deal
  await Activity.create({
    activityType: 'deal_won',
    subject: `Deal won: ${opportunity.name}`,
    description: winReason || 'Opportunity successfully closed',
    opportunityId: opportunity.id,
    contactId: opportunity.contactId,
    companyId: opportunity.companyId,
    userId,
    metadata: { amount: actualAmount }
  });

  logger.info('Opportunity marked as won', {
    opportunityId,
    amount: actualAmount,
    userId
  });

  return opportunity;
};

/**
 * Mark opportunity as lost
 * @param {string} opportunityId - Opportunity ID
 * @param {Object} lossData - Loss details
 * @returns {Promise<Object>} Updated opportunity
 */
const markAsLost = async (opportunityId, lossData = {}) => {
  const opportunity = await Opportunity.findByPk(opportunityId);

  if (!opportunity) {
    throw new Error('Opportunity not found');
  }

  if (opportunity.stage === 'Closed Lost') {
    throw new Error('Opportunity already marked as lost');
  }

  const {
    lossReason = null,
    competitorId = null,
    userId = null
  } = lossData;

  await opportunity.update({
    stage: 'Closed Lost',
    probability: 0,
    status: 'lost',
    actualCloseDate: new Date(),
    winLossReason: lossReason,
    metadata: {
      ...(opportunity.metadata || {}),
      lostAt: new Date(),
      lostBy: userId,
      competitorId
    }
  });

  // Create activity for lost deal
  await Activity.create({
    activityType: 'deal_lost',
    subject: `Deal lost: ${opportunity.name}`,
    description: lossReason || 'Opportunity closed as lost',
    opportunityId: opportunity.id,
    contactId: opportunity.contactId,
    companyId: opportunity.companyId,
    userId,
    metadata: { reason: lossReason, competitorId }
  });

  logger.info('Opportunity marked as lost', {
    opportunityId,
    reason: lossReason,
    userId
  });

  return opportunity;
};

/**
 * Calculate weighted pipeline value
 * @param {Array} opportunities - Array of opportunities
 * @returns {number} Weighted pipeline value
 */
const calculateWeightedValue = (opportunities) => {
  return opportunities.reduce((sum, opp) => {
    const amount = parseFloat(opp.amount) || 0;
    const probability = (opp.probability || 0) / 100;
    return sum + (amount * probability);
  }, 0);
};

/**
 * Get pipeline forecast
 * @param {Object} filters - Forecast filters
 * @returns {Promise<Object>} Pipeline forecast
 */
const getPipelineForecast = async (filters = {}) => {
  const {
    startDate = null,
    endDate = null,
    ownerId = null,
    stage = null
  } = filters;

  const whereClause = {
    status: { [Op.notIn]: ['won', 'lost'] }
  };

  if (startDate) {
    whereClause.expectedCloseDate = { [Op.gte]: new Date(startDate) };
  }

  if (endDate) {
    whereClause.expectedCloseDate = {
      ...whereClause.expectedCloseDate,
      [Op.lte]: new Date(endDate)
    };
  }

  if (ownerId) {
    whereClause.ownerId = ownerId;
  }

  if (stage) {
    whereClause.stage = stage;
  }

  const opportunities = await Opportunity.findAll({
    where: whereClause,
    include: [
      { model: Contact, as: 'contact', attributes: ['id', 'firstName', 'lastName'] },
      { model: Company, as: 'company', attributes: ['id', 'name'] }
    ]
  });

  // Calculate totals
  const totalValue = opportunities.reduce((sum, opp) => sum + (parseFloat(opp.amount) || 0), 0);
  const weightedValue = calculateWeightedValue(opportunities);

  // Group by stage
  const byStage = {};
  for (const stage of DEFAULT_STAGES) {
    const stageOpps = opportunities.filter(o => o.stage === stage.name);
    byStage[stage.name] = {
      count: stageOpps.length,
      totalValue: stageOpps.reduce((sum, opp) => sum + (parseFloat(opp.amount) || 0), 0),
      weightedValue: calculateWeightedValue(stageOpps)
    };
  }

  // Group by expected close date (monthly)
  const byMonth = {};
  opportunities.forEach(opp => {
    if (opp.expectedCloseDate) {
      const month = new Date(opp.expectedCloseDate).toISOString().substring(0, 7);
      if (!byMonth[month]) {
        byMonth[month] = { count: 0, totalValue: 0, weightedValue: 0, opportunities: [] };
      }
      byMonth[month].count++;
      byMonth[month].totalValue += parseFloat(opp.amount) || 0;
      byMonth[month].opportunities.push(opp);
    }
  });

  // Calculate weighted value for each month
  for (const month in byMonth) {
    byMonth[month].weightedValue = calculateWeightedValue(byMonth[month].opportunities);
    delete byMonth[month].opportunities; // Remove opportunities from response
  }

  return {
    summary: {
      totalOpportunities: opportunities.length,
      totalValue,
      weightedValue,
      averageAmount: opportunities.length > 0 ? totalValue / opportunities.length : 0,
      averageProbability: opportunities.length > 0
        ? opportunities.reduce((sum, o) => sum + (o.probability || 0), 0) / opportunities.length
        : 0
    },
    byStage,
    byMonth: Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .reduce((acc, [month, data]) => ({ ...acc, [month]: data }), {})
  };
};

/**
 * Get win/loss analysis
 * @param {Object} filters - Analysis filters
 * @returns {Promise<Object>} Win/loss analysis
 */
const getWinLossAnalysis = async (filters = {}) => {
  const {
    startDate = null,
    endDate = null,
    ownerId = null
  } = filters;

  const whereClause = {
    status: { [Op.in]: ['won', 'lost'] }
  };

  if (startDate) {
    whereClause.actualCloseDate = { [Op.gte]: new Date(startDate) };
  }

  if (endDate) {
    whereClause.actualCloseDate = {
      ...whereClause.actualCloseDate,
      [Op.lte]: new Date(endDate)
    };
  }

  if (ownerId) {
    whereClause.ownerId = ownerId;
  }

  const closedOpportunities = await Opportunity.findAll({
    where: whereClause,
    order: [['actualCloseDate', 'DESC']]
  });

  const won = closedOpportunities.filter(o => o.status === 'won');
  const lost = closedOpportunities.filter(o => o.status === 'lost');

  const totalWonValue = won.reduce((sum, opp) => sum + (parseFloat(opp.actualAmount || opp.amount) || 0), 0);
  const totalLostValue = lost.reduce((sum, opp) => sum + (parseFloat(opp.amount) || 0), 0);

  // Calculate average sales cycle
  const salesCycleDays = won
    .filter(o => o.createdAt && o.actualCloseDate)
    .map(o => {
      const days = Math.floor((new Date(o.actualCloseDate) - new Date(o.createdAt)) / (1000 * 60 * 60 * 24));
      return days;
    });

  const avgSalesCycle = salesCycleDays.length > 0
    ? salesCycleDays.reduce((sum, days) => sum + days, 0) / salesCycleDays.length
    : 0;

  // Group loss reasons
  const lossReasons = {};
  lost.forEach(opp => {
    const reason = opp.winLossReason || 'Unknown';
    if (!lossReasons[reason]) {
      lossReasons[reason] = { count: 0, value: 0 };
    }
    lossReasons[reason].count++;
    lossReasons[reason].value += parseFloat(opp.amount) || 0;
  });

  // Win rate by stage
  const stageWinRates = {};
  for (const stage of DEFAULT_STAGES) {
    const stageOpps = closedOpportunities.filter(o => {
      // Check if opportunity was ever in this stage
      return (o.stageHistory || []).some(h => h.to === stage.name) || o.stage === stage.name;
    });

    const stageWon = stageOpps.filter(o => o.status === 'won');

    stageWinRates[stage.name] = {
      total: stageOpps.length,
      won: stageWon.length,
      lost: stageOpps.length - stageWon.length,
      winRate: stageOpps.length > 0 ? (stageWon.length / stageOpps.length) * 100 : 0
    };
  }

  return {
    summary: {
      total: closedOpportunities.length,
      won: won.length,
      lost: lost.length,
      winRate: closedOpportunities.length > 0 ? (won.length / closedOpportunities.length) * 100 : 0,
      totalWonValue,
      totalLostValue,
      averageWonAmount: won.length > 0 ? totalWonValue / won.length : 0,
      averageSalesCycle: Math.round(avgSalesCycle)
    },
    lossReasons: Object.entries(lossReasons)
      .sort(([, a], [, b]) => b.count - a.count)
      .reduce((acc, [reason, data]) => ({ ...acc, [reason]: data }), {}),
    stageWinRates
  };
};

/**
 * Get opportunity aging report
 * @param {Object} filters - Report filters
 * @returns {Promise<Object>} Aging report
 */
const getAgingReport = async (filters = {}) => {
  const { ownerId = null, stage = null } = filters;

  const whereClause = {
    status: { [Op.notIn]: ['won', 'lost'] }
  };

  if (ownerId) {
    whereClause.ownerId = ownerId;
  }

  if (stage) {
    whereClause.stage = stage;
  }

  const opportunities = await Opportunity.findAll({
    where: whereClause,
    include: [
      { model: Contact, as: 'contact', attributes: ['id', 'firstName', 'lastName'] },
      { model: Company, as: 'company', attributes: ['id', 'name'] }
    ]
  });

  // Calculate age in days
  const now = new Date();
  const aged = opportunities.map(opp => {
    const createdDate = new Date(opp.createdAt);
    const ageDays = Math.floor((now - createdDate) / (1000 * 60 * 60 * 24));

    // Determine age bucket
    let ageBucket = '0-30 days';
    if (ageDays > 90) ageBucket = '90+ days';
    else if (ageDays > 60) ageBucket = '60-90 days';
    else if (ageDays > 30) ageBucket = '30-60 days';

    return {
      ...opp.toJSON(),
      ageDays,
      ageBucket
    };
  });

  // Group by age bucket
  const byAgeBucket = {
    '0-30 days': { count: 0, value: 0, opportunities: [] },
    '30-60 days': { count: 0, value: 0, opportunities: [] },
    '60-90 days': { count: 0, value: 0, opportunities: [] },
    '90+ days': { count: 0, value: 0, opportunities: [] }
  };

  aged.forEach(opp => {
    byAgeBucket[opp.ageBucket].count++;
    byAgeBucket[opp.ageBucket].value += parseFloat(opp.amount) || 0;
    byAgeBucket[opp.ageBucket].opportunities.push(opp);
  });

  return {
    summary: {
      total: opportunities.length,
      averageAge: aged.length > 0
        ? Math.round(aged.reduce((sum, o) => sum + o.ageDays, 0) / aged.length)
        : 0
    },
    byAgeBucket
  };
};

/**
 * Create opportunity from lead
 * @param {string} leadId - Lead ID
 * @param {Object} opportunityData - Additional opportunity data
 * @returns {Promise<Object>} Created opportunity
 */
const createFromLead = async (leadId, opportunityData = {}) => {
  const Lead = require('../../../models/forge').Lead;
  const lead = await Lead.findByPk(leadId);

  if (!lead) {
    throw new Error('Lead not found');
  }

  const opportunity = await Opportunity.create({
    name: opportunityData.name || `${lead.firstName} ${lead.lastName} - ${lead.company || 'Opportunity'}`,
    amount: opportunityData.amount || lead.estimatedValue || 0,
    expectedCloseDate: opportunityData.expectedCloseDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    stage: opportunityData.stage || 'Prospecting',
    probability: opportunityData.probability || 10,
    contactId: lead.convertedContactId,
    ownerId: lead.ownerId,
    source: lead.source,
    description: opportunityData.description || lead.description,
    customFields: {
      ...(lead.customFields || {}),
      ...(opportunityData.customFields || {})
    },
    metadata: {
      createdFromLead: leadId,
      createdFromLeadAt: new Date()
    }
  });

  logger.info('Opportunity created from lead', {
    leadId,
    opportunityId: opportunity.id
  });

  return opportunity;
};

/**
 * Clone opportunity
 * @param {string} opportunityId - Opportunity ID to clone
 * @param {Object} overrides - Fields to override
 * @returns {Promise<Object>} Cloned opportunity
 */
const cloneOpportunity = async (opportunityId, overrides = {}) => {
  const original = await Opportunity.findByPk(opportunityId);

  if (!original) {
    throw new Error('Opportunity not found');
  }

  const cloned = await Opportunity.create({
    name: overrides.name || `${original.name} (Copy)`,
    amount: overrides.amount || original.amount,
    expectedCloseDate: overrides.expectedCloseDate || original.expectedCloseDate,
    stage: overrides.stage || 'Prospecting',
    probability: overrides.probability || 10,
    contactId: original.contactId,
    companyId: original.companyId,
    ownerId: overrides.ownerId || original.ownerId,
    source: original.source,
    description: original.description,
    customFields: original.customFields,
    metadata: {
      ...(original.metadata || {}),
      clonedFrom: opportunityId,
      clonedAt: new Date()
    }
  });

  logger.info('Opportunity cloned', {
    originalId: opportunityId,
    clonedId: cloned.id
  });

  return cloned;
};

module.exports = {
  DEFAULT_STAGES,
  moveToStage,
  markAsWon,
  markAsLost,
  getPipelineForecast,
  getWinLossAnalysis,
  getAgingReport,
  createFromLead,
  cloneOpportunity,
  calculateWeightedValue
};
