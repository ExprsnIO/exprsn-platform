'use strict';

/**
 * Client for the OpenAI-compatible llama.cpp router: chat completions plus the
 * router's model-management endpoints. Port of the MacOS LLM service's
 * lib/llama.js with two platform adaptations:
 *
 *  - transport failures surface as AppError 503 LLM_UNAVAILABLE so gated
 *    routes answer with a real status instead of a generic 500;
 *  - completions run behind a small in-process semaphore
 *    (CORTEX_LLM_CONCURRENCY) so interactive flows can't stampede the
 *    single-resident-model router.
 */

const { AppError } = require('@exprsn/shared');
const config = require('../config');

// CORTEX_LLM_BASE_URL points at the OpenAI /v1 base; the router's management
// endpoints (/models, /health) live at the server root above it.
const V1_BASE = String(config.cortex.llmBaseUrl).replace(/\/+$/, '');
const ROUTER_ROOT = V1_BASE.replace(/\/v1$/, '');

function unavailable(err) {
  const cause = err && (err.cause && err.cause.code ? err.cause.code : err.name);
  return new AppError(`LLM router unreachable (${cause || err.message})`, 503, 'LLM_UNAVAILABLE');
}

async function routerFetch(url, init = {}, timeoutMs = 30000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } catch (err) {
    throw unavailable(err);
  } finally {
    clearTimeout(t);
  }
}

// ---------------------------------------------------------------- semaphores

// One pool per workload (ADR 0002 §2). Text and vision must not share a pool:
// `withSlot` serializes everything in its pool, so a backlog of async image
// jobs on the text pool would starve interactive chat.
const POOLS = {
  text: { inFlight: 0, waiters: [], max: () => Math.max(1, config.cortex.llmConcurrency) },
  vision: { inFlight: 0, waiters: [], max: () => Math.max(1, config.cortex.visionConcurrency) },
};

async function withSlot(fn, poolName = 'text') {
  const pool = POOLS[poolName] || POOLS.text;
  if (pool.inFlight >= pool.max()) {
    await new Promise((resolve) => pool.waiters.push(resolve));
  }
  pool.inFlight++;
  try {
    return await fn();
  } finally {
    pool.inFlight--;
    const next = pool.waiters.shift();
    if (next) next();
  }
}

// ---------------------------------------------------------------- API

async function listModels({ reload = false } = {}) {
  const res = await routerFetch(`${ROUTER_ROOT}/models${reload ? '?reload=1' : ''}`);
  if (!res.ok) throw new Error(`router /models -> ${res.status}`);
  return res.json();
}

async function loadModel(model) {
  const res = await routerFetch(
    `${ROUTER_ROOT}/models/load`,
    { method: 'POST', body: JSON.stringify({ model }) },
    300000, // big models take minutes to load
  );
  if (!res.ok) throw new Error(`load ${model} -> ${res.status}: ${await res.text()}`);
  return res.json().catch(() => ({}));
}

async function unloadModel(model) {
  const res = await routerFetch(`${ROUTER_ROOT}/models/unload`, {
    method: 'POST',
    body: JSON.stringify({ model }),
  });
  if (!res.ok) throw new Error(`unload ${model} -> ${res.status}: ${await res.text()}`);
  return res.json().catch(() => ({}));
}

async function routerHealth() {
  try {
    const res = await routerFetch(`${ROUTER_ROOT}/health`, {}, 3000);
    return res.ok;
  } catch {
    return false;
  }
}

// Non-streaming chat completion. `opts` merges into the request body.
//
// `pool` selects the concurrency pool ('text' | 'vision'); `timeoutMs` bounds the
// transport. NOTE for vision callers: `messages` may embed base64 image data —
// never log this argument, and never pass it to logPrompt (ADR 0002 §4).
async function chatComplete(model, messages, opts = {}, { pool = 'text', timeoutMs = 600000 } = {}) {
  return withSlot(async () => {
    const res = await routerFetch(
      `${V1_BASE}/chat/completions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, ...opts }),
      },
      timeoutMs,
    );
    if (!res.ok) {
      // Deliberately does not echo the request body — it may contain image bytes.
      throw new Error(`chat(${model}) -> ${res.status}: ${await res.text()}`);
    }
    return res.json();
  }, pool);
}

// Does `modelId` exist on the router AND advertise image input?
// llama.cpp reports vision capability only when an mmproj projector is loaded,
// so a VL model configured without one shows up as text-only — exactly the
// misconfiguration this guards against.
async function modelSupportsImages(modelId) {
  if (!modelId) return false;
  const data = await listModels();
  const entry = (data.data || []).find((m) => m.id === modelId);
  if (!entry) return false;
  const modalities = (entry.architecture && entry.architecture.input_modalities) || [];
  return modalities.includes('image');
}

module.exports = { listModels, loadModel, unloadModel, routerHealth, chatComplete, modelSupportsImages };
