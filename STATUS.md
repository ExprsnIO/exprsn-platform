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

### TODO.md burn-down (2026-07-02) — admin console + moderation + group calendar
Implemented every open item in `TODO.md` (see its Done section for the checklist).
Highlights:
- **Admin tables** (`web/src/features/admin/ui.tsx` DataTable): opt-in column
  picker (persisted per table in localStorage), per-column filter row,
  header-click sorting, and row-click → inspector. Wired into the Organizations
  / Users / Groups / Roles tabs.
- **Org counts**: `GET /auth/api/organizations?include=counts` returns
  `{ groups, users, violations }` per org (violations counted cross-schema from
  `moderator.moderation_items`, best-effort).
- **User inspector**: `GET /auth/api/users/:id/detail` (admin) aggregates
  profile + groups + roles + org memberships + resolved permissions + sessions.
- **Roles**: create-with-templates, role inspector w/ editable definition,
  `GET /roles/:id/assignments`, role-to-group binding UI, permission catalog in
  per-service accordions + `POST /roles/permissions` (admin-only).
- **Directory actions wired**: admin create user (`POST /users`), CSV import
  (`POST /users/import`, `POST /groups/import`), CSV export (`GET /users/export`).
- **Timeline moderation config persisted + extended** (new `timeline.timeline_config`
  table, LiveConfig pattern; `/timeline/api/config` now admin-gated — it was
  previously unauthenticated): provider select (exprsn/external/both) and
  approval mechanism (manual / lowcode workflow / lowcode app / webhook).
  "Require Approval for New Posts" is now ENFORCED: held posts are forced
  private with `metadata.approval`, the request is dispatched to the configured
  mechanism, and decisions arrive via HMAC `POST /api/webhooks/approval` or
  admin `POST /api/posts/:id/approval`. New env (fallback):
  `TIMELINE_APPROVAL_WEBHOOK_SECRET`.
- **Nexus**: fixed Config > Events 500 (`new Date()` into BIGINT `start_time`);
  group create dialog gained templates + governance/category/tags/limit/website;
  new group **Calendar** tab (month view, member contact list w/ .vcf export,
  iCal/CalDAV/CardDAV sync URLs — the DAV endpoints already existed under
  `/nexus/api/calendar`; full PROPFIND/REPORT verbs remain a future item).
- **Pre-existing DAV bugs fixed** (found by runtime-verifying the calendar tab):
  `icalService` used removed `$gte` string operators (Sequelize 5+) and fed
  BIGINT epoch strings straight into `moment()`; `carddavService` crashed on
  `new Date(joinedAt).toISOString()` for bigint-string `joinedAt`. Both group
  iCal export and member vCards 500'd before; both verified working now.
  (vCards show "Unknown User" server-side — the route doesn't wire a profile
  service; the SPA contact list resolves names via `/users/profiles`.)
- Deploy note: only NEW tables (`timeline.timeline_config`) — no new columns on
  existing tables, so the sync-based `db:migrate` covers it everywhere.
- Verified: `npm run lint` 0 errors; web build + vitest green; timeline (64) and
  nexus unit (87) Jest suites green. RUNTIME-VERIFIED against the live gateway:
  nexus-events config (was 500), timeline moderation config persistence
  (survives restart), full approval loop (post held private → HMAC webhook
  decision → visibility restored; bad signature 401), org `include=counts`
  (camelCase-quoted cross-schema SQL), users CSV export (epoch-string dates),
  `/users/:id/detail`, `/roles/:id/assignments`, `POST /roles/permissions`,
  group iCal + vCard export.

