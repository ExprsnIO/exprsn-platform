# PR: feat(cortex) — local-LLM agents/guardrails module (FEAT-021)

**Branch:** `feat/cortex-ai-service` → `main` · 48 files, +3,923/−2

## What

New `services/cortex/` module: the agents engine from the standalone MacOS LLM
service (agent tool-calling loop, guardrail engine, custom tool/skill
registries, long-running tasks, human-review escalations, guarded CS chat/email
flows) ported to platform conventions. Serves moderation, agents, and AI tools
for the platform against a local llama.cpp router — no cloud APIs.

- **Module contract:** `{ name, app, init }`, prefix `/cortex`, schema `cortex`
  (9 tables, Sequelize, `getSequelize('cortex')`), registered in
  `src/modules/registry.js`, wired into `migrate-sync` / `test-all`.
- **Merge-safe:** ships behind `CORTEX_ENABLED` (default **false**) — mounts
  inert, tables sync, `/cortex/health` answers, every other route 503s. With
  the flag off no other module's behavior or cost changes.
- **Auth:** every `/cortex/api/v1` route requires a CA bearer token
  (`validateCAToken` from `@exprsn/shared`). Registry mutations
  (save/build/test/run/enable/disable/delete), the review queue, and the
  prompt log additionally require a platform admin. Non-admins see only their
  own tasks/sessions/outbox (token `userId` scoping). Guardrail/tool enabling
  stays test-gated in the engine.
- **Queues:** interactive chat = direct in-process calls behind an LLM
  concurrency semaphore; agent tasks = Bull `cortex-tasks` on shared Redis with
  a separate worker (`npm run worker:cortex`) and in-process fallback when
  Redis is down.
- **Moderator coexistence:** cortex owns local-LLM inference + its guardrails;
  moderator keeps cloud moderation. Optional `CORTEX_MODERATE` layers a
  fail-open screen through `/moderator/api/moderate/content` (service HMAC
  headers); strongest verdict wins.

## Security posture

- Python custom tools are **arbitrary code execution** → hard-gated behind
  `CORTEX_PYTHON_TOOLS_ENABLED` (default false), admin-only save/run/enable,
  test-gated, guardrail-screened per call. Follow-up ticket needed for real
  sandboxing before production enablement.
- HTTP tools are SSRF-capable → targets resolving to loopback/private ranges
  are rejected unless `CORTEX_TOOL_ALLOW_PRIVATE_HOSTS` (dev).
- `llm_judge` guardrail rules fail open on judge transport errors (logged);
  deterministic rules always apply. Deliberate, documented choice.
- Escalated/blocked outputs are never written to the Redis chat cache.

## Intentional exclusions from the port

Dataset/data-library tools, chat `attachments` (explicit 400), SSE streaming
(poll `GET /tasks/:id`; Socket.IO namespace is a follow-up), MCP server,
admin/training routes.

## Verification (all run live)

- `npm run lint` exit 0; `npm run web:build` green; `npm run db:check` no drift.
- `db:bootstrap` + `db:migrate` → `✓ cortex` (9 tables); `seed:cortex`
  idempotent (4 guardrails / 3 tools / 2 skills).
- 79 Jest tests green (`services/cortex`): pyDumps json.dumps parity,
  compilePyRegex, guardrail evaluate ordering + fail-open, combinedAction,
  safePath containment, tool validation / SSRF guard / python gate, and
  503-when-disabled + 401-without-bearer wiring for every `/api/v1` route.
- Live gateway (`CORTEX_ENABLED=true`) + llama.cpp router on :8080:
  - `/cortex/health` reports router/cache/queue state.
  - CA token round-trip: 401 no token; 200 with valid persistent token
    (note: CA `matchesResource` treats `*` as `[^/]*`, so tokens must use
    `resourceValue: '/'`); non-admin mutation → 403; reviews → 403.
  - Agent task end-to-end via `worker:cortex`: transcript shows
    guardrail-screened `write_file`/`read_file` calls; workspace file created
    under `data/cortex/workspaces/<id>/`.
  - CS chat legal threat → `escalated_input` + held reply → pending review →
    admin approve (409 on re-approve) → prompt log recorded.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
