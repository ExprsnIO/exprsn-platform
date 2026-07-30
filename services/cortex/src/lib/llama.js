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

// A cancelled generation (client disconnect / explicit cancel) is NOT an
// availability failure — it must never trip a circuit breaker or trigger
// failover to the secondary backend (FEAT-090).
function abortedError() {
  const err = new Error('generation cancelled');
  err.code = 'LLM_CANCELLED';
  err.name = 'AbortError';
  return err;
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

/**
 * Streaming chat completion (FEAT-090). Same request as `chatComplete` plus
 * `stream:true`, consuming the router's OpenAI-style SSE frames and invoking
 * `onDelta` per chunk.
 *
 * Concurrency semantics are deliberately UNCHANGED: the `withSlot` semaphore is
 * held for the whole generation, exactly as a buffered call holds it, so a
 * streamed request costs the single-resident-model router the same as a
 * buffered one. Streaming must not become a way to oversubscribe the router.
 *
 * `signal` aborts the generation (client disconnect / explicit cancel) and
 * releases the slot promptly — a closed tab must not burn a slot for the rest
 * of a minutes-long local generation.
 *
 * Returns { text, finishReason, toolCalls } where `text` is the full
 * concatenation of content deltas. Tool-call deltas are accumulated by index
 * and returned assembled; callers that passed `tools` must check `toolCalls`
 * before treating `text` as an answer.
 *
 * @param {(delta:{content?:string, toolCalls?:boolean}) => void} onDelta
 */
async function chatCompleteStream(model, messages, opts = {}, {
  pool = 'text', timeoutMs = 600000, signal = null, onDelta = null,
} = {}) {
  return withSlot(async () => {
    const ctl = new AbortController();
    const onAbort = () => ctl.abort();
    if (signal) {
      if (signal.aborted) ctl.abort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(`${V1_BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ model, messages, ...opts, stream: true }),
        signal: ctl.signal,
      });
    } catch (err) {
      clearTimeout(t);
      if (signal) signal.removeEventListener('abort', onAbort);
      if (signal && signal.aborted) throw abortedError();
      throw unavailable(err);
    }
    if (!res.ok) {
      clearTimeout(t);
      if (signal) signal.removeEventListener('abort', onAbort);
      // Deliberately does not echo the request body — it may contain image bytes.
      throw new Error(`chat-stream(${model}) -> ${res.status}: ${await res.text()}`);
    }

    let text = '';
    let finishReason = null;
    const toolCalls = [];
    let buffered = '';
    try {
      // res.body is a web ReadableStream under undici; async-iterate it and
      // reassemble SSE frames across chunk boundaries (a frame is NOT
      // guaranteed to arrive whole).
      const decoder = new TextDecoder();
      for await (const chunk of res.body) {
        buffered += decoder.decode(chunk, { stream: true });
        let nl = buffered.indexOf('\n');
        while (nl !== -1) {
          const line = buffered.slice(0, nl).trim();
          buffered = buffered.slice(nl + 1);
          nl = buffered.indexOf('\n');
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') continue;
          let frame;
          try {
            frame = JSON.parse(payload);
          } catch {
            continue; // a keep-alive or a frame we don't model; not fatal
          }
          const choice = (frame.choices || [])[0];
          if (!choice) continue;
          if (choice.finish_reason) finishReason = choice.finish_reason;
          const delta = choice.delta || {};
          if (Array.isArray(delta.tool_calls) && delta.tool_calls.length) {
            for (const tc of delta.tool_calls) {
              const i = tc.index ?? toolCalls.length;
              toolCalls[i] = toolCalls[i] || { id: tc.id, type: 'function', function: { name: '', arguments: '' } };
              if (tc.id) toolCalls[i].id = tc.id;
              if (tc.function?.name) toolCalls[i].function.name += tc.function.name;
              if (tc.function?.arguments) toolCalls[i].function.arguments += tc.function.arguments;
            }
            if (onDelta) onDelta({ toolCalls: true });
          }
          if (typeof delta.content === 'string' && delta.content) {
            text += delta.content;
            if (onDelta) onDelta({ content: delta.content });
          }
        }
      }
    } catch (err) {
      if (ctl.signal.aborted) throw abortedError();
      throw unavailable(err);
    } finally {
      clearTimeout(t);
      if (signal) signal.removeEventListener('abort', onAbort);
    }
    return { text, finishReason, toolCalls: toolCalls.filter(Boolean) };
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

module.exports = {
  listModels, loadModel, unloadModel, routerHealth,
  chatComplete, chatCompleteStream, modelSupportsImages,
};
