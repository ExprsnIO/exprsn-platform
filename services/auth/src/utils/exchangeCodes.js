/**
 * ═══════════════════════════════════════════════════════════
 * One-time exchange codes
 *
 * Short-lived (60s), single-use codes that map to an issued auth token.
 * Used so OAuth/SAML browser callbacks never put the real token in a
 * redirect URL (referrer/history/log leakage) - the frontend swaps the
 * code for the token via POST /api/auth/exchange.
 *
 * In-memory Map with TTL cleanup. Codes are keyed by sha256(code) so the
 * raw code never sits in memory as a lookup key and Map lookups are not
 * attacker-observable for timing. NOTE: per-process only - if the auth
 * service runs multi-process behind the gateway, sticky routing for the
 * callback->exchange pair (or a Redis-backed store) is required.
 * ═══════════════════════════════════════════════════════════
 */

const crypto = require('crypto');

const TTL_MS = 60 * 1000; // 60 seconds
const CLEANUP_INTERVAL_MS = 30 * 1000;

// sha256(code) hex -> { token, expiresAt }
const store = new Map();

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

/**
 * Create a one-time exchange code for a token.
 * @param {string} token - the auth token to hand out on exchange
 * @returns {string} the one-time code (base64url, 256 bits)
 */
function createExchangeCode(token) {
  const code = crypto.randomBytes(32).toString('base64url');
  store.set(hashCode(code), {
    token,
    expiresAt: Date.now() + TTL_MS
  });
  return code;
}

/**
 * Consume a one-time exchange code (single use - always deleted).
 * @param {string} code
 * @returns {string|null} the token, or null if invalid/expired/used
 */
function consumeExchangeCode(code) {
  if (!code || typeof code !== 'string') {
    return null;
  }

  const key = hashCode(code);
  const entry = store.get(key);

  // Single use: delete unconditionally before validity checks
  store.delete(key);

  if (!entry || entry.expiresAt < Date.now()) {
    return null;
  }

  return entry.token;
}

// Periodic TTL cleanup; unref so it never holds the process open
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt < now) {
      store.delete(key);
    }
  }
}, CLEANUP_INTERVAL_MS);

if (typeof cleanupTimer.unref === 'function') {
  cleanupTimer.unref();
}

module.exports = {
  createExchangeCode,
  consumeExchangeCode
};
