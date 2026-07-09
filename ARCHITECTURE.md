# Exprsn Platform — Unified Architecture

This project consolidates ten formerly-standalone Exprsn microservices into a
**single Node.js application** that exposes **one HTTPS port** (default `8443`).
The original services now run **in-process as domain modules** behind a gateway.

## Source services → modules

| Module | Prefix | Schema | Realtime ns | Origin service |
|---|---|---|---|---|
| ca | `/ca` | `ca` | `/ca` | exprsn-ca (Certificate Authority) |
| auth | `/auth` | `auth` | — | exprsn-auth (OAuth2/OIDC/SAML/MFA) |
| spark | `/spark` | `spark` | `/spark` | exprsn-spark (messaging) |
| nexus | `/nexus` | `nexus` | — | exprsn-nexus (groups/events) |
| filevault | `/filevault` | `filevault` | — | exprsn-filevault (file storage) |
| vault | `/vault` | `vault` | `/vault` | exprsn-vault (secrets) |
| timeline | `/timeline` | `timeline` | `/timeline` | exprsn-timeline (feed) |
| prefetch | `/prefetch` | `prefetch` | — | exprsn-prefetch (cache) |
| moderator | `/moderator` | `moderator` | `/moderation`, `/notifications` | exprsn-moderator |
| live | `/live` | `live` | `/live` | exprsn-live (streaming) |
| cortex | `/cortex` | `cortex` | — | MacOS LLM agents engine (local-LLM agents/guardrails; flag-gated `CORTEX_ENABLED`) |

### Cortex module (FEAT-021)

Cortex is the platform's local-LLM engine: an agent tool-calling loop,
guardrail engine (deterministic rules + LLM judge, test-gated lifecycle),
custom tool/skill registries, long-running agent tasks, and guarded
customer-service chat/email flows with human-review escalations. Inference
runs on an **external OpenAI-compatible llama.cpp router**
(`CORTEX_LLM_BASE_URL`, default `http://127.0.0.1:8080/v1`) — no cloud APIs.

- Ships behind `CORTEX_ENABLED` (default false): mounts inert, tables sync,
  `/cortex/health` answers, everything else 503s.
- **Every `/cortex/api/v1` route requires a CA bearer token**; registry
  mutations, the review queue, and the prompt log are platform-admin gated.
- Long-running tasks run on Bull queue `cortex-tasks` in a separate worker
  (`npm run worker:cortex`); interactive chat is in-process behind an LLM
  concurrency semaphore.
- **Relationship to moderator:** cortex owns local-LLM inference and its own
  guardrails; moderator keeps cloud-provider content moderation. With
  `CORTEX_MODERATE=true`, cortex additionally screens content through
  `/moderator/api/moderate/content` (service-HMAC headers, fail-open) and the
  strongest verdict wins. Making moderator consume cortex as a local AI
  provider is a possible future integration, not wired today.
- Highest-risk surfaces are separately gated: python custom-tool execution
  (`CORTEX_PYTHON_TOOLS_ENABLED`, default false — arbitrary code execution;
  needs real sandboxing before production) and private-network HTTP tool
  targets (`CORTEX_TOOL_ALLOW_PRIVATE_HOSTS`, default false — SSRF guard).

## Topology

```
            ┌──────────────────────── one HTTPS port (8443) ────────────────────────┐
   client → │  gateway (helmet/cors/compression) + single Socket.IO (/socket.io)     │
            │    /ca/*  /auth/*  /spark/*  …  /live/*   →  mounted module Express apps │
            │    namespaces: /ca /spark /timeline /live /vault /moderation …          │
            └───────────────────────────────────────────────────────────────────────┘
                      │                          │
              one Postgres db `exprsn`     one Redis instance
              schemas: ca, auth, spark…    (key-prefix / db-number isolation)
```

- **Minimal ports exposed:** only `8443` (HTTPS). An optional `8080` issues
  `301`→HTTPS and can be disabled (`HTTP_REDIRECT_PORT=0`). Postgres/Redis/ES
  stay on the loopback/private network.
- **Single database, per-domain schemas:** all modules share db `exprsn`; each
  module's tables live in its own schema, set via Sequelize `define.schema`.
- **Single Socket.IO server:** one `path: /socket.io`; each realtime module
  owns a namespace instead of its own server/port.

## Module contract

Each module's entry file (`services/<name>/…/index.js`) exports:

```js
module.exports = {
  name,                      // module id
  app,                       // Express app/router — NO listen, NO views, NO setup
  registerSockets(io) {},    // optional — attaches this module's namespace(s)
  async init(ctx) {},        // optional — db/redis/queue setup; MUST NOT listen
};
```

The gateway (`src/gateway.js`) mounts every module under its prefix and wires the
shared Socket.IO server. The bootstrap (`src/index.js`) loads modules, runs their
`init()`, then starts the one HTTPS server.

