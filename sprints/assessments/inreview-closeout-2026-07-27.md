# Sprint 2026-10 in-review closeout — QA verdict report

- **Verified against:** `main` @ `64a9f7a` (working tree has only sprints/docs mods by other agents; no product-code diffs).
- **Environment caveats (affect what could be RUN, not what was inspected):**
  - The `exprsn-postgres` container is **not running**; port 5432 is served by `llm-studio-postgres-1`, which has **no `exprsn` / `exprsn_auth_test` / `exprsn_nexus_test` databases**. Therefore `npm run db:check` and the DB-backed auth Jest suite were **skipped** (would need infra I am barred from starting).
  - The gateway is **down** (`curl -k https://localhost:8443/health` → connection refused) and I may not start it, so all live-HTTP E2E checks were **skipped**.
  - Filevault unit suites ran green in this env (62/62). The live `roomFiles.test.js` run **hung >50 min with ~2 s CPU** and was killed — result inferred statically (see BUG-027 regression note).

---

## TASK-024 — db:check blind to nullability + FK onDelete (claimed DONE 2026-07-10)

**Claim:** `check-drift-one.js` compares column nullability and FK `onDelete`/`onUpdate`, with per-column nullability aggregation and constraint-owning-side onDelete resolution; 17 pre-existing divergences allowlisted in `scripts/drift-allow.json`; prints all findings, fails only on non-allowlisted.

**Evidence checked:**
- `/Volumes/Storage/exprsn-platform/scripts/check-drift-one.js` — live nullability harvested from `information_schema.columns` (:37–45); live FK actions from `pg_constraint` mapping (:63–67); `nullabilityDrift` (:116, :184–190) with the association-injected-duplicate aggregation documented and implemented (:168 comment block); `fkDrift` onDelete/onUpdate comparison (:264–268) with the belongsTo-vs-hasOne default-onDelete subtlety handled (:124, :141).
- `/Volumes/Storage/exprsn-platform/scripts/drift-allow.json` — exists; `allow` has **9 entries, every entry carries a `reason`** (the shrink from 17 → 9 is BUG-025's work, itself already QA-verified done on 2026-07-10 with a live `db:check` exit-0 run — corroborating runtime evidence for this ticket's mechanism working in both directions).

**Skipped:** a fresh `npm run db:check` run (no `exprsn` DB reachable in this env).

**Verdict: CLOSE as done.** Code implements exactly the claimed checks including both subtleties; allowlist mechanism present and documented; the runtime proof exists in the BUG-025 done-verification record.

---

## TASK-025 — FileVault reconcile images stuck pending (claimed FIXED 2026-07-10)

**Claim:** periodic reconciler re-enqueues `pending` rows with no live Bull job; idempotent; cannot resurrect a resolved verdict.

