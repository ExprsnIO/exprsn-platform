# Plugin System Plan

Implementation plan for a **plugin system** for the Exprsn unified platform. Read
`ARCHITECTURE.md`, `STATUS.md`, and `CLAUDE.md` first — this plan is grounded in the
existing module contract and the moderator rule/workflow engines, and is sequenced to
stay off the MVP (R1–R6) critical path.

Status: **Phase 0 + Phase 1 implemented (2026-06-30), plus webhook delivery,
sandboxed `script` execution, endpoint management, and a state-machine engine
brought forward from later phases.** A parallel low-code module ships alongside.
Everything is behind `PLUGINS_ENABLED` / `LOWCODE_ENABLED` (default `false`) so
the modules load inert. See **§9 Implementation status** at the bottom for the
as-built summary and the resolved decisions in `docs/plans/plugins-decisions.md`.

---

## 0. Grounding (what the code actually does)

These facts drive every design decision:

- **Modules are statically `require()`d at boot.** `src/index.js` `loadModules` iterates
  the hardcoded `MODULES` array from `src/modules/registry.js` and `require`s each entry
  synchronously; a single throw aborts startup. There is no dynamic/runtime module loading.
- **The module contract is small and fixed.** Entry exports
  `{ name, app, registerSockets(io), init(ctx), shutdown?, rootApp?, attachWsServer? }`.
  `init(ctx)` gets `{ config, logger, schema }`.
- **The registry is the single source of truth.** `src/db/schemas.js` derives Postgres
  schemas straight from `MODULES`. Adding a module = one registry row + everything (schema
  bootstrap `src/db/migrate.js`, `scripts/migrate-sync.js`, gateway mount, `/health`) follows.
- **One Postgres DB, one schema per module**, obtained via `getSequelize(schema)`
  (`src/db/sequelize.js`).
- **Auth has no global RBAC table.** "Platform admin" is an email allowlist
  (`shared/utils/platformAdmin.js`, `PLATFORM_ADMIN_EMAILS`). User identity comes from CA
  token validation (`shared/middleware/tokenValidation.js`, posts to CA
  `/api/tokens/validate`). Service-to-service auth is
  `HMAC-SHA256(serviceId, SERVICE_TOKEN_SECRET)` with the unified process presenting
  `SERVICE_ID=platform` (`shared/utils/serviceToken.js`).
- **CA tokens are capability-scoped already.** The `Token` model
  (`services/ca/models/Token.js`) carries `permission_{read,write,append,delete,update}`,
  `resourceType/resourceValue`, expiry, `tokenData`, `metadata` — issued via CA
  `/api/tokens/generate`.
- **The moderator subsystem is the extensibility precedent, and it is data-driven, not
  code-loaded:**
  - `ruleEngineService` evaluates JSON condition trees (`all/any/none`) with
    `appliesTo`/`sourceServices` scope filters (`services/moderator/services/ruleEngineService.js`).
  - `workflowEngine` stores workflows as **JSONB rows** and runs them on a durable **Bull**
    queue with retries, where side-effecting steps are **best-effort and never throw** while
    genuine infra errors rethrow for retry (`services/moderator/services/workflowEngine.js`).
  - `agentFramework.registerAgentImplementation(...)` then `initialize()` is a
    registration-bus pattern (`services/moderator/src/index.js`).
  - `ModeratorConfig` is a JSONB key/value store with a `category` enum and `isSensitive`
    flag (`services/moderator/models/ModeratorConfig.js`).
- **Nothing is group-aware in its data ownership.** Nexus owns rich group tables
  (`services/nexus/src/models/GroupMembership.js` has `user_id/group_id/role/status`), but
  timeline/spark/live/etc. rows carry no `group_id`. Group ownership is genuinely aspirational.
- **Posture is release-engineering-first and single-instance** (`sprints/archive/SPRINT.md`, `CLAUDE.md`
  "MVP / release readiness"). Bull workers run as separate processes (`worker:timeline`,
  `worker:prefetch`). The plugin system is net-new and must not jeopardize the MVP critical
  path — it ships behind a flag and is inert by default.

---

## 1. Architecture

### 1.1 What a plugin *is* (the central decision)

