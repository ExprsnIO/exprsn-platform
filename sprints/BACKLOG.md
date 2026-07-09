# Backlog — Exprsn Platform

The intake queue. Every unscheduled feature, bug, task, and spike is exactly one
entry here, filed with the fields from `templates/ticket.md`. Grouped by type.
Ids are monotonic per type and never reused. Legacy ids (`SP-N`, `R1`–`R6`, `#N`)
are cross-linked in parentheses.

Governance, lifecycle, and the Cost/Benefit gate: see `README.md`.

> **Gate reminder:** a `FEAT` cannot leave `backlog` until the
> cost-benefit-analyzer replaces its `Cost/Benefit: pending` line. The
> product-manager grooms `backlog → ready` and commits `ready` tickets into the
> active sprint (`active/sprint-2026-07.md`).

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
  **Filed during QA:** BUG-010 (seeded python tools enabled in an API-refused state).

### TASK-019 — Cortex: sandbox python custom-tool execution before production enablement
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

### TASK-020 — Cortex: pin resolved IPs in the http-tool SSRF guard (DNS rebinding)
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
  fails. The vision path must explicitly ensure the model is resident (`POST
  /models/load`) or retry once, rather than assuming the router blocks. Tracked in
  FEAT-030's acceptance criteria.
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
- **Type:** feature · **Status:** in-progress · **Priority:** P1 · **Size:** M
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
- **Type:** feature · **Status:** in-progress · **Priority:** P1 · **Size:** L
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
- **Type:** bug · **Status:** in-sprint → `active/sprint-2026-07.md` · **Priority:** P2 · **Size:** S
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
- **Type:** bug · **Status:** in-sprint → `active/sprint-2026-07.md` · **Priority:** P2 · **Size:** S
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
- **Type:** bug · **Status:** in-sprint → `active/sprint-2026-07.md` · **Priority:** P2 · **Size:** S
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

### BUG-010 — Cortex seeds leave python tools `enabled` in a state the API would refuse
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
  the flag + sandbox land — see TASK-019); (b) have `agentTools()` skip
  python-kind tools when `pythonToolsEnabled` is false; (c) both. (b) is the
  behavior fix; (a) is the honest-state fix.
- **Acceptance criteria:** with `CORTEX_PYTHON_TOOLS_ENABLED=false`, no agent
  run is offered a python tool, and no tool shows `enabled` with a failing
  suite; `npm run seed:cortex` stays idempotent.

### BUG-011 — `cortex` is not a valid `ai_provider` enum value, so an enforced cortex verdict cannot be stored
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

### BUG-012 — `CORTEX_MODERATE` is a silent no-op: `llm_message` is not a valid `content_type`
- **Type:** bug · **Status:** backlog · **Priority:** P2 · **Size:** S
- **Owner-role:** dba (enum) + sr-developer (fail-open policy) · **Relates:** FEAT-021, BUG-011
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
  pair with BUG-011's enum work); or (b) have `moderatorScreen()` send an existing
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
- **Type:** task · **Status:** in-sprint → `active/sprint-2026-07.md` · **Priority:** P1 · **Size:** M
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
- **Type:** task · **Status:** in-sprint → `active/sprint-2026-07.md` · **Priority:** P3 · **Size:** S
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
