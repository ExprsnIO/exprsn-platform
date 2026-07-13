# ADR 0003 — Organization provisioning engine: in-process saga across auth / CA / nexus

- **Status:** Accepted (APPROVED-WITH-CHANGES) — 2026-07-10
- **Deciders:** systems-architect (structural sign-off); Rick (product decisions, 2026-07-10); dba (schema sign-off — `organizations` ALTER + `provisioning_runs` table)
- **Tickets:** FEAT-032 (org provisioning engine + per-type templates — backend core; decomposed: slice 1 = auth+CA now, slice 2 = nexus group + spark binding)
- **Extends:** ADR 0001 (cortex in-process inference façade). ADR 0001's ruling — consumers require another module's **published façade** in-process, never its `src/engine/` internals, never loopback HTTP, never a `shared/` client — is the cited precedent for this ADR's invocation decision and remains binding.
- **Relates:** FEAT-033 (signup entry points — the composition layer that calls this engine), FEAT-034 (invite/activation tokens), FEAT-035 (user-import v2 — consumes the member hook), token-spec v1.1 (org/group token scoping via `ca.groups`), `scripts/seed/seed-main.js` (the batch provisioning precedent this engine productizes — and whose root-per-org topology it supersedes for the go-forward path).

## Context

FEAT-032 productizes the only end-to-end provisioning that exists today — the batch
seed script `scripts/seed/seed-main.js` — as a **request-scoped, one-shot provisioning
engine**. A single engine call must create, across three modules and three Postgres
schemas: an auth `Organization` + owner membership/roles + default RBAC group(s); a CA
`ca.groups` directory group (`organizational_unit`) + a per-org **intermediate CA under
the single platform root**; the owner's entity certificate + an org-scoped CA token; a
persisted auth-org ↔ CA-group linkage; and (slice 2) a Nexus social group with its spark
channel binding. It also exposes a **member-add hook** (every added/imported member gets
an entity cert + org-scoped token) consumed by FEAT-035.

This touches four architect-owned questions the ticket routes to an ADR **before build**:
(1) invocation style; (2) engine placement; (3) transactionality across three separate
Sequelize instances; (4) CA topology; plus (5) the auth↔CA linkage schema change and
(6) the engine's authentication surface.

Findings from reading the code (`services/auth/src/models/{index,Organization,OrganizationMember,UserRole,Role,User}.js`,
`services/auth/src/services/organizationService.js`, `services/ca/models/{index,Certificate,Group,UserGroup,Token}.js`,
`services/ca/services/{certificate,token,platformSigning}.js`, `services/ca/index.js`,
`services/nexus/src/services/groupService.js`, `services/spark/src/services/groupChannelService.js`,
`scripts/seed/{seed-main,cert-worker,token-worker}.js`, `src/{index,gateway}.js`, `src/modules/registry.js`,
`shared/utils/serviceToken.js`, `docs/adr/0001`):

1. **No cross-module transaction exists, and cannot be bolted on.** Each module builds
   its **own** `Sequelize` with its own connection pool: auth (`services/auth/src/models/index.js:12`,
   `define.schema:'auth'`), CA (`services/ca/models/index.js:11-34`, `schema:'ca'`), nexus
   (`services/nexus/src/config/database.js:5`, `schema:'nexus'`). Even though all schemas
   live in one physical `exprsn` DB, a single `sequelize.transaction()` cannot span
   auth+CA+nexus writes — they are three independent pools. CA issuance additionally mixes
   a DB row **and** a filesystem/S3 private-key write (`services/ca/services/certificate.js`,
   `storage/{disk,database}.js`), which no DB transaction — and no XA/2PC — can cover. This
   is the single load-bearing constraint: provisioning is a **saga with compensation**, not
   a transaction.

2. **The primitives are non-atomic even within one module.** `organizationService.createOrganization`
   runs three independent writes — `Organization.create` → `OrganizationMember.create` →
   `UserRole.create` — with **zero** `sequelize.transaction()` (`organizationService.js:15-66`);
   a failure after write 1 orphans the org. `nexus groupService.createGroup` runs
   `Group.create` → `GroupMembership.create` → `roleService.createDefaultRoles` with no
   transaction **and takes no options arg** (`groupService.js:37`) — it cannot be handed a
   transaction as written. The CA `createIntermediateCertificate`/`createEntityCertificate`/
   `generateToken` each do `create` + storage/​`save` with no transaction (and `generateToken`
   exposes no `{transaction}` option). Every provisioning primitive the engine composes is a
   partial-failure hazard in its own right.

