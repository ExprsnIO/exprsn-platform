/**
 * ═══════════════════════════════════════════════════════════
 * Appeal Service
 * Manages user appeals of moderation decisions
 * ═══════════════════════════════════════════════════════════
 */

const logger = require('../src/utils/logger');
const heraldClient = require('./heraldClient');

class AppealService {
  constructor() {
    this.socketServer = null; // Set by Socket.IO server
  }

  /**
   * Set Socket.io server instance for real-time notifications
   */
  setSocketServer(io) {
    this.socketServer = io;
  }

  /**
   * Emit appeal event via Socket.io
   * @private
   */
  _emitAppealEvent(eventType, payload) {
    if (!this.socketServer) {
      return;
    }

    try {
      // Emit to moderators
      this.socketServer
        .of('/moderation')
        .to('moderators')
        .emit(eventType, {
          ...payload,
          timestamp: Date.now()
        });

      // Emit to affected user
      if (payload.userId) {
        this.socketServer
          .of('/notifications')
          .to(`user:${payload.userId}`)
          .emit(eventType, {
            ...payload,
            timestamp: Date.now()
          });
      }

      logger.debug('Appeal event emitted', { eventType });
    } catch (error) {
      logger.error('Failed to emit appeal event', { error: error.message });
    }
  }