### Low-code gap closure v2 (2026-07-02) — branch `feature/lowcode-gap-closure`, FLAG-GATED
Closed the feature-gap review against modern low-code platforms (all tiers). Backend:
single-record GET, bulk ops, CSV import/export, server-side aggregation (`/aggregate`),
`?q=` search, formula (computed) fields via a safe expression engine, `file` field type,
flow engine v2 (per-action `when`/`onError`/retries, `LcFlowRun` history + `/runs`,
manual `/execute`, schedule/webhook/manual triggers, `http_request` action with SSRF
guard + new `call:http.request` capability), forms v2 (layout validation, `visibleWhen`,
wizard steps, public anonymous forms at `/api/hooks/forms/:slug`), app bundle
export/import, **enforced** app status (draft = builders only, archived = read-only +
flows stop), saved views (`LcView`), AI assist (`/ai/generate`, needs `CLAUDE_API_KEY`).
Frontend: forms tab + builder, public `/f/:slug` page, kanban board, saved views, CSV
buttons, flow trigger picker + run history + Run-now, AI generate buttons. 108 lowcode
unit tests green; web build + vitest green.
- **Deploy note:** new columns (`lc_flows.trigger`, `lc_forms.is_public/slug/settings`)
  and tables (`lc_flow_runs`, `lc_views`). Dev boot self-heals (`sync({alter:true})`
  in module init); the sync-based `db:migrate` creates the new TABLES but will NOT add
  the new COLUMNS on an existing non-dev DB — align schema before enabling there.
- Scheduler is single-instance by design (matches the single-gateway MVP decision).

### Extensibility framework — plugins + low-code (2026-06-30) — FLAG-GATED, NOT MVP-BLOCKING
Built two new modules, both inert by default (`PLUGINS_ENABLED` / `LOWCODE_ENABLED`,
default false), so the MVP critical path is untouched.
- **`services/plugins`** — manifest-registry + never-throw hook bus; `declarative`,
  `webhook` (HMAC-signed, retry + circuit breaker), and `script` (worker-thread +
  `node:vm` sandbox, I/O brokered through the token/CA gateway, gated by
  `PLUGINS_SCRIPT_ENABLED`) execution kinds; closed capability vocabulary; ajv
  manifest validation w/ SSRF guard; scope resolver; install lifecycle state machine
  with audited transitions; endpoint management; surfaces feed; admin + plugin-callback
  auth. 19 unit tests green.
- **`services/lowcode`** — separate app-builder runtime (entities/forms/flows/lookups)
  that reuses the plugins trust layer; strong-typed properties + enums + lookups
  (dimension/measure roles); flows execute on the shared hook bus. 4 unit tests green.
- Wiring: registry +2 rows, migrate-sync schemas, `config.features`, `.env.example`,
  a guarded `pluginHost.emit('timeline.post.created')`, and `web/` admin sections.
- See `PLUGINS_PLAN.md` §9 (as-built) and `PLUGINS_DECISIONS.md` addendum (resolved
  decisions). Deferred: Bull `worker:plugins`, CA-issued plugin tokens, `internal`
  in-process tier, org-RBAC/group-aware enforcement.

### Security review of the branch (SP-11) — must-fix closed 2026-06-24
Ran a security review over the `feat/admin-console-rbac-typed-config` branch diff
(atproto bridge, admin/RBAC console, `/live` auth, filevault sharing, nexus
groups) against the SP-11 checklist. Triaged findings into must-fix vs backlog;
all must-fix are now closed (with regression tests where infra-free).

**Fixed (must-fix):**
- **C1 — RBAC privilege escalation (CRITICAL).** `POST /auth/api/roles/:id/
  assign-user` (+ `revoke-user`/`assign-group`/`revoke-group`) had `requireAuth`
  but **no authorization** — any authenticated user could grant themselves any
  role incl. admin. Added `canManageRole()` (platform-admin email OR org
  owner/admin for org roles OR `*` perm for global roles) to all four, and to
  `PATCH`/`DELETE /:id` (which previously checked only org-scoped roles, leaving
  global roles open). `PATCH` also now **whitelists** mutable fields (was
  `role.update(req.body)` — mass-assignment of `isSystem`/`organizationId`/etc).
- **H1 — `/auth/api/config/*` unauthenticated (HIGH).** The router had no guard at
  its mount → anonymous `GET /auth/api/config/auth-users` leaked every user's
  email/status. Now `router.use(requireAdminBearer)`.
- **H2 — unauthenticated SSRF via `POST /atproto/labels/verify` (HIGH).**
  `resolveDid` fetched caller-controlled `did:web`/`did:plc` hosts with no guard.
  New `services/atproto/src/util/safeFetch.js`: https-only, rejects private/
  loopback/link-local/ULA/reserved addresses (IP literal **and** DNS-resolved),
  `redirect:'manual'`, timeout, streamed size cap. `didResolver` routes both
  fetches through it; `did:plc` ids are format-validated (`[a-z2-7]{24}`) to block
  path traversal.
