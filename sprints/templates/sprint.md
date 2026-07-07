# Sprint <YYYY-MM> — <one-line theme>

Copy this file to `active/sprint-<YYYY-MM>.md` to open a sprint. When the sprint
ends, move it to `archive/` and return unfinished tickets to `BACKLOG.md`.

- **Cycle:** <e.g. July 2026>
- **Window:** <YYYY-MM-DD> → <YYYY-MM-DD>
- **Goal:** <the outcome this sprint delivers, in one or two sentences>
- **Scope decisions in force:** <link the driving decisions, e.g. STATUS.md MVP
  scope: single gateway instance · release-engineering-first>

---

## Committed tickets

Only `ready` tickets the product-manager has pulled in. Mark each `in-sprint` on
commit; developers advance status as they work. Structural tickets carry
architect sign-off; data/queue tickets carry DBA sign-off (note it in the ticket).

| ID | Title | Type | Owner-role | Size | Status |
|----|-------|------|------------|------|--------|
| TYPE-NNN | <title> | feature/bug/task/spike | <role or unassigned> | S/M/L | in-sprint |
| … | | | | | |

---

## Sequencing

The order/dependencies for this sprint (critical path first). Reference blocked-by
edges from the tickets.

```
TYPE-AAA → TYPE-BBB        # BBB waits on AAA
TYPE-CCC → TYPE-DDD ┐
TYPE-EEE            ┴→ TYPE-FFF
```

Critical path to the sprint goal: **<A → B → C>**.

---

## Out of scope this sprint

Explicitly not committed — with the reason (deferred / blocked / lower priority).
Keep it honest so nobody starts untracked work.

- **<TYPE-NNN / legacy id>** — <why not this sprint; revisit trigger>.
- …

---

## Progress log

Append dated entries as tickets move; QA notes pass/fail against acceptance; new
defects link the fresh `BUG` ticket filed in `BACKLOG.md`.

- **<YYYY-MM-DD>** — <ticket> <status change> — <short note>.