3. **The auth-side writes CAN share one local transaction; the auth models are one instance.**
   All auth models are built on the single auth `Sequelize` (`models/index.js:12-27`), so
   `Organization`, `OrganizationMember`, `UserRole`, `Group`, `User` writes are wrappable in
   one `authSequelize.transaction()`. Two cascade facts matter for compensation:
   `OrganizationMember` is `ON DELETE CASCADE` on both org and user
   (`models/index.js:113-114`), but **`UserRole` has no ON-DELETE cascade to `organizations`**
   — org deletion does **not** remove org-scoped `UserRole` rows, so compensation must delete
   them explicitly (exactly as `removeMember` does).

4. **The platform root exists and is a global singleton.** It is located purely by
   `Certificate.findOne({ where: { type:'root', status:'active' } })` — no "platform" flag,
   no tie-break — and the CA **auto-bootstraps it at init** if absent
   (`services/ca/index.js:377-432`: CN `config.ca.name || 'Exprsn Root CA'`, 4096-bit,
   20-year), so in a running gateway it is always present. `createIntermediateCertificate`
   **hard-requires `issuer.type === 'root'`** (`services/ca/services/certificate.js:124`) and
   an intermediate's `pathLen` defaults to 0 — so per-org intermediates under the platform
   root are directly supported, but a third CA tier under an org intermediate is not.
   `Certificate` has **no `organizationId`/`groupId` column** (`ca/models/Certificate.js`) —
   org affiliation of a cert is representable only as the free-text `commonName`/
   `organizationalUnit` or via the `issuerId` chain.

5. **The seed's topology is root-CA-per-org and must be inverted.** `cert-worker.js:22-42`
   mints a fresh **self-signed root per org**, then an intermediate under *that* root — every
   org its own trust island, no platform anchor, and the org owner owns the root. This engine
   must instead skip per-org roots entirely and issue **one intermediate per org under the
   single existing platform root** (finding 4), with the intermediate's `userId` a
   platform/system identity (`null`), not the owner. The CA service already supports this with
   no code change (`createIntermediateCertificate({ rootCertificateId: <platformRootId> })`).

6. **`ca.groups` has no service surface; the id spaces do not bridge.** `services/ca/routes/groups.js`
   is a 13-line stub with zero handlers — there is no HTTP or service API to create a group or
   membership; the only runtime creator is setup seeding via raw `Group.create`. Token scoping
   requires the group `type` be `organizational_unit` or `department`
   (`ca/services/token.js:32`, `resolveScopeGroup` `:84-111`). Critically, `Token.userId` and
   `UserGroup.userId` are **bare UUIDs holding auth user ids with no FK to `ca.users`**
   (`ca/models/Token.js:25-26`; `UserGroup.js:16-21`) — the CA `users` table is a *separate*
   identity store. Membership rows and org-scoped tokens must therefore be written with the
   **auth** user id via `UserGroup.create` (never the `user.addGroup` mixin, which writes a CA
   `User.id`). A cross-module engine must never reach `ca.models` directly for these writes —
   there is no published surface, so CA must publish one (Decision 1b).

7. **The auth↔CA axis is already in-process; loopback HTTP is the legacy path.** auth already
   requires CA in-process for the exact writes this engine spans:
   `services/auth/src/services/tokenService.js:18` → `require('../../../ca/services/token')`;
   `services/auth/src/middleware/bearerAuth.js:22` likewise. Org-scoped tokens are signed by
   the shared `'Platform Token Signing'` client leaf under the root
   (`ca/services/platformSigning.js:56-69`, `getSigningCertificateId()`), and the token's
   `organizationId` references a `ca.groups` id. Every `*_SERVICE_URL` now points back at the
   same gateway; the only remaining HMAC-HTTP callers are in moderator — i.e. loopback HTTP is
   the path being retired (ADR 0001 confirmed the in-process direction).

8. **The linkage is a genuine ALTER on an existing table — the sync-migrate trap applies.**
   `auth.organizations` exists and lives in the `auth` schema (`models/index.js:22-24`); adding
   a column to store the `ca.groups` id is an ALTER. The default `db:migrate`
   (`scripts/migrate-sync.js`) **syncs models — it creates new tables but will not ALTER an
   existing one to add a column** (documented gap; a model column with no DB column 500s every
   query on that table). `npm run db:check` (`scripts/check-drift.js`) is the drift gate —
   it flags missing columns, ENUM drift, and tables/columns leaked into `public` instead of the
   module schema (STATUS #1) and exits non-zero. New tables (the idempotency ledger, any
   template table) are safe under sync `db:migrate`.

