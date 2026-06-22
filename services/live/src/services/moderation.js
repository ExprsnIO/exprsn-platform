/**
 * Moderation Service
 * Live stream and chat moderation features
 */

const { ModerationAction, Event, Stream } = require('../models');
const logger = require('../utils/logger');

class ModerationService {
  constructor() {
    // Profanity filter words (basic example - use comprehensive library in production)
    this.profanityWords = new Set([
      // Add profanity words here
      'badword1', 'badword2'
    ]);

    // Spam detection thresholds
    this.spamThresholds = {
      maxMessagesPerMinute: 10,
      maxDuplicateMessages: 3,
      maxCapsPercentage: 0.7,
      maxEmojisPerMessage: 10,
      maxLinksPerMessage: 2
    };
  }

  /**
   * Create moderation action
   * @param {Object} actionData - Moderation action data
   * @param {string} moderatorId - Moderator user ID (null for automated)
   * @returns {Promise<Object>} Created action
   */
  async createAction(actionData, moderatorId = null) {
    try {
      const {
        streamId = null,
        eventId = null,
        targetUserId = null,
        actionType,
        reason = null,
        durationSeconds = null,
        isAutomated = false,
        automationRule = null,
        messageContent = null,
        metadata = {}
      } = actionData;

      let expiresAt = null;
      if (durationSeconds) {
        expiresAt = new Date(Date.now() + durationSeconds * 1000);
      }

      const action = await ModerationAction.create({
        stream_id: streamId,
        event_id: eventId,
        moderator_id: moderatorId,
        target_user_id: targetUserId,
        action_type: actionType,
        reason,
        duration_seconds: durationSeconds,
        is_automated: isAutomated,
        automation_rule: automationRule,
        message_content: messageContent,
        metadata,
        expires_at: expiresAt,
        is_active: true
      });

      logger.info('Moderation action created', {
        actionId: action.id,
        actionType,
        targetUserId,
        isAutomated
      });

      return this.formatAction(action);
    } catch (error) {
      logger.error('Failed to create moderation action:', error);
      throw error;
    }
  }

  /**
   * Ban user from stream/event
   * @param {Object} params - Ban parameters
   * @param {string} moderatorId - Moderator user ID
   * @returns {Promise<Object>} Ban action
   */
  async banUser(params, moderatorId) {
    const {
      streamId = null,
      eventId = null,
      targetUserId,
      reason = 'Violation of community guidelines',
      durationSeconds = null, // null = permanent
      isAutomated = false
    } = params;

    return await this.createAction({
      streamId,
      eventId,
      targetUserId,
      actionType: 'ban_user',
      reason,
      durationSeconds,
      isAutomated
    }, moderatorId);
  }

  /**
   * Timeout user (temporary ban)
   * @param {Object} params - Timeout parameters
   * @param {string} moderatorId - Moderator user ID
   * @returns {Promise<Object>} Timeout action
   */
  async timeoutUser(params, moderatorId) {
    const {
      streamId = null,
      eventId = null,
      targetUserId,
      reason = 'Timeout',
      durationSeconds = 600, // 10 minutes default
      isAutomated = false
    } = params;

    return await this.createAction({
      streamId,
      eventId,
      targetUserId,
      actionType: 'timeout_user',
      reason,
      durationSeconds,
      isAutomated
    }, moderatorId);
  }

  /**
   * Delete message
   * @param {Object} params - Delete parameters
   * @param {string} moderatorId - Moderator user ID
   * @returns {Promise<Object>} Delete action
   */
  async deleteMessage(params, moderatorId) {
    const {
      streamId = null,
      eventId = null,
      targetUserId,
      messageContent,
      reason = 'Inappropriate content',
      isAutomated = false,
      automationRule = null
    } = params;

    return await this.createAction({
      streamId,
      eventId,
      targetUserId,
      actionType: 'delete_message',
      reason,
      messageContent,
      isAutomated,
      automationRule
    }, moderatorId);
  }

