# Next Sprint — MVP Release Readiness

**Window:** 2026-06-22 → 2026-07-03 (2 weeks)
**Goal:** Take the platform from "structurally complete + runtime-verified" to a
**deployable MVP candidate** in staging — release engineering first, then close the
remaining functional gaps, then verify under load.

**Scope decisions driving this plan (see `STATUS.md`):** single gateway instance ·
`/live` publish in scope · Sessions full fix · release-engineering-first.

Ticket IDs map to `STATUS.md`: `R1–R6` = Production readiness; `#N` = numbered
follow-up. Sizing is rough: S ≈ ≤1d, M ≈ 2–3d, L ≈ 4d+.

---

## Progress (2026-06-24)

- **SP-7 — DONE (`/live` publish/signaling auth).** The `/live` namespace is now
  optional-auth: anonymous viewers connect (HLS + `join-stream` stay open), but the
  handshake validates any CA bearer (`setupAuth`) and a `requireAuthed` guard fronts
  all WebRTC signaling (`signal`/`offer`/`answer`/`ice-candidate`), `join-room`, and
  `update-participant-state`. `join-room` binds the participant by the validated
  `userId` (not client data). New suite `services/live/tests/socketAuth.test.js`
  (17 tests) covers accept/reject on each publish event + the open viewer path, and
  `live` is wired into `npm run test:all` (fully mocked — no DB/Redis). See
  `STATUS.md` #11.

## Progress (2026-06-22)