**A plugin is a declarative, scoped, capability-gated extension described by a manifest and
stored as data — not arbitrary third-party code loaded into the gateway process.** A plugin
is one of three execution kinds, all described by the same manifest:

1. **`declarative`** — behavior expressed as data the platform's own trusted engines
   evaluate (condition trees / workflow specs, reusing the moderator rule/workflow engines).
   Zero foreign code.
2. **`webhook`** — the platform emits signed HTTP calls to an external endpoint the plugin
   owns; the plugin runs in its **own process/network boundary**. This is how
   untrusted/third-party logic runs safely.
3. **`internal`** *(post-MVP, first-party only)* — vetted, in-repo code that registers
   handlers on the hook bus, gated by manifest capabilities and loaded defensively.

A plugin can also contribute **frontend surfaces** (SPA admin sections, timeline widgets)
declaratively via the manifest; the SPA fetches a surfaces feed and renders known surface
types. No plugin ships executable frontend code in MVP.

This generalizes exactly what moderator already does (rules = declarative plugins; agents =
internal plugins; herald notifications = webhook plugins) into a first-class, scoped,
multi-module framework.

### 1.2 Rationale and the key trade-off

The gateway is **one process, single instance, no redundancy at MVP**
(`ARCHITECTURE.md` "Deployment topology"). In-process execution of foreign code means:
(a) any plugin throw/`process.exit`/native crash takes down *all ten modules*; (b) Node has
no production-grade in-process sandbox (`vm2` is deprecated/unmaintained; `vm` is not a
security boundary); (c) it directly contradicts the release-engineering-first stance.
Therefore untrusted execution must live behind a process boundary (webhook/external service),
and everything else is data the trusted core evaluates. This is also the lowest-risk path
that delivers real value fast, because the evaluation engines (rule/workflow) already exist.

### 1.3 Alternative loading model considered (and rejected for MVP)

**Dynamic in-process discovery + `require()` (npm-style plugins).** A `plugins/` directory or
`exprsn-plugin-*` npm packages discovered at boot, each exporting the module contract,
dynamically `require`d and merged into `MODULES`.

- Pros: maximal power; plugins are "just modules"; reuses all existing wiring verbatim.
- Cons (decisive): no trust boundary (see 1.2); a bad plugin breaks `loadModules`' fail-fast
  boot; version/dependency hell inside one `node_modules`; impossible to scope per-org/user
  (a `require`d module is global); can't disable without a restart.

**Decision:** adopt the **manifest-registry + hook-bus** model now; keep `internal`
in-process plugins as a *post-MVP, first-party-only* tier that reuses the dynamic-require
mechanics but only for signed, in-repo code. Document the dynamic-require model as the
eventual Tier-2/3 path, not MVP.

### 1.4 Components

- **`plugins` module** (new row in `src/modules/registry.js`): a normal in-process module
  (`prefix: '/plugins'`, `schema: 'plugins'`, `socketNs: null`) so it inherits gateway
  mount, schema bootstrap, migrate-sync, and `/health` for free. It owns the catalog,
  installations, lifecycle API, manifest validation, the hook bus, and webhook dispatch
  enqueue.
- **Plugin Host / Hook Bus** (`PluginHostService`): an in-process async event bus. Domain
  modules call `pluginHost.emit(event, ctx)` at instrumented points (mirroring
  `workflowEngine.triggerForContent`). The host resolves applicable installations by scope +
  `appliesTo`, then dispatches **best-effort, never throwing into the caller** (the moderator
  durability rule).
- **Scope Resolver**: given request/event context (user, org, group, module), returns the
  ordered set of enabled installations and their merged config.
- **Webhook dispatcher**: a Bull-backed worker (`worker:plugins`, modeled on
  `worker:timeline`) that delivers signed webhooks with retries/circuit-breaker — kept off
  the gateway hot path exactly like the existing queues.
- **Plugin identity & authz**: outbound signatures via
  `deriveServiceToken('plugin:'+pluginKey)`; inbound plugin callbacks authenticated by a
  scoped CA token or derived service token and gated by `requirePluginCapability`.

---

## 2. Data model (new `plugins` schema)

