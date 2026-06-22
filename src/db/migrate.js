'use strict';

/**
 * Schema bootstrap for the unified database.
 *
 * Step 1 (this file, runMigrate): ensure the single database exists and create
 * one schema per domain module. Per-module table migrations remain inside each
 * service's own migrations/ directory and run with DB_SCHEMA pointed at the
 * right schema (see scripts/migrate-modules.js).
 */

const fs = require('fs');
const { Client } = require('pg');
const config = require('../config');
const { SCHEMAS } = require('./schemas');

function buildSslOptions() {
  if (!config.db.ssl) return false;
  const ssl = {
    require: true,
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
  };
  if (process.env.DB_SSL_CA) {
    ssl.ca = fs.readFileSync(process.env.DB_SSL_CA, 'utf8');
  }
  return ssl;
}

async function ensureDatabase() {
  // Connect to the default 'postgres' db to create the platform db if missing.
  const admin = new Client({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: 'postgres',
    ssl: buildSslOptions(),
  });
  await admin.connect();
  const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [config.db.name]);
  if (rowCount === 0) {
    await admin.query(`CREATE DATABASE "${config.db.name}"`);
    console.log(`Created database "${config.db.name}"`);
  }
  await admin.end();
}

async function ensureSchemas() {
  const client = new Client({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.name,
    ssl: buildSslOptions(),
  });
  await client.connect();
  for (const schema of SCHEMAS) {
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}" AUTHORIZATION "${config.db.user}"`);
    console.log(`Ensured schema "${schema}"`);
  }
  await client.end();
}

async function runMigrate() {
  await ensureDatabase();
  await ensureSchemas();
  console.log('Schema bootstrap complete. Run per-module migrations next.');
}

if (require.main === module) {
  runMigrate().catch((err) => {
    console.error('Migration bootstrap failed:', err);
    process.exit(1);
  });
}

module.exports = { runMigrate, ensureDatabase, ensureSchemas };
