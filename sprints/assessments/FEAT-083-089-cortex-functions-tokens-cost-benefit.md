# Cost/Benefit — FEAT-083…FEAT-086 (skills/functions runtime) + FEAT-087…FEAT-089 (token stack)

Analyst: cost-benefit-analyzer · 2026-07-28

Scope: seven FEATs from the Cortex agentic build-out
(`sprints/proposals/cortex-feature-plan.md`, owner-selected 2026-07-28). Two
tracks: the **execution track** — FEAT-083 (JS skills sandbox), FEAT-084
(container runtime), FEAT-085 (function registry + warm pools), FEAT-086
(versioned repository) — and the **token track** — FEAT-087 (use metering +
quotas), FEAT-088 (resource/scope enforcement), FEAT-089 (token admin UI).
The tracks are independent and can run in parallel (per the backlog note).
TASK-062 (inbound service HMAC) skips this gate and is not assessed.

Grounding read: `services/cortex/src/engine/tools.js` (seatbelt sandbox,
darwin-only fail-closed, L199–527), `engine/skills.js` (prompt-pack-only
skills), `src/middleware/auth.js` (caRead/caWrite via shared `validateCAToken`),
`src/models/index.js` (PromptLog L183), `services/ca/services/token.js`
(atomic use decrement L547–580, use-tokens-never-cached L630–642,
`matchesResource` L669, `SCOPE_INACTIVE` L410, bulk revoke + cache
invalidation L748–817), `shared/middleware/tokenValidation.js` (sends
`resource: req.path`, collapses every CA failure to 403 `INVALID_TOKEN`),
standalone `/Volumes/Storage/exprsn-cortex` — `src/skills/jsSandbox.js`
(44-line vm sandbox), `src/repository/repositoryService.js` (101 lines,
local-dir JSON bundles + sha256), `repo/` bundle files. Context: production
target is **Linux** (DigitalOcean runbook), where the current
`sandbox-exec` python path fails closed by design (`tools.js:495`).

---

## Shared facts (verified in-repo)

- **The seatbelt sandbox is darwin-only and fails closed elsewhere.** On the
  Linux release target, python tools refuse to run at all
  (`tools.js:493–499`). That is *correct* fail-closed behavior — and it means
  the platform currently ships to production with **zero** code-execution
  capability. FEAT-084 is the only ticket in this set that changes that.
- **Docker is already operational.** Postgres/Redis/nginx/etc. run under
  `docker-compose.yml`; a Docker daemon exists on both dev and the DO target.
  FEAT-084 adds no new infra *category*, "just" a new security boundary.
- **CA already does almost all the token work.** Atomic use decrement with a
  race guard, `TOKEN_NO_USES_REMAINING`, wildcard/prefix `matchesResource`,
  group/org scope liveness (`SCOPE_INACTIVE`), per-token and bulk revoke with
  Redis cache invalidation — all live in `services/ca/services/token.js`.
  FEAT-087/088 are mostly **cortex-side plumbing + error propagation**, not
  new CA machinery. That caps their true size below the L on the tickets.
