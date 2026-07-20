'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Ollama driver (FEAT-072, ADR 0005) — the SECONDARY backend.
 *
 * Reached ONLY from an async queue worker (the registry enforces this via
 * jobContext; the process gate keeps it out of the gateway entirely). CPU-only
 * in production, so every call here is seconds-to-minutes — never a request
 * path.
 *
 * Ollama's API is nothing like the llama.cpp router's:
 *   - GET  /api/version         → health
 *   - GET  /api/tags            → installed model tags (residency: auto-load,
 *                                 so "resident" == "present")
 *   - POST /api/show {model}    → { capabilities: [... "vision"] }
 *   - POST /api/pull {model}    → multi-GB download (NEVER inside a job)
 *   - POST /v1/chat/completions → OpenAI-compatible, accepts the SAME
 *                                 image_url data-URI content parts vision.js
 *                                 already builds.
 *
 * None of llama.cpp's /models/load residency dance applies: Ollama loads a model
 * on first token and evicts it after OLLAMA_KEEP_ALIVE. ensureResident is just a
 * presence assert (optionally a pull, gated by config, and refused inside a job).
 * ═══════════════════════════════════════════════════════════
 */

const { createLogger } = require('@exprsn/shared');
const config = require('../config');
const { BackendUnavailableError } = require('./errors');
const { inJobContext } = require('./jobContext');

const logger = createLogger('exprsn-cortex-ollama');

const BASE = String(config.cortex.ollama.baseUrl).replace(/\/+$/, '');

async function ollamaFetch(path, init = {}, timeoutMs = 30000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(`${BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
      signal: ctl.signal,
    });
  } catch (err) {
    const cause = err && (err.cause && err.cause.code ? err.cause.code : err.name);
    throw new BackendUnavailableError(
      `Ollama unreachable (${cause || err.message})`, { backend: 'ollama', cause: err },
    );
  } finally {
    clearTimeout(t);
  }
}

function roleEnabled(role) {
  return config.cortex.ollama.roles.includes(role);
}

function modelFor(role) {
  if (!roleEnabled(role)) return null; // secondary not eligible for this role
  if (role === 'brain') return config.cortex.ollama.brainModel || null;
  if (role === 'judge') return config.cortex.ollama.judgeModel || null;
  if (role === 'vision') return config.cortex.ollama.visionModel || null;
  return null;
}

async function health() {
  try {
    const res = await ollamaFetch('/api/version', {}, 3000);
    return res.ok;
  } catch {
    return false;
  }
}

async function listTags() {
  const res = await ollamaFetch('/api/tags', {}, 5000);
  if (!res.ok) {
    throw new BackendUnavailableError(`Ollama /api/tags -> ${res.status}`, { backend: 'ollama' });
  }
  const data = await res.json();
  return (data.models || []).map((m) => m.name || m.model).filter(Boolean);
}

// Ollama tags are `name:tag`; a bare `name` implies `name:latest`. Match both so
// a config of `qwen3.5:2b` is found when /api/tags reports `qwen3.5:2b`.
function tagPresent(tags, modelId) {
  if (tags.includes(modelId)) return true;
  if (!modelId.includes(':')) return tags.includes(`${modelId}:latest`);
  return false;
}

async function supportsVision(modelId) {
  const res = await ollamaFetch('/api/show', {
    method: 'POST', body: JSON.stringify({ model: modelId }),
  }, 5000);
  if (!res.ok) {
    throw new BackendUnavailableError(
      `Ollama /api/show ${modelId} -> ${res.status}`, { backend: 'ollama' },
    );
  }
  const data = await res.json();
  const caps = Array.isArray(data.capabilities) ? data.capabilities : [];
  return caps.includes('vision');
}

/**
 * Ollama auto-loads on the first token, so "resident" reduces to "the tag is
 * installed". If it is missing we FAIL (availability) rather than block a job on
 * a multi-GB download — unless autoPull is on AND we are outside a job (a pull
 * must never run on the hot path). Provisioning pulls the model ahead of time
 * (TASK-039); autoPull is only a dev convenience.
 */
async function ensureResident(modelId, { timeoutMs = 300000 } = {}) {
  const tags = await listTags();
  if (tagPresent(tags, modelId)) return;

  if (!config.cortex.ollama.autoPull) {
    throw new BackendUnavailableError(
      `Ollama model "${modelId}" is not installed (pull it at provision time; `
      + 'CORTEX_OLLAMA_AUTO_PULL is off)', { backend: 'ollama' },
    );
  }
  if (inJobContext()) {
    // A pull inside a moderation job would stall the queue for minutes and blow
    // memory. Refuse; the reconcile/next drain retries after provisioning pulls.
    throw new BackendUnavailableError(
      `Ollama model "${modelId}" missing and auto-pull is forbidden inside a job`,
      { backend: 'ollama' },
    );
  }
  logger.warn('pulling Ollama model (dev auto-pull)', { model: modelId });
  const res = await ollamaFetch('/api/pull', {
    method: 'POST', body: JSON.stringify({ model: modelId, stream: false }),
  }, timeoutMs);
  if (!res.ok) {
    throw new BackendUnavailableError(
      `Ollama pull ${modelId} -> ${res.status}`, { backend: 'ollama' },
    );
  }
}

/**
 * OpenAI-compatible completion. `pool` is accepted for contract parity but not
 * used: the Ollama server is configured single-flight (OLLAMA_NUM_PARALLEL=1)
 * and the worker runs at concurrency 1, so there is no second in-process pool to
 * manage here.
 */
async function chatComplete(model, messages, opts = {}, { timeoutMs } = {}) {
  const res = await ollamaFetch('/v1/chat/completions', {
    method: 'POST',
    body: JSON.stringify({ model, messages, ...opts }),
  }, timeoutMs || config.cortex.ollama.timeoutMs);

  if (!res.ok) {
    // Do NOT echo the body — messages may carry base64 image bytes.
    throw new BackendUnavailableError(
      `Ollama chat(${model}) -> ${res.status}`, { backend: 'ollama' },
    );
  }
  const data = await res.json();
  const choice = (data.choices || [])[0];
  const text = ((choice && choice.message && choice.message.content) || '').trim();
  if (!text) {
    throw new BackendUnavailableError(
      'Ollama returned an empty completion', { backend: 'ollama' },
    );
  }
  return { text, finishReason: (choice && choice.finish_reason) || null };
}

module.exports = {
  name: 'ollama',
  capabilities: { managesResidency: false, acceptsImages: true, pullable: true },
  modelFor,
  health,
  supportsVision,
  ensureResident,
  chatComplete,
  logger,
};
