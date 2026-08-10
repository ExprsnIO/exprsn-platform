/**
 * Webhooks Controller
 * Handles webhook subscription management and delivery tracking
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const database = require('../config/database');
const rabbitmq = require('../config/rabbitmq');
const logger = require('../utils/logger');

/**
 * Create webhook subscription
 */
async function createWebhook(req, res) {
  try {
    const {
      name,
      description,
      url,
      method,
      events,
      headers,
      auth_type,
      auth_config,
      timeout,
      retry_enabled,
      retry_attempts,
      conditions,
    } = req.body;

    // Generate webhook secret for signature
    const secret = crypto.randomBytes(32).toString('hex');

    const result = await database.query(
      `INSERT INTO webhook_subscriptions (
        user_id, name, description, url, method, events,
        headers, auth_type, auth_config, secret,
        timeout, retry_enabled, retry_attempts, conditions
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        req.auth.userId, name, description, url, method || 'POST', events,
        JSON.stringify(headers || {}), auth_type, JSON.stringify(auth_config || {}),
        secret, timeout || 5000, retry_enabled !== false, retry_attempts || 3,
        JSON.stringify(conditions || {}),
      ]
    );

    const webhook = result.rows[0];

    logger.info('Webhook created', {
      webhookId: webhook.id,
      userId: req.auth.userId,
      url,
      events,
      requestId: req.requestId,
    });

    res.status(201).json({
      webhook,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Webhook creation failed', {
      error: error.message,
      stack: error.stack,
      requestId: req.requestId,
    });

    res.status(500).json({
      error: {
        code: 'WEBHOOK_CREATION_FAILED',
        message: error.message,
        requestId: req.requestId,
      },
    });
  }
}

/**
 * List webhook subscriptions
 */
async function listWebhooks(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status;

    let query = 'SELECT * FROM webhook_subscriptions WHERE user_id = $1';
    const params = [req.auth.userId];
    let paramCount = 2;

    if (status) {
      query += ` AND status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await database.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM webhook_subscriptions WHERE user_id = $1';
    const countParams = [req.auth.userId];

    if (status) {
      countQuery += ' AND status = $2';
      countParams.push(status);
    }

    const countResult = await database.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      webhooks: result.rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('List webhooks failed', {
      error: error.message,
      requestId: req.requestId,
    });

    res.status(500).json({
      error: {
        code: 'LIST_WEBHOOKS_FAILED',
        message: 'Failed to list webhooks',
        requestId: req.requestId,
      },
    });
  }
}

/**
 * Get webhook by ID
 */
async function getWebhook(req, res) {
  try {
    const { id } = req.params;

    const result = await database.query(
      'SELECT * FROM webhook_subscriptions WHERE id = $1 AND user_id = $2',
      [id, req.auth.userId]
    );

    if (!result || result.rowCount === 0) {
      return res.status(404).json({
        error: {
          code: 'WEBHOOK_NOT_FOUND',
          message: 'Webhook not found',
          requestId: req.requestId,
        },
      });
    }

    res.json({
      webhook: result.rows[0],
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Get webhook failed', {
      error: error.message,
      webhookId: req.params.id,
      requestId: req.requestId,
    });

    res.status(500).json({
      error: {
        code: 'GET_WEBHOOK_FAILED',
        message: 'Failed to get webhook',
        requestId: req.requestId,
      },
    });
  }
}

/**
 * Update webhook
 */
async function updateWebhook(req, res) {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      url,
      method,
      events,
      headers,
      timeout,
      retry_enabled,
      retry_attempts,
      enabled,
      conditions,
    } = req.body;

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }

    if (description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(description);
    }

    if (url !== undefined) {
      updates.push(`url = $${paramCount++}`);
      values.push(url);
    }

    if (method !== undefined) {
      updates.push(`method = $${paramCount++}`);
      values.push(method);
    }

    if (events !== undefined) {
      updates.push(`events = $${paramCount++}`);
      values.push(events);
    }

    if (headers !== undefined) {
      updates.push(`headers = $${paramCount++}`);
      values.push(JSON.stringify(headers));
    }

    if (timeout !== undefined) {
      updates.push(`timeout = $${paramCount++}`);
      values.push(timeout);
    }

    if (retry_enabled !== undefined) {
      updates.push(`retry_enabled = $${paramCount++}`);
      values.push(retry_enabled);
    }

    if (retry_attempts !== undefined) {
      updates.push(`retry_attempts = $${paramCount++}`);
      values.push(retry_attempts);
    }

    if (enabled !== undefined) {
      updates.push(`enabled = $${paramCount++}`);
      values.push(enabled);
    }

    if (conditions !== undefined) {
      updates.push(`conditions = $${paramCount++}`);
      values.push(JSON.stringify(conditions));
    }

    if (updates.length === 0) {
      return res.status(400).json({
        error: {
          code: 'NO_UPDATES',
          message: 'No fields to update',
          requestId: req.requestId,
        },
      });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id, req.auth.userId);

    const result = await database.query(
      `UPDATE webhook_subscriptions
       SET ${updates.join(', ')}
       WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
       RETURNING *`,
      values
    );

    if (!result || result.rowCount === 0) {
      return res.status(404).json({
        error: {
          code: 'WEBHOOK_NOT_FOUND',
          message: 'Webhook not found',
          requestId: req.requestId,
        },
      });
    }

    logger.info('Webhook updated', {
      webhookId: id,
      userId: req.auth.userId,
      requestId: req.requestId,
    });

    res.json({
      webhook: result.rows[0],
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Webhook update failed', {
      error: error.message,
      webhookId: req.params.id,
      requestId: req.requestId,
    });

    res.status(500).json({
      error: {
        code: 'WEBHOOK_UPDATE_FAILED',
        message: 'Failed to update webhook',
        requestId: req.requestId,
      },
    });
  }
}

