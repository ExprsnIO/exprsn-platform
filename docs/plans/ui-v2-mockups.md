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

### 4.1 Tokens added by v2 (aliases only)

These resolve to existing `--exprsn-*` values, so the palette doesn't change. They exist because axe found several small-text contrast failures when raw tokens were used on tints. Add them to `exprsn-unified.css` / `tokens.ts` when the build adopts v2.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--v2-primary-fg` | `--exprsn-primary-hover` (#0052cc) | `--exprsn-primary-hover` (#60a5fa) | Primary-coloured text on page surfaces and on primary tints (active nav, tonal buttons, pressed chips) |
| `--v2-ok-fg` / `--v2-warn-fg` / `--v2-danger-fg` | `-text` shades | saturated mains / `-emphasis` | Small semantic text outside pills, such as stat deltas and method labels |
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
_Run `node mockups/v2/tools/coverage.js --write` to regenerate._
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