- **SP-6 — DONE (sessions feature).** `Session` rows now persist on every login
  path (bearer + passport + MFA + OAuth + re-mint) capturing `caTokenId`/IP/UA, and
  `DELETE /sessions(/:id)` + logout **revoke the CA token in-process** so the bearer
  401s afterward. Auth test harness repaired (was unrunnable); `session.test.js`
  passes 29/29 against live Postgres incl. the revoke→401 acceptance. The other auth
  Jest suites (oauth2/saml/rbac/organization/mfa/passwordService) have pre-existing,
  unrelated failures — tracked as a stabilization follow-up (see `STATUS.md` #9 note).
- **SP-1 — DONE (local).** Repo under git with a root `.gitignore` (no secrets/certs/
  builds/logs tracked); initial commit made. *Manual next step:* add the org remote,
  push, and set branch protection requiring the CI checks below (no remote here).
- **SP-2 — DONE (config) / stabilizing (tests).** `.github/workflows/ci.yml` runs
  three jobs: **lint** and **web-build** are the required green gates (both verified
  locally: `npm run lint` → 0 errors; `npm run web:build` → ok). Added a root ESLint
  config (the repo had none — lint never actually ran) and `npm run test:all`
  (`scripts/test-all.js`) with Postgres/Redis service containers; the test job is
  non-blocking until the per-module suites are stabilized. The lint gate surfaced
  10 real latent bugs (undefined vars / a duplicate object key) across
  filevault/live/nexus/spark/moderator — all fixed.

---

## Phase 0 — Foundation (release engineering)

Everything else deploys through this; do it first.

### SP-1 · Put the repo under source control — R1 · S
Not a git repo today. `git init`, author a `.gitignore` (node_modules, `.env`,
generated certs, `web/dist`, logs), commit the current tree, push to the org
remote, set branch protection on `main`.
**Acceptance:** repo pushed; clean clone + `npm install` + `npm run gen:certs` +
`npm start` works; no secrets or build artifacts committed.

### SP-2 · CI pipeline — R1 · M · blocked by SP-1
CI on every PR running `npm run lint`, the per-module Jest suites, and
`npm run web:build`. There's no root test runner, so the job iterates the modules
(or add an aggregator script `npm run test:all`).
**Acceptance:** PR shows a green required check; a deliberately broken test fails
the build; `web:build` (tsc) gates merges.

### SP-3 · Secrets & production config — R4 · M — ✅ DONE (runbook+proof, 2026-06-24); managed-store deploy-time
Move production config off bare `.env` to a managed secret store. Document a
rotation procedure for `SERVICE_TOKEN_SECRET`, session secrets, DB/Redis creds.
Hard-verify `DEV_BYPASS` cannot engage in prod (`NODE_ENV=production` set; bypass
is fail-closed on loopback + secret header + dev env).
**Acceptance:** staging boots with zero secrets in the image/repo; a written
runbook proves `DEV_BYPASS` is inert in prod; rotation steps documented.
**Done:** `docs/runbooks/secrets-and-rotation.md` (inventory + checklist +
rotation); `DEV_BYPASS` prod-inert proven and regression-locked
(`shared/tests/devBypass.test.js`, 11 tests, in `test:all`); confirmed no secrets
committed. *Deploy-time remainder:* the managed-store injection itself (depends on
deploy target) + setting the prod env per the checklist.

### SP-4 · Real TLS at the edge — R2 · M — ◑ verification slice DONE (2026-06-24); certs deploy-time
Terminate real certificates at the nginx edge (`:443`) in staging. Confirm
inter-service axios verifies in production mode (`shared/utils/httpAgent.js`
`rejectUnauthorized` only off outside prod).
**Acceptance:** staging served over a trusted cert; with `NODE_ENV=production`,
loopback service calls verify TLS (no `rejectUnauthorized:false` path reachable).
**Done (2nd half of acceptance):** audited all `rejectUnauthorized`; fixed 3
runtime DB configs that hardcoded it off (moderator/ca/atproto) → now
`DB_SSL_REJECT_UNAUTHORIZED`-gated; locked the agent prod-verify with
`shared/tests/httpAgent.test.js`. *Remaining:* real cert provisioning at the edge
(needs a domain/staging host) — genuinely deploy-time.

### SP-5 · Observability baseline — R3 · M — ✅ DONE (code, 2026-06-24); alerting deploy-time
Wire error tracking (e.g. Sentry) into the gateway central error handler (it
already mints correlation ids). Alert on `/health` degradation and process crash.
Stretch: `prom-client` metrics on the gateway (request, socket, queue depth).
**Acceptance:** a thrown error surfaces in the tracker with correlation id; a
forced `/health` failure pages/notifies; logs ship to durable storage.
**Done:** `prom-client` metrics on `GET /metrics` (HTTP + socket + defaults,
token-optional) and a `captureException` hook in the central error handler keyed
by correlationId (opt-in Sentry — no-op unless `SENTRY_DSN`+`@sentry/node`). Wired
in `src/observability/*` + `src/{gateway,index,config}.js`; supertest-verified.
*Deploy-time remainder:* scraper + `/health`/crash alerting + durable log shipping
(need a monitoring target). The "thrown error → tracker" acceptance needs a real
`SENTRY_DSN` to fully demonstrate; the hook + no-op path are verified.

---

## Phase 1 — MVP functional gaps

Can start in parallel with Phase 0 (different people); deploys ride on Phase 0.

### SP-6 · Sessions full fix — #9 · L
Persist a `Session` row on **every** login path (CA bearer *and* passport),
capturing IP/UA + the CA token id. Make `DELETE /sessions/:id` and
`DELETE /sessions` **revoke the CA token** (not just delete the row). Security-
sensitive — review token lifecycle.
**Acceptance:** login writes a row; `GET /auth/api/sessions` lists real active
sessions; revoking one invalidates that token at the CA (subsequent calls 401);
unit + integration tests cover both login styles and revocation.

### SP-7 · `/live` publish/signaling auth — #11 · M — ✅ DONE (2026-06-24)
Gate WebRTC publish/host signaling (`signal`/`offer`/`answer`/`ice-candidate`,
`join-room`/`update-participant-state`) on a validated CA bearer; authorize
host/broadcaster actions against that identity. Leave public viewer subscribe
paths open and unaffected.
**Acceptance:** unauthenticated socket can view but **cannot** publish/host;
valid host bearer can; viewer connect latency unchanged; tests for accept/reject
on each publish event.

### SP-8 · Frontend E2E pass — #9 (frontend) · M · blocked by SP-6
React rendering has never been driven in a browser (API-level only). Stand up
Playwright (or, minimum, a documented manual checklist) covering login → settings
→ MFA enable wizard (QR + TOTP) → sessions list + revoke.
**Acceptance:** the flow passes end-to-end against a running stack; MFA QR renders
and a generated TOTP enables/disables; sessions UI reflects SP-6; run wired into CI
if automated.

---

## Phase 2 — Hardening & verification

Needs staging (Phase 0) and the features (Phase 1) in place.

### SP-9 · Load / throughput pass — R5 · M · blocked by SP-4, SP-5
Representative load against REST + Socket.IO + Bull queues on a single instance.
Watch PG/Redis headroom, socket fan-out, queue drain, memory (no OOM under burst).
**Acceptance:** documented run at target concurrency with no errors/OOM; bottle-
necks filed as follow-ups; sign-off that single-instance holds expected MVP load.

### SP-10 · Backup / restore rehearsal — R6 · S — ✅ DONE locally (2026-06-24)
Automated backups for the single `exprsn` Postgres DB; rehearse one full restore.
**Acceptance:** scheduled backup verified; a restore into a scratch DB succeeds and
is documented (RPO/RTO noted).
**Done:** `npm run db:backup` / `npm run db:restore` (`scripts/backup/`); restore
rehearsed (119 tables/12 schemas, clean, counts matched live); runbook + RPO/RTO in
`scripts/backup/README.md`. *Deploy-time remainder:* wire the cron schedule,
secret-store `DB_PASSWORD` (SP-3), off-host dump shipping. Not blocked by SP-3 for
the tooling itself (only the prod scheduling/secrets ride on it).

### SP-11 · Security review — S · blocked by SP-6, SP-7 — ✅ DONE (2026-06-24)
Reviewed the branch diff; triaged findings; **must-fix closed** (C1 RBAC privesc,
H1 unauth config, H2 unauth atproto SSRF, M1 user-list, M2 atproto ops reads, M3
cross-tenant groups) with regression tests. Backlog items filed (authed SSRF,
atproto DoS, live `to` room-scope, seed default password, permission-inspect info
disclosure). See `STATUS.md` → "Security review of the branch (SP-11)".

Run the repo's `security-review` over the sprint's changes. Re-check auth/token
flow, per-schema isolation, CORS (`CORS_ORIGIN` never wildcards with credentials),
`DEV_BYPASS`, and rate-limit config (`shared/middleware/rateLimiter.js`).
**Acceptance:** review complete; findings triaged into must-fix (this sprint) vs
backlog; must-fix closed before release.

---

## Sequencing

```
SP-1 → SP-2
SP-3 → SP-4 → SP-9
SP-3 → SP-5 → SP-9
SP-3 → SP-10
SP-6 → SP-8 ┐
SP-6, SP-7 ┴→ SP-11
```

Critical path to a deployable staging candidate: **SP-1 → SP-3 → SP-4/SP-5 → SP-9**.
SP-6/SP-7/SP-8 run in parallel and gate the *product*, not the deploy.

## Explicitly out of scope this sprint (deferred, with reason)

- **Spark redis-adapter ownership (#3)** — only matters once we scale past one
  instance; revisit before horizontal scale-out.
- **Inter-service → in-process calls (#6)** and **timeline → spark/prefetch
  outbound auth (#7)** — dormant scaffolding, no live 401 path; post-MVP.
- **ES-richer post schema / search-by-hashtag (#4 note)** — ES disabled at MVP.
- **Cosmetic cleanup (#10)** — unused `ejs` deps, dead `shared/public/`, empty CA
  routers. Harmless; batch later.
- **Migration↔schema defensive `searchPath` (#1)** — verified clean today; only
  needed when a module gains raw migrations.
