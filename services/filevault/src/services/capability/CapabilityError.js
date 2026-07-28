'use strict';

/**
 * FEAT-077 — the single, fail-closed capability denial.
 *
 * Every façade/adapter denial is a `CapabilityError` with code `CAP_NOT_FOUND`:
 * missing, expired, exhausted, revoked, provenance-dead, moderation-held and
 * permission-short are deliberately indistinguishable to callers (the
 * FEAT-031/BUG-020 same-404 posture). `cause` carries the internal reason for
 * logs and route-compat mapping ONLY — it must never reach a response body for
 * a requester who isn't entitled to the resource.
 */
class CapabilityError extends Error {
  /**
   * @param {string} [code='CAP_NOT_FOUND'] - the only code in use this slice
   * @param {string} [cause] - internal reason (logs / route mapping only)
   */
  constructor(code = 'CAP_NOT_FOUND', cause = undefined) {
    super(code);
    this.name = 'CapabilityError';
    this.code = code;
    this.cause = cause;
    this.statusCode = 404;
  }
}

module.exports = CapabilityError;
