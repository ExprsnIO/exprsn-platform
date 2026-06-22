/**
 * ═══════════════════════════════════════════════════════════
 * Session Routes
 * Session management endpoints
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const { Op } = require('sequelize');
const { asyncHandler, AppError, logger } = require('@exprsn/shared');
const { requireAuth } = require('../middleware/requireAuth');
const { Session } = require('../models');
const tokenService = require('../services/tokenService');

const router = express.Router();

// All session routes require authentication
router.use(requireAuth);

/**
 * Is this session the caller's CURRENT session?
 * Cookie (passport) callers match by the express session id; bearer-only callers
 * (SPA after reload, no cookie) match by the presented CA token id.
 */
function isCurrentSession(req, session) {
  return (
    (req.sessionID && session.sessionId === req.sessionID) ||
    (req.bearerTokenId && session.caTokenId === req.bearerTokenId)
  );
}

/**
 * Build an OR clause that identifies the caller's current session row by either
 * the cookie session id or the bearer token id (used by GET /current, /refresh).
 */
function currentSessionWhere(req) {
  const or = [];
  if (req.sessionID) or.push({ sessionId: req.sessionID });
  if (req.bearerTokenId) or.push({ caTokenId: req.bearerTokenId });
  // No identifier at all → match nothing (defensive; requireAuth already ran).
  return or.length ? { [Op.or]: or } : { id: null };
}

/**
 * GET /api/sessions
 * Get all active sessions for current user
 */
router.get('/', asyncHandler(async (req, res) => {
  const sessions = await Session.findAll({
    where: {
      userId: req.user.id,
      active: true,
      expiresAt: {
        [Op.gt]: new Date()
      }
    },
    order: [['lastActivityAt', 'DESC']]
  });

  res.json({
    sessions: sessions.map(session => ({
      id: session.id,
      sessionId: session.sessionId,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      lastActivityAt: session.lastActivityAt,
      expiresAt: session.expiresAt,
      isCurrent: isCurrentSession(req, session)
    }))
  });
}));

/**
 * GET /api/sessions/current
 * Get current session details
 */
router.get('/current', asyncHandler(async (req, res) => {
  const session = await Session.findOne({
    where: {
      userId: req.user.id,
      ...currentSessionWhere(req)
    }
  });

  if (!session) {
    throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
  }

  res.json({
    session: {
      id: session.id,
      sessionId: session.sessionId,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      lastActivityAt: session.lastActivityAt,
      expiresAt: session.expiresAt,
      isCurrent: true
    }
  });
}));

/**
 * DELETE /api/sessions/:id
 * Revoke specific session
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const session = await Session.findOne({
    where: {
      id,
      userId: req.user.id
    }
  });

  if (!session) {
    throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
  }

  // Prevent revoking current session via this endpoint
  if (isCurrentSession(req, session)) {
    throw new AppError(
      'Cannot revoke current session. Use logout instead.',
      400,
      'CANNOT_REVOKE_CURRENT_SESSION'
    );
  }

  // Revoke the CA token FIRST. If this throws we deliberately let it propagate
  // (no success response, row stays active) — never report "revoked" while the
  // bearer is still live. Legacy/cookie rows without a caTokenId just deactivate.
  if (session.caTokenId) {
    await tokenService.revokeToken(session.caTokenId, 'Session revoked by user');
  }

  // Mark session as inactive
  session.active = false;
  await session.save();

  logger.info('Session revoked', {
    userId: req.user.id,
    sessionId: session.sessionId,
    caTokenRevoked: Boolean(session.caTokenId)
  });

  res.json({ message: 'Session revoked successfully' });
}));

/**
 * DELETE /api/sessions
 * Revoke all sessions except current
 */
router.delete('/', asyncHandler(async (req, res) => {
  const sessions = await Session.findAll({
    where: {
      userId: req.user.id,
      active: true
    }
  });

  let revokedCount = 0;
  const failed = [];

  for (const session of sessions) {
    // Skip current session
    if (isCurrentSession(req, session)) {
      continue;
    }

    // Bulk revoke is resilient: one bad CA token must not strand the rest.
    // Revoke the CA token (if any) then deactivate; record per-session failures.
    try {
      if (session.caTokenId) {
        await tokenService.revokeToken(session.caTokenId, 'All sessions revoked by user');
      }
      session.active = false;
      await session.save();
      revokedCount++;
    } catch (err) {
      logger.error('Failed to revoke session token', {
        userId: req.user.id,
        sessionId: session.sessionId,
        error: err.message
      });
      failed.push(session.id);
    }
  }

  logger.info('All sessions revoked', {
    userId: req.user.id,
    count: revokedCount,
    failedCount: failed.length
  });

  res.json({
    message: `${revokedCount} session(s) revoked successfully`,
    revokedCount,
    ...(failed.length && { failed, failedCount: failed.length })
  });
}));

/**
 * POST /api/sessions/refresh
 * Refresh current session (extend expiry)
 */
router.post('/refresh', asyncHandler(async (req, res) => {
  const session = await Session.findOne({
    where: {
      userId: req.user.id,
      ...currentSessionWhere(req)
    }
  });

  if (!session) {
    throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
  }

  // Extend session expiry
  const config = require('../config');
  session.expiresAt = new Date(Date.now() + config.session.lifetime);
  session.lastActivityAt = new Date();
  await session.save();

  logger.info('Session refreshed', {
    userId: req.user.id,
    sessionId: session.sessionId
  });

  res.json({
    message: 'Session refreshed successfully',
    expiresAt: session.expiresAt
  });
}));

module.exports = router;
