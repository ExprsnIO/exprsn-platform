'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Entity record service — strongly-typed CRUD + record lifecycle.
 *
 * Records are validated against the entity's typed field defs (typeSystem),
 * uniqueness is enforced per field, and record lifecycle transitions reuse the
 * plugins state-machine engine (shared infra). Every create/update emits a
 * hook-bus event so plugins AND low-code flows can react uniformly.
 * ═══════════════════════════════════════════════════════════
 */

const { Op } = require('sequelize');
const { LcApp, LcLookup, LcEntity, LcRecord, LcForm, LcFlow } = require('../models');
const typeSystem = require('./typeSystem');
const lookupProviders = require('./lookupProviders');
const recordStore = require('./recordStore');

// Shared infra from the plugins module (decisions ledger §Lowcode↔Plugin).
const pluginHost = require('../../../plugins/src/services/pluginHost');
const stateMachine = require('../../../plugins/src/services/stateMachine');

/**
 * Resolve lookup lists usable by an app's entities → { key: values[] }.
 * App-scoped lookups plus platform-global ones (appId=null). Provider-backed
 * lookups are resolved to their live values (best-effort) so enum validation
 * sees the same options a form would render.
 */
async function resolveLookups(appId) {
  const rows = await LcLookup.findAll({ where: { [Op.or]: [{ appId }, { appId: null }] } });
  const map = {};
  for (const r of rows) map[r.key] = await lookupProviders.resolveLookup(r, { appId });
  return map;
}

/**
 * Reference integrity (decisions ledger ent.references = "validate on write"):
 * every `reference`-type field value must point at an existing record of its
 * refEntity within the same app. typeSystem already checked UUID shape; here we
 * confirm the target actually exists. Returns an array of error strings.
 */
async function checkReferences(entity, data) {
  const errors = [];
  const refFields = (entity.fields || []).filter((f) => f.type === 'reference' && f.refEntity);
  for (const field of refFields) {
    const value = data[field.key];
    if (value === undefined || value === null) continue; // required-ness handled by typeSystem
    const target = await LcEntity.findOne({ where: { appId: entity.appId, key: field.refEntity } });
    if (!target) { errors.push(`"${field.key}" references unknown entity "${field.refEntity}"`); continue; }
    const exists = await LcRecord.findOne({ where: { id: value, entityId: target.id }, attributes: ['id'] });
    if (!exists) errors.push(`"${field.key}" references a non-existent ${field.refEntity} record`);
  }
  return errors;
}

/** Enforce per-field uniqueness against existing records of the entity. */
async function checkUnique(entity, data, excludeId) {
  const errors = [];
  for (const field of (entity.fields || []).filter((f) => f.unique)) {
    const v = data[field.key];
    if (v === undefined || v === null) continue;
    const where = { entityId: entity.id, [`data.${field.key}`]: v };
    if (excludeId) where.id = { [Op.ne]: excludeId };
    const existing = await LcRecord.findOne({ where });
    if (existing) errors.push(`"${field.key}" must be unique (value already used)`);
  }
  return errors;
}

async function validate(entity, data, excludeId) {
  const lookups = await resolveLookups(entity.appId);
  const res = typeSystem.validateRecord(entity.fields, data, lookups);
  if (!res.valid) return res;
  const uniqErrors = await checkUnique(entity, res.data, excludeId);
  if (uniqErrors.length) return { valid: false, errors: uniqErrors, data: res.data };
  const refErrors = await checkReferences(entity, res.data);
  if (refErrors.length) return { valid: false, errors: refErrors, data: res.data };
  return res;
}

