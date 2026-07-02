'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Server-side aggregation over entity records — the query engine behind
 * dashboards/BI views. Uses the field metadata the type system already carries
 * (role: dimension|measure, aggregation: sum|avg|count|min|max).
 *
 *   GET /:entityKey/aggregate?groupBy=status,region&metrics=sum:amount,count:*
 *
 * · groupBy — up to 3 dimension field keys (optional; none = grand total)
 * · metrics — comma list of <agg>:<fieldKey> or count:*; defaults to each
 *   measure field's declared aggregation (else count:*)
 *
 * Field keys are validated against the entity's field defs (identifier-shaped
 * by the design API), so interpolating them into JSONB path literals is safe.
 * The caller's visibility clause is AND'd in, and filters (?f.*) apply.
 * ═══════════════════════════════════════════════════════════
 */

const { sequelize, LcRecord } = require('../models');
const typeSystem = require('./typeSystem');

const MAX_GROUP_FIELDS = 3;
const MAX_GROUPS = 1000;
const NUMERIC = new Set(['number', 'integer']);

function textExpr(key) { return `("data" #>> '{${key}}')`; }
function numExpr(key) { return `${textExpr(key)}::numeric`; }

/** Parse ?metrics= into validated { agg, key } pairs. Throws { status, message }. */
function parseMetrics(entity, raw) {
  const fieldsByKey = new Map((entity.fields || []).map((f) => [f.key, f]));
  const bad = (message) => { const e = new Error(message); e.status = 400; return e; };

  if (!raw) {
    // Default: every measure field with a declared aggregation, else count(*).
    const metrics = (entity.fields || [])
      .filter((f) => f.role === 'measure' && f.aggregation && NUMERIC.has(f.type))
      .map((f) => ({ agg: f.aggregation, key: f.key }));
    return metrics.length ? metrics : [{ agg: 'count', key: '*' }];
  }

  return String(raw).split(',').map((tok) => {
    const [agg, key] = tok.trim().split(':');
    if (!typeSystem.AGGREGATIONS.includes(agg)) throw bad(`unknown aggregation "${agg}" (${typeSystem.AGGREGATIONS.join(', ')})`);
    if (agg === 'count' && (key === '*' || key === undefined)) return { agg: 'count', key: '*' };
    const field = fieldsByKey.get(key);
    if (!field) throw bad(`unknown metric field "${key}"`);
    if (['sum', 'avg'].includes(agg) && !NUMERIC.has(field.type)) throw bad(`"${key}" is not numeric — ${agg} needs a number/integer field`);
    return { agg, key, type: field.type };
  });
}

/** Parse ?groupBy= into validated field defs. Throws { status, message }. */
function parseGroupBy(entity, raw) {
  if (!raw) return [];
  const fieldsByKey = new Map((entity.fields || []).map((f) => [f.key, f]));
  const keys = String(raw).split(',').map((s) => s.trim()).filter(Boolean);
  if (keys.length > MAX_GROUP_FIELDS) { const e = new Error(`groupBy supports at most ${MAX_GROUP_FIELDS} fields`); e.status = 400; throw e; }
  return keys.map((k) => {
    const f = fieldsByKey.get(k);
    if (!f) { const e = new Error(`unknown groupBy field "${k}"`); e.status = 400; throw e; }
    return f;
  });
}

/** SQL expression for one metric. */
function metricSql(m) {
  if (m.agg === 'count') return m.key === '*' ? 'COUNT(*)' : `COUNT(${textExpr(m.key)})`;
  if (['sum', 'avg'].includes(m.agg) || NUMERIC.has(m.type)) return `${m.agg.toUpperCase()}(${numExpr(m.key)})`;
  // min/max over non-numeric fields compare lexically (ISO dates sort right).
  return `${m.agg.toUpperCase()}(${textExpr(m.key)})`;
}

function metricAlias(m) { return m.key === '*' ? 'count' : `${m.agg}_${m.key}`; }

/**
 * Run the aggregation. `where` is the caller-built Sequelize where (visibility
 * + filters + entityId). Returns { groups: [{ <dims…>, <metrics…> }], metrics }.
 */
async function aggregate(entity, query, where) {
  const groupFields = parseGroupBy(entity, query.groupBy);
  const metrics = parseMetrics(entity, query.metrics);

  const attributes = [
    ...groupFields.map((f) => [sequelize.literal(textExpr(f.key)), f.key]),
    ...metrics.map((m) => [sequelize.literal(metricSql(m)), metricAlias(m)]),
  ];
  const group = groupFields.map((f) => sequelize.literal(textExpr(f.key)));

  const rows = await LcRecord.findAll({
    where,
    attributes,
    group: group.length ? group : undefined,
    order: group.length ? group.map((g) => [g, 'ASC']) : undefined,
    limit: MAX_GROUPS,
    raw: true,
  });

  // Numeric aggregates come back as strings from pg — cast for the client.
  const numericAliases = new Set(metrics.filter((m) => m.agg === 'count' || ['sum', 'avg'].includes(m.agg) || NUMERIC.has(m.type)).map(metricAlias));
  const groups = rows.map((r) => {
    const out = { ...r };
    for (const a of numericAliases) if (out[a] !== null && out[a] !== undefined) out[a] = Number(out[a]);
    return out;
  });

  return { groups, metrics: metrics.map((m) => ({ agg: m.agg, field: m.key, alias: metricAlias(m) })), groupBy: groupFields.map((f) => f.key) };
}

module.exports = { aggregate, parseMetrics, parseGroupBy };