  /**
   * Submit appeal for moderation decision
   * @param {string} userId - User submitting appeal
   * @param {Object} params - Appeal parameters
   * @returns {Promise<Object>} Created appeal
   */
  async submitAppeal(userId, params) {
    try {
      const { Appeal, ModerationCase, UserAction } = require('../models/sequelize-index');

      const {
        moderationItemId,
        userActionId,
        reason,
        additionalInfo
      } = params;

      // Validate that appeal targets either moderation item or user action
      if (!moderationItemId && !userActionId) {
        throw new Error('Appeal must target either a moderation item or user action');
      }

      if (moderationItemId && userActionId) {
        throw new Error('Appeal cannot target both moderation item and user action');
      }

      // Verify ownership
      if (moderationItemId) {
        const moderationCase = await ModerationCase.findByPk(moderationItemId);
        if (!moderationCase) {
          throw new Error('Moderation case not found');
        }
        if (moderationCase.userId !== userId) {
          throw new Error('Unauthorized: You can only appeal your own content');
        }

        // Check if already appealed
        const existingAppeal = await Appeal.findOne({
          where: {
            moderationItemId,
            userId,
            status: ['pending', 'reviewing']
          }
        });

        if (existingAppeal) {
          throw new Error('Appeal already exists for this moderation case');
        }
      }

      if (userActionId) {
        const userAction = await UserAction.findByPk(userActionId);
        if (!userAction) {
          throw new Error('User action not found');
        }
        if (userAction.userId !== userId) {
          throw new Error('Unauthorized: You can only appeal actions taken against you');
        }

        // Check if already appealed
        const existingAppeal = await Appeal.findOne({
          where: {
            userActionId,
            userId,
            status: ['pending', 'reviewing']
          }
        });

        if (existingAppeal) {
          throw new Error('Appeal already exists for this user action');
        }
      }

      // Create appeal
      const appeal = await Appeal.create({
        moderationItemId: moderationItemId || null,
        userActionId: userActionId || null,
        userId,
        reason,
        additionalInfo: additionalInfo || null,
        status: 'pending',
        submittedAt: Date.now()
      });

      logger.info('Appeal submitted', {
        appealId: appeal.id,
        userId,
        moderationItemId,
        userActionId
      });

      // Emit Socket.IO event
      this._emitAppealEvent('appeal:new', {
        appealId: appeal.id,
        userId,
        moderationItemId,
        userActionId
      });

      // Notify moderators via Herald
      await heraldClient.notifyNewAppeal({
        appealId: appeal.id,
        userId,
        reason
      });

      return appeal;
    } catch (error) {
      logger.error('Failed to submit appeal', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Review appeal
   * @param {string} appealId - Appeal ID
   * @param {string} reviewerId - Reviewer ID
   * @param {string} decision - 'approve' or 'deny'
   * @param {string} notes - Review notes
   * @returns {Promise<Object>} Updated appeal
   */
  async reviewAppeal(appealId, reviewerId, decision, notes) {
    try {
      const { Appeal, ModerationCase, UserAction } = require('../models/sequelize-index');

      const appeal = await Appeal.findByPk(appealId, {
        include: [
          {
            model: ModerationCase,
            as: 'moderationItem'
          },
          {
            model: UserAction,
            as: 'userAction'
          }
        ]
      });

      if (!appeal) {
        throw new Error('Appeal not found');
      }

      if (appeal.status !== 'pending' && appeal.status !== 'reviewing') {
        throw new Error('Appeal has already been reviewed');
      }

      // Update appeal status
      if (decision === 'approve') {
        await appeal.approve(reviewerId, notes);

        // If appeal is for moderation item, update status
        if (appeal.moderationItem) {
          await appeal.moderationItem.update({
            status: 'appealed',
            reviewNotes: `Appeal approved: ${notes}`
          });
        }

        // If appeal is for user action, revoke the action
        if (appeal.userAction) {
          await appeal.userAction.revoke(reviewerId, `Appeal approved: ${notes}`);
        }
      } else {
        await appeal.deny(reviewerId, notes);
      }

      logger.info('Appeal reviewed', {
        appealId,
        reviewerId,
        decision
      });

      // Emit Socket.IO event
      this._emitAppealEvent('appeal:reviewed', {
        appealId,
        userId: appeal.userId,
        decision,
        reviewerId
      });

      // Notify user via Herald
      await heraldClient.notifyAppealDecision(appeal.userId, {
        appealId,
        decision,
        notes
      });

      return appeal;
    } catch (error) {
      logger.error('Failed to review appeal', {
        error: error.message,
        appealId
      });
      throw error;
    }
  }

  /**
   * Get appeal by ID
   * @param {string} appealId - Appeal ID
   * @returns {Promise<Object>} Appeal
   */
  async getAppeal(appealId) {
    try {
      const { Appeal, ModerationCase, UserAction } = require('../models/sequelize-index');

      const appeal = await Appeal.findByPk(appealId, {
        include: [
          {
            model: ModerationCase,
            as: 'moderationItem'
          },
          {
            model: UserAction,
            as: 'userAction'
          }
        ]
      });

      if (!appeal) {
        throw new Error('Appeal not found');
      }

      return appeal;
    } catch (error) {
      logger.error('Failed to get appeal', {
        error: error.message,
        appealId
      });
      throw error;
    }
  }

  /**
   * Get appeals for user
   * @param {string} userId - User ID
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} Appeals
   */
  async getAppealsForUser(userId, filters = {}) {
    try {
      const { Appeal, ModerationCase, UserAction } = require('../models/sequelize-index');

      const where = { userId };

      if (filters.status) {
        where.status = filters.status;
      }

      const appeals = await Appeal.findAll({
        where,
        include: [
          {
            model: ModerationCase,
            as: 'moderationItem'
          },
          {
            model: UserAction,
            as: 'userAction'
          }
        ],
        order: [['submittedAt', 'DESC']],
        limit: filters.limit || 50,
        offset: filters.offset || 0
      });

      logger.debug('Appeals retrieved for user', {
        userId,
        count: appeals.length
      });

      return appeals;
    } catch (error) {
      logger.error('Failed to get appeals for user', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Get pending appeals
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} Pending appeals
   */
  async getPendingAppeals(filters = {}) {
    try {
      const { Appeal, ModerationCase, UserAction } = require('../models/sequelize-index');

      const where = {
        status: filters.status || ['pending', 'reviewing']
      };

      const appeals = await Appeal.findAll({
        where,
        include: [
          {
            model: ModerationCase,
            as: 'moderationItem'
          },
          {
            model: UserAction,
            as: 'userAction'
          }
        ],
        order: [['submittedAt', 'ASC']],
        limit: filters.limit || 50,
        offset: filters.offset || 0
      });

      logger.debug('Pending appeals retrieved', {
        count: appeals.length
      });

      return appeals;
    } catch (error) {
      logger.error('Failed to get pending appeals', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get appeal history for moderation case
   * @param {string} moderationItemId - Moderation item ID
   * @returns {Promise<Array>} Appeals
   */
  async getAppealHistory(moderationItemId) {
    try {
      const { Appeal } = require('../models/sequelize-index');

      const appeals = await Appeal.findAll({
        where: { moderationItemId },
        order: [['submittedAt', 'DESC']]
      });

      logger.debug('Appeal history retrieved', {
        moderationItemId,
        count: appeals.length
      });

      return appeals;
    } catch (error) {
      logger.error('Failed to get appeal history', {
        error: error.message,
        moderationItemId
      });
      throw error;
    }
  }

  /**
   * Get appeal statistics
   * @returns {Promise<Object>} Statistics
   */
  async getAppealStats() {
    try {
      const { Appeal } = require('../models/sequelize-index');
      const { Op } = require('sequelize');

      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

      const [
        totalAppeals,
        pendingAppeals,
        approvedAppeals,
        deniedAppeals,
        recentAppeals
      ] = await Promise.all([
        Appeal.count(),
        Appeal.count({ where: { status: 'pending' } }),
        Appeal.count({ where: { status: 'approved' } }),
        Appeal.count({ where: { status: 'denied' } }),
        Appeal.count({ where: { submittedAt: { [Op.gte]: oneDayAgo } } })
      ]);

      const stats = {
        total: totalAppeals,
        pending: pendingAppeals,
        approved: approvedAppeals,
        denied: deniedAppeals,
        recent24h: recentAppeals,
        approvalRate: totalAppeals > 0
          ? Math.round((approvedAppeals / totalAppeals) * 100)
          : 0,
        lastUpdated: Date.now()
      };

      logger.debug('Appeal statistics calculated', stats);

      return stats;
    } catch (error) {
      logger.error('Failed to get appeal statistics', {
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = new AppealService();
