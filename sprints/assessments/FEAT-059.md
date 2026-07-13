# FEAT-059 — Tokenization across all platform features · cost/benefit assessment

- **Analyst:** sr-developer (inline; the cost-benefit-analyzer runs were lost to a session limit)
- **Date:** 2026-07-13
- **Tickets:** FEAT-059 (parent epic), FEAT-060 (CA scoped-token enforcement everywhere), FEAT-061 (unified capability / share-link tokens)
- **Verdict:** **BUILD — but re-sized, re-sliced, and re-ordered. FEAT-060 is XL, not L.**

---

## 1. The finding that changes the estimate

The ticket assumed FEAT-060 was a matter of *tightening* modules that "only check is-this-token-valid".
The inventory says it is worse than that.

**Not one of the 14 modules in `src/modules/registry.js` enforces org/group token scope.**

Every module's auth middleware follows the same shape (representative:
`services/filevault/src/middleware/auth.js:48-117`): validate the bearer against the CA
(`validateCAToken` → `validator.validateToken`), then set `req.user` and `req.permissions`, where
`permissions` is a **coarse capability map** (`{read, write, delete}` — see the `requirePermissions`
helper at `:135-152`). That answers *"is this token valid, and does it carry the `write` bit?"*
It never answers *"is this token scoped to **this** org, group, or resource?"*

Grep for any org concept in each module's auth middleware:

| module | own auth middleware | enforces org scope? |
|---|---|---|
| spark, filevault, vault, timeline, moderator, live, cortex | yes (7 separate copies) | **no — zero org check in any of them** |
| prefetch, plugins | yes | no |
| ca | `services/ca/middleware/auth.js` | mints/validates scope, does not enforce it on consumers |
| auth | (uses shared) | org-aware (43 files) — it *owns* the org model |
| nexus | (uses shared) | 1 file — group-aware in places, not enforced at the token layer |
| atproto | none — per-route `adminGuard` (`src/routes/ops.js:34+`) | n/a (admin-only surface) |
| lowcode | `src/middleware/designAuth.js` | **YES — the one module that does. See correction below.** |

Nine modules — spark, filevault, vault, timeline, prefetch, moderator, live, atproto, cortex —
contain **no reference to `organizationId`/`orgId` anywhere in the module at all.**

> ### ⚠ CORRECTION (2026-07-13, same day — this assessment was wrong on lowcode)
>
> **An earlier revision of this assessment claimed lowcode grants "any authenticated user" full design
> access, citing `src/routes/design.js:7`. That was a misreading — the sentence was truncated
> mid-clause and its meaning inverted.** The full comment (`design.js:7-12`) reads:
>
> > *"Authorization (decisions ledger: full org/group RBAC): any authenticated user may reach this
> > router, **but every read/mutation is authorized against the target scope via `scopeAuthority`** —
> > platform admins are superusers; org/group admins act within their org/group; users within their own
> > scope. A resource tied to an app inherits that app's scope; a platform-global resource
> > (`appId=null`) requires platform admin."*
>
> And it is **real, not aspirational**: `src/services/scopeAuthority.js` (88 lines) exports
> `canAdminScope` / `canAdminApp` / `ADMIN_ROLES` with a platform-admin superuser path (`:50`), and
> `assertScope` / `assertApp` from `src/middleware/designAuth.js` are applied **31 times** across
> `design.js`.
>
> **Consequences for this assessment:**
> - The headline "**zero** of 14 modules enforce org/group scope" should read "**one** of 14 does —
>   lowcode — and the other thirteen do not." The cost estimate for FEAT-060 is **unchanged**, because
>   the nine modules with no org concept are still nine.
> - **Lowcode is not the cautionary tale — it is the reference implementation.** FEAT-060 should copy
>   `scopeAuthority`'s model rather than invent one. That *reduces* design risk.
> - **FEAT-058 (lowcode org/group RBAC) may be substantially DONE already** and needs re-grooming
>   against the code before it is scheduled. It should not be treated as P1-blocking on that basis.
> - The claim "FEAT-060 gates the lowcode epic outright" is **withdrawn.** The residual concern is
>   narrower and still real: lowcode enforces scope through *its own* `scopeAuthority`, not through CA
>   token scope, so a lowcode flow action that reaches into another module (FEAT-057) still lands in a
>   module that does no scope check. **The gap is at the callee, not the caller.**

