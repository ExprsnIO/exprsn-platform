#!/usr/bin/env node
/* Render every mockups/v2 page in light + dark at desktop + phone widths.
   Fails on console errors, page errors, broken relative links/assets, or
   horizontal overflow at phone width. Optional: --shots <dir> saves screenshots,
   --axe runs axe-core (serious/critical only).
   Usage: NODE_PATH=$(npm root -g) node mockups/v2/tools/check-pages.js [--shots dir] [--axe] [filter] */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const shotsIdx = args.indexOf('--shots');
const shots = shotsIdx >= 0 ? path.resolve(args[shotsIdx + 1]) : null;
const axe = args.includes('--axe');
const filter = args.filter((a, i) => !a.startsWith('--') && (shotsIdx < 0 || i !== shotsIdx + 1))[0] || '';

function pages() {
  const out = [];
  for (const d of ['', 'app', 'admin']) {
    const dir = path.join(ROOT, d);
    for (const f of fs.readdirSync(dir)) if (f.endsWith('.html')) out.push(path.join(dir, f));
  }
  return out.filter((p) => p.includes(filter));
}

(async () => {
  const browser = await chromium.launch();
  let failures = 0;
  const axeSrc = axe ? fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8') : null;
  for (const file of pages()) {
    const rel = path.relative(ROOT, file);
    // Static link check
    const html = fs.readFileSync(file, 'utf8');
    for (const m of html.matchAll(/(?:href|src)="([^"#:]+\.(?:html|css|js))"/g)) {
      const target = path.resolve(path.dirname(file), m[1]);
      if (!fs.existsSync(target)) { console.log(`FAIL ${rel}: broken link ${m[1]}`); failures++; }
    }
    for (const theme of ['light', 'dark']) {
      for (const [w, h, label] of [[1440, 900, 'desktop'], [390, 844, 'phone']]) {
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme });
        const page = await ctx.newPage();
        const errs = [];
        page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text()) && !/ERR_(NAME_NOT_RESOLVED|INTERNET|TUNNEL|CONNECTION)/.test(m.text())) errs.push(m.text()); });
        page.on('pageerror', (e) => errs.push(String(e)));
        await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
        await page.goto('file://' + file);
        await page.waitForTimeout(80);
        const overflow = label === 'phone' ? await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) : 0;
        if (errs.length) { console.log(`FAIL ${rel} [${theme}/${label}]: ${errs.join(' | ')}`); failures++; }
        if (overflow > 1) {
          const culprit = await page.evaluate(() => {
            const vw = window.innerWidth; const bad = [];
            document.querySelectorAll('body *').forEach((el) => { const r = el.getBoundingClientRect(); if (r.right > vw + 1 && r.width > 0 && !el.closest('.dt-scroll,.code,.canvas,.tabs,.contract,dialog,.sidebar,.cal-scroll')) bad.push(el.tagName.toLowerCase() + '.' + [...el.classList].join('.')); });
            return bad.slice(0, 4).join(', ');
          });
          console.log(`FAIL ${rel} [${theme}/phone]: horizontal overflow ${overflow}px (${culprit})`); failures++;
        }
        if (axe && theme === 'light' && label === 'desktop' || axe && theme === 'dark' && label === 'desktop') {
          await page.addScriptTag({ content: axeSrc });
          const res = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations
            .filter((v) => v.impact === 'serious' || v.impact === 'critical')
            .map((v) => `${v.id}(${v.nodes.length}): ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' ; ')}`));
          if (res.length) { console.log(`AXE  ${rel} [${theme}]: ${res.join(' || ')}`); failures++; }
        }
        if (shots) {
          fs.mkdirSync(shots, { recursive: true });
          await page.screenshot({ path: path.join(shots, `${rel.replace(/[\/]/g, '_').replace('.html', '')}-${theme}-${label}.png`) });
        }
        await ctx.close();
      }
    }
  }
  await browser.close();
  console.log(failures ? `\n${failures} problem(s)` : `\nOK — ${pages().length} page(s) clean`);
  process.exit(failures ? 1 : 0);
})();
