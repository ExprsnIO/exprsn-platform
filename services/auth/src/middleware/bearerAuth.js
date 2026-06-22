/**
 * ═══════════════════════════════════════════════════════════
 * Bearer → session-identity bridge
 * ═══════════════════════════════════════════════════════════
 *
 * The auth module's APIs authenticate via Passport sessions (req.user /
 * req.isAuthenticated()). The single-origin SPA, however, holds only a CA
 * bearer token (minted at login by tokenService.generateToken) and never
 * establishes a browser session — so every /auth/api/* admin call (roles,
 * permission catalog, …) returned 401 and tripped the SPA's global logout.
 *
 * This middleware resolves a valid bearer into the same identity a session
 * would carry: it validates the token in-process via the CA token service,
 * loads the corresponding auth user, and populates req.user +
 * req.isAuthenticated() so the existing requireAuth/RBAC stack works unchanged.
 * It NEVER rejects — an absent/invalid bearer just falls through to the normal
 * (session) auth, which decides 401/403.
 */

const { createLogger } = require('@exprsn/shared');
const { isPlatformAdmin } = require('@exprsn/shared/utils/platformAdmin');
const caTokenService = require('../../../ca/services/token');
const { User } = require('../models');

const logger = createLogger('exprsn-auth:bearer');

async function resolveBearerIdentity(req, res, next) {
  try {
    // A real Passport session always wins; don't second-guess it.
    if (req.isAuthenticated && req.isAuthenticated()) return next();

    const match = (req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
    if (!match) return next();

    const bearerTokenId = match[1].trim();
    const result = await caTokenService.validateToken(bearerTokenId, {});
    if (!result || !result.valid) return next();

    // The token's data carries the auth user id/email (see tokenService.generateToken).
    const userId = (result.tokenData && result.tokenData.userId) || result.userId;
    if (!userId) return next();

    const user = await User.findByPk(userId);
    if (!user) return next();

    req.user = user;
    req.authVia = 'bearer';
    // The presented bearer IS the CA token id — expose it so session routes can
    // identify the caller's own (current) session when there's no cookie.
    req.bearerTokenId = bearerTokenId;
    req.isPlatformAdmin = isPlatformAdmin(user.email);
    // Satisfy Passport-style checks downstream (requireAuth, etc.).
    req.isAuthenticated = () => true;
  } catch (error) {
    if (logger && logger.warn) {
      logger.warn('Bearer identity resolution failed', { error: error.message });
    }
  }
  next();
}

module.exports = { resolveBearerIdentity };
