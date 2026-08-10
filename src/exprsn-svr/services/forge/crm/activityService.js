const { Activity, Contact, Company, Lead, Opportunity } = require('../../../models/forge');
const { Op } = require('sequelize');
const logger = require('../../../utils/logger');
const moment = require('moment');

/**
 * Activity Service
 * Business logic for activity tracking and management
 */

/**
 * Create an activity
 * @param {Object} activityData - Activity data
 * @returns {Promise<Object>} Created activity
 */
const createActivity = async (activityData) => {
  try {
    const activity = await Activity.create({
      ...activityData,
      status: activityData.status || 'planned',
      priority: activityData.priority || 'medium'
    });

    logger.info('Activity created', {
      activityId: activity.id,
      type: activity.activityType,
      createdById: activity.createdById
    });

    return activity;
  } catch (error) {
    logger.error('Failed to create activity', {
      error: error.message
    });
    throw error;
  }
};

/**
 * Get activity by ID
 * @param {string} id - Activity ID
 * @returns {Promise<Object>} Activity
 */
const getActivityById = async (id) => {
  const activity = await Activity.findByPk(id);

  if (!activity) {
    throw new Error('Activity not found');
  }

  return activity;
};

/**
 * List activities with filtering
 * @param {Object} filters - Query filters
 * @returns {Promise<Object>} Activities and count
 */
const listActivities = async (filters = {}) => {
  const {
    activityType,
    status,
    priority,
    contactId,
    companyId,
    leadId,
    opportunityId,
    assignedToId,
    createdById,
    startDate,
    endDate,
    search,
    limit = 50,
    offset = 0
  } = filters;

  const where = {};

  if (activityType) where.activityType = activityType;
  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (contactId) where.contactId = contactId;
  if (companyId) where.companyId = companyId;
  if (leadId) where.leadId = leadId;
  if (opportunityId) where.opportunityId = opportunityId;
  if (assignedToId) where.assignedToId = assignedToId;
  if (createdById) where.createdById = createdById;

  // Date range filtering
  if (startDate || endDate) {
    where.scheduledAt = {};
    if (startDate) where.scheduledAt[Op.gte] = moment(startDate).toDate();
    if (endDate) where.scheduledAt[Op.lte] = moment(endDate).toDate();
  }

  // Search
  if (search) {
    where[Op.or] = [
      { subject: { [Op.iLike]: `%${search}%` } },
      { description: { [Op.iLike]: `%${search}%` } },
      { outcome: { [Op.iLike]: `%${search}%` } }
    ];
  }

  const { count, rows } = await Activity.findAndCountAll({
    where,
    limit,
    offset,
    order: [['scheduledAt', 'DESC'], ['createdAt', 'DESC']]
  });

  return {
    activities: rows,
    total: count
  };
};

/**
 * Update activity
 * @param {string} id - Activity ID
 * @param {Object} updates - Update data
 * @returns {Promise<Object>} Updated activity
 */
const updateActivity = async (id, updates) => {
  const activity = await getActivityById(id);

  // Auto-set completed timestamp
  if (updates.status === 'completed' && !activity.completedAt) {
    updates.completedAt = new Date();
  } else if (updates.status !== 'completed' && activity.completedAt) {
    updates.completedAt = null;
  }

  // Check for overdue status
  if (activity.dueDate && moment(activity.dueDate).isBefore(moment()) && activity.status !== 'completed') {
    updates.status = 'overdue';
  }

  await activity.update(updates);

  logger.info('Activity updated', {
    activityId: id,
    updates: Object.keys(updates)
  });

  return activity;
};

/**
 * Delete activity
 * @param {string} id - Activity ID
 * @returns {Promise<Object>} Success result
 */
const deleteActivity = async (id) => {
  const activity = await getActivityById(id);
  await activity.destroy();

  logger.info('Activity deleted', {
    activityId: id
  });

  return { success: true };
};

/**
 * Complete activity
 * @param {string} id - Activity ID
 * @param {string} outcome - Activity outcome
 * @param {string} nextSteps - Next steps
 * @returns {Promise<Object>} Updated activity
 */
const completeActivity = async (id, outcome = null, nextSteps = null) => {
  const updates = {
    status: 'completed',
    completedAt: new Date()
  };

  if (outcome) updates.outcome = outcome;
  if (nextSteps) updates.nextSteps = nextSteps;

  return await updateActivity(id, updates);
};

/**
 * Get activity timeline for an entity
 * @param {Object} params - Entity parameters
 * @returns {Promise<Array>} Activities
 */
const getActivityTimeline = async ({ contactId, companyId, leadId, opportunityId }) => {
  const where = {};

  if (contactId) where.contactId = contactId;
  if (companyId) where.companyId = companyId;
  if (leadId) where.leadId = leadId;
  if (opportunityId) where.opportunityId = opportunityId;

  const activities = await Activity.findAll({
    where,
    order: [['scheduledAt', 'DESC'], ['createdAt', 'DESC']],
    limit: 100
  });

  return activities;
};

