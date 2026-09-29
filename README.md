# Exprsn Platform

A unified Node.js platform that consolidates the formerly-standalone Exprsn
microservices into **one process behind one HTTPS port** (default `8443`).

The canonical module list is `src/modules/registry.js` — currently **14
modules**: the ten original services (CA, auth, spark/messaging, nexus/groups,
filevault, vault/secrets, timeline, prefetch, moderator, live/streaming), the
`atproto` Bluesky/AT-Proto bridge and labeler, and three flag-gated
extensibility modules that load inert until enabled — `plugins`
(`PLUGINS_ENABLED`), `lowcode` (`LOWCODE_ENABLED`), and `cortex` (local-LLM
agents/guardrails, `CORTEX_ENABLED`), all default `false`.

Plain JavaScript (CommonJS), Express 4, Sequelize 6, Socket.IO 4. The frontend
is a separate Vite + React + TypeScript SPA under `web/`, built to `web/dist`
and served by the nginx edge container — never by an Express module.

## Quick start

```bash
npm install            # also resolves @exprsn/shared via file:./shared
npm run gen:certs      # dev self-signed cert (required for the HTTPS edge)
npm run setup          # interactive TUI that builds/edits .env  (or: cp .env.example .env)
npm run infra:up       # Postgres + Redis + the other backing containers
npm run db:bootstrap   # create db `exprsn` + one Postgres schema per module
npm run db:migrate     # sync each module's models into its schema
npm start              # https://localhost:8443
curl -k https://localhost:8443/health
```

Postgres and Redis must be up **before** `npm start` — some modules connect to
Redis, build Bull queues, or create indices at `require` time.

**Run-blocker:** set `CA_BASE_URL=https://localhost:8443/ca` in `.env`. The
nginx-edge default (`https://localhost/ca` on `:443`) makes node/axios hang on
the loopback, and every module's token validation then fails platform-wide with
`CA_UNAVAILABLE`.

Frontend and checks:

```bash
npm run web:install && npm run web:build   # -> web/dist (nginx mounts it read-only on :443)
npm run lint                               # eslint over src/ + services/
npm run test:all                           # aggregate per-module Jest suites
npm run db:check                           # read-only model-vs-DB drift audit
```

Queue and background workers run as separate processes, not inside the gateway
— see the `worker:*` scripts in `package.json`.

## Where the documentation lives

**Living documents — read these before making changes:**

| Document | What it is |
| --- | --- |
| [`CLAUDE.md`](CLAUDE.md) | Repo instructions: commands, module contract, testing, gotchas |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Design: gateway, module contract, schema-per-module isolation, sockets |
| [`API_SURFACE.md`](API_SURFACE.md) | Every module's HTTP + Socket.IO endpoints — consult before wiring routes |
| [`STATUS.md`](STATUS.md) | The authoritative punch list: what's verified, what's open, production readiness R1–R6 |

**Sprints and backlog — [`sprints/`](sprints/README.md):** the single go-forward
home for all planning and intake. Pick work up from `sprints/active/`, file new
items into `sprints/BACKLOG.md`, and don't start work that isn't represented by
a ticket there. `sprints/archive/SPRINT.md` is the pre-convention MVP sprint
(`SP-1`…`SP-11`, `R1`–`R6`), kept for cross-referencing.

**Documentation site — [`docs/`](docs/README.md):** a self-contained static site
(served at `/docs/` by the nginx edge) with hand-written service pages, a data
model reference, and a Markdown viewer. It also holds the archived design
material:

- `docs/runbooks/` — operational how-tos (secrets and rotation, calendar/contacts subscriptions)
- `docs/plans/Design.md` — the administrative interface design specification (Claude Design brief): shell, universal components, all 14 module sections, configuration tab, database editor, backend prerequisites
- `docs/plans/ui-v2-mockups.md` — UI v2 design mockups for every user route and admin section (`mockups/v2/`, open `mockups/v2/index.html`): component map, accessibility rules, per-screen REST + Socket.IO contracts, generated coverage matrix, backend prerequisites (TASK-074)
- `docs/plans/` — design and implementation plans, mostly delivered. Two are
  **generated** and must not be hand-edited: `plugins-decisions.md`
  (`npm run plan:plugins`) and `lowcode-clarifications.md`
  (`npm run lowcode:clarify`)
- `docs/reports/` — point-in-time audits and closed-out lists
- `docs/adr/` — architecture decision records

**Frontend — [`web/README.md`](web/README.md).**

## Repository layout

```
src/            gateway, module loader, config, db bootstrap, provisioning saga
services/       the 14 adapted module copies (services/shared -> ../shared symlink)
shared/         the @exprsn/shared package (auth/token middleware, errors, rate limiting)
web/            Vite + React + TS SPA (separate build artifact)
scripts/        setup TUI, migrations, drift check, seeders, planners
docker/         container configs (nginx, postgres, redis, srs, bind, strongswan)
docs/           documentation site + runbooks + plans + reports + ADRs
sprints/        backlog, active/archived sprints, assessments, templates
```

## CI

`.github/workflows/ci.yml` gates PRs on **lint** and **web-build** (required).
The **test** job (`test:all` against Postgres/Redis service containers) is
non-blocking while the module suites stabilize.
