'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Native low-code flow actions.
 *
 * The flow engine runs two families of actions: the plugin action handlers on
 * the shared hook bus (log/audit/notify/flag — pluginHost.ACTIONS) and these
 * low-code-NATIVE actions that mutate entity records. Keeping the native set in
 * one registry lets both the engine (dispatch) and the design API (validation)
 * agree on what an action `type` may be.
 *
 * Each action gets (action, ctx) where ctx is the hook-bus event payload — for
 * `lowcode.record.*` events that includes `record` and `app`. Handlers throw on
 * misuse; the engine contains the throw (best-effort, never breaks the emit).
 * ═══════════════════════════════════════════════════════════
 */

const { createLogger } = require('@exprsn/shared');
const { LcEntity, LcRecord } = require('../models');

const logger = createLogger('exprsn-lowcode-flow');

/** Resolve the entity an action targets (explicit entityKey, else the event's). */
async function resolveEntity(action, ctx) {
  const key = action.entityKey || ctx.entity;
  if (!key) throw new Error('action needs entityKey (none in event context)');
  const entity = await LcEntity.findOne({ where: { appId: action.appId || ctx.app, key } });
  if (!entity) throw new Error(`unknown entity ${key}`);
  return entity;
}

/** The record an action targets: explicit recordId, else the event's record. */
async function resolveRecord(action, ctx, entity) {
  const id = action.recordId || (ctx.record && ctx.record.id);
  if (!id) throw new Error('action needs recordId (none in event context)');
  const record = await LcRecord.findOne({ where: { id, entityId: entity.id } });
  if (!record) throw new Error(`record ${id} not found`);
  return record;
}

const NATIVE_ACTIONS = {
  /** Create a record in an entity of the same app. */
  async create_record(action, ctx) {
    const entityService = require('./entityService');
    const entity = await resolveEntity(action, ctx);
    const record = await entityService.createRecord(entity, action.data || {}, { userId: ctx.userId });
    return { type: 'create_record', recordId: record.id };
  },

  /** Merge `data` into an existing record (defaults to the event's record). */
  async update_record(action, ctx) {
    const entityService = require('./entityService');
    const entity = await resolveEntity(action, ctx);
    const record = await resolveRecord(action, ctx, entity);
    await entityService.updateRecord(record, entity, action.data || {});
    return { type: 'update_record', recordId: record.id };
  },

  /** Drive the entity's record state machine by one event. */
  async transition_record(action, ctx) {
    const entityService = require('./entityService');
    const entity = await resolveEntity(action, ctx);
    const record = await resolveRecord(action, ctx, entity);
    if (!action.event) throw new Error('transition_record needs an event');
    const out = await entityService.transitionRecord(record, entity, action.event, { userId: ctx.userId });
    return { type: 'transition_record', recordId: record.id, state: out.state };
  },

  /** Export an entity's records to a single JSON file in FileVault. */
  async export_entity(action, ctx) {
    const entityService = require('./entityService');
    const entity = await resolveEntity(action, ctx);
    const out = await entityService.exportEntity(entity, { authorization: ctx.authorization });
    return { type: 'export_entity', entity: entity.key, ...out };
  },
};

function isNativeAction(type) { return Object.prototype.hasOwnProperty.call(NATIVE_ACTIONS, type); }

/**
 * Every action `type` a flow may use = native record actions + capability-gated
 * module write actions + plugin hook-bus actions. Used by the design API to
 * reject typo'd action types at authoring time.
 */
function knownActionTypes() {
  const pluginHost = require('../../../plugins/src/services/pluginHost');
  const moduleActions = require('./moduleActions');
  return [...Object.keys(NATIVE_ACTIONS), ...moduleActions.actionTypes(), ...Object.keys(pluginHost.ACTIONS || {})];
}

/** Validate a flow's actions array; returns error strings (empty = valid). */
function validateActions(actions) {
  if (!Array.isArray(actions)) return ['actions must be an array'];
  const known = new Set(knownActionTypes());
  const errors = [];
  actions.forEach((a, i) => {
    if (!a || typeof a !== 'object' || !a.type) { errors.push(`action[${i}] needs a type`); return; }
    if (!known.has(a.type)) errors.push(`action[${i}] has unknown type "${a.type}"`);
  });
  return errors;
}

module.exports = { NATIVE_ACTIONS, isNativeAction, knownActionTypes, validateActions, logger };