/**
 * Get activity statistics
 * @param {Object} filters - Filter parameters
 * @returns {Promise<Object>} Statistics
 */
const getActivityStats = async (filters = {}) => {
  const { createdById, assignedToId, startDate, endDate } = filters;

  const where = {};
  if (createdById) where.createdById = createdById;
  if (assignedToId) where.assignedToId = assignedToId;

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt[Op.gte] = moment(startDate).toDate();
    if (endDate) where.createdAt[Op.lte] = moment(endDate).toDate();
  }

  const total = await Activity.count({ where });

  const byType = await Activity.findAll({
    where,
    attributes: [
      'activityType',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count']
    ],
    group: ['activityType'],
    raw: true
  });

  const byStatus = await Activity.findAll({
    where,
    attributes: [
      'status',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count']
    ],
    group: ['status'],
    raw: true
  });

  const totalDuration = await Activity.findOne({
    where: { ...where, duration: { [Op.ne]: null } },
    attributes: [[sequelize.fn('SUM', sequelize.col('duration')), 'totalDuration']],
    raw: true
  });

  return {
    total,
    byType: byType.reduce((acc, item) => {
      acc[item.activityType] = parseInt(item.count);
      return acc;
    }, {}),
    byStatus: byStatus.reduce((acc, item) => {
      acc[item.status] = parseInt(item.count);
      return acc;
    }, {}),
    totalDuration: parseInt(totalDuration?.totalDuration) || 0
  };
};

/**
 * Get upcoming activities
 * @param {Object} filters - Filter parameters
 * @returns {Promise<Array>} Upcoming activities
 */
const getUpcomingActivities = async (filters = {}) => {
  const { assignedToId, createdById, days = 7, limit = 50 } = filters;

  const where = {
    status: 'planned',
    scheduledAt: {
      [Op.gte]: new Date(),
      [Op.lte]: moment().add(days, 'days').toDate()
    }
  };

  if (assignedToId) where.assignedToId = assignedToId;
  if (createdById) where.createdById = createdById;

  const activities = await Activity.findAll({
    where,
    order: [['scheduledAt', 'ASC']],
    limit
  });

  return activities;
};

/**
 * Get overdue activities
 * @param {Object} filters - Filter parameters
 * @returns {Promise<Array>} Overdue activities
 */
const getOverdueActivities = async (filters = {}) => {
  const { assignedToId, createdById, limit = 50 } = filters;

  const where = {
    status: { [Op.notIn]: ['completed', 'cancelled'] },
    dueDate: { [Op.lt]: new Date() }
  };

  if (assignedToId) where.assignedToId = assignedToId;
  if (createdById) where.createdById = createdById;

  const activities = await Activity.findAll({
    where,
    order: [['dueDate', 'ASC']],
    limit
  });

  // Auto-update status to overdue
  for (const activity of activities) {
    if (activity.status !== 'overdue') {
      await activity.update({ status: 'overdue' });
    }
  }

  return activities;
};

/**
 * Log a call activity
 * @param {Object} callData - Call data
 * @returns {Promise<Object>} Created activity
 */
const logCall = async (callData) => {
  return await createActivity({
    ...callData,
    activityType: 'call',
    status: 'completed',
    completedAt: new Date()
  });
};

/**
 * Log an email activity
 * @param {Object} emailData - Email data
 * @returns {Promise<Object>} Created activity
 */
const logEmail = async (emailData) => {
  return await createActivity({
    ...emailData,
    activityType: 'email',
    status: 'completed',
    completedAt: new Date()
  });
};

/**
 * Schedule a meeting
 * @param {Object} meetingData - Meeting data
 * @returns {Promise<Object>} Created activity
 */
const scheduleMeeting = async (meetingData) => {
  return await createActivity({
    ...meetingData,
    activityType: 'meeting',
    status: 'planned'
  });
};

/**
 * Bulk create activities
 * @param {Array} activitiesData - Array of activity objects
 * @returns {Promise<Object>} Import results
 */
const bulkCreateActivities = async (activitiesData) => {
  const results = {
    created: 0,
    errors: []
  };

  for (const activityData of activitiesData) {
    try {
      await createActivity(activityData);
      results.created++;
    } catch (error) {
      results.errors.push({
        data: activityData,
        error: error.message
      });
    }
  }

  logger.info('Bulk activity import completed', {
    total: activitiesData.length,
    created: results.created,
    errors: results.errors.length
  });

  return results;
};

module.exports = {
  createActivity,
  getActivityById,
  listActivities,
  updateActivity,
  deleteActivity,
  completeActivity,
  getActivityTimeline,
  getActivityStats,
  getUpcomingActivities,
  getOverdueActivities,
  logCall,
  logEmail,
  scheduleMeeting,
  bulkCreateActivities
};