  /**
   * Enable slow mode
   * @param {Object} params - Slow mode parameters
   * @param {string} moderatorId - Moderator user ID
   * @returns {Promise<Object>} Slow mode action
   */
  async enableSlowMode(params, moderatorId) {
    const {
      streamId = null,
      eventId = null,
      slowModeSeconds = 10
    } = params;

    return await this.createAction({
      streamId,
      eventId,
      actionType: 'enable_slow_mode',
      metadata: { slowModeSeconds }
    }, moderatorId);
  }

  /**
   * Disable slow mode
   * @param {Object} params - Parameters
   * @param {string} moderatorId - Moderator user ID
   * @returns {Promise<Object>} Action result
   */
  async disableSlowMode(params, moderatorId) {
    const { streamId = null, eventId = null } = params;

    return await this.createAction({
      streamId,
      eventId,
      actionType: 'disable_slow_mode'
    }, moderatorId);
  }

  /**
   * Clear chat messages
   * @param {Object} params - Parameters
   * @param {string} moderatorId - Moderator user ID
   * @returns {Promise<Object>} Clear action
   */
  async clearChat(params, moderatorId) {
    const { streamId = null, eventId = null } = params;

    return await this.createAction({
      streamId,
      eventId,
      actionType: 'clear_chat',
      reason: 'Chat cleared by moderator'
    }, moderatorId);
  }

  /**
   * Check if user is banned or timed out
   * @param {string} userId - User ID to check
   * @param {string} streamId - Stream ID
   * @param {string} eventId - Event ID
   * @returns {Promise<Object>} Ban status
   */
  async checkUserStatus(userId, streamId = null, eventId = null) {
    try {
      const where = {
        target_user_id: userId,
        action_type: ['ban_user', 'timeout_user'],
        is_active: true
      };

      if (streamId) where.stream_id = streamId;
      if (eventId) where.event_id = eventId;

      const actions = await ModerationAction.findAll({
        where,
        order: [['created_at', 'DESC']]
      });

      // Check for active bans/timeouts
      for (const action of actions) {
        if (!action.expires_at) {
          // Permanent ban
          return {
            isBanned: true,
            isPermanent: true,
            reason: action.reason,
            bannedAt: action.created_at
          };
        }

        if (new Date(action.expires_at) > new Date()) {
          // Active timeout
          return {
            isBanned: true,
            isPermanent: false,
            reason: action.reason,
            expiresAt: action.expires_at,
            bannedAt: action.created_at
          };
        } else {
          // Expired timeout - deactivate
          await action.update({ is_active: false });
        }
      }

      return {
        isBanned: false
      };
    } catch (error) {
      logger.error('Failed to check user status:', error);
      return { isBanned: false };
    }
  }

  /**
   * Unban user
   * @param {string} userId - User ID to unban
   * @param {Object} params - Parameters
   * @param {string} moderatorId - Moderator user ID
   * @returns {Promise<boolean>} Success status
   */
  async unbanUser(userId, params, moderatorId) {
    try {
      const { streamId = null, eventId = null } = params;

      const where = {
        target_user_id: userId,
        action_type: ['ban_user', 'timeout_user'],
        is_active: true
      };

      if (streamId) where.stream_id = streamId;
      if (eventId) where.event_id = eventId;

      await ModerationAction.update(
        { is_active: false },
        { where }
      );

      logger.info('User unbanned', { userId, moderatorId });

      return true;
    } catch (error) {
      logger.error('Failed to unban user:', error);
      return false;
    }
  }

