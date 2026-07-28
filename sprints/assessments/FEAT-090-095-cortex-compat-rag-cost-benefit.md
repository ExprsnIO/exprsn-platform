# Cost/Benefit — FEAT-090 … FEAT-095 (cortex streaming / compat / RAG track)

Analyst: cost-benefit-analyzer · 2026-07-28

Scope: the six FEATs of the Cortex build-out's "API Compatibility & Streaming" +
"Memory & RAG" stages — token streaming (**FEAT-090**), Exprsn-Cortex frontend
API parity (**FEAT-091**), MCP server per model (**FEAT-092**), pgvector
embedding store (**FEAT-093**), KB ingestion pipeline (**FEAT-094**), and
KB↔model/agent binding + retrieve (**FEAT-095**). Source plan:
`sprints/proposals/cortex-feature-plan.md`; owner-selected 2026-07-28.

Grounding read: `services/cortex/src` (routes/chat.js, lib/llama.js,
engine/agent.js, backends/), `src/modules/registry.js` (cortex `socketNs: null`),
`src/gateway.js` (single Socket.IO server, `authenticateSocket()` precedent on
`/_admin`, gateway-wide `compression()`), `web/src/api/cortex.ts`,
`docker-compose.yml` + `docker/postgres/initdb/10-extensions.sql`, and — for
effort calibration — the standalone at `/Volumes/Storage/exprsn-cortex`
(`src/realtime/` 135 LOC, `src/mcp/` 167 LOC, `src/rag/` 353 LOC,
`src/routes/` 1,529 LOC, `src/frontend/` + `src/views/` EJS).

---

## Shared facts (verified in-repo / in the standalone)

- **Zero streaming today.** `lib/llama.js` `chatComplete` is explicitly
  non-streaming; registry line for cortex has `socketNs: null`; every chat
  response is buffered. The standalone's whole realtime layer is **135 lines**
  (`realtime/chatNamespace.js` + `index.js`): a `/chat` namespace emitting
  `chat:start/token/done/error/cancelled` with an AbortController. Small,
  well-shaped reference.
- **Gateway compression buffers SSE.** `src/gateway.js` applies `compression()`
  app-wide. An SSE route must opt out (`Cache-Control: no-transform` /
  `res.flush()` per chunk) or first tokens will sit in the gzip buffer. There is
  **no existing SSE endpoint in the platform** to crib from — this gotcha is
  FEAT-090's to solve, once.
