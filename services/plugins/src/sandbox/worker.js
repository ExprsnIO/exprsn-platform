'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Sandbox worker — runs untrusted plugin JS inside a worker thread.
 *
 * Isolation is layered:
 *   1. This whole file runs in a dedicated worker_thread with resourceLimits
 *      (heap cap) set by the host; the host can terminate() it on timeout.
 *   2. The user source runs inside a node:vm context whose global is a frozen,
 *      minimal sandbox — NO require, process, global, Buffer, fs, net, timers.
 *   3. The only power the script has is `platform.*`, which round-trips to the
 *      HOST over the message channel. The host enforces capability grants and
 *      injects the service/CA token, so the script never holds credentials and
 *      every effect is authorized + audited at the gateway (token/CA pass-thru).
 *
 * This is the appropriate boundary for admin-curated / first-party scripts. It
 * is explicitly NOT marketed as a boundary for arbitrary hostile multi-tenant
 * code — that path is the out-of-process `webhook` kind.
 * ═══════════════════════════════════════════════════════════
 */

const vm = require('node:vm');
const { parentPort, workerData } = require('node:worker_threads');

const { source, ctx, methods } = workerData;

// ── Host round-trip: a pending-promise registry keyed by call id ────────────
let nextId = 1;
const pending = new Map();

parentPort.on('message', (msg) => {
  if (msg && msg.type === 'callResult') {
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    if (msg.ok) entry.resolve(msg.value);
    else entry.reject(new Error(msg.error || 'platform call failed'));
  }
});

function hostCall(method, args) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    parentPort.postMessage({ type: 'call', id, method, args });
  });
}

// Build the capability-gated platform API from the method list the host allows.
const platform = {};
for (const m of methods || []) {
  platform[m] = (...args) => hostCall(m, args);
}
Object.freeze(platform);

// ── Minimal frozen sandbox global ───────────────────────────────────────────
const sandbox = {
  ctx: Object.freeze(ctx),
  platform,
  // Safe, pure built-ins only.
  JSON, Math, Date, String, Number, Boolean, Array, Object, RegExp,
  parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
  console: { log: (...a) => platform.log && platform.log(a.map(String).join(' ')) },
};
const context = vm.createContext(sandbox, {
  codeGeneration: { strings: false, wasm: false }, // no eval/Function/wasm
});

(async () => {
  try {
    // Wrap the source as the body of an async function so it can `await
    // platform.*` and `return` a value. The vm `timeout` bounds synchronous
    // CPU; the host's terminate() bounds total wall-clock incl. awaits.
    const wrapped = `(async () => {\n"use strict";\n${source}\n})()`;
    const promise = vm.runInContext(wrapped, context, {
      timeout: Math.min(Number(workerData.timeoutMs) || 1500, 10000),
      displayErrors: true,
    });
    const result = await promise;
    parentPort.postMessage({ type: 'done', ok: true, result: safe(result) });
  } catch (err) {
    parentPort.postMessage({ type: 'done', ok: false, error: String(err && err.message || err) });
  }
})();

/** Only structured-cloneable JSON is returned to the host. */
function safe(v) {
  try { return JSON.parse(JSON.stringify(v === undefined ? null : v)); }
  catch { return null; }
}
