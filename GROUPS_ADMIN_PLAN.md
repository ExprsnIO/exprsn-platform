# Admin Console — Groups (Nexus) Section Expansion — Plan

> Status: **IMPLEMENTED (2026-06-28).** Companion to `GROUPS_FRONTEND_PLAN.md`.
> §11 open decision resolved → **YES, platform-admin override added** (CA-token
> role `admin` bypasses the nexus group guards via `isPlatformAdminRequest`).
> Phase 0: config endpoints secured (`requireToken`+`requireAdmin`), `RequireAdmin`
> gate around `/admin/*`, group-detail IA with sub-tabs (replaces paste-a-Group-ID).
> Phases 1–3: group/member management, moderation completeness (caseAssign wired +
> flag dismiss/escalate route), governance/events/subgroups admin actions. Phase 4:
> `GET /nexus/api/admin/stats` + `/admin/groups/:id/stats` + Overview tab. Phase 5:
> `admin_audit` table + audit writes on privileged actions + `/admin/audit` + Audit
> tab (bulk ops deferred — no bulk backend). Gates green: `lint` (0 errors),
> `web:build`, `db:check` (no drift). Not committed.

## 1. Where the admin Groups module stands today

- **Route:** `/admin/nexus` → `NexusSection` (`web/src/app/router.tsx:91`,
  registered in the admin sidebar at `web/src/features/admin/AdminLayout.tsx:38`).
- **Component:** `web/src/features/admin/sections/NexusSection.tsx` — 5 tabs.
- **API client:** `web/src/api/admin/nexus.ts` — 9 read methods, 4 write methods.

| Tab | Does | Read/Write |
|---|---|---|
| **Groups** | List + search all groups; "Details" opens a read-only `JsonDialog` | read only |
| **Trending** | List top-25 trending; "Recompute trending" button | read + 1 write (`POST /trending/update`, the *only* true platform-admin route) |
| **Moderation** | Paste a Group ID → view flags + case queue; case actions Warn/Remove/Ban | mixed; `caseAssign()` exists in the client but **is never called** |
| **Events / Governance** | Paste a Group ID → inspect events, proposals, subgroups | **read only** |
| **Config** | Edit `nexus-groups` / `nexus-events` / `nexus-calendar` / `nexus-trending` via `ConfigSectionEditor` | read + write |

**House style to follow** (shared in `web/src/features/admin/ui.tsx`): tab state via
`useState`, TanStack Query (`useQuery`/`useMutation`/`useQueryClient`), `useToast()`
snackbars, `DataTable`, `JsonDialog`, `QueryState`, `SectionHeader`, `StatusChip`,
`ConfigSectionEditor`; mutations `onSuccess` → invalidate + toast. Reference
exemplars: `AuthSection.tsx` (org **detail page with nested sub-tabs** + role-
assignment dialogs) and `ModeratorSection.tsx` (per-row action buttons + confirm
dialogs + metrics tab).

## 2. The key architectural finding

The admin console implies a **platform operator who can oversee any group**. The
backend does not support that today:

- **No platform-admin override.** `PUT /groups/:id`, `DELETE /groups/:id`,
  `DELETE /groups/:id/members/:userId`, `PUT /groups/:id/members/:userId/role`,
  governance `execute`/`close`, event `cancel`/`delete`/`notify`, and all subgroup
  mutations are gated by **`requireGroupAdmin` / `requireGroupMember`** — admin
  *within that specific group*, derived from the user's membership row. A platform
  admin who is not a member of group G **cannot** edit/delete G or manage its
  members. (Verified in `services/nexus/src/routes/groups.js:153-349`.)
- **Only one real platform-admin route exists:** `POST /trending/update` uses
  `requireAdmin()` from `shared/middleware/roleValidator.js` (checks
  `userRole === 'admin'` from the CA token). Nothing else in nexus does.
- **Config endpoints are UNAUTHENTICATED.** `GET/POST /nexus/api/config/:section`
  have no auth middleware (`services/nexus/src/routes/config.js`; `API_SURFACE.md`
  marks them `Auth: none`). The admin Config tab is editing platform config over an
  open endpoint.
