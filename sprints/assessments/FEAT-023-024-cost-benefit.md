# Cost/Benefit — FEAT-023 & FEAT-024 (cortex as an in-process LLM source)

**Analyst:** cost-benefit-analyzer · **Date:** 2026-07-09
**Tickets:** FEAT-023 (shared cortex client + moderator provider), FEAT-024 (lowcode cortex action + AI field)
**Scope note:** Nexus (FEAT-025) and Spark (FEAT-026) are deferred out of this slice by Rick; not assessed here.

Both tickets are grounded in the actual code read this pass:
- `services/moderator/src/ai-providers/index.js` (the live `AIProviderFactory`), `services/moderator/services/moderationService.js` (the verdict path — `moderateContent`), `services/moderator/src/ai-providers/claude.js` + `deepseek.js` (the score shape).
- `services/cortex/src/engine/agent.js` (`simpleChat`/`judge`/`chatCompletion`), `services/cortex/src/lib/llama.js` (the `withSlot` semaphore, `CORTEX_LLM_CONCURRENCY` default 2, 600 s chat timeout, 300 s model-load timeout), `services/cortex/src/lib/cache.js` (lazy Redis).
- `services/lowcode/src/services/moduleActions.js` (auto-discovered `MODULE_ACTIONS` + capability gate), `flowEngine.js` (dispatcher + `LcFlowRun` step recording), `typeSystem.js` (`validateRecord` — confirmed synchronous/pure), `entityService.js` (`createRecord`/`updateRecord` async write path), `aiAssist.js` (the direct Anthropic client, part c).
- `src/config/index.js` L95–105 (`config.cortex.*` defaults), `services/moderator/config/index.js` L77 (`config.ai.local`).
- **Live empirical run (coordinator, 2026-07-09):** moderator's exact moderation prompt against the running llama router (qwen3-30b-a3b) — see FEAT-023 Half 2.

---

## Shared structural facts (apply to both tickets)

1. **No schema change, no new queue, no new worker, no new module.** Neither ticket adds a Postgres schema, a Bull/RabbitMQ queue, or a running process. Infra/ops footprint is near-zero *incrementally* — the llama.cpp router and its semaphore already exist from FEAT-021. **No `db:migrate` ALTER trap, no dba migration gate.** This is the cheapest possible cost profile for an LLM feature.

2. **The `agent.js` binding is the right structural call — credit it.** `agent.js` top-level requires are only `../config`, `../lib/llama`, `../lib/cache` (verified) — **no Sequelize models, no Bull, no `promptLog`, no moderator/axios.** Two consequences:
   - Requiring the client when cortex is dark is safe: `cache.js` creates its ioredis client lazily inside `initCache()` (`client = null` at load), so as long as `cortexClient` never calls `initCache()`, requiring it opens **no** DB/Redis connection — FEAT-023 AC ("requiring it never opens a DB/Redis connection") is achievable. Implementer must confirm the client path stays cache-miss-only when cortex is off.
   - Content routed through `simpleChat`/`judge` is **not** persisted to cortex's `prompt_logs` (that lives in the `jobs.js`/models flow layer, which `agent.js` does not touch). So neither moderation content nor lowcode AI-field inputs land in cortex's data-at-rest tables — a genuine plus, and it removes the PII concern that (correctly) blocks the Spark ticket (FEAT-026).
   - The moderator→cortex→moderator cycle is **structurally impossible** (the `moderatorScreen()` call lives only in `jobs.js`, which is not on this path), not merely guarded. The loop guard in `moderationService` becomes defence-in-depth, which is the right posture.

3. **Coupling / two-copy-of-shared cost — route to systems-architect.** Placing `cortexClient.js` in `shared/` inverts the intended layering: `@exprsn/shared` is module-agnostic infra, and this makes it hard-require a leaf module (`services/cortex/src/engine/agent.js`). Worse, the repo keeps **two copies of shared** (`shared/` = `@exprsn/shared`; `services/shared/` = relative-require copy) that must stay in sync, and the relative path to `agent.js` **differs between the two copies** (`../../services/cortex/...` vs `../../cortex/...`) — a real sync trap. **Recommendation:** the client lives in `shared/` only and is consumed via `@exprsn/shared`, with the `agent.js` binding done by a **lazy require inside the function** (not top-level), so the layering inversion is contained and the dark-cortex require-safety holds. This is a structural decision — get **systems-architect** sign-off before build.

