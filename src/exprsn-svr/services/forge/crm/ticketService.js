const { SupportTicket, Contact, ServiceLevelAgreement, Activity } = require('../../../models/forge');
const { Op, sequelize } = require('sequelize');
const logger = require('../../../utils/logger');
const slaManagementService = require('../slaManagementService');

/**
 * Ticket Service
 * Business logic for support ticket management and SLA tracking
 */

/**
 * Priority levels with default response times (in minutes)
 */
const PRIORITY_RESPONSE_TIMES = {
  critical: 15,    // 15 minutes
  high: 60,        // 1 hour
  medium: 240,     // 4 hours
  low: 1440        // 24 hours
};

/**
 * Calculate SLA breach times based on priority
 * @param {string} priority - Ticket priority
 * @param {Date} createdAt - Ticket creation time
 * @returns {Object} SLA times
 */
const calculateSLATimes = (priority, createdAt) => {
  const responseMinutes = PRIORITY_RESPONSE_TIMES[priority] || 1440;
  const resolutionMinutes = responseMinutes * 4; // Resolution is 4x response time

  const firstResponseDue = new Date(createdAt.getTime() + responseMinutes * 60 * 1000);
  const resolutionDue = new Date(createdAt.getTime() + resolutionMinutes * 60 * 1000);

  return {
    firstResponseDue,
    resolutionDue,
    responseMinutes,
    resolutionMinutes
  };
};

/**
 * Check if ticket has breached SLA
 * @param {Object} ticket - Ticket instance
 * @returns {Object} SLA breach status
 */
const checkSLABreach = (ticket) => {
  const now = new Date();

  const responseBreached = ticket.firstResponseDue && now > new Date(ticket.firstResponseDue) && !ticket.firstResponseAt;
  const resolutionBreached = ticket.resolutionDue && now > new Date(ticket.resolutionDue) && ticket.status !== 'resolved' && ticket.status !== 'closed';

  return {
    responseBreached,
    resolutionBreached,
    anyBreached: responseBreached || resolutionBreached
  };
};

/**
 * Create support ticket with automatic SLA assignment
 * @param {Object} ticketData - Ticket data
 * @returns {Promise<Object>} Created ticket
 */
