'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Minimal RFC-4180 CSV serializer/parser for entity record import/export.
 *
 * Dependency-free on purpose — the platform has no CSV lib and records are
 * small typed rows, so a ~100-line implementation beats a new dependency.
 * Handles quoted fields, embedded quotes (""), commas and newlines in quotes,
 * and CRLF/LF line endings. Values are strings; the caller (typeSystem) owns
 * type coercion.
 * ═══════════════════════════════════════════════════════════
 */

/** Quote a single CSV cell when it needs it. */
function cell(value) {
  if (value === null || value === undefined) return '';
  let s;
  if (typeof value === 'object') s = JSON.stringify(value);
  else s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Serialize rows to CSV. `columns` is an ordered list of { key, label? };
 * `rows` is an array of plain objects keyed by column key.
 */
function toCsv(columns, rows) {
  const header = columns.map((c) => cell(c.label || c.key)).join(',');
  const lines = rows.map((row) => columns.map((c) => cell(row[c.key])).join(','));
  return [header, ...lines].join('\r\n');
}

/**
 * Parse CSV text into { headers, rows } where rows are objects keyed by the
 * header row. Header cells are matched as-is; the caller maps labels → field
 * keys. Empty trailing lines are ignored. Never throws; malformed trailing
 * quotes terminate the current cell.
 */
function parseCsv(text) {
  const src = String(text || '');
  const table = [];
  let row = [];
  let cur = '';
  let inQuotes = false;
  let sawCell = false;

  const pushCell = () => { row.push(cur); cur = ''; sawCell = false; };
  const pushRow = () => { pushCell(); table.push(row); row = []; };

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cur += '"'; i += 1; } else inQuotes = false;
      } else cur += ch;
      continue;
    }
    if (ch === '"' && cur === '' && !sawCell) { inQuotes = true; sawCell = true; continue; }
    if (ch === ',') { pushCell(); continue; }
    if (ch === '\r') { if (src[i + 1] === '\n') i += 1; pushRow(); continue; }
    if (ch === '\n') { pushRow(); continue; }
    cur += ch;
    sawCell = true;
  }
  if (cur !== '' || row.length) pushRow();

  // Drop rows that are entirely empty (e.g. trailing newline artifacts).
  const nonEmpty = table.filter((r) => r.some((c) => c !== ''));
  if (!nonEmpty.length) return { headers: [], rows: [] };
  const headers = nonEmpty[0].map((h) => h.trim());
  const rows = nonEmpty.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => { if (h) obj[h] = r[idx] !== undefined ? r[idx] : ''; });
    return obj;
  });
  return { headers, rows };
}

module.exports = { toCsv, parseCsv };