- **Use-token validations are never cached** (`token.js:630` — "skip
  use-based tokens"), so every metered inference is a full CA round trip.
  In-process via the gateway loopback that is cheap (~5–20 ms), **but** it
  runs headlong into **BUG-034**: the CA validate rate limiter is one
  in-memory bucket per source IP (everything arrives as 127.0.0.1 through
  the gateway), 15-min window — a rapid metered-inference loop can 429
  **all modules' auth platform-wide**. This is a real production risk for
  FEAT-087, not a testing footnote.
- **The shared validator swallows CA error codes.** `tokenValidation.js:104`
  returns `403 INVALID_TOKEN` for every non-valid CA answer. FEAT-087's
  "402/403 distinct code" and FEAT-088's "error codes match the CA spec"
  both require the shared middleware to propagate the CA `error` field —
  a `shared/` edit whose blast radius is **every module** (one file, two
  import styles, same bits — but the behavior change is platform-wide).
- **Node's `vm` is not a security boundary** (Node docs say so explicitly).
  The standalone's `jsSandbox.js` is 44 lines of `vm.createContext` with a
  scrubbed global — fine against accidents, escapable by adversarial code
  via constructor-chain games. Any FEAT-083 design inherits this ceiling;
  worker_threads adds crash/timeout isolation, not a security wall.
- **Warm pools have no precedent** — the plan itself marks `warm-pools` as
  "n/a — new with the container runtime." There is no measured cold-start
  pain to justify them; nothing invokes functions today.

---

## Execution track

### FEAT-083 — Sandboxed JavaScript skills runtime (ticket size M)

**Cost.** Build M: worker_threads host + vm context + capability gating +
hard timeout + registry/lifecycle wiring (the registry conventions —
save-disabled, test-gate, admin-only mutations — already exist in
`skills.js`/`tools.js` and port over cheaply; the standalone's 44-line
sandbox is a starting sketch, not the deliverable). The *real* cost is the
security-review posture (same as TASK-021): the vm ceiling means an
adversarial skill can plausibly escape the context; worker_threads contains
crashes and infinite loops (terminate the thread), not exfiltration by
escaped code running in-process. Alternatives that would harden it —
`isolated-vm` (native dep, maintenance-mode upstream, build pain per Node
upgrade) or routing JS through FEAT-084 containers (real boundary, but
container-per-skill-call latency inside an agent loop) — each carry their
own ongoing cost. Maintenance: moderate (Node vm/worker API churn is low).
Infra: none — in-process.

**Value.** Real: skills today are prompt packs only; JS code skills are the
single most-requested authoring primitive for agent builders and unblock the
`skill` step in FEAT-081 chaining. Mitigating the vm ceiling: skill
mutations are **admin-gated** and test-gated, so the code is
admin-authored/LLM-drafted-then-human-reviewed — semi-trusted, not
user-submitted. That threat model is what makes a vm-based runtime
defensible at all.

**Risks/unknowns.** vm escape (documented, accepted-with-eyes-open only if
the authoring population stays admin); the `net` capability re-opens the
SSRF surface `assertPublicHost` was built to close — a JS skill with `fetch`
must route through the same guard or not get `fetch` at all.

**Cheaper alternative.** Defer entirely and run JS as containerized
functions once FEAT-084 lands — one sandbox technology, Linux-safe, real
boundary. Cost: cold-start latency per skill step and FEAT-084 becomes a
hard dependency of the skills story.

**Smaller first slice.** Pure-compute skills only: worker_threads + vm, **no
capability grants** (no fetch, no fs — nothing beyond JSON/Math/Date),
admin-gated, test-gated, hard wall-clock + thread-terminate. That covers the
dominant use (transform/format/compute steps) with the narrowest surface;
add capabilities one at a time later, `net` only via the existing SSRF
guard.

**Verdict — APPROVE-REDUCED (pure-compute slice, size M).** The primitive
is genuinely needed and the admin-authored threat model makes the vm ceiling
acceptable *if documented as not-a-hard-boundary* and the first slice grants
zero capabilities. Ship with an explicit note in the module README that
untrusted-user JS must wait for the container runtime; systems-architect
review per TASK-021 posture.

### FEAT-084 — Containerized function runtime, Docker/OCI (ticket size L)

**Cost.** Build L (correctly sized): runtime adapter (create/run/limit/kill
via dockerode or the CLI), per-function image handling, limit enforcement
(`--cpus`, `--memory`, `--network none`, timeout kill), fail-closed
daemon-absent path, flag-gating (`CORTEX_FUNCTIONS_ENABLED=false` default),
`.env.example` + setup-TUI schema (TASK-045 convention), and a Linux CI/QA
lane — the AC "works on Linux" cannot be verified on the darwin dev box
alone; budget a DO-droplet or Linux-VM verification pass (qa-specialist).
Ongoing: Docker daemon becomes a **production runtime dependency** (today it
is dev-infra only on the target); image storage hygiene; limit tuning.
**The big cost is security surface:** whatever process drives the runtime
holds the Docker socket = root-equivalent on the host. Recommend the
executor live in a **worker process** (`worker:cortex-functions` pattern —
workers already run separately), so the internet-facing gateway never holds
the socket; gateway enqueues, worker executes. That adds one more running
process to supervise (known operational lane, same as `worker:live` etc.).

**Value.** High and strategic: this is the **only** path to any code
execution on the Linux release target (seatbelt fails closed there), and it
is the foundation the owner's selection leans on (gates FEAT-085; the
deferred `python-in-container` lands on it later; FEAT-083's untrusted-JS
story eventually routes through it). Real isolation (namespaces/cgroups)
versus the vm ceiling.

