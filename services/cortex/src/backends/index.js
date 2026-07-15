'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Backend registry + failover (FEAT-072, ADR 0005).
 *
 * Owns the ordered backend list, one circuit breaker per backend, and the
 * single failover primitive `chatForRole`. Callers ask for a ROLE
 * (brain|judge|vision) and a set of messages; the registry resolves the model
 * per backend, tries the primary, and on an AVAILABILITY failure fails over to
 * the secondary — all invisible above this file (one call → one result or one
 * throw, with `.backend` recorded on the result).
 *
 * Registration rules (both enforced here):
 *   - llama.cpp (primary) is always registered.
 *   - Ollama (secondary) registers ONLY when it is enabled AND the process is a
 *     worker (CORTEX_ASYNC_ROLE==='worker'). The gateway therefore cannot hold
 *     it — layer 1 of the queue-only invariant. Layer 2: even inside a worker, a
 *     secondary call made outside a job context throws CORTEX_SYNC_CALL_FORBIDDEN.
 *
 * What counts as a failure is deliberately narrow (ADR 0005 §3):
 *   - AVAILABILITY (fail over, trip breaker): transport error, 5xx, model
 *     absent, residency timeout, empty body.
 *   - USER_FAULT (UNSUPPORTED_IMAGE/VIDEO): terminal — rethrown at once, no
 *     failover, no breaker.
 *   - anything else (e.g. an unparseable-verdict raised ABOVE this file by
 *     vision.js): never reaches here as a backend error, so it can neither fail
 *     over nor trip the breaker. That is the point — a model-quality problem
 *     must not silently swap models and hide the regression.
 * ═══════════════════════════════════════════════════════════
 */

const { createLogger } = require('@exprsn/shared');
const config = require('../config');
const llamacpp = require('./llamacpp');
const { CircuitBreaker, HALF_OPEN } = require('./breaker');
const {
  BackendUnavailableError, VisionUnavailableError, isUserFault, isAvailabilityError,
} = require('./errors');
const { inJobContext, SyncCallForbiddenError } = require('./jobContext');

const logger = createLogger('exprsn-cortex-backends');

// ---- registration --------------------------------------------------------

let PRIMARY = null;         // the llama.cpp driver
let SECONDARIES = [];       // ordered secondary drivers (Ollama today)
let BREAKERS = new Map();   // name -> CircuitBreaker
const visionCapable = new Set(); // memoized: backend name known to accept images

function isWorker() {
  return String(process.env.CORTEX_ASYNC_ROLE || '') === 'worker';
}

function build() {
  PRIMARY = llamacpp;
  SECONDARIES = [];
  // Ollama registers only in a worker process (layer-1 queue-only gate).
  if (config.cortex.ollama.enabled && isWorker()) {
    // eslint-disable-next-line global-require
    SECONDARIES.push(require('./ollama'));
  }
  BREAKERS = new Map();
  for (const d of [PRIMARY, ...SECONDARIES]) {
    BREAKERS.set(d.name, new CircuitBreaker(d.name, config.cortex.breaker));
  }
  visionCapable.clear();
}

build();

/** Test/boot seam: re-read env + config and rebuild the registry. */
function rebuild() {
  build();
}

/**
 * Confirm `driver` will actually accept image input for `model`, memoizing a
 * positive result for the process. Throws VisionUnavailableError (a text-only
 * model — try the next backend) or an availability error (probe transport
 * failure). Sending an image to a text-only model would produce a hallucinated
 * "verdict", so this gate is a safety requirement, not an optimization.
 */
async function assertBackendVision(driver, model) {
  if (visionCapable.has(driver.name)) return;
  let ok;
  try {
    ok = await driver.supportsVision(model);
  } catch (err) {
    if (isAvailabilityError(err)) throw err;
    throw new BackendUnavailableError(
      `vision preflight on ${driver.name} failed: ${err.message}`, { backend: driver.name, cause: err },
    );
  }
  if (!ok) {
    throw new VisionUnavailableError(
      `model "${model}" on ${driver.name} does not accept image input`, { backend: driver.name },
    );
  }
  visionCapable.add(driver.name);
}

/** Every registered backend, primary first. */
function all() {
  return [PRIMARY, ...SECONDARIES];
}

/** Backends that serve `role` (have a non-null model for it), primary first. */
function eligibleFor(role) {
  return all().filter((d) => d.modelFor(role));
}

/** True iff any registered backend other than the primary exists. */
function hasSecondary() {
  return SECONDARIES.length > 0;
}

// ---- failover primitive --------------------------------------------------

