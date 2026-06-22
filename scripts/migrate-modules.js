'use strict';

/**
 * Runs each module's own migrations against the shared database, with the
 * module's Postgres schema injected via env (DB_SCHEMA + DB_NAME pointing at the
 * unified db). Modules that use sequelize-cli or a custom scripts/migrate.js are
 * invoked in-place from their copied directory.
 *
 * This is a thin orchestrator: it does not rewrite migrations, it just runs the
 * existing ones with the unified connection + per-module schema so every table
 * lands in its own namespace.
 */

const path = require('path');
const { spawnSync } = require('child_process');
const config = require('../src/config');
const { MODULES } = require('../src/modules/registry');
const { runMigrate } = require('../src/db/migrate');

// How each module runs its migrations, relative to services/<name>/.
const MIGRATORS = {
  ca: ['node', 'scripts/migrate.js'],
  auth: ['node', 'scripts/migrate.js'],
  spark: ['node', 'scripts/migrate-postgres.js'],
  nexus: ['node', 'scripts/migrate.js'],
  filevault: ['node', 'scripts/migrate.js'],
  vault: ['node', 'scripts/init-vault.js'],
  timeline: ['node', 'scripts/migrate-postgres.js'],
  prefetch: ['node', 'scripts/migrate-postgres.js'],
  moderator: ['npx', 'sequelize-cli', 'db:migrate'],
  live: ['node', 'scripts/migrate.js'],
};

async function main() {
  // Ensure db + schemas exist first.
  await runMigrate();

  for (const m of MODULES) {
    const cmd = MIGRATORS[m.name];
    if (!cmd) { console.warn(`No migrator configured for ${m.name}, skipping.`); continue; }
    const cwd = path.resolve(__dirname, '..', 'services', m.name);
    const env = {
      ...process.env,
      DB_HOST: config.db.host,
      DB_PORT: String(config.db.port),
      DB_NAME: config.db.name,
      DB_USER: config.db.user,
      DB_PASSWORD: config.db.password,
      DB_SCHEMA: m.schema,
    };
    console.log(`\n=== Migrating ${m.name} into schema "${m.schema}" ===`);
    const res = spawnSync(cmd[0], cmd.slice(1), { cwd, env, stdio: 'inherit' });
    if (res.status !== 0) {
      console.error(`Migration failed for ${m.name} (exit ${res.status}).`);
      process.exitCode = 1;
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
