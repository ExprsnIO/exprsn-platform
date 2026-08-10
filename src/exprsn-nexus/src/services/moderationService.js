/**
 * Moderation Service
 *
 * Handles content flagging and moderation workflows for groups.
 * Integrates with the Moderator service for comprehensive moderation actions.
 *
 * Features:
 * - Content flagging and reporting
 * - Moderation case management
 * - Integration with Moderator service workflows
 * - Role-based moderation permissions
 * - Automated moderation rules
 */

const axios = require('axios');
const { Group, GroupContentFlag, GroupModerationCase, GroupMembership, MemberRole, GroupRole } = require('../models');
const logger = require('../utils/logger');
const config = require('../config');
const redis = require('../config/redis');

// Moderator service URL
const MODERATOR_SERVICE_URL = process.env.MODERATOR_SERVICE_URL || 'http://localhost:3006';

/**
 * Flag content for moderation review
 * @param {object} params - Flag parameters
 * @returns {Promise<object>} Created flag
 */
async function flagContent(params) {
  try {
    const {
      groupId,
      reporterId,
      contentType,
      contentId,
      contentOwnerId,
      flagReason,
      description,
      evidence = {}
    } = params;

    // Create content flag
    const flag = await GroupContentFlag.create({
      groupId,
      reporterId,
      contentType,
      contentId,
      contentOwnerId,
      flagReason,
      description,
      status: 'pending',
      priority: calculateFlagPriority(flagReason, evidence),
      metadata: evidence
    });

    logger.info(`Content flagged: ${contentType} ${contentId} in group ${groupId} by user ${reporterId}`);

    // Check if we should auto-escalate to moderation case
    const shouldEscalate = await shouldAutoEscalate(flag);
    if (shouldEscalate) {
      await escalateToModerationCase(flag);
    }

    return flag;
  } catch (error) {
    logger.error('Error flagging content:', error);
    throw error;
  }
}

/**
 * Calculate priority for a flag
 * @param {string} reason - Flag reason
 * @param {object} evidence - Evidence metadata
 * @returns {string} Priority level
 */
function calculateFlagPriority(reason, evidence = {}) {
  const criticalReasons = ['harassment', 'hate-speech', 'violence'];
  const highReasons = ['spam', 'nsfw', 'misinformation'];

  if (criticalReasons.includes(reason)) {
    return 'critical';
  }

  if (highReasons.includes(reason)) {
    return 'high';
  }

  // Check evidence for escalation triggers
  if (evidence.reportCount && evidence.reportCount > 3) {
    return 'high';
  }

  return 'medium';
}

/**
 * Check if a flag should be auto-escalated to a moderation case
 * @param {object} flag - GroupContentFlag object
 * @returns {Promise<boolean>}
 */
async function shouldAutoEscalate(flag) {
  // Auto-escalate critical priority flags
  if (flag.priority === 'critical') {
    return true;
  }

  // Auto-escalate if same content has multiple flags
  const existingFlags = await GroupContentFlag.count({
    where: {
      groupId: flag.groupId,
      contentType: flag.contentType,
      contentId: flag.contentId,
      status: 'pending'
    }
  });

  return existingFlags >= 3;
}

/**
 * Escalate a flag to a moderation case
 * @param {object} flag - GroupContentFlag object
 * @returns {Promise<object>} Created moderation case
 */
async function escalateToModerationCase(flag) {
  try {
    // Check if case already exists for this content
    let moderationCase = await GroupModerationCase.findOne({
      where: {
        groupId: flag.groupId,
        subjectType: 'content',
        subjectId: flag.contentId,
        status: ['open', 'under-review', 'pending-action']
      }
    });

    if (!moderationCase) {
      // Create new moderation case
      moderationCase = await GroupModerationCase.create({
        groupId: flag.groupId,
        caseType: 'content-flag',
        subjectType: 'content',
        subjectId: flag.contentId,
        reporterId: flag.reporterId,
        severity: flag.priority === 'critical' ? 'critical' : 'high',
        status: 'open',
        priority: calculateCasePriority(flag),
        title: `${flag.contentType} flagged for ${flag.flagReason}`,
        description: flag.description,
        evidence: [{ flagId: flag.id, ...flag.metadata }],
        flags: [flag.id]
      });

      // Assign to moderators based on group roles
      await assignModerators(moderationCase);

      // Create case in Moderator service
      try {
        const moderatorCase = await createModeratorServiceCase(moderationCase);
        await moderationCase.update({
          moderatorServiceCaseId: moderatorCase.id
        });
      } catch (error) {
        logger.warn('Failed to create case in Moderator service:', error.message);
      }

      logger.info(`Escalated flag ${flag.id} to moderation case ${moderationCase.id}`);
    } else {
      // Add flag to existing case
      const updatedFlags = [...moderationCase.flags, flag.id];
      const updatedEvidence = [...moderationCase.evidence, { flagId: flag.id, ...flag.metadata }];

      await moderationCase.update({
        flags: updatedFlags,
        evidence: updatedEvidence,
        updatedAt: Date.now()
      });

      logger.info(`Added flag ${flag.id} to existing moderation case ${moderationCase.id}`);
    }

    // Update flag status
    await flag.update({
      status: 'escalated',
      moderatorCaseId: moderationCase.id
    });

    return moderationCase;
  } catch (error) {
    logger.error('Error escalating to moderation case:', error);
    throw error;
  }
}

