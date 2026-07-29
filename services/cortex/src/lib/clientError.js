'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * One place that decides what an error looks like to a client (BUG-068).
 *
 * The module's Express error handler has always redacted 5xx detail in
 * production. FEAT-090's streaming transports never reach it — the SSE route
 * catches its own failures and writes an `error` event, and the socket
 * namespace emits `chat:error` — so both echoed `err.message` verbatim
 * regardless of NODE_ENV. In production that meant the buffered route said
 * "An error occurred" while the streamed twin of the SAME call disclosed the
 * upstream LLM router's response body to any authenticated `write` principal.
 *
 * The fix is not "add an env check in two more places" — that is the shape that
 * produced the divergence. All three paths now build their payload here, so a
 * change to the redaction rule cannot apply to one transport and miss another.
 *
 * Streaming failures also never reached the gateway's error handler, so they
 * carried no correlation id. They do now: the full detail is logged server-side
 * against that id, so a redacted client message stays diagnosable.
 * ═══════════════════════════════════════════════════════════
 */

const crypto = require('crypto');
const config = require('../config');

const GENERIC_MESSAGE = 'An error occurred';

/** HTTP-ish status carried by an error, defaulting to 500. */
function statusOf(err) {
  return (err && (err.statusCode || err.status)) || 500;
}

/**
 * Should this error's real message be withheld from the client?
 *
 * Production 5xx only — a 4xx is the caller's own fault and telling them why is
 * the point, and in development the detail is what makes the platform workable.
 * This predicate is the single source of truth for all three transports.
 */
function shouldRedact(err) {
  return config.env === 'production' && statusOf(err) >= 500;
}

/**
 * Build the client-facing payload for `err` and log the full detail.
 *
 * @param {Error} err
 * @param {object} logger        module logger
 * @param {object} [context]     extra fields for the server-side log line only
 * @returns {{error:string, message:string, correlationId:string}}
 */
function toClientError(err, logger, context = {}) {
  const status = statusOf(err);
  const correlationId = crypto.randomUUID();
  if (logger) {
    // Always log the REAL message, whatever the client is told.
    logger.error('Cortex error', {
      ...context, correlationId, status, error: err && err.message,
    });
  }
  return {
    error: (err && (err.errorCode || err.code)) || 'INTERNAL_ERROR',
    message: shouldRedact(err) ? GENERIC_MESSAGE : (err && err.message) || GENERIC_MESSAGE,
    correlationId,
  };
}

module.exports = { toClientError, shouldRedact, statusOf, GENERIC_MESSAGE };
