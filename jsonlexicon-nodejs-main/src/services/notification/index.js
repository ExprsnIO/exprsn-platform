/**
 * Push Notification Service for Tokens
 * Handles real-time notifications for token events
 */

const database = require('../../config/database');
const redis = require('../../config/redis');
const logger = require('../../utils/logger');
const { queueWebhookDelivery } = require('../../controllers/webhooks');

/**
 * Event types for notifications
 */
const EVENT_TYPES = {
  TOKEN_CREATED: 'token.created',
  TOKEN_USED: 'token.used',
  TOKEN_EXPIRED: 'token.expired',
  TOKEN_REVOKED: 'token.revoked',
  TOKEN_EXHAUSTED: 'token.exhausted',
  TOKEN_REFRESHED: 'token.refreshed',
  TOKEN_NEAR_EXPIRY: 'token.near_expiry',
  TOKEN_LOW_USES: 'token.low_uses',
  TOKEN_QUOTA_WARNING: 'token.quota_warning',
};

/**
 * Notification channels
 */
const CHANNELS = {
  WEBHOOK: 'webhook',
  WEBSOCKET: 'websocket',
  REDIS_PUBSUB: 'redis_pubsub',
};

/**
 * Send notification for token event
 */
async function sendTokenNotification(event) {
  const {
    type,
    token_id,
    token_handle,
    user_id,
    data = {},
  } = event;

  try {
    logger.info('Sending token notification', {
      type,
      tokenId: token_id,
      userId: user_id,
    });

    // Build notification payload
    const notification = {
      event_type: type,
      event_id: require('uuid').v4(),
      timestamp: new Date().toISOString(),
      token: {
        id: token_id,
        handle: token_handle,
      },
      data,
    };

    // Send via multiple channels
    await Promise.all([
      sendViaWebhook(user_id, notification),
      sendViaWebSocket(user_id, notification),
      sendViaRedisPubSub(user_id, notification),
    ]);

    logger.info('Token notification sent', {
      type,
      tokenId: token_id,
      userId: user_id,
    });
  } catch (error) {
    logger.error('Failed to send token notification', {
      error: error.message,
      event,
    });
  }
}

/**
 * Send notification via webhooks
 */
async function sendViaWebhook(userId, notification) {
  try {
    // Find active webhook subscriptions for this event type
    const result = await database.query(
      `SELECT * FROM webhook_subscriptions
       WHERE user_id = $1
         AND status = 'active'
         AND enabled = true
         AND $2 = ANY(events)`,
      [userId, notification.event_type]
    );

    if (!result || result.rowCount === 0) {
      logger.debug('No webhook subscriptions found', {
        userId,
        eventType: notification.event_type,
      });
      return;
    }

    // Queue delivery for each webhook
    const promises = result.rows.map(webhook =>
      queueWebhookDelivery(webhook, notification)
    );

    await Promise.all(promises);

    logger.debug('Webhook notifications queued', {
      count: result.rowCount,
      userId,
      eventType: notification.event_type,
    });
  } catch (error) {
    logger.error('Failed to send webhook notification', {
      error: error.message,
      userId,
    });
  }
}

/**
 * Send notification via WebSocket
 */
async function sendViaWebSocket(userId, notification) {
  try {
    // Publish to Redis channel for Socket.io to pick up
    const channel = `user:${userId}:notifications`;

    await redis.client.publish(
      channel,
      JSON.stringify(notification)
    );

    logger.debug('WebSocket notification published', {
      userId,
      channel,
      eventType: notification.event_type,
    });
  } catch (error) {
    logger.error('Failed to send WebSocket notification', {
      error: error.message,
      userId,
    });
  }
}

/**
 * Send notification via Redis Pub/Sub
 */
async function sendViaRedisPubSub(userId, notification) {
  try {
    const channel = `notifications:${notification.event_type}`;

    await redis.client.publish(
      channel,
      JSON.stringify({
        user_id: userId,
        ...notification,
      })
    );

    logger.debug('Redis Pub/Sub notification published', {
      userId,
      channel,
      eventType: notification.event_type,
    });
  } catch (error) {
    logger.error('Failed to send Redis Pub/Sub notification', {
      error: error.message,
      userId,
    });
  }
}

/**
 * Notify on token creation
 */
async function notifyTokenCreated(token, handle, userId) {
  await sendTokenNotification({
    type: EVENT_TYPES.TOKEN_CREATED,
    token_id: token.id,
    token_handle: handle,
    user_id: userId,
    data: {
      type: token.type,
      subject: token.subject,
      expiry_type: token.expiry_type,
      expires_at: token.expires_at,
      uses_total: token.uses_total,
    },
  });
}

/**
 * Notify on token use
 */
async function notifyTokenUsed(token, userId) {
  await sendTokenNotification({
    type: EVENT_TYPES.TOKEN_USED,
    token_id: token.id,
    user_id: userId || token.created_by,
    data: {
      uses_remaining: token.uses_remaining,
      use_count: token.use_count,
      status: token.status,
    },
  });

  // Check if token is low on uses (< 20% remaining)
  if (token.uses_total && token.uses_remaining !== null) {
    const percentRemaining = (token.uses_remaining / token.uses_total) * 100;

    if (percentRemaining <= 20 && percentRemaining > 0) {
      await notifyTokenLowUses(token, userId || token.created_by);
    }
  }
}

/**
 * Notify on token expiration
 */
async function notifyTokenExpired(token, userId) {
  await sendTokenNotification({
    type: EVENT_TYPES.TOKEN_EXPIRED,
    token_id: token.id,
    user_id: userId || token.created_by,
    data: {
      expired_at: token.expires_at,
    },
  });
}

