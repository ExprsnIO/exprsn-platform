'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * atproto migration (idempotent)
 *
 * Run by `npm run db:migrate:raw` (scripts/migrate-modules.js) with DB_SCHEMA +
 * DB_* injected, or standalone: `node services/atproto/scripts/migrate.js`.
 *
 * Two parts, both safe to re-run:
 *   1. sequelize.sync() — CREATE TABLE IF NOT EXISTS for the atproto models, so a
 *      fresh database gets every table with its current columns.
 *   2. ADD COLUMN IF NOT EXISTS — brings an EXISTING database (whose tables were
 *      created before these columns were added) up to the current schema. sync()
 *      does not alter existing tables, so these explicit ALTERs are required.
 *
 * Columns added AFTER initial table creation:
 *   external_labelers: status, last_event_at, connect_attempts, heartbeat_at
 *                      (per-labeler health indicators)
 *   user_dids:         did_web_proof, did_plc_proof, challenge,
 *                      challenge_expires_at (DID proof-of-control)
 * ═══════════════════════════════════════════════════════════
 */

require('dotenv').config();

const models = require('../models');

// The models hardcode `define.schema: 'atproto'`; honour DB_SCHEMA if set so the
// raw migrator's injected schema and these ALTERs always agree.
const schema = process.env.DB_SCHEMA || 'atproto';
const q = (table) => `"${schema}"."${table}"`;

const ALTERS = [
  // external_labelers — per-labeler health
  `ALTER TABLE ${q('external_labelers')} ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'idle'`,
  `ALTER TABLE ${q('external_labelers')} ADD COLUMN IF NOT EXISTS last_event_at TIMESTAMPTZ`,
  `ALTER TABLE ${q('external_labelers')} ADD COLUMN IF NOT EXISTS connect_attempts INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE ${q('external_labelers')} ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ`,
  // user_dids — DID proof-of-control
  `ALTER TABLE ${q('user_dids')} ADD COLUMN IF NOT EXISTS did_web_proof VARCHAR(32)`,
  `ALTER TABLE ${q('user_dids')} ADD COLUMN IF NOT EXISTS did_plc_proof VARCHAR(32)`,
  `ALTER TABLE ${q('user_dids')} ADD COLUMN IF NOT EXISTS challenge VARCHAR(64)`,
  `ALTER TABLE ${q('user_dids')} ADD COLUMN IF NOT EXISTS challenge_expires_at TIMESTAMPTZ`,
];

(async () => {
  const { sequelize } = models;
  await sequelize.authenticate();
  await sequelize.createSchema(schema, {}).catch(() => {});
  // Pin search_path so unqualified DDL inside sync() lands in our schema.
  await sequelize.query(`SET search_path TO "${schema}", public`).catch(() => {});

  // 1. create any missing tables (fresh DB) — does NOT alter existing ones.
  await sequelize.sync();

  // 2. add columns that postdate initial table creation (existing DB).
  for (const sql of ALTERS) {
    // eslint-disable-next-line no-await-in-loop
    await sequelize.query(sql);
  }

  console.log(`atproto migrate: schema "${schema}" is up to date (${ALTERS.length} idempotent column checks).`);
  await sequelize.close();
  process.exit(0);
})().catch((err) => {
  console.error(`atproto migrate failed: ${err.message}`);
  process.exit(1);
});
