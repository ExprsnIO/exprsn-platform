# FEAT-070 — Spark block enforcement (block/mute for messaging) — Cost/Benefit assessment

_Analyst: cost-benefit-analyzer · Date: 2026-07-27 · Ticket: `sprints/BACKLOG.md` §FEAT-070 (status backlog, P1, sized M) · For grooming into sprint 2026-11._

## What this actually is

FEAT-070 is the ticket formerly specified as **FEAT-036** inside the accepted FEAT-011 ADR
(`sprints/feat-011-blockmute-adr.md`, §Size): the **mandatory sibling** of the already-shipped
FEAT-011 block/mute. All of the expensive decisions are already made and paid for:

- **Store + façade exist and are live.** `timeline.user_relationships` + `services/timeline/src/services/relationshipService.js` shipped with FEAT-011; the façade already exports the exact methods this ticket needs — `canContact()` (line 150, the spark alias the ADR reserved for this work), `isBlockedEitherWay()` (129), `getSuppressedIds()` (50). Verified in the repo.
- **The access pattern is pre-approved.** Lazy in-process `require` of the published façade — the ADR (Decision 2) and ADR 0003 rail explicitly bless it; no new `*_SERVICE_URL` hop, no HMAC caller, no `shared/` edit, no cross-schema SQL.
- **Semantics are pre-decided** (ADR §3): 1:1 contact severed both ways (403); existing conversations **frozen, not deleted**; blocked party **never** removed from group conversations; no endpoint may reveal "who blocked me".
- **Spark today has ZERO enforcement**: `git grep relationshipService|canContact|isBlockedEitherWay -- services/spark` returns nothing. The documented FEAT-011 DM gap is real and open.

## Cost breakdown

