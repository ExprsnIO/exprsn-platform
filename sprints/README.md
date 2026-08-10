# Exprsn Platform — Sprints & Backlog

This directory is the **single, go-forward home** for all sprint planning and
backlog intake on the Exprsn platform — features, bugs, engineering tasks, and
research spikes. From now on, **all** sprint/backlog work lives here. Do not
start work that is not represented by a ticket in `sprints/` — file one first.

This supersedes the ad-hoc planning that lived in two legacy docs, which remain
valid as **cross-referenced history**:

- `sprints/archive/SPRINT.md` — the prior MVP release-readiness sprint (tickets
  `SP-1`…`SP-11`, plus production-readiness `R1`…`R6`). Closed items and their
  acceptance notes stay there.
- `STATUS.md` (repo root) — the authoritative integration punch list (numbered
  follow-ups `#1`…`#12` and the `R1`…`R6` production-readiness section). This is
  still the source of truth for *what is verified vs. still open*; `sprints/`
  is where that open work gets scheduled and driven.

When you file or groom a ticket that maps to legacy work, **cross-link the legacy
id** (`SP-N`, `R1`–`R6`, or `#N`) in the ticket so the trail is preserved.

Also read, before structural work: `ARCHITECTURE.md` (design), `API_SURFACE.md`
(every module's HTTP/socket endpoints), and `CLAUDE.md` (repo instructions).

---

## Folder layout

```
sprints/
  README.md            this governance doc (convention + lifecycle + roles)
  BACKLOG.md           intake queue: every unscheduled feature/bug/task/spike
  QA-FIXTURES.md       durable-vs-residue dev-DB fixtures + the clean-baseline query
  active/              one file per in-flight sprint, e.g. active/sprint-2026-09.md
  archive/             closed sprints move here at close-out
    SPRINT.md          the pre-convention MVP sprint (SP-1…SP-11, R1–R6)
  assessments/         cost-benefit sign-offs, one per FEAT (or FEAT group)
  proposals/           multi-sprint feature plans awaiting grooming
  templates/
    ticket.md          copy-paste ticket template
    sprint.md          copy-paste sprint-plan template
```

- **`BACKLOG.md`** is the intake queue. Every unscheduled item is exactly one
  entry, grouped by type (Features / Bugs / Tasks / Spikes / Deferred).
- **`active/`** holds the current sprint file(s). The product-manager pulls
  groomed tickets into it and tracks status there.
- **`archive/`** is where a sprint file is moved when the sprint ends.
- **`QA-FIXTURES.md`** records which dev-DB fixtures are **durable** (the `tester`
  login, the isolated `*_test` databases, the builtin cortex personas) versus
  residue to sweep, plus the clean-baseline inventory query. **Read it before
  verifying anything and before deleting anything from the dev DB** — it exists
  because that knowledge previously lived only in ticket threads (TASK-070).

---

## Ticket IDs

`TYPE-NNN` — zero-padded 3-digit, **monotonic per type** (ids are never reused):

| Prefix   | Type                          |
|----------|-------------------------------|
| `FEAT-`  | feature / new capability      |
| `BUG-`   | defect                        |
| `TASK-`  | chore / engineering task      |
| `SPIKE-` | time-boxed research           |

Legacy references stay valid and should be cross-linked in the ticket body:
`SP-N` and `R1`–`R6` (from `sprints/archive/SPRINT.md`), and `#N` numbered follow-ups (from
`STATUS.md`).

---

## Statuses

A ticket moves forward through this lifecycle:

```
backlog → ready → in-sprint → in-progress → in-review → done
```

Plus two side states:

- **blocked** — note the blocker and the blocking ticket id.
- **deferred** — note *why* and the *revisit trigger* (the condition that pulls
  it back into play, e.g. "before horizontal scale-out").

## Priority

| Level | Meaning |
|-------|---------|
| P0 | release-blocker |
| P1 | high |
| P2 | normal |
| P3 | nice-to-have |

## Size

| Size | Effort |
|------|--------|
| S  | ≤ 1 day |
| M  | 2–3 days |
| L  | 4+ days |
| XL | too big — **must be broken down** before it can reach `ready` |

---

## Ticket fields

Every ticket carries these (see `templates/ticket.md`): **ID, title, type,
status, priority, size, owner-role, blocked-by, acceptance criteria** (testable
bullets), and **description/notes**. `FEAT` tickets additionally carry a
**Cost/Benefit** line (`pending` | `done: summary/link` | `rejected`).

---

## Lifecycle

1. **Intake** — anyone appends a ticket to `BACKLOG.md` via the template, status
   `backlog`. QA files reproducible bugs; PM / architect / analyst file features
   and tasks.
2. **Cost/Benefit gate** — a `FEAT` ticket **cannot move past `backlog`** until
   the cost-benefit-analyzer has attached an assessment. No assessment ⇒ it stays
   `backlog`. (Bugs, tasks, and spikes have no C/B gate.)
3. **Grooming** — the product-manager sets priority/size, writes acceptance
   criteria, resolves blockers, and promotes `backlog → ready`.
4. **Commit** — the product-manager pulls `ready` tickets into the active sprint
   file and marks them `in-sprint`. **Structural** tickets get systems-architect
   sign-off first; **data/queue** tickets get DBA sign-off first.
5. **Build** — a developer (sr or jr) claims an `in-sprint` ticket, sets
   owner-role + `in-progress`, implements, then moves to `in-review`.
6. **Verify** — QA checks against the acceptance criteria (DBA verifies
   data/queue tickets, architect verifies structural ones). Pass → `done`; fail →
   back to `in-progress`, and any newly-found defects are filed as **fresh `BUG`
   tickets** in `BACKLOG.md`.
7. **Close** — when a sprint ends, move its file to `archive/` and return
   unfinished tickets to `BACKLOG.md` (status `ready` or `backlog`).

### The Cost/Benefit gate (features only)

The gate exists so we don't commit build effort to a feature before the trade-off
is understood. A `FEAT` ticket's `Cost/Benefit:` line is `pending` at intake; the
cost-benefit-analyzer replaces it with `done: <summary/link>` (which unblocks
grooming) or `rejected` (which parks the ticket, with a reason). The
product-manager will not promote a `FEAT` to `ready` while the line reads
`pending`.

---

## Role ownership of these files

Every role **reads `sprints/` before starting** and **updates ticket status** as
work moves.

| Role | Owns / does |
|------|-------------|
| **product-manager** | Owns `BACKLOG.md` + the active sprint file: grooming, priority/size, acceptance criteria, sequencing, commit, close-out. |
| **cost-benefit-analyzer** | Attaches the Cost/Benefit assessment to every `FEAT` ticket — the gate for `ready`. |
| **systems-architect** | Sign-off on **structural** tickets; may file ADR-style notes on a ticket; sequences cross-ticket dependencies. |
| **dba** | Owns **data/queue** tickets (schema / migration / Redis / RabbitMQ); reviews migrations before commit and verifies them at VERIFY. |
| **sr-developer** | Implements M–L tickets; reviews jr work; may co-groom tickets with the PM. |
| **jr-developer** | Implements S tickets with clear acceptance; escalates anything structural to the sr-developer or architect. |
| **qa-specialist** | Writes/executes test plans; moves `in-review → done` or back to `in-progress`; files `BUG` tickets for anything found. |

---

## Data / migration reminders (for DBA and anyone touching a model)

Grounded in `STATUS.md` / `CLAUDE.md` — do not let these bite a data ticket:

- Sync-based `npm run db:migrate` **creates new tables but does NOT `ALTER`
  existing ones.** Adding a column to an existing table requires running that
  migration's `up()` directly, or every query on that table 500s until the schema
  catches up. Run `npm run db:check` (read-only drift audit; needs PG + Redis up)
  after changing a model.
- Raw migrations (`db:migrate:raw`) with **unqualified** table names can leak into
  the `public` schema — schema-qualify or set a `searchPath` (see deferred
  `TASK-012` / `#1`).
