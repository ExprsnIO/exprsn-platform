# Groups Frontend Expansion — Plan

> Status: **IMPLEMENTED (2026-06-28).** All phases (0–6) built: cross-module
> membership guard + permission matrix + `useGroupContext` + 9-tab IA, the
> ready-now nexus gaps (edit/delete, member mgmt, events lifecycle, subgroups),
> and the cross-module slices Posts (Timeline), Galleries/Files (FileVault),
> Messages (Spark), Live (Live+nexus Events) and Secrets (Vault). Each module
> got its `group_id` migration, group-scoped routes behind the shared guard, and
> a frontend tab. Gates green: `lint` (0 errors), `web:build`, `db:check` (no
> drift). Not committed. Original scope decisions (2026-06-27): architecture =
> *direct module calls* (SPA → owning module, passing `groupId`); first slice =
> *Posts / group feed*.

## 1. Where the Groups frontend stands today

Frontend lives in `web/src/features/groups/` + `web/src/api/nexus.ts`.

Implemented: group discovery (list / search / nearby), create group, join/leave,
member list (read), **read-only** events, full governance/proposals flow, and an
admin console section (`web/src/features/admin/sections/NexusSection.tsx`).

Routes: `/groups`, `/groups/:id` (tabs: About, Members, Events).

## 2. The key architectural finding

**No target module is group-aware.** Verified against source:

- **Timeline** `Post` model — no `groupId`; feeds query by `userId` only.
- **FileVault** `File`/`Directory`/`ShareLink` — owner is `user_id` only; no
  group ownership, no album/gallery concept; thumbnails are generated
  (`thumbnailService.js`) but **no HTTP route serves them**.
- **Vault** `Secret` — no owner/ACL field (`createdBy` is audit-only); access is
  enforced purely by token path-prefix. `VaultToken.entityType` *can* be
  `'group'`, so the token layer is group-ready but the data layer is not.
- **Live** `Stream`/`Room`/`Event` — user-owned only; no `groupId`. Note: the
  **live** `Event` table is separate from the **nexus** `Event` table (which
  already has `groupId`) — they are not linked.
- **Spark** `Conversation` — has `type:'group'` (multi-party) but **no link to a
  nexus group**; no membership sync; all messaging is peer-to-peer.

**Consequence:** "direct module calls" does not remove backend work. Each feature
needs, in its owning module: (a) a schema migration adding group association,
(b) new group-scoped REST routes (+ socket rooms where real-time), and (c) a
group-membership/permission guard. The SPA then calls those new routes directly.

## 3. Foundation (Phase 0) — shared prerequisites

These are needed by *every* cross-module feature; build once, first.

### 3.1 Cross-module group-membership authorization
Each module must answer "is user U a member of group G, and with what role?"
before serving group-scoped content. Nexus owns membership.

- **Add an internal nexus endpoint** for authorization, e.g.
  `GET /nexus/api/internal/groups/:id/membership/:userId` → `{ isMember, role,
  visibility, joinMode }`, callable service-to-service via the per-service HMAC
  token (`SERVICE_TOKEN_SECRET`, `SERVICE_ID=platform`). (Nexus already calls
  Moderator/Herald this way; this is the inverse direction.)
- **Add a shared helper** in `shared/` + `services/shared/` (keep both copies in
  sync per CLAUDE.md), e.g. `requireGroupMembership(role)` middleware that reads
  `groupId` from params/body, calls the nexus endpoint, caches in Redis (short
  TTL, mirrors the existing CA-token cache pattern), and 403s on failure.
- Each consuming module (timeline, filevault, vault, live, spark) imports this.

### 3.2 Permission matrix (decide once, enforce everywhere)
Define per-role capability for group content. Proposed default:

| Capability | owner | admin | moderator | member | non-member |
|---|---|---|---|---|---|
| View member-only content | ✓ | ✓ | ✓ | ✓ | ✗ (public groups: read public posts only) |
| Post / comment | ✓ | ✓ | ✓ | ✓ | ✗ |
| Upload files / gallery media | ✓ | ✓ | ✓ | ✓ | ✗ |
| Delete others' content | ✓ | ✓ | ✓ | ✗ | ✗ |
| Group→members broadcast / announce | ✓ | ✓ | ✗ | ✗ | ✗ |
| Go live for the group | ✓ | ✓ | ✗ | ✗ | ✗ |
| Manage group secrets | ✓ | ✓ | ✗ | ✗ | ✗ |
| Edit group / manage members | ✓ | ✓ | ✗ | ✗ | ✗ |

`visibility` (public/private/unlisted) gates whether non-members see anything.

