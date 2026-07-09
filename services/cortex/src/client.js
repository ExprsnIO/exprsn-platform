'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Cortex public in-process façade (FEAT-023, ADR 0001)
 *
 * The ONLY supported way for another module to reach the local LLM in-process.
 * Consumers require this file relatively, the same way modules already reach
 * for `plugins/src/services/pluginHost`:
 *
 *     const cortex = require('../../cortex/src/client');
 *     const text = await cortex.complete(system, user, { timeoutMs: 5000 });
 *
 * Two invariants make this safe; do not break either.
 *
 * 1. It binds to cortex's INFERENCE layer (`engine/agent.js`) and never to its
 *    FLOW layer (`engine/jobs.js`). `moderatorScreen()` — the cortex→moderator
 *    call — lives only in jobs.js, so a moderator→cortex→moderator cycle is
 *    structurally impossible rather than merely guarded. `engine/agent.js`
 *    transitively requires only config + lib/llama + lib/cache: no Sequelize
 *    models, no Bull, no moderator.
 *
 * 2. The CORTEX_ENABLED gate is evaluated BEFORE the lazy require, and fails
 *    closed. Neither `engine/agent.js` nor `lib/llama.js` checks the flag on
 *    its own — calling them while cortex is dark would reach the llama router
 *    anyway. With the flag off nothing is required and no traffic is emitted.
 *
 * Callers own their failure policy. This façade only ever throws:
 *   - CortexDisabledError    — flag off (never reached the router)
 *   - CortexUnavailableError — router down / non-200 / timed out
 * Safety-critical callers (moderation) must fail CLOSED on these; best-effort
 * callers (lowcode flow steps) must fail SOFT. See ADR 0001 §Consequences.
 * ═══════════════════════════════════════════════════════════
 */

const config = require('./config');

// Bounded by default: `chatComplete` carries a 600s transport timeout, which is
// right for an agent task and catastrophic on a synchronous request path.
const DEFAULT_TIMEOUT_MS = 5000;

class CortexDisabledError extends Error {
  constructor(message = 'Cortex is not enabled on this deployment (CORTEX_ENABLED)') {
    super(message);
    this.name = 'CortexDisabledError';
    this.code = 'CORTEX_DISABLED';
    this.statusCode = 503;
  }
}

class CortexUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CortexUnavailableError';
    this.code = 'LLM_UNAVAILABLE';
    this.statusCode = 503;
  }
}

function isEnabled() {
  return Boolean(config.features.cortexEnabled);
}

// Fail-closed gate + lazy require, in that order. Requiring the engine is cheap
// (no DB/Redis at import) but must not happen at all when cortex is dark.
function engine() {
  if (!isEnabled()) throw new CortexDisabledError();
  // eslint-disable-next-line global-require
  return require('./engine/agent');
}

// Same gate for the vision engine. `sharp` is a native module, so keeping this
// require lazy also means a deployment that never touches images never loads it.
function visionEngine() {
  if (!isEnabled()) throw new CortexDisabledError();
  // eslint-disable-next-line global-require
  return require('./engine/vision');
}

