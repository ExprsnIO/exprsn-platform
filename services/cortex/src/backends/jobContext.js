'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Queue-only invariant, layer 2 (FEAT-072, ADR 0005).
 *
 * The secondary (Ollama) is CPU-only in production: a single vision pass costs
 * tens of seconds, a video pass costs minutes. It must therefore be reached
 * ONLY from an async queue worker, NEVER from a synchronous request path.
 *
 * Two layers enforce this. Layer 1 is the process boundary: the Ollama driver
 * only registers when CORTEX_ASYNC_ROLE==='worker', and the gateway asserts
 * that var is unset and refuses to boot otherwise — so the gateway's registry
 * physically cannot contain Ollama. Layer 2 (this file) guards against a FUTURE
 * mistake inside a worker process — a route handler or a setInterval that
 * reaches the secondary outside of a job. The registry refuses a secondary-
 * backend call when `inJobContext()` is false.
 *
 * A worker wraps each job body in `runInJobContext(meta, fn)`; every backend
 * call made while that async context is on the stack is "in a job".
 * ═══════════════════════════════════════════════════════════
 */

const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();

/**
 * Run `fn` inside a job context. Every backend call transitively made by `fn`
 * (across awaits — AsyncLocalStorage propagates through the async chain) counts
 * as in-job. `meta` is opaque bookkeeping (e.g. { queue, jobId }) for logs.
 */
function runInJobContext(meta, fn) {
  return als.run({ meta: meta || {}, enteredAt: null }, fn);
}

/** True iff the current async stack is inside runInJobContext(). */
function inJobContext() {
  return als.getStore() !== undefined;
}

/** The current job's meta, or null outside a job. */
function jobMeta() {
  const store = als.getStore();
  return store ? store.meta : null;
}

class SyncCallForbiddenError extends Error {
  constructor(backendName) {
    super(
      `cortex secondary backend "${backendName}" may only be called from a queue `
      + 'worker job (CPU-only, seconds-to-minutes latency). Reached outside a job '
      + 'context — this call path must move onto a Bull queue.',
    );
    this.name = 'CortexSyncCallForbiddenError';
    this.code = 'CORTEX_SYNC_CALL_FORBIDDEN';
    this.statusCode = 500;
  }
}

module.exports = { runInJobContext, inJobContext, jobMeta, SyncCallForbiddenError };