### 3.3 Information architecture / navigation
`GroupDetailPage` grows from 3 tabs to ~9 (About, Posts, Members, Events,
Galleries, Files, Messages, Live, Secrets). Plan a scalable layout:
- Use a secondary nav (sidebar-within-group or overflow tab menu).
- Gate tabs by capability (hide Secrets/Live for members without rights; hide
  member-only tabs entirely for non-members of private groups).
- Establish a `useGroupContext(groupId)` hook providing `{ group, membership,
  role, can(capability) }` so every tab shares one source of truth. (Today each
  component re-fetches membership ad hoc.)

### 3.4 Standing per-feature checklist
For each cross-module feature below, "done" means:
1. Migration added; `npm run db:migrate` + `npm run db:check` clean (drift gate).
2. New routes + membership guard + tests in the owning module.
3. `API_SURFACE.md` updated (consult-before-wiring rule).
4. Frontend API client method(s) added under `web/src/api/`.
5. UI tab built to the Exprsn Unified design system (`--exprsn-*` tokens / MUI
   theme, light+dark) per the design-system standard.
6. `npm run lint` + `npm run web:build` green (the two required CI gates).

## 4. Phase 1 — Backend-ready frontend gaps (no backend work)

Pure frontend against endpoints nexus already exposes. Lowest risk; ship first.

- **Group edit / delete** — `PUT /nexus/api/groups/:id`, `DELETE /…`. Add an
  EditGroupDialog (reuse CreateGroupDialog fields) + delete action (owner only).
- **Member management** — `PUT /…/members/:userId/role`,
  `DELETE /…/members/:userId`, `POST /…/invite`,
  `POST /…/join-requests/:rid/approve|reject`. Add role chips with
  promote/demote/remove menus and a pending-join-requests panel (admin only) in
  the Members tab.
- **Events — full lifecycle** — `POST /events`, `PUT /events/:id`,
  `POST /events/:id/cancel`, `DELETE /events/:id`, RSVP
  (`POST|DELETE /events/:id/rsvp`), attendees (`GET /events/:id/attendees`),
  reminders (`POST|PUT|DELETE /events/:id/reminders`). Add CreateEventDialog,
  RSVP buttons, attendee list, reminder presets. Turns the read-only Events tab
  into a working calendar.
- **Subgroups / channels** — `POST|GET|PUT|DELETE /subgroups`,
  `POST|DELETE /subgroups/:id/members`. Add a Channels panel.
- **Recommendations** (optional) — `GET /nexus/api/recommendations` to enrich the
  Discover tab.

Add all of these to `web/src/api/nexus.ts` (extend the existing client).

## 5. Phase 2 — Posts / group feed (FIRST cross-module slice)

Proves the end-to-end pattern (migration → group route → member guard → socket
room → SPA client → tab). Build this fully before replicating to other features.

**Backend (Timeline):**
- Migration: add `group_id UUID NULL` to `posts`; index `(group_id, created_at)`.
- `POST /timeline/api/posts` accepts optional `groupId`; on group posts, enforce
  membership via the Phase-0 guard and force visibility semantics (member-only
  for private groups).
- New `GET /timeline/api/timeline/group/:groupId` (paginated group feed) with the
  member guard.
- Socket: add room `timeline:group:{groupId}`; emit `new:post`/`post:liked`/
  `post:commented` scoped to it (today only `timeline:global` exists).
- Reuse existing comments / likes / reposts / attachments (already polymorphic;
  attachments already delegate to FileVault).

**Frontend:**
- `timelineApi.groupFeed(groupId, params)` + `createGroupPost(groupId, …)` in
  `web/src/api/timeline.ts`.
- New **Posts** tab in GroupDetailPage: composer (member-gated), feed list,
  like/comment/repost, media attach, live updates via the group socket room.

## 6. Phase 3 — Galleries + shared files (FileVault)

**Backend (FileVault):**
- Migration: add `group_id UUID NULL` + `owner_type ENUM('user','group')` to
  `files` and `directories`; index `(group_id, owner_type, is_deleted)`.
- New routes: `GET /filevault/api/groups/:groupId/files`,
  `POST /filevault/api/groups/:groupId/files/upload`, group-scoped directory
  listing — all behind the member guard (write capability for upload).
- **Expose thumbnails**: `GET /filevault/api/thumbnails/:fileId?size=…` (service
  exists, route missing) — required for a usable gallery grid.
- Galleries: simplest = filter `mimetype LIKE 'image/%'` within a group directory.
  Richer = new `Album`/`AlbumImage` models + CRUD (decide during this phase;
  start with mimetype-filtered directories to ship sooner).

**Frontend:**
- `filevaultApi.listGroupFiles`, `uploadToGroup`, `getThumbnail` in
  `web/src/api/filevault.ts`.
