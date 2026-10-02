#!/usr/bin/env node
/* Asserts mockups/v2/tokens.css carries the exact --exprsn-* values of the
   canonical web/src/styles/exprsn-unified.css (light :root and dark block),
   and that no page or kit file introduces a colour literal outside tokens.css.
   Usage: node mockups/v2/tools/check-tokens.js */
'use strict';
const fs = require('fs');
const path = require('path');
const V2 = path.resolve(__dirname, '..');
const REPO = path.resolve(V2, '../..');

function blocks(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const grab = (re) => { const m = clean.match(re); return m ? m[1] : ''; };
  const vars = (s) => Object.fromEntries([...s.matchAll(/(--exprsn-[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  return { light: vars(grab(/:root\s*\{([\s\S]*?)\n\}/)), dark: vars(grab(/\n\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/)) };
}
let fail = 0;
const src = blocks(fs.readFileSync(path.join(REPO, 'web/src/styles/exprsn-unified.css'), 'utf8'));
const v2 = blocks(fs.readFileSync(path.join(V2, 'tokens.css'), 'utf8'));
for (const mode of ['light', 'dark']) {
  const a = src[mode], b = v2[mode];
  if (!Object.keys(a).length) { console.log(`FAIL could not parse ${mode} block in exprsn-unified.css`); fail++; }
  for (const k of Object.keys(a)) if (a[k] !== b[k]) { console.log(`FAIL ${mode} ${k}: unified=${a[k]} v2=${b[k]}`); fail++; }
  for (const k of Object.keys(b)) if (!(k in a)) { console.log(`FAIL ${mode} ${k} exists only in v2 tokens.css`); fail++; }
}
// No colour literals outside tokens.css (rgba(10,10,10,.6) video overlay + white brand mark on gradient are allowed via tokens only)
const files = [];
for (const d of ['', 'app', 'admin']) for (const f of fs.readdirSync(path.join(V2, d))) if (/\.(html|css)$/.test(f) && f !== 'tokens.css') files.push(path.join(V2, d, f));
const ALLOW = /rgba\(10,\s*10,\s*10,\s*\.6\)|rgba\(255,\s*255,\s*255,\s*\.18\)/;
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8').replace(/<script type="application\/json" id="contract">[\s\S]*?<\/script>/, '');
  const lines = text.split('\n');
  lines.forEach((ln, i) => {
    const m = ln.match(/#[0-9a-fA-F]{3,8}\b(?![\w-])|rgba?\([^)]*\)|hsla?\([^)]*\)/g);
    if (!m) return;
    const bad = m.filter((x) => !ALLOW.test(x) && !/^#[0-9a-f]{3,8}$/i.test(x) ? true : !ALLOW.test(x) && /^#/.test(x) && /style=|color|background|fill|stroke|border/.test(ln));
    const real = bad.filter((x) => !(/^#/.test(x) && /href="#|id="|aria-|data-/.test(ln) && !/(color|background|fill|stroke|border)\s*:/.test(ln)));
    if (real.length) { console.log(`FAIL ${path.relative(V2, f)}:${i + 1} colour literal ${real.join(', ')}`); fail++; }
  });
}
console.log(fail ? `\n${fail} problem(s)` : `OK — ${Object.keys(src.light).length} light + ${Object.keys(src.dark).length} dark tokens identical; no stray colour literals in ${files.length} files`);
process.exit(fail ? 1 : 0);
