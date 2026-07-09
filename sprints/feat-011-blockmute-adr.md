# FEAT-011 Block/Mute — Architecture Decision (lightweight ADR)

**Author:** systems-architect · **Date:** 2026-07-07 · **Branch:** `feature/lowcode-gap-closure`
**Status:** decision / review-ready (no product code changed by this doc)
**Gates:** PM sizing of FEAT-011 · dba co-sign on the new table · architect sign-off at COMMIT
**Ticket:** `sprints/BACKLOG.md` → FEAT-011 (Tier 1, P1)

---

## Context

FEAT-011 adds user-controlled **block** (and later **mute**): a user suppresses
another user's content/interactions across the surfaces where they see each other.
This is a user-safety primitive, distinct from and complementary to the moderation
pipeline (admin/AI-controlled, `sprints/moderation-routing-plan.md`).

**Greenfield — with one material correction to the Cost/Benefit note.** The C/B
assessment states there is "no follow/social-graph model." That is **wrong**, and
it changes the sizing and the storage decision in FEAT-011's favor:

- **No block/mute model exists** — confirmed. A grep of `services/*/models` for
  block/mute returns nothing.
- **A social graph DOES already exist, in the timeline schema:**
  - `services/timeline/src/models/Follow.js` — `{ followerId, followingId, active }`,
    unique `(followerId, followingId)`, indexed both directions.
  - `services/timeline/src/models/List.js` + `ListMember.js` — Twitter-style
    per-user lists.
  - The home feed is **built from `Follow`**:
    `services/timeline/src/services/feedService.js:46-62` queries the viewer's
    follows and filters `Post.userId IN (self + following)`.
  - The follow **CRUD idiom already exists**:
    `services/timeline/src/routes/interactions.js:141-184` →
    `POST/GET/DELETE /timeline/api/interactions/users/:id/follow`
    (documented in `API_SURFACE.md:648-649`).

So the platform already has a per-user user-to-user relationship table, its owning
module (**timeline**), a CRUD route idiom to clone, and the exact feed-build path
where enforcement must hook. Block/mute is an **extension of an existing pattern**,
not a from-scratch substrate. That pulls the recommended slice to the analyst's
**M** floor rather than L.

Spark's relationships are membership-based (`Conversation` + `Participant`,
`services/spark/src/models/`), not a user-to-user graph — spark has no substrate to
reuse, which is why spark enforcement is the harder, deferred half.

**Governing invariants (from `CLAUDE.md` / `ARCHITECTURE.md`):**
- One `exprsn` DB, **one schema per module**; modules do **not** reach into each
  other's schemas.
- Inter-module calls are moving **from HTTP-to-gateway toward direct in-process
  calls** (`TASK-009`); the moderation plan already blesses in-process `require` of
  another module's service as the go-forward contract
  (`sprints/moderation-routing-plan.md` §"in-process require (recommended)").
- Shared two-copy rule (`shared/` + `services/shared/`) applies **only if** code
  lands in the shared package.

---

## Decision

### 1. Storage location — (c) hybrid, thin: single authoritative table behind an in-process service; cache deferred

**One authoritative `user_relationships` table, physically hosted in the `timeline`
schema, accessed by every other module ONLY through an in-process service export
(`blockService`) — never by cross-schema SQL. No Redis cache for MVP.**

Rejected alternatives:

- **(b) Per-module block tables** — rejected. Duplicated state across timeline,
  spark, live is exactly the "blocked on timeline but not on spark" consistency
  failure the analyst flagged. No single source of truth; every module re-implements
  create/list/undo. Directly at odds with the acceptance criterion "queryable by the
  consuming modules … not per-module divergent."

- **(a-new-module) A dedicated `relationships` module/schema** — the *cleanest*
  long-term home (block is a cross-cutting safety primitive that timeline, spark,
  live, and maybe nexus all consume, so coupling it to a feed module is a smell).
  **Rejected for MVP** on cost: a new registry entry, schema, and `init` wiring
  inflates the block-first/timeline-first slice from M toward L for zero MVP benefit
  (timeline is the only MVP consumer). Filed as a deferred follow-up (see handoff).