  /**
   * Moderate message content
   * @param {string} message - Message to check
   * @param {Object} context - Message context
   * @returns {Promise<Object>} Moderation result
   */
  async moderateMessage(message, context = {}) {
    const issues = [];
    const autoActions = [];

    // Check profanity
    if (this.containsProfanity(message)) {
      issues.push('profanity');
      autoActions.push('delete_message');
    }

    // Check spam
    const spamCheck = this.detectSpam(message, context);
    if (spamCheck.isSpam) {
      issues.push('spam');
      issues.push(...spamCheck.reasons);

      if (spamCheck.severity === 'high') {
        autoActions.push('timeout_user');
      } else {
        autoActions.push('delete_message');
      }
    }

    // Check for excessive links
    const linkCount = (message.match(/https?:\/\//gi) || []).length;
    if (linkCount > this.spamThresholds.maxLinksPerMessage) {
      issues.push('excessive_links');
      autoActions.push('delete_message');
    }

    return {
      allowed: issues.length === 0,
      issues,
      autoActions,
      needsReview: issues.length > 0 && autoActions.length === 0
    };
  }

  /**
   * Check if message contains profanity
   * @param {string} message - Message to check
   * @returns {boolean} Contains profanity
   */
  containsProfanity(message) {
    const lowerMessage = message.toLowerCase();

    for (const word of this.profanityWords) {
      if (lowerMessage.includes(word)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Detect spam in message
   * @param {string} message - Message to check
   * @param {Object} context - Message context (user history, etc.)
   * @returns {Object} Spam detection result
   */
  detectSpam(message, context) {
    const reasons = [];
    let severity = 'low';

    // Check caps percentage
    const capsCount = (message.match(/[A-Z]/g) || []).length;
    const letterCount = (message.match(/[a-zA-Z]/g) || []).length;
    const capsPercentage = letterCount > 0 ? capsCount / letterCount : 0;

    if (capsPercentage > this.spamThresholds.maxCapsPercentage && letterCount > 5) {
      reasons.push('excessive_caps');
      severity = 'medium';
    }

    // Check emoji count
    const emojiCount = (message.match(/[\u{1F300}-\u{1F9FF}]/gu) || []).length;
    if (emojiCount > this.spamThresholds.maxEmojisPerMessage) {
      reasons.push('excessive_emojis');
      severity = 'medium';
    }

    // Check message repetition (requires context)
    if (context.recentMessages) {
      const duplicateCount = context.recentMessages.filter(m => m === message).length;
      if (duplicateCount >= this.spamThresholds.maxDuplicateMessages) {
        reasons.push('duplicate_messages');
        severity = 'high';
      }
    }

    return {
      isSpam: reasons.length > 0,
      reasons,
      severity
    };
  }

  /**
   * Get moderation actions for stream/event
   * @param {Object} params - Query parameters
   * @returns {Promise<Array>} List of moderation actions
   */
  async getActions(params) {
    try {
      const {
        streamId = null,
        eventId = null,
        actionType = null,
        isActive = null,
        limit = 100,
        offset = 0
      } = params;

      const where = {};

      if (streamId) where.stream_id = streamId;
      if (eventId) where.event_id = eventId;
      if (actionType) where.action_type = actionType;
      if (isActive !== null) where.is_active = isActive;

      const actions = await ModerationAction.findAll({
        where,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['created_at', 'DESC']]
      });

      return actions.map(action => this.formatAction(action));
    } catch (error) {
      logger.error('Failed to get moderation actions:', error);
      throw error;
    }
  }

  /**
   * Get moderation statistics
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} Moderation statistics
   */
  async getStats(params) {
    try {
      const { streamId = null, eventId = null } = params;

      const where = {};
      if (streamId) where.stream_id = streamId;
      if (eventId) where.event_id = eventId;

      const actions = await ModerationAction.findAll({ where });

      const stats = {
        totalActions: actions.length,
        actionsByType: {},
        automatedActions: 0,
        manualActions: 0,
        activeActions: 0
      };

      actions.forEach(action => {
        // Count by type
        if (!stats.actionsByType[action.action_type]) {
          stats.actionsByType[action.action_type] = 0;
        }
        stats.actionsByType[action.action_type]++;

        // Count automated vs manual
        if (action.is_automated) {
          stats.automatedActions++;
        } else {
          stats.manualActions++;
        }

        // Count active
        if (action.is_active) {
          stats.activeActions++;
        }
      });

      return stats;
    } catch (error) {
      logger.error('Failed to get moderation stats:', error);
      throw error;
    }
  }

  /**
   * Format action for API response
   * @param {Object} action - ModerationAction model instance
   * @returns {Object} Formatted action
   */
  formatAction(action) {
    const data = action.toJSON();

    // Add computed fields
    data.isExpired = data.expires_at ? new Date(data.expires_at) < new Date() : false;

    if (data.expires_at && !data.isExpired) {
      data.remainingSeconds = Math.floor((new Date(data.expires_at) - new Date()) / 1000);
    }

    return data;
  }
}

module.exports = new ModerationService();