## Shared Redis allocation

All modules share one Redis instance. Logical DBs and key namespaces are
allocated so they don't collide:

| Consumer                         | Redis DB | Keys / namespace                          |
|----------------------------------|----------|-------------------------------------------|
| Platform default (`REDIS_DB`)    | 0        | shared client (`getRedisClient`)          |
| Timeline fan-out / feed cache    | 0        | `timeline:{userId}`, `timeline:global`    |
| Timeline Bull queues             | 0        | `bull:{fanout,trending,indexing,notifications}:…` |
| Prefetch hot cache               | 0        | `prefetch:timeline:{userId}` (`keyPrefix`)|
| Prefetch warm cache              | 1        | `prefetch:timeline:{userId}`              |
| Prefetch metrics                 | 2        | `prefetch:metrics:…`                       |
| Prefetch Bull queue              | 0        | `bull:prefetch:…`                          |

Prefetch's cache uses an ioredis `keyPrefix: 'prefetch:'` so its `timeline:{userId}`
entries don't clash with timeline's own feed keys on DB 0. Bull queue names are
globally distinct. Background jobs run in **separate** worker processes
(`npm run worker:timeline` / `worker:prefetch`); the gateway only enqueues.

## What was removed during consolidation

- **Setup routes & wizards:** `ca/routes/setup.js`, `auth/src/routes/setup.js`
  (+ `views/setup/*`), `moderator/routes/setup.js` — and their mounts.
- **All front-end pages:** every server-rendered view (`views/`, EJS/Handlebars/
  HTML), static SPA (`public/`), view-engine config, and `express.static` mounts.
  Modules are now **JSON APIs only**; the unified front end lives separately in
  `web/` (Vite + React SPA, served by nginx — never by a module).

## Running

```bash
npm install
npm run gen:certs          # dev self-signed cert for the HTTPS edge
cp .env.example .env        # set DB/Redis/secrets
npm run db:bootstrap        # create db + per-module schemas
npm run db:migrate          # run each module's migrations into its schema
npm start                   # single process, https://localhost:8443
curl -k https://localhost:8443/health
```

## Deployment topology (MVP)

- **Single gateway instance** for MVP — one Node process behind the nginx edge.
  No horizontal scaling, which is why spark's `@socket.io/redis-adapter` ownership
  is deferred (the adapter only matters for cross-instance socket fan-out). Before
  scaling out: the gateway should own the adapter, and a sticky-session / shared
  Redis fan-out story is required. (Session store is already on Redis, so that part
  is scale-ready.)
- **Edge / TLS.** nginx terminates `:443` (serves `web/dist`) and proxies the API
  and Socket.IO to the gateway on `:8443`. Dev uses self-signed certs
  (`npm run gen:certs`); **production must terminate real certificates** at the
  edge. Inter-service axios runs with `rejectUnauthorized` off **only** outside
  production (`shared/utils/httpAgent.js`) — production verifies.
- **Process model.** Gateway (REST + Socket.IO + enqueue) and the two Bull workers
  (`worker:timeline`, `worker:prefetch`) are separate processes against the shared
  PG/Redis. Bring PG + Redis up before the gateway (`require`-time side effects in
  spark/vault).

## Operational posture (MVP gaps)

These are tracked in detail in `STATUS.md` → **Production readiness (R1–R6)**; in
short, the platform is structurally complete and runtime-verified but not yet
release-engineered:

- **SCM/CI:** under git (`main`, initial commit) with `.github/workflows/ci.yml`
  (lint + web-build required gates; `test:all` non-blocking while suites stabilize).
  Remaining: push to a remote and set branch protection requiring the checks.
- **Observability:** Winston logging only — no metrics/tracing/error-tracking, and
  nothing watches `/health`. Add error tracking + health alerting before MVP.
- **Secrets:** `.env`-based; production needs managed secrets and rotation for
  `SERVICE_TOKEN_SECRET`, session secrets, and DB/Redis creds.
- **Load + backup:** no concurrency/load pass and no rehearsed PG backup/restore
  yet.

## Status / caveats

- Built without a live Node/Postgres/Redis to validate against; large parts are now
  runtime-verified against live PG+Redis — `STATUS.md` is the authoritative record
  of what is and isn't verified.
- Raw-SQL migrations that hard-code table names may need schema qualification;
  model-based migrations inherit the schema automatically.
- Per-module `registerSockets`/`init` were adapted from each service's original
  server-bootstrap; see inline `TODO(platform)` markers for spots to verify.
- **MVP scope decisions (2026-06-22):** single instance; `/live` streaming publish
  is in scope (so its signaling needs per-event auth); Sessions gets the full fix
  (persisted rows + token revocation). Release-engineering-first sprint ordering —
  see `SPRINT.md`. Details and rationale in `STATUS.md`.