const createTicket = async (ticketData) => {
  const {
    subject,
    description,
    priority = 'medium',
    category = 'general',
    contactId,
    assignedTo = null,
    tags = []
  } = ticketData;

  // Calculate SLA times
  const createdAt = new Date();
  const slaTimes = calculateSLATimes(priority, createdAt);

  // Find applicable SLA
  let slaId = null;
  if (contactId) {
    const contact = await Contact.findByPk(contactId, {
      include: [{ model: require('../../../models/forge').Company, as: 'company' }]
    });

    if (contact?.company) {
      const sla = await ServiceLevelAgreement.findOne({
        where: {
          entityType: 'company',
          entityId: contact.company.id,
          isActive: true
        }
      });

      if (sla) {
        slaId = sla.id;
        // Override default SLA times with custom SLA
        slaTimes.responseMinutes = sla.responseTime;
        slaTimes.resolutionMinutes = sla.resolutionTime;
        slaTimes.firstResponseDue = new Date(createdAt.getTime() + sla.responseTime * 60 * 1000);
        slaTimes.resolutionDue = new Date(createdAt.getTime() + sla.resolutionTime * 60 * 1000);
      }
    }
  }

  const ticket = await SupportTicket.create({
    ticketNumber: `TKT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    subject,
    description,
    status: 'open',
    priority,
    category,
    contactId,
    assignedTo,
    tags,
    slaId,
    firstResponseDue: slaTimes.firstResponseDue,
    resolutionDue: slaTimes.resolutionDue,
    metadata: {
      createdVia: 'web',
      autoAssigned: !assignedTo
    }
  });

  // Auto-assign if no assignee specified
  if (!assignedTo) {
    await autoAssignTicket(ticket.id);
  }

  // Register with SLA management
  if (slaId) {
    await slaManagementService.registerEntity('ticket', ticket.id, slaId);
  }

  logger.info('Support ticket created', {
    ticketId: ticket.id,
    ticketNumber: ticket.ticketNumber,
    priority,
    slaId
  });

  return ticket;
};

/**
 * Auto-assign ticket based on workload and availability
 * @param {string} ticketId - Ticket ID
 * @returns {Promise<Object>} Updated ticket
 */
const autoAssignTicket = async (ticketId) => {
  const ticket = await SupportTicket.findByPk(ticketId);

  if (!ticket) {
    throw new Error('Ticket not found');
  }

  // Use task routing service for intelligent assignment
  const taskRoutingService = require('../taskRoutingService');

  try {
    const assignment = await taskRoutingService.autoAssignTask({
      taskType: 'support_ticket',
      priority: ticket.priority,
      skills: [ticket.category],
      metadata: {
        ticketId: ticket.id,
        contactId: ticket.contactId
      }
    });

    if (assignment.userId) {
      await ticket.update({ assignedTo: assignment.userId });

      // Create activity
      await Activity.create({
        activityType: 'ticket_assigned',
        subject: `Ticket auto-assigned to user`,
        ticketId: ticket.id,
        contactId: ticket.contactId,
        userId: assignment.userId,
        metadata: { assignmentReason: assignment.reason }
      });

      logger.info('Ticket auto-assigned', {
        ticketId,
        assignedTo: assignment.userId,
        reason: assignment.reason
      });
    }
  } catch (error) {
    logger.error('Failed to auto-assign ticket', {
      ticketId,
      error: error.message
    });
  }

  return ticket;
};

/**
 * Add comment to ticket (marks first response if applicable)
 * @param {string} ticketId - Ticket ID
 * @param {Object} commentData - Comment data
 * @returns {Promise<Object>} Updated ticket
 */
const addComment = async (ticketId, commentData) => {
  const { content, userId, isInternal = false } = commentData;

  const ticket = await SupportTicket.findByPk(ticketId);

  if (!ticket) {
    throw new Error('Ticket not found');
  }

  const comment = {
    id: `comment-${Date.now()}`,
    content,
    userId,
    isInternal,
    createdAt: new Date()
  };

  const comments = [...(ticket.comments || []), comment];
  await ticket.update({ comments });

  // Mark first response if this is from an agent (not customer)
  if (!ticket.firstResponseAt && !isInternal && userId !== ticket.contactId) {
    await ticket.update({
      firstResponseAt: new Date()
    });

    // Check if first response SLA was met
    const slaStatus = checkSLABreach(ticket);
    if (!slaStatus.responseBreached) {
      await slaManagementService.recordCompliance('ticket', ticket.id, 'first_response', true);
    } else {
      await slaManagementService.recordCompliance('ticket', ticket.id, 'first_response', false);
    }

    logger.info('First response recorded', {
      ticketId,
      responseTime: new Date() - new Date(ticket.createdAt),
      breached: slaStatus.responseBreached
    });
  }

  // Create activity
  await Activity.create({
    activityType: 'ticket_comment',
    subject: 'Comment added to ticket',
    description: content.substring(0, 200),
    ticketId: ticket.id,
    contactId: ticket.contactId,
    userId,
    metadata: { isInternal, commentId: comment.id }
  });

  return ticket;
};

/**
 * Update ticket status
 * @param {string} ticketId - Ticket ID
 * @param {string} newStatus - New status
 * @param {string} userId - User making the change
 * @returns {Promise<Object>} Updated ticket
 */
const updateStatus = async (ticketId, newStatus, userId) => {
  const ticket = await SupportTicket.findByPk(ticketId);

  if (!ticket) {
    throw new Error('Ticket not found');
  }

  const previousStatus = ticket.status;

  await ticket.update({
    status: newStatus,
    statusHistory: [
      ...(ticket.statusHistory || []),
      {
        from: previousStatus,
        to: newStatus,
        changedBy: userId,
        changedAt: new Date()
      }
    ]
  });

  // If resolved or closed, record resolution time
  if ((newStatus === 'resolved' || newStatus === 'closed') && !ticket.resolvedAt) {
    await ticket.update({ resolvedAt: new Date() });

    // Check if resolution SLA was met
    const slaStatus = checkSLABreach(ticket);
    if (!slaStatus.resolutionBreached) {
      await slaManagementService.recordCompliance('ticket', ticket.id, 'resolution', true);
    } else {
      await slaManagementService.recordCompliance('ticket', ticket.id, 'resolution', false);
    }

    logger.info('Ticket resolved', {
      ticketId,
      resolutionTime: new Date() - new Date(ticket.createdAt),
      breached: slaStatus.resolutionBreached
    });
  }

  // Create activity
  await Activity.create({
    activityType: 'ticket_status_change',
    subject: `Ticket status changed to ${newStatus}`,
    ticketId: ticket.id,
    contactId: ticket.contactId,
    userId,
    metadata: { previousStatus, newStatus }
  });

  return ticket;
};

/**
 * Escalate ticket
 * @param {string} ticketId - Ticket ID
 * @param {Object} escalationData - Escalation details
 * @returns {Promise<Object>} Updated ticket
 */
const escalateTicket = async (ticketId, escalationData) => {
  const { escalatedTo, reason, userId } = escalationData;

  const ticket = await SupportTicket.findByPk(ticketId);

  if (!ticket) {
    throw new Error('Ticket not found');
  }

  await ticket.update({
    escalationLevel: (ticket.escalationLevel || 0) + 1,
    assignedTo: escalatedTo || ticket.assignedTo,
    priority: ticket.priority === 'low' ? 'medium' : (ticket.priority === 'medium' ? 'high' : 'critical'),
    metadata: {
      ...(ticket.metadata || {}),
      escalations: [
        ...((ticket.metadata?.escalations || [])),
        {
          level: (ticket.escalationLevel || 0) + 1,
          reason,
          escalatedBy: userId,
          escalatedTo,
          escalatedAt: new Date()
        }
      ]
    }
  });

  // Notify via Herald
  try {
    const heraldService = require('../integration/heraldService');
    await heraldService.sendNotification({
      type: 'ticket_escalated',
      recipientId: escalatedTo,
      title: `Ticket ${ticket.ticketNumber} escalated`,
      body: reason,
      data: { ticketId: ticket.id }
    });
  } catch (error) {
    logger.error('Failed to send escalation notification', { error: error.message });
  }

  logger.info('Ticket escalated', {
    ticketId,
    level: ticket.escalationLevel,
    escalatedTo,
    reason
  });

  return ticket;
};

/**
 * Get ticket statistics
 * @param {Object} filters - Statistics filters
 * @returns {Promise<Object>} Ticket statistics
 */
const getTicketStats = async (filters = {}) => {
  const {
    startDate = null,
    endDate = null,
    assignedTo = null,
    status = null
  } = filters;

  const whereClause = {};

  if (startDate) {
    whereClause.createdAt = { [Op.gte]: new Date(startDate) };
  }

  if (endDate) {
    whereClause.createdAt = {
      ...whereClause.createdAt,
      [Op.lte]: new Date(endDate)
    };
  }

  if (assignedTo) {
    whereClause.assignedTo = assignedTo;
  }

  if (status) {
    whereClause.status = status;
  }

  const total = await SupportTicket.count({ where: whereClause });

  // Count by status
  const byStatus = await SupportTicket.findAll({
    where: whereClause,
    attributes: [
      'status',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count']
    ],
    group: ['status'],
    raw: true
  });

  // Count by priority
  const byPriority = await SupportTicket.findAll({
    where: whereClause,
    attributes: [
      'priority',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count']
    ],
    group: ['priority'],
    raw: true
  });

  // Calculate average response and resolution times
  const resolvedTickets = await SupportTicket.findAll({
    where: {
      ...whereClause,
      resolvedAt: { [Op.ne]: null }
    },
    attributes: ['createdAt', 'firstResponseAt', 'resolvedAt'],
    raw: true
  });

  let avgResponseTime = 0;
  let avgResolutionTime = 0;

  if (resolvedTickets.length > 0) {
    const responseTimes = resolvedTickets
      .filter(t => t.firstResponseAt)
      .map(t => new Date(t.firstResponseAt) - new Date(t.createdAt));

    const resolutionTimes = resolvedTickets
      .map(t => new Date(t.resolvedAt) - new Date(t.createdAt));

    avgResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length / (1000 * 60)
      : 0;

    avgResolutionTime = resolutionTimes.reduce((sum, time) => sum + time, 0) / resolutionTimes.length / (1000 * 60);
  }

  // Count SLA breaches
  const breachedTickets = await SupportTicket.findAll({
    where: {
      ...whereClause,
      [Op.or]: [
        {
          firstResponseAt: null,
          firstResponseDue: { [Op.lt]: new Date() }
        },
        {
          status: { [Op.notIn]: ['resolved', 'closed'] },
          resolutionDue: { [Op.lt]: new Date() }
        }
      ]
    }
  });

  return {
    total,
    byStatus: byStatus.reduce((acc, item) => {
      acc[item.status] = parseInt(item.count);
      return acc;
    }, {}),
    byPriority: byPriority.reduce((acc, item) => {
      acc[item.priority] = parseInt(item.count);
      return acc;
    }, {}),
    averageResponseTime: Math.round(avgResponseTime),
    averageResolutionTime: Math.round(avgResolutionTime),
    slaBreaches: breachedTickets.length,
    slaComplianceRate: total > 0 ? Math.round(((total - breachedTickets.length) / total) * 100) : 100
  };
};

/**
 * Get tickets needing attention (SLA at risk)
 * @param {Object} filters - Filter options
 * @returns {Promise<Array>} Tickets needing attention
 */
const getTicketsNeedingAttention = async (filters = {}) => {
  const { assignedTo = null, category = null } = filters;
  const now = new Date();
  const warningThreshold = 30 * 60 * 1000; // 30 minutes before breach

  const whereClause = {
    status: { [Op.notIn]: ['resolved', 'closed'] },
    [Op.or]: [
      // First response due soon or breached
      {
        firstResponseAt: null,
        firstResponseDue: { [Op.lte]: new Date(now.getTime() + warningThreshold) }
      },
      // Resolution due soon or breached
      {
        resolutionDue: { [Op.lte]: new Date(now.getTime() + warningThreshold) }
      }
    ]
  };

  if (assignedTo) {
    whereClause.assignedTo = assignedTo;
  }

  if (category) {
    whereClause.category = category;
  }

  const tickets = await SupportTicket.findAll({
    where: whereClause,
    include: [
      { model: Contact, as: 'contact', attributes: ['id', 'firstName', 'lastName', 'email'] }
    ],
    order: [['firstResponseDue', 'ASC'], ['resolutionDue', 'ASC']]
  });

  // Annotate with breach status and time remaining
  return tickets.map(ticket => {
    const breach = checkSLABreach(ticket);
    const timeToFirstResponse = ticket.firstResponseAt
      ? null
      : Math.round((new Date(ticket.firstResponseDue) - now) / (1000 * 60));
    const timeToResolution = Math.round((new Date(ticket.resolutionDue) - now) / (1000 * 60));

    return {
      ...ticket.toJSON(),
      slaStatus: {
        responseBreached: breach.responseBreached,
        resolutionBreached: breach.resolutionBreached,
        timeToFirstResponse,
        timeToResolution,
        urgency: timeToFirstResponse < 0 || timeToResolution < 0 ? 'critical' :
          timeToFirstResponse < 15 || timeToResolution < 60 ? 'high' : 'medium'
      }
    };
  });
};

module.exports = {
  PRIORITY_RESPONSE_TIMES,
  calculateSLATimes,
  checkSLABreach,
  createTicket,
  autoAssignTicket,
  addComment,
  updateStatus,
  escalateTicket,
  getTicketStats,
  getTicketsNeedingAttention
};
