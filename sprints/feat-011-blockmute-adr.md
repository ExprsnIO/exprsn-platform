# ADR — FEAT-011 block/mute: storage locus, the relationship façade, and the enforcement-point set

- **Status:** Accepted (APPROVED-WITH-CHANGES) — 2026-07-13. Revised 2026-07-13 to fold in the **dba co-sign corrections** (migration mechanics: model-owns-creation, CHECK-constraint-only migration — §DDL) and the **adversarial judge's blocking findings** (the mention producer was mis-enumerated — N1 is **two** producers, one in `worker:timeline`; expired mutes must be filtered; quote-embed guard-rail). Supersedes the 2026-07-07 draft (which mis-modelled the prefetch cache; see finding 8).
- **Deciders:** systems-architect (structural sign-off — storage locus, cross-module contract, enforcement set); dba (co-sign owner of the `user_relationships` DDL + the deferred Redis cache — **co-signed 2026-07-13, contingent on the §DDL migration-mechanics change, now folded in**); product-manager (final scope/size; the ADR's size call is **M**, re-scoped from L, see §Size).
- **Tickets:** FEAT-011 (block/mute, Tier 1, P1). Unblocks the sprint-2026-08 "out of scope / revisit trigger" item ("the storage-locus decision … drives M-vs-L and the dba sign-off").
- **Extends:** ADR 0001 (cortex in-process inference façade) and ADR 0003 §Decision-1 — *consumers require another module's **published service façade** in-process, never its `models`, never loopback HTTP, never a `shared/` client*. That rail is binding here and is the whole basis of Decision 2.
- **Relates:** FEAT-010 (user reports — the human-in-the-loop sibling; independent), FEAT-009/TASK-019 (auto-moderation pipeline — orthogonal: admin/AI-controlled, not user-controlled), TASK-009 (retire `*_SERVICE_URL` hops for in-process calls), `sprints/moderation-routing-plan.md` §"in-process require (recommended)", TASK-024 (`db:check` now catches nullability + FK `onDelete` drift).

---

## Context

FEAT-011 adds user-controlled **block** and **mute**. It is a *safety primitive*, not a
moderation feature: the actor is the end user, not an admin or an AI verdict.

The ticket's structural question — and the only thing gating COMMIT — is **where the
relationship rows live**, because block is inherently **cross-module** (it must suppress
content in timeline, prevent contact in spark, and be at least coherent in live/nexus/
notifications) while the platform's hard rule is **one schema per module, and modules do
not read each other's tables**.

### Findings from reading the code

1. **A social graph already exists, and it lives in `timeline`.** `services/timeline/src/models/Follow.js`
   (`{ followerId, followingId, active }`, unique `(followerId, followingId)`, indexed both
   directions), plus `List.js` / `ListMember.js`. The follow CRUD idiom to clone is
   `services/timeline/src/routes/interactions.js:141` (POST), `:164` (GET), `:184` (DELETE) →
   `interactionService.followUser/isFollowing/unfollowUser`
   (`services/timeline/src/services/interactionService.js:175`, `:229`, `:205`), documented at
   `API_SURFACE.md:661-662`. **The FEAT-011 Cost/Benefit note is wrong** where it says "no
   follow/social-graph model" exists — three of the four social-graph tables (follow, list,
   list-member) are already timeline-owned. That is the single most load-bearing fact for the
   storage decision.

2. **The dominant read path already does exactly the query block needs.**
   `feedService.getHomeFeed` (`services/timeline/src/services/feedService.js:43`) issues one
   `Follow.findAll({ where: { followerId: userId } })` at `:46`, builds an id array at `:51-54`,
   and applies `userId: { [Op.in]: userIds }` in the `where` at `:57-62`. A block filter is the
   same shape with `[Op.notIn]` — **one extra set-returning query per request, not per post**.

3. **No block/mute model exists anywhere.** Confirmed by grep across `services/*/models` and
   `services/*/src/models`. What *does* exist, and must **not** be conflated:
   - `services/spark/src/models/Participant.js:50,55` — `muted` / `mutedUntil`: a
     **per-conversation notification mute**, already consumed at
     `services/spark/src/socket/index.js:84`. That is a different concept from a
     **user-level** mute and must keep its own semantics.
   - `services/live/src/services/room.js:94,425` — `muteOnJoin`: an **audio** mute in WebRTC
     rooms. Unrelated.

4. **Cross-module in-process requires of a *published service* are established practice.**
   `services/auth/src/services/tokenService.js:18` → `ca/services/token`;
   `services/auth/src/services/userImportService.js:496` → `nexus/src/services/membershipService`;
   `services/filevault/src/services/imageModerationService.js:28` → `cortex/src/client`;
   `services/atproto/src/ingest/moderationBridge.js:22` → `moderator/services/moderationService`.
   The moderation plan explicitly blesses this over an HTTP hop
   (`sprints/moderation-routing-plan.md:89-97`). There is therefore **no need to invent a new
   cross-module transport** for block.

5. **Notifications do not need to consult the block store at all — the *producers* do.** The
   moderator notification hub is a dumb, HMAC-gated sink: `POST /moderator/api/notifications`
   (`services/moderator/src/routes/notifications.js:87`) takes `{ userId, type, title, body,
   data }`, persists, and emits to `user:{userId}`. **The actor is not a first-class field** —
   it is buried in the free-form `data.actorId` blob written by the producer
   (`services/timeline/src/services/heraldService.js:177-207`). Filtering at the hub would mean
   moderator reverse-engineering another module's payload *and* acquiring a dependency on the
   relationship store. **Enforce at the producer; moderator changes not at all.** But note the
   correction below (finding 10): "the producer" is **not one function** — there are **three
   producer integration points**, and one of them runs in a *different process*.