## Decision

**APPROVED-WITH-CHANGES.** The six rulings below are binding; the ordered-step saga table
in Decision 3 is the implementation contract and must be followed verbatim.

### 1. Invocation style — in-process require of published module façades (align with ADR 0001)

- The engine composes the other modules by **in-process `require` of their published
  service façades**, exactly as ADR 0001 ratified and as `tokenService.js:18` /
  `seed-main.js:100` already do. It does **not** use `*_SERVICE_URL` HTTP with
  `SERVICE_TOKEN_SECRET` HMAC for its own cross-module calls. Rationale, grounded in
  findings 1/7: the auth↔CA axis the engine spans is *already* in-process; HMAC-HTTP would
  re-serialize those calls, re-encode native `AppError(code,status)` through the gateway's
  generic error handler (losing the typed `code`/`status` the saga's compensation branches
  on), force the process to authenticate to itself, and move against ADR 0001's accepted
  direction. HMAC-HTTP is retained **only** for genuine process boundaries (a future Bull
  worker, an out-of-process CA) and for any **inbound** service call to an engine route
  (Decision 6).
- **1b — compose *published services*, never another module's models (the ADR 0001
  boundary, applied).** The seed script reaches into `ca.models`/`auth.models` directly;
  that is acceptable for a batch seeder but is **not** the pattern for a durable engine
  (ADR 0001: a module owns the surface it exposes; reaching into its internals is
  illegitimate). Where the primitive the engine needs is already a published façade —
  `organizationService.createOrganization`, `certificateService.createIntermediateCertificate`
  / `createEntityCertificate`, `caTokenService.generateToken` /
  `platformSigning.getSigningCertificateId`, `nexus groupService.createGroup`,
  `spark groupChannelService.ensureGroupChannels` — the engine calls it. Where **no** façade
  exists (the `ca.groups` + `UserGroup` writes — `routes/groups.js` is a stub, finding 6),
  the **CA module must publish one** (a small `ca` directory service exposing
  `ensureOrgDirectoryGroup(...)` / `addOrgGroupMember(authUserId, groupId, role)` that owns
  its own `ca`-local transaction); the engine must **not** open-code `Group.create` /
  `UserGroup.create`.

### 2. Placement — a composition-layer orchestrator at `src/provisioning/`, not inside a domain module

- The engine is an **orchestrator that owns no domain data of its own** — it composes auth,
  CA, and (slice 2) nexus/spark. That is a composition concern and belongs at the
  composition layer alongside `src/gateway.js` / `src/index.js`, as **`src/provisioning/engine.js`**
  (a plain library, **not** a new mounted registry module, **not** a service inside a domain
  module). Placing it inside `auth` would make auth — a module everything else depends on for
  tokens — transitively depend on nexus/spark, inverting the leaf-ward layering the ADRs
  guard. `scripts/seed/seed-main.js` is the precedent: the cross-module orchestrator lives
  *outside* any module and requires their services in-process; `src/provisioning/` is its
  production analog.
- **2b — the FEAT-035 back-edge is factored out, not routed up into `src/`.** FEAT-035's
  import (in the auth module) must also credential members, which would make auth require the
  engine — a module reaching up into the composition root. Resolve it by **factoring
  per-member credentialing as an auth-owned hook**: `provisionMemberCredentials(orgId,
  userId, role)` lives in auth and uses the *already-established* auth→CA edge (finding 7) to
  issue the member's entity cert + org-scoped token. **Both** the engine (for the owner — the
  owner is simply the org's first member) **and** FEAT-035 import call this one hook, so there
  is exactly one member-credentialing path (the AC) and auth never requires `src/`.
- **2c — anti-cycle discipline (binding).** All cross-module `require`s inside
  `src/provisioning/engine.js` are **lazy** (required *inside* the provisioning methods,
  mirroring ADR 0001's lazy-require-behind-the-guard), so module load order in
  `src/index.js loadModules()` is unaffected and no eager require cycle can form. The engine
  requires only published services (Decision 1b), never module `models` — except the engine's
  own idempotency ledger (Decision 3), which is a new `auth`-schema model the engine reads/
  writes through auth's Sequelize.
- **2d — no self-owned HTTP surface.** The engine has no mounted routes of its own. Its
  authenticated callers front it: the admin "provision organization" flow and FEAT-035
  import are existing/near-existing **auth** routes that call the engine in-process; the
  FEAT-033 public wizard endpoint is a separate composition (Decision 6). This keeps the
  engine's own attack surface at zero and reuses `@exprsn/shared` authz middleware rather
  than inventing new auth.

### 3. Transactionality — a compensating saga with an idempotency key; local transactions where a single module allows

There is **no** wrapping transaction across auth/CA/nexus (finding 1). The engine is a saga:
an ordered list of steps, each made idempotent by a natural unique key **and** an idempotency
ledger, each with an explicit compensating action. Steps that touch a **single** module are
wrapped in that module's **local** transaction (so they are all-or-nothing *within* the
module and need no per-write compensation); steps that touch DB + key-storage or that cross a
module boundary are **not** transactional and carry a named compensation.

