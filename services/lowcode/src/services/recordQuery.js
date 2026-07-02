'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Record query builder — turns the record-list query string into a set of
 * Sequelize conditions + ordering + pagination, driven by the entity's typed
 * field defs so comparisons and sorts are correct per type.
 *
 * Filters (repeatable):
 *   ?f.<field>=<value>              → equals (backward compatible)
 *   ?f.<field>[<op>]=<value>        → op ∈ eq|ne|gt|gte|lt|lte|like|contains|in|nin
 *                                     in/nin take a comma-separated list.
 * Sort:  ?sort=-amount,createdAt    → comma list, leading '-' = DESC. Whitelisted
 *                                     to the entity's fields + a few row columns.
 * Search: ?q=<text>                 → case-insensitive substring OR'd across all
 *                                     string/text/enum fields.
 * Page:  ?limit= (≤500)  ?offset=
 * ═══════════════════════════════════════════════════════════
 */
const { Op } = require('sequelize');
const { sequelize } = require('../models');

const OPS = {
  eq: Op.eq, ne: Op.ne, gt: Op.gt, gte: Op.gte, lt: Op.lt, lte: Op.lte,
  like: Op.iLike, contains: Op.iLike, in: Op.in, nin: Op.notIn,
};
const NUMERIC = new Set(['number', 'integer']);
// Row-level columns that may be filtered/sorted directly (not inside `data`).
const ROW_COLUMNS = new Set(['createdAt', 'updatedAt', 'id', 'state']);

/** Raw (uncast) text expression for a record data field. */
function textExpr(field) {
  return sequelize.literal(`("data" #>> '{${field.key}}')`);
}

/** A typed SQL expression for a record data field (cast so compares/sorts work). */
function dataExpr(field) {
  if (NUMERIC.has(field.type)) return sequelize.literal(`("data" #>> '{${field.key}}')::numeric`);
  if (field.type === 'boolean') return sequelize.literal(`("data" #>> '{${field.key}}')::boolean`);
  // string/text/enum/date/datetime/reference/json — lexical (ISO dates sort right).
  return textExpr(field);
}

/** One filter condition, or null if the field/op is unknown (skipped, not fatal). */
function buildCondition(field, op, raw) {
  const opSym = OPS[op];
  if (!opSym) return null;
  // Substring match always runs against the raw text, never a numeric/bool cast.
  if (op === 'like' || op === 'contains') return sequelize.where(textExpr(field), opSym, `%${raw}%`);
  if (op === 'in' || op === 'nin') {
    const list = String(raw).split(',').map((s) => s.trim()).filter(Boolean);
    return sequelize.where(dataExpr(field), opSym, list);
  }
  let value = raw;
  if (NUMERIC.has(field.type)) value = Number(raw);
  else if (field.type === 'boolean') value = raw === 'true' || raw === true;
  return sequelize.where(dataExpr(field), opSym, value);
}

/**
 * Build { conditions, order, limit, offset } from the request query and the
 * entity. `conditions` is an array of Sequelize where-fragments to AND together
 * with the caller's visibility clause.
 */
function build(entity, query = {}) {
  const fieldsByKey = new Map((entity.fields || []).map((f) => [f.key, f]));
  const conditions = [];

  for (const [rawKey, rawVal] of Object.entries(query)) {
    if (!rawKey.startsWith('f.')) continue;
    const fieldKey = rawKey.slice(2);
    const field = fieldsByKey.get(fieldKey);
    if (!field) continue; // unknown field → ignore
    if (rawVal !== null && typeof rawVal === 'object') {
      // ?f.<field>[op]=value  → { op: value }
      for (const [op, v] of Object.entries(rawVal)) {
        const cond = buildCondition(field, op, v);
        if (cond) conditions.push(cond);
      }
    } else {
      const cond = buildCondition(field, 'eq', rawVal);
      if (cond) conditions.push(cond);
    }
  }

  // Free-text search — substring OR across every human-text field.
  if (query.q !== undefined && String(query.q).trim() !== '') {
    const needle = `%${String(query.q).trim()}%`;
    const textFields = (entity.fields || []).filter((f) => ['string', 'text', 'enum'].includes(f.type));
    const ors = textFields.map((f) => sequelize.where(textExpr(f), Op.iLike, needle));
    if (ors.length) conditions.push({ [Op.or]: ors });
  }

  // Sort — default newest first.
  let order = [['createdAt', 'DESC']];
  if (query.sort) {
    const parsed = String(query.sort).split(',').map((s) => s.trim()).filter(Boolean).map((tok) => {
      const dir = tok.startsWith('-') ? 'DESC' : 'ASC';
      const key = tok.replace(/^[-+]/, '');
      if (ROW_COLUMNS.has(key)) return [key, dir];
      const field = fieldsByKey.get(key);
      if (field) return [dataExpr(field), dir];
      return null;
    }).filter(Boolean);
    if (parsed.length) order = parsed;
  }

  const limit = Math.min(Number(query.limit) || 100, 500);
  const offset = Math.max(Number(query.offset) || 0, 0);
  return { conditions, order, limit, offset };
}

module.exports = { build };