**Effort — M (agree with the ticket's pre-size; top half of M, not a hidden L).**
The ADR pre-scoped this sibling at M and the umbrella at L; that decomposition was architect-
signed and dba-co-signed, so the estimate has unusual confidence for a backlog FEAT. One
correction that keeps it at the *top* of M rather than the bottom:

- **The ADR's spark inventory (S1–S5) is stale on message-create sites.** It names
  `messageService.sendMessage` as the send path, but the repo today has **~5 `Message.create`
  sites**: `socket/index.js:307` (the primary live send — `send:message`), `messageService.js:63`,
  `routes/enhanced.js:74` (forward) and `:412` (thread reply), `routes/groupChannels.js:111`
  (group channel — per ADR §3 this one must **NOT** pair-reject; groups are admin's domain).
  So write-time rejection is ~4 guarded sites + 2 conversation-surface sites
  (`routes/conversations.js:22` create, `:232` add-participant), not 3.
- Remaining scope per ADR: S4/S5 read-time suppression (conversation list + message history via
  one `getSuppressedIds` set per request), N2 notification suppression (extend the existing
  `!p.muted` filter at `socket/index.js:84`), SPA affordances (403 handling + block/mute entry
  points reusing the FEAT-011 UI), and tests (spark's Jest already mocks `ioredis`/`bull`; the
  timeline façade/models need mocking — a known, planned test cost, not a surprise).
- Recommend a single spark-side helper (e.g. `assertCanContact(senderId, conversation)`) that
  resolves the 1:1 counterpart and lazy-requires the façade once, so the ~6 guard sites are one
  audited function, not six copies. Cheap insurance against enforcement-site drift.

**Complexity / risk — MODERATE, and it is enumeration risk, not design risk.**
- **E2EE is a non-issue for cost**: enforcement is plaintext-metadata level (senderId,
  participant rows) — zero crypto changes. The one E2EE consequence is *policy*, already settled
  (FEAT-009: DM content is report-only; blocking is exactly the user-side complement).
- **Edge cases to spec in AC** (cheap individually, easy to miss collectively):
  (a) *forward/reply routes* — same guard as send; (b) *group conversations* — skip pair
  rejection, keep mute-based read suppression only; (c) *typing/presence leakage* —
  `typing:start` (`socket/index.js:386`) still broadcasts to the conversation room; in a frozen
  1:1 the blocker would see the blocked user "typing" (at a message that will 403). One-line gate
  or an explicitly documented residual — PM's call, either is fine; (d) *calls-from-chat* —
  call setup rides `live`, not spark; out of scope here, sibling of TASK-034 (note on ticket so
  it isn't assumed covered).
- **Per-send pairwise check** = +1 indexed query per direct-message send. Fine at current scale;
  it brushes the TASK-036 Redis-cache revisit trigger ("per-message spark socket enforcement"),
  so flag **dba** to watch send-path latency — the cache drops in behind the façade with zero
  consumer churn if needed. Do NOT build the cache now.

**Ongoing / infra cost — near zero.** No new module, schema, table, column, migration, queue,
worker, or endpoint surface (403s on existing routes; block/mute CRUD already lives in timeline).
No ALTER trap. The one durable cost is the accepted, named timeline→spark in-process coupling
(ADR Consequence 5) — already on the books with an extraction trigger (TASK-035, fires only when
a *third* module enforces; spark is the second, so no trigger).

**Security invariants — strengthened, not touched.** Fail-closed 403 on contact; nothing may
reveal who blocked whom (reuse the ADR's no-leak rule in QA's matrix); DEV_BYPASS/CORS/HMAC/error
handler untouched.

## Value

**HIGH — this is the highest-value-per-unit-cost safety ticket in the backlog.** Blocking that
does not stop a DM is not blocking; DMs are the primary 1:1 harassment channel, so FEAT-011
without this is a hollow promise on the platform's most sensitive surface. The ADR rules FEAT-011
"ships a documented DM gap until this lands" and makes closing it mandatory **before any public
UGC exposure** — i.e., this is on the go-public critical path, not a nice-to-have. It also
completes the Tier-1 safety triad (FEAT-010 reports + FEAT-011 block/mute + this), and the
marginal cost is low precisely because FEAT-011 already paid the fixed costs.

## Cheaper alternative / smaller first slice

- **Smaller first slice (if 2026-11 capacity is tight): write-time rejection + notification
  suppression only (S1/S2/S3 all-send-sites + N2) — the safety-critical half.** A blocked user
  can no longer reach you or light your bell; their *old* messages remain visible until the
  S4/S5 read-filter fast-follow (a TASK-sized remainder). This preserves ~80% of the safety value
  at ~55–60% of the cost and every line is keep-forever work. If sliced, the ticket's AC line
  "existing threads are filtered on read" moves to the follow-up explicitly — don't let it
  silently drop.
- **Cheaper alternative — rejected: client-side-only hiding** (SPA filters blocked senders from
  render). Near-zero backend cost but it is not enforcement — the DM still lands server-side and
  on any other client, the bell still fires, and it fails the AC and the ADR's §3 semantics.
  A safety boundary enforced only in the client is a false sense of safety; do not take this path.
- **Do-nothing check:** platform is in-house/pre-public today (MVP scope 2026-06-22), so there is
  no *live* harassment exposure this month — which is why "build in 2026-11" is acceptable and
  "someday" is not: the ADR hard-gates public exposure on this ticket.

## Verdict

**BUILD NOW (sprint 2026-11), size M, full ADR scope preferred; the write-side slice is the
approved fallback if capacity forces it.** P1 is correct. Route to **sr-developer** (cross-module
+ socket-path work, per the ADR's explicit "not a jr S"). No architect gate needed — the ADR
already signed the structure; ask **systems-architect** only to VERIFY the façade-boundary rule at
review and to note the calls-from-chat/TASK-034 boundary. **dba**: no schema work; watch-only on
the TASK-036 cache trigger. **qa-specialist**: extend the FEAT-011 enforcement matrix with
S1–S5 + N2 + the no-leak assertion + the group-conversation non-eviction case.

## Decision line (paste-ready)

Cost/Benefit: APPROVED (2026-07-27) — done: build-now for sprint 2026-11, size M (ADR-pre-scoped sibling of shipped FEAT-011; façade `canContact` already published, zero new infra/schema, near-zero ongoing cost, HIGH Tier-1 safety value — closes the documented DM gap gating public exposure). Caveats: ADR's send-site inventory is stale — guard ~5 `Message.create` sites via one `assertCanContact` helper (socket `send:message`, messageService, forward, reply; group-channel exempt per ADR §3); typing-indicator leakage = 1-line gate or documented residual; calls-from-chat is TASK-034's lane, not covered here. Approved fallback slice if capacity-tight: write-rejection + N2 now, S4/S5 read-filter as an explicit follow-up TASK. Full assessment: sprints/assessments/ (from scratchpad feat-070-cb.md).
