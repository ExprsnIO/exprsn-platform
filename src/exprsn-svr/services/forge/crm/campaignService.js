const { Campaign, Contact, Lead, Activity } = require('../../../models/forge');
const { Op, sequelize } = require('sequelize');
const logger = require('../../../utils/logger');

/**
 * Campaign Service
 * Business logic for marketing campaigns, email automation, and performance tracking
 */

/**
 * Campaign types with default settings
 */
const CAMPAIGN_TYPES = {
  email: { name: 'Email Campaign', channel: 'email' },
  social: { name: 'Social Media', channel: 'social' },
  webinar: { name: 'Webinar', channel: 'online' },
  event: { name: 'Event', channel: 'offline' },
  content: { name: 'Content Marketing', channel: 'online' },
  paid_ads: { name: 'Paid Advertising', channel: 'online' }
};

/**
 * Create campaign
 * @param {Object} campaignData - Campaign data
 * @returns {Promise<Object>} Created campaign
 */
const createCampaign = async (campaignData) => {
  const {
    name,
    type = 'email',
    status = 'draft',
    description,
    startDate,
    endDate,
    budget = 0,
    targetAudience = {},
    goals = {},
    ownerId
  } = campaignData;

  const campaign = await Campaign.create({
    name,
    type,
    status,
    description,
    startDate: startDate ? new Date(startDate) : null,
    endDate: endDate ? new Date(endDate) : null,
    budget,
    targetAudience,
    goals: {
      impressions: 0,
      clicks: 0,
      conversions: 0,
      revenue: 0,
      ...goals
    },
    metrics: {
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      unsubscribed: 0,
      conversions: 0,
      revenue: 0
    },
    ownerId
  });

  logger.info('Campaign created', {
    campaignId: campaign.id,
    name,
    type
  });

  return campaign;
};

/**
 * Add members to campaign (contacts or leads)
 * @param {string} campaignId - Campaign ID
 * @param {Object} memberData - Member data
 * @returns {Promise<Object>} Updated campaign
 */
const addMembers = async (campaignId, memberData) => {
  const campaign = await Campaign.findByPk(campaignId);

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  const { contactIds = [], leadIds = [], segmentCriteria = null } = memberData;

  let members = campaign.members || [];
  let addedCount = 0;

  // Add specific contacts
  for (const contactId of contactIds) {
    if (!members.find(m => m.type === 'contact' && m.id === contactId)) {
      members.push({
        type: 'contact',
        id: contactId,
        status: 'pending',
        addedAt: new Date()
      });
      addedCount++;
    }
  }

  // Add specific leads
  for (const leadId of leadIds) {
    if (!members.find(m => m.type === 'lead' && m.id === leadId)) {
      members.push({
        type: 'lead',
        id: leadId,
        status: 'pending',
        addedAt: new Date()
      });
      addedCount++;
    }
  }

  // Add by segment criteria
  if (segmentCriteria) {
    const contactService = require('./contactService');
    const segmentedContacts = await contactService.segmentContacts(segmentCriteria);

    for (const contact of segmentedContacts) {
      if (!members.find(m => m.type === 'contact' && m.id === contact.id)) {
        members.push({
          type: 'contact',
          id: contact.id,
          status: 'pending',
          addedAt: new Date()
        });
        addedCount++;
      }
    }
  }

  await campaign.update({ members });

  logger.info('Campaign members added', {
    campaignId,
    addedCount,
    totalMembers: members.length
  });

  return campaign;
};

/**
 * Remove members from campaign
 * @param {string} campaignId - Campaign ID
 * @param {Object} memberData - Member IDs to remove
 * @returns {Promise<Object>} Updated campaign
 */
const removeMembers = async (campaignId, memberData) => {
  const campaign = await Campaign.findByPk(campaignId);

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  const { contactIds = [], leadIds = [] } = memberData;

  let members = campaign.members || [];
  const originalCount = members.length;

  // Remove specified members
  members = members.filter(m => {
    if (m.type === 'contact' && contactIds.includes(m.id)) return false;
    if (m.type === 'lead' && leadIds.includes(m.id)) return false;
    return true;
  });

  await campaign.update({ members });

  logger.info('Campaign members removed', {
    campaignId,
    removedCount: originalCount - members.length,
    totalMembers: members.length
  });

  return campaign;
};