**So the org/group scoping in the CA token spec v1.1 is minted but enforced by nobody.** FEAT-060 is
therefore not a hardening pass over existing checks; it is *introducing an org/group dimension into
nine modules that have no such concept*, plus retiring seven duplicated copies of the same auth
middleware. That is **XL**, and per `sprints/README.md` an XL cannot reach `ready` undecomposed.

This also independently confirms the standing note that "no module is group-aware yet" — it was
recorded as a frontend blocker, and it is in fact a platform-wide authorization gap.

---

## 2. Value — strong, but one claim in the ticket is an overclaim

The epic's value case is that the recurring share/ACL bug class exists *because* each module rolls its
own sharing. Tested honestly against the five bugs cited:

| bug | would FEAT-059/061 have prevented it? |
|---|---|
| **BUG-011** — `check-service-access` trusted a body `userId` | **Yes.** This is exactly FEAT-060: identity must come from the token, never the request body. |
| **BUG-026** — room `files/share` ACL bypass (sharer could share a file they cannot read) | **Yes.** A single capability-issuing path that verifies the issuer's own access at mint time makes this unrepresentable. |
| **BUG-027** — durable-share residual (revoked/private file still served) | **Yes.** A revocable, resource-scoped capability token is precisely the fix; the ticket is open because the current share link is a bearer URL with no revocation. |
| **BUG-020** — share-link metadata disclosure | **Partly.** A resource-scoped token bounds *what* the handler may return, but the actual leak was in the response shape. It would have reduced blast radius, not guaranteed prevention. |
| **BUG-024** — live room-collab uploads bypass moderation | **No — this is an overclaim and should be removed from the ticket.** BUG-024 is a *moderation-routing* failure (UGC ingress not passing `moderateContent`), not an authorization or sharing failure. Tokenization would not have touched it. It belongs to FEAT-009 / TASK-019 / ADR-0004. |

**Net: 3 clean prevents, 1 partial, 1 that does not belong.** That is still a strong value case — the
three clean ones are all *security* bugs, one of which (BUG-027) is still open — but the ticket should
be corrected rather than left overstating the case.

---

## 3. Cost drivers

1. **Blast radius is every auth surface.** Nine modules gain an org dimension; seven duplicated auth
   middlewares should collapse into `shared/middleware/`. Every route in the platform is downstream of
   this. Regression risk is the dominant cost, not the code.
2. **Data model.** Most module tables carry no `organizationId` column. Scoping queries by org means
   **schema changes across nine module schemas** — and per the standing constraint, sync-based
   `db:migrate` will happily create *new tables* but will **not ALTER existing ones**, so every added
   column needs a real migration. **dba sign-off is mandatory and this is the long pole.**
3. **Migration of live share links (FEAT-061).** `services/filevault/src/routes/share.js` and
   `services/live/src/routes/roomCollab.js` have live, issued share links. Moving to a unified
   capability mechanism **breaks existing links** unless a compatibility window is built.
4. **What is genuinely cheap:** the primitives already exist. `shared/middleware/auth.js` already has
   `requireGroup()` (`:146`) and `checkGroupMembership()` (`:160`) and a `requiredPermissions` path
   (`:20`, `:53`). The CA already mints scoped tokens. Nothing needs inventing — it needs *wiring and
   enforcing*, which is why this is large-but-not-risky-in-design.

---

## 4. Sequencing — real, but narrower than first stated