All tables in schema `plugins`, defined as Sequelize models synced by
`scripts/migrate-sync.js` (add `plugins: 'src/models/index.js'` to its `MODELS` map and to
`ALL_SCHEMAS`).

**`plugins.plugins`** — catalog of known plugins
- `id` UUID PK
- `plugin_key` STRING unique, slug, validated `^[a-z][a-z0-9_-]*$` (mirror `ModeratorConfig`
  key regex)
- `name`, `description`, `publisher`
- `latest_version` STRING (semver)
- `kind` ENUM(`declarative`,`webhook`,`internal`)
- `source` ENUM(`builtin`,`registry`,`uploaded`)
- `status` ENUM(`draft`,`published`,`deprecated`,`disabled`)
- `manifest` JSONB (the current published manifest)
- `signature` TEXT null (for signed/first-party)
- timestamps

**`plugins.plugin_versions`** — immutable manifest history (versioning)
- `id`, `plugin_id` FK, `version` semver, `manifest` JSONB, `checksum`, `created_at`
- unique(`plugin_id`,`version`)

**`plugins.plugin_installations`** — a plugin enabled at a scope
- `id` UUID PK
- `plugin_id` FK
- `scope_type` ENUM(`platform`,`organization`,`group`,`user`)
- `scope_id` UUID null (null only for `platform`)
- `version` semver (pinned at install)
- `status` ENUM(`installed`,`enabled`,`disabled`,`error`)
- `config` JSONB (validated against manifest `configSchema`)
- `secrets_ref` STRING null (pointer into vault module / encrypted blob; never plaintext —
  follow `ModeratorConfig.isSensitive` precedent)
- `installed_by` UUID, `created_at`, `updated_at`
- **unique(`plugin_id`,`scope_type`,`scope_id`)** — one install per plugin per scope

**`plugins.plugin_grants`** — capability grants approved at install
- `id`, `installation_id` FK, `capability` STRING (closed vocabulary), `resource` STRING null,
  `granted_by` UUID, `created_at`
- A grant must be a subset of the manifest's declared `capabilities`.

**`plugins.plugin_deliveries`** — hook/webhook delivery + execution log
- `id`, `installation_id` FK, `event` STRING, `kind`,
  `status` ENUM(`queued`,`running`,`completed`,`failed`,`skipped`), `attempts` INT,
  `response_code` INT null, `error` TEXT null, `correlation_id`, `created_at`, `finished_at`
- Doubles as the per-plugin audit trail (complements `shared/middleware/auditLogger.js`,
  logged with `pluginKey`).

**`plugins.plugin_credentials`** *(Phase 2)* — issued plugin identities
- `id`, `plugin_id` FK, `installation_id` FK null, `service_id` STRING (`plugin:<key>`),
  `ca_token_id` UUID null, `expires_at`, `revoked_at`

---

## 3. Manifest contract & validation

Manifest (JSON, stored in `plugins.manifest` / `plugin_versions`):

```jsonc
{
  "key": "spam-shield",
  "name": "...", "version": "1.2.0", "publisher": "...",
  "kind": "webhook",                    // declarative | webhook | internal
  "appliesTo": ["timeline", "spark"],   // module surfaces; mirrors ruleEngine appliesTo
  "events": ["timeline.post.created", "spark.message.created"],
  "scopes": ["platform", "organization", "user"],   // allowed install scopes
  "capabilities": ["read:timeline.posts", "emit:notifications", "call:webhook"],
  "endpoint": { "url": "...", "timeoutMs": 4000 },   // webhook kind only
  "behavior": { /* ... */ },            // declarative kind: condition tree / workflow spec
  "configSchema": { /* ... */ },        // JSON schema for installation.config
  "surfaces": [ { "type": "admin-section", "id": "...", "title": "..." } ]  // SPA contributions
}
```

**Validation** (`services/plugins/src/services/manifestValidator.js`):
- Structural validation via `ajv` (add as a `plugins` module dep; do not pull into the
  gateway core).
- `key` slug regex; `version` valid semver.
- **Capabilities must be drawn from a closed registry**
  (`services/plugins/src/capabilities.js`) — unknown capability ⇒ reject. This is the core
  trust control.
