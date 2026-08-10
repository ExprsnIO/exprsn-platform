/**
 * ═══════════════════════════════════════════════════════════
 * Queue Service
 * Manages review queue and moderator assignments
 * ═══════════════════════════════════════════════════════════
 */

const logger = require('../src/utils/logger');
const riskCalculator = require('../src/utils/risk-calculator');
const heraldClient = require('./heraldClient');

class QueueService {
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
   * Emit queue event via Socket.io
   * @private
   */
  _emitQueueEvent(eventType, payload) {
    if (!this.socketServer) {
      return;
    }

    try {
      this.socketServer
        .of('/moderation')
        .to('moderators')
        .emit(eventType, {
          ...payload,
          timestamp: Date.now()
        });

      logger.debug('Queue event emitted', { eventType });
    } catch (error) {
      logger.error('Failed to emit queue event', { error: error.message });
    }
  }

  /**
   * Add case to review queue
   * @param {string} moderationItemId - Moderation item ID
   * @param {Object} options - Queue options
   * @returns {Promise<Object>} Queue item
   */
  async addToQueue(moderationItemId, options = {}) {
    try {
      const { ReviewQueue, ModerationCase } = require('../models/sequelize-index');

      // Get moderation case
      const moderationCase = await ModerationCase.findByPk(moderationItemId);
      if (!moderationCase) {
        throw new Error('Moderation case not found');
      }

      // Calculate priority
      const priority = options.priority || this._calculatePriority(moderationCase);

      // Determine if escalated
      const escalated = options.escalated || moderationCase.riskScore >= 90;

      // Create queue item
      const queueItem = await ReviewQueue.create({
        moderationItemId,
        priority,
        escalated,
        escalatedReason: options.escalatedReason || (escalated ? 'High risk score' : null),
        status: 'pending',
        queuedAt: Date.now()
      });

      logger.info('Item added to review queue', {
        queueId: queueItem.id,
        moderationItemId,
        priority,
        escalated
      });

      // Emit Socket.IO event
      this._emitQueueEvent('queue:new_item', {
        queueId: queueItem.id,
        moderationItemId,
        priority,
        escalated
      });

      // Emit high-priority alert if escalated
      if (escalated) {
        this._emitQueueEvent('queue:high_priority', {
          queueId: queueItem.id,
          moderationItemId,
          priority
        });

        // Notify moderators via Herald for high-priority items
        await heraldClient.notifyHighPriorityContent({
          moderationItemId,
          riskScore: moderationCase.riskScore,
          contentType: moderationCase.contentType
        });
      }

      return queueItem;
    } catch (error) {
      logger.error('Failed to add item to queue', {
        error: error.message,
        moderationItemId
      });
      throw error;
    }
  }

  /**
   * Get next item for reviewer
   * @param {string} reviewerId - Reviewer ID
   * @param {Object} filters - Optional filters
   * @returns {Promise<Object|null>} Next queue item
   */
  async getNextItem(reviewerId, filters = {}) {
    try {
      const { ReviewQueue, ModerationCase } = require('../models/sequelize-index');

      // Build query
      const where = {
        status: 'pending',
        assignedTo: null // Only unassigned items
      };

      if (filters.escalated !== undefined) {
        where.escalated = filters.escalated;
      }

      if (filters.minPriority !== undefined) {
        where.priority = { [require('sequelize').Op.gte]: filters.minPriority };
      }

      // Get highest priority unassigned item
      const queueItem = await ReviewQueue.findOne({
        where,
        include: [{
          model: ModerationCase,
          as: 'moderationItem',
          required: true
        }],
        order: [
          ['priority', 'DESC'],
          ['queuedAt', 'ASC']
        ]
      });

      if (!queueItem) {
        logger.debug('No items available in queue', { reviewerId });
        return null;
      }

      logger.info('Next item retrieved for reviewer', {
        queueId: queueItem.id,
        reviewerId,
        priority: queueItem.priority
      });

      return queueItem;
    } catch (error) {
      logger.error('Failed to get next queue item', {
        error: error.message,
        reviewerId
      });
      throw error;
    }
  }

  /**
   * Assign reviewer to queue item
   * @param {string} queueId - Queue item ID
   * @param {string} reviewerId - Reviewer ID
   * @returns {Promise<Object>} Updated queue item
   */
  async assignReviewer(queueId, reviewerId) {
    try {
      const { ReviewQueue } = require('../models/sequelize-index');

      const queueItem = await ReviewQueue.findByPk(queueId);
      if (!queueItem) {
        throw new Error('Queue item not found');
      }

      if (queueItem.assignedTo && queueItem.assignedTo !== reviewerId) {
        throw new Error('Queue item already assigned to another reviewer');
      }

      await queueItem.claim(reviewerId);

      logger.info('Reviewer assigned to queue item', {
        queueId,
        reviewerId
      });

      // Emit Socket.IO event
      this._emitQueueEvent('queue:item_claimed', {
        queueId,
        reviewerId
      });

      return queueItem;
    } catch (error) {
      logger.error('Failed to assign reviewer', {
        error: error.message,
        queueId,
        reviewerId
      });
      throw error;
    }
  }