/**
 * Calculate priority score for a moderation case
 * @param {object} flag - Flag that triggered the case
 * @returns {number} Priority score (0-100)
 */
function calculateCasePriority(flag) {
  let priority = 0;

  // Base priority from flag priority
  const priorityMap = {
    'critical': 90,
    'high': 70,
    'medium': 50,
    'low': 30
  };
  priority += priorityMap[flag.priority] || 50;

  // Adjust based on reporter's history (placeholder - would check reputation)
  // priority += reporterReputationBonus;

  return Math.min(100, priority);
}

/**
 * Assign moderators to a case based on group roles
 * @param {object} moderationCase - Moderation case
 * @returns {Promise<void>}
 */
async function assignModerators(moderationCase) {
  try {
    // Find group members with moderation roles
    const moderatorRoles = await GroupRole.findAll({
      where: {
        groupId: moderationCase.groupId,
        isSystem: false
      }
    });

    const moderationRoleIds = moderatorRoles
      .filter(role => {
        const perms = role.permissions || {};
        return perms.moderate === true || perms.manageContent === true;
      })
      .map(role => role.id);

    if (moderationRoleIds.length === 0) {
      logger.warn(`No moderation roles found for group ${moderationCase.groupId}`);
      return;
    }

    // Find members with moderation roles
    const moderatorAssignments = await MemberRole.findAll({
      where: {
        roleId: moderationRoleIds,
        isActive: true
      },
      include: [{
        model: GroupMembership,
        as: 'membership',
        where: {
          groupId: moderationCase.groupId,
          status: 'active'
        },
        attributes: ['userId']
      }],
      limit: 5 // Assign up to 5 moderators
    });

    const moderatorIds = moderatorAssignments
      .map(assignment => assignment.membership.userId)
      .filter(Boolean);

    if (moderatorIds.length > 0) {
      await moderationCase.update({
        assignedModerators: moderatorIds
      });

      logger.info(`Assigned ${moderatorIds.length} moderators to case ${moderationCase.id}`);
    }
  } catch (error) {
    logger.error('Error assigning moderators:', error);
  }
}

/**
 * Create a case in the Moderator service
 * @param {object} moderationCase - Moderation case
 * @returns {Promise<object>} Moderator service case
 */