- **Socket auth precedent exists.** The gateway already runs
  `authenticateSocket()` on its `/_admin` namespace; a `/cortex` namespace can
  reuse the same middleware. Single-gateway MVP ⇒ no redis-adapter concern
  (STATUS #3 deferred).
- **The standalone "frontend" is server-rendered EJS, not a SPA.**
  `src/frontend/index.js` does `res.render('app/login', …)` with
  `views/{admin,app,layouts}`, its own session auth (`/app/login`,
  `AUTH_DISABLED` dev flag) and its own RBAC. The platform's module contract
  **forbids** views/static/setup routes, so the standalone console can never be
  hosted by the module — "parity so its frontend runs against the module" means
  running the standalone as a **second process/origin** with a **different auth
  model** (session cookies vs CA bearer). This materially changes FEAT-091's
  cost story (see below).
- **pgvector is NOT in the shipped Postgres image.** `docker-compose.yml` pins
  `postgis/postgis:16-3.4`; `docker/postgres/initdb/10-extensions.sql` creates
  postgis / uuid-ossp / pg_trgm / citext only — no `vector`. nexus/auth need
  PostGIS, so we cannot swap to the `pgvector/pgvector` image; the path is a
  small custom Dockerfile on top of postgis (Debian-based; `postgresql-16-pgvector`
  is an apt package) **plus** a manual `CREATE EXTENSION vector` on the existing
  `pg_data` volume (initdb scripts run only on first boot). Sync `db:migrate`
  can neither `CREATE EXTENSION` nor emit a `vector(N)` column — the migration's
  `up()` runs directly (known pattern; memory: db-migrate-cannot-add-columns).
- **Standalone RAG is small and naive.** `rag/vectorStore.js` (75 LOC raw SQL,
  cosine `<=>`), `chunker.js` (51), `ragService.js` (112), `providers.js` (115 —
  GitHub tree+raw, HF datasets-server, data.gov CKAN, JSON, HTTP). The
  providers have **no SSRF guard, no idempotency, no retry/DLQ** — the delta
  between "port the standalone" and "platform-grade" is where FEAT-094's real
  cost lives, not in the happy path.
- **Current module KB is a flat-file stopgap.** `engine/agent.js` inlines
  markdown files from a KB dir into the CS system prompt, hard-capped at
  **8,000 chars** (`.slice(0, 8000)`). That is the baseline FEAT-093/094/095
  replace — and the concrete evidence the RAG track solves a real limitation,
  not a hypothetical.
- **Embedding path soft-depends on FEAT-078.** nomic-embed-text runs via
  Ollama, which today registers **only** when `CORTEX_ASYNC_ROLE=worker`
  (`backends/index.js`). Ingestion (worker-side) is fine; a gateway-side
  `/kb/:id/search` query-embed needs either FEAT-078's gateway Ollama roles or
  a worker round-trip. Sequence accordingly.
- **MCP dependency is new.** The standalone uses `@modelcontextprotocol/sdk`
  (^1.0.0); the platform has no MCP dependency anywhere. Streamable-HTTP
  session management + an evolving MCP spec = ongoing maintenance surface, not
  a one-time cost.

---

## FEAT-090 — Token streaming: SSE on chat + `/cortex` Socket.IO namespace

### Cost — **M, on the small side**
- `lib/llama.js`: add a streaming variant of `chatComplete` (llama.cpp/Ollama
  both speak SSE/NDJSON `stream:true`; parse deltas, keep the `withSlot`
  semaphore held for the full generation — no change to concurrency semantics,
  a streamed call holds a slot exactly as long as a buffered one).
- `routes/chat.js` (62 LOC today): SSE branch with the **compression opt-out**
  (shared fact above) — the one genuinely novel platform problem here.
- `registerSockets(io)` + registry `socketNs: '/cortex'` — mechanical, but a
  registry edit is structural ⇒ **systems-architect sign-off** (already in the
  AC). Reuse `authenticateSocket()`; standalone's 92-line namespace (send /
  token / done / cancel with AbortController) is a direct template — add
  cancel-on-disconnect abort so a closed tab doesn't burn a semaphore slot.
- Maintenance: low. No schema, no worker, no new dep. QA: needs a real
  first-token-latency check and an unauthenticated-socket rejection test.
- Risk: low. Non-streaming path must stay byte-identical (AC covers it).

### Value
High and immediate. Local models generate tokens slowly; buffered responses
make every chat feel broken (whole-answer wait vs first token in ~1s). This is
the single biggest perceived-latency fix available to the cortex UX, it
benefits the **platform's own SPA** chat surface regardless of FEAT-091, and it
gates FEAT-091.

### Cheaper alternative / smaller slice
SSE-only first (the SPA can consume SSE via `fetch`; no socket needed), socket
namespace as the second half. But both halves are cheap and the namespace is
where cancel semantics live cleanly — splitting saves little.

### Verdict — **APPROVE (build now, M).**
Best value-per-point in the whole cortex slate: ~135 LOC of calibrated
reference, one real gotcha (compression), no schema/infra, and it upgrades the
existing SPA chat as well as gating the parity track. Do the abort-on-disconnect
and keep the registry change under architect sign-off.

---

## FEAT-091 — Exprsn-Cortex frontend API parity

### Cost — **L as written, and the L understates the awkward part**
- The shape surface is real: standalone `src/routes/` is **1,529 LOC** across
  models(224)/agents(123)/chat(101)/knowledge(133)/skills(118)/auth(191)/
  moderation(178)/etc. A faithful compat layer mirrors most of it, then tracks
  it forever (parity is a **standing maintenance contract** with a codebase
  that keeps moving — every standalone route/shape change is a new platform
  ticket).
- **The hidden cost is the consumer, not the routes.** The standalone console
  is server-rendered EJS with session auth and its own RBAC (shared fact). The
  module can never serve it (contract), so "console runs against `/cortex/*`"
  requires running the standalone as a second process/origin and reconciling
  cookie-session auth with CA bearer — either an auth-bridge (new security
  surface: a cookie→bearer shim is exactly the kind of thing that erodes the
  CA-only token flow) or console-side surgery in the *standalone* repo. Neither
  is in this ticket's stated size.