  /**
   * Update queue status
   * @param {string} queueId - Queue item ID
   * @param {string} status - New status
   * @returns {Promise<Object>} Updated queue item
   */
  async updateQueueStatus(queueId, status) {
    try {
      const { ReviewQueue } = require('../models/sequelize-index');

      const queueItem = await ReviewQueue.findByPk(queueId);
      if (!queueItem) {
        throw new Error('Queue item not found');
      }

      await queueItem.complete(status);

      logger.info('Queue status updated', {
        queueId,
        status
      });

      // Emit Socket.IO event
      this._emitQueueEvent('queue:item_completed', {
        queueId,
        status
      });

      return queueItem;
    } catch (error) {
      logger.error('Failed to update queue status', {
        error: error.message,
        queueId,
        status
      });
      throw error;
    }
  }

  /**
   * Get review queue
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} Queue items
   */
  async getQueue(filters = {}) {
    try {
      const { ReviewQueue, ModerationCase } = require('../models/sequelize-index');

      const where = {};

      if (filters.status) {
        where.status = filters.status;
      }

      if (filters.escalated !== undefined) {
        where.escalated = filters.escalated;
      }

      if (filters.assignedTo) {
        where.assignedTo = filters.assignedTo;
      }

      if (filters.minPriority !== undefined) {
        where.priority = { [require('sequelize').Op.gte]: filters.minPriority };
      }

      const items = await ReviewQueue.findAll({
        where,
        include: [{
          model: ModerationCase,
          as: 'moderationItem',
          required: true
        }],
        order: [
          ['priority', 'DESC'],
          ['queuedAt', 'ASC']
        ],
        limit: filters.limit || 50,
        offset: filters.offset || 0
      });

      logger.debug('Queue items retrieved', {
        count: items.length,
        filters
      });

      return items;
    } catch (error) {
      logger.error('Failed to get queue', {
        error: error.message,
        filters
      });
      throw error;
    }
  }

  /**
   * Get queue statistics
   * @returns {Promise<Object>} Statistics
   */
  async getQueueStats() {
    try {
      const { ReviewQueue } = require('../models/sequelize-index');
      const { Op } = require('sequelize');

      const [
        total,
        pending,
        reviewing,
        escalated,
        avgWaitTime
      ] = await Promise.all([
        ReviewQueue.count(),
        ReviewQueue.count({ where: { status: 'pending' } }),
        ReviewQueue.count({ where: { status: 'reviewing' } }),
        ReviewQueue.count({ where: { escalated: true, status: 'pending' } }),
        this._calculateAvgWaitTime()
      ]);

      const stats = {
        total,
        pending,
        reviewing,
        escalated,
        avgWaitTimeMinutes: avgWaitTime,
        lastUpdated: Date.now()
      };

      logger.debug('Queue statistics calculated', stats);

      return stats;
    } catch (error) {
      logger.error('Failed to get queue statistics', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Calculate priority for queue item
   * @private
   */
  _calculatePriority(moderationCase) {
    return riskCalculator.calculatePriority(moderationCase.riskScore, {
      hasReports: false, // This could be enhanced to check for actual reports
      escalated: moderationCase.riskScore >= 90
    });
  }

  /**
   * Calculate average wait time
   * @private
   */
  async _calculateAvgWaitTime() {
    try {
      const { ReviewQueue } = require('../models/sequelize-index');
      const { Op } = require('sequelize');

      // Get completed items from last 24 hours
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

      const items = await ReviewQueue.findAll({
        where: {
          completedAt: { [Op.gte]: oneDayAgo },
          status: { [Op.in]: ['approved', 'rejected'] }
        },
        attributes: ['queuedAt', 'completedAt']
      });

      if (items.length === 0) return 0;

      const totalWaitTime = items.reduce((sum, item) => {
        return sum + (item.completedAt - item.queuedAt);
      }, 0);

      // Convert to minutes
      return Math.round(totalWaitTime / items.length / 1000 / 60);
    } catch (error) {
      logger.error('Failed to calculate avg wait time', {
        error: error.message
      });
      return 0;
    }
  }
}

module.exports = new QueueService();