**Idempotency key.** The engine accepts an opaque `idempotencyKey` (caller-supplied UUID; the
FEAT-033/035 callers derive a stable one, e.g. from the org slug). Step S0 does
`ProvisioningRun.findOrCreate({ idempotencyKey })` against a **new `auth.provisioning_runs`
table** (new table → safe under sync `db:migrate`) that records every created id and a step
cursor. Re-invocation with the same key **resumes forward** from the cursor (or returns the
completed result); on unrecoverable failure the ledger drives **compensation in reverse
(LIFO) over exactly the steps this run completed**. Natural unique constraints
(`organizations.slug`, `ca.groups.name`/`slug`, the `(organizationId,userId)` and composite
`UserRole`/`UserGroup` keys, cert find-by-`commonName`+`type`+`status`) are a second
idempotency layer so a retried step find-or-creates rather than duplicating.

**The ordered saga (implementers follow this verbatim):**

| # | Step | Module / store | Write(s) | Local txn? | Idempotency guard | Compensating action (on later-step failure) |
|---|------|----------------|----------|-----------|-------------------|----------------------------------------------|
| **S0** | Preflight + ledger | read-only + `auth` | `Certificate.findOne({type:'root',status:'active'})`; assert `org-owner`/`org-admin`/`org-member` system roles exist; `ProvisioningRun.findOrCreate({idempotencyKey})` | n/a | Ledger row; `completed` → short-circuit return | none (no provisioning write) — abort before S1 if root or system roles missing |
| **S1** | Org + owner + roles + RBAC | `auth` | `User.findOrCreate({email})` (owner); `Organization.create({…sanitized template fields…, ownerId, status:'active', caGroupId:null})`; `OrganizationMember.create({role:'owner',status:'active'})`; `UserRole.create({slug org-owner, scope:'organization'})`; default RBAC `Group.create({organizationId})` (+ owner `GroupRole`) per template | **YES** — one `authSequelize.transaction()` (finding 3) | `slug` unique; `(org,user)` unique; composite `UserRole`; `findOrCreate` user by email + ledger | delete `UserRole`(s) → `GroupRole`/RBAC `Group`(s) → `OrganizationMember` → `Organization` (hard delete) → owner `User` **only if this run created it** (ledger `ownerUserCreated`). `UserRole` **must** be deleted explicitly — it does not cascade on org delete (finding 3) |
| **S2** | CA directory group + owner membership | `ca` | via CA-published helper (Decision 1b): `Group.findOrCreate({slug, type:'organizational_unit', status:'active'})`; `UserGroup.findOrCreate({userId:<ownerAuthUserId>, groupId, role:'owner'})` — **auth** user id, not the `addGroup` mixin (finding 6) | **YES** — one `caSequelize.transaction()` inside the helper | `ca.groups.name`/`slug` global-unique → `findOrCreate`; `UserGroup` composite PK | delete `UserGroup` → delete `ca.groups` row **only if this run created it** |
| **S3** | Persist auth↔CA linkage | `auth` | `Organization.update({ caGroupId:<ca.groups.id> }, {where:{id:orgId}})` | **YES** — single-row update | set-same-value idempotent | set `caGroupId=null` (subsumed by S1 org delete on full unwind) |
| **S4** | Per-org **intermediate CA** under platform root | `ca` cert **+ key storage** | `certificateService.createIntermediateCertificate({ rootCertificateId:<platformRoot.id>, commonName, organization, organizationalUnit:<orgId>, validityYears }, userId=null)` (Decision 4) | **NO** — DB row + filesystem/S3 key write, no txn (finding 2) | find active intermediate by `commonName`+`organizationalUnit` before create; ledger `intermediateCertId` | `certificate.revoke('provisioning-rollback')`; best-effort delete stored private key |
| **S5** | Owner **entity cert** under the org intermediate | `ca` cert **+ key storage** | `certificateService.createEntityCertificate({ issuerId:<intermediateCertId>, commonName, email, organization, organizationalUnit:<orgId>, type:'client', validityDays }, userId=null)` → `{certificate, privateKey}` | **NO** — DB + key storage (finding 2) | find owner entity cert by `commonName`+`issuerId`+`status`; ledger `ownerCertId` | `certificate.revoke('provisioning-rollback')`; best-effort delete stored private key |
| **S6** | Owner **org-scoped token** | `ca` token | `caTokenService.generateToken({ certificateId:getSigningCertificateId(), organizationId:<caGroupId>, permissions, resourceType:'url', resourceValue:'/', expiryType, expirySeconds, data }, ownerAuthUserId, {isAdmin:true})`; bearer = `token.id` | **NO** — `Token.create`+`save`, service exposes no `{transaction}` (finding 2) | ledger `tokenId` (tokens not naturally unique) | `caTokenService.revokeToken(tokenId,'provisioning-rollback',null,{isAdmin:true})` (or `revokeTokensByScope({organizationId:caGroupId})`) |
| **S7** | **[slice 2]** Nexus social group | `nexus` | `groupService.createGroup(ownerAuthUserId, {…})` | **NO today → make YES** (required change 5): `nexus` must publish a `{transaction}`-aware idempotent create; until then treat S7 as non-atomic | ledger `nexusGroupId` (createGroup auto-slugs, not name-idempotent) | delete nexus group + its membership + default roles (needs a nexus delete/compensation helper) |
| **S8** | **[slice 2]** Spark channel binding | `spark` | `groupChannelService.ensureGroupChannels(nexusGroupId, ownerAuthUserId)` → `{chat, announcement}` | **N/A** — `findOrCreate`, idempotent by construction | `findOrCreate` on `(group_id, channel_kind)` | delete `Conversation` rows where `group_id=nexusGroupId` (chat + announcement) |
| **S9** | Finalize | `auth` | `ProvisioningRun.update({status:'completed', …all ids})` | single-row | idempotent | none |