- Blocked-by fan-in is the widest in the slate (FEAT-080, FEAT-090; catalog
  shapes need FEAT-079; KB shapes need FEAT-093/094/095) — it is last-in-line
  no matter what.

### Value
The owner's goal — one console experience across standalone and platform — is
legitimate, and the *API shapes themselves* (models+catalog, agents, skills,
kb, streaming chat) are ~90% the same shapes the platform's own SPA needs for
FEAT-079/080/095 anyway. The marginal value of *strict* parity over
first-party APIs is only: the EJS console runs unmodified. Given that console
can't be platform-hosted and carries its own auth model, that marginal value is
small, and the SPA (`web/src/api/cortex.ts` is already a typed client) is the
surface real users touch.

### Cheaper alternative / smaller slice
Build the **shape-compatible JSON API** (models/catalog, agents, skills, kb,
streaming chat under `/cortex/api/*`, CA bearer only) as the module's
first-party API — one API serving both the SPA and, in principle, the console.
**Skip parity for auth/session/RBAC/settings routes entirely** (CA owns auth;
~370 LOC of the standalone surface disappears from scope). Treat the standalone
console as a dev-time smoke harness (pointed at the platform with a dev
bearer), not a shipped surface; shipped UI investment goes to `web/`.

### Verdict — **APPROVE-REDUCED (M/L, shape-compat API without console-hosting or auth parity).**
The owner's direction (match the standalone shapes, no OpenAI/Ollama façades)
stands and is honored — the reduced scope still lands the standalone's API
shapes verbatim where they exist. What is cut is the part the ticket's own AC
already half-forbids: making the EJS console a supported production consumer,
and any cookie/session auth bridge. The cost case for *that* slice is stark —
second origin, second auth model, permanent parity treadmill — for a console
end-users will never see. **systems-architect** should confirm the "console as
dev harness only" boundary before grooming; if the owner insists the console
must run unmodified in production, this re-sizes to XL and needs re-assessment.

---

## FEAT-092 — MCP server per model (Streamable HTTP)

### Cost — **M, but the tail is maintenance, not build**
- Build is genuinely small: the standalone's whole MCP layer is **167 LOC**
  (`McpRegistry` + `serverFactory`) on `@modelcontextprotocol/sdk`. Mounting
  Streamable HTTP under Express at `/cortex/mcp/models/:name` with bearer/HMAC
  auth is a contained job; unknown-model 404 is trivial.
- Ongoing costs are the real line items: a **new dependency** in the platform
  tree tracking a **spec that is still evolving** (SDK majors, transport
  changes); stateful Streamable-HTTP sessions to reason about at the single
  gateway; and a **new unauthenticated-until-proven-otherwise attack surface**
  per loaded model that QA must cover (MCP clients are not browsers — CORS
  posture, session-id handling, DNS-rebinding guidance all differ).
- The `retrieve` tool returns nothing until FEAT-095 lands; `chat`/`embed` are
  already reachable as plain JSON routes today — so pre-RAG, MCP adds a second
  transport to capabilities that already exist.

### Value
Speculative right now. No internal consumer exists; the beneficiary is an
external MCP client (Claude Desktop/Code, IDEs) driving platform models — a
real integration story *eventually*, but P3 by the PM's own marking, and its
distinctive tool (`retrieve`) is empty until the RAG track completes.

### Cheaper alternative / smaller slice
Today, a local stdio MCP shim (a 50-line script wrapping the existing
`/cortex` JSON routes with a bearer) gives any MCP-capable client access with
**zero** platform code or new server surface. Ship that as a doc/example if
demand appears before the real thing.

### Verdict — **DEFER (revisit after FEAT-093/095).**
Nothing blocks it, but nothing needs it yet: chat/embed already have routes,
retrieve has no data until the RAG track lands, and the cost profile is
maintenance-shaped (SDK/spec churn + new auth surface) rather than build-shaped
— exactly the kind of cost that should wait for a concrete consumer. Re-groom
once FEAT-095 is done and there's a named client use-case; at that point the
167-LOC calibration says it's an honest M.

---

## FEAT-093 — pgvector embedding store

### Cost — **M, dominated by infra, not code**
- Code is small: the standalone's whole vector store is **75 LOC** of raw SQL
  (insert + cosine `<=>` search + count); chunk-table model + index in the
  `cortex` schema is a day's work.
