# Admin Interface — Endpoint → UI Mapping & Development Report

> Generated 2026-06-22. Maps every CRUD route and Socket.IO endpoint across the ten
> platform modules to the `web/src/features/admin` sections already built, then catalogs
> data-type / validation / default-value concerns, missing & mismatched columns, and a
> prioritized backlog for continuing the admin UI.
>
> Scope: backend routes under `services/*/(src/)routes`, models under `services/*/(src/)models`,
> Socket.IO `registerSockets`, and the SPA admin clients (`web/src/api/admin/*.ts`) +
> sections (`web/src/features/admin/sections/*.tsx`).

---

## 1. Executive summary

The admin SPA already covers all nine surfaced modules (auth, ca, filevault, jobs[timeline+prefetch],
live, moderator, nexus, spark, vault) with a consistent table/dialog/`ConfigSectionEditor` pattern.
Coverage is **broad but shallow**: most sections are list + a few lifecycle actions; full create/edit
forms, search/filter, bulk actions, and Socket.IO live-updates are largely absent.

Headline findings:

- **3 confirmed backend bugs** that will break or silently drop admin operations (see §5.1) —
  fix before building UI on top of them.
- **Socket.IO is completely unused by the admin UI.** Every namespace already emits admin-relevant
  events (`token:event`, `stats:update`, `certificate:created`, `viewer-count-updated`,
  `moderation:event`, …) but no admin page subscribes. All data is poll-on-load. (§4)
- **CRUD is lopsided** — see the matrix in §3. Several sections list data they can't create or edit
  (CA certs read-only after issue; nexus groups read-only; live destinations have no create UI; vault
  secrets/keys/leases read-only).
- **No field-level validation in forms.** The backend models carry rich constraints (min/max, enums,
  `isIn`, length, defaults) that the UI does not surface — forms send free-text where the model
  expects an enum, omit fields that have no DB default, etc. (§6)
- **Naming convention split** — auth/ca/spark/vault/timeline models are camelCase; nexus/filevault/live/
  moderator are snake_case (`underscored`) with mixed BIGINT-ms vs DATE timestamps. The admin UI
  hard-codes whichever it happened to observe, so several columns render blank. (§5)

---

## 2. How the admin UI is wired (shared mechanics)

- Each module has `web/src/api/admin/<module>.ts` (typed fetch wrappers) + `…/sections/<Module>Section.tsx`.
- Tables render via a shared `DataTable`; loading/empty/error via `QueryState`; raw fallbacks via a
  `DataView` JSON modal; runtime config via a single `ConfigSectionEditor`.
- **Config sections are hard-coded by name** in every section component (e.g. `auth-users`,
  `vault-secrets`, `live-rooms`). There is no discovery endpoint, so the UI and the backend
  `GET/POST /<module>/api/config/:sectionId` allow-lists must be kept in sync by hand.
- Backend admin gating is inconsistent across modules (auth/ca = session/bearer `requireAdmin`;
  vault = `requireRead/Write('/admin')`; filevault/spark = `isAdmin`; nexus/timeline/live/moderator
  config routes are **ungated**). Worth unifying before exposing more write operations.

---

## 3. CRUD coverage matrix (backend capability vs UI)

Legend: ✓ in UI · ◐ partial/limited · ✗ backend exists, no UI · — n/a

| Module | List | Create | Read/detail | Update | Delete | Lifecycle actions in UI |
|---|---|---|---|---|---|---|
| **auth** | ✓ | ◐ (groups, orgs, roles only) | ✓ | ✓ (org, member role) | ✓ (groups, sessions) | assign/revoke role, add/remove member |
| **ca** | ✓ | ✓ (cert, token) | ✗ (no cert/token detail page) | ✗ | ✓ (revoke) | revoke cert/token, validate token, generate CRL |
| **filevault** | ✓ (quotas) | ✗ | ✗ | ◐ (set quota) | ✗ | cleanup files/blobs, verify blob |
| **jobs** (timeline) | ✓ | ✗ | ◐ (job detail endpoint unused) | ✗ | ✓ (remove job) | pause/resume/clean queue, retry/remove job |
| **jobs** (prefetch) | ✓ | ✗ | ✓ (status/cache) | ✗ | ✓ (clear) | schedule/immediate/retry |
| **live** | ✓ (streams, rooms, dest) | ◐ (stream only; **no destination create UI**) | ◐ (JSON) | ✗ | ✓ | start/stop stream, simulcast start/stop, test dest |
| **moderator** | ✓ | ✗ (**no rule create/edit**) | ◐ (JSON) | ◐ (resolve/review) | ✓ (rule) | approve/reject/warn/remove/ban, analyze, execute workflow |
| **nexus** | ✓ | ✗ | ◐ (JSON) | ✗ | ✗ | case warn/remove/ban, recompute trending |
| **spark** | ✓ (queues) | ✗ | ✗ | ✗ | ✗ | pause/resume/clean queue |
| **vault** | ✓ | ◐ (policy only, raw JSON) | ◐ (JSON) | ✗ | ✓ (policy) | suspend/reactivate/revoke token, purge, clear cache |