- **M1 — `GET /auth/api/users` (MEDIUM).** Required only a `read` token (every user
  has one) → full directory + `mfaEnabled` enumeration. Added `requireAdminAfterCA`.
- **M2 — atproto ops GET routes (MEDIUM).** `/identity`,`/stats`,`/inbound-labels`,
  `/external-labelers` were unauthenticated (leaked moderation decisions + labeler
  infra). Now behind `adminGuard`; `/health` + the public `/service-record`/
  `/feed-record` protocol declarations stay open.
- **M3 — cross-tenant groups (MEDIUM).** `auth/src/routes/groups.js` let any
  read/write token list/create/modify groups in any org. Whole router now requires
  admin (`requireAdminAfterCA`).

New shared guard: `services/auth/src/middleware/requireAdmin.js`
(`requireAdminBearer`/`requireAdminAfterCA`/`requireAdminUser`) — JSON 401/403,
authorizes via platform-admin email **OR** DB admin role (the legacy
`adminAuth.js` redirects/renders HTML and must not gate JSON APIs). Tests:
`services/atproto/tests/{safeFetch,didResolverSsrf}.test.js` (46) +
`services/auth/tests/requireAdmin.test.js` (9), all green; lint clean.

**Verified clean:** CORS never pairs wildcard with credentials; `DEV_BYPASS`
fail-closed; rate-limit/shared unchanged; filevault sharing owner-scoped (UUID
capability + CA revoke); SP-7 `/live` auth correct; atproto signature verify &
proof-of-control no bypass; no SQLi; `.env.example` placeholders only.

**Backlog (triaged, not blocking):**
- Authenticated SSRF via DID link / proof-of-control (`userDidService`/
  `proofOfControl` fetch) — route through `safeFetch` too.
- atproto DoS: unbounded `res.json()` in `pdsClient`/`appviewClient`, no `ws`
  `maxPayload` in `labelConsumer`; `subscribeLabels.js:52` `BigInt(cursor)` crash
  on bad input.
- `/live` WebRTC relays to a client-supplied `to` socket with no shared-room check
  (authed-only).
- Seed scripts: shared committed default password + no `NODE_ENV==='production'`
  guard (`scripts/seed/common.js`).
- `roles.js` `GET users/:userId/permissions` + `POST check-permission` let any
  authed user inspect another user's permissions (info disclosure).

### atproto / Bluesky bridge — landed + integration-reviewed (2026-06-23) — UNIT-TESTED, not yet runtime-verified
The AT-Protocol bridge (`services/atproto`, module `/atproto`, schema `atproto`)
is committed and wired into the gateway. Scope: firehose ingest → existing
moderation pipeline; signed labeler (`com.atproto.label` sign / queryLabels /
subscribeLabels); `did:exprsn` self-certifying identity + per-user DIDs with
proof-of-control; and the external-labeler ingest mesh. Reviewed the three
systems (Bluesky ↔ moderation ↔ cert/auth) end-to-end against each other and
confirmed the integration contracts line up:
- **Queue join is correct.** atproto and moderator share one Bull `moderation`
  queue (same Redis, `db` default 3, same prefix) with distinct job names
  (`moderate-atproto` / `negate-atproto` / `ingest-label-atproto`) and dedicated
  processors — no collision with the moderator's `moderate-content`.
- **Verdict→label + appeal→negation wired.** `moderationService` result shape
  (`action`, `scores.*`) matches `verdictMapper`; appeal approval on Bluesky
  content enqueues `negate-atproto` (single-writer, ordered `seq`).
- **Sign/verify symmetric; inbound labels are signature-verified before trust.**
- **CA/auth integration:** user-DID mutations gated by `validateCAToken`
  (owner-match) + service-token admin; `did:exprsn` resolves offline.
- **Gateway wiring:** non-standard exports work — `rootApp` mounted at `/`
  before the 404/error handlers (`.well-known/*`, `/xrpc/*`), `attachWsServer`
  attaches the subscribeLabels WS alongside Socket.IO.
