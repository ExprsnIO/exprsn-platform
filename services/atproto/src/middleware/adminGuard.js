/**
 * ═══════════════════════════════════════════════════════════
 * adminGuard — authorize operator mutations
 *
 * Allows EITHER:
 *   - the admin service token (server-to-server: X-Service-Token == SERVICE_TOKEN_SECRET), OR
 *   - a valid CA bearer whose token email is a platform admin
 *     (PLATFORM_ADMIN_EMAILS — the same source of truth as the moderator's admin
 *     socket + CA admin routes).
 *
 * This lets admin-console operators trigger actions from the browser (their CA
 * bearer is sent by lib/http) while keeping the headless service path working.
 * @exprsn/shared is lazy-loaded so importing this module doesn't require the CA
 * validator to be configured (e.g. in unit tests).
 * ═══════════════════════════════════════════════════════════
 */

const crypto = require('crypto');

let _validateCA = null;
let _isPlatformAdmin = null;

function validateCA() {
  if (!_validateCA) _validateCA = require('@exprsn/shared').validateCAToken({});
  return _validateCA;
}
function isPlatformAdmin(email) {
  if (!_isPlatformAdmin) _isPlatformAdmin = require('@exprsn/shared/utils/platformAdmin').isPlatformAdmin;
  return _isPlatformAdmin(email);
}

function timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function adminGuard(req, res, next) {
  const adminSecret = process.env.SERVICE_TOKEN_SECRET;
  if (adminSecret && timingSafeEqual(req.get('x-service-token'), adminSecret)) return next();

  // validateCAToken responds 401 itself on a missing/invalid token.
  return validateCA()(req, res, () => {
    const email = req.tokenData && req.tokenData.email;
    if (isPlatformAdmin(email)) return next();
    return res.status(403).json({ error: 'forbidden', message: 'platform admin or service token required' });
  });
}

module.exports = { adminGuard };
