# Exprsn Platform — Administrative Interface Design Specification (Claude Design)

> **Status:** proposed · **Ticket:** TASK-073 (`sprints/BACKLOG.md`) · **Supersedes:** the shipped `/admin` IA of TASK-039 and the `mockups/admin-*.html` explorations · **Date:** 2026-09-07
>
> This is the design specification for the next-generation `/admin` console of the unified
> Exprsn platform. It is written to be consumed by Claude Design (as the brief for artboards and
> the component library) and by the frontend team (as the acceptance contract). It was produced
> from a source read of every module in `src/modules/registry.js` — routes, Socket.IO namespaces,
> Sequelize models and ENUMs, config/env, queues and identifiers — plus `API_SURFACE.md`,
> `ARCHITECTURE.md`, `STATUS.md`, `docker-compose.yml`, `.env.example`, the setup TUI, the shared
> middleware, and the existing SPA (`web/src/features/admin`).

---

## Table of contents

1. [Purpose, scope, and how to read this document](#1-purpose-scope-and-how-to-read-this-document)
2. [Platform truths the UI must respect](#2-platform-truths-the-ui-must-respect)
3. [Information architecture and the shell](#3-information-architecture-and-the-shell)
4. [Design system: tokens, typography, color, theming](#4-design-system-tokens-typography-color-theming)
5. [Accessibility (WCAG 2.2 AA) and HIG conformance](#5-accessibility-wcag-22-aa-and-hig-conformance)
6. [Universal components](#6-universal-components)
   - 6.1 DataTable (filter · sort · pin · group · per-field text filter)
   - 6.2 Collection views: card, grid, list
   - 6.3 Date and time pickers
   - 6.4 Dialog system
   - 6.5 Lookup dialogs (users, orgs, groups, tokens, CID/DID, DB rows, cache keys, broker messages)
   - 6.6 Token issuance (time-based, use-based, persistent)
   - 6.7 Forms, validation, and the enum registry
   - 6.8 Status, identifiers, timestamps, secrets
   - 6.9 Feedback: toasts, banners, empty/loading/error states
   - 6.10 Charts and stat tiles
7. [Overview and Platform](#7-overview-and-platform)
8. [Organization / Tenant Explorer](#8-organization--tenant-explorer)
9. [Module specifications](#9-module-specifications)
   - 9.1 Certificate Authority (`ca`)
   - 9.2 Identity and Access (`auth`)
   - 9.3 Spark messaging (`spark`)
   - 9.4 Nexus groups (`nexus`)
   - 9.5 FileVault (`filevault`)
   - 9.6 Vault secrets (`vault`)
   - 9.7 Timeline (`timeline`)
   - 9.8 Prefetch (`prefetch`)
   - 9.9 Moderation (`moderator`)
   - 9.10 Live streaming (`live`)
   - 9.11 AT-Protocol bridge (`atproto`)
   - 9.12 Plugins (`plugins`)
   - 9.13 Low-Code (`lowcode`)
   - 9.14 Cortex (`cortex`)
   - 9.15 Jobs and Queues (cross-module)
10. [Configuration tab: infrastructure services and settings](#10-configuration-tab-infrastructure-services-and-settings)
11. [Database editor: PostgreSQL, MySQL, MongoDB](#11-database-editor-postgresql-mysql-mongodb)
12. [Cache, broker, and search browsers](#12-cache-broker-and-search-browsers)
13. [Real-time strategy](#13-real-time-strategy)
14. [Backend prerequisites register](#14-backend-prerequisites-register)
15. [Appendices](#15-appendices)
   - A. Enum registry by module
   - B. Naming and timestamp conventions by module
   - C. Identifier formats
   - D. Keyboard map
   - E. Route index

---

## 1. Purpose, scope, and how to read this document

### 1.1 Purpose

Give operators of an Exprsn deployment one console that can **observe, configure, and act on
every module and every backing service** of the platform without dropping to `psql`, `redis-cli`,
the RabbitMQ management UI, or the terminal setup TUI. The console is the administrative surface
for fourteen modules behind one HTTPS gateway (`:8443`), the gateway itself, and the Docker
service stack that supports it.

### 1.2 Scope

In scope:

- The `/admin` SPA (React + TypeScript + MUI, `web/`) — shell, navigation, every module section,
  the organization explorer, the configuration tab, the database editor, and the cache/broker
  browsers.
- Universal components that every section is built from, with the exact behaviors the product
  owner asked for: advanced filtering, sorting, pinning, group-by, per-field text filters,
  card/grid/list views, calendar-plus-keyboard date pickers, conforming dialogs, lookup dialogs.
- Light and dark themes, WCAG 2.2 AA, and platform HIG conformance.
- The backend endpoints each screen needs, and an explicit register of what does not exist yet.

Out of scope: the consumer app under `RootLayout`, the public health page (`/health` HTML), and
the terminal setup TUI (which this console supersedes for day-two configuration).

### 1.3 How to read

- Sections 3–6 are the **system**: read them first; every module section refers back to them.
- Section 9 is the **module catalogue**. Each module follows the same template:
  *Purpose · Placement · Tabs · Tables · Actions and dialogs · Lookups · Live events ·
  Configuration · Enums · Endpoints used · Gaps*. "Gaps" are backend prerequisites and are
  collected in §14.
- Every table spec names its **default columns, pinned columns, default sort, filterable fields,
  group-by fields, and row actions**. "All views" means the table renders in list, grid, and card
  modes (§6.2) unless a row explicitly says otherwise.
- Requirements use RFC 2119 keywords. Anything marked **(backend)** needs a new or changed API
  and is cross-referenced in §14.

### 1.4 Sources of truth used

| Concern | Source |
|---|---|
| Module list, prefixes, schemas, namespaces | `src/modules/registry.js` |
| Endpoints, bodies, gates | `API_SURFACE.md` (2026-07-13) verified against `services/*/routes` |
| Data model, ENUMs, defaults, bounds | `services/*/models` (sync path is authoritative; raw-migration drift noted where it exists) |
| Gateway, health, metrics, config-overrides store | `src/gateway.js`, `src/health.js`, `src/config/overridableKeys.js`, `src/config/overridesStore.js` |
| Infra services | `docker-compose.yml`, `docker-compose.prod.yml`, `docker/*`, `.env.example`, `scripts/setup-tui.js` |
| Admin identity | `shared/utils/platformAdmin.js`, `shared/middleware/platformAdminGuard.js`, per-module gates |
| Existing SPA | `web/src/features/admin/*`, `web/src/app/*`, `web/src/styles/exprsn-unified.css` |
| Prior findings | `docs/reports/admin-interface.md` (endpoint→UI mapping), `sprints/BACKLOG.md` TASK-039 |

---

## 2. Platform truths the UI must respect

These are properties of the code base that shape every screen. They are stated once here so
that module sections can assume them.

### 2.1 One gateway, one bearer

- All module APIs are reached at `https://<host>:8443/<prefix>/...` on the same origin as the
  SPA (nginx on `:443` proxies; Vite proxies in dev). No cross-origin calls; no cookies for
  module APIs.
- The SPA holds a **single CA bearer token** — the `ca.tokens.id` UUID minted by auth at login
  and recorded in `auth.sessions.caTokenId`. It is sent as `Authorization: Bearer <uuid>` to
  every module and on every Socket.IO handshake (`auth.token`). It is kept in memory and lost on
  hard reload (re-minted via `POST /auth/api/auth/token`).
- Every Socket.IO namespace lives on the one server at `/socket.io`; the console opens **one
  connection** and attaches namespaces on demand (§13).

### 2.2 Who is an admin

"Platform admin" is not one thing today; the console must show the effective answer and gate
its own UI on the union. The `Overview → Access` card (§7) surfaces exactly which of these apply
to the signed-in operator:

| Predicate | Where it is honored |
|---|---|
| Email ∈ `PLATFORM_ADMIN_EMAILS` (default `tester@exprsn.io`) | ca `/admin/*`, auth, filevault, timeline, spark queues, prefetch, moderator, live config, atproto `adminGuard`, plugins, lowcode, cortex, gateway `/platform` and `/_admin` |
| CA token `data.roles` ∋ `admin` / `system_admin` / `super-admin` | shared `requirePlatformAdmin` (spark/prefetch/moderator/live config, gateway), moderator (`+ platform-admin, moderator`), **nexus (only this)** |
| auth DB role: active, global-scoped `UserRole` to a role named `admin`/`system_admin` or with `admin:*` | auth `requireAdminAfterCA` |
| CA browser session with role slug `admin` / `super-admin` / `ca-admin` | ca `requireAdminSession` routes (bearer-incompatible; console avoids them) |

Consequence: the console's `RequireAdmin` guard MUST accept `roles.includes('admin')` **or** an
`isPlatformAdmin` flag returned by `GET /auth/api/auth/me` **(backend: expose `isPlatformAdmin`
on `/me`)**, and every module section MUST render a "you can view but not act" banner when the
module's own predicate would reject the operator (e.g. nexus admin endpoints for an
allowlist-only admin).

### 2.3 Tenancy

- **auth is the tenancy root.** `Organization` (type `enterprise|team|personal`, plan
  `free|starter|professional|enterprise`, status `active|suspended|deleted`), members with role
  `owner|admin|member|guest`, org-scoped roles/groups/invitations/LDAP configs, and the
  provisioning ledger (`provisioning_runs`).
- **CA** scopes tokens to `ca.groups` of type `organizational_unit|department` and issues a
  per-org intermediate under the platform root (ADR-0003). `Organization.caGroupId` is the link.
- **plugins** and **lowcode** are scope-aware (`platform|organization|group|user` + `scopeId`).
- Everything else (spark, nexus, filevault, vault, timeline, prefetch, moderator, live, atproto,
  cortex) is global or user/group-scoped. The Organization Explorer (§8) therefore composes an
  org's view from auth + CA + nexus (via the saga's created ids) + plugins/lowcode scope filters,
  and shows "not org-scoped" for the rest.

### 2.4 Naming and timestamp normalization

Modules disagree on casing and time encoding (Appendix B). The console MUST NOT hard-code per
module in components; it uses one normalization layer in `web/src/api/admin/normalize.ts`:

- Field access through a `pick(row, ['createdAt','created_at'])` accessor map generated per
  module from Appendix B.
- Timestamps typed as `{ kind: 'iso' | 'epoch-ms' | 'epoch-us' }` per column; the `<Timestamp>`
  component renders relative + absolute + timezone and sorts numerically.
- IDs typed (`uuid`, `serial-hex-32`, `did`, `at-uri`, `cid`, `lease_`, `vt_`, `run-`, …) so the
  `<Identifier>` component can offer the right copy/lookup affordance (Appendix C).

### 2.5 Pagination reality

Only a minority of list endpoints paginate consistently (Appendix E). The DataTable therefore has
two modes: **server** (offset/limit or cursor, when the endpoint supports it) and **client**
(the endpoint returns everything, or a capped page, and the table filters/sorts in memory with a
"showing first N of unknown" notice). Each table spec names its mode.

### 2.6 Secrets never round-trip

Secret material is shown once at generation (vault `hvs.` bearer, CA token id on mint, auth
invitation raw token in dev, application `clientSecret` on regenerate) inside a **Reveal-once
dialog** (§6.4.5) and never again. Config values flagged `isSecret` render masked (`••••`) with a
"set / not set" chip. The console MUST never log or cache secret values in browser storage.

---

## 3. Information architecture and the shell

### 3.1 Shell anatomy

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Top bar (64px): ☰  E Exprsn Admin   Org: [Platform ▾]   ⌘K Search   ● Live   ☾/☀   RH ▾ │
├───────────┬──────────────────────────────────────────────────────────────────┤
│ Sidebar   │ Breadcrumb  ·  Page title           [primary action] [⋯]        │
│ 280 → 72  │ ┌──────── Tabs ──────────────────────────────────────────────┐   │
│ collapsible│ │ Overview │ Table A │ Table B │ Audit │ Config │           │   │
│           │ └────────────────────────────────────────────────────────────┘   │
│ Groups    │ Toolbar: [Filter ▾] [Group by ▾] [Sort ▾] [Columns ▾] [☰ ▦ ▤] [⟳] │
│ ▸ Platform│ ┌────────────────────────────────────────────────────────────┐   │
│ ▸ Identity│ │                 DataTable / Card grid / List               │   │
│ ▸ Content │ │                                                            │   │
│ ▸ Comms   │ └────────────────────────────────────────────────────────────┘   │
│ ▸ Media   │ Footer: rows · selected · page size · server/client mode        │
│ ▸ Trust   │                                                                  │
│ ▸ Extend  │                                                                  │
│ ▸ Ops     │                                                                  │
│ ▸ Config  │                                                                  │
└───────────┴──────────────────────────────────────────────────────────────────┘
```

- **Top bar** (fixed, 64px, `--exprsn-navbar-height`): sidebar toggle, brand, the **Org/Tenant
  switcher** (§8), global search / command palette (`⌘K` / `Ctrl+K`), the **Live** chip
  (`/_admin` socket state: connected · polling · off), the **theme switch** (light / dark /
  system, persisted as `exprsn-theme`), and the user menu (profile, "Back to app", sign out).
- **Sidebar** (280px, collapsible to 72px icon rail; auto-collapses ≤ 1024px; off-canvas drawer
  ≤ 768px). Groups are collapsible; the group containing the active route is forced open; state
  persists in `localStorage 'admin.nav.collapsed'` (existing key). Each item may carry a
  **badge** (count or dot) fed by the live feed: pending reviews, failed jobs, degraded services.
- **Content**: breadcrumb (`Admin / Moderation / Queue`), H1 page title with primary action,
  **tabs** (MUI `Tabs`, scrollable, `aria-controls`), a **toolbar** owned by the active tab, and
  the collection view. Prefer tabs over nested routes; the URL still encodes the tab
  (`/admin/moderator?tab=queue`) so links and back/forward work.
- **Right-side inspector** (optional, 400px, resizable): opened by row click for detail without
  leaving the table; a "Open full page" affordance promotes it to a route when the entity has one.

### 3.2 Sidebar groups (module grouping)

The sidebar represents **each module's grouping**. Groups are domain-based, and every registry
module appears exactly once; cross-module views (Jobs, Configuration, Database) are separate
groups.

| Group | Items (route) | Modules |
|---|---|---|
| **Platform** | Overview (`/admin`) · Platform config (`/admin/platform`) · Organizations (`/admin/orgs`) | gateway, auth |
| **Identity & Access** | Certificate Authority (`/admin/ca`) · Users (`/admin/users`) · Groups (`/admin/identity-groups`) · Roles & Permissions (`/admin/roles`) · Applications & OAuth (`/admin/applications`) · Sessions & Invitations (`/admin/sessions`) · Directory (LDAP/SAML) (`/admin/directory`) | ca, auth |
| **Content** | Timeline (`/admin/timeline`) · Files — FileVault (`/admin/filevault`) · Prefetch (`/admin/prefetch`) | timeline, filevault, prefetch |
| **Community** | Groups — Nexus (`/admin/nexus`) · Messaging — Spark (`/admin/spark`) · Live (`/admin/live`) | nexus, spark, live |
| **Trust & Safety** | Moderation (`/admin/moderator`) · AT-Protocol (`/admin/atproto`) · Secrets — Vault (`/admin/vault`) | moderator, atproto, vault |
| **Extensibility** | Cortex (`/admin/cortex`) · Low-Code (`/admin/lowcode`) · Plugins (`/admin/plugins`) | cortex, lowcode, plugins |
| **Operations** | Jobs & Queues (`/admin/jobs`) · Cache — Redis (`/admin/cache`) · Broker — RabbitMQ (`/admin/broker`) · Search — OpenSearch (`/admin/search`) · Audit (`/admin/audit`) | cross-module |
| **Configuration** | Services (`/admin/config/services`) · Settings (`/admin/config/settings`) · Database (`/admin/config/database`) · Environment (`/admin/config/env`) | infra + gateway |

Flag-gated modules (plugins, lowcode, cortex, atproto) still appear; when their flag is off the
item shows a muted "disabled" chip and the page renders the enable switch (a
`/platform/api/config/:key` override) plus a read-only summary — never a 503.

Migration note: the current SPA's *Infrastructure / Services / Applications* grouping and the
mockups' *Platform / Identity & Access / Services / Operations* grouping both collapse into the
table above; existing routes are kept as redirects.

### 3.3 Global search and command palette (`⌘K`)

One dialog, two modes:

- **Navigate**: fuzzy over pages, tabs, and settings keys (e.g. "atproto sample rate" →
  Platform config › `ATPROTO_SAMPLE_RATE`).
- **Look up**: typed prefixes route to lookup providers (§6.5): `user:` (auth users),
  `org:`, `group:` (nexus), `token:` (CA token id → introspect), `cert:` (serial or CN),
  `did:` / `at://` / `cid:` (AT-Proto), `file:` (filevault id/hash), `key:` (Redis), `q:`
  (RabbitMQ queue), `job:` (Bull job), `sql:` (open the database console with the text).
  Bare UUIDs fan out to every provider and show the first hit per provider.

### 3.4 Responsive behavior

| Breakpoint | Sidebar | Tables | Dialogs |
|---|---|---|---|
| ≥ 1440 | expanded | full columns; inspector side-by-side | centered, sizes per §6.4 |
| 1024–1439 | expanded, collapsible | default hidden columns per spec | centered |
| 768–1023 | icon rail | switches to **card view** automatically unless the user pinned list | full-width sheet |
| < 768 | off-canvas drawer | card/list only; toolbar collapses into a "Filters" sheet | full-screen |

---

## 4. Design system: tokens, typography, color, theming

The console reuses the platform design system (`web/src/styles/exprsn-unified.css`, mirrored in
`web/src/app/tokens.ts` for MUI) and adds the admin-specific tokens below. **Do not fork the
token file for admin**; extend it under an `--admin-*` prefix only where a value differs.

### 4.1 Typography

| Role | Face | Size / line | Weight | Tracking |
|---|---|---|---|---|
| Display / H1 page title | Inter | 24px / 32px (`--exprsn-font-size-2xl`) | 700 | −0.02em |
| H2 section / card title | Inter | 18px / 26px | 600 | −0.01em |
| H3 tab / group label | Inter | 14px / 20px, uppercase for sidebar group titles | 600 | +0.04em |
| Body | Inter | 14px / 20px (`base` is 16 in the consumer app; admin density uses 14) | 400 | 0 |
| Table cell | Inter | 13px / 18px | 400 | 0 |
| Caption / helper | Inter | 12px / 16px | 400 | 0 |
| Code, IDs, JSON, SQL | JetBrains Mono | 12.5px / 18px | 400 | 0 |
| Numeric columns | Inter with `font-variant-numeric: tabular-nums` | — | — | — |

Fonts are self-hosted (`@fontsource/inter`, `@fontsource/jetbrains-mono`) because the nginx CSP
is `font-src 'self'`. Minimum rendered text size anywhere is 12px; nothing below 11px even in
badges.

### 4.2 Color

Palette (light `:root` / dark `[data-theme="dark"]`), verbatim from the token file and reused:

| Token | Light | Dark | Use |
|---|---|---|---|
| `--exprsn-primary` | `#0066ff` | `#4a8cf7` | primary actions, active nav, focus ring, links |
| `--exprsn-text-on-primary` | `#ffffff` | `#0a0a0a` | text on primary |
| `--exprsn-secondary` | `#7c3aed` | `#a78bfa` (emphasis) | secondary accents, charts series 2 |
| `--exprsn-success` / bg / text | `#10b981` / `#d1fae5` / `#065f46` | same tints; emphasis `#34d399` | active, healthy, approved |
| `--exprsn-warning` / bg / text | `#f59e0b` / `#fef3c7` / `#92400e` | emphasis `#fbbf24` | pending, degraded, expiring |
| `--exprsn-danger` / bg / text | `#ef4444` / `#fee2e2` / `#991b1b` | emphasis `#f87171` | revoked, failed, down, destructive |
| `--exprsn-info` / bg / text | `#3b82f6` / `#dbeafe` / `#1e40af` | emphasis `#60a5fa` | informational, invited |
| Surfaces | bg `#ffffff` · secondary `#fafafa` · tertiary `#f5f5f5` · hover `#f1f3f4` · active `#e8eaed` | `#0a0a0a` · `#171717` · `#262626` · `#1c1f23` · `#2f3336` | page, cards, rows |
| Text | `#171717` · secondary `#525252` · muted `#737373` | `#fafafa` · `#d4d4d4` · `#a3a3a3` | |
| Borders | `#e5e5e5` · strong `#a3a3a3` | `#404040` · `#525252` | |

Admin additions:

| Token | Light | Dark | Use |
|---|---|---|---|
| `--admin-table-stripe` | `#fafafa` | `#141414` | zebra rows (optional, off by default) |
| `--admin-table-pinned-shadow` | `0 0 0 1px #e5e5e5, 4px 0 8px -4px rgba(0,0,0,.12)` | `… rgba(0,0,0,.6)` | pinned column edge |
| `--admin-group-header-bg` | `#f5f5f5` | `#1f1f1f` | group-by header rows |
| `--admin-selection-bg` | `rgba(0,102,255,.08)` | `rgba(74,140,247,.16)` | selected rows |
| `--admin-code-bg` | `#f5f5f5` | `#111111` | JSON/SQL editors |
| `--admin-diff-add` / `--admin-diff-del` | `#d1fae5` / `#fee2e2` | `#064e3b` / `#7f1d1d` | config and version diffs |

**Contrast contract:** every text/background pair in the tables above meets 4.5:1 (normal text)
and 3:1 (large text, UI components, focus indicators) in both themes. Status chips use the
`*-bg` + `*-text` pairs (never white-on-tint). Chart series use the eight-color categorical ramp
from `dataviz` guidance with a luminance-adjusted dark variant; no color is the only carrier of
meaning (every chip also has an icon or text).

### 4.3 Spacing, radii, elevation, motion

- 4px base grid; spacing tokens `xs 4 · sm 8 · md 16 · lg 24 · xl 32 · 2xl 48`. Table density:
  **compact** (32px rows), **comfortable** (40px, default), **spacious** (48px); user-selectable
  per table and persisted.
- Radii: inputs/buttons 8px (`--exprsn-radius-md`), cards/dialogs 12px, chips full.
- Elevation: cards `sm`; popovers `lg`; dialogs `2xl`; never stacked shadows in dark mode (use
  border + surface step instead).
- Motion: 150ms micro / 250ms standard / 350ms complex, `cubic-bezier(.4,0,.2,1)`; all motion
  respects `prefers-reduced-motion` (fades only).
- Iconography: MUI Outlined set at 20px in tables, 24px in nav; every icon-only button has an
  `aria-label` and a tooltip (`LabeledIconButton`).

### 4.4 Theming

- Three-state switch in the top bar: **Light · Dark · System**. Explicit choice stamps
  `data-theme` on `<html>`; "System" removes it and follows `prefers-color-scheme`. Persisted in
  `localStorage 'exprsn-theme'` (existing store `themeMode.ts`).
- All colors come from tokens; components never hard-code hex. Both themes are first-class:
  design every artboard twice.
- Embedded editors (JSON, SQL, Mermaid, code) switch syntax themes with the app theme.

---

## 5. Accessibility (WCAG 2.2 AA) and HIG conformance

The console follows the platform HIG (`web/README.md` accessibility conventions, MUI's
accessibility baseline) and WCAG 2.2 AA. These are acceptance criteria, not aspirations.

### 5.1 Perceivable

- Text contrast ≥ 4.5:1; large text and UI components ≥ 3:1 in both themes (§4.2).
- Never color-only: status uses chip + icon/text; chart series have labels and a data table
  alternative ("View as table").
- Images and icons carry `alt`/`aria-label`; decorative icons are `aria-hidden`.
- Reflow to 320px CSS width without horizontal page scroll; tables scroll inside their own
  `overflow-x:auto` container with pinned columns.
- Text spacing and 200% zoom do not clip content (no fixed-height cells; truncation shows full
  text in a tooltip and on focus).

### 5.2 Operable

- Everything works with keyboard only (Appendix D). Focus is visible everywhere: 2px primary ring
  with 2px offset (`:focus-visible`), ≥ 3:1 against adjacent colors.
- Focus is never trapped except inside open dialogs; `Esc` closes dialogs and popovers; focus
  returns to the invoking element.
- Target size ≥ 24×24 CSS px (2.5.8); table row actions are 32px.
- Drag-and-drop (column reorder, kanban) has keyboard and menu alternatives (2.5.7).
- No time limits on forms; long operations show progress and can be cancelled.

### 5.3 Understandable

- One H1 per page, logical heading order; tabs use `role="tablist"` with arrow-key navigation.
- Form fields have visible labels, helper text, and error text tied via `aria-describedby`;
  errors are announced (`aria-live="polite"`) and summarized at the top of the form.
- Enum fields are always selects/segmented controls populated from the enum registry — never
  free text (see §6.7).
- Destructive actions require confirmation with the object named ("Revoke token 3f2c…?"), and
  never run on `Enter` from a text field.
- Consistent placement: primary action top-right of the page header; row actions right-aligned;
  dialog primary action bottom-right, cancel to its left.

### 5.4 Robust

- Semantic HTML (`<table>` with `<th scope>`, `<nav>`, `<main>`, landmarks); ARIA only where
  semantics are missing (`aria-sort` on sortable headers, `aria-expanded` on groups,
  `aria-busy` on loading regions).
- Live regions for toasts (`role="status"`) and for realtime table updates ("3 new rows" is
  announced once, not per row).
- Tested with axe-core in `web:test` (CI gate: 0 serious/critical) and a documented manual
  keyboard walkthrough (`sprints/BACKLOG.md` already lists the `/admin` keyboard walkthrough).

### 5.5 HIG conformance checklist (per screen)

1. Title, breadcrumb, and one primary action; secondary actions in an overflow menu.
2. Tabs for peer views; sidebar for modules; no third navigation level.
3. Tables before cards for dense operational data; cards only where imagery or summary matters.
4. Dialog sizes and button order per §6.4; no nested dialogs deeper than two.
5. Loading skeletons match final layout; empty states explain *why* and offer the next action.
6. Every timestamp shows timezone; every ID is copyable; every secret is masked.
7. Dark and light artboards for every screen.

---

## 6. Universal components

All module sections are composed from the components in this section. They live in
`web/src/features/admin/ui/` (replacing the single `ui.tsx`) and are the only place table,
picker, and dialog behavior is implemented. A module section MUST NOT fork them.

### 6.1 DataTable

The DataTable is the workhorse. It replaces the current client-only `DataTable` in `ui.tsx` and
adds the behaviors the product owner requires: **advanced filtering, sorting, pinning, group-by,
and a text filter for every field**, plus selection, bulk actions, saved views, and server mode.

#### 6.1.1 Anatomy

```
Toolbar
[ Search all fields…            ] [Filter ▾ (2)] [Group by ▾] [Sort ▾] [Columns ▾] [Density ▾] [Views ▾] [☰ ▦ ▤] [⟳ live]
Filter chips row (when any): [status = active ×] [createdAt within last 7d ×] [+ Add filter]  Clear all
┌────┬──────────────┬───────────────┬──────────┬───────────────┬───────────┐
│ ☐  │ Name ▲       │ Status        │ Type     │ Created       │ ⋯         │  ← header: sort, filter, pin, hide, resize
├────┼──────────────┼───────────────┼──────────┼───────────────┼───────────┤
│    │ [ text ▾ ]   │ [ any ▾ ]     │ [ any ▾ ]│ [ date range ]│           │  ← per-field filter row (toggle)
├────┴──────────────┴───────────────┴──────────┴───────────────┴───────────┤
│ ▾ status: active (42)                                                     │  ← group header (collapsible, count, aggregates)
│ ☐  Acme root CA    ● active        root      2026-08-01 14:02  [⋯]        │
│ …                                                                         │
│ ▸ status: revoked (3)                                                     │
└───────────────────────────────────────────────────────────────────────────┘
Footer: 45 rows (server: 45 of 1,204) · 2 selected [Bulk ▾] · Rows per page [50 ▾] ‹ 1 2 3 ›  · mode: server
```

#### 6.1.2 Column definition

```ts
interface Column<R> {
  key: string;                       // stable id; used in URL/state
  header: string;
  accessor?: (r: R) => unknown;      // default: normalize.pick(r, key aliases)
  type: 'text' | 'number' | 'bytes' | 'boolean' | 'enum' | 'timestamp' | 'id' |
        'duration' | 'json' | 'user' | 'org' | 'group' | 'link' | 'secret' | 'custom';
  enumValues?: readonly string[];    // from the enum registry (§6.7 / Appendix A)
  timestampKind?: 'iso' | 'epoch-ms' | 'epoch-us';
  idKind?: IdKind;                   // Appendix C
  sortable?: boolean;                // default true
  filterable?: boolean;              // default true
  groupable?: boolean;               // default true for enum/boolean/user/org/group; false for id/json/secret
  pinnable?: boolean;                // default true
  defaultHidden?: boolean;
  locked?: boolean;                  // cannot be hidden (e.g. name)
  width?: number; minWidth?: number;
  align?: 'left' | 'right' | 'center';
  render?: (value, row) => ReactNode;
  aggregate?: 'count' | 'sum' | 'avg' | 'min' | 'max';  // shown on group headers
  serverKey?: string;                // param name when in server mode
}
```

#### 6.1.3 Behaviors

| Capability | Requirement |
|---|---|
| **Sorting** | Click header toggles asc → desc → none; `Shift+click` adds a secondary key (multi-sort, max 3, numbered badge). `aria-sort` reflects state. Comparator is type-aware (numbers, epoch vs ISO timestamps, case-insensitive text, nulls last). Server mode sends `sortBy`/`sortOrder` (or the endpoint's names) and disables multi-sort where the API supports one key. |
| **Global search** | Toolbar search box (`/` focuses it) matches all visible text columns, debounced 250ms. Server mode maps to the endpoint's `search`/`q` param; when the endpoint has none, search stays client-side over the fetched page and says so. |
| **Per-field text filter** | The filter row (toggled from the toolbar, `F`) shows one input per column: text fields get *contains / equals / starts with / regex / is empty*; enum fields a multi-select; booleans a tri-state; numbers/bytes/duration `= ≠ < ≤ > ≥ between`; timestamps a date-range picker (§6.3); ids *equals* with paste-friendly trimming; users/orgs/groups a lookup picker (§6.5). Filters combine with AND across columns; within an enum column OR. |
| **Advanced filter builder** | `Filter ▾` opens a builder with nested groups (`all / any / none`) and the same per-type operators; the same grammar as plugins/lowcode condition trees so it can be pasted into a rule. Filters render as removable chips; the whole set is encoded in the URL (`?f=`) and in saved views. |
| **Group by** | `Group by ▾` lists groupable columns (up to 2 levels). Group headers show count and any column `aggregate` (sum of bytes, etc.), are collapsible (`Left/Right` arrow), and support "collapse all / expand all". Server mode: if the API cannot group, grouping is applied to the fetched page with a notice; endpoints that can aggregate (lowcode `/aggregate`, nexus/auth stats) feed group totals. |
| **Pinning** | Columns: pin left/right from the header menu (`P`); pinned columns stay fixed while the table scrolls horizontally with the `--admin-table-pinned-shadow` edge; the selection and primary column are pinned left by default. Rows: `☆ Pin row` keeps a row at the top of its group across sorting and refreshes (persisted per table). |
| **Column management** | `Columns ▾` shows every column with checkbox, drag-reorder (keyboard: `Alt+↑/↓`), width reset; `defaultHidden` and `locked` honored. Persisted per `tableId`. |
| **Selection and bulk** | Checkbox column; `Shift+click` ranges; `Ctrl/⌘+A` selects the page; "Select all N matching" for server mode where the API supports bulk by filter. Bulk actions are declared per table and run through the batch dialog (§6.4.4) with per-row results. |
| **Row actions** | Up to two inline icon actions plus an overflow `⋯` menu; every action has a keyboard equivalent via the row's context menu (`Shift+F10`). |
| **Inspector** | Row click (or `Enter`) opens the right-side inspector with a typed detail view (`DataView`) and the row's actions; `Space` toggles selection instead. |
| **Density** | compact / comfortable / spacious (§4.3). |
| **Live** | When the table subscribes to a socket event (§13), new rows arrive in a "3 new rows — show" pill (never reflow under the cursor); updated rows flash the surface token for 600ms; removed rows fade. `⟳` shows the last refresh time and toggles auto-poll for endpoints with no socket. |
| **Saved views** | `Views ▾`: save the current columns/sort/filters/group/density/view-mode under a name (personal, `localStorage` today; server-side per-user later **(backend)**); share via URL. Each table ships with sensible built-in views named in its spec. |
| **Export** | CSV/JSON of the current view (client) or the endpoint's export route where one exists (vault audit, auth users, lowcode records, moderator metrics). |
| **Empty / error** | Empty state names the filters in effect and offers "Clear filters" and the table's primary create action; errors show the `correlationId` with a copy button and retry. |
| **Virtualization** | Rows virtualize above 200; column virtualization above 30 columns. |
| **URL state** | `?tab=&view=&f=&sort=&group=&page=&size=&mode=` so any table state is linkable. |

#### 6.1.4 Modes

- **server**: the endpoint paginates (`limit/offset`, `page/limit`, or `cursor`). The footer
  shows "N of total" when the API returns a total, otherwise "page N, more available".
- **client**: the endpoint returns a whole collection or a capped page (e.g. vault
  `/admin/policies` unpaginated; CA admin lists with no max). Filtering/sorting/grouping are
  local; a notice reads "Filtering the N rows loaded" and, where the endpoint has a hard cap,
  "The API returns at most N; narrow with server filters".

### 6.2 Collection views: card, grid, list

Every collection (every DataTable instance) offers **three renderings** switchable from the
toolbar (`☰ list · ▦ grid · ▤ card`), persisted per table and included in saved views. All three
share the same data, filters, sort, group, selection, and actions.

| View | Layout | Use | Notes |
|---|---|---|---|
| **List** | the DataTable rows | dense operational scanning | default on ≥ 1024px |
| **Grid** | responsive tiles 240–320px wide, 1–6 per row, fixed aspect, image/icon + title + 2–3 key facts + status chip | media-bearing or visual entities: files, thumbnails, recordings, streams, rooms, plugins, apps, agents, users with avatars | image falls back to a typed glyph; group-by renders as sections with headers |
| **Card** | one full-width card per row (or 2-up ≥ 1440px) with header (title, status, id), body of labeled facts (4–8), footer actions | detail-rich review: moderation items, appeals, reports, tokens, certificates, config keys, docker services | this is the default on < 1024px |

Each table spec declares its **card fields** (which columns become the card title, subtitle,
facts, and media). If unspecified: title = first locked column, subtitle = status, facts = first
five visible columns.

### 6.3 Date and time pickers

One `<DateTimeField>` used everywhere a date, time, range, or duration is entered.

- **Dual input**: a text input that accepts keyboard entry **and** a calendar popover.
  Typing is never blocked by the calendar; the calendar opens with `Alt+↓` or the calendar icon.
- **Keyboard grammar** (parsed live, echoed in helper text): ISO (`2026-09-07`,
  `2026-09-07T14:30`, `2026-09-07 14:30 +02:00`), locale short forms (`9/7/2026`, `7 Sep 2026`),
  relative (`now`, `today`, `yesterday`, `-7d`, `+30m`, `+1h`, `next monday`, `start of month`),
  and epoch (`1725712200000` ms, `1725712200` s — detected by magnitude and shown as the parsed
  absolute). Invalid input shows an inline error and keeps focus.
- **Calendar popover**: month grid with year/month steppers and a type-to-jump year field,
  today shortcut, optional time spinner (hours, minutes, seconds; 12/24h per locale),
  timezone selector (defaults to the browser zone; shows UTC offset; "UTC" toggle), keyboard
  navigation (`←→↑↓` days, `PgUp/PgDn` months, `Shift+PgUp/PgDn` years, `Home/End` week edges,
  `Enter` selects, `Esc` closes).
- **Range mode**: two fields with presets (Last 15m · 1h · 24h · 7d · 30d · This month ·
  Custom), a dual-month calendar, and "relative range" semantics that stay relative in saved
  views (`last 7d` re-evaluates).
- **Duration mode** (for TTLs, expiries, windows): `90d`, `3600s`, `1h30m`, `PT2H` parsed;
  displays both the humanized form and the exact seconds/ms the API expects; bounds from the
  field's `min/max` (e.g. vault lease TTL 60–86400s).
- **Storage kind aware**: the field knows whether the API expects ISO, epoch-ms (nexus, CA
  tokens), or epoch-s and converts on submit; the helper text shows the converted value.
- Accessibility: the grid uses `role="grid"` with labelled cells; announcements on selection;
  the text input is the accessible name owner.

### 6.4 Dialog system

All dialogs conform to one system: `<AdminDialog>` with fixed sizes, header/body/footer
structure, focus management, and standard button order. No ad-hoc `window.confirm`.

#### 6.4.1 Sizes

| Size | Width | Use |
|---|---|---|
| `sm` | 440px | confirm, single-field prompt, reveal-once |
| `md` | 640px | typical create/edit form (≤ 8 fields) |
| `lg` | 880px | complex forms, lookup dialogs, JSON/SQL editors |
| `xl` | 1200px | wizards, side-by-side diff, query results |
| `sheet` | full height right panel 480–720px | inspector-style editors that keep the table visible |
| `full` | viewport | mobile fallback for everything ≥ `md`; database console |

#### 6.4.2 Structure and behavior

- Header: title (H2), optional subtitle/entity id, close `×`. Body: scrollable; forms use a
  12-col grid. Footer: `[Cancel] [Primary]` right-aligned; destructive primaries are red and
  disabled until any required confirmation text is typed; a tertiary action (e.g. "Edit as JSON")
  sits left.
- Focus trapped; initial focus on the first field (or the cancel button for destructive
  confirms); `Esc` cancels unless a mutation is in flight; return focus to the trigger.
- Unsaved-changes guard on close when dirty.
- Submitting shows an inline progress bar in the footer and disables inputs; errors render at
  the top with the `correlationId`, and field-level errors from `details` map to fields.
- Max nesting depth 2 (a lookup dialog may open from a form dialog; nothing opens from a lookup).

#### 6.4.3 Dialog kinds

| Kind | Content |
|---|---|
| **Form** (`md`/`lg`) | schema-driven fields (§6.7), sections with headings, optional "Advanced" disclosure, "Edit as JSON" escape hatch that round-trips through the same validation |
| **Confirm** (`sm`) | verb + object name + consequence sentence + optional reason field (recorded to audit where the API takes `reason`) |
| **Destructive confirm** (`sm`) | as Confirm, plus "type the name to confirm" when the action is irreversible (delete org, purge DLQ, truncate entity, revoke root CA) |
| **Batch** (`md`) | list of selected items, action, progress per item, final results table with retry for failures |
| **Reveal-once** (`sm`) | secret shown in a mono field with copy, a checkbox "I have stored this", and a warning that it will not be shown again; closing requires the checkbox |
| **Lookup** (`lg`) | §6.5 |
| **Wizard** (`xl`) | numbered steps, back/next, review step, used by provisioning, plugin install, DB connection |
| **Diff** (`xl`) | side-by-side or unified diff for config changes, version history, plugin manifest versions |
| **Detail** (`sheet`) | typed read view with actions; the inspector uses the same component |

#### 6.4.4 Standard vocabulary

Buttons use verbs: Create, Save, Issue, Revoke, Suspend, Reactivate, Approve, Reject, Redrive,
Purge, Retry, Pause, Resume, Enable, Disable, Rotate, Renew, Delete. "OK"/"Yes" are not allowed.

### 6.5 Lookup dialogs

A **lookup dialog** is the common `lg` dialog for finding a record by identifier or search and
either navigating to it or returning it to a form field (picker mode). Every field of type
`user | org | group | token | cert | did | cid | file | secret | key | queue | job | row` opens
one. Lookups are registered as **providers**; the command palette (§3.3) uses the same registry.

| Provider | Input accepted | Search endpoint(s) | Result columns | Detail / return |
|---|---|---|---|---|
| `user` | email, display name, UUID | `GET /auth/api/users?search=` (admin) or `/users/directory` | avatar, displayName, email, status, mfa, lastLoginAt | `GET /auth/api/users/:id/detail`; returns `{id,email,displayName}` |
| `org` | name, slug, UUID | `GET /auth/api/organizations?include=counts` (+ client filter) **(backend: admin list-all + search)** | name, slug, type, plan, status, members | opens the Org Explorer |
| `auth-group` | name, slug | `GET /auth/api/groups?organizationId=` | name, slug, type, org | |
| `nexus-group` | name, slug, tag | `GET /nexus/api/groups?search=`, `POST /nexus/api/groups/search` | avatar, name, slug, visibility, joinMode, members | `GET /nexus/api/groups/:id` |
| `ca-token` | token id (UUID) | `GET /ca/api/tokens/:id/introspect`, `GET /ca/admin/api/tokens?userId=…` | id, subject, resource, expiryType, status, uses | introspection panel with validate/revoke |
| `certificate` | serial (32 hex), fingerprint, CN, UUID | `GET /ca/admin/api/certificates?status=&type=` (+ client filter) **(backend: `search` param)** | serial, CN, type, status, notAfter, issuer | `GET /ca/api/certificates/:id` + chain/status |
| `did` | `did:plc:…`, `did:web:…`, `did:exprsn:z…`, `did:key:z…` | `GET /xrpc/com.exprsn.identity.resolveDid?did=` | DID, method, verification methods, services | DID document JSON; "labels by this DID" via `queryLabels?sources=`; "Exprsn user" via reverse lookup **(backend: DID → user_dids reverse endpoint)** |
| `at-uri` | `at://did/collection/rkey` | `GET /xrpc/com.atproto.label.queryLabels?uriPatterns=` | label history (seq, val, neg, cts) | case map row **(backend: `uri_case_map` read endpoint)** |
| `cid` | `bafy…` / `Qm…` | filevault: `files.storage_key` when backend=ipfs **(backend: search by storage key/content hash)**; atproto: labels carrying `cid` via `queryLabels` | where the CID appears (file, label, service record) | opens the owning record |
| `file` | file id, name, content hash | `GET /filevault/api/search?q=` (own) **(backend: admin cross-user search)** | name, size, mimetype, owner, visibility, moderation | file detail |
| `secret-path` | `/path/…` prefix | `GET /vault/api/secrets?pathPrefix=` | path, key, version, expiresAt, status | metadata only (`includeValue=false`) |
| `vault-token` | `vt_…`, entity | `GET /vault/api/admin/tokens?entityType=&entityId=&status=` | tokenId, displayName, entity, status, risk | detail + anomalies |
| `lease` | `lease_…` | `GET /vault/api/dynamic/leases?secretType=&status=` | leaseId, type, path, ttl, expiresAt | renew/revoke |
| `redis-key` | key or glob | `SCAN` via **(backend: Redis browser API)** | key, type, ttl, size | value viewer (§12.1) |
| `rabbit-queue` | queue name | RabbitMQ management API proxy **(backend)** | name, vhost, messages, consumers, dlq | queue detail + peek (§12.2) |
| `bull-job` | queue + job id | timeline `/api/jobs/:queue/job/:id`, spark/prefetch/moderator equivalents | id, name, state, attempts, failedReason | job detail (§9.15) |
| `db-row` | connection + schema.table + pk | database editor API (§11) | the row | row editor |
| `moderation-item` | `(sourceService, contentType, contentId)` or UUID | `GET /moderator/api/moderate/status/:s/:t/:c`, `/queue/:id` | content, risk, status, action | item detail |
| `stream` / `room` | id, room code | `GET /live/api/streams/:id`, `/rooms/code/:code` | title, status, viewers | detail |
| `agent` / `guardrail` / `tool` / `skill` | name | cortex registries | name, enabled, status | detail |

Dialog layout: input with provider selector (auto-detected from the pasted format, overridable),
recent lookups, results table (a DataTable in client mode, with the provider's columns), and a
detail pane on selection. In **picker mode** the footer has `[Cancel] [Select]`; in navigate mode
`[Open]`. The dialog remembers the last provider per field.

### 6.6 Token issuance: time- and use-based options

CA tokens (`ca.tokens`) and vault tokens (`vault_tokens`) both carry expiry semantics; the
**Issue Token** form (`md`) exposes them explicitly:

```
Subject        [ user lookup ]                 (defaults to the acting admin)
Signing cert   [ certificate lookup: active entity/intermediate only ]
Resource       ( url | did | cid )  [ value ≤ 1000 ]      ← ENUM resourceType
Permissions    [x] read [ ] write [ ] append [ ] update [ ] delete
Scope          Group [lookup ca.groups] · Organization [lookup: organizational_unit|department only]
Expiry         (•) Time-based   Expires in [ 1h ▾ | duration field ]  → expiresAt (epoch ms) shown
               ( ) Use-based    Max uses [ 10 ]  (1 … 1,000,000)     → usesRemaining = maxUses
               ( ) Persistent   (no expiry; requires a typed reason; flagged in the table)
Not before     [ date-time, optional ]
Custom data    [ JSON, optional ]
```

- The three expiry types map to `expiryType ∈ time|use|persistent`; the form disables the
  irrelevant inputs and shows the resulting `status` lifecycle (`active → expired` /
  `active → exhausted` / `active` until revoked).
- The **token table** (§9.1) shows an *Expiry* column that renders "in 2h 13m" for time-based,
  "7 of 10 uses left" with a mini progress bar for use-based, and "persistent" with a warning
  glyph; filterable by `expiryType` and by "expiring within".
- Vault tokens use the same control with `expiresAt` (time) and `maxUses` (use), plus
  `pathPrefixes`, `ipWhitelist`, and `policyIds` (lookup to policies).
- Both forms end in a **Reveal-once** dialog (CA: the token id is the bearer; vault: `hvs.…`).
- Auth invitations expose their 72h TTL as a read-only duration; CA tickets (`maxUses`, 5-minute
  default) reuse the use-based control.

### 6.7 Forms, validation, and the enum registry

- Forms are **schema-driven**: each dialog declares fields `{name, label, type, enum?, min?, max?,
  len?, pattern?, required?, default?, help?, lookup?}`. Types: text, textarea, number, bytes,
  duration, boolean, enum (select or segmented ≤ 4 values), multi-enum (chips), datetime, range,
  user/org/group/… (lookup), json (editor with schema hints), secret (masked with reveal),
  color, cron (with next-run preview), url, email, path, list-of-strings (chips).
- Enum values come from the **enum registry** (`web/src/api/admin/enums.ts`, generated from
  Appendix A). A select never shows values the API will reject (e.g. live destination platform
  offers only `youtube|twitch|facebook|cloudflare|rtmp_custom`, not the model's extra
  `twitter|linkedin|srs`).
- Numeric bounds and lengths come from model validators and Joi schemas (Appendix A tables carry
  them); the field shows the bound in helper text and blocks submit.
- Defaults pre-fill from the model default; required-without-default fields are marked and
  listed in the form header ("3 required").
- Casing/timestamp conversions happen in the normalization layer, never in the form.
- JSON escape hatch: any form can switch to a JSON editor of the same payload; switching back
  re-validates.

### 6.8 Status, identifiers, timestamps, secrets

- `<StatusChip>`: one mapping for the whole console (Appendix A → color/icon), e.g. success:
  `active live enabled completed approved ready connected valid published done`; warning:
  `pending waiting suspended expired delayed rotating draft reviewing processing`; danger:
  `revoked error failed rejected banned exhausted blocked dlq`; info: `invited investigating
  validated`; neutral: `ended inactive skipped disabled archived deprecated`.
- `<Identifier kind=…>`: mono, middle-truncated (`3f2c…9a1b`), copy on click, full value in
  tooltip and on focus, contextual "Look up" action that opens the matching lookup provider.
- `<Timestamp>`: relative ("4m ago") with absolute + zone on hover/focus, sortable; shows the raw
  epoch in the tooltip when the source is epoch-ms so operators can correlate with logs.
- `<Bytes>`, `<Duration>`, `<Percent>`: tabular numbers, unit-aware.
- `<Secret>`: masked, "set / not set" chip, reveal only where the API returns it (never for
  hashes), and never persisted.

### 6.9 Feedback

- Toasts (`role="status"`, bottom-center, 4.5s, stackable, with an undo where the action is
  reversible: pause/resume, enable/disable).
- Page banners: **restart required** (any `pendingRestart` override), **module disabled**,
  **degraded dependency** (from `/health`), **read-only** (operator lacks the module's admin
  predicate), **stale** (socket disconnected and last poll > 60s).
- Skeleton loading that mirrors the final layout; errors with `correlationId` and retry.

### 6.10 Charts and stat tiles

- `<StatTile label value delta hint sparkline>`; tiles link to the table filtered to the tile's
  population.
- Time series (line/area) for stats endpoints (nexus `/admin/stats` series, moderator metrics,
  CA timeseries once fixed **(backend)**, vault access report); bar for by-status breakdowns;
  donut only for ≤ 5 categories. Every chart has a "View as table" toggle and a legend that
  toggles series. Colors from the categorical ramp (§4.2); dark-mode variants adjusted.

---

## 7. Overview and Platform

### 7.1 Overview (`/admin`)

**Purpose:** one screen answering "is the platform healthy, what needs me, what changed".

Layout (12-col grid): a **health strip** across the top, then three columns.

- **Health strip** (from `GET /health` and the `/_admin` socket `health` snapshots every 5s):
  overall status (`ok | degraded | unhealthy`), uptime, version, env, node; a chip per
  dependency (`postgres`, `redis`, `elasticsearch`, `rabbitmq`, `docker`) with latency; a chip
  per module (14, `mounted`). Clicking a chip opens Configuration › Services for that service.
- **Needs attention** (live counts, each a link): moderation queue pending (`GET
  /moderator/api/queue?status=pending`), appeals pending, cortex reviews pending, failed jobs
  across queues (§9.15), DLQ depths (moderator buckets, live, prefetch, atproto), expiring
  certificates (30d), expiring vault leases/secrets, provisioning runs `failed |
  compensation_failed`, config overrides `pendingRestart`, degraded dependencies.
- **Activity**: a unified recent-activity list (CA `/admin/api/activity`, nexus `/admin/audit`,
  vault `/audit/logs`, gateway `config:changed`), filterable by module.
- **Access** card (§2.2): the operator's email, whether they are on the allowlist, their token
  roles, DB admin role, and per-module effective rights (view/act) — so "why is this 403" is
  answered on the first screen.
- **Quick stats** tiles per module (kept from the current dashboard): CA certificates/tokens,
  Vault tokens/secrets/keys, Live streams/rooms/viewers, Moderation reviewed/pending/actions,
  Nexus groups/members/events, Timeline posts today, FileVault total size, Cortex tasks/runs,
  AT-Proto labels/lastSeq/queue.

### 7.2 Platform (`/admin/platform`)

Tabs: **Config overrides · Gateway · Modules · Workers · Metrics**.

- **Config overrides** — the descriptor-driven store (`GET/PUT/DELETE /platform/api/config`).
  Table (server: no; client over `keys[]`): key (pinned), module (group-by default), type,
  effective value (masked if secret), source (`override | env | default`), env set?, restart
  required, pending restart, override.updatedBy/updatedAt/version. Row click opens a typed
  **EditDialog** (boolean → switch, int → number with min/max, enum → select from
  `values`, string → text with `pattern`), with the current version for optimistic
  concurrency (409 → reload prompt), Save and Revert. Anomalies (`anomalies[]`) render as a
  warning list. Live `config:changed` invalidates the table. Denylisted keys are shown read-only
  in the Environment tab (§10.4) with the reason.
- **Gateway** — CORS origin, trust proxy, TLS paths and cert expiry (parse the served cert
  **(backend: expose cert subject/notAfter in `/health`)**), HTTP redirect port, body limits,
  compression/SSE note, error envelope sample, correlation id explainer.
- **Modules** — the 14 registry rows: name, prefix, schema, socket namespaces, flag (for gated
  modules, with the enable switch bound to the override), health of each module's own
  `/health` (fan-out), config sections it exposes.
- **Workers** — expected worker processes (`worker:timeline`, `worker:prefetch`,
  `worker:atproto`, `worker:live`, `worker:cortex`, `worker:moderation`,
  `worker:filevault-moderation`, `worker:video-moderation`,
  `worker:live-recording-moderation`) with liveness inferred from queue consumer counts /
  heartbeats (atproto `external_labelers.heartbeat_at`, Bull worker counts) **(backend: a
  worker heartbeat registry on Redis `platform:worker:<name>`)**.
- **Metrics** — `/metrics` Prometheus text rendered as tiles (request rate, p95 latency by
  route, socket clients) when `METRICS_ENABLED`; masked note when a `METRICS_TOKEN` is set.

---

## 8. Organization / Tenant Explorer

**Route:** `/admin/orgs` (list) and `/admin/orgs/:id` (explorer). **Top-bar switcher:** the
selected organization becomes a global filter for every org-aware surface (auth, CA tokens and
intermediates, plugins/lowcode scope, vault entity filters) and is shown as a chip on those
tables; "Platform (all)" clears it.

### 8.1 Organizations list

DataTable (client over `GET /auth/api/organizations?include=counts` for now; **backend: an
admin list-all with `search`, `status`, `plan`, `type`, pagination** — today the endpoint
returns only the caller's orgs). All views; card view shows logo, name, plan chip, member count.

| Column | Type | Notes |
|---|---|---|
| Name (pinned, locked) | link | logoUrl avatar |
| Slug | text | |
| Type | enum `enterprise·team·personal` | group-by default |
| Plan | enum `free·starter·professional·enterprise` | |
| Status | enum `active·suspended·deleted` | |
| Owner | user | lookup |
| Members / Groups / Apps | number | from counts |
| CA group | id | `caGroupId` → ca.groups; "not provisioned" when null |
| Created / Updated | timestamp iso | |

Actions: **Provision organization** (wizard → `POST /auth/api/organizations/provision`, steps:
details (name, slug, type, plan, email, website) → owner (existing user lookup or new
owner email/password/displayName) → template preview (what the saga will create: org, owner
membership, roles, default groups, CA directory group, intermediate CA, owner cert, org-scoped
token, nexus group + spark channels) → run, streaming the ledger cursor `S1…Sn` with
compensation on failure), Create (plain `POST /organizations`), Suspend/Reactivate (PATCH
`status`), Transfer ownership, Delete (destructive confirm, paranoid delete).

### 8.2 Explorer (`/admin/orgs/:id`)

A **two-pane explorer**: left, a tree of the tenant's composition; right, the selected node's
table or detail. The tree is built from auth (`GET /organizations/:id?include_members&include_groups&include_applications`),
CA (`caGroupId` → `ca.groups` children, tokens filtered by `organizationId`, the intermediate
certificate via the provisioning ids), nexus (group from the saga's `nexusGroupId` **(backend:
persist and expose the org↔nexus group link; today only in `provisioning_runs.ids`)**), plugins
and lowcode (scope filters), vault (`entityType=organization&entityId=`).

```
▾ Acme Corp (enterprise · professional · active)
  ▸ Overview                       — header card, settings, plan, owner, counts, health of provisioning
  ▸ Members (42)                   — OrganizationMember table
  ▸ Groups (5)                     — auth groups (+ Nexus group binding)
  ▸ Roles (4)                      — org-scoped roles and assignments
  ▸ Applications (2)               — OAuth apps
  ▸ Invitations (3 pending)
  ▸ Directory                      — LDAP configs for this org (routes unmounted today)
  ▸ Certificate Authority          — intermediate CA, entity certs, org-scoped tokens
  ▸ Community                      — bound Nexus group, Spark channels, group streams
  ▸ Secrets                        — vault tokens/policies with entityType=organization
  ▸ Extensions                     — plugin installations + low-code apps scoped to this org
  ▸ Provisioning ledger            — provisioning_runs for this org (backend: list endpoint)
  ▸ Audit                          — cross-module audit filtered by org
```

Node tables reuse the module tables (§9) with the org filter pre-applied and pinned. The
**Overview** node also edits `Organization.settings` with a structured form: registration
(allowUserRegistration, requireEmailVerification), MFA policy (requireMfa, allowedMethods
multi-enum `totp · backup_codes` enabled, `sms · email · webauthn` shown disabled as
"scaffolding only", enrollmentGracePeriodDays, rememberDeviceDays), sessionTimeout (duration
field, ms), password policy (minLength ≥ 8, four booleans). The org whose slug equals
`PLATFORM_ORG_SLUG` is badged **Platform policy org** because its settings gate public signup.

### 8.3 Member management

Members table (server: `GET /organizations/:id/members?status=&role=`): user (avatar, name,
email), role enum `owner·admin·member·guest`, status enum `active·inactive·invited·suspended`,
joinedAt, invitedBy. Actions: add member (user lookup + role; POST), change role (PATCH),
remove (DELETE, confirm), invite by email (`POST /auth/api/users/invites` with
`organizationId`), bulk import (CSV wizard → `POST /auth/api/users/import` with column mapping
preview, `mode create|invite`, `provisionCredentials`, result table of created/skipped/failed).

---

## 9. Module specifications

Each module below follows the template from §1.3. "Table" rows list *default visible columns*;
hidden columns are available from the column picker. "Live" lists the socket events the section
subscribes to (§13).

### 9.1 Certificate Authority (`ca`)

**Purpose:** operate the private PKI — root/intermediate hierarchy, entity/server/client/code-
signing certificates, CA tokens (the platform's bearer), tickets, OCSP/CRL, ACME, and the
hash-chained audit log.
**Placement:** Identity & Access › Certificate Authority. **Gate:** `/ca/admin/*` accepts a
platform-admin bearer; the console never calls the session-only `/ca/api/config/*` or
`generate-root|intermediate|code-signing|csr` routes.

**Tabs:** Overview · Certificates · Tokens · Tickets · OCSP & CRL · ACME · Directory (CA groups
and roles) · Audit · Config.

**Overview:** stat tiles from `GET /ca/admin/api/stats` (certificates by type/status, tokens by
expiryType/status, users, groups, roles, tickets, audit entries), OCSP/CRL health
(`/admin/api/ocsp/status`, `/admin/api/crl/status` — CRL status currently 500s when a row exists
**(backend: fix `revokedCertificates` read)**), issuance time series (`/admin/api/timeseries/:type`
**(backend: uses MySQL `DATE_FORMAT`; port to Postgres `date_trunc`)**), recent certificates and
tokens (`/admin/api/certificates/recent`, `/admin/api/tokens/recent`).

**Certificates table** (server: `GET /ca/admin/api/certificates?status=&type=&limit=&offset=`;
no max — the console caps page size at 200). All views; grid tiles show CN, type glyph, status,
"expires in". Group-by default: type.

| Column | Type | Notes |
|---|---|---|
| Common name (pinned, locked) | link | with SAN count |
| Serial | id `serial-hex-32` | |
| Type | enum `root·intermediate·entity·san·code_signing·client·server` | |
| Status | enum `active·revoked·expired·suspended` | |
| Issuer | link | self-signed shown as "root" |
| Subject (user) | user | null for system |
| Not before / Not after | timestamp iso | "expires in" badge < 30d |
| Key size / Algorithm | number / text | 2048·4096·8192; RSA-SHA256/384/512 |
| Fingerprint | id sha256 | hidden by default |
| Revoked at / Reason | timestamp / enum (10 X.509 reasons) | hidden unless status=revoked |

Actions: **Issue certificate** (`md` form → `POST /ca/admin/api/certificates/issue`: type
`entity·san·code_signing·client·server` (+ `root` when no active root), commonName, SANs
(chips ≤ 100), O/OU/C/ST/L/email, keySize 2048|4096, validityDays 1–825, subject user lookup),
Revoke (confirm with reason enum → `POST /:id/revoke`; shows cascaded token count), Download
PEM (`/:id/download`), Export (`/ca/api/certificates/:id/export?format=pem|der|chain|pkcs12`),
View chain (`/:id/chain` rendered as a hierarchy), Status (`/:id/status` OCSP-style), Renew
(`/:id/renew`). Detail sheet: subject/issuer DNs, validity, SANs, fingerprint, PEM viewer with
copy, tokens signed by this cert (link to Tokens filtered by `certificateId`).

**Tokens table** (server: `GET /ca/admin/api/tokens?status=&expiryType=&userId=&certificateId=&groupId=&organizationId=`;
includes user, certificate, group, organization). Group-by default: expiryType. Card fields:
title = resource value, subtitle = status, facts = subject, permissions, expiry, uses, scope.

| Column | Type | Notes |
|---|---|---|
| Token id (pinned) | id uuid | this **is** the bearer; copy is allowed but flagged |
| Subject | user | from `tokenData`/user include |
| Resource | enum `url·did·cid` + value | value middle-truncated |
| Permissions | perm badges R W A U D | |
| Expiry | composite (§6.6) | time: countdown; use: `usesRemaining/maxUses`; persistent: warn |
| Status | enum `active·revoked·expired·exhausted` | |
| Scope | group / org | ca.groups |
| Signing cert | link | CN + serial |
| Issued / Last used | timestamp epoch-ms | |
| Use count | number | |
| Revoked by / reason | user / text | hidden unless revoked; "system" when null |

Actions: **Issue token** (§6.6 → `POST /ca/admin/api/tokens/generate`), Validate (`POST
/admin/api/tokens/validate` with resource/permission inputs → verdict panel), Introspect
(`GET /ca/api/tokens/:id/introspect` in the inspector), Revoke (reason ≤ 255 → `POST /:id/revoke`),
Bulk revoke (by selection, or by scope `user|group|organization` + target lookup → `revoke-bulk`,
shows `revokedCount`), Refresh (`POST /ca/api/tokens/:id/refresh`). Live: `/ca` namespace
`tokens:updated`, `token:created`, `token:revoked`, `token:used` (**backend: the `/ca` namespace
must honor the bearer; today it admits unauthenticated sockets and ignores `auth.token`**).

**Tickets table**: only `POST /ca/tickets/generate` exists **(backend: list/revoke tickets)**;
until then the tab renders the generate form (type enum — model values `login · passwordReset ·
emailVerification · apiAccess · download` — maxUses, 5-minute expiry) and a Reveal-once of the
ticket code.

**OCSP & CRL tab:** responder status, cache/batch flags, CRL number, last generated, revoked
count, `Generate CRL` (`POST /admin/api/crl/generate`), download links (`/ca/crl/current.crl`,
`/ca/crl/`), and a **Check serial** field (`GET /ca/ocsp/status`, `POST /ca/ocsp/batch`).

**ACME tab** (read-only from DB **(backend: admin list endpoints for `acme_accounts`,
`acme_orders`, `acme_authorizations`, `acme_challenges`)**): accounts (thumbprint, status
`valid·deactivated·revoked`, contacts), orders (status `pending·ready·processing·valid·invalid`,
identifiers, expires, certificate link), challenges (type `http-01·dns-01`, status). Directory
URL and `ACME_*` settings displayed from config.

**Directory tab:** CA groups (`GET /ca/admin/api/groups`: name, slug, type
`distribution_list·organizational_unit·team·department`, status `active·inactive·archived`,
parent, members with role `member·admin·owner`) and CA roles (`/admin/api/roles`: name, slug,
permission flags bitmask rendered as chips READ/WRITE/APPEND/SHARE/DELETE/MODERATE/LINK,
resource pattern, system, priority, status). Note that `ca.users` is vestigial; the Users item
under Identity uses auth. **(backend: CRUD for CA groups/roles — only list exists.)**

**Audit tab:** `GET /ca/admin/api/activity` (server; no filters today **(backend: `action`,
`status`, `severity`, `requestId`, date range)**): time, action (e.g. `token.generate`,
`certificate.revoke`, `config.update`), status `success·failure·error`, severity
`info·warning·error·critical`, resource type/id, principal, IP, request id, details (JSON in the
inspector). A **Verify chain** action calls `AuditLog.verifyChain` **(backend: expose as
`POST /ca/admin/api/audit/verify`)** and renders `{valid, checked, errors[]}`.

**Config tab:** `GET /ca/admin/api/config` (masked) rendered as read-only cards; the four
`cert-*` sections are session-only and log-only, so the console shows CA env (`CA_NAME`, DN
fields, validity days, key sizes, OCSP/CRL/ACME settings, storage type, token defaults, rotation)
from the Environment view (§10.4) and lets the operator edit only through overrides once keys are
added to the descriptor **(backend)**.

**Enums:** Appendix A.1. **Gaps:** §14 (CA-1…CA-8).

### 9.2 Identity and Access (`auth`)

**Purpose:** people, groups, roles/permissions, OAuth/OIDC applications, sessions, invitations,
MFA policy, LDAP/SAML directory, and org provisioning.
**Placement:** Identity & Access › Users · Groups · Roles & Permissions · Applications & OAuth ·
Sessions & Invitations · Directory. Organizations live in §8. **Gate:** CA bearer + platform
admin (`requireAdminAfterCA`).

**Users** (`/admin/users`) — DataTable server: `GET /auth/api/users?search=&limit≤200&offset`.
All views; grid shows avatar, name, email, status, MFA glyph.

| Column | Type | Notes |
|---|---|---|
| User (pinned, locked) | user | avatar + displayName + email |
| Status | enum `active·inactive·suspended` | group-by default |
| Email verified | boolean | |
| MFA | boolean | `mfaEnabled` |
| Providers | chips | google / github ids present |
| Orgs | number | from detail on demand |
| Last login | timestamp epoch-ms | |
| Locked until | timestamp epoch-ms | shows lock badge when future |
| Created | timestamp iso | |

Actions: Create user (email, password, displayName, first/last, status, emailVerified →
`POST /users`), Invite (email, org, role, kind `invite·activation` → `POST /users/invites`),
Import CSV (wizard, §8.3), Export CSV (`GET /users/export`), Edit (status/profile → `PUT
/users/:id` **(backend: admin update; today own-only)**), Unlock (**backend: clear
`loginAttempts/lockedUntil`)**, Suspend/Reactivate (status), Delete (destructive), Reset MFA
(**backend**), Force password reset (`/forgot-password` on behalf **(backend)**). Detail sheet
(`GET /users/:id/detail`): profile, groups, roles with scope/status/expiry, org memberships,
resolved permissions, last 10 sessions (revoke each **(backend: admin session revoke)**),
CA tokens for the user (link to §9.1 filtered by `userId`), DIDs (`GET /atproto/users/:id/dids`).

**Groups** (`/admin/identity-groups`) — server: `GET /auth/api/groups?organizationId=`: name,
slug, type `system·organization·custom`, org, parent, members count, legacy permissions
(R/W/A/D/U chips). Actions: create/edit/delete, add/remove members (user lookup), import
(`POST /groups/import` ≤ 500), assign role to group (`/roles/:id/assign-group`).

**Roles & Permissions** (`/admin/roles`) — two tabs. *Roles* (server: `GET /roles?organizationId=&type=`):
name, slug, type `system·organization·custom`, org (null = system), priority, permissions
(chips with wildcards `*`, `org:*`, `admin:*`), serviceAccess (allowed/denied services), system.
Actions: create/edit (permission catalogue picker), delete (non-system), assignments view
(`/roles/:id/assignments`), assign/revoke user or group with scope enum
`global·organization·application`, expiresAt (date picker), status `active·expired·revoked`.
*Permissions* (`GET /roles/permissions?scope=&service=`): permissionString, resource, action,
scope `system·organization·application·service`, service, system; create catalog entry
(`POST /roles/permissions`); **Check permission** tool (`POST /roles/check-permission`) with
user lookup + permission + org/app/service.

**Applications & OAuth** (`/admin/applications`) — server: `GET /auth/api/applications?organizationId=`:
name, clientId (`app_…`), type `web·native·spa·service·m2m`, clientType
`confidential·public`, org, owner, status `active·inactive·revoked`, PKCE/consent/trusted
flags, token lifetimes. Form: redirectUris, postLogoutRedirectUris, webOrigins (list chips
validated as URLs), grantTypes multi-enum (`authorization_code · implicit · password ·
client_credentials · refresh_token`), responseTypes, scopes, lifetimes (duration fields, s),
requirePkce, requireConsent, isTrusted, isFirstParty, allowedPermissions, serviceAccess,
accessControl (user/group lookups), rateLimit, logo/homepage/privacy/terms URLs. Regenerate
secret → Reveal-once. A second tab lists `OAuth2Client`/`OAuth2Token` rows **(backend: admin
list/revoke for oauth2_clients and oauth2_tokens)**; OIDC discovery and JWKS links.

**Sessions & Invitations** (`/admin/sessions`) — *Sessions* (**backend: admin list of
`auth.sessions` with `userId`, `active`, date filters**; today only self via `GET /sessions`):
user, sessionId, caTokenId (link → CA introspect), IP, user agent (parsed), lastActivityAt,
expiresAt, active; revoke (and thereby revoke the CA token). *Invitations* (server: `GET
/users/invites?organizationId=&email=&status=&kind=`): email, kind `invite·activation`, status
`pending·accepted·revoked·expired`, org, role, invitedBy, expiresAt (epoch-ms, countdown),
acceptedAt; revoke (`DELETE /users/invites/:id`), resend **(backend)**.

**Directory** (`/admin/directory`) — *LDAP*: `LdapConfig` table and form (host, port 1–65535,
useSSL/useTLS, bindDN, bindPassword secret, baseDN, user/group search bases and filters, object
classes, attributeMapping (key/value editor with defaults), groupMapping, sync toggles,
syncInterval ≥ 60000 ms, timeout 1000–60000, poolSize 1–20, autoCreateUsers, defaultUserRole,
updateUserOnLogin, allowWeakCiphers, verifyCertificate, status `active·disabled·error·testing`,
lastSyncStatus `success·partial·failed·never`, stats). Actions: test connection, sync users /
groups / all, start/stop scheduler, view stats. **(backend: mount `src/routes/ldap.js` and
replace its dead `req.user.roles` check with `requireAdminAfterCA`.)** *SAML*: providers
(`GET /saml/providers`, `/saml/status`), SP metadata link, attribute mapping and auto-provision
flags shown from env (read-only until keys enter the overrides descriptor). *OAuth providers*:
Google/GitHub configured? (from env presence). *Signup policy*: `GET /auth/api/auth/signup-policy`
with a link to the platform org's settings (§8.2).

**Auth config sections** (`auth-users`, `auth-groups`, `auth-roles`, `auth-methods`) are
read-only façades whose POST only logs; the console does **not** render them as editors. The
`auth-methods` fields (password auth, MFA, OAuth2, SAML, session timeout, password rules) are
instead surfaced as read-only "effective policy" on the Directory tab, with the actionable
controls in org settings.

**Live:** none (auth has no namespace); user/session tables poll at 30s and refresh on
`/_admin` `config:changed` for `PLATFORM_ORG_SLUG`.

**Enums:** Appendix A.2. **Gaps:** §14 (AUTH-1…AUTH-9).

### 9.3 Spark messaging (`spark`)

**Purpose:** oversee conversations and group channels, moderation outcomes on messages,
encryption keys, attachments, and the five Bull queues. **E2EE constraint:** for
`encrypted=true` messages the server holds only ciphertext; the console never claims to show
message bodies and moderation is `skipped/encrypted` by design.
**Placement:** Community › Messaging. **Gate:** queues need `req.user.isAdmin`; config needs
`requirePlatformAdmin`; there is **no admin list of conversations or messages** today.

**Tabs:** Overview · Conversations · Messages (moderation) · Encryption keys · Attachments ·
Queues · Config.

**Overview:** counts from `GET /spark/api/config/messaging-settings` `stats`
(totalMessages, totalConversations, todayMessages), queue health, search index status
(`spark_messages` on OpenSearch), moderation status distribution.

**Conversations table** **(backend: `GET /spark/api/admin/conversations?type=&groupId=&channelKind=&active=&search=&limit&offset`)**:
name (or "Direct"), type `direct·group`, channelKind `chat·announcement`, group (nexus lookup),
participants (count; expand to userId/role `owner·admin·member`/muted/mutedUntil), lastMessageAt,
active, settings (readReceipts, typingIndicators, muteNotifications), createdBy. Actions: view
participants, remove participant, archive (`active=false`), export metadata. Card fields: title
= name/participants, subtitle = type/channel, facts = last message, participant count, group.

**Messages (moderation) table** **(backend: admin list over `message_moderation` joined to
messages metadata — never content of encrypted rows)**: messageId, conversation, sender,
contentType `text·image·video·file·audio`, encrypted, moderation status
`pending·approved·rejected·skipped·failed`, reason (`feature_disabled·encrypted·no_text·clean·flagged·no_ai_provider·error·invalid_content_type`),
action, riskScore (0–100 bar), moderationItemId (link → §9.9), attempts, lastError, edited /
deleted / pinned flags, createdAt. Actions: open moderation item, re-moderate (re-enqueue
`moderate-ugc`), redact (`POST /spark/api/moderation/action` is service-only **(backend: admin
redact route)**). Group-by default: status.

**Encryption keys table** (per user via `GET /spark/api/encryption/keys/public/:userId`
**(backend: admin list of `encryption_keys` with `userId`, `active`, `expiresAt` filters)**):
user, deviceId, keyFingerprint (sha256), keyType `rsa-4096`, active, lastUsedAt, expiresAt,
created. Actions: deactivate (**backend**), view public key PEM.

**Attachments table** (`GET /spark/api/attachments/conversations/:conversationId/attachments?type=`
per conversation; admin cross-conversation list **(backend)**): fileName, mimeType, size,
status `pending·processing·ready·failed`, duration/dimensions, FileVault id (link → §9.5),
encrypted, created.

**Queues tab:** the five queues (`notification · indexing · file-processing · delivery-tracking ·
cleanup`) as rows: waiting, active, completed, failed, delayed, total (`GET /spark/api/queues/stats`);
actions pause/resume/clean (grace ms, duration field); drill into §9.15 for jobs.

**Config tab:** sections `messaging-settings` (maxMessageLength, enableE2EE, messageRetention,
fileUploadEnabled, maxFileSize MB, typing/read receipts) and `messaging-moderation`
(autoModeration, profanityFilter, spamDetection, linkValidation, moderatorUrl, autoDeleteSpam)
rendered with a persistent **"runtime only — not persisted, not enforced"** banner until
`SparkConfig` persistence lands **(backend)**. The real switch `SPARK_TEXT_MODERATION` is shown
from env with an "add to overrides descriptor" note.

**Live:** `/spark` namespace is per-conversation and user-scoped; the console does not join
conversation rooms. Queue counts poll at 10s.

**Enums:** Appendix A.3. **Gaps:** §14 (SPARK-1…SPARK-5).

### 9.4 Nexus groups (`nexus`)

**Purpose:** community groups, memberships and roles, join requests and invites, events and
attendees, governance proposals and votes, content flags and moderation cases, subgroups,
trending and recommendations, and the admin audit log.
**Placement:** Community › Groups. **Gate:** `requireToken() + requireAdmin()` reads the CA
token's `data.roles` only — the console shows the read-only banner for allowlist-only admins
(§2.2) **(backend: honor `isPlatformAdmin(email)` in nexus `requireAdmin`)**.

**Tabs:** Overview · Groups · Memberships · Events · Governance · Moderation · Subgroups ·
Trending & Recommendations · Audit · Config.

**Overview:** `GET /nexus/api/admin/stats?period=30d` → tiles (groups, active groups, members,
events, active proposals) and the growth series chart (groups/members/events per day); period
selector (7d/30d/90d/365d) uses the range picker presets.

**Groups table** (server: `GET /nexus/api/groups?visibility=&category=&tags=&search=&featured=&verified=&creatorId=&page=&limit≤100&sortBy=&sortOrder=`
— the console whitelists `sortBy` to model attributes because the API does not). All views;
grid shows avatar/banner, name, member count, visibility.

| Column | Type | Notes |
|---|---|---|
| Group (pinned, locked) | link | avatar + name + slug |
| Visibility | enum `public·private·unlisted` | group-by default |
| Join mode | enum `open·request·invite` | |
| Governance | enum `centralized·decentralized·dao·consensus` | |
| Category / Tags | text / chips | |
| Members / Max | number | |
| Featured / Verified / Active | booleans | |
| Location | text (+ lat/lng) | |
| Created / Updated | timestamp epoch-ms | |

Actions: create (`POST /groups`: name 2–255, description ≤ 5000, visibility, joinMode,
governanceModel, governanceRules JSON, category, tags ≤ 50 chars each, avatar/banner URLs,
maxMembers ≥ 1, location, lat −90..90 / lng −180..180 both-or-neither, website ≤ 500),
edit (`PUT`), delete (destructive; platform-admin bypass), feature/verify toggles, per-group
stats (`/admin/groups/:id/stats` → detail sheet with totals, growth series, recent activity),
open members. Detail sheet tabs: Members, Roles, Join requests, Invites, Events, Proposals,
Flags, Cases, Subgroups, Trending stats.

**Memberships** (per group: `GET /groups/:id/members?role=&status=&page&limit≤100`): user,
role (free string; picker offers `owner·admin·moderator·member`), custom role, status
`active·suspended·banned·left`, joinedAt, suspendedUntil/reason, invitedBy. Actions: change role
(`PUT /groups/:id/members/:userId/role` — `admin·moderator·member`), remove, suspend/ban
(**backend: status transitions**). Join requests (`status pending·approved·rejected·cancelled`)
and invites (`status pending·accepted·declined·expired`, inviteCode, maxUses/useCount)
**(backend: list endpoints; only approve/reject and join-by-code exist)**. Group roles
(`name`, color, position, isDefault, isSystem, permissions JSON with the 11 known keys)
**(backend: CRUD; roleService only)**. Categories **(backend: CRUD)**.

**Events** (server: `GET /events?groupId=&upcoming=&past=&status=&eventType=&limit&offset`; no
max — console caps 200): title, group, eventType `in-person·virtual·hybrid`, status
`draft·published·cancelled·completed`, visibility `public·members-only·invite-only`, start/end
(epoch-ms, with timezone column), attendees/max, requiresApproval, live stream (link → §9.10),
tags. **Calendar view** (§6.2 adds a fourth rendering for this table only: month/week grid using
the same filters). Actions: edit, cancel (reason), delete, attendees (`/events/:id/attendees?rsvpStatus=&checkInStatus=`:
rsvp `going·maybe·not-going·waitlist`, check-in `pending·checked-in·no-show`, guests, notes;
check-in action), reminders (presets `ONE_WEEK…THIRTY_MINUTES`, 1–6), notify, attach live
stream, iCal links (`/calendar/events/:id/ical`, group and user feeds, CalDAV/CardDAV URLs).

**Governance** (server: `GET /governance/proposals?groupId=&status=&proposalType=&activeOnly=`):
title, group, type `rule-change·role-change·member-action·general·other`, votingMethod
`simple-majority·supermajority·unanimous·weighted`, quorum 1–100, status
`draft·active·passed·rejected·cancelled·expired`, yes/no/abstain/total (stacked bar),
votingStartsAt/EndsAt (epoch-ms countdown), executedAt. Actions: results (`/results`), votes
(`/votes?vote=` → user, vote `yes·no·abstain`, weight, reason, votedAt), execute, close, cancel.

**Moderation** (per group: `GET /moderation/flags/:groupId?status=&priority=` and
`/moderation/queue/:groupId?status=&priority=`; **backend: cross-group lists**): flags —
contentType `post·comment·event·member·message·other`, contentId (link by type), owner,
reason (10 values), status `pending·under-review·resolved·dismissed·escalated`, priority
`low·medium·high·critical`, assignedTo, moderatorCaseId (link → §9.9), resolution/action
`none·warning·content-removed·member-suspended·member-banned·escalated`; cases — caseType
`content-flag·member-report·automatic·admin-review·appeal`, subjectType
`member·content·event·group-settings`, severity, status
`open·under-review·pending-action·resolved·closed·appealed`, priority, assigned moderators,
evidence, actions log. Actions: assign (`/cases/:id/assign`), act (`/cases/:id/action`:
`remove-content·warn-user·suspend-user·ban-user·dismiss`, reason ≤ 500, duration), resolve
flag (`/flags/:flagId/resolve`).

**Subgroups** (`GET /subgroups?parentGroupId=&type=&visibility=&includeArchived=`): name,
slug, parent, type `channel·subgroup`, visibility `public·members·restricted`, allowedRoles,
members/max, pinned/archived/active, sortOrder (drag to reorder with keyboard alternative).
Actions: create/edit/delete/archive, members (`role moderator·member`, status
`active·removed·banned`).

**Trending & Recommendations:** `GET /trending/groups?category=&minScore=` (score, rank,
category rank, growth/activity velocity, quality, moderation score, last activity) with
**Recalculate** (`POST /trending/update`, body groupId/limit/batchSize; audited);
recommendations analytics (`/recommendations/analytics`) tiles (shown/clicked/joined/dismissed
rates) and per-user lookup (`/recommendations?userId` **(backend: admin by user)**).

**Audit** (server: `GET /nexus/api/admin/audit?actor=&action=&targetType=&groupId=&limit≤200&offset`):
time (epoch-ms), actor (user), action (dotted; enum-like picker from observed values),
targetType `config·event·flag·group·member·subgroup`, targetId, group, platformAdmin flag,
metadata (inspector).

**Config tab:** `nexus-groups`, `nexus-events`, `nexus-calendar`, `nexus-trending` are
log-only façades whose values are literal defaults; render read-only with the "not persisted"
banner and the real env knobs (`MAX_GROUP_SIZE`, `MAX_GROUPS_PER_USER`, `RATE_LIMIT_*`,
`HERALD_URL`) from §10.4 **(backend: persist to a `nexus_config` table like timeline/live)**.

**Live:** none (no namespace); tables poll 30s; moderation tab also listens to `/moderation`
events carrying `sourceService: 'nexus'`.

**Enums:** Appendix A.4. **Gaps:** §14 (NEXUS-1…NEXUS-7).

### 9.5 FileVault (`filevault`)

**Purpose:** files, directories, versions, share links, blobs and deduplication, thumbnails,
quotas, storage backends (disk / S3 / IPFS), and image/video moderation.
**Placement:** Content › Files. **Gate:** `/filevault/api/admin/*` requires `admin` permission
or platform-admin email.

**Tabs:** Overview · Files · Directories · Share links · Moderation · Quotas · Storage & Dedup ·
Config.

**Overview:** `GET /filevault/api/admin/stats` (total files, blobs, size, per-backend usage
bars), `/admin/storage/health` (backend health chips), `/admin/deduplication` (saved bytes,
ratio, most-referenced blobs), moderation queue counts (`queueStats()` **(backend: expose)**).

**Files table** **(backend: admin cross-user list `GET /filevault/api/admin/files?userId=&groupId=&ownerType=&mimetype=&visibility=&isDeleted=&moderationStatus=&contentHash=&storageBackend=&q=&limit&offset`)**
— today only per-owner/per-group lists exist. All views; **grid is the default** here (thumbnails
via `/api/thumbnails/:fileId?size=`).

| Column | Type | Notes |
|---|---|---|
| Name (pinned, locked) | link | icon by mimetype |
| Owner | user / group | ownerType `user·group` |
| Path | text | |
| Size | bytes | aggregate sum on groups |
| Mimetype | text | group-by default |
| Visibility | enum `private·shared·public` | |
| Moderation | enum `pending·approved·rejected·failed·skipped` + reason | |
| Backend / Key | enum `disk·s3·ipfs` / id (CID when ipfs) | |
| Content hash | id sha256 | |
| Version | number | |
| Tags | chips | |
| Deleted | boolean + deletedAt | |
| Created / Updated | timestamp iso | |

Actions: download (`/files/:id/download?version=`), versions (`/files/:id/versions`, restore
`/restore/:versionNumber`, diff `from/to`), description (`/files/:id/description` → altText,
AI tags, status), share links, re-moderate (**backend**), set visibility (**backend: admin**),
soft delete / restore / purge, migrate backend (`POST /admin/migrate` **(backend: broken —
missing `File→blob` association)**).

**Directories:** tree browser (left) built from `GET /directories?directoryId=` and
`/groups/:groupId/directories`, with the files table filtered on the right; rename/move/delete
(recursive confirm). **(backend: admin cross-user directory listing.)**

**Share links** (server: `GET /share?limit&offset` own; **backend: admin list**): file, creator,
shareType `link·direct`, permissions (R/W/D), tokenId (link → CA introspect), expiresAt, uses /
maxUses (use-based control §6.6), revoked. Actions: revoke (`DELETE /share/:id`), copy URL,
mint file-access token.

**Moderation** **(backend: list over `file_moderation`)**: file, status, reason (`feature_disabled·not_an_image·encrypted·clean·flagged·shadow_pending·shadow_flagged·unsupported_image·error`),
riskScore bar with the threshold line (`FILEVAULT_IMAGE_RISK_THRESHOLD`), provider/model,
attempts, lastError, moderationItemId (link → §9.9), altText / aiTags / textInImage. Group-by
default: status. Actions: re-queue, approve/reject override (**backend**), open moderator item.
Mode banner: image `off|shadow|enforce`, video `off|shadow|enforce` (from overrides, hot).

**Quotas** (server: `GET /admin/quotas?limit`; **backend: offset, search by user**): user,
used (bytes), quota (bytes), used % (bar; danger ≥ 90%), updated. Actions: set quota (bytes or
GB input → `PUT /admin/quotas/:userId`), bulk set for selection.

**Storage & Dedup:** backend cards (disk path/max, S3 endpoint/bucket/region, IPFS API/gateway)
with health; duplicates table (`/admin/duplicates`: checksum, size, refCount, saved bytes);
cleanup actions (`POST /admin/cleanup {minAge}`, `/cleanup/blobs`) with duration field and
result table; verify blob (`POST /admin/verify/:blobId`).

**Config tab:** filevault has no `/api/config` route; the tab shows the env inventory
(`MAX_FILE_SIZE`, `ENABLE_DEDUPLICATION`, `ALLOWED_MIME_TYPES`, image pipeline, backend
settings, moderation knobs) with the overridable ones (`FILEVAULT_IMAGE_MODERATION`,
`FILEVAULT_IMAGE_RISK_THRESHOLD`, `FILEVAULT_MODERATION_CONCURRENCY`) editable via §7.2.

**Enums:** Appendix A.5. **Gaps:** §14 (FV-1…FV-7).

### 9.6 Vault secrets (`vault`)

**Purpose:** secrets, encryption keys, credentials and dynamic leases, vault tokens with
policies and bindings, group sharing grants, and the DB audit log.
**Placement:** Trust & Safety › Secrets. **Gate:** CA `read/write/delete` scoped to
`/vault/api/admin`; platform-admin tokens carry full permissions.

**Tabs:** Overview · Tokens · Policies · Secrets · Keys · Credentials & Leases · Group access ·
Audit · Config.

**Overview:** `GET /admin/dashboard/stats` (tokens by status, secrets, keys, cache stats, risk
distribution donut), access report (`POST /admin/reports/access` with the range picker
**(backend: fix `AuditLog.createdAt` → `timestamp`)**), expiring items (secrets/leases/tokens
within 7d), maintenance actions (purge expired tokens, clear cache).

**Tokens table** (server: `GET /admin/tokens?entityType=&entityId=&status=&limit&offset`):

| Column | Type | Notes |
|---|---|---|
| Token id (pinned) | id `vt_` | |
| Display name | text | |
| Entity | enum `user·group·organization·service·certificate` + id (lookup by type) | group-by default |
| Status | enum `active·revoked·expired·suspended` | |
| Risk | number 0–1 (bar; ≥ .7 danger) | |
| Permissions | JSON chips (`secrets:read` …) | |
| Path prefixes / IP whitelist | chips | |
| Expiry | composite (§6.6): expiresAt / maxUses·usageCount | |
| Last used (from) | timestamp / IP | |
| CA token | id uuid (link) | |
| Created by | user | |

Actions: Generate (§6.6 form → `POST /admin/tokens/generate`; Reveal-once of `hvs.`),
detail (`GET /admin/tokens/:id` with bindings and anomalies **(backend: anomalies error)**),
revoke (reason required), suspend (reason), reactivate, bulk revoke (selection or
entityType+entityId). Live: `/vault` `token:event` (created/revoked) **(backend: the namespace
accepts any token outside production — fix before exposing to the console)**.

**Policies table** (client: `GET /admin/policies?policyType=&status=&aiSuggested=` — unpaginated):
name, type `secret·key·credential·global`, enforcementMode `enforcing·permissive·audit`,
priority 1–1000, entityTypes chips, status `active·draft·deprecated`, aiSuggested/confidence,
bindings count. Form: structured **rule builder** for `timeRestriction {timezone, allowedHours,
allowedDays}`, `pathRestrictions[]`, `ipWhitelist[]`, `rateLimit {maxRequests, windowMinutes}`
with JSON escape hatch; suggest (`POST /admin/policies/suggest` **(backend: same createdAt
bug)**). Note shown: "rules are stored, not yet evaluated on requests".

**Secrets table** (server: `GET /secrets?pathPrefix=&status=&limit&offset`, metadata only):
path (pinned, tree-grouped by first segment — group-by default), key, version, encryption key
(link), status `active·deprecated·deleted`, expiresAt, lastRotatedAt, rotationPolicy, createdBy /
updatedBy. Actions: create (`POST /secrets/:path` path/key/value secret field/metadata/expiry),
update value, rotate, delete, reveal value (`GET /secrets/:path?includeValue=true` behind a
confirm; audited as `read`), share to group (Group access tab).

**Keys table** (`GET /keys?status=&purpose=`): name, algorithm, purpose
`general·transit·signing`, version, status `active·rotating·deprecated·revoked`, lastRotatedAt,
expiresAt, secrets using it (count). Actions: generate (name, purpose, algorithm), rotate
(shows the rotation chain `metadata.rotatedFrom`), revoke/delete, transit encrypt/decrypt tool
(`POST /keys/encrypt|decrypt`).

**Credentials & Leases** (`GET /credentials?service=&status=`, `GET /dynamic/leases?secretType=&status=`):
leaseId (`lease_`), secretType `database·api_key·credential`, secretPath, databaseType
(`postgresql·mysql·mongodb` for database leases), ttl / maxTTL (durations), renewable,
renewCount, expiresAt (countdown), status `active·expired·revoked`, createdBy. Actions: generate
database credential (form: path, databaseType, ttl 60–86400, maxTTL 60–604800, renewable,
connection JSON), generate API key (prefix ≤ 10, scopes chips), renew, revoke.

**Group access** (`GET /groups/:groupId/secrets` per group, nexus group lookup): secret path,
permission `read·write·manage`, grantedBy, expiresAt; share/revoke; reveal (audited).

**Audit table** (server: `GET /audit/logs?resourceType=&resourceId=&resourcePath=&actor=&action=&success=&startDate=&endDate=&limit≤1000&offset`
**(backend: date filters use removed `$gte` aliases)**): timestamp, action (12 values), resource
type (7 values), resource path/id, actor, IP, token, success, duration, requestId, error;
stats tiles (`/audit/stats`), export CSV (`/audit/export`). Group-by default: action.

**Config tab:** the four persisted sections (`vault-secrets`, `vault-encryption`,
`vault-access`, `vault-audit`) with their typed fields (§ Appendix A.6 lists selects), plus
the banner "stored, not consumed by runtime" and the runtime truths (AES-256-GCM + scrypt,
`VAULT_MASTER_KEY` set?).

**Enums:** Appendix A.6. **Gaps:** §14 (VAULT-1…VAULT-4).

### 9.7 Timeline (`timeline`)

**Purpose:** posts and comments, approvals, text moderation, lists, trending, attachments,
search index, and the four Bull queues.
**Placement:** Content › Timeline. **Gate:** platform-admin email (`requireAdmin`).

**Tabs:** Overview · Posts · Approvals · Moderation · Lists · Trending & Search · Attachments ·
Jobs · Config.

**Overview:** stats from `timeline-settings` (totalPosts, totalLists, todayPosts), queue
health (`/timeline/health/queues`), ES index status, moderation status distribution, held
posts count.

**Posts table** **(backend: `GET /timeline/api/admin/posts?userId=&groupId=&visibility=&contentType=&deleted=&moderationStatus=&approvalStatus=&q=&dateFrom=&dateTo=&cursor|page`)**
— today posts are reachable only via feeds and `/search/posts`. All views; card view shows the
post body (≤ 280 chars), media count, counts.

| Column | Type | Notes |
|---|---|---|
| Post (pinned) | id + excerpt | |
| Author | user | |
| Group | nexus group | null = personal |
| Visibility | enum `public·followers·private` | |
| Content type | enum `text·image·video·link` | group-by default |
| Likes / Comments / Reposts | numbers | |
| Moderation | `post_moderation.status` + risk | |
| Approval | `metadata.approval.status` + mechanism | |
| Bluesky | at-uri / did (lookup) | synced flag |
| Deleted | boolean | |
| Created | timestamp iso | |

Actions: open (`GET /posts/:id`), thread/quotes, analytics (`/posts/:id/analytics`), delete
(admin **(backend)**), re-moderate, approve/reject (below).

**Approvals** (server: `GET /posts/approvals/pending?limit≤200`): held posts (createdAt ASC),
mechanism `manual·lowcode_workflow·lowcode_app·webhook`, requested visibility; decide
(`POST /posts/:id/approval {decision approved|rejected, reason}`) singly or in a batch dialog.

**Moderation** **(backend: list over `post_moderation`)**: same columns as §9.3 messages
(status `pending·approved·rejected·failed·skipped`, reason, action
`reject·remove·hide·flag·approve`, riskScore, moderationItemId, attempts, lastError, contentHash).

**Lists** (`GET /lists` own; **backend: admin list**): owner, name, visibility
`public·private`, members count; members (`/lists/:id/members`), delete.

**Trending & Search:** trending topics/hashtags (`/search/trending/topics|hashtags`: topic,
type `hashtag·keyword·user`, posts, engagement, score, peakAt) with **Recalculate now**
(enqueue `trending-update` **(backend)**); hashtag search; ES posts index status and
**Reindex** (`bulk-reindex` job **(backend: admin route)**); search method indicator
(`elasticsearch` vs `sql`).

**Attachments** (per post/comment; **backend: admin list**): filename, mime, size, status
`pending·active·processing·failed·deleted·quarantined`, virusScanStatus
`pending·clean·infected·error`, uploadSource, uploader, FileVault id, primary/order.

**Jobs:** the four queues (`fanout · trending · indexing · notifications`) — see §9.15 (this
tab embeds the Jobs view filtered to timeline).

**Config tab:** `timeline-settings` (maxPostLength, 8 enable flags, postsPerPage — persisted,
two hot-applied) and `timeline-moderation` (autoModeration, moderationProvider
`exprsn·external·both`, externalProviderUrl, contentFilters, spamDetection, moderatorUrl
read-only, flagThreshold, enableUserReporting, requireApproval, approvalMechanism
`manual·lowcode_workflow·lowcode_app·webhook`, approvalTarget, approvalSecret secret) as
typed forms; webhook HMAC status chips for `BLUESKY_WEBHOOK_SECRET`, `MODERATOR_WEBHOOK_SECRET`,
`TIMELINE_APPROVAL_WEBHOOK_SECRET` (set / not set).

**Live:** `/timeline` namespace `new:post`, `post:retracted` on `timeline:global` feed a
"new rows" pill on the Posts table; `/moderation` events with `sourceService: 'timeline'`.

**Enums:** Appendix A.7. **Gaps:** §14 (TL-1…TL-6).

### 9.8 Prefetch (`prefetch`)

**Purpose:** the timeline pre-warming cache (hot/warm tiers in Redis), its queue (Bull or
RabbitMQ), metrics, and its Redis-persisted settings.
**Placement:** Content › Prefetch. **Gate:** config needs `requirePlatformAdmin`; queue routes
are any-reader/any-writer **(backend: gate `/queue/retry` and failed-list to admin)**.

**Tabs:** Overview · Cache · Queue · Metrics · Config.

**Overview:** `GET /prefetch/api/prefetch/queue/stats` (backend `redis·rabbitmq`, waiting,
active, completed, failed, delayed, rabbit depth/dlq), `GET /metrics` tiles (cache hits hot/warm,
misses, hit rate, prefetch durations p50/p95, errors), health (`/prefetch/health/redis`,
`/timeline`).

**Cache:** a **user lookup** → `GET /status/:userId` (cached, tier `hot·warm`, ttl) and
`GET /:userId` (cached timeline preview); actions: schedule (`POST /schedule/:userId`
priority `high·medium·low`, delay duration), run now (`/immediate/:userId`), invalidate
(`DELETE /:userId/timeline`). A **key browser** for `prefetch:timeline:*` across both Redis DBs
uses §12.1.

**Queue:** failed jobs (`GET /queue/failed?limit`): id (`prefetch:<userId>:<ts>`), user,
priority, failedReason, attempts, timestamp; retry (`POST /queue/retry/:jobId`), bulk retry;
pause/resume/clean **(backend: routes for pause/resume/clean; the queue API exists)**.

**Metrics:** `GET /metrics/:date` with the date picker (YYYY-MM-DD) → per-day chart.

**Config tab:** `prefetch-settings` (enablePrefetch, prefetchInterval, prefetchDepth,
enableActivity, minActivity), `prefetch-cache` (hotCacheTTL, warmCacheTTL — labelled **seconds**
though runtime env is ms: the form shows both and a warning **(backend: reconcile)**,
maxHot/WarmCacheSize, enableCompression, evictionPolicy `LRU·LFU·FIFO`), `prefetch-performance`
(maxConcurrentRequests, requestTimeout, retryAttempts, retryDelay, enableMetrics,
metricsInterval); persisted to Redis but **not consumed** — banner.

**Enums:** Appendix A.8. **Gaps:** §14 (PF-1…PF-3).

### 9.9 Moderation (`moderator`)

**Purpose:** the platform's content-safety hub — the review queue, moderation items and
actions, reports, appeals, user actions, rules and wordlists, AI agents and providers, queue
buckets (Bull/RabbitMQ) with DLQs, workflows, email templates, rate-limit violations, and
metrics.
**Placement:** Trust & Safety › Moderation. **Gate:** `requireAdmin` accepts platform-admin
email **or** token roles `admin · super-admin · super_admin · platform-admin · moderator`. A
`moderator`-only operator sees the queue/reports/appeals tabs and not Config.

**Tabs:** Overview · Queue · Items · Reports · Appeals · User actions · Rules · Wordlists ·
Agents & Providers · Queue buckets · Workflows · Email · Violations · Metrics · Config.

**Overview:** `GET /moderator/api/metrics?period=today|week|month|all` tiles (pending, reviewed,
approved/rejected/flagged, actions, deltas vs previous period), provider status
(`/actions/providers/status`: claude/openai/deepseek/cortex configured, cortex mode
`off·shadow·enforce`), bucket depths and DLQs, SLA aging histogram of the queue (from
`queued_at`).

**Queue** (server: `GET /moderator/api/queue?status=&priority=&limit&offset`; default
`status=pending`, order priority DESC): **card view is the default** — each card shows the
content (text excerpt or image/video thumbnail via `content_url`), source service, content
type, risk score bar with level, the six sub-scores as a mini bar chart, AI provider/model,
requiresReview, escalated (reason), assignedTo, queuedAt age, and the action row
(Approve · Reject · Warn · Remove · Ban · Skip · Analyze). Keyboard triage: `J/K` move,
`A` approve, `R` reject, `W` warn, `X` remove, `B` ban (opens duration dialog), `S` skip.
Approve/reject take `notes`; warn/remove/ban take `reason` (+ `duration`: `permanent` or a
duration field). Claim/assign **(backend: `claim`/`assign` routes; model has `claim()`)**.
Live: `/moderation` `queue:new_item`, `queue:high_priority`, `queue:item_claimed`,
`queue:item_completed` update the cards in place; high-priority arrivals pin to top with a
danger flash.

**Items table** (`GET /moderate/status/:sourceService/:contentType/:contentId` by key;
**backend: paginated list over `moderation_items` with `status`, `riskLevel`, `sourceService`,
`contentType`, `userId`, `requiresReview`, date range**):

| Column | Type | Notes |
|---|---|---|
| Item (pinned) | id + content excerpt | natural key `(source_service, content_type, content_id)` |
| Source | text (`timeline·spark·filevault·atproto·live·nexus·cortex·manual`) | group-by default |
| Content type | enum (10 values incl. `llm_message`) | |
| User | user (UUIDv5 for DIDs → show DID via atproto map) | |
| Risk | score 0–100 + level `safe·low·medium·high·critical` | threshold lines 30/51/76/91 |
| Scores | toxicity·nsfw·spam·violence·hateSpeech·sentiment | hidden by default; sparkbars |
| Status | enum `pending·approved·rejected·flagged·reviewing·appealed·escalated` | |
| Action | enum (9 values) | |
| Provider / model | enum `claude·openai·deepseek·local·cortex` / text | |
| Submitted / Processed / Reviewed | timestamp epoch-ms | |
| Reviewed by | user | |

Detail sheet: full content, metadata, AI response JSON, actions taken (`/actions/content/:t/:id`),
appeals for the item (`/appeals/case/:id`), linked rows in the source module (post, message,
file, recording, atproto case map), re-analyze.

**Reports** (server: `GET /reports?status=&limit≤200&offset`): content key (link to item),
reporter, reason (9 values), details, status `open·investigating·resolved·dismissed·escalated`,
assignedTo/at, resolvedBy/at, actionTaken. Actions: assign (**backend: route; model has
`assign()`**), resolve (`PUT /reports/:id/resolve {resolutionNotes, actionTaken}`).

**Appeals** (server: `GET /appeals?status=&userId=&limit&offset`): appellant, target (item or
user action), reason, additional info, status `pending·reviewing·approved·denied`, submittedAt,
reviewedBy/at, decision; stats (`/appeals/stats/summary`); review (`POST /appeals/:id/review
{decision approve|deny, notes}`) — notes required, no hard-coded message. Live: `appeal:new`,
`appeal:reviewed`.

**User actions** **(backend: list over `user_actions`; only `getActiveForUser` exists)**:
user, actionType `warn·suspend·ban·restrict·unsuspend·unban`, reason, duration, expiresAt
(epoch-ms countdown or "permanent"), performedBy, active, revokedBy/at/reason, related
content/report. Actions: revoke (`revoke()` **(backend)**), execute new
(`POST /actions/execute {actionType, contentType, contentId, sourceService, userId, reason}`).

**Rules** (server: `GET /rules?enabled=&appliesTo=&limit&offset`): name, description,
appliesTo (multi-enum content types), sourceServices (chips), thresholdScore, action (9
values), enabled, priority, parent rule, createdBy. **Rule builder** dialog (`lg`): the
condition tree editor (groups `all·any·none`; leaves `min_risk_score · max_risk_score ·
keywords[] · keywords_list (wordlist picker) · keyword_match any|all · regex (+flags) ·
did_method · min_length · max_length`) with a **Test** panel (`POST /rules/:id/test` with sample
text/riskScore/scores → matched?). Enable/disable/delete; drag priority with keyboard alt.

**Wordlists** (`GET /wordlists`): name (`^[a-z0-9_]+$`), mode `deny·allow`, count, words
(chip editor with paste-multiline, dedupe, case note); PUT/DELETE.

**Agents & Providers** (`GET /agents`): name, type (9 `ai_agent_type` values), status
`active·inactive·testing·error`, provider (5), model, appliesTo, priority 0–100, enabled,
autoAction, executions (total/success/failed), avg ms, lastExecutionAt, lastError. Form:
promptTemplate (textarea with variables), config JSON, thresholdScores (per-score numeric
editor). Executions (`agent_executions`: status `success·failure·partial·skipped`, ms, scores,
actionTaken **(backend: list route)**). Providers card: per provider enabled/key present/model,
`DEFAULT_AI_PROVIDER`, cortex mode; **`moderation-ai` config POST mutates memory only** — the
console shows the env-driven truth and points to overrides.

**Queue buckets** (`GET /queues` merged with live stats): name, displayName, backend
`redis·rabbitmq`, enabled, priority `low·normal·high·urgent`, concurrency, attempts, backoff
(type `fixed·exponential`, delay), rateLimit, deadLetter, rabbit (exchange, exchangeType
`direct·topic·fanout`, routingKey, durable, dlx), match (condition tree), counts (waiting,
active, completed, failed, delayed, dlq | depth, pending), consumer, processed. Actions: create/
edit (form with the rabbit section shown only for `rabbitmq`), delete, test (`/queues/:name/test`),
**DLQ**: view (`/dlq?limit≤200` → items table with payload inspector), redrive (`/dlq/redrive
{limit≤1000}` → moved), purge (destructive confirm).

**Workflows** (`GET /workflows`, `/workflows/active`, `/workflows/executions`): name, trigger
(`manual` or `content_submitted`), enabled, steps (types `condition · parallel · analyze ·
apply_rules · set_action · route_queue · notify · label`), tags. **Workflow canvas** (existing
`WorkflowCanvas`/`StepTree` components) with a linear/keyboard editor alternative; execute with
sample or custom context; executions table (status `queued·running·completed·failed`, trigger,
steps log, error, started/finished) with the step log as a timeline. Setup defaults action.

**Email** **(backend: routes for `email_templates` / `email_logs`)**: templates (name, type — 14
`template_type` values —, subject, body text/html with `{{var}}` preview, variables, enabled,
default) and logs (recipient, subject, status `sent·failed·queued·bounced`, sentAt, error,
template, linked item/action).

**Violations** **(backend: list over `rate_limit_violations`)**: user, violationType, severity
`low·medium·high·critical`, endpoint, count/threshold/window, IP, actionTaken, autoResolved,
detectedAt.

**Metrics:** period selector; charts by status and by action; export CSV (`/metrics/export`).

**Config tab:** `moderation-rules` (static), `moderation-ai` (memory-only — banner),
`moderation-queue` (broken columns — replaced by the Queue tab). Show thresholds
(`AUTO_APPROVE_THRESHOLD` 30 / `MANUAL_REVIEW_THRESHOLD` 51 / `AUTO_REJECT_THRESHOLD` 91) and
feature flags from env; the `moderator_config` key/value store (`GET/PUT` by key **(backend:
generic key browser, categories `general·thresholds·email·ai_providers·workflows·queues·
rate_limiting·notifications·advanced`, `is_sensitive` masked)**).

**Enums:** Appendix A.9. **Gaps:** §14 (MOD-1…MOD-9).

### 9.10 Live streaming (`live`)

**Purpose:** streams (SRS/Cloudflare ingest), rooms (WebRTC), participants, recordings and
their moderation, simulcast destinations (YouTube/Twitch/Facebook/Cloudflare/custom RTMP), room
collaboration (invites, join requests, files), workers and queues, and persisted live config.
**Placement:** Community › Live. **Gate:** config is `requirePlatformAdmin`; **lifecycle routes
have no platform-admin override** — the console shows "owner-only" on those actions until
fixed **(backend)**.

**Tabs:** Overview · Streams · Rooms · Recordings · Destinations & Simulcast · Workers · Config.

**Overview:** `GET /live/api/stats` (connections, streams, rooms, viewers, participants),
`/config/workers/stats` (RabbitMQ fanout/recording depth + dlq), provider card (`STREAMING_PROVIDER`
srs|cloudflare; SRS API version/health via `SRS_API_URL`), recording moderation mode chip.

**Streams table** (server: `GET /streams?status=&visibility=&userId=&limit≤100&offset`; **backend:
admin cross-user search, `groupId` filter**). All views; grid shows thumbnail, title, live badge
with viewer count.

| Column | Type | Notes |
|---|---|---|
| Title (pinned) | link | thumbnail |
| Host | user | |
| Group | nexus group | null = personal |
| Status | enum `pending·live·ended·error` | group-by default; live rows flash on change |
| Visibility | enum `public·unlisted·private` | |
| Viewers / Peak | numbers | live from `viewer-count-updated` |
| Duration | duration | |
| Recording | boolean + url | |
| Started / Ended | timestamp iso | |
| Share metrics | shared/opened/watch-started | from `metadata.shareMetrics` |

Actions: start/stop/delete (owner or group admin today), edit, recordings, destinations, open
player (HLS `/srs/live/<key>.m3u8`), copy ingest URL (never the stream key; **reveal/rotate
key** needs **(backend)**), share events chart.

**Rooms table** (server: `GET /rooms?status=&hostId=&isPrivate=&limit&offset`): name, code
(6-char), host, status `waiting·active·ended`, private (lock glyph), participants / max (2–50),
peak, joinPolicy `open·invite·request`, settings chips (chat, screen share, recording, mute on
join, video on join), duration, started/ended. Detail sheet: participants (`/rooms/:id/participants`:
user, role `host·moderator·participant·viewer`, status `connected·disconnected·reconnecting`,
audio/video/screen flags, joined/left, connection quality), invites (status
`pending·accepted·revoked`), join requests (`pending·approved·denied` with approve/deny),
files (kind `vault·ephemeral`, name, size, sharedAsOwner, FileVault link), recordings.
Actions: close (host-only today), recording start/stop (host), lookup by code.

**Recordings table** (**backend: `GET /live/api/admin/recordings?status=&visibility=&streamId=&roomId=&moderationStatus=`**;
today only per-stream/per-room lists): title, source (stream/room), owner, status
`processing·ready·failed·deleted`, visibility `public·unlisted·private`, format, duration,
size, resolution/bitrate/codec, views/downloads, moderation (status, reason, riskScore,
backend `llamacpp·ollama`, model, altText/aiTags), started/completed. Actions: play, download,
re-moderate, set visibility, delete.

**Destinations & Simulcast** (`GET /destinations?stream_id=&platform=&is_enabled=` — caller-scoped
**(backend: admin list)**): name, stream, platform `youtube·twitch·facebook·cloudflare·rtmp_custom`
(API set; model also has `twitter·linkedin·srs` — hidden), enabled, status
`pending·connecting·live·error·disconnected`, platformStreamId, viewers, retries, lastRetryAt,
error, settings (bitrate 500–20000, resolution, framerate 15–60, auto_start, auto_reconnect,
max_retries 0–10), token expiry. **Create destination** form (`POST /destinations`): platform
segmented control drives the fields (rtmp_custom: rtmp_url + stream_key secret; OAuth
platforms: "Connect" button → `/platforms/:platform/auth-url` → exchange), settings, metadata
hints (YouTube privacy/description, Twitch title/gameId, Facebook pageId required). Actions:
test connection, enable/disable, edit (blocked while live/connecting), delete; simulcast
start/stop/status/health/metrics per stream (owner-only today).

**Workers:** fanout/recording queue depths + DLQ (§12.2 for peek/redrive), `worker:live`,
`worker:live-recording-moderation` liveness, ffmpeg availability (`FFMPEG_ENABLED`, binary
path), Bull `live-recording-moderation` counts.

**Config tab:** persisted sections rendered as typed forms — `limits` (maxLiveRooms,
maxParticipantsPerRoom, maxBitrateKbps, maxResolution `720p·1080p·4K`, maxStreamDurationMin,
maxSimulcastDestinations), `provider` (streamingProvider `srs·cloudflare`, srsRtmpUrl,
srsHlsBase, srsApiUrl), `recording` (recordingEnabled, autoRecord, format `mp4·hls`, quality
`source·1080p·720p`, retentionDays), `roompolicy` (defaultJoinPolicy `open·invite·request`,
whoCanPublish `host·all`, allowGuests, lockable), `moderation` (profanityFilter, autoMuteOnJoin,
requireApproval, bannedWords chips, maxWarnings). Each field shows an **"enforced"** or
**"stored only"** tag per the code. The read-only `live-rooms`/`live-recordings` sections and
the in-memory `live-settings` are **not** rendered (superseded).

**Live:** `/live` namespace `stream-started · stream-ended · stream-deleted · viewer-count-updated
· room-closed` (namespace-wide; handshake is optional-auth — the console connects with its
bearer).

**Enums:** Appendix A.10. **Gaps:** §14 (LIVE-1…LIVE-6).

### 9.11 AT-Protocol bridge (`atproto`)

**Purpose:** the labeler identity and DID document, labels issued and consumed, external
labeler subscriptions, the firehose ingest and its cursor, the URI case map, user DIDs and
proof-of-control, the feed generator, and the moderation queue/DLQ.
**Placement:** Trust & Safety › AT-Protocol. **Gate:** `adminGuard` = service token or
platform-admin **email only** (token roles ignored) **(backend: use shared `requirePlatformAdmin`)**.

**Tabs:** Overview · Labels · Inbound labels · External labelers · Firehose & Queue · Case map ·
User DIDs · Feed generator · DID tools · Config.

**Overview:** `GET /atproto/identity` (DID, method `web·plc·exprsn`, public key multibase,
published, host), `/atproto/stats` (labels total/lastSeq, inbound count, Bull counts,
moderation DLQ depth), `/atproto/health` (enabled, transport), DID document link
(`/.well-known/did.json`), service record (`/atproto/service-record`) with declared label
values and their severity/blur definitions.

**Labels table** (server: `GET /xrpc/com.atproto.label.queryLabels?uriPatterns=*&sources=&limit≤250&cursor=`
— cursor mode; **backend: admin list with `val`, `neg`, `moderation_case_id`, date range**):
seq (pinned), uri (at-uri lookup), cid, val (chips; `!hide`/`!warn` system styling), neg, cts,
exp, src (DID), moderation case (link → §9.9), signed (sig present). Actions: **Apply label**
(`POST /atproto/labels {uri, val (from declared values), cid?, neg?}`), **Negate** (`POST
/labels/negate {uri, reason}` — queued), label history for a URI (filter). Card view shows the
subject URI, the label chips, and the timeline of seq entries.

**Inbound labels** (server: `GET /atproto/inbound-labels?uri=&src=&verified=&limit≤250`):
src (labeler DID → lookup), endpoint, uri, val, neg, cts, verified (badge), srcSeq. Group-by
default: src.

**External labelers** (`GET /atproto/external-labelers`): endpoint, DID, status
`idle·connecting·connected·disconnected`, active, cursor, lastEventAt (staleness), heartbeatAt
(worker liveness), connectAttempts, lastError. Actions: subscribe (`POST {labeler}` DID or wss
URL), unsubscribe / purge (`DELETE ?endpoint=&purge=`), mark trusted (env
`ATPROTO_TRUSTED_LABELERS` — read-only until overridable **(backend)**).

**Firehose & Queue:** transport (`jetstream·subscribeRepos`), URLs, wanted collections, sample
rate, allowlist, backpressure high/low (editable via overrides: `ATPROTO_FIREHOSE_TRANSPORT`,
`ATPROTO_SAMPLE_RATE`, `ATPROTO_BACKPRESSURE_HIGH/LOW`), cursor per transport **(backend:
`firehose_cursor` read + lag endpoint)**, Bull `moderation` counts, DLQ depth with peek/redrive
(§12.2), worker heartbeat.

**Case map** **(backend: read endpoint over `uri_case_map` with `status`, `author_did`,
`moderation_case_id`)**: uri, cid, authorDid (→ DID lookup; shows the UUIDv5 the moderator
uses), moderation case (link), lastLabelSeq, status `pending·moderated·labeled·negated·dlq`,
createdAt. Actions: open case, negate, re-moderate (**backend**).

**User DIDs** (`GET /atproto/users/:userId/dids` by user lookup; **backend: list + reverse
DID→user**): user, didExprsn, didWeb (+ verified, proof `well-known·profile`), didPlc
(+ verified, proof), challenge (+ expiresAt). Actions: link (`PUT`), issue challenge, verify
(`method web|plc`), unlink.

**Feed generator:** `GET /atproto/feed-record` (rkey, uri, record), `describeFeedGenerator`,
skeleton preview (`getFeedSkeleton?feed=&limit=` rendered as posts with hide status).

**DID tools:** the DID lookup dialog (§6.5) inline — resolve any DID
(`/xrpc/com.exprsn.identity.resolveDid`), verify a label signature (`POST /atproto/labels/verify`),
and a **CID inspector** that shows where a CID appears (labels, service record cid, FileVault
IPFS keys) **(backend: cross-module CID search)**.

**Config tab:** the 34-key `ATPROTO_*` inventory grouped as in the setup TUI (enable/transport,
firehose URLs, volume/backpressure, labelers, AI pass, caps, feed, identity/DID method, signing
key ref (never the key), PDS/PLC); overridable keys editable inline, the rest read-only with a
"restart + .env" note; provisioning (`npm run atproto:provision`) documented with a copy button
**(backend: provision/rotate endpoint)**.

**Enums:** Appendix A.11. **Gaps:** §14 (ATP-1…ATP-7).

### 9.12 Plugins (`plugins`)

**Purpose:** the plugin catalog (manifests and versions), installations per scope with their
lifecycle and grants, managed endpoints with breakers, deliveries (audit), and the registry
vocabularies.
**Placement:** Extensibility › Plugins. **Gate:** `requireAdmin` (platform-admin email).
**Flag:** `PLUGINS_ENABLED` (+ `PLUGINS_SCRIPT_ENABLED`) — page header shows both as override
switches; the bus is inert when off.

**Tabs:** Catalog · Installations · Endpoints · Deliveries · Registry · Config.

**Catalog table** (client: `GET /plugins/api/plugins?kind=&status=`). All views; grid shows
name, publisher, kind glyph, version, status.

| Column | Type | Notes |
|---|---|---|
| Plugin (pinned) | link | name + `pluginKey` |
| Kind | enum `declarative·webhook·script·internal` | group-by default |
| Source | enum `builtin·registry·uploaded` | builtin undeletable |
| Status | enum `draft·published·deprecated·disabled` | |
| Latest version | text semver | versions list in detail |
| Events / Applies to / Scopes | chips | from manifest |
| Capabilities | chips (19-value vocabulary) | routesThroughModerator marked |
| Installs | number | |

Actions: **Register** (`lg` wizard: paste/upload manifest → `POST /plugins/validate` shows
schema errors inline → `POST /plugins`), **Manifest editor** (structured: key, name, version,
kind, appliesTo multi-enum (8 surfaces), events multi-enum (8), scopes, capabilities, endpoint
{url, timeoutMs 250–30000, secretRef}, behavior (condition tree + actions builder — the existing
`PluginBehaviorEditor`), script {source ≤ 100k, timeoutMs 50–10000, memoryMb 8–256; banned-token
lint}, configSchema (JSON Schema editor), surfaces[] {type `admin-section·widget·menu-item`, id,
title, path, icon}), version diff (§6.4.3 Diff between `PluginVersion.manifest` rows), disable
(`DELETE /plugins/:key`).

**Installations table** (client: `GET /plugins/api/installations?scopeType=&status=`): plugin,
scope (`platform·organization·group·user` + scopeId lookup), version, status
`installed·enabled·disabled·error`, lifecycleState, grants (chips), config (JSON validated
against `configSchema`, rendered as a form when the schema is simple), installedBy, lastError,
availableEvents. Actions: **Install** (wizard: plugin → scope (org/group/user lookup) → config
form from `configSchema` → capabilities grant subset), transition (`enable·disable·fail·
uninstall` from `availableEvents`), transitions history (`/installations/:id/transitions`).
The state machine is drawn as a small diagram on the detail sheet.

**Endpoints** (`GET /plugins/api/endpoints?installationId=`): name, installation, direction
`outbound·inbound`, method, url / inboundPath, timeoutMs, secretRef, enabled, failureCount,
openedUntil (breaker open badge with countdown). Actions: create/edit (PATCH), reset breaker
(`enabled:true`), delete.

**Deliveries** (server-capped: `GET /plugins/api/deliveries?installationId=&event=&status=&limit≤500`):
time, plugin, installation, event, kind, status `queued·running·completed·failed·skipped`,
matched, attempts, responseCode, correlationId (`pe_`), error, result (inspector). Group-by
default: status.

**Registry:** capabilities (19) with descriptions, events (8) with wired/pending badges, module
surfaces (8), the install state machine, and the condition-tree operator list — the same
vocabularies the builders use.

**Config tab:** `PLUGINS_*` env (attempts, breaker threshold/cooldown, max dispatch depth,
allow private webhooks) — read-only except the two overridable flags.

**Enums:** Appendix A.12. **Gaps:** §14 (PLG-1…PLG-3).

### 9.13 Low-Code (`lowcode`)

**Purpose:** apps, entities (typed fields, state machines, storage modes), records with
saved views, forms (public slugs), lookups, flows (triggers, actions, runs), AI scaffolding,
and export/import bundles.
**Placement:** Extensibility › Low-Code. **Gate:** scope authority — platform admin is a
superuser; org/group admins within scope. **Flag:** `LOWCODE_ENABLED`.

**Tabs:** Apps · Entities · Records · Forms · Lookups · Flows · Runs · Catalog · Config.

**Apps table** (client: `GET /lowcode/api/design/apps?scopeType=&scopeId=`): key, name,
status `draft·published·archived`, scope (`platform·organization·group·user` + id lookup),
capabilities chips, entities/forms/flows counts, createdBy. Actions: create, edit (PATCH:
name, description, status, capabilities — platform admin only), delete (cascade, destructive
confirm), export bundle (download JSON), import bundle (upload → new draft app; warns on
capabilities stripped), AI generate (`kind entity|flow`, prompt ≤ 2000 → draft preview →
apply). Grid view shows app cards with counts; the org switcher filters by scope.

**Entities** (`GET /entities?appId=`): key, name, fields count, state machine present, storage
mode `db·mirror·filevault·export`, records count. **Entity editor** (existing `EntityEditor`
extended): field grid with type `string·text·number·integer·boolean·date·datetime·enum·reference·json·file`,
role `dimension·measure·attribute`, aggregation `sum·avg·count·min·max`, required/unique,
default, min/max, enumValues/enumLookup (lookup picker), refEntity, format, formula (editor
with the function list and live validation), aiPrompt/aiSystem/aiModel; state machine editor
(states, transitions with guard condition tree, `from:'*'`); storage (mode, directoryId via
FileVault lookup). Actions: export records, **truncate** (destructive), delete (cascade).

**Records** — the generic **record explorer**: entity picker → DataTable in server mode using
the record query language (`f.<field>[op]`, `q`, `sort`, `limit≤500`, `offset`) so **all
filtering/sorting/grouping is server-side**; group-by uses `/aggregate` (`groupBy` ≤ 3,
`metrics`). Views: list/grid/card **plus kanban** (`groupByField`) and **calendar**
(`dateField`) as the fourth/fifth renderings for this table only (saved as `LcView`
`grid·kanban·calendar`). Actions: create/edit (form generated from field defs), transition
(`event` picker from the state machine), delete, bulk (`create/update/delete` ≤ 1000), import
CSV (≤ 2000, per-row errors), export (`csv|json` ≤ 10000), saved views (personal or shared).

**Forms** (`GET /forms?appId=`): key, name, entity, public (slug + link `/f/:slug`), sections
count, steps (wizard), settings. **Form layout editor**: sections, field order, `visibleWhen`
condition tree, placeholders/help; publish/unpublish (slug generated server-side); preview
renders the public spec.

**Lookups** (`GET /lookups?appId=`): key, name, source `static·provider` (provider from the
6-provider list with params), values (chip editor with color/order); resolved preview
(`/lookups/:id/resolved`).

**Flows** (`GET /flows?appId=`): key, name, trigger `event·schedule·webhook·manual` (event key /
cron with next-run preview / webhook URL + secret Reveal-once / manual), match (condition tree),
actions (typed builder over the catalog: native `create_record·update_record·transition_record·
export_entity`, module `post_timeline·send_spark·post_nexus·enqueue_job·write_file·http_request·
read_secret·cortex`, plugin `log·audit·notify·flag`; per action `when`, `onError continue|stop`,
`retries 0–3`), enabled, scope. Actions: execute (context JSON; real side effects — warn),
enable/disable, delete. The existing `LowcodeFlowEditor`/`FlowCanvas` are kept with a linear
keyboard-editable list as the alternative.

**Runs** (server-capped: `GET /flows/:id/runs?limit≤100`): time, flow, trigger, status
`success·partial·error·skipped`, steps (timeline: type, status `ok·error·skipped`, ms,
attempts, result/error), triggeredBy, duration. Retention note: 200 per flow.

**Catalog:** `GET /design/catalog` rendered as reference cards (events, actions, trigger types,
capabilities, storage modes, field types/roles/aggregations, lookup providers, aiAssist).

**Config tab:** `LOWCODE_*` env (private HTTP, cache TTLs, cortex/AI timeouts, AI model/enable)
read-only except `LOWCODE_ENABLED`.

**Enums:** Appendix A.13. **Gaps:** §14 (LC-1…LC-2).

### 9.14 Cortex (`cortex`)

**Purpose:** the local-LLM engine — models and backends (llama.cpp router, Ollama), agents
(personas, step chains, runs), tasks, chat/CS sessions and outbox, human reviews, guardrails,
tools, skills, prompt telemetry, and the async moderation workers it serves.
**Placement:** Extensibility › Cortex. **Gate:** registry mutations, reviews, and prompt log
require platform admin; reads any CA holder. **Flag:** `CORTEX_ENABLED` — every `/api/v1`
route 503s when off; the page shows the switch and health only.

**Tabs:** Overview · Models & Backends · Agents · Runs · Tasks · Sessions · Outbox · Reviews ·
Guardrails · Tools · Skills · Prompt log · Moderation workers · Config.

**Overview:** `GET /cortex/health` (enabled, brain/judge models, router up, cache connected,
queue counts), backend breakers (primary/secondaries state `closed·open·half_open`, cooldown)
**(backend: expose `client.health().backends` over HTTP)**, pending reviews, recent runs, tokens
per hour from prompt logs.

**Models & Backends:** `GET /api/v1/models` (id, status `loaded·unloaded·loading`, vision
capable, brain/judge/vision role badges); Ollama tags when enabled; load/unload
(**backend**), pull (dev only). Role assignment shown from `CORTEX_*_MODEL` overrides.

**Agents table** (client: `GET /agents`; grid view shows persona cards): name, description,
status `draft·validated·enabled`, channel `task·chat·cs_chat·cs_email`, model, builtin
(`task·assistant·cs` personas), steps count, lastValidation (ok/problems), runs count. Actions:
**Build from description** (`POST /agents/build`), **Agent editor** (`xl`): spec form
(system_prompt, channel, model picker from router, tools multi-select, skills, guardrails
advisory list, max_iterations 1–50) and the **step-chain editor** (types `prompt·skill·retrieve·
guardrail·moderate·transform·condition·tool_loop` (+ `parallel` saved-not-enabled), `{{var}}`
helper, transform ops, condition ops, nesting ≤ 5, ≤ 50 steps) with a linear/keyboard mode and
a canvas mode; validate → problems list with paths (`steps[2].then[0].skill …`); enable/disable;
smoke run (input, model → advisory run); run (`POST /agents/:n/run {input}` → 202 → poll);
delete (409 for builtin/with runs).

**Runs** (server: `GET /agents/:n/runs?limit≤200&offset` per agent; **backend: cross-agent
list**): id (`run-`), agent, status `queued·running·done·failed`, origin `manual·smoke`,
model, input excerpt, result/withheld marker, guardrail verdict (`warn·escalate·block`),
started/finished, duration, user. Detail: **transcript viewer** (entries `assistant`
(content / tool_calls), `tool`, `guardrail` (scope, action, hits), `system`, `step` (type,
branch, input/output)) as a timeline with collapsible payloads.

**Tasks** (`GET /tasks` fixed 200): id (`task-`), goal excerpt, status, model, tools/skills,
started/finished, user; detail with transcript. Create task (`goal, model, tools, skills`).

**Sessions** (`GET /chat?cursor&limit≤100`, `/cs/chat`): id (`asst-`/`chat-`), channel
`assistant·cs`, user, model, skills, messages count, last message at; detail loads messages
(role `user·assistant` / `customer·agent`, status `sent·blocked_input·blocked_output·
escalated_input·escalated_output·sent_after_review`) with keyset paging.

**Outbox** (`GET /outbox` fixed 200): id (`mail-`), to, subject, status
`sent·pending_review·blocked`, guardrails, user, created; body in detail.

**Reviews** (`GET /reviews` pending, createdAt ASC): **card view default** — kind
`assistant_reply·cs_chat_input·cs_chat_reply·cs_email·agent_step`, session/run link, draft
(rendered), customer message, guardrail hits, created; actions approve/reject with note
(`POST /reviews/:id`); keyboard triage as in §9.9. Live: none today — poll 15s **(backend:
`/_admin` review events)**.

**Guardrails** (client: `GET /guardrails`): name, enabled, action `warn·escalate·block`, scope
chips `input·output·tool_call`, channels, rules count/types (`regex·contains·max_length·
llm_judge`), tests count. Editor: rules builder per type, tests (`{text, expect trigger|pass}`),
**Test** (report passed/failed per case), enable (requires all tests pass), build from policy
text, delete.

**Tools** (client: `GET /tools`): name, kind `http·python`, enabled, params (JSON Schema
properties), timeout 1–120s, tests count. Editor: http request (method, url with `{param}`,
headers, body) or python code (must define `run(`; gated by `CORTEX_PYTHON_TOOLS_ENABLED`),
parameters schema editor, tests (`expect_contains·expect_regex·expect_error`), **Run** with
args, test, enable/disable, delete.

**Skills** (client: `GET /skills`): name, enabled, description, instructions (≤ 8000),
recommended tools; build from description, enable/disable, delete.

**Prompt log** (server: `GET /prompts?channel=&session=&q=&limit≤500&offset`): time, channel
`assistant·cs_chat·cs_email·task·judge·build`, session, model, latency, cached, guardrails,
prompt/response (inspector, JSON), usage tokens. Group-by default: channel.

**Moderation workers:** the four cortex-served queues (`cortex-tasks`, `filevault-image-moderation`,
`filevault-video-moderation`, `live-recording-moderation`) with counts, worker liveness, modes
(`off·shadow·enforce` per pipeline from overrides), thresholds, and links to the side tables in
§9.5/§9.10.

**Config tab:** the 36-key `CORTEX_*` inventory grouped (engine, models, concurrency, vision,
python sandbox, Ollama, breaker, moderation) with overridable `CORTEX_ENABLED` inline.

**Live:** `/cortex` namespace is chat-only; the console does not use it. **Enums:** Appendix
A.14. **Gaps:** §14 (CTX-1…CTX-4).

### 9.15 Jobs and Queues (cross-module)

**Route:** `/admin/jobs`. One view over every queue the platform runs, so operators do not hunt
per module. Sources: timeline `/api/jobs/*` (fanout, trending, indexing, notifications), spark
`/api/queues/*` (5), prefetch `/queue/*` (+ RabbitMQ), moderator `/api/queues/*` buckets
(`modq:<name>`, redis or rabbit) and `moderate-ugc`, atproto Bull `moderation`, cortex
`cortex-tasks`, filevault image/video moderation, live `live-recording-moderation` + RabbitMQ
fanout/recording **(backend: a gateway-owned `GET /platform/api/queues` aggregator that lists
every Bull queue on the shared Redis and every RabbitMQ queue via the management API, with
uniform counts and job listing/retry/remove; today each module differs)**.

**Tabs:** Queues · Jobs · Dead letters · Schedules.

- **Queues table** (client over the aggregator): queue (pinned), module (group-by default),
  backend `bull·rabbitmq`, redis db, waiting, active, completed, failed, delayed, paused,
  consumers, rate limit, DLQ depth; actions pause/resume/clean (grace duration), open jobs.
- **Jobs table** (server per queue: state `waiting·active·completed·failed·delayed`, limit):
  id, name, data (inspector), attempts, failedReason, timestamp/processedOn/finishedOn,
  returnvalue; retry, remove, bulk retry failed.
- **Dead letters:** moderator bucket DLQs, live/prefetch/atproto RabbitMQ `.dlq` queues:
  peek (payload table), redrive (limit), purge (destructive).
- **Schedules:** recurring jobs (timeline `trending-update-recurring` `*/15 * * * *`,
  `trending-cleanup-recurring` `0 3 * * *`; lowcode cron flows; CA token rotation cron when
  enabled) with next-run preview.

Live: counts poll 10s; `/_admin` `health` carries queue summaries when the aggregator lands.

---

## 10. Configuration tab: infrastructure services and settings

**Route group:** `/admin/config/*`. This is where the terminal setup TUI's job moves into the
console: every backing service of the Docker stack, its configuration, and every platform
setting, with the truthful distinction between **what can change at runtime** (overrides store),
**what needs a restart**, and **what is container/environment only**.

### 10.1 Services (`/admin/config/services`)

A **service catalogue** (cards by default, list available) of every element of the underlying
stack. Data comes from `GET /health` (`dependencies`, `docker.containers[]`) plus per-service
probes **(backend: `GET /platform/api/services` that merges the compose definition, container
state, probe results, and the effective env for each service; Docker access is already used by
`checkDocker`)**.

| Service | Container / image | Profile | Card facts | Detail tabs | Actions |
|---|---|---|---|---|---|
| **PostgreSQL** | `exprsn-postgres` / `postgis/postgis:16-3.4` | core | status, latency, version, database `exprsn`, schemas (per module + `platform`), pool min/max, SSL | Overview · Schemas (row/size counts per schema) · Connections (`pg_stat_activity`) · Settings (`DB_*` incl. SSL/CA path, pool, logging) · Drift (`db:check` report **(backend: run `check-drift` on demand and return JSON)**) · Backups (`db:backup`/`db:restore` scripts **(backend)**) | open in Database editor (§11), run drift check, restart container (**backend: docker control, confirm**) |
| **Redis** | `exprsn-redis` / `redis:7-alpine` | core | status, latency, version, memory used, db index, password set?, AOF | Overview · Keyspace (per-db key counts, prefixes: `exprsn:ca:` `exprsn:auth:` `nexus:` `prefetch:` `moderator:` `vault:token:` `rl:` `bull:` `timeline:` `trending:` `notif:`) · Clients · Settings (`REDIS_*`, `REDIS_ENABLED`, `BULL_REDIS_DB`, `MODERATE_UGC_REDIS_DB`, `REDIS_DB_HOT/WARM`) · Pub/Sub (`platform:config:changed`) | open Cache browser (§12.1), flush db (destructive, dev only), restart |
| **OpenSearch** | `exprsn-opensearch` / `opensearchproject/opensearch:2.18.0` | core | cluster status green/yellow/red, nodes, active shards, latency | Overview · Indices (`exprsn_posts`, `exprsn_users`, `spark_messages`: docs, size, health) · Settings (`ELASTICSEARCH_NODE|URL`, auth, `*_ENABLED`, index names) · Dashboards link (`:5601`) | open Search browser (§12.3), reindex (timeline/spark **(backend)**), restart |
| **RabbitMQ** | `exprsn-rabbitmq` / `rabbitmq:3.13-management-alpine` | core | status, version, node, erlang, total messages, mgmt port | Overview · Exchanges (`exprsn.prefetch`, `exprsn.live.fanout`, `exprsn.live.recording`, `exprsn.atproto.moderation`, `modx:*`) · Queues (+ `.dlq`) · Connections/Channels · Settings (`RABBITMQ_*`, `RABBITMQ_ENABLED`, vhost, `PREFETCH_QUEUE_BACKEND`) | open Broker browser (§12.2), management UI link, restart |
| **nginx** (edge) | `exprsn-nginx` / `nginx:1.27-alpine` | core | ports 80/443, cert file + expiry, upstream `host.docker.internal:8443`, SPA build present | Overview · Routes (proxied prefixes, `/srs/`, `/docs/`, `.well-known`, `/socket.io/`) · Headers (CSP/HSTS/Permissions-Policy) · Settings (`NGINX_HTTP_PORT`, `NGINX_HTTPS_PORT`, cert paths) | reload/recreate container (**backend**) |
| **SRS** (RTMP/HLS/WebRTC) | `exprsn-srs` / `ossrs/srs:5` | core | RTMP 1935, API 1985, HTTP 8085→8080, SRS version (`/api/v1/versions`), active streams (`/streams`) | Overview · Streams (from SRS API) · Settings (`SRS_*`, `STREAMING_PROVIDER`; port mismatch warning 8080 vs 8085) | restart |
| **OpenLDAP** | `exprsn-openldap` / `osixia/openldap:1.5.0` | extras | ports 389/636, org, domain, admin password set? | Overview · Settings (`LDAP_ORG`, `LDAP_DOMAIN`, `LDAP_ADMIN_PASSWORD`, `LDAP_PORT`, `LDAPS_PORT`) · Directory link (auth LDAP configs, §9.2) | restart |
| **BIND** (DNS) | `exprsn-bind` / `internetsystemsconsortium/bind9:9.20` | extras | port 53, forwarders, zone `exprsn.local` (missing zone file warning) | Overview · Zones (`named.conf` view) · Settings (`DNS_PORT`) | restart |
| **Kerberos** (KDC) | `exprsn-kerberos` / `gcavalcante8808/krb5-server` | extras | realm, KDC/kadmin ports | Overview · Settings (`KRB5_REALM`, `KRB5_KDC`, `KRB5_ADMIN_PASSWORD`, `KRB_KDC_PORT`, `KRB_KADMIN_PORT`) | restart |
| **Dovecot** (IMAP/POP3) | `exprsn-dovecot` / `dovecot/dovecot:2.4.1` | extras | ports 143/993/110/995, mail user/admin password set?, TLS off | Overview · Settings (`IMAP_PORT`, `IMAPS_PORT`, `POP3_PORT`, `POP3S_PORT`, `MAIL_USER_PASSWORD`, `MAIL_ADMIN_PASSWORD`) · Note: no platform client uses IMAP; outbound mail is SMTP/SendGrid/Mailgun/SES (see Settings › Email) | restart |
| **strongSwan** (IPsec) | `exprsn-strongswan` / `strongx509/strongswan:6.0.6` | extras | host network, `swanctl.conf` connections (empty skeleton) | Overview · Config file view | restart |
| **OpenSearch Dashboards** | `opensearchproject/opensearch-dashboards:2.18.0` | optional | port 5601 | link | restart |
| **Wireshark** | `lscr.io/linuxserver/wireshark` | optional | port 3000, host net | link | restart |
| **Ollama** | `exprsn-ollama` / `ollama/ollama:0.6.8` | cortex | loopback 11434, models pulled, parallel/keep-alive env | Overview · Models (`/api/tags`) · Settings (`OLLAMA_PORT`, `CORTEX_OLLAMA_*`) | pull model (`provision-ollama.sh` **(backend)**), restart |
| **Gateway process** (not a container) | node `exprsn-platform` | — | pid, uptime, node version, memory, load, modules mounted | links to Platform (§7.2) | graceful restart (**backend**, confirm) |
| **Workers** (not containers) | `worker:*` processes | — | liveness per worker | links to Jobs (§9.15) | — |

Card fields: name, image:tag, profile chip, status chip (`up·down·unavailable·not started`),
two key facts, "open" action. List columns add ports, volumes, healthcheck, restart policy.
Docker actions (start/stop/restart/recreate) are **destructive confirms** and are only enabled
when the backend exposes a docker control endpoint with an explicit `DOCKER_CONTROL_ENABLED`
guard **(backend)**; otherwise the card shows the `npm run infra:*` / `docker compose` command
with a copy button.

### 10.2 Settings (`/admin/config/settings`)

The platform settings surface, organized by the **19 sections of the setup TUI** (which are the
established IA for configuration), each rendered as a form whose fields are typed from the TUI
descriptors (`text · port · num · bool · enum · secret`). Each field displays its **source**
(`override · env · default`), whether it is **overridable** (editable inline via
`/platform/api/config`), **restart required**, or **env-only** (shown with a "copy `.env` line"
action and an explanation). Secrets are masked with a "set / not set" chip and a **Generate**
button for the ones the TUI generates.

| # | Section | Key fields (see §2 of the env inventory) |
|---|---|---|
| 1 | HTTPS edge & CORS | `NODE_ENV`, `HOST`, `HTTPS_PORT`, `HTTP_REDIRECT_PORT`, `PUBLIC_HOST`, `CORS_ORIGIN` (list), `TRUST_PROXY`, `PUBLIC_BASE_URL`, `PLATFORM_ORG_SLUG` (overridable, hot) |
| 2 | TLS | `TLS_ENABLED`, `TLS_CERT_PATH`, `TLS_KEY_PATH`, `TLS_CA_PATH` + parsed cert summary |
| 3 | PostgreSQL | `DB_*` (host, port, name, user, password, SSL, reject-unauthorized, CA, pool, logging) — denylisted from overrides |
| 4 | Redis | `REDIS_*` — denylisted |
| 5 | Auth & service secrets | `SERVICE_TOKEN_SECRET` (≥ 32), `SERVICE_ID`, `SERVICE_TOKEN_LEGACY_ALLOW`, `SERVICE_TOKEN`, `JWT_SECRET`, `SESSION_SECRET`, `OIDC_ISSUER`, `TIMELINE_APPROVAL_WEBHOOK_SECRET`, `MODERATOR_WEBHOOK_SECRET`, `HERALD_ENABLED` |
| 6 | Dev auth bypass | `DEV_BYPASS`, `DEV_BYPASS_SECRET` — shown with the four fail-closed conditions; never editable from the console |
| 7 | Observability | `METRICS_ENABLED` (overridable), `METRICS_TOKEN`, `SENTRY_DSN` (overridable), `SENTRY_TRACES_SAMPLE_RATE` |
| 8 | Email | `SMTP_*`, `SENDGRID_API_KEY`, `MAILGUN_API_KEY`, `EMAIL_PROVIDER`, `EMAIL_FROM`; test-send action **(backend)** |
| 9 | OAuth providers | Google / GitHub ids and secrets, callback URLs |
| 10 | AI providers (moderator) | `DEFAULT_AI_PROVIDER` (`claude·openai·cortex`), `CLAUDE_*`, `OPENAI_*`, `DEEPSEEK_*`; note `ANTHROPIC_API_KEY` is not read |
| 11 | FileVault storage | `DEFAULT_STORAGE_BACKEND`, S3 (`S3_*` — note the `AWS_ACCESS_KEY_ID` naming mismatch), disk, IPFS |
| 12 | Elasticsearch | `ELASTICSEARCH_NODE`, username/password, `ELASTICSEARCH_ENABLED` |
| 13 | RabbitMQ | `RABBITMQ_*` |
| 14 | Live streaming | `STREAMING_PROVIDER`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` (note `_STREAM_TOKEN` mismatch), `SRS_*`, `LIVE_RECORDING_*`, `ENCRYPTION_KEY` |
| 15 | AT-Proto / Bluesky | the 34 `ATPROTO_*` keys (5 overridable) |
| 16 | Plugins & low-code | `PLUGINS_*`, `LOWCODE_*` (3 overridable flags) |
| 17 | Cortex | the 36 `CORTEX_*` keys (`CORTEX_ENABLED` overridable) |
| 18 | Image & video moderation | `FILEVAULT_IMAGE_MODERATION` (overridable, hot, enum), `FILEVAULT_IMAGE_RISK_THRESHOLD`, `FILEVAULT_MODERATION_CONCURRENCY` (overridable), `FILEVAULT_VIDEO_*`, `VIDEO_*`, `FFMPEG_PATH`, `FFPROBE_PATH`, `LIVE_RECORDING_*` |
| 19 | Docker extras | `NGINX_*`, `LDAP_*`, `OLLAMA_PORT`, `DNS_PORT`, `KRB5_*`, `KRB_*`, IMAP/POP ports, `TZ` |

Plus a **Module config** section that lists every module's `/api/config/:sectionId` sections
(§9) and whether each is *persisted* (timeline, vault, prefetch, live), *runtime-only* (spark,
moderator-ai), or *log-only façade* (auth, ca, nexus) — the same information each module's
Config tab carries, collected in one place.

Validation mirrors the TUI: placeholders (`change_me`) and short secrets are flagged; the
**Validate configuration** action runs the TUI's checks server-side **(backend)** and reports
per field. An **Export `.env`** action produces the file from the effective values (secrets
included only with a confirm).

### 10.3 Database (`/admin/config/database`)

Entry to the database editor (§11), with the platform Postgres pre-registered as the default
connection (read-only by default) and the per-module schema map.

### 10.4 Environment (`/admin/config/env`)

The raw, searchable inventory of **every** env var the platform reads (from `.env.example`,
`src/config/index.js`, and each module's config), as a DataTable: key (pinned), section,
consumer modules, default, effective value (masked if secret), source, overridable, restart
required, denylisted (reason), documented-but-unread warnings (e.g. `JWT_SECRET` has no
consumer; `ANTHROPIC_API_KEY` unread). Group-by default: section. This table is generated from
a **config manifest** **(backend: `GET /platform/api/config/manifest` built from the TUI
descriptors + module config readers)** so it cannot drift from code.

---

## 11. Database editor: PostgreSQL, MySQL, MongoDB

**Route:** `/admin/config/database` (and `/admin/database/:connectionId/...`). A first-class
database administration surface with table, index, view, sequence, function and stored-
procedure editors, a query console with history and saved queries, and import/export. It is
the platform successor of the legacy `src/exprsn-dbadmin` service (connections, saved queries,
query history, audit logs; PostgreSQL services for tables, functions, triggers, sequences,
tablespaces, roles, JSONLex) and MUST be delivered as a **gateway-owned module** (`/dbadmin`)
**(backend: new module — see §14 DB-1)**.

### 11.1 Connections

Table: name, engine `postgresql·mysql·mongodb`, host, port, database, user, SSL, mode
`read-only·read-write`, status (last test), created by, last used. Actions: add (wizard:
engine → host/port/database/user/password (secret; stored via Vault as a `credential` lease
or encrypted at rest **(backend)**) → SSL → test (`/connections/:id/test`) → mode), edit,
delete, test. The platform's own Postgres (`DB_*`) is pre-registered as **Platform (read-only)**;
switching it to read-write requires a typed confirmation and is audited.

### 11.2 Schema browser

Left tree per connection: `databases › schemas › tables | views | materialized views |
sequences | functions | procedures | triggers | types (enums) | extensions` (Postgres);
`databases › tables | views | routines | triggers | events` (MySQL); `databases › collections |
views | indexes | functions (server-side JS) | users` (MongoDB). Right pane: the selected
object's editor. The tree search filters live; module schemas are labelled with the module
name.

### 11.3 Table editor (SQL engines)

Tabs: **Data · Columns · Indexes · Constraints · Triggers · DDL · Stats**.

- **Data**: the DataTable in server mode over `SELECT … LIMIT/OFFSET` with the full filter /
  sort / group / per-field text filter set translated to SQL (`WHERE`, `ORDER BY`, `GROUP BY`
  with aggregates), inline cell editing (typed by column: enum → select from the DB enum type,
  timestamp → §6.3, json → editor, boolean → tri-state), row insert/delete, multi-row edits
  batched into one transaction with a preview of the statements, and **explain** for the
  generated query. Foreign keys render as lookup links to the referenced table (a `db-row`
  lookup, §6.5).
- **Columns**: name, type (engine type picker), nullable, default, identity/serial, collation,
  comment; add/alter/drop generate DDL shown in the DDL tab before applying.
- **Indexes**: name, method (`btree·hash·gin·gist·brin` / MySQL `BTREE·HASH·FULLTEXT·SPATIAL`),
  columns (ordered, with sort direction and nulls order), unique, partial predicate
  (`WHERE`), include columns, size, scans/reads from stats; create/drop/reindex.
- **Constraints**: PK, FK (referenced table/columns, on update/delete actions), unique, check,
  exclusion; create/drop; validate.
- **Triggers**: name, timing `BEFORE·AFTER·INSTEAD OF`, events, for each `ROW·STATEMENT`,
  function, enabled; create/enable/disable/drop.
- **DDL**: the `CREATE` statement (generated) with copy; **Stats**: row estimate, size, bloat,
  last vacuum/analyze, index usage.

### 11.4 Function and stored-procedure editor

A code editor (Monaco-style, theme-aware, `plpgsql`/`sql`/MySQL/JS syntax) with: signature
builder (name, schema, language `plpgsql·sql·plpython…` / MySQL `SQL`, arguments with modes
`IN·OUT·INOUT·VARIADIC`, return type / `RETURNS TABLE`, volatility `VOLATILE·STABLE·IMMUTABLE`,
security `INVOKER·DEFINER`, cost/rows), the body, **Save** (runs `CREATE OR REPLACE` in a
transaction with rollback on error and a diff against the stored definition), **Run** with an
argument form and a results grid, dependency list, and version history (kept in
`dbadmin.saved_queries`-style storage **(backend)**). Procedures (`CALL`) and MongoDB
server-side functions (`system.js`) use the same shell with engine-specific fields.

### 11.5 Query console

Multi-tab SQL/Mongo shell per connection: editor with schema-aware autocomplete, parameter
placeholders (`:name`), run selection / run all (`Ctrl+Enter`), cancel, **Explain / Explain
Analyze** rendered as a plan tree, results in a DataTable (client mode with all the filter/sort/
group/pin features; export CSV/JSON), row-count and timing, transaction toggle
(auto-commit off → explicit commit/rollback), read-only mode enforced from the connection.
**History** (per user: query, connection, status `success·error·cancelled`, duration, rows,
time) and **Saved queries** (name, tags, shared flag, parameters) — both DataTables. For
MongoDB the console accepts `db.<collection>.find({...})` style and a visual filter builder
producing the query document; aggregation pipelines are edited as a JSON stage list.

### 11.6 MongoDB specifics

Collections: documents grid (JSON cards by default, table view flattening top-level keys),
inline document editing with schema inference (`infer-schema`), indexes (keys with direction /
`text` / `2dsphere` / TTL / unique / partial filter), validators (JSON Schema), views, users/
roles (read-only), server status.

### 11.7 Safety, audit, and access

- Every statement executed through the editor is written to `dbadmin.audit_logs` (user,
  connection, statement, status `success·failure·warning`, rows, duration) and surfaced under
  Operations › Audit.
- Destructive DDL/DML (drop, truncate, delete without `WHERE`, alter type) require a typed
  confirmation and show the affected object name; on the platform connection they additionally
  require read-write mode.
- Statement timeout (default 30s, per-connection setting) and row cap (default 1,000) in the
  console; explicit "fetch more".
- The editor never displays vault secret ciphertext as decrypted; it is just bytes.
- Enum types discovered from the DB feed the same select controls as the enum registry, so
  the editor shows `enum_certificates_status` values as a picker.

---

## 12. Cache, broker, and search browsers

Items stored in Redis, RabbitMQ, and OpenSearch get first-class **lookup dialogs** (§6.5) and
browser pages. All three need a small gateway-owned read/inspect API **(backend: §14 OPS-1…3)**
with platform-admin gating and full audit.

### 12.1 Redis browser (`/admin/cache`)

- **Keys table** (server: `SCAN` by pattern per db, cursor mode): key (pinned), type
  `string·hash·list·set·zset·stream`, TTL (countdown; `-1` shown as "no expiry"), size
  (memory usage), encoding, db. Prefix presets from the platform's known key families (§10.1
  Redis card) as filter chips; group-by prefix (first two segments).
- **Value viewer** (sheet): string (JSON-pretty when parseable, with the platform's typed
  renderers for known shapes, e.g. `prefetch:timeline:*` → posts table, `notif:h:*` →
  notifications), hash (key/value table with per-field filter), list/set (rows), zset
  (member/score table sortable by score — e.g. `trending:groups:global`, `timeline:{userId}`),
  stream (entries). Edit/delete are allowed only for non-Bull, non-session prefixes and are
  audited; TTL set/clear.
- **Lookup dialog** `redis-key`: exact key or glob; returns the key or opens the viewer.
- Pub/Sub monitor for `platform:config:changed` (read-only tail).

### 12.2 RabbitMQ browser (`/admin/broker`)

- **Queues table** (server: management API `/api/queues`): name (pinned), vhost, messages
  ready/unacked/total, consumers, state, durable, dead-letter exchange, policy; the platform's
  queues are annotated with their owning module (`exprsn.prefetch`, `exprsn.live.fanout`,
  `exprsn.live.recording`, `exprsn.atproto.moderation.dlq`, `modq:*`). Exchanges and bindings
  tables alongside.
- **Message peek** (sheet): `GET /api/queues/:vhost/:name/get` with `ackmode:
  ack_requeue_true` (non-destructive), count 1–100; payload rendered JSON with the module's
  typed renderer (live fanout job, recording job, prefetch job, moderator review job);
  properties/headers table; **redrive** from a `.dlq` to its work queue (shared
  `rabbit.redrive`), **purge** (destructive confirm).
- **Lookup dialog** `rabbit-queue`.

### 12.3 OpenSearch browser (`/admin/search`)

- Indices table: name, health, docs, size, shards/replicas; mappings viewer; **search** box
  (query string) with hits as a DataTable and the raw hit JSON in the inspector; reindex/delete
  index (destructive) for the platform's three indices only.

---

## 13. Real-time strategy

- One Socket.IO connection (`lib/realtime.ts`); namespaces attached lazily by the section that
  needs them and released when the last consumer unmounts (existing `useAdminSocket` pattern).
- **`/_admin`** (gateway, admin-gated) is the backbone: `health` every 5s while connected,
  `config:changed`; extend it with `queues` summaries, `reviews:pending`, and per-module
  counters so sidebar badges and the Overview never poll **(backend: emit these from the
  gateway using module facades)**.
- Module namespaces the console subscribes to: `/moderation` (queue and appeal events —
  requires platform-admin email), `/live` (stream/room lifecycle and viewer counts), `/timeline`
  (`new:post`, `post:retracted` on `timeline:global`), `/vault` (`token:event`; only after its
  dev bypass is fixed), `/ca` (`tokens:updated`, `certificates:updated`; only after bearer
  handshake auth is added). `/spark`, `/notifications`, `/cortex` are user-scoped and not used.
- Every table declares `live: { namespace, events, apply }`; the DataTable applies deltas
  without reflowing under the cursor (§6.1.3). Fallback: react-query polling at the interval
  named in each section (10–30s) when the namespace is unavailable; the top-bar chip shows
  `Live · Polling · Off`.
- Handshake: `auth: { token: <bearer> }`; per-namespace auth differences are handled by the
  realtime layer, which surfaces a "not authorized for live updates" chip instead of failing the
  page.

---

## 14. Backend prerequisites register

Everything the console needs that the platform does not expose today, grouped by module. Each
row is a candidate ticket; the parent is TASK-073. Severity: **P0** blocks a whole tab; **P1**
blocks an action; **P2** quality.

| Id | Sev | Need | Notes |
|---|---|---|---|
| **GW-1** | P0 | `GET /auth/api/auth/me` returns `isPlatformAdmin` and the effective per-module admin predicate | §2.2, §7.1 Access card |
| **GW-2** | P0 | `GET /platform/api/services` — merged compose definition + container state + probes + effective env per service | §10.1 |
| **GW-3** | P0 | `GET /platform/api/queues` aggregator over all Bull queues (shared Redis) + RabbitMQ queues, with uniform stats/jobs/retry/remove/pause/resume/clean | §9.15 |
| **GW-4** | P1 | `/_admin` emits `queues`, `reviews:pending`, per-module counters; `health` carries queue summaries | §13 |
| **GW-5** | P1 | `GET /platform/api/config/manifest` (every env var with section, consumers, default, overridable, restart, denylist reason) and `POST /platform/api/config/validate` | §10.2, §10.4 |
| **GW-6** | P1 | Worker heartbeat registry (`platform:worker:<name>` on Redis, TTL) + `GET /platform/api/workers` | §7.2 |
| **GW-7** | P2 | Docker control endpoint (`start/stop/restart/recreate`) behind `DOCKER_CONTROL_ENABLED`, audited; gateway graceful restart | §10.1 |
| **GW-8** | P2 | `/health` includes served TLS cert subject/notAfter; cert expiry alert | §7.2 |
| **GW-9** | P2 | Server-side saved views per user (`platform.admin_views`) | §6.1.3 |
| **GW-10** | P1 | Unify the two error envelopes (`internal_error` vs `INTERNAL_ERROR`) or document both for `ApiError` | §4.5 shared |
| **OPS-1** | P0 | Redis browser API (`SCAN`, `TYPE`, `TTL`, `MEMORY USAGE`, typed `GET/HGETALL/LRANGE/SMEMBERS/ZRANGE/XRANGE`, guarded `DEL/EXPIRE/SET`), audited | §12.1 |
| **OPS-2** | P0 | RabbitMQ proxy (management `/api/queues`, `/exchanges`, `/bindings`, non-destructive `get`, redrive via shared `rabbit.redrive`, purge) | §12.2 |
| **OPS-3** | P1 | OpenSearch proxy (indices, mappings, search, reindex triggers) | §12.3 |
| **OPS-4** | P1 | Cross-module audit feed endpoint (CA activity + nexus admin audit + vault audit + config changes + dbadmin audit) with module/actor/date filters | §7.1, §8.2 |
| **DB-1** | P0 | New gateway module `dbadmin` (`/dbadmin`, schema `dbadmin`): connections (secrets via vault), schema browser, table/column/index/constraint/trigger DDL, functions/procedures, query console with history/saved queries/audit, explain, import/export; engines `postgresql` (pg), `mysql` (mysql2), `mongodb` (driver); port from `src/exprsn-dbadmin` services (`TableService`, `FunctionService`, `TriggerService`, `SequenceService`, `RoleService`, `TablespaceService`, `JSONLexService`) | §11 |
| **DB-2** | P1 | `db:check` drift report on demand (`POST /dbadmin/api/drift`) and coverage for `platform`, `plugins`, `lowcode`, `cortex` schemas | §10.1 |
| **DB-3** | P2 | `db:backup` / `db:restore` triggers with job status | §10.1 |
| **CA-1** | P0 | `/ca` socket namespace: honor `auth.token` bearer + platform-admin gate (wire `middleware/socketAuth.js`) | §9.1 Live |
| **CA-2** | P1 | Fix `GET /ca/admin/api/timeseries/:type` (MySQL `DATE_FORMAT` → `date_trunc`) and `GET /ca/admin/api/crl/status` (`revokedCertificates` read) | §9.1 Overview |
| **CA-3** | P1 | `search` param (CN/serial/fingerprint) and hard max `limit` on `/ca/admin/api/certificates|tokens|activity` | §6.5, §9.1 |
| **CA-4** | P1 | Tickets admin list/validate/revoke; ticket `type` enum reconciled between validator and model | §9.1 Tickets |
| **CA-5** | P1 | `POST /ca/admin/api/audit/verify` exposing `AuditLog.verifyChain`; activity filters (`action`, `status`, `severity`, `requestId`, date range) | §9.1 Audit |
| **CA-6** | P2 | ACME admin lists (accounts/orders/authorizations/challenges) | §9.1 ACME |
| **CA-7** | P2 | CA groups/roles CRUD + RateLimit rule CRUD (`ca.rate_limits`) | §9.1 Directory |
| **CA-8** | P2 | Add CA/OCSP/CRL/ACME settings to the overrides descriptor | §9.1 Config |
| **AUTH-1** | P0 | Admin organizations list-all with `search`, `status`, `plan`, `type`, pagination; org ↔ nexus group link persisted on `organizations` | §8.1, §8.2 |
| **AUTH-2** | P1 | Admin user update (status/profile), unlock (`loginAttempts/lockedUntil`), reset MFA, force password reset | §9.2 Users |
| **AUTH-3** | P1 | Admin sessions list/revoke (`auth.sessions`) | §9.2 Sessions |
| **AUTH-4** | P1 | Mount `src/routes/ldap.js` with `requireAdminAfterCA`; SAML/OAuth provider status endpoint | §9.2 Directory |
| **AUTH-5** | P1 | Provisioning runs list (`GET /auth/api/organizations/:id/provisioning`) | §8.2 |
| **AUTH-6** | P2 | Admin list/revoke for `oauth2_clients` / `oauth2_tokens`; invitation resend | §9.2 Applications |
| **AUTH-7** | P2 | Nexus `requireAdmin` honors `isPlatformAdmin(email)` (or auth mints the `admin` role for allowlisted emails consistently) | §9.4 |
| **AUTH-8** | P2 | Replace the four log-only `auth-*` config façades with a persisted `auth_config` or remove them | §9.2 |
| **AUTH-9** | P2 | `/auth/api/users` exposes `orgCount`, `mfaEnabled`, providers in list rows | §9.2 Users |
| **SPARK-1** | P0 | Admin conversations list (`type`, `groupId`, `channelKind`, `active`, `search`, pagination) + participants | §9.3 |
| **SPARK-2** | P0 | Admin message-moderation list over `message_moderation` (metadata only; never encrypted content) + re-moderate/redact admin route | §9.3 |
| **SPARK-3** | P1 | Admin encryption-key list/deactivate; admin attachments list | §9.3 |
| **SPARK-4** | P1 | Persist `messaging-*` config (`spark_config`) and wire `SPARK_TEXT_MODERATION` into overrides | §9.3 Config |
| **SPARK-5** | P2 | Fix `presence:update` (class vs instance) and the inert public-key cache | §9.3 |
| **NEXUS-1** | P1 | Cross-group lists: join requests, invites, flags, cases; categories CRUD; group roles CRUD | §9.4 |
| **NEXUS-2** | P1 | Whitelist `sortBy`/`sortOrder` on `GET /groups`; slug lookup route | §9.4, §6.5 |
| **NEXUS-3** | P1 | Membership status transitions (suspend/ban/reinstate) as routes | §9.4 |
| **NEXUS-4** | P2 | Persist `nexus-*` config (`nexus_config`); cache-flush endpoint for `group:*` keys | §9.4 |
| **NEXUS-5** | P2 | Admin recommendations-by-user; trending scheduler (recurring job) | §9.4 |
| **NEXUS-6** | P2 | Reconcile migration ENUM drift (memberships `banned`, events `postponed`, proposals, invites, flags, subgroup visibility) | Appendix A.4 |
| **NEXUS-7** | P2 | `HERALD_URL` vs `HERALD_SERVICE_URL` and legacy static `SERVICE_TOKEN` for moderator escalation | §9.4 |
| **FV-1** | P0 | Admin cross-user files list with filters (owner, group, mimetype, visibility, deleted, moderation, hash, backend, `q`) + directories | §9.5 |
| **FV-2** | P0 | Admin `file_moderation` list, re-queue, approve/reject override | §9.5 Moderation |
| **FV-3** | P1 | Admin share-links list; admin set visibility/purge | §9.5 |
| **FV-4** | P1 | Fix `POST /admin/migrate` (`File→blob` association) or drop it; `queueStats()` over HTTP | §9.5 |
| **FV-5** | P1 | Quotas `offset` + user search; `GET /storage/quota` reads `storage_quotas` | §9.5 Quotas |
| **FV-6** | P2 | Search by storage key / content hash (CID lookup) | §6.5 `cid` |
| **FV-7** | P2 | `S3_ACCESS_KEY/SECRET_KEY` vs `AWS_*` naming; `ENABLE_DEDUPLICATION` dual default | §10.2 |
| **VAULT-1** | P0 | Fix `aiPolicyService` `createdAt` → `timestamp` (access report, suggest, anomalies) and audit `$gte/$lte` date filters | §9.6 |
| **VAULT-2** | P0 | `/vault` socket: enforce CA validation outside production; emit `policy:event`, `security:alert`, `stats:update` | §9.6 Live |
| **VAULT-3** | P1 | Pagination on `/admin/policies`; `sort` params; policy update route exists — expose detail includes uniformly | §9.6 |
| **VAULT-4** | P2 | `VAULT_MASTER_KEY` in `.env.example`/TUI; consume `vault_config` at runtime or label as inert | §9.6 Config |
| **TL-1** | P0 | Admin posts list with filters and cursor; admin delete | §9.7 Posts |
| **TL-2** | P0 | Admin `post_moderation` list + re-moderate | §9.7 Moderation |
| **TL-3** | P1 | Admin lists (lists, list members), attachments admin list | §9.7 |
| **TL-4** | P1 | Admin triggers: `trending-update`, `bulk-reindex` | §9.7 |
| **TL-5** | P1 | Verdict-callback auth mismatch (moderator sends Bearer; timeline expects service HMAC) | §9.9 |
| **TL-6** | P2 | Bluesky column casing drift (migration snake_case vs model camelCase) | Appendix B |
| **PF-1** | P1 | Gate `/queue/failed` and `/queue/retry` to admin; add pause/resume/clean routes | §9.8 |
| **PF-2** | P2 | Reconcile `hotCacheTTL` seconds (config section) vs ms (runtime); make sections consumed or label inert | §9.8 Config |
| **PF-3** | P2 | Prefetch metrics by date range (not single day) | §9.8 |
| **MOD-1** | P0 | Paginated `moderation_items` list with filters; `user_actions` list/revoke; claim/assign routes for queue and reports | §9.9 |
| **MOD-2** | P1 | `agent_executions`, `email_templates`, `email_logs`, `rate_limit_violations` list routes; `moderator_config` key browser | §9.9 |
| **MOD-3** | P1 | Persist `moderation-ai` and make the provider factory read it (or remove the section) | §9.9 Config |
| **MOD-4** | P1 | `/moderation` socket: accept token roles as well as the email allowlist; add `report:new` | §9.9 Live |
| **MOD-5** | P2 | `moderation-queue` section reads non-existent columns — remove | §9.9 |
| **MOD-6** | P2 | `ModerationRule.appliesTo` and worker `VALID_CONTENT_TYPES` add `llm_message` | Appendix A.9 |
| **MOD-7** | P2 | `heraldClient` sub-paths (`/send|/broadcast|/batch`) do not exist on the ingest route | §9.9 |
| **MOD-8** | P2 | Schema-only objects (`moderator_performance`, `ai_provider_config`, views) — model them or drop | Appendix A.9 |
| **MOD-9** | P2 | `.env.example` `ANTHROPIC_API_KEY` vs code `CLAUDE_API_KEY` | §10.2 |
| **LIVE-1** | P0 | Platform-admin override on stream/room/simulcast lifecycle routes | §9.10 |
| **LIVE-2** | P0 | Admin recordings list with moderation join; admin destinations list; admin streams search + `groupId` filter | §9.10 |
| **LIVE-3** | P1 | Stream key reveal/rotate (admin, audited) | §9.10 Streams |
| **LIVE-4** | P1 | Remove `live-rooms`/`live-recordings`/`live-settings` sections (broken/duplicated) | §9.10 Config |
| **LIVE-5** | P2 | `CLOUDFLARE_STREAM_TOKEN` vs `CLOUDFLARE_API_TOKEN`; SRS 8080/8085; `SRS_HTTPS_PORT` collision | §10.2 |
| **LIVE-6** | P2 | `Event`/`TimelineSegment`/`ModerationAction` models have no routes — wire or remove | §9.10 |
| **ATP-1** | P0 | `adminGuard` → shared `requirePlatformAdmin` (roles honored) | §9.11 |
| **ATP-2** | P0 | Admin labels list (filters: `val`, `neg`, `moderation_case_id`, date), `uri_case_map` read/re-moderate, `firehose_cursor` + lag, user DIDs list + reverse DID→user | §9.11 |
| **ATP-3** | P1 | Provision/rotate identity endpoint (currently CLI only) | §9.11 Config |
| **ATP-4** | P1 | Cross-module CID search (labels, service record, FileVault IPFS keys) | §6.5 `cid` |
| **ATP-5** | P2 | `ATPROTO_DID_METHOD` default (code `web` vs example `exprsn`); `ATPROTO_LABEL_VALUES` omits `negative-sentiment` | §10.2 |
| **ATP-6** | P2 | Rate-limit the open `POST /atproto/labels/verify` and `GET /users/:id/dids` | §9.11 |
| **ATP-7** | P2 | Lexicon JSON and `web/src/api/admin/atproto.ts` say ops GETs are unauthenticated — update | §9.11 |
| **PLG-1** | P1 | Pagination/offset on `/api/deliveries`; `worker:plugins` for webhook delivery | §9.12 |
| **PLG-2** | P2 | Flag-off behavior: routes still answer (docs say 404/503) — decide and align | §9.12 |
| **PLG-3** | P2 | Organization scope enforcement beyond "platform admin acting on an org" | §9.12 |
| **LC-1** | P1 | Cross-app flow-runs list; `worker` for schedule flows outside the gateway | §9.13 Runs |
| **LC-2** | P2 | Planned `/lowcode/:app` socket namespace for live record views | §9.13 |
| **CTX-1** | P1 | Expose backend/breaker health over HTTP; cross-agent runs list; model load/unload routes | §9.14 |
| **CTX-2** | P1 | `/_admin` review events (pending count, new review) | §9.14 Reviews |
| **CTX-3** | P2 | `api/admin/cortex.ts` `ReviewKind` lacks `agent_step`; migration 20260729000002 required | §9.14 |
| **CTX-4** | P2 | Per-backend risk thresholds (`…_RISK_THRESHOLD_OLLAMA`, ADR-0005 §8.2) | §9.14 |

---

## 15. Appendices

### A. Enum registry by module

Values are verbatim from the model definitions (sync path). Where a Joi/route validator
narrows the set, the narrower set is what the form offers (noted).

#### A.1 CA

| Field | Values |
|---|---|
| `users.status` | active, inactive, suspended, pending |
| `profiles.type` | personal, business, developer, service |
| `groups.type` | distribution_list, organizational_unit, team, department |
| `groups.status` / `roles.status` / `role_sets.status` | active, inactive, archived (groups); active, inactive, deprecated (roles, role_sets) |
| `UserGroups.role` | member, admin, owner |
| `certificates.type` | root, intermediate, entity, san, code_signing, client, server (admin issue: entity, san, code_signing, client, server; `root` when none active) |
| `certificates.status` | active, revoked, expired, suspended |
| `certificates.revocation_reason` / `revocation_lists.reason` | unspecified, keyCompromise, caCompromise, affiliationChanged, superseded, cessationOfOperation, certificateHold, removeFromCRL, privilegeWithdrawn, aaCompromise |
| `certificates.key_size` / `algorithm` | 2048, 4096, 8192 / RSA-SHA256, RSA-SHA384, RSA-SHA512 |
| `tokens.resource_type` | url, did, cid |
| `tokens.expiry_type` | time, use, persistent |
| `tokens.status` | active, revoked, expired, exhausted |
| `tokens` permissions | read, write, append, delete, update (booleans); bounds `maxUses` 1–1,000,000, `expirySeconds` 1–315,360,000, `resourceValue` ≤ 1000 |
| `tickets.type` | login, passwordReset, emailVerification, apiAccess, download (model); validator (unused by the live route) lists login, password_reset, email_verification, mfa, api_access |
| `tickets.status` | active, used, expired, revoked |
| `audit_logs.status` / `severity` | success, failure, error / info, warning, error, critical |
| `rate_limits.target_type` | user, group, global |
| `acme_accounts.status` | valid, deactivated, revoked |
| `acme_orders.status` | pending, ready, processing, valid, invalid |
| `acme_authorizations.status` | pending, valid, invalid, deactivated, expired, revoked |
| `acme_challenges.type` / `status` | http-01, dns-01 / pending, processing, valid, invalid |
| `roles.permission_flags` bits | READ 1, WRITE 2, APPEND 4, SHARE 8, DELETE 16, MODERATE 32, LINK 64 |

#### A.2 Auth

| Field | Values |
|---|---|
| `users.status` | active, inactive, suspended |
| `organizations.type` / `plan` / `status` | enterprise, team, personal / free, starter, professional, enterprise / active, suspended, deleted |
| `organization_members.role` / `status` | owner, admin, member, guest / active, inactive, invited, suspended |
| `groups.type` / `roles.type` | system, organization, custom |
| `user_groups.role` | member, admin, owner |
| `permissions.scope` | system, organization, application, service |
| `user_roles.scope` / `status` | global, organization, application / active, expired, revoked |
| `auth_group_roles.scope` / `status` | global, organization, application / active, revoked |
| `applications.type` / `clientType` / `status` | web, native, spa, service, m2m / confidential, public / active, inactive, revoked |
| `applications.grantTypes` | authorization_code, implicit, password, client_credentials, refresh_token |
| `oauth2_clients.type` / `status` | confidential, public / active, inactive, revoked |
| `oauth2_authorization_codes.codeChallengeMethod` | plain, S256 |
| `ldap_configs.status` / `lastSyncStatus` | active, disabled, error, testing / success, partial, failed, never |
| `provisioning_runs.kind` / `status` | org, member / in_progress, completed, failed, compensation_failed |
| `invitations.kind` / `status` / `role` | invite, activation / pending, accepted, revoked, expired / owner, admin, member, guest |
| `Organization.settings.mfa.allowedMethods` | totp, backup_codes (implemented); sms, email, webauthn (scaffolding) |
| bounds | `ldap.port` 1–65535, `syncInterval` ≥ 60000, `timeout` 1000–60000, `poolSize` 1–20; user list `limit` ≤ 200; import ≤ 2000 rows / 8 MB; groups import ≤ 500 |

#### A.3 Spark

| Field | Values |
|---|---|
| `conversations.type` / `channelKind` | direct, group / chat, announcement |
| `participants.role` | owner, admin, member |
| `messages.contentType` | text, image, video, file, audio |
| `attachments.status` | pending, processing, ready, failed |
| `encryption_keys.keyType` | rsa-4096 |
| `message_moderation.status` / `reason` | pending, approved, rejected, skipped, failed / feature_disabled, encrypted, no_text, clean, flagged, no_ai_provider, error, invalid_content_type |
| presence status | online, away, busy, offline |
| queue names | notification, indexing, file-processing, delivery-tracking, cleanup |

#### A.4 Nexus

| Field | Values |
|---|---|
| `groups.visibility` / `join_mode` / `governance_model` | public, private, unlisted / open, request, invite / centralized, decentralized, dao, consensus |
| `group_memberships.role` (free string; picker) / `status` | owner, admin, moderator, member / active, suspended, banned, left |
| `group_roles.permissions` keys | manageGroup, manageMembers, manageRoles, manageEvents, manageContent, createProposals, vote, post, comment, invite, moderate |
| `join_requests.status` | pending, approved, rejected, cancelled |
| `group_invites.status` | pending, accepted, declined, expired |
| `events.event_type` / `visibility` / `status` | in-person, virtual, hybrid / public, members-only, invite-only / draft, published, cancelled, completed |
| `event_attendees.rsvp_status` / `check_in_status` | going, maybe, not-going, waitlist (route accepts going, maybe, not-going) / pending, checked-in, no-show |
| `proposals.proposal_type` / `voting_method` / `status` | rule-change, role-change, member-action, general, other / simple-majority, supermajority, unanimous, weighted / draft, active, passed, rejected, cancelled, expired |
| `proposal_votes.vote` | yes, no, abstain |
| `group_content_flags.content_type` / `flag_reason` / `status` / `priority` / `action` | post, comment, event, member, message, other / spam, harassment, hate-speech, violence, misinformation, nsfw, off-topic, inappropriate, copyright, other / pending, under-review, resolved, dismissed, escalated / low, medium, high, critical / none, warning, content-removed, member-suspended, member-banned, escalated |
| `group_moderation_cases.case_type` / `subject_type` / `severity` / `status` | content-flag, member-report, automatic, admin-review, appeal / member, content, event, group-settings / low, medium, high, critical / open, under-review, pending-action, resolved, closed, appealed |
| case action types | remove-content, warn-user, suspend-user, ban-user, dismiss |
| `subgroups.type` / `visibility` | channel, subgroup / public, members, restricted |
| `subgroup_memberships.role` / `status` | moderator, member / active, removed, banned |
| `admin_audit.target_type` | config, event, flag, group, member, subgroup |
| reminder presets | ONE_WEEK, THREE_DAYS, ONE_DAY, SIX_HOURS, ONE_HOUR, THIRTY_MINUTES |
| bounds | name 2–255, description ≤ 5000, tag ≤ 50, url ≤ 500, maxMembers ≥ 1, lat/lng ranges, quorum 1–100, guestCount 0–10, voting duration 1h–30d, list `limit` ≤ 100, audit `limit` ≤ 200 |

#### A.5 FileVault

| Field | Values |
|---|---|
| `files.owner_type` / `directories.owner_type` | user, group |
| `files.storage_backend` / `file_blobs` / `thumbnails` | disk, s3, ipfs |
| `files.visibility` | private, shared, public |
| `share_links.share_type` | link, direct (+ `file-access` CA tokens without rows) |
| `thumbnails.size` | small, medium, large |
| `file_moderation.status` / `reason` | pending, approved, rejected, failed, skipped / feature_disabled, not_an_image, encrypted, clean, flagged, shadow_pending, shadow_flagged, unsupported_image, error |
| moderation modes | off, shadow, enforce |
| bounds | quota default 10 GiB; `MAX_VERSIONS_PER_FILE` 100; risk thresholds 0–100 |

#### A.6 Vault

| Field | Values |
|---|---|
| `encryption_keys.purpose` / `status` | general, transit, signing / active, rotating, deprecated, revoked |
| `secrets.status` | active, deprecated, deleted |
| `leases.secret_type` / `status` | database, api_key, credential / active, expired, revoked |
| dynamic `databaseType` | postgresql, mysql, mongodb |
| `vault_tokens.entity_type` / `status` | user, group, organization, service, certificate / active, revoked, expired, suspended |
| `access_policies.policy_type` / `enforcement_mode` / `status` | secret, key, credential, global / enforcing, permissive, audit / active, draft, deprecated |
| `token_bindings.status` | active, inactive |
| `secret_group_access.permission` | read, write, manage |
| `audit_logs.action` / `resource_type` | create, read, update, delete, rotate, generate, renew, revoke, reveal, share, token_create, token_revoke / secret, key, lease, dynamic_secret, group_secret, vault_token, vault |
| anomaly types | unusual_access_time, rapid_requests, new_ip_address, permission_escalation |
| config selects | algorithm AES-256-GCM, AES-256-CBC, ChaCha20-Poly1305; keyDerivation PBKDF2, scrypt, argon2; logLevel minimal, standard, detailed; complianceMode none, pci-dss, hipaa, soc2 |
| bounds | `maxUses` ≥ 1, `riskScore` 0–1, `priority` 1–1000, lease `ttl` 60–86400, `maxTTL` 60–604800, api-key prefix 1–10, audit `limit` ≤ 1000 |

#### A.7 Timeline

| Field | Values |
|---|---|
| `posts.contentType` / `visibility` | text, image, video, link / public, followers, private |
| `user_relationships.type` | block, mute |
| `lists.visibility` | public, private |
| `trending.topic_type` | hashtag, keyword, user |
| `attachments.status` / `virus_scan_status` / `upload_source` | pending, active, processing, failed, deleted, quarantined / pending, clean, infected, error / web, mobile, api, import, sync, automation |
| `post_moderation.status` / `reason` / `action` | pending, approved, rejected, failed, skipped / feature_disabled, clean, flagged, no_ai_provider, invalid_content_type, error / reject, remove, hide, flag, approve |
| `metadata.approval.status` / `mechanism` | pending, approved, rejected / manual, lowcode_workflow, lowcode_app, webhook |
| `metadata.moderationStatus` | flagged, approved |
| config `moderationProvider` | exprsn, external, both |
| queues / job states | fanout, trending, indexing, notifications / waiting, active, completed, failed, delayed |
| bounds | `MAX_POST_LENGTH` 4000; feeds `limit` ≤ 100; approvals `limit` ≤ 200 |

#### A.8 Prefetch

| Field | Values |
|---|---|
| priority / tier / backend | high, medium, low / hot, warm / redis, rabbitmq |
| `evictionPolicy` | LRU, LFU, FIFO |
| config sections | prefetch (alias), prefetch-settings, prefetch-cache, prefetch-performance |

#### A.9 Moderator

| Type | Values |
|---|---|
| `content_type` | text, image, video, audio, post, comment, message, profile, file, llm_message |
| `moderation_status` | pending, approved, rejected, flagged, reviewing, appealed, escalated |
| `risk_level` (0–30 / 31–50 / 51–75 / 76–90 / 91–100) | safe, low, medium, high, critical |
| `moderation_action` | auto_approve, approve, reject, hide, remove, warn, flag, escalate, require_review |
| `report_status` / `report_reason` | open, investigating, resolved, dismissed, escalated / spam, harassment, hate_speech, violence, nsfw, misinformation, copyright, personal_info, other |
| `ai_provider` | claude, openai, deepseek, local, cortex |
| `user_action_type` | warn, suspend, ban, restrict, unsuspend, unban |
| `appeal_status` / review decision | pending, reviewing, approved, denied / approve, deny |
| `ai_agent_type` / `ai_agent_status` | text_moderation, image_moderation, video_moderation, spam_detection, rate_limit_detection, hate_speech_detection, nsfw_detection, violence_detection, custom / active, inactive, testing, error |
| `execution_status` | success, failure, partial, skipped |
| `template_type` | content_approved, content_rejected, content_flagged, content_removed, user_warned, user_suspended, user_banned, appeal_received, appeal_approved, appeal_denied, report_received, report_resolved, review_assigned, custom |
| `email_status` | sent, failed, queued, bounced |
| `config_category` | general, thresholds, email, ai_providers, workflows, queues (model only), rate_limiting, notifications, advanced |
| `violation_severity` | low, medium, high, critical |
| workflow execution status / triggers / step types | queued, running, completed, failed / manual, content_submitted / condition, parallel, analyze, apply_rules, set_action, route_queue, notify, label |
| rule condition leaves | min_risk_score, max_risk_score, keywords, keywords_list, keyword_match (any/all), regex, regex_flags, did_method, min_length, max_length; groups all/any/none |
| queue bucket priority / backend / backoff / exchangeType | low, normal, high, urgent / redis, rabbitmq / fixed, exponential / direct, topic, fanout |
| wordlist mode | deny, allow |
| metrics period | today, week, month, all |
| bounds | scores 0–100; review priority 0–100; DLQ view `limit` ≤ 200, redrive ≤ 1000; reports `limit` ≤ 200 |

#### A.10 Live

| Field | Values |
|---|---|
| `streams.status` / `visibility` | pending, live, ended, error / public, unlisted, private |
| `rooms.status` | waiting, active, ended |
| `rooms.settings.joinPolicy` | open, invite, request |
| `participants.status` / `role` | connected, disconnected, reconnecting / host, moderator, participant, viewer |
| `recordings.status` / `visibility` / `format` | processing, ready, failed, deleted / public, unlisted, private / mp4, hls |
| `recording_moderation.status` / `backend` | pending, approved, rejected, failed, skipped / llamacpp, ollama |
| `events.event_type` / `status` / `visibility` (unrouted) | live, pre_recorded, webinar, premiere / scheduled, live, ended, cancelled / public, unlisted, private |
| `stream_destinations.platform` (model) → API subset | youtube, twitch, facebook, twitter, linkedin, srs, rtmp_custom, cloudflare → **youtube, twitch, facebook, cloudflare, rtmp_custom** (OAuth: youtube, twitch, facebook) |
| `stream_destinations.status` | pending, connecting, live, error, disconnected |
| `timeline_segments.segment_type` (unrouted) | intro, main_content, break, qa_session, outro, chapter, advertisement, custom |
| `moderation_actions.action_type` (unrouted) | ban_user, timeout_user, delete_message, block_word, enable_slow_mode, disable_slow_mode, enable_followers_only, disable_followers_only, pin_message, unpin_message, add_moderator, remove_moderator, clear_chat, enable_emote_only, disable_emote_only |
| `room_invites.status` / `room_join_requests.status` / `room_files.kind` | pending, accepted, revoked / pending, approved, denied / vault, ephemeral |
| config selects | maxResolution 720p, 1080p, 4K; streamingProvider srs, cloudflare; quality source, 1080p, 720p; defaultJoinPolicy open, invite, request; whoCanPublish host, all |
| share event types | link_shared, link_opened, watch_started |
| bounds | title 1–255, description ≤ 2000, room max_participants 2–50, password 4–100, displayName ≤ 100, bitrate 500–20000, framerate 15–60, max_retries 0–10, list `limit` ≤ 100 |

#### A.11 AT-Protocol

| Field | Values |
|---|---|
| `labeler_identity.did_method` / `ATPROTO_DID_METHOD` | web, plc, exprsn (code also tolerates key) |
| `uri_case_map.status` | pending, moderated, labeled, negated, dlq |
| `external_labelers.status` | idle, connecting, connected, disconnected |
| `user_dids.*_proof` | well-known, profile |
| `ATPROTO_FIREHOSE_TRANSPORT` | jetstream, subscribeRepos |
| label values | declared `ATPROTO_LABEL_VALUES` (default spam, nsfw, toxic, hate, violence, negative-sentiment, !warn, !hide); system !hide, !warn; auto-action set `ATPROTO_AUTOACTION_VALUES` |
| Bull job names | moderate-atproto, negate-atproto, ingest-label-atproto (+ dlq redrive) |
| bounds | `queryLabels` `limit` ≤ 250; feed skeleton ≤ 100; inbound labels ≤ 250; sample rate 0–1; backpressure high 100–1e6, low 10–1e6 |

#### A.12 Plugins

| Field | Values |
|---|---|
| `plugins.kind` / `source` / `status` | declarative, webhook, script, internal (rejected) / builtin, registry, uploaded / draft, published, deprecated, disabled |
| `plugin_installations.scope_type` / `status` / lifecycle states | platform, organization, group, user / installed, enabled, disabled, error / installed, enabled, disabled, error, uninstalled; events enable, disable, fail, uninstall |
| `plugin_deliveries.kind` / `status` | declarative, webhook, script, internal / queued, running, completed, failed, skipped |
| `plugin_endpoints.direction` | outbound, inbound |
| capabilities (19) | read:timeline.posts, read:spark.messages, read:moderator.content, read:lowcode.records, read:nexus.groups, emit:notifications, emit:audit, emit:moderator.flag, write:timeline.posts, write:spark.messages, write:lowcode.records, write:nexus.posts, write:filevault.files, call:webhook, call:queues.enqueue, call:http.request, call:cortex.complete, read:vault.secrets (+ one reserved) |
| events (8) | timeline.post.created, spark.message.created, moderator.content.flagged, lowcode.record.created, lowcode.record.updated, live.room.created, nexus.group.member.joined, auth.user.registered |
| module surfaces / SPA surface types | timeline, spark, moderator, lowcode, nexus, live, auth, filevault / admin-section, widget, menu-item |
| condition ops | exists, not_exists, equals, not_equals, contains, not_contains, in, not_in, gt, gte, lt, lte, length_gt, length_lt, matches, keywords_any, keywords_all; groups all, any, none |
| declarative actions / notify priority | log, audit, notify, flag (+ webhook) / low, normal, high |
| bounds | endpoint timeoutMs 250–30000; script timeoutMs 50–10000, memoryMb 8–256, source ≤ 100000; deliveries `limit` ≤ 500 |

#### A.13 Low-Code

| Field | Values |
|---|---|
| `lc_apps.status` / scope types | draft, published, archived / platform, organization, group, user |
| field types / roles / aggregations | string, text, number, integer, boolean, date, datetime, enum, reference, json, file / dimension, measure, attribute / sum, avg, count, min, max |
| storage modes | db, mirror, filevault, export |
| `lc_views.view_type` | grid, kanban, calendar |
| flow trigger types / sentinel events | event, schedule, webhook, manual / _schedule, _webhook, _manual |
| flow action types | create_record, update_record, transition_record, export_entity, post_timeline, send_spark, post_nexus, enqueue_job, write_file, http_request, read_secret, cortex, log, audit, notify, flag |
| action `onError` / `lc_flow_runs.status` / step status | continue, stop / success, partial, error, skipped / ok, error, skipped |
| lookup providers | lowcode.entity, platform.users, nexus.groups, moderator.queues, timeline.topics, filevault.files |
| record query ops | eq, ne, gt, gte, lt, lte, like, contains, in, nin |
| AI assist kinds | entity, flow |
| bounds | records `limit` ≤ 500; export ≤ 10000; import ≤ 2000; bulk ≤ 1000; groupBy ≤ 3; runs kept 200/flow, `limit` ≤ 100; formula ≤ 2000 chars; retries 0–3 |

#### A.14 Cortex

| Field | Values |
|---|---|
| `guardrails.action` / scope / channels / rule types | warn, escalate, block / input, output, tool_call / task, chat, cs_chat, cs_email / regex, contains, max_length, llm_judge |
| `tools.kind` / HTTP methods / test expectations | http, python / GET, POST, PUT, PATCH, DELETE, HEAD / expect_contains, expect_regex, expect_error |
| `agents.status` / spec channel | draft, validated, enabled / task, chat, cs_chat, cs_email |
| step types / deferred | prompt, skill, retrieve, guardrail, moderate, transform, condition, tool_loop / parallel |
| transform ops / condition ops / on_fail | trim, lower, upper, slice, json_parse, json_stringify, regex_extract, concat, replace / contains, not_contains, equals, not_equals, matches, empty, not_empty, gt, lt / halt, escalate, continue |
| `agent_runs.status` / `origin` / `tasks.status` | queued, running, done, failed / manual, smoke / queued, running, done, failed |
| `chat_sessions.channel` / message roles / message status | assistant, cs / user, assistant, customer, agent / sent, blocked_input, blocked_output, escalated_input, escalated_output, sent_after_review |
| `outbox.status` / `reviews.kind` / `reviews.status` | sent, pending_review, blocked / assistant_reply, cs_chat_input, cs_chat_reply, cs_email, agent_step / pending, approved, rejected |
| `prompt_logs.channel` | assistant, cs_chat, cs_email, task, judge, build |
| backend roles / drivers / breaker states | brain, judge, vision / llamacpp, ollama / closed, open, half_open |
| model status | loaded, unloaded (others in-flight) |
| error codes | LLM_UNAVAILABLE, VISION_UNAVAILABLE, UNSUPPORTED_IMAGE, UNSUPPORTED_VIDEO, CORTEX_SYNC_CALL_FORBIDDEN, CORTEX_DISABLED, LLM_CANCELLED, FFMPEG_UNAVAILABLE, FFMPEG_NO_FRAMES |
| moderation modes | off, shadow, enforce |
| bounds | max_iterations 1–50; steps ≤ 50/list, depth ≤ 5, 200 executed/run; tool timeout 1–120 s; retrieve top_k 1–50; skill instructions ≤ 8000; runs `limit` ≤ 200; prompts `limit` ≤ 500; chat pages ≤ 100/200 |

#### A.15 Gateway / infra

| Field | Values |
|---|---|
| health status | ok, degraded, unhealthy; dependency up, down; docker up, down, unavailable |
| overrides descriptor `type` / `source` | boolean, int, string, enum / override, env, default |
| compose profiles | core, extras, optional, cortex |
| dbadmin engines / query status / audit status | postgresql, mysql, mongodb / success, error, cancelled / success, failure, warning |

### B. Naming and timestamp conventions by module

| Module | JSON field casing | DB columns | `createdAt`/`updatedAt` | Business timestamps | Soft delete |
|---|---|---|---|---|---|
| ca | camelCase | snake_case | DATE | Certificate/Ticket/CRL/ACME DATE; **Token, PasswordReset epoch-ms** | — |
| auth | camelCase | camelCase (Organization.`ca_group_id`, ProvisioningRun snake) | DATE | **User login/lock/password, Invitation epoch-ms**; rest DATE | paranoid on Organization, Application, LdapConfig |
| spark | camelCase | camelCase (MessageModeration data cols snake) | DATE | DATE | `deleted` flag |
| nexus | camelCase | snake_case | **epoch-ms** (`timestamps:false`) | **epoch-ms everywhere** | `deleted_at` epoch-ms |
| filevault | File/FileVersion/Directory/ShareLink/FileModeration camelCase; FileBlob/Thumbnail/Download/StorageQuota **snake_case** | snake_case | DATE | DATE | `is_deleted` + `deleted_at` |
| vault | camelCase | snake_case | DATE (AuditLog has `timestamp` only) | DATE | paranoid on EncryptionKey, Secret |
| timeline | Post/Comment/Like/Follow/UserRelationship/TimelineConfig/PostModeration camelCase; Repost/Bookmark/List/ListMember/Trending/Attachment **snake_case** | mixed | DATE | DATE | `deleted` flag; Attachment paranoid |
| prefetch | — (Redis) | — | — | — | — |
| moderator | snake_case | snake_case | DATE | **event times epoch-ms** (`submitted_at`, `reviewed_at`, `queued_at`, `performed_at`, `expires_at`, …) | — |
| live | **snake_case** (+ camelCase `formatStream/formatRoom` views) | snake_case | DATE | DATE | — |
| atproto | camelCase | snake_case | DATE | DATE; cursors BIGINT (seq / time_us) | — |
| plugins | camelCase | snake_case | DATE | DATE | — |
| lowcode | camelCase | snake_case | DATE | DATE | — |
| cortex | camelCase | snake_case | DATE | DATE | — |
| gateway (`platform.config_overrides`) | camelCase | snake_case | `updated_at` | — | — |

### C. Identifier formats

| Kind | Format | Lookup provider |
|---|---|---|
| `uuid` | UUID v4 (most PKs) | by table |
| `serial-hex-32` | 32 hex (CA certificate serial) | `certificate` |
| `sha256` | 64 hex (fingerprints, content hashes, key fingerprints, token hashes) | `certificate`, `file`, `cid` |
| `ca-token` | UUID — the bearer itself | `ca-token` (introspect) |
| `ticket-code` | 86-char base64url | — |
| `vt_` / `hvs.` / `lease_` | `vt_<32hex>` / `hvs.<base64url>` (shown once) / `lease_<32hex>` | `vault-token`, `lease` |
| `app_` | `app_<32hex>` OAuth client id | `applications` |
| `did` | `did:plc:<24 base32>`, `did:web:<host%3Aport>`, `did:exprsn:z…`, `did:key:z…` | `did` |
| `at-uri` | `at://<did>/<collection>/<rkey>` | `at-uri` |
| `cid` | `bafy…` / `Qm…` (IPFS / AT-Proto content id) | `cid` |
| `label-seq` | BIGINT cursor | labels table |
| `room-code` | 6 chars `[A-HJ-NP-Z2-9]` | `room` |
| `stream-key` | 64 hex (secret) | — |
| `run-` / `task-` / `asst-` / `chat-` / `mail-` / `rev-` | `<prefix>-<epoch-s>-<6hex>` (cortex) | cortex tabs |
| `pe_` | `pe_<base36 ts>` plugin delivery correlation | deliveries |
| `bull-job` | numeric string, or `prefetch:<userId>:<ts>`, `file:<fileId>`, `recording:<id>`, `atp:<sha256>`, `sourceService:contentType:contentId` | `bull-job` |
| `redis-key` | prefixed strings (see §10.1) | `redis-key` |
| `correlationId` | UUID on every error envelope | Audit search |

### D. Keyboard map

| Context | Keys |
|---|---|
| Global | `⌘/Ctrl+K` command palette · `?` shortcuts help · `g o` Overview · `g p` Platform · `[` `]` collapse/expand sidebar · `Esc` close |
| Tabs | `←/→` move, `Home/End` first/last, `Enter/Space` activate |
| DataTable | `/` focus search · `F` toggle filter row · `G` group-by menu · `C` columns · `V` cycle list/grid/card · `↑/↓` move row · `Enter` open inspector · `Space` select · `Shift+↑/↓` extend selection · `⌘/Ctrl+A` select page · `Shift+F10` row menu · `P` pin column (header focus) · `S` sort (header focus) · `Alt+↑/↓` reorder column (column picker) · `⌘/Ctrl+E` export |
| Group headers | `←` collapse, `→` expand, `*` expand all |
| Date picker | `Alt+↓` open calendar · arrows days · `PgUp/PgDn` months · `Shift+PgUp/PgDn` years · `Home/End` week edges · `T` today · `Enter` select · `Esc` close |
| Dialogs | `Tab` cycle (trapped) · `Esc` cancel · `⌘/Ctrl+Enter` primary (never from a plain text field for destructive actions) |
| Moderation / Reviews triage | `J/K` next/prev · `A` approve · `R` reject · `W` warn · `X` remove · `B` ban · `S` skip · `N` add note |
| Query console | `⌘/Ctrl+Enter` run · `⌘/Ctrl+Shift+Enter` explain · `⌘/Ctrl+S` save query · `⌘/Ctrl+/` comment |

### E. Route index

Console routes and the primary endpoints each depends on (full endpoint tables live in
`API_SURFACE.md`).

| Route | Primary endpoints |
|---|---|
| `/admin` | `GET /health`, `/_admin` socket, `GET /moderator/api/queue`, `/appeals`, `/cortex/api/v1/reviews`, `GW-3` queues, `OPS-4` audit |
| `/admin/platform` | `GET/PUT/DELETE /platform/api/config[/:key]`, `GET /metrics`, module `/health`s, `GW-6` workers |
| `/admin/orgs`, `/admin/orgs/:id` | `/auth/api/organizations*`, `/provision`, `/auth/api/users/invites`, `/auth/api/users/import`, CA groups/tokens by `organizationId`, `AUTH-1`, `AUTH-5` |
| `/admin/ca` | `/ca/admin/api/*`, `/ca/api/tokens/:id/introspect`, `/ca/api/certificates/:id/*`, `/ca/crl/*`, `/ca/ocsp/*`, `/ca` socket |
| `/admin/users` · `/identity-groups` · `/roles` · `/applications` · `/sessions` · `/directory` | `/auth/api/users*`, `/groups*`, `/roles*`, `/applications*`, `/sessions` (`AUTH-3`), `/users/invites`, `/api/ldap/*` (`AUTH-4`), `/saml/*`, `/auth/signup-policy` |
| `/admin/timeline` | `/timeline/api/posts/approvals/*`, `/search/*`, `/jobs/*`, `/config/*`, `/timeline` socket, `TL-1..4` |
| `/admin/filevault` | `/filevault/api/admin/*`, `/files/:id/*`, `/share/*`, `/thumbnails/*`, `FV-1..3` |
| `/admin/prefetch` | `/prefetch/api/prefetch/*`, `/config/*` |
| `/admin/nexus` | `/nexus/api/groups*`, `/events*`, `/governance/*`, `/moderation/*`, `/subgroups*`, `/trending/*`, `/recommendations/*`, `/admin/*`, `/config/*`, `NEXUS-1` |
| `/admin/spark` | `/spark/api/queues/*`, `/config/*`, `SPARK-1..3` |
| `/admin/live` | `/live/api/streams*`, `/rooms*`, `/destinations*`, `/simulcast/*`, `/config/*`, `/api/stats`, `/live` socket, `LIVE-1..3` |
| `/admin/moderator` | `/moderator/api/queue*`, `/reports*`, `/appeals*`, `/rules*`, `/wordlists*`, `/agents*`, `/queues*`, `/workflows*`, `/metrics*`, `/actions*`, `/config/*`, `/moderation` socket, `MOD-1..2` |
| `/admin/atproto` | `/atproto/*`, `/.well-known/*`, `/xrpc/*`, `ATP-2` |
| `/admin/vault` | `/vault/api/admin/*`, `/secrets*`, `/keys*`, `/credentials*`, `/dynamic/*`, `/audit/*`, `/groups/:id/secrets*`, `/config/*`, `/vault` socket |
| `/admin/cortex` | `/cortex/api/v1/*`, `/cortex/health`, `CTX-1` |
| `/admin/lowcode` | `/lowcode/api/design/*`, `/data/*`, `/hooks/*` |
| `/admin/plugins` | `/plugins/api/*` |
| `/admin/jobs` | `GW-3` aggregator (fallback: per-module queue routes) |
| `/admin/cache` · `/broker` · `/search` | `OPS-1`, `OPS-2`, `OPS-3` |
| `/admin/audit` | `OPS-4` |
| `/admin/config/services` · `/settings` · `/database` · `/env` | `GW-2`, `/platform/api/config`, `GW-5`, `DB-1` |