- **Files** tab (list/upload/download/delete) and **Galleries** tab (thumbnail
  grid + lightbox), member-gated.

## 7. Phase 4 — Messaging: user↔group / group↔user (Spark)

Clarify the two semantics:
- **Group channel** — members chat together (a `Conversation` bound to the group;
  membership mirrors the nexus group).
- **Group announcements** — admins broadcast to all members (group→user); a
  restricted-write channel.

**Backend (Spark):**
- Migration: add `group_id UUID NULL` and extend `Conversation.type` (or add
  `entity_type`) to include a `'channel'`/group-bound kind.
- Auto-provision a group conversation on first access; sync participants from
  nexus membership (join/leave → add/remove) via the Phase-0 guard.
- Restrict who can post in announcement channels (admin-only write).
- Reuse existing `/spark` socket namespace (already fail-closed CA-auth) and
  message/typing/read events.

**Frontend:**
- Extend `web/src/api/spark.ts` for group-bound conversations.
- **Messages** tab: real-time chat via the `/spark` socket; announcements view for
  admins to broadcast.

## 8. Phase 5 — Host live events (Live + nexus Events)

**Backend (Live):**
- Migration: add `group_id UUID NULL` to `streams` (and `rooms` if group rooms are
  in scope); group-admin auth on create/start/stop.
- Link nexus Event ↔ live Stream: add `live_stream_id` to nexus `Event` (nexus
  Event already has `groupId`), so an event can "go live". (Per-event WebRTC auth
  in the `/live` namespace was resolved in SP-7 — `requireAuthed` guards host/
  publish events — so signaling auth is already in place.)

**Frontend:**
- `liveApi` additions for group-scoped create + the event link.
- "Go live" action on a group Event (admin); watch/embed view for members. Ties
  into the Phase-1 Events tab.

## 9. Phase 6 — Shared keys / secrets (Vault)

> ⚠️ Highest-sensitivity feature. Surfacing secrets inside a social-group UI
> widens the blast radius of a leak. Recommend explicit sign-off on scope and a
> reveal-on-demand-only UX (never list plaintext).

**Backend (Vault):**
- Either a `SecretGroupAccess` ACL table (`secret_id`, `group_id`, `permission`,
  `granted_by`, `expires_at`) **or** `owner_type`/`owner_id` columns on `Secret`.
- New routes: `GET /vault/api/groups/:groupId/secrets` (metadata only),
  `POST /…/secrets/:path/share`, `DELETE /…/secrets/:path/share/:groupId`, each
  behind the member guard (manage = admin-only). The existing
  `entityType:'group'` vault token remains the access credential.

**Frontend:**
- `vaultApi` group methods in `web/src/api/vault.ts`.
- **Secrets** tab: list (names only), reveal-on-click (admin), share/revoke.

## 10. Sequencing & rationale

```
Phase 0  Foundation: membership-auth helper + permission matrix + IA/tabs + useGroupContext
Phase 1  Ready-now frontend gaps (edit, roles, events lifecycle, subgroups)   [no backend]
Phase 2  Posts / group feed (Timeline)         ← first cross-module slice, proves the pattern
Phase 3  Galleries + files (FileVault)
Phase 4  Messaging (Spark)
Phase 5  Live events (Live + nexus Events)
Phase 6  Secrets (Vault)                        ← last; highest risk, needs sign-off
```

Phase 1 ships visible value immediately with zero backend risk. Phase 2 is the
reference implementation for the cross-module pattern; Phases 3–6 replicate it.
Each phase is independently shippable.

## 11. Cross-cutting risks / watch-items

- **Membership-check fan-out / latency** — every group-scoped request hits nexus;
  the Redis-cached guard (Phase 0) is essential. Mirror the existing CA-token
  cache TTL.
- **Schema drift gate** — every migration must pass `npm run db:check`; a model
  column with no DB column 500s every query on that table (CLAUDE.md).
- **Keep `shared/` and `services/shared/` in sync** when adding the guard.
- **API_SURFACE.md** must be updated per feature before wiring the SPA.
- **Two required CI gates** are lint + web-build; the test job is non-blocking but
  add module tests anyway (membership guard, group routes).
- **Privacy** — private-group content must be member-only across *all* tabs;
  enforce server-side, not just by hiding UI.
- **Design system** — all new UI uses the Exprsn Unified tokens/theme, light+dark.

## 12. Out of scope (call out explicitly)
- Multi-gateway socket scaling (spark redis-adapter ownership) — deferred for MVP
  (single gateway instance).
- Rich gallery albums (vs mimetype-filtered directories) — optional within Phase 3.
- Group rooms (multi-party WebRTC) vs broadcast streams — Phase 5 starts with
  broadcast; rooms optional.