async function createRecord(entity, data, { ownerId, userId, scopeType, scopeId, authorization } = {}) {
  const res = await validate(entity, data);
  if (!res.valid) { const e = new Error(res.errors.join('; ')); e.status = 400; e.details = res.errors; throw e; }

  // Records inherit their app's scope by default so a group/org app's data is
  // isolated (record-level visibility filters on this). An explicit scopeType
  // overrides. Platform stays the fallback when the app has no scope.
  let recScopeType = scopeType;
  let recScopeId = scopeId;
  if (recScopeType === undefined || recScopeType === null) {
    const app = await LcApp.findByPk(entity.appId, { attributes: ['scopeType', 'scopeId'] });
    if (app) { recScopeType = app.scopeType; recScopeId = app.scopeId; }
  }

  const initialState = entity.stateMachine ? (entity.stateMachine.initial || null) : null;
  const record = await LcRecord.create({
    entityId: entity.id, appId: entity.appId, data: res.data, state: initialState,
    ownerId: ownerId || userId || null,
    scopeType: recScopeType || 'platform', scopeId: recScopeId || null,
  });

  // Reflect to the configured storage backend (db|mirror|filevault). Best-effort.
  await recordStore.onWrite(entity, record, { userId: ownerId || userId, authorization }).catch(() => {});

  // Fan out on the shared hook bus (best-effort, never throws here).
  pluginHost.emit('lowcode.record.created', {
    module: 'lowcode', app: entity.appId, entity: entity.key,
    record: record.toJSON(), userId: ownerId || userId,
  }).catch(() => {});

  return record;
}

async function updateRecord(record, entity, data, { userId, authorization } = {}) {
  const merged = { ...record.data, ...data };
  const res = await validate(entity, merged, record.id);
  if (!res.valid) { const e = new Error(res.errors.join('; ')); e.status = 400; e.details = res.errors; throw e; }
  record.data = res.data;
  await record.save();
  await recordStore.onWrite(entity, record, { userId, authorization }).catch(() => {});
  pluginHost.emit('lowcode.record.updated', {
    module: 'lowcode', app: entity.appId, entity: entity.key, record: record.toJSON(),
  }).catch(() => {});
  return record;
}

/** Delete a record and remove any mirrored FileVault file. */
async function deleteRecord(record, entity, { authorization } = {}) {
  await recordStore.onDelete(entity, record, { authorization }).catch(() => {});
  await record.destroy();
  return true;
}

/** Export all of an entity's records to a single JSON file in FileVault. */
async function exportEntity(entity, { authorization } = {}) {
  const records = await LcRecord.findAll({ where: { entityId: entity.id }, order: [['createdAt', 'ASC']] });
  return recordStore.exportEntity(entity, records, { authorization });
}

/**
 * Truncate an entity — delete ALL of its records and clean up any mirrored
 * FileVault files (best-effort per record so one failure can't strand the rest).
 * Returns the number of records removed.
 */
async function truncateEntity(entity, { authorization } = {}) {
  const records = await LcRecord.findAll({ where: { entityId: entity.id } });
  for (const record of records) {
    await recordStore.onDelete(entity, record, { authorization }).catch(() => {});
  }
  const removed = await LcRecord.destroy({ where: { entityId: entity.id } });
  return removed;
}

/**
 * Delete an entity outright: truncate its records first (with FileVault cleanup),
 * then remove the entity definition. Returns { removedRecords }.
 */
async function deleteEntity(entity, { authorization } = {}) {
  const removedRecords = await truncateEntity(entity, { authorization });
  await entity.destroy();
  return { removedRecords };
}

/**
 * Delete an app and everything scoped to it — entities (with their records +
 * FileVault cleanup), lookups, forms and flows. Returns a summary of counts.
 */
async function deleteApp(app, { authorization } = {}) {
  const entities = await LcEntity.findAll({ where: { appId: app.id } });
  let removedRecords = 0;
  for (const entity of entities) {
    const { removedRecords: n } = await deleteEntity(entity, { authorization });
    removedRecords += n;
  }
  const removedLookups = await LcLookup.destroy({ where: { appId: app.id } });
  const removedForms = await LcForm.destroy({ where: { appId: app.id } });
  const removedFlows = await LcFlow.destroy({ where: { appId: app.id } });
  await app.destroy();
  return { removedEntities: entities.length, removedRecords, removedLookups, removedForms, removedFlows };
}

/** Drive the entity's record state machine for one event. */
async function transitionRecord(record, entity, event, ctx = {}) {
  if (!entity.stateMachine) { const e = new Error('entity has no state machine'); e.status = 400; throw e; }
  const res = stateMachine.evaluate(entity.stateMachine, record.state || entity.stateMachine.initial, event, { record: record.data, ...ctx });
  if (!res.ok) { const e = new Error(res.reason); e.status = 409; throw e; }
  record.state = res.toState;
  await record.save();
  return record;
}

module.exports = { resolveLookups, checkReferences, validate, createRecord, updateRecord, deleteRecord, transitionRecord, exportEntity, truncateEntity, deleteEntity, deleteApp };
