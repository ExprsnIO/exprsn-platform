# ADR 0001 — Cortex in-process inference façade for other modules

- **Status:** Accepted (APPROVED-WITH-CHANGES) — 2026-07-09
- **Deciders:** systems-architect (structural sign-off); Rick (product decisions, 2026-07-09)
- **Tickets:** FEAT-023 (shared client + moderator provider), FEAT-024 (lowcode action + AI field)
- **Supersedes / relates:** TASK-009 (in-process calls direction), FEAT-021 (cortex module), FEAT-027 (deferred async poll/callback bridge)

## Context

FEAT-023/024 introduce the first cross-module dependency on the cortex local-LLM
module. Other modules (moderator, lowcode now; nexus/spark deferred) need to call
the local LLM in-process over loopback. Product decisions already fixed: in-process
(not loopback HTTP), cortex as a **selectable** provider (not a replacement),
explicit loop guard.

The proposal placed the client at `shared/utils/cortexClient.js` inside the
`@exprsn/shared` package, lazily requiring `services/cortex/src/engine/agent.js`.

Findings from reading the code (`engine/agent.js`, `engine/jobs.js`,
`lib/llama.js`, `lib/cache.js`, `src/index.js`, `src/config.js`, moderator's
`ai-providers/index.js`, lowcode's `moduleActions.js`, `src/modules/registry.js`,
`shared/`):

1. **Require graph holds.** `engine/agent.js` requires only `fs`, `path`,
   `../config` (a thin re-export of the platform `src/config`), `../lib/llama`, and
   `../lib/cache`. It pulls in **no** Sequelize models, **no** Bull, and **no**
   moderator. `../models`, `../queues`, `./guardrails`, and `moderatorScreen()` all
   live in `engine/jobs.js`, which `agent.js` never requires. At import time
   `lib/cache.js` sets `client = null` and does **not** call `initCache()`, and
   `lib/llama.js` only computes URL strings and semaphore state — so requiring
   `agent.js` opens **no** DB and **no** Redis connection. The agent/jobs split is
   real: because `moderatorScreen()` exists only in `jobs.js`, binding consumers to
   `agent.js` makes the moderator -> cortex -> moderator cycle **structurally
   impossible**, not merely guarded. This is the load-bearing property of the design
   and it is confirmed.

2. **Flag does not gate inference.** `agent.complete()` calls `cacheGet/cacheSet`,
   which no-op when the Redis client is null — but it still calls
   `routerMessage -> llama.chatComplete`, and `chatComplete` hits the llama router
   with **no** `CORTEX_ENABLED` check. So a consumer that calls the inference
   functions while `CORTEX_ENABLED=false` would **silently reach the LLM router
   anyway**. The client must refuse before touching `agent.js`.

3. **Layering inversion.** `@exprsn/shared` is a leaf today (nothing under
   `shared/` requires any `services/*` module). Placing the client in `shared/`
   inverts the dependency (`shared -> cortex`) and creates a `shared -> cortex ->
   shared` cycle (cortex requires `@exprsn/shared`). Node tolerates it via lazy
   require, but it makes the leaf package know about one specific module. Note:
   `services/shared` is a **symlink** to `../shared` (one physical copy, not two), so
   CLAUDE.md's "keep both copies in sync" note is stale — but that does not change
   the ruling: the single shared package must stay a leaf, which argues *against*
   putting the client there, not for it. (Recommend a separate doc-fix ticket to
   correct the stale "two copies" note; out of scope here.)

4. **Precedent, but at a different layer.** lowcode/moderator already require
   `plugins/src/services/pluginHost` — but that is a module's **published service
   singleton**, i.e. plugins' intended integration surface. `engine/agent.js` is
   documented internal port machinery. Reaching into another module's `src/engine/`
   is materially different from reaching for its published façade.

## Decision

**APPROVED-WITH-CHANGES.**

1. **Placement (c), not (a).** Do **not** put the client in `@exprsn/shared`.
   Cortex publishes its own in-process inference façade at
   `services/cortex/src/client.js`, and consumers require it via relative path
   (mirroring the `plugins/pluginHost` precedent). This keeps `@exprsn/shared` a
   leaf, removes the `shared -> cortex -> shared` cycle, and makes cortex the owner
   of the surface it exposes — free to evolve `engine/agent.js` internals behind a
   stable contract. The façade re-exports `simpleChat` / `judge` / `chatCompletion`
   from `engine/agent.js` (the inference layer) and **never** from `engine/jobs.js`
   (the flow layer), preserving the structural cycle-impossibility above.

2. **Fail-closed flag guard, before any require of `agent.js`.** Verified: neither
   `engine/agent.js` nor `lib/llama.js` reads `config.features.cortexEnabled`
   (`grep` returns nothing), so the inference layer reaches the router regardless of
   the flag. The façade gates on the flag first. Exact guard — at the top of **every**
   façade method, before the lazy require:

   ```js
   // services/cortex/src/client.js
   const enabled = () => process.env.CORTEX_ENABLED === 'true'; // same predicate as config.features.cortexEnabled
   async function simpleChat(...args) {
     if (!enabled()) throw new CortexDisabledError('cortex is disabled (CORTEX_ENABLED!=true)');
     const agent = require('./engine/agent'); // lazy: not required when disabled
     return agent.simpleChat(...args);
   }
   ```

   The `require('./engine/agent')` is **inside** the guarded function, so with the
   flag off `agent.js` (and thus `llama.js`) is never even pulled into the graph and
   the router is never touched. The gate reads `process.env.CORTEX_ENABLED` directly
   so it has no dependency on cortex internals. Consumers wrap the throw per their own
   contract (moderator: propagate/fallback; lowcode: catch -> `{ error }`).

