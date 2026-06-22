'use strict';

/**
 * Child worker: load ONE module's Sequelize models and create its tables in the
 * module's Postgres schema. Run by scripts/migrate-sync.js (one child process
 * per module, so module require-time side effects and Sequelize instances stay
 * isolated).
 *
 * Two robustness measures:
 *  - an afterConnect hook pins search_path to the module schema on EVERY pooled
 *    connection, so unqualified table/ENUM/FK names resolve there, not public
 *    (STATUS.md #1).
 *  - models are synced iteratively, retrying ones whose FK targets don't exist
 *    yet, so string-based references that sync() can't topologically order
 *    (e.g. nexus group_roles, vault vault_tokens) still succeed.
 *
 * Inputs (env): SYNC_MODELS_PATH (abs path to the module's models index),
 *               DB_SCHEMA (target schema). DB_* are injected by the parent.
 */

const modelsPath = process.env.SYNC_MODELS_PATH;
const schema = process.env.DB_SCHEMA;

function findSequelize(exported) {
  if (!exported) return null;
  if (exported.sequelize && typeof exported.sequelize.sync === 'function') return exported.sequelize;
  for (const v of Object.values(exported)) {
    if (!v) continue;
    if (typeof v.sync === 'function' && typeof v.define === 'function') return v; // the instance
    if (v.sequelize && typeof v.sequelize.sync === 'function') return v.sequelize; // a model
  }
  return null;
}

async function iterativeSync(sequelize) {
  let remaining = Object.values(sequelize.models);
  if (remaining.length === 0) return; // nothing defined
  let lastErr;
  for (let pass = 0; pass < remaining.length + 2 && remaining.length; pass++) {
    const failed = [];
    for (const model of remaining) {
      try {
        await model.sync();
      } catch (e) {
        lastErr = e;
        failed.push(model);
      }
    }
    if (failed.length === remaining.length) {
      throw new Error(`unresolved after ${pass + 1} pass(es) (${failed.length} left): ${lastErr && lastErr.message}`);
    }
    remaining = failed;
  }
}

(async () => {
  const exported = require(modelsPath);
  const sequelize = findSequelize(exported);
  if (!sequelize) throw new Error(`no Sequelize instance reachable from ${modelsPath}`);

  // Pin search_path on every connection (raw pg client) before any DDL. Own
  // schema first; the rest follow so cross-schema FK targets resolve.
  const searchPath = process.env.SYNC_SEARCH_PATH || `"${schema}", public`;
  sequelize.addHook('afterConnect', async (connection) => {
    await connection.query(`SET search_path TO ${searchPath}`);
  });
  // Drop any connection opened at require-time so the hook applies everywhere.
  try { await sequelize.connectionManager.pool.clear(); } catch (_) { /* noop */ }

  await sequelize.createSchema(schema, {}).catch(() => {});
  await iterativeSync(sequelize);

  const [rows] = await sequelize.query(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = '${schema}'`
  );
  console.log(`OK ${schema}: ${rows[0].n} tables`);
  await sequelize.close();
  process.exit(0);
})().catch((e) => {
  console.error(`SYNC_ERR ${schema}: ${e.message}`);
  process.exit(1);
});
