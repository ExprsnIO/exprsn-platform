/**
 * ═══════════════════════════════════════════════════════════════════════
 * Session Configuration Module
 * ═══════════════════════════════════════════════════════════════════════
 */

const crypto = require('crypto');

/**
 * Known placeholder secrets that must never be used as a session secret
 */
const PLACEHOLDER_SECRETS = [
  'exprsn-ca-secret-change-me',
  'change-me',
  'changeme',
  'secret',
  'session-secret'
];

/**
 * Resolve the session secret.
 * - production: SESSION_SECRET must be set and not a known placeholder
 * - development/test: missing/placeholder secret is replaced with an
 *   ephemeral random secret (sessions won't survive restarts) + warning
 * @returns {string}
 */
function resolveSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';
  const isMissingOrPlaceholder = !secret || PLACEHOLDER_SECRETS.includes(secret.toLowerCase());

  if (isMissingOrPlaceholder) {
    if (isProduction) {
      throw new Error(
        'SESSION_SECRET must be set to a strong, unique value in production. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
      );
    }

    // eslint-disable-next-line no-console
    console.warn(
      '[ca:session] SESSION_SECRET is unset or a known placeholder - ' +
      'using an ephemeral random secret (development only; sessions reset on restart)'
    );
    return crypto.randomBytes(48).toString('hex');
  }

  return secret;
}

/**
 * Express session configuration
 * Used for web interface session management
 */
module.exports = {
  /**
   * Session secret for signing session IDs
   * @type {string}
   */
  secret: resolveSessionSecret(),

  /**
   * Session cookie maximum age (milliseconds)
   * @type {number} - Default: 86400000ms (24 hours)
   */
  maxAge: parseInt(process.env.SESSION_MAX_AGE, 10) || 86400000,

  /**
   * Enable secure cookies (HTTPS only)
   * Always enforced in production
   * @type {boolean}
   */
  secure: process.env.NODE_ENV === 'production'
    ? true
    : process.env.SESSION_SECURE === 'true',

  /**
   * HttpOnly cookie attribute (no JS access to the session cookie)
   * @type {boolean}
   */
  httpOnly: true,

  /**
   * SameSite cookie attribute
   * @type {string} - 'strict', 'lax', or 'none'
   */
  sameSite: process.env.SESSION_SAME_SITE || 'lax'
};
