/**
 * Auth test-database helpers for the provisioning suite.
 *
 * REAL Sequelize writes against a DEDICATED test DB (exprsn_provisioning_test —
 * forced in setup.js, never the real `exprsn`) so the S1 auth transaction and its
 * LIFO compensation can be asserted for real ("zero orphans"). Mirrors the auth
 * module's isolated-test-DB pattern (services/auth/tests/helpers/testDatabase.js):
 * drop + recreate the `auth` schema, then FK-order-tolerant sync of every model.
 */

'use strict';

let db;

async function connect() {
  if (db) {
    return db;
  }
  db = require('../../../../services/auth/src/models');
  await db.sequelize.authenticate();
  return db;
}

async function syncSchema() {
  const { sequelize } = db;
  await sequelize.query('DROP SCHEMA IF EXISTS "auth" CASCADE');
  await sequelize.query('CREATE SCHEMA "auth"');

  // sync() does not topologically sort FK deps; retry until the pending set stops
  // shrinking, then surface any genuine failure.
  let pending = Object.values(sequelize.models);
  let lastCount = Infinity;
  while (pending.length && pending.length < lastCount) {
    lastCount = pending.length;
    const next = [];
    for (const model of pending) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await model.sync();
      } catch (err) {
        next.push(model);
      }
    }
    pending = next;
  }
  for (const model of pending) {
    // eslint-disable-next-line no-await-in-loop
    await model.sync();
  }
}

/**
 * Full setup: connect + build the schema. Call once in beforeAll.
 */
async function setupDatabase() {
  await connect();
  await syncSchema();
  return db;
}

/**
 * Truncate every table (cascade) so each test starts clean. Does NOT re-seed roles
 * — call seedSystemRoles() after when a test needs them.
 */
async function clearDatabase() {
  const { sequelize } = db;
  const models = Object.values(sequelize.models);
  await sequelize.query('SET session_replication_role = replica');
  for (const model of models) {
    // eslint-disable-next-line no-await-in-loop
    await model.destroy({ where: {}, truncate: true, cascade: true, force: true });
  }
  await sequelize.query('SET session_replication_role = DEFAULT');
}

/**
 * Seed the org system roles the preflight (S0) requires.
 */
async function seedSystemRoles() {
  await db.Role.createSystemRoles();
}

async function teardownDatabase() {
  if (db && db.sequelize) {
    await db.sequelize.close();
    db = null;
  }
}

function getDb() {
  return db;
}

module.exports = {
  setupDatabase,
  clearDatabase,
  seedSystemRoles,
  teardownDatabase,
  getDb
};
