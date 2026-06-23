'use strict';

/**
 * Unified, sync-based migrator.
 *
 * The per-module raw migrations (scripts/migrate-modules.js) are inconsistent
 * across the consolidated services — different runners, filename-ordered DDL
 * with cross-table FKs, and ENUM types that leak into `public` (STATUS.md #1).
 * This migrator instead drives each module's own Sequelize model layer and
 * calls sequelize.sync(), which orders table creation by association and
 * honours each model's `define.schema`. Every module runs in its own child
 * process for isolation.
 *
 * Used by `npm run db:migrate`. The original raw runner is kept as
 * `npm run db:migrate:raw` for reference.
 */

const path = require('path');
const { spawnSync } = require('child_process');
const config = require('../src/config');
const { runMigrate } = require('../src/db/migrate');

// module schema -> models index (relative to services/<name>/). prefetch has no
// Sequelize models (cache/proxy service), so it is intentionally absent.
const MODELS = {
  ca: 'models/index.js',
  auth: 'src/models/index.js',
  spark: 'src/models/index.js',
  nexus: 'src/models/index.js',
  filevault: 'src/models/index.js',
  vault: 'src/models/index.js',
  timeline: 'src/models/index.js',
  moderator: 'models/sequelize-index.js', // src/models/index.js is a stub
  live: 'src/models/index.js',
  atproto: 'models/index.js',
};

// Build a search_path string with `own` first, then the other module schemas,
// then public — quoted for SET search_path.
const ALL_SCHEMAS = ['auth', 'ca', 'nexus', 'spark', 'timeline', 'filevault', 'vault', 'moderator', 'live', 'prefetch', 'atproto'];
function searchPath(own) {
  const ordered = [own, ...ALL_SCHEMAS.filter((s) => s !== own), 'public'];
  return ordered.map((s) => `"${s}"`).join(', ');
}

async function main() {
  await runMigrate(); // ensure db + schemas exist

  const results = [];
  for (const [schema, rel] of Object.entries(MODELS)) {
    const cwd = path.resolve(__dirname, '..', 'services', schema);
    const modelsPath = path.join(cwd, rel);
    const { host, port, name, user, password } = config.db;
    const P = String(port);
    const env = {
      ...process.env,
      // Generic names + libpq fallbacks.
      DB_HOST: host, DB_PORT: P, DB_NAME: name, DB_USER: user, DB_PASSWORD: password,
      PGHOST: host, PGPORT: P, PGDATABASE: name, PGUSER: user, PGPASSWORD: password,
      // Module-prefixed names — several consolidated services still read their
      // own; point them all at the one unified database.
      AUTH_DB_HOST: host, AUTH_DB_PORT: P, AUTH_DB_NAME: name, AUTH_DB_USER: user, AUTH_DB_PASSWORD: password,
      SPARK_DB_HOST: host, SPARK_DB_PORT: P, SPARK_DB_NAME: name, SPARK_DB_USER: user, SPARK_DB_PASSWORD: password,
      FILEVAULT_PG_HOST: host, FILEVAULT_PG_PORT: P, FILEVAULT_PG_DATABASE: name, FILEVAULT_PG_USER: user, FILEVAULT_PG_PASSWORD: password,
      TIMELINE_DB_HOST: host, TIMELINE_DB_PORT: P, TIMELINE_DB_NAME: name, TIMELINE_DB_USER: user, TIMELINE_DB_PASSWORD: password,
      DB_SCHEMA: schema,
      SYNC_MODELS_PATH: modelsPath,
      // search_path: own schema first (creations land here), then the others so
      // cross-schema FK targets (e.g. spark -> auth.users) resolve.
      SYNC_SEARCH_PATH: searchPath(schema),
      NODE_ENV: process.env.NODE_ENV || 'development',
    };
    console.log(`\n=== Syncing ${schema} (${rel}) ===`);
    const res = spawnSync('node', [path.join(__dirname, 'sync-one.js')], {
      cwd, env, stdio: 'inherit', timeout: 120000,
    });
    const ok = res.status === 0;
    if (!ok) process.exitCode = 1;
    results.push({ schema, ok });
  }

  console.log('\n──── migration summary ────');
  for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.schema}`);
  const failed = results.filter((r) => !r.ok).map((r) => r.schema);
  if (failed.length) console.log(`\n${failed.length} module(s) failed: ${failed.join(', ')}`);
  else console.log('\nAll modules synced.');
}

main().catch((e) => { console.error(e); process.exit(1); });