- **Two fixes applied this pass:** `require_review`/`escalate` actions now emit a
  soft `!warn` (were unlabeled); the ingest path skips cleanly with a one-time
  warning when no AI provider is configured instead of retry-storming the queue.
- **Tests:** full atproto Jest suite green (8 suites / 29 tests) — verdict
  mapping, sign/verify, inbound-label consume, did:exprsn, proof-of-control.

Still open (NOT yet done):
- **Runtime verification against a live firehose + worker** (`npm run
  worker:atproto`) — no end-to-end run yet. This also exercises the moderator
  raw-SQL `search_path` coupling (#1): confirm a `moderate-atproto` job lands a
  row in `moderator.moderation_items`.
- **Pipeline needs ≥1 AI provider key** (CLAUDE/OPENAI/DEEPSEEK); with none,
  ingest jobs now skip (loud warning) rather than moderate.
- **`cborg` is an undeclared direct dep** (used by the firehose/inbound decoder;
  present only transitively) and `services/atproto/package.json` declares no
  deps — relies on hoisted root deps. Declare `cborg` explicitly.
- **`ATPROTO_ENABLED` is not enforced** — the worker connects and the gateway
  mounts routes regardless; the flag is informational (disable = don't run the
  worker).
- **did:plc public provisioning** is a two-phase manual flow; did:web/did:exprsn
  are the automated paths.

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

### 11. Live (`/live`) publish/signaling auth — RESOLVED 2026-06-24 (SP-7)
The `/live` Socket.IO namespace now uses **optional-auth**: anonymous stream
viewers still connect (HLS playback + `join-stream`/`leave-stream` viewer tracking
carry no privilege and stay open — viewer connect latency unaffected), but every
publish/host action is gated on a validated CA bearer.
- **Handshake (`setupAuth`, `services/live/src/sockets/index.js`):** validates any
  presented bearer via the CA `/api/tokens/validate` (HMAC service headers, same
  pattern as the timeline/moderator socket validators) and stamps
  `socket.authenticated`/`socket.userId`/`socket.userEmail`. It **never rejects** a
  connection — a missing/invalid/unverifiable token just yields an anonymous
  (viewer-only) socket, so a CA hiccup can't lock viewers out.
- **`requireAuthed` guard** fronts all WebRTC signaling (`signal`/`offer`/`answer`/
  `ice-candidate`), `join-room`, and `update-participant-state`; unauthed callers
  get an `error`/`UNAUTHENTICATED` and the action is dropped (no peer forward, no DB
  lookup). `join-room` binds the participant by the **validated** `socket.userId`
  (not client-supplied data), so a socket cannot claim another user's slot, and
  `update-participant-state` only mutates the slot the socket owns.
- **Tests:** `services/live/tests/socketAuth.test.js` (17 tests) drives accept/reject
  on the handshake and on each publish event, plus the open viewer path. Wired into
  `npm run test:all` (`live` added to the aggregator; the suite is fully mocked — no
  DB/Redis needed).
- Wiring: `registerSockets(io)` mounts `SocketHandler` on the `/live` namespace
  (`services/live/src/index.js`). Surfaced during socket verification (#3).

### 12. Org 2FA policy enforcement — ENFORCED 2026-07-07 (a+b done; c/d remain)
The admin "Auth & Identity" → Organizations tab has a **2FA policy** editor
(`web/src/features/admin/sections/AuthSection.tsx`) persisting per org
`settings.requireMfa`, `settings.mfa.allowedMethods`,
`settings.mfa.enrollmentGracePeriodDays`, and `settings.mfa.rememberDeviceDays`
via `PATCH /auth/api/organizations/:id`. The policy is now **enforced at login**.

- **New `services/auth/src/services/mfaPolicyService.js`** resolves the
  most-restrictive policy across every org a user is an active member of **or**
  owns: required if ANY requires MFA; grace = min; `allowedMethods` = the
  intersection; `totpAllowed` = whether an *enrollable* method (TOTP, the only
  one built) is permitted. Grace is anchored on `user.createdAt` (no
  policy-effective-date is persisted — documented; enabling the policy therefore
  forces existing members to enrol on next login, the intended secure default).
- **(a) Enrollment gate.** `POST /auth/api/auth/login` (`routes/auth.js`): for an
  un-enrolled user whose policy requires MFA and whose grace has elapsed, it
  establishes the passport session but **withholds the bearer**, returning
  `{ mfaEnrollmentRequired:true, enforced:true, allowedMethods }`. Within grace
  it issues the token with a soft `mfaEnrollmentRequired:false` flag. The
  **re-mint** path (`POST /auth/api/auth/token`) applies the same check
  (403 `MFA_ENROLLMENT_REQUIRED`) so the session can't be swapped for a bearer to
  bypass it, and the **OAuth/social** callback redirects to `/login?enroll=mfa`.
  Resolution failures **fail open** (logged) so a DB blip can't lock out all
  logins. SPA: `LoginPage.tsx` gained an inline enrol step (setup QR + backup
  codes → verify → re-mint → finish); reuses the existing account MFA endpoints.
- **(b) Method restriction.** `POST /auth/api/mfa/setup` (`routes/mfa.js`) rejects
  with `MFA_METHOD_NOT_ALLOWED` when a requiring org's policy disallows TOTP
  (i.e. permits only unbuilt methods); voluntary MFA is unaffected. Because only
  TOTP is built, this bites only on an unbuilt-method-only policy.
- **Tests:** `services/auth/tests/mfaPolicy.test.js` (13, no DB) cover
  resolution (most-restrictive, ownership path, method intersection,
  unbuilt-only) and enrollment evaluation (hard-gate past grace, soft in-grace,
  never-gate when unenforceable, enrolled short-circuit).
  `services/auth/tests/mfaEnforcement.test.js` (6, live test Postgres via
  supertest) drives the real `/login` + `/token` routes: un-affiliated normal
  login, member hard-gate past grace (session but no bearer), member soft flag
  in-grace, owner enforced, re-mint refused (403 `MFA_ENROLLMENT_REQUIRED`), and
  inactive membership excluded. Both wired via the module's Jest suite.
- **Remaining:** (c) implement `sms`/`email`/`webauthn` methods (still
  scaffolding); (d) honour `rememberDeviceDays` (trusted-device skip of the
  re-challenge — a UX relaxation, not an enforcement gap). Model default comment
  updated in `services/auth/src/models/Organization.js`.

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

### R2. Real TLS at the edge — VERIFICATION SLICE DONE (SP-4, 2026-06-24); cert provisioning deploy-time
Only dev self-signed certs (`npm run gen:certs`); real certs at the nginx edge are
still deploy-time (need a domain). Done this pass — the locally-verifiable
"no `rejectUnauthorized:false` reachable in prod" half:
- **Audited every `rejectUnauthorized` in src/services/shared.** The shared agents
  (`httpAgent.js`, `tls-config.js`, `httpsServer.js`) and the platform/shared DB
  (`src/db/*`, `resilientConnection.js`) and LDAP already gate on
  `NODE_ENV==='production'` / `DB_SSL_REJECT_UNAUTHORIZED`/`verifyCertificate`.
- **Fixed 3 runtime DB configs that hardcoded `rejectUnauthorized:false`** (skipped
  verification even in prod when `DB_SSL=true` → DB MITM risk): `services/
  {moderator/config/database.js, ca/models/index.js, atproto/config/database.js}`
  now use `DB_SSL_REJECT_UNAUTHORIZED !== 'false'` (verify by default, documented
  opt-out).
- **Locked** the agent's prod-verify behavior with `shared/tests/httpAgent.test.js`.
- *Known dead code:* `services/ca/services/setup.js` still has 3 `rejectUnauthorized:
  false` (the removed setup wizard — not required at runtime); clean up with the
  cosmetic pass (#10).

**Remaining (deploy-time):** provision/renew real certs (Let's Encrypt or managed)
terminated at nginx `:443`, add HSTS; the `80→443` redirect already exists.

### R3. Observability — METRICS + ERROR-HOOK DONE (SP-5, 2026-06-24); alerting/log-ship deploy-time
Baseline wired into the gateway:
- **Metrics (`prom-client`).** `GET /metrics` (Prometheus format) exposes process/
  runtime defaults + `http_requests_total` / `http_request_duration_seconds`
  (labelled by method, **module-prefix route** to bound cardinality, status) +
  `socketio_connected_clients`. Code in `src/observability/metrics.js`, wired in
  `src/gateway.js` (request middleware + endpoint + socket gauge). Optional
  `METRICS_TOKEN` bearer-gates the endpoint; otherwise network-restrict it.
  Verified via supertest: `/metrics` 401 without token, 200 with, real series
  present; `/health` 200.
- **Error tracking hook.** `src/observability/errorTracking.js` —
  `captureException` is called from the gateway central error handler keyed by the
  existing `correlationId`. **Opt-in:** activates only when `SENTRY_DSN` is set AND
  `@sentry/node` is installed (`npm install @sentry/node`); otherwise a safe no-op
  (verified). Init runs first in `src/index.js` so startup failures report too.
- `.env.example` documents `METRICS_ENABLED`/`METRICS_TOKEN`/`SENTRY_DSN`.

**Remaining (deploy-time, needs an environment):** point a Prometheus/Grafana (or
hosted) scraper at `/metrics`; alert on `/health` degradation + process crash
(external uptime monitor / process supervisor); ship Winston logs to durable
storage. These can't be exercised locally without a monitoring target.

### R4. Secrets & production config — RUNBOOK + DEV_BYPASS PROOF DONE (SP-3, 2026-06-24); managed-store wiring deploy-time
All config is `.env`-based (`src/config/index.js`); **no secrets are committed**
(verified — only `*.env.example` tracked). Done this pass:
- **Rotation runbook** `docs/runbooks/secrets-and-rotation.md`: full secret
  inventory + blast radius, a production readiness checklist (`NODE_ENV=production`,
  no `change_me`/empty placeholders, `DB_SSL=true`, `DEV_BYPASS` off, real
  `CORS_ORIGIN`), and per-secret rotation procedures (notably `SERVICE_TOKEN_SECRET`
  = re-key all service tokens + rolling restart of platform & workers;
  `ATPROTO_USER_DID_SECRET` = effectively permanent).
- **`DEV_BYPASS` proven fail-closed in prod.** The `bypassConfigured()` gate
  (`shared/middleware/devBypass.js`) requires `NODE_ENV==='development'` first, so
  prod is inert regardless of header/secret/loopback. Locked by
  `shared/tests/devBypass.test.js` (11 tests; prod/staging/test/undefined all
  inert even with a valid secret + loopback + header; `bypassCA`/`bypassAuth`
  inject nothing in prod). Wired into `npm run test:all` (added `shared`).

**Remaining (deploy-time):** inject secrets from a managed store (Docker/Compose
secrets or a cloud manager) instead of a disk `.env`; set the prod env per the
checklist; automated rotation is out of scope (manual procedure documented).

### R5. Load / throughput verification — BLOCKING (none done)
Nothing has been exercised under concurrency — no load test against the realtime
(Socket.IO) or queue (Bull) paths, and no sizing of the single PG/Redis. Run a
representative load pass before MVP, even single-instance.

### R6. Backup / restore — TOOLING DONE + REHEARSED locally (SP-10, 2026-06-24)
Backup/restore tooling now exists and a restore has been rehearsed. `scripts/
backup/pg-backup.sh` (`npm run db:backup`) takes a verified custom-format
`pg_dump -Fc` of the single `exprsn` DB with retention (default 7);
`scripts/backup/pg-restore.sh` (`npm run db:restore`) restores into a **scratch**
DB (never the live one without `FORCE_OVERWRITE=yes`) and verifies by comparing
the table inventory against live. **Rehearsed 2026-06-24:** 119 tables across 12
schemas restored cleanly (zero `pg_restore` errors), counts matched live, scratch
DB dropped. Runbook + RPO/RTO in `scripts/backup/README.md` (RPO≈24h nightly,
RTO≈minutes). **Remaining for a real deploy:** schedule the nightly cron, source
`DB_PASSWORD` from the secret store (SP-3), and ship dumps off-host. WAL/PITR is
post-MVP.

## Source of truth
- Module list / prefixes / schemas / namespaces: `src/modules/registry.js`
- Gateway (mounts + Socket.IO multiplex): `src/gateway.js`
- Bootstrap (load → init → listen): `src/index.js`
- Original services remain untouched at `/Volumes/Storage/exprsn-<name>/`.