/**
 * Delete webhook
 */
async function deleteWebhook(req, res) {
  try {
    const { id } = req.params;

    const result = await database.query(
      'DELETE FROM webhook_subscriptions WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, req.auth.userId]
    );

    if (!result || result.rowCount === 0) {
      return res.status(404).json({
        error: {
          code: 'WEBHOOK_NOT_FOUND',
          message: 'Webhook not found',
          requestId: req.requestId,
        },
      });
    }

    logger.info('Webhook deleted', {
      webhookId: id,
      userId: req.auth.userId,
      requestId: req.requestId,
    });

    res.json({
      message: 'Webhook deleted successfully',
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Webhook deletion failed', {
      error: error.message,
      webhookId: req.params.id,
      requestId: req.requestId,
    });

    res.status(500).json({
      error: {
        code: 'WEBHOOK_DELETE_FAILED',
        message: 'Failed to delete webhook',
        requestId: req.requestId,
      },
    });
  }
}

/**
 * Test webhook (send test event)
 */
async function testWebhook(req, res) {
  try {
    const { id } = req.params;

    // Get webhook
    const result = await database.query(
      'SELECT * FROM webhook_subscriptions WHERE id = $1 AND user_id = $2',
      [id, req.auth.userId]
    );

    if (!result || result.rowCount === 0) {
      return res.status(404).json({
        error: {
          code: 'WEBHOOK_NOT_FOUND',
          message: 'Webhook not found',
          requestId: req.requestId,
        },
      });
    }

    const webhook = result.rows[0];

    // Create test event
    const testEvent = {
      event_type: 'webhook.test',
      event_id: uuidv4(),
      timestamp: new Date().toISOString(),
      data: {
        message: 'This is a test webhook delivery',
        webhook_id: webhook.id,
        webhook_name: webhook.name,
      },
    };

    // Queue webhook delivery
    await queueWebhookDelivery(webhook, testEvent);

    logger.info('Test webhook queued', {
      webhookId: id,
      userId: req.auth.userId,
      requestId: req.requestId,
    });

    res.json({
      message: 'Test webhook queued for delivery',
      event: testEvent,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Test webhook failed', {
      error: error.message,
      webhookId: req.params.id,
      requestId: req.requestId,
    });

    res.status(500).json({
      error: {
        code: 'TEST_WEBHOOK_FAILED',
        message: 'Failed to test webhook',
        requestId: req.requestId,
      },
    });
  }
}

/**
 * Queue webhook delivery
 */
