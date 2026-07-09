# Moderation Routing & Auth-Gating — Implementation Plan (ADR-style design doc)

**Author:** systems-architect · **Date:** 2026-07-07 · **Branch:** `feature/lowcode-gap-closure`
**Status:** design / review-ready (no code changed by this doc)
**Covers:** Item A (Tier 0 — auth-gate the 6 unauthenticated moderator routers, follow-up to `SPIKE-001`) and Item B (Tier 1 — route filevault/timeline/spark UGC through central `moderateContent`).

---

## Context

Today only **atproto** truly auto-submits content into the moderation pipeline. It does so by **direct in-process require** of the moderator's engine, not over HTTP:

- `services/atproto/src/ingest/moderationBridge.js:22` — `require('../../../moderator/services/moderationService')`
- Its `processJob()` calls `moderationService.moderateContent({ contentType, contentId, sourceService, userId, contentText, contentUrl, contentMetadata })` (`moderationBridge.js:54`), then emits signed labels. It runs inside the **atproto worker** (a Bull job processor), so the user-facing path never blocks on the AI call.

The central engine is `services/moderator/services/moderationService.js`:
- `moderateContent(params)` (`:28`) is **naturally idempotent** — it first `findOne({ where: { sourceService, contentType, contentId } })` (`:49`) and returns the existing result if already moderated. So `(sourceService, contentType, contentId)` is the dedupe/idempotency key.
- It runs AI analysis → risk calc → custom rule engine → creates a `ModerationCase`, optionally enqueues review, logs a `ModerationAction`, and best-effort routes into queue buckets + `content_submitted` workflows (`:151-170`).
- The engine **never sees encrypted content** — it moderates `contentText` and/or `contentUrl`.

The moderator's HTTP surface is mounted in `services/moderator/src/index.js:64-79`. Its routers split into two groups:

- **Already gated** with `router.use(requireAdmin)`: `rules`, `agents`, `wordlists`, `queues`, `workflows` (verified). `src/routes/notifications.js` rolls its own **inline HMAC** gate via `verifyServiceToken` (`notifications.js:41-47`) — the reference pattern for a service-auth gate inside the module.
- **Ungated (this plan):** `moderation`, `review`, `reports`, `metrics`, `actions`, `appeals` — no `requireAdmin`, no bearer check (the `SPIKE-001` finding).

Auth primitives available:
- **`requireAdmin`** — `services/moderator/src/middleware/requireAdmin.js`: validates the CA bearer against `${CA_URL}/api/tokens/validate` with identity-bound `X-Service-*` headers, then authorizes on platform-admin email OR an admin role (`ADMIN_ROLES` includes `moderator`). Sets `req.userId`/`req.userEmail`/`req.userRoles`.
- **HMAC service auth** — `verifyServiceToken(serviceId, token)` (`shared/utils/serviceToken.js:92`) recomputes `HMAC-SHA256(serviceId, SERVICE_TOKEN_SECRET)` and compares constant-time. Shared middleware form: `authenticateService()` in `shared/middleware/auth.js:221`. The unified process presents `SERVICE_ID=platform`.
- **End-user bearer (no admin gate)** — no such middleware exists in moderator yet; it must be added (same validate call as `requireAdmin`, minus the role check).

Two-copy shared discipline applies: any new/edited middleware under `shared/` must also land in `services/shared/` (or the module must use `@exprsn/shared`). `requireAdmin` already imports from `@exprsn/shared/...`, so new moderator middleware should do the same and avoid touching the copies.

---

## Item A — Tier 0: Auth-gate the 6 unauthenticated moderator routers

### Three auth surfaces

