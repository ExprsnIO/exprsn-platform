/**
 * ═══════════════════════════════════════════════════════════
 * Notification Routes
 * ═══════════════════════════════════════════════════════════
 *
 * Two audiences:
 *  - Service ingest (`POST /`, per-service HMAC token): other modules push a
 *    notification for a user; we persist it (Redis) and emit it live onto the
 *    `/notifications` socket room `user:{userId}`.
 *  - The recipient (CA bearer): list / unread-count / mark-read / clear their
 *    own persisted notifications, so the bell + history survive reloads.
 *
 * In the consolidated platform there is no standalone "Herald" service, so
 * timeline/spark/etc. point HERALD_SERVICE_URL at /moderator and POST here.
 */

const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const router = express.Router();
const { logger } = require('@exprsn/shared');
const { verifyServiceToken, deriveServiceToken } = require('@exprsn/shared/utils/serviceToken');
const { getInternalHttpsAgent } = require('@exprsn/shared/utils/httpAgent');
const store = require('../notificationsStore');

const CA_URL = process.env.CA_URL || process.env.CA_BASE_URL || 'http://localhost:3000';

/** Identity-bound service headers so the CA validate endpoint accepts the call. */
function serviceHeaders() {
  const serviceId = process.env.SERVICE_ID || process.env.SERVICE_NAME;
  if (!serviceId) return {};
  try {
    return { 'X-Service-ID': serviceId, 'X-Service-Token': deriveServiceToken(serviceId) };
  } catch (_) {
    return {};
  }
}

/** Require a valid per-service HMAC token (service-to-service ingest). */
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
 * Require a valid CA bearer; binds req.userId to the recipient from the validated
 * token (never client-supplied). Validates against the in-process CA exactly like
 * the /notifications socket handshake does, so the same UUID bearer works here.
 */
async function requireUser(req, res, next) {
  try {
    const auth = req.get('authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return res.status(401).json({ error: 'MISSING_TOKEN', message: 'Authentication required' });
    }
    const { data } = await axios.post(
      `${CA_URL}/api/tokens/validate`,
      { token, requiredPermissions: { read: true } },
      { timeout: 5000, headers: serviceHeaders(), httpsAgent: getInternalHttpsAgent() }
    );
    if (!data.valid || !data.userId) {
      return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Token is not valid' });
    }
    req.userId = data.userId;
    next();
  } catch (error) {
    logger.warn('Notification auth error', { error: error.message });
    return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Token validation failed' });
  }
}

/**
 * POST /api/notifications  (service ingest)
 * Body: { userId, type, channel, title, body, data, priority }
 * Persists, then emits `notification` to `/notifications` room `user:{userId}`.
 */
router.post('/', requireServiceToken, async (req, res) => {
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
    read: false,
    createdAt: new Date().toISOString()
  };

  // Persist first (best-effort) so a reload still shows it even if the user is
  // offline right now; then emit live to any connected sockets.
  try {
    await store.persist(notification);
  } catch (err) {
    logger.warn('Failed to persist notification', { userId, error: err.message });
  }

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

/** GET /api/notifications?limit= — the caller's persisted notifications. */
router.get('/', requireUser, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);
  try {
    const { notifications, unreadCount } = await store.list(req.userId, { limit });
    res.json({ success: true, notifications, unreadCount });
  } catch (error) {
    logger.error('Failed to list notifications', { userId: req.userId, error: error.message });
    res.status(500).json({ error: 'LIST_FAILED', message: 'Could not load notifications' });
  }
});

/** GET /api/notifications/unread-count — the caller's unread total. */
router.get('/unread-count', requireUser, async (req, res) => {
  try {
    const count = await store.unreadCount(req.userId);
    res.json({ success: true, count });
  } catch (error) {
    res.status(500).json({ error: 'COUNT_FAILED', message: 'Could not count notifications' });
  }
});

/** POST /api/notifications/read-all — mark all the caller's notifications read. */
router.post('/read-all', requireUser, async (req, res) => {
  try {
    const changed = await store.markAllRead(req.userId);
    res.json({ success: true, changed });
  } catch (error) {
    res.status(500).json({ error: 'MARK_FAILED', message: 'Could not mark notifications read' });
  }
});

/** POST /api/notifications/:id/read — mark one read. */
router.post('/:id/read', requireUser, async (req, res) => {
  try {
    const ok = await store.setRead(req.userId, req.params.id, true);
    if (!ok) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'MARK_FAILED' });
  }
});

/** DELETE /api/notifications/:id — dismiss one. */
router.delete('/:id', requireUser, async (req, res) => {
  try {
    await store.remove(req.userId, req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'DELETE_FAILED' });
  }
});

/** DELETE /api/notifications — clear all the caller's notifications. */
router.delete('/', requireUser, async (req, res) => {
  try {
    await store.clear(req.userId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'CLEAR_FAILED' });
  }
});

module.exports = router;
