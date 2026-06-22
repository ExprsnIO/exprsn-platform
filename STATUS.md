# Integration Status & Follow-ups

The unified platform is **structurally complete**: 10 services consolidated into
one app, one HTTPS port, all setup routes + front-end pages removed, single DB
with per-domain schemas wired in. It was originally built without live
Node/Postgres/Redis, so early items below were unverified by construction; since
then large parts have been **runtime-verified** against live PG+Redis (see the
RUNTIME-VERIFIED sections under "Recently resolved"). The items below are the
remaining punch list — check what's already verified before assuming.

> **Two kinds of work remain.** (A) The functional punch list below — module
> behaviour, mostly small and well-scoped. (B) **Release engineering** — SCM/CI,
> real TLS, observability, secrets, load/backup — which is *not* tracked in the
> numbered follow-ups and is the larger gap between "structurally complete" and
> "shippable". See **Production readiness** at the bottom.

## MVP scope decisions (2026-06-22)

Locked decisions that determine which follow-ups are blocking:

- **Deployment topology: single gateway instance.** No horizontal scaling at MVP.
  This makes spark's `@socket.io/redis-adapter` ownership (#3) a **non-blocker**
  for MVP (the adapter only matters across instances); revisit before scaling out.
- **`/live` streaming publish is IN scope.** Untrusted clients may broadcast, so
  per-event WebRTC signaling auth (#11) is **MVP-blocking** this cycle.
- **Sessions (#9): full fix**, not the hide-the-tab cut — persist `Session` rows
  on login and make revoke invalidate the CA token.
- **Sprint ordering: release-engineering-first** (see `SPRINT.md`).

## First run

```bash
cd /Volumes/Storage/exprsn-platform
npm install            # resolves @exprsn/shared via file:./shared
npm run gen:certs      # dev self-signed cert for the single HTTPS edge
cp .env.example .env   # fill DB/Redis/secrets
npm run db:bootstrap   # create db `exprsn` + one schema per module
npm run db:migrate     # migrate-sync.js — sync each module's models into its schema
                       # (db:migrate:raw replays each module's own migration files instead)
npm start              # https://localhost:8443  → GET /health
```

## Recently resolved

### MVP-readiness pass — socket auth, worker drain, route ordering (2026-06-18) — RUNTIME-VERIFIED
Booted the full stack (Docker PG/Redis/nginx + gateway + both workers) and worked
the open punch-list items against it. Fixed three live bugs and verified the rest;
details in the per-item follow-ups (#3, #4, #7) below. Summary:
- **`/moderation` Socket.IO namespace accepted anonymous connections** and granted
  the `admins` room from a client-supplied `query.role` (self-asserted privilege).
  Now requires a valid CA bearer + `isPlatformAdmin` (follow-up #3).
- **Timeline post-indexing failed 100%** — the indexing processor's `attributes`
  lists referenced columns absent from the actual minimal Post schema (`status`,
  then `hashtags`, then ~15 more). Dropped the drifted lists; jobs drain cleanly
  (follow-up #4).
- **Prefetch `GET /metrics` was unreachable** (400 `INVALID_UUID`): the single-segment
  `GET /:userId` param route was registered before it and captured `metrics` as a
  userId. Moved `/:userId` last (same fix pattern as the auth/roles.js ordering bug).
- **Verified working:** dev login + bearer; authed reads across all 10 modules;
  socket auth on `/spark /timeline /vault /notifications /moderation` (reject w/o
  token), `/ca` + `/live` open by design (#3, #11); both Bull workers connect to
  shared DB/Redis and drain `fanout`/`indexing`/prefetch queues.
- **Infra note:** the `exprsn-postgres`/`exprsn-nginx` containers had been recreated
  with a wrong-case bind-mount path (`/volumes/...`) and were stuck in `Created`;
  `docker compose up -d postgres nginx` from the repo root recreates them correctly
  (named volume `pg_data` persists data).

### Admin pages: bearer-admin, error rendering, CA sessions, raw-SQL schema (2026-06-17) — RUNTIME-VERIFIED
Investigated `[object Object]` on the admin/CA pages and fixed the chain of
backend defects behind it (all verified against live PG+Redis via the gateway):
- **`[object Object]` was an error-render + redirect bug, not a data bug.** CA
  admin (`services/ca/routes/admin.js`) `res.redirect('/auth/login')` for a
  request without a valid admin identity; an SPA `fetch` follows it to a
  non-existent route → `404 "Route GET /login not found"`, which an older bundle
  rendered as `[object Object]`. `requireAuth`/`requireAdmin` now return **JSON
  401/403** (never redirect an API), and `resolveAdminBearer` marks any valid
  token (`req.bearerUser`) so 401-reauth vs 403-not-authorized are distinct.
- **Frontend hardening (defense-in-depth):** `web/src/lib/http.ts` (`ApiError`)
  and `web/src/lib/errors.ts` (`toMessage`) now coerce an object-valued
  `message`/`error` to JSON so nothing can render as `[object Object]` again.
- **CA session store → Redis.** `services/ca/index.js` dropped `connect-pg-simple`
  (it was handed Sequelize's pool, not a pg `Pool` → `this[#pool].query is not a
  function` 500s) for the shared Redis `RedisStore` (prefix `exprsn:ca:sess:`),
  matching auth/spark/etc. See follow-up #2.
- **auth accepts the SPA bearer.** New `services/auth/src/middleware/bearerAuth.js`
  validates the CA bearer in-process and populates `req.user` + `req.isAuthenticated()`
  so the session-based `requireAuth`/RBAC stack works for bearer-only callers
  (Permission Catalog, Auth & Identity). Also fixed a **route-ordering bug** in
  `routes/roles.js`: `GET /permissions` was shadowed by `GET /:id` → `findByPk('permissions')`
  → invalid-UUID 500; moved the static route above the param route.
- **spark/filevault honor the platform-admin allowlist.** They gated on a
  token-level `isAdmin`/`admin` permission the SPA token never carries. Spark
  (`src/middleware/auth.js`) sets `req.user.isAdmin` and filevault
  (`src/middleware/auth.js` `requirePermissions`) short-circuits, both from
  `isPlatformAdmin(tokenData.email)` — same source of truth as CA/auth.
- **FileVault raw-SQL schema bug** (`relation "file_blobs" does not exist`):
  see follow-up #1.
- Verified: every admin section endpoint returns **200** for a platform-admin
  bearer (CA, roles+permissions, jobs, spark queues, filevault stats/dedup/
  duplicates, nexus, live, vault, moderator); no-bearer still **401**.

### Frontend Phase 4a — Account Settings (2026-06-15)
Added a tabbed `/settings` page to the `web/` SPA (Profile · Security · Sessions)
against existing `/auth` endpoints. New: `web/src/api/account.ts`,
`web/src/features/account/{AccountPage,ProfileForm,SecuritySection,SessionsList}.tsx`,
`web/src/lib/errors.ts` (shared `toMessage`). Touched: `lib/http.ts` (new
`skipAuthHandler` request option), `api/auth.ts` (richer `User` fields),
`app/store.ts` (`setUser`), `app/router.tsx` (`/settings` route),
`app/RootLayout.tsx` (AppBar username links to `/settings`).
- **401→logout footgun fixed.** `http.ts` fires the global unauthorized handler on
  any non-`/auth/api/auth/*` 401. MFA disable / regenerate-backup-codes return
  **401 INVALID_PASSWORD** on a wrong password (`services/auth/src/routes/mfa.js`
  :224,:269) and live under `/auth/api/mfa/*`, so they'd wrongly log the user out.
  Those two `accountApi` calls now pass `skipAuthHandler: true` → inline error, no
  logout. `change-password` is already exempt (under `/auth/api/auth/`).
- **Two auth styles, one client.** Profile update (`PUT /auth/api/users/:id`) is CA
  **bearer**-guarded; password/MFA/sessions are passport **session-cookie**-guarded.
  Both work because `lib/http.ts` sends the bearer AND `credentials: 'include'`.
- Verified: `npm run web:build` (tsc) + `web` eslint clean; live curl against the
  gateway — `mfa/status` 200, `sessions` 200, `PUT users/:id` (bearer) 200,
  cookie-auth `me`/`status` 200. (`GET /auth/api/sessions` returned `[]` for a
  curl/passport login — Session rows aren't persisted for that path; the UI renders
  empty fine.) Full browser E2E of the MFA enable wizard (QR + TOTP) not yet driven.

### Module-API + socket auth (2026-06-15) — RUNTIME-VERIFIED against live PG+Redis
Booted the platform (Postgres + Redis run as the `exprsn-postgres`/`exprsn-redis`
Docker containers; all module schemas already bootstrapped) and confirmed end to
end with the dev user: `GET /spark/api/conversations` → 200, `GET
/timeline/api/timeline` → 200, `GET /vault/api/secrets` → 403
`RESOURCE_NOT_AUTHORIZED` (token validates; vault's own `/secrets` scope policy
then applies — the 503 is gone), and the `/spark` + `/timeline` Socket.IO
namespaces both CONNECT (were "Authentication failed").

The auth↔CA bearer-token flow works in-process; these were the last per-module
failures on top of it (spark/vault HTTP 503, spark/timeline socket handshake
rejected, timeline feed 500):
- **Missing `CA_URL` env.** The shared validators (`shared/middleware/
  tokenValidation.js`, `socketAuth.js`) and the spark/timeline `config.ca.url`
  read `process.env.CA_URL`, which was never set (only `CA_BASE_URL`/
  `CA_SERVICE_URL` were) → fell back to `http://localhost:3000` → ECONNREFUSED →
  503/handshake fail. Added `CA_URL=https://localhost:8443/ca` to `.env` +
  `.env.example`, and made both shared validators fall back through
  `CA_URL || CA_BASE_URL || CA_SERVICE_URL` before the localhost default.
- **Socket validators sent no service identity.** `services/{spark,timeline}/
  src/socket/index.js` posted to the CA `/api/tokens/validate` (guarded by
  `requireSessionOrService`) without `X-Service-ID`/`X-Service-Token` → 401.
  Added a `buildServiceHeaders()` (HMAC via `deriveServiceToken`) to both.
- **Timeline `Post.status` schema drift.** The Post model has no `status` column
  (uses `deleted` + `visibility`); removed the drifted `status: 'published'`
  filter from the four Sequelize query sites (`feedService.getHomeFeed`/
  `getUserTimeline`, `routes/timeline.js` global, `routes/search.js` sqlSearch).
  `status` legitimately remains only in the Elasticsearch code.
- **CA validate schema rejected array permissions.** Surfaced during the live
  test: the shared `tokenValidation.js` sends `requiredPermissions: ['read']`
  (array), but CA `validators/tokens.js validateTokenSchema` only allowed the
  object form → Joi 400 → shared middleware's generic 500. The route
  (`routes/api.js`) already normalizes arrays, so the schema was out of sync;
  made `requiredPermissions` accept array OR object.
- **Note:** `services/shared` is a symlink to `../shared` in this checkout — the
  "two copies, keep in sync" guidance is one file here, so single edits cover
  both `@exprsn/shared` and relative `../shared/...` import styles.

### Timeline cursor pagination (2026-06-15) — RUNTIME-VERIFIED
Found while seeding posts to exercise the feed (the empty-feed `posts: []` test
can't surface it — needs enough rows for a 2nd page). The `/api/timeline/global`
route dropped the cursor clause, so every page re-ran the unfiltered query and
returned the newest N posts forever (`hasMore` never false → infinite scroll
loop). `buildCursorWhere()` (`utils/cursor.js`) returns an object keyed by the
Sequelize `Op.or` **Symbol**; the route gated the merge on
`Object.keys(cursorWhere).length > 0`, but `Object.keys()` does not enumerate
Symbol keys → always 0 → clause never merged. Fix (`routes/timeline.js`): drop
the guard and spread directly (`...(cursorWhere || {})`) — object spread *does*
copy Symbol keys. The home `/` route was already correct (it passes the clause
through `feedService`, which spreads it). Verified: 6 seed posts walk cleanly in
pages of 2 across both `/global` and `/` — strict createdAt-DESC, no dupes, no
gaps, `hasMore` terminates.

### Timeline + Prefetch platform integration (2026-06-15)
Bridged the timeline and prefetch modules into the single-DB / single-Redis /
single-port model and wired their cross-service dependencies through the gateway.
- **Shared DB.** `services/{timeline,prefetch}/src/config/index.js` now fall back
  to the platform `DB_*` vars / the single `exprsn` database (per-service
  `TIMELINE_DB_*` / `PREFETCH_PG_*` still override). Timeline's Sequelize
  (`timeline/src/models/index.js`) gained `searchPath: 'timeline'` +
  `dialectOptions: { prependSearchPath: true }` so raw SQL stays in-schema
  (follow-up #1). `.env` already targeted `exprsn` for both.
- **Redis allocation (shared instance).** Prefetch caches live in logical DBs
  `0` (hot) / `1` (warm) / `2` (metrics). Both timeline's fan-out and prefetch's
  hot cache used the key `timeline:{userId}` on **DB 0** with incompatible value
  types (feed structure vs. JSON blob → `WRONGTYPE`). Fixed by giving prefetch's
  cache a `keyPrefix: 'prefetch:'` (`prefetch/src/cache/redis.js`). Bull queue
  names are already distinct (timeline: fanout/trending/indexing/notifications;
  prefetch: `prefetch`).
- **Workers split out.** Added `npm run worker:timeline` / `worker:prefetch`.
  Timeline's `initializeQueues()` is producer-only (no `.process()`), so the
  gateway never consumes. Prefetch previously registered its Bull processor at
  require-time and ran its scheduler inside `init()` → the gateway processed heavy
  timeline-pull jobs. Now the `.process()` registration is gated
  (`registerProcessor()` / `PREFETCH_ROLE=worker`) and the activity scheduler
  lives in `prefetch/src/worker.js`; the gateway is REST + enqueue only.
- **Inter-service rewiring.** All loopback axios clients
  (`timeline/src/services/{herald,spark,prefetch}Service.js`,
  `prefetch/src/services/prefetchService.js`, `prefetch/src/utils/caClient.js`)
  now use a shared dev-TLS agent (`shared/utils/httpAgent.js`,
  `rejectUnauthorized` off outside production) to trust the gateway's self-signed
  cert. Timeline's prefetch client paths were aligned to prefetch's real REST
  routes (`DELETE /api/cache/:userId/timeline`, `POST /api/prefetch/schedule/:userId`,
  `GET /api/cache/:userId`) — they previously hit non-existent paths.
- **Herald → moderator.** No standalone Herald service exists; timeline's
  `HERALD_SERVICE_URL` now points at `/moderator`. Added
  `moderator/src/routes/notifications.js` (`POST /api/notifications`, guarded by
  the HMAC `verifyServiceToken`) which emits `notification` to the existing
  `/notifications` socket room `user:{userId}`; `registerSockets` publishes the
  namespace via `app.set('notificationsNs', …)`. Timeline's Herald client now
  sends `X-Service-ID`/`X-Service-Token`.
- **Prefetch migration.** `prefetch/scripts/migrate-postgres.js` used MySQL inline
  `INDEX` syntax (invalid in Postgres); split into `CREATE INDEX` statements and
  honored `DB_SCHEMA`.
- **Not runtime-verified** (no live boot in this pass) — see follow-up #7.

## Known follow-ups (by priority)

### 1. Migration ↔ schema alignment — NOT MVP-BLOCKING in current DB (verified 2026-06-18)
**Live check:** every module's tables are correctly placed in its own schema —
`information_schema` shows `ca:23 auth:15 spark:7 nexus:17 filevault:8 vault:7
timeline:10 prefetch:1 moderator:13 live:8`, and the only tables in `public` are
the three PostGIS system tables (`geometry_columns`/`geography_columns`/
`spatial_ref_sys`), which belong there. Nothing leaked. The default migrate path
(`db:migrate` → `migrate-sync.js`, model sync) honors `define.schema`, so the
feared "tables land in `public`" did not happen. Combined with the raw-SQL sweep
below (no other runtime occurrences), this item is **not blocking for MVP**.

The remaining work is **defensive, for whoever next authors a raw migration**:
models are schema-qualified (`define.schema = '<module>'`), but a raw
`createTable('users', …)` with an **unqualified** name would land in `public`. To
prevent that, add a connection `searchPath` to the module's schema (Sequelize:
`searchPath: '<schema>'` + `dialectOptions: { prependSearchPath: true }`); for
**moderator** (sequelize-cli) also set `migrationStorageTableSchema: 'moderator'`.
**Done for timeline** (`searchPath` on its models' Sequelize) **and prefetch**
(`migrate-postgres.js` schema-qualifies its table + indexes); the other modules
are fine as-is today and only need this if/when they gain raw migrations.

**Raw SQL must be schema-qualified by hand.** `define.schema` only qualifies
*model* queries — a raw `sequelize.query('… FROM file_blobs')` resolves against
`search_path` (`public`) and 500s with `relation "<table>" does not exist`.
Qualify with the module schema read from the instance, e.g.
``const schema = sequelize.options.define.schema; `"${schema}"."file_blobs"` ``.
Fixed in `services/filevault/src/services/deduplicationService.js` (2026-06-17,
the dedup/duplicates admin endpoints). A sweep of all `services/*/src` for raw
`FROM`/`JOIN`/`INTO`/`UPDATE <table>` found **no other runtime occurrences**
(setup scripts only touch `pg_database`/`information_schema`, which are
schema-agnostic).

### 2. Shared session store (auth, ca) — RESOLVED 2026-06-17
Both modules now use the shared Redis `express-session` store when
`REDIS_ENABLED=true` (MemoryStore fallback in dev only):
- `auth` — `RedisStore` on prefix `exprsn:auth:sess:` (`services/auth/src/index.js`).
- `ca` — switched off `connect-pg-simple` (it was passed Sequelize's pool, not a
  pg `Pool`) to `RedisStore` on prefix `exprsn:ca:sess:` (`services/ca/index.js`).
  Verified: log prints `Session store: Redis` for both; CA admin requests no
  longer 500 on session ops.

### 3. Socket.IO wiring verification (`TODO(platform)` markers) — RUNTIME-VERIFIED 2026-06-18
`ca, spark, vault, timeline, moderator, live` each export `registerSockets(io)`
that attaches their namespace(s) to the single Socket.IO server. Live handshake
matrix (valid CA bearer vs no token, all 7 namespaces):
- **Auth enforced** (no-token → rejected): `/spark`, `/timeline` (fixed 2026-06-15),
  `/vault`, `/notifications`, and `/moderation`.
- **`/moderation` was the gap — now fixed 2026-06-18.** It previously accepted
  **anonymous** connections and granted the `admins` room from a *client-supplied*
  `handshake.query.role === 'admin'` (self-asserted privilege). `registerSockets`
  (`services/moderator/src/index.js`) now requires a valid CA bearer **and**
  `isPlatformAdmin(tokenData.email)` (same source of truth as the moderator HTTP
  admin endpoints) via a shared `validateBearer` helper; the `query.role` escalation
  is removed (no emitter targeted `admins` anyway — moderation events go to
  `moderators`). Verified: no-token → `Authentication failed`; admin bearer → connect.
- **`/ca` and `/live` are open by design (documented, acceptable for MVP):**
  - `/ca` uses session middleware and deliberately "allow[s] connection but
    mark[s] as unauthenticated" (`socket.authenticated=false`); it only joins a
    `user:{id}` room when a session user exists, so an unauthenticated socket
    receives no targeted events. The bearer-based SPA has no session here anyway.
  - `/live` attaches WebRTC signaling with no handshake auth — consistent with
    public stream **viewers**. **Open follow-up (#11):** broadcast/publish signaling
    events (`signal`/`offer`/`answer`, room participation) are not auth-gated; lock
    these down before opening streaming publish to untrusted clients.
- `spark`'s `@socket.io/redis-adapter` is applied to the **gateway-owned** root
  `io` (spark applies it in `init()` if `REDIS_ENABLED=true`; decide whether the
  gateway should own the adapter instead) — **NOT MVP-BLOCKING given the
  single-instance decision** (2026-06-22): the adapter only matters for socket
  fan-out across multiple gateway instances. Resolve ownership (gateway should own
  it) before any horizontal scale-out.
- `moderator`'s two namespaces (`/moderation`, `/notifications`) both bind. ✓

### 4. Standalone workers (run as separate processes) — RUNTIME-VERIFIED 2026-06-18
`timeline/src/worker.js` and `prefetch/src/worker.js` (Bull queue workers) are
**not** part of the in-process gateway. Run them with `npm run worker:timeline` /
`npm run worker:prefetch`. The gateway no longer consumes prefetch jobs
(processor gated behind `PREFETCH_ROLE=worker`). Verified live (both connect to
the shared DB/Redis and drain queues):
- **prefetch worker**: starts clean — processor registered, Redis hot/warm caches
  connected, activity scheduler running.
- **timeline worker**: connects to DB+Redis; fan-out jobs complete; indexing jobs
  now complete (see fix below). Creating a post enqueues `fanout` + `indexing`
  jobs that both drain.
- **Fixed: timeline indexing was failing 100%** (`jobs/processors/indexingProcessor.js`).
  Its hand-maintained `attributes` lists (both `findByPk` and the bulk-reindex
  `findAll`) referenced columns the **actual minimal Bluesky-integrated Post
  schema doesn't have** — first `status` (the #80 drift, still present here), then
  `hashtags`, then the whole list (`mentions`/`urls`/`engagementScore`/`viewCount`/
  `replyCount`/`publishedAt`/`location`/`hasMedia`/… — none exist on the model).
  Dropped both curated lists so the queries fetch the real model columns, and
  changed the bulk-reindex filter from `status:'published'` → `deleted:false`. With
  ES disabled (default), `indexPost` no-ops and jobs now resolve cleanly instead of
  erroring through their retries. **Note:** the ES index/search code is built for a
  richer post schema than exists — fine while `ELASTICSEARCH_ENABLED` is false, but
  search-by-hashtag/engagement won't have data until the schema/feature catch up.

### 5. Require-time side effects
Some modules connect to Redis / build Bull queues / create ES indices at
`require` time (spark, vault). This matches original behavior but means the DB and
Redis should be up before `npm start`. `nexus`'s require-time `process.exit` on DB
failure was removed so a DB blip can't kill the whole platform.

### 6. Inter-service calls
Modules are in-process, but code paths still using `*_SERVICE_URL` now point at
`https://localhost:8443/<module>` (see `.env.example`). Long term, replace these
HTTP hops with direct in-process calls.

### 7. Timeline outbound service auth (timeline → spark/prefetch) — NOT MVP-BLOCKING (dormant scaffolding, verified 2026-06-18)
Investigated against the live tree: the `spark`/`prefetch` HTTP clients
(`timeline/src/services/{spark,prefetch}Service.js`) are **dormant scaffolding** —
their functional methods (`sendRealtimeEvent`/`broadcastEvent`/`notifyNewPost`,
`invalidateUserTimeline`/`prefetchTimeline`/`getCachedTimeline`/`warmCache`) have
**0 call sites** anywhere in `timeline/src`; only `checkHealth()` is invoked (from
the health route → `GET /health`, no auth). So there is currently **no live code
path that 401/403s**, and MVP realtime/feed works without them (timeline delivers
via its own `/timeline` socket namespace + Bull fan-out, not via spark). Two
prerequisites remain *before* anyone wires these clients into the post-create flow:
- **spark's broadcast endpoint does not exist.** The clients POST
  `/api/events/broadcast` + `/broadcast-multi`, but spark has no such HTTP routes
  (only socket/presence broadcast internally). Those endpoints must be built first.
- **Auth + the `requireSelfOrAdmin` wrinkle.** When wired, reuse prefetch's
  `caClient.getServiceToken()` pattern (timeline already does this for the socket
  handshake via `deriveServiceToken`) to mint a CA bearer. Prefetch's cache routes
  also gate on `requireSelfOrAdmin('userId')` (`req.userId === :userId || req.permissions.admin`),
  which a service token won't satisfy — give service callers an admin/service
  bypass or a dedicated service route. The timeline → **moderator** notification
  path is already authed (HMAC `X-Service-ID`/`X-Service-Token`).

### 8. Vestigial `prefetch.prefetch_jobs` table — NOT MVP-BLOCKING (leave as-is)
Prefetch does not open a Postgres connection at runtime (queue + cache are
Redis-only); `prefetch_jobs` (the lone table in the `prefetch` schema, confirmed
2026-06-18) is provisioned by `migrate-postgres.js` but never read/written.
**Decision for MVP: leave it** — an empty unused table is harmless and dropping it
is needless risk. Revisit only if/when job persistence/analytics is actually built
on it (then wire it) or a schema cleanup pass drops it.

### 9. Frontend E2E verification (`web/` SPA)
SPA serving verified 2026-06-18: nginx serves `web/dist` on `:443` (title "Exprsn",
hashed JS bundle) and same-origin API proxying works (`POST https://localhost/auth/
api/auth/login` → 200). No browser-automation tooling is installed, so React
rendering itself is still undriven, but the two flows behind the screens were
checked at the API level:
- **MFA enable wizard — backend RUNTIME-VERIFIED.** Drove the exact calls the wizard
  makes (bearer auth): `POST /auth/api/mfa/setup` returns a base32 secret + QR data
  URL; a speakeasy-generated TOTP passes `POST /mfa/verify` → `mfaEnabled:true`;
  `POST /mfa/disable` (password) restores `mfaEnabled:false`. The QR/secret
  generation and TOTP validation work end to end; only the in-browser QR render +
  code entry remain to eyeball.
- **Sessions list is non-functional — confirmed a real gap (not a passport quirk).**
  `GET /auth/api/sessions` → `{sessions:[]}`, and there is **no `Session.create`/
  `createSession` anywhere in `services/auth/src`** — no login path (bearer *or*
  passport) ever persists a `Session` row, so the list is always empty and the
  revoke endpoints (`DELETE /sessions/:id`, `DELETE /sessions`) operate on a table
  nothing fills. **DECISION (2026-06-22): option (a) — full fix.** Write a `Session`
  row on login (bearer *and* passport paths), capturing IP/UA + the CA token id, and
  make `DELETE /sessions/:id` / `DELETE /sessions` actually invalidate the CA token
  (revoke at the CA, not just delete the row). Tracked as a sprint ticket — has
  token-lifecycle/security implications, so it gets focused work. Option (b)
  (hide the tab) is rejected; the feature ships.
  - **RESOLVED 2026-06-22 (SP-6).** `recordSession` (`services/auth/src/services/
    sessionService.js`) now writes/upserts a `Session` row on every token-minting
    login path — register, local login, MFA verify, OAuth callback, and `POST
    /api/auth/token` re-mint (`services/auth/src/routes/auth.js`), capturing
    `caTokenId` (the bearer/jti) + IP/UA. `Session` gained a `caTokenId` column
    (`models/Session.js` + migration `20260622000001`). `DELETE /sessions/:id`,
    `DELETE /sessions`, and `POST /logout` now **revoke the CA token in-process**
    via `tokenService.revokeToken` → `caTokenService.revokeToken(..., {isAdmin:true})`
    (`services/ca/services/token.js`), so a revoked session's bearer 401s on the next
    call. Bearer callers identify their current session by `req.bearerTokenId`
    (set in `middleware/bearerAuth.js`). Auth test harness was unrunnable
    (`require('../src/app')` missing; `tests/setup.js` mocked a non-existent CA
    surface; `testDatabase.js` synced to the wrong schema; no passport strategies)
    — all repaired; `tests/session.test.js` passes **29/29** vs live Postgres,
    incl. the revoke→401 acceptance.
  - **Follow-up (stabilization, NOT SP-6):** the other auth Jest suites
    (`auth/mfa/oauth2/organization/rbac/saml/passwordService`) have pre-existing
    failures unrelated to sessions (error-field assertions, password-policy
    expectations, structural drift) — now they at least load (they couldn't
    before). Stabilize per-suite separately.

### 10. Cosmetic
- Some service `package.json` files still list `ejs` etc. (unused after frontend
  removal) — harmless, prune later.
- `shared/public/` (dashboard CSS) is now dead — nothing serves it.
- CA's orphaned view controllers were deleted; its `routes/{ca,certificates,
  tokens,users,groups,roles}.js` are now empty routers (real API under `/api`,
  `/admin`).

### 11. Live (`/live`) publish/signaling auth — MVP-BLOCKING (2026-06-22 scope decision)
The `/live` Socket.IO namespace has no handshake auth (fine for public stream
viewers), but its WebRTC signaling events (`signal`/`offer`/`answer`/`ice-candidate`,
`join-room`/`update-participant-state` in `services/live/src/sockets/index.js`)
are not gated on a validated identity. **Streaming publish is now in MVP scope, so
this is blocking.** Add per-event auth: validate a CA bearer on connect, mark the
socket identity, and authorize host/broadcaster actions (publish/`offer`/room
ownership) against it while leaving pure viewer subscribe paths open. Keep viewer
latency unaffected — only the publish/host events need the gate. Tracked as a
sprint ticket. Surfaced during socket verification (#3).

### 12. Org 2FA policy enforcement — NOT WIRED (UI-only as of 2026-06-22)
The admin "Auth & Identity" → Organizations tab now has a **2FA policy** editor
(`web/src/features/admin/sections/AuthSection.tsx` → `MfaPolicyDialog`) that
persists, per org, `settings.requireMfa`, `settings.mfa.allowedMethods`,
`settings.mfa.enrollmentGracePeriodDays`, and `settings.mfa.rememberDeviceDays`
via `PATCH /auth/api/organizations/:id`. **These settings are saved but not yet
enforced at login** — `services/auth/src/routes/auth.js` checks only the
per-user `user.mfaEnabled`, never the org policy. Follow-ups to make the policy
real: (a) on login, if the user's org has `requireMfa`, force 2FA enrollment
(respecting the grace period) before issuing a token; (b) restrict the user MFA
setup/validate paths to the org's `allowedMethods`; (c) implement the
non-`totp`/`backup_codes` methods (`sms`/`email`/`webauthn`) — currently config
scaffolding only, surfaced as "not yet available" in the UI; (d) honour
`rememberDeviceDays` (trusted-device skip). The UI shows a warning banner saying
the policy is not yet enforced. Model default updated in
`services/auth/src/models/Organization.js`.

## Production readiness (release engineering) — NOT in the numbered follow-ups

The numbered items above are functional/module-level. These are the
release-engineering gaps between "structurally complete + runtime-verified" and
"deployable to a real environment". None are code-deep, but all are MVP-blocking
for an actual release. Scanned/confirmed 2026-06-22.

### R1. No source control or CI — IN PROGRESS (SP-1/SP-2, 2026-06-22)
~~There is **no `.git`** in this repo and no pipeline.~~ **Done:** repo is under git
with a root `.gitignore` (node_modules/.env/certs/web/dist/logs/data excluded);
initial commit made; `.github/workflows/ci.yml` added (jobs: **lint**, **web-build**
— required gates, both green locally — and **test** with Postgres/Redis service
containers, non-blocking while suites stabilize). Added the missing root ESLint
config (`.eslintrc.json` — lint had never actually run) and an aggregator
`npm run test:all` (`scripts/test-all.js`) since there is no root Jest runner.
**Remaining (manual, needs the org remote):** push to the remote and set branch
protection on `main` requiring the `lint` + `web-build` checks.

### R2. Real TLS at the edge — BLOCKING for public exposure
Only dev self-signed certs (`npm run gen:certs`); inter-service axios clients run
with `rejectUnauthorized` off outside production (`shared/utils/httpAgent.js`).
Production needs real certs terminated at the nginx edge (or the gateway), and the
loopback-trust shortcut must stay strictly dev-only. Verify `NODE_ENV=production`
flips the agent to verifying.

### R3. Observability — BLOCKING (thin today)
Logging is Winston only; there is **no metrics, tracing, or error tracking**
(`prom-client`/OpenTelemetry/Sentry are absent). `/health` aggregates module
health but nothing watches it. Minimum for MVP: ship logs somewhere durable, add
error tracking (e.g. Sentry), and alert on `/health` + process crash. Metrics
(`prom-client` on the gateway) is a strong should-have given the realtime/queue
surfaces.

### R4. Secrets & production config — BLOCKING
All config is `.env`-based (`src/config/index.js`). Production needs managed
secrets and a rotation story for `SERVICE_TOKEN_SECRET` (HMAC service tokens),
session secrets, and DB/Redis creds. Hard-verify the `DEV_BYPASS` path is
impossible in prod (it is fail-closed: secret header + loopback + `NODE_ENV=
development`, but confirm the deploy sets `NODE_ENV=production`).

### R5. Load / throughput verification — BLOCKING (none done)
Nothing has been exercised under concurrency — no load test against the realtime
(Socket.IO) or queue (Bull) paths, and no sizing of the single PG/Redis. Run a
representative load pass before MVP, even single-instance.

### R6. Backup / restore — BLOCKING (untested)
The single `exprsn` Postgres DB has no verified backup/restore procedure. Stand up
automated backups and rehearse a restore once before release.

## Source of truth
- Module list / prefixes / schemas / namespaces: `src/modules/registry.js`
- Gateway (mounts + Socket.IO multiplex): `src/gateway.js`
- Bootstrap (load → init → listen): `src/index.js`
- Original services remain untouched at `/Volumes/Storage/exprsn-<name>/`.
