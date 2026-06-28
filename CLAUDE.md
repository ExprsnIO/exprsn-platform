# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A unified Node.js platform that consolidates ten formerly-standalone Exprsn microservices (CA, auth, spark/messaging, nexus/groups, filevault, vault/secrets, timeline, prefetch, moderator, live/streaming) into **one process behind one HTTPS port** (default 8443). The originals live untouched at `/Volumes/Storage/exprsn-<name>/`; this repo contains adapted copies under `services/`. Plain JavaScript (CommonJS), Express 4, Sequelize 6, Socket.IO 4. Under git (`main`, initial commit) with CI at `.github/workflows/ci.yml` — no remote wired yet (push + branch protection are pending; see STATUS.md R1).

## Commands

```bash
npm install            # also resolves @exprsn/shared via file:./shared
npm run gen:certs      # dev self-signed cert (required for the HTTPS edge)
cp .env.example .env   # fill DB/Redis/secrets
npm run db:bootstrap   # src/db/migrate.js — create db `exprsn` + one Postgres schema per module
npm run db:migrate     # scripts/migrate-sync.js — sync each module's models into its schema
npm start              # https://localhost:8443 — verify with: curl -k https://localhost:8443/health
npm run dev            # same, with nodemon
npm run lint           # eslint (root .eslintrc.json) over src/ + services/ — errors fail, warnings don't
npm run test:all       # scripts/test-all.js — aggregate per-module Jest suites
```

CI (`.github/workflows/ci.yml`) gates PRs on **lint** + **web-build** (required); the
**test** job (`test:all` with Postgres/Redis service containers) is non-blocking while
the module suites stabilize. `npm run lint` only works because of the root
`.eslintrc.json` (the repo had no ESLint config before — `eslint:recommended` with
noisy rules downgraded to warnings).

`npm run db:migrate:raw` (`scripts/migrate-modules.js`) is the alternative path that replays each module's own historical migration files instead of syncing models — see Data isolation below for when that distinction matters.

`npm run db:check` (`scripts/check-drift.js`) is a **read-only** audit that loads every module's Sequelize models and compares them against the live DB — flagging missing tables (incl. tables leaked into `public`), missing columns, ENUM value drift, and missing indexes. Exits non-zero on drift (CI/pre-deploy gate). Run it after changing a model: a model column with no matching DB column (e.g. forgetting to `db:migrate` after adding one) makes **every** query on that table 500 until the schema catches up. Needs Postgres + Redis up.

### Local infra (Docker)

Postgres, Redis, and the other backing services run as Docker containers (`docker-compose.yml`, configs under `docker/`). The nginx edge container serves the built SPA on `:443`.

```bash
npm run infra:start    # pull + up everything (incl. --profile extras/optional)
npm run infra:up       # just the core services, detached
npm run infra:ps       # status
npm run infra:logs     # follow logs
npm run infra:down     # stop everything
```

### Frontend SPA (`web/`)

`web/` is a **separate** Vite + React + TypeScript single-origin SPA — a static build artifact, **not** served by any Express module (backend modules are JSON-only). See `web/README.md`.

```bash
npm run web:install    # install web deps
npm run web:dev        # Vite dev server on :5173, proxies API/socket to https://localhost:8443
npm run web:build      # -> web/dist (nginx mounts this read-only on :443)
npm run web:test       # vitest
```

After `web:build`, recreate the nginx container to publish: `docker compose --profile extras --profile optional up -d --force-recreate nginx`.

### Tests

`npm run test:all` (`scripts/test-all.js`) aggregates the per-module Jest suites (auth, nexus, timeline, moderator, spark) and exits non-zero if any fails. It runs each with `--coverage=false` because nexus's `package.json` sets a 70% coverage **threshold** that would otherwise fail CI on coverage rather than on a real test failure. For a single module/file/test, run Jest from the module directory:

```bash
cd services/auth && npx jest                      # whole module suite
cd services/auth && npx jest tests/mfa.test.js    # single file
cd services/auth && npx jest -t "name of test"    # single test by name
```

