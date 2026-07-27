# Backlog — Exprsn Platform

The intake queue. Every unscheduled feature, bug, task, and spike is exactly one
entry here, filed with the fields from `templates/ticket.md`. Grouped by type.
Ids are monotonic per type and never reused. Legacy ids (`SP-N`, `R1`–`R6`, `#N`)
are cross-linked in parentheses.

Governance, lifecycle, and the Cost/Benefit gate: see `README.md`.

> **Gate reminder:** a `FEAT` cannot leave `backlog` until the
> cost-benefit-analyzer replaces its `Cost/Benefit: pending` line. The
> product-manager grooms `backlog → ready` and commits `ready` tickets into an
> active sprint. No sprint currently in flight — **2026-11 grooming is underway**
> (candidates: FEAT-070 C/B-approved, FEAT-077 C/B in flight). Closed sprints —
> `sprint-2026-07.md`, `sprint-2026-08.md`, `sprint-2026-09.md`, and
> `sprint-2026-10.md` (A11y/CSP follow-through, closed 2026-07-27) — are in
> `archive/`.

---

## Session completion — 2026-07-14 (merged to `main`)

The following shipped and are verified on `main` (lint 0 errors, `db:check` clean, per-module suites green). Set each
to **done** on its ticket when reconciling this list into the sections below (left as an additive note to avoid
clobbering concurrent grooming). Full record: this session's handover.

- **Security (were LIVE on main after the org merge, now fixed):** provision-self enterprise-template escalation (P1),
  org mass-assignment (P2), admin-role revocation/expiry bypass (P1, root-fixed in `resolveUserRoles`), `csv-parse`
  boot-crash (P1). Merge `7b1ce57`.
- **done:** FEAT-032/033/034/035 (org signup/provisioning/invite/import, hardened), FEAT-023, FEAT-031, BUG-014,
  BUG-016, BUG-020, TASK-024 (audit-passed in-review), FEAT-024, TASK-025, BUG-010, FEAT-010, FEAT-009/TASK-019,
  BUG-015, TASK-026, TASK-021, FEAT-011. (Merges `5815bd8` `55bae89` `b2cf804` `eb1911f` `6df3c53` `9d9b48b`.)
- **FEAT-029 → done (shipped swap-first):** the "fails AC2 co-residency" reading was a SUPERSEDED AC (swap-first
  accepted 2026-07-09). Sole remainder is an operator action: `MODELS_MAX=2 "/Volumes/Storage/MacOS LLM/start-server.sh" autostart`.
- **New follow-ups filed below:** FEAT-070 (spark block), FEAT-071 (org-admin import slice), BUG-031 (resolveUserRoles
  scope), TASK-034 (live-chat block topology), TASK-035 (social module), TASK-036 (Redis blocklist cache), TASK-037
  (moderatorScreen warn), TASK-038 (sandbox hardening).
- **Sprints closed:** 2026-07 (9/9) and 2026-08 (BUG-010 + FEAT-010) → `archive/`.

---

## Features

### FEAT-075 — Threaded/markdown comments + advanced comment controls + persisted timeline prefs
- **Type:** feature · **Status:** done · **Priority:** P2 · **Size:** M — reconciled 2026-07-27 — merged to `main` (`3e6f9a9`)
- **Owner-role:** sr-developer · **Branch:** `worktree-feat-timeline-comments` (worktree, not yet merged)
- **Cost/Benefit:** owner-directed (Rick, 2026-07-20) — implemented ahead of the CB gate at the owner's explicit request; record here for traceability rather than as a groomed backlog promotion.
- **Description:** Upgrade the timeline comment experience end-to-end:
  nested/threaded replies, GFM markdown authoring + rendering, and client-side
  advanced sort/filter/group, plus per-user timeline "look" preferences persisted
  locally (localStorage, mirroring `themeMode.ts`).
- **Acceptance criteria (all met on branch):**
  - Backend: `Comment.parentId` self-FK (migration `20260720000000`, applied to
    live `timeline.comments`; `db:check` clean). `POST /:id/comments` accepts
    `parentId` (validated same-post + live) and notifies the parent author;
    `GET /:id/comments` accepts `sort=newest|oldest`.
  - Comments render as a capped-depth thread (indent caps at depth 4, then
    flattens) with per-node collapse/expand and inline reply composer; orphaned
    replies (deleted/suppressed parent) promote to top level.
  - Markdown: bodies render via `react-markdown`+`remark-gfm` (no raw HTML — safe)
    behind a user toggle; composer has Write/Preview + a formatting toolbar.
  - Advanced controls: sort (Newest/Oldest/Top-by-reply-count), filter (search /
    mine / has-replies), grouping (Threaded on/off, By-time buckets).
  - Prefs (`web/src/app/timelinePrefs.ts`): default feed, density, markdown,
    comment sort/threaded/group — persisted to localStorage; feed-level prefs via
    a Timeline settings gear, comment prefs via the comment toolbar.
  - `web` build + `tsc` + eslint: 0 errors.
- **Follow-ups (filed separately if wanted):** soft-deleted parents render as
  `[deleted]` tombstones instead of orphan-promotion; server-side 'top' sort +
  comment pagination for very large threads (client currently fetches up to 500);
  optional cross-device pref sync via a backend preferences store.

### FEAT-001 — Full CalDAV/CardDAV DAV verbs for native OS account sync (parent epic)
- **Type:** feature (epic) · **Status:** backlog · **Priority:** P3 · **Size:** XL
- **Owner-role:** unassigned · **Blocked-by:** TASK-004 (real edge TLS — native-client DoD)
- **Legacy:** STATUS "group Calendar tab" note (no numbered id)
- **Decomposed into:** TASK-013 (Slice 0 · do now), FEAT-003 (Slice 1), FEAT-004 (Slice 2), FEAT-005 (Slice 3 · deferred)
- **Cost/Benefit:** done — **build later / smaller slice.** As written (full two-way RFC-4791/6352 for calendar *and* contacts, verified on native clients) it's realistically **XL, not L**, and its "verified on a native client" AC is blocked on real edge TLS (`TASK-004` → no staging host this cycle). Read-only subscription **already works today** via the existing `.ics`/`.vcf` URLs. Ship **Slice 0** (document the subscription URLs + clean up the broken JSON "DAV" scaffolding) now; schedule the read-only DAV **sync-down account** (L) + **Basic app-password bridge** (M–L, architect+dba) post-staging. Full detail + evidence: `sprints/assessments/FEAT-001.md`.
- **Description:** Nexus calendar/contacts sync is currently GET-based only
  (`ics` / `vcf` / JSON under `/nexus/api/calendar`). Native OS accounts
  (macOS/iOS Calendar & Contacts, Thunderbird, etc.) need full RFC-compliant
  `PROPFIND` / `REPORT` verbs to sync as a real DAV account. The GET endpoints
  and the SPA Calendar tab already exist; this is the protocol-verb layer.
- **Acceptance criteria:**
  - `PROPFIND` / `REPORT` implemented for CalDAV and CardDAV collections under
    `/nexus/api/calendar`, RFC-conformant enough for a native macOS/iOS account
    to add and two-way sync a group calendar + contacts.
  - Auth model matches the existing calendar endpoints (no new open surface).
  - Verified by adding the account on at least one native client.
- **Notes:** Re-groomed 2026-07-07 after the cost-benefit-analyzer assessment
  (`Cost/Benefit: done` above). Verdict **build later / smaller slice**: as written
  (full two-way RFC-4791/6352 for calendar *and* contacts, verified on native
  clients) it is realistically **XL** — and per README an XL **must be broken down
  before it can reach `ready`**, so this stays a `backlog` **parent epic** and is
  never promoted directly. Decomposed into **TASK-013** (Slice 0 — docs + scaffolding
  cleanup, in-house, committed to Sprint 2026-07), **FEAT-003** (Slice 1 — read-only
  DAV sync-down account), **FEAT-004** (Slice 2 — Basic-auth app-password bridge,
  architect + dba sign-off), **FEAT-005** (Slice 3 — two-way write, deferred). The
  epic's own DoD ("verified on a native client") is **unreachable until real edge TLS
  exists** — Apple enforces SSL — i.e. blocked on `TASK-004` → a staging host that
  does not exist this cycle. Buildable acceptance criteria live in the child slice
  tickets; verify routes against `API_SURFACE.md` before build.

- **Cost/Benefit assessment (cost-benefit-analyzer · 2026-07-07): build later / smaller slice.** Full detail + repo evidence: `sprints/assessments/FEAT-001.md`.
  - **Cost — realistically XL, not L (so it must be sliced before `ready`).** *The hard plumbing already exists and is reused:* a WebDAV toolkit in `@exprsn/shared` (`shared/middleware/webdav.js`, `shared/utils/webdavLockManager.js`) routes non-standard verbs + emits `207 Multi-Status` through the gateway — proven live by FileVault (`services/filevault/src/routes/webdav.js`, API_SURFACE L527); Nexus already generates iCal/vCard (`icalService` + `ical-generator`) and has ~600 lines of data-shaping in `caldavService`/`carddavService`. *What drives the cost:* (1) CalDAV/CardDAV-specific discovery/REPORTs the generic toolkit doesn't cover — `.well-known/caldav`+`/carddav`, current-user-principal / home-set, `calendar-query`/`multiget` + `sync-collection`; (2) an **auth bridge** — native macOS/iOS/Thunderbird accounts use **HTTP Basic app-passwords**, but the calendar + FileVault DAV paths only accept **Bearer** CA tokens (`services/filevault/src/middleware/auth.js`), so the AC "match existing auth / no new open surface" **collides with** "native account" → an app-password store = new security surface (architect+dba); (3) two-way write needs an iCal **parser** (Nexus has only the write-only generator), and CardDAV contacts are *derived group members* → two-way CardDAV is N/A; (4) real incremental sync needs a persisted change-journal table (current token = `base64(Date.now())`, can't express deletions) → new nexus-schema table (dba; new table, so `db:migrate` sync creates it — no ALTER trap). The existing scaffolding is also **untested/partly broken** (Sequelize `$gte`/`$gt` operators that no-op, `ical:null` placeholder, `validateCalDAVCredentials` stubbed) — not creditable as done. **Also blocked on `TASK-004`:** Apple enforces SSL for native accounts, so "verified on a native client" can't be met until real edge TLS exists — itself blocked on a staging host this cycle.
  - **Value — P3, unblocks nothing.** Read-only subscription **already works** via the existing GET `.ics`/`.vcf` URLs (macOS/iOS/Google/Thunderbird subscribe + auto-update) ≈ 80% of the value today. The delta is a writable *account* + contacts sync — small MVP audience; the platform's real gap-to-ship is release engineering, not calendar sync.
  - **Recommended slice:** *(0, S — do now)* document the `.ics`/`.vcf` subscription URLs as the supported native-app path + fix/delete the broken JSON "DAV" scaffolding; *(1, L)* read-only DAV **sync-down account** — well-known + principal/home PROPFIND + query/multiget REPORT + persisted `sync-collection` token, reusing the shared toolkit; *(2, M–L, architect+dba)* **Basic-auth app-password bridge** (the real native-account enabler); *(3, defer/drop)* two-way CalDAV `PUT`/`DELETE` only. Start Slice 0 now (no TLS dependency); schedule 1+2 **post-staging** when TLS exists.
  - **Handoffs:** **systems-architect** — app-password/Basic bridge = new auth surface + `.well-known`/principal gateway wiring (structural sign-off before Slice 1/2). **dba** — sync-token journal + app-password store are new tables (sync `db:migrate` creates new tables fine — confirm). **qa-specialist** — per-native-client (macOS/iOS/Thunderbird) verification is real, recurring effort.

### FEAT-003 — Read-only DAV sync-down account (CalDAV/CardDAV Slice 1)
- **Type:** feature · **Status:** backlog · **Priority:** P3 · **Size:** L
- **Owner-role:** unassigned · **Blocked-by:** TASK-004 (real edge TLS — Apple enforces SSL for native accounts, so native-client verification is unreachable until staging TLS exists); native-client auth also needs FEAT-004 (Slice 2)
- **Legacy:** FEAT-001 Slice 1 (parent epic) · see `sprints/assessments/FEAT-001.md`
- **Cost/Benefit:** done — covered by the FEAT-001 assessment (`sprints/assessments/FEAT-001.md`): read-only DAV sync-down is a solid **L** on its own, reusing the `@exprsn/shared` WebDAV toolkit + FileVault as the live reference.
- **Description:** First real cut of the DAV epic: a native account can *add and sync
  down* a group calendar + contacts read-only (no inbound-write parsing). Reuses the
  `@exprsn/shared` WebDAV toolkit (`shared/middleware/webdav.js`,
  `shared/utils/webdavLockManager.js` — proven live by FileVault
  `services/filevault/src/routes/webdav.js`, `API_SURFACE.md` L527) and Nexus's
  existing iCal/vCard generation (`caldavService`/`carddavService`/`icalService`).
- **Acceptance criteria:**
  - `.well-known/caldav` + `.well-known/carddav` redirects served.
  - `current-user-principal` / `calendar-home-set` / `addressbook-home-set` principal
    discovery via `PROPFIND`, plus `supported-calendar-component-set`.
  - `calendar-query` / `calendar-multiget` / `addressbook-query` /
    `addressbook-multiget` REPORTs return correct `207 Multi-Status`.
  - `sync-collection` (RFC 6578) REPORT backed by a **persisted sync-token** (not
    `base64(Date.now())`) that can express deletions across calls.
  - A native macOS/iOS account (via Slice 2 auth, over real TLS) adds the account and
    syncs down calendar + contacts read-only; verified per-client by qa.
- **Notes:** Re-filed 2026-07-07 from the FEAT-001 decomposition. **Out of Sprint
  2026-07** — blocked on `TASK-004` (TLS), itself blocked on a staging host. The
  persisted sync-token is a **new table in the `nexus` schema** → **dba** confirm
  (new table, so sync `db:migrate` creates it — no ALTER-on-existing trap).
  `.well-known` + principal routing touches gateway wiring → **systems-architect**
  structural sign-off before build. Sequence after FEAT-004 for native-client auth.

### FEAT-004 — Basic-auth app-password bridge for native DAV accounts (CalDAV/CardDAV Slice 2)
- **Type:** feature · **Status:** backlog · **Priority:** P3 · **Size:** M
- **Owner-role:** unassigned · **Blocked-by:** TASK-004 (real edge TLS); systems-architect + dba sign-off required before commit
- **Legacy:** FEAT-001 Slice 2 (parent epic) · see `sprints/assessments/FEAT-001.md`
- **Cost/Benefit:** done — covered by the FEAT-001 assessment (`sprints/assessments/FEAT-001.md`): the actual native-account enabler; **M–L**, security-sensitive, architect + dba gated.
- **Description:** The real native-account enabler. macOS/iOS Calendar & Contacts and
  Thunderbird add a DAV account with **HTTP Basic auth + an app-specific password over
  TLS**, but the calendar + FileVault DAV paths only accept **Bearer CA tokens**
  (`services/filevault/src/middleware/auth.js`). This bridges Basic → a CA token via
  an **app-password store** — new security surface that must respect the platform's
  security invariants.
- **Acceptance criteria:**
  - Native clients authenticate a DAV account via Basic app-password over TLS;
    resolves to the correct principal with no new open/unauthenticated surface.
  - App-passwords are per-user, revocable, hashed at rest; the change never weakens
    the `DEV_BYPASS` / CORS-with-credentials / correlation-id-error invariants.
  - Basic → CA-token bridge verified end-to-end against Slice 1 (FEAT-003) discovery
    + REPORTs on at least one native client.
- **Notes:** Re-filed 2026-07-07 from the FEAT-001 decomposition. **Out of Sprint
  2026-07** — blocked on `TASK-004` (TLS → staging). **Requires systems-architect
  sign-off** (new auth surface + `.well-known`/principal gateway wiring) **and dba
  sign-off** (app-password store = new table; new table, so sync `db:migrate` creates
  it — confirm) **before it can be marked `in-sprint`.** Size M–L; tighten once the
  architect scopes the store.

### FEAT-002 — ES-richer Post schema + search-by-hashtag *(deferred — see Deferred)*
- Listed under **Deferred** below (ES is disabled at MVP). Id reserved here for
  cross-reference.

*(QA full-codebase audit — 2026-07-07. PM-intake candidates groomed from the audit;
FEATs are filed `backlog` with `Cost/Benefit: pending` — the cost-benefit-analyzer
has not yet assessed them, so they cannot leave `backlog`.)*

### FEAT-006 — Build real MFA factors (SMS / email / WebAuthn)
- **Type:** feature · **Status:** backlog · **Priority:** P2 · **Size:** L
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** STATUS #12 (org 2FA policy enforcement — RESOLVED 2026-07-07; note (c),
  "building the actual `sms`/`email`/`webauthn` factors … is a **separate feature**"
  — STATUS.md L677–680 — is explicitly deferred to its own ticket)
- **Cost/Benefit:** pending
- **Description:** The org 2FA policy is enforced at login (STATUS #12, RESOLVED
  2026-07-07): `settings.requireMfa`, enrollment grace, `settings.mfa.allowedMethods`,
  and `rememberDeviceDays` all take effect. **But only `totp` + `backup_codes` are
  actually built.** `sms`, `email`, and `webauthn` exist only as config scaffolding —
  `mfaPolicyService` treats a policy that permits *only* those unbuilt methods as
  unenforceable, `POST /auth/api/mfa/setup` rejects them with `MFA_METHOD_NOT_ALLOWED`,
  and the admin UI (`web/src/features/admin/sections/AuthSection.tsx`) marks them
  "not yet available". This builds real enroll + challenge flows for one or more of
  those factors so a policy can genuinely require them.
- **Acceptance criteria:**
  - At least one new factor (SMS, email, or WebAuthn) has a real enroll + verify flow
    wired into the account MFA endpoints (`POST /auth/api/mfa/setup` / `/verify`) and the
    login challenge; routes verified against `API_SURFACE.md` before wiring.
  - `mfaPolicyService.resolvePolicy` counts the new factor as an **enrollable** method
    (a policy permitting only it becomes enforceable, not skipped), and the admin UI
    drops the "not yet available" marker for the built factor(s).
  - Org-policy `allowedMethods` still gates the factor at `setup` — permitted ⇒ no
    `MFA_METHOD_NOT_ALLOWED`; disallowed ⇒ still rejected.
  - Trusted-device (`exprsn_td`) skip and enrollment-grace behavior continue to hold for
    the new factor(s); `mfaPolicy.test.js` / `mfaEnforcement.test.js` extended to cover it.
  - No weakening of the security invariants (fail-closed `DEV_BYPASS`, CORS never
    wildcard-with-credentials, correlation-id error handler, per-schema isolation).
- **Notes:** FEAT — **Cost/Benefit gate applies: stays `backlog` with `Cost/Benefit:
  pending` until the cost-benefit-analyzer assesses it** (not run this pass). Cost differs
  sharply per factor — WebAuthn is largely self-contained, whereas SMS/email need an
  external provider + per-message delivery cost + anti-abuse — so the analyzer should weigh
  factor-by-factor and may recommend scoping to WebAuthn first; the ticket is then likely
  **decomposable per factor**. Sized **L**. Touches `services/auth` MFA services/routes/
  models + the admin SPA; a WebAuthn credential store or a phone-number column is a
  **schema change** → flag **dba** (a *new* table is created by sync `db:migrate`, but a
  *new column on an existing table* needs its migration `up()` run directly — the ALTER
  gap). Route M–L build to sr-developer once groomed/assessed.
- **WebAuthn conformance (2026-07-20 W3C audit):** WebAuthn/passkeys confirmed
  **greenfield** — no `navigator.credentials` code, no FIDO/`@simplewebauthn` dep;
  `webauthn` is inert scaffolding (`mfaPolicyService.IMPLEMENTED_METHODS` floors it
  out; admin row `available:false`). No non-conformant code to fix — adoption is
  purely additive. A conformant **WebAuthn L3 + Credential Management L1** build must
  add: a per-credential store (credential id, COSE public key, **signature counter**,
  transports, AAGUID, user handle, backup-eligible/state flags); a CSPRNG **one-time
  challenge** (short TTL, server-stored, not client-trusted); a strict **origin
  allowlist + `rpId`** pinned to the browser-facing host (**not** internal
  `localhost:8443` behind the nginx edge); `create`/`get` ceremony verification
  (clientData type/origin/challenge, rpIdHash, UP/UV flags); an attestation policy
  (`none` acceptable for passkeys); **discoverable credentials** + user handle for
  usernameless login; `pubKeyCredParams` (ES256 `-7`, RS256 `-257`); and browser
  `mediation:'conditional'` (Conditional UI) gated on
  `isConditionalMediationAvailable()` / `isUserVerifyingPlatformAuthenticatorAvailable()`.
  Reuse the existing MFA hygiene (CSPRNG, one-time codes hashed at rest, `strictLimiter`).
  The analyzer's likely "scope to WebAuthn first" recommendation is reinforced by this
  being self-contained with no external per-message cost.

### FEAT-007 — FileVault: real malware scanning (ClamAV) on the upload path
- **Type:** feature · **Status:** backlog · **Priority:** P2 · **Size:** M
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** SP-11 security theme (upload-path hardening); no numbered STATUS id
- **Cost/Benefit:** pending
- **Description:** `services/filevault/src/utils/fileValidator.js` `scanFile(buffer)`
  (L255) does **signature heuristics only** — it compares the first bytes against a short
  list of executable magic-numbers — with an inline `// In production, integrate with
  ClamAV or similar` (L257). Anything not matching those few signatures passes as clean,
  so the group/share upload path has **no real malware scanning**. Integrate a real
  scanner into `scanFile` so uploads are actually scanned before storage.
- **Acceptance criteria:**
  - `scanFile` submits the uploaded buffer/stream to a real scanner (self-hosted `clamd`
    via a client, or a hosted scan API) and rejects on a positive detection with a clear,
    correlation-id'd error; the existing signature heuristic stays as a cheap pre-filter or
    is superseded.
  - Scanner enablement/endpoint is config-driven (env) and **fail-closed when scanning is
    enforced** — an upload is rejected, not silently accepted, if the scanner is
    unreachable; the default posture is documented.
  - An automated test blocks the EICAR test string and passes a benign file.
  - Large-file path streams to the scanner without buffering unbounded; upload latency /
    size limits documented.
  - No new open/unauthenticated surface; upload routes verified against `API_SURFACE.md`.
- **Notes:** FEAT — **Cost/Benefit gate applies: stays `backlog` / `Cost/Benefit: pending`
  until the cost-benefit-analyzer assesses it** (not run this pass). Typed FEAT (not TASK)
  **deliberately**: there is a genuine **build-vs-buy-vs-defer tradeoff with ongoing
  operational cost** — self-hosted `clamd` (a new container, ~1GB RAM, signature-DB
  updates) vs. a hosted scan API (per-scan cost) vs. tightening allowed file-types and
  accepting the heuristic — which is exactly what the C/B gate exists to weigh.
  **Security-relevant; recommended before any public upload exposure.** Standing up `clamd`
  is infra relative to the single gateway → loop in **systems-architect** at grooming
  (where the scanner runs); no schema change expected. If the analyzer finds it's pure
  must-do hardening with no real alternative it may be re-typed TASK, but the gate stands
  until assessed. Sized **M** for one scanner integration; route to sr-developer.

*(Moderation gap-analysis intake — 2026-07-07. FEATs filed `backlog` with
`Cost/Benefit: pending`; per the gate they cannot leave `backlog` until the
cost-benefit-analyzer attaches an assessment. Grouped by the analysis's three tiers
— Tier 1 = MVP-blocking for public UGC, Tier 2 = ops maturity / post-MVP, Tier 3 =
compliance & analytics. Existing tickets **SPIKE-001** (auth-gate the 6 unauthenticated
moderator routers), **TASK-014** (real rejection-notice emails), **TASK-017**
(API_SURFACE moderator-auth doc drift), and **FEAT-007** (FileVault ClamAV scanning)
are cross-referenced, not re-filed.)*

### FEAT-008 — CSAM perceptual-hash matching (PhotoDNA/PDQ) + NCMEC report hook on every image path *(Tier 1)*
- **Type:** feature · **Status:** backlog · **Priority:** P1 · **Size:** L
- **Owner-role:** unassigned · **Blocked-by:** — *(architect + dba sign-off required before commit)*
- **Legacy:** moderation gap analysis Tier 1 · relates to FEAT-007 (FileVault upload-path hardening) + FEAT-009 (central pipeline wiring)
- **Cost/Benefit:** done — **DEFER pending a human legal/provider decision (needs-more-info on the gating item — not an engineering C/B).** The binding cost is external onboarding + legal registration (PhotoDNA access, NCMEC reporting-entity status, CSAM hash-list custody), **not** code. Do not commit engineering until (a) leadership/legal confirms public image UGC is in scope this cycle and (b) a provider path is chosen — strongly prefer a hosted service over self-custody. Revisit trigger: **before any public image upload path is exposed.**
  - **Cost — engineering is L, but that is NOT the binding constraint.** The binding costs are external/legal: PhotoDNA (Microsoft) is **access-gated** — API keys issued only to vetted, approved organizations via an application, onboarding measured in weeks; a real NCMEC report hook implies becoming a registered US reporting entity (ESP); and known-CSAM **hash lists** (NCMEC/IWF/Thorn) are access-controlled, not downloadable. PDQ (Meta, open-source) removes the hashing-tech gate but solves neither the hash-list nor the reporting-registration problem. Handling also carries strict legal duties (quarantine-not-re-serve, evidence preservation, statutory reporting window) with criminal-liability exposure if mishandled.
  - **Complexity/risk — HIGHEST of the four, and it is legal/compliance risk more than engineering risk.** Architecturally it is the **opposite posture to FEAT-009**: CSAM must be a **synchronous, fail-closed pre-gate** that blocks before content is ever served — you cannot optimistically publish then retract. So it does **not** ride FEAT-009's async pipeline; it shares the 3 image hook points (coordinate wiring) but is its own blocking check.
  - **Infra/ops.** A hash store (new table — sync `db:migrate` creates it fine, no ALTER trap) OR **none** if a hosted matcher is used; a synchronous match adds upload latency on every image path (filevault / timeline / spark media); the NCMEC hook is a new fail-closed, audited outbound integration.
  - **Value — HIGH but conditional/legal.** It is a mandatory-reporting gate that attaches once you host **public** user image uploads. Per the in-house MVP posture (`CLAUDE.md` / MVP-scope memory — no remote, not near public MVP), that trigger has not fired this cycle → the value is latent, not yet due.
  - **Cheaper alt (build-vs-buy).** A **hosted** CSAM service materially cuts legal surface + onboarding vs. self-hosting PhotoDNA + DIY reporting: **Cloudflare's CSAM Scanning Tool is free for Cloudflare customers** and (per its 2023+ update) **no longer requires the operator to hold NCMEC credentials**; **Thorn Safer** is a commercial API (custom pricing, also on AWS Marketplace); **Hive AI** offers a CSAM-detection API. All trade a per-scan/subscription cost for **zero hash-list custody** and far faster onboarding — strongly recommended over self-custody.
  - **Smaller slice — do NOT build the matcher speculatively.** The correct "slice" is a gate + a human decision: (1) keep public image UGC **un-exposed** until this lands (scope/feature-flag), and (2) run the legal/registration track (choose provider, reporting-entity status, custody model) as a **prerequisite that must complete before engineering starts**.
  - **Verdict — DEFER / needs-more-info.** Explicitly **not** a call the analyst can close as build/no-build: the gating decision (provider, NCMEC/reporting registration, custody of CSAM material) is legal/organizational and must be made by a human **with counsel** — escalate. If public image UGC is confirmed for a near cycle, re-scope to a **hosted-provider integration** (likely **M** once access is granted, not L).
  - **Handoffs — HUMAN / leadership + legal** own the provider + reporting-registration + custody decision (blocking). **systems-architect** — the synchronous fail-closed pre-gate on the 3 image paths + new moderator hashing service (structural; coordinate hook points with FEAT-009 and FEAT-007). **dba** — hash-store table only if self-hosted (new table, no ALTER trap).
  - **Caveat.** Legally mandatory once public; the expensive, blocking work is **external onboarding/registration, not code**; must not self-custody hash lists or hand-roll NCMEC reporting without counsel.
- **Description:** No image upload path performs known-CSAM detection. Add perceptual-hash
  matching (PhotoDNA and/or PDQ) against a known-hash store on **every** image path —
  FileVault upload, timeline media, spark media — with an NCMEC report hook fired on a
  positive match. This is a **legal gate before public image UGC** (mandatory reporting).
  Implemented as a new moderator-side hashing/matching service plus a hash store, invoked
  from the image upload hooks in filevault/timeline/spark.
- **Acceptance criteria:**
  - A moderator-side perceptual-hash service computes PhotoDNA/PDQ hashes and matches them
    against a hash store; a positive match blocks the upload/publish with a correlation-id'd
    error and quarantines rather than serving the content.
  - Every image path is wired: FileVault upload (`services/filevault` upload routes),
    timeline media, and spark media — verified against `API_SURFACE.md` before wiring; no
    image path bypasses the check.
  - A positive match fires an NCMEC report hook (config-driven credentials/endpoint) with
    the required evidence payload; the reporting flow is fail-closed and audited.
  - Hash-store and NCMEC enablement are config-driven; when enforcement is on, an
    unreachable matcher **rejects** (fail-closed), does not silently accept.
  - Automated test: a seeded known-hash entry blocks a matching image; a benign image passes.
  - No new open/unauthenticated surface; security invariants unchanged.
- **Notes:** FEAT — **Cost/Benefit gate applies** (stays `backlog` / `pending` until the
  cost-benefit-analyzer assesses). Real build-vs-buy tradeoff: PhotoDNA (Microsoft, access-
  gated) vs. open PDQ (Meta) vs. a hosted CSAM API, each with legal/onboarding and ongoing
  cost — squarely a C/B question. **Structural** (new moderator service + a new inter-module
  invocation on three upload paths) → **systems-architect** sign-off; the **hash store** is a
  new table/store → **dba** sign-off (new table is created by sync `db:migrate`; a hosted
  store may need none). Sequence alongside FEAT-009 (both wire the upload paths into
  moderation) and coordinate with FEAT-007 (same FileVault upload path). Sized **L**; route
  to sr-developer once assessed.

### FEAT-009 — Route filevault + timeline + spark content through the central `moderateContent` pipeline *(Tier 1)*
- **Type:** feature · **Status:** backlog · **Priority:** P1 · **Size:** L
- **Owner-role:** unassigned · **Blocked-by:** — *(architect sign-off required before commit — new inter-module contract)*
- **Legacy:** moderation gap analysis Tier 1 · reference pattern `services/atproto/src/ingest/moderationBridge.js` · relates to FEAT-016 (image/video productionization)
- **Cost/Benefit:** done — **proceed (MVP slice); sequence FIRST among the Tier-1 auto-moderation FEATs.** In-process `moderateContent` wiring is the backbone the auto-moderation stack plugs into; the architect design already exists (`sprints/moderation-routing-plan.md` Item B, buildable ticket TASK-019). Ship the fail-open inline-async MVP slice (filevault + timeline + plaintext group-spark; DMs report-only); defer the durable moderator Bull worker + backfill sweep to Tier 2.
- **Cost/Benefit assessment (cost-benefit-analyzer · 2026-07-07): proceed (MVP slice), sequence first.**
  - **Cost — L, largely designed.** A lazy `submitForModeration()` in-process helper mirroring `atproto/src/ingest/moderationBridge.js`, wired at 3 hook points (timeline `posts.js POST /`, filevault `files.js POST /upload`+`/create`, spark `messageService.sendMessage`), plus new **authenticated** module-side action sinks for filevault + spark (timeline's `/api/webhooks/moderator` sink already exists and is authed post-`BUG-006`). Moderator needs **no new schema** — `ModerationCase` is already keyed `(sourceService, contentType, contentId)`. The real data cost is on the consumers: filevault `File` + spark `Message` each need a moderation-state column = an **ALTER on an existing table**, so the migration `up()` must be run directly (sync `db:migrate` will NOT ALTER — the documented trap); timeline reuses `metadata` JSON (no migration). Per-module integration tests.
  - **Complexity/risk.** In-process `require` pulls moderator's model layer into 3 modules' require graph (already true for atproto — acceptable; keep the require lazy + wrapped). **Fail-open blind spot:** on any moderator/AI outage every module publishes with only a `moderation:pending` marker → without a backfill sweep it stays permanently unmoderated. **Spark E2EE** content is structurally un-moderatable (no server-side plaintext) → plaintext group/channel only, DMs report-only. Idempotency is in the service (dedupe key), so at-least-once retries are safe.
  - **Infra/ops.** MVP can be fire-and-forget inline-async — **no new process**. A durable moderator-owned `moderate-ugc` Bull queue + `worker:moderator` is the production version (architect/dba open question in the design doc) → defer.
  - **Value — HIGH, MVP-blocking for public UGC.** Today only atproto UGC is actually moderated; this makes native timeline/filevault/spark content moderated at all, and it is the plug-in point FEAT-008 (shared hooks), FEAT-016 (vision), FEAT-018 (PII), FEAT-019 (spam) and FEAT-013 (reputation) all depend on — the highest-leverage of the four.
  - **Cheaper alt / smaller slice.** The design doc already slices it: (1) filevault first (not broadcast, simplest), (2) timeline (reuse the existing authed sink + `approvalService` hold), (3) spark last, plaintext group/channel only. MVP = inline-async fail-open across those + a `moderation:pending` marker on failure; defer the Bull worker, backfill sweep, and any queryable indexed `moderationStatus` column to a fast-follow.
  - **Verdict — proceed, first among the Tier-1 auto-moderation features.** The two independent user-safety FEATs (FEAT-010 reports, FEAT-011 block/mute) do **not** depend on this and can run in parallel; FEAT-008 (CSAM) shares the image hook points but is a different (synchronous fail-closed) posture gated on a legal decision, not on this.
  - **Handoffs — systems-architect** already owns the contract (design doc + TASK-019 sign-off gate at COMMIT). **dba** — filevault `File` + spark `Message` moderation-state columns are ALTERs on existing tables (run `up()` directly, then `db:check`), plus the deferred `moderate-ugc` Bull queue/worker. **product-manager** — the DM-scanning policy call (recommend report-only for MVP). **qa-specialist** — verdict-enforcement (hold/retract/quarantine/redact) + fail-open behavior tests.
  - **Caveat.** Fail-open without a **committed** backfill sweep makes "moderated" hollow — the MVP slice must at least write the `moderation:pending` marker and schedule the backfill as a fast-follow.
- **Implementation ticket:** **TASK-019** (architect-signed buildable ticket per `sprints/moderation-routing-plan.md` Item B) is filed and **`blocked` on this FEAT's Cost/Benefit sign-off** — the C/B gate lives here on the parent FEAT; run the cost-benefit-analyzer to unblock both.
- **Description:** Today only the atproto ingest path is truly wired into the central
  `moderateContent` pipeline (`services/moderator/services/moderationService.js`); filevault,
  timeline, and spark user content never flows through it. Route those three modules'
  content-create paths through `moderateContent`, following the proven bridge pattern in
  `services/atproto/src/ingest/moderationBridge.js`, so platform UGC is actually moderated
  rather than published unchecked.
- **Acceptance criteria:**
  - Timeline post creation (`services/timeline/src/services/approvalService.js` and the
    post-create path), spark message send, and filevault upload each invoke `moderateContent`
    via the moderator ingest contract before the content becomes visible/durable.
  - The bridge reuses the atproto `moderationBridge.js` shape (a shared inter-module
    contract), with per-service HMAC auth over `*_SERVICE_URL`; routes verified against
    `API_SURFACE.md`.
  - A verdict of block/hold prevents publish (or holds for review, consistent with the
    existing timeline approval-hold `metadata.approval` state); allow lets it through; the
    verdict is recorded/auditable.
  - Failure mode is explicit and documented (fail-open vs. fail-closed per content type),
    not an unhandled 500; correlation-id'd errors.
  - Integration test per module shows content passing/blocked through the pipeline.
- **Notes:** FEAT — **Cost/Benefit gate applies.** **Structural** — introduces a new
  cross-module contract (three producers → moderator ingest) → **systems-architect** sign-off
  before commit (they own cross-module contracts + the ingest shape). Likely no schema change
  itself, but confirm with **dba** if a verdict/hold column is added to an existing table
  (ALTER-on-existing needs the migration `up()` run directly — sync `db:migrate` won't ALTER).
  This is the backbone the other moderation FEATs (FEAT-008 image hashing, FEAT-016 vision,
  FEAT-018 PII, FEAT-019 spam) plug into — sequence it early among Tier-1. Sized **L**; route
  to sr-developer once assessed.

### FEAT-010 — User-facing report/flag UI wired to the existing `Report` backend *(Tier 1)*
- **Type:** feature · **Status:** done · **Priority:** P1 · **Size:** M — reconciled 2026-07-27 — merged to `main` (`55bae89`)
- **Owner-role:** unassigned · **Blocked-by:** BUG-010 — the report-submit path must land on the Item-A `requireUser` gate with `reportedBy` bound to `req.userId`, **not** the current unauthenticated, body-trusted `POST /api/reports`. Sequence FEAT-010's submit after BUG-010 A1. *(Prior SPIKE-001 coordination is subsumed by BUG-010, the spike's implementation ticket.)*
- **Legacy:** moderation gap analysis Tier 1 · SPIKE-001 (moderator `reports.js` auth posture) · relates to TASK-014 (rejection-notice emails)
- **Cost/Benefit:** done — **proceed (timeline-first slice); best cost/value ratio of the four.** The `Report` model + `POST /api/reports` already exist, so this is mostly SPA work. **Hard prerequisite:** it must ship on top of the SPIKE-001 / design-doc Item A auth gate (`requireUser` + bind `reportedBy` to `req.userId`), NOT against today's unauthenticated, body-trusted reports endpoint. Independent of FEAT-009 — can run in parallel.
  - **Cost — M, skewing low.** The backend exists: `services/moderator/models/Report.js` has a fixed `reason` ENUM (`spam, harassment, hate_speech, violence, nsfw, misinformation, copyright, personal_info, other`) and `contentType` incl. `post`/`message`/`file`, plus `POST /api/reports` (`services/moderator/routes/reports.js`). So the reason picker binds to a known enum (satisfies the no-JSON-only-modals rule with no new categories endpoint). Frontend: a "Report" action in the timeline `PostCard` overflow (`web/src/features/timeline/PostCard.tsx` exists) + the spark message overflow, a structured reason form + confirmation, and a double-report guard (unique `reportedBy`+`contentId` — minor backend add). New components under `web/src/features/moderation/`.
  - **Complexity/risk — LOW, with ONE real dependency.** `reports.js POST /` is currently **unauthenticated and trusts `reportedBy` from the body** (SPIKE-001; design doc Item A). A user-report UI must **not** ship against that spoofable surface — it needs the designed `requireUser` middleware and `reportedBy` bound to the validated `req.userId`. Small, already-designed backend change, but it must land with or before the UI. This dependency is on **Item A**, NOT on FEAT-009.
  - **Infra/ops — none.** No new schema (the `Report` table exists), no new module, no worker.
  - **Value — HIGH per unit cost; cheapest of the four.** A user-facing "report abuse" path is effectively table-stakes / app-store-review expectation for public UGC, and it is the human-in-the-loop complement to FEAT-009 (auto-moderation) and FEAT-011 (block).
  - **Cheaper alt / smaller slice — timeline-only first** (the `PostCard` surface exists), spark reporting as a fast-follow; reason list from the static ENUM (defer any live `GET /reasons` endpoint).
  - **Verdict — proceed, smaller (timeline-first) slice.** Sequence after/with the Item A `requireUser` gate on `reports.js`; independent of FEAT-009 and parallelizable with FEAT-011. Route to sr-developer (SPA + cross-module wiring).
  - **Handoffs — systems-architect / SPIKE-001** own the `reports.js` auth posture (requireUser + identity binding) — the one gating dependency. **product-manager** — confirm the double-report / rate-limit UX. No dba (no schema change beyond an optional unique guard).
  - **Caveat.** Do not ship against the current unauthenticated, body-trusted reports endpoint — without the `requireUser` gate + `reportedBy = req.userId` binding, the UI creates a trivially spoofable mass-report abuse vector.
- **Description:** The moderator `Report` backend (`services/moderator/routes/reports.js`)
  exists, but there is no user-facing way to report/flag content. Add report/flag entry points
  to the timeline and spark post/message overflow menus, wired to the reports endpoints, with a
  reason picker and confirmation.
- **Acceptance criteria:**
  - Timeline posts and spark messages expose a "Report" action in their overflow menu that
    submits to the moderator reports endpoint (routes verified against `API_SURFACE.md`) with
    a structured reason (not a free-text-only blob) — per the "no JSON-only modals" rule, a
    real form bound to live reason categories.
  - A submitted report creates a `Report` row and surfaces in the existing admin
    review/reports surface; the reporter gets confirmation and cannot trivially double-report
    the same item.
  - New/changed frontend lives in `web/src/features/moderation/` + the timeline/spark UIs; no
    backend auth is weakened.
  - The reports endpoint's auth posture matches SPIKE-001's decision (a user report is an
    authenticated write) — do not ship against an unauthenticated write surface without
    reconciling with that spike.
- **Notes:** FEAT — **Cost/Benefit gate applies.** Mostly frontend + light backend wiring;
  the one real dependency is **SPIKE-001** — `reports.js` is currently unauthenticated, and a
  user-report submit path should be an authenticated write, so groom this alongside the
  architect's gating decision. Sized **M**; route to sr-developer (SPA + cross-module wiring)
  once assessed.

### FEAT-011 — Block/mute (baseline social safety) *(Tier 1)*
- **Type:** feature · **Status:** done · **Priority:** P1 · **Size:** L — reconciled 2026-07-27 — merged to `main` (`9d9b48b`)
- **Owner-role:** unassigned · **Blocked-by:** — *(architect + dba sign-off required before commit)*
- **Legacy:** moderation gap analysis Tier 1
- **Cost/Benefit:** done — **proceed (block-first, timeline-first slice).** Confirmed greenfield: no block/mute and no follow/social-graph model exists today, so this is new relationship storage + cross-module enforcement. **systems-architect must scope WHERE the relationship lives (shared queryable store vs per-module) before COMMIT** — that decision drives M vs L. Independent of FEAT-009.
  - **Cost — L until scoped (M achievable as a block-only, single-surface slice).** Confirmed no existing substrate: a repo grep finds no block/mute feature and **no follow/social-graph model** (only `ca/AuditLog` mentions "follow") — so there is no relationship table to extend; it is built from scratch. Need: new block/mute relationship table(s), create/list/undo endpoints, and enforcement on every content-surfacing path (timeline feed filtering, spark delivery / DM prevention). **Enforcement is the expensive, coupled part, not the CRUD.**
  - **Complexity/risk — MEDIUM-HIGH and structural.** Core question: where the relationship lives so enforcement is consistent, not per-module divergent — a **shared queryable store** (queried by timeline + spark) vs **per-module copies**. If it lands in `shared/`, the two-copy discipline applies (`shared/` + `services/shared/`). Real risk = inconsistent enforcement (blocked on timeline but not spark). Hot-path enforcement likely wants a Redis-cached block list (dba).
  - **Infra/ops.** New table(s): sync `db:migrate` creates **new** tables fine (no ALTER trap unless an existing table gains a column). Possible new cross-module query surface (prefer in-process over new `*_SERVICE_URL` HMAC hops) + an optional Redis cache.
  - **Value — HIGH; baseline social safety and table-stakes / app-store expectation** for public UGC. User-controlled (not admin/AI), so independent of and complementary to the moderation pipeline.
  - **Cheaper alt / smaller slice — block only for v1** (drop mute — block is the higher-value safety primitive; mute is a softer preference), and **timeline feed suppression first**, with spark suppression + DM-prevention + mute as fast-follows. Store the relationship in one place, exposed via a queryable endpoint. ~70% of the value at **M** instead of **L**.
  - **Verdict — proceed, smaller (block-first, timeline-first) slice.** Needs **systems-architect** sign-off on the storage locus (shared vs per-module — the structural driver, sets final size) and **dba** on the new table before COMMIT. Independent of FEAT-009; parallelizable with FEAT-010.
  - **Handoffs — systems-architect** — shared-vs-per-module relationship store + cross-module enforcement contract (structural; gates COMMIT). **dba** — new block/mute table(s) (new-table create is safe under sync `db:migrate`) + any Redis block-list cache. If it lands in `shared/`, update both copies. **qa-specialist** — enforcement-consistency tests across surfaces.
  - **Caveat.** Enforcement consistency is the real risk: a block honored on timeline but not on spark/DMs is a safety failure — scope the slice so every **in-scope** surface enforces, rather than shipping partial enforcement broadly.
- **Description:** No block or mute capability exists anywhere on the platform — a baseline
  social-safety gap for public UGC. Add per-user block/mute (a user can block/mute another user
  so their content and interactions are suppressed), enforced across the surfaces where users
  see each other's content (at least timeline + spark).
- **Acceptance criteria:**
  - A user can block and mute another user, and list/undo those relationships, via new
    endpoints (routes verified against `API_SURFACE.md`); the relationship is persisted.
  - Enforcement: a blocked user's posts/messages/interactions are suppressed for the blocker
    on timeline + spark (and DMs are prevented per the agreed semantics); mute suppresses
    surfacing without notifying.
  - Block/mute state is queryable by the consuming modules (shared feature or a queryable
    store), so enforcement is consistent, not per-module divergent.
  - Automated tests cover block-suppression and mute-suppression on at least one surface.
  - Security invariants unchanged; no new open surface.
- **Notes:** FEAT — **Cost/Benefit gate applies.** **Structural** — likely a shared
  spark/timeline capability (where the relationship lives + how each module enforces it) →
  **systems-architect** sign-off; **new table(s)** for the block/mute relationships → **dba**
  sign-off (new table created by sync `db:migrate`; if any existing table gains a column that's
  the ALTER-gap). If it lands in `shared/`, state "update both copies" (`shared/` and
  `services/shared/`). Sized **M–L** (call it **L** until architect scopes shared vs.
  per-module); route to sr-developer once assessed.

### FEAT-012 — Reviewer assignment + claim + SLA timers + backlog-aging on ReviewQueue *(Tier 2)*
- **Type:** feature · **Status:** backlog · **Priority:** P2 · **Size:** M
- **Owner-role:** unassigned · **Blocked-by:** — *(dba sign-off required — ALTER on an existing table)*
- **Legacy:** moderation gap analysis Tier 2 · relates to SPIKE-001 (moderator `review.js`/`metrics.js` auth) + FEAT-020 (analytics)
- **Cost/Benefit:** pending
- **Description:** The `ReviewQueue` has no workflow beyond existence — no reviewer assignment,
  claim/lock, SLA timers, or backlog-aging. Add assignment + claim so two reviewers don't
  double-handle an item, SLA timers per item, and aging surfaced on the admin Queue tab.
- **Acceptance criteria:**
  - A reviewer can claim/assign a `ReviewQueue` item (claim locks it to that reviewer with a
    releasable lock); routes in `services/moderator/routes/review.js`, verified against
    `API_SURFACE.md`.
  - Each item carries an SLA deadline; items past SLA and backlog-aging buckets are computed
    and exposed (surfaced via `services/moderator/services` + `routes/metrics.js` and the admin
    Queue tab).
  - The `ReviewQueue` model (`services/moderator/models/ReviewQueue.js`) gains the
    assignee/claim/SLA columns via a migration whose `up()` is run directly (sync `db:migrate`
    will NOT ALTER an existing table); `npm run db:check` is clean after.
  - Tests cover claim-locking (no double-claim) and SLA-breach flagging.
- **Notes:** FEAT — **Cost/Benefit gate applies.** **Data ticket** — adds columns to the
  **existing** `ReviewQueue` table → the ALTER-gap: **dba** owns the migration and must run its
  `up()` directly (sync `db:migrate` only creates new tables), then `db:check`. Auth posture of
  `review.js`/`metrics.js` ties to **SPIKE-001**. Sized **M**; route to sr-developer once
  assessed.

### FEAT-013 — Strikes/reputation accumulation + shadowban enforcement *(Tier 2)*
- **Type:** feature · **Status:** backlog · **Priority:** P2 · **Size:** L
- **Owner-role:** unassigned · **Blocked-by:** — *(dba sign-off required)*
- **Legacy:** moderation gap analysis Tier 2 · relates to FEAT-009 (pipeline propagation)
- **Cost/Benefit:** pending
- **Description:** Moderation actions don't accumulate: there's no strike/reputation tally per
  user and no shadowban enforcement. Add strike/reputation accumulation on `UserAction`, with
  thresholds that trigger enforcement (incl. shadowban — the user's content is suppressed to
  others without notice), propagated to the source services so enforcement is real.
- **Acceptance criteria:**
  - Moderation actions accrue strikes/reputation per user (`services/moderator/models/UserAction.js`
    + `services/moderator/services/moderationActions.js`); thresholds are configurable.
  - Crossing a threshold applies an enforcement state (warn / limit / shadowban) that is
    **propagated to the source services** (timeline/spark) and actually suppresses the user's
    content there — verified end-to-end, not just recorded in moderator.
  - A shadowbanned user's own view is unchanged while others don't see their content.
  - Schema changes for accumulation/enforcement state go via a directly-run migration `up()`
    if they ALTER an existing table (sync `db:migrate` won't ALTER); `db:check` clean after.
  - Tests cover threshold-crossing → enforcement and shadowban suppression on one surface.
- **Notes:** FEAT — **Cost/Benefit gate applies.** **Data + propagation** — schema on
  `UserAction` (**dba**; watch the ALTER-gap if extending an existing table) plus a cross-module
  enforcement signal to timeline/spark (this couples with **FEAT-009**'s pipeline — sequence
  after it). Sized **M–L**; call it **L** until the propagation surface is scoped. Route to
  sr-developer once assessed.

### FEAT-014 — Rule versioning + simulation/dry-run (replay a rule change against past content) *(Tier 2)*
- **Type:** feature · **Status:** backlog · **Priority:** P2 · **Size:** M
- **Owner-role:** unassigned · **Blocked-by:** — *(dba sign-off — rule version history)*
- **Legacy:** moderation gap analysis Tier 2
- **Cost/Benefit:** pending
- **Description:** `ModerationRule` changes are made blind — no version history and no way to
  simulate a rule change before it goes live. Add rule versioning (history of edits, with
  rollback) and a dry-run/simulation mode that replays a proposed rule change against a corpus
  of past content and reports what would have changed.
- **Acceptance criteria:**
  - `ModerationRule` edits are versioned (`services/moderator/models/ModerationRule.js` gains a
    version history / a companion history table); a prior version can be viewed and restored.
  - A simulation endpoint runs a candidate rule set through `ruleEngineService.js` against a
    bounded sample of past content and returns the diff (what newly matches / stops matching)
    **without** applying any action.
  - The admin rule builder (`web/src/features/admin/sections/moderator/RuleBuilderDialog.tsx`)
    can trigger a dry-run and show the result before save.
  - Schema for version history: a **new table** is created by sync `db:migrate`; a column added
    to the existing `ModerationRule` table needs its migration `up()` run directly. `db:check`
    clean after.
  - Tests cover version rollback and a simulation diff.
- **Notes:** FEAT — **Cost/Benefit gate applies.** **Data ticket** — version-history storage →
  **dba** (a new history table is fine under sync `db:migrate`; an ALTER on the existing table is
  the gap). Sized **M**; route to sr-developer once assessed.

### FEAT-015 — User-facing appeal UI over the existing appeal backend *(Tier 2)*
- **Type:** feature · **Status:** backlog · **Priority:** P2 · **Size:** S
- **Owner-role:** unassigned · **Blocked-by:** — *(coordinate with SPIKE-001: `appeals` router is one of the 6 unauthenticated routers under review)*
- **Legacy:** moderation gap analysis Tier 2 · SPIKE-001 (moderator `appeals.js` auth posture)
- **Cost/Benefit:** pending
- **Description:** The moderator appeal backend (`services/moderator/routes/appeals.js`) exists
  with no user-facing UI. Add a frontend flow so a user whose content was actioned can view the
  decision and submit an appeal, and see its status.
- **Acceptance criteria:**
  - A user can see that their content was actioned and submit an appeal via a structured form
    (bound to live data, not JSON-only) wired to the appeals endpoints (verified against
    `API_SURFACE.md`); appeal status is visible to the user.
  - New frontend lives under `web/`; no backend auth is weakened.
  - The appeals endpoint auth posture matches **SPIKE-001**'s decision (an appeal submit is an
    authenticated write) — reconcile before shipping.
- **Notes:** FEAT — **Cost/Benefit gate applies.** Frontend-mostly over an existing backend;
  the dependency is **SPIKE-001** (`appeals.js` currently unauthenticated — a user appeal is an
  authenticated write). Sized **S–M** (call it **S** if the backend needs no change); route by
  final size — S with crisp acceptance to jr-developer, else sr — once assessed.

### FEAT-016 — Image/video moderation productionization (unify vision path into live pipeline + video frame sampling) *(Tier 2)* — **SUPERSEDED**
- **Type:** feature · **Status:** deferred *(superseded — do not build)* · **Priority:** P2 · **Size:** L
- **Owner-role:** unassigned · **Blocked-by:** — *(sequence after FEAT-009 — the live pipeline it plugs into)*
- **Legacy:** moderation gap analysis Tier 2 · relates to FEAT-009 (central pipeline) + FEAT-008 (CSAM hashing)
- **Superseded-by:** FEAT-072 / FEAT-073 / FEAT-074 (ADR-0005). Reason: this ticket proposed
  productionizing vision/video moderation via the per-call **cloud** AI providers
  (`services/moderator/src/ai-providers/` — claude/deepseek/openai). ADR-0005 (Accepted, 2026-07-14)
  chose the **local Ollama** async-only path instead (in-Docker vision model behind a circuit breaker,
  queue-only, video via ffmpeg keyframe sampling). Do **not** build both — the local path is the
  decided direction; the cloud-provider approach here is parked. Revisit trigger: only if ADR-0005 is
  reversed or if a cloud-provider moderation lane is explicitly re-scoped by Rick.
- **Cost/Benefit:** pending *(moot — superseded before assessment; see FEAT-072–074 for the approved slice)*
- **Description:** The vision classification path in `services/moderator/services/classification.js`
  is not wired into the live `moderateContent` pipeline, and there is no video handling. Unify the
  vision path into `moderationService.js`'s live flow and add video frame-sampling so videos are
  moderated (not just images), using the existing `services/moderator/src/ai-providers/`.
- **Acceptance criteria:**
  - The vision path in `classification.js` is invoked as part of the live `moderateContent`
    flow in `moderationService.js` (not a dead/parallel path) for image content.
  - Video content is sampled (representative frames extracted) and each sampled frame runs
    through the vision classifiers; an aggregate video verdict is produced.
  - Provider selection uses `services/moderator/src/ai-providers/` (claude/deepseek/openai) and
    is config-driven; costs/limits documented.
  - Tests cover an image verdict via the live pipeline and a video-sampling verdict.
- **Notes:** FEAT — **Cost/Benefit gate applies** (vision/video inference has real per-call cost
  — a genuine C/B weigh). **Depends on FEAT-009** (the pipeline it plugs into) — sequence after
  it; complements **FEAT-008** (perceptual-hash CSAM is a separate, mandatory check, not a
  classifier verdict). Video frame extraction may want the Live ffmpeg tooling — loop
  **systems-architect** if it needs a worker. Sized **L**; route to sr-developer once assessed.

### FEAT-017 — DSA/transparency reporting + retention policy + age-gating *(Tier 3)*
- **Type:** feature · **Status:** backlog · **Priority:** P3 · **Size:** L
- **Owner-role:** unassigned · **Blocked-by:** — *(architect + legal input required before commit)*
- **Legacy:** moderation gap analysis Tier 3 (compliance)
- **Cost/Benefit:** pending
- **Description:** No compliance-reporting, data-retention, or age-gating machinery exists. Add
  DSA-style transparency reporting (aggregate moderation-action reporting for a period), a
  content/moderation-data retention policy (with enforced deletion), and age-gating on
  registration/content. Legal-driven — scope must be set with legal counsel.
- **Acceptance criteria:**
  - A transparency report can be generated for a period (counts of reports, actions, appeals,
    outcomes) in the format legal specifies.
  - A retention policy is defined and **enforced** (moderation/content data past its retention
    window is deleted or anonymized on schedule).
  - Age-gating is applied at the agreed enforcement point(s) with the agreed thresholds.
  - Scope and the specific legal obligations are documented and signed off by legal before build.
- **Notes:** FEAT — **Cost/Benefit gate applies**, and this one additionally **needs legal
  input to even scope the acceptance criteria** (DSA applicability, retention windows, age
  thresholds are legal calls, not engineering). **systems-architect** for the reporting +
  retention-enforcement design (likely a scheduled worker + new tables → **dba**). Escalate the
  legal-scope question up rather than guessing. Sized **L** (probably decomposable per pillar —
  transparency / retention / age-gating — once legal scopes it); route once assessed.

### FEAT-018 — PII detection (emails/phones/SSN/doxxing) in the moderation pipeline *(Tier 3)*
- **Type:** feature · **Status:** backlog · **Priority:** P3 · **Size:** M
- **Owner-role:** unassigned · **Blocked-by:** — *(sequence after FEAT-009 — plugs into the pipeline)*
- **Legacy:** moderation gap analysis Tier 3 · relates to FEAT-009 (central pipeline)
- **Cost/Benefit:** pending
- **Description:** The moderation pipeline does not detect PII/doxxing. Add PII detection
  (emails, phone numbers, SSNs, and doxxing patterns) as a classifier in the moderation flow so
  content exposing personal information can be flagged/held.
- **Acceptance criteria:**
  - A PII detector runs as part of `moderateContent` (via FEAT-009's pipeline) and flags
    content containing emails/phones/SSNs/known doxxing patterns, with a confidence/type on the
    verdict.
  - Detection rules are configurable (which PII classes are enforced) and false-positive-tuned
    against a documented sample.
  - Tests cover each PII class (positive) and clean content (negative).
- **Notes:** FEAT — **Cost/Benefit gate applies.** Plugs into **FEAT-009**'s pipeline —
  sequence after it. Likely integrates with `classification.js`/`ruleEngineService.js`; may use
  a library or an AI provider (`src/ai-providers/`) — a build-vs-buy weigh for the C/B. Sized
  **M–L** (call it **M** for a regex/library baseline; larger if AI-provider-backed); route to
  sr-developer once assessed.

### FEAT-019 — Spam/bot/coordinated-behavior detection (velocity / cross-content) *(Tier 3)*
- **Type:** feature · **Status:** backlog · **Priority:** P3 · **Size:** L
- **Owner-role:** unassigned · **Blocked-by:** — *(architect + dba sign-off — cross-content velocity state)*
- **Legacy:** moderation gap analysis Tier 3 · relates to FEAT-009 (pipeline) + FEAT-013 (reputation)
- **Cost/Benefit:** pending
- **Description:** No spam/bot or coordinated-inauthentic-behavior detection exists. Add
  velocity-based and cross-content signals (e.g. post/message rate, duplicate/near-duplicate
  content across accounts, coordinated bursts) feeding the moderation pipeline.
- **Acceptance criteria:**
  - Velocity signals (per-user/content rate over a window) and cross-content similarity signals
    are computed and feed a spam/coordination verdict into the moderation flow.
  - Thresholds are configurable; a flagged burst/duplicate cluster is surfaced to review
    (and can feed FEAT-013 reputation).
  - The velocity/similarity state is stored appropriately (Redis for rate windows; a table for
    persisted clusters) — data/queue design signed off by dba.
  - Tests cover a velocity trip and a near-duplicate cross-account cluster.
- **Notes:** FEAT — **Cost/Benefit gate applies.** **Structural + data** — needs a place for
  velocity/cross-content state (Redis windows and/or a new table) → **systems-architect** +
  **dba** sign-off; couples with **FEAT-009** (pipeline) and **FEAT-013** (reputation). Sized
  **M–L**; call it **L** until the state design is scoped. Route to sr-developer once assessed.

### FEAT-020 — Moderation analytics dashboard (accuracy, appeal-rate, SLA-breach, backlog-aging) *(Tier 3)*
- **Type:** feature · **Status:** backlog · **Priority:** P3 · **Size:** M
- **Owner-role:** unassigned · **Blocked-by:** — *(coordinate with SPIKE-001: `metrics.js` auth posture; relates to FEAT-012 SLA/aging data)*
- **Legacy:** moderation gap analysis Tier 3 · SPIKE-001 (moderator `metrics.js` auth) · relates to FEAT-012 (SLA/backlog-aging source data)
- **Cost/Benefit:** pending
- **Description:** There is no moderation analytics surface. Add a dashboard reporting moderation
  accuracy, appeal-rate, SLA-breach rate, and backlog-aging, backed by
  `services/moderator/services` + `routes/metrics.js` and rendered on the admin Metrics tab.
- **Acceptance criteria:**
  - Metrics are computed and exposed via the moderator metrics endpoint (verified against
    `API_SURFACE.md`): moderation accuracy, appeal rate, SLA-breach rate, backlog-aging buckets.
  - The admin Metrics tab renders them (charts/tables, real data bound — not JSON-only).
  - SLA-breach / backlog-aging metrics reuse the data FEAT-012 introduces (sequence after or
    alongside it); accuracy/appeal-rate derive from existing action/appeal records.
  - `metrics.js` auth posture matches **SPIKE-001**'s decision (admin-gated read).
- **Notes:** FEAT — **Cost/Benefit gate applies.** Reporting layer over existing/near-existing
  data; the real dependencies are **FEAT-012** (SLA/aging source data) and **SPIKE-001**
  (`metrics.js` gating). Sized **M**; route to sr-developer once assessed.

### FEAT-021 — Cortex: local-LLM agents/guardrails module (port of the MacOS LLM engine)
- **Type:** feature · **Status:** done (merged to main `f649073`, 2026-07-09; review fix `f62f569` — SSRF redirect-hop re-check) · **Priority:** P1 · **Size:** L
- **Owner-role:** sr-developer · **Blocked-by:** —
- **Legacy:** —
- **Cost/Benefit:** done — engine already exists and is proven standalone (the
  MacOS LLM Node service); the cost is a port to platform conventions, the benefit
  is CA-gated local-LLM inference, agents, guardrails, skills, and tools available
  to every module with zero cloud-API spend.
- **Description:** Port the agents engine from the standalone MacOS LLM service
  (agent tool-calling loop, guardrail engine with test-gated lifecycle, custom
  tool/skill registries, task runner, human-review escalations, CS chat/email
  flows) into a new `services/cortex/` module (prefix `/cortex`, schema `cortex`).
  Inference stays on the llama.cpp router (OpenAI-compatible, CORTEX_LLM_BASE_URL,
  default http://127.0.0.1:8080/v1). Storage moves from disk JSON to Sequelize in
  the `cortex` schema. Ships behind `CORTEX_ENABLED` (default false) mirroring the
  plugins convention: mounts inert, tables sync, health answers, everything else
  503s. Every prompt/skill/tool/agent endpoint requires a CA bearer token
  (`validateCAToken`); registry mutations and reviews are platform-admin gated.
  Long-running tasks run on a Bull queue (`worker:cortex`); interactive chat is
  in-process with an LLM concurrency semaphore.
- **Acceptance criteria:**
  - `npm run lint` clean; `npm run db:migrate` shows `✓ cortex`; `test:all` green.
  - All `/cortex/api/v1/*` routes return 401 without a bearer token and 503 when
    `CORTEX_ENABLED=false`; `/cortex/health` is public.
  - Registry save/build/test/run/enable/disable/delete and the reviews queue
    require platform admin; guardrail/tool enable remains test-gated.
  - With a llama router up: a POSTed task completes through the Bull worker with
    a guarded transcript; a cs/chat turn that trips an output guardrail creates a
    pending review whose approval appends a `sent_after_review` message.
  - Python tool execution is OFF by default (`CORTEX_PYTHON_TOOLS_ENABLED`);
    HTTP tools reject loopback/private hosts by default.
- **Notes:** Coexists with moderator: cortex owns local-LLM inference and
  guardrails; moderator keeps cloud-provider moderation. Optional cross-screen via
  `CORTEX_MODERATE` (fail-open call to `/moderator/api/moderate/content` with
  service HMAC headers). Deliberate exclusions from the port: dataset/data-library
  tools, SSE streaming (polling first; Socket.IO namespace is a follow-up), chat
  attachments, MCP server. Follow-up ticket needed for python-tool sandboxing
  before production enablement.

### FEAT-022 — Cortex frontend: chat, agent tasks, CS flows + admin registries in the SPA
- **Type:** feature · **Status:** done (merged `d83572d`; QA click-through passed 2026-07-09 against a live `CORTEX_ENABLED=true` gateway + llama router + `worker:cortex` — see Verification below) · **Priority:** P1 · **Size:** L
- **Owner-role:** sr-developer · **Blocked-by:** FEAT-021 (merged)
- **Cost/Benefit:** user-directed (Rick, 2026-07-09) — FEAT-021 ships a full REST
  surface with zero UI; without a frontend the module is unusable outside curl.
  Cost is UI-only (no backend changes); benefit is making every ported feature
  operable.
- **Description:** Build the `web/` SPA surfaces for the cortex module.
  User-facing (`/cortex` route, workspace nav): assistant chat with session
  list/history, model picker (`GET /models`), skill picker, and guardrail-status
  rendering on replies (`sent` / `blocked_*` / `escalated_*`); agent tasks —
  create (goal/model/tools/skills), list, and a detail view polling
  `GET /tasks/:id` (react-query `refetchInterval`) that renders the transcript
  (assistant turns, tool calls, guardrail hits); CS chat + CS email demo panels
  and the outbox list/detail. Admin (`/admin/cortex` section, tabs): overview
  (health/router/queue), guardrails / tools / skills registry managers with
  structured builder+editor dialogs (no JSON-only modals), test/run/enable/
  disable/delete lifecycle actions, review queue (approve/reject with note,
  409 handling), and prompt-log browser with channel/session/text filters.
  API thunks in `src/api/cortex.ts` + `src/api/admin/cortex.ts`.
- **Acceptance criteria:**
  - All routes/nav entries render with 0 console errors; `npm run web:build` and
    `npm run web:test` green.
  - Non-admin users never see admin-only tabs/actions; admin gating mirrors
    `RequireAdmin` and the backend 403s.
  - When cortex is disabled (`503 CORTEX_DISABLED`) the pages show a clear
    "module disabled" state instead of raw errors.
  - Registry dialogs are structured forms bound to live spec data (JSON only as
    an escape hatch); enable actions surface failing test results.
- **Notes:** No SSE/socket yet on the backend — task/review views poll. A
  `/cortex` Socket.IO namespace is a possible follow-up alongside the backend one.
- **Verification (live click-through, 2026-07-09):** Playwright drove both
  surfaces end-to-end against real local inference (qwen3-30b-a3b).
  User: assistant chat turn returned a real answer; agent task went
  `queued → done` through `worker:cortex` with a transcript showing guardrail-
  screened `write_file`/`read_file`; a CS chat legal threat escalated to
  `held for review`; CS email drafted to the outbox; outbox detail dialog OK.
  Admin: overview/registries/reviews/prompt-log all render; guardrail Test
  report 7/7; structured guardrail + tool + skill editors confirm the
  no-JSON-only-modals rule (JSON is a secondary toggle); tool Run dialog builds
  typed inputs per parameter and surfaces the python gate inline; approving the
  pending review persisted `status=approved` + note + resolver. Console errors:
  0 unexpected (the single 400 is the python-tool gate, rendered inline).
  Dark mode verified via the real theme toggle on both surfaces.
  **Fixed during QA:** `docker/nginx/nginx.conf` module-prefix regex predated
  the cortex merge, so every `/cortex/*` SPA call hit the static server (405) —
  added `cortex` to the proxy location (commit on main).
  **Filed during QA:** BUG-013 (seeded python tools enabled in an API-refused state).

### TASK-021 — Cortex: sandbox python custom-tool execution before production enablement
*(renumbered from TASK-019 at merge: the moderation-routing plan filed a different TASK-019 first)*
- **Type:** task · **Status:** backlog · **Priority:** P1 · **Size:** M
- **Owner-role:** sr-developer · **Blocked-by:** —
- **Description:** `services/cortex/src/engine/tools.js` runs python tools via
  `python3 -I -c` subprocess — arbitrary code execution on the host with no
  filesystem/network isolation. Currently triple-gated (CORTEX_PYTHON_TOOLS_ENABLED
  default false, admin-only save/run/enable, test-gated, guardrail-screened per
  call) but the FEAT-021 posture requires real sandboxing (container, seccomp,
  or a jailed runner with rlimits + no-net) before the flag is ever turned on in
  production. Filed from the FEAT-021 PR notes.
- **Acceptance criteria:** python tool execution cannot read/write outside a
  per-call scratch dir, cannot open sockets, and is cpu/mem/time-limited;
  existing tool tests still pass.

### TASK-022 — Cortex: pin resolved IPs in the http-tool SSRF guard (DNS rebinding)
*(renumbered from TASK-020 at merge: the QA branch filed a different TASK-020 first)*
- **Type:** task · **Status:** backlog · **Priority:** P2 · **Size:** S
- **Owner-role:** sr-developer · **Blocked-by:** —
- **Description:** `assertPublicHost` resolves the target host, checks the
  addresses, then `fetch` re-resolves independently — a short-TTL DNS name can
  pass the check and rebind to a private address for the actual request
  (classic TOCTOU). Redirect hops are already re-checked (FEAT-021 review fix);
  closing rebinding needs the checked IP pinned into the connection (undici
  Agent `connect.lookup` override or dispatching to the literal IP with a Host
  header). Low urgency: tool save/enable is platform-admin-only and private
  ranges are rejected by default, but it should land before http tools are
  exposed beyond admins. Also consider extending `privateIPv4` to the special
  ranges it misses (192.0.0.0/24, 198.18.0.0/15, 224.0.0.0/4, 240.0.0.0/4).
- **Acceptance criteria:** a hostname whose DNS answer changes between check
  and connect cannot reach a private address; unit test with a stubbed lookup.

### TASK-023 — Vision moderation: supply a labeled corpus and run the recall gate
- **Type:** task · **Status:** deferred (Rick, 2026-07-10 — no unsafe-image corpus to source; harness stays built and honest, verdicts escalate-only)· **Priority:** P1 · **Size:** M
- **Owner-role:** qa-specialist + Rick · **Blocked-by:** — · **Relates:** FEAT-030, FEAT-031
- **Description:** Both reviewers made enabling the `moderateImage` verdict
  conditional on a per-category accuracy benchmark. The harness now exists:
  `scripts/eval/vision-recall.js <corpus-dir>`. It reports recall, false
  negatives, precision, false-positive rate (i.e. human-review load), and
  per-category recall; it exits non-zero unless every category clears the bar
  (`VISION_EVAL_MIN_RECALL`, default 0.9) with at least 20 unsafe and 20 benign
  cases. Verified: on a benign-only corpus it correctly reports recall as
  **UNMEASURED** and FAILS, rather than claiming 100% accuracy — that
  "we tested nothing and it passed" outcome is precisely what the gate prevents.
- **What is blocked:** the harness has no corpus, and one cannot be synthesized.
  Measuring the false-negative rate of an NSFW/violence classifier requires real
  labeled unsafe imagery. That is a sourcing/handling/legal decision for Rick —
  options include an existing internal moderation-review set (already-flagged
  user content), a licensed academic benchmark, or a vendor-supplied test set.
  **Until a corpus is run, `CORTEX_MODERATION_MODE` must stay `off`/`shadow` and
  the image verdict must stay escalate-only.**
- **Acceptance criteria:** a corpus of ≥20 unsafe (spread across nsfw / violence
  / hate_symbol / self_harm) and ≥20 benign images; `vision-recall.js` exits 0;
  the report is attached to this ticket; the false-positive rate is reviewed for
  the human-review load it implies before any threshold is lowered.
- **Explicit non-goal:** a general-purpose 3B VLM is **not** a CSAM classifier
  and must not be represented as satisfying any CSAM-detection obligation,
  whatever this harness reports.

### TASK-026 — Image moderation has no shadow rung; document the two-flag relationship
- **Type:** task · **Status:** backlog · **Priority:** P1 · **Size:** M
- **Owner-role:** sr-developer · **Relates:** FEAT-031, TASK-023 (recall corpus), ADR 0002
- **Found:** systems-architect review (2026-07-10), required follow-up to his ruling.
- **Description:** Two gaps opened by the `precomputedResult` seam:
  1. **Image moderation is enforce-only-or-off.** The FileVault worker calls
     `cortex.moderateImage()` through the façade, bypassing `AIProviderFactory`,
     so `CORTEX_MODERATION_MODE=shadow` has **no effect on images** — there is no
     shadow rung at all. That means TASK-023's accuracy benchmark can never gather
     shadow data for images, which is exactly the evidence the enforce decision
     needs. Thread a shadow/enforce distinction into the worker (either honour
     `CORTEX_MODERATION_MODE`, or add `FILEVAULT_IMAGE_MODERATION=shadow|enforce`).
  2. **Two flags, silently unrelated.** `FILEVAULT_IMAGE_MODERATION` governs image
     verdicts; `CORTEX_MODERATION_MODE` governs text ones. An operator setting
     `CORTEX_MODERATION_MODE=off` will reasonably read that as "no cortex
     moderation of any kind" and be wrong. Document the relationship in
     `.env.example` and `ARCHITECTURE.md`.
- **Architect's ruling (recorded):** `FILEVAULT_IMAGE_MODERATION` **is** the correct
  governing flag for the escalate-only worker path — the deviation from ADR 0002 §4
  is accepted because a false image verdict can only add a human-review item, never
  auto-clear or auto-delete. The gaps above are knowingly-accepted, not silent.
- **Acceptance criteria:** image verdicts can run in a shadow mode that scores and
  logs without holding the image; the flag relationship is documented in both
  places; TASK-023's harness can consume image shadow data.

### TASK-024 — `db:check` is blind to nullability and FK `onDelete` (drift gate gap)
- **Type:** task · **Status:** done — QA-VERIFIED closed 2026-07-27 (in-review closeout, Sprint 2026-10) · **Priority:** P1 · **Size:** M
- **Owner-role:** dba · **Found:** DBA review of FEAT-031 (2026-07-10)
- **Resolution:** `check-drift-one.js` now compares column **nullability** and FK
  **`onDelete`/`onUpdate`**. Two subtleties handled so the check is trustworthy
  rather than noisy: (1) a `hasOne`/`belongsTo` FK yields TWO attributes for one
  column (explicit + association-injected) — nullability is aggregated per column
  so the injected nullable duplicate doesn't false-positive; (2) `belongsTo` and
  `hasOne`/`hasMany` carry different default `onDelete` on a non-null FK
  (NO ACTION vs CASCADE), so the effective action is taken from the
  constraint-owning side, else every CASCADE FK would be flagged. Verified: the
  fixed `FileModeration.file_id` produces NO finding. Running across all modules
  surfaced 17 pre-existing divergences → `scripts/drift-allow.json` (documented
  allowlist; each entry has a reason + ticket). `db:check` PRINTS every finding
  but only FAILS on non-allowlisted ones — proven both directions. STATUS.md
  updated. Backlog of the 17 tracked as BUG-025.
- **QA closeout (2026-07-27):** Verified in `scripts/check-drift-one.js` — nullability
  aggregation (:184–190) and FK `onDelete`/`onUpdate` comparison (:264–268) both present;
  `drift-allow.json` holds 9 reasoned entries. Fresh `db:check` run skipped (no `exprsn`
  DB reachable in the QA env); corroborated by BUG-025's recorded live verification.

### BUG-027 — Room-shared file keeps serving to a room after the owner flips it to private (durable-share residual)
- **Type:** bug · **Status:** done — QA-VERIFIED closed 2026-07-27 (in-review closeout, Sprint 2026-10) · **Priority:** P3 · **Size:** S
- **Owner-role:** sr-developer · **Relates:** BUG-024, BUG-026, **FEAT-061** · **Found:** QA re-verify of BUG-026 (2026-07-10)

> **RESOLVED.** The "Decision needed (PM/architect)" below is now answered — **Rick chose
> provenance-aware revoke (2026-07-13)**, which is exactly the "per-share access model (who shared it,
> were they the owner)" this ticket proposed as the alternative to a blanket ownership-skip.
>
> `live.room_files.shared_as_owner` records whether the sharer owned the file at share time
> (migration `20250101000006`, run + verified, with a join-derived backfill). `fileService` now applies
> one predicate — `shareGrantAllows()` — at **both** the download and the listing path:
> a **non-owner's** share stops serving the moment the owner flips the file private (the fix); an
> **owner's** share of their own file keeps working (the flow the visibility-skip was traded for).
> Fails closed when provenance is absent. The FEAT-031 moderation gate still applies independently.
> 16/16 tests green. QA: verify a non-owner share dies on private-flip **and disappears from
> `GET /live/api/rooms/:id/files`**, while an owner-shared private file still serves.
- **Description:** A file legitimately shared into a live room while `public`/`shared`
  (or owned by the sharer) keeps being served to that room's members even if the
  owner later flips its visibility to `private`. `downloadFileStreamForMember`
  re-checks the moderation gate on every fetch but NOT visibility — by design, so
  the legitimate "owner shares their OWN private file into a room" flow keeps
  working (re-checking visibility would break it).
- **Severity:** low. Access was legitimately granted at share time; this is the
  "you can't unsend an already-delivered message" property, not a fresh disclosure
  (the sharer had access when they shared). But an owner may reasonably expect a
  later private-flip to revoke room access.
- **Decision needed (PM/architect):** is durable room-share acceptable, or should a
  visibility-flip revoke room access? If the latter, `downloadFileStreamForMember`
  would need a per-share access model (who shared it, were they the owner) rather
  than a blanket ownership-skip. Not a merge blocker for BUG-024/026.
- **QA closeout (2026-07-27):** `shareGrantAllows()` fail-closed at both download and
  listing; `sharedAsOwner` provenance derived from the verified file at all three mint
  sites; backfill migration joins `filevault.files` for true values; filevault suites
  62/62 PASS. Pre-existing stale exact-arg assertions in live `roomFiles.test.js` filed
  as **BUG-054** (test-only, does not invalidate the fix).

### BUG-025 — Triage the 17 pre-existing nullability/FK divergences surfaced by TASK-024
- **Type:** bug · **Status:** done — QA-VERIFIED 2026-07-10 (branch `feat/cortex-followups`, HEAD `04d350d`, live DB `exprsn`). `npm run db:check` exits 0 with exactly the 9 allowlisted findings printed (all `ticket:null`, permanent by-design: 8 ca cross-schema user/target refs + timeline polymorphic `entity_id`). Genuineness spot-checks against the live DB, not the allowlist: `ca.crl_counters_issuer_id_fkey` confdeltype=`c` (ON DELETE CASCADE, model-was-right migration `20260710000001` applied); `filevault.thumbnails_file_id_fkey` confdeltype=`c` (absent from allowlist, passes genuinely). Cross-schema claim proven: `ca.users` = 0 rows; all 10210 `ca.certificates.user_id` and all 341998 `ca.tokens.user_id` resolve to `auth.users` — so an in-DB FK to `ca.users` would reject every insert and a cross-schema FK breaks per-schema isolation → allowlist reasoning is real. `filevault`/`auth`/`moderator` etc. report no drift, i.e. the aligned models match live. · **Priority:** P2 · **Size:** M
- **Owner-role:** dba · **Relates:** TASK-024, FEAT-031 · **Found:** TASK-024 (2026-07-10)
- **Description:** With the enhanced `db:check`, 17 pre-existing divergences are now
  visible and allowlisted in `scripts/drift-allow.json`. Each needs a decision:
  fix the schema, fix the model, or accept-and-document. The set:
  - **filevault `file_versions.file_id`, `share_links.file_id`** — ✅ **FIXED
    2026-07-10** (`20260710000002-fix-fileversion-sharelink-fk-cascade.js`): both
    now NOT NULL + ON DELETE CASCADE (0 null rows; applied; idempotent; models +
    associations updated so a fresh sync matches). Removed from the allowlist —
    they now pass `db:check` genuinely, not by exception.
  - **filevault `thumbnails.file_id`, `downloads.file_id`; moderator
    `user_actions.related_report_id`; auth `organization_members.{userId,organizationId}`;
    ca `crl_counters.issuer_id`** — onDelete mismatches (model vs live). Decide which
    is correct and align the other.
  - **ca `*.user_id` / `target_id` (8), timeline `attachments.entity_id`** — no live
    FK constraint. Likely intentional (cross-schema user refs; polymorphic
    `entity_id`). Confirm and, if intentional, drop the `references` from the model
    or keep the allowlist entry permanently. `entity_id` is already marked BY DESIGN.
- **Acceptance criteria:** each of the 17 is resolved (migration) or its allowlist
  entry carries a permanent-by-design reason; the allowlist shrinks accordingly.
- **How to work it:** `npm run db:check` prints all of them; remove an entry from
  `scripts/drift-allow.json` to make the gate fail on it while you fix it.

- **Description:** `scripts/check-drift.js` compares missing tables/columns, ENUM
  values, and indexes — but **not** column nullability and **not** foreign-key
  `onDelete`/`onUpdate` behavior. That is not academic: `FileModeration` declared
  `file_id` as `allowNull: false`, while Sequelize's `hasOne` default
  (`ON DELETE SET NULL`) silently forced the live column **nullable** and would
  have orphaned moderation rows on a hard file delete. `db:check` reported
  "no drift" throughout. Any model in the repo could carry the same divergence
  today and the gate would not say so.
- **Acceptance criteria:** `db:check` flags a nullability mismatch and an FK
  `onDelete` mismatch; run it across all modules and file whatever it surfaces
  (expect other pre-existing divergences). Note the limitation in STATUS.md until
  fixed.

### TASK-025 — FileVault: reconcile images stuck `pending` with no queue job
- **Type:** task · **Status:** done — QA-VERIFIED closed 2026-07-27 (in-review closeout, Sprint 2026-10) · **Priority:** P2 · **Size:** S
- **Owner-role:** sr-developer · **Relates:** FEAT-031 · **Found:** DBA review (2026-07-10)
- **Description:** The moderation job is enqueued after the upload transaction
  commits, deliberately and best-effort. If the process dies between commit and
  enqueue, or Redis is down at that moment, the row stays `pending` forever —
  permanently hidden, with no job that will ever clear it. This is **fail-closed
  (safe)**, but it is an ops/data-quality hole with no recovery sweep.
- **Acceptance criteria:** a periodic reconciler re-enqueues rows that are
  `pending` beyond N minutes with no waiting/active Bull job; it is idempotent and
  cannot resurrect a resolved verdict.
- **QA closeout (2026-07-27):** `reconcileStuckPending()` in
  `services/filevault/src/worker.js` meets all AC (periodic + grace window; skips live
  queue jobs; selects only `pending`/`shadow_pending` so resolved verdicts cannot be
  resurrected); `reconcile.test.js` PASS.

### BUG-016 — FileVault: `jobId: file:<id>` will silently no-op a future re-moderation
- **Type:** bug · **Status:** done — QA-VERIFIED closed 2026-07-27 (in-review closeout, Sprint 2026-10) · **Priority:** P3 · **Size:** S
- **Owner-role:** sr-developer · **Relates:** FEAT-031, BUG-018, BUG-021 · **Found:** DBA review (2026-07-10)
- **Description:** The queue dedups on `jobId: file:<id>`, which is correct for
  its purpose (collapsing duplicate enqueues of one upload). But Bull treats
  `add()` with an existing jobId as a no-op while that job's key survives in
  Redis — completed jobs are retained 1h, failed ones 24h. So the moment a
  "re-moderate this image" action exists (model upgrade, human overturn), it will
  do **nothing** for any file moderated in the last hour, with no error.
- **PRIMARY FIXED:** re-moderation landed (BUG-018 new-version, BUG-021 restore)
  through `requeueImageModeration()`, which calls `getJob(...).remove()` before
  `add()`. So a re-moderation is no longer silently dropped by a surviving
  completed-job key.
- **Residual (minor, left open deliberately):** `evaluate()`'s patch overwrites
  `verdict`/`provider`/`model`/`riskScore` in place, so a prior *clean* verdict is
  lost locally on re-run. Flagged verdicts are already persisted to moderator by
  the escalate hook, so nothing with audit value is lost; a clean verdict has
  none. If a full local verdict history is ever wanted, persist before overwrite.
- **Note:** `ai_tags` (`text[]`) has no GIN index. Deliberate — tag filtering is
  not a query that runs today. Add `USING GIN (ai_tags)` in the migration of
  whichever ticket introduces tag filtering.
- **QA closeout (2026-07-27):** Primary fixed — `requeueImageModeration()`
  remove-then-add (`queues/imageModeration.js:89–94`), consumed by the BUG-018/BUG-021
  re-moderation paths and the TASK-025 reconciler; `imageModeration.test.js` PASS. The
  residual (`evaluate()` overwrites the prior verdict in place — zero audit loss, flagged
  verdicts persist to moderator) split out as **TASK-054**.

### BUG-017 — FileVault group-file uploads bypass image moderation entirely (served unmoderated)
- **Type:** bug · **Status:** done — QA-VERIFIED 2026-07-10 (HEAD `22629ae`). Live E2E, real `filevault` schema, `FILEVAULT_IMAGE_MODERATION=true`: `uploadGroupFile()` → `FileModeration.status='pending'`; `getFile(other group member)` → `FILE_NOT_FOUND` (hidden); `getFile(uploader)` → SERVED. Unit `imageModeration.test.js` (establishModerationState create). `db:check` filevault no drift; lint clean. Fix `733c842`.· **Priority:** P1 · **Size:** M
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** — · **Relates:** FEAT-031 (verifying) · **Found:** QA live verification 2026-07-10 (branch `main`, commit b56166e)
- **Description:** `fileService.uploadGroupFile()` (the `POST /filevault/api/groups/:groupId/files/upload`
  path — group galleries/files) does **not** create a `FileModeration` row and does **not** enqueue an
  image-moderation job, unlike `uploadFile()`. Because `imageModerationService.isServableToOthers(null)`
  returns `true` ("no record ⇒ predates FEAT-031 / not tracked"), every group-owned image is served to
  all other group members immediately with **no verdict ever run**. This defeats the FEAT-031 chokepoint
  for group content, which ADR 0002 §8 and the FEAT-031 decisions explicitly name in scope ("covers
  Nexus, Spark, Live chat, timeline — they all store pointers to FileVault"; group files funnel through
  `uploadGroupFile`). Fail-closed-pending visibility is simply not applied to group uploads.
- **Steps to reproduce (live, real DB `exprsn`/schema `filevault`, FILEVAULT_IMAGE_MODERATION=true):**
  1. `fileService.uploadGroupFile({ groupId, userId, buffer:<png>, mimetype:'image/png', ... })`.
  2. `FileModeration.findOne({ where:{ fileId } })` → **null** (no row created).
  3. `fileService.getFile(fileId, <a-different-user>)` → returns the file (served).
  - Control: the same image via `uploadFile()` yields `FileModeration.status='pending'` and
    `getFile(fileId, <other-user>)` throws `FILE_NOT_FOUND` (correctly hidden), owner sees own.
- **Expected vs actual:** Expected — a group image starts `pending` (hidden from non-uploaders) and is
  cleared asynchronously, exactly like a user upload. Actual — no moderation row, no queue job, image
  visible to all members with no verdict.
- **Severity:** P1 (recommendation) — a whole in-scope upload class silently skips the safety chokepoint.
- **Notes:** Fix mirrors `uploadFile()`: create the `FileModeration` row inside the same transaction
  (`initialState({ mimetype, metadata })`) and `enqueueImageModeration(file.id)` after commit when
  `status==='pending'`. Also confirm the group serve paths (`GET /filevault/api/groups/:groupId/files`
  listing + the generic `/files/:id/download`) honour the verdict once rows exist. QA verified via
  `services/filevault/src/services/fileService.js` `uploadGroupFile` (lines ~374-434, no moderation
  wiring) and a live repro against Postgres.

### BUG-018 — FileVault new-version upload (updateFile / editor save) is never re-moderated — approve-then-swap bypass
- **Type:** bug · **Status:** done — QA-VERIFIED 2026-07-10 (HEAD `22629ae`). Live E2E: approve a group image → `updateFile()` with new bytes → `FileModeration.status` flips back to `pending`, `currentVersion=2`, `getFile(other)` → `FILE_NOT_FOUND` (SERVED before the update, hidden after). `requeueImageModeration()` removes the stale job before re-adding (BUG-016). Unit `imageModeration.test.js` reset-clears-verdict. Fix `733c842`.· **Priority:** P2 · **Size:** M
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** — · **Relates:** FEAT-031 (verifying), BUG-016 · **Found:** QA live verification 2026-07-10
- **Description:** `fileService.updateFile()` (`PUT /filevault/api/files/:fileId`, the Monaco editor
  save and any new-version upload) writes brand-new content bytes and bumps `currentVersion`, but does
  **not** reset `FileModeration` to `pending`, create a version-scoped moderation record, or enqueue a
  job. The moderation row keeps whatever state v1 had. So a user can upload a benign image (→ `approved`,
  servable), then `PUT` a disallowed image as v2, and the object stays `approved` and is served to
  everyone from the new bytes. The chokepoint covers first upload only, not subsequent content changes.
- **Steps to reproduce:** Upload image A (benign) → wait for `approved`. `PUT /api/files/:id` with image
  B (disallowed). `GET /api/files/:id/download` (as another user) serves image B; `FileModeration.status`
  is still `approved`, no new job was enqueued.
- **Expected vs actual:** Expected — a content-changing new version re-enters moderation (`pending`,
  hidden from others until re-cleared). Actual — moderation state is stale; new bytes served unmoderated.
- **Severity:** P2 (recommendation) — requires the uploader to deliberately swap, but the served content
  is fully unmoderated and visible to others. Distinct from BUG-016 (that is the jobId dedup blocking a
  *deliberate* re-moderation of the *same* bytes; this is a *new-content* version never triggering
  moderation at all). Fix must also coordinate with BUG-016's jobId/generation concern.
- **Notes:** `services/filevault/src/services/fileService.js` `updateFile` (lines ~198-254) has no
  `FileModeration`/`enqueueImageModeration` call.

### BUG-019 — Flagged image does not reliably reach moderator's human review queue (verdict routed through the text pipeline)
- **Type:** bug · **Status:** done — QA-VERIFIED 2026-07-10 (HEAD `22629ae`). Live E2E against the real `moderator` schema, driving `moderateContent()` exactly as `worker.escalate()` does (benign alt-text "two people" + `precomputedResult` nsfw 96 / riskScore 93): persisted `moderation_items` row → `riskScore=93`, `riskLevel=critical`, `nsfwScore=96`, `aiProvider=cortex`, `aiModel=qwen2.5-vl-3b`, `requiresReview=true`, `status=flagged`; AND a `review_queue` row (priority 93, escalated, pending). Text analyzer NOT invoked; unchanged text path preserved. Units `precomputedVerdict.test.js` + `verdictInjection.test.js`. **NOTE: the precomputedResult seam's structural sign-off (ADR 0002 constraint 5) is systems-architect's, not QA's** — behavior verified here. Fix `733c842`.· **Priority:** P2 · **Size:** M
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** — · **Relates:** FEAT-031 (verifying), FEAT-030, ADR 0002 constraint 5 · **Found:** QA verification 2026-07-10
- **Description:** The FileVault moderation worker's `escalate()` (`services/filevault/src/worker.js`)
  routes a flagged image's verdict into moderator via `moderationService.moderateContent({ contentType:
  'image', contentText: <altText||'image'>, contentMetadata:{ imageVerdict } })`. Inside `moderateContent`,
  the disposition is computed by `AIProviderFactory.analyzeContent()` run on the **text** (`contentText`
  — the alt-text, or the literal string `'image'` when tagging failed), NOT on the image verdict. The
  image's real `riskScore`/`nsfwScore` sit only in `contentMetadata.imageVerdict` and never drive
  `overallRisk`, `requiresReview`, or `action`. A high-risk NSFW image with a benign alt-text is therefore
  recorded as low-risk and is **not** added to the review queue (`requiresReview=false`). This is exactly
  the path ADR 0002 constraint 5 **Rejected** ("routing image verdicts through
  `AIProviderFactory.analyzeContent` (text-shaped)"); the intended path — the moderator `cortex` provider's
  `analyzeImage` gated by `CORTEX_MODERATION_MODE` — exists but is never called by the worker.
- **Impact:** The image DOES stay hidden in FileVault (`FileModeration.status='rejected'`, fail-safe for
  content — no unmoderated bytes are served), so this is not a content-leak. But FEAT-031's acceptance
  bullet "a rejected image surfaces through moderator's existing verdict/review path" is not met: a human
  reviewer keying off risk/the review queue never sees it, moderator's audit records it as clean/low-risk,
  and a false-positive hold can never be human-cleared (the object is stuck hidden forever).
- **Steps to reproduce:** Run the worker on an image the VL model flags (`riskScore ≥ threshold`) whose
  alt-text is benign. `FileModeration` → `rejected` (hidden, correct). In moderator, the created
  `moderation_items` row for `contentType='image'` carries the low text-derived risk and no
  `review_queue` entry; the true image risk lives only in `content_metadata.imageVerdict`.
- **Severity:** P2 (recommendation). **Structural** — loop in systems-architect + the moderator owner
  per ADR 0002 constraint 5 (the "moderator-owned sub-ticket of FEAT-031" that was to wire `analyzeImage`
  → verdict → review-queue → audit under `CORTEX_MODERATION_MODE`). QA verified behaviour; the sign-off
  on the internal path is the architect's/moderator owner's.
- **Notes:** `services/filevault/src/worker.js` `escalate()` (lines ~96-118) →
  `services/moderator/services/moderationService.js` `moderateContent` (risk from `analyzeContent`, review
  gated by `requiresReview`, lines ~80-143). Provider `analyzeImage` present at
  `services/moderator/src/ai-providers/cortex.js` but unused by this path.

### BUG-021 — FileVault `restoreVersion()` serves un-revalidated bytes under the current verdict
- **Type:** bug · **Status:** done — QA-VERIFIED 2026-07-10 (HEAD `22629ae`). Live E2E: approve v2 → `restoreVersion(fileId, 1)` → `FileModeration.status` back to `pending`, `currentVersion=3`, `getFile(other)` → `FILE_NOT_FOUND` (SERVED before restore, hidden after). Encrypted-object control: an encrypted image `update` stays `skipped` (servable), NOT wrongly re-queued/hidden (unit `imageModeration.test.js` + live control). Fix `043656b` (centralized `establishModerationState`). · **Priority:** P2 · **Size:** S
- **Owner-role:** sr-developer · **Relates:** FEAT-031, BUG-017, BUG-018
- **Found:** self-audit after BUG-017 — I enumerated every path that writes file
  bytes instead of assuming the one I had wired was the only one.
- **Description:** `versionService.restoreVersion()` repoints `file.storageKey`
  at an older version's bytes while leaving the moderation verdict untouched.
  Versions are not individually moderated, so: approve v2, restore v1, and the
  served bytes are content that was never cleared (or was rejected) — under an
  `approved` status. Same shape as BUG-018, different call site.
- **Fix:** restore resets the row to `pending` (hidden) inside its transaction and
  re-queues via `requeueImageModeration()` after commit.
- **Root cause worth recording:** the "bytes changed ⇒ re-establish moderation
  state" invariant was open-coded at the upload site, so every other byte-writing
  path silently violated it — 4 call sites, 3 bugs. It now lives in one helper,
  `imageModerationService.establishModerationState()`, which all four call. Any
  future path that writes bytes must call it rather than reinvent it.

### BUG-022 — FileVault worker could write a stale verdict onto replaced bytes (TOCTOU)
- **Type:** bug · **Status:** done — QA-VERIFIED 2026-07-10 (HEAD `22629ae`). Verified the compare-and-set on `contentHash`: `services/filevault/tests/unit/workerRace.test.js` (3/3) proves a stale `approved` is never written when the hash changed mid-evaluation (returns `{status:'superseded'}`, row stays `pending`), a file deleted mid-evaluation is handled, and an unchanged file still gets its verdict. Code review of `worker.js`: the `approved`/`rejected` early-return runs BEFORE evaluate (cannot catch the race); the post-evaluate hash re-read does. This answers the reset/re-queue race for BUG-018/021. Fix `8c5104d`. · **Priority:** P2 · **Size:** S
- **Owner-role:** sr-developer · **Relates:** FEAT-031, BUG-018, BUG-021
- **Found:** self-audit while reasoning about the BUG-018/021 reset race.
- **Description:** Image inference takes seconds. The worker read the file row,
  fetched its bytes, evaluated, then wrote the verdict. If `updateFile()` or
  `restoreVersion()` replaced the file's bytes during that window, the worker
  wrote a verdict computed from the **old** bytes onto the **new** content —
  silently re-approving content nothing ever looked at. The worker's
  `approved`/`rejected` early-return does not catch this: it runs *before* the
  evaluation, not after.
- **Fix:** compare-and-set on `contentHash`. The worker pins the hash of the bytes
  it judged, re-reads the row after inference, and discards the verdict if the
  content changed (or the file was deleted), leaving the row `pending` — the write
  path has already queued a fresh job, and `pending` keeps the file hidden
  meanwhile. Returns `{ status: 'superseded' }`.
- **Tests:** `services/filevault/tests/unit/workerRace.test.js` proves the stale
  approval is never written, that an unchanged file still gets its verdict, and
  that a file deleted mid-evaluation is handled.

### BUG-023 — SECURITY: unauthenticated verdict forgery via `POST /api/moderate/batch` (introduced by FEAT-031)
- **Type:** bug · **Status:** done — QA-VERIFIED 2026-07-10 (HEAD `22629ae`). Both routes now apply the strict `sanitizeModerationInput()` allowlist (confirmed at HEAD, lines 66 & 149). `verdictInjection.test.js` (4/4) attacks both real handlers via supertest. QA additionally drove the actual `routes/moderation.js` handlers with adversarial shapes (all inert): top-level `precomputedResult` stripped; nested inside `contentMetadata` inert (the service destructures `precomputedResult` from top-level params only); prototype-pollution keys deliver no verdict and do not pollute `Object.prototype`; sparse `/batch` array where only `items[47]` carries the field → stripped; a string item → no verdict. Robustness note: a `null` item in `/batch` throws (destructure of null) → HTTP 500 for the whole batch — nothing is laundered, but see robustness note below. Live gateway curl probe was blocked by an environment safety classifier, so the equivalent proof is the route-handler-level supertest. Fix `8c5104d` (swept in under BUG-022's commit msg). · **Priority:** P0 · **Size:** S
- **QA robustness observation (minor, not a security defect, not filed):** `/batch` with a `null` (or non-object) item returns HTTP 500 for the entire batch because `sanitizeModerationInput(null)` destructures `null` (default param only guards `undefined`). No verdict is forged; worst case is a self-inflicted 500. Trivial to harden (skip/validate non-object items) when `/batch` gets its `requireService` gate under BUG-010; recorded here rather than as a separate ticket.
- **Owner-role:** sr-developer · **Found:** systems-architect review of the `precomputedResult` seam
- **Relates:** BUG-019 (introduced it), BUG-010 / SPIKE-001 (unauthenticated moderator ingest routes)
- **Description:** BUG-019's fix added a `precomputedResult` parameter to
  `moderationService.moderateContent()`. When present it **skips the AI analyzer**
  and persists the caller's scores verbatim. `/api/moderate/content` was safe (it
  destructures a fixed field allowlist), but **`/api/moderate/batch` forwarded each
  wire-supplied item object wholesale** (`items.map(item => moderateContent(item))`).
  Both routes are **unauthenticated**. So an anonymous caller could POST
  `items: [{ …, precomputedResult: { riskScore: 0 } }]` and forge a verdict.
  Worse, `moderateContent` dedups on `(sourceService, contentType, contentId)` and
  returns the existing row, so a forged verdict is **sticky** — it pre-empts the
  real moderation that would otherwise run later. Impact: launder any
  not-yet-moderated content as clean, or grief a target's upload into the review
  queue with `riskScore: 100`.
- **How it was missed:** I checked `/content`, found its allowlist, and declared
  "no live vulnerability" without enumerating the other routes that reach
  `moderateContent`. The same failure mode as BUG-017 (one upload path checked,
  a second ignored). The architect enumerated them.
- **Fix:** `sanitizeModerationInput()` — a strict allowlist (not a denylist) —
  applied at **both** route boundaries. `precomputedResult` is now reachable only
  by in-process callers; the FileVault worker calls `moderateContent` via direct
  `require`, never HTTP, so it is unaffected.
- **⚠ Landed in commit `8c5104d`, whose message describes only BUG-022** — the fix
  was swept in by a `git add -A`. Recorded here so it is discoverable.
- **Tests:** `services/moderator/tests/unit/verdictInjection.test.js` attacks both
  real route handlers via supertest (forged verdict on `/content`, on every item
  of `/batch`, an unknown future field, and a legitimate-fields-still-pass case).
  The earlier version of that file only grepped the source of `/content` and would
  not have caught this.
- **Not a substitute for BUG-010:** this is defense-in-depth. Durable service-auth
  on moderator's ingest routes must still land.

### BUG-024 — Live room-collab file uploads bypass image moderation (served to room members from local disk)
- **Type:** bug · **Status:** done — QA-VERIFIED 2026-07-10 (branch `feat/cortex-followups`, HEAD `f51a226`). Reroute + membership tightening verified (uploads → FileVault `uploadFile` moderation chokepoint; `downloadFileStreamForMember`/`servableFileIds` hold pending/rejected from non-uploaders, uploader sees own; `requireRoomMember` denies non-members 403, locks out no legitimate member — socket `join-room` also requires a `Participant` row so all signals align). The P1 it introduced (BUG-026) is now fixed and re-verified (see BUG-026). Storage-source `.gitignore` fix genuine (`git ls-files services/filevault/src/storage/` tracks index.js + backends/{disk,s3,ipfs}.js; runtime `/storage/` still ignored). live 64/64, filevault-unit 43/43, lint 0 errors. One low-severity residual noted to PM (revocation-consistency: a file legitimately shared into a room while `public`/`shared` keeps serving to that room's members if the source is later flipped to `private`, because member-download re-checks moderation but not visibility — inherent to the "durable room share" design; not a merge blocker).
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** — · **Relates:** FEAT-031 (ADR 0002 constraint 8 named out-of-scope "live … disk" gap) · **Found:** QA "fifth byte-writing path" audit during FEAT-031 re-verification 2026-07-10
- **Description:** `POST /live/api/rooms/:id/files/upload` (`services/live/src/routes/roomCollab.js`, `kind:'ephemeral'`) writes the raw uploaded bytes straight to local disk (`fs.writeFileSync(path.join(UPLOAD_DIR, roomId, key), req.file.buffer)`) and `GET /live/api/rooms/:id/files/:fileId/download` streams them (`fs.createReadStream(...).pipe(res)`) to **any** authenticated room member. multer accepts any type up to 100 MB, so a user can share an arbitrary image into a live room and it is served to all other participants with **zero moderation** — the exact risk class FEAT-031's chokepoint addresses, but via a storage subsystem that never touches FileVault (so `establishModerationState`/`FileModeration`/the vision worker never run on it). This is NOT a FileVault byte-writing path (all four of those — upload, group upload, updateFile, restoreVersion — do call `establishModerationState`; `routes/files.js` create/upload, `webdav.js` PUT, and `groups.js` all funnel through them, and spark/timeline push bytes to FileVault via the moderated `/api/files/upload`). It is a **separate parallel path**.
- **Scope note:** FEAT-031 ADR 0002 constraint 8 explicitly names "live thumbnails/recordings (disk + video, out of scope)". Room-collab *arbitrary user file sharing* is arguably broader than "thumbnails/recordings", so filing it concretely rather than leaving it as an ADR footnote. **Does NOT fail FEAT-031** (which is scoped to the FileVault chokepoint); whether live-disk shares should be moderated is a PM/architect scope decision.
- **Steps to reproduce:** As room member A, `POST /live/api/rooms/:id/files/upload` with an image. As member B, `GET /live/api/rooms/:id/files/:fileId/download` → the image is served in full, no moderation row, no verdict.
- **Expected vs actual:** Expected (if in scope) — room-shared images enter the same async chokepoint (hidden-pending until cleared). Actual — served immediately, unmoderated.
- **Severity:** P3 (recommendation) — bounded to authenticated room members; requires the PM/architect scope call above. Cleanest fix routes room uploads through FileVault (`fileService.uploadGroupFile`-style) rather than a private disk store, which also gets them dedup/quota/versioning for free.

### BUG-026 — SECURITY: room `files/share` + new member-download serves any user's private FileVault file (ACL bypass, defeats revocation) — introduced by BUG-024
- **Type:** bug · **Status:** done — QA-VERIFIED 2026-07-10 (branch `feat/cortex-followups`, HEAD `f51a226`, fix `d05779f`). Original attack re-run against the real router (mocked fileService): a member sharing a victim's PRIVATE file uuid → `getFile` throws → **404, no RoomFile row created** (nothing for the download path to fetch); a missing file returns the same 404 (no existence oracle). Legit owner-share → 201 with metadata pulled from the VERIFIED file (spoofed body `mimetype`/`size` ignored — got `image/png`/42, not the body's values). Bypass hunt clean: repo-wide there are exactly two `RoomFile.create` sites (`/upload` owner-created, `/share` now gated) and **no** `RoomFile.update`/`upsert`/`bulkCreate`/socket path that plants or mutates a `vault` `file_id` — so `downloadFileStreamForMember` skipping the owner check is sound. shared/public case acceptable: FileVault's own model (`thumbnails.js:80`, `getFile`, `versionService`) treats `shared` == `public` == any-authenticated-user-readable with no per-recipient ACL, so re-sharing one discloses nothing new. live 64/64 (5 new share tests incl. the exact attack). · **Priority:** P1 · **Size:** S
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** — · **Relates:** BUG-024 (introduced it), FEAT-031 · **Found:** QA adversarial verification of the BUG-024/025 batch, branch `feat/cortex-followups`, HEAD `04d350d`, 2026-07-10 (live DB `exprsn`)
- **Description:** BUG-024 rerouted room-collab uploads through FileVault and, to serve
  them back, added `fileService.downloadFileStreamForMember(fileId, requesterId)` — which
  **deliberately skips FileVault's private-visibility/ownership check** and applies only the
  FEAT-031 moderation gate (`canServe`: uploader-exemption + moderation status). Before the
  fix, the room `/download` route 404'd every non-`ephemeral` row, so there was **no**
  roomCollab serve path for `vault` files. The fix activates one. Meanwhile the pre-existing
  `POST /live/api/rooms/:id/files/share` route (`services/live/src/routes/roomCollab.js`
  ~L122) accepts a caller-supplied `fileId` from the request body and creates a `vault`
  `RoomFile` pointing at it **with no check that the sharer owns or can access that file**.
  Chained, any authenticated user can read any other user's private FileVault file by id:
  the `share` route launders an arbitrary `fileId` into the room, and the new member-download
  path serves its bytes because it never consults `file.visibility`/`file.userId` (only
  `canServe`, which for a non-uploader falls through to `isServableToOthers(moderation)` —
  `true` for every `approved`/`skipped`/no-record file, i.e. essentially all non-image files
  and all cleared images).
- **Steps to reproduce (all authenticated; attacker needs only a room they belong to — they can host their own — and knowledge of a victim FileVault file UUID):**
  1. Attacker creates/enters room `R` (host ⇒ member).
  2. `POST /live/api/rooms/R/files/share` with body `{ "fileId": "<victim's private file uuid>", "name": "x" }` → 201, a `vault` `RoomFile` row `rf` is created. No ownership check runs.
  3. `GET /live/api/rooms/R/files/rf/download` → `downloadFileStreamForMember(<victim file>, attacker)` streams the victim's bytes.
- **Expected vs actual:** Expected — sharing/serving a FileVault file into a room must require the sharer (and the file) to be legitimately accessible to them; a private file owned by another user must not be served to a non-owner. Actual — the share route trusts an arbitrary `fileId` and the member-download path skips the FileVault ACL, so a private, non-owned file is served to any room member.
- **Evidence:** QA probe (removed, not committed) drove the real
  `fileService.downloadFileStreamForMember` against a mocked `File{ userId:'victim',
  visibility:'private', moderation:{status:'approved'} }` as requester `'attacker'` → the
  private bytes were returned. The committed test `services/filevault/tests/unit/roomMemberDownload.test.js`
  ("a CLEARED (approved) image IS served to a non-uploader member") already demonstrates the
  same visibility-blind serve — it passes *on* the bug. Code: `downloadFileStreamForMember`
  (`services/filevault/src/services/fileService.js` ~L213) and `servableFileIds` (~L243)
  contain no `file.visibility`/ownership check; the `share` handler contains no `fileId`
  access check.
- **Severity:** P1 (recommendation) — cross-user confidentiality bypass that also defeats
  FileVault access **revocation**: anyone who ever knew a file id retains read access forever
  via this path, even after the file is made private or their access is revoked. Applies to
  `skipped` files (all non-image types — private PDFs/docs) and `approved` images. The one
  barrier is knowing the target UUID (v4, not enumerable, but exposed in URLs / prior API
  responses / attachments / logs). PM/architect to confirm final severity.
- **Notes:** Fix belongs to the BUG-024 change. Likely fix: the `share` route must assert the
  sharer can access `fileId` (e.g. `getFile(fileId, req.user.id)`, which enforces
  visibility/ownership) before creating the `vault` `RoomFile`; and/or `downloadFileStreamForMember`
  should enforce the FileVault ACL for shared (non-uploader-originated) files rather than
  trusting room membership alone. QA does not implement — hand to the BUG-024 developer
  (sr/jr). Membership tightening itself (`requireRoomMember`) is correct in both directions and
  is NOT the defect.

### BUG-020 — Share-link metadata endpoint discloses a held image's existence and filename
- **Type:** bug · **Status:** done — QA-VERIFIED closed 2026-07-27 (in-review closeout, Sprint 2026-10) · **Priority:** P3 · **Size:** S
- **Owner-role:** sr-developer · **Relates:** FEAT-031 · **Found:** QA verification 2026-07-10 (observed, not filed)
- **Description:** `GET /filevault/api/share/:shareLinkId` returns a file's name,
  size, and mimetype without consulting its moderation state. Only the
  `/download` variants are gated. So a share-link holder learns that a held
  (`pending`/`rejected`/`failed`) image exists and what it is called, even though
  the bytes and thumbnail are correctly withheld and every other serve path 404s
  it like a missing file.
- **Severity:** low — disclosure is limited to a capability holder (they must
  already possess the share link + token), and no image content leaks. It is
  nonetheless inconsistent with the "held images are not enumerable" property the
  rest of the chokepoint enforces.
- **Acceptance criteria:** the metadata endpoint 404s for a held image exactly as
  the download path does; a test covers it.
- **QA closeout (2026-07-27):** `assertShareableImage()` 404s the metadata route for
  held/rejected images (uploader exemption deliberately not applied);
  `shareGate.test.js` covers all four cases, PASS.

### FEAT-023 — Cortex as an in-process LLM source for other modules (façade + moderator provider)
- **Type:** feature · **Status:** done · **Priority:** P1 · **Size:** M — reconciled 2026-07-27 — merged to `main` (`ee6e303`)
- **Owner-role:** sr-developer · **Blocked-by:** — · **Legacy:** cross-links TASK-009 (in-process calls)
- **Implemented (2026-07-09):** client placed at `services/cortex/src/client.js`
  (a cortex-owned façade), **not** `shared/utils/cortexClient.js` — per architect
  sign-off `@exprsn/shared` stays a leaf. Moderator provider is shadow-capable and
  `off` by default (`CORTEX_MODERATION_MODE=off|shadow|enforce`), fails **closed**,
  and the loop guard bars cortex from direct selection *and* the fallback chain.
  Tests: `services/cortex/tests/unit/client.test.js` (8 — incl. a proof the façade
  never loads `engine/jobs.js`/models/queues, and that a disabled cortex never
  requires the engine) + `services/moderator/tests/unit/cortexProvider.test.js` (19).
- **Cost/Benefit:** done — **smaller slice / build later on the enforced half.** Build the shared `cortexClient` + moderator provider **in shadow/eval mode** now; do NOT make cortex a *selectable enforced* production moderation provider until a per-category accuracy benchmark vs the cloud providers clears a bar AND the provider is warm/resident + tight-timeout + fail-open-to-cloud (ideally moved off the synchronous publish path). Full assessment: `sprints/assessments/FEAT-023-024-cost-benefit.md`.
- **C/B notes:** No schema/queue/worker → no dba gate. Shared client is low-risk, build now (lazy `agent.js` require; requiring it opens no DB/Redis, and `simpleChat`/`judge` bypass `prompt_logs`). Live run (qwen3-30b-a3b): quality good on 5 obvious cases (strict `JSON.parse` works), but warm latency ~2–3 s and **cold 53.6 s** on the synchronous `/api/moderate/content` path, semaphore concurrency 2 → publish throughput ceiling ~0.8/s and unbounded queueing under load, contending with interactive cortex. **architect:** (1) `cortexClient` placement — `shared/`→module layering inversion + two-copy-of-shared path divergence; (2) whether the cortex verdict can move off the inline `moderateContent` path (async/queued).
- **Decisions (Rick, 2026-07-09):** in-process client (not loopback HTTP);
  cortex is a **selectable** moderation provider alongside the cloud ones, not a
  replacement; explicit loop guard required.
- **Description:** Add `shared/utils/cortexClient.js` — a lazy, fail-soft
  in-process client that other modules use to reach the local LLM. It binds to
  cortex's **inference** layer (`services/cortex/src/engine/agent.js` →
  `simpleChat` / `judge` / `chatCompletion`), **not** its flow layer
  (`engine/jobs.js`). That distinction is load-bearing: `moderatorScreen()` — the
  cortex→moderator call — lives only in `jobs.js`, so binding to `agent.js` makes
  the moderator→cortex→moderator cycle **structurally impossible** rather than
  merely guarded. `agent.js` requires only config + llama + cache (no models, no
  Sequelize, no Bull), so it is safe to require even when cortex is dark.
  Then register a `cortex` provider in moderator's `AIProviderFactory`
  (`services/moderator/src/ai-providers/index.js`), gated on `CORTEX_ENABLED`,
  selectable via `DEFAULT_AI_PROVIDER=cortex` or the per-request `aiProvider`
  override. Add the defence-in-depth loop guard in `moderationService`: a request
  carrying `sourceService === 'cortex'` (or `contentType === 'llm_message'`)
  never selects the cortex provider.
- **Acceptance criteria:**
  - `cortexClient` throws/degrades cleanly (never throws into the caller's
    request path) when `CORTEX_ENABLED=false` or the llama router is down;
    requiring it never opens a DB/Redis connection.
  - Moderator's factory exposes `cortex` only when the flag is on; existing cloud
    providers and the fallback chain are unchanged when it's off.
  - A moderation request with `sourceService: 'cortex'` never routes to the
    cortex provider — unit test proves it (this is the cycle guard).
  - Cortex's local-LLM verdict maps onto the same score shape the rule engine
    consumes (`toxicity/nsfw/spam/violence/hateSpeech/sentiment` + risk), so
    `ruleEngineService` conditions keep working untouched.
  - `npm run lint` clean; moderator + shared suites green.
- **Notes:** moderator has a second, legacy AI layer (`services/classification.js`
  + `services/claudeAI.js`/`openAI.js`) that is NOT on the live verdict path, and
  an `agentFramework` that is initialized but not wired into `moderateContent`.
  This ticket touches only the live path (`AIProviderFactory`). The unused
  `config.ai.local` block is the natural config home.
- **Architect sign-off:** APPROVED-WITH-CHANGES (systems-architect, 2026-07-09) —
  see ADR `docs/adr/0001-cortex-in-process-inference-facade.md`. Require-graph claim
  verified: `engine/agent.js` transitively pulls in no models/Bull/moderator and
  opens no DB/Redis at import, so the moderator->cortex->moderator cycle is
  structurally impossible when consumers bind to `agent.js`. **Binding constraints:**
  (1) do NOT place the client in `@exprsn/shared` (that inverts the leaf and creates
  a shared->cortex->shared cycle) — cortex publishes a public façade at
  `services/cortex/src/client.js`, consumed via relative require like
  `plugins/pluginHost`; (2) the façade imports only `engine/agent.js`, never
  `engine/jobs.js`/`../models`/`../queues`; (3) a **fail-closed** `CORTEX_ENABLED`
  gate runs BEFORE lazy-requiring `agent.js` — flag off = no require, no router
  traffic (today `chatComplete` hits the router regardless of the flag, so the guard
  is mandatory, not cosmetic); (4) the moderator provider fails **CLOSED** on LLM
  error/timeout (throw -> factory fallback; else verdict resolves to requiresReview),
  never fail-open, retain the `sourceService`/`contentType` loop guard; (5) enforce a
  short bounded provider timeout, cortex is NOT `DEFAULT_AI_PROVIDER` on the sync
  publish path, ship shadow/async first pending qa p99 sign-off. No dba review needed
  (no schema/queue topology change). Blocking constraints must be met before VERIFY.

### FEAT-024 — Lowcode: cortex flow action + AI-backed field
- **Type:** feature · **Status:** done · **Priority:** P1 · **Size:** M — reconciled 2026-07-27 — merged to `main` (`b2cf804`)
- **Implemented (2026-07-09):** `cortex` action added to `MODULE_ACTIONS`
  (capability `call:cortex.complete`, clamped timeout, truncated output) — picked
  up automatically by `knownActionTypes()`/`validateActions()`/`flowEngine`, and
  fail-soft for free via `run()`'s existing catch. AI fields declared with
  `aiPrompt` (+ optional `aiSystem`/`aiModel`), validated at design time in
  `typeSystem` but resolved in the async write path (`entityService.applyAiFields`,
  called from `validate()` so create *and* update get it). Prompts interpolate
  sibling values via `{{field_key}}`. Non-obvious bug caught while building:
  `validateRecord` skips AI fields, so an update's prior value never reached
  `res.data` — a disabled cortex or a failed regeneration would have silently
  **nulled the column**; prior values are now carried forward before any early
  return. Tests: `services/lowcode/tests/cortexIntegration.test.js`.
- **Not done (deliberate):** repointing `aiAssist.js` (cloud Anthropic) at cortex
  — kept out to hold the slice small; see the C/B note. File as FEAT-028 if wanted.
- **Owner-role:** sr-developer · **Blocked-by:** FEAT-023 (shared cortex client)
- **Cost/Benefit:** done — **build now.** Low-risk, non-safety-critical, no schema/queue/infra cost; a clean zero-marginal-cost LLM primitive for lowcode. The `cortex` action is auto-discovered by the flow dispatcher and inherits the existing fail-soft `{ error }` contract; the AI field must compute in the async `createRecord`/`updateRecord` path (confirmed: `typeSystem.validateRecord` is sync/pure). Full assessment: `sprints/assessments/FEAT-023-024-cost-benefit.md`.
- **C/B notes:** Smaller slice if capacity is tight — ship (a) the action + (c) the `aiAssist` cortex repoint (both ~S; (c) also drops the hard `CLAUDE_API_KEY` dependency for studio AI-assist) first, defer (b) the AI field (the M driver). Bound AI-field compute with the per-field timeout (in AC) and consider skipping it on bulk/import writes — inline it inherits the ~2–3 s warm / cold-start LLM latency behind the concurrency-2 semaphore. Sequence after FEAT-023's shared client.
- **Description:** (a) Add a `cortex` action type to
  `services/lowcode/src/services/moduleActions.js` (prompt in → text out),
  capability-gated like the existing `send_spark`/`enqueue_job` actions, so it is
  picked up for free by `knownActionTypes()`, `validateActions()`, and the
  `flowEngine` dispatcher. Use the **synchronous** inference path via the shared
  cortex client — cortex's agent *tasks* are Bull-async (202 + poll) and
  `LcFlowRun` only captures synchronous step results, so a task-based action
  would need a poll/callback bridge (out of scope; see FEAT-027).
  (b) Add an AI-backed derived field. Constraint discovered during scoping:
  `typeSystem.validateRecord` is **synchronous and pure**, so an AI field cannot
  ride the existing `formula` path — it must be computed in the async write path
  (`entityService.createRecord` / `updateRecord`).
  (c) Optionally repoint `services/lowcode/src/services/aiAssist.js` (currently a
  direct cloud Anthropic client) at cortex when `CORTEX_ENABLED`, keeping the
  cloud path as fallback.
- **Acceptance criteria:**
  - A flow with a `cortex` action runs end-to-end and its output is recorded on
    the `LcFlowRun` step; with cortex disabled the step records an error and the
    flow does not throw into the emitting request (matches the existing
    fail-soft `moduleActions` contract).
  - The action is capability-gated; a flow without the capability is rejected at
    design-time validation.
  - An entity with an AI field populates it on create/update; a record write
    never blocks indefinitely (LLM timeout surfaces as a field error).
  - `npm run lint` clean; lowcode suite green.
- **Architect sign-off:** APPROVED-WITH-CHANGES (systems-architect, 2026-07-09) —
  see ADR `docs/adr/0001-cortex-in-process-inference-facade.md`. **Binding
  constraints:** (1) consume the cortex public façade `services/cortex/src/client.js`
  (relative require) — NOT a `@exprsn/shared` client; (2) inference path only
  (`simpleChat`/`chatCompletion`), synchronous per the `LcFlowRun` step model; agent
  *tasks* stay out of scope (FEAT-027); (3) both the `cortex` moduleAction and the
  AI-backed field fail **SOFT** per the existing `moduleActions` contract — on LLM
  disabled/down/timeout return `{ error }` / record a field error, never throw into
  the emitting request and never block the write indefinitely; (4) the façade's
  fail-closed `CORTEX_ENABLED` gate means "cortex disabled" surfaces to lowcode as a
  clean error, not a router call. Stays blocked on FEAT-023 (façade must land first).

### FEAT-025 — Nexus: cortex-backed descriptions + report triage *(not in the current slice)*
- **Type:** feature · **Status:** backlog · **Priority:** P2 · **Size:** M
- **Owner-role:** sr-developer · **Blocked-by:** FEAT-023
- **Cost/Benefit:** pending
- **Description:** Nexus has **zero** AI hooks today and does not call
  `/moderator/api/moderate/content` (only case escalation/sync via
  `MODERATOR_SERVICE_URL`). Candidate attach points found during scoping:
  `groupService.createGroup/updateGroup` and `eventService.createEvent/updateEvent`
  (generate or screen `description`), and `moderationService.flagContent` →
  `calculateFlagPriority`/`shouldAutoEscalate` (currently keyword heuristics) for
  LLM report triage.
- **Notes:** Deselected from the first slice by Rick (2026-07-09). Also worth
  fixing here: nexus→moderator still uses the legacy static bearer
  (`NEXUS_SERVICE_TOKEN`) rather than the `deriveServiceToken` HMAC scheme.

### FEAT-026 — Spark: AI on plaintext conversations only *(not in the current slice)*
- **Type:** feature · **Status:** backlog · **Priority:** P2 · **Size:** M
- **Owner-role:** sr-developer · **Blocked-by:** FEAT-023
- **Cost/Benefit:** pending
- **Decision (Rick, 2026-07-09):** **plaintext conversations only.** Server-side
  cortex features act on non-encrypted messages; encrypted threads must surface
  "AI unavailable — end-to-end encrypted" rather than decrypting anything.
- **Description:** Spark is E2EE-capable per message: `Message.content` is
  force-nulled when `encrypted` is true and only `encryptedContent` (ciphertext)
  is stored, with encryption performed client-side in
  `web/src/features/messages/send.ts` + `web/src/lib/crypto.ts`. The server
  therefore **cannot** read encrypted bodies. There is precedent for degrading
  this way: full-text search already indexes only plaintext `content`
  (`searchService.indexMessage` / `messageWorker`), silently skipping E2EE
  messages. Scope: smart-reply / thread-summarize on plaintext conversations;
  encrypted conversations get a clear unavailable state.
- **Notes:** Deselected from the first slice by Rick (2026-07-09). Do NOT route
  decrypted plaintext to cortex without a separate explicit decision — cortex's
  `prompt_logs` table would persist message bodies.

### FEAT-029 — Router: multi-model residency (2+ resident) + a vision model
- **Type:** feature · **Status:** done — **shipped as swap-first, NOT co-resident** · **Priority:** P1 · **Size:** S (was M) — reconciled 2026-07-27 — merged to `main` (sole remainder is an operator action; see body)
- **Resolution (2026-07-09):** Rick accepted both reviewers' recommendation against
  co-residency. `MODELS_MAX` stays **1** and the brain's `ctx-size` stays **16384** —
  no platform-wide context regression, no Metal-OOM exposure. The only change to the
  external router is a new `[qwen2.5-vl-3b]` preset in
  `/Volumes/Storage/MacOS LLM/models.ini` (model + `mmproj` + `ctx-size 4096`),
  applied by hot reload (`GET /models?reload=1`) — **no restart required**.
  Backup written alongside as `models.ini.bak-<epoch>`; rollback = delete the
  section and reload. Verified: `qwen2.5-vl-3b` reports
  `input_modalities: ["text","image"]`; a real completion returned the correct
  answer (53.5 s cold incl. LRU swap, **1.18 s warm**). Files downloaded:
  `Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf` (1.9 GB), `mmproj-…-f16.gguf` (1.2 GB),
  `mmproj-…-Q8_0.gguf` (806 MB, fallback).
  **Co-residency deferred**, not abandoned — revisit only if swap-thrash is measured
  to hurt the synchronous text path (see C/B notes).
- **Follow-up found during verification:** the router can return an unusable/empty
  completion while a model is loading, so the FIRST image call after any text call
  fails. Fixed in FEAT-030 (`ensureVisionResident`), which also handles the
  async-load and concurrent-load-refused cases.
- **⚠ MEASURED SWAP COST INVALIDATES THE SWAP-FIRST PREMISE (2026-07-09):** both
  reviewers argued a swap is invisible "because image work is async." That holds in
  ONE direction only. Measured on this machine at `MODELS_MAX=1`:
  - load vision (2 GB), evicting brain: **67 s**
  - load brain (17 GB), evicting vision: **401 s (6.7 min)**
  The swap *back* to text is paid by the **next interactive chat request**, which is
  synchronous, and the cortex text client's default timeout is 5 s — so after any
  image job, assistant chat fails for ~7 minutes. The asymmetry is memory pressure:
  the brain alone wires 22.9 GB of a ~25.8 GB Metal ceiling, so re-loading it is a
  disk read under compressor pressure. (Its very first cold load, on an otherwise
  idle machine, was only 52 s.)
- **RESOLUTION — CPU-only vision, MEASURED AND CONFIRMED (2026-07-09):** run the
  vision model with `n-gpu-layers = 0`. It then consumes **no Metal/VRAM budget**, so
  it co-resides with the GPU-resident brain with no OOM risk and **no swapping in
  either direction**. Measured in CPU mode: first load **53.5 s** (one-time),
  image inference **2.97 s cold / 0.25 s warm** — well inside the async budget.
  Note the router spawns a **separate `llama-server` child process per model**, so a
  CPU-only child genuinely allocates nothing on the GPU. `n-gpu-layers = 0` is now
  set on the `[qwen2.5-vl-3b]` preset with the rationale inline.
- **⚠ BLOCKED on one operator action.** `MODELS_MAX` is still effectively **1**: the
  router is launchd-managed (`~/Library/LaunchAgents/com.macosllm.router.plist`,
  `KeepAlive=true`) and the plist hardcodes `--models-max 1`, so killing/restarting
  the router respawns it with 1 and the vision model still LRU-evicts the brain
  (eviction is count-based — CPU-mode alone does not prevent it). `start-server.sh`'s
  default was updated to 2 (with rationale), which covers non-launchd runs.
  Regenerating the plist requires installing launchd login items, which the agent is
  not permitted to do unprompted. **Operator command:**
  `MODELS_MAX=2 "/Volumes/Storage/MacOS LLM/start-server.sh" autostart`
  Backups written: `models.ini.bak-<epoch>`, `start-server.sh.bak-<epoch>`,
  `/tmp/com.macosllm.router.plist.bak`. Rollback = restore and re-run `autostart`.
  Until this runs, image jobs still evict the text brain (401 s to swap back).
  Neither the original co-residency nor the swap-first option contemplated splitting
  the two models
  across GPU and CPU.
- **Owner-role:** sr-developer · **Blocked-by:** — · **Cost/Benefit:** done — **build later / smaller slice (swap-first).** Ship the vision chain on `MODELS_MAX=1` swap, keep brain `ctx=16384`; co-residency trades a permanent brain-context halving + a catastrophic Metal-OOM tail (blast radius = the whole LLM layer) for marginally better warm image latency on a ~1.5 GB un-load-tested margin — not worth buying on unproven need since image work is async. Full assessment: `sprints/assessments/FEAT-029-030-031-cost-benefit.md`.
- **C/B notes:** Mechanical build is **S** (external router only, no in-repo change); the real cost is operational risk + a platform-wide `ctx 16384→8192` regression that halves context for every text feature (agent-task tool transcripts break first). FEAT-031 is async-via-Bull, so a 53.6 s cold **swap** is tolerable and removes ALL OOM risk; text load is sporadic/human-paced so swap-thrash is bounded and mostly absorbed by the image queue. **Decouple: drop FEAT-030/031's `blocked-by: FEAT-029`.** Measure swap-thrash under real mixed load first; pursue co-residency only if thrash is shown to hurt the sync text path AND a load test proves the margin holds (prefer `mmproj-Q8_0` for +0.5 GB). **architect:** platform-wide ctx regression on the external router.
- **Scope note:** touches the **external** llama.cpp router project at
  `/Volumes/Storage/MacOS LLM/` (models.ini, start-server.sh), NOT this repo.
  Rick authorized editing it, downloading the model, and restarting the router
  (2026-07-09).
- **Description:** The router already supports `--models-max` with LRU eviction,
  but `start-server.sh` pins `MODELS_MAX=1`. `models.ini` documents why: llama.cpp's
  auto-fit only sees its own process's allocations, so "two big models resident =
  Metal OOM," which poisons the Metal backend
  (`kIOGPUCommandBufferCallbackErrorOutOfMemory`). Raise to 2 with an explicit,
  measured memory budget rather than relying on auto-fit.
- **Measured facts (2026-07-09, M2 Max):** 34.4 GB unified; Metal recommended
  working set ≈ 25.8 GB. With only `qwen3-30b-a3b` resident at `ctx-size=16384`,
  **wired = 22.9 GB, free = 0.1 GB, 5.5 GB already compressed** → real headroom
  ≈ 2.9 GB. A 7B VLM (~6.1 GB) does NOT fit; the initial "23 GB fits in 32 GB"
  estimate counted weights only and was wrong.
- **Decision (Rick):** `Qwen2.5-VL-3B-Instruct-Q4_K_M` (1.93 GB) + `mmproj-f16`
  (1.34 GB) ≈ 3.3 GB, and drop the brain's `ctx-size` 16384 → 8192 to free KV
  cache. Target ≈ 24.3 GB against a ~25.8 GB ceiling.
- **Acceptance criteria:**
  - `GET /models` shows the vision model with `input_modalities: ["text","image"]`.
  - Both brain and vision model report `status: loaded` simultaneously.
  - A real image completion succeeds; no `kIOGPU…OutOfMemory` in the router log.
  - Wired memory stays under the Metal recommended working set under load.
  - Rollback documented (revert `MODELS_MAX`, restore `ctx-size`).
- **Notes:** `mmproj-Q8_0` (0.84 GB) is downloaded as a fallback if f16 is too tight.
- **Architect sign-off:** APPROVED-WITH-CHANGES (advisory — external router, outside
  platform-repo authority) — 2026-07-09, ADR `docs/adr/0002-*.md`. I disagree with the
  co-residency choice and recommend the alternative: `MODELS_MAX=1` + LRU swap + **batch** the
  FEAT-031 async image queue, keeping the brain at `ctx-size=16384`. Rationale — image work is
  async so the ~53s swap is invisible to users; co-residency has only ~1.5 GB margin (auto-fit
  already mis-estimated once → hard Metal OOM that poisons the backend) AND halving brain ctx
  degrades every long-context feature (12-step agent loop w/ 16000-char tool results; CS KB
  inlining). That trades a hard-OOM risk + universal ctx regression for latency nobody waits on.
  Rick decides. **If co-residency is kept**, binding: explicit measured memory budget (not
  auto-fit), a wired-memory guard/alert vs the Metal working set, documented rollback, and
  regression-test the agent/CS features at 8192 ctx before FEAT-030/031 depend on it; add queue
  batching regardless.

### FEAT-030 — Cortex: vision inference surface (image moderation + tagging)
- **Type:** feature · **Status:** done — QA PASS 2026-07-10 (branch `main`, commit b56166e).
  Every acceptance bullet verified live against the resident `qwen2.5-vl-3b` model + real DB/Redis
  (not just unit suites). Vision surface landed 2026-07-09 (describeImage + moderateImage engine,
  decode/EXIF/bomb guards, separate vision pool + own timeout, cold-swap residency handling, no
  bytes near prompt_logs). Enforcement consumption stays gated behind FEAT-031's moderator-owned
  eval-harness slice per the C/B. · **Priority:** P1 · **Size:** M
- **QA verification (2026-07-10):** cortex Jest 124/124, filevault imageModeration 19/19, moderator
  cortexProvider 23/23; `npm run lint` clean (0 errors). Live/adversarial: PNG/JPEG/WebP + genuine
  4-frame animated GIF all decode; corrupt/empty/SVG → typed `UNSUPPORTED_IMAGE` (no crash); 4000×3000
  downscaled to 1024×768 (not sent whole); decompression-bomb guard fires (`Input image exceeds pixel
  limit`); EXIF/GPS present on input, **absent** on the re-encoded frame and not in the verdict meta;
  `moderateImage` throws on undecodable bytes (fails CLOSED), `describeImage` fails soft; live
  `prompt_logs` stayed at 9 rows after real image inference, no base64/data-URI/vision rows, no
  `cortex*` Redis keys (privacy invariant holds). **Probe — animated-GIF bypass:** normalize samples
  frames [0,2,3] of a 4-frame GIF (includes the last frame); the model's description of a
  green→green→green→red GIF referenced the later (red/black) frame, so frame sampling is NOT bypassed.
  **Probe — tagging silent-outage:** `describeImage` now returns non-empty tags live (the 2026-07-09
  malformed-JSON regression is fixed by the temp-0.1→0.7 resample retry). No FEAT-030-specific defects.
- **Owner-role:** sr-developer · **Blocked-by:** FEAT-029 (drop — decouple, ship on `MODELS_MAX=1` swap) · **Cost/Benefit:** done — **build now (tagging) / gate (moderation), smaller slice.** `describeImage` (fail-soft, alt-text + tags) ships now, no eval gate; `moderateImage` builds behind a shadow/recall eval harness and may only **escalate** to human review, never auto-clear. Full assessment: `sprints/assessments/FEAT-029-030-031-cost-benefit.md`.
- **C/B notes:** Size **M**, split **S** (describeImage) + **M** (moderateImage + decode guards + eval). Corrections: **no `CORTEX_VISION_MODEL` config key exists** (`src/config/index.js` L95–105 has brain/judge only) — add one; **`sharp` is not declared in `services/cortex/package.json`** (resolves only via root hoist) — declare it. Decode is a real DoS surface: set `sharp` `limitInputPixels` (default ~268 MP is too high), byte cap, `sequentialRead`, `failOn`. Animated GIF/WebP: hard frame cap (3–5 sampled) — too few = safety gap, too many = semaphore stall + context blowup on the 3B model. Keep base64 image parts out of `prompt_logs`.
- **Description:** Teach cortex to send images to the router. `lib/llama.js`'s
  `chatComplete` already speaks the OpenAI chat schema, so vision is a content-part
  array (`{type:'image_url', image_url:{url:'data:image/png;base64,…'}}`) against
  the vision model. Add to the public façade (`services/cortex/src/client.js`, ADR
  0001): `describeImage(buffer, {mime})` → tags/alt-text, and `moderateImage(buffer)`
  → the same score shape the rule engine consumes. Normalize input with `sharp`
  (already a dependency): decode PNG/JPEG/GIF/WebP/AVIF/TIFF, auto-orient, strip
  EXIF, downscale to the model's expected max edge, and for **animated** GIF/WebP
  sample N frames (sharp reads pages) rather than only frame 0.
  Same invariants as the text path: `CORTEX_ENABLED` fails closed *before* the
  lazy require; bounded timeout; binds to the inference layer, never `engine/jobs.js`.
- **Acceptance criteria:**
  - PNG, JPEG, GIF (incl. animated), WebP accepted; unsupported/corrupt input is a
    clean typed error, never a crash.
  - An oversized image is downscaled, not sent whole (guard prompt/context blowup).
  - EXIF stripped before inference (no GPS/camera metadata reaches the model or logs).
  - `moderateImage` fails CLOSED; `describeImage` fails SOFT.
  - Decode is bounded (pixel-count / decompression-bomb guard).
- **Architect sign-off:** APPROVED-WITH-CHANGES — 2026-07-09, ADR `docs/adr/0002-*.md`
  (binding constraints 1-4, 7-vision-timeout). Required: (1) façade **owns** model selection —
  `describeImage`/`moderateImage` take NO model arg, and preflight `CORTEX_VISION_MODEL` against
  `GET /models` `architecture.input_modalities` (`image` required); unset/absent/text-only →
  typed `CortexVisionUnavailableError` (moderateImage fails closed, describeImage soft); memoize
  the check. (2) **Separate vision semaphore pool** in `lib/llama.js`
  (`CORTEX_VISION_CONCURRENCY`, default 1) distinct from `CORTEX_LLM_CONCURRENCY` — async image
  work must not occupy interactive text slots (current `withSlot` is a single global pool).
  (3) Own generous timeout `CORTEX_VISION_TIMEOUT_MS` (~60s, not the 5s text budget); vision
  barred from any synchronous request path. (4) Privacy is structural: route via
  `lib/llama.chatComplete` (NOT `engine/jobs.js`, never `logPrompt` — verified `logPrompt` is
  jobs-only, so bytes cannot reach `cortex.prompt_logs`); never log `messages`/`image_url`/data
  URIs to Winston; no image bytes as a Redis value (hash-key + text-value only — verified safe).
  EXIF: `.rotate()` then re-encode, NO `.withMetadata()`; `limitInputPixels`. Config keys land
  in `src/config/index.js` + `.env.example`.

### FEAT-031 — FileVault upload chokepoint: async image moderation + tagging
- **Type:** feature · **Status:** done (reconciled 2026-07-27 — merged to `main`) — **QA RE-VERIFICATION COMPLETE 2026-07-10 (HEAD `22629ae`): PASS on all acceptance criteria.** Every previously-failed bullet now verified live: BUG-017 (group upload hidden-pending), BUG-018 (new version re-hidden), BUG-021 (restore re-hidden), BUG-019 (flagged image → `moderation_items` with the IMAGE's scores + `review_queue` row, `aiProvider=cortex`) — all → `done`. Plus the two dev-found follow-ons BUG-022 (worker TOCTOU) + BUG-023 (P0 verdict-forgery on `/batch`) verified → `done`. `db:check` no drift (all modules); touched files lint clean; filevault unit 26/26, cortex 124/124, moderator `precomputedVerdict`+`verdictInjection` green. **QA gate is satisfied.** Ticket stays `in-review` pending the two remaining NON-QA gates the ticket names: (1) systems-architect confirmation that the `precomputedResult` seam satisfies ADR 0002 constraint 5 (structural sign-off, not QA's to give — architect already reviewed the seam and surfaced BUG-023), and (2) TASK-023 (vision recall corpus) before any verdict drives *automation* (verdict is escalate-only today, so this gates future automation). Also fixed pre-merge: DBA-found FK cascade/NOT NULL (`1d58480`). Named out-of-scope live-disk gap tracked as BUG-024.
  Core user-upload path is solid; the in-scope chokepoint holes are now closed and re-verified. · **Priority:** P1 · **Size:** L
- **QA verification (2026-07-10, branch `main` commit b56166e; real DB `exprsn`/schema `filevault`,
  resident `qwen2.5-vl-3b`):** filevault imageModeration Jest 19/19; live worker E2E on the real DB +
  model — benign→`approved` with populated tags/altText and NO pixel data in the verdict; corrupt
  bytes→`failed` (UNSUPPORTED_IMAGE is permanent, NOT retried); router-down→stays `pending` (hidden) and
  throws `VISION_UNAVAILABLE` for Bull retry; `prompt_logs` unchanged (no image bytes). Gating matrix +
  live `getFile`: `pending`/`rejected`/`failed` hidden from other users AND anonymous (share) callers,
  uploader sees own, held → `FILE_NOT_FOUND` (same as missing, no oracle); share-link and thumbnail
  serve paths both re-assert the verdict. Encrypted (`metadata.encrypted/e2ee/encryption`) and non-images
  → `skipped` WITHOUT decode; `FILEVAULT_IMAGE_MODERATION=false` → `skipped`/servable (distinct from the
  cortex-unavailable `pending`/hidden state). Upload path enqueues after commit with `jobId file:<id>`
  (idempotent double-enqueue) — no inference on the write path.
  **FAILED acceptance bullets → bounce:**
  - "A `pending`/`rejected`/`failed` image is NOT served to other users…": **FAILS for group-owned
    images** — `uploadGroupFile()` creates no `FileModeration` row and never enqueues, so group images
    are served unmoderated to all members (live repro). → **BUG-017 (P1)**. Also new versions
    (`updateFile`/editor save) are never re-moderated (approve-then-swap) → **BUG-018 (P2)**.
  - "A rejected image surfaces through moderator's existing verdict/review path": **FAILS** — the
    worker's `escalate()` routes the verdict through the text pipeline (`analyzeContent` on the alt-text),
    the approach ADR 0002 constraint 5 Rejected; a flagged image is held (fail-safe) but does not reach
    the human review queue. → **BUG-019 (P2)**, structural — needs systems-architect + moderator owner.
  - Filed defects: BUG-017, BUG-018, BUG-019 (see Bugs above). BUG-016 (jobId re-moderation no-op) still open.
- **Implemented (2026-07-10, commit `90586f8`):** side table `file_moderation`
  (NOT columns on `files` — the sync-based `db:migrate` creates new tables but
  will not ALTER existing ones; table syncs clean, `db:check` no drift). Bull
  queue `filevault-image-moderation` + `npm run worker:filevault-moderation`.
  The moderation row is created **inside the upload transaction** so an image can
  never exist without a visibility state; the job is enqueued **after commit**.
  Verdict fails CLOSED, tags/alt-text fail SOFT. Escalate-only: a flagged image is
  held and routed to moderator's review queue, never auto-deleted. Encrypted
  objects and non-images are skipped explicitly — ciphertext never reaches the
  decoder. Retries `attempts:4` + exponential backoff (image moderation IS
  idempotent, unlike cortex agent tasks); `UNSUPPORTED_IMAGE` fails immediately
  rather than burning retries. 19 unit tests; lint 0 errors.
- **Design correction made during implementation:** "feature off" and "cortex
  unavailable" must NOT collapse to the same state. Feature off ⇒ `skipped`
  (servable, platform behaves as before). Feature on but cortex/router down ⇒
  `pending` (hidden). Collapsing them would either hide every image on a
  deployment that never wanted moderation, or silently serve unmoderated images on
  one that did. Hence `FILEVAULT_IMAGE_MODERATION` is separate from `CORTEX_ENABLED`.
- **Two serve-path bypasses found and closed:**
  1. `routes/share.js` passed the file OWNER's id into `downloadFileStream` (to
     satisfy `getFile`'s private-visibility check), which would have granted every
     anonymous share-link visitor the *uploader's* moderation exemption. Gated
     explicitly rather than nulling the id — nulling breaks share links for
     private files.
  2. `routes/thumbnails.js` queries `File` directly, bypassing `getFile`. A
     thumbnail of a held image is still the image; it now has its own check.
  Held images 404 exactly like missing ones (not enumerable).
- **Still open:** dba review of the side table + queue topology; QA
  upload-latency-unchanged verification; the `moderateImage` shadow/recall eval
  gate before any verdict drives automation (per C/B, verdict is escalate-only
  regardless).
- **Owner-role:** sr-developer · **Blocked-by:** FEAT-030 (its `moderateImage`-behind-eval slice) · **Cost/Benefit:** done — **build later / smaller slice.** Sound async-chokepoint design, correctly **L**; high leverage (one hook covers Nexus/Spark/Live/timeline). Gated: verdict may only **escalate** to moderator's review queue, never auto-clear, until vision recall clears the bar; tags/alt-text (fail-soft) can wire ahead of the verdict. Full assessment: `sprints/assessments/FEAT-029-030-031-cost-benefit.md`.
- **C/B notes:** **dba:** new Bull queue + worker process, and tags/alt-text/verdict persistence hits the **ALTER-on-existing-table trap** if columns are added to `Attachment`/FileVault tables (sync `db:migrate` won't ALTER → every query 500s) — prefer a new side-table. **architect:** FileVault→cortex + FileVault→moderator coupling, and the contract choice — moderator's cortex provider has **no `analyzeImage`** today (text-only), so either add it or call `cortex.moderateImage` direct and shape into the pipeline. **skip-encrypted** must hold for both `Attachment.encrypted` and FileVault-native encrypted objects (mirror FEAT-026). **qa:** verify upload-latency-unchanged + fail-open-on-cortex-down. **CSAM caveat:** a general 3B VLM is NOT a CSAM classifier — do not represent it as fulfilling a CSAM-detection obligation.
- **Decisions (Rick, 2026-07-09):** one integration at the **FileVault upload
  chokepoint** (covers Nexus, Spark, Live chat, timeline — they all store pointers
  to FileVault) rather than five per-module hooks; **async via Bull**, never blocking
  an upload; produce **both** a moderation verdict (fail closed) and tags/alt-text
  (fail soft); **skip encrypted attachments** (`Attachment.encrypted` / FileVault
  encrypted objects) exactly as FEAT-026 does for text.
- **Description:** On image upload, enqueue a job; a worker fetches the object,
  runs `cortex.moderateImage` + `cortex.describeImage`, persists tags/alt-text and
  routes the verdict through moderator's pipeline (reusing its existing
  `image_moderation` agent contract, `analyzeImage({imageUrl})`), so rules,
  review queue, and audit trail are unchanged.
- **Acceptance criteria:**
  - Upload latency is unchanged (verified); moderation lands asynchronously.
  - An encrypted object is never decoded or sent to the model.
  - With cortex disabled/router down, uploads still succeed; the job records an error.
  - A rejected image surfaces through moderator's existing verdict/review path.
  - No image bytes are written to cortex's `prompt_logs`.
- **Architect sign-off:** APPROVED-WITH-CHANGES — 2026-07-09, ADR `docs/adr/0002-*.md`
  (binding constraints 5, 6, 7, 8). Required: (5) **verdict stays moderator-owned and
  mode-gated** — the moderator `cortex` provider gains `analyzeImage` → `cortex.moderateImage`,
  and image verdicts run through moderator's existing ruleEngine + review-queue + audit gated by
  the SAME `CORTEX_MODERATION_MODE` (off|shadow|enforce), failing closed. **Rejected:** routing
  image verdicts through `AIProviderFactory.analyzeContent` (text-shaped) or relying on the
  currently-dead `ImageModerationAgent` wiring — wiring image moderation into the verdict
  pipeline is a **moderator-owned sub-ticket of FEAT-031** (file it; moderator owner signs which
  internal path carries verdict→queue→audit). Worker splits concerns: tags via
  `cortex.describeImage` directly (soft); verdict via moderator (closed). (6) **Async worker
  runs separately** from the gateway — add `worker:filevault-moderation` root alias + registry
  entry; **dba co-signs** the Bull/Redis/DLQ mechanics. Image moderation IS idempotent, so unlike
  `cortex-tasks` (`attempts:1`) use `attempts:3-5` + exponential backoff (delay 30s) to survive
  router-down / 53s model-swap; DLQ + queue-depth alert; skip encrypted objects (FEAT-026).
  (7) **Pending-visibility is an explicit acceptance criterion** (product-manager + Rick):
  "upload latency unchanged" (write) ≠ "unmoderated content not visible" (read). Default
  fail-closed-pending on sensitive surfaces; file record carries pending/failed moderation
  state; verdict can retroactively hide/remove. (8) **Chokepoint scope stated honestly** — this
  ticket covers **uploaded attachments** (posts/DMs/group files/comments, all funnel through
  FileVault; verified via timeline `attachmentService` + spark `uploadService`). Named gaps to
  file follow-ups: avatar-upload bytes (today `avatarUrl` is an external string ref, out of
  scope), live thumbnails/recordings (disk + video, out of scope), atproto blobs (own pipeline).
  Enqueue at FileVault `uploadService.isImage()` where the buffer + encryption flag are already
  in hand. **Blocked-by:** FEAT-030 (correct).

*(Org signup/onboarding + user-import intake — 2026-07-10. Approved by Rick, scope
clarified via Q&A: BOTH entry points (public self-service wizard + admin-driven
provisioning), full provisioning (per-org intermediate CA + CA directory group +
owner account/roles/cert/org-scoped token + default RBAC group + Nexus group with
spark binding + per-member cert/token), full import upgrade (org-aware, invite
emails, server-side CSV, group-assignment columns), per-org-type provisioning
templates. Grounded in a code audit run today — file/line cites in each ticket.
FEATs filed `backlog` with `Cost/Benefit: pending`; the cost-benefit-analyzer runs
immediately after this filing — per the gate none can leave `backlog` until its
assessment lands. Dependency chain: **FEAT-032** (engine) ← **FEAT-033**
(wizard/admin entry points) and ← **FEAT-035** (import member provisioning);
**FEAT-034** (invite flow) ← **FEAT-035** (import invite emails).)*

### FEAT-032 — Organization provisioning engine + per-type templates (backend core)
- **Type:** feature · **Status:** done · **Priority:** P1 · **Size:** L — reconciled 2026-07-27 — merged to `main` (`8a8000a`)
- **Owner-role:** sr-developer · **Blocked-by:** — *(systems-architect + dba sign-off required before commit — cross-module auth↔CA↔nexus writes + an ALTER on the existing auth `organizations` table)*
- **Legacy:** — (productizes the batch seed path `scripts/seed/seed-main.js`; Rick approval 2026-07-10)
- **Landed (sr-developer · 2026-07-11 · branch `feat/org-signup-provisioning`):** Provisioning engine shipped — `src/provisioning/engine.js` (saga S0–S9 with compensation) + `src/provisioning/templates.js` (per-type map) + `src/provisioning/ledger.js`, a new auth `ProvisioningRun` ledger, a CA directory service (`services/ca/services/directory.js`), and the `memberProvisioningService.provisionMemberCredentials` member-add hook (consumed by FEAT-034/035). **Slice 2 folded in:** nexus social group + spark channels (S7/S8) shipped in the same pass behind a per-template `nexus.create` flag (enterprise/team on) with compensation — decomposition completed in one pass, so **no separate slice-2 ticket is needed**. **ADR-0003** written (`docs/adr/0003-...`). **Migrations applied to `exprsn`:** `organizations.ca_group_id` ALTER (run directly per the sync-migrate trap) + `provisioning_runs` table; `db:check` clean. **Adversarial review (5 lenses) → fixed:** (crit) resume-after-compensation ledger corruption; (high) revoked-cert reuse in the member hook; (high) sibling `POST /organizations` mass-assignment; (med) migration index-guard. Two items **accepted as documented deviations in ADR-0003** — the engine open-codes some auth-model writes via a downward lazy require (acyclic; → TASK-027) and the template token `resourceValue '/'` is bounded by org scope. **Verification:** 37 provisioning tests green (happy×3, S1–S7 rollback matrix, compensation-fails, idempotency incl. retry-after-compensation, preflight aborts, linkage-token, mass-assignment, member hook). **Cross-cutting (whole branch):** full auth suites 103/103 (userImport + invite + signup-policy + equivalence + organization + session), provisioning 37/37, `web:build` green, `db:check` clean (auth 17 models, no drift), `lint` 0 errors. Follow-up filed: **TASK-027** (façade cleanup — ADR-0003 RC-1/RC-5 accepted deviation). Now **in-review** awaiting the human QA/merge gate (qa-specialist moves in-review→done).
- **Cost/Benefit:** done — **proceed, decomposed: engine core (slice 1, L) now; nexus group + spark channel binding as slice 2.** As written this is **XL** (the ticket's own note predicts it) — per README an XL must be broken down before `ready`. The CA primitives and `scripts/seed/seed-main.js` prove every step of the chain, but the orchestration is a request-scoped rewrite, not a lift: the seed is batch/manifest-resume with forked cert/token workers, has no rollback, and mints a **root CA per org** where this ticket wants per-org intermediates under the platform root. The nexus+spark piece is verified net-new coupling (nexus `Group` has no spark-binding field — only generic `metadata`). Backbone of FEAT-033/035 — sequence first in the chain.
- **Cost/Benefit assessment (cost-benefit-analyzer · 2026-07-10): proceed — decompose; build slice 1 first.**
  - **Cost — XL as written; L once decomposed.** Genuinely reusable (verified): entity-cert issuance (`certificateService.createEntityCertificate`, `services/ca/services/certificate.js:263`), root/intermediate issuance (`services/ca/api.js:455,488,562`), org-scoped token issuance with `organizational_unit`/`department` scoping (`services/ca/services/token.js:32,84-111`), and `organizationService.createOrganization`. Rewrite, not reuse: the request-scoped orchestration itself — `seed-main.js` is batch/manifest/fork-worker, idempotent by resume (not by transaction), and its root-per-org topology differs from the intermediate-under-platform-root this ticket specifies. The hard design cost is **transactionality across auth ↔ CA ↔ nexus**: each module owns its own Sequelize instance/schema, so no single wrapping transaction exists as wired — this is a saga with documented compensation + an idempotency key, and that (plus invocation style, in-process vs `SERVICE_TOKEN_SECRET` HMAC HTTP) is the real content of the required architect ADR. Data cost: the linkage column on the **existing** auth `organizations` table is an ALTER (run the migration `up()` directly, `db:check` after — the documented sync-migrate trap); any template table is new and safe under sync. Hardcoded template map keyed on the existing `enterprise/team/personal` ENUM is cheap; admin editability correctly deferred.
  - **Complexity/risk.** Partial-failure orphans (org row commits, CA issuance fails) are the top failure mode — the AC's tested rollback/compensation is the right mitigation, and QA effort there is real (the non-blocking `test:all` suite is not coverage). New cross-module coupling auth↔CA↔nexus (↔spark in slice 2). Per-org RSA keygen is CPU-noticeable but fine at in-house scale. No new unauthenticated surface (admin/service-HMAC callers only, per AC) — good.
  - **Infra/ops & maintenance.** No new process or queue. Key-material growth (one intermediate key per org) must follow existing CA storage practice. The engine becomes a long-lived chokepoint consumed by FEAT-033 and FEAT-035 — maintenance concentrates here, which is the point (exactly one provisioning path), but regressions blast-radius across signup and import.
  - **Value — HIGH.** The only end-to-end provisioning today is a seed script; this productizes it and closes the real auth-Organizations ↔ `ca.groups` split that token-spec v1.1 org scoping already depends on. Hard prerequisite of both approved entry points (FEAT-033) and import provisioning (FEAT-035) — highest-leverage ticket in the chain.
  - **Cheaper alt / smaller slice.** Cheaper alt — lazy linkage (create the CA group/intermediate on first org-scoped token issuance; no engine): **rejected** — spreads provisioning logic across paths, provides no member hook, and doesn't deliver the approved full-provisioning requirement. Smaller slice — **slice 1 (L):** org row + owner membership/roles, CA `organizational_unit` group, per-org intermediate under the platform root, persisted auth-org↔CA-group linkage, owner entity cert + org-scoped token, default auth RBAC group(s), member-add hook, hardcoded template map. **Slice 2 (M):** nexus social group + spark channel binding — drags a 4th module in and needs a place to persist the binding (nexus `Group` has only `metadata` JSONB today); file it as its own ticket at grooming.
  - **Verdict — build now (slice 1), decomposed.** Confirming the ticket's own XL suspicion: split before `ready`. Sequence first; FEAT-034 can run in parallel.
  - **Handoffs — systems-architect:** ADR must cover invocation style **and** the compensation/saga strategy **and** the intermediate-vs-root topology delta from the seed precedent. **dba:** `organizations` ALTER (direct `up()` + `db:check`), template table, and review of compensation deletes. **sr-developer** implements; **qa-specialist:** partial-failure/rollback matrix is the core of the test plan.
  - **Caveat — capacity.** The 2026-08 sr track already carries BUG-010 + FEAT-010 with FEAT-011 next-to-pull; this chain (032 → 033/034 → 035) is 3–4 weeks of mostly-sr work — do not pull it wholesale into the current sprint.
- **Description:** Today `POST /api/organizations`
  (`services/auth/src/routes/organizations.js:18`) creates only the org row +
  owner membership + org-owner role via `organizationService.createOrganization`.
  CA has a **separate, disconnected** org notion — `ca.groups` rows of type
  `organizational_unit`/`department`, used by token-spec v1.1 org scoping
  (`services/ca/services/token.js:32,84-111`) — and auth Organizations are not
  linked to it. Certificates are per-user only; root/intermediate/entity issuance
  exists (`services/ca/api.js:455,488,562`;
  `certificateService.createEntityCertificate`,
  `services/ca/services/certificate.js:263`). The ONLY end-to-end provisioning
  today is the batch seed script `scripts/seed/seed-main.js` (root CA per org,
  intermediate per org, entity cert per user, tokens per user via
  `cert-worker.js`/`token-worker.js`) — this ticket productizes that as a
  one-shot, transactional **provisioning engine**: org row; CA directory group
  (`organizational_unit`) + per-org intermediate CA under the platform root;
  owner/admin account with org-owner/org-admin roles + entity certificate +
  org-scoped CA token; default auth RBAC group(s); a Nexus social group with
  spark channel binding; and a persisted auth-org↔CA-group linkage (e.g. the CA
  group id stored on the auth `Organization`) — created here for the first time.
  Plus **per-org-type provisioning templates** keyed on the existing `type` enum
  `enterprise/team/personal` (`services/auth/src/models/Organization.js`),
  controlling which groups/policies/cert depth/limits get provisioned —
  hardcoded to start, admin-editable later. Also a **member-add hook**: every
  member added (or imported) gets an entity cert + org-scoped token.
- **Acceptance criteria:**
  - A single engine call provisions, transactionally (with documented + tested
    rollback/compensation for partial failure — e.g. CA issuance failing after
    the org row commits): org row + owner membership/roles, CA
    `organizational_unit` group, per-org intermediate CA under the platform
    root, owner entity cert + org-scoped CA token, default auth RBAC group(s),
    and a Nexus group with spark channel binding.
  - The auth `Organization` persists the CA-group linkage; an org-scoped token
    issued through that linkage validates per token spec v1.1 (org scoping
    honored).
  - Templates per org type (`enterprise`/`team`/`personal`) select the
    provisioned groups/policies/cert depth/limits; the hardcoded template map is
    covered by tests (admin editability explicitly out of scope — follow-up).
  - Adding a member to a provisioned org issues that member an entity cert + an
    org-scoped token, exposed as a callable hook (consumed by FEAT-035 import).
  - Module invocation style (in-process require vs `*_SERVICE_URL` HTTP with
    `SERVICE_TOKEN_SECRET` HMAC) is decided by a systems-architect ADR **before
    build** (FEAT-023/ADR-0001 is the precedent); routes verified against
    `API_SURFACE.md` before wiring.
  - Schema: the linkage column on the **existing** `organizations` table is an
    ALTER — its migration `up()` is run directly (sync `db:migrate` will NOT
    ALTER) and `npm run db:check` is clean after; any new tables (e.g. persisted
    templates) are fine under sync `db:migrate`.
  - No new open/unauthenticated surface — the engine is invoked only by
    authenticated admin or service-HMAC callers; security invariants unchanged.
- **Notes:** FEAT — **Cost/Benefit gate applies.** **Structural + data**:
  cross-module writes across auth ↔ CA ↔ nexus (+ spark channel binding) →
  **systems-architect** sign-off + ADR on invocation style; the `organizations`
  ALTER + any template table → **dba** sign-off. This is the backbone both entry
  points (FEAT-033) and import provisioning (FEAT-035) call — sequence it
  **first**. Sized **L** but at the XL boundary: if architect scoping confirms
  XL, decompose (engine core / nexus+spark binding / templates) before `ready`
  per README. Route to sr-developer once assessed.

### FEAT-033 — Org signup entry points: public self-service wizard + admin "provision organization" flow
- **Type:** feature · **Status:** done · **Priority:** P1 · **Size:** L — reconciled 2026-07-27 — merged to `main` (`c27c56d`/`8a8000a`)
- **Owner-role:** sr-developer · **Blocked-by:** FEAT-032 (provisioning engine — both entry points compose it)
- **Legacy:** — (Rick approval 2026-07-10 — entry points: BOTH)
- **Landed (sr-developer · 2026-07-11 · branch `feat/org-signup-provisioning`):** Both approved entry points shipped over the one FEAT-032 engine. New `signupPolicyService` (fail-closed, platform-org scoped); public `POST /auth/api/auth/signup` + `GET /auth/api/auth/signup-policy` + `POST /auth/api/auth/provision-self` (converges the in-app `/orgs` create onto the same engine); verify-before-provision on verify-email; admin "Provision organization" structured form + public multi-step `SignupWizardPage` (`/signup`). **Single-code-path guarantee held:** admin, wizard, and `/orgs` all call the same engine (equivalence test). **Review (2 lenses) → fixed:** (CRIT) `toSafeObject` leaked `emailVerificationToken` in the signup 202 (self-verify bypass) — now stripped for all callers; (high) idempotency key was slug-only → cross-user org hijack, now **owner-scoped** in all provisioning routes; (med) verify-email missing rate limiter (added); (med) anonymous enterprise signup (restricted to team/personal); (med) signup-policy tenant-org fallback (removed → hard fail-closed); (med) orphaned user on failed signup (now deleted for retry); (med) verify-email recoverability. **Verification:** 29 tests green (signup-policy + equivalence + token-not-leaked + owner-scoped-key regressions); whole-branch cross-cutting verification recorded on FEAT-032. Now **in-review** awaiting the human QA/merge gate.
- **Cost/Benefit:** done — **proceed, sliced by half: admin "provision organization" flow first (M, groom with FEAT-032), public self-service wizard next (M).** Both halves stay in scope — the public wizard is an approved requirement; this is sequencing, not descoping. Verified: the SPA has no signup route at all (`web/src/app/router.tsx` — login only) and `allowUserRegistration` is consumed by nothing today (model default + admin form only), so the policy-gate AC is a first-ever consumer, not a rewire. The public half's anonymous endpoint is a resource-amplification surface (each signup mints an org + intermediate CA + certs) — priced as risk/hardening cost below, not grounds to reject.
- **Cost/Benefit assessment (cost-benefit-analyzer · 2026-07-10): proceed — admin slice first, wizard second.**
  - **Cost — L confirmed (two ~M halves).** **Admin half (M, skews low):** replace/extend the name-only create dialogs (admin AuthSection Organizations tab + in-app `/orgs` page) with a structured form invoking the FEAT-032 engine + org-type/template picker — authenticated, existing admin-SPA patterns, no new anonymous surface, satisfies the no-JSON-only-modals rule cheaply. **Public half (M):** new anonymous backend endpoint composing register (`services/auth/src/routes/auth.js:41`; `strictLimiter` already guards `/register` — reusable pattern) + the engine; a multi-step SPA wizard + new public route; fail-closed `allowUserRegistration` consumption; `requireEmailVerification` honoring; plus the frontend publish lane (`web:build` + nginx recreate) as its own cost.
  - **Complexity/risk.** The anonymous org-signup endpoint is the platform's most expensive-per-request anonymous write: RSA keygen for an intermediate CA + cert + rows across three schemas per signup. Mitigations to price in (not blockers): rate limit per AC, provision-after-email-verification ordering, and per-email/IP org caps. Exposure reality: there is **no public deployment yet** (in-house, dev TLS) — real abuse exposure begins at release, so tie the abuse-hardening checklist to the release-engineering track (R1–R6) rather than gating the build. Fail-closed policy gate + no security-invariant changes per AC.
  - **Infra/ops.** Nothing new beyond the engine; ongoing cost is owning a public anonymous surface once deployed (rate-limit tuning, abuse response).
  - **Value.** Admin flow = immediate operator value — today the only full provisioning is a seed script, and the name-only dialog creates half-provisioned orgs. Public wizard = launch-required, but has **zero users until a public deployment exists** — exactly why it can trail the admin slice without losing any realized value.
  - **Cheaper alt / smaller slice.** Cheaper alt — skip the wizard; let users register then create an org via an engine-upgraded `/orgs` dialog: **rejected** (Rick approved BOTH entry points), but it confirms admin-first captures most near-term value. Smaller slice — ship the admin half with/immediately after FEAT-032; wizard as the next slice. The single-code-path AC (both entry points call the same engine) is the load-bearing guarantee — hold it in review.
  - **Verdict — build now (admin slice), build next (public wizard).** Strictly after FEAT-032.
  - **Handoffs — systems-architect:** review the new anonymous write surface at grooming (flagged in the ticket notes — correct). **product-manager:** decide verify-email-before-provision ordering for the wizard UX. **qa-specialist:** `allowUserRegistration` both-states test, rate-limit behavior, and the wizard-vs-admin same-engine equivalence.
- **Description:** `POST /api/auth/register` exists
  (`services/auth/src/routes/auth.js:41`) — it creates user + CA token + session
  + emails, but no roles/certs/org — and the SPA has **no signup page at all**
  (login only; `web/src/app/router.tsx`). The `allowUserRegistration` org-policy
  toggle exists in admin but **nothing consumes it**. Org creation UI today is
  the admin AuthSection Organizations tab plus a name-only create dialog on the
  in-app `/orgs` page. Build both approved entry points over the FEAT-032
  engine: (a) a **public self-service org signup wizard** in `web/` — anonymous
  user creates account + org in one flow via a new backend endpoint composing
  register + the provisioning engine, gated by `allowUserRegistration` and
  honoring `requireEmailVerification`; (b) an **admin-driven "provision
  organization" flow** in the admin SPA that invokes the **same** engine
  (replacing/extending the name-only dialog), so there is exactly one
  provisioning code path.
- **Acceptance criteria:**
  - An anonymous user completes the SPA wizard (account + org details + org
    type) and lands in a fully provisioned org (per the FEAT-032 engine
    guarantees) as its owner; `requireEmailVerification` is honored when set.
  - `allowUserRegistration` is actually consumed: when disabled, the signup
    endpoint rejects **fail-closed** and the SPA hides/disables the wizard entry
    point; a test covers both states.
  - The admin "provision organization" flow calls the same engine — no second
    divergent provisioning path; the org type selects the FEAT-032 template.
  - The wizard and admin dialog are structured forms bound to live data (the
    "no JSON-only modals" rule), with per-step validation.
  - The new anonymous signup endpoint is rate-limited; routes verified against
    `API_SURFACE.md`; security invariants unchanged (no weakening of
    `DEV_BYPASS`/CORS/error-handler; the endpoint is the only new anonymous
    surface and is policy-gated).
- **Notes:** FEAT — **Cost/Benefit gate applies.** Sequenced strictly after
  FEAT-032 (it is a composition layer — wizard/endpoint + admin UI). The public
  half is a **new anonymous write surface** — call that out to the architect at
  grooming even though the engine itself is FEAT-032's structural review. Sized
  **L** (multi-step SPA wizard + new endpoint + admin flow rework); route to
  sr-developer once assessed.

### FEAT-034 — Invite & activation token flow in auth (set-password / activation links)
- **Type:** feature · **Status:** done · **Priority:** P1 · **Size:** M — reconciled 2026-07-27 — merged to `main` (`c27c56d`)
- **Owner-role:** sr-developer · **Blocked-by:** — *(dba sign-off — new invite table in the `auth` schema; new table only, safe under sync `db:migrate`)*
- **Legacy:** — (Rick approval 2026-07-10 — prerequisite for import invite emails)
- **Build (sr-developer · 2026-07-11 · branch `feat/FEAT-034-invite-flow`):** Implemented per plan. New `auth.invitations` table (single-use, sha256-hashed-at-rest, 72h-expiring, superseded-on-reinvite) + parity migration `20260711000001-create-invitations.js`; `inviteService` (`createInvite`/`resolveInvite`/`acceptInvite`/`listInvites`/`revokeInvite`); public `POST /auth/api/auth/accept-invite` (strictLimiter, token-gated — the only new unauthenticated surface); admin `POST`/`GET`/`DELETE /auth/api/users/invites` (CA-token + admin, literal-before-`:id`); `emailService.sendInvitationEmail`/`sendActivationEmail` + 4 templates; SPA `/accept-invite` set-password page; `acceptInvite` wraps user-upsert+status-flip in one txn, FEAT-032 `provisionMemberCredentials` hook called best-effort outside the txn when `organizationId` set. **Verification:** `npm run lint` 0 errors; `npm run db:migrate` + `npm run db:check` clean (auth 17 models, no drift); `tests/invite.test.js` **16/16 pass** (full token-state matrix T1–T12 + accept-route non-enumeration + weak-password) via `AUTH_DB_NAME=exprsn_auth_test`; `npm run web:build` green; API_SURFACE.md rows added. **QA:** token-state matrix + rate-limit on accept (strictLimiter is mocked-off in the auth Jest setup — verify the 429 in a live/un-mocked check).
- **Adversarial review + fixes (sr-developer · 2026-07-11 · branch `feat/org-signup-provisioning`):** Merged onto the org-signup branch and hardened. **Review (2 lenses) → fixed:** (high) account-takeover — the invite path is now **create-only**, activation is bound to its `userId`, and suspended accounts cannot be reactivated; (med) single-use TOCTOU race (row lock + re-assert); (med) MFA-bypass vector (closed by never touching existing accounts); (med) guest over-grant (`roleToSystemSlug` returns null for guest → membership-only). **Verification:** 18 invite tests green incl. account-takeover + suspended + supersede regressions (up from the initial 16/16); whole-branch cross-cutting verification recorded on FEAT-032. Stays **in-review** awaiting the human QA/merge gate.
- **Cost/Benefit:** done — **build now; M confirmed, skews low.** Cheapest ticket in the chain and the best parallel lane: independent of FEAT-032, hard prerequisite of FEAT-035's invite mode. Everything is pattern reuse inside auth — the invite table is a **new** table (safe under sync `db:migrate`, no ALTER trap), the hashed single-use expiring token mirrors the existing password-reset flow, and `emailService` already ships five templates (verification/reset/welcome/security-alert/MFA) to pattern two more on. Nexus `GroupInvite` is correctly treated as a shape reference only.
- **Cost/Benefit assessment (cost-benefit-analyzer · 2026-07-10): build now.**
  - **Cost — M, skewing low.** New invite table in the `auth` schema; create/accept/list/revoke endpoints; two templates on the existing `emailService`; one small SPA set-password/activation page. No queue, no worker, no ALTER, no cross-module writes. One design rule that keeps FEAT-035 cheap later: implement invite creation as a **service function first, HTTP route second**, so batch import calls the function directly instead of looping HTTP.
  - **Complexity/risk — LOW.** The token-gated accept endpoint is the only new unauthenticated surface — rate-limited, single-use, expiring, hashed at rest per AC; same risk class as the existing reset/verify endpoints. The expired/revoked/reused rejection matrix in the AC is the whole test plan.
  - **Infra/ops.** None new; email deliverability is the existing `emailService`'s existing problem.
  - **Value.** Hard prerequisite for FEAT-035's invite-email mode **plus** standalone value now: real org-member invites (today "invite" is just add-member with attribution) and the end of the random-password import UX.
  - **Cheaper alt / smaller slice.** Core = create + email + accept + expiry/revoke semantics + tests. Defer the list/revoke **admin UI** (ship endpoints only) and any resend/reminder polish. Staffing alt: viable **jr-developer with sr review** if the AC stays crisp (per the ticket's own note) — cheapest staffing in the chain.
  - **Verdict — build now;** parallelize with FEAT-032 and land no later than the sprint before FEAT-035.
  - **Handoffs — dba:** light review, new table only. **qa-specialist:** token-state matrix + rate-limit on accept.
- **Description:** No invite/activation-token flow exists in auth today —
  `emailService` has verification/welcome/reset templates only, and org
  "invites" are just add-member with `invitedBy` attribution. (Nexus groups DO
  have an invite-code flow — `services/nexus/src/models/GroupInvite.js`,
  `membershipService.js:141-205,380` — a reference pattern, but it lives in the
  nexus schema and is not reusable for auth accounts.) Build a real invite +
  activation token flow in auth: an invite table, invite creation by org/platform
  admins, invite + activation emails with set-password/activation links, and a
  token-gated acceptance endpoint that sets the password and activates the
  account. Used by org member invites and by user import (FEAT-035's
  invite-email mode).
- **Acceptance criteria:**
  - A new invite table exists in the `auth` schema (new table — sync
    `db:migrate` creates it; no ALTER trap); tokens are single-use, expiring,
    and hashed at rest.
  - Endpoints: create invite (authenticated org-admin/platform-admin with
    proper authz), accept/activate (token-gated public endpoint that sets the
    password and activates the account), and list/revoke; routes verified
    against `API_SURFACE.md`.
  - Invite/activation email templates ship via the existing `emailService`;
    the link lands on a new SPA set-password/activation page that completes the
    flow.
  - An expired, revoked, or already-used token is rejected with a
    correlation-id'd error; a test covers each case plus the happy path.
  - The token-gated accept endpoint is the only new unauthenticated surface and
    is rate-limited; security invariants unchanged.
  - The flow is callable programmatically for batch use (FEAT-035 import
    invite-email mode).
- **Notes:** FEAT — **Cost/Benefit gate applies.** Independent of FEAT-032 —
  parallelizable with it — but a **hard prerequisite of FEAT-035's invite-email
  mode**, so sequence it no later than the import ticket. **dba**: new table
  only (safe under sync `db:migrate`). Sized **M**; route to sr-developer (new
  auth surface), or jr with sr review if the acceptance stays crisp.

### FEAT-035 — User import v2: server-side CSV, org-aware roles, queued large imports, invites + provisioning
- **Type:** feature · **Status:** done · **Priority:** P1 · **Size:** L — reconciled 2026-07-27 — merged to `main` (`8a8000a`)
- **Owner-role:** sr-developer · **Blocked-by:** FEAT-032 (per-member cert/token provisioning hook) · FEAT-034 (invite-email mode) — *the server-side CSV/validation core can start ahead of both, but the ticket is not `done` without them; dba sign-off — Bull queue + import-job state*
- **Legacy:** — (Rick approval 2026-07-10 — user import: ALL upgrades)
- **Landed — Slice A (sr-developer · 2026-07-11 · branch `feat/org-signup-provisioning`):** Server-side streamed CSV import shipped — `multer` (8MB) + `csv-parse` (2000-row synchronous cap), new `userImportService` (parse/validate/resolveImportContext/runImport), rewritten multipart `POST /auth/api/users/import`, org-aware per-row roles + org-admin authz boundary + owner-import policy (owner never assignable by org admins; platform-admin gated behind `allowOwner` and never mutates `Organization.ownerId`), `auth_group` assignment, and lazy flag-gated seams for invite-mode + `provisionCredentials` (FEAT-032 hook) + `nexus_group`; SPA switched to raw-file `ImportDialog`. Also **fixed the shared `addMember` always-org-member bug** (now role-appropriate). **Bull queue deferred** (documented >2k seam → TASK-029). **Review (2 lenses) → fixed:** (CRIT) platform-admin determination honored org-scoped `admin` roles → cross-tenant escalation; fixed **at the shared root** — `hasAdminRole` (`shared/middleware/requireAdmin.js`) + `isAdminUser` (`services/auth/src/routes/users.js`) now require GLOBAL-scoped role bindings; (med) post-create steps made best-effort (no false `failed`); (med) `provisionCredentials`+invite combination now rejected; (low) `nexus_group` cross-tenant hardening documented as a pre-enable requirement (→ TASK-028). **Verification:** 23 import tests green incl. the org-scoped-admin-no-bypass regression; whole-branch cross-cutting verification recorded on FEAT-032. Follow-ups filed: **TASK-028** (harden `nexus_group` authz before enabling `USER_IMPORT_NEXUS_ASSIGN`), **TASK-029** (Bull-queued >2k slice B), **TASK-030** (dedupe `isAdminUser` onto shared `hasAdminRole`). Now **in-review** awaiting the human QA/merge gate.
- **Cost/Benefit:** done — **smaller slice: build the server-side CSV core (M) — streamed raw-CSV endpoint, raised synchronous cap (~2k documented), validation/dedup report, org-aware roles + org-admin authz, SPA raw-file upload — and defer the Bull queue lane behind a revisit trigger.** Invite mode and per-member provisioning complete as FEAT-034/032 land (the core is independently buildable ahead of both, per the Blocked-by note). Full ticket is L skewing high **because of** the queue: Bull is proven platform-wide (moderator/prefetch/timeline/live) and moderator's in-process consumers mean no new worker process is strictly required, but auth has **zero** Bull usage today (verified) — a queue there is new module infra + a dba-owned job-state table, not free reuse, and queued >2k-row imports are speculative at in-house scale.
- **Cost/Benefit assessment (cost-benefit-analyzer · 2026-07-10): smaller slice / phased.**
  - **Cost — full L (skews high); core slice M.** Baseline verified: `POST /api/users/import` (`services/auth/src/routes/users.js:119-156`) is a JSON array with a hard 500-row `slice`, random passwords, no org/roles/emails, and the SPA parses CSV client-side (`ImportDialog`). Core slice: multipart/streamed CSV endpoint (+ a small parser dep), per-row validation + dedup report (v1's `created/skipped/failed` row report extends naturally), raised documented synchronous cap, per-row org role mapping onto `OrganizationMember`, org-admin-runnable authz, SPA switch to raw-file upload. Deferred lane: Bull queue + import-job state table + progress/status endpoint. Group-assignment columns add cross-module writes — the Nexus side wants FEAT-032's linkage, so it lands with the fast-follows.
  - **Complexity/risk.** The **org-admin authz change is the security-relevant piece**: an org admin must be provably unable to import into another org (the AC's boundary test) and per-row `owner` role assignment needs an explicit policy decision at grooming (importing owners is privilege escalation by CSV — recommend org admins may not mint `owner`/`admin` rows above their own role). Second hard rule: stream, never buffer unbounded — the AC has it. Watch the ALTER trap only if an existing auth table gains a column (none expected in the core slice).
  - **Infra/ops.** Core slice: none. Queue lane (when triggered): Bull queue in a module that has none today, job-state retention/cleanup, progress endpoint — real ongoing footprint for an unproven need.
  - **Value.** Real and concentrated in the core: the 500 cap, client-side parsing, and random passwords are today's actual operator pain. Org-aware import is what makes FEAT-032 orgs administrable at scale. The >2k queued path has no demonstrated demand yet — classic build-later.
  - **Cheaper alt / smaller slice.** **Slice A (M, start any time):** server-side streamed CSV + ~2k sync cap + validation/dedup report + org-aware roles/authz + SPA raw upload. **Fast-follows as deps land:** invite-email mode (FEAT-034), per-member cert/token via the FEAT-032 hook, RBAC/Nexus group columns. **Deferred:** Bull queue + job-state table + progress endpoint — revisit trigger: a real import >2k rows, or the synchronous path exceeding a request-timeout budget in practice.
  - **Verdict — smaller slice / phased.** Build slice A when capacity allows (independent of 032/034); the ticket reaches `done` as the dependency-gated modes land; the queue stays deferred until the trigger fires.
  - **Handoffs — dba:** queue + state table review if/when triggered; nothing in slice A should ALTER an existing table — flag immediately if it does. **product-manager:** the org-guest semantics + owner-import policy calls at grooming (both flagged in the AC). **qa-specialist:** authz boundary test, report shape, large-file streaming behavior. **systems-architect:** only if group-assignment wiring crosses modules beyond the FEAT-032 contract.
- **Description:** The existing import is admin-only `POST /api/users/import`
  (`services/auth/src/routes/users.js:119`) — a JSON array with a 500-row cap,
  random passwords, no org/roles/emails — and the admin SPA parses CSV
  **client-side** (`web/src/features/admin/sections/AuthSection.tsx:1975`,
  `ImportDialog`) before hitting it. (CSV **export** already exists
  server-side.) Upgrade to import v2: a server-side raw-CSV endpoint with
  streaming parse, validation + dedup reporting, a raised row cap with queued
  processing for large files; **org-aware** import (into an org, per-row role
  `owner/admin/member/guest`, runnable by **org admins** for their own org, not
  just platform admins); CSV columns for auth RBAC-group and Nexus-group
  assignment; an optional invite-email mode (FEAT-034) replacing random
  passwords; and optional per-member entity-cert + org-scoped-token provisioning
  via the FEAT-032 member hook.
- **Acceptance criteria:**
  - A server-side endpoint accepts raw CSV (multipart/stream) and parses it
    server-side; the admin SPA `ImportDialog` uploads the raw file (client-side
    parsing removed for this path); routes verified against `API_SURFACE.md`.
  - The response/report covers validation per row (row number + reason) and
    dedup against existing users; nothing is partially applied silently.
  - Row cap raised beyond 500; imports above a documented threshold run as a
    queued (Bull) job with a progress/status endpoint — large files are
    streamed, never buffered unbounded; **dba** signs off the queue + any
    import-job state table before commit.
  - Org-aware: rows import into a target org with per-row role
    `owner/admin/member/guest` (mapped onto the existing `OrganizationMember`
    roles + org-guest semantics agreed at grooming); an **org admin** can run an
    import scoped to their own org, and a test proves they **cannot** import
    into another org (authz enforced server-side).
  - CSV columns assign auth RBAC group(s) and Nexus group membership per row;
    invalid group refs surface in the validation report.
  - Invite-email mode: instead of random passwords, each imported user gets a
    FEAT-034 set-password invite; per-member cert + org-scoped-token
    provisioning is invoked via the FEAT-032 hook when enabled.
  - Tests: validation/dedup report shape, org-admin authz boundary, a queued
    large import completing end-to-end, and group-assignment columns applied.
- **Notes:** FEAT — **Cost/Benefit gate applies.** Depends on **FEAT-032** (the
  member provisioning hook) and **FEAT-034** (invite emails) — sequence last in
  the chain, though the CSV/validation/queue core is independently buildable if
  the analyzer recommends slicing. **dba** owns the Bull queue + import-job
  state review (new tables safe under sync `db:migrate`; watch the ALTER trap if
  any existing auth table gains a column). Authz change (org-admin-runnable) is
  security-relevant — include it in review. Sized **L**; route to sr-developer
  once assessed.

---

### FEAT-036 — Full AT-Proto Personal Data Server (PDS) (parent epic)
- **Type:** feature (epic) · **Status:** backlog · **Priority:** P2 · **Size:** XL
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** — (audit of `/Volumes/Storage/exprsn-bluesky`, 2026-07-13)
- **Decomposed into:** FEAT-037 (identity+sessions), FEAT-038 (repo), FEAT-039 (blobs), FEAT-040 (outbound firehose), FEAT-041 (app-view)
- **Cost/Benefit:** done — **BUILD LATER / SMALLER SLICE. Do NOT port `exprsn-bluesky`.**
  **The epic's premise was false: `exprsn-bluesky` is not a real PDS — it is a PDS-shaped mock.** Its
  `generateCID()` is `sha256(JSON.stringify(value))` with the string `"baf"` glued on
  (`services/repositoryService.js:308-314`, and its own comment admits it); there is **no Merkle Search
  Tree and no signed commits anywhere in it**; and the `@atproto/*` SDK packages are **declared in its
  package.json but imported nowhere**. It would not federate — a relay cannot verify commits that do not
  exist. **Porting it yields a convincing-looking PDS that no relay will accept, and the failure is
  invisible until you try to federate.** Ship the **bridge slice (M)** instead — link an external
  `did:plc` account and cross-post via the *already-existing* `services/atproto/src/identity/pdsClient.js`
  and `UserDid.didPlc` — which captures most of the realistic value at a fraction of the cost. Defer the
  full PDS behind FEAT-060 and behind evidence of demand. Full detail: `sprints/assessments/FEAT-036.md`.
- **Description:** `services/atproto` is today an **ingest + labeler only** module
  (`API_SURFACE.md` atproto section): it consumes the Bluesky firehose, runs content
  through the moderator pipeline, serves `com.atproto.label.queryLabels` /
  `subscribeLabels`, and mints `did:exprsn` identities. It is **not a PDS** — there is
  no `com.atproto.server.createSession`, no repo/record writes, no blob store, and no
  outbound `subscribeRepos`. The original `/Volumes/Storage/exprsn-bluesky` implements
  a full PDS (30+ XRPC endpoints, repo/CID storage, blobs, firehose, app-view routers).
  This epic closes that gap so Exprsn users are first-class AT-Proto accounts that
  federate, rather than only being *labelled by* the network.
- **Acceptance criteria:**
  - An external AT-Proto client can create a session against Exprsn, write a record,
    upload a blob, and read its own repo back.
  - A third-party relay can subscribe to our outbound `com.atproto.sync.subscribeRepos`
    and observe our commits.
  - All existing labeler/ingest behaviour still passes.
  - **Tokenization (FEAT-059):** every PDS surface authorizes against a **scoped CA token**
    (FEAT-060) — no AT-Proto endpoint accepts a client-supplied identity, and a revoked CA
    token immediately kills the AT-Proto session, repo access, and blob access. Any
    externally-shareable blob/record URL is issued as a **capability token** (FEAT-061),
    never as an unguessable-but-permanent URL.
- **Notes:** **XL — never promote directly; build the slices.** Reuse what already
  exists rather than porting wholesale: the origin-root `rootApp` mount
  (`src/gateway.js:114`) already serves `/.well-known/*` and `/xrpc/*`, and
  `services/atproto/src/xrpc/subscribeLabels.js` already runs a raw-WS server through
  the gateway upgrade path — the outbound firehose (FEAT-040) should follow that same
  pattern, not introduce a second WS stack. **Architect sign-off required**: a PDS makes
  the platform an origin of federated content, which is a new security + moderation
  surface. **Every repo write and blob upload is new UGC ingress and MUST route through
  `moderateContent`** — see FEAT-009 / TASK-019; do not land a slice that bypasses it.
  **Tokenization is a hard constraint here, not a nice-to-have:** a PDS introduces a
  *federated* auth surface (AT-Proto's own JWTs) that could easily become a second,
  parallel identity system sitting beside CA tokens. It must not. See FEAT-059/060/061 —
  FEAT-037 owns the bridge, and the epic is not done if a PDS session can outlive a CA
  token revocation.

### FEAT-037 — PDS Slice 1: identity + sessions (`com.atproto.server.*`)
- **Type:** feature · **Status:** backlog · **Priority:** P2 · **Size:** L
- **Owner-role:** unassigned · **Blocked-by:** FEAT-036 (parent epic — architect sign-off)
- **Legacy:** FEAT-036 Slice 1
- **Cost/Benefit:** pending
- **Description:** Implement `com.atproto.server.createSession` / `refreshSession` /
  `deleteSession` / `describeServer` / `createAccount`, bridged onto the existing
  auth + CA token stack rather than a parallel credential store.
- **Acceptance criteria:**
  - An AT-Proto client authenticates and receives access/refresh JWTs that map to a
    real Exprsn user.
  - Session revocation goes through the existing CA token revocation path (a revoked
    CA token invalidates the AT-Proto session).
  - `did:exprsn` identities from the existing `userDids` surface resolve for these accounts.
  - **Tokenization (FEAT-060):** the AT-Proto JWT is a *derived, scoped* credential — it
    carries the CA token's org/group scope and cannot exceed it. A **bulk revoke** kills
    every derived AT-Proto session (verified by test).
- **Notes:** The hard call is **credential bridging** — AT-Proto expects its own JWTs;
  the platform's source of truth is CA tokens. Do not fork a second session store; extend
  `services/auth/src/services/sessionService.js`. **This slice is the tokenization
  linchpin for the whole PDS epic (FEAT-059/060):** get the derivation right here and every
  downstream slice inherits scope + revocation for free; get it wrong and the PDS becomes a
  parallel identity system that outlives CA revocation. Architect + security review.

### FEAT-038 — PDS Slice 2: repo / records (`com.atproto.repo.*`)
- **Type:** feature · **Status:** backlog · **Priority:** P2 · **Size:** XL
- **Owner-role:** unassigned · **Blocked-by:** FEAT-037
- **Legacy:** FEAT-036 Slice 2
- **Cost/Benefit:** pending
- **Description:** Content-addressed repo storage — `createRecord`, `putRecord`,
  `deleteRecord`, `getRecord`, `listRecords`, `applyWrites`, with a Merkle Search Tree
  + signed commits, backed by the `atproto` Postgres schema.
- **Acceptance criteria:**
  - Records round-trip by CID; the repo's MST root advances and commits are signed.
  - Every `createRecord`/`putRecord` passes through `moderateContent` before it is
    published to the outbound firehose.
  - `db:check` reports no drift after the new tables land.
- **Notes:** **CORRECTED 2026-07-13 (`sprints/assessments/FEAT-036.md` §2) — re-sized XL → L.**
  This ticket previously said MST/CID storage "has no existing platform analogue", implying a
  hand-roll. **Do not hand-roll it.** `@atproto/repo` is the official SDK and already does MST +
  signed commits + CAR export. The platform **already ships the primitives and already uses them
  for real**: `@atproto/crypto`, `@ipld/dag-cbor`, `@ipld/car`, and `multiformats` are all in the
  root `package.json` and drive the working label signer
  (`services/atproto/src/labeler/labelSigner.js`). So this slice is "wire `@atproto/repo` to a
  Postgres blockstore" (**L**), not "invent a Merkle search tree" (XL, very high risk).
  **Do NOT copy `exprsn-bluesky`'s `repositoryService.js` — that file IS the mock** (fake CIDs,
  no MST, SDK declared-but-unused). **dba sign-off** on the new tables. Cross-link the lexicon
  artifacts already at `services/atproto/config/lexicons/`.

### FEAT-039 — PDS Slice 3: blobs, backed by FileVault
- **Type:** feature · **Status:** backlog · **Priority:** P2 · **Size:** M
- **Owner-role:** unassigned · **Blocked-by:** FEAT-038
- **Legacy:** FEAT-036 Slice 3
- **Cost/Benefit:** pending
- **Description:** `com.atproto.repo.uploadBlob` / `getBlob`, storing bytes in
  **FileVault** rather than standing up a second object store.
- **Acceptance criteria:**
  - Blob upload returns a CID; `getBlob` serves the same bytes.
  - Blobs are persisted through FileVault's existing storage layer (no new bucket/driver).
  - Image blobs are moderated on the FileVault async image path (FEAT-031) — a blob that
    fails moderation is not served.
  - **Tokenization (FEAT-061):** blob reads authorize against a scoped CA token or a
    **capability token** from the unified share mechanism — **a CID is not a credential.**
    Knowing a CID must not by itself grant read access to a non-public blob, and revoking
    the capability immediately stops serving it.
- **Notes:** This is the slice where "reuse, don't rebuild" pays most —
  `services/filevault` already has storage, thumbnails, and an image-moderation queue.
  **The CID-as-capability trap is the security risk here:** content-addressed stores tempt
  you into "unguessable hash = access control", which is exactly the durable-share residual
  failure already filed as BUG-027. Blob access must go through FEAT-061's tokens.

### FEAT-040 — PDS Slice 4: outbound firehose (`com.atproto.sync.subscribeRepos`)
- **Type:** feature · **Status:** backlog · **Priority:** P2 · **Size:** L
- **Owner-role:** unassigned · **Blocked-by:** FEAT-038
- **Legacy:** FEAT-036 Slice 4
- **Cost/Benefit:** pending
- **Description:** Publish our commits to the network — a raw-WS `subscribeRepos`
  endpoint with a replayable cursor/sequence log, so relays can consume Exprsn.
- **Acceptance criteria:**
  - A relay (or `websocat`) subscribes and receives commit frames as records are written.
  - A cursor replays missed events after a disconnect.
  - Only moderation-cleared records are emitted.
- **Notes:** Follow the existing `subscribeLabels.js` WS-through-gateway pattern.
  **Single-gateway assumption holds for MVP** (per the MVP scope decision) — a
  multi-instance firehose needs a shared sequence source; note it, don't build it.

### FEAT-041 — PDS Slice 5: app-view surface (actor / feed / graph / notification)
- **Type:** feature · **Status:** backlog · **Priority:** P3 · **Size:** L
- **Owner-role:** unassigned · **Blocked-by:** FEAT-038
- **Legacy:** FEAT-036 Slice 5
- **Cost/Benefit:** pending
- **Description:** `app.bsky.actor.*`, `feed.*`, `graph.*`, `notification.*` read APIs,
  projected from the platform's own timeline/nexus data.
- **Acceptance criteria:**
  - A Bluesky-compatible client can view a profile, a feed, and a follow graph served
    by Exprsn.
- **Notes:** Lowest-priority slice — the platform already has its own SPA for these
  views; this is purely for third-party AT-Proto client compatibility. Legitimately
  **droppable** if cost/benefit says so.

### FEAT-069 — AT-Proto bridge account: link an external `did:plc` and cross-post (PDS alternative)
- **Type:** feature · **Status:** ready · **Priority:** P3 · **Size:** M
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** supersedes FEAT-036 for this cycle (`sprints/assessments/FEAT-036.md` §4)
- **Cost/Benefit:** done — **BUILD THIS INSTEAD OF FEAT-036.** ~90% cheaper and captures most of the
  realistic user-visible value. **Both halves already exist in the tree:**
  `services/atproto/src/identity/pdsClient.js` is a working XRPC client that already does
  `createSession` and record-publish **against someone else's PDS**, and
  `services/atproto/models/UserDid.js` already stores `didPlc` / `didWeb` (+ verified + proof) — linking
  a user to an *external* AT-Proto identity is already modelled. No MST, no blockstore, no firehose, no
  federated-content liability.
- **Description:** Let an Exprsn user **link their existing Bluesky / `did:plc` account** and cross-post
  Exprsn content to **their own** PDS — rather than Exprsn *being* a PDS. Users get federated presence;
  the platform does not host a repo, run an outbound firehose, or become publicly accountable for
  content it publishes to the network.
- **Acceptance criteria:**
  - A user links an external `did:plc` account (proof-of-control verified — reuse the existing
    `src/identity/proofOfControl.js`).
  - A post published on Exprsn can be cross-posted to the linked account's PDS.
  - Unlinking revokes the stored credential; a revoked CA token also stops cross-posting.
  - Cross-posted content still passes `moderateContent` before it leaves the platform.
- **Notes:** The credential for the external PDS is a **stored third-party secret** — it must live in
  **Vault**, not in an atproto table, and must never appear in logs or run history. Cross-link FEAT-060
  (scoped tokens) and FEAT-055 (the same secret-handling constraint). If real demand for
  platform-*hosted* AT-Proto identities appears after this ships, revisit FEAT-036 — with this as the
  evidence that anyone wants it.

### FEAT-042 — Herald: full notification delivery channels (parent epic)
- **Type:** feature (epic) · **Status:** backlog · **Priority:** P2 · **Size:** L
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** STATUS.md "Herald → moderator" note
- **Decomposed into:** FEAT-043 (push), FEAT-044 (SMS), FEAT-045 (preferences), FEAT-046 (templates)
- **Cost/Benefit:** pending
- **Description:** STATUS.md already records that **no standalone Herald service exists**
  and that timeline's `HERALD_SERVICE_URL` points at `/moderator`. **In-app** notifications
  are genuinely covered — `services/moderator/src/routes/notifications.js`, the
  `/notifications` Socket.IO namespace, Redis-persisted history/unread state. What is
  entirely absent is **out-of-app delivery**: a grep for `fcm|apns|web-push|firebase-admin`
  across the platform returns nothing outside auth's trusted-device code. There is also no
  user-facing notification-preferences store and no template store. Result: a user who is
  not looking at the tab is never reached.
- **Acceptance criteria:**
  - A notification generated by the existing moderator fan-in can be delivered via push
    and SMS, subject to per-user preferences, rendered from a template.
  - Existing in-app/bell behaviour is unchanged.
- **Notes:** Scope is **delivery channels on top of the existing fan-in**, not a rewrite —
  do not resurrect a standalone Herald service; extend `services/moderator`.

### FEAT-043 — Herald Slice: push notifications (FCM / APNs / web-push) + device tokens
- **Type:** feature · **Status:** backlog · **Priority:** P2 · **Size:** L
- **Owner-role:** unassigned · **Blocked-by:** FEAT-042
- **Legacy:** FEAT-042 Slice 1
- **Cost/Benefit:** pending
- **Description:** Device-token registration + push dispatch for iOS (APNs), Android (FCM),
  and browser (web-push), driven off the existing notification fan-in.
- **Acceptance criteria:**
  - A device registers a token, and a DM/like/comment/follow event delivers a push to it.
  - Tokens are revoked on logout and on CA token revocation.
  - Push failures are retried and dead-lettered, not silently dropped.
- **Notes:** **Requires third-party credentials** (APNs cert, FCM key, VAPID pair) → touches
  R4 (secrets management). Delivery should ride the existing Bull/RabbitMQ infrastructure.
  `auth`'s trusted-device code is the nearest existing concept — check before adding a table.

### FEAT-044 — Herald Slice: SMS delivery
- **Type:** feature · **Status:** backlog · **Priority:** P3 · **Size:** M
- **Owner-role:** unassigned · **Blocked-by:** FEAT-042
- **Legacy:** FEAT-042 Slice 2
- **Cost/Benefit:** pending
- **Description:** SMS as a notification channel via a provider (Twilio or equivalent).
- **Acceptance criteria:**
  - A notification routed to SMS is delivered to a verified phone number.
  - Unverified numbers are never texted; opt-out is honoured.
- **Notes:** **Overlaps FEAT-006 (real MFA factors — SMS/email/WebAuthn), which also needs an
  SMS provider.** Land **one** SMS provider abstraction shared by both, not two. Whichever
  ticket is scheduled first should own the provider; the other consumes it. Cross-link before build.

### FEAT-045 — Herald Slice: per-user notification preferences
- **Type:** feature · **Status:** backlog · **Priority:** P2 · **Size:** M
- **Owner-role:** unassigned · **Blocked-by:** FEAT-042
- **Legacy:** FEAT-042 Slice 3
- **Cost/Benefit:** pending
- **Description:** Per-user, per-event-type, per-channel preferences (in-app / push / SMS /
  email), with sane defaults and a quiet-hours setting.
- **Acceptance criteria:**
  - A user can disable a channel for an event type and stops receiving it on that channel.
  - Defaults apply to users who have never set a preference.
  - Every delivery path consults preferences before dispatch (no channel bypasses it).
- **Notes:** This is the ticket that makes push/SMS **safe to enable** — schedule it with or
  before FEAT-043/044, not after. SPA surface required (Account Settings).

### FEAT-046 — Herald Slice: notification template store
- **Type:** feature · **Status:** backlog · **Priority:** P3 · **Size:** M
- **Owner-role:** unassigned · **Blocked-by:** FEAT-042
- **Legacy:** FEAT-042 Slice 4
- **Cost/Benefit:** pending
- **Description:** Editable, versioned templates per event-type × channel, replacing
  hard-coded notification strings.
- **Acceptance criteria:**
  - An admin edits a template and the next notification renders from it.
  - Templates are variable-interpolated safely (no injection into email/SMS bodies).
- **Notes:** Cross-link TASK-014 (moderator recipient-email lookup) — the email channel
  already half-exists in `moderator/services/emailService.js`.

### FEAT-047 — Gallery: albums, contributors, video transcode on FileVault (parent epic)
- **Type:** feature (epic) · **Status:** backlog · **Priority:** P2 · **Size:** L
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** — (audit of `/Volumes/Storage/exprsn-gallery`, 2026-07-13)
- **Decomposed into:** FEAT-048 (albums), FEAT-049 (contributors), FEAT-050 (video transcode)
- **Cost/Benefit:** pending
- **Description:** FileVault already absorbed most of `exprsn-gallery`: it has
  `thumbnails` (whose route header literally reads *"Thumbnail Routes (Phase 3 — Galleries
  + shared files)"*), `share`, `webdav`, `search`, `storage`, plus a Monaco editor and
  multi-type previews. Three things did **not** come across: an **Album/collection** model
  with CRUD, **contributors** (multi-user album collaboration), and **video transcode**
  (`videoService.js`).
- **Acceptance criteria:**
  - A user creates an album, adds media, invites a contributor, and the contributor can add
    media subject to permissions.
  - An uploaded video is transcoded to web-playable renditions and streams in the SPA.
  - **Tokenization (FEAT-059):** album and media access is authorized by a **scoped CA token**
    (FEAT-060), and every externally-shared album/media link is a **capability token**
    (FEAT-061) — revocable, expiring, scoped to that album + action. No bespoke gallery
    share mechanism.
- **Notes:** Build **on FileVault**, do not resurrect a gallery module. All album media is UGC
  → must route through the existing image/video moderation path (FEAT-031, FEAT-016).
  **Sharing is the whole risk surface of this epic.** The original `exprsn-gallery` billed
  itself as *"Versioned and **Tokenized** Media Galleries"* — that tokenization is exactly
  FEAT-061, and gallery is its third consumer alongside FileVault and Live. Do **not** ship
  album sharing before FEAT-061, or this epic will reproduce BUG-020/BUG-026/BUG-027 in a
  fourth module.

### FEAT-048 — Gallery Slice: album / collection model + CRUD
- **Type:** feature · **Status:** backlog · **Priority:** P2 · **Size:** M
- **Owner-role:** unassigned · **Blocked-by:** FEAT-047
- **Legacy:** FEAT-047 Slice 1
- **Cost/Benefit:** pending
- **Description:** An `Album` model in the `filevault` schema + CRUD routes + SPA surface;
  ordered membership of files in albums.
- **Acceptance criteria:**
  - Album CRUD works; a file can belong to multiple albums; ordering persists.
  - Album visibility respects the existing FileVault ACL — no new bypass (cf. BUG-026).
  - **Tokenization (FEAT-060):** album routes authorize against the scoped CA token; a user
    cannot read or mutate an album outside their org/group scope (covered by a cross-org test).
  - Adding a file to an album **cannot widen that file's visibility** — an album is not a
    privilege-escalation path around the file's own ACL.
  - `db:check` clean after the new tables.
- **Notes:** **dba sign-off** on the new tables. New tables are safe under sync `db:migrate`;
  the ALTER trap only bites if an existing table gains a column.

### FEAT-049 — Gallery Slice: contributors + collaborator permissions
- **Type:** feature · **Status:** backlog · **Priority:** P2 · **Size:** M
- **Owner-role:** unassigned · **Blocked-by:** FEAT-048
- **Legacy:** FEAT-047 Slice 2
- **Cost/Benefit:** pending
- **Description:** Invite users to an album with a role (viewer / contributor / owner) and
  enforce it on every album and file operation.
- **Acceptance criteria:**
  - A viewer cannot add or delete media; a contributor can add but not delete others' media.
  - Permission checks are enforced **server-side on every route**, not just hidden in the UI.
  - **Tokenization (FEAT-060/061):** a contributor invite is issued as a scoped, revocable
    **capability token** — revoking it immediately removes access, including to media the
    contributor could previously see (the BUG-027 durable-share residual must not recur).
  - A contributor cannot share album media onward beyond their own access level (BUG-026's
    "the sharer must be able to access what they share" check).
- **Notes:** **Security-relevant.** The room-collab ACL bugs (BUG-024, BUG-026, BUG-027) are the
  cautionary prior art — the same "sharer must be able to access what they share" check applies.
  Reuse `services/live/src/routes/roomCollab.js`'s invite/request model rather than inventing a
  third one — and once FEAT-061 lands, both should be sharing **one** capability-token mechanism,
  not two lookalikes.

### FEAT-050 — Gallery Slice: video transcode pipeline
- **Type:** feature · **Status:** backlog · **Priority:** P3 · **Size:** L
- **Owner-role:** unassigned · **Blocked-by:** FEAT-047
- **Legacy:** FEAT-047 Slice 3
- **Cost/Benefit:** pending
- **Description:** Transcode uploaded video into web-playable renditions + poster frames,
  asynchronously.
- **Acceptance criteria:**
  - An uploaded video produces renditions + a poster and plays in the SPA.
  - Transcode runs off the request path; failures are visible, not silent.
- **Notes:** **Reuse the existing ffmpeg worker** — `worker:live` already runs an ffmpeg
  RabbitMQ fanout/recording pipeline. Cross-link **TASK-015** (Live → FileVault video
  persistence), which is the same plumbing from the other end; these two should probably be
  built together. Video frame-sampling for moderation is FEAT-016 — do not duplicate.

### FEAT-051 — Workflow: approvals, retention, audit, import/export, FileVault+Vault actions (parent epic)
- **Type:** feature (epic) · **Status:** backlog · **Priority:** P2 · **Size:** L
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** — (audit of `/Volumes/Storage/exprsn-workflow`, 2026-07-13)
- **Decomposed into:** FEAT-052 (approvals), FEAT-053 (retention+audit), FEAT-054 (import/export), FEAT-055 (filevault/vault actions)
- **Cost/Benefit:** pending
- **Description:** Workflow execution already exists, but **split across two modules**:
  `services/moderator` (`workflowEngine.js`, `queueRegistry.js`, `routes/workflows.js`,
  `WorkflowExecution` model, + the reactflow canvas editor) and `services/lowcode`
  (`flowEngine`, `flowScheduler`, `flowActions`, `/flows/:id/runs`). Missing vs
  `exprsn-workflow`: **approvals, retention policies, an audit trail, and import/export**.
  Rick additionally wants **FileVault/Vault integration** so flows can read/write files and
  secrets.
- **Acceptance criteria:**
  - A workflow can pause on a human approval step and resume on approve/reject.
  - Executions are retained per policy and audited.
  - A workflow can be exported and re-imported into another environment.
  - A flow can read/write a FileVault file and read a Vault secret.
  - **Tokenization (FEAT-059/060):** a workflow step executes under a **scoped token derived
    from the invoking principal**, never under ambient engine authority. A flow cannot touch
    any resource its invoker could not touch directly, and a revoked token halts in-flight runs.
- **Notes:** **First decide where workflow lives.** Two engines is the real problem here —
  moderator's and lowcode's. **Architect sign-off on the consolidation question before any
  slice is built**, otherwise every feature below gets built twice. Note BUG-028 (four
  workflow HTTP endpoints lost in consolidation) touches the same file.
  **Tokenization is the sharpest risk in this epic: a workflow engine is a confused-deputy
  factory.** It runs *later*, *asynchronously*, and *on behalf of someone else* — so an engine
  that executes with its own ambient authority silently becomes a way for any flow author to
  reach every module. Every step must carry a scoped, revocable token derived from the invoker
  (FEAT-060). This is the same hazard as FEAT-058 (lowcode RBAC) and must be solved once, not
  twice — another reason to settle the one-engine question first.

### FEAT-052 — Workflow Slice: human approval steps
- **Type:** feature · **Status:** backlog · **Priority:** P2 · **Size:** M
- **Owner-role:** unassigned · **Blocked-by:** FEAT-051 (engine-consolidation decision)
- **Legacy:** FEAT-051 Slice 1
- **Cost/Benefit:** pending
- **Description:** An approval step type that suspends a run, notifies approvers, and resumes
  on decision, with delegation and timeout.
- **Acceptance criteria:**
  - A run halts at an approval step and resumes only on an authorised approve/reject.
  - Approvers are notified (via the moderator notification fan-in).
  - A timed-out approval takes the configured default path.
- **Notes:** Depends on durable run state — lowcode's flow-engine-v2 `runs` table is the
  natural home. Approver authz must reuse the platform-admin/org-role predicate (TASK-030).

### FEAT-053 — Workflow Slice: retention policy + audit trail
- **Type:** feature · **Status:** backlog · **Priority:** P3 · **Size:** M
- **Owner-role:** unassigned · **Blocked-by:** FEAT-051
- **Legacy:** FEAT-051 Slice 2
- **Cost/Benefit:** pending
- **Description:** Configurable retention for execution history + an immutable audit trail of
  who changed/ran/approved what.
- **Acceptance criteria:**
  - Executions older than the policy are pruned by a scheduled job; the audit trail is not pruned.
  - Every workflow mutation and approval decision is attributable to a principal.
- **Notes:** **dba sign-off** — unbounded `WorkflowExecution` growth is the actual motivation.
  Cross-link `nexus`'s `AdminAudit` model as the existing audit pattern.

### FEAT-054 — Workflow Slice: import / export + template library
- **Type:** feature · **Status:** backlog · **Priority:** P3 · **Size:** M
- **Owner-role:** unassigned · **Blocked-by:** FEAT-051
- **Legacy:** FEAT-051 Slice 3
- **Cost/Benefit:** pending
- **Description:** Export a workflow (+ its queues/rules) to a portable bundle and import it
  elsewhere; a starter template library.
- **Acceptance criteria:**
  - A workflow exported from one environment imports and runs in another.
  - Import validates and refuses a malformed/untrusted bundle.
  - **Tokenization (FEAT-059):** an exported bundle **carries no credentials** — no CA tokens,
    no capability tokens, no Vault secret values, no provider keys. Secret-bearing steps export
    as *references* that must be re-bound on import.
  - An imported workflow runs under the **importer's** scope, never under the exporter's.
- **Notes:** **Reuse the lowcode app-bundle format** (already built in the lowcode gap-closure
  work) rather than inventing a second bundle spec. Import is an **untrusted-input surface** —
  it must not be able to smuggle a script action past the sandbox (cf. TASK-021).
  **Export is a credential-exfiltration surface and import is a privilege-escalation surface** —
  a bundle that serializes a live token turns "export a workflow" into "email someone your
  access", and a bundle that replays the exporter's scope turns import into escalation. Both
  criteria above are load-bearing; QA should attempt exactly these two attacks.

### FEAT-055 — Workflow Slice: FileVault + Vault flow actions
- **Type:** feature · **Status:** backlog · **Priority:** P2 · **Size:** M
- **Owner-role:** unassigned · **Blocked-by:** FEAT-051
- **Legacy:** FEAT-051 Slice 4 (Rick's explicit ask)
- **Cost/Benefit:** pending
- **Description:** First-class flow actions to read/write **FileVault** files and read
  **Vault** secrets from inside a workflow/flow.
- **Acceptance criteria:**
  - A flow writes a file to FileVault and a later step reads it back.
  - A flow resolves a Vault secret **without** the secret value being persisted into run
    history, logs, or the audit trail.
  - Actions run as a scoped principal — a flow cannot read a secret its owner cannot read.
  - **Tokenization (FEAT-060):** the FileVault/Vault action authorizes with a **scoped CA token
    derived from the invoking user**, not a service-wide credential. Revoking that user's token
    denies the action mid-run.
  - A file written by a flow inherits a correct ACL — it is not world-readable by default, and
    any share link it produces is a FEAT-061 capability token.
- **Notes:** **Security-critical.** The secret-leakage-into-run-history risk is the whole
  ticket — a naive implementation logs the secret. Extend `services/lowcode`'s
  `moduleActions.js` (the existing action-catalog seam); this slice is effectively the first
  concrete instance of FEAT-057 **and the reference implementation for FEAT-060's scoped-token
  dispatch** — whatever pattern lands here is what every other module action will copy, so it is
  worth over-investing in getting the token derivation right. Architect + security review.

### FEAT-056 — Lowcode integrates with every platform module (parent epic)
- **Type:** feature (epic) · **Status:** backlog · **Priority:** P2 · **Size:** XL
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** lowcode 7-pass roadmap (passes 3–7)
- **Decomposed into:** FEAT-057 (module action/trigger catalog), FEAT-058 (org/group RBAC)
- **Cost/Benefit:** pending
- **Description:** Rick's ask: lowcode should integrate with **all** services. Today
  `services/lowcode/src/services/moduleActions.js` wires a subset. The goal is that every
  module in `src/modules/registry.js` (ca, auth, spark, nexus, filevault, vault, timeline,
  prefetch, moderator, live, atproto, plugins, cortex) exposes **actions** (do a thing) and
  **triggers** (react to a thing) that lowcode flows can compose — making lowcode the
  automation fabric across the platform rather than an island.
- **Acceptance criteria:**
  - Every registry module exposes at least its core actions + triggers to the flow builder.
  - A flow composing ≥3 different modules runs end-to-end.
  - Actions execute as a **scoped principal** and cannot escalate past the invoking user.
- **Notes:** **XL.** This is the existing lowcode roadmap's passes 3–7, now with an explicit
  "all modules" bar. The **authz model is the hard part, not the plumbing** — see FEAT-058;
  do not ship the catalog without it. Ships behind `LOWCODE_ENABLED`.

### FEAT-057 — Lowcode Slice: module action + trigger catalog across all modules
- **Type:** feature · **Status:** backlog · **Priority:** P2 · **Size:** L
- **Owner-role:** unassigned · **Blocked-by:** FEAT-056, **FEAT-060** (the *callee* modules do no scope check — see Notes). ~~FEAT-058~~ de-listed: lowcode's own RBAC already exists.
- **Legacy:** FEAT-056 Slice 1
- **Cost/Benefit:** pending
- **Description:** A declarative action/trigger registry — each module contributes its verbs;
  the flow builder discovers them; the engine dispatches them **in-process**.
- **Acceptance criteria:**
  - Each registry module contributes a documented action/trigger set.
  - The flow builder lists them without hard-coding module names.
  - Dispatch is in-process (no HTTP hop back through the gateway — cf. STATUS #6 / TASK-009).
- **Notes:** Extend `moduleActions.js`; do not fork it. FEAT-055 (FileVault/Vault actions) is
  the first real instance and should be treated as the reference implementation.

### FEAT-058 — Lowcode Slice: org / group RBAC — ⚠ **RE-GROOM: likely already built**
- **Type:** feature · **Status:** backlog (**needs re-grooming against the code before scheduling**) · **Priority:** P3 (was P1) · **Size:** ? (was L)
- **Owner-role:** unassigned · **Blocked-by:** FEAT-056
- **Legacy:** FEAT-056 Slice 2 · lowcode roadmap pass on org/group RBAC
- **Cost/Benefit:** done — **this ticket appears to be substantially ALREADY IMPLEMENTED, and was filed
  on a misreading.** I claimed `src/routes/design.js:7` grants "any authenticated user" full design
  access; the sentence was **truncated mid-clause and its meaning inverted.** In fact lowcode enforces
  **full org/group RBAC**: `src/services/scopeAuthority.js` (88 lines) exports `canAdminScope` /
  `canAdminApp` / `ADMIN_ROLES` with a platform-admin superuser path (`:50`), `src/middleware/designAuth.js`
  supplies `requireDesignIdentity` / `assertScope` / `assertApp`, and `assertScope`/`assertApp` are applied
  **31 times** across `design.js`. Per the header comment: *platform admins are superusers; org/group admins
  act within their org/group; users within their own scope; an app-tied resource inherits the app's scope; a
  platform-global resource (`appId=null`) requires platform admin.*
  **Do not schedule as filed.** Re-groom: verify coverage in `records.js` and `hooks.js` (design.js is
  clearly covered), and reduce this ticket to whatever genuine gap remains — if any. Dropped P1 → P3 and
  **de-listed as a blocker of FEAT-057**. See `sprints/assessments/FEAT-059.md` §1 correction.
- **Description:** Org- and group-scoped authorization inside lowcode: who may design, run, and
  see the data of an app/entity/flow.
- **Acceptance criteria:**
  - A user cannot design, run, or read records of an app outside their org/group scope.
  - A flow action executes with the **invoking user's** scope, not the flow author's ambient
    authority (no confused-deputy).
  - Verified by a test that attempts cross-org access and is denied.
- **Notes:** **Priority P1 and the real gate on FEAT-056/057** — an action catalog that can call
  every module *without* RBAC is a privilege-escalation engine. Build this first or in lockstep.
  Reuse the CA scoped-token work (FEAT-060) rather than a lowcode-local ACL. Architect sign-off.

### FEAT-059 — Tokenization across all platform features (parent epic)
- **Type:** feature (epic) · **Status:** backlog · **Priority:** P1 · **Size:** XL
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** token spec v1.1 (group/org scoping, `revokedBy`, bulk revoke)
- **Decomposed into:** FEAT-060 (CA scoped-token enforcement everywhere), FEAT-061 (capability / share-link tokens)
- **Cost/Benefit:** done — **BUILD, but re-sized and re-sliced. FEAT-060 is XL, not L.** The inventory
  found that **only one of the 14 modules (lowcode) enforces org/group scope** — the other thirteen do
  not. Every other module's auth middleware validates the CA token and checks a coarse
  `{read,write,delete}` permissions map, and **nine (spark, filevault, vault, timeline, prefetch,
  moderator, live, atproto, cortex) contain no reference to `organizationId` at all.** So the CA token
  spec's org/group scoping is *minted but enforced almost nowhere*: this is not a hardening pass, it is
  introducing an org dimension into nine modules that have none, plus retiring seven duplicated copies of
  the same auth middleware. Value survives scrutiny (3 clean security-bug prevents). **Do not promote
  FEAT-060 as filed — decompose first.** Recommended start: **middleware consolidation (M)** +
  **FEAT-061 capability tokens (L)**. **Copy lowcode's `scopeAuthority` model — do not invent one.**
  Full detail: `sprints/assessments/FEAT-059.md`.
- **Description:** Rick's ask, in **both** senses (confirmed 2026-07-13): (a) **CA scoped tokens**
  — the token-spec v1.1 model (org/group scoping, `revokedBy`, multi-principal invalidation, bulk
  revoke) is implemented in CA but is **not uniformly enforced by every module**; (b)
  **capability / share-link tokens** — revocable, expiring, least-privilege links for content,
  which today are ad-hoc per module (filevault share, live room share, gallery) and have already
  produced three ACL bugs.
- **Acceptance criteria:**
  - Every module authorizes against a scoped CA token; no module trusts client-supplied identity.
  - Every share/capability link in the platform is revocable and expiring, issued by one shared
    mechanism.
- **Notes:** **P1 — this is a security-posture epic, not a feature.** Its prior art is a list of
  bugs: BUG-011 (`check-service-access` trusted a body `userId`), BUG-020 (share-link metadata
  disclosure), BUG-026 (room `files/share` ACL bypass), BUG-027 (durable-share residual). Those
  keep recurring **because** each module rolled its own sharing. Architect sign-off.

  **Assessed 2026-07-13 (`sprints/assessments/FEAT-059.md`).** Two corrections from the assessment:
  - **BUG-024 was previously cited here and has been removed — it was an overclaim.** BUG-024 (live
    room-collab uploads bypass moderation) is a **moderation-routing** failure, not an authorization
    or sharing one; tokenization would not have prevented it. It belongs to FEAT-009 / TASK-019.
    Tested honestly, the epic cleanly prevents **BUG-011, BUG-026, BUG-027** (all security; BUG-027
    still open) and *partially* mitigates BUG-020. That is still a strong case — just not a total one.
  - **The dependency on this epic is real, but narrower than first written.** ⚠ **An earlier revision of
    this ticket claimed `services/lowcode/src/routes/design.js:7` grants "any authenticated user" full
    design access. That was a misreading — the sentence was truncated mid-clause and inverted.** Lowcode
    in fact enforces **full org/group RBAC** via `src/services/scopeAuthority.js` (88 lines;
    `canAdminScope`/`canAdminApp`, platform-admin superuser) with `assertScope`/`assertApp` applied **31
    times** across `design.js`. **Lowcode is the reference implementation to copy, not a gap** — FEAT-060
    should adopt its model rather than invent one.
    The real risk is a **confused deputy at the callee, not the caller**: FEAT-057 would let a lowcode
    flow invoke *every other module*, and those modules do **no org/group scope check of their own**. A
    flow correctly authorized inside lowcode can still reach into filevault/spark/timeline, which cannot
    tell one org from another. **So FEAT-060 gates FEAT-057, FEAT-051 and FEAT-036 — not the lowcode epic
    as a whole.** See `sprints/assessments/FEAT-059.md` §1 correction + §4.

### FEAT-060 — Tokenization Slice: CA scoped-token enforcement across every module
- **Type:** feature · **Status:** backlog (**XL — must be decomposed before `ready`**) · **Priority:** P1 · **Size:** XL (was L)
- **Owner-role:** unassigned · **Blocked-by:** FEAT-059
- **Legacy:** FEAT-059 Slice 1 · token spec v1.1
- **Cost/Benefit:** done — **re-sized L → XL; do NOT promote as filed.** Zero of 14 modules enforce
  org/group scope today and nine have no `organizationId` concept at all, so this is not a hardening
  pass — it introduces an org dimension into nine modules and touches every auth surface in the
  platform. Decompose into: **(A, M)** consolidate the seven duplicated module auth middlewares into
  `shared/middleware/` — no behaviour change, but it turns "change nine modules" into "change one file
  + nine imports", and is what makes the rest affordable; **(B, L)** token-derived identity — no route
  may trust a body/query `userId`/`orgId` (the BUG-011 class; no schema cost); **(C, XL, dba-led)**
  org-scoped data access — adds columns across nine module schemas, needs real migrations because sync
  `db:migrate` will not ALTER existing tables. **Start with (A).** (C) deserves its own assessment.
  Full detail: `sprints/assessments/FEAT-059.md`.
- **Description:** Audit every module's auth middleware and make org/group token scoping
  uniformly enforced — including the modules that currently only check "is this token valid?"
  and not "is it scoped to *this* org/group/resource?".
  **Also covers the *derived*-credential surfaces**, which are the easy ones to miss: AT-Proto
  PDS sessions (FEAT-037), lowcode/workflow action dispatch (FEAT-055/057/058), and any future
  module that mints its own token. A derived credential must inherit — and may never exceed —
  the scope of the CA token it came from.
- **Acceptance criteria:**
  - Every module rejects a token whose org/group scope does not cover the requested resource.
  - A bulk revoke immediately invalidates access across **all** modules (verified per module),
    **including derived credentials** (PDS sessions, in-flight workflow runs).
  - A cross-org access attempt is denied in every module, covered by tests.
  - No module executes an action under ambient/service authority on a user's behalf — every
    deferred or asynchronous execution carries a scoped token derived from its invoker
    (the confused-deputy rule; see FEAT-051, FEAT-058).
- **Notes:** Start by **inventorying** which modules enforce scope today — the answer is not
  uniform. Cross-link SPIKE-001 (moderator's 6 unauthenticated routers) and BUG-010; those are
  symptoms of the same gap. Dedupe the platform-admin predicate first (TASK-030).

### FEAT-061 — Tokenization Slice: unified capability / share-link tokens
- **Type:** feature · **Status:** done — QA-VERIFIED closed 2026-07-27, **re-scoped to Pass 1**; Pass 2 split to FEAT-077 · **Priority:** P1 · **Size:** L
- **Reconcile note (2026-07-27):** Pass 1 merged to `main` (`4b71df6`/`ff8bba3`, closes BUG-027); left `in-review` rather than `done` because this is an explicitly two-pass ticket and Pass 2 is still outstanding.
- **Owner-role:** sr-developer · **Blocked-by:** — (independent of FEAT-060; can run in parallel)

> **PASS 1 DONE 2026-07-14 — the share-grant model. Closes BUG-027.**
>
> **What the code actually turned out to be:** FileVault's `ShareLink` was *already* a proper
> capability — it carries a CA `tokenId`, `permissions`, `expiresAt`, `maxUses`/`useCount`,
> `isRevoked`/`revokedAt`, all indexed; `share.js` says it plainly (*"the file-scoped CA token in
> `?token=` is the capability"*). The **room** share was the unguarded one: a `RoomFile` row with
> **no token, no expiry, no revocation**, authorized by bare room membership. So the gap was never
> "build a capability system" — it was "the room path never got one."
>
> **The decision (Rick, 2026-07-13): provenance-aware revoke.** A share is only ever as strong as the
> visibility it was minted under — *unless the owner is the one who shared it*:
> - **owner** shared their own file → survives a later private-flip (this is the flow the old blanket
>   visibility-skip existed to protect, and it still works)
> - **non-owner** shared a then-public file → **dies** on the private-flip ← **this is BUG-027**
>
> **Implemented:**
> - `live.room_files.shared_as_owner` — per-share provenance
>   (migration `20250101000006`, **run + verified**; the backfill derives the true value by joining
>   `filevault.files`, because defaulting existing rows to `false` would have silently revoked every
>   file an owner had legitimately shared).
> - `fileService.shareGrantAllows(file, requesterId, sharedAsOwner)` — **one** predicate, applied at
>   **both** the download path (`downloadFileStreamForMember`) and the listing path
>   (`servableFileIds`). The listing matters as much as the download: without it a lapsed share stays
>   enumerable — leaking name, size and existence while its bytes 404 (the BUG-020 shape).
> - Both entry points **fail closed** when provenance is absent.
> - The FEAT-031 moderation gate still applies independently — a share grant does not buy past it.
> - 16/16 unit tests green (8 pre-existing FEAT-031 + 8 new); filevault unit suite 51/51; 0 lint errors.
>
> **Honest scope note — what Pass 1 did NOT do.** It unified the *grant semantics* (provenance-aware,
> revocable, fail-closed, enforced in one predicate), **not the token mechanism**. Room shares remain
> row-backed rather than CA-token-backed. That is a deliberate call: room access is already authorized
> by membership + provenance, so minting a token per room share adds indirection without adding
> security. **Pass 2** (extract a shared capability façade so Gallery/FEAT-047 plugs in without a
> redesign, and reconcile `ShareLink` + `RoomFile` behind it) remains — file it before FEAT-047 starts.
- **Legacy:** FEAT-059 Slice 2
- **Cost/Benefit:** done — **BUILD NOW. Highest value-per-day in the epic.** Structurally prevents
  BUG-026 (a single capability-issuing path that verifies the issuer's own access at mint time makes
  the bypass unrepresentable) and closes **BUG-027, which is still open**. Unlike FEAT-060 it needs no
  org dimension and no cross-schema migration, so it does **not** inherit that epic's XL cost — it is a
  genuine **L** and can proceed **in parallel** with FEAT-060's decomposition. Main cost is the
  compatibility window: `services/filevault/src/routes/share.js` and
  `services/live/src/routes/roomCollab.js` have **live issued share links** that a cutover would break.
  Full detail: `sprints/assessments/FEAT-059.md` §5 Slice D.
- **Description:** One shared capability-token mechanism for **all** content sharing — FileVault
  file/directory shares, Live room shares, Gallery albums (FEAT-047/049), and **AT-Proto PDS
  blobs and records (FEAT-039)** — replacing the per-module implementations. Tokens are scoped to
  a resource + action, expiring, revocable, and auditable.
  **Known consumers (keep this list current):** filevault shares · live room shares · gallery
  albums + contributor invites (FEAT-048/049) · PDS blob/record reads (FEAT-039) · files written
  by workflow actions (FEAT-055). Each is a module that would otherwise roll its own share link —
  which is precisely how BUG-020/026/027 happened. (**BUG-024 was previously listed here and has
  been removed as an overclaim** — it is a moderation-routing failure, not a sharing one; see
  `sprints/assessments/FEAT-059.md` §2.)
- **Acceptance criteria:**
  - A share link grants exactly the resource + action it names, and nothing else.
  - Revoking a share link immediately stops serving the resource (**including the durable-share
    residual case in BUG-027**).
  - Flipping a resource to private invalidates outstanding links to it.
  - A share token leaks no metadata about resources it does not grant (BUG-020).
  - The sharer's own access is verified at share time (BUG-026).
- **Notes:** The four acceptance criteria above are **literally the four share bugs already filed**
  — this slice is the structural fix that stops a fifth. BUG-027 stays open until this lands, or is
  fixed locally first and re-verified here. Architect sign-off.
- **QA closeout (2026-07-27):** Pass 1 (provenance-aware grant semantics unifying
  FileVault + Live behind one fail-closed predicate; closes BUG-027) is genuinely done
  and merged (`4b71df6`/`ff8bba3`), filevault suites 62/62. The full-feature AC as
  written (one shared capability-token mechanism; private-flip invalidates all links)
  belongs to Pass 2 and partially contradicts Rick's 2026-07-13 provenance decision
  (owner-minted capabilities survive) — split to **FEAT-077** with the AC restated,
  which must land before FEAT-047 album sharing starts.

### FEAT-062 — Administrative settings for the new features (parent epic)
- **Type:** feature (epic) · **Status:** backlog · **Priority:** P2 · **Size:** L
- **Owner-role:** unassigned · **Blocked-by:** the feature epics it configures
- **Legacy:** — (Rick, 2026-07-13: scoped to the new features only)
- **Decomposed into:** FEAT-063 (PDS), FEAT-064 (herald), FEAT-065 (gallery), FEAT-066 (workflow), FEAT-067 (lowcode)
- **Cost/Benefit:** pending
- **Description:** Build the admin surfaces for the features added in this intake. **Scope was
  explicitly limited by Rick to these new features** — this is *not* an all-14-module admin sweep.
  Each module already exposes `/api/config`; this epic is the persisted-config + SPA admin surface
  on top, following the existing Live/Cortex admin pattern.
- **Acceptance criteria:**
  - Each new feature has an admin section whose settings **persist and are enforced at runtime**
    (not cosmetic).
  - Admin access is gated by the platform-admin predicate.
- **Notes:** **Must obey the "no JSON-only modals" rule** — structured forms bound to live data;
  JSON only as an escape hatch. Follow `services/live`'s persisted-and-enforced `LiveConfig`
  pattern (a config that is stored but not enforced is worse than none). Each slice is blocked by
  its parent feature epic — there is nothing to configure until the feature exists.

### FEAT-063 — Admin Slice: AT-Proto / PDS settings
- **Type:** feature · **Status:** backlog · **Priority:** P3 · **Size:** M
- **Owner-role:** unassigned · **Blocked-by:** FEAT-062, FEAT-036
- **Legacy:** FEAT-062 Slice 1
- **Cost/Benefit:** pending
- **Description:** Admin surface for PDS: federation on/off, relay endpoints, blob size/type
  limits, account-creation policy, invite requirements, moderation coupling.
- **Acceptance criteria:** settings persist and are enforced (a blob over the configured limit is
  rejected; federation off stops outbound firehose emission).
- **Notes:** Extends the existing `/admin` SPA. Cross-link the atproto external-labelers surface.

### FEAT-064 — Admin Slice: Herald / notification settings
- **Type:** feature · **Status:** backlog · **Priority:** P2 · **Size:** M
- **Owner-role:** unassigned · **Blocked-by:** FEAT-062, FEAT-042
- **Legacy:** FEAT-062 Slice 2
- **Cost/Benefit:** pending
- **Description:** Admin surface for notification channels: provider credentials/health, per-channel
  enable, rate limits, default preferences, template management (FEAT-046), delivery/failure metrics.
- **Acceptance criteria:** disabling a channel stops delivery on it; provider health is visible;
  defaults apply to new users.
- **Notes:** Provider credentials are **secrets** — surface health/status, never echo the secret back
  to the client (R4).

### FEAT-065 — Admin Slice: Gallery settings
- **Type:** feature · **Status:** backlog · **Priority:** P3 · **Size:** S
- **Owner-role:** unassigned · **Blocked-by:** FEAT-062, FEAT-047
- **Legacy:** FEAT-062 Slice 3
- **Cost/Benefit:** pending
- **Description:** Admin surface for galleries: album limits, allowed media types, transcode profiles,
  contributor policy, share/expiry defaults.
- **Acceptance criteria:** settings persist and are enforced on the upload/share paths.
- **Notes:** Share/expiry defaults must be sourced from the unified capability-token mechanism (FEAT-061).

### FEAT-066 — Admin Slice: Workflow settings
- **Type:** feature · **Status:** backlog · **Priority:** P3 · **Size:** M
- **Owner-role:** unassigned · **Blocked-by:** FEAT-062, FEAT-051
- **Legacy:** FEAT-062 Slice 4
- **Cost/Benefit:** pending
- **Description:** Admin surface for workflow: retention policy, approval defaults/timeouts, queue
  topology, execution concurrency limits, import/export governance.
- **Acceptance criteria:** retention policy is enforced by the pruning job; concurrency limits are
  honoured by the engine.
- **Notes:** Extends the existing moderator admin (queue/workflow builders already have canvas editors).

### FEAT-067 — Admin Slice: Lowcode settings
- **Type:** feature · **Status:** backlog · **Priority:** P3 · **Size:** M
- **Owner-role:** unassigned · **Blocked-by:** FEAT-062, FEAT-056
- **Legacy:** FEAT-062 Slice 5
- **Cost/Benefit:** pending
- **Description:** Admin surface for lowcode: which modules' actions are exposed, per-org enablement,
  script-sandbox policy, flow concurrency/rate limits, RBAC role mapping.
- **Acceptance criteria:** disabling a module's actions removes them from the builder **and** blocks
  them at dispatch (UI-only removal is not sufficient).
- **Notes:** The "blocks at dispatch" criterion is the point — a hidden-but-callable action is a
  security bug. Cross-link TASK-021 (python sandbox).

### FEAT-068 — Payments: gateway integration (Stripe / PayPal / Authorize.Net)
- **Type:** feature · **Status:** backlog · **Priority:** P3 · **Size:** XL
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** — (audit of `/Volumes/Storage/exprsn-payments`, 2026-07-13)
- **Cost/Benefit:** pending
- **Description:** **The platform's most half-built gap.** `services/auth` **already ships** the
  billing *schema* — `create-subscriptions`, `create-invoices`, `create-usage-records` migrations
  plus `UsageRecord` and `FeatureFlag` models — and carries a **dead, never-mounted
  `services/auth/routes/billing.js`** (10 endpoints). What does not exist anywhere in the platform is
  any payment-gateway integration: a grep for `stripe|paypal|authorize\.net|chargeback` returns
  nothing outside those migrations. **The platform can model a subscription but cannot charge a
  card.** `/Volumes/Storage/exprsn-payments` implements transactions, subscriptions, invoices,
  customers, payment methods, chargebacks, and webhooks across three gateways.
- **Acceptance criteria:**
  - A customer can add a payment method and be charged for a subscription.
  - Gateway webhooks reconcile invoice/subscription state idempotently.
  - Card data is **never** stored on the platform (gateway tokenization only; PCI scope minimised).
- **Notes:** **XL — must be decomposed before `ready`.** Filed at Rick's direction (2026-07-13);
  `atlas` (geospatial) and `pulse` (analytics/BI) were the other zero-coverage gaps found in the
  same audit and were **deliberately not filed**. The dead `billing.js` is the natural revival seam —
  **hold TASK-032 from deleting it** until this is groomed. Note this ticket's "tokenization" is
  **card tokenization**, which Rick explicitly scoped **out** of FEAT-059 — they are unrelated.
  Architect + dba sign-off; needs a real merchant account, so it is deploy-blocked regardless.

---


### FEAT-070 — Spark block enforcement (block/mute for messaging) *(Tier 1)*
- **Type:** feature · **Status:** backlog · **Priority:** P1 · **Size:** M
- **Owner-role:** sr-developer · **Relates:** FEAT-011 (mandatory sibling per its ADR)
- **Description:** FEAT-011 shipped block/mute in timeline (`timeline.user_relationships` + `relationshipService`
  façade). A block that does not stop a DM is incomplete: the ADR (`sprints/feat-011-blockmute-adr.md`) decomposed
  spark enforcement into this sibling. Wire spark's write-time contact rejection (reject a DM/new-conversation when
  `relationshipService.isBlockedEitherWay`) at the real message-create sites, plus read filtering and notification
  suppression (N2). Reuse the published `relationshipService.canContact()` alias — no cross-schema SQL, no new
  `*_SERVICE_URL` hop.
- **Acceptance criteria:** a blocked user cannot start/continue a DM with the blocker (403); existing threads are
  filtered on read; message notifications from a suppressed user are dropped; no new unauthenticated surface.
- **Notes:** FILE per the FEAT-011 ADR — the timeline slice ships a documented DM gap until this lands. Cost/Benefit gate applies (P1 safety).
- **Cost/Benefit: APPROVED (2026-07-27)** — build-now for sprint 2026-11, size M
  (ADR-pre-scoped sibling of shipped FEAT-011; façade `canContact` already published,
  zero new infra/schema, near-zero ongoing cost, HIGH Tier-1 safety value — closes the
  documented DM gap gating public exposure). Caveats: the ADR's send-site inventory is
  stale — guard ~5 `Message.create` sites via one `assertCanContact` helper (socket
  `send:message`, messageService, forward, reply; group-channel exempt per ADR §3);
  typing-indicator leakage = 1-line gate or documented residual; calls-from-chat is
  TASK-034's lane, not covered here. Approved fallback slice if capacity-tight:
  write-rejection + N2 now, S4/S5 read-filter as an explicit follow-up TASK. Full
  assessment: `sprints/assessments/feat-070-blockmute-cb.md`. Status may move
  `backlog → ready` at 2026-11 grooming.

### FEAT-071 — Org-admin-runnable user import/invite route (strict org-binding) *(deferred slice)*
- **Type:** feature · **Status:** backlog · **Priority:** P2 · **Size:** M
- **Owner-role:** sr-developer + architect (authz) · **Relates:** FEAT-035
- **Description:** FEAT-035's HTTP import/invite routes are `requireAdminAfterCA` (platform-admin only), so an
  org-admin cannot run an import scoped to their own org via HTTP — the AC's "org admin can import to their own org"
  is unmet. Deliberately deferred at ship because opening the route is the security-sensitive direction. Do it via the
  existing `resolveImportContext` / `organizationService.isOwnerOrAdmin` org-authz path with the target org bound to
  the caller's administered org — **never** a body-supplied `organizationId` (that is the cross-tenant escalation the
  security audit flagged). Adversarial-review the cross-tenant surface.
- **Acceptance criteria:** an org owner/admin can import/invite ONLY into an org they administer; a spoofed body org id
  has no effect; platform-admin path unchanged.
- **Notes:** Cost/Benefit gate applies. Coordinate with TASK-028 (nexus_group import authz).

### FEAT-072 — Cortex backend driver abstraction + Ollama secondary backend (automatic failover, circuit breaker, queue-only enforcement)
- **Type:** feature · **Status:** done · **Priority:** P2 · **Size:** L — reconciled 2026-07-27 — merged to `main` (`1d60698`/`29a47a5`)
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** supersedes FEAT-016 · relates to FEAT-029 (llama.cpp router), FEAT-031 (image lane this generalizes), BUG-016/BUG-022 (requeue / compare-and-set patterns), TASK-023/TASK-026 (benchmark + shadow rung)
- **Cost/Benefit:** done: proceed-with-slice — shadow-only, 2B model (qwen3.5:2b), enforce gated on TASK-042 + droplet decision
- **Description:** Per **ADR-0005 §1–§3** (`docs/adr/0005-cortex-backend-failover-and-video-moderation.md`,
  Accepted 2026-07-14). Today `services/cortex/src/lib/llama.js` is not a driver — it hard-codes the
  llama.cpp **router** API (`/models`, `/models/load`, `/models/unload`, `input_modalities`), and
  `services/cortex/src/engine/vision.js` `assertVisionCapable()` / `ensureVisionResident()` break outright
  against Ollama (which has `/api/tags`, `/api/show` `capabilities[]`, `/api/ps`, `/api/pull`, and an
  OpenAI-compatible `/v1/chat/completions`). Introduce a backend driver abstraction under
  `services/cortex/src/backends/{index,types,llamacpp,ollama}.js`: a registry owns backend selection,
  **role→id resolution** (`brain|judge|vision`, never a raw model id), residency, and a per-backend
  circuit breaker. `engine/vision.js` and `engine/agent.js` talk to the registry, never a driver directly;
  llama.cpp-specific concepts (residency poll-and-nudge, the "empty body = mid-load" rule) live **only** in
  the llama.cpp driver. Ollama becomes an **automatic secondary** on availability failure of the primary.
  The queue-only invariant (ADR §2) is enforced in the process boundary: the Ollama driver registers only
  when `CORTEX_ASYNC_ROLE=worker`; the gateway asserts that var is unset at boot; the registry refuses any
  secondary-backend call outside an `AsyncLocalStorage` job context (`CORTEX_SYNC_CALL_FORBIDDEN`).
- **Acceptance criteria:**
  - `services/cortex/src/backends/` exists with the `types.js` `Driver` contract from ADR §1; both
    `llamacpp` and `ollama` drivers implement it (`name`, `capabilities`, `modelFor`, `health`,
    `supportsVision`, `ensureResident`, `chatComplete`).
  - `engine/vision.js` and `engine/agent.js` select inference **by role** and never read
    `config.cortex.visionModel` / pass a raw model id to `chatComplete`; role→id is resolved by the
    selected driver (`CORTEX_VISION_MODEL` for llamacpp, `CORTEX_OLLAMA_VISION_MODEL` for ollama).
  - No llama.cpp concept (`input_modalities`, `/models/load`, empty-body-means-mid-load) appears anywhere
    in the Ollama driver or in `engine/vision.js` after this lands; `supportsVision` is memoized **per backend**.
  - `chatComplete` returns a normalized `{ text, finishReason }`; the empty-body check lives in the
    llama.cpp driver only.
  - Queue-only enforcement (Layer 1): the **gateway process registry contains only `llamacpp`** — asserted
    in a unit test; the gateway boot **fails** if `CORTEX_ASYNC_ROLE` is set in its env.
  - Queue-only enforcement (Layer 2): a secondary-backend call made outside an ALS job context throws
    `CORTEX_SYNC_CALL_FORBIDDEN` rather than dialing Ollama — asserted in a unit test with primary down.
  - Failover taxonomy exactly per ADR §3.1/§3.2: only availability failures (transport, 5xx, `health()`
    false, role-model-absent, residency timeout, llama.cpp empty body) are failover-eligible and trip the
    breaker; `UNSUPPORTED_*`, 400/413, `CORTEX_DISABLED`, `CORTEX_SYNC_CALL_FORBIDDEN`, and
    unparseable-JSON / missing-score verdicts are **never** failover-eligible and never trip the breaker
    (unparseable-JSON still fails **closed**/escalate) — covered by tests.
  - Per-backend in-memory circuit breaker with cheap `health()` HALF_OPEN gate and exponential cooldown
    (`CORTEX_BREAKER_*` defaults per ADR §3.4); a bounded `CORTEX_PRIMARY_ATTEMPT_TIMEOUT_MS` so an
    absent/hung primary costs one bounded probe (not a full vision timeout) per job; "no primary configured"
    is a cheap steady state.
  - `CORTEX_OLLAMA_ROLES` defaults to `vision` (secondary does not serve `brain` agent loops unless opted in).
  - Backend failover is invisible above the façade: `moderateImage()` returns one verdict (with
    `verdict.backend` recorded) or throws exactly once; the async media lane still bypasses
    `AIProviderFactory` via `precomputedResult` (disjoint-lanes invariant, ADR §3.3) — asserted.
  - New config keys land in `src/config/index.js` + `.env.example` (architect-owned).
- **Notes:** Structural — **systems-architect signed off** (the driver contract, failover/breaker
  semantics, the queue-only invariant, and the process-boundary enforcement are the §1–§3 design; ADR
  status Accepted/APPROVED-WITH-CHANGES). **cost-benefit-analyzer signed off** (`done: proceed-with-slice`).
  Cross-link: **ADR-0005** (`docs/adr/0005-cortex-backend-failover-and-video-moderation.md`) §1–§3, §7,
  Required-changes 1–5. Hard prereq of FEAT-073/074 and TASK-042. Enforce-mode on the secondary is gated on
  **TASK-042** (per-model calibration) + the §8.1 droplet/RAM decision (Rick). Route to sr-developer (L,
  structural risk). Verify the Ollama vision tag against the live daemon before pinning (ADR §1 finding 3 —
  `qwen3.5:*` may not be a real registry tag).

### FEAT-073 — Video moderation + AI tagging at the FileVault upload chokepoint
- **Type:** feature · **Status:** done · **Priority:** P2 · **Size:** L — reconciled 2026-07-27 — merged to `main` (`1d60698`/`29a47a5`)
- **Owner-role:** unassigned · **Blocked-by:** FEAT-072, TASK-040
- **Legacy:** supersedes FEAT-016 (video half) · extends FEAT-031 (FileVault image chokepoint) · relates to BUG-016/BUG-022 (requeue / compare-and-set)
- **Cost/Benefit:** done: proceed-with-slice — shadow-only
- **Description:** Per **ADR-0005 §4** (`docs/adr/0005-cortex-backend-failover-and-video-moderation.md`).
  Add a video-moderation + AI-tagging lane over FileVault video uploads, placed as a **composition-layer
  worker** at `src/workers/videoModeration/` (NOT inside `services/cortex/` or
  `services/filevault/src/worker.js` — ADR §4.1 rejected both; cortex stays pixels-in/verdict-out). Pipeline
  (ADR §4.2): resolve bytes to a **local path** via `storage.retrieveToFile()` (TASK-040) — **never**
  `storage.retrieve()` which reads a whole Buffer and OOMs the box on video (ADR §4 finding 5); `ffprobe`
  guard (undecodable ⇒ `UNSUPPORTED_VIDEO`, terminal); `-ss`-seek ffmpeg keyframe extraction into a `0700`
  temp dir under `CORTEX_DATA_DIR` purged in a `finally`; per-frame `cortex.moderateFrames()` with
  **max-wins** aggregation and **escalate-only** early exit (never early-exit to clear); `cortex.describeFrames()`
  on ≤3 frames for tags/alt-text. State **reuses `filevault.file_moderation` as-is — no DDL**:
  `isModeratableVideo()` (`video/*`) joins `isModeratableImage()`, and `establishModerationState()` routes
  video to the new video queue. New Bull queue **`video-moderation`** (separate from the image queue so a
  minutes-long video can't head-of-line-block seconds-long images) + root alias `worker:video-moderation`.
- **Acceptance criteria:**
  - The worker lives at `src/workers/videoModeration/` (composition layer), requires each module's published
    surface, and reaches moderator **in-process** (`require('../../moderator/...')`) — `registry.js` unchanged
    (no new routes, no new schema owned by the worker).
  - The video lane resolves bytes via `storage.retrieveToFile()` / a streaming accessor and **never** calls
    `storage.retrieve()` on a video — asserted (no whole-video Buffer).
  - `ffprobe` guards the file; an undecodable/bomb/bad-container video yields `UNSUPPORTED_VIDEO` which is
    **terminal** (no failover, no Bull retry, per ADR §3.2).
  - Keyframe count `N = clamp(ceil(duration / VIDEO_FRAME_INTERVAL_S), MIN 3, MAX 12)`, `-ss` input seeks
    (decode around each timestamp, not a full scan), scaled to `CORTEX_VISION_MAX_EDGE`, JPEG; frames written
    to a `0700` temp dir that is **empty after the job, including after a failed job** (VERIFY, ADR §7.4).
  - `cortex.moderateFrames()` fails **CLOSED** and uses per-frame calls with max-wins aggregation and
    escalate-only early exit; `cortex.describeFrames()` fails **SOFT** (video ships untagged if tagging fails).
  - Side-table write reuses `filevault.file_moderation` with **no DDL**; the write is a compare-and-set on
    the content hash (BUG-022 pattern); every verdict row records `backend` + `model`.
  - Flagged videos route to moderator via `moderationService.moderateContent({ contentType: 'video', precomputedResult })`;
    a test asserts `contentType: 'video'` is a valid `moderation_items.content_type` enum value (already is —
    ADR §4.2; assert, don't migrate).
  - A test asserts `contentType: 'video'` + `precomputedResult` **cannot** be posted over an HTTP route
    boundary (stripped by `sanitizeModerationInput()`, ADR §7.2).
  - New Bull queue `video-moderation` on shared Redis with `jobId: 'video:<source>:<id>'` dedup, the
    remove-then-add requeue on bytes change (BUG-016), `attempts: 4` + exponential backoff, `removeOnFail`,
    DLQ + depth alert; root alias `worker:video-moderation` added to the worker set and to
    `docs/runbooks/digitalocean-ubuntu.md` (§ systemd units) + `deploy/systemd/`.
  - FileVault video pending-visibility is gated by a **new, separate** flag
    `FILEVAULT_VIDEO_MODERATION=off|shadow|enforce` (default **off**), independent of
    `FILEVAULT_IMAGE_MODERATION`; per-backend video risk thresholds resolvable (`..._RISK_THRESHOLD_OLLAMA`
    falling back to base).
- **Notes:** Structural + data/queue — **systems-architect signed off** (composition-layer placement §4.1,
  pipeline §4.2/§4.3, no-DDL state reuse §4.4). The new `video-moderation` Bull queue + DLQ/backoff are
  **dba co-sign** mechanics (queue config; no DDL for FileVault video). **cost-benefit-analyzer signed off**
  (`done: proceed-with-slice — shadow-only`). Cross-link: **ADR-0005**
  (`docs/adr/0005-cortex-backend-failover-and-video-moderation.md`) §4, §6, §7, Required-changes 6–9.
  **Blocked-by FEAT-072** (needs the backend abstraction + `moderateFrames`/`describeFrames` façade) **and
  TASK-040** (streaming retrieval — hard prereq; OOM guard). Enforce on the secondary backend gated on
  TASK-042. Route to sr-developer (L). Audio track is unanalyzed — named gap TASK-043.

### FEAT-074 — Video moderation + AI tagging for Live recordings (+ `live.recording_moderation`)
- **Type:** feature · **Status:** done *(BUG-032 + TASK-041 landed; recording moderation shipped shadow-capable, fail-closed)* · **Priority:** P3 · **Size:** L
- **Owner-role:** unassigned · **Blocked-by:** BUG-032, TASK-041 *(also depends on FEAT-072/073)*
- **Legacy:** supersedes FEAT-016 (video half) · **amends ADR-0002 §5** (Live recordings now IN scope) · reuses ADR-0004 side-table + terminal-state-ladder pattern
- **Cost/Benefit:** done: proceed-with-slice — DEFERRED per assessment
- **Description:** Per **ADR-0005 §4–§6** (`docs/adr/0005-cortex-backend-failover-and-video-moderation.md`),
  which **amends ADR-0002 §5** to bring Live recordings into the moderation chokepoint (justification: the
  gap was ffmpeg capability, now closed, and `/live` publish is in MVP scope — ADR §5). Extend the
  FEAT-073 video lane to Live recordings via a **new side table `live.recording_moderation`** in **live's**
  schema (ADR-0004 §3 side-table shape: `recording_id` PK/unique FK, `status`, `reason`, `risk_score`,
  `verdict` JSONB, `provider`, `backend`, `model`, `alt_text`, `ai_tags`, `frames_scored`, `attempts`,
  `last_error`, timestamps) with ADR-0004 §4.2's terminal-state ladder. Do **not** add moderation columns
  to `recordings`. Recording bytes are resolved from live's `outputPath`, not FileVault. **This ticket
  cannot be built on the current Live recording code** (ADR §8.3 / finding 7): the recording state machine
  does not persist — see **BUG-032** (model/service disagree; insert swallowed) and **TASK-041**
  (`worker:live` must signal completion). There is today no trustworthy "recording finalized, bytes at path
  X" event to hang the enqueue hook on, so FEAT-074 is **blocked** until both are `done`.
- **Acceptance criteria:**
  - New side table `live.recording_moderation` in live's schema (ADR-0004 side-table + terminal-state-ladder
    shape), migration schema-qualified (`db:migrate` creates but does not ALTER — STATUS #1); moderation
    columns are **not** added to `recordings`.
  - Recording bytes resolved from live's `outputPath` (finalized recording, TASK-041 signal); the lane never
    reads a whole-video Buffer.
  - The FEAT-073 video pipeline (keyframes → `moderateFrames` fail-closed / `describeFrames` fail-soft →
    side-table compare-and-set → flagged ⇒ `moderateContent({ contentType: 'video', precomputedResult })`) is
    reused, not re-invented; `establishModerationState()` discipline is ported to live (invariant A3 — every
    path that writes recording bytes re-establishes moderation state).
  - Invariant **A1**: recordings are not servable to anyone but their owner until moderation resolves,
    gated by `LIVE_RECORDING_MODERATION=off|shadow|enforce` (default **off**); a `canServe(recording,
    moderation, requesterId)` gate mirrors FileVault's shape (playback route is TASK-044).
  - Invariant **A2**: recording bytes are served only through an authorized module route — **no static
    nginx/SRS exposure of the recording directory**; VERIFY inspects the nginx config.
  - §6.3 product call is honored: the first production rung is **shadow**; owner-visible-immediately +
    others-pending is the default hold shape — required AC per ADR §6.3 (Rick owns the product decision).
  - Per-backend video risk thresholds recorded (`backend` + `model` on every row); enforce on the secondary
    backend gated on TASK-042.
- **Notes:** Structural + data — **systems-architect signed off** (the ADR-0002 §5 amendment, the A1–A5
  invariants, composition-layer reuse). The `live.recording_moderation` DDL, its indexes (incl. the partial
  reconcile index), and the migration mechanics are **dba co-sign required** (ADR §4.4). **Rick** owns the
  §6.3 recording pending-visibility product call. **cost-benefit-analyzer signed off**
  (`done: proceed-with-slice — DEFERRED per assessment`). Cross-link: **ADR-0005**
  (`docs/adr/0005-cortex-backend-failover-and-video-moderation.md`) §4.4, §5 (A1–A5), §6.3, §8.3,
  Required-changes 7/11/12. **Deferred**: blocked on BUG-032 + TASK-041 (the recording state machine must
  persist and `worker:live` must signal completion first); also depends on FEAT-072/073. Revisit trigger:
  BUG-032 **and** TASK-041 both `done`. Route to sr-developer (XL critical path — break down further at
  grooming-for-commit if still large after the prereqs land).

### FEAT-076 — Media captions/subtitles (WebVTT) pipeline + `<track>` in every player (parent epic)
- **Type:** feature · **Status:** backlog · **Priority:** P2 · **Size:** XL
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** — (2026-07-20 W3C conformance review — WebVTT/WCAG 1.2 pass)
- **Cost/Benefit:** pending
- **Description:** **WebVTT is entirely absent from the platform** — no `.vtt` is
  authored, generated, stored, served, or parsed anywhere, and every media surface
  renders a bare native `<video>/<audio controls>` with **no `<track>` child** and no
  caption affordance (`web/src/features/streams/HlsPlayer.tsx:47-53`,
  `web/src/features/timeline/PostMedia.tsx:239-249`,
  `web/src/features/files/viewers/MediaPlayer.tsx:31-47`,
  `web/src/features/rooms/VideoTile.tsx:44-56`,
  `web/src/features/messages/MessageAttachments.tsx:119`). The `/live` RTMP→ffmpeg→HLS
  path emits video/audio only — no `EXT-X-MEDIA:TYPE=SUBTITLES` rendition, no `-c:s`,
  no ASR (`services/live/src/services/ffmpeg.js:200-357`). Consequently **WCAG 2.2
  SC 1.2.1–1.2.5 all fail categorically** (1.2.2 prerecorded captions, Level A, and
  1.2.4 live captions, Level AA, most sharply) — a blocker for any accessibility
  conformance claim. XL: **must be decomposed before `ready`.**
- **Acceptance criteria:**
  - Caption asset model + storage (fileId → language, `kind`, UTF-8 `.vtt` blob),
    natural home FileVault; DBA sign-off on the schema (new-column ALTER gap applies).
  - Server serves `.vtt` with `Content-Type: text/vtt` and CORS/headers that let
    `<track src>` load; upload path validates the WEBVTT signature + `-->` cue timing
    + UTF-8 before store.
  - `<track kind="captions" srclang label default>` injected into all five players;
    the native CC control appears wherever a track exists.
  - `<track kind>` restricted to `captions`/`subtitles`/`descriptions` per WHATWG HTML;
    a WEBVTT validator gates CI once `.vtt` artifacts exist.
  - Later slices (tracked at decomposition): `/live` HLS `SUBTITLES` `EXT-X-MEDIA`
    group + segmented WEBVTT + hls.js subtitle rendering (SC 1.2.4); optional ASR
    worker (Bull/RabbitMQ pattern, cortex-hosted) auto-generating conformant `.vtt`.
- **Notes:** FEAT — Cost/Benefit gate applies (stays `backlog` until assessed). Cheap
  first slice = model + serve + upload + wire `<track>` into the five players (clears
  SC 1.2.2 for prerecorded), deferring live-HLS captions and ASR. P2P WebRTC rooms
  (`VideoTile`) are outside strict caption-file scope. Touches `web/` players +
  FileVault + live edge → **dba** for the schema, sr-developer for the build.

### FEAT-077 — Capability façade (FEAT-061 Pass 2): reconcile ShareLink + RoomFile behind one shared mechanism
- **Type:** feature · **Status:** backlog · **Priority:** P1 · **Size:** M
- **Owner-role:** unassigned · **Relates:** FEAT-061 (Pass 1, done), FEAT-047/048/049 (blocked-before), FEAT-039, FEAT-055, BUG-020/026/027 lineage
- **Cost/Benefit:** pending
- **Legacy:** — (split from FEAT-061 at the 2026-07-27 in-review closeout)
- **Description:** Extract a shared capability façade so Gallery (FEAT-047) plugs in
  without a redesign; reconcile FileVault `ShareLink` (already CA-token-backed) and Live
  `RoomFile` (row-backed provenance grants) behind it. Restate the invalidation AC to
  match Rick's 2026-07-13 provenance decision: owner-minted capabilities survive a
  private-flip; non-owner grants die with the visibility they were minted under.
- **Acceptance criteria:**
  - One façade both consumers call; behavior parity proven by the existing shareGate /
    roomMemberDownload suites plus new façade-level tests.
  - Compatibility window: live issued share links in `share.js`/`roomCollab.js` do not
    break on cutover.
  - Invalidation semantics per the restated (provenance-decision-aligned) AC.
- **Notes:** **Must land before FEAT-047 album sharing starts** (FEAT-047's notes
  already require this). systems-architect sign-off on the façade shape.

## Bugs

*(Security-hardening items triaged out of the `SP-11` review — filed, not
must-fix this cycle. See `STATUS.md` → "Security review of the branch (SP-11)".)*

### BUG-036 — `CA_BASE_URL` points at the nginx edge; node/axios loopback to it hangs → platform-wide CA_UNAVAILABLE
- **Type:** bug · **Status:** done · **Priority:** P1 · **Size:** S — reconciled 2026-07-27 — merged to `main` (`2cd6bf5`)
- **Owner-role:** systems-architect / dba
- **Fix applied:** corrected the live `.env` CA URLs to the localhost loopback (backup at `.env.bak-ca-fix-20260720`; `.env.example` was already correct) **and** added a startup guard in `src/index.js` — the gateway now warns loudly (with the exact fix) at boot if `CA_BASE_URL`/`CA_URL` is a non-loopback host. Verified: authed writes return 200 with no override; guard fires on the edge value, silent on loopback.
- **Found:** 2026-07-20 while runtime-verifying FEAT-075 on this machine.
- **Symptom:** every authenticated module request 401s with `CA_UNAVAILABLE` ("Unable to connect to Certificate Authority", axios `timeout of 5000ms exceeded`). Token *issuance* (login) works; token *validation* by modules does not, so the whole platform is unusable while authenticated.
- **Root cause:** `.env` sets `CA_BASE_URL=https://exprsn.local/ca` — i.e. module→CA validation loops **out through the nginx edge**. Node/axios's TLS handshake to nginx (`exprsn.local:443`) hangs (curl to the same URL works; node→gateway `localhost:8443` works). The unified in-process gateway should loop CA calls back to the gateway directly, exactly like the other `*_SERVICE_URL`s (CLAUDE.md: "all point back at https://localhost:8443/<module>").
- **Fix:** set `CA_BASE_URL=https://localhost:8443/ca` (and align `.env.example`, the setup TUI schema — see [[setup-tui]], and any prod override). Verified: overriding `CA_BASE_URL` to the localhost loopback makes `validateToken` return in ~10ms and all authed module calls succeed.
- **Note:** this is env/config, not code; but worth a guard so an nginx-edge `CA_BASE_URL` can't silently wedge the platform (e.g. prefer loopback for in-process, or a startup self-check).

### BUG-037 — `logger.error is not a function` in CA `requireSessionOrService` catch → 500 (and can strand a request)
- **Type:** bug · **Status:** done · **Priority:** P3 · **Size:** XS — reconciled 2026-07-27 — merged to `main` (`2cd6bf5`)
- **Owner-role:** jr-developer
- **Fix applied:** `services/ca/middleware/auth.js` imported `../config/logging` (a config object `{ level }`) instead of `../utils/logger` (the winston logger the other 12 CA files use) — so **all 8** `logger.*` calls in the file were broken, not just line 397. One-line import fix. Verified: a malformed `X-Service-Token` now returns a clean 401 instead of a 500.
- **Found:** 2026-07-20 alongside BUG-036.
- **Detail:** `services/ca/middleware/auth.js:397` calls `logger.error(...)` in the service-auth catch branch, but the module's logger (`require('../config/logging')`) has no `.error` method — so a *thrown* `verifyServiceToken` (e.g. malformed `X-Service-Token`) turns into a `TypeError` and a 500 instead of a clean 401. Fix: use the correct logger method/import (match the `logger` used elsewhere in the file) and return 401 on verify failure.

### BUG-001 — Authenticated SSRF via DID link / proof-of-control fetch
- **Type:** bug · **Status:** done (landed `fa2cd3c`; QA-verified 2026-07-07 — full caller-surface review, no bypasses; 55 tests green) · **Priority:** P2 · **Size:** S
- **Owner-role:** jr-developer · **Blocked-by:** —
- **Legacy:** SP-11 backlog
- **Description:** `userDidService` / `proofOfControl` make outbound fetches to
  caller-influenced hosts without the SSRF guard. The unauthenticated path
  (`/atproto/labels/verify`, H2) was already fixed via
  `services/atproto/src/util/safeFetch.js`; the authenticated DID/proof fetches
  still need to route through it.
- **Acceptance criteria:**
  - `userDidService` and `proofOfControl` outbound fetches go through `safeFetch`
    (https-only; rejects private/loopback/link-local/ULA/reserved by IP literal
    **and** DNS-resolved; `redirect:'manual'`; timeout; streamed size cap).
  - Regression test covering a blocked internal target.
- **Notes:** Groomed 2026-07-07 → `ready`. In-house, no infra; `safeFetch`
  (`services/atproto/src/util/safeFetch.js`) already exists from the H2 fix, so this
  is a contained re-route of the authenticated DID/proof paths. **Held (not committed)
  this cycle for capacity** — P2 pull-in candidate if the sprint gains slack. Route
  to jr-developer at BUILD (crisp acceptance).

### BUG-002 — atproto DoS guards (unbounded bodies, ws payload, cursor crash)
- **Type:** bug · **Status:** done (landed `ff98502`; QA-verified 2026-07-07 — stream-level caps confirmed, both ws surfaces bounded, cursor guard pre-query; full atproto suite 92/92) · **Priority:** P2 · **Size:** M
- **Owner-role:** sr-developer · **Blocked-by:** —
- **Legacy:** SP-11 backlog
- **Description:** Several unbounded/unsafe inputs on the atproto bridge.
- **Acceptance criteria:**
  - Bound `res.json()` reads in `pdsClient` / `appviewClient`.
  - Set a `maxPayload` on the `ws` server in `labelConsumer`.
  - Guard `subscribeLabels.js:52` `BigInt(cursor)` against a bad/non-numeric
    cursor (no crash).
- **Notes:** Groomed 2026-07-07 → `ready`. In-house, no infra; three independent
  input-bound guards. **Held (not committed) this cycle for capacity** — P2, M-sized;
  pull in only if the sprint gains slack. Route to sr-developer at BUILD.

### BUG-003 — /live WebRTC relay to client-supplied `to` lacks shared-room check
- **Type:** bug · **Status:** done (landed `b682236`; QA-verified 2026-07-07 — 52/52 green + canRelayTo bypass review clean) · **Priority:** P2 · **Size:** S
- **Owner-role:** sr-developer · **Blocked-by:** —
- **Legacy:** SP-11 backlog
- **Description:** `/live` signaling relays to a client-supplied `to` socket id
  without verifying both peers share a room (authenticated-only path, so lower
  severity, but still a scoping gap on top of the `SP-7`/`#11` auth work).
- **Acceptance criteria:**
  - A relay to `to` is dropped unless the target shares the sender's room.
  - Test covers cross-room relay rejection.
- **Notes:** Committed to `active/sprint-2026-07.md` 2026-07-07 (sr-developer —
  security-sensitive `/live` signaling). Handler-scope relay check inside the
  existing `/live` namespace — judged **non-structural** (no `registry.js` /
  namespace / `init()` change), so no architect sign-off gate. If implementation
  turns out to need per-namespace auth-middleware or socket-wiring changes, escalate
  to systems-architect before landing.

### BUG-004 — Seed scripts ship a default password with no prod guard
- **Type:** bug · **Status:** done (landed `e845a33` + QA follow-up `b534b56` extending the prod refusal to the 5 demo seeders; QA-verified across all 8 entry points 2026-07-07) · **Priority:** P2 · **Size:** S
- **Owner-role:** jr-developer · **Blocked-by:** —
- **Legacy:** SP-11 backlog
- **Description:** `scripts/seed/common.js` carries a committed default password
  and has no `NODE_ENV==='production'` guard, so a seed run against prod would
  create known-credential accounts.
- **Acceptance criteria:**
  - Committed default password removed (require an env/arg instead).
  - Seed scripts refuse to run when `NODE_ENV==='production'`.
- **Notes:** Committed to `active/sprint-2026-07.md` 2026-07-07 (jr-developer).
  In-house, crisp acceptance — `scripts/seed/common.js` only; no schema/infra, no
  architect/DBA gate.

### BUG-005 — Permission-inspect endpoints leak another user's permissions
- **Type:** bug · **Status:** done (landed `b24a828`; QA-verified 2026-07-07 — suite green + bypass review clean) · **Priority:** P2 · **Size:** S
- **Owner-role:** jr-developer · **Blocked-by:** —
- **Legacy:** SP-11 backlog
- **Description:** In `auth/src/routes/roles.js`, `GET /users/:userId/permissions`
  and `POST /check-permission` let any authenticated user inspect another user's
  permissions (info disclosure).
- **Acceptance criteria:**
  - Both endpoints restricted to self-or-admin (reuse
    `services/auth/src/middleware/requireAdmin.js` / self-scope check).
  - Test: a non-admin cannot read another user's permissions.
- **Notes:** Committed to `active/sprint-2026-07.md` 2026-07-07 (jr-developer).
  In-house — reuse `services/auth/src/middleware/requireAdmin.js` + a self-scope
  check; no schema/infra, no architect/DBA gate.

*(QA full-codebase audit — 2026-07-07. Reproducible defects found on branch
`feature/lowcode-gap-closure` @ `d4ef254`, verified against the live Docker
`exprsn-postgres`/`exprsn-redis`. Priorities are QA recommendations pending PM
grooming.)*

### BUG-006 — `POST /timeline/api/webhooks/moderator` is unauthenticated and clobbers post `metadata`
- **Type:** bug · **Status:** done · **Priority:** P2 · **Size:** S
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** API_SURFACE.md security-flags note ("timeline: `POST /api/webhooks/moderator` has **no signature check**"); SP-11 security theme (unauthenticated write surface)
- **Description:** In `services/timeline/src/routes/webhooks.js`, the `/moderator`
  route (mounted at `/timeline/api/webhooks/moderator`) has **no** auth/signature
  middleware, unlike its two siblings in the same file — `/bluesky` uses
  `requireWebhookSignature('BLUESKY_WEBHOOK_SECRET')` and `/approval` verifies an
  HMAC `x-webhook-signature`. Its handler does
  `Post.update({ metadata: { moderationStatus, moderationReasons } }, { where: { id: data.postId } })`,
  which **replaces the entire `metadata` JSON** of the target post. Any
  unauthenticated caller who knows/guesses a post UUID can set a post's
  moderation status to `flagged` (with attacker-supplied `moderationReasons`) or
  `approved`, and in doing so **wipe existing `metadata`** — including the
  `metadata.approval` hold state written by the "Require Approval for New Posts"
  pipeline. This is an integrity/authz defect, not just a leak.
- **Steps to reproduce:**
  1. Boot the stack (`npm run infra:up`, `npm start`); note a real post id.
  2. `curl -k -X POST https://localhost:8443/timeline/api/webhooks/moderator -H 'Content-Type: application/json' -d '{"event":"content.approved","data":{"postId":"<uuid>"}}'`
     — **no** bearer, **no** `x-webhook-signature`.
  3. Response is `200 {"success":true}`; the post's `metadata` is now
     `{"moderationStatus":"approved"}` (any prior `metadata`, incl. an approval
     hold, is gone).
- **Expected vs actual:** *Expected* — the endpoint requires the same
  service/HMAC auth as `/bluesky` and `/approval` (401 without it), and updates
  moderation fields without destroying unrelated `metadata`. *Actual* — accepts
  the write unauthenticated and overwrites the whole `metadata` object.
- **Severity/priority:** P2 (unauthenticated state mutation; sibling routes are
  already authed, so this is a clear oversight; requires knowing a post UUID, no
  data leak — hence P2 not P0).
- **Environment:** branch `feature/lowcode-gap-closure` @ `d4ef254`; DB `exprsn`
  (Docker `exprsn-postgres`); gateway on :8443.
- **Notes:** Product defect in `services/timeline/src/routes/webhooks.js` — hand
  to the timeline developer (sr/jr). The `metadata`-overwrite half should be a
  merge (`{ ...post.metadata, ... }`) regardless of the auth fix. Do **not** weaken
  the sibling routes to "match"; add auth here. Documented in API_SURFACE.md but
  never ticketed.
- **Resolution (done · 2026-07-07 · commit `c8384af`):** `/timeline/api/webhooks/moderator`
  is now gated by `requireWebhookSignature('MODERATOR_WEBHOOK_SECRET')` — 503 when the
  secret is unset, 401 on a bad/missing signature — matching its `/bluesky` sibling, and
  **both** metadata writes now merge (`{ ...post.metadata, ... }`) instead of clobbering,
  so an existing `metadata.approval` hold is preserved. New regression suite
  `services/timeline/tests/integration/webhooks.test.js` is 5/5 green and `API_SURFACE.md`
  (L44) was updated. Verified by orchestrator re-run (5/5).

### BUG-007 — CA `UserGroups` schema drift: model declares a `group_id` index the live table lacks (`db:check` red)
- **Type:** bug · **Status:** done · **Priority:** P2 · **Size:** S
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** token-spec v1.1 (`services/ca/migrations/20260702000001-token-spec-v1-1.js`, `services/ca/models/UserGroup.js`); CLAUDE.md "sync `db:migrate` creates tables but never ALTERs existing ones"; STATUS #1 (schema/migration alignment)
- **Description:** `npm run db:check` (`scripts/check-drift.js`, the documented
  read-only pre-deploy drift gate) exits **non-zero** with:
  `✗ ca: MISSING INDEX UserGroups: group_id | ...`. `services/ca/models/UserGroup.js`
  declares `indexes: [{ fields: ['group_id'] }, { fields: ['role'] }]`, but the live
  `ca."UserGroups"` table has only `UserGroups_pkey (user_id, group_id)` and
  `user_groups_role_idx (role)` — **no standalone `group_id` index**. The
  token-spec v1.1 migration created `user_groups_role_idx` but never a `group_id`
  index, and the table pre-existed (created by Sequelize's string-through
  association), so sync-based `db:migrate` never added it either. (The token
  columns `ca.tokens.{group_id,organization_id,revoked_by}` **are** present — the
  migration `up()` was applied — so CA token routes do **not** 500; this is
  index-only drift.)
- **Steps to reproduce:**
  1. Infra up (PG + Redis).
  2. `npm run db:check` → exit code non-zero, report shows
     `✗ ca: MISSING INDEX UserGroups`.
  3. `\d ca."UserGroups"` confirms no index whose leading column is `group_id`.
- **Expected vs actual:** *Expected* — model and live schema agree; `db:check`
  clean (exit 0). *Actual* — model declares a `group_id` index absent from the DB;
  drift gate red.
- **Severity/priority:** P2 — reddens the documented pre-deploy drift gate
  (`db:check` exits non-zero). Runtime impact is low (missing index → potential
  seq-scan on group_id-only lookups against a membership table; no 500s), so a
  downgrade to P3 is reasonable if the drift gate isn't release-blocking.
- **Environment:** branch `feature/lowcode-gap-closure` @ `d4ef254`; DB `exprsn`
  schema `ca` (Docker `exprsn-postgres`).
- **Notes:** **Schema-correctness — dba to own the fix and verify.** Fix is either
  (a) add the `group_id` index to the live table **and** the token-spec migration
  (`addIndex(userGroups, ['group_id'])`) so fresh deploys match, or (b) drop
  `{ fields: ['group_id'] }` from the model if the composite PK/FK is deemed
  sufficient. QA does not patch product/schema code. Re-run `db:check` to confirm
  clean after the fix.
- **Resolution (done · 2026-07-07 · commit `b9cdc62`):** Two-part fix. (1) New
  idempotent, schema-qualified migration
  `services/ca/migrations/20260707000001-usergroups-group-id-index.js` adds the
  `user_groups_group_id` index (applied to the live `ca` schema so fresh deploys match
  the model). (2) `scripts/check-drift-one.js` was corrected to group composite uniques
  by their shared Sequelize unique-name — the separate `user_id`/`group_id` single-column
  expectations were a checker false-positive on the dual-primaryKey PK. `npm run db:check`
  now exits 0 with all 10 modules reporting no drift. Verified by orchestrator (dba-owned
  fix).

### BUG-008 — moderator `rules.test.js` calls `ruleEngineService.applyCustomRules` which does not exist (stale test; fails `test:all`)
- **Type:** bug · **Status:** done · **Priority:** P3 · **Size:** S
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** — (sibling in spirit to TASK-002 / STATUS #9 auth-suite stabilization, but a **different** suite-family: moderator)
- **Description:** `services/moderator/tests/integration/rules.test.js:198`
  (`applyCustomRules › aggregates custom rule results`) calls
  `ruleEngineService.applyCustomRules(...)`, but that method does not exist on the
  service. `services/moderator/services/ruleEngineService.js` exposes
  `evaluateRules` / `applyKeywordFilters` / `applyRegexFilters`; the custom-rule
  aggregation lives as a **private** `_applyCustomRules` on `classification.js` and
  `moderationService.js` (exercised — and passing — via `moderation.test.js`). The
  test asserts against an API the service never provided → stale test.
- **Steps to reproduce:**
  1. `cd services/moderator && npx jest`
  2. Result: `Test Suites: 1 failed, 3 passed`; `Tests: 1 failed, 48 passed`;
     failure `TypeError: ruleEngineService.applyCustomRules is not a function`.
- **Expected vs actual:** *Expected* — moderator suite green (so the `test:all`
  moderator portion is green). *Actual* — 1 deterministic failure from a
  test-only, non-existent-method reference.
- **Severity/priority:** P3 — test-code defect; the underlying custom-rule feature
  works and is covered elsewhere. Non-blocking (CI `test` job is non-blocking), but
  it keeps the moderator suite red, which blocks moving that job toward blocking.
- **Environment:** branch `feature/lowcode-gap-closure` @ `d4ef254`; Node
  v24.16.0; live PG (`exprsn-postgres`); moderator uses `tests/integration/setup.js`.
- **Notes:** Test defect (not product) — retarget the assertion at the real API
  (`ruleEngineService.evaluateRules`, or the `_applyCustomRules` on
  `classification`/`moderationService`) or remove the obsolete `describe` block.
  Route to a developer at BUILD; QA does not patch tests it gates on.
- **Resolution (done · 2026-07-07 · commit `cea4cde`):** Removed the obsolete
  `applyCustomRules` describe block — it was pure duplication of the existing
  `evaluateRules` aggregation test, and the underlying custom-rule feature stays covered
  by `moderation.test.js`. Moderator suite is now 48/48 green. Verified.

### BUG-009 — atproto `didExprsn.test.js` fails under the full suite ("Test environment has been torn down"); passes in isolation
- **Type:** bug · **Status:** done · **Priority:** P3 · **Size:** S
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** STATUS "atproto / Bluesky bridge" section (claims "full atproto Jest suite green"); atproto `cborg`/ESM notes
- **Description:** Running the whole atproto suite
  (`cd services/atproto && NODE_OPTIONS=--experimental-vm-modules npx jest`) fails
  `tests/didExprsn.test.js` — all 4 tests error with `Test environment has been
  torn down` at `dynImport (src/util/esm.js:25)` ← `keyManager.load()` ←
  `generateKeypair (tests/didExprsn.test.js:15)`. The suite's async dynamic ESM
  import (the `@atproto/crypto` / `@ipld/dag-cbor` loader) resolves **after** Jest
  tears down the VM under `--experimental-vm-modules`. Run **in isolation**
  (`npx jest tests/didExprsn.test.js`) the same 4 tests **pass** — so this is a
  cross-suite teardown/ordering flake, not a product defect (did:exprsn works).
- **Steps to reproduce:**
  1. Full run: `cd services/atproto && NODE_OPTIONS=--experimental-vm-modules npx jest`
     → `Test Suites: 1 failed, 9 passed`; `Tests: 4 failed, 71 passed`; failures all
     `Test environment has been torn down`.
  2. Isolated: `... npx jest tests/didExprsn.test.js` → `4 passed`.
- **Expected vs actual:** *Expected* — deterministic green regardless of run
  context (STATUS records the atproto suite as green). *Actual* — flaky: 4
  didExprsn tests fail only in the full-suite run.
- **Severity/priority:** P3 — flaky test infra; feature verified working in
  isolation; atproto is **not** in `test:all`'s module list, so no CI-gate impact.
- **Environment:** branch `feature/lowcode-gap-closure` @ `d4ef254`; Node v24.16.0;
  atproto Jest with `--experimental-vm-modules`.
- **Notes:** Test-stability defect — likely fixable by awaiting/caching the ESM
  load in `beforeAll` (warm `keyManager.load()` before tests) or isolating the
  suite (`testEnvironmentOptions`/separate project) so a peer suite's teardown
  can't race the in-flight `import()`. Route to the atproto developer. Not a
  security/behavior regression.
- **Resolution (done · 2026-07-07 · commit `3e6c862`):** `services/atproto/src/util/esm.js`
  now uses a direct `import()` instead of the `new Function`-based indirection that
  detached the dynamic import from its referrer under `--experimental-vm-modules` (the
  post-teardown race). The full atproto suite is now deterministically green (10 suites /
  75 tests over 13+ runs). `labelSigner.test.js` was affected by the same root cause and
  is fixed by the same one-liner. Verified by orchestrator (75/75).

*(Moderation routing & auth-gating — implementation intake 2026-07-07, from the
systems-architect design doc `sprints/moderation-routing-plan.md`. BUG-010 is the
`SPIKE-001` follow-up implementation ticket the spike's AC called for.)*

### BUG-010 — Auth-gate the 6 unauthenticated moderator REST routers (SPIKE-001 fix)
- **Type:** bug · **Status:** done · **Priority:** P1 · **Size:** M — reconciled 2026-07-27 — merged to `main` (`55bae89`)
- **Owner-role:** unassigned · **Blocked-by:** — *(systems-architect sign-off already given in `sprints/moderation-routing-plan.md`; no DB migrations)*
- **Legacy:** SPIKE-001 (architect review → this is its per-AC follow-up implementation ticket) · SP-11 security theme (unauthenticated read/write surface) · sibling to BUG-006 (unauthenticated mutation surface) · API_SURFACE.md L30 (see TASK-017 doc drift)
- **Description:** Closes out the security finding from **SPIKE-001**, per the
  architect's decision in `sprints/moderation-routing-plan.md` (Item A). Moderator's
  `moderation` / `review` / `reports` / `metrics` / `actions` / `appeals` routers
  (`services/moderator/routes/*.js`) carry **no** auth middleware — no `requireAdmin`,
  no bearer/HMAC check — unlike their gated siblings `rules`/`agents`/`wordlists`/
  `queues`/`workflows`. They expose moderation state and, worse, **mutate** it
  (execute actions, resolve reports, decide appeals) for unauthenticated callers.
  **Typed BUG** (not TASK) deliberately: this is a live unauthenticated-mutation
  defect on a pre-public surface, matching the repo convention set by **BUG-006**
  (unauthenticated moderator-webhook mutation) and the SP-11 security-bug batch
  (`BUG-001`…`BUG-005`). Gate all six per the design doc's per-endpoint auth table,
  across three surfaces: existing **`requireAdmin`** (console reads + moderator
  mutations), a **new `requireUser`** (any valid CA bearer, no role gate — for
  end-user report/appeal *submit*), and a **new `requireService`** HMAC gate
  (inter-module HTTP submit/status), extracted from the inline gate already in
  `services/moderator/src/routes/notifications.js`. Build **A1** (P1 mutation paths +
  bind submit-handler identity to `req.userId`) before **A2** (read paths).
- **Acceptance criteria:**
  - **New middleware:** `services/moderator/src/middleware/requireUser.js` (clones
    `requireAdmin`'s CA-validate block, drops the role check, sets `req.userId` from
    the validated token) and `services/moderator/src/middleware/requireService.js`
    (HMAC `X-Service-ID`/`X-Service-Token` via `verifyServiceToken`, extracted from
    `routes/notifications.js:41-47`, 401 on missing/invalid) exist; both import from
    `@exprsn/shared` (no `services/shared/` two-copy edit needed).
  - **A1 — the four P1 unauthenticated-mutation paths reject unauthenticated calls
    (401):** `POST /api/actions/execute`; `review` `POST /:id/remove`, `/:id/ban`,
    `/:id/reject`, `/:id/warn` (and the sibling `/approve`, `/skip`, `/analyze`);
    `PUT /api/reports/:id/resolve`; `POST /api/appeals/:id/review`.
  - **A1 — actor identity is bound to the validated token, not the body:** `reports`
    `POST /` derives `reportedBy` from `req.userId` (no longer trusts the body);
    `appeals` `POST /` derives the appellant from `req.userId` (replaces
    `req.body.userId`, `appeals.js:41`); `appeals` `POST /:id/review` derives the
    reviewer from `req.userId` (replaces `req.body.reviewerId`, `appeals.js:157`).
    A spoofed `reportedBy`/`userId`/`reviewerId` in the body has no effect.
  - **A1 — `moderation` router service auth:** `POST /content` and `POST /batch`
    require `requireService`; `GET /status/:sourceService/:contentType/:contentId`
    accepts **either** `requireService` **or** `requireAdmin`. The in-process
    atproto/Item-B `moderateContent` direct-require path is unaffected (trusted
    same-process call — no HTTP auth added or needed).
  - **A2 — read paths gated:** `review`, `metrics`, `actions` gated uniformly with
    `router.use(requireAdmin)` (matching the `rules`/`wordlists` idiom); the mixed
    routers `reports` and `appeals` gated **per route** (`requireUser` on submit,
    `requireAdmin` on all `GET` lists/`:id`/stats/case and `PUT`/decision paths).
    Every endpoint of all six routers is gated per the design-doc table; none remain
    unauthenticated.
  - `health` (`routes/health.js`, `/health`) stays public (not one of the six, no
    moderation data). Existing gated routers
    (`rules`/`agents`/`wordlists`/`queues`/`workflows`) are unchanged.
  - No new open/unauthenticated surface; security invariants unchanged (fail-closed
    `DEV_BYPASS`, CORS never wildcard-with-credentials, correlation-id error handler,
    per-schema isolation). **No DB migrations.**
  - Tests: an unauthenticated call to each of the four P1 mutation paths returns 401;
    a submit with a spoofed body-actor is bound to the token identity; an admin read
    path rejects a valid non-admin bearer.
- **Notes:** Groomed → `ready` 2026-07-07. **Architect sign-off already given**
  (`sprints/moderation-routing-plan.md`, Item A — security-structural / module-surface
  posture) so no separate architect gate at COMMIT; **no DB migrations** (so no dba
  gate) and no `registry.js`/namespace/`init()` change. Build **A1 (P1) first**, then
  **A2 (P2 reads)**. Sized **M** → route to **sr-developer** at BUILD (security-sensitive
  auth wiring, two new middleware, per-route gating on three mixed routers). Coordinate
  the doc update with **TASK-017** (API_SURFACE moderator-auth note) once landed.
  FEAT-010/FEAT-015/FEAT-012/FEAT-020 depend on this router's final auth posture.

### BUG-011 — `POST /auth/api/roles/check-service-access` trusts a body-supplied `userId` (same shape as BUG-005)
- **Type:** bug · **Status:** done (landed `26a2afc`; QA-verified 2026-07-07 — 10/10 green; roles.js body-trusted-identity audit clean, no ungated paths remain) · **Priority:** P2 · **Size:** S
- **Owner-role:** jr-developer · **Blocked-by:** —
- **Legacy:** sibling of BUG-005 (permission-inspect info disclosure); found during BUG-005 implementation 2026-07-07
- **Description:** In `services/auth/src/routes/roles.js` (~L576),
  `POST /check-service-access` reads `userId = req.user.id` **defaulting from the
  body** with no self-or-admin check — the identical shape BUG-005 just fixed on
  `GET /users/:userId/permissions` and `POST /check-permission`. Any authenticated
  user can probe another user's service-access grants (info disclosure).
- **Acceptance criteria:**
  - The endpoint is restricted self-or-admin, reusing the `canInspectPermissions`
    helper added by BUG-005 (`services/auth/src/routes/roles.js`).
  - Test added to `services/auth/tests/permissionInspect.test.js`: a non-admin
    cannot check another user's service access (403).
- **Notes:** Filed 2026-07-07 from the BUG-005 implementation report (out of that
  ticket's AC scope). Crisp, S, no schema/infra — jr-developer candidate; natural
  pull-in if Sprint 2026-07 drains early, alongside `BUG-001`/`BUG-002`.

### BUG-012 — oauth2 `client_credentials` grant request 500s (unimplemented, unhandled)
- **Type:** bug · **Status:** backlog · **Priority:** P3 · **Size:** S
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** found during TASK-002 suite stabilization 2026-07-07
- **Description:** The oauth2-server model in `services/auth` has no
  `getUserFromClient`, so `POST /auth/api/oauth2/token` with
  `grant_type=client_credentials` from an authorized client throws instead of
  returning a proper OAuth error. The stabilized `oauth2.test.js` covers the
  `unauthorized_client` rejection path only.
- **Acceptance criteria:**
  - `client_credentials` either implemented (model `getUserFromClient`) or
    explicitly rejected with a spec-correct `unsupported_grant_type` /
    `unauthorized_client` error — no 500 / unhandled throw.
  - Test covers the chosen behavior.
- **Notes:** Filed 2026-07-07 from the TASK-002 report. Decide implement-vs-reject
  with PM; either way S-sized, jr/sr candidate.

### BUG-013 — Cortex seeds leave python tools `enabled` in a state the API would refuse
*(renumbered from BUG-010 at merge: the parallel QA branch filed a different BUG-010 first)*
- **Type:** bug · **Status:** backlog · **Priority:** P3 · **Size:** S
- **Owner-role:** jr-developer · **Blocked-by:** —
- **Found:** FEAT-022 QA click-through (2026-07-09), live gateway w/ `CORTEX_ENABLED=true`.
- **Description:** `scripts/seed/cortex-defaults.js` writes `reverse-string` and
  `word-count` (both `kind: python`) with `enabled = true` straight through
  `registry.save()`, which bypasses the test gate. But `POST
  /cortex/api/v1/tools/:name/enable` runs the suite first, and with
  `CORTEX_PYTHON_TOOLS_ENABLED=false` (the default) every python test errors —
  so the API answers **400** for exactly the state the seeder just persisted
  (verified live: `enable word-count -> HTTP 400`). Two visible consequences:
  (1) `ToolRegistry.agentTools()` offers `word_count` / `reverse_string`
  schemas to every agent run, and each call comes back
  `error: PermissionError: python tools are disabled…`, burning a tool-call
  iteration; (2) the admin Tools tab shows an **enabled** tool whose Test report
  is `0 passed / 4 failed`, which reads as broken.
  The seeder header comment documents the seed-enabled choice deliberately, so
  this is a design wart to decide on, not an accident.
- **Options:** (a) seed python tools `enabled: false` (they can be enabled once
  the flag + sandbox land — see TASK-021); (b) have `agentTools()` skip
  python-kind tools when `pythonToolsEnabled` is false; (c) both. (b) is the
  behavior fix; (a) is the honest-state fix.
- **Acceptance criteria:** with `CORTEX_PYTHON_TOOLS_ENABLED=false`, no agent
  run is offered a python tool, and no tool shows `enabled` with a failing
  suite; `npm run seed:cortex` stays idempotent.

### BUG-014 — `cortex` is not a valid `ai_provider` enum value, so an enforced cortex verdict cannot be stored
*(renumbered from BUG-011 at merge — commits 4bb95dd/28fc965 reference the old id)*
- **Type:** bug · **Status:** in-review · **Priority:** P1 · **Size:** S
- **Owner-role:** dba · **Blocked-by:** — · **Relates:** FEAT-023
- **Found:** live verification of FEAT-023 (2026-07-09), gateway with
  `CORTEX_MODERATION_MODE=enforce DEFAULT_AI_PROVIDER=cortex`.
- **Description:** With cortex enforced, the local-LLM call succeeds and returns
  a well-formed verdict, but persisting the `ModerationItem` fails:
  `invalid input value for enum moderator.enum_moderation_items_ai_provider:
  "cortex"` → the route answers `500 MODERATION_FAILED`. The provider list is
  pinned in four places and none of them knows about cortex:
  - `services/moderator/models/ModerationCase.js:139` — `DataTypes.ENUM('claude','openai','deepseek','local')` (table `moderation_items`)
  - `services/moderator/models/AIAgent.js:50` — same enum for `provider`
  - `services/moderator/middleware/validation.js:71` — Joi `.valid('claude','openai','deepseek','local')`, so a per-request `aiProvider: 'cortex'` override is rejected at the edge too
  - `services/moderator/database/schema.sql:90` — `CREATE TYPE ai_provider AS ENUM (...)`
  Note the enum already carries a `'local'` value (and `config.ai.local` exists,
  unused) — the decision is whether cortex persists as a new `'cortex'` label or
  reuses `'local'`. A new label is preferable: `'local'` cannot distinguish which
  local engine produced a verdict, which matters for the accuracy audit trail.
- **Impact:** only reachable with `CORTEX_MODERATION_MODE=enforce`, which is not
  the default and is gated on a benchmark anyway — so this does not affect the
  shipped default (`off`) or `shadow` mode (shadow never persists a verdict).
- **Acceptance criteria:** a Postgres enum migration adds `'cortex'` (note
  `ALTER TYPE … ADD VALUE` cannot run inside a transaction on older PG, and the
  sync-based `db:migrate` will not alter enums — see the `db:check` drift audit);
  all four pin-points updated; `npm run db:check` reports no ENUM drift; an
  enforced cortex verdict persists and `GET` returns `aiProvider: 'cortex'`.
- **Resolution (2026-07-09, dba):** Decision — added a DISTINCT `'cortex'` enum
  label (NOT a reuse of `'local'`): `config.ai.local` denotes local ML *model
  files* (nsfw/toxicity/spam classifiers), a different engine than the Cortex
  local LLM, and FEAT-023's enforcement gate needs a per-provider accuracy audit
  trail — collapsing cortex into `local` would defeat it. Changed:
  - `services/moderator/migrations/20260709000001-add-cortex-ai-provider.js` (new)
    — idempotent `ALTER TYPE … ADD VALUE IF NOT EXISTS 'cortex'` over ALL provider
    enum type names (`ai_provider` raw path + the sync-built
    `enum_moderation_items_ai_provider` / `enum_ai_agents_provider`), schema-agnostic
    via a `pg_type` loop; with a guarded, working `down` that rebuilds each enum
    without `cortex` and refuses if any row still uses it. PG16 here, so
    `ADD VALUE IF NOT EXISTS` is transaction-safe (verified).
  - `models/ModerationCase.js`, `models/AIAgent.js`, `middleware/validation.js`,
    `database/schema.sql` — all four pin-points now include `'cortex'`.
  - `tests/unit/cortexProviderEnum.test.js` (new) — Joi accepts `cortex`/rejects
    unknown; both model ENUMs include `cortex`. 4/4 green.
- **Apply to live DB (operator command):** the model-sync `db:migrate` will NOT
  alter an existing enum, and the live `exprsn` DB has no `SequelizeMeta` (it was
  sync-built), so a full `sequelize-cli db:migrate` is unsafe (would recreate
  existing tables, leaking into `public`). Run THIS migration's `up()` directly:
  ```
  cd services/moderator && \
    DB_HOST=localhost DB_PORT=5432 DB_NAME=exprsn DB_USER=exprsn DB_PASSWORD=<pw> \
    node -e 'const {Sequelize}=require("sequelize");const c=require("./config/database.js").development;const m=require("./migrations/20260709000001-add-cortex-ai-provider.js");(async()=>{const s=new Sequelize(c.database,c.username,c.password,{host:c.host,port:c.port,dialect:"postgres",logging:false});await m.up(s.getQueryInterface(),Sequelize);await s.close();})()'
  ```
  Applied to live `exprsn` on 2026-07-09. Both `moderator.enum_moderation_items_ai_provider`
  and `moderator.enum_ai_agents_provider` now carry `cortex`; `npm run db:check`
  exits 0 (no ENUM drift). End-to-end re-verified: enforce-mode POST of toxic text
  to `/moderator/api/moderate/content` returns `200 success:true` (riskScore 92,
  flagged) and the persisted `moderation_items` row has `ai_provider = 'cortex'`
  — no more `MODERATION_FAILED`.

### BUG-015 — `CORTEX_MODERATE` is a silent no-op: `llm_message` is not a valid `content_type`
*(renumbered from BUG-012 at merge — commit 4bb95dd references the old id)*
- **Type:** bug · **Status:** backlog · **Priority:** P2 · **Size:** S
- **Owner-role:** dba (enum) + sr-developer (fail-open policy) · **Relates:** FEAT-021, BUG-014
- **Found:** live verification of FEAT-023 (2026-07-09).
- **Description:** Cortex's optional moderator cross-screen
  (`CORTEX_MODERATE=true` → `moderatorScreen()` in
  `services/cortex/src/engine/jobs.js:55`) posts
  `contentType: 'llm_message'` to `/moderator/api/moderate/content`. But
  `moderation_items.content_type` is an enum of
  `text, image, video, audio, post, comment, message, profile, file` — there is no
  `llm_message`. Moderator's very first step is a dedup
  `ModerationItem.findOne({ where: { sourceService, contentType, contentId } })`,
  and Sequelize casts that value to the enum, so Postgres throws
  `invalid input value for enum … content_type: "llm_message"` **before** any
  moderation happens. The route answers 500; cortex's `moderatorScreen` catches it,
  logs `moderator screen unavailable (fail-open)`, and returns `null`.
  Net effect: **the feature has never done anything.** It fails open on every call,
  so no test or runtime signal ever surfaced it — only the warn line.
  Reproduce: `curl -sk -X POST https://localhost:8443/moderator/api/moderate/content
  -H 'Content-Type: application/json' -d '{"contentType":"llm_message","contentId":"x",
  "sourceService":"cortex","userId":"<uuid>","contentText":"hi"}'`
- **Fix options:** (a) add `llm_message` to the `content_type` enum (migration —
  pair with BUG-014's enum work); or (b) have `moderatorScreen()` send an existing
  value such as `'message'` / `'text'`. (a) preserves the audit distinction between
  a user message and LLM output; (b) needs no migration.
- **Also worth deciding:** whether `moderatorScreen` should keep failing open. It is
  a documented deliberate choice, but a fail-open screen that is 100% failing is
  indistinguishable from a working one — at minimum the warn should be loud/counted.
- **Acceptance criteria:** with `CORTEX_MODERATE=true`, a cortex chat turn produces
  a persisted `moderation_items` row (or a documented, asserted skip); a test covers
  the round trip so a future enum drift cannot silently disable it again.

---

### BUG-028 — Moderator lost 4 workflow HTTP endpoints in consolidation — **INVALID / won't-fix**
- **Type:** bug · **Status:** done (won't-fix — not a defect) · **Priority:** P2 · **Size:** M
- **Owner-role:** sr-developer · **Blocked-by:** —
- **Legacy:** — (original-vs-platform audit, 2026-07-13)

> **CLOSED 2026-07-13 as INVALID.** The audit that filed this compared route *lists* and concluded
> the four endpoints were dropped. They were — **deliberately, and correctly.** All four were
> **proxies to the standalone `exprsn-workflow` service** (`WORKFLOW_SERVICE_URL`,
> `http://localhost:3017`), which is **not part of the platform** — it is one of the
> never-consolidated services. The original's `routes/workflows.js` imported
> `../services/workflowIntegration` (an **axios client**) as `workflowService`; every one of the four
> handlers was a thin pass-through to it.
>
> The platform **replaced that proxy with an in-process Bull engine** (`services/workflowEngine.js`)
> and rewired the router accordingly — its own header says so: *"backed by the local workflowEngine
> (durable Bull runtime). Replaces the former external Workflow-service proxy."* Each endpoint has a
> live in-process replacement:
>
> | original (proxy) | platform replacement |
> |---|---|
> | `POST /moderate/auto` | `workflowEngine.triggerForContent()`, called in-process from `services/moderator/services/moderationService.js:206` |
> | `POST /trigger/:id` | `POST /:id/execute` — same `executeWorkflow(id, data)` call |
> | `POST /callback` | **obsolete** — it was the async callback *from* the external service; no external service, no caller |
> | `POST /setup-defaults` | `scripts/seed/moderation-demo.js` seeds workflows into `moderator_config` (category `workflows`) |
> | `GET /executions/:executionId` | `GET /executions/:id` — benign rename (already noted below) |
>
> **Restoring them would have been actively harmful:** it would re-add HTTP proxies to a service on
> port 3017 that does not exist and is configured nowhere (`WORKFLOW_SERVICE_URL` appears in no
> `.env`, `.env.example`, or compose file) — and an unauthenticated `POST /moderate/auto` would have
> re-created **BUG-023** (unauthenticated verdict forgery) almost exactly. The platform's router is
> `requireAdmin` for the whole surface; the original's was not.
>
> **Net: the consolidation lost nothing here. There is now no known functional regression anywhere in
> the port.** The one real residue is the orphaned axios client left behind — filed as **TASK-033**.
- **Description:** **The only real functional regression found in the entire consolidation.**
  Four JSON endpoints exist in `/Volumes/Storage/exprsn-moderator/routes/workflows.js` and are
  absent from `services/moderator/routes/workflows.js`. A grep of the whole module confirms they
  were **not relocated** — they were dropped:

  | endpoint | original line | purpose |
  |---|---|---|
  | `POST /moderate/auto` | 293 | auto-moderation entrypoint |
  | `POST /callback`      | 237 | async workflow callback |
  | `POST /trigger/:id`   | 183 | trigger a workflow by id |
  | `POST /setup-defaults`| 267 | seed default workflows |

  These are **JSON API routes, not views** (`res.render` count in the original file is 0), so they
  are not covered by the deliberate view-stripping. `POST /moderate/auto` and `POST /callback` are
  the consequential two. Separately, `GET /executions/:executionId` was **renamed** to
  `GET /executions/:id` — that one is a benign rename, not a loss.
- **Acceptance criteria:**
  - The four endpoints exist and are functional against the platform's workflow engine.
  - Each is authenticated (do **not** restore them as unauthenticated surfaces — cf. BUG-010,
    BUG-023, SPIKE-001).
  - `POST /callback` verifies its caller (HMAC or equivalent); it must not be a forgery surface.
  - API_SURFACE.md documents them.
- **Notes:** **Do not straight-copy the handler bodies.** The platform's `workflowEngine.js` and
  `queueRegistry.js` are platform-*only* additions that did not exist in the original, so the
  original handlers call an engine that no longer has the same shape — these need **rewiring**.
  BUG-023 (unauthenticated verdict forgery via `POST /api/moderate/batch`) is the cautionary
  precedent for restoring a `/moderate/*` route without auth. Touches the same file as FEAT-051.

### BUG-030 — `POST /api/oauth2/introspect` requires no client authentication (token oracle)
- **Type:** bug · **Status:** done — QA-VERIFIED closed 2026-07-27 (in-review closeout, Sprint 2026-10) · **Priority:** P1 · **Size:** S
- **Owner-role:** sr-developer · **Blocked-by:** —
- **Legacy:** — (found while fixing BUG-029, 2026-07-13)
- **Description:** **RFC 7662 §2.1 requires authorization on the introspection endpoint.** Ours had
  none — no route middleware, no router middleware, no global middleware (verified). Any
  unauthenticated caller could POST a token value and receive `active`, `scope`, `username`
  (the user's **email**), `sub`, and `client_id`. That is a **token oracle**: it confirms whether a
  stolen or guessed token is live and discloses whose it is. **Both** the oidc and oauth2
  implementations had the hole, so it was not caused by the BUG-029 shadowing — fixing the
  shadowing alone would have left it open.
- **Acceptance criteria:**
  - Introspection requires client authentication (Basic or `client_id`/`client_secret`), returning
    `401 invalid_client` otherwise. ✅
  - A client may introspect only **its own** tokens; another client's token reads as
    `{active: false}` rather than 403, so the endpoint never confirms a token it will not describe. ✅
  - Revoked/expired tokens read as inactive. ✅
  - Regression tests cover all three. ✅
- **Notes:** **FIXED 2026-07-13** in `services/auth/src/routes/oauth2.js` — reuses the existing
  `oauth2Service.authenticateClientRequest()` that both `/revoke` implementations already used, so
  the change is small and the mechanism is proven. **Breaking for any client that introspected
  without credentials.** Two existing tests asserted the vulnerable behaviour (they introspected
  with no client auth and expected 200) and were updated. Also fixed a latent 500 found in the same
  handler: the `token_type_hint=refresh_token` branch read `accessTokenExpiresAt`, which
  `getRefreshToken()` does not return — that path threw. (`iat` was likewise always `NaN`, as no
  getter returns `createdAt`; it is now omitted rather than emitted as null.) 33/33 oauth2 tests green.
- **QA closeout (2026-07-27):** Fail-closed — `authenticateClientRequest` returns 401
  `invalid_client` before any token lookup (`oauth2.js:378–387`); cross-client
  introspection reads `{active:false}` (:400–402); all three AC bullets
  regression-tested (:408, :431, :572). Live-HTTP re-check deferred until exprsn infra
  is back up in a QA env.

### BUG-029 — `oidc` router is mounted bare and shadows three `oauth2` endpoints
- **Type:** bug · **Status:** done — QA-VERIFIED closed 2026-07-27 (in-review closeout, Sprint 2026-10) · **Priority:** P2 · **Size:** S
- **Owner-role:** sr-developer · **Blocked-by:** —
- **Legacy:** — (audit, 2026-07-13; API_SURFACE.md already flags the mount order)
- **Description:** **Security-relevant: two live implementations of token introspection and
  revocation, one of which is unreachable.** `services/auth/src/index.js:184` mounts `oidcRoutes`
  **bare — with no path prefix** — *before* `app.use('/api/oauth2', oauth2Routes)`. But
  `services/auth/src/routes/oidc.js` declares fully-qualified paths:

  ```
  oidc.js:35   GET  /api/oauth2/userinfo
  oidc.js:68   POST /api/oauth2/introspect
  oidc.js:115  POST /api/oauth2/revoke
  ```

  which collide exactly with `oauth2.js`:

  ```
  oauth2.js:340  GET  /userinfo     (→ /api/oauth2/userinfo)
  oauth2.js:372  POST /introspect   (→ /api/oauth2/introspect)
  oauth2.js:305  POST /revoke       (→ /api/oauth2/revoke)
  ```

  Express resolves first-match, and oidc is mounted first — so **`oauth2.js`'s `userinfo`,
  `introspect`, and `revoke` handlers are dead code that can never execute.** The two
  implementations are not identical, so the effective behaviour of token introspection *and token
  revocation* is whichever oidc.js does, which may not be what the oauth2 flow expects.
- **Acceptance criteria:**
  - Exactly **one** implementation serves each of `/api/oauth2/userinfo`, `/introspect`, `/revoke`;
    the other is deleted (not merely unmounted).
  - A deliberate, documented decision is recorded on **which** implementation is correct — in
    particular that **revocation** semantics are the intended ones.
  - A test asserts that revoking a token via `/api/oauth2/revoke` actually invalidates it.
  - Mount order in `src/index.js` no longer relies on a bare-mounted router with absolute paths.
- **Notes:** **Inherited, not a consolidation regression** — the original has the same bare mount at
  `/Volumes/Storage/exprsn-auth/src/index.js:132`. Cross-link BUG-012 (oauth2 `client_credentials`
  500s), same router.

  **FIXED 2026-07-13.** **Correction to this ticket's original framing:** it warned that "the wrong
  implementation may be winning." On reading both, that was **not** the case — the *better* one was
  winning in all three, so there was **no live behavioural defect**:
  - `revoke` — the two implementations were **functionally identical** and both already hardened
    (client auth + scoped to the client's own tokens + RFC 7009 always-200). Revocation was never broken.
  - `introspect` — the serving (oidc) one was *superior*: it honoured `token_type_hint=refresh_token`.
  - `userinfo` — the serving (oidc) one routed through `oidcService`, the OIDC-correct path.

  So the real defect was **dead code + mount-order fragility**: reorder those two `app.use` lines and
  behaviour silently degrades to the inferior handlers, with nothing to catch it.

  **Fix:** oidc's three handlers moved into `oauth2.js` (replacing its inferior versions); `oidc.js`
  now declares **only** its two `/.well-known/*` discovery routes, which is the one legitimate reason
  for a bare mount. `/api/oauth2/*` is now owned by exactly one router, mounted at a real prefix, with
  no absolute paths and no order dependency. Endpoint URLs are unchanged. A comment in both files and
  in `src/index.js` records the constraint so it cannot silently regress.

  **Reading the serving code turned up the genuinely dangerous thing, filed as BUG-030:** introspection
  required **no client authentication at all** — a token oracle. Fixed in the same change. This is why
  the ticket said to read both before deleting either.

---
- **QA closeout (2026-07-27):** `oidc.js` reduced to the two `/.well-known` routes;
  `/api/oauth2/*` owned by a single router at a real prefix (commit `f09f82b`);
  revoke-invalidates regression at `oauth2.test.js:572`.

### BUG-031 — `resolveUserRoles` does not filter by scope: org-scoped super-admin gets the platform admin token marker
- **Type:** bug · **Status:** backlog · **Priority:** P2 · **Size:** S
- **Owner-role:** sr-developer · **Relates:** the admin-revocation fix (merged) — SEPARATE issue
- **Found:** adversarial hunt during the admin-gate revocation fix (2026-07-14).
- **Description:** `services/auth/src/services/tokenService.js` `resolveUserRoles` now filters revoked/expired
  bindings (fixed), but it does NOT filter by SCOPE. An ACTIVE **org-scoped** `super-admin` binding still adds the
  platform-wide `admin` marker to the minted CA token, whereas `requireAdmin.hasAdminRole` correctly requires
  `scope='global'`. So an org-scoped super-admin could present a token that moderator/nexus/timeline read as
  platform-admin. Pre-exists on main; not the revocation hole. Fix: scope the token `admin`-marker derivation to
  global bindings (or emit org-scoped roles distinctly so downstream gates don't treat them as platform-admin).
- **Acceptance criteria:** an active org-scoped super-admin binding does NOT yield the platform `admin` marker in the
  token; a global admin binding still does; the three module gates that trust `data.roles` are unaffected for global admins.

### BUG-032 — Live recording persistence is broken: model/service disagree and the insert is swallowed
- **Type:** bug · **Status:** done · **Priority:** P2 · **Size:** M
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** blocks FEAT-074 + TASK-041 · surfaced by ADR-0005 §8.3 / finding 7
- **Description:** Per **ADR-0005 §8.3 / finding 7** (`docs/adr/0005-cortex-backend-failover-and-video-moderation.md`).
  The Live recording state machine cannot persist a recording, and every failure is swallowed:
  `services/live/src/models/Recording.js` declares **snake_case** attributes (`stream_id`, `room_id`,
  `user_id` **NOT NULL**, `started_at`, `completed_at`, `duration_seconds`, `file_size_bytes`) and a status
  enum of exactly `('processing','ready','failed','deleted')`. But
  `services/live/src/services/recording.js` `createRecording()` writes **camelCase** (`streamId`, `roomId`,
  `startedAt`, `fileSize`, `duration`) — attributes the model does not define — **omits the NOT-NULL
  `user_id`**, and sets `status: 'recording'` (outside the enum), so the insert cannot succeed;
  `_processRecording()` then writes `status: 'completed'` plus `thumbnails`, `variants`, `processedAt`,
  `error` — four columns that do not exist. `services/live/src/routes/roomCollab.js` uses the right
  snake_case keys but still `status: 'recording'` and still no `user_id`, wrapped in `.catch(() => null)` —
  so the insert fails **silently**, the RabbitMQ recording job is published with `recordingId: null`, and
  `/recording/stop` writes `status: 'completed'` under another `.catch(() => {})`. Net: there is no
  trustworthy "recording finalized, bytes at path X" event anywhere in the platform.
- **Acceptance criteria:**
  - `recording.js` and `roomCollab.js` write **only** attribute names the `Recording` model defines
    (snake_case), and every create path supplies the NOT-NULL `user_id`.
  - Every `status` value written is inside the model enum (`processing|ready|failed|deleted`); `'recording'`
    and `'completed'` no longer appear as status writes.
  - Writes to non-existent columns (`thumbnails`, `variants`, `processedAt`, `error`) are removed or backed
    by real model attributes (coordinate the model shape with dba if any are genuinely wanted).
  - The recording insert **no longer swallows failures** with `.catch(() => null)` / `.catch(() => {})`;
    a failed insert surfaces (logged with a correlation id, and the code path does not proceed to publish a
    job with `recordingId: null`).
  - A test creates a recording through `createRecording()` and asserts the row persists with a valid status,
    a non-null `user_id`, and the expected snake_case fields.
- **Notes:** Data-adjacent (touches the `Recording` model contract) — loop **dba** if the model shape needs
  to change (any genuinely-wanted `thumbnails`/`variants` columns would be new DDL; `db:migrate` creates but
  does not ALTER — STATUS #1). **systems-architect** flagged this as the blocking finding for FEAT-074 (ADR
  §8.3). Cross-link: **ADR-0005** (`docs/adr/0005-cortex-backend-failover-and-video-moderation.md`) §8.3,
  finding 7, Required-change 11. **Blocks BUG-032→TASK-041→FEAT-074** in that order. Route to sr-developer (M).
### BUG-035 — atproto firehose ingest fills Redis unboundedly and OOM-crashes the whole platform (renumbered from BUG-032: collided with live-recording BUG-032 on main)
- **Type:** bug · **Status:** backlog · **Priority:** P2 · **Size:** M
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** —
- **Description:** `worker:atproto` enqueues every ingested Bluesky firehose post as a
  `bull:moderation:atp*` job (producer: `services/atproto/src/ingest/queue.js` +
  `enqueue.js`/`moderationBridge.js`, Redis db 3). Nothing bounds the queue: jobs are not
  removed on completion/failure, ingest is far faster than moderation drain, and the shared
  Redis container has `maxmemory 0` (unlimited). Observed 2026-07-16 on a dev boot: db3
  reached **1.2M keys / ~4.4GB**, Redis went `BUSY`/unresponsive and fell over — which
  crashed the **gateway** (unhandledRejection on setex) and the timeline/prefetch/
  filevault-moderation workers. Because Redis is shared by every module, the atproto
  worker running unattended is a whole-platform outage. Recovery required stopping the
  worker and `FLUSHDB` on db3 (2GB → 3MB).
- **Acceptance criteria:**
  - atproto ingest jobs carry `removeOnComplete`/`removeOnFail` (bounded counts) so
    processed jobs don't accumulate.
  - Ingest is backpressured or capped: when the moderation queue depth (or Redis memory)
    exceeds a configurable threshold, the firehose consumer pauses/drops instead of
    enqueueing — no unbounded growth while the drain is slower than ingest.
  - The Redis container gets a `maxmemory` + eviction/alarm posture agreed with the dba
    (shared instance — eviction policy must not silently eat other modules' Bull state;
    a cap + refuse-writes on the atproto path may be safer than global eviction).
  - Soak: `worker:atproto` running ≥30 min against the live firehose keeps Redis memory
    at a plateau, and gateway `/health` stays `ok` throughout.
- **Notes:** Found while booting the platform 2026-07-16 (Redis peak 4.73G,
  `used_memory_peak_human`). Slowlog showed the `atp:*` jobs carry `attempts: 3` +
  exponential backoff, so failures also linger in the retry/delayed sets. dba sign-off on
  the Redis memory posture; consider whether the firehose backlog belongs in RabbitMQ
  (durable, disk-backed — the rabbit helper already exists) instead of Redis/Bull at all.

### BUG-033 — cortex worker fails tasks on LLM model cold-load (undici headersTimeout beats the 600s app timeout)
- **Type:** bug · **Status:** backlog · **Priority:** P2 · **Size:** S
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** — (relates: FEAT-021/FEAT-029 swap-first LLM serving)
- **Description:** The llama-swap server loads models on demand; a 30B brain
  (`qwen3-30b-a3b`) cold-load takes >5 min. `services/cortex/src/client.js` wraps LLM
  calls in a 600s app-level timeout (`withTimeout`), but the underlying Node `fetch`
  (undici) has a default `headersTimeout` of 300s, which fires first while the router
  holds the request during model load — the task fails
  `Error: LLM router unreachable (UND_ERR_HEADERS_TIMEOUT)`. Observed 2026-07-16:
  first cortex task after boot ran 16:54→16:59 and failed; an identical task ran in
  ~1s once the model was warm. Swap-first serving (MODELS_MAX=2) makes cold-loads a
  normal, recurring condition — every brain swap re-exposes this.
- **Acceptance criteria:**
  - A cortex task submitted while the brain model is unloaded succeeds (undici
    dispatcher/Agent configured with `headersTimeout` ≥ the app timeout, or the call
    retries on UND_ERR_HEADERS_TIMEOUT, or the worker warms the model first, e.g. a
    cheap `/v1/models`-status check + load-wait before the real call).
  - The 600s `withTimeout` bound in `client.js` remains the effective ceiling.
  - Failure mode when the router is genuinely down is unchanged (fails fast, task
    marked failed with a clear error).
- **Notes:** Repro: unload models (restart llama-swap), enqueue a task via
  `POST /cortex/api/v1/tasks`. Worker: `services/cortex/src/worker.js`; transport:
  `services/cortex/src/client.js`.

### BUG-034 — CA `/api/tokens/validate` rate limiter buckets all in-process callers as 127.0.0.1 — modules starve each other
- **Type:** bug · **Status:** done (merged to `main` `fe58d2c`; service-HMAC exemption) · **Priority:** P2 · **Size:** S
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** —
- **Description:** Every module validates bearer tokens by calling the CA over the
  gateway loopback (`*_SERVICE_URL` → `https://localhost:8443/ca`), so ALL in-process
  validation traffic shares one per-IP rate-limit bucket (`ip=127.0.0.1`,
  `path=/tokens/validate`, 15-min window). Observed 2026-07-16: a client polling one
  cortex task status every ~5s exhausted the bucket; after that, **every** authed
  route on **every** module returned 429→`VALIDATION_ERROR` for the remainder of the
  window — including fresh logins. One chatty client (or one busy module) locks the
  whole platform's auth path out for up to 15 minutes. Limiter warn logs come from
  the gateway (`Rate limit exceeded {"ip":"127.0.0.1","path":"/tokens/validate"}`);
  CA-side limiter: `services/ca/middleware/rateLimit.js`; shared:
  `shared/middleware/rateLimiter.js`.
- **Acceptance criteria:**
  - In-process service-to-service validate calls (loopback + service HMAC identity)
    are exempt from the per-IP bucket or keyed per calling service — one caller
    exhausting its budget does not 429 other modules' token validation.
  - End-user abuse protection is preserved: external per-IP (or per-token) limiting
    on validate still exists, and the real client IP is used behind the edge
    (X-Forwarded-For from nginx, trust-proxy configured) rather than the loopback.
  - Regression check: sustained polling of one authed endpoint by one user does not
    cause 429s on logins or other modules' authed routes.
- **Notes:** Consider caching validate verdicts briefly (the moderator user-routes
  already validate per request) to cut loopback QPS platform-wide. Security-sensitive
  (auth surface) — sr-developer + architect eyes per the auth-surface escalation rule.
  **Fixed 2026-07-17 (Rick-authorized):** `shared/middleware/rateLimiter.js` now
  exempts any request proving a service identity — `X-Service-ID` + the
  constant-time-verified HMAC `X-Service-Token` (`verifyServiceToken`, fails
  closed). In-process module→CA validate calls carry these headers, so they no
  longer share the per-IP 127.0.0.1 bucket; forged/absent headers still count,
  so external per-IP abuse protection is unchanged. Verified: valid HMAC skips,
  forged/replayed-under-other-id do not; admin e2e (23 sections) no longer 429s.
  Still wants architect sign-off at merge (auth surface).

### BUG-038 — nginx SPA edge (`:443`) ships the app with zero security headers
- **Type:** bug · **Status:** done — QA-VERIFIED 2026-07-27 (branch `s2609-sr` HEAD `a3ab48c`, merge-ready; not yet on `main`) · **Priority:** P1 · **Size:** M
- **Owner-role:** sr-developer (rec.) · **Blocked-by:** —
- **Sprint:** Committed to Sprint 2026-09 (2026-07-27).
- **Legacy:** — (2026-07-20 W3C security-header review; relates R4 / TASK-004 TLS-at-edge)
- **Description:** The Node gateway (`:8443`) applies a strong hand-tuned helmet CSP
  (`src/gateway.js:98-106`) — but it only ever emits **JSON**. The browser's security
  context for the actual application is established by the **document nginx serves on
  `:443`** (`web/dist/index.html`), and `docker/nginx/nginx.conf` sets **no** security
  response headers: no CSP, no HSTS, no Permissions-Policy, no `X-Content-Type-Options:
  nosniff`, no `X-Frame-Options`/`frame-ancestors`, no Referrer-Policy on the UI origin.
  So the gateway's discipline protects nothing the user renders. A strict SPA CSP is
  currently blocked by two things in `web/index.html`: external Google Fonts
  (`:9-14`) and an inline theme-bootstrap `<script>` (`:17-29`). CORS credentials logic
  and mixed-content posture were both reviewed and **conform** — this is purely the edge.
- **Acceptance criteria:**
  - The nginx server block serving the SPA sets a CSP (target `default-src 'self'`
    after fonts are self-hosted), `Strict-Transport-Security` (max-age ≥ 31536000),
    `Permissions-Policy` scoping camera/microphone/display-capture to what `/live`
    needs, `Referrer-Policy`, `X-Content-Type-Options: nosniff`, and frame protection.
  - Google Fonts self-hosted in `web/` (removes the external dep, referrer leak, and
    the `style-src`/`font-src` CSP exceptions); the inline theme script is nonce'd or
    moved to a file so the CSP needs no `unsafe-inline` for scripts.
  - SPA loads with no CSP violations in the console; headers verified with `curl -kI`.
- **Notes:** Config-only, highest-value security gap from the review. `report-to`/CSP
  reporting is a natural follow-on (ties to the Winston-only observability gap). Route
  to sr-developer; no data changes.
- **Resolution (done · 2026-07-27 · commit `f965236`, branch `s2609-sr`):** Server-level
  security-header set in `docker/nginx/nginx.conf` (CSP `default-src 'self'` /
  `script-src 'self'`; HSTS 31536000 incl. subdomains; Permissions-Policy
  camera/mic/display-capture=(self); Referrer-Policy; nosniff; XFO DENY +
  `frame-ancestors 'none'`), all `always`; `/docs/` redeclares the full set with a
  scoped inline-script relaxation. Enablers: fonts self-hosted via `@fontsource/inter`
  + `@fontsource/jetbrains-mono`; inline theme script externalized to
  `web/public/theme-init.js` (no-flash preserved). `nginx -t` clean; built dist has no
  external refs/inline scripts. systems-architect sign-off: **APPROVE-WITH-NOTES**
  (2026-07-27) — required follow-up **TASK-053** (external image URLs now blocked by
  `img-src 'self'`); note-level: HSTS `includeSubDomains` revisit at production-TLS
  time, self-hosted STUN (fold into TASK-050), `frame-ancestors` revisit if form
  embedding ever ships. Live `curl -kI` header check deferred to deploy (nginx
  recreate + `web/dist` republish pending).

### BUG-039 — Account menu is hover-only CSS: Sign out / Settings / Admin are keyboard-unreachable
- **Type:** bug · **Status:** done — QA-VERIFIED 2026-07-27 (branch `s2609-sr` HEAD `a3ab48c`, merge-ready; not yet on `main`) · **Priority:** P1 · **Size:** S
- **Owner-role:** jr-developer (rec., sr review) · **Blocked-by:** —
- **Sprint:** Committed to Sprint 2026-09 (2026-07-27).
- **Legacy:** — (2026-07-20 WCAG 2.2 / WAI-ARIA review)
- **Description:** `web/src/app/RootLayout.tsx:107-136` renders a
  `<button class="user-menu-btn">` with **no `onClick`/handler**, followed by a
  `.user-menu-dropdown` revealed **solely** by `.user-menu:hover` in
  `styles/exprsn-unified.css:307-326` (`visibility:hidden` when closed also removes the
  links from the tab order). There is **no keyboard path** to Settings, Admin console,
  or **Sign out** from the primary shell, and the trigger lacks
  `aria-haspopup`/`aria-expanded`/`aria-controls`. Fails WCAG 2.1.1 (A), 1.4.13 (AA),
  4.1.2 (A). Most impactful single a11y defect — logout is keyboard/SR-unreachable.
- **Acceptance criteria:**
  - The menu opens/closes on click and Enter/Space and is fully keyboard-operable
    (Escape closes, focus returns to the trigger); dropdown links are in the tab order
    only when open.
  - Trigger exposes `aria-haspopup="menu"`, `aria-expanded`, `aria-controls`; hover
    reveal (if kept) is dismissible/persistent per 1.4.13.
  - Sign out / Settings / Admin reachable and operable by keyboard and screen reader.
- **Notes:** Prefer an MUI `Menu` (inherits the APG menu-button pattern) over the
  hand-rolled markup. jr-developer with sr review.
- **Resolution (done · 2026-07-27 · commit `8632200`, branch `s2609-sr`):** Hover
  markup replaced with an MUI `<Menu>` (APG menu-button); trigger exposes
  `aria-haspopup`/`aria-expanded`/`aria-controls`; Escape/outside-click close with
  focus return; items out of the tab order when closed. sr-reviewed. Sibling defect in
  `AdminLayout` filed as **BUG-047**.

### BUG-040 — Alt text is discarded end-to-end; existing `alt_text` plumbing + AI descriptions never reach consumers
- **Type:** bug · **Status:** done — QA-VERIFIED 2026-07-27 (branch `s2609-sr` HEAD `a3ab48c`, merge-ready; not yet on `main`) · **Priority:** P1 · **Size:** M
- **Owner-role:** sr-developer (rec.) · **Blocked-by:** —
- **Sprint:** Committed to Sprint 2026-09 (2026-07-27).
- **Legacy:** — (2026-07-20 ATAG 2.0 / WCAG 1.1.1 review)
- **Description:** The backend already supports image alt text but the UI neither
  authors nor renders it. `services/timeline/migrations/20241229000000-create-attachments.js:132`
  defines an `alt_text` column and `services/timeline/src/routes/attachments.js:240-255`
  accepts/stores `altText` via `PATCH /attachments/:id` — but the composer
  (`web/src/features/timeline/Composer.tsx:42-75`) sends only `mediaIds`, the
  `PostMedia` type has **no** `altText` field (`web/src/api/timeline.ts:25-35`), and the
  render path emits `alt={item.title ?? ''}` (`PostMedia.tsx:141/226/259`) → empty alt
  for consumers' screen readers. FileVault even auto-generates descriptions via
  `cortex.describeImage` (`services/filevault/src/services/imageModerationService.js:214-248`,
  stored `FileModeration.js:78-88`) that are **never surfaced to the author or
  rendered**. Spark attachments have the same gap (`MessageAttachments.tsx:78`). Fails
  WCAG 1.1.1 (A) and ATAG B.2.3 / B.1.2.4; the AI auto-alt without author review is a
  B.2.3.2 process concern.
- **Acceptance criteria:**
  - The timeline composer (and Spark) exposes a per-image alt/description input; the
    value is persisted through `createPost`/attachments (route verified against
    `API_SURFACE.md`).
  - `PostMedia` type carries `altText`; consumer render uses
    `alt={item.altText ?? item.title ?? ''}`.
  - The `cortex.describeImage` output is surfaced as a **pre-filled, editable**
    suggestion the author can accept/change (satisfies B.2.3.2), not applied silently.
- **Notes:** Near-free win — backend exists; mostly frontend wiring. sr-developer.
- **Resolution (done · 2026-07-27 · commit `a0b19ac`, branch `s2609-sr`):** Composer
  uploads eagerly with per-image alt fields; `POST /timeline/api/posts` accepts
  validated `media:[{id,altText}]` persisted into the `Post.media` JSONB the feed
  already serves (no schema change; legacy `mediaIds` kept); `PostMedia` / spark
  `ChatAttachment` types + renderers use `altText ?? title/name ?? ''`; cortex
  description surfaced as an editable pre-fill via new
  `GET /filevault/api/files/:fileId/description` (null-safe when cortex is off);
  `API_SURFACE.md` updated for both routes. Timeline Jest suite green at build time
  (99/99). Runtime post-with-alt through the live gateway deferred to deploy check.

### BUG-041 — Lowcode form builder can emit fields with an empty label (no accessible name)
- **Type:** bug · **Status:** done — QA-VERIFIED 2026-07-27 (branch `s2609-sr` HEAD `a3ab48c`, merge-ready; not yet on `main`) · **Priority:** P2 · **Size:** S
- **Owner-role:** jr-developer (rec.) · **Blocked-by:** —
- **Sprint:** Committed to Sprint 2026-09 (2026-07-27).
- **Legacy:** — (2026-07-20 ATAG 2.0 B.1.1 / WCAG 4.1.2 review)
- **Description:** `web/src/features/lowcode/EntityEditor.tsx:70` seeds
  `label: ''` and the save validator `build()` (`:73-93`) validates only the field
  **key** — **label is never required**. The generated public form passes the empty
  label straight through (`web/src/features/lowcode/PublicFormPage.tsx:53-61`); MUI only
  wires the `<label for>`/aria association when the label string is non-empty, so the
  emitted input has **no accessible name** (WCAG 1.3.1/3.3.2/4.1.2 baked into authored
  output). `FormEditorDialog` exposes placeholder/help but no label editing — and
  placeholder-as-label is itself an anti-pattern.
- **Acceptance criteria:**
  - `EntityEditor.build()` requires a non-empty label per field (or falls back
    key→label) so a saved entity cannot ship a nameless input.
  - Generated forms always emit an input with a programmatic accessible name.
- **Notes:** ATAG "accessible by default" (B.1.1). jr-developer.
- **Resolution (done · 2026-07-27 · commit `5e0e593`, branch `s2609-sr`):**
  `EntityEditor.build()` falls back empty labels to `humanizeKey(key)` with an info
  notice; render-time fallback added in `PublicFormPage`. Pre-save advisory added
  under TASK-048.

### BUG-042 — Icon-only buttons lack accessible names (8 of 216 labeled; Tooltip ≠ name)
- **Type:** bug · **Status:** done — QA-VERIFIED 2026-07-27 (branch `s2609-sr` HEAD `a3ab48c`, merge-ready; not yet on `main`) · **Priority:** P2 · **Size:** M
- **Owner-role:** sr-developer sets pattern, jr-developer sweeps (rec.) · **Blocked-by:** —
- **Sprint:** Committed to Sprint 2026-09 (2026-07-27).
- **Legacy:** — (2026-07-20 WCAG 4.1.2 / 2.4.4 review)
- **Description:** Only **8 of 216** `<IconButton>` instances carry an inline
  `aria-label`; the rest are icon-only and mostly rely on a wrapping MUI `<Tooltip>`,
  which supplies `aria-describedby` (a *description*, exposed only on focus/hover) —
  **not** the accessible *name*. So most icon buttons announce as bare "button".
  Examples: `features/admin/ui.tsx:381/393` (Tooltip only); the lightbox Close/Prev/Next
  in `features/timeline/PostMedia.tsx:293-308` have **neither** label nor Tooltip.
  Good counter-pattern already in-repo: `app/ThemeToggle.tsx:13` sets both. Fails
  WCAG 4.1.2 (A) and 2.4.4 (A).
- **Acceptance criteria:**
  - Every icon-only `IconButton` has an `aria-label` naming its action (Tooltip may
    stay as supplementary description).
  - The `ThemeToggle` label+Tooltip pattern is adopted as the standard; lightbox
    controls are named.
- **Notes:** Systemic — consider a lint rule / shared wrapper. sr-developer to set the
  pattern, jr to sweep.
- **Resolution (done · 2026-07-27 · commits `7649f08` + `f2628ad`, branch `s2609-sr`):**
  Standard set: `web/src/components/LabeledIconButton.tsx` (required `label` prop →
  aria-label + Tooltip) + "Accessibility conventions" section in `web/README.md`;
  lightbox Close/Prev/Next named. Repo-wide sweep: **218/218** IconButton instances
  now carry accessible names (state-dependent labels on toggles). QA re-scan: 0
  missing.

### BUG-043 — Clickable `<Box>`/`<div>` media tiles are not keyboard-operable
- **Type:** bug · **Status:** done — QA-VERIFIED 2026-07-27 (branch `s2609-sr` HEAD `a3ab48c`, merge-ready; not yet on `main`) · **Priority:** P2 · **Size:** S
- **Owner-role:** jr-developer (rec.) · **Blocked-by:** —
- **Sprint:** Committed to Sprint 2026-09 (2026-07-27).
- **Legacy:** — (2026-07-20 WCAG 2.1.1 / 4.1.2 review)
- **Description:** Timeline media uses non-interactive elements with click handlers and
  no role/tabindex/key handling: `PostMedia.tsx:125` (`Thumb`), `:179` (`LiveCard`),
  `:396` (the "+N" overflow tile) — none focusable, none with `role="button"` or
  `onKeyDown`. Feed images/videos cannot be opened without a mouse. Good counter-pattern
  in-repo: `components/EmojiPicker.tsx:28,51` uses `component="button"` (real, keyboard-
  operable). Fails WCAG 2.1.1 (A), 4.1.2 (A).
- **Acceptance criteria:**
  - Clickable media tiles are real buttons (or have `role="button"` + `tabIndex={0}` +
    Enter/Space handlers) and are keyboard-openable.
  - Adopt the `EmojiPicker` `component="button"` pattern rather than `<Box onClick>`.
- **Notes:** Likely repeats on unread pages (lowcode canvas, moderation builders) —
  worth a repo-wide sweep of `<Box onClick`. jr-developer.
- **Resolution (done · 2026-07-27 · commits `661273f` + `f98ca5d`, branch `s2609-sr`):**
  Thumb/LiveCard/"+N" converted to real buttons (`component="button"` + style resets)
  with media-kind-aware labels; sweep also fixed JsonView, GalleriesTab,
  MessageAttachments, PinnedBar, RecordingsList, SignupWizardPage (inner radio made
  presentational — no nested interactive) and ImageAnnotator. Skipped as design
  questions: reactflow `CanvasNode`; two rows whose adjacent buttons already provide
  the same action.

### BUG-044 — atproto labeler `did:web` fallback serves a document with an invalid placeholder key
- **Type:** bug · **Status:** backlog · **Priority:** P2 · **Size:** S
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** — (2026-07-20 W3C DID-Core / CID review)
- **Description:** `services/atproto/src/labeler/identityService.js:254-275`
  (`getDidDocument`) — when no `LabelerIdentity` row exists yet but
  `config.labeler.did` is set — serves a full `did:web` document publicly at
  `GET /.well-known/did.json` (`services/atproto/src/wellknown.js:20-28`) whose
  verification method carries
  `publicKeyMultibase: 'z0000000000000000000000000000000000000000000000000'`
  (`identityService.js:270`) — **not a valid secp256k1 Multikey**. Any relying party
  resolving the labeler before provisioning receives a well-formed-looking document
  whose key can verify nothing (or could be mistaken for a real key). Violates DID-Core
  verification-material validity.
- **Acceptance criteria:**
  - Before provisioning completes, the endpoint returns **404** (as the no-`config`
    branch already does at `:274`) instead of a placeholder-key document.
  - No `z0000…` key is ever served.
- **Notes:** Small correctness/security fix. sr-developer (atproto).

### BUG-045 — Spark E2EE server legacy path retains a deprecated static-salt PBKDF2 fallback
- **Type:** bug · **Status:** backlog · **Priority:** P2 · **Size:** S
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** — (2026-07-20 Web Cryptography review; server-side Node-crypto path)
- **Description:** The client WebCrypto E2EE path is clean, but the server-side legacy
  keypair path in `services/spark/src/services/encryptionService.js:619-623` has a
  `LEGACY_PBKDF2_SALT` **static-salt** fallback for old rows with no per-key salt (used
  when a client sends `passwordHash` instead of a client-generated keypair). A static
  PBKDF2 salt enables precomputation/rainbow-table attacks across all un-migrated keys
  if the DB leaks — the one genuinely weak primitive in the crypto surface. Already
  flagged deprecated in-code with a rotate warning.
- **Acceptance criteria:**
  - Confirm (query) no production rows still use the static-salt fallback; migrate any
    that do to a per-key random salt.
  - Remove the `LEGACY_PBKDF2_SALT` fallback once no rows depend on it.
- **Notes:** dba to check row state before removal; sr-developer for the change.

### BUG-046 — `/live` WebRTC rooms lack perfect-negotiation/glare handling and pre-SDP ICE buffering
- **Type:** bug · **Status:** backlog · **Priority:** P2 · **Size:** M
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** — (2026-07-20 W3C WebRTC 1.0 review)
- **Description:** `web/src/features/rooms/useWebRtcRoom.ts` avoids glare only by
  convention (newcomer offers, existing peers answer) with **no** perfect-negotiation
  pattern: no `onnegotiationneeded`, no `makingOffer`/`ignoreOffer`/polite-vs-impolite,
  no rollback. `onOffer` calls `setRemoteDescription` unconditionally regardless of
  `signalingState` (`:273-279`), so two near-simultaneous joiners can dual-offer (glare)
  and fail to connect — and the `onconnectionstatechange` handler is a **no-op**
  (`:153-157`), so a `failed` PC is never recovered. Separately, there is **no
  remote-ICE-candidate buffering** before `setRemoteDescription`: a candidate arriving
  before the offer creates the PC is dropped (`:286-295`) — a real trickle-ICE ordering
  hazard. Both are W3C-recommended robustness patterns whose absence causes rare,
  unrecovered connect failures.
- **Acceptance criteria:**
  - Implement the perfect-negotiation pattern (polite/impolite, `makingOffer`,
    rollback on glare) so simultaneous joiners connect reliably.
  - Buffer remote ICE candidates that arrive before the remote description and flush
    them after `setRemoteDescription`.
  - `onconnectionstatechange` recreates/retries a `failed` peer connection.
  - Low-sev cleanup folded in: drop the legacy `new RTCSessionDescription`/
    `new RTCIceCandidate` wrappers (`:275/283/290`); differentiate `getUserMedia`
    `DOMException`s (NotAllowed/NotFound/NotReadable/Overconstrained) in the error
    message (`:223-230`).
- **Notes:** Reliability, not strict API non-conformance. Separate TURN-server infra is
  TASK-050. sr-developer.

### BUG-047 — AdminLayout admin-shell a11y parity: hover-only account menu + missing skip link/`aria-current`
- **Type:** bug · **Status:** done — QA-VERIFIED, merged + deployed 2026-07-27 (merge `619ed02`) · **Priority:** P2 · **Size:** S
- **Owner-role:** sr-developer · **Blocked-by:** —
- **Sprint:** Committed to Sprint 2026-10 (2026-07-27).
- **Resolution notes (2026-07-27, branch s2610):** AdminLayout account menu is now the
  same MUI `<Menu>` pattern as RootLayout (ids `admin-user-menu-btn` /
  `admin-user-menu-dropdown`, `aria-haspopup`/`aria-expanded`/`aria-controls`, Escape
  close + focus return come from MUI Menu). Dead hover CSS deleted
  (`.user-menu-dropdown`, `.user-menu:hover` rule, `.dropdown-header/-item/-divider` —
  AdminLayout was the sole consumer). Admin shell got the skip link +
  `id="main-content"`/`tabIndex=-1` target, and sidebar links converted to `NavLink`
  (auto `aria-current="page"`; `end` on `/admin` preserves prior active logic).
  QA path: /admin, Tab from address bar → skip link; open account menu via keyboard
  (Enter), Escape returns focus; active sidebar item exposes `aria-current="page"`.
- **Legacy:** — (Sprint 2026-09 escalation; same defect classes as BUG-039 / TASK-046, which scoped `RootLayout` only)
- **Description:** `web/src/features/admin/AdminLayout.tsx` (~189-214) renders the admin
  console's own account menu with the identical hover-only CSS pattern BUG-039 removed
  from `RootLayout` — the `.user-menu-dropdown` block is retained in
  `web/src/styles/exprsn-unified.css` solely for this consumer (see the comment at
  ~:326), so Sign out etc. are keyboard/screen-reader-unreachable inside the admin
  shell. The admin shell's separate sidebar also lacks the TASK-046 treatment: no skip
  link, no `aria-current` on the active nav item.
- **Acceptance criteria:**
  - AdminLayout's account menu uses the same MUI `Menu` pattern as landed BUG-039
    (`aria-haspopup`/`aria-expanded`/`aria-controls`, Escape close + focus return); the
    then-dead `.user-menu-dropdown` hover CSS is removed.
  - The admin shell gets a skip link and `aria-current="page"` on active nav.
- **Notes:** Direct port of the landed BUG-039 / TASK-046 patterns. jr-developer.

### BUG-048 — Dark-mode primary too light for white text: contained buttons and filled primary chips fail WCAG 1.4.3
- **Type:** bug · **Status:** done — QA-VERIFIED, merged + deployed 2026-07-27 (merge `619ed02`) · **Priority:** P2 · **Size:** S
- **Owner-role:** sr-developer · **Blocked-by:** —
- **Sprint:** Committed to Sprint 2026-10 (2026-07-27).
- **Resolution notes (2026-07-27, branch s2610):** No blue can simultaneously pass
  4.5:1 under white text AND as text on the dark surfaces, so dark mode now uses
  near-black text on primary fills plus a nudged primary token: dark
  `--exprsn-primary`/`tokens.dark.primary` #3b82f6 → **#4a8cf7**, new mode-aware
  `primaryContrast`/`--exprsn-text-on-primary` (light #ffffff, dark #0a0a0a) consumed
  by MUI `palette.primary.contrastText` and the CSS white-on-primary spots
  (.skip-link, .nav-badge, .btn-outline-primary:hover, .filter-tag-close:hover,
  .page-link.active). Dark `palette.primary.dark` (contained hover bg) now lightens
  (→ primaryHover #60a5fa) since near-black on #0047b3 would be ~2.4:1.
  Ratios (dark): contained label 3.68 → 6.02; hover-state label 7.79; primary text on
  surface-raised 4.48 → 5.01; on bg-primary/secondary/tertiary 6.02/5.45/4.60; focus
  ring ≥5.01 (non-text 3:1). Light unchanged: white-on-primary 4.83, primary-on-white
  4.83. Verified by rerunning the TASK-049 WCAG script with the new values.
- **Legacy:** 2026-07-20 accessibility review; TASK-049 measurement (sprint 2026-09, branch s2609-sr)
- **Description:** In dark mode `palette.primary.main` is `#3b82f6` with `contrastText: WHITE` (`web/src/app/theme.ts:18`, token `web/src/app/tokens.ts:65`). White-on-#3b82f6 measures **3.68:1** (needs 4.5:1; button labels are 14–15px/600 — not "large text"). Affects all 188 `variant="contained"` primary buttons, filled primary Chips, and any white-on-primary surface in dark mode. Related marginal fail: primary-colored text/links on `surface-raised` (#3b82f6 on #1f1f1f) = **4.48:1**.
- **Acceptance criteria:**
  - [ ] Dark-mode contained-primary button label contrast ≥ 4.5:1 (e.g. darker dark-primary token, or dark `contrastText` switched to near-black, or a dedicated `primary.contrastText` per mode) — verified by computed ratio.
  - [ ] Dark-mode primary text on `surface-raised` ≥ 4.5:1 or the pairing is avoided.
  - [ ] Light mode unchanged (currently 4.83:1, passing).
  - [ ] `npm run web:test` green; no visual-token regression outside dark primary pairings.
- **Notes:** Ratios from TASK-049 script (WCAG formula, MUI 5.16.7). This is the highest-traffic failure (every primary action in dark mode).

### BUG-049 — Semantic Chip colors fail text contrast: filled success/error/info and outlined success/warning/error/info labels
- **Type:** bug · **Status:** done — QA-VERIFIED, merged + deployed 2026-07-27 (merge `619ed02`) · **Priority:** P2 · **Size:** M
- **Owner-role:** sr-developer · **Blocked-by:** —
- **Sprint:** Committed to Sprint 2026-10 (2026-07-27).
- **Resolution notes (2026-07-27, branch s2610):** Theme-level `MuiChip` variants in
  `web/src/app/theme.ts` (no call-site edits). Filled success/error/info map onto the
  design system's on-tint pairs, now mirrored into `tokens.ts` as `SEMANTIC_TINTS`:
  2.54/3.76/3.68 → **6.78/6.80/7.15** (theme-invariant, both modes). Filled warning
  (9.22) and secondary (5.70) untouched. Outlined light: labels → `-text` tokens
  (2.54/2.15/3.76/3.68 → 7.68/7.09/8.31/8.72), borders → `-hover` tokens
  (3.19–5.17, non-text ≥3). Outlined dark: success/warning keep mains (6.50/7.67),
  error/info/secondary lighten via `DARK_CHIP_EMPHASIS` (4.38/4.48/2.89 →
  5.96/6.48/6.06); outlined primary rides the BUG-048 token (4.48 → 5.01 dark, 4.83
  light). Chip icon/delete-icon inherit the label color; clickable filled chips keep
  the compliant tint on hover. All ratios computed with the TASK-049 WCAG script.
  QA spot-check sites: StreamsPage.tsx:203, NotificationsPage.tsx:80,
  EventsTab.tsx:272, ScopesSection.tsx:97, AtprotoSection.tsx:411, cortex/shared.tsx:62
  in both themes. vitest 16/16 green; build clean.
- **Legacy:** 2026-07-20 accessibility review ("outlined chips" suspect — confirmed); TASK-049 measurement
- **Description:** Colored MUI Chips (33 call sites) fail WCAG 1.4.3 at ~13px labels:
  - Filled, both themes: success #fff/#10b981 = **2.54**, error #fff/#ef4444 = **3.76**, info #fff/#3b82f6 = **3.68** (theme.ts:20-23 sets `contrastText: WHITE`). E.g. `web/src/features/streams/StreamsPage.tsx:203` ("● LIVE"), `web/src/features/moderation/NotificationsPage.tsx:80` (unread count), `web/src/features/groups/tabs/EventsTab.tsx:272`.
  - Outlined, light mode: warning label **2.15** (`web/src/features/admin/sections/ScopesSection.tsx:97`, `AtprotoSection.tsx:411`, `auth/RolesTab.tsx:101`, `moderator/QueuesTab.tsx:100`), success **2.54** (`cortex/shared.tsx:62`), error **3.76**, info **3.68**; outlined success/warning borders also fail 1.4.11 (2.15–2.54 < 3:1).
  - Outlined, dark mode: error **4.38**, info/primary **4.48**.
  - Filled warning (black text, 9.22) and secondary (5.70) PASS — leave as-is.
- **Acceptance criteria:**
  - [ ] All Chip label/background pairs ≥ 4.5:1 and outlined borders ≥ 3:1 in BOTH themes — via theme-level `MuiChip` overrides (e.g. darker text tokens on tinted fills, like the existing `--exprsn-*-text` values) rather than per-call-site fixes.
  - [ ] No call-site behavior change; `npm run web:test` green.
  - [ ] Spot-verify the six representative call sites above in both themes.
- **Notes:** The design system already defines passing text-on-tint tokens (`--exprsn-success-text` #065f46 on #d1fae5 = 6.78 etc.) — mapping chips onto those is the natural remedy.

### BUG-050 — Green-on-green sidebar system status (live on every page) + tint classes use base semantic color instead of the `-text` tokens
- **Type:** bug · **Status:** done — QA-VERIFIED, merged + deployed 2026-07-27 (merge `619ed02`) · **Priority:** P3 · **Size:** S
- **Owner-role:** sr-developer · **Blocked-by:** —
- **Sprint:** Committed to Sprint 2026-10 (2026-07-27).
- **Resolution notes (2026-07-27, branch s2610):** `.system-status-text` →
  `var(--exprsn-success-text)` (2.24 → **6.78**, both themes); the pulsing
  `.status-indicator` dot → `var(--exprsn-success-hover)` (non-text 2.24 → **3.33**).
  Latent classes DELETED (grep confirmed zero TSX consumers):
  `.badge-primary/-success/-warning/-danger/-info` and
  `.alert-success/-warning/-danger/-info` (structural `.alert*`/`.badge`/
  `.badge-secondary` kept) and `.stat-icon.success/.warning`
  (`.stat-icon.primary`/`.danger` measure 3.10/3.08 ≥3:1 non-text and are kept).
  Dark-tint-token DECISION recorded in the CSS semantic-token block: the
  `-bg`/`-text` pairs are theme-invariant by design (no dark overrides); never pair
  `--exprsn-<sev>` with `--exprsn-<sev>-bg`.
- **Legacy:** 2026-07-20 accessibility review (tinted badge backgrounds suspect — confirmed); TASK-049 measurement
- **Description:** `web/src/app/RootLayout.tsx:204-206` renders `.system-status` ("All systems operational") in the sidebar footer of every page: `.system-status` bg `--exprsn-success-bg` (#d1fae5) with `.system-status-text` color `--exprsn-success` (#10b981), 13px/500 → **2.24:1** (needs 4.5:1). The tint tokens are not overridden in `[data-theme="dark"]` (`web/src/styles/exprsn-unified.css:91-98`), so it fails identically in dark. Root cause pattern: the CSS component classes pair `--exprsn-<sev>` (the saturated main color) with `--exprsn-<sev>-bg` instead of the purpose-built `--exprsn-<sev>-text` tokens, which all pass (6.4–7.2). Latent (currently unmounted) classes with the same defect: `.badge-success/-warning/-danger/-info/-primary` (css:1291-1314, 1.93–3.10), `.alert-success/-warning/-danger/-info` (css:1381-1401, 2.24–3.36), `.stat-icon.success/.warning` non-text 2.24/1.93 (css:739-749).
- **Acceptance criteria:**
  - [ ] `.system-status-text` ≥ 4.5:1 in both themes (e.g. `color: var(--exprsn-success-text)`).
  - [ ] The `.badge-*`, `.alert-*`, `.stat-icon.*` classes either switch to the `-text` tokens or are removed if truly dead (grep: 0 TSX consumers today).
  - [ ] Decision recorded on dark-mode tint tokens (add dark overrides for `--exprsn-*-bg`/`--exprsn-*-text`, or document them as theme-invariant).
- **Notes:** One-line fixes per class; the passing token values already exist in the same file (css:35-38).

### BUG-051 — Light-mode muted text fails on tertiary surfaces (4.35:1) and sits at the floor elsewhere
- **Type:** bug · **Status:** backlog · **Priority:** P3 · **Size:** S
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** 2026-07-20 accessibility review (`--exprsn-text-muted` suspect — confirmed on tertiary only); TASK-049 measurement
- **Description:** Light `--exprsn-text-muted` #737373 measures **4.35:1 on `--exprsn-bg-tertiary`** #f5f5f5 (needs 4.5). Concrete pairings: `.global-search .search-shortcut` kbd hint (`web/src/styles/exprsn-unified.css:218-230`), `.tree-badge` (css:1502-1508), plus any MUI `text.disabled` (= textMuted, theme.ts:25) rendered over gray fills (disabled text itself is 1.4.3-exempt, but the same value is used for non-disabled captions). On bg-primary/bg-secondary it passes but only just (4.74 / 4.54). Dark mode passes everywhere (6.00–7.85).
- **Acceptance criteria:**
  - [ ] Muted-on-tertiary pairings ≥ 4.5:1 in light mode — either darken the light token (≈#6f6f6f or darker keeps all current pairings ≥4.5) or forbid muted-on-tertiary and fix the two CSS classes.
  - [ ] Re-run the TASK-049 pairing matrix; no other muted pairing drops below 4.5.
- **Notes:** Smallest-blast-radius fix is the token nudge in `web/src/styles/exprsn-unified.css:49` + `web/src/app/tokens.ts:59` (keep the two mirrors in sync per tokens.ts header comment).

### BUG-052 — Non-text UI contrast (1.4.11): input/control borders, MUI Switch track, Alert icons on tint
- **Type:** bug · **Status:** backlog · **Priority:** P3 · **Size:** M
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** 2026-07-20 accessibility review; TASK-049 measurement
- **Description:** UI-component boundaries fail the 3:1 non-text minimum in both themes:
  - Input outlines: `MuiOutlinedInput.notchedOutline` uses `t.border` (`web/src/app/theme.ts:79`) → #e5e5e5 on #fff = **1.26** (light); #404040 on #1f1f1f = **1.59** / on #0a0a0a = **1.91** (dark). The border is the text field's only boundary indicator.
  - `--exprsn-border-color-strong` (scrollbar thumb, theme.ts:94; strong borders) = **2.52 L / 2.53 D**.
  - MUI Switch unchecked track (default, no override): **2.68** light (dark 3.53 passes) — 37 switches.
  - MUI Alert success/warning severity icons on their light-mode tints: **2.35 / 2.02** (error/info pass; all pass in dark; adjacent Alert text passes, so information is not icon-only — mitigating).
  - Focus ring, checkbox glyphs, offline status dot all PASS (measured).
- **Acceptance criteria:**
  - [ ] Interactive-control boundaries (text field outline, switch track) ≥ 3:1 against their surface in both themes (e.g. a dedicated `--exprsn-border-interactive` ≥ #767676-equivalent in light).
  - [ ] Decorative/non-interactive borders (card outlines, dividers) explicitly documented as exempt, or bumped.
  - [ ] Alert success/warning `iconMapping`/color meets 3:1 on the light tint or is accepted with the text-adjacency rationale recorded.
- **Notes:** Do not fix by lightening focus ring or text tokens — those pass today. Purely additive border-token work.

### BUG-053 — Target size (2.5.8): chip delete/copy icons are sub-24px targets; EntityEditor state chips fail outright
- **Type:** bug · **Status:** backlog · **Priority:** P3 · **Size:** S
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** 2026-07-20 accessibility review; TASK-049 measurement
- **Description:** MUI Chip delete icons are the clickable element and render 16×16 (small chip) / 22×22 (medium) vs the 24×24 minimum:
  - **Fail:** `web/src/features/lowcode/EntityEditor.tsx:285-289` — medium chips with BOTH `onClick` (set initial state) and `onDelete` (remove state): the 24px circle centered on the 22px delete icon intersects the chip's own click target, so the spacing exception cannot apply, and the two actions are destructive-adjacent.
  - **Fragile/conditional:** `web/src/features/messages/Composer.tsx:117-121` (attachment remove, 16×16 — currently passes only via the spacing exception; breaks if chips wrap tighter) and `web/src/features/rooms/RoomsPage.tsx:173-180` (copy-room-code implemented as a chip `deleteIcon` — a primary affordance on a 16×16 target).
  - **Measured, passes (no action):** all 169 `size="small"` IconButtons compute to 30×30/34×34; DataTable dense toolbar (`web/src/features/admin/ui.tsx:367-421`) 30×30; small Checkbox ≥28×28; small Switch 40×24; TableSortLabel passes via spacing exception. CalendarTab 18px chips are non-interactive (tooltip only) — N/A.
- **Acceptance criteria:**
  - [ ] EntityEditor state chips: delete affordance ≥24×24 or restructured (e.g. select-then-delete-button) so undersized targets don't overlap another target.
  - [ ] RoomsPage copy-code moved to a proper IconButton (≥24×24) or the chip target enlarged.
  - [ ] Composer attachment chips keep ≥ the spacing-exception margin when wrapping (or delete target enlarged).
  - [ ] No small IconButton regression below 24×24 (guard: no `p:0` overrides — none exist today).
- **Notes:** MUI-level remedy exists: bump `MuiChip` deleteIcon hit area via theme `styleOverrides` (padding on `.MuiChip-deleteIcon`) instead of per-site edits.

### BUG-054 — live `roomFiles.test.js` stale after FEAT-061 Pass 1 (exact-arg assertions miss the provenance argument)
- **Type:** bug · **Status:** backlog · **Priority:** P3 · **Size:** S
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** — (QA in-review closeout 2026-07-27, main `64a9f7a`; relates FEAT-061, BUG-027)
- **Description:** `cd services/live && npx jest tests/roomFiles.test.js` — the
  `toHaveBeenCalledWith` assertions at `:212` and `:258` still expect the pre-FEAT-061
  2-arg call shapes, but the routes now pass a third options argument
  (`{sharedAsOwner}` / `{ownerSharedIds}`, `roomCollab.js:118/:214`) that `ff8bba3`
  never propagated into this suite. Jest is strict on arity, so both fail. Test-only
  defect; product behavior is covered by the updated filevault suites.
- **Acceptance criteria:**
  - The two assertions updated to the 3-arg shapes; suite green.
  - A positive assertion added that provenance IS threaded through both call sites (the
    load-bearing part of BUG-027).
- **Notes:** jr-developer.

## Tasks

### TASK-039 — Admin interface refactor: live updates, uniform tables, full config read/write (parent)
- **Type:** task · **Status:** done (merged to `main` `fe58d2c`; IA restructure + config store + live updates, e2e-verified) · **Priority:** P1 · **Size:** XL (decomposed below; worked as one branch)
- **Owner-role:** sr-developer (session-led) · **Blocked-by:** —
- **Legacy:** — (builds on the reusable DataTable + admin click-through audit)
- **Description:** Full restructure of the `/admin` SPA + its backend surface, per Rick's
  2026-07-16 direction. Audit findings driving it: only 3/14 sections enable DataTable
  sort/filter and no table has global search; zero socket.io in admin (react-query
  polling only; `/_health` ns unused by SPA); timeline + prefetch have admin APIs but
  no sections; vault config read-only, filevault/atproto surface no config editor;
  3 primary raw-JSON editors violate the no-JSON-only-modals rule; and the
  auth/spark/timeline/prefetch/moderator/live `/api/config` endpoints are **publicly
  writable (no auth)**. Decisions (Rick, TUI 2026-07-16): socket.io `/_admin`
  namespace + react-query polling fallback; gate the ungated config endpoints now
  (CA admin auth); a **writable platform config-overrides store** (DB-backed,
  overrides env at runtime where safe, restart-required flags, architect sign-off);
  **full restructure** (split AuthSection 102KB into tabs, normalize all sections to
  one template).
- **Acceptance criteria:**
  - Every admin table: sortable + per-column filter + **global free-text search**,
    via the shared DataTable (no per-section forks).
  - Live updates: `/_admin` socket namespace (admin-auth gated) pushes
    dashboard/health/queue/moderation deltas; sections subscribe with react-query
    polling as fallback; RealtimeStatus reflects admin socket state.
  - All 14 modules have an admin section incl. new timeline + prefetch; every module's
    config is readable AND writable from admin (vault write path fixed; filevault +
    atproto editors added), with structured forms primary and JSON only as escape
    hatch (moderator AgentsTab, PluginsSection behavior, VaultSection rules rebuilt).
  - Env-only settings surfaced via the overrides store: DB-persisted overrides with
    env fallback, masked secrets, restart-required flagging; store design has
    systems-architect sign-off before merge.
  - All `/api/config` read/write endpoints require CA admin auth (the six ungated
    modules gated); regression: SPA flows keep working with bearer tokens.
  - Lint 0 errors, `web:build` green, existing module suites no worse than baseline.
- **Notes:** Work on branch `feat/admin-refactor` in an isolated worktree. Security
  surface (config gating) → sr-developer + architect review. Related: BUG-034 (validate
  limiter) may bite admin polling — keep admin QPS modest until it lands.
  **2026-07-17 build complete** (commits `63bc34e` `8469249` `3c8f08d`): all ACs
  runtime-verified except a full SPA click-through (QA). Deviations/finds:
  auth+timeline config routes were ALREADY gated (audit data stale) — the truly
  ungated four (spark/prefetch/moderator/live) now use shared `requirePlatformAdmin`;
  vault/prefetch/timeline-settings config writes were log-and-echo fakes, now persist
  (vault_config / Redis / TimelineConfig); shared `authenticateSocket` hardcoded
  `resource:'socket'` which 401'd every real handshake — fixed (default omits).
  Follow-ups to file: db:check coverage for the `platform` schema; CONFIG_STORE_KEY
  encrypted-secret support before any secret key enters the descriptor; PM decision
  on slimming the /admin/jobs vs Timeline/Prefetch section overlap; QA click-through
  of all 15 sections.

### TASK-045 — Interactive setup TUI for platform configuration (`npm run setup`)
- **Type:** task · **Status:** done (merged to main; pty-driven E2E verified: write, reload, quick-start, backup) · **Priority:** P2 · **Size:** M
- **Owner-role:** sr-developer (session-led) · **Blocked-by:** —
- **Legacy:** — (complements `.env.example`; sibling of the lowcode TUIs in `scripts/`)
- **Description:** First-run configuration currently means hand-editing a 400-line
  `.env.example`. Add `scripts/setup-tui.js` (pure Node readline + ANSI, same house
  style as `scripts/lowcode-tui.js`, zero new deps) that walks every configurable
  surface of the platform — edge/TLS, Postgres, Redis, secrets, observability,
  email, OAuth, AI providers, storage, Elasticsearch, RabbitMQ, live streaming,
  the AT-Proto bridge, plugins/low-code, cortex (+ vision + python sandbox +
  moderation modes), FileVault image moderation, and the Docker extras stack —
  and writes a grouped, commented `.env`.
- **Acceptance criteria:**
  - `npm run setup` opens the TUI; loads existing `.env` values (else
    `.env.example` defaults); never clobbers without a timestamped backup.
  - Every env var consumed by `src/config/index.js` + documented in `.env.example`
    is editable; secrets are masked and offer one-key generation at the documented
    strengths (SERVICE_TOKEN_SECRET 48B, JWT/SESSION/DEV_BYPASS ≥32B hex).
  - Validation: required secret lengths, numeric ports, enum-only fields
    (e.g. CORTEX_MODERATION_MODE, FILEVAULT_IMAGE_MODERATION, ATPROTO_DID_METHOD).
  - A "dev quick-start" preset fills sane local defaults + generated secrets.
  - Final review screen summarizes enabled features and which `worker:*`
    processes the chosen config requires; unknown/unmanaged keys in an existing
    `.env` are preserved verbatim.
  - Lint clean; no new dependencies.
- **Notes:** Config keys and defaults must stay in step with `src/config/index.js`
  and `.env.example` — the TUI's schema cites both. Dev-bypass fields keep their
  fail-closed wording (never weaken conditions per CLAUDE.md).

### TASK-001 — Frontend E2E pass (login → MFA wizard → sessions revoke)
- **Type:** task · **Status:** done (landed `430eaa0`; full flow PASS incl. the SP-6 revoked-bearer-401s check; CI job manual/non-blocking — no live stack on runners) · **Priority:** P1 · **Size:** M
- **Owner-role:** qa-specialist · **Blocked-by:** — *(unblocked: `SP-6`/`#9` sessions is DONE)*
- **Legacy:** SP-8 · #9 (frontend)
- **Description:** React rendering has only ever been driven at the API level.
  Stand up Playwright (or, minimum, a documented manual checklist) covering the
  core account flow against a running stack (gateway + nginx-served SPA).
- **Acceptance criteria:**
  - Flow passes end-to-end: login → `/settings` → MFA enable wizard (QR renders;
    a generated TOTP enables, then disables) → sessions list shows the active
    session and revoke invalidates it.
  - Sessions UI reflects `SP-6` (rows persist; a revoked session's bearer 401s).
  - If automated, the run is wired into CI (`.github/workflows/ci.yml`).

### TASK-002 — Stabilize the remaining auth Jest suites
- **Type:** task · **Status:** done (landed `ed1f477`; QA-verified 2026-07-07 — full suite 14/267 green re-run, product diffs reviewed as tightening) · **Priority:** P1 · **Size:** M
- **CI note (per AC, 2026-07-07):** the auth portion can move toward **blocking** with two prerequisites: (1) the CI test job must create `exprsn_auth_test` + export `AUTH_DB_*` (service containers exist; the bootstrap step doesn't), and (2) runs must stay strictly serialized per DB — two jest invocations sharing the test DB corrupt each other (each suite drops/recreates the `auth` schema in `beforeAll`). Recommend a split gate: auth blocking now, other modules non-blocking until their stale-test backlogs get the same treatment (`scripts/test-all.js` needs per-module status reporting for that).
- **Owner-role:** sr-developer · **Blocked-by:** —
- **Legacy:** #9 note (auth stabilization)
- **Description:** Since `SP-6`/`#9`, `services/auth/tests/session.test.js` is green,
  and the STATUS #12 MFA-policy suites (`mfaPolicy` / `mfaEnforcement` /
  `trustedDevice` / `mfaTrustedDevice`) also pass. But **seven** suites still fail
  with pre-existing, unrelated failures (error-field assertions, password-policy
  expectations, structural drift): `auth`, `mfa`, `oauth2`, `organization`, `rbac`,
  `saml`, `passwordService` — this is **STATUS #9's exact list** (STATUS.md L587); note
  `auth.test.js` is the **seventh** (it was previously miscounted as six). They now at
  least load. Get them green. **Current live counts (2026-07-07):** 7 suites failing /
  6 passing, 171 tests failing / 106 passing.
- **Acceptance criteria:**
  - All seven suites pass under the documented harness (separate `exprsn_auth_test`
    DB, `AUTH_DB_*` env, `maxWorkers:1`); `session.test.js` (and the STATUS #12
    MFA-policy suites) stay green.
  - `npm run test:all` auth portion is green.
  - Note filed on whether the CI `test` job can move toward blocking once stable.

### TASK-003 — Managed secret-store injection + set prod env
- **Type:** task · **Status:** backlog · **Priority:** P0 · **Size:** M
- **Owner-role:** unassigned · **Blocked-by:** staging host/target
- **Legacy:** SP-3 remainder · R4
- **Description:** Inject production secrets from a managed store (Compose secrets
  or a cloud manager) instead of a disk `.env`, and set the prod env per
  `docs/runbooks/secrets-and-rotation.md`. Runbook + `DEV_BYPASS`-inert proof
  already done; this is the deploy-time wiring.
- **Acceptance criteria:**
  - Staging boots with **zero** secrets in the image/repo (no `.env` on disk).
  - Prod checklist satisfied: `NODE_ENV=production`, `DB_SSL=true`, `DEV_BYPASS`
    off, real `CORS_ORIGIN`, no `change_me`/empty placeholders.

### TASK-004 — Provision real TLS at the nginx edge (:443) in staging
- **Type:** task · **Status:** backlog · **Priority:** P0 · **Size:** M
- **Owner-role:** unassigned · **Blocked-by:** staging host + domain
- **Legacy:** SP-4 remainder · R2
- **Description:** Terminate real (Let's Encrypt or managed) certs at the nginx
  edge in staging; add HSTS. The "no `rejectUnauthorized:false` reachable in
  prod" half is already done and locked by `shared/tests/httpAgent.test.js`.
- **Acceptance criteria:**
  - Staging served over a trusted cert; HSTS present; `80→443` redirect confirmed.
  - With `NODE_ENV=production`, loopback service calls verify TLS (no
    `rejectUnauthorized:false` path reachable).

### TASK-005 — Observability alerting: scraper + paging + log shipping + tracker
- **Type:** task · **Status:** backlog · **Priority:** P0 · **Size:** M
- **Owner-role:** unassigned · **Blocked-by:** monitoring target
- **Legacy:** SP-5 remainder · R3
- **Description:** The code baseline is done — `GET /metrics` (`prom-client`) and
  a `captureException` hook keyed by correlationId. This is the deploy-time
  environment wiring.
- **Acceptance criteria:**
  - A Prometheus/Grafana (or hosted) scraper is pointed at `/metrics`.
  - Alerts fire on `/health` degradation and on process crash (uptime monitor /
    supervisor pages).
  - Winston logs ship to durable storage.
  - A thrown error surfaces in the tracker with its correlationId using a real
    `SENTRY_DSN` (+ `@sentry/node` installed).

### TASK-006 — Backup automation: cron + off-host shipping + secret-store password
- **Type:** task · **Status:** backlog · **Priority:** P1 · **Size:** S
- **Owner-role:** unassigned · **Blocked-by:** TASK-003 (for secret-store `DB_PASSWORD`)
- **Legacy:** SP-10 remainder · R6
- **Description:** Tooling is done and a restore was rehearsed
  (`npm run db:backup` / `db:restore`, `scripts/backup/`). Wire the schedule and
  off-host storage.
- **Acceptance criteria:**
  - Nightly cron runs `db:backup`; retention verified.
  - `DB_PASSWORD` sourced from the secret store (TASK-003).
  - Dumps shipped off-host; RPO/RTO reconfirmed in `scripts/backup/README.md`.

### TASK-007 — Load / throughput pass (single instance)
- **Type:** task · **Status:** backlog · **Priority:** P0 · **Size:** M
- **Owner-role:** unassigned · **Blocked-by:** TASK-004, TASK-005
- **Legacy:** SP-9 · R5
- **Description:** Representative load against REST + Socket.IO + Bull on a single
  gateway instance. Nothing has been exercised under concurrency yet.
- **Acceptance criteria:**
  - Documented run at target concurrency with no errors / no OOM under burst.
  - PG/Redis headroom, socket fan-out, queue drain, and memory observed and
    recorded.
  - Bottlenecks filed as fresh tickets; single-instance MVP-load sign-off.

### TASK-013 — Nexus calendar/contacts: document subscription URLs + clean up broken JSON "DAV" scaffolding
- **Type:** task · **Status:** done (landed `cbf49d3` + doc fix `95ceb97` removing the unsupported `?token=` claim; QA-verified 2026-07-07) · **Priority:** P3 · **Size:** S
- **Owner-role:** jr-developer · **Blocked-by:** —
- **Legacy:** FEAT-001 Slice 0 (see `sprints/assessments/FEAT-001.md`) · STATUS "group Calendar tab" note
- **Description:** The cost-benefit-analyzer's "do now" slice of the FEAT-001 DAV
  epic. Two parts, both in-house with no TLS/staging dependency: (a) document the
  existing GET `.ics`/`.vcf` subscription URLs under `/nexus/api/calendar`
  (`groups/:groupId/ical`, `users/:userId/ical`, `events/:id/ical`, the `.vcf`
  contacts export — `API_SURFACE.md` L459–462) as the *supported* native-app
  read-only path; (b) fix-or-remove the broken JSON "DAV" scaffolding in
  `services/nexus/src/services/caldavService.js` / `carddavService.js` so it stops
  masquerading as working protocol support. The real DAV verbs are rebuilt properly in
  FEAT-003 (Slice 1) on the `@exprsn/shared` WebDAV toolkit.
- **Acceptance criteria:**
  - The `.ics`/`.vcf` subscription URLs are documented (in-repo docs / the docs
    viewer) as the supported way to subscribe a group calendar + contacts in
    macOS/iOS/Google/Thunderbird, read-only and auto-updating.
  - No bare Mongo-style operators (`$gte`/`$lte`/`$gt`) remain in the nexus Sequelize
    where-clauses (`caldavService.js`, `carddavService.js`) — fixed to `Op.*` or the
    dead code removed; a grep for `'$gte'`/`'$gt'`/`'$lte'` in those files is clean.
  - `getEventsForSync` no longer returns the `ical: null // populated on demand`
    placeholder (returns real data or the method/route is removed).
  - The `validateCalDAVCredentials` unconditional `return true` stub is removed (no
    silent always-allow left behind).
  - No new open surface introduced; no schema change.
- **Notes:** Committed to `active/sprint-2026-07.md` 2026-07-07 (jr-developer).
  In-house, no TLS/staging dependency; no schema/queue change (no DBA gate) and no
  module-structure/`registry.js` change (no architect gate) — the `$gte→Op.gte` fix is
  query-correctness within existing code. Not a FEAT, so no C/B gate; provenance is
  FEAT-001's assessment. sr-developer to review the where-clause fixes.

*(QA full-codebase audit — 2026-07-07. PM-intake tasks groomed from the audit.)*

### TASK-014 — Moderator: resolve real recipient emails for rejection notices (auth-service lookup)
- **Type:** task · **Status:** backlog · **Priority:** P3 · **Size:** S
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** — (moderator email/notification pipeline)
- **Description:** `services/moderator/services/emailService.js` `getUserEmail(userId)`
  (L348) returns a hardcoded placeholder `user-${userId}@example.com` (L351,
  `// For now, return a placeholder`). All eight rejection/notice emails this service
  builds (call sites L222–L334) are therefore addressed to a fabricated address, so if
  `EMAIL_PROVIDER=smtp` is enabled the emails never reach real users. Resolve the real
  address via the auth service.
- **Acceptance criteria:**
  - `getUserEmail(userId)` resolves the user's real email via the auth service (an
    inter-module call over `*_SERVICE_URL` with per-service HMAC, consistent with the
    existing moderator→auth calls), with a safe skip/fallback (no send to a fabricated
    `@example.com`) when the lookup fails.
  - With `EMAIL_PROVIDER=smtp`, an integration/mocked test shows a rejection notice
    addressed to the resolved real address; no `@example.com` placeholder remains in the
    send path.
  - Behavior unchanged when email is disabled (the default) — no new hard dependency at
    boot.
- **Notes:** TASK — **default-off today** (`EMAIL_PROVIDER=smtp` is not the default), so
  low urgency → **P3**. In-house (reuses the gateway loopback + `SERVICE_TOKEN_SECRET`
  HMAC pattern); no schema/queue change (no DBA gate) and no `registry.js`/wiring change
  (no architect gate). **Risk to confirm at grooming:** verify an auth-service
  email-lookup endpoint exists in `API_SURFACE.md`; if none does, scope grows to adding
  one (loop **systems-architect**) and size may rise to M. Route to jr-developer.

### TASK-015 — Live: persist generated timeline video to FileVault instead of local disk
- **Type:** task · **Status:** backlog · **Priority:** P3 · **Size:** M
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** — (Live timeline-video output; "Live admin & workers" memory)
- **Description:** `services/live/src/services/timeline.js` (L365) has
  `// TODO: Upload to file storage service` — the generated timeline video is written to
  local disk and left there rather than uploaded to FileVault, so the output is not
  durably stored (lost on container/host recycle; not served through the normal file
  surface). Wire the generated file into FileVault and reference it from the timeline
  record.
- **Acceptance criteria:**
  - The generated video is uploaded to FileVault via the existing filevault API
    (inter-module HTTP with per-service HMAC), and the timeline record references the
    stored file id/URL instead of a local path.
  - The local temp file is removed after a successful upload; an upload failure is logged
    and retried/handled (no silent loss).
  - Filevault upload route + the timeline linkage verified against `API_SURFACE.md` before
    wiring.
- **Notes:** TASK, **P3** (durability/quality, not blocking). In-house — reuses the
  filevault upload API + `SERVICE_TOKEN_SECRET` HMAC. If the timeline record needs a **new
  column** to hold the file id/URL, that is an ALTER on an existing table → flag **dba**
  (sync `db:migrate` will not ALTER; run the migration `up()` directly). Touches the Live
  worker / ffmpeg-fanout path → route to sr-developer. Sized **M** (drops to S if it is a
  straight upload+link with no schema change).

### TASK-016 — Prune the 7 clean `worktree-agent-*` worktrees/branches (merged `898cd01`)
- **Type:** task · **Status:** backlog · **Priority:** P3 · **Size:** S
- **Owner-role:** unassigned · **Blocked-by:** TASK-018 (the 8th worktree holds uncommitted work that must be triaged/preserved before any prune)
- **Legacy:** — (repo housekeeping)
- **Description:** Eight `worktree-agent-*` git worktrees/branches exist. `898cd01` is
  confirmed **merged into `main`**, and **7 of the 8** worktrees are clean at that commit —
  those are safely prunable cruft. The **8th**, `agent-a76c91518dd128052`, is **NOT** cruft:
  it holds **11 uncommitted changes** — a real in-progress nexus "phase-0 authz" feature
  (see TASK-018) — and must **not** be force-removed.
- **Acceptance criteria:**
  - The **7 clean** `worktree-agent-*` worktrees (all at merged `898cd01`, no uncommitted
    changes) are removed and their branches deleted.
  - Worktree/branch `agent-a76c91518dd128052` is **left intact** until TASK-018 preserves-
    or-discards its uncommitted work — no `--force` prune of it.
  - `git worktree list` / `git branch` show only `agent-a76c91518dd128052` remaining among
    `worktree-agent-*` (or none, if TASK-018 has since cleared it).
- **Notes:** Housekeeping. **Corrected 2026-07-07** — originally slated to be filed `done`
  ("orchestrator removing this session"), but on inspection the orchestrator did **not**
  prune, because a blanket prune is unsafe: `agent-a76c91518dd128052` carries uncommitted
  nexus phase-0-authz work (see TASK-018) — the QA "all stale cruft" claim was wrong for
  that one. No existing housekeeping ticket covers worktree pruning (`TASK-011` is a
  *deferred* dead-code batch, unrelated). PM ran **no** git command. Route the safe
  7-worktree prune to jr-developer once TASK-018 has cleared the 8th.

### TASK-017 — API_SURFACE.md: correct stale auth/moderator security-flags notes
- **Type:** task · **Status:** backlog · **Priority:** P3 · **Size:** S
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** SP-11 H1 (auth `/config` now `requireAdminBearer`); BUG-006 (timeline `/moderator` webhook line already corrected)
- **Description:** Two stale entries in `API_SURFACE.md`'s security-flags section: (a) L26
  still says auth `GET`/`POST /auth/api/config/:sectionId` have "**no auth** — public
  read/write of config", but `services/auth/src/routes/config.js` now does
  `router.use(requireAdminBearer)` (L17, per SP-11 H1) — the route is admin-gated; the
  per-route table row (L281) likewise still shows "**none (public)**". (b) L30 says
  "`moderator`: all REST routes are **unauthenticated** except `/api/notifications`", which
  is now over-broad — the `rules` / `agents` / `wordlists` / `queues` / `workflows` routers
  each `router.use(requireAdmin)` (verified by grep). (The timeline `/moderator` webhook
  line, L44, was already corrected by BUG-006.)
- **Acceptance criteria:**
  - L26 and the L281 table row reflect that `/auth/api/config/:sectionId` is
    `requireAdminBearer` (admin-gated), not public.
  - L30's moderator note is narrowed to list which moderator routers **are**
    `requireAdmin`-gated (`rules`/`agents`/`wordlists`/`queues`/`workflows`) vs. which
    remain unauthenticated (cross-reference **SPIKE-001**).
  - Documentation only — no product/code change; the doc matches the live wiring as
    verified by grep.
- **Notes:** TASK (doc-only), **P3** — doc drift, no code change. The genuinely
  unauthenticated moderator routers (`moderation`/`review`/`reports`/`metrics`/`actions`/
  `appeals`) are a **separate structural question** tracked in **SPIKE-001** (architect
  review); this ticket only makes the doc accurate to the *current* wiring — it does not
  assert those remaining routes are acceptable. **Coordinate with SPIKE-001**: if the
  architect's gating decision lands first, reflect it in the moderator line. Route to
  jr-developer.

### TASK-018 — Triage + preserve-or-discard the orphaned nexus phase-0-authz work (worktree `agent-a76c91518dd128052`)
- **Type:** task · **Status:** backlog · **Priority:** P2 · **Size:** S
- **Owner-role:** unassigned · **Blocked-by:** — *(routed to systems-architect for the land-or-discard call — touches nexus module structure + shared code)*
- **Legacy:** — · relates to the "groups frontend expansion" direction (making nexus group-aware); **blocks TASK-016**
- **Description:** The `worktree-agent-*` worktree `agent-a76c91518dd128052` holds **11
  uncommitted changes** implementing an in-progress nexus **"phase-0 authz"** feature —
  **NOT** cruft, and at risk of loss (it lives only in an untracked worktree). Modified:
  `services/nexus/src/index.js`, `.../middleware/groupAuth.js`, `.../routes/config.js`,
  `.../routes/groups.js`, `.../services/groupService.js`, `.../services/membershipService.js`,
  and `shared/index.js`. New files: `services/nexus/src/middleware/platformAdmin.js`,
  `services/nexus/src/routes/internal.js`,
  `services/nexus/tests/integration/routes/phase0Authz.test.js`, and
  `shared/middleware/requireGroupMembership.js`. This is exactly the "make a module
  group-aware" backend work the groups-frontend-expansion plan flags as still needed.
  **Preserve** it first (commit to a branch so it can't be lost), then **triage**: land it
  (properly, behind review) or deliberately discard it.
- **Acceptance criteria:**
  - The uncommitted work in `agent-a76c91518dd128052` is **preserved to a named git branch**
    (e.g. `feature/nexus-phase0-authz`) so no work is lost, **before** TASK-016 prunes it.
  - A systems-architect review decides **land vs. discard**, grounded in the intended nexus
    group-authz design + module contract; the decision is recorded on this ticket.
  - **If land:** the shared-code changes (`shared/index.js`,
    `shared/middleware/requireGroupMembership.js`) are mirrored into **both** shared copies
    (`shared/` and `services/shared/`) per the two-copy rule, and follow-up build/verify
    tickets are filed (new routes/middleware ⇒ architect sign-off; any schema/queue ⇒ dba).
  - **If discard:** the branch is tagged/noted and the worktree released, unblocking
    TASK-016.
- **Notes:** **Routed to systems-architect** — orphaned *structural* work (new nexus
  middleware `platformAdmin.js` + `routes/internal.js`, a new shared
  `requireGroupMembership.js`, and a group-authz model), so whether/how to land it is an
  architecture call, not a straight merge; it also touches **shared code** (two copies must
  stay in sync) and adds a nexus integration test. **P2** — uncommitted, at-risk work that
  should be preserved before any prune (it gates TASK-016's 8th worktree). Sized **S** for
  the preserve-to-branch + triage decision; a full "land it" would be a separate, larger
  build ticket filed from the architect's decision. PM ran **no** git command.

*(Moderation routing & auth-gating — implementation intake 2026-07-07, from the
systems-architect design doc `sprints/moderation-routing-plan.md`, Item B. TASK-019
is the implementation of **FEAT-009** and stays blocked on FEAT-009's Cost/Benefit
sign-off.)*

### TASK-019 — Route filevault + timeline + spark UGC through the central `moderateContent` pipeline (implements FEAT-009)
- **Type:** task · **Status:** done · **Priority:** P1 · **Size:** L — reconciled 2026-07-27 — merged to `main` (`5815bd8`/`d17c69c`)
- **Owner-role:** unassigned · **Blocked-by:** **FEAT-009 Cost/Benefit gate** (still `pending` — the parent FEAT this ticket implements cannot be promoted past `backlog`, and this ticket cannot reach `ready`/COMMIT, until the cost-benefit-analyzer attaches an assessment); **dba co-sign** required on schema/queue shape before COMMIT; four open design decisions (see Notes) must be resolved first
- **Legacy:** implements **FEAT-009** (Tier-1 moderation gap analysis) · design `sprints/moderation-routing-plan.md` (Item B) · reference pattern `services/atproto/src/ingest/moderationBridge.js` · relates to BUG-006 (authenticated timeline sink), BUG-010 (the `requireService`-gated HTTP fallback contract), TASK-009 (in-process direction), FEAT-008/FEAT-016/FEAT-018/FEAT-019 (plug into this backbone)
- **Description:** The **structural, cross-module implementation of FEAT-009** per the
  architect's design doc (`sprints/moderation-routing-plan.md`, Item B). Today only
  atproto auto-submits UGC into the central engine; route filevault, timeline, and spark
  user content through `moderationService.moderateContent` too. **In-process `require`**
  of the moderator engine (mirroring `services/atproto/src/ingest/moderationBridge.js`),
  **not** an HTTP self-call to `MODERATOR_SERVICE_URL` — one process, and it aligns with
  the `TASK-009` direction (don't add `*_SERVICE_URL` hops we intend to remove). Posture
  is **async/optimistic**: publish/store/deliver first, moderate off the user path,
  **retract on an adverse verdict** via an authenticated module webhook. Filed as a
  **TASK that implements FEAT-009** (not a second FEAT) so the C/B gate lives on the
  single parent FEAT; this ticket carries the buildable, architect-signed acceptance
  criteria and stays `blocked` on that gate.
- **Acceptance criteria:**
  - A thin, **lazy, best-effort `submitForModeration()` helper** (in-process `require`
    of `moderator/services/moderationService`, fire-and-forget, `.catch()` — never
    awaited into the request, never throws into the response path) is established with
    the `sourceService`/`contentId` conventions. The HTTP `POST /api/moderate/content`
    route (now `requireService`-gated per **BUG-010**) is kept as the external/out-of-
    process fallback contract, not the in-process path.
  - **filevault** (built first — files aren't broadcast): `services/filevault/src/routes/files.js`
    `POST /upload` and `POST /create` submit after `fileService.uploadFile` returns —
    `sourceService='filevault'`, `contentId = file.id`, text→`contentText`, images→`contentUrl`;
    a **new authenticated (HMAC `requireService`) `/api/moderation/action` sink** in
    filevault quarantines (visibility=private / `moderationStatus`) on an adverse verdict.
  - **timeline** (built second): `services/timeline/src/routes/posts.js` `POST /` submits
    after `postService.createPost`, beside the existing `approvalService` block —
    `sourceService='timeline'`, `contentId = post.id`; reuses `approvalService.holdForApproval()`
    for the pre-hold policy path; adverse verdict retracts via the **existing authenticated**
    `POST /timeline/api/webhooks/moderator` sink, merging (not clobbering) `metadata.moderation`
    (the BUG-006 fix).
  - **spark** (built last — E2EE-constrained): `services/spark/src/services/messageService.js`
    `sendMessage()` submits after `Message.create` — `sourceService='spark'`,
    `contentId = message.id`, **plaintext-only** (`encrypted=true`/`content=null` messages
    are **skipped**, never submitted); a **new authenticated action sink** in spark
    redacts/removes on an adverse verdict.
  - **Idempotency:** each module passes a **stable** `contentId` (the row UUID) and its
    **own** `sourceService` string; `(sourceService, contentType, contentId)` is the dedupe
    key (`moderationService.js:49`), so retries / at-least-once delivery are no-ops.
  - **Failure mode is explicit and documented per content type — fail-open**
    (publish/store/deliver) with a `moderation:pending` marker for backfill; correlation-id'd
    errors, never an unhandled 500 on the user write path.
  - **The new filevault + spark action sinks ship WITH HMAC auth**, not after — no
    recreation of the BUG-006 unauthenticated-mutation hole.
  - Integration test per module: content passes clean / is held-or-retracted on an adverse
    verdict through the live pipeline; fail-open behavior verified when moderator/AI is down.
  - **Build order:** filevault → timeline → spark.
- **Notes:** **Architect sign-off given** in `sprints/moderation-routing-plan.md` (new
  inter-module moderation-submit contract + async/optimistic + fail-open posture +
  authenticated action sinks) — but each step is a structural inter-module change, so the
  architect sign-off gate stands **at COMMIT**, and **dba co-sign is required** on the
  schema/queue shape. **Open decisions to resolve before this can be groomed to `ready` /
  committed** (flagged as blockers):
  - **(a) spark 1:1 DM policy** (architect + PM): proactively moderate DMs vs. report-only.
    **PM recommendation: report-only for MVP** (E2EE + privacy) — DMs enter moderation only
    via a user `POST /api/reports`; proactive scope = plaintext group/channel + attachments.
  - **(b) durable Bull queue vs. fire-and-forget** (dba): a moderator-owned `moderate-ugc`
    Bull queue + `worker:*` process now, or inline-async fire-and-forget for MVP + queue later.
  - **(c) fail-open backfill sweep** (dba): who re-submits `moderation:pending` items, and on
    what cadence — without it, fail-open = permanently unmoderated.
  - **(d) moderation-state storage** (dba): JSON `metadata` key (no ALTER risk on JSONB) vs.
    a dedicated **indexed column** on `Post`/`File`/`Message`. **ALTER-gap reminder:** sync
    `db:migrate` creates new tables but does **not** ALTER existing ones — a new column on an
    existing table needs its migration `up()` run directly (schema-qualified per module) or
    every query on that table 500s. moderator itself needs **no** new schema (`ModerationCase`
    is already keyed by `sourceService`/`contentId`; the new values are just data).
  - `sourceService` discriminators: `timeline` / `filevault` / `spark` (distinct from atproto's
    `bluesky`) keep idempotency keys from colliding. Sized **L** → route to **sr-developer**.

### TASK-020 — Fix-or-delete the broken dead `auth` rbac middleware
- **Type:** task · **Status:** backlog · **Priority:** P3 · **Size:** S
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** found during TASK-002 suite stabilization 2026-07-07
- **Description:** `services/auth/src/middleware/rbac.js` imports `getRbacService`
  and calls `hasAnyPermission` / `hasAllRoles` / `isOrganizationMember` /
  `isGroupMember` / `getUserRoles` — none of which `rbacService.js` exports. No
  route currently uses it, but any future consumer gets a runtime TypeError. The
  stabilized `rbac.test.js` covers only the service-independent pieces
  (`requireOwnership`, `anyOf`, `allOf`) and documents this in its header.
- **Acceptance criteria:**
  - Either the middleware is reconciled against the real `rbacService` API (with
    tests for the service-backed guards) or the dead functions are deleted; no
    exported function calls a nonexistent service method.
- **Notes:** Filed 2026-07-07 from the TASK-002 report. Dead-code hygiene, S,
  jr-developer candidate.

*(Org signup/provisioning chain follow-ups — filed 2026-07-11 from the
FEAT-032/034/035 adversarial-review + deferral notes, branch
`feat/org-signup-provisioning`. Cross-linked to the parent FEATs. No C/B gate —
these are TASKs; the deferred queue lane (TASK-029) was already assessed and
deferred inside FEAT-035's Cost/Benefit, so it is filed as a TASK, not a fresh
FEAT.)*

### TASK-027 — Provisioning engine façade cleanup: move S1 auth-model writes behind an auth-published transactional service
- **Type:** task (tech-debt) · **Status:** backlog · **Priority:** P3 · **Size:** S
- **Owner-role:** unassigned · **Relates:** FEAT-032 · ADR-0003 (RC-1/RC-5 accepted deviations)
- **Description:** FEAT-032's `src/provisioning/engine.js` open-codes some auth
  step-S1 model writes via a **downward lazy require** into the auth module —
  acyclic, and accepted as a documented deviation in ADR-0003 (constraints
  RC-1/RC-5). Close the façade boundary by moving those writes behind an
  auth-owned/published transactional service the engine calls, so the engine no
  longer reaches into auth's model layer directly.
- **Acceptance criteria:**
  - The S1 auth-model writes in `engine.js` go through an auth-published
    transactional service interface, not a direct require of auth models from the
    engine.
  - Saga behavior is unchanged — incl. the S1 rollback/compensation path; the 37
    provisioning tests still pass.
  - ADR-0003 RC-1/RC-5 are updated to reflect the boundary is closed (or the
    residual is re-documented if a full close isn't taken).
- **Notes:** Accepted-deviation follow-up from FEAT-032's adversarial review —
  hygiene, not a defect (the deviation is documented + acyclic). Touches the
  cross-module façade → **systems-architect** should confirm the published-service
  shape before build. Sized **S**; route to sr-developer.

### TASK-028 — Harden nexus_group import authz before enabling `USER_IMPORT_NEXUS_ASSIGN`
- **Type:** task · **Status:** backlog · **Priority:** P2 · **Size:** S
- **Owner-role:** unassigned · **Relates:** FEAT-035 (review finding #5) — **gates the `USER_IMPORT_NEXUS_ASSIGN` flag**
- **Description:** FEAT-035 shipped the per-row Nexus-group assignment column behind
  a lazy, flag-gated (`USER_IMPORT_NEXUS_ASSIGN`, default off) seam. Before that
  flag is ever enabled, the import must resolve the target group **within the
  target org's linked nexus group** and **verify the acting importer's authority**
  over it — otherwise an org-scoped importer could assign members into a nexus
  group outside their tenant (documented in the FEAT-035 review as a pre-enable
  requirement).
- **Acceptance criteria:**
  - Nexus-group assignment during import resolves the group inside the target
    org's linked nexus group (via the FEAT-032 org↔nexus linkage), not by raw
    group id/name across tenants.
  - The importer's authority over the target nexus group is verified server-side;
    a cross-tenant assignment attempt is rejected, with a test proving it.
  - `USER_IMPORT_NEXUS_ASSIGN` is only recommended for enablement after this lands;
    routes verified against `API_SURFACE.md`.
- **Notes:** Security-hardening pre-enable requirement (the flag is off today, so
  not release-blocking now → **P2**). Cross-module authz (auth import ↔ nexus
  group) → loop **systems-architect** at grooming. Sized **S**; route to
  sr-developer.

### TASK-029 — User import v2 slice B: Bull-queued large imports (>2000 rows) + import-job state + progress endpoint
- **Type:** task · **Status:** backlog · **Priority:** P3 · **Size:** M
- **Owner-role:** unassigned · **Relates:** FEAT-035 (deferred queue lane) · **Blocked-by:** — *(dba sign-off — Bull queue in a module with none today + a new import-job state table)*
- **Description:** FEAT-035 slice A capped synchronous import at ~2000 rows
  (`csv-parse` cap) and **deferred** the large-file lane. This is that lane: a Bull
  queue (auth has **zero** Bull usage today — new module infra, not free reuse) for
  imports above the documented threshold, a persisted import-job state table, and a
  progress/status endpoint; large files stream, never buffer unbounded.
- **Acceptance criteria:**
  - Imports above the documented row threshold run as a queued Bull job with a
    progress/status endpoint; the synchronous path stays for small files.
  - A new import-job state table persists per-job status/progress/result with
    retention/cleanup defined. New table → safe under sync `db:migrate`; flag any
    ALTER on an existing table immediately.
  - **dba** signs off the Bull queue design + the import-job state table before
    commit.
  - Test: a queued large import completes end-to-end with progress reported.
- **Notes:** **Revisit trigger** (carried from FEAT-035's C/B): a real import
  **>2000 rows**, or the synchronous path exceeding a request-timeout budget in
  practice — speculative at in-house scale until then. **dba** owns the queue +
  state-table review. Filed as a TASK (not a fresh FEAT) because FEAT-035's
  Cost/Benefit already assessed and deferred this exact lane — no new C/B gate
  needed. Sized **M**; route to sr-developer once the trigger fires.

### TASK-030 — Dedupe the platform-admin predicate: converge `routes/users.js` `isAdminUser` onto shared `hasAdminRole`
- **Type:** task (tech-debt) · **Status:** backlog · **Priority:** P3 · **Size:** S
- **Owner-role:** unassigned · **Relates:** FEAT-035 (the shared-root CRIT fix)
- **Description:** FEAT-035 fixed the cross-tenant platform-admin escalation at the
  shared root by requiring GLOBAL-scoped role bindings in **two** places —
  `hasAdminRole` (`shared/middleware/requireAdmin.js`) and `isAdminUser`
  (`services/auth/src/routes/users.js`). Those are now duplicate predicates.
  Converge `isAdminUser` onto the shared `hasAdminRole` helper so the platform-admin
  determination lives in exactly one place.
- **Acceptance criteria:**
  - `routes/users.js` uses the shared `hasAdminRole` helper for its platform-admin
    check; the local `isAdminUser` predicate is removed or becomes a thin
    pass-through.
  - The GLOBAL-scoped-binding requirement (the FEAT-035 fix) is preserved — the
    org-scoped-admin-no-bypass regression test still passes.
- **Notes:** Trivial (XS-class) dedupe hygiene — no behavior change intended, just
  single-source the predicate. Sized **S**; jr-developer candidate.

---

### TASK-033 — Delete the orphaned `workflowIntegration.js` axios client (dead proxy to :3017)
- **Type:** task · **Status:** backlog · **Priority:** P3 · **Size:** S
- **Owner-role:** unassigned · **Blocked-by:** FEAT-051 grooming (confirm the engine-consolidation decision first)
- **Legacy:** BUG-028 (closed invalid — this is its only real residue)
- **Description:** `services/moderator/services/workflowIntegration.js` is an **axios client to
  `WORKFLOW_SERVICE_URL` (`http://localhost:3017`)** — the standalone `exprsn-workflow` service, which
  is **not part of the platform**. It is now **orphaned**: nothing in `services/`, `src/`, or
  `scripts/` requires it, and `WORKFLOW_SERVICE_URL` is set in no `.env`, `.env.example`, or compose
  file. Its job was taken over by the in-process `services/workflowEngine.js` (durable Bull runtime).
  It is a **landmine**: it looks like live integration, so a future change could wire it up and get
  silent failures against a service that will never answer.
- **Acceptance criteria:**
  - `workflowIntegration.js` is deleted, or explicitly retained with a recorded reason.
  - The stale comment in `scripts/seed/moderation-demo.js` (lines ~15–16) that still references
    `workflowIntegration.listActiveWorkflows` as a "local fallback" is corrected — it describes a code
    path that is no longer reachable.
  - `npm run lint` and the moderator suite are unaffected.
- **Notes:** **Sequence after FEAT-051's engine-consolidation decision** — that epic must first settle
  whether workflow lives in moderator or lowcode. If the answer is "one engine, in-process" (the
  likely outcome), this file is unambiguously dead and goes. Trivial (S); jr-developer candidate once
  unblocked. Cross-link BUG-028 for the full evidence trail.

### TASK-031 — API_SURFACE.md omits two whole modules and one whole router — **DONE**
- **Type:** task · **Status:** done — QA-VERIFIED closed 2026-07-27 (in-review closeout, Sprint 2026-10) · **Priority:** P2 · **Size:** M
- **Owner-role:** sr-developer · **Blocked-by:** —

> **DONE 2026-07-13.** Added, each verified 1:1 against the route files:
> **plugins 24/24 endpoints**, **lowcode 52/52**, **live `roomCollab.js` 14/14** (which was
> 100% undocumented), plus the two missing `/live` socket chat events
> (`stream-chat-message`, `chat-history`). Header corrected from "the ten consolidated
> modules" to **fourteen**, with the 2026-07-13 source-read date recorded.
>
> **Two of this ticket's own claims were wrong, and are corrected here:**
> - **The "~10 missing timeline endpoints" claim was false.** They are all already
>   documented — the doc groups them onto shared rows (e.g.
>   `GET /timeline/api/timeline/explore, /trending, /bookmarks, /likes`), and the audit
>   that filed this ticket did not parse the grouped rows. **No timeline change was needed.**
> - **The claimed-missing `live` `config` / simulcast `health`+`metrics` / `streams/:id/stop`
>   rows already existed too.** Only `roomCollab` was genuinely absent from `live`.
>
> Net: the real gap was **90 endpoints across three routers**, not the wider set the ticket
> asserted. The doc's existing security annotations were preserved (it correctly flagged the
> BUG-029 mount order). Lowcode's section records that it is the **one module that already
> enforces org/group scope** — cross-linked to `sprints/assessments/FEAT-059.md`.
- **Legacy:** cross-links TASK-017 (different scope — do not merge)
- **Description:** `API_SURFACE.md` is the documented contract consulted before wiring any route
  (per CLAUDE.md), and it has drifted structurally — not just in detail:
  - **`plugins` has no section at all** (~24 endpoints undocumented).
  - **`lowcode` has no section at all** (~52 endpoints undocumented).
  - The **entire `live/roomCollab.js` router** (~14 endpoints — invites, join-requests, file
    share/upload/download/delete, recording start/stop) is undocumented despite being mounted at
    `/live/api/rooms`.
  - Its header still reads *"the ten consolidated modules … generated from a source read on
    2026-06-16"* — there are now **14** modules.
  - Spot-check also found ~10 undocumented `timeline` endpoints (repost/bookmark/quotes/trending)
    and several `live` ones (`config` router, simulcast health/metrics, `POST /api/streams/:id/stop`).
- **Acceptance criteria:**
  - `plugins` and `lowcode` have full sections; `live/roomCollab` is documented.
  - The header reflects 14 modules and a current source-read date.
  - A spot-check of any 3 modules' route files against the doc finds no missing endpoints.
- **Notes:** **TASK-017 is scoped only to "stale auth/moderator *security-flags notes*"** — it does
  **not** cover whole-module omission. Cross-link, do not duplicate or close one with the other. The
  doc's existing security annotations are accurate and valuable (it correctly flags the BUG-029 mount
  order) — this is staleness, not wrongness. Consider a generator to stop the drift recurring.
- **QA closeout (2026-07-27):** Doc-vs-code exact match on main — plugins 24/24 and
  lowcode 52/52 endpoints; roomCollab router + both socket events documented.

### TASK-032 — Delete-or-revive the dead auth route directories
- **Type:** task · **Status:** backlog · **Priority:** P3 · **Size:** S
- **Owner-role:** unassigned · **Blocked-by:** FEAT-068 grooming (for `billing.js` only)
- **Legacy:** STATUS #10 (cosmetic/dead code); distinct from TASK-020
- **Description:** Two dead route surfaces in auth:
  - **`services/auth/routes/`** (6 files, ~36 endpoints: `auth`, `billing`, `mfa`, `sessions`, `sso`,
    `webhooks`) is referenced **nowhere** — `services/auth/index.js` merely re-exports `src/index.js`.
  - **`services/auth/src/routes/ldap.js`** (12 endpoints) is `require`-able but **never mounted**.
  Both are **inherited, not lost in consolidation** — the original `exprsn-auth` never mounted them
  either (verified against its `src/index.js`). So this is cruft cleanup, **not** recovering a feature.
- **Acceptance criteria:**
  - Each dead file is either deleted or deliberately mounted with a recorded reason.
  - `npm run lint` and `npm run test:all` unaffected.
- **Notes:** **Two carve-outs.** (1) **`billing.js` — do not delete yet**: it is the natural revival
  seam for FEAT-068 (payments), where the billing *schema* already exists in auth's migrations. Hold
  it until FEAT-068 is groomed. (2) **`ldap.js`** — decide whether LDAP is a wanted capability
  (`exprsn-crm` had LDAP sync) before deleting 12 working endpoints; if wanted, it is a FEAT, not a
  delete. `sso.js` is plausibly superseded by the live `saml.js` + `oauth2.js` + `oidc.js` — confirm
  before deleting. Distinct from **TASK-020** (dead rbac *middleware*).

---


### TASK-034 — Live stream-chat block enforcement (socket topology) *(architect)*
- **Type:** task · **Status:** backlog · **Priority:** P2 · **Size:** M
- **Owner-role:** systems-architect + sr-developer · **Relates:** FEAT-011
- **Description:** Per the FEAT-011 ADR (L1): live stream chat uses `io.to(streamId).emit(...)` — a room broadcast that
  cannot be per-recipient filtered, so block/mute cannot suppress a blocked user's chat as-written. Requires a
  socket-topology change (per-socket emit / server-side filtered fan-out). Architect call on the approach.
- **Acceptance criteria:** a viewer does not receive live-chat messages from a user they block/mute; broadcast latency
  is not materially regressed.

### TASK-035 — Extract Follow + user_relationships into a `social` module *(deferred)*
- **Type:** task · **Status:** deferred · **Priority:** P3 · **Size:** L
- **Owner-role:** systems-architect · **Relates:** FEAT-011
- **Description:** The social graph (`Follow`, `List`, `user_relationships`) lives in timeline. Per the FEAT-011 ADR,
  extraction to a dedicated `social` module is correct only once a THIRD module must enforce the graph directly.
  **Revisit trigger:** a third enforcing module beyond timeline + spark.

### TASK-036 — Redis blocklist cache behind the relationshipService façade *(deferred, dba)*
- **Type:** task · **Status:** deferred · **Priority:** P3 · **Size:** M
- **Owner-role:** dba · **Relates:** FEAT-011
- **Description:** Per the FEAT-011 ADR (Option c): a Redis blocklist cache in front of `getSuppressedIds` is a pure
  optimization behind the façade (zero consumer churn). **Revisit trigger:** per-message spark socket enforcement, or a
  feed p95 regression > +10ms. DBA owns key shape, TTL, and the block/unblock/mute invalidation protocol.

### TASK-037 — Make the cortex moderatorScreen fail-open warn observable
- **Type:** task · **Status:** backlog · **Priority:** P3 · **Size:** S
- **Owner-role:** sr-developer · **Relates:** BUG-015, FEAT-021/023
- **Description:** `moderatorScreen` fails open on any moderator error (returns null + a single warn line). BUG-015
  showed a 100%-failing screen was indistinguishable from a working one for weeks. Count/meter the fail-open path (or
  raise its log level with context) so a future silent CORTEX_MODERATE regression surfaces.

### TASK-038 — Harden the TASK-021 python sandbox (residual notes)
- **Type:** task · **Status:** backlog · **Priority:** P3 · **Size:** S
- **Owner-role:** sr-developer · **Relates:** TASK-021
- **Description:** Residual hardening from the TASK-021 escape review (none are escapes): (1) `ulimit -f` uses
  1024-byte units on macOS but the wrapper assumes 512, so the file-size cap is ~2x the configured MB (still bounded) —
  fix the unit; (2) narrow the seatbelt read allowlist from the whole python prefix to `<prefix>/lib`; (3) for a
  Linux/CI production worker, use a container/VM (gVisor/Firecracker) — sandbox-exec is macOS-only + deprecated.

### TASK-039 — Ollama Docker container (loopback-only), model provisioning + firewall + systemd unit
- **Type:** task · **Status:** ready · **Priority:** P2 · **Size:** S/M
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** relates to R4 (TLS/edge posture) · supports FEAT-072
- **Description:** Per **ADR-0005 §7.1 / Required-change 9** (`docs/adr/0005-cortex-backend-failover-and-video-moderation.md`).
  Add the Ollama vision backend as a Docker container in `docker-compose.prod.yml`, bound to **loopback
  only** — `ports: ["127.0.0.1:${OLLAMA_PORT:-11434}:11434"]`, with `OLLAMA_HOST=0.0.0.0` **inside the
  container only**. **Never** a bare `11434:11434`: Docker writes `DOCKER-USER` iptables rules evaluated
  *ahead of* ufw, so a published port is internet-reachable even when ufw denies it, and Ollama has **no
  auth** (an exposed 11434 is a free, unauthenticated LLM + prompt-injection/exfil pivot). Pull the vision
  model **at provision time** (not lazily in a job — ADR §1: `/api/pull` inside a bounded job is how one slow
  job becomes a stuck queue); default `CORTEX_OLLAMA_AUTO_PULL=false`. Set the load-bearing container env:
  `OLLAMA_NUM_PARALLEL=1`, `OLLAMA_MAX_LOADED_MODELS=1`, `OLLAMA_KEEP_ALIVE` short (default `5m`),
  `OLLAMA_NUM_THREAD=2` (of 4 vCPU) per ADR §4.5/§8.1. Add the container + its loopback binding to
  `docs/runbooks/digitalocean-ubuntu.md` (§5 firewall note) and wire `CORTEX_OLLAMA_BASE_URL=http://127.0.0.1:11434`.
- **Acceptance criteria:**
  - Ollama runs from `docker-compose.prod.yml` published on `127.0.0.1:11434` **only**; no bare
    `11434:11434` anywhere; VERIFY confirms the port is not reachable off-host.
  - `OLLAMA_NUM_PARALLEL=1` and `OLLAMA_MAX_LOADED_MODELS=1` are set (a second concurrent request queues
    behind the first rather than loading a second copy of the model); `OLLAMA_KEEP_ALIVE` and
    `OLLAMA_NUM_THREAD` set per ADR §8.1.
  - The vision model is pulled at provision (a documented provision step / preflight), not inside a job;
    `CORTEX_OLLAMA_AUTO_PULL` defaults `false`; a missing model surfaces as `VISION_UNAVAILABLE`, not a
    self-heal.
  - `docs/runbooks/digitalocean-ubuntu.md` documents the container, the loopback binding, the firewall
    posture, and the model-pull step; `.env.example` gains `OLLAMA_PORT` / `CORTEX_OLLAMA_BASE_URL` /
    `CORTEX_OLLAMA_VISION_MODEL`.
  - The Ollama vision tag is **verified against the live daemon** (`ollama list`) before it is pinned in
    config (ADR §1 finding 3 — `qwen3.5:*` may not be a real registry tag).
- **Notes:** Infra/deploy — **dba/architect co-sign** on the compose + firewall posture (this is the ADR §7
  security invariant: loopback-only, never public). **systems-architect** owns the §8.1 model-size / thread
  choices. Cross-link: **ADR-0005** (`docs/adr/0005-cortex-backend-failover-and-video-moderation.md`) §7.1,
  §4.5, §8.1, Required-change 9. Supports FEAT-072 (the Ollama driver has nothing to talk to without this).
  Route to sr-developer (deploy-sensitive).

### TASK-040 — Streaming file retrieval in FileVault storage (`retrieveToFile` / streaming accessor)
- **Type:** task · **Status:** ready · **Priority:** P2 · **Size:** S/M
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** hard prereq of FEAT-073 · relates to FEAT-031 (FileVault chokepoint)
- **Description:** Per **ADR-0005 §4 finding 5 / Required-change 6** (`docs/adr/0005-cortex-backend-failover-and-video-moderation.md`).
  `services/filevault/src/storage/backends/disk.js` `retrieve()` is `fs.readFile()` — it returns a whole
  Buffer. That is fine for a 2 MB JPEG and **fatal for video** on an 8 GB box: a 1.5 GB recording read into
  a Buffer, in a Node process that also holds Sequelize + Bull, is an OOM with the moderation worker's name
  on it. Add a streaming `retrieveToFile()` (or a streaming accessor) to the FileVault storage backend(s) so
  the video moderation lane resolves bytes to a local path without ever materializing the whole file in
  memory. The video lane must **never** call `retrieve()` on a video.
- **Acceptance criteria:**
  - The FileVault storage backend interface gains `retrieveToFile()` (or an equivalent streaming accessor)
    implemented for the disk backend (and any other configured backend), writing bytes to a caller-supplied
    local path via a stream, never a whole-file Buffer.
  - A test confirms a large file is retrieved to a path without loading it entirely into memory (e.g.
    asserts streaming semantics / bounded memory, or that `fs.readFile` is not on the path).
  - The existing Buffer-returning `retrieve()` is unchanged for its current small-object callers (no
    regression).
- **Notes:** Data/storage — the accessor is storage-layer plumbing (loop **dba/architect** if the backend
  interface contract changes for other consumers). **systems-architect** flagged this as the OOM guard the
  video lane depends on. Cross-link: **ADR-0005** (`docs/adr/0005-cortex-backend-failover-and-video-moderation.md`)
  §4 finding 5, Required-change 6. **Hard prereq of FEAT-073** (and FEAT-074). Route to sr-developer (S/M).

### TASK-041 — `worker:live` writes recording completion signal (path, size, duration, `status: 'ready'`) + enqueues moderation
- **Type:** task · **Status:** done · **Priority:** P3 · **Size:** M
- **Owner-role:** unassigned · **Blocked-by:** BUG-032
- **Legacy:** the enqueue trigger FEAT-074 needs · relates to TASK-015 (persist live video to FileVault)
- **Description:** Per **ADR-0005 §8.3 / Required-change 11** (`docs/adr/0005-cortex-backend-failover-and-video-moderation.md`).
  Today `worker:live` muxes the recording file to `outputPath` and exits — it **never writes anything back**:
  no path, no size, no duration, no terminal status. Make the worker persist a recording-completion signal:
  write `outputPath` (storage path), `file_size_bytes`, `duration_seconds`, and `status: 'ready'` back onto
  the `Recording` row, and enqueue the video-moderation job. This is the "recording finalized, bytes at path
  X" event FEAT-074's enqueue hook has nothing to attach to today. **Depends on BUG-032** — the model/service
  must agree on attribute names, the NOT-NULL `user_id`, and the status enum before a completion write can
  succeed.
- **Acceptance criteria:**
  - On successful mux, `worker:live` updates the `Recording` row with the storage path, `file_size_bytes`,
    `duration_seconds`, and `status: 'ready'` (all valid model attributes / enum values per BUG-032).
  - A failed mux writes `status: 'failed'` (not swallowed) with an error surfaced (correlation id logged).
  - On `status: 'ready'`, the worker enqueues the `video-moderation` job for the recording (source `live`),
    carrying the recording id and content hash — the FEAT-074 enqueue trigger.
  - A test asserts a completed recording ends `status: 'ready'` with a non-null path/size/duration and that
    the moderation job is enqueued.
- **Notes:** Data/queue — **dba co-sign** (the completion write + the `video-moderation` enqueue interact
  with the queue config in FEAT-073). **systems-architect** sequenced this after BUG-032 (ADR §8.3).
  Cross-link: **ADR-0005** (`docs/adr/0005-cortex-backend-failover-and-video-moderation.md`) §8.3,
  Required-change 11. **Blocked-by BUG-032**; itself blocks FEAT-074. Route to sr-developer (M).

### TASK-042 — Per-backend / per-model risk-threshold calibration for the moderation secondary (blocking gate on enforce)
- **Type:** task · **Status:** backlog · **Priority:** P2 · **Size:** M
- **Owner-role:** unassigned *(qa-specialist hint)* · **Blocked-by:** FEAT-072
- **Legacy:** relates to TASK-023 (labeled corpus / recall gate), TASK-026 (shadow rung)
- **Description:** Per **ADR-0005 §8.2 / Required-change 10** (`docs/adr/0005-cortex-backend-failover-and-video-moderation.md`).
  `FILEVAULT_IMAGE_RISK_THRESHOLD` (default 70) is a single number applied to whichever model answered. The
  llama.cpp primary (`qwen2.5-vl-3b`) and the Ollama secondary (a Qwen-VL) are **different models with
  different score distributions**, so a threshold calibrated on the primary is miscalibrated on the
  secondary — and the secondary is exactly what serves traffic during every primary outage. Calibrate the
  secondary backend's scores against the same benchmark set (reuse TASK-023's labeled corpus) and set
  per-backend thresholds. **This is a blocking gate on enforce mode for the secondary backend**: until the
  secondary is calibrated, it may run in **shadow** only — failing over from a calibrated model to an
  uncalibrated one in enforce is worse than failing closed to a human.
- **Acceptance criteria:**
  - Per-backend thresholds are resolvable: `FILEVAULT_IMAGE_RISK_THRESHOLD` / `..._RISK_THRESHOLD_OLLAMA`
    (and the video equivalents), falling back to the base value when unset.
  - Every verdict row records `backend` **and** `model` (mandatory, surfaced in the side tables).
  - The secondary backend's score distribution is measured against TASK-023's benchmark set and a calibrated
    Ollama threshold is produced (with the recall/precision evidence).
  - Enforce mode for the secondary backend is **gated**: documented and enforced that the secondary runs in
    `shadow` until calibration is signed off.
- **Notes:** **qa-specialist owns** this (owner-role hint per ADR §Deciders / Ownership handoffs) — it is a
  calibration/benchmark task, not product code. **Blocking gate on enforce for the secondary** (ADR §8.2).
  **Blocked-by FEAT-072** (needs the two-backend path + per-backend `verdict.backend`/`model`). Cross-link:
  **ADR-0005** (`docs/adr/0005-cortex-backend-failover-and-video-moderation.md`) §8.2, Required-change 10;
  reuses TASK-023's corpus.

### TASK-043 — Audio-track moderation gap for video / recordings (whisper transcription → text lane)
- **Type:** task · **Status:** backlog · **Priority:** P3 · **Size:** M
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** named gap · relates to FEAT-073 / FEAT-074
- **Description:** Per **ADR-0005 §4.3 / §6 / Consequence 6** (`docs/adr/0005-cortex-backend-failover-and-video-moderation.md`).
  The video/recording moderation lane samples **visual frames only** — audio is not analysed at all, so a
  recording with benign visuals and hateful audio passes clean. Close the named gap: transcribe the audio
  track (e.g. whisper) and route the transcript through the **existing text moderation lane**. Filed as a
  deliberate follow-up so the gap is named, not silent.
- **Acceptance criteria:**
  - Video/recording moderation extracts the audio track, transcribes it, and submits the transcript to the
    existing text `moderateContent` lane; the resulting text verdict is combined with the visual verdict.
  - A recording with clean visuals but policy-violating audio is flagged.
  - The audio lane fails soft/closed consistently with the ADR's split (documented) and does not block the
    visual verdict on transcription failure.
- **Notes:** Named gap, not a silent one (ADR §4.3 "audio is not analysed at all"). Sequenced **after**
  FEAT-073/FEAT-074 (it augments the video lane they build). Cross-link: **ADR-0005**
  (`docs/adr/0005-cortex-backend-failover-and-video-moderation.md`) §4.3, §6, Consequence 6. Loop
  **systems-architect** on where the transcription worker sits + **cost/benefit** if whisper adds real infra
  cost. Route to sr-developer (M).

### TASK-044 — Authorized recording-playback route + visibility gate (A1 invariant)
- **Type:** task · **Status:** backlog · **Priority:** P3 · **Size:** M
- **Owner-role:** unassigned · **Blocked-by:** FEAT-074
- **Legacy:** implements ADR-0005 invariant A1/A2 · new `API_SURFACE.md` entry
- **Description:** Per **ADR-0005 §5 (A1/A2) / §7.2 / Required-change 12** (`docs/adr/0005-cortex-backend-failover-and-video-moderation.md`).
  Recordings have **no serving path yet** — no nginx `alias`/`root`, no download route; `GET
  /live/api/rooms/:id/recordings` returns rows, not bytes (ADR §8 finding 8 — "a gift"). Build the authorized
  playback/status route **with** the fail-closed visibility gate from day one: `requireUser`-gated,
  enforcing `canServe(recording, moderation, requesterId)` (invariant **A1** — not servable to anyone but the
  owner until moderation resolves, under `LIVE_RECORDING_MODERATION`). Invariant **A2** is absolute:
  recording bytes are served **only** through this route — **no static nginx/SRS exposure** of the recording
  directory, ever, or every moderation gate in this lane is theatre.
- **Acceptance criteria:**
  - A new `requireUser`-gated module route serves recording bytes and moderation status; it is documented in
    `API_SURFACE.md`.
  - The route enforces `canServe(recording, moderation, requesterId)` (A1): a non-owner cannot fetch bytes
    while moderation is `pending`/held under `LIVE_RECORDING_MODERATION=enforce`; the owner can.
  - VERIFY confirms **no static nginx/SRS exposure** of the recording directory (A2) — the nginx/SRS config
    is inspected and has no `alias`/`root`/static handler over the recording path.
  - The `precomputedResult` field cannot be forged over this route boundary (stripped by
    `sanitizeModerationInput()`, ADR §7.2).
- **Notes:** Security-sensitive route work — **systems-architect** owns the A1/A2 invariants and the
  route-boundary posture (ADR §5, §7.2). This is the playback surface FEAT-074's visibility gate needs.
  **Blocked-by FEAT-074** (the moderation state it gates on must exist first). Cross-link: **ADR-0005**
  (`docs/adr/0005-cortex-backend-failover-and-video-moderation.md`) §5 (A1/A2), §7.2/§7.3, §8 finding 8,
  Required-change 12. Route to sr-developer (M, security review).

### TASK-046 — SPA landmarks: add a skip link, a per-page `<h1>`, and `aria-current` on active nav
- **Type:** task · **Status:** done — QA-VERIFIED 2026-07-27 (branch `s2609-sr` HEAD `a3ab48c`, merge-ready; not yet on `main`) · **Priority:** P2 · **Size:** S
- **Owner-role:** jr-developer (rec.) · **Blocked-by:** —
- **Sprint:** Committed to Sprint 2026-09 (2026-07-27).
- **Legacy:** — (2026-07-20 WCAG 2.4.1 / 1.3.1 / 4.1.2 review)
- **Description:** Three systemic navigation/structure gaps from the accessibility pass:
  (1) **No skip link** — `RootLayout.tsx` renders ~16 sidebar links + header controls
  before `<main>` (`:170`) with no bypass (WCAG 2.4.1, A). (2) **No `<h1>` on
  authenticated pages** — the only native `<h1>` is on `auth/LoginPage.tsx:139`; every
  authed page derives its title from `SectionHeader` (`features/admin/ui.tsx:92`) as
  `Typography variant="h5"`, so the outline jumps to level 5 (1.3.1/2.4.6). (3) **No
  `aria-current`** — active route is marked by CSS class only (`RootLayout.tsx:148-155`;
  zero `aria-current` in the codebase), so the current page isn't exposed to AT (4.1.2).
- **Acceptance criteria:**
  - A visible-on-focus "skip to content" link targets `<main>`.
  - Each page renders exactly one `<h1>` for its title (SectionHeader emits h1 at the
    top level); heading order no longer skips levels.
  - The active nav item carries `aria-current="page"`.
- **Notes:** Shared-component fix, propagates platform-wide. jr-developer.
- **Resolution (done · 2026-07-27 · commits `941ec8e` + `f98ca5d`, branch `s2609-sr`):**
  Skip link (first-focusable, visible on focus) targeting `#main-content`
  (`tabIndex={-1}`); `SectionHeader` emits `<h1>` via a `level` prop (20 tab/detail
  usages at `level={2}`); sr review extended the h1 fix to all ~23 non-admin routed
  pages — every routed page now renders exactly one `<h1>`; sidebar nav switched to
  `NavLink` → `aria-current="page"`. AdminLayout's separate shell excluded per scope —
  filed as **BUG-047**.

### TASK-047 — Raise Spark E2EE PBKDF2 iterations to ≥600k with a versioned wrap-blob migration
- **Type:** task · **Status:** backlog · **Priority:** P3 · **Size:** S
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** — (2026-07-20 Web Cryptography review, LOW-2)
- **Description:** `web/src/lib/crypto.ts:20` sets `PBKDF2_ITERATIONS = 100_000`
  (SHA-256) to derive the AES-GCM key that wraps the exported private key before it is
  stored server-side. Spec-conformant, but below current OWASP guidance (≥600,000 for
  PBKDF2-HMAC-SHA-256) — and it guards an offline-attackable `encryptedPrivateKey` blob.
  The wrap-blob already carries `v:1` (`:128`), so it is versioned for a clean bump.
- **Acceptance criteria:**
  - Iteration count raised to ≥600k (or a memory-hard KDF, e.g. argon2-wasm, evaluated)
    behind a new wrap-blob version; `v:1` blobs still decrypt (lazy re-wrap on unlock).
  - No regression to the "fresh content key per message" invariant.
- **Notes:** Client-only change; coordinate with BUG-045 (server legacy path). Add a
  code comment asserting the single-use-key invariant behind the random-IV safety.

### TASK-048 — Non-blocking authoring accessibility warnings (missing alt / missing field label) — ATAG B.3 slice 1
- **Type:** task · **Status:** done — QA-VERIFIED 2026-07-27 (branch `s2609-sr` HEAD `a3ab48c`, merge-ready; not yet on `main`) · **Priority:** P3 · **Size:** M
- **Owner-role:** unassigned · **Blocked-by:** BUG-040, BUG-041
- **Sprint:** Sprint 2026-09 **stretch** (2026-07-27) — pull only if the sr track drains early; still blocked-by BUG-040 + BUG-041.
- **Legacy:** — (2026-07-20 ATAG 2.0 B.3 review)
- **Description:** A full-tree grep for `accessib|a11y|wcag|alt.?text` over
  `web/src/features` returns **no** accessibility-checking code of any kind — ATAG B.3
  (check + repair assistance) is entirely unmet. The cheapest meaningful slice is a
  non-blocking authoring warning: flag an image inserted with no alt text and a form
  field saved with no label, at author time. Depends on BUG-040/BUG-041 landing the
  underlying alt/label affordances first.
- **Acceptance criteria:**
  - Composer/annotator show a dismissible, non-blocking warning when an image has no
    alt text (B.3.1.1).
  - The lowcode entity/form editor warns when a field has no label before save.
  - Warnings are advisory (do not hard-block publish) and point at the offending item.
- **Notes:** First step toward ATAG Part B; broader checker/repair is a later FEAT if
  warranted. sr-developer.
- **Resolution (done · 2026-07-27 · commit `a3ab48c`, branch `s2609-sr`):** Dismissible,
  non-blocking no-alt warnings (naming the offending files, plus per-field warning
  helpers) in the timeline and spark composers; `EntityEditor` pre-save empty-label
  helper ahead of the BUG-041 save-time fallback. ImageAnnotator skipped — no alt
  affordance exists there (documented, no new plumbing per ticket). Never blocks
  post/send/save.

### TASK-049 — Accessibility measurement pass: computed color-contrast (light+dark) + target-size (2.5.8)
- **Type:** task · **Status:** done — measured 2026-07-27; findings filed as BUG-048…BUG-053 · **Priority:** P3 · **Size:** M
- **Owner-role:** qa-specialist (rec., + jr) · **Blocked-by:** —
- **Sprint:** Committed to Sprint 2026-09 (2026-07-27).
- **Legacy:** — (2026-07-20 WCAG 1.4.3/1.4.11/2.5.8 — not-assessed items)
- **Description:** The accessibility review did not measure two computed-value criteria
  and flagged them for a dedicated pass: (1) **Color contrast** (1.4.3 text / 1.4.11
  non-text, AA) across both `data-theme` modes — `--exprsn-text-muted` on tinted
  chip/badge backgrounds, outlined chips, and disabled states are the suspect areas.
  (2) **Target size** (2.5.8, AA) — MUI `size="small"` IconButtons and the `DataTable`
  dense toolbar (`ui.tsx:358`) are candidates for sub-24×24 targets.
- **Acceptance criteria:**
  - Contrast ratios measured for representative text/non-text tokens in light and dark;
    failures (< 4.5:1 text / 3:1 non-text) listed with the token and remedy.
  - Interactive targets audited against the 24×24 minimum; sub-minimum targets listed.
  - Findings filed as concrete follow-up BUG tickets (this task is the measurement).
- **Notes:** Measurement/triage task; fixes become their own tickets. qa-specialist +
  jr-developer.
- **Resolution (done · 2026-07-27):** Contrast matrix (both themes, alpha-composited)
  + target-size audit complete — methodology, full pairing tables, and the rerunnable
  script are archived at `sprints/archive/sprint-2026-09-task-049-findings.md`. 10 live
  contrast failure clusters + 1 outright target-size failure → filed as
  **BUG-048…BUG-053**. Cleared suspects recorded as passing: MUI Alert text, muted on
  primary/secondary surfaces, focus ring, disabled states, all 169 small IconButtons
  (≥30×30), dense DataTable toolbar.

### TASK-050 — `/live` WebRTC: add a TURN server for symmetric-NAT / strict-firewall traversal
- **Type:** task · **Status:** backlog · **Priority:** P3 · **Size:** S
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** — (2026-07-20 WebRTC review, interop reliability; complements BUG-046)
- **Description:** `web/src/features/rooms/useWebRtcRoom.ts:21-23` configures only a
  public STUN server (`stun:stun.l.google.com:19302`) and **no TURN**. Peers behind
  symmetric NAT or restrictive firewalls will fail to establish a connection with no
  relay fallback. This is infrastructure (not a W3C-API conformance issue) but is
  required for real-world room reliability alongside BUG-046.
- **Acceptance criteria:**
  - A TURN server (e.g. coturn) is provisioned and its credentials are delivered to the
    client `RTCConfiguration.iceServers` (short-lived/ephemeral credentials preferred).
  - Rooms connect for peers where direct/STUN paths fail (verified behind a symmetric
    NAT or with host-candidate filtering).
- **Notes:** Infra + a small client-config change; secret handling via the managed
  secret store (see TASK-003). sr-developer + ops.

### TASK-051 — Resolve the duplicate `TASK-039` ID collision (two different tickets share it)
- **Type:** task · **Status:** backlog · **Priority:** P3 · **Size:** S
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** — (convention precedent: BUG-035 "renumbered from BUG-032 … collided on main")
- **Description:** `BACKLOG.md` currently has **two** tickets numbered `TASK-039`, which
  breaks the "monotonic per type, never reused" ID rule (`sprints/README.md`): (a)
  **"Admin interface refactor … (parent)"** — status `done`, merged to `main` at
  `fe58d2c` — the original; and (b) **"Ollama Docker container (loopback-only) …"** —
  status `ready`, supports FEAT-072 — the later collider. IDs collide because the two
  were filed in separate sessions. A grep confirms **no other file (`active/`,
  `archive/`) and no ticket body cross-references `TASK-039`**, so a renumber is
  self-contained.
- **Acceptance criteria:**
  - The **done/merged** admin-refactor ticket **keeps `TASK-039`** (its acceptance note
    already cites the merged commit — renaming it would orphan that history reference).
  - The **Ollama** ticket is renumbered `TASK-039 → TASK-052` (next free id), with a
    one-line renumber note on it (e.g. "renumbered from TASK-039: collided with the
    admin-refactor parent") per the BUG-035 precedent.
  - A repo-wide grep for `TASK-039` returns exactly **one** ticket heading afterward;
    any references to the Ollama work (e.g. from FEAT-072 / ADR-0005) are updated to
    `TASK-052`.
- **Notes:** Pure bookkeeping, no code. Do it in the shared checkout is fine (doc-only,
  no build). product-manager or jr-developer. Reserve `TASK-052` for the renamed Ollama
  ticket so this fix doesn't itself create a new collision.

### TASK-053 — External user-supplied image URLs are blocked by the strict SPA CSP (`img-src 'self'`)
- **Type:** task · **Status:** done — QA-VERIFIED, merged + deployed 2026-07-27 (merge `619ed02`) · **Priority:** P2 · **Size:** M
- **Owner-role:** sr-developer · **Blocked-by:** —
- **Sprint:** Committed to Sprint 2026-10 (2026-07-27).
- **DECISION (Rick, 2026-07-27):** option **(a)** — FileVault-hosted uploads; no image
  proxy.
- **Resolution notes (2026-07-27, branch s2610):** New
  `web/src/components/ImageUploadField.tsx`: uploads via `filevaultApi.upload`, mints a
  non-expiring read-only file-scoped CA access token
  (`POST /filevault/api/share/files/:id/access-token`), and stores the resulting
  SAME-ORIGIN absolute URL (`/filevault/api/share/file/:id/download?token=…`) in the
  existing URL field — passes nexus's `Joi.string().uri()` and the CSP's
  `img-src 'self'`; auth's `avatarUrl` has no format validator. Wired into
  ProfileForm (avatar) and Create/EditGroupDialog (group avatar + cover via new
  `avatarUrl`/`bannerUrl` inputs on Create/UpdateGroupInput; nexus create+update Joi
  schemas already accept both). Existing EXTERNAL values render the required
  "external image URLs won't render" notice; the plain-URL escape hatch validates
  same-origin only; Remove clears (null on group update). Preview shown for
  same-origin values (round avatar / cover strip). NOTE: `Content-Disposition:
  attachment` on the download route does not affect `<img>` rendering.
  OUT OF SCOPE (this slice): markdown image links in FEAT-075 comments — still
  CSP-blocked for external origins; file separately if a deliberate path is wanted.
  QA path: Account → Profile → upload avatar → save → avatar renders in AppBar/People;
  Groups → New/Edit group → upload avatar/cover → GroupDetailPage avatar renders;
  paste an external URL via the escape hatch → blocked with explanation.
- **Legacy:** — (BUG-038 systems-architect sign-off, required follow-up, 2026-07-27)
- **Description:** BUG-038's edge CSP (`img-src 'self' blob: data:`) deliberately blocks
  external image origins — but the SPA still lets users enter external image URLs:
  profile avatar (`web/src/features/account/ProfileForm.tsx`), group avatar/cover
  (`CreateGroupDialog.tsx` / `EditGroupDialog.tsx`), and markdown image links in
  FEAT-075 comments. Existing data holding external avatar URLs now renders broken
  images. The architect endorses the block itself (image-beacon/privacy win, consistent
  with the in-house posture) but requires a deliberate path rather than an accidental
  regression.
- **Acceptance criteria:**
  - Either (a) avatar/cover image fields migrate to uploaded, FileVault-hosted images,
    or (b) a same-origin image proxy is added — decision recorded on this ticket.
  - Until the fix lands, the affected forms state that external image URLs won't
    render.
- **Notes:** Cross-linked from BUG-038's resolution. Related note-level follow-ups from
  the same sign-off: HSTS `includeSubDomains` revisit at production-TLS time (fold into
  the R-track TLS ticket), self-hosted STUN/TURN (fold into TASK-050),
  `frame-ancestors` revisit only if lowcode form embedding ever becomes a FEAT.

### TASK-054 — FileVault: persist prior image verdict before re-moderation overwrite (verdict history)
- **Type:** task · **Status:** backlog · **Priority:** P3 · **Size:** S
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** — (split from BUG-016's residual at the 2026-07-27 in-review closeout; relates BUG-018, BUG-021)
- **Description:** `imageModerationService.evaluate()` overwrites `verdict`/`provider`/
  `model`/`riskScore` in place on re-run (~:244–247), so a prior clean verdict is lost
  locally (flagged verdicts are already persisted to moderator by the escalate hook —
  no audit loss today). If a full local verdict history is wanted, persist the prior
  verdict (e.g. append to a JSONB history column or a child table) before the
  overwrite.
- **Acceptance criteria:**
  - Prior verdict retained locally across a re-moderation (shape chosen with a dba
    glance — JSONB history vs child table).
  - Include the deferred `USING GIN (ai_tags)` index in whichever ticket first
    introduces tag filtering (carried note from BUG-016).
- **Notes:** dba review for the storage shape. jr-developer.

### TASK-055 — FileVault: revoke the minted capability token when an avatar/cover is replaced or removed
- **Type:** task · **Status:** backlog · **Priority:** P3 · **Size:** S
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** — (QA follow-up from TASK-053 verification, 2026-07-27)
- **Description:** TASK-053's `ImageUploadField` mints a non-expiring read-only
  file-scoped access token and embeds it in the stored avatar/cover URL. Remove/replace
  clears the URL field but never revokes the minted token — anyone who captured the old
  URL retains permanent read access to the old file.
- **Acceptance criteria:**
  - Replacing or removing an avatar/cover revokes the previously minted token (or the
    flow moves to expiring tokens re-minted on render).
  - Existing avatar/cover URLs keep working through the transition.
- **Notes:** Owner-provenance semantics (FEAT-061 Pass 1) make the durable grant
  acceptable today; this is hardening, not a security defect. jr-developer.

### TASK-056 — FileVault: clamp `file-access` token minting to read-only server-side (pre-existing)
- **Type:** task · **Status:** backlog · **Priority:** P3 · **Size:** S
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** — (QA finding during TASK-053 verification, 2026-07-27 — pre-existing, not introduced by Sprint 2026-10)
- **Description:** `shareService.createFileAccessToken` spreads `options.permissions`
  over the read-only default, so an owner can mint a persistent `write:true`/
  `delete:true` capability token via `POST /filevault/api/share/files/:id/access-token`.
  No current route consumes token-based write (only download exists), but it is a
  latent widening.
- **Acceptance criteria:**
  - Server clamps `shareType:'file-access'` mints to `{read:true, write:false,
    delete:false}` regardless of the request body; regression test added.
- **Notes:** jr-developer; quick fail-closed clamp.

## Spikes

File time-boxed research here (e.g. spinning `TASK-007` load findings into a
scaling investigation) as `SPIKE-002`, `SPIKE-003`, … when a question needs
bounded exploration before it can be a task.

### SPIKE-001 — Architect review: should moderator's 6 unauthenticated REST routers be gated? (module surface / isolation)
- **Type:** spike · **Status:** done · **Priority:** P2 · **Size:** S
- **Closed:** done 2026-07-27 — resolved by `sprints/moderation-routing-plan.md` Item A, which shipped as the completed BUG-010 (6 moderator REST routers auth-gated).
- **Owner-role:** unassigned · **Blocked-by:** — *(routed to systems-architect for review)*
- **Legacy:** SP-11 security theme (unauthenticated read/write surface); API_SURFACE.md L30
- **Description:** On branch `feature/lowcode-gap-closure`, moderator's `moderation` /
  `review` / `reports` / `metrics` / `actions` / `appeals` routers
  (`services/moderator/routes/*.js`) have **no** auth middleware at all — no
  `router.use(requireAdmin)`, no bearer check (confirmed by grep) — unlike their siblings
  `rules`/`agents`/`wordlists`/`queues`/`workflows`, which now carry `requireAdmin`. They
  expose moderation state — reports, metrics, moderation **actions**, and user **appeals**
  — to unauthenticated callers. Whether (and how) these should be gated is a
  module-contract / per-schema-isolation question for the **systems-architect**, not a doc
  edit — so this is a time-boxed review, not a pre-decided fix.
- **Acceptance criteria (spike output):**
  - A written recommendation, **per router** (`moderation`/`review`/`reports`/`metrics`/
    `actions`/`appeals`), on the intended posture: public / bearer-authenticated /
    `requireAdmin` / service-HMAC — grounded in the module contract + isolation invariants
    and how each router is actually consumed (SPA vs. service vs. public).
  - An explicit call on whether any router (e.g. the `actions`/`appeals` **write** paths)
    is a **P0/P1** unauthenticated-mutation risk that should jump the queue, vs. read-only
    info-disclosure (P2).
  - A follow-up implementation ticket (BUG/TASK) filed **per the architect's decision**,
    with the gating approach specified. This spike itself changes **no** code.
- **Notes:** SPIKE (time-boxed research/decision) routed to **systems-architect**. **P2**
  — a pre-public security-surface question in the SP-11 theme (peers `BUG-001`…`BUG-005`
  are P2), and it may surface a higher-priority fix (hence the P0/P1 triage in the AC).
  Do **not** auto-file a fix — the point is the architect decides *whether/how* to gate.
  `TASK-017` (doc drift) narrows the API_SURFACE moderator line and should reflect this
  spike's outcome once decided.
- **Outcome (2026-07-07):** architect decision recorded in `sprints/moderation-routing-plan.md`
  (Item A) — all six routers must be gated per a per-endpoint table across `requireAdmin` /
  new `requireUser` / new `requireService` surfaces, with the four unauthenticated-mutation
  paths flagged **P1**. Follow-up implementation ticket **BUG-010** (this spike's AC deliverable)
  filed and groomed to `ready`.

### SPIKE-004 — Decide: pursue strict W3C DID/CID conformance, or stay AT-Proto-aligned?
- **Type:** spike · **Status:** backlog · **Priority:** P3 · **Size:** S
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** — (2026-07-20 W3C DID-Core / CID / DID-Resolution review)
- **Description:** The atproto identity layer is AT-Proto/Bluesky-first and faithfully
  mirrors Bluesky's DID/labeler conventions — which themselves diverge from current
  W3C CID v1.0 / DID 1.1 normatives. The review found several deliberate deviations
  (none a correctness bug — that's BUG-044): (a) `@context` uses the legacy
  `w3id.org/security/multikey/v1` rather than `www.w3.org/ns/cid/v1`
  (`didResolver.js:51-54`, `identityService.js:37-40`); (b) `type: 'Multikey'` on a
  secp256k1 key is outside CID's normative Multikey key registry; (c) the
  `#atproto_label` key has **no** `assertionMethod` verification relationship, which
  CID's exclusive-use principle expects for signing; (d) the XRPC
  `resolveDid` endpoint returns a bare DID document with **no** `didResolutionMetadata`
  / `didDocumentMetadata` and ad-hoc error strings rather than the normative
  resolution error codes (`xrpc/resolveDid.js:18-28`); (e) `did:exprsn` is an
  unregistered custom method with no published method spec. Each is correct for Bluesky
  interop. The question is whether general W3C interoperability is a product goal that
  justifies changing (or dual-emitting) these.
- **Acceptance criteria:**
  - A written recommendation (architect): pursue W3C conformance, stay AT-Proto-aligned,
    or dual-path — with the interop cost/benefit and any tickets it would spawn.
  - If "pursue": follow-up TASK/FEAT tickets filed for the specific deltas (context,
    `assertionMethod`, resolution-metadata wrapper, `did:exprsn` method-spec doc).
  - If "stay aligned": document the deliberate deviations so they aren't re-flagged.
- **Notes:** Decision/research only; BUG-044 (placeholder key) is the one item to fix
  regardless of this outcome. systems-architect.

---

## Deferred

Documented reason + revisit trigger for each. These stay out of active sprints
until their trigger fires.

### FEAT-002 — ES-richer Post schema + search-by-hashtag
- **Type:** feature · **Status:** deferred · **Priority:** P3 · **Size:** L
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** #4 note
- **Cost/Benefit:** pending *(deferred; assess when revisited)*
- **Reason:** Elasticsearch is disabled at MVP; the ES index/search code already
  assumes a richer Post schema (hashtags/mentions/engagement) than the minimal
  Bluesky-integrated model has, so `indexPost` no-ops.
- **Revisit trigger:** ES is enabled for a release, or search-by-hashtag /
  engagement search is prioritized.
- **Acceptance (when revisited):** Post schema extended for the index; hashtag
  search returns data when `ELASTICSEARCH_ENABLED`.

### FEAT-005 — Two-way CalDAV write (PUT/DELETE) (CalDAV/CardDAV Slice 3)
- **Type:** feature · **Status:** deferred · **Priority:** P3 · **Size:** L
- **Owner-role:** unassigned · **Blocked-by:** FEAT-003 + FEAT-004 (needs the read-only account + native auth first); TASK-004 (TLS)
- **Legacy:** FEAT-001 Slice 3 (parent epic) · see `sprints/assessments/FEAT-001.md`
- **Cost/Benefit:** done — covered by the FEAT-001 assessment: analyst recommends
  **defer / likely drop**. Needs an iCal **parser** (Nexus has only the write-only
  generator) + write mapping into Event/attendee/RSVP/recurrence rows. **CardDAV
  two-way is N/A** — "contacts" are derived group members, not user-writable cards, so
  a vCard `PUT` has nowhere to land (dropped from scope).
- **Reason:** Two-way write is the most expensive slice and delivers the least MVP
  value; read-only subscription already covers ~80% of the need, and CardDAV two-way
  is semantically N/A for this data model.
- **Revisit trigger:** real, demonstrated user demand for writing group calendar
  events back from a native client, *after* Slices 1–2 (FEAT-003/FEAT-004) ship
  post-staging — otherwise drop.
- **Acceptance (when revisited):** inbound `.ics` `PUT`/`DELETE` parsed and mapped to
  Event/attendee/RSVP/recurrence rows with deletion sync; CardDAV write stays out of
  scope.

### TASK-008 — Move spark's @socket.io/redis-adapter ownership to the gateway
- **Type:** task · **Status:** deferred · **Priority:** P2 · **Size:** M
- **Legacy:** #3
- **Reason:** The adapter only matters for socket fan-out across multiple gateway
  instances; MVP is a single gateway instance. Spark currently applies it to the
  gateway-owned root `io` in its `init()`.
- **Revisit trigger:** before any horizontal scale-out.

### TASK-009 — Replace inter-service HTTP hops with direct in-process calls
- **Type:** task · **Status:** deferred · **Priority:** P2 · **Size:** L
- **Legacy:** #6
- **Reason:** Modules are in-process but still call each other via
  `*_SERVICE_URL` loopback HTTP through the gateway. Works today; long-term
  direction is direct calls.
- **Revisit trigger:** post-MVP performance/simplification pass.

### TASK-010 — Timeline → spark/prefetch outbound service auth
- **Type:** task · **Status:** deferred · **Priority:** P2 · **Size:** M
- **Legacy:** #7
- **Reason:** The spark/prefetch HTTP clients in timeline are dormant scaffolding
  (0 call sites beyond `checkHealth`); no live 401 path. Two prerequisites before
  wiring them into post-create: spark's `/api/events/broadcast(-multi)` endpoints
  don't exist yet, and prefetch's `requireSelfOrAdmin('userId')` gate needs a
  service/admin bypass. (Timeline → moderator is already HMAC-authed.)
- **Revisit trigger:** when wiring timeline realtime/cache into the post-create
  flow.

### TASK-011 — Cosmetic cleanup batch
- **Type:** task · **Status:** deferred · **Priority:** P3 · **Size:** S
- **Legacy:** #10
- **Reason:** Harmless dead code: unused `ejs` deps in some `package.json`s, dead
  `shared/public/`, empty CA routers (`routes/{ca,certificates,tokens,users,
  groups,roles}.js`), and the 3 dead `rejectUnauthorized:false` in
  `services/ca/services/setup.js` (removed setup wizard).
- **Fold-in (2026-07-27):** also delete the 7 stale `TODO(platform)` socket-wiring
  markers — verified under STATUS `#3` — as part of this cosmetic batch (no new ticket
  opened per the Sprint 2026-09 plan's housekeeping tail).
- **Revisit trigger:** batch during a low-risk cleanup window.

### TASK-012 — Defensive migration↔schema `searchPath`
- **Type:** task · **Status:** deferred · **Priority:** P3 · **Size:** S
- **Legacy:** #1
- **Reason:** Verified clean today — every module's tables sit in their own
  schema; only PostGIS system tables are in `public`. A raw `createTable` with an
  **unqualified** name would land in `public`, so this is defensive for whoever
  next authors a raw migration (add `searchPath` + `prependSearchPath`; for the
  sequelize-cli `moderator`, also `migrationStorageTableSchema:'moderator'`).
- **Revisit trigger:** when a module gains a raw migration.
