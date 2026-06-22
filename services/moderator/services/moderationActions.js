/**
 * ═══════════════════════════════════════════════════════════
 * Moderation Actions Service
 * Executes moderation actions and notifies services
 * ═══════════════════════════════════════════════════════════
 */

const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');
const heraldClient = require('./heraldClient');
const caTokenService = require('./caTokenService');
const {
  ModerationItem,
  ModerationAction,
  UserAction,
  ModerationQueue
} = require('../models');

class ModerationActionsService {
  constructor() {
    this.socketServer = null; // Set by socket.io server
  }

  /**
   * Set Socket.io server instance for real-time notifications
   */
  setSocketServer(io) {
    this.socketServer = io;
  }

  /**
   * Execute moderation action on content
   * @param {Object} params - Action parameters
   * @returns {Promise<Object>} Action result
   */
  async executeContentAction(params) {
    const {
      action,
      contentType,
      contentId,
      sourceService,
      moderationItemId,
      performedBy,
      reason,
      isAutomated = false,
      metadata = {}
    } = params;

    try {
      logger.info('Executing content moderation action', {
        action,
        contentType,
        contentId,
        sourceService,
        isAutomated
      });

      // Record action in database
      const moderationAction = await ModerationAction.create({
        action,
        contentType,
        contentId,
        sourceService,
        moderationItemId,
        performedBy,
        isAutomated,
        reason,
        metadata,
        performedAt: Date.now()
      });

      // Notify source service via API
      await this._notifySourceService(sourceService, {
        action,
        contentType,
        contentId,
        reason,
        moderationActionId: moderationAction.id,
        timestamp: Date.now()
      });

      // Send real-time notification via Socket.io
      this._emitModerationEvent('content_action', {
        action,
        contentType,
        contentId,
        sourceService,
        reason,
        timestamp: Date.now()
      });

      // Notify user via Herald service
      if (moderationItemId) {
        const item = await ModerationItem.findByPk(moderationItemId);
        if (item && item.userId) {
          await heraldClient.notifyContentDecision(item.userId, {
            decision: action,
            contentType,
            contentId,
            reason
          });
        }
      }

      logger.info('Content moderation action completed', {
        actionId: moderationAction.id,
        action,
        contentId
      });

      return {
        success: true,
        actionId: moderationAction.id,
        action,
        contentId
      };

    } catch (error) {
      logger.error('Failed to execute content action', {
        error: error.message,
        action,
        contentId
      });
      throw error;
    }
  }

  /**
   * Execute moderation action on user
   * @param {Object} params - Action parameters
   * @returns {Promise<Object>} Action result
   */
  async executeUserAction(params) {
    const {
      userId,
      actionType, // 'warn', 'suspend', 'ban'
      reason,
      durationSeconds,
      performedBy,
      relatedContentId,
      relatedReportId
    } = params;

    try {
      logger.info('Executing user moderation action', {
        userId,
        actionType,
        durationSeconds
      });

      // Calculate expiration
      const expiresAt = durationSeconds
        ? Date.now() + durationSeconds * 1000
        : null;

      // Create user action record
      const userAction = await UserAction.create({
        userId,
        actionType,
        reason,
        durationSeconds,
        expiresAt,
        performedBy,
        relatedContentId,
        relatedReportId,
        active: true,
        performedAt: Date.now()
      });

      // Notify affected services
      await this._notifyAllServices({
        type: 'user_action',
        userId,
        actionType,
        expiresAt,
        reason
      });

      // Send real-time notification
      this._emitModerationEvent('user_action', {
        userId,
        actionType,
        expiresAt,
        reason,
        timestamp: Date.now()
      });

      // Notify user via Herald service
      await heraldClient.notifyUserAction(userId, {
        actionType,
        reason,
        expiresAt
      });

      logger.info('User moderation action completed', {
        actionId: userAction.id,
        userId,
        actionType
      });

      return {
        success: true,
        actionId: userAction.id,
        userId,
        actionType,
        expiresAt
      };

    } catch (error) {
      logger.error('Failed to execute user action', {
        error: error.message,
        userId,
        actionType
      });
      throw error;
    }
  }

  /**
   * Remove content from service
   */
  async removeContent(params) {
    return await this.executeContentAction({
      ...params,
      action: 'remove'
    });
  }

  /**
   * Hide content (soft delete, pending review)
   */
  async hideContent(params) {
    return await this.executeContentAction({
      ...params,
      action: 'hide'
    });
  }

  /**
   * Flag content for review
   */
  async flagContent(params) {
    return await this.executeContentAction({
      ...params,
      action: 'flag'
    });
  }

  /**
   * Warn user
   */
  async warnUser(params) {
    return await this.executeUserAction({
      ...params,
      actionType: 'warn'
    });
  }

  /**
   * Suspend user account
   */
  async suspendUser(params) {
    const defaultDuration = config.moderation.actions.suspend.defaultDurationDays * 24 * 3600;

    return await this.executeUserAction({
      ...params,
      actionType: 'suspend',
      durationSeconds: params.durationSeconds || defaultDuration
    });
  }

  /**
   * Ban user permanently
   */
  async banUser(params) {
    return await this.executeUserAction({
      ...params,
      actionType: 'ban',
      durationSeconds: null // Permanent
    });
  }