4. **Config home.** FEAT-023 nominates `config.ai.local` as the home, but that block (`services/moderator/config/index.js` L77) is a *different* shape (`LOCAL_ML_ENABLED` + on-disk model paths for local ML classifiers), not an LLM-router provider. Overloading it is confusing. Cortex already has a clean config surface (`config.cortex.*` + `CORTEX_ENABLED` in `src/config/index.js`) — key the provider off that instead. Minor, non-blocking.

---

## FEAT-024 — Lowcode cortex action + AI field

### Cost
- **Effort: M, lower half of M.**
  - **(a) `cortex` action** in `MODULE_ACTIONS` — genuinely cheap. The flow engine auto-discovers action types (`isModuleAction`/`actionTypes` → `flowEngine.runAction`), and `moduleActions.run` already wraps every action in the capability gate + fail-soft `{ error }` contract. So the ticket's "picked up for free by `knownActionTypes()`/`validateActions()`/the dispatcher" claim is **accurate** — this is one entry object with `{ capability, run }`, calling `cortexClient.simpleChat` instead of the HTTP `post` helper. ~S on its own.
  - **(b) AI-backed field** is the real work. Confirmed: `typeSystem.validateRecord` is synchronous/pure (`formula.evaluate` is sync), so an AI field cannot ride the `formula` path — it must be computed in the async write path (`entityService.createRecord`/`updateRecord`). That means a new field-def kind through `validateFieldDef`, a compute step after `validate()` in both create and update, timeout handling that surfaces as a field error (never an indefinite block), and a decision on recompute-on-update semantics. This is the M driver.
  - **(c) `aiAssist` repoint** is optional and cheap — swap the direct Anthropic client for `cortexClient` when `CORTEX_ENABLED`, keep cloud as fallback. Nice side benefit: today the studio AI-assist button hard-requires `CLAUDE_API_KEY`; repointing lets it work with zero cloud spend.
- **Maintenance:** low. One more action shape + one field kind, both inside existing fail-soft contracts.
- **Risk: low. Not safety-critical.** A flow-action or AI-field error is recorded on the `LcFlowRun` step / as a field error and never throws into the emitting request — the existing contract already guarantees graceful degradation. Worst case is an empty/failed AI field or a flow step marked `error`, not user harm. **One latency caveat:** an AI field computed inline in `createRecord`/`updateRecord` inherits the same ~2–3 s warm / up-to-minute cold LLM latency measured below, so a bulk record import that populates an AI field per row will serialize behind the concurrency-2 semaphore — bound it with a per-field timeout (already in the AC) and consider skipping AI fields on bulk/import writes.

### Value
- **A new zero-marginal-cost LLM primitive for lowcode** — the cleanest value in either ticket. Flows and entities get an LLM building block with no per-call cloud spend and no cloud key required. Part (c) additionally removes the hard `CLAUDE_API_KEY` dependency from the studio AI-assist, so AI authoring works on a purely local deployment.
- Beneficiaries: every lowcode app author; unblocks richer flow/entity patterns. P1 as filed is defensible.

### Cheaper alternative / smaller slice
- **Ship (a) + (c) first, defer (b).** The action and the aiAssist repoint are S-sized, low-risk, and deliver most of the "LLM primitive" value immediately. The AI-*field* (b) carries all the M-weight (write-path plumbing, recompute semantics, timeout-as-field-error) and can follow once the client is proven in the action path.

### Verdict: **BUILD NOW.**
Low risk, no infra/schema cost, clean high-value capability, and it exercises the shared client on the non-safety-critical path first. Smaller slice (a+c now, b next) is available if capacity is tight but the whole ticket is a reasonable single M. **Blocked-by FEAT-023's shared client** — that dependency is real; sequence the client first (see below).

---

## FEAT-023 — Shared cortex client + moderator provider

Two very different halves under one ticket. They should be assessed — and likely sequenced — separately.

### Half 1: the shared `cortexClient` (the enabler)
- **Cost: S–M.** A lazy, fail-soft wrapper over `agent.js` `simpleChat`/`judge`/`chatCompletion` that degrades cleanly when `CORTEX_ENABLED=false` or the router is down (the `llama.js` transport already raises `503 LLM_UNAVAILABLE`, which the client catches and turns into a soft result). Risk is low **provided** the layering/two-copy concerns in shared-fact #3 are handled with architect sign-off.
- **Value:** it is the dependency for FEAT-024 and the moderator provider both. Build it first regardless.
- **Verdict on this half: BUILD NOW.**