**Member-add hook (the FEAT-035 seam, and the owner's own path).**
`auth.provisionMemberCredentials(orgId, userId, role)` = the member subset **S1-membership**
(`addMember` — reactivate-or-create `OrganizationMember`, grant the matching org-scoped
`UserRole`) + **S5** (entity cert under the org's intermediate — read `caGroupId`→intermediate
from the org) + **S6** (org-scoped token). It carries the same S5/S6 compensations and the
same ledger discipline (a per-member ledger row keyed on `(idempotencyKey, userId)`). The
**owner is provisioned as the org's first member through this hook**, so there is exactly one
member-credentialing code path.

**Compensation is best-effort, LIFO, and idempotent.** It runs over the ledger's completed
steps in reverse. Local-transactional phases (S1, S2, S3) that fail *mid-phase* self-roll-back
and record no ledger cursor, so they need no compensation. Non-transactional steps (S4–S8)
each compensate as tabled; a compensation that itself fails is logged, leaves the ledger in
`compensation_failed` with the residual ids, and surfaces to an admin (a revoked-but-present
cert or an orphaned group is safe-failed, never a silent leak). Certificate compensation is
**revoke**, not delete — a revoked cert row is inert (`isValid()` false) and the DB+storage
split makes a clean delete non-atomic anyway.

### 4. CA topology — one platform root, a per-org intermediate under it, entity certs under the intermediate

- **The platform root exists and is located by `Certificate.findOne({type:'root',status:'active'})`**
  (finding 4). S0 asserts it and **aborts** if absent — the engine never mints a root; root
  creation is the CA's init-time responsibility (`services/ca/index.js:377-432`), which
  guarantees exactly one active root in a running gateway.
- **Topology:** single platform root → **one intermediate CA per org** (`createIntermediateCertificate`,
  `rootCertificateId = platformRoot.id`, S4) → **per-member entity certs** under that org
  intermediate (`createEntityCertificate`, `issuerId = orgIntermediateId`, S5). This
  **supersedes** the seed's root-per-org islands (finding 5) as the go-forward provisioning
  path.
- **Constraints (finding 4/5):** the intermediate can chain **only** off a `root`
  (`certificate.js:124`) — no third CA tier; the intermediate's `userId` is **`null`**
  (platform/system-owned), not the org owner; org affiliation is carried in
  `organizationalUnit` (the org id) + `commonName` since `Certificate` has no
  `organizationId` column, and that is also the dedup key for S4/S5 idempotency.
- **Precondition (flag to dba/CA owner):** under `STORAGE_TYPE=postgresql` the root/​
  intermediate `private_key_encrypted` column is never populated, so `getPrivateKey` returns
  null and intermediate/entity signing **breaks**. The engine requires the disk (default) or
  s3 key store; if `postgresql` is ever selected, CA key storage for CA certs must be fixed
  first.

### 5. Auth-org ↔ CA-group linkage — a nullable ALTER on `auth.organizations`, run via `up()` directly, gated by `db:check`

- **Schema change:** add a nullable `ca_group_id UUID` column (model field `caGroupId`) to the
  existing `auth.organizations` table, holding the `ca.groups.id` (the `organizational_unit`
  directory group). It is a **plain UUID with no DB-level FK** — `ca.groups` is a *different
  module's schema* and the id spaces already bridge only by convention (finding 6:
  `Token.organizationId`→`ca.groups` is FK'd *within* the ca schema, but auth→ca is not, and
  must not be, a hard FK). Index it. Existing orgs keep `NULL` (unprovisioned-through-engine).