FEAT-036 (PDS), FEAT-051 (workflow) and FEAT-057 (lowcode action catalog) all declare a dependency on
FEAT-060. That dependency is **real** — but see the correction in §1: it is **not** because lowcode
lacks RBAC (it has it).

The precise risk is a **confused deputy at the callee, not the caller**. Lowcode authorizes design-time
actions correctly against its own `scopeAuthority`. But FEAT-057 would let a lowcode flow **invoke every
other module** — and those modules perform **no org/group scope check of their own** (§1). So a flow
that is correctly authorized *within lowcode* can still reach into filevault, spark, or timeline, which
will happily serve it because they cannot tell one org from another. The same shape applies to workflow
(FEAT-051) and to any PDS-derived credential (FEAT-036/037).

**So FEAT-060 gates FEAT-057 / FEAT-051 / FEAT-036 — but it does not gate the lowcode epic as a whole,
and FEAT-058 is not the P1 blocker it was filed as.** FEAT-058 should be **re-groomed against the code
first**; much of it appears already built.

---

## 5. Recommended slicing

The epic as filed is two XL slices. Decompose to:

- **Slice A (M) — `TASK`: consolidate the seven duplicated module auth middlewares into
  `shared/middleware/`.** No behaviour change. Pure prep, but it converts "change nine modules" into
  "change one file plus nine imports". **Do this first; it is what makes the rest affordable.**
- **Slice B (L) — token-derived identity: no route may trust a body/query-supplied `userId`/`orgId`.**
  This is the BUG-011 class. High value, low schema cost, no new columns.
- **Slice C (XL, dba-led) — org-scoped data access:** add the org dimension to the nine module schemas
  and enforce it in queries. **This is the real cost.** Should be its own epic; consider scoping it to
  the modules that actually have multi-tenant exposure first (filevault, timeline, spark, live) and
  deferring the rest.
- **Slice D (L) — FEAT-061 unified capability tokens**, with a compatibility window for live links.
  **Independently valuable and can proceed in parallel with B/C** — it closes BUG-027 (open) and
  structurally prevents BUG-026. Arguably the highest value-per-day in the whole epic.

**Recommended immediate action: Slice A + Slice D.** Slice A is cheap and unlocks everything; Slice D
closes an open security bug and kills the recurring share-bug class. Slice C is the expensive one and
deserves its own cost/benefit once A is done.

---

## 6. Handoffs

- **systems-architect** — sign-off required: this changes the platform's authorization model and the
  shared middleware contract. Also owns the FEAT-061 capability-token design (one mechanism, three
  consumers).
- **dba** — **mandatory, and the long pole.** Slice C adds columns to existing tables across nine
  schemas; sync `db:migrate` will not ALTER them, so each needs a real migration + a `db:check` pass.
- **qa-specialist** — the cross-org denial test matrix (every module × every role) is the acceptance
  evidence, and it is substantial recurring effort.

---

## 7. Verdict

**BUILD — re-sized.** The value case survives scrutiny (3 clean security-bug prevents, one still open).
The cost was **materially underestimated**: FEAT-060 is XL because org scoping is enforced by *one*
module (lowcode) and **not by the other thirteen** — nine of which have no org concept at all. Do **not**
promote FEAT-060 as filed — decompose per §5, start with Slice A (middleware consolidation) and Slice D
(capability tokens), and put the org-scoped data access (Slice C) through its own assessment.

**Three corrections to fold into the tickets:**
1. Drop **BUG-024** from FEAT-059/061's prevented-bug list — it is a moderation-routing failure, not a
   tokenization one (§2).
2. **Lowcode already enforces org/group RBAC** via `scopeAuthority` (§1 correction). It is the
   **reference implementation to copy**, not a gap. FEAT-060 should adopt its model.
3. **FEAT-058 is not a P1 blocker** and appears substantially built — **re-groom it against the code
   before scheduling.** The claim that FEAT-060 "gates the lowcode epic outright" is withdrawn; what it
   actually gates is FEAT-057 (the cross-module action catalog), because the *callee* modules do no
   scope check.
