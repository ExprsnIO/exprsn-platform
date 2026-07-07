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

---

## Bugs

*(Security-hardening items triaged out of the `SP-11` review — filed, not
must-fix this cycle. See `STATUS.md` → "Security review of the branch (SP-11)".)*

### BUG-001 — Authenticated SSRF via DID link / proof-of-control fetch
- **Type:** bug · **Status:** ready · **Priority:** P2 · **Size:** S
- **Owner-role:** unassigned · **Blocked-by:** —
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
- **Type:** bug · **Status:** ready · **Priority:** P2 · **Size:** M
- **Owner-role:** unassigned · **Blocked-by:** —
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
- **Type:** bug · **Status:** in-review → `active/sprint-2026-07.md` (landed `b682236`; qa verify pending) · **Priority:** P2 · **Size:** S
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
- **Type:** bug · **Status:** in-review → `active/sprint-2026-07.md` (landed `e845a33`; qa verify pending) · **Priority:** P2 · **Size:** S
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
- **Type:** bug · **Status:** in-review → `active/sprint-2026-07.md` (landed `b24a828`; qa verify pending) · **Priority:** P2 · **Size:** S
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
- **Type:** bug · **Status:** backlog · **Priority:** P2 · **Size:** S
- **Owner-role:** unassigned · **Blocked-by:** —
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

---

## Tasks

### TASK-001 — Frontend E2E pass (login → MFA wizard → sessions revoke)
- **Type:** task · **Status:** in-sprint → `active/sprint-2026-07.md` · **Priority:** P1 · **Size:** M
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
- **Type:** task · **Status:** in-review → `active/sprint-2026-07.md` (landed `ed1f477`; qa verify pending) · **Priority:** P1 · **Size:** M
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
- **Type:** task · **Status:** in-review → `active/sprint-2026-07.md` (landed `cbf49d3`; qa verify pending) · **Priority:** P3 · **Size:** S
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