/**
 * Run a role completion with failover. Returns { text, finishReason, backend,
 * model }. Throws:
 *   - the USER_FAULT error unchanged (terminal), or
 *   - BackendUnavailableError('all backends…') when every eligible backend is
 *     down / breaker-open, or
 *   - SyncCallForbiddenError if a secondary would be used outside a job.
 *
 * @param {'brain'|'judge'|'vision'} role
 * @param {object[]} messages
 * @param {object} opts merged into the request body (temperature, max_tokens…)
 * @param {{pool?:string, timeoutMs?:number}} [o]
 */
async function chatForRole(role, messages, opts = {}, { pool = 'text', timeoutMs } = {}) {
  const backends = eligibleFor(role);
  if (!backends.length) {
    throw new BackendUnavailableError(`no backend configured for role "${role}"`);
  }

  let lastErr = null;
  for (const driver of backends) {
    const isSecondary = driver !== PRIMARY;

    // Layer-2 queue-only gate: a secondary may only be used inside a job.
    if (isSecondary && !inJobContext()) {
      // If the primary already failed and the only path left is the secondary,
      // this is a real misuse (a sync path relying on the CPU-only backend).
      throw new SyncCallForbiddenError(driver.name);
    }

    const breaker = BREAKERS.get(driver.name);
    if (!breaker.allowsAttempt()) {
      lastErr = new BackendUnavailableError(
        `${driver.name} breaker open (${breaker.cooldownRemaining()}ms left)`,
        { backend: driver.name },
      );
      continue;
    }

    // HALF_OPEN gets a cheap health gate before spending a real attempt.
    if (breaker.state === HALF_OPEN) {
      const up = await driver.health();
      if (!up) {
        breaker.recordFailure();
        lastErr = new BackendUnavailableError(`${driver.name} health probe failed`, { backend: driver.name });
        continue;
      }
    }

    const model = driver.modelFor(role);
    const attemptTimeout = isSecondary
      ? (timeoutMs || config.cortex.ollama.timeoutMs)
      : timeoutMs;
    try {
      // A vision request must never be sent to a text-only model.
      if (role === 'vision') await assertBackendVision(driver, model);
      await driver.ensureResident(model, { timeoutMs: attemptTimeout });
      const result = await driver.chatComplete(model, messages, opts, { pool, timeoutMs: attemptTimeout });
      breaker.recordSuccess();
      return { ...result, backend: driver.name, model };
    } catch (err) {
      if (isUserFault(err)) throw err; // terminal: the user's bytes, not a backend fault
      if (err.code === 'VISION_UNAVAILABLE') {
        // A text-only model is a config problem, not an outage — try the next
        // backend WITHOUT tripping the breaker (the backend is up).
        lastErr = err;
        continue;
      }
      if (isAvailabilityError(err)) {
        breaker.recordFailure();
        lastErr = err;
        logger.warn('backend attempt failed, will try next', {
          role, backend: driver.name, error: err.message, breaker: breaker.state,
        });
        continue;
      }
      throw err; // unknown error: do not misclassify as availability
    }
  }

  throw new BackendUnavailableError(
    `all backends unavailable for role "${role}"`,
    { backend: null, cause: lastErr || undefined },
  );
}

// ---- vision capability preflight -----------------------------------------

/**
 * Resolve a vision-capable backend + model, trying each eligible backend in
 * order. Memoizes a POSITIVE result per backend (stable for the process); a
 * negative one is usually "operator still wiring it up", so it is not cached.
 * Returns { backend, model }. Throws BackendUnavailableError if none qualifies.
 */
async function assertVisionCapable() {
  const backends = eligibleFor('vision');
  if (!backends.length) {
    // A config problem (no CORTEX_VISION_MODEL / CORTEX_OLLAMA_VISION_MODEL),
    // not an outage — VISION_UNAVAILABLE so the façade can tell them apart.
    throw new VisionUnavailableError('no vision model configured on any backend');
  }
  let lastErr = null;
  for (const driver of backends) {
    const isSecondary = driver !== PRIMARY;
    if (isSecondary && !inJobContext()) continue; // never probe the CPU backend synchronously
    const model = driver.modelFor('vision');
    try {
      await assertBackendVision(driver, model);
      return { backend: driver.name, model };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new VisionUnavailableError('no vision-capable backend available');
}

/** Test seam: forget the memoized vision preflight. */
function resetVisionCache() {
  visionCapable.clear();
}

// ---- introspection (health routes / admin) -------------------------------

function snapshot() {
  return {
    primary: PRIMARY.name,
    secondaries: SECONDARIES.map((d) => d.name),
    breakers: all().map((d) => BREAKERS.get(d.name).snapshot()),
  };
}

module.exports = {
  rebuild,
  all,
  eligibleFor,
  hasSecondary,
  chatForRole,
  assertVisionCapable,
  resetVisionCache,
  snapshot,
  // exposed for tests
  _breakers: () => BREAKERS,
};
