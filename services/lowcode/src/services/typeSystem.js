'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Strong-typing engine for low-code entity records.
 *
 * Validates (and coerces) a record's `data` against an entity's field
 * definitions — the Tableau/PowerBI-style typed-property model:
 *   type ∈ string|text|number|integer|boolean|date|datetime|enum|reference|json
 *   role ∈ dimension|measure|attribute     aggregation ∈ sum|avg|count|min|max
 *
 * Enum values come either inline (`enumValues`) or from a reusable lookup list
 * (`enumLookup` → LcLookup.values). Pure — the caller resolves lookups/refs and
 * passes them in, so this stays synchronous and unit-testable.
 * ═══════════════════════════════════════════════════════════
 */

const FIELD_TYPES = ['string', 'text', 'number', 'integer', 'boolean', 'date', 'datetime', 'enum', 'reference', 'json'];
const FIELD_ROLES = ['dimension', 'measure', 'attribute'];
const AGGREGATIONS = ['sum', 'avg', 'count', 'min', 'max'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validate a single entity field DEFINITION (used at design time). */
function validateFieldDef(field) {
  const errors = [];
  if (!field || typeof field !== 'object') return ['field must be an object'];
  if (!/^[a-z][a-z0-9_]*$/i.test(field.key || '')) errors.push(`field.key "${field.key}" must be a valid identifier`);
  if (!FIELD_TYPES.includes(field.type)) errors.push(`field "${field.key}" has unknown type "${field.type}"`);
  if (field.role && !FIELD_ROLES.includes(field.role)) errors.push(`field "${field.key}" has unknown role "${field.role}"`);
  if (field.aggregation && !AGGREGATIONS.includes(field.aggregation)) errors.push(`field "${field.key}" has unknown aggregation "${field.aggregation}"`);
  if (field.type === 'enum' && !Array.isArray(field.enumValues) && !field.enumLookup) {
    errors.push(`enum field "${field.key}" needs enumValues or enumLookup`);
  }
  if (field.type === 'reference' && !field.refEntity) errors.push(`reference field "${field.key}" needs refEntity`);
  return errors;
}

/** Allowed enum values for a field, merging inline + resolved lookup. */
function enumValuesFor(field, lookups = {}) {
  const inline = Array.isArray(field.enumValues) ? field.enumValues : [];
  const fromLookup = field.enumLookup && lookups[field.enumLookup]
    ? (lookups[field.enumLookup] || []).map((v) => v.value)
    : [];
  return [...inline, ...fromLookup];
}

function coerceScalar(field, value) {
  switch (field.type) {
    case 'number': { const n = Number(value); return Number.isFinite(n) ? n : NaN; }
    case 'integer': { const n = Number(value); return Number.isInteger(n) ? n : NaN; }
    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (value === 'true') return true;
      if (value === 'false') return false;
      return value;
    default: return value;
  }
}

/** Validate one value against its field. Returns { ok, value, error }. */
function validateValue(field, raw, lookups = {}) {
  if (raw === undefined || raw === null || raw === '') {
    if (field.required) return { ok: false, error: `"${field.key}" is required` };
    return { ok: true, value: field.default !== undefined ? field.default : null };
  }
  const value = coerceScalar(field, raw);
  switch (field.type) {
    case 'string':
    case 'text':
      if (typeof value !== 'string') return { ok: false, error: `"${field.key}" must be a string` };
      if (field.max !== undefined && value.length > field.max) return { ok: false, error: `"${field.key}" exceeds max length ${field.max}` };
      if (field.min !== undefined && value.length < field.min) return { ok: false, error: `"${field.key}" below min length ${field.min}` };
      break;
    case 'number':
    case 'integer':
      if (Number.isNaN(value)) return { ok: false, error: `"${field.key}" must be a ${field.type}` };
      if (field.min !== undefined && value < field.min) return { ok: false, error: `"${field.key}" below min ${field.min}` };
      if (field.max !== undefined && value > field.max) return { ok: false, error: `"${field.key}" above max ${field.max}` };
      break;
    case 'boolean':
      if (typeof value !== 'boolean') return { ok: false, error: `"${field.key}" must be a boolean` };
      break;
    case 'date':
    case 'datetime':
      if (Number.isNaN(Date.parse(value))) return { ok: false, error: `"${field.key}" must be a valid ${field.type}` };
      break;
    case 'enum': {
      const allowed = enumValuesFor(field, lookups);
      if (!allowed.includes(value)) return { ok: false, error: `"${field.key}" must be one of: ${allowed.join(', ')}` };
      break;
    }
    case 'reference':
      if (!UUID_RE.test(String(value))) return { ok: false, error: `"${field.key}" must be a record id (uuid)` };
      break;
    case 'json':
      if (typeof value !== 'object') return { ok: false, error: `"${field.key}" must be a JSON object/array` };
      break;
    default:
      return { ok: false, error: `"${field.key}" has unknown type` };
  }
  return { ok: true, value };
}

/**
 * Validate a whole record's data. `lookups` maps lookupKey → values[]. Returns
 * { valid, errors:[], data: coercedData }. Unknown keys are dropped.
 */
function validateRecord(fields, data, lookups = {}) {
  const errors = [];
  const out = {};
  for (const field of fields || []) {
    const res = validateValue(field, (data || {})[field.key], lookups);
    if (!res.ok) errors.push(res.error);
    else if (res.value !== null && res.value !== undefined) out[field.key] = res.value;
  }
  return { valid: errors.length === 0, errors, data: out };
}

module.exports = {
  FIELD_TYPES, FIELD_ROLES, AGGREGATIONS,
  validateFieldDef, validateValue, validateRecord, enumValuesFor,
};