async function createModeratorServiceCase(moderationCase) {
  try {
    // Get service token from environment
    const serviceToken = process.env.NEXUS_SERVICE_TOKEN || process.env.SERVICE_TOKEN;

    if (!serviceToken) {
      logger.warn('No service token configured for Moderator service integration');
      throw new Error('SERVICE_TOKEN_NOT_CONFIGURED');
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceToken}`
    };

    const response = await axios.post(
      `${MODERATOR_SERVICE_URL}/api/cases`,
      {
        externalId: moderationCase.id,
        source: 'nexus-groups',
        type: moderationCase.caseType,
        severity: moderationCase.severity,
        title: moderationCase.title,
        description: moderationCase.description,
        evidence: moderationCase.evidence,
        metadata: {
          groupId: moderationCase.groupId,
          subjectType: moderationCase.subjectType,
          subjectId: moderationCase.subjectId,
          flags: moderationCase.flags
        }
      },
      {
        headers,
        timeout: 5000
      }
    );

    return response.data.case;
  } catch (error) {
    logger.error('Error creating case in Moderator service:', error.message);
    throw error;
  }
}

/**
 * Take moderation action on a case
 * @param {string} caseId - Moderation case ID
 * @param {string} moderatorId - Moderator user ID
 * @param {object} action - Action to take
 * @returns {Promise<object>} Updated case
 */
async function takeModerationAction(caseId, moderatorId, action) {
  try {
    const { actionType, reason, duration } = action;

    const moderationCase = await GroupModerationCase.findByPk(caseId);
    if (!moderationCase) {
      throw new Error('CASE_NOT_FOUND');
    }

    // Verify moderator has permissions
    await verifyModeratorPermissions(moderatorId, moderationCase.groupId);

    // Record action
    const actionRecord = {
      actionType,
      moderatorId,
      reason,
      duration,
      timestamp: Date.now()
    };

    const updatedActions = [...(moderationCase.actions || []), actionRecord];

    // Update case status based on action
    let status = moderationCase.status;
    let resolution = moderationCase.resolution;

    switch (actionType) {
      case 'remove-content':
        status = 'resolved';
        resolution = `Content removed by moderator. Reason: ${reason}`;
        break;
      case 'warn-user':
        status = 'resolved';
        resolution = `Warning issued to user. Reason: ${reason}`;
        break;
      case 'suspend-user':
        status = 'resolved';
        resolution = `User suspended for ${duration}. Reason: ${reason}`;
        // Implement actual suspension in GroupMembership
        await suspendMember(groupId, userId, reason, duration);
        break;
      case 'ban-user':
        status = 'resolved';
        resolution = `User banned from group. Reason: ${reason}`;
        // Implement actual ban in GroupMembership
        await banMember(groupId, userId, reason);
        break;
      case 'dismiss':
        status = 'resolved';
        resolution = `Case dismissed. Reason: ${reason}`;
        break;
    }

    await moderationCase.update({
      actions: updatedActions,
      status,
      resolution,
      resolvedAt: Date.now(),
      resolvedBy: moderatorId,
      updatedAt: Date.now()
    });

    // Update associated flags
    if (moderationCase.flags && moderationCase.flags.length > 0) {
      await GroupContentFlag.update(
        {
          status: 'resolved',
          action: actionType,
          resolution,
          resolvedAt: Date.now(),
          resolvedBy: moderatorId
        },
        {
          where: { id: moderationCase.flags }
        }
      );
    }

    // Sync action to Moderator service
    if (moderationCase.moderatorServiceCaseId) {
      try {
        await syncActionToModeratorService(moderationCase.moderatorServiceCaseId, actionRecord);
      } catch (error) {
        logger.warn('Failed to sync action to Moderator service:', error.message);
      }
    }

    logger.info(`Moderation action taken on case ${caseId}: ${actionType}`);

    return moderationCase;
  } catch (error) {
    logger.error('Error taking moderation action:', error);
    throw error;
  }
}

/**
 * Verify that a user has moderation permissions in a group
 * @param {string} userId - User ID
 * @param {string} groupId - Group ID
 * @returns {Promise<boolean>}
 */
async function verifyModeratorPermissions(userId, groupId) {
  const membership = await GroupMembership.findOne({
    where: {
      userId,
      groupId,
      status: 'active'
    },
    include: [{
      model: MemberRole,
      as: 'memberRoles',
      where: { isActive: true },
      include: [{
        model: GroupRole,
        as: 'role'
      }]
    }]
  });

  if (!membership) {
    throw new Error('NOT_GROUP_MEMBER');
  }

  // Check if user has any moderation roles
  const hasModerationRole = membership.memberRoles.some(mr => {
    const perms = mr.role.permissions || {};
    return perms.moderate === true || perms.manageContent === true;
  });

  if (!hasModerationRole && membership.role !== 'admin' && membership.role !== 'owner') {
    throw new Error('INSUFFICIENT_PERMISSIONS');
  }

  return true;
}

/**
 * Sync action to Moderator service
 * @param {string} moderatorServiceCaseId - Moderator service case ID
 * @param {object} action - Action record
 * @returns {Promise<void>}
 */
async function syncActionToModeratorService(moderatorServiceCaseId, action) {
  try {
    // Get service token from environment or generate one
    const serviceToken = process.env.NEXUS_SERVICE_TOKEN || process.env.SERVICE_TOKEN;

    if (!serviceToken) {
      logger.warn('No service token configured for Moderator service sync');
      throw new Error('SERVICE_TOKEN_NOT_CONFIGURED');
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceToken}`
    };

    await axios.post(
      `${MODERATOR_SERVICE_URL}/api/cases/${moderatorServiceCaseId}/actions`,
      action,
      {
        headers,
        timeout: 5000
      }
    );
  } catch (error) {
    logger.error('Error syncing action to Moderator service:', error.message);
    throw error;
  }
}

