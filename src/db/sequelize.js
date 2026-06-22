'use strict';

const fs = require('fs');
const { Sequelize } = require('sequelize');
const config = require('../config');

function buildSslOptions() {
  const ssl = {
    require: true,
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
  };
  if (process.env.DB_SSL_CA) {
    ssl.ca = fs.readFileSync(process.env.DB_SSL_CA, 'utf8');
  }
  return ssl;
}

/**
 * Build a Sequelize instance bound to the single platform database and pinned
 * to one schema. Each domain module gets its own instance (so existing model
 * definitions keep working unchanged) but they all target the SAME database;
 * the `schema` keeps their tables namespaced.
 *
 * Modules obtain their instance via getSequelize(schema) instead of creating
 * their own connection from scattered DB_* env vars.
 */
const instances = new Map();

function getSequelize(schema) {
  if (!schema) throw new Error('getSequelize requires a schema name');
  if (instances.has(schema)) return instances.get(schema);

  const sequelize = new Sequelize(config.db.name, config.db.user, config.db.password, {
    host: config.db.host,
    port: config.db.port,
    dialect: 'postgres',
    schema, // default schema for all models defined on this instance
    logging: config.db.logging ? (msg) => console.debug(`[db:${schema}] ${msg}`) : false,
    dialectOptions: config.db.ssl ? { ssl: buildSslOptions() } : {},
    pool: { min: config.db.poolMin, max: config.db.poolMax, idle: 10000, acquire: 30000 },
    define: { schema, underscored: false },
  });

  instances.set(schema, sequelize);
  return sequelize;
}

async function closeAll() {
  for (const s of instances.values()) {
    try { await s.close(); } catch (_) { /* ignore */ }
  }
  instances.clear();
}

module.exports = { getSequelize, closeAll, instances };