- **Frontend has no admin-role gate.** `RequireAuth` (`web/src/auth/RequireAuth.tsx`)
  checks *authenticated*, not *admin*. The `/admin/*` tree is reachable by any
  logged-in user; only backend 401/403s stop mutations — and for config, nothing does.
- **No analytics, no audit log, no cross-group views.** No group-stats endpoint
  (member counts/growth/activity), no "list all members across groups", no record
  of admin actions, no bulk operations.

**Consequence:** Surfacing group/member/governance management in the admin console
is *not* purely a frontend job — it first needs a backend platform-admin override
and the config endpoints secured. Without that, admin write buttons would 403 on
every group the operator doesn't personally belong to.

## 3. Foundation (Phase 0) — prerequisites for any admin write features

### 3.1 Platform-admin override in nexus (backend)
Decide and standardize how a *platform* admin is identified, then let it bypass the
group-scoped guards:
- Settle the source of truth: CA-token `role === 'admin'` (what nexus
  `requireAdmin()` already uses) vs the `PLATFORM_ADMIN_EMAILS` allowlist other
  modules reference (e.g. `web/src/api/admin/ca.ts` comment, filevault/timeline).
  Pick one and apply it consistently. (Recommend the CA-token role check nexus
  already has, so no new identity source.)
- Add an `allowPlatformAdmin` path to `requireGroupAdmin`/`requireGroupMember`
  (or a sibling guard) so a platform admin passes without a membership row. Apply
  to: group edit/delete, member remove/role, governance execute/close, event
  cancel/delete/notify, subgroup mutations.
- Keep the existing group-scoped behavior for normal users — this is purely an
  additional bypass for verified platform admins.

### 3.2 Secure the config endpoints (backend) — **do first; it's a hole**
Add `requireToken()` + `requireAdmin()` to `GET/POST /nexus/api/config/:section`.
Update `API_SURFACE.md` (currently documents `Auth: none`).

### 3.3 Frontend admin-role gate
Add a `RequireAdmin` wrapper (or extend `RequireAuth`) around the `/admin/*` tree so
non-admins don't see a console full of buttons that 403. Backend stays the
enforcement boundary; this is UX + defense-in-depth. (Other admin sections share
this gap — fixing it here benefits all.)

### 3.4 Group-centric IA (replace "paste a Group ID")
The Moderation and Events/Governance tabs require manually pasting a Group ID — a
real usability gap. Adopt the `AuthSection` org-detail pattern: clicking a group in
the **Groups** tab opens a **group detail admin view** with sub-tabs (Overview,
Members, Moderation, Events, Governance, Subgroups, Config-overrides). All the
group-scoped admin actions live there, seeded with the selected group's id.

### 3.5 Standing per-feature checklist
1. Backend guard/override + tests; `npm run db:check` clean if models change.
2. `API_SURFACE.md` updated (consult-before-wiring).
3. Admin API client method(s) in `web/src/api/admin/nexus.ts`.
4. UI built to Exprsn Unified design system, house admin conventions (§1).
5. `npm run lint` + `npm run web:build` green (required CI gates).

## 4. Phase 1 — Group & member management (needs Phase 0 override)

Surface the group-scoped endpoints as platform-admin actions inside the new group
detail view:
- **Edit group** — `PUT /groups/:id`: EditGroupDialog (reuse the user-side fields).
- **Delete group** — `DELETE /groups/:id`: confirm dialog (house pattern from
  `ModeratorSection` rule-delete).
- **Members admin** — `GET /groups/:id/members` (add to client) in a Members
  sub-tab; per-row **change role** (`PUT /…/members/:userId/role`) and **remove**
  (`DELETE /…/members/:userId`) with confirm. Mirrors `AuthSection` member role UI.
- Add the missing client methods (`updateGroup`, `deleteGroup`, `listMembers`,
  `changeMemberRole`, `removeMember`) to `web/src/api/admin/nexus.ts`.

## 5. Phase 2 — Moderation completeness (mostly frontend)