/**
 * Launch campaign (change status to active)
 * @param {string} campaignId - Campaign ID
 * @param {string} userId - User launching the campaign
 * @returns {Promise<Object>} Updated campaign
 */
const launchCampaign = async (campaignId, userId) => {
  const campaign = await Campaign.findByPk(campaignId);

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  if (campaign.status === 'active') {
    throw new Error('Campaign is already active');
  }

  if (!campaign.members || campaign.members.length === 0) {
    throw new Error('Cannot launch campaign with no members');
  }

  await campaign.update({
    status: 'active',
    launchedAt: new Date(),
    launchedBy: userId
  });

  // Create activity
  await Activity.create({
    activityType: 'campaign_launched',
    subject: `Campaign launched: ${campaign.name}`,
    description: `Campaign with ${campaign.members.length} members`,
    campaignId: campaign.id,
    userId,
    metadata: { memberCount: campaign.members.length }
  });

  // Queue campaign execution (this would integrate with background workers)
  logger.info('Campaign launched', {
    campaignId,
    memberCount: campaign.members.length,
    userId
  });

  return campaign;
};

/**
 * Pause campaign
 * @param {string} campaignId - Campaign ID
 * @returns {Promise<Object>} Updated campaign
 */
const pauseCampaign = async (campaignId) => {
  const campaign = await Campaign.findByPk(campaignId);

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  if (campaign.status !== 'active') {
    throw new Error('Can only pause active campaigns');
  }

  await campaign.update({
    status: 'paused',
    pausedAt: new Date()
  });

  logger.info('Campaign paused', { campaignId });

  return campaign;
};

/**
 * Complete campaign
 * @param {string} campaignId - Campaign ID
 * @returns {Promise<Object>} Updated campaign
 */
const completeCampaign = async (campaignId) => {
  const campaign = await Campaign.findByPk(campaignId);

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  await campaign.update({
    status: 'completed',
    completedAt: new Date()
  });

  logger.info('Campaign completed', { campaignId });

  return campaign;
};

/**
 * Track campaign email event (sent, opened, clicked, bounced)
 * @param {string} campaignId - Campaign ID
 * @param {string} memberId - Member ID (contact or lead)
 * @param {string} eventType - Event type
 * @param {Object} eventData - Event metadata
 * @returns {Promise<Object>} Updated campaign
 */
const trackEvent = async (campaignId, memberId, eventType, eventData = {}) => {
  const campaign = await Campaign.findByPk(campaignId);

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  // Update member status
  const members = campaign.members || [];
  const member = members.find(m => m.id === memberId);

  if (member) {
    member.status = eventType;
    member.events = [
      ...(member.events || []),
      {
        type: eventType,
        timestamp: new Date(),
        ...eventData
      }
    ];
  }

  // Update campaign metrics
  const metrics = { ...campaign.metrics };

  switch (eventType) {
    case 'sent':
      metrics.sent = (metrics.sent || 0) + 1;
      break;
    case 'delivered':
      metrics.delivered = (metrics.delivered || 0) + 1;
      break;
    case 'opened':
      metrics.opened = (metrics.opened || 0) + 1;
      break;
    case 'clicked':
      metrics.clicked = (metrics.clicked || 0) + 1;
      break;
    case 'bounced':
      metrics.bounced = (metrics.bounced || 0) + 1;
      break;
    case 'unsubscribed':
      metrics.unsubscribed = (metrics.unsubscribed || 0) + 1;
      break;
    case 'converted':
      metrics.conversions = (metrics.conversions || 0) + 1;
      metrics.revenue = (metrics.revenue || 0) + (eventData.amount || 0);
      break;
  }

  await campaign.update({ members, metrics });

  logger.debug('Campaign event tracked', {
    campaignId,
    memberId,
    eventType
  });

  return campaign;
};

/**
 * Get campaign performance report
 * @param {string} campaignId - Campaign ID
 * @returns {Promise<Object>} Performance report
 */
