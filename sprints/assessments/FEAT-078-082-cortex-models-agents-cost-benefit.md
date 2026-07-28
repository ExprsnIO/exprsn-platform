# Cost/Benefit — FEAT-078…FEAT-082 (Cortex models & agents track)

**Assessed:** 2026-07-28 · **Analyst:** cost-benefit-analyzer · **Tickets:** FEAT-078 (M),
FEAT-079 (L), FEAT-080 (L), FEAT-081 (L), FEAT-082 (L) — all P2, `backlog`, Cost/Benefit `pending`.
**Source plan:** `sprints/proposals/cortex-feature-plan.md` (Rick's 31-feature selection, 2026-07-28).
**Surfaces read:** BACKLOG ticket blocks (lines 2933–3056); `services/cortex/src/backends/index.js`
(registration + failover + queue-only invariant), `lib/llama.js` (router client, load/unload,
concurrency pools), `engine/agent.js` (tool loop + 3 hard-coded personas), `engine/jobs.js`
(flows, Bull enqueue + in-process fallback), `queues/index.js` (cortex-tasks, attempts:1);
standalone calibration: `/Volumes/Storage/exprsn-cortex/src/agents/` (AgentRunner 240 ln — all
9 step cases confirmed, agentService 79, conditions 77, template 45, toolLoop 106) and
`src/models-runtime/` (ModelLifecycleManager 196, ollamaClient 231, catalog 128, preflight 76).
**Sprint load:** no active sprint file exists (`sprints/active/` empty; 2026-11/12 archived) —
the next cycle is unplanned, so capacity is open. Sequencing per the backlog note: FEAT-080 is
the keystone; FEAT-078 is independent and parallelizable; TASK-062 (S) is a cheap prerequisite
for FEAT-082's webhook path.

**Shared context that shapes every verdict below:** cortex is flag-gated (`CORTEX_ENABLED`,
default false) and local-LLM only; the direct beneficiary today is the platform owner/operator,
not end users — value is "agentic platform parity with standalone Exprsn-Cortex," an explicit
owner goal, not a user-demand signal. Infra is favorable: `worker:cortex` already runs, Bull/Redis
are in place, and every schema change in this track is new-tables-only in the `cortex` schema
(sync `db:migrate` suffices — no ALTER trap). QA cost is real on all five: the cortex module
suite is the only guard (CI `test:all` is non-blocking); budget qa-specialist time per ticket.

---

## FEAT-078 — Ollama first-class gateway backend + model preflight on /ready

**Cost.** Effort M is honest but splits unevenly. `model-preflight` is a true S: `lib/llama.js`
already has `listModels`/`routerHealth`, `backends/ollama.js` exists, and the standalone's
`preflight.js` is 76 lines — this is health-route plumbing. `ollama-primary` is the real work,
and it is **not** "backend-selection logic only" as the ticket note claims: it reverses a
deliberate two-layer architectural invariant from FEAT-072/ADR 0005. Layer 1 is the worker-only
registration gate (`backends/index.js:59`); layer 2 throws `SyncCallForbiddenError` when a
secondary is used outside a job context (`index.js:144`). `CORTEX_OLLAMA_ROLES` must relax both
coherently, and every regression test that encodes the invariant needs a flagged-on twin.
Maintenance: one more env-flag matrix cell (flag on/off × gateway/worker) forever.

**Risk.** (1) **Governance:** this supersedes an ADR-backed invariant — systems-architect must
sign off on the supersession before build; do not let an env flag silently retire an ADR.
(2) **Performance:** the invariant existed because Ollama is the slow CPU-only path; routing
brain/judge into gateway-synchronous flows (chat turns are direct in-process calls behind the
LLM semaphore, per `queues/index.js` header) can push interactive latency from seconds to
minutes and pin gateway concurrency slots. The AC's "unset ⇒ unchanged" default-off posture is
the right mitigation and must survive review. No security-invariant impact.

**Value.** Real for operators without a llama.cpp router (Ollama-only boxes cannot run the
gateway roles today), and it is the recommended base for FEAT-079's lifecycle covering both
backends. Preflight closes a genuine ops gap: today a missing model 503s at first inference
instead of failing readiness by name.

**Cheaper alternative / smaller slice.** Alternative: keep the invariant and document
"Ollama-only deployments run everything through the worker" — costs ~0 but blocks the
FEAT-079/091 parity story. Smaller first slice: land **preflight only (S)** now — it is
uncontested, backend-agnostic, and needed regardless — and gate the ollama-primary half on the
architect's ADR call.

**Verdict: APPROVE (M) — conditional on systems-architect sign-off superseding the ADR-0005
queue-only invariant for the flagged path.** The flag-off default preserves current behavior,
the preflight half is cheap and unambiguous, and the ollama-primary half unlocks
Ollama-only deployments plus a cleaner FEAT-079. If the architect declines the supersession,
ship preflight alone as an S and re-scope the rest.

---

## FEAT-079 — Model lifecycle admin API + per-model config + curated catalog

**Cost.** L (M+S+M) is roughly honest with one cap (below). The lifecycle API is *not* a thin
wrapper: `lib/llama.js` exposes load/unload/list only — **pull and delete are Ollama-native
operations the llama.cpp router does not have** — so the API must be backend-aware
(llama.cpp: load/unload/reload; Ollama: + pull/delete), which is design work the ticket text
elides. Per-model locking + audit rows and per-model config are straightforward
(standalone `ModelLifecycleManager.js` is 196 ln as a reference). New tables
(model_config, model_audit, catalog) — sync migrate OK, `db:check` clean per the ticket note;
dba glance on the audit-table growth/retention (TASK-064's sweeper should cover it).
Long-running ops (pull/load can take minutes — `llama.js` already uses a 300 s load timeout)
need async job semantics or generous route timeouts; budget that in.

**Risk.** Moderate. These are admin-only destructive ops — the 401/403 AC and per-model
409-locking are the safety story and must be tested, not assumed. Unload/delete of the
resident brain model while chat traffic is in flight is the sharpest edge (the breaker/failover
in `backends/index.js` softens it, but expect a QA scenario for it). Catalog scope creep is the
budget risk: the standalone "catalog" is a **128-line static registry** — if this ticket grows
a curation backend (admin CRUD on catalog entries, remote metadata sync), it is no longer L.

**Value.** High for the operator: model management currently requires shell access to the
router/Ollama; this is the single biggest day-to-day ops gap vs the standalone, and FEAT-091
(frontend parity) explicitly needs the catalog shapes. Per-model config carries the KB binding
slot FEAT-095 will honor.

**Cheaper alternative / smaller slice.** Alternative: skip the catalog entirely — the operator
can `ollama pull <name>` by hand; that shrinks this to M but breaks FEAT-091's catalog surface.
Smaller first slice: **lifecycle + per-model config (M)** with the catalog as a seeded static
JSON registry ported from the standalone's `catalog.js` (S, follow-up or same-sprint filler).

**Verdict: APPROVE (L) — with the catalog explicitly capped at a static/seeded registry
(port of the standalone's ~25-model list) in the AC; a dynamic curation backend re-sizes the
ticket and needs re-grooming.** Recommend FEAT-078 first as the ticket already notes, so
lifecycle lands backend-aware once instead of being retrofitted.

---

## FEAT-080 — DB-backed agent definitions + run history + NL agent builder

**Cost.** L (M+S+S) is honest. The real work is untangling the 3 hard-coded personas
(`engine/agent.js:323–377` — TASK/CHAT/CS system prompts + per-persona tool wiring) into a
spec-driven path while `engine/jobs.js`'s five flows keep working byte-for-byte, plus the
draft→tests-pass→enabled lifecycle. Run history is genuinely S (today `AgentTask` holds one
transcript; a `cortex.agent_runs` ledger + paginated GET is model+route work). NL builder is S
by precedent — `registryFactory /build` already does exactly this shape for tools/guardrails.
New tables only; sync migrate OK. Maintenance: a real new entity with lifecycle rules — the
largest permanent surface increase in this track, but it *replaces* hard-coded config rather
than adding beside it.

**Risk.** The riskiest AC is **"enable is blocked until the agent's tests pass"** with test
semantics undefined. LLM-executed tests on local models are nondeterministic and slow —
a flaky enable gate would make the feature feel broken. Recommend the PM pin the definition at
grooming: deterministic spec validation (schema, referenced tools/skills/guardrails exist,
model resolvable) as the hard gate, with an optional recorded smoke-run as advisory — do not
promise LLM-judged test suites in v1. Second risk: seeded-persona regression — the existing
cortex suite plus a persona-parity test is the harness; make it an explicit AC artifact.

**Value.** Highest in the track. This is the **keystone**: FEAT-081/082/091 and half of
FEAT-095 are blocked on it, and it converts cortex from a 3-persona demo into an agent
platform — the core of the parity goal. Building anything else in the agent lane first would
be building on the hard-coded personas we're about to delete.

**Cheaper alternative / smaller slice.** Alternative: config-file-defined agents (JSON on
disk, no DB) — cheaper by ~1/3 but forfeits run history, lifecycle state, and everything
downstream expects rows; false economy given four dependent tickets. Smaller first slice:
**entities + runs (M+S), NL builder trailing** — the builder is additive sugar and can slip a
sprint with zero downstream impact.

**Verdict: APPROVE (L).** Keystone with four dependent tickets, favorable schema profile
(new tables only), and a cheap NL-builder tail that can be dropped from the sprint if it runs
long. Condition: PM pins "tests pass" semantics (deterministic validation gate, advisory smoke
run) in the AC before promotion.

---

## FEAT-081 — Multi-step agent chaining engine (9 step types)

**Cost.** L for a single feature, and the reference implementation is smaller than the size
suggests — the standalone's entire step engine is ~550 lines (AgentRunner 240 + conditions 77 +
template 45 + toolLoop 106 + service 79). The module port costs more than the port itself:
per-step guardrail evaluation and moderate-hook routing (jobs.js patterns), per-step transcript
entries into the FEAT-080 run ledger, and execution inside the Bull worker context. The
complexity concentrator is **`parallel`**: fan-out/fan-in, partial-failure semantics, and
transcript interleaving — and its runtime value is largely illusory here, because all steps
funnel through the single-resident-model router behind the `lib/llama.js` semaphore
(`CORTEX_LLM_CONCURRENCY`), so "parallel" LLM steps serialize anyway. `retrieve` is
contractually a graceful no-op until FEAT-095 (good — keep it, it's trivial).

**Risk.** Moderate-high for its size class: an execution engine is the kind of surface where
edge cases (condition on missing var, guardrail-halt mid-parallel, step timeout) breed bugs,
and the non-blocking CI suite won't catch them — the module-lane test plan is a first-class
cost here. No schema or security-invariant impact (guardrails are *added* per-step, never
bypassed — make that an explicit AC line).

**Value.** High-conditional: it is what makes FEAT-080's agents *do* anything beyond the flat
tool loop, and FEAT-091 frontend parity assumes the step vocabulary. But 7 of the 9 types
deliver ~all the practical value; `parallel` delivers complexity.

**Cheaper alternative / smaller slice.** Alternative: extend the flat tool loop with pre/post
skill+guardrail hooks only — cheap but abandons parity and the standalone's spec format;
rejected. Smaller first slice: **sequential engine with 8 step types (prompt · skill ·
retrieve-noop · guardrail · moderate · transform · condition · tool_loop) at M/L, `parallel`
deferred to a follow-up S/M ticket** once the sequential engine has soaked. The spec format
should accept `parallel` from day one (validate, reject at enable-time with "not yet
supported") so no agent definitions need rewriting later.

**Verdict: APPROVE-REDUCED — sequential-first: 8 step types now (size M/L), `parallel` split
into a follow-up ticket.** The single-resident-model semaphore makes parallel's benefit mostly
cosmetic today while it carries the largest share of the engine's failure-mode complexity;
deferring it converts the riskiest L in the track into a well-referenced M/L with a
copy-adjacent standalone implementation.

---

## FEAT-082 — Scheduled agent runs + platform event triggers

**Cost.** L (M+M), but the two halves are unequal. **Scheduling (M, honest):** Bull repeatable
jobs + one-shot delayed jobs on the existing `cortex-tasks`/a sibling queue, schedule CRUD
rows (new tables, sync migrate OK), runs landing in the FEAT-080 ledger with `scheduled`
origin. Known Bull sharp edge: removing a repeatable job requires the exact original repeat
options — persist them on the schedule row or orphans accrue; the AC's "no orphan repeatable
jobs" line is right, and the ticket's dba-glance note stands. Keep `attempts: 1`
(agent runs are non-idempotent per `queues/index.js`) and define misfire policy
(skip, don't backfill) explicitly. **Triggers (the under-costed half):** the primitives are
cheap — a `triggerAgent()` on the in-process façade (`client.js`) and an HMAC webhook endpoint
once TASK-062 lands (`authenticateService()` is ready per the plan). But **there is no
platform event bus**: "run agents on platform events" actually means each emitting module
(timeline, spark, moderator…) adds explicit call-sites — cross-module coupling and per-module
review that this ticket does not cost, and that inflates unboundedly if left in scope.

**Risk.** Runaway-schedule risk (a misconfigured cron on a minutes-long local-LLM run can
saturate the worker — add a per-agent concurrency/overlap guard: skip if previous run still
active); orphan-repeatable hygiene; disabled-agent enforcement must cover both schedule fire
and trigger fire (AC has it). Webhook path must remain HMAC-only — never a bare unauth'd
endpoint into agent execution.

**Value.** Scheduling is the top operator ask in this lane (recurring digests, sweeps,
report agents) and is pure standalone parity. Trigger *primitives* unlock future per-module
integrations cheaply; the integrations themselves have no committed consumer yet.

**Cheaper alternative / smaller slice.** Alternative: cron-from-outside (host crontab curling
the run endpoint) — near-zero build but no CRUD, no restart-survival, no ledger origin, and an
auth surface outside the platform; rejected as the permanent answer. Smaller first slice =
the recommended scope: **scheduling + trigger primitives (façade `triggerAgent` + HMAC
webhook), with zero emitting-module wiring** — each actual module→agent event integration is
its own follow-up S ticket owned by the emitting module.

**Verdict: APPROVE-REDUCED (size M/L) — scheduling in full, triggers reduced to the two
primitives (in-process façade call + TASK-062-authenticated webhook); wiring any specific
module's events is explicitly out of scope and files as per-module follow-ups.** This keeps
the ticket bounded, defers the uncosted cross-module coupling until a real consumer exists,
and still delivers the entire scheduling value. Blocked-by FEAT-080 stands; land TASK-062
first (cheap, already flagged early in the backlog note).

---

## Track-level notes for the PM

- **Sequencing (unchanged from the backlog note, now cost-validated):** TASK-062 (S) early →
  FEAT-080 (keystone) → FEAT-081-reduced / FEAT-082-reduced; FEAT-078 → FEAT-079 run as a
  parallel models lane. FEAT-078's architect gate (ADR-0005 supersession) and FEAT-080's
  "tests pass" semantics are the two decisions to schedule at grooming, before build.
- **Honest capacity math:** as approved/reduced this is ≈ M + L + L + M/L + M/L ≈ 2–3 standard
  cycles for a single implementer, ~1.5–2 with two (models lane and agents lane are disjoint
  surfaces). Do not put all five in one sprint.
- **Reductions create two follow-up tickets to file at grooming:** `parallel` step engine
  (S/M, blocked-by FEAT-081) and per-module event-trigger wiring (S each, per emitting module,
  blocked-by FEAT-082).
- **Escalations:** systems-architect — FEAT-078 ADR-0005 supersession + FEAT-081 engine shape
  review; dba — FEAT-079 audit-table retention + FEAT-082 Bull repeatable hygiene (both
  new-tables-only otherwise); qa-specialist — FEAT-081 step-engine edge-case plan is the
  single largest test-cost item in the track.

## Paste-ready decision lines

> - **FEAT-078 Cost/Benefit: done (2026-07-28)** — APPROVE, M, conditional on
>   systems-architect sign-off superseding the ADR-0005 queue-only Ollama invariant for the
>   flagged path (`CORTEX_OLLAMA_ROLES`, default-off preserves current behavior); preflight
>   half is an uncontested S — ship it alone if the ADR call goes the other way. Full:
>   `sprints/assessments/FEAT-078-082-cortex-models-agents-cost-benefit.md`.
> - **FEAT-079 Cost/Benefit: done (2026-07-28)** — APPROVE, L, with the catalog capped in the
>   AC at a static/seeded registry (standalone `catalog.js` port); lifecycle must be
>   backend-aware (pull/delete are Ollama-only — llama.cpp router has no such ops). Prefer
>   FEAT-078 first. Same assessment file.
> - **FEAT-080 Cost/Benefit: done (2026-07-28)** — APPROVE, L. Keystone (gates
>   FEAT-081/082/091 + half of FEAT-095), new-tables-only. Condition: PM pins "tests pass"
>   enable-gate semantics as deterministic spec validation + advisory smoke run (no LLM-judged
>   suites in v1). NL builder is a droppable tail. Same assessment file.
> - **FEAT-081 Cost/Benefit: done (2026-07-28)** — APPROVE-REDUCED, M/L: sequential engine
>   with 8 step types now (retrieve as graceful no-op per AC); `parallel` split to a follow-up
>   S/M — the single-resident-model semaphore serializes it anyway while it carries most of
>   the engine's failure-mode complexity. Spec format accepts `parallel` from day one
>   (rejected at enable-time until supported). Same assessment file.
> - **FEAT-082 Cost/Benefit: done (2026-07-28)** — APPROVE-REDUCED, M/L: scheduling in full
>   (Bull repeatable + one-shot; persist repeat opts for clean removal; keep attempts:1;
>   per-agent overlap guard) + trigger primitives only (in-process `triggerAgent` façade +
>   TASK-062 HMAC webhook). Emitting-module event wiring is out of scope — per-module
>   follow-up S tickets. Same assessment file.
