# QA fixtures — what is durable, what is residue

Created by **TASK-070** (sprint 2026-14) to end the cycle-on-cycle silting of the
dev database. Two jobs:

1. Tell the next QA pass **what it must not delete** (durable fixtures), so nobody
   has to re-derive that from a ticket thread.
2. Give it a **repeatable inventory query** so "is the dev DB clean?" is a command
   rather than a judgement call.

Read this before verifying anything, and update it in the same pass that changes it.

---

## Durable — do NOT delete

| Fixture | Where | Why it must persist |
|---|---|---|
| `tester@exprsn.io` | `auth.users` | The dev login every manual pass uses (`Zx9$Konq!Vebu7`). Deleting it breaks the boot recipe in `CLAUDE.md` and in memory. Its CA tokens/auth sessions expire on their own — leave them. |
| `exprsn_auth_test` DB | Postgres cluster | The auth Jest suite **force-syncs** its schema. It exists precisely so that never happens to `exprsn`. `services/auth/tests/setup.js:13` defaults to it. |
| `exprsn_spark_test` DB | Postgres cluster | Same contract for spark — `services/spark/tests/setup.js` forces `SPARK_DB_NAME=exprsn_spark_test`. TASK-070 originally listed this as residue; it is not. |
| `exprsn_nexus_test` DB (if present) | Postgres cluster | Same for nexus, per `CLAUDE.md`. Recreate it rather than reuse `exprsn`. |
| The 3 builtin cortex personas | `cortex.agents` | Seeded at cortex boot. Deleting them is harmless (they come back) but pointless, and a non-3 count is the usual first sign of agent-fixture residue. |
| Module schemas + swept constraint state | `exprsn` DB | BUG-064's sweep took cortex from 110 redundant constraints to 6. **Any dev boot from a checkout that still runs `sync({alter:true})` re-accretes them** (BUG-071 is the remaining half). If a count looks wrong, re-run BUG-064's sweep `up()` — do not hand-drop constraints. |

**Expected clean baseline** (post-TASK-070, 2026-07-30): 1 user (`tester`),
0 spark conversations/messages/participants/reactions, 0 filevault files,
0 cortex chat sessions/messages/prompt logs/agent runs/reviews, 3 cortex agents,
0 timeline `user_relationships`.

## Throwaway databases

Creating an isolated DB for a destructive check is the encouraged pattern (BUG-064
and BUG-067 both did it: `exprsn_cortex_qa`, a 255k-row benchmark DB). **Drop it in
the same pass** and state the cluster's ending database count in the verdict — that
sentence is what has caught leftovers before. The cluster's steady state is
**four** databases: `postgres`, `exprsn`, `exprsn_auth_test`, `exprsn_spark_test`
(plus `template0/1`).

## Conventions that make sweeping cheap

- **Name fixtures for the ticket**: `qa068a@exprsn.io`, `qa081-*`, `qa066-*`.
  Every sweep so far has relied on this prefix; an unprefixed fixture is one
  nobody can safely bulk-delete later.
- **Prefer rolled-back transactions** for RI/uniqueness probes — they write
  nothing (BUG-064's QA pass did this).
- **Concurrent QA sessions share one dev DB.** When two passes run at once,
  neither can safely bulk-delete: the FEAT-090 pass had to leave 4 `qa081-*`
  guardrails and 17 `task`-channel prompt logs alone because they belonged to
  another session. If you see fixtures you didn't create, leave them and say so
  in the verdict rather than guessing. This is a governance hazard, not a QA
  mistake — recorded here so it stops being rediscovered.
- **Kill gateways by port** (`lsof -ti tcp:<port>`), never `pkill -f src/index.js`
  — that took out the shared `:8443` gateway mid-session during the FEAT-081 pass.
- **Worktree gateways share one Redis**, so Bull jobs are consumed by whichever
  worker grabs them first. Confirm your own `worker:cortex` log shows the runId
  before trusting a result.

## Inventory query — "is the dev DB clean?"

```bash
docker exec -e PGPASSWORD=change_me exprsn-postgres psql -U exprsn -d exprsn -tAc "
  SELECT 'users'            k, count(*) v FROM auth.users
  UNION ALL SELECT 'spark.conversations', count(*) FROM spark.conversations
  UNION ALL SELECT 'spark.messages',      count(*) FROM spark.messages
  UNION ALL SELECT 'spark.participants',  count(*) FROM spark.participants
  UNION ALL SELECT 'filevault.files',     count(*) FROM filevault.files
  UNION ALL SELECT 'timeline.user_relationships', count(*) FROM timeline.user_relationships
  UNION ALL SELECT 'cortex.chat_sessions',count(*) FROM cortex.chat_sessions
  UNION ALL SELECT 'cortex.prompt_logs',  count(*) FROM cortex.prompt_logs
  UNION ALL SELECT 'cortex.agent_runs',   count(*) FROM cortex.agent_runs
  UNION ALL SELECT 'cortex.agents (want 3)', count(*) FROM cortex.agents
  ORDER BY 1;"
```

Anything above the baseline is residue with an owner. To find *whose*, the
per-user footprint sweep is a loop over every `information_schema.columns` row
named `userId`/`user_id`/`senderId`/`createdBy`/`actorId`/… — that is how
TASK-070 established that the seven QA users touched exactly nine tables, and it
is worth re-running rather than guessing which schemas a fixture reached.

## On-disk artifacts (easy to forget — none of these are in the DB)

- `data/filevault/<xx>/<yy>/<sha256>` — content-addressed blobs, refcounted via
  `filevault.file_blobs`. **Deleting a `files` row does not delete the blob.**
  TASK-070 found **30 blobs on disk against 3 tracked files** — i.e. ~27 already
  orphaned by earlier passes, from before anyone was counting. Not swept (no
  ticket owns provenance, and they are content-addressed so they are harmless
  and will be reused). Recorded here rather than left invisible.
- `data/cortex/workspaces/<sessionId>/` — 14 directories, one per cortex session,
  outliving the DB rows. Removed for the sessions swept in TASK-070.
- `data/cortex/kb/` — retrieval KB scaffolding; leave it.
- Worktree `.env` files — the FEAT-081 pass lost its boot overrides between two
  passes because a worktree `.env` was deleted underneath it. Keep the boot
  recipe in the ticket, not only in the worktree.
