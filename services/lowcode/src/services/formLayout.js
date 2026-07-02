'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Form layout helpers — validation (design time) + the field whitelist and
 * public render spec (anonymous runtime).
 *
 * A layout is declarative UI over an entity:
 *   { sections: [{ title?, fields: [ 'fieldKey' | { key, visibleWhen?,
 *     placeholder?, help? } ] }], steps?: boolean, submitLabel? }
 *
 * The layout is the SECURITY BOUNDARY for public forms: an anonymous submit
 * may only set fields the layout lists (formFieldKeys), so a form exposing
 * two fields of a ten-field entity can't be used to write the other eight.
 * ═══════════════════════════════════════════════════════════
 */

/** Normalize one layout field entry to { key, ... }. */
function normalizeField(entry) {
  if (typeof entry === 'string') return { key: entry };
  if (entry && typeof entry === 'object' && typeof entry.key === 'string') return entry;
  return null;
}

/** Validate a layout against its entity's fields. Returns error strings. */
function validateLayout(entity, layout) {
  if (layout === undefined || layout === null) return [];
  if (typeof layout !== 'object' || Array.isArray(layout)) return ['layout must be an object'];
  const errors = [];
  const known = new Set((entity.fields || []).map((f) => f.key));
  const sections = layout.sections;
  if (sections !== undefined) {
    if (!Array.isArray(sections)) return ['layout.sections must be an array'];
    sections.forEach((s, si) => {
      if (!s || typeof s !== 'object') { errors.push(`sections[${si}] must be an object`); return; }
      if (!Array.isArray(s.fields)) { errors.push(`sections[${si}].fields must be an array`); return; }
      s.fields.forEach((entry, fi) => {
        const f = normalizeField(entry);
        if (!f) { errors.push(`sections[${si}].fields[${fi}] must be a field key or { key }`); return; }
        if (!known.has(f.key)) errors.push(`sections[${si}].fields[${fi}] references unknown field "${f.key}"`);
        if (f.visibleWhen !== undefined && f.visibleWhen !== null && (typeof f.visibleWhen !== 'object' || Array.isArray(f.visibleWhen))) {
          errors.push(`sections[${si}].fields[${fi}].visibleWhen must be a condition object`);
        }
      });
    });
  }
  return errors;
}

/** The entity field keys a form exposes (submission whitelist). */
function formFieldKeys(layout) {
  const keys = new Set();
  for (const s of (layout && layout.sections) || []) {
    for (const entry of s.fields || []) {
      const f = normalizeField(entry);
      if (f) keys.add(f.key);
    }
  }
  return keys;
}

/**
 * The public render spec for an anonymous form: form layout + only the
 * exposed fields' public-safe definition (no formulas, no refEntity wiring),
 * with enum options resolved so the renderer needs no design API access.
 */
function publicSpec(form, entity, lookups = {}) {
  const exposed = formFieldKeys(form.layout);
  const fields = (entity.fields || [])
    .filter((f) => exposed.has(f.key) && f.formula === undefined)
    .map((f) => {
      const out = { key: f.key, label: f.label || f.key, type: f.type };
      for (const k of ['required', 'min', 'max']) if (f[k] !== undefined) out[k] = f[k];
      if (f.type === 'enum') {
        const inline = Array.isArray(f.enumValues) ? f.enumValues : [];
        const fromLookup = f.enumLookup && lookups[f.enumLookup] ? lookups[f.enumLookup].map((v) => v.value) : [];
        out.options = [...inline, ...fromLookup];
      }
      return out;
    });
  return {
    name: form.name,
    layout: form.layout,
    settings: form.settings || {},
    entityKey: form.entityKey,
    fields,
  };
}

module.exports = { validateLayout, formFieldKeys, publicSpec, normalizeField };