- **(a-auth/CA) Host in auth or CA schema** — rejected. Block is a user *preference*,
  not an identity/credential primitive; it does not belong to the certificate
  authority or the OIDC/session store.

**Why timeline-hosted is safe despite the smell:** the physical schema is an
**implementation detail hidden behind the `blockService` interface**. Consumers call
`blockService.getBlockedIds(userId)` / `isBlocked(a, b)` in-process — the same
pattern the moderation plan uses for `moderationService.moderateContent` (atproto,
filevault, spark call it in-process and never touch moderator's tables). Because no
consumer ever sees the table, moving it later to a dedicated module is a **relocation
behind a stable interface, not a rewrite**. This keeps the per-schema isolation
invariant intact: only timeline's code reads timeline's tables.

**The load-bearing decision is the access contract, not the physical row.** Define
`blockService` (in-process, owned by timeline for MVP) from day one, even though only
timeline consumes it in the MVP slice — that is what makes spark's fast-follow a
clean consumer instead of a second copy of the data.

**Cache: deferred.** Block lists are small (per-user, human-scale). A DB query in the
feed-build path is fine at MVP scale. Add the Redis-cached block set (dba) only when
spark hot-path / real-time delivery enforcement lands and the per-message lookup cost
justifies it. Not in the MVP slice.

### 2. Enforcement model — read-time suppression at the serve boundary (bidirectional), plus follow-break on block

- **Primary mechanism: read-time filtering.** Block is honored by **suppressing the
  blocked user's content at the point it is served**, not by deleting anything.
  For timeline that means extending the feed query and, critically, the **serve
  path** (see cache caveat) with `userId NOT IN (blockedIds ∪ blockedByIds)`.

- **Bidirectional.** Standard block semantics: if A blocks B, then A does not see B
  **and** B does not see A. Enforcement therefore filters on both
  `getBlockedIds(viewer)` (people the viewer blocked) **and**
  `getBlockedByIds(viewer)` (people who blocked the viewer). Hook point:
  `feedService.getHomeFeed` (`services/timeline/src/services/feedService.js:57-62`,
  the `where` clause) and the user-timeline path.

- **Cache-consistency catch (architect-owned, load-bearing).** Timeline feeds are
  **pre-built and cached by prefetch** (`services/prefetch/src/services/prefetchService.js`
  hot/warm tiers, per `ARCHITECTURE.md` Redis allocation). A block filter applied
  only in the DB feed-build path **leaks blocked content that is already in a cached
  feed** until the cache expires. Enforcement must therefore be applied at the
  **serve boundary after cache retrieval** (filter the cached feed against
  `blockService` on read), and the blocker's cached feed **should be invalidated on
  block** as an optimization. Filtering at serve time is the correctness guarantee;
  invalidation is the latency optimization. This is the concrete shape of the
  "consistency risk" the analyst raised — it is a real trap, not hypothetical.

- **Write-time rejection is the spark/DM concern — deferred.** Rejecting a DM or a
  mention at write time (blocked user cannot message/mention the blocker) is
  spark/interaction territory and is **out of the MVP slice**. See §3.

- **Graph hygiene on block (in MVP):** blocking auto-breaks any existing `Follow`
  edges **in both directions** (delete/deactivate the `follows` rows). This is a
  DELETE on an existing table — **no schema change, no ALTER trap**. Without it the
  feed would still pull the blocked user via a stale follow edge before the block
  filter runs, and the "following" count would be misleading.

- **MVP enforcing modules: timeline only.** Spark (and later live/nexus) enforce as
  fast-follows by consuming `blockService` in-process. The MVP slice is scoped so the
  **one in-scope surface (timeline) enforces completely** (feed + user-timeline +
  cached-serve path + follow-break) rather than shipping partial enforcement broadly
  — directly answering the analyst's caveat.

---

## MVP slice (in / out)

**IN — block-first, timeline-first, fully enforced on the one surface:**

- **Block only** (create / list / undo) via new endpoints under the existing
  interactions router, mirroring the follow idiom:
  - `POST /timeline/api/interactions/users/:id/block`
  - `DELETE /timeline/api/interactions/users/:id/block`
  - `GET /timeline/api/interactions/users/:id/block` → `{ blocked: boolean }`
  - `GET /timeline/api/interactions/blocks` → the viewer's block list
  - (routes to be added to `API_SURFACE.md` under timeline, beside `:648-649`)
- **New `user_relationships` table** in the `timeline` schema (see §4), persisted.
- **In-process `blockService`** owned by timeline, exporting `isBlocked(a, b)`,
  `getBlockedIds(userId)`, `getBlockedByIds(userId)` — the cross-module contract,
  established now even though only timeline consumes it in MVP.
- **Read-time bidirectional suppression** on the timeline home feed **and** the
  user-timeline view, applied at the **serve boundary** (covers the prefetch cache
  path) with cache invalidation on block.
- **Follow-break on block** (both directions) against the existing `follows` table.
- **Tests:** block-suppression on the home feed (incl. the cached-serve path) and
  undo restores visibility.

**OUT — deferred fast-follows (file as follow-on tickets, not implicit):**

- **Mute** (soft-suppress without notifying, no follow-break). Deferred — block is
  the higher-value safety primitive; the table is modeled with a `type` column so
  mute is a data addition, not a later ALTER.
- **Spark enforcement** — DM prevention (write-time reject) + message suppression
  (read-time), consuming `blockService` in-process. The harder half; separate ticket.
- **live / nexus enforcement.**
- **Write-time interaction rejection on timeline** beyond follow-break (blocked user
  commenting/liking/mentioning the blocker) — fast-follow if not trivially cheap.
- **Redis-cached block set** — add with spark hot-path enforcement.
- **Extraction to a dedicated `relationships` module** — the clean long-term home;
  deferred behind the `blockService` interface (revisit trigger below).

---

## Consequences & risks

- **(+) Single source of truth** with a stable in-process interface: consistent
  enforcement, no per-module divergence, and future consumers (spark, live) are
  clean callers, not copies.
- **(+) Reuses existing infra:** the `follows` model, the interactions CRUD idiom,
  and the `feedService` query point already exist — this is why the slice is M.
- **(+) No ALTER trap and no two-copy edit:** MVP adds a **new** table (safe under
  sync `db:migrate`) and keeps `blockService` **inside the timeline module** (not in
  `shared/`), so the `shared/` ↔ `services/shared/` two-copy rule does not trigger.
- **(−/smell) A platform-wide safety primitive is physically hosted in a feed
  module.** Accepted for MVP because the `blockService` interface hides the location;
  the smell is real and is discharged by the deferred extraction ticket, not ignored.
- **(risk) Cache-serve consistency** (prefetch) is the one non-trivial correctness
  requirement — mitigated by filtering at the serve boundary + invalidation on block.
  QA must test the cached path specifically, not just the DB feed-build path.
- **(risk) Partial enforcement = safety failure.** Mitigated by scoping MVP to a
  single, fully-enforced surface (timeline) and naming spark as an explicit,
  separately-ticketed fast-follow rather than an implied "later."
- **(risk) In-process coupling** when spark consumes `blockService`: spark's require
  graph pulls in timeline's model layer (already the accepted trade-off for the
  moderation bridge). Keep the require **lazy** in spark. This risk lands only when
  the spark fast-follow ships, not in MVP.
