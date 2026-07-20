'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * llama.cpp driver (FEAT-072, ADR 0005) — the PRIMARY backend.
 *
 * Thin adapter over lib/llama.js (the OpenAI-compatible llama.cpp router
 * transport, kept as-is so agent.js's tool-calling loop still consumes raw
 * router JSON). This driver adds the two things the shared contract needs:
 *   - normalization of chatComplete to { text, finishReason };
 *   - residency management, which is llama.cpp-SPECIFIC and therefore lives
 *     here, not in vision.js. The router keeps a single model resident
 *     (MODELS_MAX=1), answers a completion mid-load with an EMPTY body, and
 *     refuses a concurrent/duplicate load — so ensureResident must poll the real
 *     status and nudge with a load only from `unloaded`.
 *
 * None of these router quirks may leak past this file: the Ollama driver's
 * residency model is completely different, and shared code must not assume
 * either.
 * ═══════════════════════════════════════════════════════════
 */

const { createLogger } = require('@exprsn/shared');
const config = require('../config');
const {
  chatComplete: routerChat,
  routerHealth,
  modelSupportsImages,
  listModels,
  loadModel,
} = require('../lib/llama');
const { BackendUnavailableError } = require('./errors');

const logger = createLogger('exprsn-cortex-llamacpp');

// Residency poll cadence + ceiling. Overridable so tests poll fast without fake
// timers (sharp's async work does not settle under jest fake timers).
const LOAD_POLL_MS = Number(process.env.CORTEX_VISION_LOAD_POLL_MS) || 2000;
const LOAD_WAIT_MAX_MS = Number(process.env.CORTEX_VISION_LOAD_WAIT_MS) || 300000;

function modelFor(role) {
  if (role === 'brain') return config.cortex.brainModel || null;
  if (role === 'judge') return config.cortex.judgeModel || null;
  if (role === 'vision') return config.cortex.visionModel || null;
  return null;
}

async function health() {
  return routerHealth(); // never throws; returns false on error
}

async function supportsVision(modelId) {
  return modelSupportsImages(modelId);
}

// ---- residency (llama.cpp-specific) --------------------------------------

function statusOf(entry) {
  if (!entry) return null;
  const s = entry.status;
  return s && s.value !== undefined ? s.value : s;
}

async function routerStatus(model) {
  const data = await listModels();
  return statusOf((data.data || []).find((m) => m.id === model));
}

/**
 * Block until `model` is resident, loading it if necessary. Poll the real
 * status; nudge with a load only from `unloaded`; treat a refused load as a
 * transient race (another load is in flight), not a failure.
 */
async function ensureResident(model, { timeoutMs = LOAD_WAIT_MAX_MS } = {}) {
  const deadline = Date.now() + timeoutMs;
  let nudged = false;

  for (;;) {
    let status;
    try {
      status = await routerStatus(model);
    } catch (err) {
      throw new BackendUnavailableError(
        `llama.cpp router unreachable while checking residency: ${err.message}`,
        { backend: 'llamacpp', cause: err },
      );
    }
    if (status === 'loaded') return;
    if (status === null) {
      throw new BackendUnavailableError(
        `model "${model}" is not registered with the llama.cpp router`,
        { backend: 'llamacpp' },
      );
    }
    if (status === 'unloaded' && !nudged) {
      nudged = true;
      await loadModel(model).catch(() => {}); // refusal = concurrent load; wait it out
    }
    if (Date.now() >= deadline) {
      throw new BackendUnavailableError(
        `model "${model}" not resident after ${timeoutMs}ms (status: ${status})`,
        { backend: 'llamacpp' },
      );
    }
    await new Promise((r) => setTimeout(r, LOAD_POLL_MS));
  }
}

/**
 * Normalized completion. Extracts { text, finishReason } from the router JSON.
 * An empty body is the router answering mid-load — a transient AVAILABILITY
 * failure, named as such so it never masquerades as "the model wrote nothing".
 */
async function chatComplete(model, messages, opts = {}, { pool = 'text', timeoutMs } = {}) {
  let data;
  try {
    data = await routerChat(model, messages, opts, { pool, timeoutMs });
  } catch (err) {
    // lib/llama already surfaces transport failures as AppError 503; re-tag with
    // the backend so failover logs name the right server.
    if (err.code === 'LLM_UNAVAILABLE') {
      throw new BackendUnavailableError(err.message, { backend: 'llamacpp', cause: err });
    }
    throw new BackendUnavailableError(
      `llama.cpp completion failed: ${err.message}`, { backend: 'llamacpp', cause: err },
    );
  }
  const choice = (data.choices || [])[0];
  const text = ((choice && choice.message && choice.message.content) || '').trim();
  if (!text) {
    throw new BackendUnavailableError(
      'llama.cpp returned an empty completion (answered mid-load)', { backend: 'llamacpp' },
    );
  }
  return { text, finishReason: (choice && choice.finish_reason) || null };
}

module.exports = {
  name: 'llamacpp',
  capabilities: { managesResidency: true, acceptsImages: true, pullable: false },
  modelFor,
  health,
  supportsVision,
  ensureResident,
  chatComplete,
  logger,
};