const getPerformanceReport = async (campaignId) => {
  const campaign = await Campaign.findByPk(campaignId);

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  const metrics = campaign.metrics || {};
  const goals = campaign.goals || {};

  // Calculate rates
  const deliveryRate = metrics.sent > 0 ? (metrics.delivered / metrics.sent) * 100 : 0;
  const openRate = metrics.delivered > 0 ? (metrics.opened / metrics.delivered) * 100 : 0;
  const clickRate = metrics.delivered > 0 ? (metrics.clicked / metrics.delivered) * 100 : 0;
  const clickToOpenRate = metrics.opened > 0 ? (metrics.clicked / metrics.opened) * 100 : 0;
  const conversionRate = metrics.delivered > 0 ? (metrics.conversions / metrics.delivered) * 100 : 0;
  const bounceRate = metrics.sent > 0 ? (metrics.bounced / metrics.sent) * 100 : 0;
  const unsubscribeRate = metrics.delivered > 0 ? (metrics.unsubscribed / metrics.delivered) * 100 : 0;

  // Calculate ROI
  const roi = campaign.budget > 0 ? ((metrics.revenue - campaign.budget) / campaign.budget) * 100 : 0;

  // Goal progress
  const goalProgress = {};
  for (const [goal, target] of Object.entries(goals)) {
    if (typeof target === 'number' && target > 0) {
      const actual = metrics[goal] || 0;
      goalProgress[goal] = {
        target,
        actual,
        percentage: Math.round((actual / target) * 100),
        met: actual >= target
      };
    }
  }

  // Member breakdown
  const membersByStatus = {};
  (campaign.members || []).forEach(member => {
    const status = member.status || 'pending';
    membersByStatus[status] = (membersByStatus[status] || 0) + 1;
  });

  return {
    campaignId: campaign.id,
    name: campaign.name,
    type: campaign.type,
    status: campaign.status,
    duration: campaign.startDate && campaign.endDate
      ? Math.floor((new Date(campaign.endDate) - new Date(campaign.startDate)) / (1000 * 60 * 60 * 24))
      : null,
    budget: campaign.budget,
    metrics: {
      sent: metrics.sent || 0,
      delivered: metrics.delivered || 0,
      opened: metrics.opened || 0,
      clicked: metrics.clicked || 0,
      bounced: metrics.bounced || 0,
      unsubscribed: metrics.unsubscribed || 0,
      conversions: metrics.conversions || 0,
      revenue: metrics.revenue || 0
    },
    rates: {
      delivery: Math.round(deliveryRate * 100) / 100,
      open: Math.round(openRate * 100) / 100,
      click: Math.round(clickRate * 100) / 100,
      clickToOpen: Math.round(clickToOpenRate * 100) / 100,
      conversion: Math.round(conversionRate * 100) / 100,
      bounce: Math.round(bounceRate * 100) / 100,
      unsubscribe: Math.round(unsubscribeRate * 100) / 100
    },
    roi: Math.round(roi * 100) / 100,
    goalProgress,
    membersByStatus
  };
};

/**
 * Compare multiple campaigns
 * @param {Array<string>} campaignIds - Array of campaign IDs
 * @returns {Promise<Array>} Comparison data
 */
const compareCampaigns = async (campaignIds) => {
  const campaigns = await Campaign.findAll({
    where: { id: { [Op.in]: campaignIds } }
  });

  const comparison = [];

  for (const campaign of campaigns) {
    const report = await getPerformanceReport(campaign.id);
    comparison.push({
      id: campaign.id,
      name: campaign.name,
      type: campaign.type,
      budget: campaign.budget,
      sent: report.metrics.sent,
      openRate: report.rates.open,
      clickRate: report.rates.click,
      conversionRate: report.rates.conversion,
      conversions: report.metrics.conversions,
      revenue: report.metrics.revenue,
      roi: report.roi
    });
  }

  return comparison;
};

/**
 * Get campaign statistics for a period
 * @param {Object} filters - Statistics filters
 * @returns {Promise<Object>} Campaign statistics
 */