10. **CORRECTION — the timeline→bell producer is TWO code paths, not one, and one lives in
    `worker:timeline`.** The 2026-07-07 enumeration (and Decision-4 as first drafted) claimed a
    single guard at `heraldService.notifyInteraction` (`heraldService.js:167`) covers
    like/comment/reply/repost/**mention**/follow. **That is FALSE for `mention`.** The mention
    notification does **not** go through `heraldService.notifyInteraction` at all:
    `postService.js:408-428` builds the mention notifications and enqueues a Bull
    `batch-notification` job, consumed by `processBatchNotificationJob`
    (`services/timeline/src/jobs/processors/notificationProcessor.js:75`), which formats and calls
    `heraldService.sendBatchNotifications` (`:99`) — it **never touches `notifyInteraction`**. So a
    guard placed only in `notifyInteraction` leaves the @mention path uncovered, and **a blocked
    user's @mention still lights the target's bell** — a live harassment vector that violates the
    §3 "notifications suppressed both ways" promise. Two consequences, both binding:
    - **The suppression check MUST also land inside `processBatchNotificationJob`** — filter the
      recipient list, dropping any recipient whose `getSuppressedIds(recipientId)` contains the
      post author (`actorId` = `post.userId`). The recipient set is bounded by mentions-per-post
      (a handful), not the unbounded feed, so a `getSuppressedIds` call per resolved recipient is
      not the N+1 the feed-read binding guards against.
    - **This runs in the `worker:timeline` process, NOT the gateway.** `processBatchNotificationJob`
      is registered at `worker.js:88` and executes in the standalone Bull worker. The façade must
      therefore be **require-able and DB-attached in the worker process too**. It works — the worker
      boots the same timeline Sequelize (same `timeline` schema, same pool), so `relationshipService`
      + its `UserRelationship` model resolve identically there — but it is a **distinct integration
      point** to wire and test, separate from the gateway route handlers.

   The other two producers are single-id-in-hand and unchanged in shape:
   `heraldService.notifyInteraction(type, recipientId, actorId, post)` (`heraldService.js:167`,
   covering like/comment/reply/repost/follow — **not** mention) and spark's
   `notifyNewMessage({ conversationId, senderId, … })` (`services/spark/src/socket/index.js:70`).

6. **Spark's contact surface is two functions.** `conversationService.createConversation`
   (`services/spark/src/services/conversationService.js:12`) and `messageService.sendMessage`
   (`services/spark/src/services/messageService.js:14`, participant check at `:30`) are the
   only ways a user reaches another user in spark. Read paths are
   `conversationService.getUserConversations` (`:42`), `getConversationById` (`:66`),
   `messageService.getMessages` (`:83`). Spark has **no user-to-user graph** to reuse — it is
   membership-based (`Conversation` + `Participant`) — which is why it must *consume* the
   store, never own it.

7. **Live stream chat is a room broadcast and cannot be per-recipient filtered as written.**
   `services/live/src/sockets/index.js:261` (`stream-chat-message`) ends in
   `this.io.to(streamId).emit('stream-chat-message', chatMessage)` (`:311`), and late joiners get
   a replay of an in-memory history buffer (`:224-227`). Honoring a viewer-side block requires
   changing the fan-out from a room broadcast to a per-socket emit (or filtering client-side).
   That is a **socket-topology change** — architect-owned, and deliberately **out of FEAT-011**.

8. **The prefetch cache is NOT on the feed serve path** (this **corrects** the 2026-07-07 draft
   of this ADR, which called it "the consistency trap"):
   - `services/prefetch/src/services/prefetchService.js:83-104` fetches
     `GET /api/timeline/user/{userId}` — i.e. `feedService.getUserTimeline`, **the user's own
     posts**, not a personalized home feed. `GET /prefetch/api/cache/:userId`
     (`services/prefetch/src/routes/prefetch.js:229-233`) is `requireSelfOrAdmin`. A caller can
     therefore only ever read *their own* content out of that cache — **no block leak exists**.
   - The SPA renders the feed from `/timeline/api/timeline` (`web/src/api/timeline.ts:174`) and
     only *schedules* a warm-up (`web/src/features/timeline/TimelinePage.tsx:166`).
   - Timeline's own Redis fan-out list `timeline:{followerId}`
     (`services/timeline/src/services/fanoutService.js:101-117`) is **written but never read** by
     the serve path — `feedService.js:7` imports models only, no Redis. So the DB filter *is*
     the serve path.
   - **Consequence:** the block filter belongs in the DB query, and any future work that puts a
     pre-built feed cache on the serve path must apply the filter **after** cache retrieval.
     Filed as a guard-rail note, not MVP work.

