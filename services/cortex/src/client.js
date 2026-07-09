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
  CortexDisabledError,
  CortexUnavailableError,
  DEFAULT_TIMEOUT_MS,
};
