'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Error tracking (SP-5 / R3) — optional Sentry integration
 *
 * Activates ONLY when `SENTRY_DSN` is set AND `@sentry/node` is installed, so the
 * platform runs unchanged without either (no forced dependency, no account
 * required for local/in-house use). The gateway's central error handler calls
 * `captureException(err, { correlationId, ... })`, tying tracked errors to the
 * correlation id already returned to the client.
 *
 * To enable: `npm install @sentry/node` and set `SENTRY_DSN` (+ optional
 * `SENTRY_TRACES_SAMPLE_RATE`).
 * ═══════════════════════════════════════════════════════════
 */

let sentry = null;
let initialized = false;

function initErrorTracking(config, logger) {
  if (initialized) return false;
  initialized = true;

  const dsn = config && config.sentry && config.sentry.dsn;
  if (!dsn) {
    if (logger && logger.info) logger.info('Error tracking: disabled (no SENTRY_DSN)');
    return false;
  }

  try {
    // Lazy require so the dependency is genuinely optional.
    // eslint-disable-next-line global-require
    sentry = require('@sentry/node');
    sentry.init({
      dsn,
      environment: (config && config.env) || process.env.NODE_ENV || 'development',
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
    });
    if (logger && logger.info) logger.info('Error tracking: Sentry initialized');
    return true;
  } catch (err) {
    sentry = null;
    if (logger && logger.warn) {
      logger.warn(`Error tracking: SENTRY_DSN set but @sentry/node unavailable (${err.message})`);
    }
    return false;
  }
}

/** Report an exception with request context. No-op when tracking is disabled. */
function captureException(err, context) {
  if (!sentry) return;
  try {
    sentry.withScope((scope) => {
      if (context) {
        scope.setContext('request', context);
        if (context.correlationId) scope.setTag('correlationId', context.correlationId);
      }
      sentry.captureException(err);
    });
  } catch (_) {
    // Telemetry must never break the request path.
  }
}

function isEnabled() {
  return Boolean(sentry);
}

module.exports = { initErrorTracking, captureException, isEnabled };
