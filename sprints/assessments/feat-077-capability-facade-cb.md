# Cost/Benefit — FEAT-077 Capability façade (FEAT-061 Pass 2)

**Assessed:** 2026-07-27 · **Analyst:** cost-benefit-analyzer · **Ticket:** FEAT-077 (P1, M, backlog)
**Surfaces read:** `sprints/BACKLOG.md` FEAT-077/FEAT-047–049/FEAT-070/TASK-055/056 blocks;
`sprints/assessments/inreview-closeout-2026-07-27.md` (FEAT-061 + BUG-027 sections);
`services/filevault/src/services/shareService.js` (310 ln, CA-token-backed ShareLink + file-access mint);
`services/filevault/src/services/fileService.js` (`shareGrantAllows` predicate, Pass 1);
`services/live/src/routes/roomCollab.js` (314 ln, row-backed RoomFile grants + provenance);
`services/filevault/src/routes/share.js`.

---

## 1. Effort — M is honest ONLY under one specific shape; otherwise it's L

The two mechanisms are genuinely different animals, and the ticket's size hinges entirely on
what "reconcile behind one shared mechanism" is allowed to mean:

- **Shape A — interface unification (M, honest, upper-M):** a façade module (lives in
  `services/filevault`, the schema owner) exposing `mint / check / revoke / revokeByResource /
  list` with two backends: (1) ShareLink/CA-token (already a real capability — tokenId,
  permissions, expiresAt, maxUses, isRevoked, CA-side revoke at `shareService.js:262`), and
  (2) RoomFile row-grant, which is already funneled through Pass 1's single predicate
  `shareGrantAllows()` at both download and listing. Under Shape A the façade is mostly
  *moving and naming* code that exists, plus façade-level parity tests and keeping the three
  live routes (`share.js` download, `roomCollab.js` share/download/listing) byte-compatible.
  No schema change, no migration, no backfill. Est. ~3–5 dev-days + architect review +
  QA parity pass. **M.**
- **Shape B — storage unification (L, not M):** migrate RoomFile grants to CA-token-backed
  (mint a token per room share, backfill every existing `room_files` row, dual-read during a
  compat window). Pass 1's own closing note already rejected this as "indirection without
  security" (room access = membership + provenance). Shape B adds a live-schema migration
  (ALTER trap — raw `up()` required, dba coordination), a backfill minting thousands of CA
  tokens, and a second cutover risk on top of the AC's compatibility constraint. **L, and low
  marginal security value.**