async function queueWebhookDelivery(webhook, event) {
  try {
    // Create delivery record
    const deliveryResult = await database.query(
      `INSERT INTO webhook_deliveries (
        subscription_id, event_type, event_id, event_data,
        request_url, request_method, max_attempts
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        webhook.id,
        event.event_type,
        event.event_id,
        JSON.stringify(event),
        webhook.url,
        webhook.method,
        webhook.retry_attempts,
      ]
    );

    const delivery = deliveryResult.rows[0];

    // Publish to RabbitMQ queue
    await rabbitmq.publish('webhooks', JSON.stringify({
      delivery_id: delivery.id,
      subscription_id: webhook.id,
      event,
    }));

    logger.info('Webhook delivery queued', {
      deliveryId: delivery.id,
      webhookId: webhook.id,
      eventType: event.event_type,
    });

    return delivery;
  } catch (error) {
    logger.error('Failed to queue webhook delivery', {
      error: error.message,
      webhookId: webhook.id,
    });
    throw error;
  }
}

/**
 * Get webhook deliveries
 */
async function getWebhookDeliveries(req, res) {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status;

    // Verify ownership
    const webhookResult = await database.query(
      'SELECT id FROM webhook_subscriptions WHERE id = $1 AND user_id = $2',
      [id, req.auth.userId]
    );

    if (!webhookResult || webhookResult.rowCount === 0) {
      return res.status(404).json({
        error: {
          code: 'WEBHOOK_NOT_FOUND',
          message: 'Webhook not found',
          requestId: req.requestId,
        },
      });
    }

    let query = 'SELECT * FROM webhook_deliveries WHERE subscription_id = $1';
    const params = [id];
    let paramCount = 2;

    if (status) {
      query += ` AND status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    query += ` ORDER BY queued_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await database.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM webhook_deliveries WHERE subscription_id = $1';
    const countParams = [id];

    if (status) {
      countQuery += ' AND status = $2';
      countParams.push(status);
    }

    const countResult = await database.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      deliveries: result.rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Get webhook deliveries failed', {
      error: error.message,
      webhookId: req.params.id,
      requestId: req.requestId,
    });

    res.status(500).json({
      error: {
        code: 'GET_DELIVERIES_FAILED',
        message: 'Failed to get webhook deliveries',
        requestId: req.requestId,
      },
    });
  }
}

/**
 * Get webhook statistics
 */
async function getWebhookStats(req, res) {
  try {
    const { id } = req.params;

    // Verify ownership
    const webhookResult = await database.query(
      'SELECT * FROM webhook_subscriptions WHERE id = $1 AND user_id = $2',
      [id, req.auth.userId]
    );

    if (!webhookResult || webhookResult.rowCount === 0) {
      return res.status(404).json({
        error: {
          code: 'WEBHOOK_NOT_FOUND',
          message: 'Webhook not found',
          requestId: req.requestId,
        },
      });
    }

    const webhook = webhookResult.rows[0];

    // Get delivery statistics
    const statusResult = await database.query(
      `SELECT status, COUNT(*) as count
       FROM webhook_deliveries
       WHERE subscription_id = $1
       GROUP BY status`,
      [id]
    );

    const stats = {
      total_deliveries: webhook.delivery_count,
      successful: webhook.success_count,
      failed: webhook.failure_count,
      last_delivery: webhook.last_delivery_at,
      last_success: webhook.last_success_at,
      last_failure: webhook.last_failure_at,
      by_status: {},
    };

    statusResult.rows.forEach(row => {
      stats.by_status[row.status] = parseInt(row.count);
    });

    res.json({
      stats,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Get webhook stats failed', {
      error: error.message,
      webhookId: req.params.id,
      requestId: req.requestId,
    });

    res.status(500).json({
      error: {
        code: 'GET_STATS_FAILED',
        message: 'Failed to get webhook statistics',
        requestId: req.requestId,
      },
    });
  }
}

module.exports = {
  createWebhook,
  listWebhooks,
  getWebhook,
  updateWebhook,
  deleteWebhook,
  testWebhook,
  getWebhookDeliveries,
  getWebhookStats,
  queueWebhookDelivery,
};