1. **`requireAdmin`** (platform-admin OR admin/moderator role) — moderation console reads and all state-mutating review/action/appeal-decision paths.
2. **`requireUser`** (any valid CA bearer, no role gate) — **new** middleware. For end-user *submit* paths (submit a report, submit an appeal) where the actor is the reporting/appealing user, not a moderator. Must set `req.userId` from the **validated token**, never from the body (the current handlers read `reportedBy`/`userId` from the body — a spoofable input that this gate closes).
3. **`requireService`** (HMAC `X-Service-ID`/`X-Service-Token`) — **new** middleware in moderator, extracted from the inline gate already in `src/routes/notifications.js:41-47`. For inter-module submit/status calls on the HTTP surface.

> **Note on `moderate/content`:** the atproto bridge and (Item B) other modules call `moderationService.moderateContent()` **in-process** (direct require) — that path has and needs no HTTP auth (trusted same-process call). The HTTP `POST /api/moderate/content` route is a *separate* surface reachable from outside the process; it must be **`requireService`**, not a user bearer, because callers are services, not humans.

### Per-router / per-endpoint auth table

Mount prefixes from `services/moderator/src/index.js`.

| Router (file) | Mount | Endpoint | Consumer | Middleware |
|---|---|---|---|---|
| **moderation** (`routes/moderation.js`) | `/api/moderate` | `POST /content` | service-to-service (atproto in-proc bypasses; external = HMAC) | **`requireService`** |
| | | `GET /status/:sourceService/:contentType/:contentId` | service (status poll) + admin console | **`requireService` OR `requireAdmin`** (accept either) |
| | | `POST /batch` | service-to-service | **`requireService`** |
| **review** (`routes/review.js`) | `/api/queue` | `GET /pending`, `GET /`, `GET /:id` | admin console | **`requireAdmin`** |
| | | `POST /:itemId/approve`, `/:itemId/reject`, `/:id/analyze`, `/:id/warn`, `/:id/remove`, `/:id/ban`, `/:id/skip` | admin console (state mutation) | **`requireAdmin`** |
| **reports** (`routes/reports.js`) | `/api/reports` | `POST /` (submit report) | end user | **`requireUser`** (derive `reportedBy` from `req.userId`, stop trusting the body) |
| | | `GET /`, `GET /:id`, `PUT /:id/resolve` | admin console | **`requireAdmin`** |
| **metrics** (`routes/metrics.js`) | `/api/metrics` | `GET /`, `GET /export` | admin dashboard | **`requireAdmin`** |
| **actions** (`routes/actions.js`) | `/api/actions` | `GET /recent`, `GET /:id`, `GET /content/:contentType/:contentId`, `GET /providers/status` | admin console | **`requireAdmin`** |
| | | `POST /execute` (execute a moderation action) | admin (manual action) | **`requireAdmin`** |
| **appeals** (`routes/appeals.js`) | `/api/appeals` | `POST /` (submit appeal) | end user (appellant) | **`requireUser`** (derive appellant from `req.userId`, replace `req.body.userId`) |
| | | `GET /`, `GET /:id`, `POST /:id/review`, `GET /stats/summary`, `GET /case/:moderationItemId` | admin console | **`requireAdmin`** |

**Genuinely public endpoints: none.** All six routers expose moderation state or mutate it. `health` (`routes/health.js`, mounted `/health`) stays public — it is not one of the six and carries no moderation data.

### Router-level vs per-route gating

- `review`, `metrics`, `actions` are uniformly admin → apply `router.use(requireAdmin)` at the top (matches the `rules`/`wordlists` idiom). `actions` `POST /execute` is admin-only, so a blanket `requireAdmin` is correct and simplest.
- `moderation`, `reports`, `appeals` are **mixed** → gate per-route (submit = `requireUser` or `requireService`; the rest = `requireAdmin`). Do **not** blanket these three.

### P0/P1 triage (per `SPIKE-001` AC)

The **unauthenticated mutation** paths are the elevated risk and should lead the fix, above the read-only info-disclosure endpoints:

