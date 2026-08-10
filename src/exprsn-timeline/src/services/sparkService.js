/**
 * ═══════════════════════════════════════════════════════════
 * Spark Service Integration
 * Real-time messaging integration for timeline events
 * ═══════════════════════════════════════════════════════════
 */

const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Create Spark service client
 */
const sparkClient = axios.create({
  baseURL: config.spark?.url || process.env.SPARK_SERVICE_URL || 'http://localhost:3002',
  timeout: config.spark?.timeout || 5000,
  headers: {
    'Content-Type': 'application/json'
  }
});

/**
 * Send real-time event via Spark
 *
 * @param {string} userId - Target user ID
 * @param {Object} event - Event details
 * @param {string} event.type - Event type (post_created, post_liked, etc.)
 * @param {Object} event.data - Event payload
 * @returns {Promise<Object>} - Send result
 */
async function sendRealtimeEvent(userId, event) {
  if (!config.spark?.enabled) {
    logger.debug('Spark service disabled, skipping real-time event', {
      userId,
      type: event.type
    });
    return { success: false, reason: 'Spark service disabled' };
  }

  try {
    const payload = {
      userId,
      event: event.type,
      data: event.data,
      timestamp: new Date().toISOString()
    };

    logger.debug('Sending real-time event to Spark', {
      userId,
      type: event.type
    });

    const response = await sparkClient.post('/api/events/broadcast', payload);

    logger.info('Real-time event sent via Spark', {
      userId,
      type: event.type,
      eventId: response.data.eventId
    });

    return {
      success: true,
      eventId: response.data.eventId
    };
  } catch (error) {
    logger.error('Failed to send real-time event via Spark', {
      userId,
      type: event.type,
      error: error.message,
      status: error.response?.status
    });

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Broadcast event to multiple users
 *
 * @param {Array<string>} userIds - Target user IDs
 * @param {Object} event - Event details
 * @returns {Promise<Object>} - Broadcast result
 */
async function broadcastEvent(userIds, event) {
  if (!config.spark?.enabled) {
    return { success: false, reason: 'Spark service disabled' };
  }

  try {
    const payload = {
      userIds,
      event: event.type,
      data: event.data,
      timestamp: new Date().toISOString()
    };

    const response = await sparkClient.post('/api/events/broadcast-multi', payload);

    logger.info('Broadcast event sent via Spark', {
      userCount: userIds.length,
      type: event.type
    });

    return {
      success: true,
      delivered: response.data.delivered,
      failed: response.data.failed
    };
  } catch (error) {
    logger.error('Failed to broadcast event via Spark', {
      userCount: userIds.length,
      type: event.type,
      error: error.message
    });

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Notify followers of new post
 *
 * @param {string} postId - Post ID
 * @param {string} authorId - Author user ID
 * @param {Array<string>} followerIds - Follower user IDs
 * @returns {Promise<Object>}
 */
async function notifyNewPost(postId, authorId, followerIds) {
  return broadcastEvent(followerIds, {
    type: 'post_created',
    data: {
      postId,
      authorId
    }
  });
}

/**
 * Check Spark service health
 *
 * @returns {Promise<Object>} - Health check result
 */
async function checkHealth() {
  try {
    const response = await sparkClient.get('/health', {
      timeout: 3000
    });

    return {
      status: 'connected',
      healthy: response.status === 200,
      data: response.data
    };
  } catch (error) {
    return {
      status: 'disconnected',
      healthy: false,
      error: error.message
    };
  }
}

module.exports = {
  sendRealtimeEvent,
  broadcastEvent,
  notifyNewPost,
  checkHealth
};
