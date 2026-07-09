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

// ---------------------------------------------------------------- semaphore

let inFlight = 0;
const waiters = [];

async function withSlot(fn) {
  const max = Math.max(1, config.cortex.llmConcurrency);
  if (inFlight >= max) {
    await new Promise((resolve) => waiters.push(resolve));
  }
  inFlight++;
  try {
    return await fn();
  } finally {
    inFlight--;
    const next = waiters.shift();
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
async function chatComplete(model, messages, opts = {}) {
  return withSlot(async () => {
    const res = await routerFetch(
      `${V1_BASE}/chat/completions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, ...opts }),
      },
      600000,
    );
    if (!res.ok) {
      throw new Error(`chat(${model}) -> ${res.status}: ${await res.text()}`);
    }
    return res.json();
  });
}

module.exports = { listModels, loadModel, unloadModel, routerHealth, chatComplete };
