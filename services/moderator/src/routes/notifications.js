/**
 * ═══════════════════════════════════════════════════════════
 * Notification Ingest Routes
 * Service-to-service entry point that bridges inbound notification
 * requests (e.g. from the timeline module's Herald client) onto the
 * moderator module's existing `/notifications` Socket.IO namespace.
 * ═══════════════════════════════════════════════════════════
 *
 * In the consolidated platform there is no standalone "Herald" service, so
 * timeline points HERALD_SERVICE_URL at /moderator and POSTs here. The caller
 * authenticates with the per-service HMAC token (X-Service-ID / X-Service-Token,
 * derived from SERVICE_TOKEN_SECRET); see shared/utils/serviceToken.js.
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { logger } = require('@exprsn/shared');
const { verifyServiceToken } = require('@exprsn/shared/utils/serviceToken');

/**
 * Require a valid per-service HMAC token. Rejects with 401 otherwise.
 */
function requireServiceToken(req, res, next) {
  const serviceId = req.get('X-Service-ID');
  const token = req.get('X-Service-Token');

  if (!verifyServiceToken(serviceId, token)) {
    logger.warn('Rejected notification ingest: invalid service token', { serviceId });
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Valid X-Service-ID / X-Service-Token required'
    });
  }

  req.callerServiceId = serviceId;
  next();
}

/**
 * POST /api/notifications
 * Body: { userId, type, channel, title, body, data, priority }
 * Emits `notification` to the `/notifications` namespace room `user:{userId}`.
 * Mirrors the response shape the timeline Herald client reads
 * (`response.data.notification.{id,channel,status}`).
 */
router.post('/', requireServiceToken, (req, res) => {
  const { userId, type = 'info', channel = 'in-app', title, body, data = {}, priority = 'normal' } = req.body || {};

  if (!userId) {
    return res.status(400).json({ error: 'BAD_REQUEST', message: 'userId is required' });
  }

  const notification = {
    id: crypto.randomUUID(),
    userId,
    type,
    channel,
    title,
    body,
    data,
    priority,
    createdAt: new Date().toISOString()
  };

  // The namespace is published onto the app by registerSockets() in src/index.js.
  const notificationsNs = req.app.get('notificationsNs');
  let status = 'queued';

  if (notificationsNs) {
    notificationsNs.to(`user:${userId}`).emit('notification', notification);
    status = 'delivered';
  } else {
    logger.warn('notifications namespace not registered; notification not delivered in real time', { userId });
  }

  logger.info('Notification ingested', { from: req.callerServiceId, userId, type, status });

  res.status(201).json({
    success: true,
    notification: { id: notification.id, channel: notification.channel, status }
  });
});

module.exports = router;
