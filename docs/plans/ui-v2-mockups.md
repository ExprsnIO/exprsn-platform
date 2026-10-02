# Exprsn UI v2 — design mockups (user app + admin console)

**Ticket:** TASK-074 · **Status:** proposed (design only, nothing implemented) · **Builds on:** [Design.md](Design.md) (TASK-073, the written admin spec)
**Mockups:** [`mockups/v2/index.html`](../../mockups/v2/index.html). Open it in a browser. Every screen is a static HTML file, and the pages have no build step.

This document explains the v2 mockups, which cover every SPA route and every admin section. Three things are covered:

- **What changed and why.** The palette and themes stay identical; the changes are to layout, hierarchy and interaction.
- **The component kit.** Implementers should map it to MUI.
- **The contract.** Every screen lists the REST routes and Socket.IO events it depends on. §7 is a generated matrix proving that every route and event in the code is either bound to a screen or explicitly marked as having no UI.

---

## 1. Scope and ground rules

| Rule | How it's enforced |
|---|---|
| Keep colours and themes | `mockups/v2/tokens.css` is a value-for-value copy of `web/src/styles/exprsn-unified.css`, covering light `:root` and `[data-theme="dark"]`. `tools/check-tokens.js` fails on any difference, and on any colour literal in a page or in the kit. The only additions are **aliases** of existing tokens, such as `--v2-primary-fg` (listed in §4.1). |
| Theme resolution unchanged | An explicit `data-theme` wins, then `prefers-color-scheme`. The preference is stored under the same `exprsn-theme` localStorage key that `web/public/theme-init.js` uses. |
| Every route, every section | There is one file per route in `web/src/app/router.tsx` and one per section in `web/src/features/admin/AdminLayout.tsx`. One admin screen is new: the Organization explorer from Design.md §8. |
| REST + socket coverage | Every screen embeds a contract (§6). `tools/coverage.js` checks those contracts against `tools/inventory.json`, which is built from the route files and socket handlers. |
| Accessible and responsive | `tools/check-pages.js` renders each page in light and dark, at 1440px and at 390px. It fails on console errors, broken links, and horizontal overflow at phone width. With `--axe` it also fails on serious or critical axe-core violations. |

Out of scope: runtime code. The backend defects found while building the inventory are listed in §8 as prerequisites and are not fixed here.

## 2. What's new in v2 (UX direction)

The v1 SPA already has the right tokens. What it lacks is hierarchy: every page is a column of equally weighted MUI Papers, the sidebar is one long list, and realtime state is either invisible or a single status line. v2 keeps the visual language and changes the structure:

1. **A quiet top bar and a structured sidebar.**
   - The top bar is 56px and translucent (HIG material), and carries only global items: search/⌘K, the realtime pill, the theme toggle, notifications and the account menu.
   - The sidebar sections (Workspace / Security; admin: Infrastructure / Services / Applications) collapse and remember their state. The whole sidebar collapses to a 72px icon rail.
2. **Large-title page headers.** Each page has breadcrumbs, a large title (28px, 700, -0.02em), a one-line purpose statement, and the page's actions on the right. There is only **one primary action per view**.
3. **Phone-first navigation.** Below 600px the sidebar becomes a bottom tab bar with 4 destinations plus More, which opens the drawer. Master–detail screens (Messages, Files, moderation queue) collapse to a single pane with a back button.
4. **⌘K command palette everywhere.** It jumps to any screen, and in the admin console it also looks up records (users, tokens, DIDs, CIDs, jobs), per Design.md §3.3.
5. **Realtime you can see.**
   - The top-bar pill shows the shared Socket.IO connection. It cycles through Connected → Reconnecting → Offline in the mockups.
   - When degraded, a banner states the consequence ("changes are queued", "data may be a few seconds old").
   - Live counters and "N new posts" pills are bound to specific events. The UI never reflows silently under the reader.
6. **Optimistic writes with rollback.** Sending, liking, RSVPs and toggles render immediately. A failure turns into inline retry copy instead of a modal.
7. **Designed states.** Every data region has four designed states: loaded, empty (explains what will appear and how to add the first item), loading (skeletons shaped like the content), and error (says what failed, reassures, gives a correlation id, and offers Retry). The Contract drawer switches between them.
8. **Destructive actions follow one pattern.** They sit on the left of the dialog footer as `danger-outline`. They open a confirmation that names the object, such as "Revoke token `tok_91be…`". Nothing destructive is a single click.
9. **The admin console follows Design.md.**
   - There is one canonical DataTable (§6.1): search, filter chips, group-by, a column chooser with pinning, sticky header, selection feeding a bulk bar, and server pagination.
   - Dialogs come in `sm`, default and `lg` sizes.
   - An org switcher in the top bar scopes the whole console.

## 3. Information architecture

### 3.1 User app (`data-shell="app"`)

| Nav group | Screens (file → SPA route) |
|---|---|
| Workspace | `home` → `/` (was "Health"; now a personal dashboard with platform status in a card) · `messages` → `/messages` · `feed` → `/feed` · `search` → `/search` · `bookmarks` → `/bookmarks` · `files` → `/files` · `groups` → `/groups` · `people` → `/people` · `streams` → `/streams` · `rooms` → `/rooms` · `apps` → `/apps` · `cortex` → `/cortex` · `orgs` → `/orgs` |
| Security | `moderation` → `/moderation` (renamed **Notifications & reports**) · `vault` → `/secrets` · `certs` → `/certs` · `settings` → `/settings` |
| Detail views | `post` → `/feed/:id` · `group` → `/groups/:id` · `profile` → `/people/:id` · `watch` → `/streams/watch/:id` · `room` → in-call view for `/rooms` · `cortex-task` → `/cortex/tasks/:id` · `not-found` → `*` |
| Public (no shell) | `login` → `/login` (+ MFA step) · `signup` → `/signup` · `sso-callback` → `/sso/callback` · `accept-invite` → `/accept-invite` · `share` → `/s/:shareLinkId` · `form` → `/f/:slug` |

### 3.2 Admin console (`data-shell="admin"`)

| Nav group | Screens |
|---|---|
| (top) | `overview` · `platform` · `orgs` (**new**, Design.md §8) |
| Infrastructure | `ca` · `auth` · `identity-groups` · `users` · `roles` · `permissions` · `scopes` · `atproto` · `ai` |
| Services | `timeline` · `nexus` · `live` · `vault` · `filevault` · `spark` · `jobs` · `prefetch` |
| Applications | `lowcode` (+ `lowcode-entity`, `lowcode-flow`) · `cortex` · `plugins` · `moderator` |

The navigation data lives in one place, `mockups/v2/shell.js` (`APP_NAV`, `ADMIN_NAV`, `*_DETAIL`, `PUBLIC_PAGES`). The sidebar, the tab bar, the palette and the gallery all read from it. The build should do the same with a single typed route manifest.

## 4. Component kit → implementation map

`mockups/v2/components.css` is the kit. Class names are stable so an implementer can grep for them.

| Kit class | Purpose | Build with |
|---|---|---|
| `.topbar`, `.sidebar`, `.nav-group`, `.nav-link`, `.tabbar` | App and admin shells | `RootLayout.tsx` / `AdminLayout.tsx` (restyle; keep the existing `NAV_SECTIONS`) |
| `.page-header`, `.crumbs`, `.page-title`, `.page-actions` | Large-title header | New `PageHeader` component |
| `.btn` `.primary/.tonal/.outline/.ghost/.danger/.danger-outline/.sm` | Buttons (44px target; 32px `.sm` for dense tables with a fine pointer) | MUI `Button` variants: contained / soft (custom) / outlined / text |
| `.pill`, `.badge`, `.chip` | Status, counts, filters | MUI `Chip` (pill/filter), `Badge` |
| `.card`, `.stat`, `.spark`, `.meter` | Surfaces, KPI tiles, sparklines, meters | `Paper`/`Card`, and a small `StatTile` with an SVG sparkline |
| `.dt*`, `table.table`, `.id`, `.secret` | Canonical DataTable (Design.md §6.1) | The existing DataTable, extended with filter chips, group-by, pinning and a bulk bar |
| `.tabs`, `.seg` | Tabs and segmented controls | MUI `Tabs`, `ToggleButtonGroup` |
| `.field`, `.input`, `.select`, `.textarea`, `.input-group`, `.switch`, `.stepper`, `.otp` | Forms | MUI `TextField`, `Select`, `Switch`, `Stepper`, and a custom OTP input |
| `dialog.dialog(.sm/.lg)` | Dialog system (Design.md §6.4) | MUI `Dialog` with `maxWidth` of sm/md/lg |
| `.palette` | ⌘K command palette | New `CommandPalette` (cmdk-style) |
| `.contract` | Contract drawer | **Mockup only.** It isn't shipped; it documents the bindings. |
| `.empty`, `.sk`, `.banner`, `.toast` | Designed states and feedback | `EmptyState`, `Skeleton`, `Alert`, `Snackbar` |
| `.md`, `.md-list`, `.md-detail` | Master–detail layout | Split layout with a responsive single pane |
| `.msgs`, `.msg`, `.bubble`, `.composer`, `.typing` | Chat | Messages feature |
| `.post`, `.post-actions`, `.new-posts` | Timeline posts | Timeline feature |
| `.video`, `.control-bar`, `.round-btn`, `.live-tag` | Streams and rooms | Streams / Rooms features |
| `.canvas`, `.node`, `svg.edges` | Flow designer | `reactflow` (already a dependency) themed to these tokens |
| `.cal` | Month calendar | Groups events tab |
| `.file-tile`, `.drop` | File grid and upload | Files feature |

### 4.0 Patterns to promote into the kit when building

Builders kept these page-local (token-only `<style>` blocks). Each one appears on two or more screens and belongs in the shared component library:

| Pattern | Used on |
|---|---|
| Chart primitives: bar/line/grid classes, legend swatch, stacked vote bar | admin overview, prefetch, timeline, nexus, live; group governance |
| State-machine diagram (`.smd`) | lowcode-entity, plugins |
| Tree list (`.tree`, `.ptree`) | files, vault, orgs explorer |
| Radio option cards (`.opt`, `.plan-opt`) | signup, admin/ca token expiry, settings |
| Diff viewer (`.diff`) | files (versions) |
| Certificate chain (`.chain`) | certs, admin/ca |
| Step list with state dots (`.steps`) | cortex-task, sso-callback, lowcode flow runs |
| Inset master–detail (`.md.inset`) | admin/moderator |
| Mockup-only step preview bar (`.demo-bar`) | public pages (not for the build) |

### 4.1 Tokens added by v2 (aliases only)

These resolve to existing `--exprsn-*` values, so the palette doesn't change. They exist because axe found several small-text contrast failures when raw tokens were used on tints. Add them to `exprsn-unified.css` / `tokens.ts` when the build adopts v2.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--v2-primary-fg` | `--exprsn-primary-hover` (#0052cc) | `--exprsn-primary-hover` (#60a5fa) | Primary-coloured text on page surfaces and on primary tints (active nav, tonal buttons, pressed chips) |
| `--v2-ok-fg` / `--v2-warn-fg` / `--v2-danger-fg` / `--v2-violet-fg` | `-text` shades / `secondary-dark` | saturated mains / `-emphasis` | Small semantic text outside pills, such as stat deltas, method labels, `danger-outline` buttons and violet pills |
| `--v2-focus-ring` | `0 0 0 3px primary-glow, 0 0 0 1px primary` | same | Every `:focus-visible` |
| `--v2-hit` / `--v2-hit-compact` | 44px / 36px | — | Touch targets (HIG) / dense admin tables with a fine pointer |
| `--v2-radius-control` / `--v2-radius-card` | 12 / 16 | — | Same as the current MUI overrides |

## 5. Accessibility and HIG checklist (applies to every screen)

- WCAG 2.2 AA contrast holds in both themes. Tinted surfaces use the theme-invariant `-bg`/`-text` pairs (BUG-050). Solid primary fills use `--exprsn-text-on-primary` (BUG-048).
- Every target is at least 44×44 CSS px. The only exception is dense admin tables with a fine pointer, which use 36px.
- There is a visible focus ring, a skip link, one `h1` per page, labelled icon buttons, `aria-labelledby` dialogs, and keyboard-operable tabs (arrow keys) and palette (↑↓↵, Esc).
- `prefers-reduced-motion` zeroes the transitions and stops the shimmer and typing animations. `prefers-contrast: more` strengthens borders.
- Realtime regions are `role="log"` / `aria-live="polite"`. Offline and reconnecting banners are `role="status"`.
- Status never depends on colour alone: every pill has text, and presence dots have labels.

## 6. The screen contract

Each mockup ends with `<script type="application/json" id="contract">`:

```json
{ "notes": "interaction model",
  "rest":   [{ "m": "GET", "p": "/spark/api/conversations", "auth": "user", "ui": "Conversation list" }],
  "socket": [{ "ns": "/spark", "auth": "CA bearer", "rooms": ["conversation:{id}"],
               "emit": [{ "e": "join:conversation", "ui": "Selecting a conversation" }],
               "on":   [{ "e": "new:message", "ui": "Appends to log" }] }],
  "gaps":   [{ "sev": "high", "text": "…" }] }
```

How the Contract drawer uses it:

- The drawer opens from the `</>` pill in the top bar or with the `C` key. It lists the contract and switches the demo state.
- Clicking a row highlights the UI it drives. Elements carry `data-api`, `data-on` and `data-emit` attributes.
- Clicking an `ON` row simulates the event with a toast.

Auth classes used in contracts:

| Class | Meaning |
|---|---|
| `user` | CA bearer |
| `A` | Platform admin |
| `S` | Service HMAC |
| `P` | Public |
| `owner` / `grp-admin` / `app-admin` | Resource-scoped |

## 7. Coverage matrix (generated)

<!-- coverage:start -->
_Generated by `node mockups/v2/tools/coverage.js --write` from each screen's contract JSON and `mockups/v2/tools/inventory.json`. Do not edit by hand._

**591 of 610 REST routes** are bound to at least one screen and the other 19 are marked no-UI with a reason. **118 of 135 Socket.IO events** are bound; the rest are marked no-UI. 56 screens in total.

### Socket.IO events → screens