**Risks/unknowns.** *Container escape:* mitigate with non-root user,
`--cap-drop ALL`, `--security-opt no-new-privileges`, read-only rootfs,
`--pids-limit`, `--network none` default, never mounting the Docker socket
into a function container — these belong in the AC, not the notes. *Image
provenance:* invoke must run **pinned local images by digest** only — no
pull-by-tag from arbitrary registries at invoke time; image admission is an
admin act (FEAT-085's registry should record the digest). *Socket
placement:* the gateway-vs-worker decision is structural — architect
sign-off is already required on the ticket; add the socket question to it
explicitly. gVisor/Firecracker-class hardening is out of scope and should
not be gold-plated in.

**Cheaper alternative.** None that meets the Linux requirement. (nsjail/
firejail-style host sandboxing is a new, less-well-trodden dependency;
Docker is already operated here.)

**Smaller first slice.** Runtime + limits + fail-closed only, exercised by a
hard-coded smoke function behind the flag — no registry, no tool kind, no
pools (all FEAT-085). That is roughly what the ticket already is; keep it
that lean.

**Verdict — APPROVE (size L, flag-gated, architect sign-off incl. socket
placement; recommend worker-side execution).** The Linux fail-closed gap
makes this the highest-value ticket of the seven; Docker already being in
the stack keeps the infra delta to one daemon-in-prod decision. The security
surface is real but bounded by well-known hardening flags that must be AC,
not aspiration.

### FEAT-085 — Function registry + invoke API + warm pools (ticket size L)

**Cost.** Registry + invoke + `function` tool kind: **M** — `cortex.functions`
CRUD follows the existing tools/guardrails registry pattern almost
mechanically (new tables only, sync migrate OK), invoke is a thin call into
FEAT-084, the tool kind is a third branch in `ToolRegistry.run`
(`tools.js:484`). **Warm pools are the other half of the L** and they are
premature: pre-warmed container lifecycle (health, recycling, leak
prevention, per-function pool sizing) is real distributed-systems upkeep —
idle containers holding memory on a droplet, orphan cleanup on worker
crash — bought to fix a cold-start latency (~0.5–2 s for a small node/python
image) that **no one has ever measured here** because nothing invokes
functions yet, and whose dominant consumer (an async agent tool loop)
tolerates seconds by construction.

**Value.** Registry/invoke: high — it is the delivery vehicle for FEAT-084;
without it the runtime is dark. Warm pools: speculative until there is a
latency SLO and traffic.

**Risks/unknowns.** Concurrency-cap semantics (queue vs 429) is a one-line
decision — pick 429 first (simpler, no queue state). The registry must store
the **image digest** (provenance, per FEAT-084).

**Cheaper alternative / smaller first slice.** Same thing here: ship
registry + invoke + tool kind + a plain **per-function concurrency cap**
(cheap semaphore, protects the host) and **drop warm pools** from the
ticket. Re-file warm pools as its own S/M FEAT with a measured cold-start
number and a target latency in the description — that is the evidence gate.

**Verdict — APPROVE-REDUCED (registry + invoke + tool kind + concurrency
cap, size M; warm pools split out and deferred until cold-start pain is
measured).** Half the ticket is mechanical pattern-following with high
value; the other half is optimization ahead of any workload.

### FEAT-086 — Versioned skill/function repository, sha256 (ticket size M)

**Cost.** The standalone's whole subsystem is ~100 lines + a model — the
mechanical port is cheap. The *platform* cost is what the port drags in:
new `repository_items`-style table, bundle storage location (local dir vs
FileVault — a real decision), publish/install routes + audit, and keeping
the module's stricter lifecycle (the standalone installs items
`status: 'enabled'` — `repositoryService.js:83` — which violates this
module's disabled-until-tests-pass convention and must NOT be ported as-is).
Maintenance: low. Infra: bundle storage.

**Value.** Weak *today*. Publish/install is a marketplace shape, and there
is exactly **one deployment and one admin population** — publishing to
yourself. The genuine near-term value is **portability**: move
skills/functions between the standalone and the module, dev→prod promotion,
and backup — which is export/import, not a registry.

**Risks/unknowns.** sha256 verifies integrity, not authorship — without
signing it is tamper-evidence for the bundle file only; fine for
export/import, oversold as "provenance" for an install channel.

**Cheaper alternative / smaller first slice.** **Export/import instead of
publish/install:** `GET /skills/:name/export` → JSON bundle with embedded
sha256 manifest; `POST /skills/import` → verify hash, save **disabled**,
test-gate before enable. Size S, no new tables, no bundle-store decision,
covers backup + promotion + standalone↔module portability. The versioned
registry becomes worth building when there is a second consumer
(multi-tenant, community sharing, or the plugins module wanting the same
channel).

**Verdict — DEFER (the registry); recommend PM re-scope to an S
export/import slice if portability is wanted this quarter.** P3 already;
most useful "after FEAT-083/085 exist to publish" by its own admission, and
even then the single-deployment reality makes a registry premature.

---

## Token track

### FEAT-087 — Use-based token metering + quota/budget enforcement (ticket size L)

**Cost.** Split M+M, and the first half is smaller than it looks:
**metering** largely *already happens* — cortex authenticates every request
through `validateCAToken`, whose CA round trip atomically decrements use
tokens today (`token.js:547`). The cortex work is: (a) exactly-once
discipline — ensure one inference = one validate (no double middleware, no
re-validate on internal retry); (b) surfacing `TOKEN_NO_USES_REMAINING` as
402/403 instead of the shared validator's generic 403 — which is the
**shared-middleware error-propagation change** (platform blast radius;
coordinate with FEAT-088, which needs the same change — build it once).
**Quotas** are the real new build: budget tables (new, sync-migrate OK),
pre-dispatch aggregation over PromptLog (or Redis counters — a per-request
`SUM` over a growing log table is a footgun; dba to pick the shape), CRUD +
admin routes. Maintenance: budget-accounting correctness is forever-work
(what counts, resets, timezone windows).

**Value.** Metering: enables pay-per-use/trial token issuance against
expensive local inference — real, and CA already paid for the hard part.
Quotas: protects a finite local-GPU/CPU inference budget from one runaway
user/agent — genuine operational value once agents can be scheduled
(FEAT-082) and users author skills.

**Risks/unknowns.** **BUG-034 is a production blocker for enforcement at
scale:** use tokens skip the validation cache, so metered inference =
uncached CA validate per call, all sourced from 127.0.0.1 through the
gateway, into one in-memory 15-min rate bucket — a busy metered client can
429 every module's auth. Fixing/scoping that limiter (exempt or key
service-HMAC'd validates) should be a named prerequisite, not a testing
note. Also: double-charging on client retries after a 5xx is inherent to
decrement-on-validate; document it (CA spec behavior, not cortex's to fix).

**Cheaper alternative / smaller first slice.** (1) Metering + distinct
error code only (S–M, mostly shared-middleware work shared with FEAT-088).
(2) Quotas in **shadow mode first**: compute would-exceed, log + expose on
admin, block nothing — validates the accounting against real PromptLog data
before a wrong budget 403s a legitimate user. Flip to enforce via config
once shadow numbers look sane. This is the same shadow-first pattern that
served FEAT-023 moderation well.

**Verdict — APPROVE-REDUCED (metering + error mapping now; quotas land
shadow-first with enforce behind a flag; BUG-034 limiter fix named as a
prerequisite for production enforcement). Size M+M, not L-monolith.**

### FEAT-088 — Resource-scoped + group/org-scoped token enforcement (ticket size L)

**Cost.** Smaller than ticketed — **M**. CA already implements everything:
`matchesResource` wildcard/prefix (L669), scope liveness `SCOPE_INACTIVE`
(L410), bulk revoke **with per-token cache invalidation** (L793–805,
verified — revocation genuinely takes effect on next validation). Cortex
work: derive a canonical resource string per route (model/agent name, not
raw `req.path`) and pass it to validation; honor scope fields. The one
platform-risk item is the same **shared validator error-propagation** edit
as FEAT-087 (CA spec codes must pass through instead of collapsing to
`INVALID_TOKEN`) — build once, regression-test every module's auth path
(the suite is non-blocking; qa-specialist owns a real check). One caveat to
verify in build: non-use token validations are Redis-cached up to
`config.redis.ttl.token` — a resource-scoped *cached* result must not be
replayed for a *different* resource (the cache key is per-token, not
per-resource; confirm the cached-path re-checks `matchesResource` or skip
cache for resource-scoped validates — verify against
`services/ca/services/token.js` cached branch before sizing final).

**Value.** High for the token story: per-model/per-agent access is the
control that makes issuing cortex tokens to groups/orgs safe at all, and it
gates FEAT-089. Zero new CA surface; aligns cortex with token spec v1.1
that every other consumer already honors.

**Cheaper alternative / smaller first slice.** Resource scoping for
**models only** first (the chat path), agents second — but the delta is
small enough that splitting buys little. The genuine reduction is sizing:
this is an M riding on finished CA machinery, plus one shared-middleware
change shared with FEAT-087.

**Verdict — APPROVE (resize L→M; do the shared-validator error-propagation
work jointly with FEAT-087; verify the cached-validation resource-recheck
before enable).** Cheapest security win in the set relative to what it
unlocks.

### FEAT-089 — Cortex token admin UI in the SPA (ticket size S)

**Cost.** S and genuinely S: structured issue/revoke/bulk-revoke forms over
FEAT-088's backend, following the existing CA token modals and Rick's
no-JSON-only-modals rule. Separate cost lane (`web/` build + nginx
recreate), `web:test` + zero-console-error bar. No backend work by
definition.

**Value.** Without it, resource/scope token issuance is a curl exercise —
the admin UI is what makes FEAT-087/088 *operable*. Cheap capstone.

**Risks.** Only sequencing: UI against an unfinished 088 contract churns.

**Cheaper alternative / smaller first slice.** Issue + revoke first;
bulk-revoke-by-scope as the second PR if the sprint runs tight. Not worth
splitting the ticket for.

**Verdict — APPROVE (after FEAT-088 lands; size S).** No reduction needed.

---

## Sequencing recommendation (for PM grooming)

1. **FEAT-084** (foundation; architect sign-off incl. Docker-socket
   placement) → **FEAT-085 reduced** (registry/invoke/tool-kind/cap; warm
   pools split to a new evidence-gated ticket).
2. In parallel: **FEAT-088 (resized M)** + **FEAT-087 metering slice**,
   sharing one shared-validator error-propagation change; then FEAT-087
   quotas shadow → enforce; then **FEAT-089**.
3. **FEAT-083 reduced** (pure-compute slice) any time — independent.
4. **FEAT-086** deferred; PM may re-file as an S export/import ticket.
5. File/link the **BUG-034 limiter fix** as a prerequisite of FEAT-087
   production enforcement.

## Handoffs

- **product-manager** — all seven assessed; groom per the table. Two
  resizes (FEAT-085 L→M reduced, FEAT-088 L→M), one split (warm pools out
  of FEAT-085), one defer with a cheaper re-scope offer (FEAT-086), one
  named prerequisite (BUG-034 for FEAT-087 enforcement).
- **systems-architect** — FEAT-084 sign-off is already required on the
  ticket: add Docker-socket placement (gateway vs `worker:cortex-functions`)
  and the container-hardening flag set to the review scope. FEAT-083's
  vm-not-a-boundary posture note. The shared-validator error-propagation
  change (087/088) touches every module's auth path — glance requested.
- **dba** — FEAT-087 quota accounting shape (PromptLog aggregate vs Redis
  counters; budget tables are new-tables-only so sync migrate is fine);
  FEAT-085/086 new tables likewise sync-safe.
- **qa-specialist** — FEAT-084 Linux verification pass (cannot be proven on
  darwin); network/OOM/timeout limit demonstrations; regression on every
  module's auth after the shared-validator change (do not credit the
  non-blocking suite); FEAT-087 shadow-quota number validation.
- **sr-developer** — sanity-check the FEAT-088 cached-validation
  resource-recheck caveat against the CA cached branch before build.