/**
 * Notify on token revocation
 */
async function notifyTokenRevoked(token, reason, userId) {
  await sendTokenNotification({
    type: EVENT_TYPES.TOKEN_REVOKED,
    token_id: token.id,
    user_id: userId || token.created_by,
    data: {
      reason,
      revoked_at: token.revoked_at,
      revoked_by: token.revoked_by,
    },
  });
}

/**
 * Notify on token exhausted (all uses consumed)
 */
async function notifyTokenExhausted(token, userId) {
  await sendTokenNotification({
    type: EVENT_TYPES.TOKEN_EXHAUSTED,
    token_id: token.id,
    user_id: userId || token.created_by,
    data: {
      total_uses: token.uses_total,
      final_use_count: token.use_count,
    },
  });
}

/**
 * Notify on token refresh
 */
async function notifyTokenRefreshed(oldToken, newToken, newHandle, userId) {
  await sendTokenNotification({
    type: EVENT_TYPES.TOKEN_REFRESHED,
    token_id: newToken.id,
    token_handle: newHandle,
    user_id: userId,
    data: {
      old_token_id: oldToken.id,
      new_handle: newHandle,
      type: newToken.type,
      expires_at: newToken.expires_at,
    },
  });
}

/**
 * Notify when token is nearing expiry
 */
async function notifyTokenNearExpiry(token, userId) {
  await sendTokenNotification({
    type: EVENT_TYPES.TOKEN_NEAR_EXPIRY,
    token_id: token.id,
    user_id: userId || token.created_by,
    data: {
      expires_at: token.expires_at,
      expires_in_seconds: token.expires_at - Math.floor(Date.now() / 1000),
    },
  });
}

/**
 * Notify when token is low on uses
 */
async function notifyTokenLowUses(token, userId) {
  await sendTokenNotification({
    type: EVENT_TYPES.TOKEN_LOW_USES,
    token_id: token.id,
    user_id: userId || token.created_by,
    data: {
      uses_remaining: token.uses_remaining,
      uses_total: token.uses_total,
      percentage_remaining: Math.floor((token.uses_remaining / token.uses_total) * 100),
    },
  });
}

/**
 * Notify on quota warning
 */
async function notifyTokenQuotaWarning(token, quotaType, percentRemaining, userId) {
  await sendTokenNotification({
    type: EVENT_TYPES.TOKEN_QUOTA_WARNING,
    token_id: token.id,
    user_id: userId || token.created_by,
    data: {
      quota_type: quotaType,
      percent_remaining: percentRemaining,
      quotas: token.quotas,
    },
  });
}

/**
 * Check and send expiry warnings for tokens
 * This should be run periodically (e.g., every hour)
 */
async function checkExpiryWarnings() {
  try {
    const now = Math.floor(Date.now() / 1000);
    const warningThreshold = now + (24 * 60 * 60); // 24 hours from now

    // Find tokens expiring within 24 hours
    const result = await database.query(
      `SELECT t.*, u.id as user_id
       FROM tokens t
       JOIN users u ON t.created_by = u.id
       WHERE t.status = 'active'
         AND t.expires_at IS NOT NULL
         AND t.expires_at > $1
         AND t.expires_at <= $2`,
      [now, warningThreshold]
    );

    if (!result || result.rowCount === 0) {
      logger.debug('No tokens nearing expiry');
      return;
    }

    // Send warnings
    const promises = result.rows.map(token =>
      notifyTokenNearExpiry(token, token.user_id)
    );

    await Promise.all(promises);

    logger.info('Expiry warnings sent', {
      count: result.rowCount,
    });
  } catch (error) {
    logger.error('Failed to check expiry warnings', {
      error: error.message,
    });
  }
}

/**
 * Subscribe to token notifications (for clients)
 */
async function subscribeToTokenNotifications(userId, callback) {
  try {
    const subscriber = redis.client.duplicate();

    await subscriber.connect();

    const channel = `user:${userId}:notifications`;

    await subscriber.subscribe(channel, (message) => {
      try {
        const notification = JSON.parse(message);
        callback(notification);
      } catch (error) {
        logger.error('Failed to parse notification', {
          error: error.message,
          message,
        });
      }
    });

    logger.info('Subscribed to token notifications', {
      userId,
      channel,
    });

    return subscriber;
  } catch (error) {
    logger.error('Failed to subscribe to token notifications', {
      error: error.message,
      userId,
    });
    throw error;
  }
}

/**
 * Unsubscribe from token notifications
 */
async function unsubscribeFromTokenNotifications(subscriber, userId) {
  try {
    const channel = `user:${userId}:notifications`;

    await subscriber.unsubscribe(channel);
    await subscriber.quit();

    logger.info('Unsubscribed from token notifications', {
      userId,
      channel,
    });
  } catch (error) {
    logger.error('Failed to unsubscribe from token notifications', {
      error: error.message,
      userId,
    });
  }
}

module.exports = {
  EVENT_TYPES,
  CHANNELS,
  sendTokenNotification,
  notifyTokenCreated,
  notifyTokenUsed,
  notifyTokenExpired,
  notifyTokenRevoked,
  notifyTokenExhausted,
  notifyTokenRefreshed,
  notifyTokenNearExpiry,
  notifyTokenLowUses,
  notifyTokenQuotaWarning,
  checkExpiryWarnings,
  subscribeToTokenNotifications,
  unsubscribeFromTokenNotifications,
};
