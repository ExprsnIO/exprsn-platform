# ADR 0004 — UGC moderation routing: timeline + spark onto the FileVault chokepoint pattern

- **Status:** Accepted (APPROVED-WITH-CHANGES) — 2026-07-13. Architect structural sign-off **GIVEN**;
  **dba co-sign RECEIVED**, contingent on the seven corrections now folded into §3–§4 (side tables not
  ALTERs, uniqueness declared once, the partial reconcile index, explicit `field:` maps, the
  schema-qualified spark migration, symmetric FK `onDelete`, and the terminal-state ladder);
  **Rick's two human policy calls SETTLED 2026-07-13** (DM text = report-only, §6; text visibility =
  fail-open behind `MODERATION_HOLD_TEXT_PENDING`, §5). The adversarial judge's blocking findings are
  folded in (the Bluesky webhook content-replacement bypass; the invariant must cover EVERY
  content-byte-ingress site). **No open engineering questions remain** — the only outstanding work is the
  follow-up tickets listed at the foot. TASK-019 is build-ready.
- **Date:** 2026-07-13
- **Deciders:** systems-architect (structural sign-off + the sink/worker contract); dba (the Bull queue +
  the two side tables + the terminal-state ladder — **co-signed**, corrections folded); Rick
  (DM-scanning policy §6 and text-visibility posture §5 — **settled 2026-07-13**); qa-specialist
  (verdict/fail-mode + poison-loop tests).
- **Tickets:** unblocks **FEAT-009** (C/B done — "proceed, sequence first among Tier-1 auto-mod")
  and its implementation ticket **TASK-019** (was `blocked` → now `ready`-eligible once groomed with the
  corrected spark AC, F1).
- **Extends:** ADR 0002 (FileVault image-moderation chokepoint, FEAT-031 — **the proven pattern this
  generalizes**). **Relates:** BUG-006 (authed module sink — no unauthenticated mutation endpoint),
  BUG-010 (`requireService` on moderator ingest), BUG-016 (stale-jobId requeue on edit),
  BUG-018 (content-changed ⇒ re-establish state — the webhook-bypass class), BUG-021 (restore/undelete
  must call the invariant), BUG-022 (content-hash compare-and-set / verdict TOCTOU), TASK-009 (in-process
  direction), TASK-024/BUG-025 (`db:check` drift gate), FEAT-008/016/018/019 (plug into this backbone),
  FEAT-010 (recipient-report DM path), FEAT-036 (spark block — filed follow-up).

---

## Context

Today only `services/atproto` auto-submits UGC into the central engine
(`services/moderator/services/moderationService.js:26` `moderateContent`), and FEAT-031 wired
FileVault **image bytes**. Native **timeline posts** and **spark messages** are never moderated.
FEAT-009 closes that; TASK-019 is its buildable ticket. This ADR resolves every item it was blocked on
— the side-table shape (§2–§3), the Bull queue + worker topology (§4), the fail-open/fail-closed posture
(§5), and the DM-scanning policy (§6) — and folds in three later inputs: the **dba's co-sign
corrections** (§3.1's C1–C6 and §4's terminal-state ladder), the **adversarial judge's blocking
findings** (the Bluesky sync webhook replaces post content OUTSIDE the service layer — BUG-018 class; the
moderation invariant must cover EVERY content-byte-ingress site, not two service methods), and **Rick's
two settled policy calls** (§5 text visibility, §6 DM text). With those folded, TASK-019 is build-ready.

### What FEAT-031 actually built (read this before designing anything else)

The pattern is **not** "add a moderation column and call moderator synchronously". It is:

1. **A module-local side table** — `services/filevault/src/models/FileModeration.js`, table
   `filevault.file_moderation`, 1:1 with `files`, `status ENUM(pending|approved|rejected|failed|skipped)`.
   The model header states the reason in as many words: adding columns to the hot `files` table would
   hit the **sync-`db:migrate` ALTER trap**; a brand-new table syncs cleanly.
2. **One `establishModerationState()` invariant function** (`services/filevault/src/services/imageModerationService.js:151`)
   called by *every* path that writes bytes — initial upload (`fileService.js:80`), group upload
   (`fileService.js:508`), new version (`fileService.js:315`), version restore (`versionService.js:114`).
   It was originally open-coded at the upload site and then violated by the other three (BUG-017,
   BUG-018). **Four call sites, three bugs.** This is the single most important lesson in the whole feature.
3. **A read-gate**, not a delete: `imageModeration.canServe(file, moderation, requesterId)` at
   `fileService.js:127 / :226 / :254`. `approved|skipped` are servable; `pending|rejected|failed` are
   hidden from everyone but the owner.
4. **A separate Bull worker** (`services/filevault/src/worker.js`, `npm run worker:filevault-moderation`)
   draining `filevault-image-moderation` (`src/queues/imageModeration.js`), with `jobId: file:<id>`
   dedupe, exponential backoff, a compare-and-set on `contentHash` so a verdict can't approve bytes
   that changed underneath it, and a **reconciliation sweep** for rows stranded in `pending`
   (`worker.js:164`, TASK-025).
5. **Escalation into moderator, in-process** (`worker.js:129 escalate()` → lazy
   `require('../../moderator/services/moderationService')`), so moderator's rules, review queue and
   audit own the outcome. Never an HTTP self-call.
6. **`skipped` ≠ `pending`.** "The feature is off" (servable — platform behaves as before) is a
   *different state* from "the feature is on but the scorer is unavailable" (held — fail-closed).
   Collapsing them either hides every image on a deployment that never wanted moderation, or silently
   serves unmoderated images on one that did.

### Findings from the code that change the ticket as written

- **F1 — TASK-019's spark hook point is dead code.** TASK-019 says hook
  `services/spark/src/services/messageService.js:14 sendMessage()`. **No route and no socket handler
  calls it** — its only callers are `services/spark/tests/services/messageService.test.js` and the
  barrel `services/spark/src/services/index.js:6`. Hooking it would moderate **nothing**. The real
  message-create sites are enumerated in §2.
- **F2 — the moderator→module action sink already has a caller and zero implementers.**
  `services/moderator/services/moderationActions.js:394` does
  `axios.post(\`${serviceUrl}/api/moderation/action\`, payload)` with a CA service token, resolving
  `*_SERVICE_URL` via a hostname map (`moderationActions.js:431`). **No module implements
  `/api/moderation/action`** (grep: zero route definitions). So today a human reviewer's decision in
  moderator cannot reach the content's owning module. FileVault's enforcement works only because it is
  **local** (the side-table read-gate), not because moderator called it back.
