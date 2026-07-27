# TASK-049 — Accessibility measurement pass (contrast + target size)

Sprint 2026-09 · qa-specialist · 2026-07-27
Worktree: /Volumes/Storage/claude-worktrees/s2609-sr (branch `s2609-sr`), read-only measurement — no product code touched.
Scope: WCAG 1.4.3 (text contrast 4.5:1, large text 3:1), 1.4.11 (non-text 3:1), 2.5.8 (target size ≥24×24 CSS px, AA), both `data-theme` modes.
Follow-up to the 2026-07-20 accessibility review (computed-value criteria not measured then).

## (a) Methodology

**Contrast.** Token values extracted from the two sources of truth:
- `web/src/styles/exprsn-unified.css` — light in `:root` (lines 13–89), dark overrides in `[data-theme="dark"]` (lines 91–98). Note: the dark block overrides ONLY primary/surfaces/text/borders — the semantic tint tokens (`--exprsn-success-bg`, `--exprsn-*-text`, `--exprsn-text-link`, accents) are **not** re-themed and render identically in dark mode.
- `web/src/app/tokens.ts` (TS mirror) + `web/src/app/theme.ts` (`buildTheme` → MUI palette: `contrastText` WHITE for primary/secondary/success/error/info, BLACK for warning; `text.disabled = textMuted`; `divider`/input outline = `border`).

Pairings were enumerated from actual usage: grep of `--exprsn-text-muted` (22 CSS rules), `text.secondary` (309 TSX uses), `text.disabled` (25), colored `<Chip>` (33), `<Alert severity>` (280: 177 error / 67 info / 20 warning / 10 success), `variant="contained"` buttons (188), the legacy `.badge-*`/`.alert-*`/`.stat-icon`/`.tree-badge` dashboard classes, and the one live consumer of the tint classes (`web/src/app/RootLayout.tsx:204` `.system-status`).

Ratios computed with a node script (`scratchpad/contrast.js`) implementing the WCAG relative-luminance formula, with alpha compositing for rgba tokens (`--exprsn-primary-glow`, MUI Switch track opacity) and MUI v5's derived Alert colors (`palette.light = lighten(main,.2)`; standard Alert = `darken(light,.6)` on `lighten(light,.9)` in light mode, inverse in dark). MUI @5.16.7 per `web/package.json`.

**Target size.** Computed rendered hit-target from MUI v5 defaults + theme overrides (theme.ts adds no density/padding overrides): small IconButton = 5px padding + icon (20px `fontSize="small"` / 24px default) = 30×30 or 34×34; small Checkbox = 9px pad + 20px icon = 38×38 (28×28 at `sx={{p:0.5}}`); small Switch root = 40×24; small Chip = 24px tall, its delete icon (the actual clickable element) = 16×16 (22×22 on medium). 2.5.8's spacing exception (24px circle centered on an undersized target must not intersect another target/its circle) applied per site. Occurrence counts via grep.

Caveats: static computation, not a browser render — rounded values from MUI's colorManipulator may differ by ±0.01–0.03 in ratio; no hover states beyond those listed; legacy CSS classes not mounted by the SPA are flagged as such.

## (b) Contrast results

Legend: L = light ratio, D = dark ratio. Requirement 4.5:1 unless marked (non-text 3:1). **Bold = FAIL.**

### Core text tokens (primary reading surfaces)

