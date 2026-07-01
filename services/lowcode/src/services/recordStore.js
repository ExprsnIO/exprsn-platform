'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Record store — per-entity storage mode router.
 *
 * Postgres (lc_records) is always written so query/filter/reference-integrity
 * keep working; on top of that, an entity's `storage.mode` decides whether each
 * write is ALSO reflected into FileVault as JSON (decisions ledger: db | mirror |
 * filevault | export, per entity):
 *   · db        → no FileVault side-effect
 *   · mirror    → write/replace/delete a JSON file per record (DB authoritative)
 *   · filevault → same fan-out as mirror; FileVault is the authoritative content
 *                 store, the DB row is a queryable shadow (true no-DB storage is a
 *                 documented follow-up — it would disable SQL query + refs)
 *   · export    → no per-write file; collection export is on demand
 *
 * All FileVault effects are best-effort (filevaultClient never throws), so this
 * layer likewise never breaks the originating record write.
 * ═══════════════════════════════════════════════════════════
 */

const filevault = require('./filevaultClient');

const MODES = ['db', 'mirror', 'filevault', 'export'];

function mode(entity) {
  const m = entity && entity.storage && entity.storage.mode;
  return MODES.includes(m) ? m : 'db';
}
/** Does this entity mirror each record write to a per-record JSON file? */
function mirrorsPerRecord(entity) {
  const m = mode(entity);
  return m === 'mirror' || m === 'filevault';
}

/**
 * After a record is created/updated in Postgres, reflect it to FileVault when
 * the mode calls for it. Persists the FileVault fileId back onto the record's
 * storageRef so a later update/delete can target the same file. Best-effort.
 */
async function onWrite(entity, record, ctx = {}) {
  if (!mirrorsPerRecord(entity)) return { mode: mode(entity), skipped: true };
  // Replace an existing file (create-new + delete-old) so content stays fresh
  // without depending on FileVault's multipart version PUT.
  const previousFileId = record.storageRef && record.storageRef.filevaultId;
  const res = await filevault.writeRecordFile(entity, record, ctx);
  if (res.ok && res.fileId) {
    record.storageRef = { ...(record.storageRef || {}), filevaultId: res.fileId };
    try { await record.save({ fields: ['storageRef'] }); } catch { /* best-effort */ }
    if (previousFileId && previousFileId !== res.fileId) await filevault.deleteRecordFile(previousFileId, ctx);
  }
  return { mode: mode(entity), ...res };
}

/** After a record is destroyed in Postgres, remove its FileVault file. */
async function onDelete(entity, record, ctx = {}) {
  if (!mirrorsPerRecord(entity)) return { mode: mode(entity), skipped: true };
  const fileId = record && record.storageRef && record.storageRef.filevaultId;
  return filevault.deleteRecordFile(fileId, ctx);
}

/** Write a single collection export file for an entity's records. */
async function exportEntity(entity, records, ctx = {}) {
  return filevault.exportEntityFile(entity, records, ctx);
}

module.exports = { MODES, mode, mirrorsPerRecord, onWrite, onDelete, exportEntity };
