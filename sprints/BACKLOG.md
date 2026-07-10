# Backlog — Exprsn Platform

The intake queue. Every unscheduled feature, bug, task, and spike is exactly one
entry here, filed with the fields from `templates/ticket.md`. Grouped by type.
Ids are monotonic per type and never reused. Legacy ids (`SP-N`, `R1`–`R6`, `#N`)
are cross-linked in parentheses.

Governance, lifecycle, and the Cost/Benefit gate: see `README.md`.

> **Gate reminder:** a `FEAT` cannot leave `backlog` until the
> cost-benefit-analyzer replaces its `Cost/Benefit: pending` line. The
> product-manager grooms `backlog → ready` and commits `ready` tickets into an
> active sprint. In-flight: `active/sprint-2026-07.md` (in-house/deploy-path slice)
> and `active/sprint-2026-08.md` (user-safety P1 moderation slice — BUG-010 + FEAT-010).

---

## Features

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
- **Type:** feature · **Status:** in-sprint → `active/sprint-2026-08.md` · **Priority:** P1 · **Size:** M
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
- **Type:** feature · **Status:** backlog · **Priority:** P1 · **Size:** L
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

### FEAT-016 — Image/video moderation productionization (unify vision path into live pipeline + video frame sampling) *(Tier 2)*
- **Type:** feature · **Status:** backlog · **Priority:** P2 · **Size:** L
- **Owner-role:** unassigned · **Blocked-by:** — *(sequence after FEAT-009 — the live pipeline it plugs into)*
- **Legacy:** moderation gap analysis Tier 2 · relates to FEAT-009 (central pipeline) + FEAT-008 (CSAM hashing)
- **Cost/Benefit:** pending
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
- **Type:** task · **Status:** blocked (needs a corpus decision from Rick) · **Priority:** P1 · **Size:** M
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

### TASK-024 — `db:check` is blind to nullability and FK `onDelete` (drift gate gap)
- **Type:** task · **Status:** backlog · **Priority:** P1 · **Size:** M
- **Owner-role:** dba · **Found:** DBA review of FEAT-031 (2026-07-10)
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
- **Type:** task · **Status:** backlog · **Priority:** P2 · **Size:** S
- **Owner-role:** sr-developer · **Relates:** FEAT-031 · **Found:** DBA review (2026-07-10)
- **Description:** The moderation job is enqueued after the upload transaction
  commits, deliberately and best-effort. If the process dies between commit and
  enqueue, or Redis is down at that moment, the row stays `pending` forever —
  permanently hidden, with no job that will ever clear it. This is **fail-closed
  (safe)**, but it is an ops/data-quality hole with no recovery sweep.
- **Acceptance criteria:** a periodic reconciler re-enqueues rows that are
  `pending` beyond N minutes with no waiting/active Bull job; it is idempotent and
  cannot resurrect a resolved verdict.

### BUG-016 — FileVault: `jobId: file:<id>` will silently no-op a future re-moderation
- **Type:** bug · **Status:** backlog · **Priority:** P3 · **Size:** S
- **Owner-role:** sr-developer · **Relates:** FEAT-031 · **Found:** DBA review (2026-07-10)
- **Description:** The queue dedups on `jobId: file:<id>`, which is correct for
  its purpose (collapsing duplicate enqueues of one upload). But Bull treats
  `add()` with an existing jobId as a no-op while that job's key survives in
  Redis — completed jobs are retained 1h, failed ones 24h. So the moment a
  "re-moderate this image" action exists (model upgrade, human overturn), it will
  do **nothing** for any file moderated in the last hour, with no error. Filed now
  so nobody loses an afternoon to it later.
- **Fix when re-moderation lands:** `queue.removeJobs('file:<id>')` before
  re-adding, or add a generation suffix (`file:<id>:<gen>`).
- **Also (from the same review):** `evaluate()`'s patch overwrites
  `verdict`/`provider`/`model`/`riskScore` in place, so a prior *clean* verdict is
  lost locally on re-run. The escalate hook already persists flagged verdicts to
  moderator; a re-moderation path must persist the prior verdict before overwrite.
- **Note:** `ai_tags` (`text[]`) has no GIN index. Deliberate — tag filtering is
  not a query that runs today. Add `USING GIN (ai_tags)` in the migration of
  whichever ticket introduces tag filtering.

### BUG-017 — FileVault group-file uploads bypass image moderation entirely (served unmoderated)
- **Type:** bug · **Status:** in-review — FIXED 2026-07-10 (`733c842`): `uploadGroupFile()` now creates the moderation row inside the upload transaction and enqueues after commit, identically to the personal-upload path.· **Priority:** P1 · **Size:** M
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
- **Type:** bug · **Status:** in-review — FIXED 2026-07-10 (`733c842`): `updateFile()` resets the row to `pending` (hidden) inside the transaction and re-queues via `requeueImageModeration()`, which removes the stale Bull job first (a plain re-add is a silent no-op — BUG-016).· **Priority:** P2 · **Size:** M
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
- **Type:** bug · **Status:** in-review — FIXED 2026-07-10 (`733c842`): `moderateContent()` accepts a `precomputedResult`, so the image's own scores (not its alt-text) drive rules, `requiresManualReview`, the review queue, and the audit trail. Regression test: alt-text "two people" + nsfw 96 → riskScore 93, requiresReview true. Text path untouched. **Wants systems-architect confirmation** that the precomputed-verdict seam satisfies ADR 0002 constraint 5.· **Priority:** P2 · **Size:** M
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
- **Type:** bug · **Status:** in-review — FIXED 2026-07-10 · **Priority:** P2 · **Size:** S
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

### BUG-020 — Share-link metadata endpoint discloses a held image's existence and filename
- **Type:** bug · **Status:** backlog · **Priority:** P3 · **Size:** S
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

### FEAT-023 — Cortex as an in-process LLM source for other modules (façade + moderator provider)
- **Type:** feature · **Status:** in-review · **Priority:** P1 · **Size:** M
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
- **Type:** feature · **Status:** in-review · **Priority:** P1 · **Size:** M
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
- **Type:** feature · **Status:** in-review — **shipped as swap-first, NOT co-resident** · **Priority:** P1 · **Size:** S (was M)
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
- **Type:** feature · **Status:** in-review — QA-found BUG-017/018/019 all FIXED 2026-07-10 (`733c842`); awaiting QA re-verification. Also fixed pre-merge: DBA-found FK cascade/NOT NULL (`1d58480`). Remaining before `done`: QA re-run, systems-architect confirmation of the `precomputedResult` seam (ADR 0002 constraint 5), and TASK-023 (recall corpus) before any verdict drives automation.
  Core user-upload path is solid, but the chokepoint has holes on in-scope paths. · **Priority:** P1 · **Size:** L
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

---

## Bugs

*(Security-hardening items triaged out of the `SP-11` review — filed, not
must-fix this cycle. See `STATUS.md` → "Security review of the branch (SP-11)".)*

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
- **Type:** bug · **Status:** in-sprint → `active/sprint-2026-08.md` · **Priority:** P1 · **Size:** M
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

## Tasks

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
- **Type:** task · **Status:** blocked · **Priority:** P1 · **Size:** L
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

---

## Spikes

File time-boxed research here (e.g. spinning `TASK-007` load findings into a
scaling investigation) as `SPIKE-002`, `SPIKE-003`, … when a question needs
bounded exploration before it can be a task.

### SPIKE-001 — Architect review: should moderator's 6 unauthenticated REST routers be gated? (module surface / isolation)
- **Type:** spike · **Status:** backlog · **Priority:** P2 · **Size:** S
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