| Namespace | Dir | Event | Screens / reason |
|---|---|---|---|
| `/_health` | S→C | `health` | [app/home](../../mockups/v2/app/home.html), [admin/overview](../../mockups/v2/admin/overview.html) |
| `/_admin` | S→C | `health` | [admin/jobs](../../mockups/v2/admin/jobs.html), [admin/nexus](../../mockups/v2/admin/nexus.html), [admin/overview](../../mockups/v2/admin/overview.html), [admin/platform](../../mockups/v2/admin/platform.html), [admin/users](../../mockups/v2/admin/users.html) |
| `/_admin` | S→C | `config:changed` | [admin/auth](../../mockups/v2/admin/auth.html), [admin/orgs](../../mockups/v2/admin/orgs.html), [admin/overview](../../mockups/v2/admin/overview.html), [admin/platform](../../mockups/v2/admin/platform.html), [admin/timeline](../../mockups/v2/admin/timeline.html), [admin/users](../../mockups/v2/admin/users.html) |
| `/ca` | S→C | `pong` | [app/certs](../../mockups/v2/app/certs.html) |
| `/ca` | S→C | `certificate:created` | [app/certs](../../mockups/v2/app/certs.html) |
| `/ca` | S→C | `certificate:revoked` | [app/certs](../../mockups/v2/app/certs.html) |
| `/ca` | S→C | `certificates:updated` | [app/certs](../../mockups/v2/app/certs.html), [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca` | S→C | `token:created` | [app/certs](../../mockups/v2/app/certs.html) |
| `/ca` | S→C | `token:revoked` | [app/certs](../../mockups/v2/app/certs.html) |
| `/ca` | S→C | `token:validated` | _no UI: dead code: helper exists but nothing calls it (prereq P3)_ |
| `/ca` | S→C | `token:used` | _no UI: dead code: helper exists but nothing calls it (prereq P3)_ |
| `/ca` | S→C | `tokens:updated` | [app/certs](../../mockups/v2/app/certs.html), [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca` | S→C | `user:login` | _no UI: dead code: helper exists but nothing calls it (prereq P3)_ |
| `/ca` | S→C | `dashboard:stats` | [app/certs](../../mockups/v2/app/certs.html), [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca` | S→C | `user:created` | _no UI: dead code: helper exists but nothing calls it (prereq P3)_ |
| `/ca` | S→C | `user:updated` | _no UI: dead code: helper exists but nothing calls it (prereq P3)_ |
| `/ca` | S→C | `user:deleted` | _no UI: dead code: helper exists but nothing calls it (prereq P3)_ |
| `/ca` | S→C | `group:created` | _no UI: dead code: helper exists but nothing calls it (prereq P3)_ |
| `/ca` | S→C | `group:updated` | _no UI: dead code: helper exists but nothing calls it (prereq P3)_ |
| `/ca` | S→C | `role:created` | _no UI: dead code: helper exists but nothing calls it (prereq P3)_ |
| `/ca` | S→C | `system:health` | _no UI: dead code: helper exists but nothing calls it (prereq P3)_ |
| `/ca` | S→C | `moderation:event` | _no UI: dead code: helper exists but nothing calls it (prereq P3)_ |
| `/ca` | S→C | `system:notification` | _no UI: dead code: helper exists but nothing calls it (prereq P3)_ |
| `/ca` | C→S | `certificate:subscribe` | [app/certs](../../mockups/v2/app/certs.html), [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca` | C→S | `certificate:unsubscribe` | [app/certs](../../mockups/v2/app/certs.html) |
| `/ca` | C→S | `token:subscribe` | [app/certs](../../mockups/v2/app/certs.html), [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca` | C→S | `token:unsubscribe` | [app/certs](../../mockups/v2/app/certs.html) |
| `/ca` | C→S | `dashboard:subscribe` | [app/certs](../../mockups/v2/app/certs.html), [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca` | C→S | `ping` | [app/certs](../../mockups/v2/app/certs.html) |
| `/spark` | S→C | `joined:conversation` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark` | S→C | `left:conversation` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark` | S→C | `error` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark` | S→C | `new:message` | [app/group](../../mockups/v2/app/group.html), [app/messages](../../mockups/v2/app/messages.html) |
| `/spark` | S→C | `typing:start` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark` | S→C | `typing:stop` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark` | S→C | `read:receipt` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark` | S→C | `new:reaction` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark` | S→C | `message:edited` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark` | S→C | `message:deleted` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark` | S→C | `user:status` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark` | S→C | `message:new` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark` | S→C | `message:pinned` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark` | S→C | `message:unpinned` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark` | S→C | `message:reply` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark` | S→C | `participant:added` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark` | S→C | `message:redacted` | [app/group](../../mockups/v2/app/group.html), [app/messages](../../mockups/v2/app/messages.html) |
| `/spark` | C→S | `join:conversation` | [app/group](../../mockups/v2/app/group.html), [app/messages](../../mockups/v2/app/messages.html) |
| `/spark` | C→S | `leave:conversation` | [app/group](../../mockups/v2/app/group.html), [app/messages](../../mockups/v2/app/messages.html) |
| `/spark` | C→S | `send:message` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark` | C→S | `typing:start` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark` | C→S | `typing:stop` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark` | C→S | `mark:read` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark` | C→S | `add:reaction` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark` | C→S | `edit:message` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark` | C→S | `delete:message` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark` | C→S | `presence:update` | [app/messages](../../mockups/v2/app/messages.html) |
| `/vault` | S→C | `connected` | [app/vault](../../mockups/v2/app/vault.html) |
| `/vault` | S→C | `pong` | _no UI: keepalive only_ |
| `/vault` | S→C | `token:event` | [app/vault](../../mockups/v2/app/vault.html), [admin/vault](../../mockups/v2/admin/vault.html) |
| `/vault` | S→C | `policy:event` | [admin/vault](../../mockups/v2/admin/vault.html) |
| `/vault` | S→C | `security:alert` | [app/vault](../../mockups/v2/app/vault.html), [admin/vault](../../mockups/v2/admin/vault.html) |
| `/vault` | S→C | `stats:update` | [admin/vault](../../mockups/v2/admin/vault.html) |
| `/vault` | S→C | `cache:stats` | [admin/vault](../../mockups/v2/admin/vault.html) |
| `/vault` | S→C | `audit:log` | [app/vault](../../mockups/v2/app/vault.html), [admin/vault](../../mockups/v2/admin/vault.html) |
| `/vault` | S→C | `notification` | _no UI: dead code: emitter has no callers (prereq P2)_ |
| `/vault` | S→C | `server:shutdown` | [app/vault](../../mockups/v2/app/vault.html), [admin/vault](../../mockups/v2/admin/vault.html) |
| `/vault` | C→S | `subscribe` | [app/vault](../../mockups/v2/app/vault.html) |
| `/vault` | C→S | `unsubscribe` | [app/vault](../../mockups/v2/app/vault.html) |
| `/vault` | C→S | `ping` | [app/vault](../../mockups/v2/app/vault.html) |
| `/timeline` | S→C | `subscribed:timeline` | [app/feed](../../mockups/v2/app/feed.html) |
| `/timeline` | S→C | `unsubscribed:timeline` | _no UI: ack only_ |
| `/timeline` | S→C | `subscribed:group` | _no UI: ack only_ |
| `/timeline` | S→C | `unsubscribed:group` | _no UI: ack only_ |
| `/timeline` | S→C | `error` | [app/feed](../../mockups/v2/app/feed.html) |
| `/timeline` | S→C | `new:post` | [app/feed](../../mockups/v2/app/feed.html), [app/group](../../mockups/v2/app/group.html), [app/home](../../mockups/v2/app/home.html), [app/profile](../../mockups/v2/app/profile.html), [admin/timeline](../../mockups/v2/admin/timeline.html) |
| `/timeline` | S→C | `post:liked` | [app/bookmarks](../../mockups/v2/app/bookmarks.html), [app/feed](../../mockups/v2/app/feed.html), [app/group](../../mockups/v2/app/group.html), [app/home](../../mockups/v2/app/home.html), [app/post](../../mockups/v2/app/post.html), [app/profile](../../mockups/v2/app/profile.html) |
| `/timeline` | S→C | `post:commented` | [app/bookmarks](../../mockups/v2/app/bookmarks.html), [app/feed](../../mockups/v2/app/feed.html), [app/group](../../mockups/v2/app/group.html), [app/home](../../mockups/v2/app/home.html), [app/post](../../mockups/v2/app/post.html), [app/profile](../../mockups/v2/app/profile.html) |
| `/timeline` | S→C | `post:retracted` | [app/bookmarks](../../mockups/v2/app/bookmarks.html), [app/feed](../../mockups/v2/app/feed.html), [app/group](../../mockups/v2/app/group.html), [app/post](../../mockups/v2/app/post.html), [admin/timeline](../../mockups/v2/admin/timeline.html) |
| `/timeline` | S→C | `post:created` | [app/feed](../../mockups/v2/app/feed.html), [admin/timeline](../../mockups/v2/admin/timeline.html) |
| `/timeline` | S→C | `post:updated` | [app/bookmarks](../../mockups/v2/app/bookmarks.html), [app/feed](../../mockups/v2/app/feed.html), [app/post](../../mockups/v2/app/post.html) |
| `/timeline` | S→C | `post:deleted` | [app/bookmarks](../../mockups/v2/app/bookmarks.html), [app/feed](../../mockups/v2/app/feed.html), [app/post](../../mockups/v2/app/post.html), [admin/timeline](../../mockups/v2/admin/timeline.html) |
| `/timeline` | C→S | `subscribe:timeline` | [app/bookmarks](../../mockups/v2/app/bookmarks.html), [app/feed](../../mockups/v2/app/feed.html), [app/home](../../mockups/v2/app/home.html), [app/profile](../../mockups/v2/app/profile.html), [admin/timeline](../../mockups/v2/admin/timeline.html) |
| `/timeline` | C→S | `unsubscribe:timeline` | [app/bookmarks](../../mockups/v2/app/bookmarks.html), [app/feed](../../mockups/v2/app/feed.html) |
| `/timeline` | C→S | `subscribe:group` | [app/feed](../../mockups/v2/app/feed.html), [app/group](../../mockups/v2/app/group.html), [app/post](../../mockups/v2/app/post.html) |
| `/timeline` | C→S | `unsubscribe:group` | [app/feed](../../mockups/v2/app/feed.html), [app/group](../../mockups/v2/app/group.html) |
| `/moderation` | S→C | `queue:new_item` | [admin/moderator](../../mockups/v2/admin/moderator.html), [admin/overview](../../mockups/v2/admin/overview.html) |
| `/moderation` | S→C | `queue:high_priority` | [admin/moderator](../../mockups/v2/admin/moderator.html), [admin/overview](../../mockups/v2/admin/overview.html) |
| `/moderation` | S→C | `queue:item_claimed` | [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderation` | S→C | `queue:item_completed` | [admin/moderator](../../mockups/v2/admin/moderator.html), [admin/overview](../../mockups/v2/admin/overview.html) |
| `/moderation` | S→C | `appeal:new` | [admin/moderator](../../mockups/v2/admin/moderator.html), [admin/overview](../../mockups/v2/admin/overview.html) |
| `/moderation` | S→C | `appeal:reviewed` | [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderation` | S→C | `content_action` | [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderation` | S→C | `user_action` | [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/notifications` | S→C | `notification` | [app/home](../../mockups/v2/app/home.html), [app/moderation](../../mockups/v2/app/moderation.html) |
| `/notifications` | S→C | `moderation_notification` | [app/home](../../mockups/v2/app/home.html), [app/moderation](../../mockups/v2/app/moderation.html) |
| `/notifications` | S→C | `appeal:new` | [app/moderation](../../mockups/v2/app/moderation.html) |
| `/notifications` | S→C | `appeal:reviewed` | [app/moderation](../../mockups/v2/app/moderation.html) |
| `/live` | S→C | `viewer-count-updated` | [app/group](../../mockups/v2/app/group.html), [app/streams](../../mockups/v2/app/streams.html), [app/watch](../../mockups/v2/app/watch.html), [admin/live](../../mockups/v2/admin/live.html) |
| `/live` | S→C | `viewer-joined` | [app/watch](../../mockups/v2/app/watch.html) |
| `/live` | S→C | `viewer-left` | [app/watch](../../mockups/v2/app/watch.html) |
| `/live` | S→C | `chat-history` | [app/watch](../../mockups/v2/app/watch.html) |
| `/live` | S→C | `stream-chat-message` | [app/watch](../../mockups/v2/app/watch.html) |
| `/live` | S→C | `participant-joined` | [app/room](../../mockups/v2/app/room.html), [app/rooms](../../mockups/v2/app/rooms.html) |
| `/live` | S→C | `existing-participants` | [app/room](../../mockups/v2/app/room.html) |
| `/live` | S→C | `participant-state-changed` | [app/room](../../mockups/v2/app/room.html) |
| `/live` | S→C | `participant-left` | [app/room](../../mockups/v2/app/room.html), [app/rooms](../../mockups/v2/app/rooms.html) |
| `/live` | S→C | `signal` | [app/room](../../mockups/v2/app/room.html) |
| `/live` | S→C | `offer` | [app/room](../../mockups/v2/app/room.html) |
| `/live` | S→C | `answer` | [app/room](../../mockups/v2/app/room.html) |
| `/live` | S→C | `ice-candidate` | [app/room](../../mockups/v2/app/room.html) |
| `/live` | S→C | `room-closed` | [app/room](../../mockups/v2/app/room.html), [app/rooms](../../mockups/v2/app/rooms.html), [admin/live](../../mockups/v2/admin/live.html) |
| `/live` | S→C | `error` | [app/room](../../mockups/v2/app/room.html), [app/watch](../../mockups/v2/app/watch.html) |
| `/live` | S→C | `stream-started` | [app/group](../../mockups/v2/app/group.html), [app/streams](../../mockups/v2/app/streams.html), [admin/live](../../mockups/v2/admin/live.html) |
| `/live` | S→C | `stream-ended` | [app/group](../../mockups/v2/app/group.html), [app/streams](../../mockups/v2/app/streams.html), [app/watch](../../mockups/v2/app/watch.html), [admin/live](../../mockups/v2/admin/live.html) |
| `/live` | S→C | `stream-deleted` | [app/streams](../../mockups/v2/app/streams.html), [app/watch](../../mockups/v2/app/watch.html), [admin/live](../../mockups/v2/admin/live.html) |
| `/live` | C→S | `join-stream` | [app/watch](../../mockups/v2/app/watch.html) |
| `/live` | C→S | `leave-stream` | [app/watch](../../mockups/v2/app/watch.html) |
| `/live` | C→S | `stream-chat-message` | [app/watch](../../mockups/v2/app/watch.html) |
| `/live` | C→S | `join-room` | [app/room](../../mockups/v2/app/room.html) |
| `/live` | C→S | `leave-room` | [app/room](../../mockups/v2/app/room.html) |
| `/live` | C→S | `update-participant-state` | [app/room](../../mockups/v2/app/room.html) |
| `/live` | C→S | `signal` | [app/room](../../mockups/v2/app/room.html) |
| `/live` | C→S | `offer` | [app/room](../../mockups/v2/app/room.html) |
| `/live` | C→S | `answer` | [app/room](../../mockups/v2/app/room.html) |
| `/live` | C→S | `ice-candidate` | [app/room](../../mockups/v2/app/room.html) |
| `/cortex` | S→C | `chat:start` | [app/cortex](../../mockups/v2/app/cortex.html) |
| `/cortex` | S→C | `chat:token` | [app/cortex](../../mockups/v2/app/cortex.html) |
| `/cortex` | S→C | `chat:reset` | [app/cortex](../../mockups/v2/app/cortex.html) |
| `/cortex` | S→C | `chat:done` | [app/cortex](../../mockups/v2/app/cortex.html), [admin/cortex](../../mockups/v2/admin/cortex.html) |
| `/cortex` | S→C | `chat:error` | [app/cortex](../../mockups/v2/app/cortex.html) |
| `/cortex` | S→C | `chat:cancelled` | [app/cortex](../../mockups/v2/app/cortex.html) |
| `/cortex` | C→S | `chat:send` | [app/cortex](../../mockups/v2/app/cortex.html) |
| `/cortex` | C→S | `chat:cancel` | [app/cortex](../../mockups/v2/app/cortex.html) |
| `wss /xrpc/com.atproto.label.subscribeLabels (raw WebSocket, not Socket.IO)` | S→C | `#labels` | [admin/atproto](../../mockups/v2/admin/atproto.html) |
| `wss /xrpc/com.atproto.label.subscribeLabels (raw WebSocket, not Socket.IO)` | S→C | `#info` | [admin/atproto](../../mockups/v2/admin/atproto.html) |

### REST routes → screens

#### `/health`

| Route | Screens / reason |
|---|---|
| `/health` | [app/home](../../mockups/v2/app/home.html), [admin/overview](../../mockups/v2/admin/overview.html), [admin/platform](../../mockups/v2/admin/platform.html) |

#### `/platform`

| Route | Screens / reason |
|---|---|
| `/platform/api/config` | [admin/overview](../../mockups/v2/admin/overview.html), [admin/platform](../../mockups/v2/admin/platform.html), [admin/scopes](../../mockups/v2/admin/scopes.html) |
| `/platform/api/config/:x` | [admin/platform](../../mockups/v2/admin/platform.html) |

#### `/ca`

| Route | Screens / reason |
|---|---|
| `/ca/tickets/generate` | [app/certs](../../mockups/v2/app/certs.html), [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/api/tokens` | [app/certs](../../mockups/v2/app/certs.html), [app/settings](../../mockups/v2/app/settings.html), [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/api/tokens/generate` | [app/settings](../../mockups/v2/app/settings.html), [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/api/tokens/validate` | [app/certs](../../mockups/v2/app/certs.html), [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/api/tokens/revoke` | [app/settings](../../mockups/v2/app/settings.html), [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/api/tokens/revoke-bulk` | [app/settings](../../mockups/v2/app/settings.html), [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/api/tokens/:x/refresh` | [app/certs](../../mockups/v2/app/certs.html), [app/settings](../../mockups/v2/app/settings.html), [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/api/tokens/:x/introspect` | [app/certs](../../mockups/v2/app/certs.html), [app/settings](../../mockups/v2/app/settings.html), [admin/ca](../../mockups/v2/admin/ca.html), [admin/scopes](../../mockups/v2/admin/scopes.html) |
| `/ca/api/users/me/groups` | [app/certs](../../mockups/v2/app/certs.html), [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/api/certificates` | [app/certs](../../mockups/v2/app/certs.html), [app/settings](../../mockups/v2/app/settings.html), [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/api/certificates/generate` | [app/certs](../../mockups/v2/app/certs.html), [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/api/certificates/:x` | [app/certs](../../mockups/v2/app/certs.html), [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/api/certificates/:x/export` | [app/certs](../../mockups/v2/app/certs.html), [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/api/certificates/:x/status` | [app/certs](../../mockups/v2/app/certs.html), [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/api/certificates/:x/chain` | [app/certs](../../mockups/v2/app/certs.html), [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/api/certificates/:x/download` | [app/certs](../../mockups/v2/app/certs.html) |
| `/ca/api/certificates/:x/revoke` | [app/certs](../../mockups/v2/app/certs.html), [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/api/certificates/:x/renew` | [app/certs](../../mockups/v2/app/certs.html), [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/api/certificates/generate-root` | [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/api/certificates/generate-intermediate` | [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/api/certificates/generate-code-signing` | [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/api/certificates/csr` | [app/certs](../../mockups/v2/app/certs.html), [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/api/auth/verify-password` | [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/api/config/:x` | [admin/platform](../../mockups/v2/admin/platform.html) |
| `/ca/admin/api/stats` | [admin/ca](../../mockups/v2/admin/ca.html), [admin/overview](../../mockups/v2/admin/overview.html) |
| `/ca/admin/api/activity` | [admin/ca](../../mockups/v2/admin/ca.html), [admin/overview](../../mockups/v2/admin/overview.html) |
| `/ca/admin/api/certificates/recent` | [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/admin/api/tokens/recent` | [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/admin/api/timeseries/:x` | [admin/ca](../../mockups/v2/admin/ca.html), [admin/overview](../../mockups/v2/admin/overview.html) |
| `/ca/admin/api/health` | [admin/ca](../../mockups/v2/admin/ca.html), [admin/overview](../../mockups/v2/admin/overview.html) |
| `/ca/admin/api/users` | [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/admin/api/groups` | [admin/ca](../../mockups/v2/admin/ca.html), [admin/orgs](../../mockups/v2/admin/orgs.html) |
| `/ca/admin/api/roles` | [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/admin/api/certificates` | [admin/ca](../../mockups/v2/admin/ca.html), [admin/overview](../../mockups/v2/admin/overview.html) |
| `/ca/admin/api/certificates/issue` | [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/admin/api/certificates/:x/revoke` | [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/admin/api/certificates/:x/download` | [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/admin/api/tokens` | [admin/ca](../../mockups/v2/admin/ca.html), [admin/orgs](../../mockups/v2/admin/orgs.html), [admin/users](../../mockups/v2/admin/users.html) |
| `/ca/admin/api/tokens/generate` | [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/admin/api/tokens/validate` | [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/admin/api/tokens/:x/revoke` | [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/admin/api/tokens/revoke-bulk` | [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/admin/api/ocsp/status` | [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/admin/api/crl/status` | [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/admin/api/crl/generate` | [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/admin/api/config` | [admin/ca](../../mockups/v2/admin/ca.html), [admin/platform](../../mockups/v2/admin/platform.html) |
| `/ca/admin/api/config/update` | [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/ocsp` | [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/ocsp/batch` | [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/ocsp/status` | [app/certs](../../mockups/v2/app/certs.html), [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/crl/current.crl` | [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/crl/der` | [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/crl/info` | [app/certs](../../mockups/v2/app/certs.html), [admin/ca](../../mockups/v2/admin/ca.html) |
| `/ca/acme/*` | [admin/ca](../../mockups/v2/admin/ca.html) |

#### `/auth`

| Route | Screens / reason |
|---|---|
| `/auth/health` | [app/home](../../mockups/v2/app/home.html) |
| `/auth/.well-known/openid-configuration` | [admin/auth](../../mockups/v2/admin/auth.html), [admin/scopes](../../mockups/v2/admin/scopes.html) |
| `/auth/.well-known/jwks.json` | [admin/auth](../../mockups/v2/admin/auth.html) |
| `/auth/api/auth/register` | [app/login](../../mockups/v2/app/login.html) |
| `/auth/api/auth/login` | [app/login](../../mockups/v2/app/login.html) |
| `/auth/api/auth/mfa/verify` | [app/login](../../mockups/v2/app/login.html), [app/sso-callback](../../mockups/v2/app/sso-callback.html) |
| `/auth/api/auth/exchange` | [app/login](../../mockups/v2/app/login.html), [app/sso-callback](../../mockups/v2/app/sso-callback.html) |
| `/auth/api/auth/forgot-password` | [app/login](../../mockups/v2/app/login.html) |
| `/auth/api/auth/reset-password` | [app/login](../../mockups/v2/app/login.html) |
| `/auth/api/auth/accept-invite` | [app/accept-invite](../../mockups/v2/app/accept-invite.html) |
| `/auth/api/auth/signup` | [app/signup](../../mockups/v2/app/signup.html) |
| `/auth/api/auth/verify-email` | [app/signup](../../mockups/v2/app/signup.html) |
| `/auth/api/auth/resend-verification` | [app/signup](../../mockups/v2/app/signup.html) |
| `/auth/api/auth/signup-policy` | [app/accept-invite](../../mockups/v2/app/accept-invite.html), [app/login](../../mockups/v2/app/login.html), [app/signup](../../mockups/v2/app/signup.html), [admin/auth](../../mockups/v2/admin/auth.html) |
| `/auth/api/auth/google` | [app/login](../../mockups/v2/app/login.html), [admin/auth](../../mockups/v2/admin/auth.html) |
| `/auth/api/auth/github` | [app/login](../../mockups/v2/app/login.html) |
| `/auth/api/auth/google/callback` | [app/login](../../mockups/v2/app/login.html), [app/sso-callback](../../mockups/v2/app/sso-callback.html) |
| `/auth/api/auth/github/callback` | [app/login](../../mockups/v2/app/login.html), [app/sso-callback](../../mockups/v2/app/sso-callback.html) |
| `/auth/api/auth/logout` | [app/settings](../../mockups/v2/app/settings.html) |
| `/auth/api/auth/change-password` | [app/settings](../../mockups/v2/app/settings.html) |
| `/auth/api/auth/me` | [app/home](../../mockups/v2/app/home.html), [app/settings](../../mockups/v2/app/settings.html), [app/sso-callback](../../mockups/v2/app/sso-callback.html), [admin/overview](../../mockups/v2/admin/overview.html) |
| `/auth/api/auth/token` | _no UI: session→bearer exchange done by the SPA bootstrap_ |
| `/auth/api/mfa/setup` | [app/login](../../mockups/v2/app/login.html), [app/settings](../../mockups/v2/app/settings.html) |
| `/auth/api/mfa/verify` | [app/settings](../../mockups/v2/app/settings.html) |
| `/auth/api/mfa/validate` | [app/settings](../../mockups/v2/app/settings.html) |
| `/auth/api/mfa/disable` | [app/settings](../../mockups/v2/app/settings.html) |
| `/auth/api/mfa/regenerate-backup-codes` | [app/settings](../../mockups/v2/app/settings.html) |
| `/auth/api/mfa/status` | [app/settings](../../mockups/v2/app/settings.html), [admin/auth](../../mockups/v2/admin/auth.html) |
| `/auth/api/sessions` | [app/settings](../../mockups/v2/app/settings.html), [admin/auth](../../mockups/v2/admin/auth.html), [admin/users](../../mockups/v2/admin/users.html) |
| `/auth/api/sessions/current` | [app/settings](../../mockups/v2/app/settings.html), [admin/auth](../../mockups/v2/admin/auth.html) |
| `/auth/api/sessions/:x` | [app/settings](../../mockups/v2/app/settings.html), [admin/auth](../../mockups/v2/admin/auth.html), [admin/users](../../mockups/v2/admin/users.html) |
| `/auth/api/sessions/refresh` | [app/settings](../../mockups/v2/app/settings.html), [admin/auth](../../mockups/v2/admin/auth.html) |
| `/auth/api/users` | [admin/permissions](../../mockups/v2/admin/permissions.html), [admin/roles](../../mockups/v2/admin/roles.html), [admin/users](../../mockups/v2/admin/users.html) |
| `/auth/api/users/import` | [admin/orgs](../../mockups/v2/admin/orgs.html), [admin/users](../../mockups/v2/admin/users.html) |
| `/auth/api/users/export` | [admin/users](../../mockups/v2/admin/users.html) |
| `/auth/api/users/invites` | [admin/orgs](../../mockups/v2/admin/orgs.html), [admin/users](../../mockups/v2/admin/users.html) |
| `/auth/api/users/invites/:x` | [admin/users](../../mockups/v2/admin/users.html) |
| `/auth/api/users/:x/detail` | [admin/users](../../mockups/v2/admin/users.html) |
| `/auth/api/users/directory` | [app/feed](../../mockups/v2/app/feed.html), [app/group](../../mockups/v2/app/group.html), [app/messages](../../mockups/v2/app/messages.html), [app/not-found](../../mockups/v2/app/not-found.html), [app/orgs](../../mockups/v2/app/orgs.html), [app/people](../../mockups/v2/app/people.html), [app/rooms](../../mockups/v2/app/rooms.html), [app/search](../../mockups/v2/app/search.html) |
| `/auth/api/users/profiles` | [app/people](../../mockups/v2/app/people.html), [app/search](../../mockups/v2/app/search.html), [admin/users](../../mockups/v2/admin/users.html) |
| `/auth/api/users/:x` | [app/settings](../../mockups/v2/app/settings.html), [admin/users](../../mockups/v2/admin/users.html) |
| `/auth/api/users/:x/profile` | [app/profile](../../mockups/v2/app/profile.html), [app/settings](../../mockups/v2/app/settings.html) |
| `/auth/api/users/:x/groups` | [app/profile](../../mockups/v2/app/profile.html), [admin/identity-groups](../../mockups/v2/admin/identity-groups.html), [admin/users](../../mockups/v2/admin/users.html) |
| `/auth/api/groups` | [admin/identity-groups](../../mockups/v2/admin/identity-groups.html), [admin/orgs](../../mockups/v2/admin/orgs.html) |
| `/auth/api/groups/:x` | [admin/identity-groups](../../mockups/v2/admin/identity-groups.html) |
| `/auth/api/groups/:x/members` | [admin/identity-groups](../../mockups/v2/admin/identity-groups.html), [admin/users](../../mockups/v2/admin/users.html) |
| `/auth/api/groups/:x/members/:x` | [admin/identity-groups](../../mockups/v2/admin/identity-groups.html) |
| `/auth/api/groups/import` | [admin/identity-groups](../../mockups/v2/admin/identity-groups.html) |
| `/auth/api/tokens/generate` | [admin/auth](../../mockups/v2/admin/auth.html) |
| `/auth/api/tokens/validate` | _no UI: service validation_ |
| `/auth/api/tokens/revoke` | _no UI: legacy alias of CA token revoke_ |
| `/auth/api/oauth2/authorize` | _no UI: OAuth consent screen: the SPA has no route for it yet (proposed screen, prerequisite P14)_ |
| `/auth/api/oauth2/token` | [admin/auth](../../mockups/v2/admin/auth.html) |
| `/auth/api/oauth2/revoke` | _no UI: OAuth client protocol_ |
| `/auth/api/oauth2/userinfo` | _no UI: OAuth client protocol_ |
| `/auth/api/oauth2/introspect` | [admin/scopes](../../mockups/v2/admin/scopes.html) |
| `/auth/api/saml/metadata` | [admin/auth](../../mockups/v2/admin/auth.html) |
| `/auth/api/saml/login` | [app/login](../../mockups/v2/app/login.html) |
| `/auth/api/saml/callback` | [app/sso-callback](../../mockups/v2/app/sso-callback.html) |
| `/auth/api/saml/logout` | _no UI: IdP-initiated protocol_ |
| `/auth/api/saml/logout/callback` | _no UI: protocol_ |
| `/auth/api/saml/providers` | [app/login](../../mockups/v2/app/login.html), [admin/auth](../../mockups/v2/admin/auth.html) |
| `/auth/api/saml/status` | [app/login](../../mockups/v2/app/login.html), [admin/auth](../../mockups/v2/admin/auth.html) |
| `/auth/api/organizations/provision` | [admin/orgs](../../mockups/v2/admin/orgs.html) |
| `/auth/api/organizations/provision-self` | [app/orgs](../../mockups/v2/app/orgs.html), [app/signup](../../mockups/v2/app/signup.html), [admin/orgs](../../mockups/v2/admin/orgs.html) |
| `/auth/api/organizations` | [app/orgs](../../mockups/v2/app/orgs.html), [admin/orgs](../../mockups/v2/admin/orgs.html) |
| `/auth/api/organizations/:x` | [app/orgs](../../mockups/v2/app/orgs.html), [admin/orgs](../../mockups/v2/admin/orgs.html) |
| `/auth/api/organizations/:x/members` | [app/orgs](../../mockups/v2/app/orgs.html), [app/signup](../../mockups/v2/app/signup.html), [admin/orgs](../../mockups/v2/admin/orgs.html) |
| `/auth/api/organizations/:x/members/:x` | [app/orgs](../../mockups/v2/app/orgs.html), [admin/orgs](../../mockups/v2/admin/orgs.html) |
| `/auth/api/organizations/:x/transfer-ownership` | [app/orgs](../../mockups/v2/app/orgs.html), [admin/orgs](../../mockups/v2/admin/orgs.html) |
| `/auth/api/applications` | [app/orgs](../../mockups/v2/app/orgs.html), [admin/auth](../../mockups/v2/admin/auth.html), [admin/orgs](../../mockups/v2/admin/orgs.html), [admin/scopes](../../mockups/v2/admin/scopes.html) |
| `/auth/api/applications/:x` | [app/orgs](../../mockups/v2/app/orgs.html), [admin/auth](../../mockups/v2/admin/auth.html) |
| `/auth/api/applications/:x/regenerate-secret` | [app/orgs](../../mockups/v2/app/orgs.html), [admin/auth](../../mockups/v2/admin/auth.html) |
| `/auth/api/applications/:x/check-access` | [app/orgs](../../mockups/v2/app/orgs.html), [admin/auth](../../mockups/v2/admin/auth.html) |
| `/auth/api/roles` | [admin/identity-groups](../../mockups/v2/admin/identity-groups.html), [admin/orgs](../../mockups/v2/admin/orgs.html), [admin/permissions](../../mockups/v2/admin/permissions.html), [admin/roles](../../mockups/v2/admin/roles.html), [admin/scopes](../../mockups/v2/admin/scopes.html) |
| `/auth/api/roles/:x` | [admin/roles](../../mockups/v2/admin/roles.html) |
| `/auth/api/roles/:x/assign-user` | [admin/orgs](../../mockups/v2/admin/orgs.html), [admin/roles](../../mockups/v2/admin/roles.html), [admin/users](../../mockups/v2/admin/users.html) |
| `/auth/api/roles/:x/revoke-user` | [admin/roles](../../mockups/v2/admin/roles.html) |
| `/auth/api/roles/:x/assign-group` | [admin/identity-groups](../../mockups/v2/admin/identity-groups.html), [admin/roles](../../mockups/v2/admin/roles.html) |
| `/auth/api/roles/:x/revoke-group` | [admin/identity-groups](../../mockups/v2/admin/identity-groups.html), [admin/roles](../../mockups/v2/admin/roles.html) |
| `/auth/api/roles/:x/assignments` | [admin/roles](../../mockups/v2/admin/roles.html) |
| `/auth/api/roles/permissions` | [admin/permissions](../../mockups/v2/admin/permissions.html), [admin/roles](../../mockups/v2/admin/roles.html), [admin/scopes](../../mockups/v2/admin/scopes.html) |
| `/auth/api/roles/users/:x/permissions` | [admin/permissions](../../mockups/v2/admin/permissions.html) |
| `/auth/api/roles/check-permission` | [admin/permissions](../../mockups/v2/admin/permissions.html) |
| `/auth/api/roles/check-service-access` | [admin/permissions](../../mockups/v2/admin/permissions.html) |
| `/auth/api/config/:x` | [admin/auth](../../mockups/v2/admin/auth.html), [admin/platform](../../mockups/v2/admin/platform.html) |
| `/auth/api/internal/orgs/:x/membership/:x` | _no UI: service-to-service [S]_ |
| `/auth/api/internal/users/:x/orgs` | _no UI: service-to-service [S]_ |

#### `/spark`

| Route | Screens / reason |
|---|---|
| `/spark/api/conversations` | [app/home](../../mockups/v2/app/home.html), [app/messages](../../mockups/v2/app/messages.html), [app/people](../../mockups/v2/app/people.html), [app/profile](../../mockups/v2/app/profile.html) |
| `/spark/api/conversations/:x` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark/api/conversations/:x/participants` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark/api/conversations/:x/settings` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark/api/conversations/:x/mute` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark/api/conversations/:x/unmute` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark/api/conversations/:x/pinned` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark/api/messages/:x` | [app/group](../../mockups/v2/app/group.html), [app/messages](../../mockups/v2/app/messages.html) |
| `/spark/api/messages/:x/:x` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark/api/messages/search` | [app/messages](../../mockups/v2/app/messages.html), [app/search](../../mockups/v2/app/search.html) |
| `/spark/api/messages/search/suggestions` | [app/messages](../../mockups/v2/app/messages.html), [app/search](../../mockups/v2/app/search.html) |
| `/spark/api/:x/forward` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark/api/:x/pin` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark/api/:x/unpin` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark/api/:x/thread` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark/api/:x/reply` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark/api/attachments/upload` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark/api/attachments/:x` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark/api/attachments/:x/download` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark/api/attachments/conversations/:x/attachments` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark/api/encryption/keys/generate` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark/api/encryption/keys/public/:x` | [admin/spark](../../mockups/v2/admin/spark.html) |
| `/spark/api/encryption/keys/public/batch` | [app/messages](../../mockups/v2/app/messages.html), [admin/spark](../../mockups/v2/admin/spark.html) |
| `/spark/api/encryption/keys/my-keys` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark/api/encryption/keys/mine` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark/api/encryption/keys/:x/rotate` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark/api/encryption/keys/:x` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark/api/encryption/messages/:x/keys` | [app/messages](../../mockups/v2/app/messages.html) |
| `/spark/api/groups/:x/channels` | [app/group](../../mockups/v2/app/group.html) |
| `/spark/api/groups/:x/channels/:x/messages` | [app/group](../../mockups/v2/app/group.html) |
| `/spark/api/queues/stats` | [admin/jobs](../../mockups/v2/admin/jobs.html), [admin/overview](../../mockups/v2/admin/overview.html), [admin/spark](../../mockups/v2/admin/spark.html) |
| `/spark/api/queues/:x/stats` | [admin/jobs](../../mockups/v2/admin/jobs.html), [admin/spark](../../mockups/v2/admin/spark.html) |
| `/spark/api/queues/:x/clean` | [admin/jobs](../../mockups/v2/admin/jobs.html), [admin/spark](../../mockups/v2/admin/spark.html) |
| `/spark/api/queues/:x/pause` | [admin/jobs](../../mockups/v2/admin/jobs.html), [admin/spark](../../mockups/v2/admin/spark.html) |
| `/spark/api/queues/:x/resume` | [admin/jobs](../../mockups/v2/admin/jobs.html), [admin/spark](../../mockups/v2/admin/spark.html) |
| `/spark/api/config/:x` | [admin/platform](../../mockups/v2/admin/platform.html), [admin/spark](../../mockups/v2/admin/spark.html) |
| `/spark/health` | [admin/spark](../../mockups/v2/admin/spark.html) |
| `/spark/api/moderation/action` | [admin/spark](../../mockups/v2/admin/spark.html) |

#### `/nexus`

| Route | Screens / reason |
|---|---|
| `/nexus/api/groups` | [app/groups](../../mockups/v2/app/groups.html), [admin/nexus](../../mockups/v2/admin/nexus.html) |
| `/nexus/api/groups/:x` | [app/group](../../mockups/v2/app/group.html), [admin/nexus](../../mockups/v2/admin/nexus.html) |
| `/nexus/api/groups/search` | [app/groups](../../mockups/v2/app/groups.html), [app/search](../../mockups/v2/app/search.html), [admin/nexus](../../mockups/v2/admin/nexus.html) |
| `/nexus/api/groups/discover/nearby` | [app/groups](../../mockups/v2/app/groups.html) |
| `/nexus/api/groups/discover/activity` | [app/groups](../../mockups/v2/app/groups.html) |
| `/nexus/api/groups/search/popular` | [app/groups](../../mockups/v2/app/groups.html), [app/search](../../mockups/v2/app/search.html) |
| `/nexus/api/groups/:x/related` | [app/group](../../mockups/v2/app/group.html), [app/groups](../../mockups/v2/app/groups.html) |
| `/nexus/api/groups/:x/members` | [app/group](../../mockups/v2/app/group.html), [admin/nexus](../../mockups/v2/admin/nexus.html) |
| `/nexus/api/groups/:x/join` | [app/group](../../mockups/v2/app/group.html), [app/groups](../../mockups/v2/app/groups.html), [app/search](../../mockups/v2/app/search.html) |
| `/nexus/api/groups/:x/leave` | [app/group](../../mockups/v2/app/group.html), [app/groups](../../mockups/v2/app/groups.html) |
| `/nexus/api/groups/:x/invite` | [app/group](../../mockups/v2/app/group.html) |
| `/nexus/api/groups/:x/members/:x` | [app/group](../../mockups/v2/app/group.html) |
| `/nexus/api/groups/:x/members/:x/role` | [app/group](../../mockups/v2/app/group.html) |
| `/nexus/api/groups/:x/join-requests/:x/approve` | [app/group](../../mockups/v2/app/group.html) |
| `/nexus/api/groups/:x/join-requests/:x/reject` | [app/group](../../mockups/v2/app/group.html) |
| `/nexus/api/memberships` | [app/feed](../../mockups/v2/app/feed.html), [app/groups](../../mockups/v2/app/groups.html) |
| `/nexus/api/memberships/user/:x` | [app/groups](../../mockups/v2/app/groups.html), [app/profile](../../mockups/v2/app/profile.html) |
| `/nexus/api/events` | [app/group](../../mockups/v2/app/group.html), [app/home](../../mockups/v2/app/home.html), [admin/nexus](../../mockups/v2/admin/nexus.html) |
| `/nexus/api/events/:x` | [app/group](../../mockups/v2/app/group.html), [admin/nexus](../../mockups/v2/admin/nexus.html) |
| `/nexus/api/events/:x/cancel` | [app/group](../../mockups/v2/app/group.html), [admin/nexus](../../mockups/v2/admin/nexus.html) |
| `/nexus/api/events/:x/rsvp` | [app/group](../../mockups/v2/app/group.html) |
| `/nexus/api/events/:x/attendees` | [app/group](../../mockups/v2/app/group.html), [admin/nexus](../../mockups/v2/admin/nexus.html) |
| `/nexus/api/events/:x/reminders` | [app/group](../../mockups/v2/app/group.html) |
| `/nexus/api/events/reminders/presets` | [app/group](../../mockups/v2/app/group.html), [admin/nexus](../../mockups/v2/admin/nexus.html) |
| `/nexus/api/events/:x/check-in/:x` | [app/group](../../mockups/v2/app/group.html), [admin/nexus](../../mockups/v2/admin/nexus.html) |
| `/nexus/api/events/:x/notify` | [app/group](../../mockups/v2/app/group.html), [admin/nexus](../../mockups/v2/admin/nexus.html) |
| `/nexus/api/events/:x/live` | [app/group](../../mockups/v2/app/group.html) |
| `/nexus/api/governance/proposals` | [app/group](../../mockups/v2/app/group.html), [admin/nexus](../../mockups/v2/admin/nexus.html) |
| `/nexus/api/governance/proposals/:x` | [app/group](../../mockups/v2/app/group.html), [admin/nexus](../../mockups/v2/admin/nexus.html) |
| `/nexus/api/governance/proposals/:x/vote` | [app/group](../../mockups/v2/app/group.html) |
| `/nexus/api/governance/proposals/:x/results` | [app/group](../../mockups/v2/app/group.html), [admin/nexus](../../mockups/v2/admin/nexus.html) |
| `/nexus/api/governance/proposals/:x/votes` | [app/group](../../mockups/v2/app/group.html), [admin/nexus](../../mockups/v2/admin/nexus.html) |
| `/nexus/api/governance/proposals/:x/execute` | [app/group](../../mockups/v2/app/group.html), [admin/nexus](../../mockups/v2/admin/nexus.html) |
| `/nexus/api/governance/proposals/:x/close` | [app/group](../../mockups/v2/app/group.html), [admin/nexus](../../mockups/v2/admin/nexus.html) |
| `/nexus/api/trending/groups` | [app/groups](../../mockups/v2/app/groups.html), [admin/nexus](../../mockups/v2/admin/nexus.html) |
| `/nexus/api/trending/update` | [admin/nexus](../../mockups/v2/admin/nexus.html) |
| `/nexus/api/recommendations` | [app/groups](../../mockups/v2/app/groups.html) |
| `/nexus/api/recommendations/generate` | [app/groups](../../mockups/v2/app/groups.html) |
| `/nexus/api/recommendations/:x/track` | [app/groups](../../mockups/v2/app/groups.html) |
| `/nexus/api/recommendations/analytics` | [app/groups](../../mockups/v2/app/groups.html), [admin/nexus](../../mockups/v2/admin/nexus.html) |
| `/nexus/api/moderation/flags` | [app/group](../../mockups/v2/app/group.html) |
| `/nexus/api/moderation/flags/:x` | [app/group](../../mockups/v2/app/group.html), [admin/nexus](../../mockups/v2/admin/nexus.html) |
| `/nexus/api/moderation/queue/:x` | [app/group](../../mockups/v2/app/group.html), [admin/nexus](../../mockups/v2/admin/nexus.html) |
| `/nexus/api/moderation/cases/:x` | [app/group](../../mockups/v2/app/group.html), [admin/nexus](../../mockups/v2/admin/nexus.html) |
| `/nexus/api/moderation/cases/:x/action` | [app/group](../../mockups/v2/app/group.html), [admin/nexus](../../mockups/v2/admin/nexus.html) |
| `/nexus/api/moderation/cases/:x/assign` | [app/group](../../mockups/v2/app/group.html), [admin/nexus](../../mockups/v2/admin/nexus.html) |
| `/nexus/api/moderation/flags/:x/resolve` | [app/group](../../mockups/v2/app/group.html), [admin/nexus](../../mockups/v2/admin/nexus.html) |
| `/nexus/api/admin/stats` | [admin/nexus](../../mockups/v2/admin/nexus.html), [admin/overview](../../mockups/v2/admin/overview.html) |
| `/nexus/api/admin/groups/:x/stats` | [admin/nexus](../../mockups/v2/admin/nexus.html) |
| `/nexus/api/admin/audit` | [admin/nexus](../../mockups/v2/admin/nexus.html), [admin/overview](../../mockups/v2/admin/overview.html) |
| `/nexus/api/config/:x` | [admin/nexus](../../mockups/v2/admin/nexus.html), [admin/platform](../../mockups/v2/admin/platform.html) |
| `/nexus/api/calendar/events/:x/ical` | [app/group](../../mockups/v2/app/group.html), [admin/nexus](../../mockups/v2/admin/nexus.html) |
| `/nexus/api/calendar/groups/:x/ical` | [app/group](../../mockups/v2/app/group.html), [admin/nexus](../../mockups/v2/admin/nexus.html) |
| `/nexus/api/calendar/users/:x/ical` | [app/settings](../../mockups/v2/app/settings.html) |
| `/nexus/api/calendar/caldav/users/:x/calendars` | [app/settings](../../mockups/v2/app/settings.html) |
| `/nexus/api/calendar/caldav/groups/:x/calendar` | [app/group](../../mockups/v2/app/group.html) |
| `/nexus/api/calendar/caldav/groups/:x/events` | [app/group](../../mockups/v2/app/group.html), [admin/nexus](../../mockups/v2/admin/nexus.html) |
| `/nexus/api/calendar/carddav/users/:x/addressbooks` | [app/settings](../../mockups/v2/app/settings.html) |
| `/nexus/api/calendar/carddav/groups/:x/contacts` | [app/group](../../mockups/v2/app/group.html), [admin/nexus](../../mockups/v2/admin/nexus.html) |
| `/nexus/api/calendar/carddav/groups/:x/addressbook` | [app/group](../../mockups/v2/app/group.html) |
| `/nexus/api/subgroups` | [app/group](../../mockups/v2/app/group.html), [admin/nexus](../../mockups/v2/admin/nexus.html) |
| `/nexus/api/subgroups/:x` | [app/group](../../mockups/v2/app/group.html) |
| `/nexus/api/subgroups/:x/members` | [app/group](../../mockups/v2/app/group.html) |
| `/nexus/api/subgroups/:x/members/:x` | [app/group](../../mockups/v2/app/group.html) |
| `/nexus/api/subgroups/:x/access` | [app/group](../../mockups/v2/app/group.html) |
| `/nexus/api/internal/groups/:x/membership/:x` | _no UI: service-to-service [S]_ |
| `/nexus/api/internal/users/:x/groups` | _no UI: service-to-service [S]_ |

#### `/filevault`

| Route | Screens / reason |
|---|---|
| `/filevault/api/files/upload` | [app/files](../../mockups/v2/app/files.html) |
| `/filevault/api/files` | [app/files](../../mockups/v2/app/files.html), [app/home](../../mockups/v2/app/home.html) |
| `/filevault/api/files/trash` | [app/files](../../mockups/v2/app/files.html) |
| `/filevault/api/files/:x` | [app/files](../../mockups/v2/app/files.html) |
| `/filevault/api/files/:x/description` | [app/files](../../mockups/v2/app/files.html) |
| `/filevault/api/files/:x/download` | [app/files](../../mockups/v2/app/files.html), [app/group](../../mockups/v2/app/group.html) |
| `/filevault/api/files/:x/versions` | [app/files](../../mockups/v2/app/files.html) |
| `/filevault/api/files/:x/diff` | [app/files](../../mockups/v2/app/files.html) |
| `/filevault/api/files/:x/restore` | [app/files](../../mockups/v2/app/files.html) |
| `/filevault/api/files/:x/restore/:x` | [app/files](../../mockups/v2/app/files.html) |
| `/filevault/api/files/create` | [app/files](../../mockups/v2/app/files.html) |
| `/filevault/api/files/:x/rename` | [app/files](../../mockups/v2/app/files.html) |
| `/filevault/api/directories` | [app/files](../../mockups/v2/app/files.html) |
| `/filevault/api/directories/:x` | [app/files](../../mockups/v2/app/files.html) |
| `/filevault/api/directories/:x/rename` | [app/files](../../mockups/v2/app/files.html) |
| `/filevault/api/directories/:x/move` | [app/files](../../mockups/v2/app/files.html) |
| `/filevault/api/groups/:x/files` | [app/files](../../mockups/v2/app/files.html), [app/group](../../mockups/v2/app/group.html) |
| `/filevault/api/groups/:x/files/upload` | [app/files](../../mockups/v2/app/files.html), [app/group](../../mockups/v2/app/group.html) |
| `/filevault/api/groups/:x/directories` | [app/files](../../mockups/v2/app/files.html), [app/group](../../mockups/v2/app/group.html) |
| `/filevault/api/thumbnails/:x` | [app/files](../../mockups/v2/app/files.html), [app/group](../../mockups/v2/app/group.html) |
| `/filevault/api/share/files/:x/share` | [app/files](../../mockups/v2/app/files.html) |
| `/filevault/api/share/files/:x/shares` | [app/files](../../mockups/v2/app/files.html) |
| `/filevault/api/share/files/:x/access-token` | [app/files](../../mockups/v2/app/files.html) |
| `/filevault/api/share` | [app/files](../../mockups/v2/app/files.html) |
| `/filevault/api/share/:x` | [app/files](../../mockups/v2/app/files.html), [app/share](../../mockups/v2/app/share.html) |
| `/filevault/api/share/file/:x/download` | [app/share](../../mockups/v2/app/share.html) |
| `/filevault/api/share/:x/download` | [app/share](../../mockups/v2/app/share.html) |
| `/filevault/api/search` | [app/files](../../mockups/v2/app/files.html), [app/not-found](../../mockups/v2/app/not-found.html), [app/search](../../mockups/v2/app/search.html) |
| `/filevault/api/search/tag/:x` | [app/files](../../mockups/v2/app/files.html), [app/search](../../mockups/v2/app/search.html) |
| `/filevault/api/storage/usage` | [app/files](../../mockups/v2/app/files.html), [app/home](../../mockups/v2/app/home.html) |
| `/filevault/api/storage/quota` | [app/files](../../mockups/v2/app/files.html), [app/home](../../mockups/v2/app/home.html) |
| `/filevault/api/admin/stats` | [admin/filevault](../../mockups/v2/admin/filevault.html), [admin/overview](../../mockups/v2/admin/overview.html) |
| `/filevault/api/admin/deduplication` | [admin/filevault](../../mockups/v2/admin/filevault.html) |
| `/filevault/api/admin/duplicates` | [admin/filevault](../../mockups/v2/admin/filevault.html) |
| `/filevault/api/admin/cleanup` | [admin/filevault](../../mockups/v2/admin/filevault.html) |
| `/filevault/api/admin/cleanup/blobs` | [admin/filevault](../../mockups/v2/admin/filevault.html) |
| `/filevault/api/admin/quotas` | [admin/filevault](../../mockups/v2/admin/filevault.html) |
| `/filevault/api/admin/quotas/:x` | [admin/filevault](../../mockups/v2/admin/filevault.html) |
| `/filevault/api/admin/migrate` | [admin/filevault](../../mockups/v2/admin/filevault.html) |
| `/filevault/api/admin/verify/:x` | [admin/filevault](../../mockups/v2/admin/filevault.html) |
| `/filevault/api/admin/storage/health` | [admin/filevault](../../mockups/v2/admin/filevault.html) |
| `/filevault/webdav/*` | [app/files](../../mockups/v2/app/files.html), [admin/filevault](../../mockups/v2/admin/filevault.html) |
| `/filevault/api/health` | [admin/filevault](../../mockups/v2/admin/filevault.html) |

#### `/vault`

| Route | Screens / reason |
|---|---|
| `/vault/api/secrets` | [app/vault](../../mockups/v2/app/vault.html) |
| `/vault/api/secrets/:x` | [app/vault](../../mockups/v2/app/vault.html) |
| `/vault/api/secrets/:x/rotate` | [app/vault](../../mockups/v2/app/vault.html) |
| `/vault/api/keys` | [app/vault](../../mockups/v2/app/vault.html) |
| `/vault/api/keys/:x` | [app/vault](../../mockups/v2/app/vault.html) |
| `/vault/api/keys/generate` | [app/vault](../../mockups/v2/app/vault.html) |
| `/vault/api/keys/encrypt` | [app/vault](../../mockups/v2/app/vault.html) |
| `/vault/api/keys/decrypt` | [app/vault](../../mockups/v2/app/vault.html) |
| `/vault/api/keys/:x/rotate` | [app/vault](../../mockups/v2/app/vault.html) |
| `/vault/api/credentials` | [app/vault](../../mockups/v2/app/vault.html) |
| `/vault/api/credentials/:x/:x` | [app/vault](../../mockups/v2/app/vault.html) |
| `/vault/api/credentials/database/generate` | [app/vault](../../mockups/v2/app/vault.html) |
| `/vault/api/dynamic/database` | [app/vault](../../mockups/v2/app/vault.html) |
| `/vault/api/dynamic/api-key` | [app/vault](../../mockups/v2/app/vault.html) |
| `/vault/api/dynamic/leases` | [app/vault](../../mockups/v2/app/vault.html) |
| `/vault/api/dynamic/leases/:x/renew` | [app/vault](../../mockups/v2/app/vault.html) |
| `/vault/api/dynamic/leases/:x` | [app/vault](../../mockups/v2/app/vault.html) |
| `/vault/api/audit/logs` | [app/vault](../../mockups/v2/app/vault.html), [admin/overview](../../mockups/v2/admin/overview.html), [admin/vault](../../mockups/v2/admin/vault.html) |
| `/vault/api/audit/stats` | [app/vault](../../mockups/v2/app/vault.html), [admin/vault](../../mockups/v2/admin/vault.html) |
| `/vault/api/audit/export` | [app/vault](../../mockups/v2/app/vault.html), [admin/vault](../../mockups/v2/admin/vault.html) |
| `/vault/api/admin/tokens` | [admin/vault](../../mockups/v2/admin/vault.html) |
| `/vault/api/admin/tokens/generate` | [admin/vault](../../mockups/v2/admin/vault.html) |
| `/vault/api/admin/tokens/:x` | [admin/vault](../../mockups/v2/admin/vault.html) |
| `/vault/api/admin/tokens/:x/revoke` | [admin/vault](../../mockups/v2/admin/vault.html) |
| `/vault/api/admin/tokens/:x/suspend` | [admin/vault](../../mockups/v2/admin/vault.html) |
| `/vault/api/admin/tokens/:x/reactivate` | [admin/vault](../../mockups/v2/admin/vault.html) |
| `/vault/api/admin/tokens/bulk/revoke` | [admin/vault](../../mockups/v2/admin/vault.html) |
| `/vault/api/admin/tokens/:x/anomalies` | [admin/vault](../../mockups/v2/admin/vault.html) |
| `/vault/api/admin/policies` | [admin/vault](../../mockups/v2/admin/vault.html) |
| `/vault/api/admin/policies/:x` | [admin/vault](../../mockups/v2/admin/vault.html) |
| `/vault/api/admin/policies/suggest` | [admin/vault](../../mockups/v2/admin/vault.html) |
| `/vault/api/admin/dashboard/stats` | [admin/overview](../../mockups/v2/admin/overview.html), [admin/vault](../../mockups/v2/admin/vault.html) |
| `/vault/api/admin/reports/access` | [admin/vault](../../mockups/v2/admin/vault.html) |
| `/vault/api/admin/maintenance/purge` | [admin/vault](../../mockups/v2/admin/vault.html) |
| `/vault/api/admin/maintenance/cache/clear` | [admin/vault](../../mockups/v2/admin/vault.html) |
| `/vault/api/groups/:x/secrets` | [app/group](../../mockups/v2/app/group.html), [app/vault](../../mockups/v2/app/vault.html) |
| `/vault/api/groups/:x/secrets/:x/share` | [app/group](../../mockups/v2/app/group.html), [app/vault](../../mockups/v2/app/vault.html) |
| `/vault/api/groups/:x/secrets/:x/reveal` | [app/group](../../mockups/v2/app/group.html), [app/vault](../../mockups/v2/app/vault.html) |
| `/vault/api/config/:x` | [admin/platform](../../mockups/v2/admin/platform.html) |
| `/vault/health` | _no UI: health probe_ |

#### `/timeline`

| Route | Screens / reason |
|---|---|
| `/timeline/api/posts` | [app/feed](../../mockups/v2/app/feed.html), [app/group](../../mockups/v2/app/group.html) |
| `/timeline/api/posts/:x` | [app/bookmarks](../../mockups/v2/app/bookmarks.html), [app/feed](../../mockups/v2/app/feed.html), [app/post](../../mockups/v2/app/post.html), [admin/timeline](../../mockups/v2/admin/timeline.html) |
| `/timeline/api/posts/:x/like` | [app/bookmarks](../../mockups/v2/app/bookmarks.html), [app/feed](../../mockups/v2/app/feed.html), [app/post](../../mockups/v2/app/post.html) |
| `/timeline/api/posts/:x/comments` | [app/post](../../mockups/v2/app/post.html) |
| `/timeline/api/posts/:x/thread` | [app/post](../../mockups/v2/app/post.html), [admin/timeline](../../mockups/v2/admin/timeline.html) |
| `/timeline/api/posts/:x/quotes` | [app/post](../../mockups/v2/app/post.html), [admin/timeline](../../mockups/v2/admin/timeline.html) |
| `/timeline/api/posts/:x/analytics` | [app/post](../../mockups/v2/app/post.html), [admin/timeline](../../mockups/v2/admin/timeline.html) |
| `/timeline/api/posts/:x/repost` | [app/feed](../../mockups/v2/app/feed.html), [app/post](../../mockups/v2/app/post.html) |
| `/timeline/api/posts/:x/bookmark` | [app/bookmarks](../../mockups/v2/app/bookmarks.html), [app/feed](../../mockups/v2/app/feed.html), [app/post](../../mockups/v2/app/post.html), [app/search](../../mockups/v2/app/search.html) |
| `/timeline/api/posts/:x/likes` | [app/post](../../mockups/v2/app/post.html) |
| `/timeline/api/posts/:x/reposts` | [app/post](../../mockups/v2/app/post.html) |
| `/timeline/api/posts/:x/approval` | [app/post](../../mockups/v2/app/post.html), [admin/timeline](../../mockups/v2/admin/timeline.html) |
| `/timeline/api/posts/approvals/pending` | [app/group](../../mockups/v2/app/group.html), [app/post](../../mockups/v2/app/post.html), [admin/timeline](../../mockups/v2/admin/timeline.html) |
| `/timeline/api/timeline` | [app/feed](../../mockups/v2/app/feed.html), [app/home](../../mockups/v2/app/home.html) |
| `/timeline/api/timeline/global` | [app/feed](../../mockups/v2/app/feed.html) |
| `/timeline/api/timeline/explore` | [app/feed](../../mockups/v2/app/feed.html) |
| `/timeline/api/timeline/trending` | [app/feed](../../mockups/v2/app/feed.html) |
| `/timeline/api/timeline/bookmarks` | [app/bookmarks](../../mockups/v2/app/bookmarks.html), [app/feed](../../mockups/v2/app/feed.html) |
| `/timeline/api/timeline/likes` | [app/feed](../../mockups/v2/app/feed.html), [app/profile](../../mockups/v2/app/profile.html) |
| `/timeline/api/timeline/user/:x` | [app/profile](../../mockups/v2/app/profile.html) |
| `/timeline/api/timeline/group/:x` | [app/feed](../../mockups/v2/app/feed.html), [app/group](../../mockups/v2/app/group.html) |
| `/timeline/api/interactions/:x/like` | [app/feed](../../mockups/v2/app/feed.html) |
| `/timeline/api/interactions/:x/repost` | [app/feed](../../mockups/v2/app/feed.html) |
| `/timeline/api/interactions/:x/bookmark` | [app/bookmarks](../../mockups/v2/app/bookmarks.html), [app/feed](../../mockups/v2/app/feed.html) |
| `/timeline/api/interactions/users/:x/follow` | [app/feed](../../mockups/v2/app/feed.html), [app/people](../../mockups/v2/app/people.html), [app/post](../../mockups/v2/app/post.html), [app/profile](../../mockups/v2/app/profile.html), [app/search](../../mockups/v2/app/search.html), [app/watch](../../mockups/v2/app/watch.html) |
| `/timeline/api/interactions/users/:x/block` | [app/feed](../../mockups/v2/app/feed.html), [app/profile](../../mockups/v2/app/profile.html), [app/settings](../../mockups/v2/app/settings.html) |
| `/timeline/api/interactions/users/:x/mute` | [app/feed](../../mockups/v2/app/feed.html), [app/profile](../../mockups/v2/app/profile.html) |
| `/timeline/api/interactions/blocks` | [app/feed](../../mockups/v2/app/feed.html), [app/settings](../../mockups/v2/app/settings.html) |
| `/timeline/api/interactions/mutes` | [app/feed](../../mockups/v2/app/feed.html), [app/settings](../../mockups/v2/app/settings.html) |
| `/timeline/api/lists` | [app/feed](../../mockups/v2/app/feed.html) |
| `/timeline/api/lists/:x` | [app/feed](../../mockups/v2/app/feed.html) |
| `/timeline/api/lists/:x/members` | [app/feed](../../mockups/v2/app/feed.html) |
| `/timeline/api/lists/:x/members/:x` | [app/feed](../../mockups/v2/app/feed.html) |
| `/timeline/api/lists/:x/timeline` | [app/feed](../../mockups/v2/app/feed.html) |
| `/timeline/api/search/posts` | [app/feed](../../mockups/v2/app/feed.html), [app/not-found](../../mockups/v2/app/not-found.html), [app/search](../../mockups/v2/app/search.html), [admin/timeline](../../mockups/v2/admin/timeline.html) |
| `/timeline/api/search/hashtags` | [app/feed](../../mockups/v2/app/feed.html), [app/search](../../mockups/v2/app/search.html), [admin/timeline](../../mockups/v2/admin/timeline.html) |
| `/timeline/api/search/trending/topics` | [app/feed](../../mockups/v2/app/feed.html), [app/search](../../mockups/v2/app/search.html), [admin/timeline](../../mockups/v2/admin/timeline.html) |
| `/timeline/api/search/trending/hashtags` | [app/feed](../../mockups/v2/app/feed.html), [app/search](../../mockups/v2/app/search.html), [admin/timeline](../../mockups/v2/admin/timeline.html) |
| `/timeline/api/jobs/stats` | [admin/jobs](../../mockups/v2/admin/jobs.html), [admin/overview](../../mockups/v2/admin/overview.html), [admin/platform](../../mockups/v2/admin/platform.html), [admin/timeline](../../mockups/v2/admin/timeline.html) |
| `/timeline/api/jobs/stats/:x` | [admin/jobs](../../mockups/v2/admin/jobs.html), [admin/timeline](../../mockups/v2/admin/timeline.html) |
| `/timeline/api/jobs/:x/jobs` | [admin/jobs](../../mockups/v2/admin/jobs.html), [admin/timeline](../../mockups/v2/admin/timeline.html) |
| `/timeline/api/jobs/:x/job/:x` | [admin/jobs](../../mockups/v2/admin/jobs.html), [admin/timeline](../../mockups/v2/admin/timeline.html) |
| `/timeline/api/jobs/:x/job/:x/retry` | [admin/jobs](../../mockups/v2/admin/jobs.html), [admin/timeline](../../mockups/v2/admin/timeline.html) |
| `/timeline/api/jobs/:x/pause` | [admin/jobs](../../mockups/v2/admin/jobs.html), [admin/timeline](../../mockups/v2/admin/timeline.html) |
| `/timeline/api/jobs/:x/resume` | [admin/jobs](../../mockups/v2/admin/jobs.html), [admin/timeline](../../mockups/v2/admin/timeline.html) |
| `/timeline/api/jobs/:x/clean` | [admin/jobs](../../mockups/v2/admin/jobs.html), [admin/timeline](../../mockups/v2/admin/timeline.html) |
| `/timeline/api/attachments/posts/:x` | [app/feed](../../mockups/v2/app/feed.html), [app/post](../../mockups/v2/app/post.html) |
| `/timeline/api/attachments/comments/:x` | [app/post](../../mockups/v2/app/post.html) |
| `/timeline/api/attachments/:x` | [app/feed](../../mockups/v2/app/feed.html) |
| `/timeline/api/attachments/:x/download` | [app/feed](../../mockups/v2/app/feed.html) |
| `/timeline/api/attachments/:x/share` | [app/feed](../../mockups/v2/app/feed.html) |
| `/timeline/api/config/:x` | [admin/platform](../../mockups/v2/admin/platform.html), [admin/timeline](../../mockups/v2/admin/timeline.html) |
| `/timeline/api/webhooks/bluesky` | [admin/timeline](../../mockups/v2/admin/timeline.html) |
| `/timeline/api/webhooks/moderator` | [admin/timeline](../../mockups/v2/admin/timeline.html) |
| `/timeline/api/webhooks/approval` | [admin/timeline](../../mockups/v2/admin/timeline.html) |
| `/timeline/api/moderation/action` | _no UI: moderator → timeline service call [S]_ |

#### `/prefetch`

| Route | Screens / reason |
|---|---|
| `/prefetch/api/prefetch/schedule/:x` | [admin/prefetch](../../mockups/v2/admin/prefetch.html) |
| `/prefetch/api/prefetch/immediate/:x` | [admin/prefetch](../../mockups/v2/admin/prefetch.html) |
| `/prefetch/api/prefetch/:x` | [admin/prefetch](../../mockups/v2/admin/prefetch.html) |
| `/prefetch/api/prefetch/:x/timeline` | [admin/prefetch](../../mockups/v2/admin/prefetch.html) |
| `/prefetch/api/prefetch/status/:x` | [admin/prefetch](../../mockups/v2/admin/prefetch.html) |
| `/prefetch/api/prefetch/queue/stats` | [admin/jobs](../../mockups/v2/admin/jobs.html), [admin/overview](../../mockups/v2/admin/overview.html), [admin/prefetch](../../mockups/v2/admin/prefetch.html) |
| `/prefetch/api/prefetch/queue/failed` | [admin/jobs](../../mockups/v2/admin/jobs.html), [admin/prefetch](../../mockups/v2/admin/prefetch.html) |
| `/prefetch/api/prefetch/queue/retry/:x` | [admin/jobs](../../mockups/v2/admin/jobs.html), [admin/prefetch](../../mockups/v2/admin/prefetch.html) |
| `/prefetch/api/prefetch/metrics` | [admin/prefetch](../../mockups/v2/admin/prefetch.html) |
| `/prefetch/api/prefetch/metrics/:x` | [admin/prefetch](../../mockups/v2/admin/prefetch.html) |
| `/prefetch/api/cache/*` | [admin/prefetch](../../mockups/v2/admin/prefetch.html) |
| `/prefetch/api/config/:x` | [admin/platform](../../mockups/v2/admin/platform.html), [admin/prefetch](../../mockups/v2/admin/prefetch.html) |

#### `/moderator`

| Route | Screens / reason |
|---|---|
| `/moderator/api/moderate/content` | _no UI: service ingest [S]_ |
| `/moderator/api/moderate/batch` | _no UI: service ingest [S]_ |
| `/moderator/api/moderate/status/:x/:x/:x` | [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/queue` | [admin/moderator](../../mockups/v2/admin/moderator.html), [admin/overview](../../mockups/v2/admin/overview.html) |
| `/moderator/api/queue/pending` | [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/queue/:x` | [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/queue/:x/approve` | [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/queue/:x/reject` | [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/queue/:x/analyze` | [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/queue/:x/warn` | [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/queue/:x/remove` | [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/queue/:x/ban` | [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/queue/:x/skip` | [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/reports` | [app/feed](../../mockups/v2/app/feed.html), [app/moderation](../../mockups/v2/app/moderation.html), [app/profile](../../mockups/v2/app/profile.html), [app/watch](../../mockups/v2/app/watch.html), [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/reports/:x` | [app/moderation](../../mockups/v2/app/moderation.html), [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/reports/:x/resolve` | [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/rules` | [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/rules/:x` | [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/rules/:x/test` | [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/rules/:x/enable` | [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/rules/:x/disable` | [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/appeals` | [app/moderation](../../mockups/v2/app/moderation.html), [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/appeals/stats/summary` | [admin/moderator](../../mockups/v2/admin/moderator.html), [admin/overview](../../mockups/v2/admin/overview.html) |
| `/moderator/api/appeals/case/:x` | [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/appeals/:x` | [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/appeals/:x/review` | [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/workflows` | [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/workflows/active` | [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/workflows/:x` | [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/workflows/:x/execute` | [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/workflows/executions` | [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/workflows/executions/recent` | [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/workflows/executions/:x` | [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/metrics` | [admin/moderator](../../mockups/v2/admin/moderator.html), [admin/overview](../../mockups/v2/admin/overview.html) |
| `/moderator/api/metrics/export` | [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/actions/recent` | [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/actions/:x` | [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/actions/content/:x/:x` | [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/actions/execute` | [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/actions/providers/status` | [admin/ai](../../mockups/v2/admin/ai.html), [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/agents` | [admin/ai](../../mockups/v2/admin/ai.html), [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/agents/:x` | [admin/ai](../../mockups/v2/admin/ai.html), [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/agents/:x/enable` | [admin/ai](../../mockups/v2/admin/ai.html), [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/agents/:x/disable` | [admin/ai](../../mockups/v2/admin/ai.html), [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/wordlists` | [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/wordlists/:x` | [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/queues` | [admin/jobs](../../mockups/v2/admin/jobs.html), [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/queues/:x` | [admin/jobs](../../mockups/v2/admin/jobs.html) |
| `/moderator/api/queues/:x/stats` | [admin/jobs](../../mockups/v2/admin/jobs.html), [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/queues/:x/test` | [admin/jobs](../../mockups/v2/admin/jobs.html), [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/queues/:x/dlq` | [admin/jobs](../../mockups/v2/admin/jobs.html), [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/queues/:x/dlq/redrive` | [admin/jobs](../../mockups/v2/admin/jobs.html), [admin/moderator](../../mockups/v2/admin/moderator.html) |
| `/moderator/api/config/:x` | [admin/ai](../../mockups/v2/admin/ai.html), [admin/platform](../../mockups/v2/admin/platform.html) |
| `/moderator/api/notifications#POST` | [app/home](../../mockups/v2/app/home.html), [app/moderation](../../mockups/v2/app/moderation.html) |
| `/moderator/api/notifications` | [app/home](../../mockups/v2/app/home.html), [app/moderation](../../mockups/v2/app/moderation.html) |
| `/moderator/api/notifications/unread-count` | [app/home](../../mockups/v2/app/home.html), [app/moderation](../../mockups/v2/app/moderation.html) |
| `/moderator/api/notifications/read-all` | [app/moderation](../../mockups/v2/app/moderation.html) |
| `/moderator/api/notifications/:x/read` | [app/moderation](../../mockups/v2/app/moderation.html) |
| `/moderator/api/notifications/:x` | [app/moderation](../../mockups/v2/app/moderation.html) |

#### `/live`

| Route | Screens / reason |
|---|---|
| `/live/api/streams` | [app/streams](../../mockups/v2/app/streams.html), [admin/live](../../mockups/v2/admin/live.html) |
| `/live/api/streams/:x` | [app/streams](../../mockups/v2/app/streams.html), [app/watch](../../mockups/v2/app/watch.html), [admin/live](../../mockups/v2/admin/live.html) |
| `/live/api/streams/:x/start` | [app/streams](../../mockups/v2/app/streams.html), [admin/live](../../mockups/v2/admin/live.html) |
| `/live/api/streams/:x/stop` | [app/streams](../../mockups/v2/app/streams.html), [app/watch](../../mockups/v2/app/watch.html), [admin/live](../../mockups/v2/admin/live.html) |
| `/live/api/streams/:x/share-events` | [app/streams](../../mockups/v2/app/streams.html), [app/watch](../../mockups/v2/app/watch.html), [admin/live](../../mockups/v2/admin/live.html) |
| `/live/api/streams/:x/recordings` | [app/streams](../../mockups/v2/app/streams.html), [app/watch](../../mockups/v2/app/watch.html), [admin/live](../../mockups/v2/admin/live.html) |
| `/live/api/rooms` | [app/rooms](../../mockups/v2/app/rooms.html), [admin/live](../../mockups/v2/admin/live.html) |
| `/live/api/rooms/:x` | [app/room](../../mockups/v2/app/room.html), [app/rooms](../../mockups/v2/app/rooms.html), [admin/live](../../mockups/v2/admin/live.html) |
| `/live/api/rooms/code/:x` | [app/rooms](../../mockups/v2/app/rooms.html), [admin/live](../../mockups/v2/admin/live.html) |
| `/live/api/rooms/:x/join` | [app/room](../../mockups/v2/app/room.html), [app/rooms](../../mockups/v2/app/rooms.html) |
| `/live/api/rooms/:x/leave` | [app/room](../../mockups/v2/app/room.html), [app/rooms](../../mockups/v2/app/rooms.html) |
| `/live/api/rooms/:x/participants` | [app/room](../../mockups/v2/app/room.html), [app/rooms](../../mockups/v2/app/rooms.html), [admin/live](../../mockups/v2/admin/live.html) |
| `/live/api/rooms/:x/recordings` | [app/room](../../mockups/v2/app/room.html), [app/rooms](../../mockups/v2/app/rooms.html), [admin/live](../../mockups/v2/admin/live.html) |
| `/live/api/rooms/:x/invites` | [app/room](../../mockups/v2/app/room.html), [app/rooms](../../mockups/v2/app/rooms.html) |
| `/live/api/rooms/:x/invites/:x` | [app/rooms](../../mockups/v2/app/rooms.html) |
| `/live/api/rooms/:x/join-requests` | [app/room](../../mockups/v2/app/room.html), [app/rooms](../../mockups/v2/app/rooms.html) |
| `/live/api/rooms/:x/join-requests/:x/:x` | [app/room](../../mockups/v2/app/room.html), [app/rooms](../../mockups/v2/app/rooms.html) |
| `/live/api/rooms/:x/recording/start` | [app/room](../../mockups/v2/app/room.html) |
| `/live/api/rooms/:x/recording/stop` | [app/room](../../mockups/v2/app/room.html) |
| `/live/api/rooms/:x/files` | [app/room](../../mockups/v2/app/room.html) |
| `/live/api/rooms/:x/files/share` | [app/room](../../mockups/v2/app/room.html) |
| `/live/api/rooms/:x/files/upload` | [app/room](../../mockups/v2/app/room.html) |
| `/live/api/rooms/:x/files/:x/download` | [app/room](../../mockups/v2/app/room.html) |
| `/live/api/rooms/:x/files/:x` | [app/room](../../mockups/v2/app/room.html) |
| `/live/api/simulcast/:x/start` | [app/watch](../../mockups/v2/app/watch.html) |
| `/live/api/simulcast/:x/stop` | [app/watch](../../mockups/v2/app/watch.html) |
| `/live/api/simulcast/:x/status` | [app/watch](../../mockups/v2/app/watch.html), [admin/live](../../mockups/v2/admin/live.html) |
| `/live/api/simulcast/:x/health` | [app/watch](../../mockups/v2/app/watch.html), [admin/live](../../mockups/v2/admin/live.html) |
| `/live/api/simulcast/:x/metrics` | [app/watch](../../mockups/v2/app/watch.html), [admin/live](../../mockups/v2/admin/live.html) |
| `/live/api/simulcast/:x/destinations` | [app/streams](../../mockups/v2/app/streams.html), [app/watch](../../mockups/v2/app/watch.html) |
| `/live/api/simulcast/:x/destinations/:x` | [app/watch](../../mockups/v2/app/watch.html) |
| `/live/api/destinations` | [app/streams](../../mockups/v2/app/streams.html), [admin/live](../../mockups/v2/admin/live.html) |
| `/live/api/destinations/:x` | [app/streams](../../mockups/v2/app/streams.html), [admin/live](../../mockups/v2/admin/live.html) |
| `/live/api/destinations/platforms/:x/auth-url` | [app/streams](../../mockups/v2/app/streams.html), [admin/live](../../mockups/v2/admin/live.html) |
| `/live/api/destinations/platforms/:x/exchange-token` | [app/streams](../../mockups/v2/app/streams.html), [admin/live](../../mockups/v2/admin/live.html) |
| `/live/api/destinations/:x/test-connection` | [app/streams](../../mockups/v2/app/streams.html), [admin/live](../../mockups/v2/admin/live.html) |
| `/live/api/groups/:x/streams` | [app/group](../../mockups/v2/app/group.html), [admin/live](../../mockups/v2/admin/live.html) |
| `/live/api/config/:x` | [admin/live](../../mockups/v2/admin/live.html), [admin/platform](../../mockups/v2/admin/platform.html) |
| `/live/api/config/workers/stats` | [admin/live](../../mockups/v2/admin/live.html) |
| `/live/api/stats` | [app/streams](../../mockups/v2/app/streams.html), [admin/live](../../mockups/v2/admin/live.html), [admin/overview](../../mockups/v2/admin/overview.html) |

#### `/atproto`

| Route | Screens / reason |
|---|---|
| `/atproto/health` | [admin/atproto](../../mockups/v2/admin/atproto.html) |
| `/atproto/service-record` | [admin/atproto](../../mockups/v2/admin/atproto.html) |
| `/atproto/feed-record` | [admin/atproto](../../mockups/v2/admin/atproto.html) |
| `/atproto/identity` | [admin/atproto](../../mockups/v2/admin/atproto.html) |
| `/atproto/stats` | [admin/atproto](../../mockups/v2/admin/atproto.html), [admin/overview](../../mockups/v2/admin/overview.html) |
| `/atproto/inbound-labels` | [admin/atproto](../../mockups/v2/admin/atproto.html) |
| `/atproto/external-labelers` | [admin/atproto](../../mockups/v2/admin/atproto.html) |
| `/atproto/labels/verify` | [admin/atproto](../../mockups/v2/admin/atproto.html) |
| `/atproto/labels` | [admin/atproto](../../mockups/v2/admin/atproto.html) |
| `/atproto/labels/negate` | [admin/atproto](../../mockups/v2/admin/atproto.html) |
| `/atproto/users/:x/dids` | [app/people](../../mockups/v2/app/people.html), [app/profile](../../mockups/v2/app/profile.html), [app/settings](../../mockups/v2/app/settings.html), [admin/atproto](../../mockups/v2/admin/atproto.html) |
| `/atproto/users/:x/dids/challenge` | [app/profile](../../mockups/v2/app/profile.html), [app/settings](../../mockups/v2/app/settings.html), [admin/atproto](../../mockups/v2/admin/atproto.html) |
| `/atproto/users/:x/dids/verify` | [app/profile](../../mockups/v2/app/profile.html), [app/settings](../../mockups/v2/app/settings.html), [admin/atproto](../../mockups/v2/admin/atproto.html) |
| `/atproto/users/:x/dids/:x` | [app/profile](../../mockups/v2/app/profile.html), [app/settings](../../mockups/v2/app/settings.html), [admin/atproto](../../mockups/v2/admin/atproto.html) |

#### `/atproto (origin root)`

| Route | Screens / reason |
|---|---|
| `/.well-known/did.json` | [admin/atproto](../../mockups/v2/admin/atproto.html) |
| `/.well-known/atproto-did` | [admin/atproto](../../mockups/v2/admin/atproto.html) |
| `/xrpc/com.atproto.label.queryLabels` | [admin/atproto](../../mockups/v2/admin/atproto.html) |
| `/xrpc/com.exprsn.identity.resolveDid` | [admin/atproto](../../mockups/v2/admin/atproto.html) |
| `/xrpc/app.bsky.feed.describeFeedGenerator` | [admin/atproto](../../mockups/v2/admin/atproto.html) |
| `/xrpc/app.bsky.feed.getFeedSkeleton` | [admin/atproto](../../mockups/v2/admin/atproto.html) |
| `/xrpc/com.atproto.label.subscribeLabels` | [admin/atproto](../../mockups/v2/admin/atproto.html) |

#### `/plugins`

| Route | Screens / reason |
|---|---|
| `/plugins/api/plugins` | [admin/plugins](../../mockups/v2/admin/plugins.html) |
| `/plugins/api/plugins/:x` | [admin/plugins](../../mockups/v2/admin/plugins.html) |
| `/plugins/api/plugins/validate` | [admin/plugins](../../mockups/v2/admin/plugins.html) |
| `/plugins/api/installations` | [admin/plugins](../../mockups/v2/admin/plugins.html) |
| `/plugins/api/installations/:x` | [admin/plugins](../../mockups/v2/admin/plugins.html) |
| `/plugins/api/installations/:x/transitions` | [admin/plugins](../../mockups/v2/admin/plugins.html) |
| `/plugins/api/installations/:x/transition` | [admin/plugins](../../mockups/v2/admin/plugins.html) |
| `/plugins/api/installations/:x/enable` | [admin/plugins](../../mockups/v2/admin/plugins.html) |
| `/plugins/api/installations/:x/disable` | [admin/plugins](../../mockups/v2/admin/plugins.html) |
| `/plugins/api/endpoints` | [admin/plugins](../../mockups/v2/admin/plugins.html) |
| `/plugins/api/endpoints/:x` | [admin/plugins](../../mockups/v2/admin/plugins.html) |
| `/plugins/api/deliveries` | [admin/plugins](../../mockups/v2/admin/plugins.html) |
| `/plugins/api/surfaces` | [app/apps](../../mockups/v2/app/apps.html), [admin/plugins](../../mockups/v2/admin/plugins.html) |
| `/plugins/api/registry/capabilities` | [admin/plugins](../../mockups/v2/admin/plugins.html) |
| `/plugins/api/registry/events` | [admin/plugins](../../mockups/v2/admin/plugins.html) |
| `/plugins/api/registry/lifecycle` | [admin/plugins](../../mockups/v2/admin/plugins.html) |
| `/plugins/api/callback/:x/notify` | _no UI: plugin → platform callback (plugin auth)_ |
| `/plugins/api/callback/:x/flag` | _no UI: plugin → platform callback (plugin auth)_ |
| `/plugins/health` | _no UI: health probe_ |

#### `/lowcode`

| Route | Screens / reason |
|---|---|
| `/lowcode/api/design/apps` | [app/apps](../../mockups/v2/app/apps.html), [app/group](../../mockups/v2/app/group.html), [admin/lowcode](../../mockups/v2/admin/lowcode.html) |
| `/lowcode/api/design/apps/:x` | [app/apps](../../mockups/v2/app/apps.html), [admin/lowcode](../../mockups/v2/admin/lowcode.html) |
| `/lowcode/api/design/apps/:x/export` | [admin/lowcode](../../mockups/v2/admin/lowcode.html) |
| `/lowcode/api/design/apps/import` | [admin/lowcode](../../mockups/v2/admin/lowcode.html) |
| `/lowcode/api/design/lookup-providers` | [admin/lowcode](../../mockups/v2/admin/lowcode.html) |
| `/lowcode/api/design/lookups` | [admin/lowcode](../../mockups/v2/admin/lowcode.html) |
| `/lowcode/api/design/lookups/:x` | [admin/lowcode](../../mockups/v2/admin/lowcode.html) |
| `/lowcode/api/design/lookups/:x/resolved` | [app/apps](../../mockups/v2/app/apps.html), [admin/lowcode-entity](../../mockups/v2/admin/lowcode-entity.html), [admin/lowcode](../../mockups/v2/admin/lowcode.html) |
| `/lowcode/api/design/entities` | [app/apps](../../mockups/v2/app/apps.html), [admin/lowcode](../../mockups/v2/admin/lowcode.html) |
| `/lowcode/api/design/entities/:x` | [admin/lowcode-entity](../../mockups/v2/admin/lowcode-entity.html) |
| `/lowcode/api/design/entities/:x/export` | [admin/lowcode-entity](../../mockups/v2/admin/lowcode-entity.html) |
| `/lowcode/api/design/entities/:x/truncate` | [admin/lowcode-entity](../../mockups/v2/admin/lowcode-entity.html) |
| `/lowcode/api/design/forms` | [admin/lowcode](../../mockups/v2/admin/lowcode.html) |
| `/lowcode/api/design/forms/:x` | [app/apps](../../mockups/v2/app/apps.html), [admin/lowcode](../../mockups/v2/admin/lowcode.html) |
| `/lowcode/api/design/flows` | [admin/lowcode](../../mockups/v2/admin/lowcode.html) |
| `/lowcode/api/design/flows/:x` | [admin/lowcode-flow](../../mockups/v2/admin/lowcode-flow.html), [admin/lowcode](../../mockups/v2/admin/lowcode.html) |
| `/lowcode/api/design/flows/:x/execute` | [admin/lowcode-flow](../../mockups/v2/admin/lowcode-flow.html) |
| `/lowcode/api/design/flows/:x/runs` | [admin/lowcode-flow](../../mockups/v2/admin/lowcode-flow.html), [admin/lowcode](../../mockups/v2/admin/lowcode.html) |
| `/lowcode/api/design/ai/generate` | [admin/lowcode](../../mockups/v2/admin/lowcode.html) |
| `/lowcode/api/design/catalog` | [app/apps](../../mockups/v2/app/apps.html), [admin/lowcode-flow](../../mockups/v2/admin/lowcode-flow.html), [admin/lowcode](../../mockups/v2/admin/lowcode.html) |
| `/lowcode/api/data/:x/records` | [app/apps](../../mockups/v2/app/apps.html), [admin/lowcode-entity](../../mockups/v2/admin/lowcode-entity.html) |
| `/lowcode/api/data/:x/records/:x` | [app/apps](../../mockups/v2/app/apps.html), [admin/lowcode-entity](../../mockups/v2/admin/lowcode-entity.html) |
| `/lowcode/api/data/:x/records/export` | [app/apps](../../mockups/v2/app/apps.html), [admin/lowcode-entity](../../mockups/v2/admin/lowcode-entity.html) |
| `/lowcode/api/data/:x/records/import` | [app/apps](../../mockups/v2/app/apps.html), [admin/lowcode-entity](../../mockups/v2/admin/lowcode-entity.html) |
| `/lowcode/api/data/:x/records/bulk` | [app/apps](../../mockups/v2/app/apps.html), [admin/lowcode-entity](../../mockups/v2/admin/lowcode-entity.html) |
| `/lowcode/api/data/:x/records/:x/transition` | [app/apps](../../mockups/v2/app/apps.html), [admin/lowcode-entity](../../mockups/v2/admin/lowcode-entity.html) |
| `/lowcode/api/data/:x/aggregate` | [app/apps](../../mockups/v2/app/apps.html), [admin/lowcode-entity](../../mockups/v2/admin/lowcode-entity.html) |
| `/lowcode/api/data/:x/views` | [app/apps](../../mockups/v2/app/apps.html), [admin/lowcode-entity](../../mockups/v2/admin/lowcode-entity.html) |
| `/lowcode/api/data/:x/views/:x` | [app/apps](../../mockups/v2/app/apps.html), [admin/lowcode-entity](../../mockups/v2/admin/lowcode-entity.html) |
| `/lowcode/api/hooks/flows/:x/:x` | [admin/lowcode-flow](../../mockups/v2/admin/lowcode-flow.html) |
| `/lowcode/api/hooks/forms/:x` | [app/form](../../mockups/v2/app/form.html), [admin/lowcode](../../mockups/v2/admin/lowcode.html) |
| `/lowcode/api/hooks/forms/:x/submit` | [app/form](../../mockups/v2/app/form.html) |

#### `/cortex`

| Route | Screens / reason |
|---|---|
| `/cortex/api/v1/models` | [app/cortex](../../mockups/v2/app/cortex.html), [admin/ai](../../mockups/v2/admin/ai.html), [admin/cortex](../../mockups/v2/admin/cortex.html) |
| `/cortex/api/v1/tasks` | [app/cortex](../../mockups/v2/app/cortex.html), [admin/cortex](../../mockups/v2/admin/cortex.html) |
| `/cortex/api/v1/tasks/:x` | [app/cortex-task](../../mockups/v2/app/cortex-task.html) |
| `/cortex/api/v1/agents` | [app/cortex](../../mockups/v2/app/cortex.html), [admin/cortex](../../mockups/v2/admin/cortex.html) |
| `/cortex/api/v1/agents/:x` | [app/cortex](../../mockups/v2/app/cortex.html), [admin/cortex](../../mockups/v2/admin/cortex.html) |
| `/cortex/api/v1/agents/:x/run` | [app/cortex-task](../../mockups/v2/app/cortex-task.html), [app/cortex](../../mockups/v2/app/cortex.html), [admin/cortex](../../mockups/v2/admin/cortex.html) |
| `/cortex/api/v1/agents/:x/runs` | [app/cortex-task](../../mockups/v2/app/cortex-task.html), [app/cortex](../../mockups/v2/app/cortex.html), [admin/cortex](../../mockups/v2/admin/cortex.html) |
| `/cortex/api/v1/agents/:x/runs/:x` | [app/cortex-task](../../mockups/v2/app/cortex-task.html), [admin/cortex](../../mockups/v2/admin/cortex.html) |
| `/cortex/api/v1/agents/build` | [admin/cortex](../../mockups/v2/admin/cortex.html) |
| `/cortex/api/v1/agents/:x/validate` | [admin/cortex](../../mockups/v2/admin/cortex.html) |
| `/cortex/api/v1/agents/:x/enable` | [admin/cortex](../../mockups/v2/admin/cortex.html) |
| `/cortex/api/v1/agents/:x/disable` | [admin/cortex](../../mockups/v2/admin/cortex.html) |
| `/cortex/api/v1/agents/:x/smoke` | [admin/cortex](../../mockups/v2/admin/cortex.html) |
| `/cortex/api/v1/chat` | [app/cortex](../../mockups/v2/app/cortex.html) |
| `/cortex/api/v1/chat/:x` | [app/cortex](../../mockups/v2/app/cortex.html) |
| `/cortex/api/v1/cs/chat` | [app/cortex](../../mockups/v2/app/cortex.html) |
| `/cortex/api/v1/cs/chat/:x` | [app/cortex](../../mockups/v2/app/cortex.html) |
| `/cortex/api/v1/cs/email` | [app/cortex](../../mockups/v2/app/cortex.html) |
| `/cortex/api/v1/outbox` | [app/cortex](../../mockups/v2/app/cortex.html), [admin/cortex](../../mockups/v2/admin/cortex.html) |
| `/cortex/api/v1/outbox/:x` | [app/cortex-task](../../mockups/v2/app/cortex-task.html), [admin/cortex](../../mockups/v2/admin/cortex.html) |
| `/cortex/api/v1/reviews` | [admin/cortex](../../mockups/v2/admin/cortex.html) |
| `/cortex/api/v1/reviews/:x` | [admin/cortex](../../mockups/v2/admin/cortex.html) |
| `/cortex/api/v1/guardrails` | [app/cortex-task](../../mockups/v2/app/cortex-task.html), [app/cortex](../../mockups/v2/app/cortex.html), [admin/ai](../../mockups/v2/admin/ai.html), [admin/cortex](../../mockups/v2/admin/cortex.html) |
| `/cortex/api/v1/guardrails/build` | [admin/ai](../../mockups/v2/admin/ai.html), [admin/cortex](../../mockups/v2/admin/cortex.html) |
| `/cortex/api/v1/guardrails/:x` | [admin/ai](../../mockups/v2/admin/ai.html), [admin/cortex](../../mockups/v2/admin/cortex.html) |
| `/cortex/api/v1/guardrails/:x/:x` | [admin/ai](../../mockups/v2/admin/ai.html), [admin/cortex](../../mockups/v2/admin/cortex.html) |
| `/cortex/api/v1/tools` | [app/cortex](../../mockups/v2/app/cortex.html), [admin/ai](../../mockups/v2/admin/ai.html), [admin/cortex](../../mockups/v2/admin/cortex.html) |
| `/cortex/api/v1/tools/build` | [admin/ai](../../mockups/v2/admin/ai.html), [admin/cortex](../../mockups/v2/admin/cortex.html) |
| `/cortex/api/v1/tools/:x` | [admin/ai](../../mockups/v2/admin/ai.html), [admin/cortex](../../mockups/v2/admin/cortex.html) |
| `/cortex/api/v1/tools/:x/:x` | [admin/ai](../../mockups/v2/admin/ai.html), [admin/cortex](../../mockups/v2/admin/cortex.html) |
| `/cortex/api/v1/skills` | [app/cortex](../../mockups/v2/app/cortex.html), [admin/ai](../../mockups/v2/admin/ai.html), [admin/cortex](../../mockups/v2/admin/cortex.html) |
| `/cortex/api/v1/skills/build` | [admin/ai](../../mockups/v2/admin/ai.html), [admin/cortex](../../mockups/v2/admin/cortex.html) |
| `/cortex/api/v1/skills/:x` | [admin/ai](../../mockups/v2/admin/ai.html), [admin/cortex](../../mockups/v2/admin/cortex.html) |
| `/cortex/api/v1/skills/:x/:x` | [admin/ai](../../mockups/v2/admin/ai.html), [admin/cortex](../../mockups/v2/admin/cortex.html) |
| `/cortex/api/v1/prompts` | [admin/ai](../../mockups/v2/admin/ai.html), [admin/cortex](../../mockups/v2/admin/cortex.html) |
| `/cortex/health` | [app/cortex](../../mockups/v2/app/cortex.html), [admin/ai](../../mockups/v2/admin/ai.html), [admin/cortex](../../mockups/v2/admin/cortex.html), [admin/overview](../../mockups/v2/admin/overview.html) |

#### `/timeline`

| Route | Screens / reason |
|---|---|
| `/timeline/health/*` | [admin/timeline](../../mockups/v2/admin/timeline.html) |

#### `/prefetch`

| Route | Screens / reason |
|---|---|
| `/prefetch/health/*` | [admin/prefetch](../../mockups/v2/admin/prefetch.html) |

<!-- coverage:end -->

## 8. Backend prerequisites found while building the inventory

These affect what the screens can do. The "Where it shows" column names the screen whose Contract drawer carries the gap. These should be split into BUG/TASK tickets before the build starts.

| # | Severity | Finding | Where it shows |
|---|---|---|---|
| P1 | High | **Spark REST emits go to the root namespace.** `req.io` is the root `Server`, so `message:new`, `message:pinned/unpinned`, `message:reply`, the REST path of `message:edited/deleted`, and `participant:added` never reach `/spark` clients. Fix: `io.of('/spark')`. | messages, admin/spark |
| P2 | High | **`/vault` socket grants every token in non-production `dev_user` with all permissions.** Clients can also `subscribe` to arbitrary channel names without validation. | vault, admin/vault |
| P3 | High | **`/ca` socket admits anonymous clients**, and `certificate:*`/`token:*` subscribe events aren't authorised. The ~20 CA emit helpers have no callers, so certificate and token screens can't update live. | certs, admin/ca, admin/users |
| P4 | Med | **Timeline IPC `post:created/updated/deleted` broadcasts to the whole namespace**, ignoring group and visibility. `timeline:group:{id}` rooms don't check membership. | feed, group, admin/timeline |
| P5 | Med | **`web/src/lib/realtime.ts` has no `/cortex` namespace**, so the assistant can't stream over the socket. SSE is the fallback. | cortex, admin/cortex |
| P6 | Med | **No per-user room on `/spark`**, so unread badges for conversations that aren't joined can't update live. | messages, home |
| P7 | Med | **`add:reaction` has no participant check.** | messages |
| P8 | Med | **No user, session or queue lifecycle events on `/_admin`.** Admin tables poll. Proposed: `user:*`, `session:revoked`, and `job:*` on `/_admin`. | admin/users, admin/jobs |
| P9 | Med | **`/auth/api/config/:sectionId` and `/timeline/api/config/:sectionId` are publicly writable.** | admin/platform, admin/auth |
| P10 | Med | **LDAP routes exist but aren't mounted**, so the admin LDAP UI has no backend. | admin/auth |
| P11 | Med | **Live lifecycle has no platform-admin override**, so an admin can't stop someone else's stream. | admin/live |
| P12 | Med | **Nexus event `check-in` / `notify` are "admin intent" but unenforced.** | group, admin/nexus |
| P13 | Low | **`API_SURFACE.md` drift.** Moderator and atproto ops auth, `/live` and `/moderation` socket auth, and missing events (`message:redacted`, `post:retracted`, `/_health`, moderator agents/wordlists/queues) are out of date. | — |
| P14 | Low | **No OAuth consent screen route in the SPA** for `/auth/api/oauth2/authorize`. | (proposed screen) |
| P15 | Med | **`POST /auth/api/applications` spreads `req.body` into `Application.create`.** An org admin can set `isTrusted`, `isFirstParty` or `clientSecret` directly. Nothing reads `isTrusted` today, but the mass-assignment should be allow-listed. | orgs, admin/auth |
| P16 | Med | **CA root, intermediate, code-signing and CSR routes use `requireAdminSession`**, which a bearer-token SPA can't satisfy. | admin/ca |
| P17 | Med | **Users can't see their own reports or appeals** (`GET /moderator/api/reports/:id` and `/appeals` are admin-only), and resolving a report doesn't notify the reporter. | moderation, admin/moderator |
| P18 | Med | **Rooms have no TURN relay configured**, so calls fail behind symmetric NAT. Room knocks and recording start/stop also emit no socket events. | room, rooms |
| P19 | Med | **`stream-started/ended/deleted` go to the whole `/live` namespace**, leaking private stream titles. Admin viewer counts need a non-counting observer room. | streams, admin/live |
| P20 | Med | **The moderation queue emits `queue:item_claimed` but has no claim route.** | admin/moderator |
| P21 | Low | **`/health` has no per-module status**, so module tiles infer health. Proposed: a per-module fan-out in the gateway health collector. | admin/overview, home |
| P22 | Low | **Smaller gaps.** WebDAV accepts bearer tokens only (desktop clients send Basic auth); thumbnails need a session, so shared links can't preview; the storage quota is hard-coded to 10 GB; there are no follower/following list endpoints, no cortex task cancel, and no lowcode record history. | files, share, profile, cortex-task, apps |

Endpoints that the mockups *propose* (a design need with no route yet) are listed at the end of §7.

## 9. Working with the mockups

```bash
# view
npx serve mockups/v2            # or just open mockups/v2/index.html

# verify (needs the preinstalled Playwright; axe-core optional)
NODE_PATH=$(npm root -g) node mockups/v2/tools/check-pages.js [--axe] [--shots <dir>] [filter]
node mockups/v2/tools/check-tokens.js
node mockups/v2/tools/coverage.js [--write]
node mockups/v2/tools/build-gallery.js     # regenerates index.html from nav + contracts
```

Adding a screen:

1. Copy `app/messages.html` or `admin/users.html`.
2. Add the nav entry in `shell.js`.
3. Fill the contract.
4. Bind the elements with `data-api`, `data-on` and `data-emit`.
5. Run the four tools.

The v1 mockups in `mockups/*.html` are superseded and kept for history.