- The real cost is the verified infra chain (shared fact): **custom Postgres
  image** (postgis base + `postgresql-16-pgvector` — cannot swap images, nexus/
  auth need PostGIS), initdb addition for fresh volumes, **manual
  `CREATE EXTENSION vector`** on the existing `pg_data` volume, and a raw
  migration `up()` run directly for the `vector(N)` column (sync `db:migrate`
  can do neither the extension nor the type). Every deployed environment pays
  the image-rebuild + extension step once. **DBA sign-off is mandatory** and is
  already in the ticket notes — hold it to that.
- Index choice (HNSW vs IVFFlat vs none) is a footgun at unknown scale: at
  <~100k chunks a sequential scan is fine; build with a plain table + HNSW
  added by the dba when counts justify it, not speculatively.
- Soft dependency: query-time embedding needs Ollama reachable from the
  process doing the search (FEAT-078 or worker round-trip — shared fact).
  Sequence FEAT-078 first or scope search to accept a caller-supplied vector
  initially.

### Value
Keystone: gates FEAT-094/095, feeds FEAT-091's `/api/kb` shapes and FEAT-092's
retrieve tool, and is the exit from the 8k-char flat-file KB cap. In-Postgres
vectors are also clearly the cheapest durable option: a managed vector DB
(Pinecone serverless ~$50+/mo floor at modest usage; Qdrant/Weaviate cloud
similar) adds a network hop, an egress/privacy question for KB content, and a
second datastore to operate — against an apt package on a container we already
run. (Figures are ballpark; verify current pricing if a SaaS path is ever
seriously proposed.)

### Cheaper alternative / smaller slice
A no-extension fallback (float arrays + brute-force cosine in JS/SQL) works at
toy scale and needs zero infra — but it's throwaway the moment a KB exceeds a
few thousand chunks, and the migration to pgvector later costs more than doing
it now. Not recommended except as a spike.

### Verdict — **APPROVE (build now, M).**
Cheap code, contained and well-understood infra change, and three tickets
queue behind it. Land the image + extension + raw migration as one dba-paired
change; defer the ANN index decision to measured scale; run `npm run db:check`
after (AC already requires it).

---

## FEAT-094 — KB ingestion pipeline (chunk + embed workers)

### Cost — **L as scoped; the scope is the problem**
- The happy path is cheap (standalone: 115-LOC providers + 51-LOC chunker),
  but the ticket's AC demands platform grade: SSRF-guarded HTTP fetching
  (TASK-022 posture — the standalone has **none**), retry/backoff + DLQ,
  idempotent re-ingest (content-hash dedupe), queryable job status, and a Bull
  worker on the `worker:cortex` / `CORTEX_ASYNC_ROLE` pattern. That hardening
  is 3–4× the provider code and is the honest reason this is an L.
- **Five source connectors at once is connector-shaped scope creep.** GitHub
  (API rate limits, tree pagination, auth tokens), HF datasets-server (schema
  drift), and data.gov CKAN are each their own small maintenance annuity
  against third-party APIs we don't control.
- Operational: bulk embedding runs worker-side against Ollama — keep it off
  the gateway's inference semaphore so a big ingest can't starve interactive
  chat (worker lane already implies this; make it an explicit AC at grooming).
- dba glance on queue usage is already noted; tables are new (sync migrate OK).

### Value
High — an empty vector store has no value, so FEAT-093's payoff is entirely
realized here. But value is **not uniform across sources**: HTTP-URL + JSON
(+ pasted/uploaded text) cover the overwhelming majority of real first KBs
(docs sites, internal markdown, exported JSON). GitHub/HF/data.gov are
long-tail conveniences — GitHub is even reachable via raw URLs through the
HTTP provider on day one.

### Cheaper alternative / smaller slice
**Slice to two sources**: HTTP (through the SSRF guard) + JSON/direct-upload,
with the full worker/idempotency/status/DLQ spine built properly — that spine
is the part FEAT-095 and FEAT-091 actually depend on. GitHub, HF, and data.gov
become three S follow-up tickets riding the proven spine, prioritized by
demand.