  /**
   * Approve content (remove from review queue)
   */
  async approveContent(params) {
    const { moderationItemId, moderatorId, notes } = params;

    try {
      // Update moderation item
      await ModerationItem.update(moderationItemId, {
        status: 'approved',
        action: 'approve',
        reviewedBy: moderatorId,
        reviewedAt: Date.now(),
        reviewNotes: notes
      });

      // Remove from queue if present
      await ModerationQueue.delete({ moderationItemId });

      // Record action
      const item = await ModerationItem.findByPk(moderationItemId);

      await this.executeContentAction({
        action: 'approve',
        contentType: item.contentType,
        contentId: item.contentId,
        sourceService: item.sourceService,
        moderationItemId,
        performedBy: moderatorId,
        reason: 'Manually approved by moderator',
        isAutomated: false,
        metadata: { notes }
      });

      return { success: true, moderationItemId };

    } catch (error) {
      logger.error('Failed to approve content', { error: error.message });
      throw error;
    }
  }

  /**
   * Reject content (remove and potentially action user)
   */
  async rejectContent(params) {
    const { moderationItemId, moderatorId, reason, actionUser = false } = params;

    try {
      // Update moderation item
      await ModerationItem.update(moderationItemId, {
        status: 'rejected',
        action: 'reject',
        reviewedBy: moderatorId,
        reviewedAt: Date.now(),
        reviewNotes: reason
      });

      // Get item details
      const item = await ModerationItem.findByPk(moderationItemId);

      // Remove content
      await this.removeContent({
        contentType: item.contentType,
        contentId: item.contentId,
        sourceService: item.sourceService,
        moderationItemId,
        performedBy: moderatorId,
        reason,
        isAutomated: false
      });

      // Optionally warn user
      if (actionUser && item.userId) {
        await this.warnUser({
          userId: item.userId,
          reason: `Content removed: ${reason}`,
          performedBy: moderatorId,
          relatedContentId: item.contentId
        });
      }

      // Remove from queue
      await ModerationQueue.delete({ moderationItemId });

      return { success: true, moderationItemId };

    } catch (error) {
      logger.error('Failed to reject content', { error: error.message });
      throw error;
    }
  }

  /**
   * Notify source service of moderation action
   */
  async _notifySourceService(serviceHostname, payload) {
    try {
      const serviceUrl = this._getServiceUrl(serviceHostname);

      if (!serviceUrl) {
        logger.warn('Unknown service hostname', { serviceHostname });
        return;
      }

      // Generate service token for authentication
      const token = await this._generateServiceToken();

      await axios.post(`${serviceUrl}/api/moderation/action`, payload, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      });

      logger.debug('Notified source service', { serviceHostname, action: payload.action });

    } catch (error) {
      logger.error('Failed to notify source service', {
        error: error.message,
        service: serviceHostname
      });
      // Don't throw - notification failure shouldn't block moderation action
    }
  }

  /**
   * Notify all authorized services
   */
  async _notifyAllServices(payload) {
    const services = config.authorizedServices;

    for (const service of services) {
      await this._notifySourceService(service, payload);
    }
  }

  /**
   * Get service URL from hostname
   */
  _getServiceUrl(hostname) {
    // Map hostnames to service URLs
    // In production, this could use service discovery
    const serviceMap = {
      'timeline.exprsn.io': process.env.TIMELINE_SERVICE_URL || 'http://localhost:3004',
      'spark.exprsn.io': process.env.SPARK_SERVICE_URL || 'http://localhost:3002',
      'gallery.exprsn.io': process.env.GALLERY_SERVICE_URL || 'http://localhost:3008',
      'live.exprsn.io': process.env.LIVE_SERVICE_URL || 'http://localhost:3009',
      'filevault.exprsn.io': process.env.FILEVAULT_SERVICE_URL || 'http://localhost:3007'
    };

    return serviceMap[hostname];
  }

  /**
   * Generate service token for inter-service communication
   * Uses CA token service to generate proper tokens
   */
  async _generateServiceToken() {
    try {
      const token = await caTokenService.generateServiceToken({
        resourceType: 'url',
        resourceValue: '*',
        permissions: { read: true, write: true, append: true },
        expirySeconds: 3600
      });

      return token;
    } catch (error) {
      logger.error('Failed to generate CA token', { error: error.message });

      // Fallback to environment token if CA service unavailable
      const fallbackToken = process.env.MODERATOR_SERVICE_TOKEN;
      if (fallbackToken) {
        logger.warn('Using fallback service token from environment');
        return fallbackToken;
      }

      throw new Error('Unable to generate service token');
    }
  }

  /**
   * Emit real-time moderation event via Socket.io
   */
  _emitModerationEvent(eventType, payload) {
    if (!this.socketServer) {
      logger.warn('Socket.io server not initialized');
      return;
    }

    try {
      // Emit to moderation namespace
      this.socketServer
        .of('/moderation')
        .emit(eventType, {
          ...payload,
          timestamp: Date.now()
        });

      // Emit to notifications namespace for affected users
      if (payload.userId) {
        this.socketServer
          .of('/notifications')
          .to(`user:${payload.userId}`)
          .emit('moderation_notification', {
            type: eventType,
            ...payload
          });
      }

      logger.debug('Emitted Socket.io event', { eventType });

    } catch (error) {
      logger.error('Failed to emit Socket.io event', { error: error.message });
    }
  }
}

module.exports = new ModerationActionsService();