| Pairing | Where used | L | D | Verdict |
|---|---|---|---|---|
| text-primary on bg-primary/secondary/tertiary/surface | everywhere | 16.4–17.9 | 14.5–19.0 | PASS |
| text-secondary on all four surfaces | 309 TSX uses + CSS | 7.2–7.8 | 10.2–13.4 | PASS |
| text-muted on bg-primary (#fff / #0a0a0a) | captions, labels | 4.74 | 7.85 | PASS |
| text-muted on bg-secondary (page bg) | page-level muted text | 4.54 | 7.11 | PASS (marginal light) |
| **text-muted on bg-tertiary** | `.search-shortcut` (css:226), `.tree-badge` (css:1507), `text.disabled` over gray fills | **4.35** | 6.00 | **FAIL light only** |
| text-muted as MUI `text.disabled` on surfaces | 25 uses, disabled controls | 4.74 | 6.53 | Measured; **1.4.3-exempt** (inactive UI) |
| primary as link/text-button on bg-primary/secondary | links, text buttons | 4.83/4.63 | 5.38/4.87 | PASS |
| **primary text on surface-raised (cards/paper)** | text buttons + links on cards | 4.83 | **4.48** | **FAIL dark only** (marginal) |
| **white on primary (contained button label, 14–15px/600)** | 188 contained buttons | 4.83 | **3.68** | **FAIL dark** (#fff on #3b82f6; not "large text") |

### MUI Chip (label ≈13px → 4.5:1; 33 colored chips, most `size="small"`)

| Pairing | Where used (samples) | L | D | Verdict |
|---|---|---|---|---|
| **Filled success: #fff on #10b981** | PlatformSection, EventsTab, GovernanceDialog | **2.54** | **2.54** | **FAIL both** |
| **Filled error: #fff on #ef4444** | StreamsPage:203 "● LIVE", NotificationsPage:80, EventsTab:272 | **3.76** | **3.76** | **FAIL both** |
| **Filled info: #fff on #3b82f6** | ModeratorSection, PromptLogTab | **3.68** | **3.68** | **FAIL both** |
| Filled warning: #0a0a0a on #f59e0b | PlatformSection:88,211, FileEditor:147 | 9.22 | 9.22 | PASS |
| **Filled primary: #fff on primary** | many | 4.83 | **3.68** | **FAIL dark** |
| Filled secondary: #fff on #7c3aed | — | 5.70 | 5.70 | PASS |
| **Outlined success label/border on paper** | cortex/shared.tsx:62, common.tsx:115 | **2.54 / 2.54(3:1)** | 6.50 | **FAIL light (text + border)** |
| **Outlined warning label/border on paper** | ScopesSection:97, AtprotoSection:411, CaSection:172, RolesTab:101, QueuesTab:100, ModeratorSection:134 | **2.15 / 2.15(3:1)** | 7.67 | **FAIL light (text + border)** |
| **Outlined error label on paper** | cortex/shared.tsx:57 | **3.76** | **4.38** | **FAIL both** (border passes 3:1) |
| **Outlined info label on paper** | ModeratorSection:133, PromptLogTab:124 | **3.68** | **4.48** | **FAIL both** (border passes 3:1) |
| **Outlined primary label on paper** | CalendarTab:149 (10px labels), misc | 4.83 | **4.48** | **FAIL dark** |

### MUI Alert, standard variant (280 uses)

| Pairing | L | D | Verdict |
|---|---|---|---|
| Alert text on tint — all four severities | 8.1–10.1 | 12.6–14.5 | **PASS — measured, passes** (suspect area cleared) |
| Alert icon (main color) on tint, non-text 3:1 — error/info | 3.39/3.36 | 5.1–5.2 | PASS |
| **Alert icon on tint — success/warning (light)** | **2.35 / 2.02** | 7.4/8.7 | **FAIL light** (icon-only; adjacent text passes) |

### Semantic tint pairings (Exprsn CSS classes; theme-invariant — same values in dark)

| Pairing | Where used | Ratio | Verdict |
|---|---|---|---|
| **`.system-status-text`: #10b981 on #d1fae5, 13px/500** | **LIVE: sidebar footer on every page — RootLayout.tsx:204-206 + css:505-531** | **2.24** | **FAIL both themes** |
| **`.badge-success/-warning/-danger/-info`: main color on tint** | css:1296-1314 — currently unused by SPA (grep: 0 TSX refs) | **2.24 / 1.93 / 3.08 / 3.01** | **FAIL (latent)** |
| **`.badge-primary`: primary on rgba(0,102,255,.3) composited** | css:1291 (unused) | **3.10 L / 4.04 D** | **FAIL (latent)** |
| **`.alert-success/-warning/-danger/-info`: main (or warning-hover) on tint** | css:1381-1401 (unused; SPA uses MUI Alert) | **2.24–3.36** | **FAIL (latent)** |
| **`.stat-icon.success/.warning` icon on tint (non-text 3:1)** | css:739-749 (unused) | **2.24 / 1.93** | **FAIL (latent)**; .danger 3.08 passes |
| `--exprsn-*-text` tokens on their tints (#065f46/#d1fae5 etc.) | the tokens the classes SHOULD use | 6.4–7.2 | **PASS — correct fix exists in the token set** |

### Non-text UI (1.4.11, 3:1)

| Pairing | Where used | L | D | Verdict |
|---|---|---|---|---|
| **border-color vs bg-primary/surface** | input outlines (`MuiOutlinedInput.notchedOutline = t.border`, theme.ts:79), card/divider borders | **1.26** | **1.91 / 1.59** | **FAIL both** (input boundary is the component's only visual indicator) |
| **border-color-strong vs bg-primary** | scrollbar thumb (theme.ts:94), strong borders | **2.52** | **2.53** | **FAIL both** (scrollbar = UA-adjacent, low sev) |
| **MUI Switch unchecked track vs surface** | 37 switches | **2.68** | 3.53 | **FAIL light** (MUI default, no override) |
| Focus ring (primary, 2px) vs bg-primary/secondary | MuiButtonBase focusVisible (theme.ts:45) | 4.83/4.63 | 5.38/4.87 | **PASS — measured, passes** |
| status-dot.offline (muted) vs surface | presence dots | 4.74 | 6.53 | PASS |

**Suspect areas from the review that measured FINE:** `--exprsn-text-muted` on bg-primary/bg-secondary (both themes) passes; MUI Alert body text passes comfortably in both themes; focus ring passes; filled warning chips (black text) pass; `text.secondary` passes everywhere. Disabled states measured 4.74 L / 6.53 D — technically exempt under 1.4.3 either way.

## (c) Target size (WCAG 2.5.8, ≥24×24 CSS px)

| Component pattern | Computed hit target | Locations (representative) | Count | Verdict |
|---|---|---|---|---|
| IconButton `size="small"` + `fontSize="small"` icon | 5+20+5 = **30×30** | everywhere incl. DataTable toolbar `features/admin/ui.tsx:390,403` | 169 small IconButtons (145 w/ small icons) | **PASS — measured, passes** (no `p:0` overrides found) |
| IconButton small + default 24px icon | **34×34** | remainder of the 169 | ~24 | PASS |
| DataTable dense toolbar controls | 30×30 buttons, 32px-tall standard TextField | `features/admin/ui.tsx:367-421` | 1 shared component | **PASS** (suspect area cleared) |
| Checkbox `size="small"` | 38×38 default; **28×28** at `sx={{p:0.5}}` | `features/admin/ui.tsx:414` (column picker) | 6 | PASS |
| Switch `size="small"` | 40×**24** | 4 sites | 4 | PASS (exactly at minimum) |
| **Chip delete icon, medium chip with `onClick` + `onDelete`** | **22×22**, spacing exception UNAVAILABLE (24px circle intersects the chip's own click target) | `features/lowcode/EntityEditor.tsx:285-289` (state-machine state chips: click = set initial, delete = remove state) | 1 pattern / N chips | **FAIL** |
| Chip small `onDelete` (chip not clickable) | **16×16**, passes only via spacing exception (nearest other target ≥4px outside the 24px circle) | `features/messages/Composer.tsx:117-121` (attachment remove), `features/rooms/RoomsPage.tsx:173-180` (copy-code via deleteIcon — a primary affordance on a 16px target) | 3 sites | **CONDITIONAL PASS** — fragile; fails if chips wrap adjacent, and RoomsPage misuses deleteIcon for a primary action |
| TableSortLabel in dense `Table size="small"` | ~20px tall text target; spacing exception passes (nothing within the 24px circle vertically) | `features/admin/ui.tsx:434-446` + 5 others | 6 | PASS via exception |
| Calendar day-event chips, `height: 18` | 18px tall but **no pointer action** (tooltip only) → not a 2.5.8 target | `features/groups/tabs/CalendarTab.tsx:149-155` | 1 | N/A (note: 10px label text) |

## (d) Draft BUG tickets (placeholder IDs; coordinator assigns real numbers)

---

### BUG-QA1 — Dark-mode primary too light for white text: contained buttons and filled primary chips fail WCAG 1.4.3
- **Type:** BUG · **Status:** backlog · **Priority:** P2 (recommended) · **Size:** S
- **Owner-role:** _unset (assigned at grooming/BUILD)_
- **Legacy:** 2026-07-20 accessibility review; TASK-049 measurement (sprint 2026-09, branch s2609-sr)
- **Description:** In dark mode `palette.primary.main` is `#3b82f6` with `contrastText: WHITE` (`web/src/app/theme.ts:18`, token `web/src/app/tokens.ts:65`). White-on-#3b82f6 measures **3.68:1** (needs 4.5:1; button labels are 14–15px/600 — not "large text"). Affects all 188 `variant="contained"` primary buttons, filled primary Chips, and any white-on-primary surface in dark mode. Related marginal fail: primary-colored text/links on `surface-raised` (#3b82f6 on #1f1f1f) = **4.48:1**.
- **Acceptance criteria:**
  - [ ] Dark-mode contained-primary button label contrast ≥ 4.5:1 (e.g. darker dark-primary token, or dark `contrastText` switched to near-black, or a dedicated `primary.contrastText` per mode) — verified by computed ratio.
  - [ ] Dark-mode primary text on `surface-raised` ≥ 4.5:1 or the pairing is avoided.
  - [ ] Light mode unchanged (currently 4.83:1, passing).
  - [ ] `npm run web:test` green; no visual-token regression outside dark primary pairings.
- **Notes:** Ratios from TASK-049 script (WCAG formula, MUI 5.16.7). This is the highest-traffic failure (every primary action in dark mode).

---

### BUG-QA2 — Semantic Chip colors fail text contrast: filled success/error/info and outlined success/warning/error/info labels
- **Type:** BUG · **Status:** backlog · **Priority:** P2 (recommended) · **Size:** M
- **Owner-role:** _unset_
- **Legacy:** 2026-07-20 accessibility review ("outlined chips" suspect — confirmed); TASK-049 measurement
- **Description:** Colored MUI Chips (33 call sites) fail WCAG 1.4.3 at ~13px labels:
  - Filled, both themes: success #fff/#10b981 = **2.54**, error #fff/#ef4444 = **3.76**, info #fff/#3b82f6 = **3.68** (theme.ts:20-23 sets `contrastText: WHITE`). E.g. `web/src/features/streams/StreamsPage.tsx:203` ("● LIVE"), `web/src/features/moderation/NotificationsPage.tsx:80` (unread count), `web/src/features/groups/tabs/EventsTab.tsx:272`.
  - Outlined, light mode: warning label **2.15** (`web/src/features/admin/sections/ScopesSection.tsx:97`, `AtprotoSection.tsx:411`, `auth/RolesTab.tsx:101`, `moderator/QueuesTab.tsx:100`), success **2.54** (`cortex/shared.tsx:62`), error **3.76**, info **3.68**; outlined success/warning borders also fail 1.4.11 (2.15–2.54 < 3:1).
  - Outlined, dark mode: error **4.38**, info/primary **4.48**.
  - Filled warning (black text, 9.22) and secondary (5.70) PASS — leave as-is.
- **Acceptance criteria:**
  - [ ] All Chip label/background pairs ≥ 4.5:1 and outlined borders ≥ 3:1 in BOTH themes — via theme-level `MuiChip` overrides (e.g. darker text tokens on tinted fills, like the existing `--exprsn-*-text` values) rather than per-call-site fixes.
  - [ ] No call-site behavior change; `npm run web:test` green.
  - [ ] Spot-verify the six representative call sites above in both themes.
- **Notes:** The design system already defines passing text-on-tint tokens (`--exprsn-success-text` #065f46 on #d1fae5 = 6.78 etc.) — mapping chips onto those is the natural remedy.

---

### BUG-QA3 — Green-on-green sidebar system status (live on every page) + tint classes use base semantic color instead of the `-text` tokens
- **Type:** BUG · **Status:** backlog · **Priority:** P3 (recommended; live but non-primary text) · **Size:** S
- **Owner-role:** _unset_
- **Legacy:** 2026-07-20 accessibility review (tinted badge backgrounds suspect — confirmed); TASK-049 measurement
- **Description:** `web/src/app/RootLayout.tsx:204-206` renders `.system-status` ("All systems operational") in the sidebar footer of every page: `.system-status` bg `--exprsn-success-bg` (#d1fae5) with `.system-status-text` color `--exprsn-success` (#10b981), 13px/500 → **2.24:1** (needs 4.5:1). The tint tokens are not overridden in `[data-theme="dark"]` (`web/src/styles/exprsn-unified.css:91-98`), so it fails identically in dark. Root cause pattern: the CSS component classes pair `--exprsn-<sev>` (the saturated main color) with `--exprsn-<sev>-bg` instead of the purpose-built `--exprsn-<sev>-text` tokens, which all pass (6.4–7.2). Latent (currently unmounted) classes with the same defect: `.badge-success/-warning/-danger/-info/-primary` (css:1291-1314, 1.93–3.10), `.alert-success/-warning/-danger/-info` (css:1381-1401, 2.24–3.36), `.stat-icon.success/.warning` non-text 2.24/1.93 (css:739-749).
- **Acceptance criteria:**
  - [ ] `.system-status-text` ≥ 4.5:1 in both themes (e.g. `color: var(--exprsn-success-text)`).
  - [ ] The `.badge-*`, `.alert-*`, `.stat-icon.*` classes either switch to the `-text` tokens or are removed if truly dead (grep: 0 TSX consumers today).
  - [ ] Decision recorded on dark-mode tint tokens (add dark overrides for `--exprsn-*-bg`/`--exprsn-*-text`, or document them as theme-invariant).
- **Notes:** One-line fixes per class; the passing token values already exist in the same file (css:35-38).

---

### BUG-QA4 — Light-mode muted text fails on tertiary surfaces (4.35:1) and sits at the floor elsewhere
- **Type:** BUG · **Status:** backlog · **Priority:** P3 (edge-case surfaces) · **Size:** S
- **Owner-role:** _unset_
- **Legacy:** 2026-07-20 accessibility review (`--exprsn-text-muted` suspect — confirmed on tertiary only); TASK-049 measurement
- **Description:** Light `--exprsn-text-muted` #737373 measures **4.35:1 on `--exprsn-bg-tertiary`** #f5f5f5 (needs 4.5). Concrete pairings: `.global-search .search-shortcut` kbd hint (`web/src/styles/exprsn-unified.css:218-230`), `.tree-badge` (css:1502-1508), plus any MUI `text.disabled` (= textMuted, theme.ts:25) rendered over gray fills (disabled text itself is 1.4.3-exempt, but the same value is used for non-disabled captions). On bg-primary/bg-secondary it passes but only just (4.74 / 4.54). Dark mode passes everywhere (6.00–7.85).
- **Acceptance criteria:**
  - [ ] Muted-on-tertiary pairings ≥ 4.5:1 in light mode — either darken the light token (≈#6f6f6f or darker keeps all current pairings ≥4.5) or forbid muted-on-tertiary and fix the two CSS classes.
  - [ ] Re-run the TASK-049 pairing matrix; no other muted pairing drops below 4.5.
- **Notes:** Smallest-blast-radius fix is the token nudge in `web/src/styles/exprsn-unified.css:49` + `web/src/app/tokens.ts:59` (keep the two mirrors in sync per tokens.ts header comment).

---

### BUG-QA5 — Non-text UI contrast (1.4.11): input/control borders, MUI Switch track, Alert icons on tint
- **Type:** BUG · **Status:** backlog · **Priority:** P3 · **Size:** M
- **Owner-role:** _unset_
- **Legacy:** 2026-07-20 accessibility review; TASK-049 measurement
- **Description:** UI-component boundaries fail the 3:1 non-text minimum in both themes:
  - Input outlines: `MuiOutlinedInput.notchedOutline` uses `t.border` (`web/src/app/theme.ts:79`) → #e5e5e5 on #fff = **1.26** (light); #404040 on #1f1f1f = **1.59** / on #0a0a0a = **1.91** (dark). The border is the text field's only boundary indicator.
  - `--exprsn-border-color-strong` (scrollbar thumb, theme.ts:94; strong borders) = **2.52 L / 2.53 D**.
  - MUI Switch unchecked track (default, no override): **2.68** light (dark 3.53 passes) — 37 switches.
  - MUI Alert success/warning severity icons on their light-mode tints: **2.35 / 2.02** (error/info pass; all pass in dark; adjacent Alert text passes, so information is not icon-only — mitigating).
  - Focus ring, checkbox glyphs, offline status dot all PASS (measured).
- **Acceptance criteria:**
  - [ ] Interactive-control boundaries (text field outline, switch track) ≥ 3:1 against their surface in both themes (e.g. a dedicated `--exprsn-border-interactive` ≥ #767676-equivalent in light).
  - [ ] Decorative/non-interactive borders (card outlines, dividers) explicitly documented as exempt, or bumped.
  - [ ] Alert success/warning `iconMapping`/color meets 3:1 on the light tint or is accepted with the text-adjacency rationale recorded.
- **Notes:** Do not fix by lightening focus ring or text tokens — those pass today. Purely additive border-token work.

---

### BUG-QA6 — Target size (2.5.8): chip delete/copy icons are sub-24px targets; EntityEditor state chips fail outright
- **Type:** BUG · **Status:** backlog · **Priority:** P3 · **Size:** S
- **Owner-role:** _unset_
- **Legacy:** 2026-07-20 accessibility review; TASK-049 measurement
- **Description:** MUI Chip delete icons are the clickable element and render 16×16 (small chip) / 22×22 (medium) vs the 24×24 minimum:
  - **Fail:** `web/src/features/lowcode/EntityEditor.tsx:285-289` — medium chips with BOTH `onClick` (set initial state) and `onDelete` (remove state): the 24px circle centered on the 22px delete icon intersects the chip's own click target, so the spacing exception cannot apply, and the two actions are destructive-adjacent.
  - **Fragile/conditional:** `web/src/features/messages/Composer.tsx:117-121` (attachment remove, 16×16 — currently passes only via the spacing exception; breaks if chips wrap tighter) and `web/src/features/rooms/RoomsPage.tsx:173-180` (copy-room-code implemented as a chip `deleteIcon` — a primary affordance on a 16×16 target).
  - **Measured, passes (no action):** all 169 `size="small"` IconButtons compute to 30×30/34×34; DataTable dense toolbar (`web/src/features/admin/ui.tsx:367-421`) 30×30; small Checkbox ≥28×28; small Switch 40×24; TableSortLabel passes via spacing exception. CalendarTab 18px chips are non-interactive (tooltip only) — N/A.
- **Acceptance criteria:**
  - [ ] EntityEditor state chips: delete affordance ≥24×24 or restructured (e.g. select-then-delete-button) so undersized targets don't overlap another target.
  - [ ] RoomsPage copy-code moved to a proper IconButton (≥24×24) or the chip target enlarged.
  - [ ] Composer attachment chips keep ≥ the spacing-exception margin when wrapping (or delete target enlarged).
  - [ ] No small IconButton regression below 24×24 (guard: no `p:0` overrides — none exist today).
- **Notes:** MUI-level remedy exists: bump `MuiChip` deleteIcon hit area via theme `styleOverrides` (padding on `.MuiChip-deleteIcon`) instead of per-site edits.

---

## Failure summary

- **Contrast, live failures:** 10 distinct pairing clusters — worst offenders: `.system-status` sidebar text **2.24:1** on every page (both themes); outlined warning chips **2.15:1** light (6 admin call sites); filled success chips **2.54:1** both themes; dark contained-primary buttons **3.68:1** (188 buttons); input outlines **1.26–1.91:1** non-text. Plus 3 latent (unused CSS class) clusters.
- **Contrast, cleared suspects:** MUI Alert text (280 uses), muted-on-white/dark, focus ring, disabled states (exempt and would pass anyway), filled warning chips.
- **Target size:** 1 outright fail (EntityEditor state chips), 2 fragile exception-dependent sites (Composer, RoomsPage copy-code); all IconButton/Checkbox/Switch/DataTable-toolbar patterns measured and PASS.
- Measurement script: `scratchpad/contrast.js` (rerunnable with `node`).