Some modules have extra Jest configs (`jest --config jest.integration.config.js`, spark's `jest.websocket.config.js`) — check the module's `package.json` scripts.

**Auth suite (non-obvious):** it talks to a **real Postgres** and force-syncs the schema, so point it at a SEPARATE database — never the real `exprsn` DB:

```bash
# one-time: create the test DB (owned by the same user as exprsn)
docker exec -e PGPASSWORD=<pw> exprsn-postgres psql -U exprsn -d exprsn -c "CREATE DATABASE exprsn_auth_test;"
cd services/auth && AUTH_DB_NAME=exprsn_auth_test AUTH_DB_USER=exprsn AUTH_DB_PASSWORD=<pw> \
  AUTH_DB_HOST=localhost AUTH_DB_PORT=5432 npx jest
```

`tests/setup.js` mocks the in-process CA (`services/ca/services/token` + `platformSigning`) with a stateful fake and disables the `@exprsn/shared` rate limiters; `jest.config.js` sets `maxWorkers:1` because all suites share that one test DB. Only `tests/session.test.js` is currently green — the other auth suites have a pre-existing-failure backlog (STATUS.md #9 note).

**Nexus suite:** `services/nexus/tests/setup.js` loads the repo-root `.env` for DB creds but **forces** `DB_NAME=exprsn_nexus_test` so tests use an isolated DB, never the real `exprsn`. It also mocks `ioredis` and `bull` so require-time queue construction (e.g. `eventReminderService`) doesn't reach Redis. Most nexus suites mock their models and need no DB; a few force-sync — create the test DB once:

```bash
docker exec -e PGPASSWORD=<pw> exprsn-postgres psql -U exprsn -d exprsn -c "CREATE DATABASE exprsn_nexus_test OWNER exprsn;"
docker exec -e PGPASSWORD=<pw> exprsn-postgres psql -U exprsn -d exprsn_nexus_test -c "CREATE SCHEMA IF NOT EXISTS nexus AUTHORIZATION exprsn;"
```

Note: unit tests must mock the **individual** model files (`require('../models/Event')`) — nexus services import models per-file, not via the `../models` index, so mocking the index has no effect. `groupService`/`moderationService` and a few `events` route assertions still have a pre-existing stale-test backlog.

Bull queue workers are **not** part of the gateway process; run separately via the root aliases `npm run worker:timeline` (`node services/timeline/src/worker.js`) and `npm run worker:prefetch` (`PREFETCH_ROLE=worker node services/prefetch/src/worker.js`).

Runtime prerequisites: Postgres and Redis must be up **before** `npm start` — some modules (spark, vault) connect to Redis / build Bull queues / create ES indices at `require` time.

## Architecture

Read `ARCHITECTURE.md` (design) and `STATUS.md` (known follow-ups / punch list) before structural changes. `API_SURFACE.md` documents every module's HTTP/socket endpoints — consult it before adding or wiring routes (including from the SPA). `SPRINT.md` is the current sprint plan (sequenced, MVP-focused tickets) — check it before picking up work so you're aligned on ordering and acceptance criteria.

### Source of truth

- `src/modules/registry.js` — the canonical module list: name, mount prefix, Postgres schema, entry file, Socket.IO namespace(s). Everything else (schema bootstrap, migration orchestration, gateway mounts) derives from it.
- `src/gateway.js` — single edge Express app: helmet/cors/compression, aggregate `/health`, mounts every module at its prefix, central error handler (returns a correlation id, never leaks internals), and the **single** Socket.IO server (`path: /socket.io`) onto which modules attach namespaces.
- `src/index.js` — bootstrap: load modules → run their `init()` → create the one HTTPS server → `attachSockets`. Optional `:8080` HTTP→HTTPS redirect.
- `src/config/index.js` — all env parsing; loads `.env` from repo root.

### Module contract

Each module's entry (`services/<name>/...index.js`) exports:

```js
module.exports = {
  name,
  app,                     // Express app/router — NO listen(), NO views, NO static, NO setup routes
  registerSockets(io) {},  // optional — attach this module's namespace(s) to the shared io
  async init(ctx) {},      // optional — db/redis/queue setup; MUST NOT listen. ctx = { config, logger, schema }
};
```

Module routes are reached at `<prefix>/<internal-route>`, e.g. `/spark/api/conversations`. Modules are **JSON APIs only** — all server-rendered views, static SPAs, and setup wizards were deliberately removed during consolidation; do not reintroduce them. (The frontend lives entirely in `web/` as a separate build artifact served by nginx, never by a module.)

### Data isolation

One Postgres database (`exprsn`) with **one schema per module** (set via Sequelize `define.schema`). One shared Redis. Two migration paths: `db:migrate` (`scripts/migrate-sync.js`) syncs models into each schema (the default), while `db:migrate:raw` (`scripts/migrate-modules.js`) replays each module's existing migration files in-place with `DB_SCHEMA`/`DB_NAME` injected via env (moderator uses sequelize-cli; others use their own `scripts/migrate*.js`). Known gap (STATUS.md #1): raw migrations with unqualified table names can land in `public` instead of the module schema — schema-qualify or set a `searchPath` when touching migrations.

### Shared code — two copies

- `shared/` — the `@exprsn/shared` package (root dependency `file:./shared`): auth/token middleware, role validation, error handling, rate limiting, audit logging, etc.
- `services/shared/` — a **copy** of the same package, reached by modules using relative requires (`require('../shared/...')`). Both import styles are live in the codebase; if you change shared code, keep both copies in sync (or migrate the relative requires to `@exprsn/shared`).

### Inter-module calls

Code still issues HTTP calls via `*_SERVICE_URL` env vars, which now all point back at `https://localhost:8443/<module>` (in-process via the gateway). Long-term direction is direct in-process calls. Service-to-service auth uses per-service HMAC tokens derived from `SERVICE_TOKEN_SECRET` (see `.env.example`); the unified process presents `SERVICE_ID=platform`.

### Things to watch

- `TODO(platform)` markers flag socket/init wiring adapted from the original per-service bootstraps that still needs runtime verification (per-namespace auth middleware, spark's redis-adapter ownership, moderator's two namespaces).
- The platform was originally built without live Postgres/Redis; parts are now runtime-verified against live infra (see STATUS.md "Recently resolved") but coverage is incomplete. Treat STATUS.md as the authoritative punch list — check what's been verified before assuming, and update it as items are resolved.
- A fail-closed dev auth bypass exists (`DEV_BYPASS` + secret header + loopback only + NODE_ENV=development); never weaken its conditions.
- CORS: `CORS_ORIGIN` unset or `*` means same-origin only — wildcards are never honored with credentials.

### MVP / release readiness

The code is structurally complete and largely runtime-verified; the gap to a real release is mostly **release engineering**, tracked in `STATUS.md` → **Production readiness (R1–R6)**: git + CI now exist locally (R1, lint + web-build gates) but the repo has no remote/branch-protection yet; still dev-only self-signed TLS, Winston-only observability (no metrics/tracing/error-tracking), `.env` secrets without rotation, and no load/backup verification. Don't assume "runs locally" means "shippable".

Current MVP scope decisions (2026-06-22), which determine what's blocking:

- **Single gateway instance** for MVP — so spark's redis-adapter ownership (STATUS #3) is deferred, not blocking.
- **`/live` streaming publish is in scope** — so its WebRTC signaling needs per-event auth (STATUS #11) before MVP.
- **Sessions full fix — DONE** (STATUS #9): `Session` rows persist on every login path with the CA token id, and `DELETE /sessions` + logout revoke the CA token in-process (bearer 401s after). `services/auth/tests/session.test.js` is green.
- **Sprint ordering is release-engineering-first** — see `SPRINT.md`.