3. **Two consumer contracts, explicit.** The façade exposes both a
   throwing surface and a fail-soft surface so each consumer honours its own
   contract (see Consequences 4/5).

## Consequences

1. **Boundary stays honest.** `@exprsn/shared` remains a leaf; there is no
   module-to-shared cycle. Consumers depend on a cortex **public façade**, not on
   `src/engine/` internals. Any future consumer (nexus/spark) uses the same façade.

2. **Cycle stays structurally impossible.** The façade must import only from
   `engine/agent.js`. A lint/review rule and a comment on the façade must forbid it
   from importing `engine/jobs.js`, `../models`, or `../queues`. VERIFY checks this.

3. **Flag off = inert.** With `CORTEX_ENABLED=false`, calling the façade never
   requires `agent.js`, never opens Redis/DB, and never reaches the router. Unit
   test required: façade called with the flag off does not hit the network.

4. **Moderation path fails CLOSED.** The moderator `cortex` provider is
   safety-critical. On LLM failure (`AppError 503 LLM_UNAVAILABLE`, router non-200,
   or timeout) it must **not** fail open (return a clean/zeroed score). It must
   throw so `AIProviderFactory`'s existing fallback chain runs; if cortex is the
   selected/only provider and fails, the verdict must resolve to **indeterminate ->
   requiresReview** (hold), never `pass`. This differs from cortex's own `llm_judge`
   guardrails, which fail open **by design** because they sit on top of the base
   guardrail verdict; here the provider *is* the verdict, so fail-open would ship
   unmoderated content. The `sourceService === 'cortex'` / `contentType ===
   'llm_message'` loop guard in `moderationService` is retained as defence in depth.

5. **Lowcode path fails SOFT.** The `cortex` `moduleAction` and the AI-backed field
   honour the existing `moduleActions` contract: on LLM failure return `{ error }`,
   record the error on the `LcFlowRun` step / as a field error, and never throw into
   the emitting request or block the write indefinitely.

6. **Latency: bounded-synchronous admissible only warm; shadow/async at load.**
   Measured against the live stack (qwen3-30b-a3b resident), moderator's exact
   moderation prompt: **warm 1.78 / 2.33 / 2.50 / 2.78s**, **cold 53.6s** (first
   call), and an earlier cold chat turn 2m15s. `lib/llama.js` serialises **all**
   completions behind `CORTEX_LLM_CONCURRENCY` (default 2); `chatComplete`'s own
   timeout is 600s. Moderator's `/api/moderate/content` is on the synchronous
   content-publish path. Ruling:
   - **A synchronous in-process call is admissible on the publish path only when the
     model is warm and only under a short bounded client-side timeout.** Set the
     provider timeout to ~**5s** (covers warm p99 ~2.8s with headroom, cuts off the
     53.6s cold path and semaphore-queued calls). On timeout -> **fail closed to
     requiresReview** (Consequence 4), never pass, never inherit `chatComplete`'s
     600s.
   - **Keep the model warm.** The 53.6s cold path must never land on a user publish
     request — cortex should preload/keep-alive the brain model so the cold path is
     paid at init, not on the request.
   - **Semaphore ceiling.** With concurrency 2 and multi-second calls, sustained
     throughput is < ~1 verdict/s; under bursty publish load requests queue behind
     the semaphore and will hit the 5s timeout. Therefore synchronous cortex
     moderation is admissible only for **low-volume / explicit opt-in**; for general
     publish load the provider must run **shadow/async** (verdict computed off the
     publish path, logged, non-blocking).
   - cortex must **not** be `DEFAULT_AI_PROVIDER` on the synchronous path until
     qa-specialist signs off warm p99 under representative concurrency. Full async
     task-backed inference is out of scope here and tracked as FEAT-027.

7. **Ownership handoffs.** No schema, migration, Redis, or RabbitMQ topology
   changes — dba review not required for this slice. New/changed routes: none new;
   the moderator provider is internal. `API_SURFACE.md` needs no new route entry;
   `ARCHITECTURE.md` gets an "inter-module inference façade" note when FEAT-023
   lands. qa-specialist owns the latency/p99 sign-off gating synchronous use.

## Required changes (binding, in priority order)

1. Move the client out of `shared/` to a cortex-owned public façade
   `services/cortex/src/client.js`; consumers require it relatively. `shared/` stays
   a leaf.
2. Façade imports only `engine/agent.js` inference functions; never `engine/jobs.js`,
   `../models`, or `../queues`. Cycle must stay structurally impossible.
3. Fail-closed flag gate evaluated **before** lazy-requiring `agent.js`; flag off ->
   no require, no router traffic, typed error / fail-soft sentinel.
4. Moderator `cortex` provider fails **closed** (throw -> factory fallback; else
   requiresReview). Never fail open. Retain the `sourceService`/`contentType` loop
   guard.
5. Moderator provider enforces a short bounded timeout; cortex is not the default
   sync provider; ship shadow/async first, pending qa p99 sign-off.
6. Lowcode action + AI field fail **soft** (`{ error }` / field error), never block
   the write or throw into the emitting request.
