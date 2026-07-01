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
const { LcLookup, LcRecord } = require('../models');
const typeSystem = require('./typeSystem');

// Shared infra from the plugins module (decisions ledger §Lowcode↔Plugin).
const pluginHost = require('../../../plugins/src/services/pluginHost');
const stateMachine = require('../../../plugins/src/services/stateMachine');

/** Resolve lookup lists usable by an app's entities → { key: values[] }. */
async function resolveLookups(appId) {
  const rows = await LcLookup.findAll({ where: { [Op.or]: [{ appId }, { appId: null }] } });
  const map = {};
  for (const r of rows) map[r.key] = r.values || [];
  return map;
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
  return res;
}

async function createRecord(entity, data, { ownerId, userId } = {}) {
  const res = await validate(entity, data);
  if (!res.valid) { const e = new Error(res.errors.join('; ')); e.status = 400; e.details = res.errors; throw e; }

  const initialState = entity.stateMachine ? (entity.stateMachine.initial || null) : null;
  const record = await LcRecord.create({
    entityId: entity.id, appId: entity.appId, data: res.data, state: initialState, ownerId: ownerId || userId || null,
  });

  // Fan out on the shared hook bus (best-effort, never throws here).
  pluginHost.emit('lowcode.record.created', {
    module: 'lowcode', app: entity.appId, entity: entity.key,
    record: record.toJSON(), userId: ownerId || userId,
  }).catch(() => {});

  return record;
}

async function updateRecord(record, entity, data) {
  const merged = { ...record.data, ...data };
  const res = await validate(entity, merged, record.id);
  if (!res.valid) { const e = new Error(res.errors.join('; ')); e.status = 400; e.details = res.errors; throw e; }
  record.data = res.data;
  await record.save();
  pluginHost.emit('lowcode.record.updated', {
    module: 'lowcode', app: entity.appId, entity: entity.key, record: record.toJSON(),
  }).catch(() => {});
  return record;
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

module.exports = { resolveLookups, validate, createRecord, updateRecord, transitionRecord };