### Half 2: cortex as a *selectable, enforced* moderation provider
This is the expensive, safety-critical half and the reason the ticket cannot simply be "build now."

#### Empirical evidence (live router, qwen3-30b-a3b, 2026-07-09 — coordinator-run)
Moderator's exact moderation prompt was run against the live local router, 5 hand-picked cases:
- **Quality (better than feared):** 5/5 parsed with strict `JSON.parse` (the deepseek.js `JSON.parse(message.content)` pattern works unmodified — minimal shape-adapter cost); 5/5 had all 7 numeric fields; classification correct on all 5 (positive → risk 0; spam+URL → spam 95 / risk 85; direct insult → toxicity 95; explicit threat → violence 95; benign → risk 0).
- **Latency (the real blocker):** warm calls 1.78 / 2.33 / 2.50 / 2.78 s; **first/cold call 53.6 s** (model load or swap), with a 2m15s cold turn observed earlier in the session. Semaphore concurrency 2; `/api/moderate/content` is on the **synchronous content-publish path**.

**What this changes:** on this small, obvious-case sample, **accuracy is not the immediate blocker I feared — sustained ~2–3 s added publish latency plus a multi-second-to-minute cold start on a synchronous path is.** The accuracy concern is downgraded, *not* retired: 5 hand-picked unambiguous cases say nothing about where classifiers actually fail (sarcasm, coded/contextual hate, adversarial evasion, multilingual, borderline NSFW). A real benchmark stays a required gate before enforcement — see conditions.

#### Risk #1 — synchronous LLM latency + router contention (now the primary risk)
`moderateContent` `await`s `aiProviderFactory.analyzeContent` inline; whoever calls `/moderator/api/moderate/content` synchronously (content-creation paths force-route through moderator) eats that latency. With cortex that is an LLM call behind the `withSlot` semaphore (`CORTEX_LLM_CONCURRENCY` default **2**), on a **single-resident-model** router.
- **Warm cost:** +~2–3 s on every moderated publish. Tolerable for some flows, not for interactive posting.
- **Cold/​swap cost:** 53.6 s measured, 2m15s observed. A cold model — or a model *swap* forced when interactive cortex chat/agent tasks use a different model — injects a ~1-minute stall into the *next* moderation verdict, up to the 600 s chat timeout. Publish hangs.
- **Under concurrent load (concurrency 2, ~2.5 s warm):** steady-state throughput ceiling ≈ 2 ÷ 2.5 s ≈ **0.8 verdicts/sec**. Beyond that the semaphore queue grows without bound and publish latency climbs unboundedly. With N simultaneous publishes the last one waits ≈ ⌈N/2⌉ × 2.5 s before it even starts. And moderation shares that same 2-slot semaphore with **interactive cortex chat + agent tasks** — heavy moderation starves cortex UX and vice versa, and any cortex model swap re-triggers the cold path for moderation. Cloud providers have neither this contention nor a shared cold-start.

This is why cortex must **not** be an enforced *synchronous inline* moderation provider without one of: keep-resident/warm-up + tight timeout + **fail-open to a cloud provider**, or moving the cortex verdict **off the publish path** (async/queued). The inline `await` in `moderateContent` is the architectural bottleneck → **systems-architect** call.

#### Risk #2 — verdict QUALITY on a safety-critical path (downgraded, not cleared)
`moderateContent` drives `determineAction` → auto-approve / manual-review / auto-reject. A worse classifier under-blocks (harm) or over-blocks (silent censorship) — a correctness regression, not a perf one. The 5-case run is encouraging but is not a benchmark. The ticket's ACs prove the score *shape* maps and the loop guard fires; they do **not** prove verdict quality. **A real accuracy benchmark against the incumbent cloud providers on a labeled/representative set (per category — toxicity/violence/NSFW/hate weigh most, plus adversarial/sarcasm/multilingual) is a REQUIRED condition before enforced production enablement.** Shadow mode (below) is the vehicle to gather exactly this.

#### Maintenance
A second provider shape to keep in step with the rule-engine score contract, plus prompt-tuning drift as local models change. Moderate, ongoing.

