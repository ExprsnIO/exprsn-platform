/**
 * ═══════════════════════════════════════════════════════════
 * Session Service
 * Persists a Session row on every login path (SP-6 / STATUS #9).
 *
 * A row captures who/where/when plus the CA token id (jti) minted for the
 * session — that token id IS the bearer the SPA presents, so the row can later
 * be revoked at the CA (see routes/sessions.js DELETE handlers).
 * ═══════════════════════════════════════════════════════════
 */

const { logger } = require('@exprsn/shared');
const config = require('../config');
const { Session } = require('../models');

/**
 * Record (upsert) a Session row for a successful login.
 *
 * @param {import('express').Request} req - the request (for ip / user-agent / session id)
 * @param {Object} user - the authenticated auth user (must have `id`)
 * @param {string} caTokenId - the CA token id minted by tokenService.generateToken
 * @returns {Promise<Object|null>} the Session instance, or null on failure
 */
async function recordSession(req, user, caTokenId) {
  // Prefer the passport cookie session id; fall back to the CA token id for
  // register / bearer-only callers (no persisted cookie) so the NOT NULL +
  // unique `sessionId` constraint holds and "current session" detection still
  // works for bearer callers (they match on caTokenId).
  const sessionId = (req && req.session && req.sessionID) ? req.sessionID : caTokenId;

  if (!sessionId) {
    // Nothing stable to key on — skip rather than violate the NOT NULL constraint.
    logger.warn('recordSession skipped: no sessionId or caTokenId', { userId: user && user.id });
    return null;
  }

  const values = {
    sessionId,
    userId: user.id,
    caTokenId: caTokenId || null,
    ipAddress: req && req.ip,
    userAgent: req && typeof req.get === 'function' ? req.get('user-agent') : undefined,
    expiresAt: new Date(Date.now() + config.session.lifetime),
    lastActivityAt: new Date(),
    active: true
  };

  // Upsert by sessionId: a re-mint (POST /api/auth/token) on the same passport
  // session updates the row's caTokenId in place instead of spawning duplicates.
  const [session] = await Session.findOrCreate({
    where: { sessionId },
    defaults: values
  });

  // findOrCreate does not update an existing row — refresh the mutable fields.
  session.caTokenId = values.caTokenId;
  session.ipAddress = values.ipAddress;
  session.userAgent = values.userAgent;
  session.expiresAt = values.expiresAt;
  session.lastActivityAt = values.lastActivityAt;
  session.active = true;
  await session.save();

  return session;
}

module.exports = { recordSession };