- **P1:** `POST /api/actions/execute` (`actions.js:120`) — executes remove/hide/warn/ban with no auth; `review`'s `/:id/{remove,ban,reject,warn}` (`review.js`) — direct moderation actions on any queue item; `PUT /api/reports/:id/resolve`; `POST /api/appeals/:id/review`. Any unauthenticated caller can action content/users.
- **P2 (info disclosure):** `GET` reads on `metrics`, `actions`, `reports`, `review`, appeal listings.
- **Note — spoofable identity, not just missing auth:** `reports` `POST /` trusts `reportedBy` and `appeals` `POST /`/`:id/review` fall back to `req.body.userId`/`req.body.reviewerId` (`appeals.js:41,157`). Gating alone is insufficient — the submit handlers must bind actor to `req.userId` from the validated token.

### New middleware to build (Item A)

1. `services/moderator/src/middleware/requireUser.js` — clone `requireAdmin`'s CA-validate block, drop the role check, set `req.userId`.
2. `services/moderator/src/middleware/requireService.js` — extract the inline `verifyServiceToken` gate from `src/routes/notifications.js` into a reusable middleware (returns 401 on missing/invalid `X-Service-*`).
Both import from `@exprsn/shared` (no two-copy edit needed).

---

## Item B — Tier 1: Route filevault + timeline + spark UGC through `moderateContent`

### Call contract: in-process require (recommended) over HTTP-to-gateway

**Recommendation: in-process `require` of `moderationService.moderateContent`, mirroring the atproto bridge — not an HTTP call to `MODERATOR_SERVICE_URL`.**

Justification:
- The reference implementation (`atproto/src/ingest/moderationBridge.js`) already does exactly this and is proven; reusing the pattern avoids duplicated logic.
- Everything is one process (unified gateway). An HTTP self-call adds a TLS handshake + HMAC round-trip + the gateway's full middleware stack for zero isolation benefit.
- It aligns with the long-term direction and `TASK-009` (replace inter-service HTTP hops with direct in-process calls). We should not add new `*_SERVICE_URL` hops we intend to remove.
- Idempotency is preserved regardless of transport (dedupe is in the service).

Wrap the call in a thin, lazily-required, best-effort helper so a module never hard-depends on moderator being loaded (same defensive style as the plugin-hook emits in `posts.js:91`):

```
// conceptual — submitForModeration(payload): fire-and-forget, never throws into the request
const moderationService = require('../../../moderator/services/moderationService');
```

