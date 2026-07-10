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
    "SELECT table_schema, table_name, column_name, is_nullable FROM information_schema.columns WHERE table_schema IN (:s,'public')",
    { replacements: { s: schema } },
  );
  const colsBy = {}; // `${schema}.${table}` -> Set(col)
  const liveNullable = {}; // `${table}.${col}` -> true if the live column is nullable
  for (const r of cols) {
    const k = `${r.table_schema}.${r.table_name}`;
    (colsBy[k] ||= new Set()).add(r.column_name);
    if (r.table_schema === schema) liveNullable[`${r.table_name}.${r.column_name}`] = r.is_nullable === 'YES';
  }

  // Live FOREIGN KEYs on tables in this schema, with their referential actions.
  // confdeltype/confupdtype codes: a=NO ACTION r=RESTRICT c=CASCADE n=SET NULL d=SET DEFAULT.
  const FK_ACTION = { a: 'NO ACTION', r: 'RESTRICT', c: 'CASCADE', n: 'SET NULL', d: 'SET DEFAULT' };
  const [fkRows] = await sequelize.query(
    `SELECT rel.relname AS tbl, att.attname AS col,
            con.confdeltype AS del, con.confupdtype AS upd, frel.relname AS ref_table
       FROM pg_constraint con
       JOIN pg_class rel ON rel.oid = con.conrelid
       JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
       JOIN pg_class frel ON frel.oid = con.confrelid
       JOIN LATERAL unnest(con.conkey) k(attnum) ON true
       JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = k.attnum
      WHERE con.contype = 'f' AND nsp.nspname = :s`,
    { replacements: { s: schema } },
  );
  const liveFk = {}; // `${table}.${col}` -> { onDelete, onUpdate, refTable }
  for (const r of fkRows) {
    liveFk[`${r.tbl}.${r.col}`] = {
      onDelete: FK_ACTION[r.del] || r.del,
      onUpdate: FK_ACTION[r.upd] || r.upd,
      refTable: r.ref_table,
    };
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
    nullabilityDrift: [], fkDrift: [],
  };

  // --- Model-side FK declarations, keyed by the (table, column) that PHYSICALLY
  // holds the FK. BelongsTo puts the FK on the SOURCE table; HasOne/HasMany on the
  // TARGET table — `File.hasOne` and `FileModeration.belongsTo` describe the SAME
  // physical FK, so both land on the same key.
  //
  // Crucially, the two sides carry DIFFERENT default onDelete on a non-null FK:
  // belongsTo defaults to NO ACTION, hasOne/hasMany to CASCADE — and Sequelize
  // sync creates the constraint from the OWNING (hasOne/hasMany) side. So the
  // effective declared action is the owning side's when present, else belongsTo's.
  // Comparing the belongsTo side alone would flag CASCADE constraints as drift.
  const modelFk = {}; // `${table}.${col}` -> { owning:{od,ou}, belongs:{od,ou}, decls:Set }
  const tableOf = (m) => { const t = m.getTableName(); return typeof t === 'string' ? t : t.tableName; };
  const norm = (v) => (v == null ? null : String(v).toUpperCase());
  for (const model of Object.values(sequelize.models)) {
    for (const a of Object.values(model.associations || {})) {
      if (a.associationType === 'BelongsToMany') continue; // M:N uses a junction table
      const holder = a.associationType === 'BelongsTo' ? a.source : a.target;
      const col = a.identifierField;
      if (!holder || !col) continue;
      const key = `${tableOf(holder)}.${col}`;
      const entry = (modelFk[key] ||= { owning: null, belongs: null, decls: new Set() });
      entry.decls.add(`${model.name}.${a.associationType}`);
      const side = { od: norm(a.options && a.options.onDelete), ou: norm(a.options && a.options.onUpdate) };
      if (a.associationType === 'BelongsTo') entry.belongs = side;
      else entry.owning = side; // HasOne / HasMany own constraint creation
    }
  }

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

    // Nullability drift: the model's NOT NULL intent must match the live column.
    // This is the check that would have caught the FileModeration.file_id defect
    // (model allowNull:false, but Sequelize's hasOne default forced the column
    // nullable).
    //
    // AGGREGATE per DB column: a hasOne/belongsTo FK produces TWO attributes for
    // one column — the explicit one (e.g. allowNull:false) and an
    // association-injected one (allowNull:true). The author's intent is the
    // NOT NULL, so the column is NOT NULL if ANY attribute declares it (or it's
    // a PK). Reading a single attribute would false-positive on the injected one.
    const notNullByCol = {}; // field -> true if any attr intends NOT NULL
    for (const a of Object.values(attrs)) {
      if (!a.field || !actual.has(a.field)) continue;
      if (liveNullable[`${table}.${a.field}`] === undefined) continue;
      notNullByCol[a.field] = (notNullByCol[a.field] || false) || a.allowNull === false || a.primaryKey === true;
    }
    for (const [col, modelNotNull] of Object.entries(notNullByCol)) {
      const liveNull = liveNullable[`${table}.${col}`];
      // Drift when the two agree as booleans: modelNotNull(true) & liveNull(true)
      // = model NOT NULL but DB nullable; both false = model nullable but DB
      // NOT NULL. (One is "not-null-ness", the other "null-ness".)
      if (modelNotNull === liveNull) {
        report.nullabilityDrift.push({
          table, column: col,
          model: modelNotNull ? 'NOT NULL' : 'nullable',
          live: liveNull ? 'nullable' : 'NOT NULL',
        });
      }
    }

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
    // attribute-level unique also creates an index. Sequelize represents a
    // COMPOSITE unique (e.g. a two-column PK declared via dual primaryKey:true,
    // or `unique: 'name'`) as a shared STRING name on each participating
    // attribute — `a.unique === '<name>'`; only `a.unique === true` (boolean)
    // is a genuine single-column unique. Group by the shared name so a composite
    // unique yields ONE expected set (matching the live composite index), not a
    // false single-column expectation per column (BUG-007).
    const uniqueGroups = new Map(); // unique-name -> Set(fields)
    for (const a of Object.values(attrs)) {
      if (!a.unique || !a.field) continue;
      if (a.unique === true) {
        declaredSets.push(new Set([a.field]));
      } else {
        const key = String(a.unique);
        if (!uniqueGroups.has(key)) uniqueGroups.set(key, new Set());
        uniqueGroups.get(key).add(a.field);
      }
    }
    for (const s of uniqueGroups.values()) declaredSets.push(s);
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

  // --- FK referential-action drift. For every FK the models declare, the live
  // constraint's ON DELETE / ON UPDATE must match. This is the check that would
  // have caught FileModeration's FK defaulting to SET NULL instead of CASCADE.
  // Only tables in THIS schema are compared (live FK query is schema-scoped).
  for (const [key, m] of Object.entries(modelFk)) {
    const table = key.slice(0, key.lastIndexOf('.'));
    if (!tableInSchema.has(table)) continue; // FK on another schema's table
    const live = liveFk[key];
    if (!live) {
      report.fkDrift.push({ fk: key, issue: 'no FK constraint in live DB', declaredBy: [...m.decls] });
      continue;
    }
    // Effective declared action = the owning (hasOne/hasMany) side's when it
    // exists, else the belongsTo side's. This matches what sync creates and
    // avoids flagging every belongsTo-default NO ACTION against a live CASCADE.
    const eff = m.owning || m.belongs || {};
    if (eff.od && eff.od !== live.onDelete) {
      report.fkDrift.push({ fk: key, issue: 'onDelete mismatch', modelOnDelete: eff.od, liveOnDelete: live.onDelete, declaredBy: [...m.decls] });
    }
    if (eff.ou && eff.ou !== live.onUpdate) {
      report.fkDrift.push({ fk: key, issue: 'onUpdate mismatch', modelOnUpdate: eff.ou, liveOnUpdate: live.onUpdate, declaredBy: [...m.decls] });
    }
  }

  process.stdout.write(JSON.stringify(report) + '\n');
  await sequelize.close().catch(() => {});
  process.exit(0);
})().catch((e) => {
  process.stdout.write(JSON.stringify({ schema, ok: false, error: e.message }) + '\n');
  process.exit(1);
});
