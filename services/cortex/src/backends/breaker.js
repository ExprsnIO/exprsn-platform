'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Per-backend circuit breaker (FEAT-072, ADR 0005).
 *
 * Purpose: stop paying a per-job timeout against a backend that is down. On the
 * DO deployment the PRIMARY may be absent entirely (CORTEX_LLM_BASE_URL points
 * at a dev Mac), so "primary is down" is the steady state, not the exception —
 * a breaker parked OPEN turns that into a cheap skip instead of an 8s probe on
 * every single job.
 *
 * State machine (per backend, in-process — a single worker owns its own view;
 * we deliberately do NOT share breaker state across processes via Redis, which
 * would add a network hop to the hot path to save very little):
 *
 *   CLOSED    — calls allowed. `failures` consecutive availability failures
 *               within `windowMs` → OPEN.
 *   OPEN      — calls skipped until the cooldown elapses. Cooldown starts at
 *               cooldownMs and DOUBLES on each re-trip up to cooldownMaxMs.
 *   HALF_OPEN — cooldown elapsed; the registry is allowed ONE trial call
 *               (gated on a cheap health() first). Success → CLOSED (cooldown
 *               reset). Failure → OPEN again with the doubled cooldown.
 *
 * Only AVAILABILITY failures touch the breaker (transport error, 5xx, health
 * false, model-absent, residency timeout, empty body). A user-fault
 * (UNSUPPORTED_IMAGE) or a model-quality failure (unparseable verdict) must
 * NEVER trip it — that is the registry's job to classify; this class only
 * records what it is told.
 *
 * Time is injected (`now()`), never read from Date.now() at module scope, so
 * tests can advance it deterministically.
 * ═══════════════════════════════════════════════════════════
 */

const CLOSED = 'closed';
const OPEN = 'open';
const HALF_OPEN = 'half_open';

class CircuitBreaker {
  /**
   * @param {string} name backend name (for logs)
   * @param {{failures:number, windowMs:number, cooldownMs:number, cooldownMaxMs:number}} cfg
   * @param {() => number} now injectable clock (ms); defaults to Date.now
   */
  constructor(name, cfg, now = () => Date.now()) {
    this.name = name;
    this.cfg = cfg;
    this.now = now;
    this.state = CLOSED;
    this.failCount = 0;
    this.firstFailAt = 0;      // window anchor for the consecutive-failure count
    this.openedAt = 0;         // when the current OPEN period started
    this.currentCooldown = cfg.cooldownMs;
  }

  /**
   * Can a call be attempted right now? Transitions OPEN→HALF_OPEN when the
   * cooldown has elapsed. Returns true for CLOSED and HALF_OPEN.
   */
  allowsAttempt() {
    if (this.state === OPEN) {
      if (this.now() - this.openedAt >= this.currentCooldown) {
        this.state = HALF_OPEN;
        return true;
      }
      return false;
    }
    return true; // CLOSED or HALF_OPEN
  }

  /** Milliseconds until the OPEN period ends (0 if not OPEN). */
  cooldownRemaining() {
    if (this.state !== OPEN) return 0;
    return Math.max(0, this.currentCooldown - (this.now() - this.openedAt));
  }

  /** Record a successful availability event. Closes the breaker, resets cooldown. */
  recordSuccess() {
    this.state = CLOSED;
    this.failCount = 0;
    this.firstFailAt = 0;
    this.currentCooldown = this.cfg.cooldownMs; // reset the exponential backoff
  }

  /**
   * Record an availability failure. A HALF_OPEN trial that fails re-opens with a
   * DOUBLED cooldown. In CLOSED, `failures` consecutive failures inside the
   * rolling window open the breaker.
   */
  recordFailure() {
    const t = this.now();

    if (this.state === HALF_OPEN) {
      this.currentCooldown = Math.min(this.currentCooldown * 2, this.cfg.cooldownMaxMs);
      this._open(t);
      return;
    }

    // Restart the window if the last failure was too long ago — the breaker
    // trips on CONSECUTIVE-ish failures, not on scattered ones across an hour.
    if (this.failCount === 0 || (t - this.firstFailAt) > this.cfg.windowMs) {
      this.failCount = 1;
      this.firstFailAt = t;
    } else {
      this.failCount += 1;
    }

    if (this.failCount >= this.cfg.failures) {
      this._open(t);
    }
  }

  _open(t) {
    this.state = OPEN;
    this.openedAt = t;
    this.failCount = 0;
    this.firstFailAt = 0;
  }

  snapshot() {
    return {
      backend: this.name,
      state: this.state,
      cooldownRemainingMs: this.cooldownRemaining(),
      currentCooldownMs: this.currentCooldown,
    };
  }
}

module.exports = { CircuitBreaker, CLOSED, OPEN, HALF_OPEN };
