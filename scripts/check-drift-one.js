'use strict';

/**
 * Read-only schema-drift worker (one module). Loads the module's Sequelize
 * models — the same way scripts/sync-one.js does — and compares each model's
 * declared columns, ENUM values, and indexes against the LIVE database. Emits a
 * single JSON line on stdout and never writes to the DB.
 *
 * Run by scripts/check-drift.js (one child process per module so module
 * require-time side effects and Sequelize instances stay isolated).
 *
 * Env: SYNC_MODELS_PATH (abs path to the module's models index),
 *      DB_SCHEMA (module schema). DB_* creds are injected by the parent.
 */
const modelsPath = process.env.SYNC_MODELS_PATH;
const schema = process.env.DB_SCHEMA;

function findSequelize(exported) {
  if (!exported) return null;
  if (exported.sequelize && typeof exported.sequelize.sync === 'function') return exported.sequelize;
  for (const v of Object.values(exported)) {
    if (!v) continue;
    if (typeof v.sync === 'function' && typeof v.define === 'function') return v;
    if (v.sequelize && typeof v.sequelize.sync === 'function') return v.sequelize;
  }
  return null;
}

(async () => {
  const exported = require(modelsPath);
  const sequelize = findSequelize(exported);
  if (!sequelize) throw new Error(`no Sequelize instance reachable from ${modelsPath}`);

  // Live columns / tables for this module schema (+ public, to detect STATUS#1
  // leakage where a table landed in public instead of the module schema).
  const [cols] = await sequelize.query(
    "SELECT table_schema, table_name, column_name FROM information_schema.columns WHERE table_schema IN (:s,'public')",
    { replacements: { s: schema } },
  );
  const colsBy = {}; // `${schema}.${table}` -> Set(col)
  for (const r of cols) {
    const k = `${r.table_schema}.${r.table_name}`;
    (colsBy[k] ||= new Set()).add(r.column_name);
  }
  const [tbls] = await sequelize.query(
    "SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema IN (:s,'public')",
    { replacements: { s: schema } },
  );
  const tableInSchema = new Set(tbls.filter((t) => t.table_schema === schema).map((t) => t.table_name));
  const tableInPublic = new Set(tbls.filter((t) => t.table_schema === 'public').map((t) => t.table_name));

  // Precise live index column-sets per table.
  const [idxRows] = await sequelize.query(
    `SELECT t.relname AS tbl, i.relname AS idx, a.attname AS col
       FROM pg_index ix
       JOIN pg_class i ON i.oid = ix.indexrelid
       JOIN pg_class t ON t.oid = ix.indrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY k(attnum, ord) ON true
       JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
      WHERE n.nspname = :s`,
    { replacements: { s: schema } },
  );
  const liveIdxSets = {}; // table -> array of Set(cols)
  const liveIdxTmp = {}; // `${tbl}.${idx}` -> [cols]
  for (const r of idxRows) (liveIdxTmp[`${r.tbl}.${r.idx}`] ||= []).push(r.col);
  for (const key of Object.keys(liveIdxTmp)) {
    const tbl = key.slice(0, key.lastIndexOf('.'));
    (liveIdxSets[tbl] ||= []).push(new Set(liveIdxTmp[key]));
  }
  const setEq = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

  // Live ENUM values per (table.column) for USER-DEFINED columns in this schema.
  const [enumRows] = await sequelize.query(
    `SELECT c.table_name, c.column_name, e.enumlabel
       FROM information_schema.columns c
       JOIN pg_type t ON t.typname = c.udt_name
       JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE c.table_schema = :s AND c.data_type = 'USER-DEFINED'`,
    { replacements: { s: schema } },
  );
  const liveEnum = {}; // `${table}.${col}` -> Set(values)
  for (const r of enumRows) {
    (liveEnum[`${r.table_name}.${r.column_name}`] ||= new Set()).add(r.enumlabel);
  }

  const report = {
    schema, ok: true, models: [],
    missingTables: [], inPublicNotSchema: [], columnDrift: [], indexGaps: [], enumDrift: [],
  };

  for (const model of Object.values(sequelize.models)) {
    const tn = model.getTableName();
    const table = typeof tn === 'string' ? tn : tn.tableName;
    const attrs = model.getAttributes();
    const expected = [...new Set(Object.values(attrs).map((a) => a.field))];

    if (!tableInSchema.has(table)) {
      if (tableInPublic.has(table)) report.inPublicNotSchema.push(table);
      else report.missingTables.push(table);
      report.models.push({ model: model.name, table, present: false });
      continue;
    }

    const actual = colsBy[`${schema}.${table}`] || new Set();
    const missingColumns = expected.filter((c) => !actual.has(c));
    const extraColumns = [...actual].filter((c) => !expected.includes(c));
    if (missingColumns.length) report.columnDrift.push({ table, missingColumns });

    // ENUM value drift: model declares a value the live PG enum type lacks
    // (would fail on insert/update of that value).
    for (const a of Object.values(attrs)) {
      const t = a.type;
      const values = t && Array.isArray(t.values) ? t.values : null;
      if (!values) continue;
      const live = liveEnum[`${table}.${a.field}`];
      if (!live) continue; // column not enum in DB (or missing) — covered elsewhere
      const missingValues = values.filter((v) => !live.has(v));
      if (missingValues.length) {
        report.enumDrift.push({ table, column: a.field, missingValues, liveValues: [...live] });
      }
    }

    // Precise index check: every declared index's column-set must exist live.
    const liveSets = liveIdxSets[table] || [];
    const norm = (f) => (typeof f === 'string' ? f : f.attribute || f.name || f.column);
    const declaredSets = [];
    for (const di of (model.options.indexes || [])) {
      const idxCols = (di.fields || []).map(norm).filter(Boolean);
      if (idxCols.length) declaredSets.push(new Set(idxCols));
    }
    // attribute-level unique also creates an index
    for (const a of Object.values(attrs)) {
      if (a.unique && a.field) declaredSets.push(new Set([a.field]));
    }
    const missingIndexes = declaredSets
      .filter((ds) => !liveSets.some((ls) => setEq(ds, ls)))
      .map((ds) => [...ds].join('+'));
    if (missingIndexes.length) report.indexGaps.push({ table, missingIndexes });

    report.models.push({
      model: model.name, table, present: true,
      missingColumns, extraColumns,
      declaredIdxSets: declaredSets.length, liveIdxSets: liveSets.length, missingIndexes,
    });
  }

  process.stdout.write(JSON.stringify(report) + '\n');
  await sequelize.close().catch(() => {});
  process.exit(0);
})().catch((e) => {
  process.stdout.write(JSON.stringify({ schema, ok: false, error: e.message }) + '\n');
  process.exit(1);
});