- **Security invariants unchanged:** no new open surface (block endpoints are
  authenticated writes bound to `req.user.id`, same as the follow routes); DEV_BYPASS,
  CORS, and the HMAC service-token flow are untouched.

---

## Schema / dba handoff (dba is co-sign owner of the table mechanics)

**New table — `timeline` schema — `user_relationships`:**

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK (`UUIDV4`) | |
| `actorId` | UUID, notNull | the blocking/muting user |
| `targetId` | UUID, notNull | the blocked/muted user |
| `type` | ENUM(`block`,`mute`) notNull, default `block` | mute reserved so it's a data add, not an ALTER |
| `createdAt` / `updatedAt` | timestamps | |

- **Constraints/indexes:** unique `(actorId, targetId, type)`; index on `actorId`
  (list "who I blocked") and on `targetId` (list "who blocked me" — needed for the
  bidirectional filter). Mirrors `Follow`'s both-direction indexing.
- **Migration mechanic:** this is a **new table → created cleanly by sync
  `db:migrate`** (`scripts/migrate-sync.js`). **No ALTER-on-existing trap** for the
  MVP slice. The follow-break on block is a DELETE against the existing `follows`
  table — also no schema change. If a future column is added to `follows` for block
  interplay, that is the ALTER case (run the migration `up()` directly, then
  `db:check`) — not needed here. Schema-qualify to `timeline`.