- `appliesTo`/`events` must reference known modules/events from a registry the platform owns.
- `configSchema` itself validated as a JSON schema; `config` on install validated against it.
- `webhook` endpoints: enforce https in production (mirror `assertSecureCaUrl`,
  `shared/middleware/tokenValidation.js`), block private/loopback targets unless explicitly
  allowlisted (SSRF — the security review already flagged atproto SSRF, `sprints/archive/SPRINT.md` SP-11).

**Containment of broken/malicious plugins:**
- Dispatch is best-effort and wrapped so it **never throws into the emitting request** (the
  `workflowEngine.triggerForContent` rule).
- Per-installation **circuit breaker** + webhook **timeout** + retry caps in Bull
  (`removeOnFail`, bounded `attempts`).
- **Kill switch**: `status=disabled` excludes an installation at resolve time, no restart.
- **Reentrancy/loop guard**: dispatch context carries a depth counter; plugin-emitted events
  past a depth limit are dropped (a plugin reacting to its own effects).
- **Moderator interaction**: plugin-produced or plugin-modified content is *not* allowed to
  bypass the moderator pipeline. Plugins get `read`/`emit` capabilities by default; any
  `write:*content*` capability routes the produced content back through `services/moderator`
  before it lands, and plugins cannot be granted a capability that overrides a moderator
  verdict. The first wave of "plugins" should in fact be moderator's own rules/agents
  re-expressed in this framework, proving the model.

---

## 4. Scope, ownership, and request-time resolution

**Install authority by scope:**
- `platform` — platform admin only (`isPlatformAdmin`, `shared/utils/platformAdmin.js`).
- `organization` — org admin. **Gap:** there is no org-admin role in auth today (only the
  email allowlist + auth's `data.roles`). MVP: treat org-admin as platform-admin-acting-on-
  an-org until an org RBAC concept exists; record the gap.
- `group` — group owner/admin via nexus `GroupMembership.role`/`GroupRole`. **Gap (must
  state):** no domain module carries `group_id` on its content, so a group-scoped plugin
  cannot be *enforced* on timeline/spark/live events. Group scope is therefore **declarable
  and installable but only enforceable where group context exists** (i.e. inside nexus's own
  routes, or after the per-module group-ownership backend work described in
  `docs/plans/groups-admin.md`). This is explicitly deferred and called out as a precondition.
- `user` — the authenticated user, for their own data.

**Resolution at event/request time** (`services/plugins/src/services/scopeResolver.js`):
1. From context derive `{ userId, orgId?, groupId?, module }`.
2. Query enabled installations matching: `platform` (always) ∪ `organization=orgId` ∪
   `group=groupId` (only when group context is present) ∪ `user=userId`.
3. Filter by manifest `appliesTo`/`events` against the emitting module/event (reusing the
   `ruleEngineService._ruleApplies` scope-filter idea).
4. Merge config with precedence **platform < organization < group < user** (more specific
   overrides), returning the ordered, deduped installation set.

**Multi-module plugins:** a single plugin spans modules by listing several in `appliesTo` and
subscribing to several `events`; the hook bus dispatches it from each instrumented module.
Enforcement is uniform because every module emits through the same `pluginHost.emit`.

---

## 5. Token / CA / Auth support

**Outbound (platform → plugin webhook):** sign each delivery with `X-Plugin-ID: <key>` +
`X-Plugin-Signature: HMAC-SHA256(body, deriveServiceToken('plugin:'+key))`, reusing
`shared/utils/serviceToken.js` with a `plugin:`-namespaced identity. The plugin verifies with
the symmetric secret it was provisioned. Timeouts + non-prod TLS relaxation follow
`shared/utils/httpAgent.js`.

**Inbound (plugin → platform callback):** two options, recommend the simpler for MVP:
- **MVP: derived service token.** Plugin presents `X-Service-ID: plugin:<key>` +
  `X-Service-Token`; a new `authenticatePlugin()` middleware (modeled on
  `authenticateService`, `shared/middleware/auth.js`) verifies the HMAC, loads the
  installation, and attaches `req.plugin`.
- **Phase 2+: CA-issued scoped token.** Issue a CA token via `/api/tokens/generate` with
  `permissions` and `resourceValue` narrowed to the plugin's granted capabilities (the
  `Token` model already supports this, `services/ca/models/Token.js`), recorded in
  `plugin_credentials`. This gives real expiry/revocation through the existing CA lifecycle
  (and the existing session-revocation machinery, `sprints/archive/SPRINT.md` SP-6).