### Endpoints defined in the API client but never called by any section
These are quick wins — the wrapper exists, only the UI is missing.

| Module | Unused client function(s) |
|---|---|
| auth | `getUserGroups` |
| ca | `health`, `timeseries`, `recentCertificates`, `recentTokens` |
| filevault | `storageUsage`, `storageQuota` |
| jobs | `timelineJobsApi.queueStats` (single), `timelineJobsApi.job` (detail), `prefetchAdminApi.metricsByDate` |
| live | `recordings` |
| moderator | `rules({enabled})` filter, `queue({priority})` filter |
| nexus | `caseAssign` |
| spark | `queueStatsByName` |
| vault | `accessReport(filters)` (called with empty body), audit log `action`/`actor` filters |

---

## 4. Socket.IO endpoints → admin UI (entirely unmapped)

No admin section opens a socket. Every namespace below is poll-only in the UI today. These are the
highest-leverage additions for a "live" admin console.

| Namespace | Server → client events relevant to admin | Suggested admin use |
|---|---|---|
| `/ca` | `certificate:created/revoked`, `certificates:updated`, `token:created/revoked/used`, `dashboard:stats`, `system:health`, `user:*`, `group:*`, `role:*` | live Overview cards, cert/token tables auto-refresh, token-use monitor |
| `/vault` | `token:event`, `policy:event`, `security:alert(anomaly_detected)`, `stats:update`, `cache:stats`, `audit:log` | live token/policy tables, **anomaly alerts banner**, streaming audit log |
| `/spark` | (message/presence events — content is E2EE) | admin scope limited; queue stats are HTTP only |
| `/timeline` | `new:post`, `post:liked`, `post:commented` | live moderation feed |
| `/moderation` (moderator) | broadcast to `moderators` room | **live moderation queue** (currently manual refresh) |
| `/notifications` (moderator) | `notification` per `user:{id}` | n/a for admin console |
| `/live` | `viewer-joined/left`, `viewer-count-updated`, `participant-*`, `stream-started/ended/deleted`, `room-closed` | live viewer/participant counts, stream status without refresh |

> Note: auth middleware differs per namespace (CA-token vs session vs platform-admin-email). Any admin
> socket client must negotiate the right credential per namespace.

---

## 5. Column & table inconsistencies

### 5.1 Confirmed bugs (verified in source — **all three FIXED 2026-06-23**)

1. ~~**`auth` config route queries non-existent columns / model.**~~ **FIXED.**
   `services/auth/src/routes/config.js` imported `AuthProvider` from `../models` (not exported by the
   auth models index) and queried `attributes: ['id','username','email','status','created_at',
   'last_login_at']` ordered by `created_at` — but the auth `User` model has **no `username`** and uses
   camelCase `lastLoginAt`/`createdAt` (no `underscored`). The `auth-users` / `auth-methods` config
   sections (the **Auth → Directory** tab) threw `column does not exist` / `AuthProvider is undefined`.
   *Cause: copy-paste from the `ca` User model, which does have `username` + snake_case.*
   **Fix:** dropped the `AuthProvider` import; corrected attributes/order to
   `displayName`/`createdAt`/`lastLoginAt`; `org.countUsers()` → `org.countMembers()` (association
   alias is `members`); `getAuthMethodsConfig` now derives OAuth2/SAML/MFA state from `config` instead
   of the missing table.

2. ~~**`spark` mute is a silent no-op.**~~ **FIXED.** `Participant` model defines `mutedUntil`
   (`services/spark/src/models/Participant.js:55`) but `routes/enhanced.js` read/wrote `muteUntil`,
   so the field never persisted. **Fix:** model reads/writes now use `mutedUntil`; the external
   request/response field name stays `muteUntil` (API contract unchanged).

3. ~~**`moderator` models split across two dirs.**~~ **FIXED — scope was narrower than first reported.**
   The admin Moderator section's endpoints (`/moderator/api/queue`, `/rules`, `/reports`, `/appeals`,
   `/workflows`, `/metrics`) **do** exist: they live in `services/moderator/routes/` (mounted by
   `src/index.js`) and already use the real models in `services/moderator/models/` (custom pool-backed
   classes — `ModerationItem`, `ModerationRule`, `Report`, `Appeal`, `ReviewQueue`, … — **not**
   Sequelize, and note the real model is `ModerationItem`, not `ModerationCase`). The stub problem was
   isolated to **`services/moderator/src/routes/config.js`**, which imported the `src/models` stub
   (always returns `[]`), so the `moderation-queue` config section silently showed nothing.
   **Fix:** repointed that import to the real models (`../../models`) and switched
   `ModerationCase` → `ModerationItem`; its `findAll({where,order,limit})` API matches the existing
   call and the snake_case row fields line up. Dropped the unused `ContentFlag` import.