const getCampaignStats = async (filters = {}) => {
  const {
    startDate = null,
    endDate = null,
    ownerId = null,
    type = null,
    status = null
  } = filters;

  const whereClause = {};

  if (startDate) {
    whereClause.startDate = { [Op.gte]: new Date(startDate) };
  }

  if (endDate) {
    whereClause.endDate = { [Op.lte]: new Date(endDate) };
  }

  if (ownerId) {
    whereClause.ownerId = ownerId;
  }

  if (type) {
    whereClause.type = type;
  }

  if (status) {
    whereClause.status = status;
  }

  const campaigns = await Campaign.findAll({ where: whereClause });

  // Aggregate metrics
  const totals = campaigns.reduce((acc, campaign) => {
    const metrics = campaign.metrics || {};
    return {
      campaigns: acc.campaigns + 1,
      budget: acc.budget + (campaign.budget || 0),
      sent: acc.sent + (metrics.sent || 0),
      delivered: acc.delivered + (metrics.delivered || 0),
      opened: acc.opened + (metrics.opened || 0),
      clicked: acc.clicked + (metrics.clicked || 0),
      conversions: acc.conversions + (metrics.conversions || 0),
      revenue: acc.revenue + (metrics.revenue || 0)
    };
  }, {
    campaigns: 0,
    budget: 0,
    sent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    conversions: 0,
    revenue: 0
  });

  // Calculate aggregate rates
  const avgOpenRate = totals.delivered > 0 ? (totals.opened / totals.delivered) * 100 : 0;
  const avgClickRate = totals.delivered > 0 ? (totals.clicked / totals.delivered) * 100 : 0;
  const avgConversionRate = totals.delivered > 0 ? (totals.conversions / totals.delivered) * 100 : 0;
  const totalROI = totals.budget > 0 ? ((totals.revenue - totals.budget) / totals.budget) * 100 : 0;

  // Group by type
  const byType = {};
  campaigns.forEach(c => {
    if (!byType[c.type]) {
      byType[c.type] = { count: 0, revenue: 0 };
    }
    byType[c.type].count++;
    byType[c.type].revenue += (c.metrics?.revenue || 0);
  });

  // Group by status
  const byStatus = {};
  campaigns.forEach(c => {
    if (!byStatus[c.status]) {
      byStatus[c.status] = { count: 0 };
    }
    byStatus[c.status].count++;
  });

  return {
    totals,
    rates: {
      avgOpenRate: Math.round(avgOpenRate * 100) / 100,
      avgClickRate: Math.round(avgClickRate * 100) / 100,
      avgConversionRate: Math.round(avgConversionRate * 100) / 100
    },
    roi: Math.round(totalROI * 100) / 100,
    byType,
    byStatus
  };
};

/**
 * A/B test campaigns
 * @param {string} campaignIdA - Campaign A ID
 * @param {string} campaignIdB - Campaign B ID
 * @returns {Promise<Object>} A/B test results
 */
const abTest = async (campaignIdA, campaignIdB) => {
  const reportA = await getPerformanceReport(campaignIdA);
  const reportB = await getPerformanceReport(campaignIdB);

  // Determine winner based on multiple metrics
  const scores = {
    A: 0,
    B: 0
  };

  // Compare open rates
  if (reportA.rates.open > reportB.rates.open) scores.A++;
  else if (reportB.rates.open > reportA.rates.open) scores.B++;

  // Compare click rates
  if (reportA.rates.click > reportB.rates.click) scores.A++;
  else if (reportB.rates.click > reportA.rates.click) scores.B++;

  // Compare conversion rates
  if (reportA.rates.conversion > reportB.rates.conversion) scores.A++;
  else if (reportB.rates.conversion > reportA.rates.conversion) scores.B++;

  // Compare ROI
  if (reportA.roi > reportB.roi) scores.A++;
  else if (reportB.roi > reportA.roi) scores.B++;

  const winner = scores.A > scores.B ? 'A' : scores.B > scores.A ? 'B' : 'tie';

  return {
    campaignA: {
      id: reportA.campaignId,
      name: reportA.name,
      openRate: reportA.rates.open,
      clickRate: reportA.rates.click,
      conversionRate: reportA.rates.conversion,
      roi: reportA.roi
    },
    campaignB: {
      id: reportB.campaignId,
      name: reportB.name,
      openRate: reportB.rates.open,
      clickRate: reportB.rates.click,
      conversionRate: reportB.rates.conversion,
      roi: reportB.roi
    },
    winner,
    scores,
    recommendation: winner === 'A' ? `Campaign A (${reportA.name}) performed better overall` :
      winner === 'B' ? `Campaign B (${reportB.name}) performed better overall` :
        'Both campaigns performed equally - consider testing other variables'
  };
};

module.exports = {
  CAMPAIGN_TYPES,
  createCampaign,
  addMembers,
  removeMembers,
  launchCampaign,
  pauseCampaign,
  completeCampaign,
  trackEvent,
  getPerformanceReport,
  compareCampaigns,
  getCampaignStats,
  abTest
};
