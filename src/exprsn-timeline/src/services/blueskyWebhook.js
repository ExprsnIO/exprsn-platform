/**
 * ═══════════════════════════════════════════════════════════
 * Bluesky Webhook Service
 * Send events to Bluesky PDS service
 * ═══════════════════════════════════════════════════════════
 */

const axios = require('axios');
const logger = require('../utils/logger');

const BLUESKY_WEBHOOK_URL = process.env.BLUESKY_WEBHOOK_URL || 'http://localhost:3018/webhooks/timeline';

/**
 * Send webhook to Bluesky service
 */
async function sendWebhook(event, data) {
  try {
    if (!process.env.BLUESKY_INTEGRATION_ENABLED || process.env.BLUESKY_INTEGRATION_ENABLED === 'false') {
      logger.debug('Bluesky integration disabled, skipping webhook');
      return null;
    }

    logger.info('Sending webhook to Bluesky', { event });

    const response = await axios.post(BLUESKY_WEBHOOK_URL, {
      event,
      data
    }, {
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    logger.info('Bluesky webhook sent successfully', {
      event,
      status: response.status
    });

    return response.data;
  } catch (error) {
    logger.error('Failed to send Bluesky webhook', {
      event,
      error: error.message
    });
    // Don't throw - webhook failures should not break the main flow
    return null;
  }
}

/**
 * Notify Bluesky of new post
 */
async function notifyPostCreated(post) {
  return sendWebhook('post.created', post.toJSON ? post.toJSON() : post);
}

/**
 * Notify Bluesky of post update
 */
async function notifyPostUpdated(post) {
  return sendWebhook('post.updated', post.toJSON ? post.toJSON() : post);
}

/**
 * Notify Bluesky of post deletion
 */
async function notifyPostDeleted(post) {
  return sendWebhook('post.deleted', post.toJSON ? post.toJSON() : post);
}

/**
 * Notify Bluesky of like
 */
async function notifyPostLiked(post, userId) {
  return sendWebhook('post.liked', {
    post: post.toJSON ? post.toJSON() : post,
    userId
  });
}

/**
 * Notify Bluesky of unlike
 */
async function notifyPostUnliked(post, userId) {
  return sendWebhook('post.unliked', {
    post: post.toJSON ? post.toJSON() : post,
    userId
  });
}

module.exports = {
  notifyPostCreated,
  notifyPostUpdated,
  notifyPostDeleted,
  notifyPostLiked,
  notifyPostUnliked
};