**Evidence checked:** `/Volumes/Storage/exprsn-platform/services/filevault/src/worker.js`:
- `reconcileStuckPending()` (:184–225): grace window (`FILEVAULT_MODERATION_RECONCILE_GRACE_MS`, default 5 min) so in-flight enqueues aren't double-queued; selects **only** `status='pending'` or `status='approved', reason='shadow_pending'` — resolved verdicts (real approved/rejected) are structurally unselectable, satisfying the no-resurrection bullet; scoped to `image/%` mimetypes only (FEAT-073 — avoids re-routing stuck videos onto the image queue); skips rows with a waiting/active/delayed job; uses `requeueImageModeration()` (remove-then-add) so a stale **terminal** job key can't silently no-op the re-enqueue (the BUG-016 interaction, explicitly commented); never throws into the worker.
- Wiring (:246–249): interval timer (default 5 min, unref'd) + initial 15 s sweep in `startWorker()`; cleaned up on stop (:267).
- **Test run:** `tests/unit/reconcile.test.js` **PASS** (part of the 62/62 filevault run in this env).

**Verdict: CLOSE as done.** All three acceptance bullets demonstrably met in code + green unit suite. (Operational note: the reconciler lives in `worker:filevault`'s process, so it only runs when that worker runs — consistent with the queue architecture, not a defect.)

---

## TASK-031 — API_SURFACE.md missing modules/router (claimed DONE)

**Claim:** plugins 24/24, lowcode 52/52, live roomCollab 14/14 documented; two socket chat events added; header corrected to fourteen modules with 2026-07-13 source-read date.

**Evidence checked:** `/Volumes/Storage/exprsn-platform/API_SURFACE.md`:
- Header: "**fourteen** modules" (:4) and "source read on 2026-07-13 (TASK-031)" (:7); note at :6 records plugins/lowcode/roomCollab additions.
- Sections exist: `## Plugins module` (:1078), `## Lowcode module` (:1119), roomCollab subsection under live (:895, "Room collaboration (`routes/roomCollab.js`)").
- **Count spot-check against code (current main):** plugins doc rows **24** vs `git grep` route registrations in `services/plugins/src/routes` **24**; lowcode doc rows **52** vs code **52**. Exact match — the doc has not re-drifted since the fix.
- Socket events: `stream-chat-message` (:940, with the authed-posting annotation) and `chat-history` (:938, :941) documented.

**Verdict: CLOSE as done.** All acceptance bullets met; spot-check finds zero drift on the two largest added sections as of today.

---

## BUG-016 — filevault jobId re-moderation no-op (PRIMARY FIXED, minor residual open)

**Claim:** `requeueImageModeration()` removes the surviving job key before `add()`; residual = `evaluate()` overwrites the prior verdict in place (no local history).

**Evidence checked:**
- Primary: `/Volumes/Storage/exprsn-platform/services/filevault/src/queues/imageModeration.js` `requeueImageModeration()` (:89–94): `getJob(jobId)` → `existing.remove()` → add. Consumed by the BUG-018/BUG-021 re-moderation paths (both tickets already done/QA-verified) **and** by TASK-025's reconciler (worker.js ~:218–221, comment cites BUG-016 by name). `tests/unit/imageModeration.test.js` **PASS**.
- Residual still present on main: `/Volumes/Storage/exprsn-platform/services/filevault/src/services/imageModerationService.js` `evaluate()` patches `riskScore`/`verdict`/`provider`/`model` in place (~:244–247) — a prior *clean* verdict is lost locally on re-run. As the ticket records, flagged verdicts are persisted to moderator via the escalate hook, so nothing with audit value is lost.

**Verdict: SPLIT and CLOSE.** The primary defect (the ticket's title) is fixed, consumed at every re-enqueue site, and test-covered. The residual is a deliberate, zero-audit-loss design note that will otherwise pin a P3 bug in in-review indefinitely. Recommend closing BUG-016 and filing the residual as its own backlog task:

> **TASK-0NN — FileVault: persist prior image verdict before re-moderation overwrite (verdict history)**
> - Type: task · Status: backlog · Priority: P3 · Size: S · Relates: BUG-016 (residual), BUG-018, BUG-021
> - `imageModerationService.evaluate()` overwrites `verdict`/`provider`/`model`/`riskScore` in place on re-run, so a prior clean verdict is lost locally (flagged verdicts are already persisted to moderator by the escalate hook — no audit loss today). If a full local verdict history is wanted, persist the prior verdict (e.g. append to a JSONB history column or a child table) before the overwrite. Include the deferred `USING GIN (ai_tags)` index in whichever ticket first introduces tag filtering (noted in BUG-016).

---

## BUG-020 — share-link metadata discloses held image (claimed FIXED)

**Claim:** metadata endpoint 404s for a held image exactly like the download path; test covers it.

**Evidence checked:** `/Volumes/Storage/exprsn-platform/services/filevault/src/routes/share.js`:
- `assertShareableImage()` (:19–28): loads `FileModeration`, and `!imageModeration.isServableToOthers(moderation)` → 404 `FILE_NOT_FOUND` — deliberately NOT reusing the visitor-as-uploader trick so the uploader exemption can't apply.
- Metadata route `GET /:shareLinkId` (:113–127) calls it, with a comment citing FEAT-031/BUG-020 (:119–122).
- **Tests:** `tests/unit/shareGate.test.js` — `GET /api/share/:shareLinkId (metadata)` describe covers held-pending 404, rejected 404, approved-returns-metadata, and non-image-unaffected (:44–69). **PASS** (in the 62/62 run).

**Verdict: CLOSE as done.** Acceptance criterion met with direct test coverage, verified green in this environment.

---

## BUG-027 — room-shared file serves after flip-to-private (claimed FIXED under FEAT-061 Pass 1)

**Claim:** `room_files.shared_as_owner` provenance (migration `20250101000006`, join-derived backfill); one predicate `shareGrantAllows()` at both download and listing; fails closed without provenance; moderation gate independent.

**Evidence checked:**
- Predicate: `/Volumes/Storage/exprsn-platform/services/filevault/src/services/fileService.js` `shareGrantAllows()` (:217–222) — non-private always allowed; private allowed only if `sharedAsOwner` or requester is the owner. Applied at `downloadFileStreamForMember` (:259, defaults `sharedAsOwner=false` → fail-closed, :246) and at `servableFileIds` (:306, absent `ownerSharedIds` → treated non-owner → fail-closed, :305). FEAT-031 moderation gate applied independently after the grant check (:266–268, :307). Same `FILE_NOT_FOUND` for lapsed share vs missing file.
- Provenance recorded: `/Volumes/Storage/exprsn-platform/services/live/src/routes/roomCollab.js` — share path derives `sharedAsOwner` from the **verified** file, never the body (:155, after the BUG-026 `getFile()` access check :143); upload path hardcodes `true` (:191, uploader is owner); download threads `{ sharedAsOwner: file.shared_as_owner === true }` (:211–214); listing builds `ownerSharedIds` and passes it (:115–118).
- Migration: `/Volumes/Storage/exprsn-platform/services/live/migrations/20250101000006-add-shared-as-owner-to-room-files.js` — adds column + composite index, backfill **joins `filevault.files`** to derive the true value (:52) rather than defaulting false (which would have revoked owner shares). Model field present (`src/models/RoomFile.js:21`, NOT NULL default false).
- **Tests run:** filevault `tests/unit/shareGate.test.js` + `tests/unit/roomMemberDownload.test.js` **PASS** (62/62 total).
- **Skipped:** live E2E (gateway down); migration applied-state check (no `exprsn` DB in this env — ticket records "run + verified" and BUG-025's live verification is consistent).

**Regression spotted (test-only, pre-existing suite now stale):** `services/live/tests/roomFiles.test.js` was **not** updated by `ff8bba3` (git log confirms its last touch was `d05779f`). Two exact-argument assertions still expect the pre-FEAT-061 2-arg call shapes while the routes now pass a third options argument:
- `:212 expect(...downloadFileStreamForMember).toHaveBeenCalledWith('vault-file-9', MEMBER)` vs route call `(file_id, userId, { sharedAsOwner })` (roomCollab.js:211–214)
- `:258 expect(...servableFileIds).toHaveBeenCalledWith(['fa','fb'], MEMBER)` vs route call `(vaultIds, userId, { ownerSharedIds })` (roomCollab.js:118)
Jest's `toHaveBeenCalledWith` is strict on arity, so both assertions fail once the suite runs. (I could not complete the run in this env — jest hung with ~2 s CPU over 50+ min and was killed — but the mismatch is unambiguous statically.) This does **not** invalidate the fix; the behavior is covered by the updated filevault suites. Recommend filing:

> **BUG-0NN — live roomFiles.test.js stale after FEAT-061 Pass 1 (exact-arg assertions miss the new provenance argument)**
> - Type: bug · Status: backlog · Priority: P3 · Size: S · Relates: FEAT-061, BUG-027 · Found: QA in-review closeout 2026-07-27 (main `64a9f7a`)
> - Steps: `cd services/live && npx jest tests/roomFiles.test.js`. Expected: green. Actual: `toHaveBeenCalledWith` at :212 and :258 fail — routes now pass a third opts arg (`{sharedAsOwner}` / `{ownerSharedIds}`, roomCollab.js:118/:214) that `ff8bba3` never propagated into this suite. Test-only defect; product behavior verified via filevault shareGate/roomMemberDownload suites. Fix: update the two assertions (and ideally add a positive assertion that provenance IS threaded — that's the load-bearing part of BUG-027).

**Verdict: CLOSE as done** (the fix itself), **plus file the stale-test BUG above.**

---

## BUG-029 — oidc router mounted bare shadows oauth2 endpoints (in-review)

**Claim (what landed):** oidc's three superior handlers moved into `oauth2.js`; `oidc.js` reduced to the two `/.well-known/*` discovery routes (the one legitimate bare-mount use); `/api/oauth2/*` owned by exactly one router at a real prefix; comments guard the constraint; revoke-invalidates test added.

**Evidence checked:**
- `/Volumes/Storage/exprsn-platform/services/auth/src/routes/oidc.js` — exactly two routes remain: `GET /.well-known/openid-configuration` (:26) and `GET /.well-known/jwks.json` (:35). No `/api/oauth2/*` paths.
- `/Volumes/Storage/exprsn-platform/services/auth/src/index.js` — bare mount now discovery-only with a BUG-029 comment (:186–187); `app.use('/api/oauth2', oauth2Routes)` (:196). No absolute-path collision remains.
- `/Volumes/Storage/exprsn-platform/services/auth/src/routes/oauth2.js` — single implementations: `/revoke` (:306, client-authed, scoped to own tokens, RFC 7009 always-200 semantics), `/userinfo` (:342), `/introspect` (:378, honours `token_type_hint=refresh_token` :395–397 — the "superior oidc" behavior retained).
- Commit `f09f82b` ("fix(auth): SECURITY — require client auth on oauth2 introspect; de-shadow oidc routes (BUG-029/030)") is on main (merged via `4b71df6`).
- Test: `tests/oauth2.test.js:572` "a revoked token actually stops introspecting as active (BUG-029)" — satisfies the revoke-invalidates acceptance bullet.

**Skipped:** running the auth Jest suite (needs a real Postgres `exprsn_auth_test`, absent in this env) and live-HTTP route probing (gateway down). Ticket records 33/33 oauth2 tests green at fix time.

**Verdict: CLOSE as done.** All four acceptance bullets are met in code: one implementation per endpoint, the winning-implementation decision is documented in the ticket + code comments, the revoke test exists, and no bare-mounted absolute paths remain.

---

## BUG-030 — POST /api/oauth2/introspect requires no client auth (P1, token oracle)

**Claim:** introspection now requires client authentication (401 `invalid_client` otherwise); a client may introspect only its own tokens (others read `{active:false}`, never 403); revoked/expired read inactive; regression tests cover all three.

**Evidence checked:** `/Volumes/Storage/exprsn-platform/services/auth/src/routes/oauth2.js`:
- **Fail-closed gate first:** `authenticateClientRequest(req)` before any token lookup; missing/bad client → `WWW-Authenticate` + **401 `invalid_client`** (:378–387). Reuses the same proven mechanism `/revoke` uses (:307–312).
- **Own-tokens-only, non-confirming:** `!tokenData || tokenData.client.id !== client.id` → `{active:false}` (:399–402) — another client's live token is indistinguishable from a dead one.
- **Revoked/expired inactive:** `oauth2Service.getAccessToken()` filters `revoked: false` at query time (:211) and returns null when `accessTokenExpiresAt < now` (:221–224) → `{active:false}` path.
- **Latent-500 fix present:** expiry taken as `accessTokenExpiresAt || refreshTokenExpiresAt` (:405) so the refresh-token hint branch no longer throws; no `iat` emitted.
- **Regression tests present:** `tests/oauth2.test.js` — no-client-auth 401 (:408), cross-client `{active:false}` (:431), refresh-token hint (:460), plus revoked-token-inactive (:572). Covers every acceptance bullet.

**Skipped:** suite execution (no `exprsn_auth_test` DB in this env) and a live curl (gateway down — attempted, connection refused). Ticket records 33/33 green at fix time; code inspection shows the gate is unconditional and precedes any oracle-usable work.

**Verdict: CLOSE as done.** The auth gate landed, is fail-closed (401 before any token is examined), never confirms foreign tokens, and is regression-tested. No security invariant weakened.

---

## FEAT-061 — unified capability/share-link tokens, Pass 1 of 2 (FileVault + Live)

**Claim (Pass 1):** provenance-aware share-grant model unified across FileVault + Live behind one predicate, fail-closed, enforced at download AND listing; closes BUG-027; explicitly did NOT unify the token *mechanism* (room shares remain row-backed); Pass 2 = shared capability façade + ShareLink/RoomFile reconciliation, needed before Gallery (FEAT-047).

**Evidence checked:** identical body of evidence as BUG-027 above (predicate, both enforcement points, provenance capture at all three mint sites, fail-closed defaults, backfill migration, moderation independence), merged to main as `4b71df6`/`ff8bba3`. Filevault suites 62/62 in this env. Pass 1 scope as *described in the progress note* is genuinely done.

**However, measured against the ticket's own acceptance criteria (written for the full two-pass feature), Pass 1 alone does not close them:**
- "One shared capability-token mechanism for all content sharing" — not built (explicitly deferred; room shares row-backed by deliberate call).
- "Flipping a resource to private invalidates outstanding links" — true for **non-owner room shares** (the BUG-027 case); **not** true for FileVault `ShareLink`s or owner-minted room shares — by design under Rick's 2026-07-13 provenance decision (owner-minted capabilities survive; `share.js` even streams via the owner's identity, `downloadFileStream(file.id, file.userId)`). The AC text and the recorded decision disagree; the Pass 2 ticket should restate the AC to match the decision.
- Gallery/PDS/workflow consumers — Pass 2.

**Verdict: SPLIT (recommended).** Keeping FEAT-061 in-review parks finished, merged, security-relevant work behind an open-ended remainder and ages the queue. Recommend: close FEAT-061 **re-scoped to Pass 1** (grant semantics, closes BUG-027) with a closing note, and file Pass 2 as its own FEAT:

> **FEAT-0NN — Capability façade (FEAT-061 Pass 2): reconcile ShareLink + RoomFile behind one shared mechanism**
> - Type: feature · Status: backlog · Priority: P1 · Size: M · Relates: FEAT-061 (Pass 1, done), FEAT-047/048/049 (blocked-before), FEAT-039, FEAT-055, BUG-020/026/027 lineage
> - Extract a shared capability façade so Gallery (FEAT-047) plugs in without a redesign; reconcile FileVault `ShareLink` (already CA-token-backed) and Live `RoomFile` (row-backed provenance grants) behind it. Restate the invalidation AC to match Rick's 2026-07-13 provenance decision: owner-minted capabilities survive a private-flip; non-owner grants die with the visibility they were minted under. Compatibility window: live issued share links in `share.js`/`roomCollab.js` must not break on cutover. **Must land before FEAT-047 album sharing starts** (FEAT-047's notes already require this). Architect sign-off on the façade shape.

If the PM prefers strict adherence to the AC-as-written, the fallback is KEEP in-review — but then nothing can move until Pass 2, which contradicts the "file it before FEAT-047 starts" plan already recorded in the ticket. QA recommendation stands: split.

---

## Summary table

| Ticket | Claim | Verdict | Notes |
|---|---|---|---|
| TASK-024 | db:check nullability + FK onDelete | **CLOSE as done** | Code verified in `check-drift-one.js`; allowlist (9 entries, all reasoned); runtime run skipped (no exprsn DB in env), corroborated by BUG-025's live verification |
| TASK-025 | stuck-pending reconciler | **CLOSE as done** | worker.js reconciler meets all 3 AC bullets; `reconcile.test.js` PASS |
| TASK-031 | API_SURFACE.md gaps | **CLOSE as done** | Header/sections verified; plugins 24/24 and lowcode 52/52 doc-vs-code exact match on today's main |
| BUG-016 | jobId re-moderation no-op | **CLOSE + SPLIT residual** | Primary fixed (`requeueImageModeration`, used by all re-enqueue sites); residual (verdict overwrite, no local history) → proposed P3 TASK |
| BUG-020 | share metadata discloses held image | **CLOSE as done** | Metadata route 404s via `assertShareableImage`; `shareGate.test.js` PASS |
| BUG-027 | room share survives private-flip | **CLOSE as done + file stale-test BUG** | Fix verified end-to-end in code + filevault suites; `live/tests/roomFiles.test.js` has 2 stale exact-arg assertions (:212, :258) → proposed P3 BUG |
| BUG-029 | bare oidc mount shadows oauth2 | **CLOSE as done** | oidc.js = 2 discovery routes only; single owner of `/api/oauth2/*`; revoke test exists; commit `f09f82b` on main |
| BUG-030 | introspect token oracle (P1) | **CLOSE as done** | Fail-closed 401 gate before token lookup; cross-client `{active:false}`; expired/revoked inactive; all 3 AC bullets regression-tested. Suite run + live curl skipped (env) |
| FEAT-061 | capability tokens, Pass 1 of 2 | **SPLIT** | Pass 1 truly done (= BUG-027 evidence); close re-scoped to Pass 1, file Pass 2 FEAT (façade + ShareLink/RoomFile reconciliation, blocked-before FEAT-047) with AC restated to the provenance decision |

**Environment skips (could not verify at runtime, named source to check):** `npm run db:check` and the auth oauth2 Jest suite require the `exprsn`/`exprsn_auth_test` Postgres databases (the running 5432 is llm-studio's, not exprsn's); live-HTTP E2E requires the gateway on :8443 (down; not permitted to start). None of the skips block the verdicts above — each is backed by code inspection + green targeted suites or prior recorded live verification — but a belt-and-braces re-run of `db:check` and `services/auth npx jest tests/oauth2.test.js` once exprsn infra is back up is cheap and recommended.