**Recommendation: the M size stands only with Shape A written into the AC as an explicit
non-goal ("no RoomFile→token storage migration; row-backed room grants remain a first-class
backend"). systems-architect must lock this shape at sign-off *before* build start — if the
architect wants Shape B, re-size to L and re-groom.** Hidden-cost flags either way: the
façade deepens the existing live→filevault in-process require (precedent already at
`roomCollab.js:22`, so no *new* coupling class), and "Gallery plugs in without redesign"
means the façade API must carry a resource-type dimension (file | roomFile | album) now,
designed against a consumer that doesn't exist yet — the classic scope-creep vector; cap it
at the type enum + `revokeByResource`, nothing speculative.

## 2. Complexity / risk

- **Cutover compatibility (the real risk):** issued share URLs embed
  `shareLink.id` + `?token=<CA tokenId>` (`shareService.js:96–97`) and room downloads key off
  `room_files` rows. Any route/validation reshuffle that changes either breaks links already
  in the wild. Mitigation is cheap under Shape A (routes keep their handlers, handlers call
  the façade) — this is why Shape A is the risk-correct choice, not just the cheap one.
- **Security invariants preserved, not touched:** fail-closed defaults (Pass 1),
  same-404-for-denied-vs-missing, moderation gate independence (FEAT-031), CA fail-open only
  on *unreachable* (never on explicit REVOKED/EXPIRED, `shareService.js:149–164`) must all
  survive the extraction verbatim. Existing suites (filevault shareGate/roomMemberDownload,
  62/62 green at closeout) are the parity harness — that materially de-risks the refactor.
- **AC restatement is mandatory, not optional:** the closeout documented that the FEAT-061
  AC-as-written contradicts Rick's 2026-07-13 provenance decision. The façade's invalidation
  tests must encode: owner-minted survives private-flip; non-owner grants die with the
  visibility they were minted under. Do not let the old AC text leak in.
- **Known stale test:** `services/live/tests/roomFiles.test.js` has 2 stale exact-arg
  assertions (closeout, proposed P3 BUG) — fix in passing or the façade branch inherits a red
  suite that isn't its fault.

## 3. Ongoing cost

Low-to-moderate. No new schema, worker, queue, or infra under Shape A. One more shared
abstraction to maintain, with two backends that must stay parity-tested — but that upkeep
replaces the *current* ongoing cost of two divergent mechanisms, which has already billed us
three security bugs (BUG-020 metadata leak, BUG-026 share-by-UUID escalation, BUG-027
private-flip survival). Net maintenance is likely *negative* once Gallery is a third
consumer. QA cost: one façade-level suite + keep existing suites green; do not credit the
non-blocking `test:all` as coverage — the parity suites must run in the module lanes.

## 4. Value

- **Unblocks the Gallery epic (primary driver):** FEAT-047's own notes call sharing "the
  whole risk surface of this epic" and hard-require FEAT-061 before album sharing; FEAT-048/049
  are blocked-before this. Without FEAT-077, Gallery either stalls or invents mechanism #3 —
  the exact pattern that produced the BUG-020/026/027 lineage. This is the highest-leverage
  P1 in the sharing lane.
- **Feeds FEAT-039 (PDS blob sharing) and FEAT-055 (workflow FileVault actions)** — both
  become façade consumers instead of new call-site conventions.
- **TASK-056 (clamp file-access mint read-only): do NOT fold in — do it first.** It is a
  ~1-line fail-closed clamp on `createFileAccessToken` (`shareService.js:196` spreads
  body permissions over the read-only default) + one regression test, jr-sized. Land it now;
  the façade inherits the clamp and its test. Holding a live latent widening hostage to an M
  feature is backwards.
- **TASK-055 (revoke token on avatar replace): partially subsumed.** The façade's
  `revokeByResource(fileId)` makes TASK-055 a one-call fix. Keep the ticket, mark it
  blocked-by FEAT-077, expect it to shrink to trivial-S. Credit ~1 S of avoided future work.

## 5. Cheaper alternative & smaller first slice

- **Cheaper alternative (rejected as default, listed honestly):** no façade — Gallery calls
  `shareService` + `shareGrantAllows` directly. Albums live in the filevault schema
  (FEAT-048), so this is *not* technically a bespoke mechanism and costs ~0 today. Rejected
  because it creates a third set of call-site conventions with no single enforcement point or
  revoke-by-resource — the drift pattern we just paid three security bugs to learn. Use only
  if 2026-11 collapses and FEAT-047 must start anyway; if so, architect must pre-approve the
  exact call-sites.
- **Smaller first slice (approved fallback, ~S/M):** façade interface + **FileVault backend
  only** (ShareLink + file-access token behind `mint/check/revoke/revokeByResource`), Gallery
  codes against the contract; Live's routes keep calling `shareGrantAllows` directly, with
  the RoomFile backend adapter filed as an explicit follow-up TASK. This delivers the entire
  FEAT-047-unblocking value (Gallery never touches the room path) at roughly half the cost;
  the room-side reconciliation is deferred, not dropped.

## 6. Sprint-fit: FEAT-070 (M) + FEAT-077 (M) in 2026-11

The two features touch **disjoint surfaces** (FEAT-070: spark/timeline via the published
`relationshipService`; FEAT-077: filevault/live) — no merge contention, fully
parallelizable across two implementers. **With two devs (e.g. sr-dev on FEAT-070,
sr-dev-2/architect-paired dev on FEAT-077): both fit a standard 2-week cycle**, provided the
architect shape sign-off happens in week-1 day-1–2 (schedule it at grooming, not mid-sprint).
**With a single implementer: they do not both fit** — two M builds plus a design gate plus QA
parity passes overruns a standard cycle. Sequencing in that case: FEAT-070 first (Tier-1
safety, ADR-pre-scoped, no design gate) + FEAT-077 **smaller slice** (FileVault-backend-only
façade) in 2026-11, with the RoomFile backend TASK carried to 2026-12 — which still lands
before FEAT-047 grooming. Prerequisite either way: TASK-056 (S, jr) lands early in the sprint.

## 7. Verdict

**BUILD NOW (sprint 2026-11), size M — conditional.** The M is honest only as Shape A
(interface unification, no storage migration), locked by systems-architect sign-off before
build; Shape B re-sizes to L and should be argued on its (weak) security merits. The value is
concrete and time-sensitive: three tickets (FEAT-047/048/049) are blocked-before it, the cost
of *not* unifying is empirically three security bugs, and the compat + parity harness from
Pass 1 makes this an unusually de-risked refactor for its size. Land TASK-056 first
(independent S); expect TASK-055 to shrink to trivial after. If 2026-11 is single-implementer,
take the approved smaller slice (FileVault backend only) rather than deferring wholesale.

---

## Paste-ready decision line

> - **Cost/Benefit: APPROVED (2026-07-27)** — build-now for sprint 2026-11, size **M
>   conditional on Shape A** (interface unification: façade with ShareLink/CA-token +
>   row-backed RoomFile as peer backends; **no** RoomFile→token storage migration — that
>   variant re-sizes to L and needs re-grooming). Architect locks the shape week-1 before
>   build. High value: unblocks FEAT-047/048/049 (Gallery's entire sharing surface), feeds
>   FEAT-039/055, gives single enforcement + revoke-by-resource — the divergence it removes
>   already cost BUG-020/026/027. Prereq: land TASK-056 (S, independent clamp) first — do not
>   fold it in; TASK-055 shrinks to trivial-S behind the façade's `revokeByResource` (keep
>   ticket, mark blocked-by FEAT-077). AC must be restated to Rick's 2026-07-13 provenance
>   decision (owner-minted survives private-flip; non-owner grants die with minted-under
>   visibility); issued `share.js`/`roomCollab.js` links stay live through cutover.
>   Sprint-fit: FEAT-070 (M) + FEAT-077 (M) fit one standard 2-week cycle **only with two
>   implementers** (disjoint surfaces, parallelizable); single-implementer → FEAT-070 first +
>   approved smaller slice (FileVault-backend-only façade, ~S/M; RoomFile adapter as
>   follow-up TASK in 2026-12, still ahead of FEAT-047). Full assessment:
>   `sprints/assessments/feat-077-capability-facade-cb.md` (coordinator to place). Status
>   stays `backlog`; PM promotes at 2026-11 grooming.
