#!/usr/bin/env node
/* Regenerates mockups/v2/index.html (the gallery) from shell.js nav data and
   each screen's contract JSON, so the gallery is complete at rest (no fetches).
   Usage: node mockups/v2/tools/build-gallery.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const V2 = path.resolve(__dirname, '..');

// Evaluate shell.js with a stub DOM to read its nav arrays.
const sandbox = { window: {}, localStorage: { getItem: () => null, setItem() {} }, console };
sandbox.document = { documentElement: { setAttribute() {}, getAttribute: () => null }, currentScript: null, readyState: 'loading', addEventListener() {} };
vm.runInNewContext(fs.readFileSync(path.join(V2, 'shell.js'), 'utf8'), sandbox);
const M = sandbox.window.ExprsnMock;

function contract(href) {
  const f = path.join(V2, href);
  if (!fs.existsSync(f)) return null;
  const m = fs.readFileSync(f, 'utf8').match(/<script type="application\/json" id="contract">([\s\S]*?)<\/script>/);
  try { return m ? JSON.parse(m[1]) : {}; } catch { return {}; }
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let totals = { screens: 0, rest: 0, events: 0, gaps: 0, high: 0 };
function card(i, fallbackIcon) {
  const c = contract(i.href);
  const rest = c ? (c.rest || []).length : 0;
  const ev = c ? (c.socket || []).reduce((n, s) => n + (s.on || []).length + (s.emit || []).length, 0) : 0;
  const ns = c ? (c.socket || []).map((s) => s.ns) : [];
  const gaps = c ? (c.gaps || []) : [];
  const high = gaps.filter((g) => g.sev === 'high').length;
  if (c) { totals.screens++; totals.rest += rest; totals.events += ev; totals.gaps += gaps.length; totals.high += high; }
  return `<a class="g-card card" href="${i.href}">
      <span class="g-ico">${M.icon(i.icon || fallbackIcon)}</span>
      <span class="g-body"><span class="g-title">${esc(i.label)}</span><span class="g-route">${esc(i.route)}</span>
      <span class="g-meta">${c ? `<span class="pill">${rest} REST</span>${ev ? `<span class="pill violet">${ev} events</span>` : ''}${ns.map((n) => `<span class="pill info">${esc(n.startsWith('wss ') ? 'raw WS' : n)}</span>`).join('')}${high ? `<span class="pill danger">${high} high gap${high > 1 ? 's' : ''}</span>` : gaps.length ? `<span class="pill warn">${gaps.length} gap${gaps.length > 1 ? 's' : ''}</span>` : ''}` : '<span class="pill warn">missing</span>'}</span></span>
    </a>`;
}
function section(title, sub, items, icon) {
  return `<section class="g-sec"><div class="g-sec-head"><h3>${esc(title)}</h3>${sub ? `<p class="small muted">${esc(sub)}</p>` : ''}</div><div class="g-grid">${items.map((i) => card(i, icon)).join('')}</div></section>`;
}
let appHtml = M.APP_NAV.map((g) => section(g.group, null, g.items)).join('')
  + section('Detail views', 'Reached from a list or a link, not the sidebar.', M.APP_DETAIL, 'right')
  + section('Public pages', 'No app shell: sign-in, onboarding and shared links.', M.PUBLIC_PAGES, 'globe');
let adminHtml = M.ADMIN_NAV.map((g) => section(g.group || 'Console', null, g.items)).join('')
  + section('Designers', 'Full-screen editors inside Low-Code.', M.ADMIN_DETAIL, 'flow');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Exprsn UI v2 Mockups</title>
<link rel="stylesheet" href="tokens.css">
<link rel="stylesheet" href="components.css">
<script src="shell.js"></script>
<style>
  /* Gallery layout: a single reading column; cards in an auto-fill grid. */
  body { background: var(--exprsn-bg-secondary); }
  .g-wrap { max-width: 1180px; margin: 0 auto; padding-inline: 20px; padding-block: 32px 80px; display: flex; flex-direction: column; gap: 32px; }
  .g-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .g-hero { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 24px; align-items: end; }
  .g-hero h1 { font-size: 2.25rem; font-weight: 700; letter-spacing: -.03em; line-height: 1.1; }
  .g-hero p { color: var(--exprsn-text-secondary); max-width: 62ch; margin-top: 12px; }
  .g-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .g-part { display: flex; flex-direction: column; gap: 20px; }
  .g-part > header { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding-bottom: 10px; border-bottom: 1px solid var(--exprsn-border-color); }
  .g-part > header h2 { font-size: 1.5rem; font-weight: 700; letter-spacing: -.02em; }
  .g-sec { display: flex; flex-direction: column; gap: 10px; }
  .g-sec-head h3 { font-size: .75rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--exprsn-text-secondary); }
  .g-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
  .g-card { display: flex; gap: 12px; padding: 14px; color: inherit; transition: border-color var(--exprsn-transition-fast), transform var(--exprsn-transition-fast); }
  .g-card:hover { text-decoration: none; border-color: var(--exprsn-primary); transform: translateY(-1px); }
  .g-ico { width: 40px; height: 40px; flex: none; border-radius: 12px; display: grid; place-items: center; background: color-mix(in srgb, var(--exprsn-primary) 12%, transparent); color: var(--v2-primary-fg); }
  .g-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .g-title { font-weight: 600; }
  .g-route { font-family: var(--exprsn-font-family-mono); font-size: .75rem; color: var(--exprsn-text-secondary); overflow-wrap: anywhere; }
  .g-meta { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; min-width: 0; }
  .g-meta .pill { max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
  .g-legend { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
  @media (max-width: 800px) { .g-hero { grid-template-columns: minmax(0, 1fr); } .g-hero h1 { font-size: 1.75rem; } }
</style>
</head>
<body data-shell="gallery" data-page="gallery">
<div class="g-wrap">
  <div class="g-top">
    <span class="brand"><span class="brand-mark">E</span><span>Exprsn</span><span class="brand-sub">UI v2 · TASK-074</span></span>
    <button class="icon-btn" type="button" data-theme-toggle aria-label="Toggle light/dark theme"><i data-i="moon"></i></button>
  </div>

  <header class="g-hero">
    <div>
      <p class="eyebrow">Design mockups · proposed</p>
      <h1>Every screen of the user app and admin console, redesigned on the same tokens</h1>
      <p>These mockups keep the Exprsn palette and light/dark themes, and change the hierarchy, navigation and states. On any screen, open the <b>&lt;/&gt;</b> pill in the top bar (or press <span class="kbd">C</span>) to see the REST routes and Socket.IO events it depends on. Clicking a row highlights the UI it drives, and <span class="kbd">⌘K</span> opens the command palette.</p>
    </div>
    <div class="g-stats">
      <div class="card stat"><span class="label">Screens</span><span class="value">${totals.screens}</span></div>
      <div class="card stat"><span class="label">REST bindings</span><span class="value">${totals.rest}</span></div>
      <div class="card stat"><span class="label">Socket event bindings</span><span class="value">${totals.events}</span></div>
      <div class="card stat"><span class="label">Backend gaps flagged</span><span class="value">${totals.gaps}</span><span class="delta down">${totals.high} high</span></div>
    </div>
  </header>

  <div class="g-legend">
    <div class="inset small"><b>Themes.</b> The pages follow your system setting, and the moon/sun button switches explicitly. The preference is saved under the SPA's <code>exprsn-theme</code> key.</div>
    <div class="inset small"><b>States.</b> Every data region has loaded, empty, loading and error designs. You can switch between them from the Contract drawer.</div>
    <div class="inset small"><b>Phone.</b> Below 600px the sidebar becomes a tab bar, and master–detail screens collapse to one pane.</div>
    <div class="inset small"><b>Rationale.</b> See <code>docs/plans/ui-v2-mockups.md</code> for the component map, accessibility rules, the full coverage matrix and the backend prerequisites.</div>
  </div>

  <section class="g-part" aria-labelledby="h-app">
    <header><h2 id="h-app">User app</h2><span class="small muted">web/src/app/router.tsx</span></header>
    ${appHtml}
  </section>

  <section class="g-part" aria-labelledby="h-admin">
    <header><h2 id="h-admin">Admin console</h2><span class="small muted">web/src/features/admin · docs/plans/Design.md</span></header>
    ${adminHtml}
  </section>
</div>
</body>
</html>
`;
fs.writeFileSync(path.join(V2, 'index.html'), html);
console.log(`index.html: ${totals.screens} screens, ${totals.rest} REST, ${totals.events} events, ${totals.gaps} gaps`);