**Authorization at request time:** `requirePluginCapability('write:spark.messages')` (modeled
on `requirePermissions`, `shared/middleware/auth.js` / `roleValidator.requirePermission`)
checks the requested capability against `plugin_grants` for the resolved installation. Plugin
permissions live as the closed-vocabulary capability set in `plugin_grants`, **not** as
ad-hoc auth roles — keeping plugin authz separate from user RBAC.

**Audit:** every plugin action (lifecycle change, dispatch, callback) is written to
`plugin_deliveries` and emitted through `shared/middleware/auditLogger.js` tagged with
`pluginKey` + the gateway `correlationId` (the central handler already mints one,
`src/gateway.js`).

---

## 6. Phased implementation plan (MVP-first, flag-gated)

Everything ships behind `PLUGINS_ENABLED` (default `false`) so the module loads inert and
never touches the MVP critical path (`sprints/archive/SPRINT.md` SP-1→SP-9). The module is added to the
registry but its hook-bus emits are no-ops until enabled.

### Phase 0 — Registry + lifecycle skeleton (no execution)
Add the `plugins` module, schema, models (`Plugin`, `PluginInstallation`, `PluginVersion`),
manifest validator, and a CRUD + lifecycle API (`install/enable/disable/uninstall`) gated by
`isPlatformAdmin`. SPA admin section listing catalog + installs.
- **Acceptance:** `db:migrate` syncs the `plugins` schema; `/health` shows the module; a
  valid manifest registers and installs at `platform`/`user` scope and can be
  enabled/disabled/uninstalled; an invalid manifest (bad capability, bad semver) is rejected;
  no other module's behavior changes with the flag off.

