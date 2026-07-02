'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * FileVault client — persist low-code records as JSON files.
 *
 * Records can be mirrored to (or backed by) FileVault as JSON (decisions ledger:
 * FileVault record storage). FileVault is USER-scoped (`authenticate` → req.userId),
 * so a write forwards the caller's bearer when the request has one; server-side
 * callers (flows, seeds) fall back to the platform service identity. Every call
 * is BEST-EFFORT: a FileVault outage degrades to a logged warning and the DB row
 * (kept for query/reference integrity) remains authoritative — a storage-backend
 * fault must never break a record write.
 * ═══════════════════════════════════════════════════════════
 */

const axios = require('axios');
const { createLogger } = require('@exprsn/shared');
const { deriveServiceToken } = require('@exprsn/shared/utils/serviceToken');
const { getInternalHttpsAgent } = require('@exprsn/shared/utils/httpAgent');

const logger = createLogger('exprsn-lowcode-filevault');

function base() {
  return process.env.FILEVAULT_SERVICE_URL || `${process.env.PUBLIC_BASE_URL || 'https://localhost:8443'}/filevault`;
}
function serviceHeaders() {
  const serviceId = process.env.SERVICE_ID || process.env.SERVICE_NAME || 'platform';
  try { return { 'X-Service-ID': serviceId, 'X-Service-Token': deriveServiceToken(serviceId) }; }
  catch { return {}; }
}
/** Prefer the caller's user bearer (FileVault is user-scoped); else service id. */
function authHeaders(ctx = {}) {
  const headers = serviceHeaders();
  if (ctx.authorization) headers.Authorization = ctx.authorization;
  return headers;
}
function req() {
  return { timeout: 5000, httpsAgent: getInternalHttpsAgent() };
}

/** Deterministic file name for one record (per app + entity + id). */
function recordFileName(entity, record) {
  return `lc_${entity.appId}_${entity.key}_${record.id}.json`;
}
/** The JSON body persisted for a record (data + light provenance). */
function recordDocument(entity, record) {
  return {
    _lowcode: { app: entity.appId, entity: entity.key, recordId: record.id, state: record.state || null, at: new Date().toISOString() },
    data: record.data || {},
  };
}

/** Create a JSON file for a record. Returns { ok, fileId? }. Never throws. */
async function writeRecordFile(entity, record, ctx = {}) {
  try {
    const directoryId = (entity.storage && entity.storage.directoryId) || null;
    const { data } = await axios.post(`${base()}/api/files/create`, {
      name: recordFileName(entity, record),
      content: JSON.stringify(recordDocument(entity, record), null, 2),
      directoryId,
      visibility: 'private',
    }, { ...req(), headers: authHeaders(ctx) });
    const fileId = data && data.file && data.file.id;
    return { ok: true, fileId };
  } catch (err) {
    logger.warn('FileVault record write failed (degraded)', { entity: entity.key, record: record.id, error: err.message });
    return { ok: false, error: err.message };
  }
}

/** Delete a record's JSON file by its stored fileId. Never throws. */
async function deleteRecordFile(fileId, ctx = {}) {
  if (!fileId) return { ok: true, skipped: true };
  try {
    await axios.delete(`${base()}/api/files/${fileId}`, { ...req(), headers: authHeaders(ctx) });
    return { ok: true };
  } catch (err) {
    logger.warn('FileVault record delete failed (degraded)', { fileId, error: err.message });
    return { ok: false, error: err.message };
  }
}

/** Write one collection file holding an entity's records. Returns { ok, fileId? }. */
async function exportEntityFile(entity, records, ctx = {}) {
  try {
    const doc = {
      _lowcode: { app: entity.appId, entity: entity.key, count: records.length, exportedAt: new Date().toISOString() },
      records: records.map((r) => ({ id: r.id, state: r.state || null, data: r.data || {} })),
    };
    const { data } = await axios.post(`${base()}/api/files/create`, {
      name: `lc_${entity.appId}_${entity.key}_export.json`,
      content: JSON.stringify(doc, null, 2),
      directoryId: (entity.storage && entity.storage.directoryId) || null,
      visibility: 'private',
    }, { ...req(), headers: authHeaders(ctx) });
    return { ok: true, fileId: data && data.file && data.file.id, count: records.length };
  } catch (err) {
    logger.warn('FileVault entity export failed (degraded)', { entity: entity.key, error: err.message });
    return { ok: false, error: err.message };
  }
}

module.exports = { writeRecordFile, deleteRecordFile, exportEntityFile, recordFileName, recordDocument };