- **F3 — `moderateContent` throws when no AI provider is configured.** atproto guards this explicitly
  (`services/atproto/src/ingest/moderationBridge.js:33 hasAiProvider()` — "we skip cleanly instead"
  or the firehose retry-storms). Any new producer must do the same, or an unconfigured deployment
  parks every post in `pending` forever and the reconcile sweep hammers a dead engine.
- **F4 — spark E2EE is client-driven and universal, not DM-specific.** `web/src/features/messages/send.ts:29`
  (`sendEncryptedMessage`) is the **only** send path the SPA messages UI uses (composer, forward,
  share-to-chat, call cards) and it always emits `encrypted: true`. So *every* message in a
  `Conversation` — `type: 'direct'` **and** `type: 'group'` — arrives with `content = NULL` and only
  `encryptedContent` server-side (`Message` model `beforeValidate` hook nulls plaintext).
  The **only** plaintext message path is the nexus group-channel REST route
  (`services/spark/src/routes/groupChannels.js:110`).
- **F5 — spark attachments are NOT encrypted.** `services/spark/src/services/uploadService.js:80-88`
  POSTs the raw buffer to `filevault /api/files/upload` with no encryption marker. **Therefore image
  attachments inside E2EE DMs are already server-visible and already moderated by FEAT-031 today.**
  This materially narrows the DM-policy question (§6) to *text only*.
- **F6 — timeline has THREE content-byte-ingress sites, not one.** `Post.create` at
  `services/timeline/src/services/postService.js:41` (create); `postService.updatePost` starts at `:115`
  and replaces `content` at `:135` (edit) — the FEAT-031 BUG-018 lesson applies verbatim: **content
  changed ⇒ re-establish moderation state**; and a **third, non-service writer**, the Bluesky sync
  webhook (F7). Hooking only the two `postService` methods repeats the FEAT-031 "four call sites, three
  bugs" mistake. Comments (`posts.js:273`) are a *separate* content type and an explicitly named gap
  (§Consequences).
- **F7 — BLOCKING: the Bluesky sync webhook replaces post content OUTSIDE the service layer (BUG-018
  class).** `services/timeline/src/routes/webhooks.js` `record.updated` (lines 112–127) does
  `Post.update({ content: data.value.text, ... }, { where: { id: data.exprsnPostId } })` directly on the
  model — it **never calls `postService.updatePost`**, so any moderation hook placed in the service is
  bypassed. Text edited on Bluesky syncs in and serves under the STALE verdict (or with no moderation row
  at all). The fix (§1): this webhook MUST route its write through the same
  `establishPostModerationState()` invariant, `mode:'reset'`. Verified against the code, not assumed.
- **F8 — inbound Bluesky post-CREATE is already covered, and there is NO restore path today (checked
  invariants).** `record.created` (`webhooks.js:104–110`) does **not** write `timeline.posts` — it only
  logs; the Bluesky service creates the post through `createPost` (covered by the §1 invariant). That is a
  **checked invariant**: inbound Bluesky creates MUST continue to go through `createPost`, never a direct
  `Post.create` in the webhook. `record.deleted` (`webhooks.js:130–142`) is a soft-delete
  (`deleted:true`); **no restore/undelete path exists in timeline or spark today.** If one is ever added
  it MUST call the invariant (**BUG-021 class**) — an un-moderated row must not become servable again by
  way of restore.

---

## Decision

**Generalize the FEAT-031 pattern verbatim — module-local side table + invariant function + read-gate
+ one Bull worker + in-process escalation into moderator.** Reject the "ALTER a moderation column onto
the hot table" shape assumed by TASK-019 note (d) and the FEAT-009 C/B. Reject the "moderator worker
reads/writes other modules' tables" shape (it would break per-schema isolation).

### 1. Chokepoints — where the hook goes, exactly

