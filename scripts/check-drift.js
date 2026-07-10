'use strict';

/**
 * Schema-drift checker (`npm run db:check`).
 *
 * For each module it spawns scripts/check-drift-one.js with the same env the
 * sync migrator uses, loads that module's real Sequelize models, and compares
 * them against the LIVE database — reporting missing tables (incl. tables that
 * leaked into `public`), missing columns, ENUM value drift, missing indexes
 * (precise column-set match), column NULLABILITY drift, and foreign-key
 * ON DELETE / ON UPDATE drift (TASK-024). Read-only: it never alters the database.
 *
 * Exit code is non-zero when any drift or load error is found, so it can gate
 * CI / a pre-deploy step. Requires Postgres (and Redis, since several modules
 * connect at require time) to be up — same prerequisites as `npm run db:migrate`.
 *
 * Set DRIFT_REPORT_PATH=<file> to also write the full JSON report.
 */
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const config = require('../src/config');

const REPO = path.resolve(__dirname, '..');

// module schema -> models index (relative to services/<name>/). Mirrors
// scripts/migrate-sync.js. prefetch has no Sequelize models.
const MODELS = {
  ca: 'models/index.js',
  auth: 'src/models/index.js',
  spark: 'src/models/index.js',
  nexus: 'src/models/index.js',
  filevault: 'src/models/index.js',
  vault: 'src/models/index.js',
  timeline: 'src/models/index.js',
  moderator: 'models/sequelize-index.js',
  live: 'src/models/index.js',
  atproto: 'models/index.js',
};

const { host, port, name, user, password } = config.db;
const P = String(port);

function runOne(schema, rel) {
  const cwd = path.join(REPO, 'services', schema);
  const modelsPath = path.join(cwd, rel);
  const env = {
    ...process.env,
    DB_HOST: host, DB_PORT: P, DB_NAME: name, DB_USER: user, DB_PASSWORD: password,
    PGHOST: host, PGPORT: P, PGDATABASE: name, PGUSER: user, PGPASSWORD: password,
    AUTH_DB_HOST: host, AUTH_DB_PORT: P, AUTH_DB_NAME: name, AUTH_DB_USER: user, AUTH_DB_PASSWORD: password,
    SPARK_DB_HOST: host, SPARK_DB_PORT: P, SPARK_DB_NAME: name, SPARK_DB_USER: user, SPARK_DB_PASSWORD: password,
    FILEVAULT_PG_HOST: host, FILEVAULT_PG_PORT: P, FILEVAULT_PG_DATABASE: name, FILEVAULT_PG_USER: user, FILEVAULT_PG_PASSWORD: password,
    TIMELINE_DB_HOST: host, TIMELINE_DB_PORT: P, TIMELINE_DB_NAME: name, TIMELINE_DB_USER: user, TIMELINE_DB_PASSWORD: password,
    DB_SCHEMA: schema,
    SYNC_MODELS_PATH: modelsPath,
    NODE_ENV: process.env.NODE_ENV || 'development',
  };
  const res = spawnSync('node', [path.join(__dirname, 'check-drift-one.js')], {
    cwd, env, encoding: 'utf8', timeout: 90000,
  });
  const line = (res.stdout || '').trim().split('\n').filter(Boolean).pop();
  try {
    return JSON.parse(line);
  } catch {
    return { schema, ok: false, error: `no parseable report (status ${res.status}); stderr: ${(res.stderr || '').slice(-300)}` };
  }
}

// Documented, accepted divergences (TASK-024). Nullability/FK findings listed
// here are printed as "(known)" and do NOT fail the gate; anything else does.
// A green db:check means "no drift except these tracked items", not "clean".
let ALLOW = new Set();
try {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'drift-allow.json'), 'utf8'));
  ALLOW = new Set((raw.allow || []).map((a) => a.match));
} catch { /* no allowlist -> everything is strict */ }

const reports = [];
for (const [schema, rel] of Object.entries(MODELS)) {
  process.stderr.write(`checking ${schema}...\n`);
  reports.push(runOne(schema, rel));
}

console.log('\n================ SCHEMA DRIFT REPORT ================\n');
let problems = 0;
for (const r of reports) {
  if (!r.ok) {
    problems += 1;
    console.log(`✗ ${r.schema}: LOAD ERROR — ${r.error}`);
    continue;
  }
  // Each issue: { text, allowed }. Allowed issues print but don't fail the gate.
  const issues = [];
  const hard = (text) => issues.push({ text, allowed: false });
  const gated = (match, text) => issues.push({ text, allowed: ALLOW.has(match) });

  if (r.missingTables.length) hard(`MISSING TABLES: ${r.missingTables.join(', ')}`);
  if (r.inPublicNotSchema.length) hard(`IN public NOT ${r.schema}: ${r.inPublicNotSchema.join(', ')}`);
  for (const d of r.columnDrift) hard(`MISSING COLUMNS ${d.table}: ${d.missingColumns.join(', ')}`);
  for (const en of (r.enumDrift || [])) hard(`ENUM DRIFT ${en.table}.${en.column}: model adds [${en.missingValues.join(', ')}] — live has [${en.liveValues.join(', ')}]`);
  for (const g of r.indexGaps) hard(`MISSING INDEX ${g.table}: ${g.missingIndexes.join(' | ')}`);
  for (const n of (r.nullabilityDrift || [])) {
    gated(`nullability:${r.schema}.${n.table}.${n.column}`, `NULLABILITY ${n.table}.${n.column}: model ${n.model}, live ${n.live}`);
  }
  for (const f of (r.fkDrift || [])) {
    const detail = f.liveOnDelete ? ` (model ${f.modelOnDelete}, live ${f.liveOnDelete})`
      : f.liveOnUpdate ? ` (model ${f.modelOnUpdate}, live ${f.liveOnUpdate})` : '';
    gated(`fk:${r.schema}.${f.fk}`, `FK ${f.fk}: ${f.issue}${detail}`);
  }

  const failing = issues.filter((i) => !i.allowed);
  if (issues.length === 0) {
    console.log(`✓ ${r.schema}: ${r.models.length} models, no drift`);
  } else {
    if (failing.length) problems += 1;
    console.log(`${failing.length ? '✗' : '•'} ${r.schema}: ${r.models.length} models`);
    for (const i of issues) console.log(`    - ${i.text}${i.allowed ? '  (known — allowlisted)' : ''}`);
  }
}
console.log(`\n${problems === 0 ? 'No drift found.' : `${problems} module(s) with findings.`}`);

if (process.env.DRIFT_REPORT_PATH) {
  fs.writeFileSync(process.env.DRIFT_REPORT_PATH, JSON.stringify(reports, null, 2));
  console.log(`\nFull report: ${process.env.DRIFT_REPORT_PATH}`);
}

process.exit(problems === 0 ? 0 : 1);