### Phase 1 — Hook bus + declarative execution
`PluginHostService` + scope resolver; instrument 2–3 emit points (`timeline.post.created` in
`services/timeline/src/routes/posts.js`, `spark.message.created`, and a moderator content
event). `declarative` plugins evaluated by reusing `ruleEngineService`. Delivery logged to
`plugin_deliveries`.
- **Acceptance:** an enabled declarative plugin fires and is evaluated on its event and scope;
  a disabled or out-of-scope install does not fire; a deliberately throwing evaluation is
  contained and the originating request still succeeds (assert via a test mirroring
  `workflowEngine`'s never-throw guarantee); reentrancy depth guard verified.

### Phase 1.5 — Refactor moderator rules/agents onto the framework (validation)
Re-express moderator's existing rules/agents as `declarative`/`internal` plugins to prove the
model and reduce duplication, before adding net-new plugins.
- **Acceptance:** at least one existing moderator rule runs as a plugin with identical
  behavior; no regression in the moderation pipeline.

### Phase 2 — Webhook plugins + plugin identity/tokens
Bull-backed `worker:plugins` for signed webhook delivery with retries/circuit-breaker;
`authenticatePlugin()` + `requirePluginCapability()`; capability-scoped plugin callback
endpoint(s); `plugin_grants` enforced.
- **Acceptance:** a webhook plugin receives a signed, verifiable payload with timeout+bounded
  retries; a plugin calling back with its token is allowed within its grants and `403`s
  beyond them; failures are isolated to the worker and never the gateway; every action
  audited with `pluginKey`+`correlationId`.

### Phase 3 — Org scope + SPA surface contributions
Full `organization` scope; `group` scope installable but documented as enforcement-blocked
pending per-module group-awareness. `GET /plugins/api/surfaces` feed; SPA renders declared
`admin-section` surfaces.
- **Acceptance:** per-org enable/config works; SPA renders a plugin-contributed admin section
  from the manifest; group scope returns a clear "requires group-aware data ownership" notice
  tied to `docs/plans/groups-admin.md`.

### Phase 4 — Post-MVP
First-party `internal` in-process extension tier (signed, in-repo, loaded defensively,
reusing dynamic-require mechanics); CA-issued plugin tokens with revocation; external
plugin-service runner; manifest signing/marketplace; group-ownership backend work across
modules.

---

## 7. Risks & open questions

- **Single-process blast radius** — mitigated by keeping untrusted code out-of-process
  (webhook) and deferring `internal` to first-party-only; the gateway never `require`s
  foreign plugin code in MVP.
- **No org/group RBAC and no group-aware data** — org-admin and group-scope enforcement are
  genuinely missing backend concepts; MVP supports `platform`+`user` fully, `organization`
  partially (admin authority gap), and `group` as declarable-not-enforceable. This is the
  single biggest scoping caveat.
- **Secrets for plugin config** (webhook signing secrets, API keys) — store via the `vault`
  module or encrypted with the `isSensitive` precedent; never plaintext in
  `plugin_installations.config`.
- **CA token issuance needs a certificate** (the `Token` model requires `certificateId`) —
  MVP sidesteps this with derived service tokens; Phase 2 must decide whether plugins get a
  real CA cert or a synthetic "plugin" cert.
- **Hook bus ordering/perf** — dispatch must be async/best-effort off the request path;
  define ordering (by install scope precedence) and a global dispatch budget.
- **Fit with STATUS/SPRINT** — this is net-new, not on the R1–R6 critical path; ship flag-off
  so it cannot regress the deployable-staging goal, and slot Phase 0–1 after SP-9 hardening.
- **Open:** Do we want the first plugins to be a *refactor* of moderator's rules/agents into
  this framework (proves the model, reduces duplication) or net-new plugins alongside the
  existing moderator engines? Recommend the former (Phase 1.5).

---

## 8. Critical files to create / modify (dependency order)

- `src/modules/registry.js` — add the `plugins` module row (drives schema bootstrap,
  migrate-sync, gateway mount, health).
- `scripts/migrate-sync.js` — register the `plugins` schema's models so `db:migrate` creates
  the new tables.
- `services/plugins/src/models/` — `Plugin`, `PluginVersion`, `PluginInstallation`,
  `PluginGrant`, `PluginDelivery`, `PluginCredential` (Phase 2) + index.
- `services/plugins/src/services/manifestValidator.js` — `ajv` + capability registry.
- `services/plugins/src/capabilities.js` — closed capability vocabulary (core trust control).
- `services/plugins/src/services/scopeResolver.js` — scope + `appliesTo` resolution.
- `services/plugins/src/services/pluginHost.js` — the hook bus (`emit`, best-effort dispatch).
- `services/plugins/src/services/webhookDispatcher.js` + `services/plugins/src/worker.js` —
  Bull-backed `worker:plugins` (Phase 2).
- `services/plugins/src/routes/` — lifecycle/admin API + plugin callback endpoint(s).
- `services/plugins/src/index.js` — module entry (the `{ name, app, init }` contract).
- `shared/middleware/auth.js` — model `authenticatePlugin` / `requirePluginCapability` on
  `authenticateService` / `requirePermissions`.
- Instrument emit points: `services/timeline/src/routes/posts.js`, spark message create,
  a moderator content event (Phase 1).
- `web/src/features/admin/` — plugin catalog/installs admin section + surfaces rendering.

### Precedents to mirror
- `services/moderator/services/workflowEngine.js` — durable, best-effort, never-throw
  execution + JSONB-spec pattern for the hook bus/dispatcher.
- `shared/utils/serviceToken.js` — HMAC identity derivation reused for `plugin:<key>`
  signing/auth.
- `shared/middleware/auth.js` — `authenticateService` / `requirePermissions` shape.
- `services/moderator/models/ModeratorConfig.js` — JSONB key/value + `isSensitive` for config
  & secrets handling.

---

## 9. Implementation status (2026-06-30, as built)

Built and flag-gated (`PLUGINS_ENABLED` / `LOWCODE_ENABLED` / `PLUGINS_SCRIPT_ENABLED`,
all default `false`). Lint clean; `services/plugins` (19 tests) + `services/lowcode`
(4 tests) green and wired into `npm run test:all`.

**Plugins module (`services/plugins/`)** — registry row + `plugins` schema.
- Models: `Plugin`, `PluginVersion`, `PluginInstallation` (with `lifecycleState`),
  `PluginGrant`, `PluginDelivery`, `PluginEndpoint`, `PluginTransition`.
- `capabilities.js` — closed capability vocabulary (the trust control);
  `events.js` — known events + module surfaces.
- `conditionEvaluator.js` — generic, fail-closed condition-tree evaluator
  (generalizes the moderator rule engine).
- `manifestValidator.js` — ajv structural + semver + capability/event/surface +
  webhook SSRF + `script`-token checks; `validateConfig` against `configSchema`.
- `scopeResolver.js` — platform∪user(∪org∪group) resolution + config merge.
- `pluginHost.js` — the **never-throw** hook bus with a re-entrancy depth guard;
  dispatches `declarative` / `webhook` / `script` and fans out to subscribers
  (low-code). `emit()` is inert with the flag off.
- `webhookDispatcher.js` — HMAC-signed outbound delivery (`plugin:<key>`),
  bounded retry + per-endpoint circuit breaker; named-endpoint invocation;
  inbound signature verification.
- `sandbox/worker.js` + `sandbox/sandboxRunner.js` — **sandboxed native JS**: a
  worker thread (resource-limited, terminable) running user code in a frozen
  `node:vm` context with no `require`/`process`/`fs`/net; the only power is a
  capability-gated `platform.*` API whose I/O the host signs and routes through
  the token/CA gateway. Gated by `PLUGINS_SCRIPT_ENABLED`.
- `stateMachine.js` — generic FSM; default install lifecycle
  (installed → enabled ⇄ disabled → uninstalled) with guards + audited
  transitions.
- `lifecycleService.js` — register/install/enable/disable/uninstall with
  manifest validation, version pinning, config validation, and grant subsetting.
- Routes: catalog, installations, endpoints, deliveries, surfaces feed, vocab
  registry, inbound callback; `middleware/auth.js`
  (`requireAdmin`/`requireUser`/`authenticatePlugin`/`requirePluginCapability`).
- `builtin/` — four net-new example plugins (declarative `welcome-flow` +
  `keyword-flag`, `webhook` `spam-shield`, `script` `enrich-script`), seeded but
  not auto-installed.

**Low-code module (`services/lowcode/`)** — registry row + `lowcode` schema; its
own runtime that **reuses** the plugins trust layer (scope, capabilities,
condition evaluator, state machine, hook bus).
- Models: `LcApp`, `LcLookup`, `LcEntity`, `LcRecord`, `LcForm`, `LcFlow`.
- `typeSystem.js` — strong-typed properties (string/text/number/integer/boolean/
  date/datetime/enum/reference/json) with dimension/measure roles + aggregation
  (Tableau/PowerBI-style), enum value sets, and reusable lookup lists.
- `entityService.js` — typed record CRUD + uniqueness + record state machines;
  emits `lowcode.record.*` on the shared hook bus.
- `flowEngine.js` — subscribes flows to the hook bus (no second dispatch path);
  trigger → condition → action, reusing plugin action handlers + `create_record`.
- Routes: `/api/design/*` (admin: apps/lookups/entities/forms/flows),
  `/api/data/:entityKey/records` (user runtime).

**Wiring:** `src/modules/registry.js` (+2 rows), `scripts/migrate-sync.js`
(MODELS + ALL_SCHEMAS), `src/config/index.js` (`features` flags), `.env.example`,
and a guarded `pluginHost.emit('timeline.post.created', …)` in
`services/timeline/src/routes/posts.js`.

**Web admin:** `web/src/api/admin/{plugins,lowcode}.ts` +
`web/src/features/admin/sections/{PluginsSection,LowcodeSection}.tsx`, routed in
`router.tsx` and `AdminLayout.tsx`.

**Deferred (still later-phase):** Bull-backed `worker:plugins` (delivery runs
inline for the single-process MVP), CA-issued plugin tokens with revocation, the
first-party in-process `internal` tier, org-RBAC and per-module group-aware data
(group scope remains declarable-but-not-enforceable), and manifest
signing/marketplace.