- **Migration path (the documented trap):** the default `db:migrate` (`scripts/migrate-sync.js`)
  will **not** ALTER an existing table to add this column (finding 8). Its migration `up()`
  must be **run directly** (schema-qualified to `auth`, or with `searchPath` set, so it does
  **not** land in `public` — STATUS #1), and **`npm run db:check` must be clean afterward** —
  a model column with no matching DB column 500s every query on `organizations`. dba owns the
  ALTER + the `db:check` gate; the new `provisioning_runs` (and any future template) table is a
  *new* table and is fine under sync `db:migrate`.
- **What the linkage buys:** an org-scoped token minted with `organizationId = org.caGroupId`
  validates per token-spec v1.1 — `resolveScopeGroup` type-checks the group is an
  `organizational_unit`/`department` and `validateToken` re-checks it is `status:'active'`
  (deactivating the group is itself a revocation lever). This closes the auth-Organizations ↔
  `ca.groups` split that v1.1 org scoping already depends on.

### 6. Security — no new unauthenticated surface at the engine boundary

- The engine adds **no** open/anonymous surface. Its callers authenticate with existing
  `@exprsn/shared` middleware: the admin "provision organization" flow behind CA-token +
  `requireAdminAfterCA`; the member hook / batch import behind admin auth or service-HMAC
  (`authenticateService`, `X-Service-ID`/`X-Service-Token` derived from
  `SERVICE_TOKEN_SECRET`) or in-process. No new auth is invented; `DEV_BYPASS`, CORS, and the
  central error handler are untouched.
- **The FEAT-033 public signup endpoint is a separate composition layer and is out of scope
  for this ADR's surface.** That anonymous endpoint — policy-gated by `allowUserRegistration`
  (its first-ever consumer), rate-limited (`strictLimiter`), and ordered to provision only
  after `requireEmailVerification` — is FEAT-033's structural review. This ADR's engine,
  invoked *by* that endpoint in-process, remains auth-only at its own boundary; a resource-
  amplification/​abuse review of the anonymous surface belongs to FEAT-033 (tied to the
  release-engineering track, since there is no public deployment yet).
- **Mass-assignment guard (security-relevant):** `createOrganization` spreads its entire
  `data` object into `Organization.create` (plan/settings/metadata are mass-assignable). The
  engine must build the org payload from the **template** + an explicit field allowlist and
  never forward a raw client body — the template, not the caller, chooses `plan`/`settings`/
  cert depth/limits.

## Consequences

1. **Invocation stays on the ratified rail.** The engine is in-process, façade-only, native-
   error — the same rail ADR 0001 set and `tokenService.js:18` already rides. No new HMAC-HTTP
   caller is added; the compensation logic can branch on real `AppError.code`/`.status`.
2. **Layering stays honest.** The orchestrator sits at `src/` (composition), auth stays a
   lower-level module, and the FEAT-035 back-edge is a factored auth-owned hook — so no domain
   module requires up into `src/`, and lazy requires keep the load graph acyclic (Decision 2c).
3. **Partial failure is bounded, not silent.** Every step is idempotent (natural key +
   ledger); single-module writes are locally atomic (S1/S2/S3); heterogeneous steps (S4–S8)
   compensate LIFO; a failed compensation parks the run in `compensation_failed` and alerts an
   admin. An orphaned org, a revoked-but-present cert, or an orphaned group is safe-failed —
   never an unlinked-but-live org that 500s or a leaked live credential.
4. **The home modules get more atomic, by requirement.** `createOrganization` gains a
   transaction wrapper; CA publishes a `ca`-transactional directory-group helper; nexus
   publishes a `{transaction}`-aware idempotent `createGroup` + a compensation helper. Each
   local step is all-or-nothing within its module *before* the saga composes it — the fix for
   "same invariant open-coded, non-atomic at N sites."
5. **One trust hierarchy, one directory.** Every org is an intermediate under the single
   platform root (not a private root), and every org is a `ca.groups` `organizational_unit`
   linked from `auth.organizations.ca_group_id` — a single, queryable org identity across the
   auth/CA split, which token-spec v1.1 scoping already assumes.
6. **The engine is the one provisioning chokepoint.** FEAT-033 (admin + public) and FEAT-035
   (import) all compose this engine and the one member hook — the "exactly one provisioning
   path" guarantee — so maintenance concentrates here (the point), and regressions blast across
   signup and import (the risk qa owns as the partial-failure matrix).
7. **Ownership handoffs.** **dba:** the `organizations` ALTER (direct `up()`, schema-qualified,
   `db:check` clean), the `provisioning_runs` ledger table, and review of the compensation
   deletes/revokes. **systems-architect:** the CA directory-service façade + the nexus
   transactional-create/compensation shape (Decision 1b / required change 5). **sr-developer:**
   the engine + auth member hook. **qa-specialist:** the partial-failure/rollback matrix is the
   core test plan (`test:all` non-blocking ≠ coverage), plus the org-scoped-token-validates-
   through-the-linkage assertion. **CA owner:** confirm the `STORAGE_TYPE` precondition
   (Decision 4). New routes: none engine-owned; the admin provision route + FEAT-035 import go
   in `API_SURFACE.md` with their auth mode noted under Conventions; add the "org provisioning
   engine (saga)" note to `ARCHITECTURE.md` when slice 1 lands.

## Rejected alternatives

1. **Lazy linkage — no engine; create the CA group/intermediate on first org-scoped token
   issuance.** Rejected: it spreads provisioning logic across every issuance path, provides no
   member-add hook, and does not deliver the approved full-provisioning requirement — and it
   forfeits the "exactly one provisioning path" guarantee that FEAT-033/035 depend on.
2. **Root-CA-per-org (the seed's topology).** Rejected: it gives each org its own self-signed
   trust island with no platform anchor, sprawls root key material unboundedly, and makes the
   org owner own a root (`cert-worker.js:22-42`). The platform root already exists (finding 4)
   and `createIntermediateCertificate` cleanly issues per-org intermediates under it; a single
   root with per-org intermediates is the correct hierarchy.
3. **HTTP-with-HMAC for the engine's own cross-module calls** (the alternative to Decision 1).
   Rejected: it re-serializes calls peer code already makes in-process (finding 7), erases
   native `AppError.code`/`.status` through the gateway error handler (the saga needs them),
   forces the process to authenticate to itself, and moves against ADR 0001. HMAC-HTTP is kept
   only for real process boundaries and for inbound service auth on any future engine route.
4. **Distributed 2PC / XA across auth + CA + nexus.** Rejected: the three modules hold separate
   Sequelize instances/pools with no shared transaction manager (finding 1), and CA issuance
   writes a filesystem/S3 private key that **no** DB-level 2PC can enlist. A saga with an
   idempotency key + explicit compensation is the correct pattern for heterogeneous,
   non-transactional stores.

## Required changes (binding, in priority order)

1. **Engine placement + invocation.** `src/provisioning/engine.js` at the composition layer;
   in-process **lazy** requires of **published** façades only (never module `models`, except
   the engine's own `provisioning_runs` ledger); no HMAC-HTTP for cross-module calls; no
   self-owned HTTP surface. Per-member credentialing is the **auth-owned**
   `provisionMemberCredentials` hook that both the engine (owner) and FEAT-035 (members) call.
2. **Saga + idempotency + compensation** exactly as the Decision-3 table: `idempotencyKey` +
   `auth.provisioning_runs` ledger; S1/S2/S3 each in their module's local transaction; S4–S8
   non-transactional with the tabled compensations; compensation runs LIFO over the ledger and
   parks in `compensation_failed` on residual. Certificate compensation is **revoke**.
3. **CA topology:** S0 asserts the platform root (abort if absent, never mint one); one
   intermediate per org under it (`userId=null`); entity certs under the intermediate; dedup by
   `commonName`/`organizationalUnit`. Confirm the `STORAGE_TYPE` (disk/s3) precondition.
4. **Linkage schema (dba):** nullable `ca_group_id UUID` on `auth.organizations`, no cross-
   schema FK, indexed; migration `up()` **run directly**, schema-qualified to `auth` (not
   `public`); **`npm run db:check` clean** before wiring any query. `provisioning_runs` +
   any template table are new tables (sync `db:migrate` ok).
5. **Publish the missing local-atomic primitives in their home modules:** CA — a directory
   service (`ensureOrgDirectoryGroup` / `addOrgGroupMember`) that owns a `ca`-local transaction
   and writes the **auth** user id via `UserGroup.create` (not the mixin); nexus — a
   `{transaction}`-aware, idempotent `createGroup` + a compensation/delete helper (slice 2);
   auth — wrap `createOrganization`'s three writes in one `authSequelize.transaction()`. The
   engine composes these; it does not open-code any module's models.
6. **Security surface unchanged:** engine callers authenticate via existing
   `requireAdminAfterCA` / `authenticateService` (service-HMAC) / in-process only; build the
   org payload from the template + explicit allowlist (no mass-assignment of client body); the
   FEAT-033 anonymous signup endpoint is out of scope here (its policy-gate + rate-limit +
   verify-before-provision review belongs to FEAT-033). No weakening of `DEV_BYPASS`/CORS/​
   error-handler.
7. **Templates:** a hardcoded map keyed on the existing `enterprise`/`team`/`personal` `type`
   enum selects provisioned groups/policies/cert depth/limits; covered by tests. Admin
   editability is explicitly out of scope (follow-up). Route the admin provision + FEAT-035
   import surfaces into `API_SURFACE.md`; add the engine note to `ARCHITECTURE.md` on landing.

## Implementation notes (post-build, 2026-07-11)

Slice 1 **and** slice 2 shipped together — the nexus-group + spark-channel steps (S7/S8)
were folded in behind a per-template `nexus.create` flag (enterprise/team on, personal off),
because a feasibility scout confirmed the glue is two existing published functions
(`nexus groupService.createGroup` + `spark groupChannelService.ensureGroupChannels`) with a
`deleteGroupCascade`/`deleteGroupChannels` compensation pair — no nexus schema change. The
saga is S0…S9 with 36 passing tests (happy × 3 templates, the S1–S7 rollback matrix,
compensation-itself-fails parking, idempotency/resume, resume-after-compensation restart,
preflight aborts, linkage-token validation, mass-assignment guard, member hook).

An adversarial review panel (5 lenses) ran post-build; its findings were triaged and the
runtime/security defects fixed and regression-tested:
- **Fixed (critical):** a `failed`-and-compensated run left its ledger cursor/ids intact, so a
  same-key retry resumed *forward* onto compensation-deleted resources. The driver now only
  short-circuits on `completed`, returns a `compensation_failed` run untouched (needs an
  admin), and `resetForRetry()`s a cleanly-unwound `failed` run so the retry restarts at S1.
- **Fixed (high):** the member hook's S6-token-failure self-compensation revoked the entity
  cert but left `ids.certId` set, so a resumed member run reused an inert (revoked) cert — it
  now drops `certId` on revoke so the retry re-mints.
- **Fixed (high, security):** the sibling `POST /api/organizations` (session-auth) still
  forwarded the raw body into `Organization.create`, letting any authenticated user
  mass-assign `plan`/`settings`/`metadata`. It now goes through an explicit allowlist, closing
  the escalation the `/provision` guard exposed by contrast.
- **Fixed (medium):** the linkage ALTER now guards its index creation independently of the
  column guard (a mid-migration failure no longer leaves the index uncreated on re-run).

Two review items were **accepted as deviations**, not code-changed, with rationale:
- **Engine open-codes some `auth` model writes** (S1 owner-user + RBAC groups + teardown) rather
  than composing an auth service for every write (RC-1/RC-5 purity). Accepted: the dependency is
  a *downward, lazy* require from the composition layer into a leaf-ward module — acyclic, and no
  require cycle can form — and `auth` exposes no single transactional "create owner+org+RBAC"
  service. Extracting one adds auth surface for marginal benefit; filed as a follow-up cleanup,
  not a blocker.
- **Template tokens use `resourceValue:'/'`** (match-any path). Accepted by design: the real
  boundary is the token's **org scope** (`organizationId` = the `ca.groups` id, validated by
  token-spec v1.1), not the resource path; a per-org member acting within their org scope is the
  intended grant. Revisit if per-resource scoping is ever required.