/**
 * Get moderation queue for a group
 * @param {string} groupId - Group ID
 * @param {object} options - Filter options
 * @returns {Promise<object>} Moderation queue
 */
async function getModerationQueue(groupId, options = {}) {
  try {
    const {
      status = ['open', 'under-review'],
      priority = null,
      limit = 50,
      offset = 0
    } = options;

    const whereClause = {
      groupId,
      status: Array.isArray(status) ? status : [status]
    };

    if (priority) {
      whereClause.priority = { $gte: priority };
    }

    const cases = await GroupModerationCase.findAll({
      where: whereClause,
      order: [['priority', 'DESC'], ['createdAt', 'ASC']],
      limit,
      offset
    });

    const total = await GroupModerationCase.count({ where: whereClause });

    return {
      cases,
      total,
      limit,
      offset
    };
  } catch (error) {
    logger.error('Error getting moderation queue:', error);
    throw error;
  }
}

/**
 * Suspend a member from a group
 * @param {string} groupId - Group ID
 * @param {string} userId - User ID to suspend
 * @param {string} reason - Suspension reason
 * @param {string} duration - Duration (e.g., '7d', '30d', '90d')
 * @returns {Promise<object>} Updated membership
 */
async function suspendMember(groupId, userId, reason, duration = '7d') {
  try {
    const membership = await GroupMembership.findOne({
      where: { groupId, userId }
    });

    if (!membership) {
      throw new Error('MEMBERSHIP_NOT_FOUND');
    }

    // Parse duration string (e.g., '7d' = 7 days, '24h' = 24 hours)
    const durationMs = parseDuration(duration);
    const suspendedAt = Date.now();
    const suspendedUntil = suspendedAt + durationMs;

    await membership.update({
      status: 'suspended',
      suspendedAt,
      suspendedUntil,
      suspendedReason: reason
    });

    // Clear membership cache
    await redis.del(`group:${groupId}:member:${userId}`);
    await redis.del(`group:${groupId}:members`);

    logger.info('Member suspended', {
      groupId,
      userId,
      duration,
      suspendedUntil: new Date(suspendedUntil).toISOString()
    });

    return membership;
  } catch (error) {
    logger.error('Error suspending member:', error);
    throw error;
  }
}

/**
 * Ban a member from a group
 * @param {string} groupId - Group ID
 * @param {string} userId - User ID to ban
 * @param {string} reason - Ban reason
 * @returns {Promise<object>} Updated membership
 */
async function banMember(groupId, userId, reason) {
  try {
    const membership = await GroupMembership.findOne({
      where: { groupId, userId }
    });

    if (!membership) {
      throw new Error('MEMBERSHIP_NOT_FOUND');
    }

    await membership.update({
      status: 'banned',
      suspendedAt: Date.now(),
      suspendedUntil: null, // Permanent ban
      suspendedReason: reason
    });

    // Decrement member count
    await Group.decrement('memberCount', { where: { id: groupId } });

    // Clear membership cache
    await redis.del(`group:${groupId}:member:${userId}`);
    await redis.del(`group:${groupId}:members`);

    logger.info('Member banned', {
      groupId,
      userId,
      reason
    });

    return membership;
  } catch (error) {
    logger.error('Error banning member:', error);
    throw error;
  }
}

/**
 * Parse duration string to milliseconds
 * @param {string} duration - Duration string (e.g., '7d', '24h', '30m')
 * @returns {number} Duration in milliseconds
 */
function parseDuration(duration) {
  const match = duration.match(/^(\d+)([dhm])$/);
  if (!match) {
    throw new Error('INVALID_DURATION_FORMAT');
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 'd': return value * 24 * 60 * 60 * 1000; // days
    case 'h': return value * 60 * 60 * 1000; // hours
    case 'm': return value * 60 * 1000; // minutes
    default: throw new Error('INVALID_DURATION_UNIT');
  }
}

module.exports = {
  flagContent,
  escalateToModerationCase,
  takeModerationAction,
  verifyModeratorPermissions,
  getModerationQueue,
  suspendMember,
  banMember
};