### Verdict — **APPROVE-REDUCED (M: worker spine + HTTP/JSON sources; connectors as S follow-ups).**
The pipeline spine is necessary and correctly hardened in the AC; the five-way
connector matrix is not necessary to unblock anything downstream and front-
loads third-party API maintenance before a single KB exists. The reduced slice
delivers ~90% of the unblock at roughly half the points and lets connector
demand prove itself.

---

## FEAT-095 — KB↔model/agent binding + retrieve step + `/kb/:id/search`

### Cost — **M, fair**
- Binding tables are new (sync migrate OK); `/kb/:id/search` is a thin route
  over FEAT-093's search (standalone `searchMany` is part of the 75-LOC store);
  the retrieve step upgrades FEAT-081's contracted graceful no-op, and the
  agent-tool variant follows the existing tool-kind pattern.
- Two dependency notes for grooming: (1) it needs FEAT-093 + *some* ingested
  content — FEAT-094's **reduced** slice fully satisfies it, so the
  connector follow-ups are not blockers; (2) the per-model KB slot rides
  FEAT-079's `model-config`, which may land later — the AC already says
  "honored when present"; keep agent-binding as the primary path so this
  ticket never waits on FEAT-079.
- Query-time embedding needs a gateway-reachable embed path (FEAT-078 or
  worker round-trip — same note as FEAT-093).
- Risk: prompt-injection via retrieved chunks is real but bounded — retrieved
  text enters prompts exactly as the flat-file KB does today, and guardrail
  steps (FEAT-081) sit on the output side. Note it for QA, don't gold-plate.

### Value
This is the **payoff ticket** of the whole RAG track: it retires the
8,000-char flat-file inline (`agent.js:357`) with ranked retrieval, upgrades
the CS persona immediately, and is what makes FEAT-091's `/api/kb` shapes and
(eventually) FEAT-092's retrieve tool mean anything. Without it, 093/094 are
sunk cost.

### Cheaper alternative / smaller slice
Smallest slice = agent-binding + `/kb/:id/search` only, model-binding deferred
with the FEAT-079 slot. That's already effectively what the AC does; no
further trim is worth the coordination overhead.

### Verdict — **APPROVE (build after FEAT-093 + reduced FEAT-094, M).**
Correctly sized, cleanly downstream, and the ticket where the track's value
lands. Groom with the two dependency notes above made explicit (reduced-094
sufficiency; agent-binding-first so FEAT-079 never blocks it).

---

## Track sequencing (analyst view)

`FEAT-090 (M)` independent, do first — it upgrades the live SPA immediately.
Then `FEAT-093 (M)` → `FEAT-094-reduced (M)` → `FEAT-095 (M)` as the RAG
chain (pull FEAT-078's gateway-Ollama roles ahead of 093's search if not
already landed). `FEAT-091-reduced` last, once 079/080/090/095 exist.
`FEAT-092` re-grooms after 095. Net effect of the two reductions: the track
drops from ~M+L+M+M+L+M (≈26 pts at S=1/M=3/L=8) to ≈15 pts now + small
follow-ups, with the same downstream unblocks.

## Handoffs
- **product-manager** — all six assessed; groom per the verdicts. FEAT-091 and
  FEAT-094 need their reduced scopes restated in the AC before `ready`;
  FEAT-092 stays backlog with a re-groom trigger (FEAT-095 done + named MCP
  consumer).
- **systems-architect** — FEAT-090 registry `socketNs` change (sign-off already
  gated in AC); FEAT-091 boundary ruling: standalone EJS console = dev harness
  only, **no** cookie→bearer auth bridge (CA token flow stays intact — this is
  a security-invariant line, not a preference); FEAT-092's new MCP transport
  surface when it revives.
- **dba** — FEAT-093 owns the heavy coordination: custom postgis+pgvector
  image, `CREATE EXTENSION` on the existing volume, raw `up()` migration,
  index strategy at measured scale. FEAT-094 queue topology + DLQ glance;
  FEAT-095 binding tables (sync-safe, confirm).
- **qa-specialist** — FEAT-090 first-token latency + unauthenticated socket
  rejection + compression-buffering regression; FEAT-094 SSRF-guard coverage
  and idempotent re-ingest; FEAT-095 retrieval-injection sanity pass. Do not
  credit the non-blocking suite.
- **sr-developer** — sanity-check the FEAT-094-reduced M sizing: if the Bull
  spine + idempotency honestly exceeds M without connectors, say so before
  commit.
