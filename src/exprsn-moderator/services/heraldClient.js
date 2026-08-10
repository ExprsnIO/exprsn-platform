/**
 * ═══════════════════════════════════════════════════════════
 * Herald Client
 * Integration with Herald notification service
 * ═══════════════════════════════════════════════════════════
 */

const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config');

class HeraldClient {
  constructor() {
    this.heraldUrl = config.herald.url;
    this.enabled = config.herald.enabled;
    this.timeout = 5000; // 5 second timeout
    this.maxRetries = 1; // Retry once on failure
  }

  /**
   * Check if Herald service is enabled
   * @returns {boolean}
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Get authorization header with CA token
   * @private
   * @returns {Promise<Object>}
   */
  async _getAuthHeader() {
    // In production, this would fetch a valid CA token
    // For now, use service token from environment
    const token = process.env.MODERATOR_SERVICE_TOKEN || 'service-token';

    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Make HTTP request to Herald service
   * @private
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request data
   * @param {number} attempt - Current attempt number
   * @returns {Promise<Object>}
   */
  async _makeRequest(endpoint, data, attempt = 1) {
    if (!this.enabled) {
      logger.debug('Herald service disabled, skipping notification');
      return { success: false, reason: 'disabled' };
    }

    try {
      const headers = await this._getAuthHeader();

      const response = await axios.post(
        `${this.heraldUrl}${endpoint}`,
        data,
        {
          headers,
          timeout: this.timeout
        }
      );

      logger.debug('Herald request successful', {
        endpoint,
        status: response.status
      });

      return { success: true, data: response.data };
    } catch (error) {
      logger.warn('Herald request failed', {
        endpoint,
        attempt,
        error: error.message
      });

      // Retry once on failure
      if (attempt < this.maxRetries) {
        logger.debug('Retrying Herald request', { endpoint, attempt: attempt + 1 });
        return this._makeRequest(endpoint, data, attempt + 1);
      }

      // Don't throw - notifications are non-critical
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Notify user
   * @param {string} userId - User ID
   * @param {string} type - Notification type
   * @param {Object} data - Notification data
   * @returns {Promise<Object>}
   */
  async notifyUser(userId, type, data) {
    logger.debug('Sending user notification', { userId, type });

    return this._makeRequest('/api/notifications/send', {
      userId,
      type,
      data,
      priority: data.priority || 'normal',
      channels: data.channels || ['in_app']
    });
  }

  /**
   * Notify all moderators
   * @param {string} type - Notification type
   * @param {Object} data - Notification data
   * @returns {Promise<Object>}
   */
  async notifyModerators(type, data) {
    logger.debug('Sending moderator notification', { type });

    return this._makeRequest('/api/notifications/broadcast', {
      role: 'moderator',
      type,
      data,
      priority: data.priority || 'high'
    });
  }

  /**
   * Notify source service
   * @param {string} serviceUrl - Service URL
   * @param {Object} data - Notification data
   * @returns {Promise<Object>}
   */
  async notifyService(serviceUrl, data) {
    logger.debug('Sending service notification', { serviceUrl });

    // This bypasses Herald and sends directly to the service
    // Herald is for user notifications, not service-to-service
    try {
      const headers = await this._getAuthHeader();

      const response = await axios.post(
        `${serviceUrl}/api/moderation/notification`,
        data,
        {
          headers,
          timeout: this.timeout
        }
      );

      return { success: true, data: response.data };
    } catch (error) {
      logger.warn('Service notification failed', {
        serviceUrl,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Send batch notifications
   * @param {Array} notifications - Array of notification objects
   * @returns {Promise<Object>}
   */
  async notifyBatch(notifications) {
    logger.debug('Sending batch notifications', {
      count: notifications.length
    });

    if (!Array.isArray(notifications) || notifications.length === 0) {
      return { success: false, reason: 'empty_batch' };
    }

    return this._makeRequest('/api/notifications/batch', {
      notifications
    });
  }

  /**
   * Notify user about content decision
   * @param {string} userId - User ID
   * @param {Object} params - Notification parameters
   * @returns {Promise<Object>}
   */
  async notifyContentDecision(userId, params) {
    const { decision, contentType, contentId, reason } = params;

    return this.notifyUser(userId, 'moderation:content_decision', {
      decision,
      contentType,
      contentId,
      reason,
      priority: decision === 'rejected' ? 'high' : 'normal',
      channels: ['in_app', 'email']
    });
  }

  /**
   * Notify user about account action
   * @param {string} userId - User ID
   * @param {Object} params - Notification parameters
   * @returns {Promise<Object>}
   */
  async notifyUserAction(userId, params) {
    const { actionType, reason, expiresAt } = params;

    return this.notifyUser(userId, 'moderation:user_action', {
      actionType,
      reason,
      expiresAt,
      priority: 'urgent',
      channels: ['in_app', 'email']
    });
  }

  /**
   * Notify user about appeal decision
   * @param {string} userId - User ID
   * @param {Object} params - Notification parameters
   * @returns {Promise<Object>}
   */
  async notifyAppealDecision(userId, params) {
    const { appealId, decision, notes } = params;

    return this.notifyUser(userId, 'moderation:appeal_decision', {
      appealId,
      decision,
      notes,
      priority: 'high',
      channels: ['in_app', 'email']
    });
  }

  /**
   * Notify moderators about new appeal
   * @param {Object} params - Notification parameters
   * @returns {Promise<Object>}
   */
  async notifyNewAppeal(params) {
    const { appealId, userId, reason } = params;

    return this.notifyModerators('moderation:new_appeal', {
      appealId,
      userId,
      reason,
      priority: 'high'
    });
  }

  /**
   * Notify moderators about high-priority content
   * @param {Object} params - Notification parameters
   * @returns {Promise<Object>}
   */
  async notifyHighPriorityContent(params) {
    const { moderationItemId, riskScore, contentType } = params;

    return this.notifyModerators('moderation:high_priority', {
      moderationItemId,
      riskScore,
      contentType,
      priority: 'urgent'
    });
  }

  /**
   * Notify moderators about escalated item
   * @param {Object} params - Notification parameters
   * @returns {Promise<Object>}
   */
  async notifyEscalation(params) {
    const { queueId, reason, moderationItemId } = params;

    return this.notifyModerators('moderation:escalation', {
      queueId,
      reason,
      moderationItemId,
      priority: 'urgent'
    });
  }
}

module.exports = new HeraldClient();
