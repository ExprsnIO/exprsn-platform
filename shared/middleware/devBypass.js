/**
 * ═══════════════════════════════════════════════════════════════════════
 * Development Mode Bypass Middleware
 *
 * Bypass is FAIL-CLOSED. It is only honored when ALL of the following hold:
 * - NODE_ENV === 'development' (explicitly)
 * - DEV_BYPASS === 'true' (explicit opt-in)
 * - DEV_BYPASS_SECRET is set (>= 32 chars) and the request presents a
 *   matching x-dev-bypass-secret header (constant-time comparison)
 * - The request originates from loopback (127.0.0.1 / ::1)
 *
 * Every bypass use is logged at warn level.
 * ═══════════════════════════════════════════════════════════════════════
 */

const crypto = require('crypto');
const logger = require('../utils/logger');

const LOOPBACK_IPS = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

/**
 * Constant-time string comparison
 */
function secretsMatch(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') {
    return false;
  }

  const providedBuf = Buffer.from(provided, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');

  if (providedBuf.length !== expectedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

/**
 * Check whether bypass is even configured/eligible (environment-level checks)
 */
function bypassConfigured() {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const bypassEnabled = process.env.DEV_BYPASS === 'true';
  const secret = process.env.DEV_BYPASS_SECRET;
  const secretValid = typeof secret === 'string' && secret.length >= 32;

  return isDevelopment && bypassEnabled && secretValid;
}

/**
 * Check if request should bypass authentication (fail closed)
 */
function shouldBypass(req) {
  if (!bypassConfigured()) {
    return false;
  }

  // Must originate from loopback
  if (!LOOPBACK_IPS.includes(req.ip)) {
    return false;
  }

  // Must present the matching bypass secret header
  const providedSecret = req.headers['x-dev-bypass-secret'];
  if (!secretsMatch(providedSecret, process.env.DEV_BYPASS_SECRET)) {
    return false;
  }

  return true;
}

/**
 * Development bypass middleware for CA validation
 */
function bypassCA(req, res, next) {
  if (shouldBypass(req)) {
    logger.warn('CA validation BYPASSED (development mode)', {
      path: req.path,
      method: req.method,
      ip: req.ip
    });

    // Inject mock CA token data
    req.caToken = {
      id: 'dev-bypass-token',
      version: '1.0',
      permissions: { read: true, write: true, append: true, delete: true, update: true },
      resource: { type: 'url', value: '*' },
      bypass: true,
      development: true
    };

    return next();
  }

  // Continue to normal CA validation
  return next();
}

/**
 * Development bypass middleware for Auth
 */
function bypassAuth(req, res, next) {
  if (shouldBypass(req)) {
    logger.warn('Auth validation BYPASSED (development mode)', {
      path: req.path,
      method: req.method,
      ip: req.ip
    });

    // Inject mock user data
    req.user = {
      id: 'dev-bypass-user',
      username: 'developer',
      email: 'dev@localhost',
      roles: ['admin', 'developer'],
      bypass: true,
      development: true
    };

    req.isAuthenticated = () => true;

    return next();
  }

  // Continue to normal auth validation
  return next();
}

/**
 * Combined bypass middleware
 */
function bypassAll(req, res, next) {
  if (shouldBypass(req)) {
    bypassCA(req, res, () => {
      bypassAuth(req, res, next);
    });
  } else {
    next();
  }
}

/**
 * Log bypass status on startup
 */
function logBypassStatus() {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const bypassRequested = process.env.DEV_BYPASS === 'true';

  if (bypassConfigured()) {
    logger.warn('⚠️  DEVELOPMENT MODE: CA/Auth bypass ENABLED', {
      environment: process.env.NODE_ENV,
      bypassCA: true,
      bypassAuth: true,
      requirements: 'loopback origin + x-dev-bypass-secret header required per request',
      disable: 'Unset DEV_BYPASS or set DEV_BYPASS=false to disable'
    });
  } else if (isDevelopment && bypassRequested) {
    logger.warn('Development mode: CA/Auth bypass requested but NOT enabled', {
      environment: process.env.NODE_ENV,
      reason: 'DEV_BYPASS_SECRET must be set and at least 32 characters'
    });
  } else if (isDevelopment) {
    logger.info('Development mode: CA/Auth bypass DISABLED', {
      environment: process.env.NODE_ENV,
      enable: 'Set DEV_BYPASS=true and a DEV_BYPASS_SECRET (>= 32 chars) to enable'
    });
  }
}

module.exports = {
  bypassCA,
  bypassAuth,
  bypassAll,
  shouldBypass,
  logBypassStatus
};