### Value (of Half 2)
Replacing per-call cloud moderation spend (`CLAUDE_API_KEY`/`OPENAI_API_KEY`/`DEEPSEEK_API_KEY`) and keeping moderated content **on-prem / no external egress** are both real — **but conditional.** Cortex is *selectable*, not default (Rick's decision), so spend only drops and egress only stops **if operators select it**, which they should not until quality + latency posture clear the bar. Until then the value of Half 2 is latent; the near-term win is having the *option* proven in shadow.

### Recommended slice + required conditions (answers the coordinator's a/b/c)
1. **Build the shared client now** (Half 1) — unblocks FEAT-024 immediately.
2. **(a) Shadow-mode first for the moderator provider — REQUIRED.** Build the provider plumbing now but ship it computing a verdict **alongside** the enforced cloud provider (all or sampled traffic), logging both for comparison; the **cloud verdict is the one enforced.** Shadow mode is the single lowest-risk way to gather *both* the accuracy-vs-cloud data (Risk #2) *and* the real latency-under-load distribution (Risk #1) from production traffic, at zero user risk. Reuses nearly all the provider code.
3. **A real accuracy benchmark against the cloud providers — REQUIRED gate before any enforced enablement.** Stated explicitly: cortex must not become a *selectable enforced* production moderation provider until its shadow scores clear an agreed per-category bar vs the incumbents on a representative labeled set. 5 hand-picked cases do not qualify.
4. **(c) + latency posture at enforcement — REQUIRED.** When/if enforced, the provider must **keep the moderation model resident / warm** (or accept a swap penalty only off the publish path), enforce a **tight timeout**, and **fail open to a cloud provider** on timeout/cold/contention so a cold load can never stall content creation. Given concurrency-2 contention with interactive cortex, strongly prefer **(b) async/queued moderation** for the cortex path (the platform already routes queue/workflow work async via `queueRegistry`/`workflowEngine`; only the inline `analyzeContent` await is synchronous) — architect to scope whether the cortex verdict moves off the inline path.

Net: capture the lowcode value and the on-prem-moderation *option* (shadow) now; refuse to put an unvalidated, cold-start-prone classifier on a safety-critical *enforced synchronous* path.

### Verdict: **SMALLER SLICE / BUILD LATER on the enforced half.**
Build the shared client and the moderator provider *in shadow/eval mode* now; do **not** make cortex a selectable **enforced** production moderation provider until (i) a per-category accuracy benchmark vs the cloud providers clears a bar, and (ii) the provider is warm/resident + tight-timeout + fail-open-to-cloud, ideally moved off the synchronous publish path. The client + shadow harness are low-risk and worth this cycle; the enforcement flip is a deliberate later decision the PM owns.

---

## Handoffs
- **product-manager (Rick):** both assessed and ready to groom. Suggested grooming: FEAT-024 → `ready` as a straight M (or slice a+c first). FEAT-023 → split the enforced-provider selectability out of the "build now" scope; groom "client + shadow-mode provider" as the ready slice and hold enforced selectability pending the benchmark + latency posture. The accuracy-benchmark bar and the enforcement flip are ship/no-ship calls — yours.
- **systems-architect:** two items. (1) `cortexClient` placement — the `shared/` → `services/cortex` layering inversion + the two-copy-of-shared relative-path divergence (shared-fact #3); recommend client in `shared/` only, consumed via `@exprsn/shared`, lazy in-function require of `agent.js`. (2) Whether the cortex moderation verdict can move **off the synchronous `moderateContent` inline path** (async/queued) so semaphore contention + cold starts can't stall publishes — this is the crux of the enforced-half latency risk.
- **dba:** nothing to do — neither ticket touches a schema, migration, Redis keyspace, or queue. Flagged for completeness.
- **qa-specialist:** FEAT-023 Half 2 needs a real **accuracy** benchmark plan (labeled set, per-category comparison vs cloud, incl. adversarial/sarcasm/multilingual) **and** a **latency-under-concurrent-load** plan (publish latency at 1/2/4/8 concurrent moderated writes, warm vs cold, with interactive cortex traffic contending) — not just the shape/loop-guard unit tests in the AC. FEAT-024's fail-soft paths (disabled cortex → recorded step error; LLM timeout → field error) each need a negative test.