- **dba owns:** the table DDL/indexes and the (deferred) Redis block-set cache
  topology. I co-sign the **structural shape** (single table, `type`-enum
  future-proofing, both-direction indexing, in-process access contract); dba signs
  the mechanics and is the data-ticket sign-off owner.

**Two-copy note:** MVP keeps `blockService` in the timeline module, so **no `shared/`
edit and no two-copy sync is required.** If a later slice promotes `blockService`
into `@exprsn/shared`, update both `shared/` and `services/shared/` (or migrate the
consumer to the `@exprsn/shared` import).

---

## PM handoff & sizing

- **Recommended MVP slice (block-first, timeline-first, fully enforced on timeline):
  size = M** (2–3 days per `sprints/README.md`). Basis: new table is trivial and
  ALTER-free; endpoints clone the existing follow CRUD; enforcement is a
  `NOT IN` on an existing query point plus the serve-boundary/cache filter and
  follow-break. The one non-trivial item is the prefetch-cache consistency filter,
  which is bounded. This confirms the analyst's "M achievable" floor; the L in the
  ticket was the un-scoped (shared-vs-per-module + spark) reading, now resolved.
- **Route:** sr-developer (cross-module-aware structural work + the cache-consistency
  subtlety). Not a jr `S` ticket.
- **Do not** groom the OUT items into this ticket — they are separate fast-follows
  (mute, spark enforcement, live/nexus, Redis cache, module extraction) and each
  needs its own backlog entry.

**Follow-on tickets to file (architect will file; not implicit):**
1. **TASK — extract `user_relationships` + `blockService` to a dedicated
   `relationships`/social-graph module.** `deferred`. **Revisit trigger:** the
   *second* cross-module consumer of `blockService` reaches enforcement (i.e. the
   spark fast-follow), OR a third consumer (live/nexus) appears — at that point the
   timeline-hosting smell becomes a real coupling liability worth paying to remove.
2. **FEAT/TASK — spark block enforcement** (DM write-time reject + message read-time
   suppression via in-process `blockService`; lazy require). Includes the Redis
   block-set cache decision (dba).
3. **TASK — mute** (soft-suppress, no follow-break; `type='mute'` data path).

**Architect sign-off (COMMIT gate):** granted for the storage locus (timeline-hosted
authoritative table behind an in-process `blockService`) and the enforcement model
(read-time bidirectional serve-boundary suppression + follow-break) **as scoped to
the MVP slice above**. dba must co-sign the `user_relationships` DDL before the
ticket moves `ready → in-sprint`. New routes must land in `API_SURFACE.md`; the
resolved social-safety gap should be reflected in `STATUS.md`.

---

### Cited files
- `services/timeline/src/models/Follow.js` · `List.js` · `ListMember.js` (existing
  social-graph substrate — corrects the C/B "no follow model" claim)
- `services/timeline/src/services/feedService.js:46-62` (feed-build enforcement hook)
- `services/timeline/src/routes/interactions.js:141-184` (follow CRUD idiom to clone)
- `services/prefetch/src/services/prefetchService.js` (cached-feed serve path — the
  consistency trap)
- `services/spark/src/models/` (`Conversation`/`Participant` — membership, not a
  user graph; why spark is the harder deferred half)
- `sprints/moderation-routing-plan.md` §"in-process require (recommended)" (the
  in-process cross-module service precedent this ADR follows)
- `API_SURFACE.md:648-649` (follow routes; block routes to be added beside them)
- `src/modules/registry.js` (schema-per-module authority) · `ARCHITECTURE.md`
  (Redis allocation / prefetch tiers) · `CLAUDE.md` (isolation, two-copy, TASK-009)