| Module | Chokepoint (the invariant function's call sites) | Notes |
|---|---|---|
| **filevault** | **DONE (FEAT-031).** `services/filevault/src/services/fileService.js:80` (upload), `:315` (new version), `:508` (group upload); `services/filevault/src/services/versionService.js:114` (restore). Read-gate: `fileService.js:127, :226, :254`. | No change. FEAT-009 adds the **text** lane; the **image/bytes** lane stays on its own queue + worker. |
| **timeline** | **One invariant — `establishPostModerationState(post, { mode })` — called at ALL THREE content-byte-ingress sites** (F6/F7): (1) `postService.js:41` after `Post.create`, `mode:'create'`; (2) `postService.js:135` (`post.update({content...})` in `updatePost`), `mode:'reset'`; (3) **`services/timeline/src/routes/webhooks.js` `record.updated`, lines 112–127** — the Bluesky sync write MUST be re-routed through the invariant, `mode:'reset'` (**F7, BLOCKING** — today it bypasses the service entirely). | Hook the **invariant**, not any single caller — the FEAT-031 four-sites/three-bugs lesson. The invariant PRE-CREATES the side-table row, then enqueues (best-effort, §4.1). **Checked invariants (F8):** inbound Bluesky `record.created` stays on `createPost` (covered) — never a direct `Post.create` in the webhook; there is **no restore/undelete path today** — if one is added it MUST call the invariant (BUG-021). Enqueue **after** `create`/`update` returns, before the broadcast at `posts.js:84`; never awaited into the response. The `approvalService` hold (`posts.js:71-79`) is an orthogonal *policy* gate and stays where it is. |
| **spark** | **One invariant — `establishMessageModerationState(message, { mode })` — called at the FIVE real create sites**, **none** of them the dead `messageService.sendMessage` (F1): `services/spark/src/socket/index.js:306` (`send:message` — primary path, E2EE), `~:538` (`edit:message` — content replaced ⇒ `mode:'reset'`), `services/spark/src/routes/groupChannels.js:110` (nexus group channel — **the only plaintext path**), `services/spark/src/routes/enhanced.js:73` (forward) and `:406` (reply). | **Do not** hook `messageService.js:14` — it is unreachable from any route/socket; wiring it moderates ZERO messages while every test passes. Because there are five sites, spark MUST get one `establishMessageModerationState()` and every site must call it — open-coding is how FEAT-031 got BUG-017/BUG-018. **Prefer first collapsing the five sites onto one `createMessage()` service** (filed S ticket), then a single hook — cheaper and repeat-proof. No restore/undelete path exists in spark today; if one is added it MUST call the invariant (BUG-021). |

**Fix TASK-019's acceptance criterion for spark before it is groomed to `ready`.** As written it
points at dead code and would ship a feature that moderates zero messages while all tests pass.

### 2. Do NOT add moderation columns to `posts` / `messages` / `files` — use side tables

The task framing (and TASK-019 note (d), and FEAT-009's C/B) assumed
"filevault `File` + spark `Message` each need a moderation-state column = an **ALTER on an existing
table**". **That is not what FEAT-031 did and it is not what FEAT-009 should do.**

- FileVault needs **no ALTER at all** — `filevault.file_moderation` already exists and already carries
  the state. Anyone re-reading FEAT-009's C/B should treat the "filevault `File` … ALTER" line as
  superseded.
- Timeline and spark get **new tables**, `timeline.post_moderation` and `spark.message_moderation`,
  1:1 with `posts` / `messages`. **New tables are created cleanly by sync `db:migrate`** — the ALTER
  trap is *structurally avoided*, not "carefully worked around".

Rationale: (a) it dodges the documented trap entirely; (b) moderation churn (status flips, verdict
JSONB, retry counters) stays off the rows every feed page and every message page reads; (c) one
pattern across three modules instead of two divergent ones; (d) `db:check` (now nullability- and
FK-`onDelete`-aware per TASK-024) validates them for free.

Cost accepted: one `LEFT JOIN` (Sequelize `include` with `required:false`) on the feed and message
read paths. At MVP scale, with the indexes in §3, this is the same cost profile FileVault already
accepted on every serve path.

> **⚠ The ALTER trap — read this before choosing the rejected alternative.**
> `npm run db:migrate` (`scripts/migrate-sync.js`) is **sync-based: it CREATES new tables but will
> NOT ALTER an existing one to add a column.** If anyone adds a `moderationStatus` column to the
> `Post` or `Message` **model** and runs `db:migrate`, the model and the DB diverge and **every query
> on that table 500s** until the schema catches up. The only correct procedure is to write a real
> migration and **run its `up()` directly, schema-qualified** (`timeline.posts` / `spark.messages` —
> unqualified names can leak into `public`; STATUS.md #1), then `npm run db:check` (needs PG + Redis
> up) to prove no drift. The design in this ADR **requires none of that.** The exact DDL is given in
> §3.4 anyway, so that if the dba overrules me the procedure is on the record rather than rediscovered
> in production.

### 3. DDL, models, and migration mechanics (dba-co-signed corrections folded in)

All new objects are **new tables** → `npm run db:migrate` creates them; **no ALTER, no `up()` hand-run,
no 500-storm window.** Migration files are still required for the `db:migrate:raw` path. The dba
co-signed the shape **contingent on the six corrections below**, all folded into §3.1/§3.2:

- **C1 — declare uniqueness ONCE.** The 1:1 key (`post_id` / `message_id`) gets a **single unique
  index**; do **not** also mark the column inline `UNIQUE` — a duplicate constraint is exactly what the
  drift gate flags.
- **C2 — the reconcile index is PARTIAL, not `(status)`.** The self-heal sweep only ever queries
  `status='pending'`, so the supporting index is `("updatedAt") WHERE status='pending'`. If `db:check`'s
  column-set matcher trips on the partial `WHERE`, **fall back to a full composite `(status,"updatedAt")`
  — but keep the model definition and the migration byte-identical** so the two paths never diverge.
- **C3 — explicit `field:` maps (timeline + spark are camelCase-by-default, unlike filevault/moderator).**
  Every snake_case column MUST carry an explicit `field:` map: `risk_score`↔`riskScore`,
  `content_hash`↔`contentHash`, `moderation_item_id`↔`moderationItemId`, `conversation_id`↔`conversationId`
  (spark), `last_error`↔`lastError`. **Timestamps stay camelCase** (`"createdAt"`/`"updatedAt"`) to match
  the sibling `posts`/`messages` tables.
- **C4 — spark sets NO searchPath/prependSearchPath (STATUS #1 public-leak risk).** The spark migration
  MUST schema-qualify every identifier (`spark.message_moderation`, `spark.enum_message_moderation_status`)
  or `SET search_path TO spark` at the top, and **object placement MUST be verified after running**
  (`db:check` flags a leak into `public`). Qualify the timeline migration for symmetry.
- **C5 — FK `onDelete: CASCADE` on BOTH sides AND in the migration.** Declare it on the owning
  `belongsTo`, on the mirrored `hasOne`, **and** in the migration `references` block — per the TASK-024
  drift gate and `services/filevault/migrations/20260710000001-fix-file-moderation-fk-cascade.js` (a
  one-sided declaration is exactly what that fix corrected). `moderation_item_id` is a **cross-schema
  value reference only — never a FK**; schemas stay isolated.
- **C6 — legacy backfill = NONE; missing row = servable.** Existing posts/messages have no moderation row
  and get none — **no data migration.** The read-gate and the sink MUST treat a **missing row as
  servable**, the exact filevault rule at
  `services/filevault/src/services/imageModerationService.js:66`. `status` default `'pending'` is safe on
  a **side** table precisely because it only ever lands on rows the worker's invariant explicitly creates
  for NEW content — it can never retroactively hide a pre-existing row (contrast the rejected in-table
  column of §3.4, where a `'pending'` default WOULD hide every old row).

#### 3.1 `timeline.post_moderation` (new)

```sql
CREATE TYPE timeline.enum_post_moderation_status AS ENUM
  ('pending','approved','rejected','failed','skipped');

CREATE TABLE timeline.post_moderation (
  id                  UUID PRIMARY KEY,
  post_id             UUID NOT NULL                 -- C1: NOT inline-UNIQUE; the unique index below owns it
                        REFERENCES timeline.posts(id) ON DELETE CASCADE ON UPDATE CASCADE,   -- C5
  status              timeline.enum_post_moderation_status NOT NULL DEFAULT 'pending',       -- C6: side-table safe
  reason              VARCHAR(64),          -- feature_disabled | no_ai_provider | empty_content
                                            -- | clean | flagged | error
  risk_score          INTEGER,              -- model field: riskScore        (C3)
  action              VARCHAR(32),          -- moderator's action enum, mirrored for local enforcement
  verdict             JSONB,                -- scores/flags/explanation (NO raw content)
  moderation_item_id  UUID,                 -- field: moderationItemId (C3). moderator.moderation_items.id
                                            -- by VALUE only — deliberately NOT a FK; schemas stay isolated (C5)
  content_hash        VARCHAR(64),          -- field: contentHash (C3). sha256 of judged text; compare-and-set (BUG-022)
  provider            VARCHAR(64),
  model               VARCHAR(128),
  attempts            INTEGER NOT NULL DEFAULT 0,
  last_error          TEXT,                 -- field: lastError             (C3)
  "createdAt"         TIMESTAMPTZ NOT NULL,  -- C3: timestamps stay camelCase
  "updatedAt"         TIMESTAMPTZ NOT NULL
);
-- C1: uniqueness declared exactly once (single unique index; no inline UNIQUE on the column)
CREATE UNIQUE INDEX post_moderation_post_id ON timeline.post_moderation (post_id);
-- C2: the reconcile sweep only queries status='pending' → PARTIAL index
--     (fallback if db:check trips on the WHERE: CREATE INDEX ... (status, "updatedAt"); keep model+migration identical)
CREATE INDEX post_moderation_pending
  ON timeline.post_moderation ("updatedAt") WHERE status = 'pending';
```

#### 3.2 `spark.message_moderation` (new)

**The spark migration MUST schema-qualify every identifier (C4)** — spark models set no
searchPath/prependSearchPath, so unqualified names leak into `public` (STATUS #1). Verify placement with
`db:check` after running.

```sql
CREATE TYPE spark.enum_message_moderation_status AS ENUM
  ('pending','approved','rejected','failed','skipped');

CREATE TABLE spark.message_moderation (
  id                  UUID PRIMARY KEY,
  message_id          UUID NOT NULL                 -- C1: NOT inline-UNIQUE
                        REFERENCES spark.messages(id) ON DELETE CASCADE ON UPDATE CASCADE,     -- C5
  conversation_id     UUID NOT NULL,        -- field: conversationId (C3). Denormalized: lets the redact
                                            -- fan-out target the room without re-reading messages
  status              spark.enum_message_moderation_status NOT NULL DEFAULT 'pending',         -- C6
  reason              VARCHAR(64),          -- feature_disabled | no_ai_provider | encrypted
                                            -- | dm_not_scanned | clean | flagged | error
  risk_score          INTEGER,              -- field: riskScore        (C3)
  action              VARCHAR(32),
  verdict             JSONB,
  moderation_item_id  UUID,                 -- field: moderationItemId (C3); by VALUE only, cross-schema, NOT a FK (C5)
  content_hash        VARCHAR(64),          -- field: contentHash (C3); compare-and-set (BUG-022)
  provider            VARCHAR(64),
  model               VARCHAR(128),
  attempts            INTEGER NOT NULL DEFAULT 0,
  last_error          TEXT,                 -- field: lastError        (C3)
  "createdAt"         TIMESTAMPTZ NOT NULL,  -- C3: timestamps stay camelCase
  "updatedAt"         TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX message_moderation_message_id ON spark.message_moderation (message_id);      -- C1
-- C2: partial reconcile index (fallback: (status,"updatedAt") — keep model+migration identical)
CREATE INDEX message_moderation_pending
  ON spark.message_moderation ("updatedAt") WHERE status = 'pending';
CREATE INDEX message_moderation_conv          ON spark.message_moderation (conversation_id);
```

`reason = 'encrypted'` (E2EE ciphertext, unscannable) and `reason = 'dm_not_scanned'` (policy, §6) are
**distinct** and both land on `status = 'skipped'` — i.e. delivered, not held. Keeping them apart means
the DM policy is auditable and reversible without a schema change.

#### 3.3 `filevault.file_moderation`

**No change. Already shipped (FEAT-031).** Do not add columns to `filevault.files`.

#### 3.4 Rejected alternative — the denormalized column (recorded for the dba, not recommended)

If the dba overrules §2 for read-path performance, this is the **only** correct procedure, and it is
an **ALTER on an existing table**:

```sql
-- ⚠ ALTER ON AN EXISTING TABLE. `npm run db:migrate` WILL NOT APPLY THIS.
-- You MUST run the migration's up() directly, schema-qualified, BEFORE the model change is deployed —
-- otherwise every query on posts/messages 500s until the schema catches up.
ALTER TABLE timeline.posts
  ADD COLUMN moderation_status VARCHAR(16) NOT NULL DEFAULT 'skipped';
CREATE INDEX CONCURRENTLY posts_moderation_status ON timeline.posts (moderation_status);

ALTER TABLE spark.messages
  ADD COLUMN moderation_status VARCHAR(16) NOT NULL DEFAULT 'skipped';
CREATE INDEX CONCURRENTLY messages_moderation_status ON spark.messages (moderation_status);
```
Order of operations, non-negotiable: **(1)** run `up()` directly against each module schema →
**(2)** deploy the model change → **(3)** `npm run db:check` clean. Never (2) before (1).
Default MUST be `'skipped'`, never `'pending'` — a `pending` default would retroactively hide every
pre-existing post/message on the deployment that ran the migration.

Also rejected: **stuffing moderation state into `Post.metadata` / `Message.metadata` JSON.** It is
`DataTypes.JSON` (not JSONB) on both models, so it is not usefully indexable; the timeline moderator
webhook already writes `metadata.moderationStatus` (`services/timeline/src/routes/webhooks.js:203`)
and that key is a *display* artifact, not an enforcement surface. Enforcement must not depend on
read-modify-write of a shared JSON blob that `approvalService` also writes (the BUG-006 clobber shape).

### 4. Queue + worker topology

**One new Bull queue, `moderate-ugc`, on the shared Redis. One new worker process,
`npm run worker:moderation` → `services/moderator/src/worker.js`.** FileVault's existing
`filevault-image-moderation` queue + `worker:filevault-moderation` **stay as they are** — that lane
needs the file bytes and the cortex vision model; it is shipped, QA'd, and has its own retry and
reconcile semantics. Two queues, two clearly-different jobs (image bytes vs. text UGC). Do not churn
a working safety control to satisfy a symmetry argument.

```
producers (in the GATEWAY process — the establish{Post,Message}ModerationState invariant, §4.1;
           best-effort, NEVER awaited into the response):
  timeline  establishPostModerationState     (postService create/edit + webhooks record.updated)  ─┐
  spark     establishMessageModerationState  (5 sites, or one createMessage())                     │
                                                                                                   │
  each invariant, right after the content row is written:                                          │
    (1) PRE-CREATE the side-table row (status='pending')  ── best-effort; row existence, NOT the   ├─►
        queue job, is what guarantees the reconcile sweep can find stranded content (§4.1)          │
    (2) THEN enqueueModeration({ sourceService, contentType, contentId, userId,                     │
        contentText, contentHash })                                                                 │
        jobId: `${sourceService}:${contentType}:${contentId}`                                       ┘
                          ▼
        Bull queue  moderate-ugc   (shared Redis, db 0 — same instance as every other Bull queue)
                          ▼
  worker:moderation  (services/moderator/src/worker.js — SEPARATE process, never the gateway)
     TERMINAL-STATE LADDER — this lane MUST do what FileVault's worker does NOT (§4.2):
        0. GUARD FIRST: no AI provider configured → status='skipped', reason='no_ai_provider',
           complete. NEVER enter the retry loop (F3 — else the sweep hammers a dead engine forever).
        1. moderationService.moderateContent({...})   ← IN-PROCESS require, not HTTP (TASK-009)
        2. content_hash COMPARE-AND-SET (BUG-022): if the row's hash changed under us, DISCARD this
           verdict — the content was edited mid-flight and a fresh job is already queued.
        3. resolve the sink for sourceService and applyVerdict into ONLY that module's schema:
              sinks['timeline'] → services/timeline/src/services/moderationSink.js
              sinks['spark']    → services/spark/src/services/moderationSink.js
        4. TRANSIENT error → status stays 'pending', attempts+1, THROW (Bull retries, backoff 30s).
        5. attempts EXHAUSTED → write status='failed' (fail-CLOSED — NEVER 'approved') BEFORE the
           terminal throw, so the row is terminal and the poison loop stops; it becomes a DLQ item.
        6. reconcile sweep (interval): re-enqueue ONLY rows with status='pending' past a grace window.
           'failed'/'skipped'/'approved'/'rejected' are terminal — the sweep never touches them.
```

#### 4.1 The pre-create invariant closes the enqueue-lost gap (dba correction)

Producers are **not transactional** — the content row is committed by the module, and the moderation
enqueue is a separate best-effort call. A Redis blip at produce-time would therefore leave freshly
created content with **no queue job AND no moderation row** — invisible to the reconcile sweep, which
scans rows, and so **unmoderated forever**. The invariant closes this: `establishPostModerationState` /
`establishMessageModerationState` **PRE-CREATE the side-table row (`status='pending'`) FIRST**, right
after the content row, and **THEN** enqueue. **Row existence — not the queue job — is what guarantees
reconcile can find the content.** If the enqueue itself fails, the row still exists in `pending` and the
sweep (§4.2 step 6) picks it up on the next interval. The pre-create is best-effort and **not awaited
into the response** (fail-open write path, §5a), but a pre-create failure is logged so a persistent Redis
outage is visible. This is the same "the row is the source of truth, the job is just a fast path"
discipline FileVault's `establishModerationState()` uses.

#### 4.2 The terminal-state ladder stops the poison loop (dba correction — the FileVault gap this lane closes)

FileVault's worker retries on error but has no explicit terminal-failure write, so a permanently
unavailable scorer can leave a row cycling. **This lane must not.** The order is non-negotiable:

1. **Guard FIRST.** If no AI provider is configured (`hasAiProvider()` false — F3), write
   `status='skipped'`, `reason='no_ai_provider'`, and **complete** — never enter the retry loop. Skipping
   the guard is what makes the reconcile sweep hammer a dead engine and turns "no AI configured" into an
   outage.
2. **Transient error** (scorer timeout/5xx, network) → leave `status='pending'`, `attempts+1`, and
   **throw** so Bull retries with exponential backoff.
3. **Attempts EXHAUSTED** → write `status='failed'` (**fail-CLOSED — NEVER `'approved'`**, §5c) **BEFORE**
   the terminal throw, so the row lands in a terminal state and is not re-swept. It surfaces as a DLQ item
   (`removeOnFail: {age:86400}`) an admin reviews.
4. **Reconcile sweep** re-enqueues **ONLY `status='pending'`** rows older than the grace window;
   `failed`/`skipped`/`approved`/`rejected` are terminal and never re-swept. This is precisely what stops
   the poison loop: without the terminal `failed` write, an item that can never be scored would re-enqueue
   forever.

**Why Bull/Redis and not RabbitMQ.** The shared helper `@exprsn/shared/utils/rabbit` exists and
moderator's `queueRegistry` already uses it — but that is for **fanning verdicts out to moderation
queue buckets downstream**, a different job. Publishing UGC must not acquire a hard dependency on a
broker the platform does not otherwise require to be up; **Redis is already a hard startup
prerequisite** (`npm start` fails without it) and **every worker in the repo is Bull**
(`worker:timeline`, `worker:prefetch`, `worker:atproto`, `worker:live`, `worker:cortex`,
`worker:filevault-moderation`). Bull also gives, for free, the three things this design needs:
`jobId` dedupe (idempotency), exponential backoff retries, and a persistent failed-set that serves as
the DLQ. RabbitMQ buys ordering and cross-process fanout that this lane does not need.

**Job options** (mirroring `services/filevault/src/queues/imageModeration.js:40`):
`attempts: 4`, `backoff: { type:'exponential', delay: 30000 }`, `removeOnComplete: {age:3600,count:1000}`,
`removeOnFail: {age:86400}` (**the DLQ window** — a `failed` job stays visible to an admin for 24h),
`jobId: '<service>:<type>:<id>'`. **Re-moderation after an edit MUST `getJob(jobId).remove()` first**
(`mode:'reset'`) — Bull silently no-ops `add()` on an existing jobId while the key lives, so an edit would
otherwise reuse the stale job and re-apply the old verdict (**BUG-016**; `requeueImageModeration` at
`imageModeration.js:89` is the reference). Note this is distinct from the content-hash compare-and-set
(BUG-022, §4.2 step 2): BUG-016 prevents a stale *job*, BUG-022 prevents a stale *verdict* landing on
changed bytes; the design needs **both**.

**Idempotency** is already in moderator: `moderateContent` dedupes on
`(sourceService, contentType, contentId)` (`moderationService.js:60`) and returns the existing row. At-least-once
delivery is therefore safe. `sourceService` discriminators: `timeline` / `spark` / `filevault`
(distinct from atproto's `bluesky`). `contentType` must be a value in the `ModerationCase` enum —
`'post'` and `'message'` both are (`services/moderator/models/ModerationCase.js:20-23`); an invalid
value throws inside the dedupe query (the silent-failure shape of BUG-015), so **assert, don't assume**.

**The sink contract is the new inter-module surface, and it is the thing I am signing.** A sink is a
module-published in-process function — `applyVerdict({ contentId, contentType, status, action, verdict,
riskScore, moderationItemId, contentHash })` — that writes **only its own schema** and performs its own
enforcement (timeline: `visibility → 'private'` + socket retraction; spark: content redaction + a
`message:redacted` emit on `/spark`). The moderation worker resolves it from a small registry keyed by
`sourceService`. **Moderator's worker MUST NOT read or write `timeline.posts` / `spark.messages`
directly** — that would break the one-schema-per-module invariant, which is not negotiable.

This is a lazy **downward** require from a worker process into a module's *service* layer (never its
models), acyclic, and exactly the seam FileVault's worker already uses in the other direction
(`services/filevault/src/worker.js:133`). It is the same accepted-deviation shape as ADR-0003 RC-1/RC-5;
if the require graph gets uncomfortable, the escape hatch already exists and is already *called*:
`moderationActions.js:394` POSTs to `${serviceUrl}/api/moderation/action` with a CA service token, but
**no module implements that route today** (grep: zero definitions — F2), so a human reviewer's decision
in moderator currently reaches nothing. **The sink MUST implement `POST /<module>/api/moderation/action`
for filevault + timeline + spark** — that both provides the documented out-of-process fallback and closes
the loop `moderationActions.js:394` has been posting into a void. **Both the in-process sink and that
HTTP endpoint ship WITH `authenticateService` (`shared/middleware/auth.js:221`) from day one — not
"after".** Shipping an unauthenticated mutation endpoint is exactly **BUG-006**, and it will not pass my
VERIFY. (Filed as a required ticket at the foot.)

### 5. Fail-open vs fail-closed — argued, then decided

**The question is not one question.** There are three independent failure surfaces and collapsing them
is how you get a control that is either useless or product-breaking.

**(a) The write path** (does the create request fail if moderation is unavailable?)
*Fail-closed* would mean a Redis blip or an LLM timeout makes users unable to post or chat. That trades
a safety improvement for an availability regression on the core interaction, and it is a self-inflicted
DoS: anything that can knock over the moderator knocks over the whole product.
→ **FAIL-OPEN. Decided.** Submission is fire-and-forget, `.catch()`-wrapped, never awaited into the
response, and can never throw a 500 into a user write. This is not a concession; it is the same posture
`approvalService` (`posts.js:79`) and the plugin hook bus (`posts.js:91-99`) already take.

**(b) Visibility** (is content visible to *others* while the verdict is outstanding?)
*Fail-closed-pending* is what FEAT-031 chose for images, and it is right there: an image is a
high-severity, hard-to-unsee payload, uploads are not latency-sensitive to third parties, and holding
one costs nobody anything. **Text is different.** A post or a chat message that appears seconds-to-
minutes after you send it is a broken product — and worse, in the **common configuration where no AI
provider is set** (`hasAiProvider()` false — F3), *every* post and *every* message would be invisible
forever. A safety control whose default configuration makes the product appear broken will be turned
off, and then you have no control at all.
→ **FAIL-OPEN on visibility for TEXT (timeline posts, spark messages): publish/deliver immediately,
`status='pending'`, retract on a later reject verdict. DECIDED by Rick, 2026-07-13.** **FAIL-CLOSED on
visibility for IMAGES: unchanged from FEAT-031.** The text posture is gated behind
`MODERATION_HOLD_TEXT_PENDING` (default `false`) so a deployment that wants fail-closed text can flip to
it without a code change — but the default is fail-open, deliberately. Rick's rationale, recorded: the
default no-AI-provider config **throws for every item** (F3/§4.2 guard), so a fail-closed default would
hide **every** post and message forever and the control would simply be switched off. Fail-open text +
retract-on-reject is the posture that survives the default config.

**(c) The verdict path** (what happens when the scorer errors?)
This is where fail-open is genuinely dangerous, and it is the one the FEAT-009 C/B correctly flagged:
*"fail-open without a committed backfill sweep makes 'moderated' hollow."*
→ **FAIL-CLOSED. Decided, and non-negotiable — and it holds regardless of Rick's fail-open call on
visibility, because visibility and verdict are different surfaces.** A moderation failure may **never**
produce `status='approved'`. Per the terminal-state ladder (§4.2): a transient error stays `pending` +
Bull retry with backoff; `attempts` exhaustion writes `failed` (**not `approved`**) *before* the terminal
throw, so the row is terminal and surfaces as a DLQ item an admin sees. Only a real verdict may write
`approved`. And **the backfill sweep ships with the feature, not after it** — the same
`reconcileStuckPending()` loop FileVault's worker already runs (`worker.js:164`), re-queueing **only
`pending`** rows older than a grace window (§4.2 step 6). Without it, "fail-open" degrades into
"permanently unmoderated", and TASK-019's open item (c) stays open forever.

**Summary of the decision:**

| Surface | Posture | Why |
|---|---|---|
| Write/create request | **fail-OPEN** | moderation outage must not take down posting/chat |
| Visibility — timeline post, spark message (text) | **fail-OPEN** (publish, then retract) | holding text breaks the product, and breaks it *hardest* in the default no-AI-provider config |
| Visibility — filevault image bytes | **fail-CLOSED** (hold pending) | unchanged from FEAT-031; high-severity payload, no latency cost to third parties |
| Verdict on scorer error | **fail-CLOSED** (`pending`→retry→`failed`, never `approved`) | the only place fail-open is actually unsafe |
| Backfill sweep | **ships with the feature** | fail-open is only honest if every `pending` row is guaranteed to eventually get a verdict |

`skipped` is a **first-class, servable** state (feature off / no AI provider / not scannable), kept
strictly distinct from `pending`. Copy FileModeration's status semantics exactly
(`services/filevault/src/models/FileModeration.js:43-62`) — that distinction is the single most
load-bearing thing FEAT-031 got right.

### 6. DM-scanning policy — DECIDED (Rick, 2026-07-13): report-only for E2EE DM text

**Rick signed this off on 2026-07-13.** The technical ground truth below is what forced the shape; the
decision is now **final** and TASK-019 is no longer gated on it. **E2EE DM *text* is report-only** —
never proactively fed to a model; it enters moderation only via a recipient's report. The engineering
consequences (explicit skip, the `dm_not_scanned` reason pre-provisioned so a future flip needs no
migration, the reporter-asserted-plaintext handling) are all captured below.

**What is technically NOT scannable — this is a hard constraint, not a preference.**
`Message.content` is `NULL` for `encrypted = true` (the model's `beforeValidate` hook nulls it). The
server holds only `encryptedContent` (ciphertext), `senderKeyFingerprint`, and per-recipient wrapped
keys. **The server never holds a decryption key.** Per F4, the SPA's *only* send path
(`web/src/features/messages/send.ts:29`) always sets `encrypted: true` — so this covers **every**
message in a `Conversation`, `type: 'direct'` *and* `type: 'group'`. There is no server-side plaintext
to scan. Any proactive DM text scanning therefore requires **breaking E2EE** — key escrow or
server-side decryption — or **client-side scanning before encryption**. Those are not features; they
are a change of the platform's fundamental privacy posture.

**What IS scannable today, at no privacy cost:**
1. **Nexus group-channel messages** (`services/spark/src/routes/groupChannels.js:110`) — plaintext by
   construction, a genuinely public-ish surface, and the natural proactive-scanning target.
2. **Attachments in ANY conversation — including E2EE DMs.** Per F5, spark ships attachment bytes to
   FileVault **unencrypted** (`uploadService.js:80-88`), so **image attachments in E2EE DMs are already
   server-visible and are already moderated by FEAT-031 today.** This is the single most important fact
   for anyone weighing the DM question: **the highest-severity vector (imagery) is already covered.**
   It also means FEAT-008 (CSAM) reaches DM imagery without touching E2EE at all.
3. Metadata: sender, recipients, timestamps, attachment pointers, message volume.

**DECISION — report-only for E2EE DM *text* (Rick, 2026-07-13). Binding:**
- Do **not** submit `encrypted = true` messages to `moderateContent`. Skip them **explicitly**
  (`status='skipped'`, `reason='encrypted'`), never "discover" it by feeding ciphertext to an LLM —
  the FEAT-026 precedent, and the same explicit-skip discipline as
  `imageModerationService.isEncrypted()` (`imageModerationService.js:57`). **Never feed E2EE DM
  ciphertext to a model, full stop.**
- A DM enters moderation **only** when a **recipient reports it** (FEAT-010). The recipient legitimately
  holds the key, so their client can attach the decrypted plaintext to the `Report`. E2EE is preserved:
  the server learns the content only because a party to the conversation chose to disclose it.
  **Caveat, binding:** reporter-supplied plaintext is **unverifiable** — a malicious reporter can
  fabricate it. The `Report` MUST store the **ciphertext alongside the reporter-asserted plaintext**, and
  the review UI MUST label it *"reporter-asserted"*, not as ground truth. That is an acceptance criterion
  on FEAT-010 (filed at the foot).
- **DM attachments are already covered.** Per F5, spark ships attachment bytes to FileVault
  **unencrypted**, so image attachments inside E2EE DMs are **already server-visible and already
  moderated by FEAT-031** — the highest-severity vector needs nothing new here.
- **Proactively scan:** nexus group channels (plaintext text) + all attachments (already, via FileVault).
- **Pre-provisioned for a future flip:** `reason='dm_not_scanned'` already exists in the §3.2 schema
  (distinct from `'encrypted'`), so if policy ever changes to scan a plaintext DM mode, no migration is
  needed — only a code change at the skip site.
- **Do NOT build** (and reject any ticket that proposes it without a fresh ADR + a human privacy call):
  key escrow, server-side decryption, or client-side scanning of DMs.

**What would reopen this decision** (the revisit triggers, so it is not a forever-answer):
(a) the platform takes on a legal obligation to proactively detect DM content — note FEAT-008 already
covers DM *imagery* via FileVault, which is the vector that actually carries mandatory-reporting duty;
(b) product decides DM text is not really private (in which case: stop encrypting it, and say so in the
UI — do not keep the padlock and read the messages anyway); (c) a plaintext DM mode is introduced, in
which case those messages fall under the group-channel rule automatically and no new decision is needed.

**SETTLED (Rick, 2026-07-13). TASK-019 is unblocked on this axis.** Because `reason='dm_not_scanned'`
already exists in the §3.2 schema, any future policy flip is a code change at the skip site, not a
migration.

---

## Consequences

1. **No ALTER on any existing table.** Three new tables (one already shipped), all created cleanly by
   sync `db:migrate`. The documented trap is structurally avoided, not carefully tiptoed around. `db:check`
   validates all three (incl. the FK `onDelete` on both sides and the nullability checks TASK-024 added);
   the six dba corrections (C1–C6) are folded into §3 — uniqueness declared once, the partial reconcile
   index (with its full-composite fallback), explicit `field:` maps, the schema-qualified spark migration,
   symmetric FK cascade, and "missing row = servable" with no data migration.
2. **Per-schema isolation holds.** The moderation worker never touches another module's tables; verdicts
   land through module-published sinks (each writing ONLY its own schema). The alternative (a moderator
   worker with write access to `timeline.posts` / `spark.messages`) is rejected outright.
3. **Fail-open is bounded, not hollow.** Every `pending` row is guaranteed to reach a verdict via the
   terminal-state ladder (§4.2) — guard-first for no-AI-provider, Bull retries with backoff, a terminal
   `failed` write on exhaustion (never `approved`), and a reconcile sweep that re-enqueues **only**
   `pending`. This stops the poison loop and closes TASK-019 open item (c).
4. **The enqueue-lost gap is closed by the pre-create invariant (§4.1).** Because the invariant writes the
   side-table row BEFORE it enqueues, a Redis blip at produce-time can never leave content with no
   moderation row — the reconcile sweep always has a row to find. Row existence, not the queue job, is the
   source of truth.
5. **Every content-byte-ingress site is covered — including the Bluesky sync webhook (F7, BUG-018
   class).** The invariant is called at all three timeline sites (create, edit, `record.updated` webhook)
   and all five spark sites, not at one caller of the write. `record.created` is a checked invariant
   (must stay on `createPost`); a future restore/undelete path MUST call the invariant (BUG-021).
6. **Two safety controls, honestly scoped:** images fail-closed on visibility (FEAT-031, unchanged); text
   fails **open** on visibility (Rick, 2026-07-13; behind `MODERATION_HOLD_TEXT_PENDING`) and **closed** on
   verdict. Neither can ever auto-`approve` on error. BUG-016 (stale-job on edit) and BUG-022 (stale-verdict
   on changed bytes) are both handled and are distinct mechanisms.
7. **E2EE is preserved by construction, and the DM policy is settled.** Encrypted messages are explicitly
   skipped (`reason='encrypted'`), never fed to a model. The DM posture is **report-only** (Rick,
   2026-07-13) — no crypto change, no key escrow; `reason='dm_not_scanned'` is pre-provisioned so a future
   flip needs no migration. Reporter-asserted plaintext is stored with the ciphertext and labelled as such.
8. **TASK-019's spark AC is wrong and must be corrected before grooming** (F1) — as written it hooks dead
   code (`messageService.sendMessage`) and would ship a green test suite that moderates zero messages. The
   corrected AC targets the five real sites (or one `createMessage()`).
9. **Named gaps (file them, don't imply them):** timeline **comments** (`posts.js:273`) are UGC and are
   *not* covered by this slice; spark **reactions** are not; the moderator→module HTTP action sink
   (`/api/moderation/action`) is implemented BY this feature (was unimplemented — F2), closing the
   human-reviewer-decision loop the sink ticket covers; `Post.metadata` / `Message.metadata` are `JSON`
   not `JSONB` and are unsuitable for enforcement state.

## Sign-off gates (all closed — recorded for the audit trail)

| # | Gate | Owner | Status |
|---|---|---|---|
| 1 | Structural shape: side tables, sink contract, in-process worker, no cross-schema writes | systems-architect | **GIVEN** (this ADR) |
| 2 | `moderate-ugc` Bull queue + the two side tables + indexes + FK `onDelete` + terminal-state ladder | **dba** | **CO-SIGNED** — contingent on corrections C1–C6 + the ladder, now folded into §3/§4 |
| 3 | DM-scanning policy (§6) — report-only for E2EE DM text | **Rick (HUMAN)** | **SETTLED** 2026-07-13 |
| 4 | Publish-visibility posture for text (fail-open + retract, behind `MODERATION_HOLD_TEXT_PENDING`) | **Rick (HUMAN)** | **SETTLED** 2026-07-13 |
| 5 | Correct TASK-019's spark acceptance criterion (F1 — it points at dead code) | product-manager (grooming) | **ACTION** — recorded here; the PM applies it at grooming (not an engineering question) |

**No open engineering questions remain.** Gate 5 is a grooming action for the product-manager (swap the
dead `messageService.sendMessage` AC for the five real sites / one `createMessage()`), not a design
question — the ADR records the correct target. TASK-019 is build-ready.

## Tickets this ADR requires (file before/with TASK-019)

**Required for the slice:**
- **TASK-0xx** — spark: collapse the 5 message-create sites onto one `createMessage()` service before
  hooking moderation (S; prevents the FEAT-031 BUG-017/BUG-018 repeat).
- **TASK-0xx** — implement `POST /<module>/api/moderation/action` with `authenticateService` for
  filevault + timeline + spark, closing the loop `moderationActions.js:394` already calls into a void
  (M; also lets a human reviewer's decision reach FileVault, which today it cannot — BUG-006 authed).
- **TASK-0xx** — timeline comments (`posts.js:273`) + spark reactions moderation coverage (M; named gap,
  §Consequences 9).
- **FEAT-010 AC amendment** — reporter-asserted DM plaintext must be stored alongside the ciphertext and
  labelled as *reporter-asserted*, never as verified ground truth (§6).

**Follow-up tickets (out of scope for this ADR — file for the backlog, not blockers):**
- **TASK-0xx — live-chat socket-topology change.** `/live` chat is ephemeral and single-gateway; routing
  its messages through the same moderation invariant needs a socket-topology change and is a separate
  design (out of scope here; the UGC backbone this ADR builds is the substrate it will plug into).
- **TASK-0xx — social-module extraction.** timeline and spark now carry the *same* side-table + invariant
  + read-gate + sink pattern (a third copy after filevault); a future extraction of the shared moderation
  scaffolding into one `@exprsn/shared`-published helper (or a small social module) would collapse the
  three copies — deferred until the pattern has stabilized across all three.
- **TASK-0xx — Redis moderation-state cache.** §2 accepts one `LEFT JOIN` per feed/message read at MVP
  scale; if the join becomes a hot-path cost, a Redis cache of `(contentId → status)` fronting the
  read-gate is the optimization (deferred; measure first).
- **FEAT-036 — spark block.** User-level block in spark is moderation-adjacent (a self-serve enforcement
  lever complementing this automated lane); filed separately, not gated by this ADR.

## Rejected alternatives (preserved)

1. **ALTER a `moderation_status` column onto `timeline.posts` / `spark.messages` / `filevault.files`**
   (the shape TASK-019 note (d) and the FEAT-009 C/B assumed). Rejected: it hits the sync-`db:migrate`
   ALTER trap (every query 500s until the schema catches up), pushes moderation churn onto the hot rows
   every feed/message page reads, and a `'pending'` default would retroactively hide every pre-existing
   post/message. The exact (only-correct) procedure is recorded in §3.4 for the dba, not recommended.
2. **A moderator worker that reads/writes `timeline.posts` / `spark.messages` directly.** Rejected: it
   breaks the one-schema-per-module isolation invariant. Verdicts land through module-published sinks that
   each write only their own schema.
3. **RabbitMQ for the UGC lane** (instead of Bull/Redis). Rejected: it would acquire a hard broker
   dependency the platform does not otherwise require to be up, while Redis is already a hard startup
   prerequisite and every worker in the repo is Bull. Bull gives `jobId` dedupe, backoff, and a failed-set
   DLQ for free; RabbitMQ's ordering/fanout are not needed here. (`@exprsn/shared/utils/rabbit` stays for
   moderator's downstream queue-bucket fanout — a different job.)
4. **Stuffing moderation state into `Post.metadata` / `Message.metadata` JSON.** Rejected: both are
   `DataTypes.JSON` (not JSONB), so not usefully indexable, and enforcement must not depend on
   read-modify-write of a shared blob that `approvalService` / the moderator display webhook also write
   (the BUG-006 clobber shape).
5. **Proactive E2EE DM text scanning (key escrow / server-side decryption / client-side pre-encryption
   scanning).** Rejected by Rick (2026-07-13, §6): it changes the platform's fundamental privacy posture.
   DM text is report-only; the highest-severity vector (imagery) is already covered via unencrypted
   FileVault attachments.
