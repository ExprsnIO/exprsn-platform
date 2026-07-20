'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Backend driver contract (FEAT-072, ADR 0005).
 *
 * Cortex speaks to a local LLM through a DRIVER, never to a specific server's
 * wire protocol. There are two drivers today — llama.cpp (primary) and Ollama
 * (secondary) — and they answer to the same shape so the registry can select
 * one by ROLE and fail over between them without any caller knowing which
 * server actually answered.
 *
 * A driver is a plain object (not a class) with these members. Anything a
 * caller reaches for that is NOT on this contract is a leak of one server's
 * semantics into shared code — e.g. llama.cpp's `/models/load` residency dance
 * lives entirely inside the llamacpp driver and must never surface here.
 *
 * @typedef {'brain'|'judge'|'vision'} Role
 *
 * @typedef {Object} ChatResult
 * @property {string} text            assistant message text ('' is possible)
 * @property {string|null} finishReason  e.g. 'stop' | 'length' | null
 *
 * @typedef {Object} Driver
 * @property {'llamacpp'|'ollama'} name
 * @property {{ managesResidency: boolean, acceptsImages: boolean, pullable: boolean }} capabilities
 *   managesResidency — the server LRU-swaps a single resident model and can
 *     answer mid-load with an empty body (llama.cpp). ensureResident must then
 *     block until the model is actually loaded. Ollama auto-loads per request,
 *     so its ensureResident is a cheap presence assert.
 *
 * @property {(role: Role) => (string|null)} modelFor
 *   Resolve this backend's model id for a role from config. Pure — NO network.
 *   Returns null when this backend does not serve that role (→ not eligible).
 *
 * @property {() => Promise<boolean>} health
 *   Cheap reachability probe (≤3s). NEVER throws — returns false on any error.
 *
 * @property {(modelId: string) => Promise<boolean>} supportsVision
 *   Does this model actually accept image input? (llama.cpp: input_modalities;
 *   Ollama: /api/show capabilities contains "vision".) May throw on transport
 *   failure — the caller treats that as "backend unavailable".
 *
 * @property {(modelId: string, o: { timeoutMs: number }) => Promise<void>} ensureResident
 *   Block until the model can serve a completion. llama.cpp: poll+nudge the
 *   loader. Ollama: assert the tag is present (optionally pull if configured);
 *   the server loads it on first token. Throws (backend-unavailable) if it
 *   cannot get the model ready within timeoutMs.
 *
 * @property {(modelId: string, messages: object[], opts: object,
 *            o: { pool: 'text'|'vision', timeoutMs: number }) => Promise<ChatResult>} chatComplete
 *   Non-streaming chat completion. `opts` merges into the request body
 *   (temperature, max_tokens, tools, …). `pool` selects the concurrency
 *   semaphore. Throws on transport failure / non-2xx (→ backend-unavailable);
 *   returns an empty `text` only when the server genuinely produced none.
 * ═══════════════════════════════════════════════════════════
 */

// This module is documentation-only: the contract lives in the JSDoc above so
// both drivers and the registry can `@type {import('./types').Driver}` against
// it. Exporting the role list keeps the one canonical enumeration in one place.
const ROLES = ['brain', 'judge', 'vision'];

module.exports = { ROLES };