### 5.2 Naming-convention split (causes blank columns in the UI)

| Group | Modules | Field style | Timestamp style |
|---|---|---|---|
| A | auth, ca, spark, vault, timeline | camelCase columns | `DATE` (auth/ca/spark) / mixed |
| B | nexus, filevault, live, moderator | snake_case (`underscored: true`, `field:`) | nexus = `BIGINT` ms; live/filevault = `DATE`; moderator = **both** (`createdAt` DATE + `submittedAt`/`reviewedAt` BIGINT) |

Consequences the admin UI must handle today (and currently doesn't, uniformly):
- Section column accessors mix `created_at` and `createdAt` depending on which the author observed;
  the mismatched ones render empty. Recommend a normalization layer (API returns camelCase; ORM
  `underscored` stays internal) **or** a documented per-module convention the UI can rely on.
- Timestamp rendering must know ms-epoch (nexus/moderator BIGINT) vs ISO `DATE`. Centralize a
  `formatTimestamp(value, module)` helper or normalize server-side.

### 5.3 Missing / unenforced columns & constraints

- **filevault**: `FileBlob` uses snake_case (`storage_backend`, `ref_count`) while `File` uses
  camelCase (`storageBackend`); `File` has no explicit `blob_id` FK though dedup logic references
  FileBlob. `Directory.path` is globally UNIQUE but should be composite-unique per `user_id`. Same for
  `File.path`. `ShareLink.tokenId` references a CA token with no FK.
- **nexus**: `SubGroup.slug` is not unique-per-parent (needs partial/composite index).
  `GroupTrendingStats.memberCount` duplicates `Group.memberCount` (source-of-truth ambiguity).
  `GroupMembership.customRoleId` exists but is never exposed by routes or UI.
- **vault**: `AuditLog.duration`/`requestId` nullable with no default though used on hot paths;
  `pathPrefixes` wildcard format unvalidated.
- **ca**: `Token.userId` is a UUID with no enforced FK (cross-service to auth — by design, but
  undocumented). `Certificate.revocationReason` enum uses camelCase (`keyCompromise`) vs RFC 5280
  hyphenated (`key-compromise`). `Ticket.use()` decrement is non-atomic (race).
- **timeline**: soft-delete via boolean `deleted` with **no `deletedAt`** (no audit trail);
  `ListMember` table referenced by routes but no model.
- **live**: `Room.password_hash` stored with no documented algorithm; destination OAuth
  `access_token`/`refresh_token` encrypted but no rotation/expiry handling.

---

## 6. Data type / min / max / default reference for form building

The model layer already defines the constraints admin **forms should enforce**. Key ones the UI is
currently not surfacing:

### Enums that should be dropdowns (not free text)
| Model.field | Allowed values | UI today |
|---|---|---|
| auth `User.status` | active, inactive, suspended | no user edit form |
| auth `Organization.type` | enterprise, team, personal | dropdown ✓ |
| auth `Organization.plan` | free, starter, professional, enterprise | dropdown ✓ |
| auth `Application.type` | web, native, spa, service, m2m | **no app admin UI** |
| auth `Application.clientType` | confidential, public | — |
| ca `Certificate.type` | root, intermediate, entity, san, code_signing, client, server | dropdown ◐ (omits root/intermediate) |
| ca `Token.resourceType` | url, did, cid | free-text input ✗ |
| ca `Token.expiryType` | time, use, persistent | not selectable (defaults) ✗ |
| spark `Conversation.type` | direct, group | n/a (no admin create) |
| vault `VaultToken.entityType` | user, group, organization, service, certificate | filter only |
| vault `AccessPolicy.policyType` | secret, key, credential, global | shown, not validated on create (raw JSON) |
| vault `AccessPolicy.enforcementMode` | enforcing, permissive, audit | raw JSON |
| nexus `Group.visibility` | public, private, unlisted | filter ✓ / no create form |
| nexus `Group.joinMode` | open, request, invite | no create form |
| nexus `Group.governanceModel` | centralized, decentralized, dao, consensus | no create form |
| live `Stream.visibility` | public, unlisted, private | dropdown ✓ |
| live `StreamDestination.platform` | youtube, twitch, facebook, twitter, linkedin, srs, rtmp_custom, cloudflare | **no create UI** |
| moderator `ModerationCase.status` | pending, approved, rejected, flagged, reviewing, appealed, escalated | filter ◐ |

### Numeric min/max/defaults forms should pre-fill & bound
| Model.field | Default | Bounds |
|---|---|---|
| auth `LdapConfig.port` | 389 | 1–65535 |
| auth `LdapConfig.syncInterval` | 3600000 | ≥60000 |
| auth `LdapConfig.timeout` | 10000 | 1000–60000 |
| auth `LdapConfig.poolSize` | 5 | 1–20 |
| auth `Application.accessTokenLifetime` / `refreshTokenLifetime` / `idTokenLifetime` | 3600 / 2592000 / 3600 | seconds |
| ca `Certificate.keySize` | — | 2048 / 4096 (UI offers these) |
| filevault `StorageQuota.quota_bytes` | 10737418240 (10 GB) | — (UI sets GB) |
| vault `VaultToken.maxUses` | — | ≥1 |
| vault `VaultToken.riskScore` | 0.0 | 0–1 |
| vault `AccessPolicy.priority` | 100 | 1–1000 |
| vault `Lease.ttl` | — | ≥60 s |
| nexus `Group.name` len | — | 2–255 |
| nexus `ProposalVote.weight` | 1.0 | DECIMAL(10,2) |
| moderator `ModerationCase.*Score` | 0 | 0–100 |
| live `Room.max_participants` | 10 | — |

### Fields with **no DB default** that a create form must supply
auth `Organization.ownerId`; auth `Application.organizationId`; ca `Certificate.commonName/keySize/
publicKey/notBefore/notAfter`; vault `Secret.path/key/encryptedValue/encryptionKeyId`; vault
`AccessPolicy.rules`; nexus `Group.creatorId`; nexus `Event.eventType/startTime`; live
`Stream.title/stream_key`; live `StreamDestination.platform/name`.

---

## 7. Prioritized backlog for further development

### P0 — correctness (do before adding UI)
1. ~~Fix `auth/config.js` (`AuthProvider` import + `username`/snake_case columns) — Directory tab is broken.~~ **DONE 2026-06-23** (§5.1).
2. ~~Fix spark `muteUntil` → `mutedUntil` mismatch.~~ **DONE 2026-06-23** (§5.1).
3. ~~Repoint `moderator/src/routes/config.js` off the `src/models` stub to the real models.~~ **DONE 2026-06-23** (§5.1).
4. **Still open:** decide a field-naming + timestamp convention; add a server-side normalization layer
   or document per-module so UI accessors stop rendering blank columns.

### P1 — close the obvious CRUD gaps (clients already exist)
5. CA: certificate & token **detail pages** (read endpoints partially missing) + cert/token search;
   expose `expiryType` selector on token generate.
6. live: **destination create form** (endpoint exists, no UI); stream edit.
7. moderator: **rule create/edit** form; replace hard-coded appeal review message with input; wire
   `nexus.caseAssign`.
8. vault: audit-log `action`/`actor` filters; `accessReport` date/resource filters; lease renewal;
   policy form-builder (replace raw-JSON textarea) using the enums in §6.
9. auth: user edit (status/profile) form; application admin section (none exists).

### P2 — live console via Socket.IO (§4)
10. Subscribe Overview/dashboard cards to `/ca`, `/vault`, `/live` stat events.
11. Vault `security:alert` anomaly banner; streaming `audit:log`.
12. Live moderation queue subscribed to `/moderation` broadcasts (kill manual refresh).

### P3 — polish
13. Form-level validation driven by the §6 enum/min/max/default tables.
14. Config-section **discovery** endpoint so `ConfigSectionEditor` stops hard-coding names.
15. Bulk operations (tokens, quotas, policies, jobs); typed render of `Record<string,unknown>`
    responses instead of raw-JSON modals.
16. Unify backend admin gating (nexus/timeline/live/moderator config routes are currently ungated).

---

## Appendix — module inventory (counts)

- Modules: 10 (registry.js). Admin sections built: 9 (prefetch folded into Jobs).
- Approx endpoints surveyed: auth ~80, ca ~30, spark ~40, nexus ~70, filevault ~35, vault ~45,
  timeline ~50, prefetch ~12, moderator ~3 (+ real moderator API used by UI), live ~37.
- Socket namespaces: `/ca`, `/spark`, `/vault`, `/timeline`, `/moderation`, `/notifications`, `/live`
  — 0 consumed by admin UI.

*This report was produced by static analysis. The three §5.1 items were source-verified; remaining
items are derived from model/route reads and should be confirmed against live behavior where flagged.*
