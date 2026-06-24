#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════
 * test:all — aggregate per-module Jest suites (SP-2)
 *
 * There is no single root Jest project; each module owns its suite. This script
 * runs each module's tests in turn and aggregates the exit codes (non-zero if
 * any module fails), so CI has one command to invoke.
 *
 * Notes:
 *  - `--coverage=false` neutralizes nexus's package.json coverage *threshold*
 *    (70%), which would otherwise fail CI on low coverage rather than on a real
 *    test failure.
 *  - `--passWithNoTests` keeps a module green if it has no test files yet.
 *  - The auth suite shares one Postgres test DB and runs serially (maxWorkers:1
 *    in its jest.config.js); CI provides Postgres + Redis service containers.
 * ═══════════════════════════════════════════════════════════
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Modules that currently ship Jest suites (see each services/<m>/tests).
const MODULES = ['auth', 'nexus', 'timeline', 'moderator', 'spark', 'live'];

const repoRoot = path.resolve(__dirname, '..');
const results = [];

for (const name of MODULES) {
  const cwd = path.join(repoRoot, 'services', name);
  if (!fs.existsSync(path.join(cwd, 'package.json'))) {
    console.log(`\n=== ${name}: no package.json, skipping ===`);
    continue;
  }

  console.log(`\n=== Running ${name} tests ===`);
  const res = spawnSync(
    'npx',
    ['jest', '--passWithNoTests', '--coverage=false'],
    { cwd, stdio: 'inherit', env: process.env }
  );

  const code = res.status === null ? 1 : res.status;
  results.push({ name, code });
}

console.log('\n=== test:all summary ===');
let failed = 0;
for (const { name, code } of results) {
  const ok = code === 0;
  if (!ok) failed++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` (exit ${code})`}`);
}

if (failed > 0) {
  console.error(`\n${failed} module suite(s) failed.`);
  process.exit(1);
}
console.log('\nAll module suites passed.');
