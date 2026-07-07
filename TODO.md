# To Do

Running list of to-dos for Rick. Add items as they come up; check them off when done.

## Open

_(empty — everything below shipped 2026-07-02 on `feature/lowcode-gap-closure`)_

## Done

### 2026-07-02

#### Admin > Organizations tab
- [x] Add/remove and filter columns in the table (column picker persists per table; per-column filter row)
- [x] Clicking a row opens the org inspector (same as clicking Details)
- [x] Sort by # groups, # users, # violations, date created — `GET /auth/api/organizations?include=counts` supplies the counts (violations = members' moderation items rejected/flagged/escalated, best-effort from the moderator schema)

#### Admin > Users tab
- [x] Add/remove and filter columns in the table
- [x] Clicking a row opens the User inspector — new full-page view backed by `GET /auth/api/users/:id/detail` (profile, organizations w/ member role, groups, roles, resolved permissions, recent sessions)

#### Admin > Groups tab
- [x] "New Group" opens an advanced modal: base R/W/A/U/D permissions, org scoping, parent group, and role bindings applied on create
- [x] Group templates (Blank / Team / Read-only / Moderators / Administrators) prefill the permission set

#### Admin > Roles & Permissions tab
- [x] Create new roles + role templates (Administrator / Moderator / Member / Auditor / Service account)
- [x] Add/remove and filter table headers
- [x] Clicking a row opens the role inspector (definition editable unless system role; assignments across users/groups/orgs; delete)
- [x] Role-to-group binding — "Bind group" in the role inspector (and role bindings in the group dialog); `GET /auth/api/roles/:id/assignments` shows the reach
- [x] Permission catalog expanded: collapsible per-service sections + "New permission" (`POST /auth/api/roles/permissions`) with service/scope assignment; permissions attach to roles, and groups get them via role bindings

#### Admin > Directory tab
- [x] Users actions wired: Create User (`POST /auth/api/users`), Import Users (CSV → `POST /auth/api/users/import`), Export Users (`GET /auth/api/users/export`)
- [x] Groups actions wired: Create Group (advanced modal), Import Groups (CSV → `POST /auth/api/groups/import`), Export Groups (client CSV)
- [x] Roles actions wired: Create Role (template dialog), Manage Permissions (jumps to Roles & Permissions)

#### Jobs and Queues
- [x] Moderation Settings: provider select — Exprsn moderation, an external service (e.g. Bluesky labeler URL), or both. Persisted in the new `timeline.timeline_config` table (LiveConfig pattern); config routes now admin-gated
- [x] "Require Approval for New Posts": mechanism select — manual, lowcode workflow (`appKey/flowKey` webhook trigger), lowcode app execution (hook-bus event `timeline.post.approval.requested`), or signed webhook. Held posts are forced private until a decision arrives via `POST /timeline/api/webhooks/approval` (HMAC) or admin `POST /timeline/api/posts/:id/approval`

#### Groups (Nexus)
- [x] Groups tab: advanced group creation modal — template presets (Open community / Club / Private team / Moderated forum / DAO) + advanced options (governance model, category, tags, member limit, website)
- [x] Calendar tab: month-view group calendar, group contact list (members as vCards, .vcf export), and per-group sync URLs for iCal feed, CalDAV and CardDAV (nexus `/api/calendar` endpoints)
  - Also fixed pre-existing DAV bugs found during verification: icalService used removed `$gte` operators + fed BIGINT epoch strings to moment(); carddavService crashed on bigint `joinedAt` — both endpoints 500'd before, verified working now
  - Note: the CalDAV/CardDAV endpoints are GET-based (JSON/ics/vcf) — full RFC PROPFIND/REPORT verbs for native OS account sync are a future enhancement

#### Bugs
- [x] Config > Events bigint error — `services/nexus/src/routes/config.js` passed `new Date()` into the BIGINT epoch-ms `start_time` column; now `Date.now()` against the `startTime` attribute
