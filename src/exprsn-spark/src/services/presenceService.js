/**
 * ═══════════════════════════════════════════════════════════
 * Presence Service
 * Track and manage user online/offline/away/busy status
 * ═══════════════════════════════════════════════════════════
 */

const { createLogger } = require('@exprsn/shared');
const logger = createLogger('presence-service');

class PresenceService {
  constructor(redisClient = null) {
    this.redis = redisClient;
    this.presenceCache = new Map(); // Fallback if Redis not available
    this.PRESENCE_TTL = 300; // 5 minutes auto-offline
    this.PRESENCE_KEY_PREFIX = 'presence:';
  }

  /**
   * Set user presence status
   * @param {string} userId - User ID
   * @param {string} status - Status (online, away, busy, offline)
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Updated presence
   */
  async setStatus(userId, status, options = {}) {
    const {
      statusMessage = null,
      device = null,
      expiresIn = this.PRESENCE_TTL
    } = options;

    const presence = {
      userId,
      status,
      statusMessage,
      device,
      lastSeen: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      if (this.redis) {
        // Store in Redis with TTL
        const key = `${this.PRESENCE_KEY_PREFIX}${userId}`;
        await this.redis.setex(
          key,
          expiresIn,
          JSON.stringify(presence)
        );

        logger.debug('Presence updated in Redis', {
          userId,
          status,
          expiresIn
        });
      } else {
        // Fallback to memory cache
        this.presenceCache.set(userId, {
          ...presence,
          expiresAt: Date.now() + (expiresIn * 1000)
        });

        logger.debug('Presence updated in memory', {
          userId,
          status
        });
      }

      logger.info('User presence updated', {
        userId,
        status,
        device
      });

      return presence;
    } catch (error) {
      logger.error('Failed to set presence', {
        userId,
        status,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get presence for a single user
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} Presence or null
   */
  async getPresence(userId) {
    try {
      if (this.redis) {
        const key = `${this.PRESENCE_KEY_PREFIX}${userId}`;
        const data = await this.redis.get(key);

        if (data) {
          return JSON.parse(data);
        }
      } else {
        // Check memory cache
        const cached = this.presenceCache.get(userId);
        if (cached && cached.expiresAt > Date.now()) {
          return cached;
        }

        // Expired, remove from cache
        if (cached) {
          this.presenceCache.delete(userId);
        }
      }

      // No presence found, user is offline
      return {
        userId,
        status: 'offline',
        lastSeen: null,
        statusMessage: null,
        device: null
      };
    } catch (error) {
      logger.error('Failed to get presence', {
        userId,
        error: error.message
      });
      return {
        userId,
        status: 'offline',
        lastSeen: null
      };
    }
  }

  /**
   * Get presence for multiple users
   * @param {Array<string>} userIds - Array of user IDs
   * @returns {Promise<Object>} Map of userId to presence
   */
  async getBulkPresence(userIds) {
    try {
      const presences = {};

      if (this.redis) {
        // Batch fetch from Redis using pipeline
        const pipeline = this.redis.pipeline();

        userIds.forEach(userId => {
          const key = `${this.PRESENCE_KEY_PREFIX}${userId}`;
          pipeline.get(key);
        });

        const results = await pipeline.exec();

        results.forEach(([err, data], index) => {
          const userId = userIds[index];

          if (!err && data) {
            presences[userId] = JSON.parse(data);
          } else {
            presences[userId] = {
              userId,
              status: 'offline',
              lastSeen: null
            };
          }
        });

        logger.debug('Bulk presence fetched from Redis', {
          count: userIds.length
        });
      } else {
        // Fetch from memory cache
        userIds.forEach(userId => {
          const cached = this.presenceCache.get(userId);

          if (cached && cached.expiresAt > Date.now()) {
            presences[userId] = cached;
          } else {
            presences[userId] = {
              userId,
              status: 'offline',
              lastSeen: null
            };
          }
        });
      }

      return presences;
    } catch (error) {
      logger.error('Failed to get bulk presence', {
        userIdCount: userIds.length,
        error: error.message
      });

      // Return all offline as fallback
      const fallback = {};
      userIds.forEach(userId => {
        fallback[userId] = {
          userId,
          status: 'offline',
          lastSeen: null
        };
      });
      return fallback;
    }
  }

  /**
   * Track user activity (updates lastSeen)
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async trackActivity(userId) {
    try {
      const current = await this.getPresence(userId);

      if (current.status !== 'offline') {
        // Update lastSeen timestamp
        await this.setStatus(userId, current.status, {
          statusMessage: current.statusMessage,
          device: current.device
        });
      }
    } catch (error) {
      logger.error('Failed to track activity', {
        userId,
        error: error.message
      });
    }
  }

  /**
   * Set user as offline
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async setOffline(userId) {
    try {
      if (this.redis) {
        // Update to offline but keep in cache for lastSeen
        const key = `${this.PRESENCE_KEY_PREFIX}${userId}`;
        const current = await this.redis.get(key);

        if (current) {
          const presence = JSON.parse(current);
          presence.status = 'offline';
          presence.lastSeen = new Date().toISOString();
          presence.updatedAt = new Date().toISOString();

          // Keep for longer period to track last seen
          await this.redis.setex(key, 86400, JSON.stringify(presence)); // 24 hours

          logger.info('User set to offline', { userId });
        }
      } else {
        // Update memory cache
        const cached = this.presenceCache.get(userId);
        if (cached) {
          cached.status = 'offline';
          cached.lastSeen = new Date().toISOString();
          cached.updatedAt = new Date().toISOString();
          cached.expiresAt = Date.now() + (86400 * 1000); // 24 hours
        }
      }
    } catch (error) {
      logger.error('Failed to set offline', {
        userId,
        error: error.message
      });
    }
  }

  /**
   * Get all online users in conversations
   * @param {Array<string>} conversationIds - Conversation IDs
   * @returns {Promise<Array>} Array of online user IDs
   */
  async getOnlineUsersInConversations(conversationIds) {
    try {
      // This would require querying participants from database
      // and then checking their presence
      // Implementation depends on database schema
      logger.warn('getOnlineUsersInConversations not fully implemented');
      return [];
    } catch (error) {
      logger.error('Failed to get online users', {
        error: error.message
      });
      return [];
    }
  }

  /**
   * Subscribe to presence updates (for Socket.IO integration)
   * @param {Object} io - Socket.IO instance
   * @param {string} userId - User ID to broadcast updates for
   * @param {Object} presence - Updated presence
   * @returns {Promise<void>}
   */
  async broadcastPresenceUpdate(io, userId, presence) {
    try {
      // Get user's conversations
      const { Participant } = require('../models');

      const participants = await Participant.findAll({
        where: { userId, active: true },
        attributes: ['conversationId']
      });

      const conversationIds = participants.map(p => p.conversationId);

      // Emit to each conversation room
      conversationIds.forEach(convId => {
        io.to(`conversation:${convId}`).emit('user:presence', {
          userId,
          status: presence.status,
          statusMessage: presence.statusMessage,
          lastSeen: presence.lastSeen
        });
      });

      logger.debug('Presence update broadcasted', {
        userId,
        conversationCount: conversationIds.length
      });
    } catch (error) {
      logger.error('Failed to broadcast presence', {
        userId,
        error: error.message
      });
    }
  }

  /**
   * Clean up expired presence records (maintenance task)
   * @returns {Promise<number>} Number of records cleaned
   */
  async cleanExpired() {
    let cleaned = 0;

    try {
      if (!this.redis) {
        // Clean memory cache
        const now = Date.now();
        for (const [userId, presence] of this.presenceCache.entries()) {
          if (presence.expiresAt < now) {
            this.presenceCache.delete(userId);
            cleaned++;
          }
        }

        logger.info('Cleaned expired presence from memory', { count: cleaned });
      }
      // Redis handles expiration automatically via TTL

      return cleaned;
    } catch (error) {
      logger.error('Failed to clean expired presence', {
        error: error.message
      });
      return 0;
    }
  }

  /**
   * Get presence statistics
   * @returns {Promise<Object>} Presence stats
   */
  async getStats() {
    try {
      let totalUsers = 0;
      let onlineUsers = 0;
      let awayUsers = 0;
      let busyUsers = 0;

      if (this.redis) {
        // Scan Redis keys (use cursor-based scan for large datasets)
        const keys = await this.redis.keys(`${this.PRESENCE_KEY_PREFIX}*`);
        totalUsers = keys.length;

        // Count by status
        const pipeline = this.redis.pipeline();
        keys.forEach(key => pipeline.get(key));
        const results = await pipeline.exec();

        results.forEach(([err, data]) => {
          if (!err && data) {
            const presence = JSON.parse(data);
            if (presence.status === 'online') onlineUsers++;
            else if (presence.status === 'away') awayUsers++;
            else if (presence.status === 'busy') busyUsers++;
          }
        });
      } else {
        // Memory cache stats
        totalUsers = this.presenceCache.size;

        for (const presence of this.presenceCache.values()) {
          if (presence.expiresAt > Date.now()) {
            if (presence.status === 'online') onlineUsers++;
            else if (presence.status === 'away') awayUsers++;
            else if (presence.status === 'busy') busyUsers++;
          }
        }
      }

      return {
        totalUsers,
        onlineUsers,
        awayUsers,
        busyUsers,
        offlineUsers: totalUsers - (onlineUsers + awayUsers + busyUsers)
      };
    } catch (error) {
      logger.error('Failed to get presence stats', {
        error: error.message
      });
      return {
        totalUsers: 0,
        onlineUsers: 0,
        awayUsers: 0,
        busyUsers: 0,
        offlineUsers: 0
      };
    }
  }
}

module.exports = PresenceService;
