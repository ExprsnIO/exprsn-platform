'use strict';

/**
 * Backend error taxonomy (FEAT-072, ADR 0005 §3).
 *
 * The registry classifies every driver throw into exactly one bucket, and the
 * bucket — NOT the message — decides failover + breaker behaviour:
 *
 *   AVAILABILITY  → fail over to the next backend, count toward the breaker.
 *                   (transport error, 5xx, health false, model absent, residency
 *                    timeout, empty completion body)
 *   USER_FAULT    → terminal, never retry, never fail over, never trip breaker.
 *                   (UNSUPPORTED_IMAGE / UNSUPPORTED_VIDEO — the user's bytes)
 *   everything else (model-quality: unparseable verdict; programming/operator
 *   state) is NOT thrown by a driver — it is raised above the registry — so the
 *   registry treats an UNRECOGNISED code conservatively as availability only if
 *   the driver marked it so; unknown codes bubble up unclassified.
 *
 * A driver signals "I am unavailable" by throwing BackendUnavailableError (or
 * anything the registry maps to it via `isAvailabilityError`). A user-fault is
 * signalled with code UNSUPPORTED_IMAGE / UNSUPPORTED_VIDEO (raised by the image
 * normalizer, re-thrown unchanged by drivers).
 */

class BackendUnavailableError extends Error {
  constructor(message, { backend, cause } = {}) {
    super(message);
    this.name = 'BackendUnavailableError';
    this.code = 'LLM_UNAVAILABLE';
    this.statusCode = 503;
    this.backend = backend || null;
    if (cause) this.cause = cause;
  }
}

// A CONFIG-shaped vision failure: the model exists and the backend is reachable,
// but it does not accept image input (no vision model set, or a VL model with no
// projector reporting text-only). Distinct from a transport outage so the façade
// can tell "operator still wiring it up" from "router is down" — but it is still
// an availability class for FAILOVER purposes (try the next backend).
class VisionUnavailableError extends Error {
  constructor(message, { backend } = {}) {
    super(message);
    this.name = 'CortexVisionUnavailableError';
    this.code = 'VISION_UNAVAILABLE';
    this.statusCode = 503;
    this.backend = backend || null;
  }
}

// Codes that mean "the user's bytes are the problem" — terminal, never a
// backend fault. Kept in one place so both drivers and the video pipeline agree.
const USER_FAULT_CODES = new Set(['UNSUPPORTED_IMAGE', 'UNSUPPORTED_VIDEO']);

function isUserFault(err) {
  return Boolean(err && USER_FAULT_CODES.has(err.code));
}

// An availability failure = a BackendUnavailableError, or the AppError/transport
// shapes lib/llama.js already emits (503 / LLM_UNAVAILABLE / VISION_UNAVAILABLE).
// A user-fault is explicitly excluded so a 415 can never be read as an outage.
function isAvailabilityError(err) {
  if (!err) return false;
  if (isUserFault(err)) return false;
  if (err instanceof BackendUnavailableError) return true;
  return err.code === 'LLM_UNAVAILABLE' || err.code === 'VISION_UNAVAILABLE';
}

module.exports = {
  BackendUnavailableError,
  VisionUnavailableError,
  USER_FAULT_CODES,
  isUserFault,
  isAvailabilityError,
};