- **Wire `caseAssign()`** (already in the client, unused): add an "Assign
  moderators" dialog on a case.
- **Flag actions** — flags are currently read-only with no buttons. Add
  dismiss/escalate actions (confirm whether the backend exposes a flag-resolution
  route; if not, escalate-to-case via the existing case flow — note as a small
  backend add if missing).
- Move Moderation into the group detail view (id pre-seeded), keeping the standalone
  paste-id path optional for power users.

## 6. Phase 3 — Governance / events / subgroups admin actions

Turn the read-only "Inspect" tab into actionable sub-tabs (all need the Phase-0
override to work on arbitrary groups):
- **Governance** — `POST /governance/proposals/:id/execute`, `…/close`: buttons on
  passed/active proposals.
- **Events** — `POST /events/:id/cancel`, `DELETE /events/:id`, `POST /events/:id/notify`.
- **Subgroups** — create/edit/delete via the existing subgroup CRUD
  (`POST/PUT/DELETE /subgroups`), currently inspect-only.

## 7. Phase 4 — Analytics / stats dashboard (needs new backend)

Today there is **no** group analytics endpoint. To give the admin console an
overview dashboard:
- **Backend (new):** e.g. `GET /nexus/api/admin/stats` (totals: groups, members,
  events, active proposals; growth over a period) and
  `GET /nexus/api/admin/groups/:id/stats` (per-group member count, growth, activity).
  Reuse existing aggregate queries where possible. Gate with `requireAdmin()`.
- **Frontend:** an Overview tab with stat cards + a period selector, following
  `ModeratorSection`'s Metrics tab.

## 8. Phase 5 — Audit log & bulk operations (needs new backend)

- **Audit log (absent):** record admin actions (who deleted/edited what group,
  member removals, config changes). Backend: an `admin_audit` table + write on each
  privileged action + `GET /nexus/api/admin/audit`. Frontend: an Audit tab
  (filterable DataTable). High value once write actions exist (Phases 1–3).
- **Bulk operations (absent):** batch member removal / role changes / group actions.
  Backend bulk endpoints + multi-select UI. Lower priority.

## 9. Sequencing & rationale

```
Phase 0  Foundation: platform-admin override + SECURE CONFIG ENDPOINTS + admin-role gate + group-detail IA
Phase 1  Group & member management (edit/delete group, member role/remove)
Phase 2  Moderation completeness (wire caseAssign, flag actions)
Phase 3  Governance / events / subgroups admin actions
Phase 4  Analytics / stats dashboard            ← new backend endpoints
Phase 5  Audit log & bulk operations            ← new backend, depends on write actions existing
```

Phase 0 is non-negotiable: without the platform-admin override most write features
403 on groups the operator doesn't belong to, and the **unauthenticated config
endpoints are an active security hole that should be closed immediately** regardless
of the rest of the plan. Phases 1–3 are largely frontend once Phase 0 lands. Phases
4–5 require net-new backend surface.

## 10. Cross-cutting risks / watch-items

- **Config endpoints unauthenticated** — close before anything else (§3.2).
- **Admin identity ambiguity** — nexus `requireAdmin()` (token role) vs
  `PLATFORM_ADMIN_EMAILS` elsewhere; pick one platform-wide to avoid split-brain auth.
- **Frontend `/admin` is auth-only, not admin-only** — add `RequireAdmin` (§3.3).
- **Destructive actions on any group** — once the override lands, a platform admin
  can delete arbitrary groups; require confirm dialogs and (Phase 5) audit logging.
- **API_SURFACE.md** must be updated for every new/changed route.
- **Design system** — all UI uses Exprsn Unified tokens/theme, house admin conventions.
- **Required CI gates** are lint + web-build; add backend tests for the new
  override/guards even though the test job is non-blocking.

## 11. Open decision to confirm
**Should platform admins get a true override to manage any group (recommended for an
admin console), or should the admin section stay an oversight/inspection tool plus
the one platform-wide action (trending) it has today?** This determines whether
Phases 1–3 require the Phase-0 backend override or are dropped to read-only. The plan
above assumes *yes, add the override*.
