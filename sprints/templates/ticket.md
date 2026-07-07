# Ticket template

Copy the block below into `BACKLOG.md` (under the matching type group) for a new
ticket. Fill every field. `FEAT` tickets **must** keep the `Cost/Benefit` line —
it is the gate for `ready`. Delete the `Cost/Benefit` line for non-`FEAT` types.

Field rules:
- **ID** — `TYPE-NNN`, monotonic per type, never reused. Types: `FEAT` / `BUG` /
  `TASK` / `SPIKE`.
- **Status** — `backlog → ready → in-sprint → in-progress → in-review → done`,
  plus `blocked` (name the blocker) or `deferred` (reason + revisit trigger).
- **Priority** — `P0` blocker · `P1` high · `P2` normal · `P3` nice-to-have.
- **Size** — `S` ≤1d · `M` 2–3d · `L` 4+d · `XL` break down before `ready`.
- **Owner-role** — set when a developer claims the ticket at BUILD (one of
  sr-developer / jr-developer / dba / …); `unassigned` until then.
- **Blocked-by** — ticket id(s) or an external condition; `—` if none.
- **Legacy** — cross-link `SP-N`, `R1`–`R6`, `#N`; `—` if none.
- **Acceptance criteria** — testable bullets QA can check off.

```markdown
### TYPE-NNN — <short imperative title>
- **Type:** feature|bug|task|spike · **Status:** backlog · **Priority:** P? · **Size:** ?
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** SP-? / R? / #? (or —)
- **Cost/Benefit:** pending            <!-- FEAT only: pending | done: <summary/link> | rejected -->
- **Description:** <what and why, grounded in the repo; link ARCHITECTURE.md /
  API_SURFACE.md / STATUS.md as needed>
- **Acceptance criteria:**
  - <testable outcome 1>
  - <testable outcome 2>
- **Notes:** <optional: risks, sequencing, architect/DBA sign-off, files touched>
```

---

## Filled example

```markdown
### BUG-004 — Seed scripts ship a default password with no prod guard
- **Type:** bug · **Status:** backlog · **Priority:** P2 · **Size:** S
- **Owner-role:** unassigned · **Blocked-by:** —
- **Legacy:** SP-11 backlog
- **Description:** scripts/seed/common.js carries a committed default password and
  has no NODE_ENV==='production' guard, so a seed run against prod would create
  known-credential accounts.
- **Acceptance criteria:**
  - Committed default password removed (require an env/arg instead).
  - Seed scripts refuse to run when NODE_ENV==='production'.
- **Notes:** From the SP-11 security review backlog; in-house, no infra needed.
```
