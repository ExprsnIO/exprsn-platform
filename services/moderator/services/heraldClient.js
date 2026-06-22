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
   * @returns {Promise<Object|null>} Headers, or null when no service token
   *   is configured (callers must skip the outbound call)
   */
  async _getAuthHeader() {
    const token = process.env.MODERATOR_SERVICE_TOKEN;

    if (!token) {
      // No hardcoded fallback: an unauthenticated/placeholder token must
      // never be sent to other services.
      if (config.service.env === 'production') {
        throw new Error(
          'MODERATOR_SERVICE_TOKEN is required in production for Herald/service notifications'
        );
      }

      logger.error(
        'MODERATOR_SERVICE_TOKEN is not set — skipping outbound notification'
      );
      return null;
    }

    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Resolve the allowlisted base URLs for service-to-service notifications.
   * Mirrors the service map used by moderationActions._getServiceUrl —
   * only services in this map may be notified.
   * @private
   * @returns {Object} Map of hostname -> base URL
   */
  _getAllowedServiceUrls() {
    return {
      'timeline.exprsn.io': process.env.TIMELINE_SERVICE_URL || 'http://localhost:3004',
      'spark.exprsn.io': process.env.SPARK_SERVICE_URL || 'http://localhost:3002',
      'gallery.exprsn.io': process.env.GALLERY_SERVICE_URL || 'http://localhost:3008',
      'live.exprsn.io': process.env.LIVE_SERVICE_URL || 'http://localhost:3009',
      'filevault.exprsn.io': process.env.FILEVAULT_SERVICE_URL || 'http://localhost:3007'
    };
  }

  /**
   * Resolve a notification target to an allowlisted service base URL.
   * Accepts either a configured hostname (e.g. 'timeline.exprsn.io') or a
   * full URL whose origin matches a configured service URL.
   * @private
   * @param {string} serviceUrl - Requested target
   * @returns {string|null} Allowlisted base URL, or null when not allowed
   */
  _resolveAllowedServiceUrl(serviceUrl) {
    const allowed = this._getAllowedServiceUrls();

    // Hostname key lookup (preferred form)
    if (allowed[serviceUrl]) {
      return allowed[serviceUrl];
    }

    // Full URL: origin must exactly match an allowlisted service URL origin
    try {
      const requestedOrigin = new URL(serviceUrl).origin;
      for (const baseUrl of Object.values(allowed)) {
        if (new URL(baseUrl).origin === requestedOrigin) {
          return baseUrl;
        }
      }
    } catch (error) {
      // Not a parseable URL — fall through to rejection
    }

    return null;
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

      if (!headers) {
        return { success: false, reason: 'missing_service_token' };
      }

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
   * @param {string} serviceUrl - Service hostname or URL (must be in the
   *   configured service allowlist)
   * @param {Object} data - Notification data
   * @returns {Promise<Object>}
   */
  async notifyService(serviceUrl, data) {
    logger.debug('Sending service notification', { serviceUrl });

    // This bypasses Herald and sends directly to the service
    // Herald is for user notifications, not service-to-service
    try {
      // SSRF protection: only allowlisted services may be notified
      const targetUrl = this._resolveAllowedServiceUrl(serviceUrl);

      if (!targetUrl) {
        logger.warn('Rejected service notification to non-allowlisted target', {
          serviceUrl
        });
        return { success: false, reason: 'service_not_allowed' };
      }

      const headers = await this._getAuthHeader();

      if (!headers) {
        return { success: false, reason: 'missing_service_token' };
      }

      const response = await axios.post(
        `${targetUrl}/api/moderation/notification`,
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