// The underlying fetch keeps running after we stop waiting — Node has no
// cancellation here without threading an AbortSignal through chatComplete. The
// point of this race is to bound the CALLER's latency, not the router's work.
async function withTimeout(promise, timeoutMs, label) {
  if (!timeoutMs || timeoutMs <= 0) return promise;
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new CortexUnavailableError(`${label} exceeded ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function wrap(err) {
  if (err instanceof CortexDisabledError || err instanceof CortexUnavailableError) return err;
  // lib/llama.js surfaces transport failures as AppError 503 LLM_UNAVAILABLE.
  return new CortexUnavailableError(err && err.message ? err.message : String(err));
}

// Vision errors carry distinct meanings the caller must be able to tell apart:
// UNSUPPORTED_IMAGE is the *user's* fault (415, don't retry), VISION_UNAVAILABLE
// is an operator/config problem, and everything else is transport. Flattening
// them all to LLM_UNAVAILABLE would make a corrupt upload look like an outage
// and get retried forever by the queue.
function wrapVision(err) {
  const code = err && err.code;
  if (code === 'UNSUPPORTED_IMAGE' || code === 'VISION_UNAVAILABLE') return err;
  return wrap(err);
}

/**
 * One-shot completion. Returns the assistant's text.
 * @param {string} system system prompt
 * @param {string} user   user prompt
 * @param {{model?: string, temperature?: number, timeoutMs?: number}} [opts]
 */
async function complete(system, user, opts = {}) {
  const { model = null, temperature = 0.3, timeoutMs = DEFAULT_TIMEOUT_MS } = opts;
  const agent = engine(); // throws CortexDisabledError before any router traffic
  try {
    return await withTimeout(
      agent.simpleChat(system, user, { model, temperature }),
      timeoutMs,
      'cortex.complete',
    );
  } catch (err) {
    throw wrap(err);
  }
}

/**
 * Cheap PASS/FAIL verdict from the judge model (same primitive cortex's own
 * `llm_judge` guardrail rules use). Returns the judge's raw short text.
 */
async function judge(prompt, text, opts = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS } = opts;
  const agent = engine();
  try {
    return await withTimeout(agent.judge(prompt, text), timeoutMs, 'cortex.judge');
  } catch (err) {
    throw wrap(err);
  }
}

// ---------------------------------------------------------------- vision
//
// Image work is ASYNC-ONLY (ADR 0002 §3): a vision call costs ~1.2s warm and
// ~53s when the router has to LRU-swap the model in. Never call these from a
// synchronous request path — they belong on a queue worker.

/**
 * Moderation verdict for an image. FAILS CLOSED: throws on a disabled cortex, a
 * missing/text-only vision model, an undecodable image, a timeout, or an
 * unparseable verdict. Callers must treat every throw as "escalate to a human",
 * never as "safe".
 *
 * Returns the same score shape moderator's rule engine consumes, so an image
 * verdict flows through the existing rules / review queue / audit trail.
 * @param {Buffer} buffer raw image bytes (PNG/JPEG/GIF/WebP/AVIF/TIFF)
 */
async function moderateImage(buffer) {
  const vision = visionEngine(); // throws CortexDisabledError before any work
  try {
    return await withTimeout(
      vision.moderateImage(buffer),
      config.cortex.visionTimeoutMs,
      'cortex.moderateImage',
    );
  } catch (err) {
    throw wrapVision(err);
  }
}

/**
 * Tags + alt-text for an image. Intended to FAIL SOFT at the call site: the
 * caller should catch and continue (a missing caption must never block a write).
 * Still throws typed errors so the caller can log the reason.
 */
async function describeImage(buffer) {
  const vision = visionEngine();
  try {
    return await withTimeout(
      vision.describeImage(buffer),
      config.cortex.visionTimeoutMs,
      'cortex.describeImage',
    );
  } catch (err) {
    throw wrapVision(err);
  }
}

/** Non-throwing probe: is image inference actually usable right now? */
async function visionAvailable() {
  if (!isEnabled()) return { available: false, reason: 'CORTEX_DISABLED' };
  try {
    const model = await visionEngine().assertVisionCapable();
    return { available: true, model };
  } catch (err) {
    return { available: false, reason: err.code || err.name, message: err.message };
  }
}

/**
 * Non-throwing readiness probe for health endpoints and provider registration.
 * Never emits router traffic when the flag is off.
 */
async function health() {
  if (!isEnabled()) return { enabled: false, up: false };
  try {
    // eslint-disable-next-line global-require
    const { routerHealth } = require('./lib/llama');
    return { enabled: true, up: await routerHealth(), brain: config.cortex.brainModel };
  } catch (err) {
    return { enabled: true, up: false, error: err.message };
  }
}

module.exports = {
  isEnabled,
  complete,
  judge,
  health,
  // vision (FEAT-030) — async callers only
  moderateImage,
  describeImage,
  visionAvailable,
  CortexDisabledError,
  CortexUnavailableError,
  DEFAULT_TIMEOUT_MS,
};