Keep the HTTP `POST /api/moderate/content` route (now `requireService`-gated per Item A) as the **external/out-of-process contract** and a fallback if a module is ever split back out. The `sourceService` field stays the discriminator: **`timeline` / `filevault` / `spark`** (distinct from atproto's `bluesky`), which also keeps idempotency keys from colliding across modules.

### Latency posture: async everywhere; sync-block for none

No user-facing write should block on the AI call (multi-second, external provider). All three modules **publish/store first, moderate async, act on adverse verdict**. This matches the atproto model (moderation runs in a worker, off the user path) and timeline's existing fail-open approval read (`posts.js:79`).

Enforcement of the verdict reuses the two mechanisms already in the codebase:
- **Hold/pre-gate:** timeline's `approvalService.holdForApproval()` (`services/timeline/src/services/approvalService.js:53`) — forces `visibility:'private'` + `metadata.approval`. Reusable as a moderation hold.
- **Retract/notify-back:** the moderator→module callback `moderationActions._notifySourceService()` (`services/moderator/services/moderationActions.js:382`) POSTs to `${serviceUrl}/api/moderation/action`. Timeline already consumes this at `POST /timeline/api/webhooks/moderator` (now authenticated after `BUG-006`). Filevault/spark need an equivalent authenticated sink.

### Per-module wiring table

| Module | Hook point (file · fn) | `contentType` / payload | Sync vs async | Verdict enforcement | Failure mode |
|---|---|---|---|---|---|
| **timeline** | `services/timeline/src/routes/posts.js` `POST /` after `postService.createPost` (`:57`), beside the existing `approvalService` block (`:71-79`) | `post`, `contentId = post.id`, `sourceService='timeline'`, `contentText = content`, `contentUrl` from first media, `contentMetadata = { userId, groupId, visibility }` | **Async, optimistic** by default; **pre-hold** when policy demands (reuse `holdForApproval`) | Optimistic: publish now; on adverse verdict the moderator callback → `POST /timeline/api/webhooks/moderator` sets `metadata.moderation` + hides. Pre-hold: post stays private until verdict clears. | **Fail-open** (publish) — matches existing approval fail-open; leave a `moderation:pending` marker for backfill |
| **filevault** | `services/filevault/src/routes/files.js` `POST /upload` (`:41`) and `POST /create` (`:80`), after `fileService.uploadFile` returns | `file`, `contentId = file.id`, `sourceService='filevault'`, `contentUrl` = internal file URL, `contentMetadata = { userId, mimetype, name }`. Text files → `contentText` from buffer; images → `contentUrl` for NSFW | **Async** (never block upload) | Store now; on adverse verdict quarantine → set file `moderationStatus`/visibility=private via a new authenticated `/api/moderation/action` sink in filevault | **Fail-open** (store) + `moderation:pending` marker so a retry/backfill catches it |
| **spark** | `services/spark/src/services/messageService.js` `sendMessage()` after `Message.create` (`:62`) | `message`, `contentId = message.id`, `sourceService='spark'`, `contentText = plaintext content only`, `contentMetadata = { conversationId, senderId }` | **Async, non-blocking** (real-time delivery must not wait) | Deliver now; on adverse verdict redact/remove via a new authenticated action sink in spark | **Fail-open** (deliver) — never block messaging |

**Spark E2EE caveat (load-bearing):** `sendMessage` supports `encrypted=true` with `content=null` (`messageService.js:46-52`). The moderator **cannot** read encrypted payloads — only `contentText`/`contentUrl` are analyzable. Therefore spark moderation is **plaintext-only**; encrypted messages are un-moderatable server-side and should be **skipped** (submit nothing). **Recommendation:** for MVP, scope spark auto-moderation to **plaintext group/channel messages and attachments**, and treat 1:1 DMs as **out of scope** for proactive scanning (privacy) — DMs enter moderation only via a user **report** (`POST /api/reports`). This is a policy call for the architect + product-manager, flagged below.

### Representative sequence — timeline post (optimistic + async retract)

1. Client `POST /timeline/api/posts` → `posts.js` `POST /` → `postService.createPost` returns `post` (`posts.js:57`).
2. Existing approval branch runs (`posts.js:71-79`). New: `submitForModeration({ contentType:'post', contentId:post.id, sourceService:'timeline', userId:req.userId, contentText:content, contentUrl:firstMediaUrl, contentMetadata:{...} })` — **fire-and-forget, `.catch(()=>{})`**, never awaited into the response.
3. `broadcastNewPost` fires as today (post is live) unless `pendingApproval` (`posts.js:84`).
4. Response returns immediately (201) — user latency unaffected.
5. In the background, `moderateContent` runs AI + rules, writes a `ModerationCase` keyed `(timeline, post, post.id)`. If clean → no-op. If `hide`/`remove`/`reject` → `moderationActions.executeContentAction` → `_notifySourceService('timeline.exprsn.io', …)` → authenticated `POST /timeline/api/webhooks/moderator` merges `metadata.moderation` and hides the post (the merge-not-clobber behavior fixed in `BUG-006`).
6. Re-submitting the same `post.id` is a no-op (idempotent dedupe at `moderationService.js:49`).

### Idempotency contract

- Each module MUST pass a **stable** `contentId` (the row UUID) and its **own** `sourceService` string. `(sourceService, contentType, contentId)` is the dedupe key; retries/duplicate submits return the existing case, so at-least-once delivery (Bull retry, module retry) is safe.

### Schema / model impact (for dba — mechanics owned by dba, not designed here)

- **timeline `Post`** — reuse `metadata` JSON (`metadata.moderation = { caseId, status, riskScore }`), same shape as `metadata.approval`. A dedicated indexed `moderationStatus` column is optional (only if we need to query "all flagged posts"). dba call.
- **filevault `File`** — needs a moderation-state field (a `moderationStatus`/`quarantined` column, or a `metadata` JSON key) plus visibility gating on adverse verdict.
- **spark `Message`** — needs a moderation-state field and a "redacted" state for post-hoc removal.
- **moderator** — **no new schema**: `ModerationCase` is already keyed by `(sourceService, contentType, contentId)`; the new `sourceService` values are just data.
- **Migration mechanic reminder for dba:** `db:migrate` (sync) creates new tables but does **not** ALTER existing ones — any new column on `Post`/`File`/`Message` requires running that migration's `up()` directly, or queries 500 until the schema catches up. Schema-qualify per module.
- **Possible new moderator-owned Bull queue + worker** if we move UGC moderation fully off the request thread (rather than fire-and-forget inline-async). atproto uses its own queue in its own worker; a generic `moderate-ugc` queue processed by a moderator worker is the clean equivalent. Redis/Bull topology + a new `worker:*` process is **dba + architect** territory — see open questions.

### Sign-off matrix

- **systems-architect (me):** the **new inter-module moderation-submit contract** — in-process `moderateContent` call shape, the `sourceService`/`contentId` conventions, the async/optimistic posture, fail-open policy, and the authenticated moderator→module action sinks (new inter-module boundary). Plus **Item A** router auth posture (security invariant + module surface). Both are structural → my sign-off gates COMMIT.
- **dba:** per-module moderation-state columns + migrations (and the ALTER-vs-create mechanic), and any new moderator Bull queue / Redis usage / worker process for UGC moderation.
- **product-manager:** priority/size and the DM-scanning policy call (privacy scope).
- **qa-specialist:** verdict-enforcement behavior tests (hold, retract, quarantine, redact) and fail-open behavior when moderator/AI is down.

---

## Risks & failure modes

- **Latency / retry-storm:** a synchronous inline call would put the AI provider on the user's write path. Async fire-and-forget avoids it but risks silently dropping submissions if the process restarts mid-flight → prefer a durable queue (moderator-owned Bull) over pure in-memory fire-and-forget for the production version. atproto already learned the "no AI provider → skip cleanly, don't retry-storm" lesson (`moderationBridge.js:34-49`); reuse that guard.
- **Fail-open blind spot:** if moderator/AI is down and every module fails open, UGC publishes unmoderated with only a `pending` marker. Acceptable for MVP *only if* a backfill sweep re-submits `pending` items. Without backfill, fail-open = permanently unmoderated. Flag to dba/PM.
- **Spark E2EE:** encrypted messages are structurally un-moderatable; do not pretend otherwise. Proactive DM scanning is both technically limited (E2EE) and a privacy decision.
- **Callback auth parity:** timeline's `/api/webhooks/moderator` sink is authenticated post-`BUG-006`; new filevault/spark sinks must ship **with** auth (HMAC service token), not after — otherwise we recreate the `BUG-006` unauthenticated-mutation hole.
- **In-process coupling:** requiring `moderator/services/moderationService` from filevault/timeline/spark pulls moderator's model layer into those modules' require graph. Already true for atproto and acceptable in the unified process, but it means moderator must be loadable whenever those modules load — keep the require **lazy** and wrapped.
- **Identity spoofing (Item A):** gating without binding `reportedBy`/`appellant`/`reviewer` to `req.userId` leaves a spoof hole even after auth is added. The submit handlers must be edited alongside the gate.
- **Two-copy shared drift:** if any `shared/` middleware is touched, `services/shared/` must match. Prefer `@exprsn/shared` imports to sidestep this.

---

## Open questions for architect / dba

1. **DM scanning policy** (architect + PM): are 1:1 spark DMs in scope for proactive moderation at all, or report-only? Recommendation: report-only for MVP.
2. **Durable queue vs fire-and-forget** (architect + dba): do we introduce a moderator-owned `moderate-ugc` Bull queue + `worker:moderator` process now, or ship fire-and-forget inline-async for MVP and add the queue later? Trade-off: durability/backfill vs. new process + Redis topology.
3. **Backfill sweep** (dba): if we fail open, who re-submits `moderation:pending` rows, and on what cadence?
4. **Moderation-state storage** (dba): JSON `metadata` key (no migration risk on JSONB) vs. dedicated indexed columns (queryable, but needs ALTER run directly per the `db:migrate` limitation).
5. **`GET /api/moderate/status` dual-auth** (architect): confirm accepting *either* `requireService` *or* `requireAdmin` on that one read, vs. splitting into two routes.
6. **"View my own report/appeal"** (architect): current handlers take `userId` from query with no ownership binding. Do we add owner-scoped read (`requireUser` + `req.userId === row.userId`) for MVP, or defer and keep those admin-only?

---

## Suggested build order

1. **Item A first** — security, small, unblocks the pre-public surface (leads with the P1 mutation paths). File as a follow-up per `SPIKE-001`'s AC:
   - **A1 (P1):** add `requireUser` + `requireService` middleware in `services/moderator/src/middleware/`; gate the mutation paths (`actions POST /execute`, all `review` action routes, `reports PUT /:id/resolve`, `appeals POST /:id/review`); bind submit-handler identity to `req.userId`.
   - **A2 (P2):** gate the read paths (`metrics`, `actions` GETs, `reports`/`review` GETs, appeal listings) with `requireAdmin`.
2. **Establish the in-process submit contract** — a thin lazy `submitForModeration()` helper + the `sourceService`/`contentId` conventions and the authenticated module-side action sink shape. **Architect sign-off gate here** (new inter-module boundary).
3. **filevault** — simplest (files aren't broadcast): async submit on `POST /upload` + `POST /create`; add the authenticated action sink + quarantine state.
4. **timeline** — reuse `approvalService` hold + async retract via the existing (authenticated) `/api/webhooks/moderator` sink.
5. **spark** — last (E2EE-constrained): plaintext-only, group/channel scope, DMs report-only pending the policy call.

Each of steps 2–5 is a structural inter-module ticket requiring architect sign-off at COMMIT; the schema/queue mechanics inside them require dba sign-off. Item A is security-structural (architect sign-off); the migrations it does *not* need.

---

### Cited files
- `services/atproto/src/ingest/moderationBridge.js` (reference pattern; in-proc require at `:22`, submit at `:54`)
- `services/moderator/services/moderationService.js` (`moderateContent` `:28`, idempotency `:49`, queue/workflow hooks `:151`)
- `services/moderator/services/moderationActions.js` (`_notifySourceService` `:382`, `_getServiceUrl` `:427`)
- `services/moderator/routes/{moderation,review,reports,metrics,actions,appeals}.js` (the six ungated routers)
- `services/moderator/routes/rules.js:17` (`requireAdmin` sibling idiom)
- `services/moderator/src/routes/notifications.js:41` (inline HMAC gate — extract to `requireService`)
- `services/moderator/src/middleware/requireAdmin.js` (CA-bearer + role gate)
- `services/moderator/src/index.js:64-79` (router mounts)
- `shared/utils/serviceToken.js:74,92` (`deriveServiceToken`/`verifyServiceToken`) · `shared/middleware/auth.js:221` (`authenticateService`)
- `services/timeline/src/routes/posts.js:40-108` (post-create hook point) · `services/timeline/src/services/approvalService.js:53` (hold pattern)
- `services/filevault/src/routes/files.js:41,80` (upload/create hook points)
- `services/spark/src/services/messageService.js:14,46-52,62` (`sendMessage`; E2EE branch)
- `sprints/BACKLOG.md:729` (`SPIKE-001`), `:284` (`BUG-006` authenticated timeline sink), `:806` (`TASK-009` direct in-process direction)