9. **New table → no ALTER trap; but the CHECK constraint needs a real migration.** A new table
   is created cleanly by sync `db:migrate` (`scripts/migrate-sync.js`); the documented
   *"sync will not ALTER an existing table to add a column"* trap does **not** apply, because
   FEAT-011 adds **zero columns to existing tables**. The self-block `CHECK` is not expressible
   in a Sequelize `define`, so it must land via a migration file (precedent:
   `services/timeline/migrations/20260626000000-add-post-content-length-check.js`) whose `up()`
   is run, followed by a clean `npm run db:check`. Timeline's Sequelize sets
   `define.schema:'timeline'` + `searchPath` + `prependSearchPath`
   (`services/timeline/src/models/index.js:12-32`), so a model-based migration inherits the
   schema and cannot leak into `public` (STATUS #1).

11. **Quote-embed is a latent suppression leak — guard-rail, not MVP work.** A post can quote
    another post (`metadata.quoteOf`, surfaced today via the quotes list R12 and the SPA). Today
    the quoted post is **not** server-hydrated inline into the quoting post's payload — the SPA
    re-fetches the quoted post, which hits the R9 post-detail path (404 when blocked either way),
    so the block already holds by construction. **But the instant any code path starts hydrating
    the embedded quoted post inline** (attaching the quoted author + body into the parent payload),
    that embedded author bypasses R9 and leaks. **Binding guard-rail:** any inline server-hydration
    of `metadata.quoteOf` MUST filter the embedded author through `getSuppressedIds(viewer)` and
    drop/redact the embed when suppressed. Listed here so a future inline-hydration change cannot
    reintroduce the leak silently.

---

## The enumerated read/write paths a block must reach

Every surface where user A can currently see or reach user B. This is the enforcement
inventory; the Decision below assigns each one to a slice.

### Timeline — read (suppression)

| # | Path | file:line | Filter |
|---|------|-----------|--------|
| R1 | Home feed | `services/timeline/src/services/feedService.js:43` (follow fetch `:46`; `where` `:57-62`) | `Post.userId NOT IN suppressed(viewer)` |
| R2 | User timeline / profile | `services/timeline/src/services/feedService.js:92` | empty (or 403) when blocked either way |
| R3 | Explore feed | `services/timeline/src/services/feedService.js:117` | `NOT IN` |
| R4 | Trending posts | `services/timeline/src/services/feedService.js:147` | `NOT IN` |
| R5 | Post thread / replies | `services/timeline/src/services/feedService.js:175` | `NOT IN` on replies |
| R6 | Global public timeline (both cursor + offset branches) | `services/timeline/src/routes/timeline.js:100` and `:121` | `NOT IN` |
| R7 | Group feed | `services/timeline/src/routes/timeline.js:150` | `NOT IN` (co-membership does **not** exempt) |
| R8 | Bookmarks / liked lists | `services/timeline/src/routes/timeline.js:269`, `:289` | `NOT IN` on post author |
| R9 | Post detail / permalink | `services/timeline/src/routes/posts.js:142` | 404 when blocked either way |
| R10 | Comments on a post | `services/timeline/src/routes/posts.js:319` (`Comment.findAll` `:323`) | `NOT IN` on comment author |
| R11 | Thread | `services/timeline/src/routes/posts.js:340` | `NOT IN` |
| R12 | Quotes | `services/timeline/src/routes/posts.js:356` | `NOT IN` |
| R13 | Likes list | `services/timeline/src/routes/posts.js:520` (`Like.findAll` `:525`) | `NOT IN` on liker |
| R14 | Reposts list | `services/timeline/src/routes/posts.js:545` | `NOT IN` |
| R15 | Search — SQL fallback | `services/timeline/src/routes/search.js:99` (`sqlSearch`) | `NOT IN` |
| R16 | Search — Elasticsearch | `services/timeline/src/routes/search.js:56` → `elasticsearchService.searchPosts` | ES `must_not: terms { userId: suppressed }` — **extra work, not a `where` clause** |

### Timeline — write (contact rejection)

| # | Path | file:line |
|---|------|-----------|
| W1 | Like a post | `services/timeline/src/routes/posts.js:207` → `interactionService.likePost` (`interactionService.js:13`) |
| W2 | Comment on a post | `services/timeline/src/routes/posts.js:273` |
| W3 | Repost | `services/timeline/src/routes/posts.js:397` → `interactionService.repostPost` (`:69`) |
| W4 | Follow | `services/timeline/src/routes/interactions.js:141` → `interactionService.followUser` (`:175`) |

### Notifications (fan-in) — producer-side suppression

**N1 is TWO producers (finding 10) — like/comment/reply/repost/follow go one way, `mention` goes another (through a Bull job in `worker:timeline`).**

| # | Path | file:line |
|---|------|-----------|
| N1a | Timeline → bell — like/comment/reply/repost/**follow** (NOT mention) | `services/timeline/src/services/heraldService.js:167` (`notifyInteraction`; actor+recipient both in hand) — called at `services/timeline/src/routes/interactions.js:153` and from `posts.js`. Guard: drop when `isBlockedEitherWay`/suppressed(recipient⊇actor) inside `notifyInteraction`. |
| N1b | Timeline → bell — **`mention`** (separate Bull path, runs in `worker:timeline`) | producer `services/timeline/src/services/postService.js:408-428` enqueues `batch-notification` → consumer `processBatchNotificationJob` (`services/timeline/src/jobs/processors/notificationProcessor.js:75`, registered `worker.js:88`) → `heraldService.sendBatchNotifications` (`:99`). Guard: **inside `processBatchNotificationJob`**, filter recipients where `getSuppressedIds(recipientId)` ∋ `actorId` (post author). Façade must be DB-attached in the **worker** process. |
| N2 | Spark → bell (new message) | `services/spark/src/socket/index.js:70` (`notifyNewMessage`; already filters sender + `p.muted` at `:84`) |
| N3 | Moderator ingest hub | `services/moderator/src/routes/notifications.js:87` — **NO CHANGE.** Actor is only in the free-form `data` blob (finding 5); the hub must stay a dumb sink. |

### Spark — contact + read

| # | Path | file:line |
|---|------|-----------|
| S1 | Create a direct conversation | `services/spark/src/services/conversationService.js:12` (route `services/spark/src/routes/conversations.js:22`) |
| S2 | Send a message | `services/spark/src/services/messageService.js:14` (participant check `:30`) |
| S3 | Add a participant to a conversation | `services/spark/src/services/conversationService.js:83` |
| S4 | List conversations | `services/spark/src/services/conversationService.js:42` |
| S5 | Fetch message history | `services/spark/src/services/messageService.js:83` |

### Live / nexus — acknowledged, out of the FEAT-011 slice

| # | Path | file:line | Why deferred |
|---|------|-----------|--------------|
| L1 | Stream chat post + broadcast | `services/live/src/sockets/index.js:261`, broadcast `:311`, history replay `:224` | room-wide `io.to(streamId).emit` — per-recipient filtering is a **socket-topology change** (finding 7) |
| L2 | Room invite / collab | `services/live/src/routes/roomCollab.js`, `services/live/src/services/room.js` | contact surface; cheap, but rides on L1's decision |
| X1 | Nexus group membership / invites | `services/nexus/src/services/groupService.js:49,141,350`; `GroupInvite`, `JoinRequest` models | a block must **not** evict either party from a shared group (that is the group admin's call); group *posts* are timeline posts and are already covered by R7 |

---

## Options considered

### (a) One authoritative table in ONE module + an in-process query façade

Sub-variants, by host module:

- **(a1) `timeline`** — hosts the table beside `Follow`/`List`, publishes
  `relationshipService`. **Pros:** the social graph is already here (finding 1); the follow-break
  on block is an **intra-module** write; the heaviest consumer (16 read paths) is local, so 16 of
  ~24 enforcement points need **no cross-module call at all**; zero new-module cost; the future
  extraction moves one *coherent* graph. **Cons:** a feed module becomes a platform-primitive
  provider — spark/live acquire an in-process edge into `timeline`. Real smell; discharged by a
  named extraction trigger.
- **(a2) `auth`** — cleanest *layering* (auth is a leaf everyone already depends on).
  **Rejected:** a block is a social preference, not a credential, and it drags the platform's most
  security-sensitive module into UGC concerns. Fatally, the **follow-break becomes cross-module**:
  auth would have to call *up* into timeline (a layering inversion — exactly what ADR 0003 §2
  forbids), or the follow row is left stale and the blocked user keeps appearing in the actor's
  following list.
- **(a3) `moderator`** — "safety module owns the safety primitive". **Rejected:** moderator is
  admin/AI-controlled; block is user-controlled (the C/B is explicit on this). Worse, it would put
  a **user-facing authenticated CRUD surface** into the module whose six REST routers are
  currently *unauthenticated* and only being gated by BUG-010 this very sprint. And finding 5
  shows moderator needs no knowledge of blocks at all — adding the table there would *create* a
  dependency that does not otherwise exist.
- **(a4) a new `relationships`/`social` module** — the correct long-term home. **Rejected for
  now** on two grounds: (i) cost (registry entry + schema + `init` + routes + a second Sequelize
  pool) buys nothing an in-process façade doesn't already buy; (ii) **it splits the social graph**
  — `Follow`/`List` stay in timeline, so the follow-break becomes a cross-module write and the
  graph lives in two schemas. Extraction is only correct when `Follow` moves *with* it, which is
  its own L-sized migration touching `feedService`, `fanoutService`, `interactions.js`,
  `API_SURFACE.md`, and the SPA.

### (b) Per-module copies, fanned out on block (denormalized, eventually consistent)

Each of timeline/spark/live keeps its own `blocks` table; a block write fans out. **Rejected
outright.** It has no single source of truth; every module re-implements create/list/undo; a
dropped or lagging fan-out message is *silently* a safety failure (the blocked user still DMs
you) with no way to detect it; and it directly contradicts FEAT-011's own acceptance criterion
("queryable by the consuming modules … so enforcement is consistent, not per-module divergent").
Eventual consistency is an acceptable trade for a *feed*; it is not an acceptable trade for a
*safety boundary*. It also buys nothing: the modules are **in one process** — there is no network
partition to denormalize around.

### (c) A Redis-backed blocklist cache in front of (a)

**Deferred, not rejected — and it is a property of the façade, not of the storage locus.** The
read pattern is one *set-returning* query per request (finding 2), not one query per post, so the
feed cost is +1 indexed lookup over a table with a handful of rows per user. Adding Redis now
means inventing an invalidation protocol (block/unblock/mute must purge two keys) and a
stale-cache safety failure mode, in exchange for a microbenchmark. **Because every consumer goes
through `relationshipService`, the cache can be dropped in later behind the same signature with
zero consumer changes** — that is precisely what the façade buys.

**Revisit trigger (named):** when *per-message* enforcement lands on spark's socket delivery path
(a lookup per delivered message, not per request), **or** when the timeline feed p95 regresses by
>10 ms attributable to the relationship query. At that point dba owns key shape, TTL, and the
invalidation protocol.

---

## Decision

**APPROVED-WITH-CHANGES.** Six binding rulings.

### 1. Storage locus — **(a1): one authoritative `timeline.user_relationships` table**

Block and mute are directed edges in the **social graph**, and the social graph already exists in
the `timeline` schema (finding 1). One table, in `timeline`, holds **both** relationship types.
No copies anywhere else. No cross-schema SQL, ever — the physical location is an implementation
detail that **no other module is permitted to know**.

The timeline-as-primitive-provider smell is **accepted and named**, not hidden. It is discharged
by the extraction ticket below, whose trigger is explicit: *when a third module (beyond timeline
and spark) needs enforcement, `Follow` and `user_relationships` move together into a dedicated
`social` module.* Not before — moving blocks without follows would make things worse, not better.

### 2. Access contract — a published in-process façade, per ADR 0001 / ADR 0003 §1b

**`services/timeline/src/services/relationshipService.js`** is timeline's published façade and the
**only** supported way any other module reaches the store. Consumers `require` it **lazily**
(inside the calling function, per ADR 0003 §2c) so no eager require cycle can form — spark already
calls timeline over HTTP (`services/timeline/src/services/sparkService.js` is axios-based), and
timeline will call moderator in-process under FEAT-009, so the lazy rule is not optional.

The façade's API is **deliberately set-returning first**, because the singular form is the N+1 trap:

```js
// PRIMARY — one call per request. Returns the union of (viewer blocked X) ∪ (X blocked viewer)
//           ∪ (viewer muted X). This is the id set every read path filters against.
//
// EXPIRED-MUTE CONTRACT (binding): the query MUST be, per row for the viewer:
//     type='block'  OR  (type='mute' AND (expiresAt IS NULL OR expiresAt > now()))
// i.e. blocks never expire; a mute counts only while unexpired. Without this an expired
// temporary mute suppresses forever and `expiresAt` is decorative. Expiry is applied in the
// query (a `[Op.or]` on expiresAt), NOT by a sweep job — there is no cron deleting stale mutes.
async function getSuppressedIds(viewerId)            // -> string[]   (block both ways ∪ UNEXPIRED mute)
async function getBlockedIds(actorId)                // -> string[]   (outgoing blocks only)
async function getBlockedByIds(targetId)             // -> string[]   (incoming blocks only)

// WRITE-PATH ONLY — a single pairwise check, never called inside a .map()/loop
async function isBlockedEitherWay(a, b)              // -> boolean    (contact rejection)
async function canContact(actorId, targetId)         // -> boolean    (alias used by spark)

// MUTATION (timeline-internal; the routes call these)
async function block(actorId, targetId)              // + follow-break, both directions
async function unblock(actorId, targetId)
async function mute(actorId, targetId, { expiresAt })
async function unmute(actorId, targetId)
async function listRelationships(actorId, { type })  // the actor's OWN outgoing edges only
```

**Binding:** no consumer may call `isBlockedEitherWay` per item in a collection. Read paths fetch
the id set **once** and apply `[Op.notIn]`. A reviewer seeing a pairwise check inside an iteration
over posts/comments/messages must reject the PR — that turns a 20-post feed into 21 queries.

`relationshipService` does **not** go into `shared/`. `shared/` is a leaf (ADR 0001's reasoning:
timeline depends on `@exprsn/shared`, so hosting a timeline-backed client there inverts the
dependency). **Therefore no `shared/`-vs-`services/shared/` question arises at all** — and note
for the record that those are one symlinked copy, not two (CLAUDE.md §"Shared code").

### 3. Semantics — block is a **directed row with bidirectional enforcement**; mute is one-way and silent

| | **block** | **mute** |
|---|---|---|
| Row | one directed edge `(actor=A, target=B, type='block')` — **the row is not symmetric** | one directed edge, `type='mute'` |
| Visibility | **bidirectional**: A does not see B's content **and** B does not see A's | **one-way**: A does not see B; B is unaffected |
| Contact | **prevented both ways** (write-time reject: DM, comment, like, repost, follow, mention) | **not** prevented — B may still DM/comment; A simply doesn't see it surfaced |
| Notifications | suppressed both ways | suppressed **to A only** |
| Follows | **broken in both directions** on block (destructive; not restored on unblock) | untouched |
| Discoverable by target? | B learns of it only by *attempting contact* (a 403) — standard and unavoidable. **No endpoint ever tells a user who blocked them.** | **never** — mute is silent by definition |
| Existing content | **not deleted** — suppressed at read time; unblock restores visibility | not deleted |
| Expiry | none | optional `expiresAt` (temporary mute) |

**Existing content on block (explicit, because it is the question that bites):**
- **Posts/comments/likes/reposts already made:** left in the DB, suppressed at read time for both
  parties. Never destroyed — a block is reversible; destruction is not.
- **Engagement counts** (`likeCount` etc.): **not** decremented. Decrementing is expensive, racy,
  and leaks the block to the target (their like count would drop). The *actor* is filtered from the
  likes/reposts **lists** (R13/R14); the count stands.
- **Follow edges:** deleted in both directions. This is the one destructive act, it is standard
  (Twitter/Bluesky), and it does **not** self-restore on unblock.
- **Existing spark conversations:** **frozen, not deleted.** The `Conversation` and its `Message`
  history persist (deleting would destroy the *other* party's data, which we have no right to do);
  new messages between the pair are rejected at S2 and the conversation is suppressed from the
  actor's list (S4). **The blocked party is not removed from a group conversation** — only direct
  (1:1) contact is severed.
- **Shared nexus groups / live rooms:** a block **never** evicts either party. Membership is the
  group admin's domain.

### 4. Enforcement points — read-time suppression at the query, write-time rejection at the mutation

Both, not either. Read-time filtering is the **correctness** guarantee (it survives a stale cache,
a missed fan-out, and content created before the block); write-time rejection is what makes a block
*mean* something (it stops the harassment vector rather than merely hiding it).

**Read-time (suppression) — apply `getSuppressedIds(viewer)` once per request, then `[Op.notIn]`:**
R1–R15 (timeline), plus R16 (Elasticsearch — a `must_not` terms filter, not a `where`), plus
S4/S5 (spark, in the spark slice).

**Write-time (rejection, 403) — `isBlockedEitherWay(actor, target)` before the mutation:**
W1 (like), W2 (comment), W3 (repost), W4 (follow), S1 (create direct conversation), S2 (send
message), S3 (add participant).

**Producer-side notification suppression — three integration points, NOT one (finding 10):**
- **N1a** — the guard at `heraldService.notifyInteraction` (`heraldService.js:167`) covers
  like/comment/reply/repost/**follow**. It does **not** cover mention.
- **N1b** — **mention** is a separate Bull path; the guard MUST also land inside
  `processBatchNotificationJob` (`notificationProcessor.js:75`), dropping recipients whose
  `getSuppressedIds(recipientId)` contains the post author. This executes in the **`worker:timeline`**
  process, so the façade + `UserRelationship` model must be require-able and DB-attached there
  (they are — same timeline schema/pool — but it is a distinct wire-up and a distinct test).
- **N2** — spark's `notifyNewMessage`, extending the existing `!p.muted` filter at
  `socket/index.js:84` (in FEAT-036).
- **N3** — **moderator is not modified.** The notification hub needs no knowledge of the social
  graph and acquires no dependency on it.

Missing N1b is exactly the harassment vector this ADR promises to close (§3, "notifications
suppressed both ways"); a guard only at N1a ships a **silent** mention-notification leak.

**Follow-break on block** is an intra-module `Follow.destroy` on both directions inside
`relationshipService.block()` — no schema change, no cross-module call.

### 5. Security — no new open surface, and no leak of the block itself

- Block/mute routes are **authenticated writes bound to `req.userId`**, exactly as the follow
  routes are (`interactions.js` mounts `requireToken` at `:16`). The actor is **never** taken from
  the body.
- `POST/DELETE/GET /timeline/api/interactions/users/:id/block` (and `/mute`), plus
  `GET /timeline/api/interactions/blocks` and `/mutes` — the list endpoints return **only the
  caller's own outgoing edges**.
- **There must be no endpoint, field, or error message that reveals *who has blocked you*.**
  `getBlockedByIds` is an **internal** façade method used server-side to build the suppression set;
  it must never be projected to a client. A blocked user learns of the block only by attempting
  contact and receiving a 403. Reviewers: an endpoint returning incoming blocks is a harassment
  vector — reject it.
- Self-block/self-mute → `400` (DB `CHECK` is the backstop).
- `DEV_BYPASS`, CORS, the HMAC service-token flow, and the central error handler are **untouched**.
  No new `*_SERVICE_URL` hop is introduced (Decision 2 is in-process, per TASK-009).

### 6. Schema — one new table, in the `timeline` schema, no FK across schemas

New table only. **Zero columns are added to any existing table**, so the documented
sync-`db:migrate` ALTER trap does **not** apply. **The model owns the table, ENUM, and all three
indexes (created by sync); the migration file is CHECK-constraint-only** — hand-writing the
table/enum/indexes in the migration would create duplicate indexes and break sync ordering (see
§DDL). Run the CHECK `up()` manually (timeline's `db:migrate:raw` is `sync({alter:true})` and does
not replay migrations), then `db:check` clean — **but `db:check` does not audit CHECKs**, so verify
`no_self` via `pg_constraint` (§DDL caveat). No FK across schemas. See §DDL.

---

## DDL — **the model owns table+enum+indexes; the migration is CHECK-constraint-only** (dba co-signed 2026-07-13)

> **This section was rewritten per the dba co-sign.** The earlier draft hand-wrote
> `CREATE TYPE`/`CREATE TABLE`/custom-named `CREATE INDEX` **in the migration file**. That is
> **wrong** and the co-sign is contingent on removing it. Two failure modes, spelled out so no one
> re-adds it:
>
> 1. **Duplicate indexes.** Sequelize `sync` reconciles indexes **by name**. If the migration
>    hand-creates `user_relationships_actor_type_idx` etc. and the model also declares those
>    indexes, `sync` sees its own **auto-named** indexes (`user_relationships_actor_id_type`, …) as
>    "missing" and **creates a second copy** — **6 physical indexes for 3 logical ones**, pure
>    write-amplification waste.
> 2. **Ordering breakage.** In the normal bootstrap `sync` runs **first**; a migration whose `up()`
>    then does a bare `CREATE TYPE`/`CREATE TABLE` **errors** ("already exists").
> 3. **`db:check` masks (1).** `db:check` compares indexes **by column-set**, not by name, so it
>    reports **GREEN on the duplicates** and the waste is invisible to the gate.
>
> **Rule:** the **model** is the single source of truth for the table, the ENUM, and all three
> indexes (created by `db:migrate` / Sequelize sync). The **migration file carries ONLY the
> `CHECK`** that `define` cannot express — matching the
> `20260626000000-add-post-content-length-check.js` precedent exactly (a CHECK-only `ALTER TABLE`).

**Model — `services/timeline/src/models/UserRelationship.js`** (factory form mirroring `Follow.js`;
schema inherited from `define.schema:'timeline'` so it **cannot leak to `public`**; **app-side UUID
default — NO db `gen_random_uuid()`**, matching `Follow.js`):

```js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const UserRelationship = sequelize.define('UserRelationship', {
    id:        { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    actorId:   { type: DataTypes.UUID, allowNull: false },   // the blocking/muting user
    targetId:  { type: DataTypes.UUID, allowNull: false },   // the blocked/muted user
    type:      { type: DataTypes.ENUM('block', 'mute'), allowNull: false, defaultValue: 'block' },
    reason:    { type: DataTypes.STRING(280), allowNull: true },  // actor-private; never surfaced to target
    expiresAt: { type: DataTypes.DATE, allowNull: true },         // mute-only (temporary mute); NULL = permanent
  }, {
    tableName: 'user_relationships',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['actorId', 'targetId', 'type'] },  // one edge per (pair, type)
      { fields: ['actorId', 'type'] },    // "who I blocked/muted" — outgoing filter
      { fields: ['targetId', 'type'] },   // "who blocked me" — REQUIRED for the bidirectional block
                                          // filter; NOT redundant with the unique composite (that
                                          // composite is prefixed by actorId and cannot serve a
                                          // targetId-leading lookup)
    ],
  });

  return UserRelationship;
};
```

**Register in `services/timeline/src/models/index.js` next to `Follow`** (both the
`require('./UserRelationship')(sequelize)` line at ~`:38` and the `module.exports` block at
`:129-143`). It inherits `define.schema:'timeline'`, so sync creates it as
`timeline.user_relationships`.

**Migration — `services/timeline/migrations/<ts>-add-user-relationships-no-self-check.js`** — the
**only** thing this file does is add the CHECK (`define` cannot express it); the table, ENUM, and
all three indexes are created by the model via sync:

```js
'use strict';

module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(
      'ALTER TABLE timeline.user_relationships ' +
      'ADD CONSTRAINT user_relationships_no_self CHECK ("actorId" <> "targetId")',
    );
  },
  down: async (queryInterface) => {
    await queryInterface.sequelize.query(
      'ALTER TABLE timeline.user_relationships ' +
      'DROP CONSTRAINT IF EXISTS user_relationships_no_self',
    );
  },
};
```

Schema-qualified `timeline.user_relationships` (the precedent uses a bare name relying on the
injected `search_path`; the dba prefers the explicit qualification here — it is unambiguous and
still lands in the `timeline` schema, so nothing leaks to `public`, STATUS #1).

**Application order (binding — this is the same manual step as `posts_content_maxlen`):**
1. **`npm run db:migrate`** (sync, `scripts/migrate-sync.js`) — creates `timeline.user_relationships`,
   the `enum_user_relationships_type` ENUM, and the **3** indexes, all from the model.
2. **Run the CHECK migration `up()` directly.** Neither default path applies it for timeline:
   `db:migrate` is model-sync (no CHECKs), and **timeline's `db:migrate:raw` is
   `sequelize.sync({ alter:true })`** (`services/timeline/scripts/migrate-postgres.js:19`) — it does
   **NOT** replay migration files. (The precedent file's own comment claiming `db:migrate:raw`
   replays it is generic and **wrong for timeline specifically** — verified.) So the CHECK is a
   deliberate manual `up()`, exactly like `posts_content_maxlen`.
3. **`npm run db:check` exits 0** — no missing table/columns, no index drift (3 model indexes = 3
   physical indexes, no duplicates because the migration creates none), nullability clean
   (`reason`/`expiresAt` nullable in model), and **no FKs** to diverge on (TASK-024 FK-`onDelete`
   gate has nothing to check).

**CAVEAT (record and enforce): `db:check` does NOT audit CHECK constraints.** A green `db:check`
proves the table/enum/indexes/nullability are correct — it does **NOT** prove the `no_self` CHECK
landed. QA/dba must verify the CHECK explicitly:

```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'timeline.user_relationships'::regclass AND contype = 'c';
-- expect: user_relationships_no_self  CHECK (("actorId" <> "targetId"))
```

If that row is absent, step 2 was skipped: self-block/self-mute is only guarded by the app-layer
400 (Decision 5) and the DB backstop is missing.

**No FK to `auth.users`.** `actorId`/`targetId` are bare UUIDs holding auth user ids — the same
convention as `Follow.followerId` (no FK) and the same cross-schema rule ADR 0003 §5 fixed
(`auth.organizations.ca_group_id` is a plain UUID, deliberately not a cross-schema FK). A block is
a *timeline* row referencing an *auth* identity; a hard FK across module schemas would break the
isolation invariant.

The deferred Redis cache (Option c) is dba's to design **when its trigger fires**, not now.

---

## Size

**Umbrella scope (block+mute across timeline AND spark; DM prevention; cross-surface tests) is `L`,
decomposed into two strictly-sequenced `M` tickets.** The C/B's "M achievable" was predicated on a
*feed-only, block-only* slice; the real enforcement inventory is **16 timeline read paths + 4
timeline write paths + an Elasticsearch filter + 3 notification producer integration points (N1a,
N1b-in-worker, N2) + 5 spark hooks**, and this ADR rules that a block which does not stop a DM is
not a block (§3). Neither single M is dishonest; the **whole** feature at one M would be.

**Mandatory decomposition (both `M`; sequence FEAT-011 → FEAT-036):**

- **FEAT-011 (re-scoped to `M`) — the store, the façade, and complete *timeline* enforcement.**
  Table + model (model-owns-creation) + CHECK-only migration; `relationshipService` (all methods in
  §Decision-2, including the **expired-mute filter** contract on `getSuppressedIds`); block/mute
  CRUD routes on the existing interactions router; **R1–R16** read filters (R1–R15 `[Op.notIn]`,
  R16 ES `must_not`); **W1–W4** write rejection; **N1 both producers** — N1a in `notifyInteraction`
  **and N1b inside `processBatchNotificationJob` in the `worker:timeline` process**; follow-break;
  tests (suppression, undo restores, self-block 400, **expired-mute stops suppressing**, no-N+1
  assertion on the feed query count, and a **worker-process mention-suppression** test).
  **This is `M` at the TOP of its range** — the mention-via-worker producer (N1b) was missed in the
  first draft and is a second, cross-process integration point with its own DB-attach and test; do
  not let it be scoped away as "the notification guard" (that would ship the finding-10 leak).
- **FEAT-036 (new, `M`) — MANDATORY sibling: *spark* enforcement.** A block that doesn't stop a DM
  is not a block, so FEAT-011 alone ships a **documented DM gap**. **S1/S2/S3** write-time contact
  rejection (the safety-critical half), **S4/S5** read-time suppression, **N2** notification
  suppression, via a **lazy** in-process `require` of `relationshipService`. Spark's Jest suite will
  need the timeline models mocked (it already mocks `ioredis`/`bull`). *(Ticket filed separately;
  this ADR only records the decomposition and the mandatory sibling relationship.)*

If the PM must ship a single-cycle increment, **FEAT-011 (M) is the increment** — but it ships with
a **known, documented gap** (a blocked user can still DM you) that **must** be closed by FEAT-036
before any public UGC exposure. That gap is the reason FEAT-036 is a mandatory sibling filed now,
not "later".

---

## Consequences

1. **Single source of truth, one authoritative row.** No fan-out, no eventual consistency, no
   "blocked on timeline but not on spark" *by construction* — every module reads the same table
   through the same façade. The C/B's stated top risk is eliminated structurally, not by discipline.
2. **The isolation invariant holds.** Only timeline's code touches timeline's tables; spark/live/
   nexus consume a **published service**, exactly as auth→ca, filevault→cortex, and atproto→
   moderator already do (finding 4). No new HTTP hop, no new HMAC caller, no `shared/` edit.
3. **Moderator is untouched** (finding 5). The notification hub keeps zero knowledge of the social
   graph; suppression happens where the actor is already known. But "the producer" is **three
   integration points, one of them in `worker:timeline`** (finding 10) — the façade must be
   DB-attached in the worker, and the mention path (N1b) is a separate, easily-missed guard.
4. **N+1 is designed out, not tested out.** The façade is set-returning by default and the singular
   check is explicitly reserved for write paths; feed cost is +1 indexed query per request, on the
   same shape the feed already runs for `Follow` (finding 2). The one loop that does call
   `getSuppressedIds` per element — the **mention-recipient filter in the worker (N1b)** — is
   bounded by mentions-per-post (a handful), not the unbounded feed, so it is not the N+1 the
   feed-read binding guards against.
5. **A feed module is now a platform-primitive provider.** Real, named, accepted. The extraction
   trigger is explicit and moves `Follow` *with* `user_relationships` (splitting them would be
   worse than the smell).
6. **The Redis cache is a pure optimization behind a stable interface**, addable later with zero
   consumer churn — which is the concrete payoff of choosing (a)+façade over (b) or (c)-now.
7. **Three known guard-rails ship documented, not silent:** live stream chat (finding 7 — a
   socket-topology change), any future serve-path feed cache (finding 8 — must filter *after* cache
   retrieval), and quote-embed inline hydration (finding 11 — must filter `metadata.quoteOf`'s
   author). All three are recorded; the first is a filed ticket, the other two are latent-until-a-
   future-change guard-rails.
8. **Ownership handoffs.** **dba:** owns the migration mechanics — **model-owns-creation + a
   CHECK-only migration** (§DDL), running the CHECK `up()` manually, and `db:check` clean; and the
   deferred Redis cache when its trigger fires. **The dba's binding caveat: `db:check` does not
   audit CHECK constraints** — a green check does not prove `no_self` landed; verify via
   `pg_constraint` (§DDL). **sr-developer:** FEAT-011 and FEAT-036 (structural, cross-module,
   cache-adjacent, **plus a worker-process integration point** — not a jr `S`). **qa-specialist:**
   enforcement-consistency matrix across R1–R16/W1–W4/**N1a+N1b**/N3 (+S1–S5 in FEAT-036), including
   a **`worker:timeline` mention-suppression** test (N1b) and an **expired-mute-stops-suppressing**
   test; the "unblock restores visibility" case; the **no-information-leak** assertion (nothing
   reveals who blocked the caller); and the explicit **`pg_constraint` CHECK verification** (db:check
   won't). **product-manager:** final scope + the FEAT-011/FEAT-036 sequencing, and the call on
   whether FEAT-011 may ship before FEAT-036 given the documented DM gap. **systems-architect:**
   VERIFY on the façade boundary + no cross-schema read + the CHECK-only migration shape; the live
   socket-topology decision when L1 is groomed. New routes → `API_SURFACE.md` beside `:661-662`; the
   resolved social-safety gap → `STATUS.md`; the façade → `ARCHITECTURE.md` (alongside the
   cortex-façade note).

---

## Rejected alternatives

1. **(b) Per-module block tables with fan-out on write.** Rejected — no single source of truth; a
   lagging/dropped fan-out is a *silent* safety failure; contradicts FEAT-011's own AC; and there is
   **no process boundary to denormalize around** (one gateway, one DB).
2. **(a2) Host in `auth`.** Rejected — a block is a social preference, not a credential; and the
   follow-break would force an **upward** call from auth into timeline (the layering inversion ADR
   0003 §2 forbids) or leave the blocked user visible in the actor's following list.
3. **(a3) Host in `moderator`.** Rejected — moderator is the admin/AI moderation plane; block is
   user-controlled. It would plant a user-facing authenticated CRUD surface in the module whose
   routers are only *this sprint* being auth-gated (BUG-010), and it would manufacture a
   moderator→social-graph dependency that finding 5 shows is otherwise unnecessary.
4. **(a4) A new `relationships`/`social` module now.** Rejected **for now, not forever** — it splits
   the social graph across two schemas (`Follow` stays in timeline), making the follow-break
   cross-module. It becomes correct only when `Follow` moves with it; that is the deferred extraction
   ticket, with a named trigger (a third enforcing module).
5. **(c) Redis blocklist cache in the MVP.** Rejected as premature — the read is one set-returning
   query per request, not per post; adding a cache now buys a microbenchmark and costs an
   invalidation protocol plus a stale-cache safety failure mode. Deferred behind the façade with an
   explicit trigger.
6. **HTTP-with-HMAC (`TIMELINE_SERVICE_URL`) for spark→relationship queries.** Rejected — it would
   add a loopback hop on the hot path that TASK-009 exists to remove, re-encode typed errors through
   the gateway handler, and contradict ADR 0001 / the moderation plan (`moderation-routing-plan.md:89-97`).

---

## Required changes (binding, in priority order)

1. **Storage + contract.** One `timeline.user_relationships` table; **no copies**; **no cross-schema
   SQL**. All non-timeline access goes through `services/timeline/src/services/relationshipService.js`,
   **lazily required** inside the calling function. Not in `shared/`.
2. **Façade API is set-returning first.** `getSuppressedIds(viewerId)` is the read-path primitive;
   `isBlockedEitherWay(a,b)` is **write-path only**. A pairwise check inside an iteration over a
   collection is a review-blocking defect. **`getSuppressedIds` MUST apply the expired-mute filter**
   `type='block' OR (type='mute' AND (expiresAt IS NULL OR expiresAt > now()))` — an expired
   temporary mute must stop suppressing, or `expiresAt` is decorative.
3. **Enforce at BOTH points.** Read-time `[Op.notIn]` on R1–R15 (+ ES `must_not` on R16); write-time
   403 on W1–W4 (and S1–S3 in FEAT-036). Producer-side notification suppression at **N1a
   (`notifyInteraction`) AND N1b (`processBatchNotificationJob`, the `mention` path, in the
   `worker:timeline` process — façade must be DB-attached there)** (+N2 in FEAT-036);
   **moderator (N3) is not modified.** A guard only at N1a ships the finding-10 mention leak.
4. **Semantics per §3.** Block = directed row, bidirectional enforcement, breaks follows both ways,
   prevents contact, does not delete content, freezes (never deletes) existing DMs, never evicts from
   shared groups/rooms. Mute = one-way, silent, no follow-break, no contact prevention, optional
   `expiresAt`. Spark's per-conversation `Participant.muted` is a **different feature** — do not
   conflate.
5. **Schema (dba — model-owns-creation, CHECK-only migration).** The **model** owns the table, the
   ENUM, and all **3** indexes (created by `db:migrate` sync); register it in `models/index.js` next
   to `Follow`. The **migration file carries ONLY** `ALTER TABLE timeline.user_relationships ADD
   CONSTRAINT user_relationships_no_self CHECK ("actorId" <> "targetId")` (precedent:
   `20260626000000-add-post-content-length-check.js`). **Do NOT hand-write CREATE TYPE/TABLE/INDEX
   in the migration** — sync reconciles indexes by name and would create duplicates (6-for-3), and a
   bare CREATE would error when sync ran first (§DDL). Order: (1) `db:migrate` sync creates
   table+enum+3 indexes; (2) run the CHECK `up()` **manually** (timeline's `db:migrate:raw` is
   `sync({alter:true})` and does not replay files); (3) `db:check` exits 0. **CAVEAT: `db:check` does
   not audit CHECKs** — verify `no_self` landed via `SELECT conname, pg_get_constraintdef(oid) FROM
   pg_constraint WHERE conrelid='timeline.user_relationships'::regclass AND contype='c';`. No FK
   across schemas.
6. **Security.** Authenticated writes bound to `req.userId`; list endpoints return the caller's own
   **outgoing** edges only; **no surface anywhere reveals who blocked the caller**; self-block 400.
   No weakening of `DEV_BYPASS`/CORS/error-handler; no new `*_SERVICE_URL` hop.
7. **Follow-on tickets to file (not implicit — the parent agent files these; the ADR records the
   decomposition).**
   - **FEAT-036 — spark block enforcement** (S1–S5 + N2 via the lazy façade), `M`. **MANDATORY
     sibling** — FEAT-011 alone ships a documented DM gap. `ready` once FEAT-011 lands. **Blocks
     public UGC exposure.**
   - **TASK — live stream-chat block enforcement / socket-topology** (L1/L2). `blocked` on an
     **architect call:** `io.to(streamId)` room broadcast cannot per-recipient filter — per-socket
     emit vs. client-side suppression (finding 7 — a socket-topology change).
   - **TASK — extract `Follow` + `user_relationships` into a `social` module.** `deferred`.
     **Revisit trigger:** a **third** module (beyond timeline and spark) needs enforcement.
   - **TASK — Redis blocklist cache** (dba-owned). `deferred`. **Revisit trigger:** per-message
     spark **socket** enforcement, or feed p95 regression >10 ms attributable to the relationship
     query.
   - **Guard-rail note (no ticket):** if a pre-built feed cache is ever put on the serve path, the
     suppression filter must be applied **after** cache retrieval (finding 8). **And:** any inline
     server-hydration of a quoted post (`metadata.quoteOf`) must filter the embedded author through
     `getSuppressedIds(viewer)` (finding 11 — latent today because the SPA re-fetches and hits R9's
     404).

---

## Architect sign-off

**Granted** for: the storage locus (one `timeline.user_relationships` table), the access contract
(in-process, lazily-required `relationshipService` façade — no cross-schema reads, no new HTTP hop),
the block/mute semantics (§3), the **complete enforcement inventory** (§4, R1–R16 / W1–W4 / **N1a +
N1b-in-worker** / N2 / N3-untouched), and the **model-owns-creation + CHECK-only migration** shape
(§DDL). **Size: FEAT-011 = `M` (top of range, per the N1b worker miss); FEAT-036 = `M`, a mandatory
sibling; the umbrella block+mute feature is `L` split across the two.**

**dba co-sign: RECORDED (2026-07-13), contingent on the §DDL migration-mechanics change
(model-owns-creation, CHECK-constraint-only migration, manual `up()`, `pg_constraint` CHECK
verification) — now folded in.** With that folded in, **FEAT-011 is build-ready** and may move
`ready → in-sprint` on the PM's scope call. PM owns the final call on FEAT-011 vs. FEAT-036
sequencing (§Size) and whether FEAT-011 may ship ahead of FEAT-036 given the documented DM gap.
