'use strict';

/**
 * Design-time API: apps, lookups, entities, forms, flows. These define the
 * low-code platform's shape (record runtime lives in records.js).
 *
 * Authorization (decisions ledger: full org/group RBAC): any authenticated user
 * may reach this router, but every read/mutation is authorized against the
 * target scope via scopeAuthority — platform admins are superusers; org/group
 * admins act within their org/group; users within their own scope. A resource
 * tied to an app inherits that app's scope; a platform-global resource
 * (appId=null) requires platform admin.
 */
const express = require('express');
const router = express.Router();
const { LcApp, LcLookup, LcEntity, LcForm, LcFlow } = require('../models');
const typeSystem = require('../services/typeSystem');
const lookupProviders = require('../services/lookupProviders');
const flowActions = require('../services/flowActions');
const recordStore = require('../services/recordStore');
const entityService = require('../services/entityService');
const scopeAuthority = require('../services/scopeAuthority');
const capabilities = require('../../../plugins/src/capabilities');
const events = require('../../../plugins/src/events');
const { requireDesignIdentity, assertScope, assertApp } = require('../middleware/designAuth');

router.use(requireDesignIdentity);

/** Reject a bad `source` shape; returns an error string or null. */
function validateLookupSource(source) {
  if (source === undefined || source === null) return null; // static (default)
  if (typeof source !== 'object') return 'source must be an object';
  if (source.type === 'static') return null;
  if (source.type === 'provider') {
    if (!lookupProviders.isKnownProvider(source.provider)) return `unknown lookup provider "${source.provider}"`;
    return null;
  }
  return `source.type must be 'static' or 'provider'`;
}

/** Reject a bad entity `storage` config; returns an error string or null. */
function validateStorage(storage) {
  if (storage === undefined || storage === null) return null; // db (default)
  if (typeof storage !== 'object') return 'storage must be an object';
  if (storage.mode && !recordStore.MODES.includes(storage.mode)) return `storage.mode must be one of: ${recordStore.MODES.join(', ')}`;
  return null;
}

/**
 * Guard a read that is scoped to an app: platform admins list everything; others
 * must pass an ?appId they can administer. Listing across ALL apps (no appId) is
 * platform-admin-only. Returns the where-clause to use, or throws 403.
 */
async function scopedListWhere(req) {
  const where = {};
  if (req.query.appId) { await assertApp(req, req.query.appId); where.appId = req.query.appId; }
  else if (!req.isPlatformAdmin) { const e = new Error('appId required'); e.status = 403; e.code = 'FORBIDDEN'; throw e; }
  return where;
}

// ── Apps ────────────────────────────────────────────────────────────────────
router.get('/apps', async (req, res, next) => {
  try {
    const where = {};
    if (req.query.scopeType) where.scopeType = req.query.scopeType;
    if (req.query.scopeId) where.scopeId = req.query.scopeId;
    const apps = await LcApp.findAll({ where, order: [['name', 'ASC']] });
    // Platform admins see all; others see only apps whose scope they administer.
    if (req.isPlatformAdmin) return res.json({ apps });
    const flags = await Promise.all(apps.map((a) => scopeAuthority.canAdminApp(req.identity, a)));
    res.json({ apps: apps.filter((_, i) => flags[i]) });
  } catch (e) { next(e); }
});
router.post('/apps', async (req, res, next) => {
  try {
    const { key, name, description, capabilities: caps = [], scopeType = 'platform', scopeId = null } = req.body || {};
    await assertScope(req, scopeType, scopeId); // must be able to admin the target scope
    // Capabilities are platform-power grants (e.g. write:timeline.posts, executed
    // as the service identity) — only a platform admin may grant them, even to a
    // scoped app. Scoped admins create apps with NO capabilities.
    if (caps.length && !req.isPlatformAdmin) return res.status(403).json({ error: 'FORBIDDEN', message: 'Only a platform admin may grant app capabilities' });
    const unknown = capabilities.unknownCapabilities(caps);
    if (unknown.length) return res.status(400).json({ error: 'UNKNOWN_CAPABILITY', unknown, known: capabilities.capabilityKeys() });
    const app = await LcApp.create({ key, name, description, capabilities: caps, scopeType, scopeId, createdBy: req.userId });
    res.status(201).json({ app });
  } catch (e) { if (e.name && e.name.startsWith('Sequelize')) return res.status(400).json({ error: 'BAD_REQUEST', message: e.message }); next(e); }
});
// Grant/revoke capabilities, rename, or re-scope an app.
router.patch('/apps/:id', async (req, res, next) => {
  try {
    const app = await LcApp.findByPk(req.params.id);
    if (!app) return res.status(404).json({ error: 'NOT_FOUND' });
    await assertApp(req, app); // authority over the app's CURRENT scope
    if (req.body.scopeType !== undefined || req.body.scopeId !== undefined) {
      // Re-scoping additionally requires authority over the TARGET scope.
      await assertScope(req, req.body.scopeType || app.scopeType, req.body.scopeId !== undefined ? req.body.scopeId : app.scopeId);
    }
    if (req.body.capabilities !== undefined) {
      // Granting/altering platform-power capabilities is platform-admin-only.
      if (!req.isPlatformAdmin) return res.status(403).json({ error: 'FORBIDDEN', message: 'Only a platform admin may change app capabilities' });
      const unknown = capabilities.unknownCapabilities(req.body.capabilities);
      if (unknown.length) return res.status(400).json({ error: 'UNKNOWN_CAPABILITY', unknown, known: capabilities.capabilityKeys() });
      app.capabilities = req.body.capabilities;
    }
    for (const k of ['name', 'description', 'status', 'scopeType', 'scopeId']) if (req.body[k] !== undefined) app[k] = req.body[k];
    await app.save();
    res.json({ app });
  } catch (e) { next(e); }
});
router.get('/apps/:id', async (req, res, next) => {
  try {
    const app = await LcApp.findByPk(req.params.id);
    if (!app) return res.status(404).json({ error: 'NOT_FOUND' });
    await assertApp(req, app);
    res.json({ app });
  } catch (e) { next(e); }
});
// Delete an app and everything scoped to it (entities+records, lookups, forms,
// flows). Destructive + cascading — the SPA gates this behind a typed confirm.
router.delete('/apps/:id', async (req, res, next) => {
  try {
    const app = await LcApp.findByPk(req.params.id);
    if (!app) return res.status(404).json({ error: 'NOT_FOUND' });
    await assertApp(req, app);
    const removed = await entityService.deleteApp(app, { authorization: req.get('authorization') });
    res.json({ ok: true, removed });
  } catch (e) { next(e); }
});

// ── Lookups ───────────────────────────────────────────────────────────────
// The dynamic-lookup provider catalog (static registry, no DB — safe to read).
router.get('/lookup-providers', (req, res) => res.json({ providers: lookupProviders.listProviders() }));

router.get('/lookups', async (req, res, next) => {
  try {
    const where = await scopedListWhere(req);
    res.json({ lookups: await LcLookup.findAll({ where, order: [['name', 'ASC']] }) });
  } catch (e) { next(e); }
});
router.post('/lookups', async (req, res, next) => {
  try {
    const { appId = null, key, name, values = [], source = null } = req.body || {};
    await assertApp(req, appId); // null appId = platform-global → platform admin
    if (!Array.isArray(values)) return res.status(400).json({ error: 'BAD_REQUEST', message: 'values must be an array' });
    const srcErr = validateLookupSource(source);
    if (srcErr) return res.status(400).json({ error: 'BAD_SOURCE', message: srcErr, providers: lookupProviders.listProviders().map((p) => p.key) });
    const lookup = await LcLookup.create({ appId, key, name, values, source });
    res.status(201).json({ lookup });
  } catch (e) { if (e.name && e.name.startsWith('Sequelize')) return res.status(400).json({ error: 'BAD_REQUEST', message: e.message }); next(e); }
});
router.put('/lookups/:id', async (req, res, next) => {
  try {
    const lookup = await LcLookup.findByPk(req.params.id);
    if (!lookup) return res.status(404).json({ error: 'NOT_FOUND' });
    await assertApp(req, lookup.appId);
    if (req.body.source !== undefined) {
      const srcErr = validateLookupSource(req.body.source);
      if (srcErr) return res.status(400).json({ error: 'BAD_SOURCE', message: srcErr });
      lookup.source = req.body.source;
    }
    if (req.body.values !== undefined) lookup.values = req.body.values;
    if (req.body.name !== undefined) lookup.name = req.body.name;
    await lookup.save();
    res.json({ lookup });
  } catch (e) { next(e); }
});
// Preview a lookup's live options (resolves provider-backed lookups).
router.get('/lookups/:id/resolved', async (req, res, next) => {
  try {
    const lookup = await LcLookup.findByPk(req.params.id);
    if (!lookup) return res.status(404).json({ error: 'NOT_FOUND' });
    await assertApp(req, lookup.appId);
    const values = await lookupProviders.resolveLookup(lookup, { appId: lookup.appId, authorization: req.get('authorization') });
    res.json({ key: lookup.key, dynamic: lookupProviders.isDynamic(lookup), values });
  } catch (e) { next(e); }
});
router.get('/lookups/:id', async (req, res, next) => {
  try {
    const lookup = await LcLookup.findByPk(req.params.id);
    if (!lookup) return res.status(404).json({ error: 'NOT_FOUND' });
    await assertApp(req, lookup.appId);
    res.json({ lookup });
  } catch (e) { next(e); }
});
router.delete('/lookups/:id', async (req, res, next) => {
  try {
    const lookup = await LcLookup.findByPk(req.params.id);
    if (!lookup) return res.status(404).json({ error: 'NOT_FOUND' });
    await assertApp(req, lookup.appId);
    await lookup.destroy();
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── Entities (strong-typed property model) ──────────────────────────────────
router.get('/entities', async (req, res, next) => {
  try {
    const where = await scopedListWhere(req);
    res.json({ entities: await LcEntity.findAll({ where, order: [['name', 'ASC']] }) });
  } catch (e) { next(e); }
});
router.post('/entities', async (req, res, next) => {
  try {
    const { appId, key, name, description, fields = [], stateMachine = null, storage = null } = req.body || {};
    await assertApp(req, appId);
    const fieldErrors = fields.flatMap((f) => typeSystem.validateFieldDef(f));
    if (fieldErrors.length) return res.status(400).json({ error: 'INVALID_FIELDS', details: fieldErrors });
    const storageErr = validateStorage(storage);
    if (storageErr) return res.status(400).json({ error: 'BAD_STORAGE', message: storageErr, modes: recordStore.MODES });
    const entity = await LcEntity.create({ appId, key, name, description, fields, stateMachine, storage });
    res.status(201).json({ entity });
  } catch (e) { if (e.name && e.name.startsWith('Sequelize')) return res.status(400).json({ error: 'BAD_REQUEST', message: e.message }); next(e); }
});
router.put('/entities/:id', async (req, res, next) => {
  try {
    const entity = await LcEntity.findByPk(req.params.id);
    if (!entity) return res.status(404).json({ error: 'NOT_FOUND' });
    await assertApp(req, entity.appId);
    if (req.body.fields !== undefined) {
      const fieldErrors = req.body.fields.flatMap((f) => typeSystem.validateFieldDef(f));
      if (fieldErrors.length) return res.status(400).json({ error: 'INVALID_FIELDS', details: fieldErrors });
      entity.fields = req.body.fields;
    }
    if (req.body.storage !== undefined) {
      const storageErr = validateStorage(req.body.storage);
      if (storageErr) return res.status(400).json({ error: 'BAD_STORAGE', message: storageErr, modes: recordStore.MODES });
    }
    for (const k of ['name', 'description', 'stateMachine', 'storage']) if (req.body[k] !== undefined) entity[k] = req.body[k];
    await entity.save();
    res.json({ entity });
  } catch (e) { next(e); }
});
// Export an entity's records to a single JSON file in FileVault.
router.post('/entities/:id/export', async (req, res, next) => {
  try {
    const entity = await LcEntity.findByPk(req.params.id);
    if (!entity) return res.status(404).json({ error: 'NOT_FOUND' });
    await assertApp(req, entity.appId);
    const result = await entityService.exportEntity(entity, { authorization: req.get('authorization') });
    res.json({ export: result });
  } catch (e) { next(e); }
});
// Truncate: delete ALL of an entity's records (keeps the entity definition).
router.post('/entities/:id/truncate', async (req, res, next) => {
  try {
    const entity = await LcEntity.findByPk(req.params.id);
    if (!entity) return res.status(404).json({ error: 'NOT_FOUND' });
    await assertApp(req, entity.appId);
    const removed = await entityService.truncateEntity(entity, { authorization: req.get('authorization') });
    res.json({ ok: true, removed });
  } catch (e) { next(e); }
});
router.get('/entities/:id', async (req, res, next) => {
  try {
    const entity = await LcEntity.findByPk(req.params.id);
    if (!entity) return res.status(404).json({ error: 'NOT_FOUND' });
    await assertApp(req, entity.appId);
    res.json({ entity });
  } catch (e) { next(e); }
});
// Delete an entity and all of its records (with FileVault cleanup).
router.delete('/entities/:id', async (req, res, next) => {
  try {
    const entity = await LcEntity.findByPk(req.params.id);
    if (!entity) return res.status(404).json({ error: 'NOT_FOUND' });
    await assertApp(req, entity.appId);
    const removed = await entityService.deleteEntity(entity, { authorization: req.get('authorization') });
    res.json({ ok: true, removed });
  } catch (e) { next(e); }
});

// ── Forms ───────────────────────────────────────────────────────────────────
router.get('/forms', async (req, res, next) => {
  try {
    const where = await scopedListWhere(req);
    res.json({ forms: await LcForm.findAll({ where }) });
  } catch (e) { next(e); }
});
router.post('/forms', async (req, res, next) => {
  try {
    const { appId, entityKey, key, name, layout = {} } = req.body || {};
    await assertApp(req, appId);
    const form = await LcForm.create({ appId, entityKey, key, name, layout });
    res.status(201).json({ form });
  } catch (e) { if (e.name && e.name.startsWith('Sequelize')) return res.status(400).json({ error: 'BAD_REQUEST', message: e.message }); next(e); }
});
router.get('/forms/:id', async (req, res, next) => {
  try {
    const form = await LcForm.findByPk(req.params.id);
    if (!form) return res.status(404).json({ error: 'NOT_FOUND' });
    await assertApp(req, form.appId);
    res.json({ form });
  } catch (e) { next(e); }
});
router.put('/forms/:id', async (req, res, next) => {
  try {
    const form = await LcForm.findByPk(req.params.id);
    if (!form) return res.status(404).json({ error: 'NOT_FOUND' });
    await assertApp(req, form.appId);
    for (const k of ['name', 'entityKey', 'layout']) if (req.body[k] !== undefined) form[k] = req.body[k];
    await form.save();
    res.json({ form });
  } catch (e) { next(e); }
});
router.delete('/forms/:id', async (req, res, next) => {
  try {
    const form = await LcForm.findByPk(req.params.id);
    if (!form) return res.status(404).json({ error: 'NOT_FOUND' });
    await assertApp(req, form.appId);
    await form.destroy();
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── Flows ───────────────────────────────────────────────────────────────────
router.get('/flows', async (req, res, next) => {
  try {
    const where = await scopedListWhere(req);
    res.json({ flows: await LcFlow.findAll({ where }) });
  } catch (e) { next(e); }
});
router.post('/flows', async (req, res, next) => {
  try {
    const { appId, key, name, event, match = null, actions = [], scopeType = 'platform', enabled = true } = req.body || {};
    await assertApp(req, appId);
    if (!events.isKnownEvent(event)) return res.status(400).json({ error: 'UNKNOWN_EVENT', message: `event '${event}' is not a known hook-bus event`, known: events.eventKeys() });
    const actionErrors = flowActions.validateActions(actions);
    if (actionErrors.length) return res.status(400).json({ error: 'INVALID_ACTIONS', details: actionErrors, known: flowActions.knownActionTypes() });
    const flow = await LcFlow.create({ appId, key, name, event, match, actions, scopeType, enabled });
    res.status(201).json({ flow });
  } catch (e) { if (e.name && e.name.startsWith('Sequelize')) return res.status(400).json({ error: 'BAD_REQUEST', message: e.message }); next(e); }
});
router.patch('/flows/:id', async (req, res, next) => {
  try {
    const flow = await LcFlow.findByPk(req.params.id);
    if (!flow) return res.status(404).json({ error: 'NOT_FOUND' });
    await assertApp(req, flow.appId);
    if (req.body.actions !== undefined) {
      const actionErrors = flowActions.validateActions(req.body.actions);
      if (actionErrors.length) return res.status(400).json({ error: 'INVALID_ACTIONS', details: actionErrors, known: flowActions.knownActionTypes() });
    }
    for (const k of ['name', 'match', 'actions', 'enabled', 'scopeType']) if (req.body[k] !== undefined) flow[k] = req.body[k];
    await flow.save();
    res.json({ flow });
  } catch (e) { next(e); }
});
router.get('/flows/:id', async (req, res, next) => {
  try {
    const flow = await LcFlow.findByPk(req.params.id);
    if (!flow) return res.status(404).json({ error: 'NOT_FOUND' });
    await assertApp(req, flow.appId);
    res.json({ flow });
  } catch (e) { next(e); }
});
router.delete('/flows/:id', async (req, res, next) => {
  try {
    const flow = await LcFlow.findByPk(req.params.id);
    if (!flow) return res.status(404).json({ error: 'NOT_FOUND' });
    await assertApp(req, flow.appId);
    await flow.destroy();
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Catalogs the SPA editors need to build flows without hardcoding vocab:
// known hook-bus events, action types, storage modes, field types/roles.
router.get('/catalog', (req, res) => {
  res.json({
    events: events.eventKeys(),
    actions: flowActions.knownActionTypes(),
    capabilities: capabilities.capabilityKeys(),
    storageModes: recordStore.MODES,
    fieldTypes: typeSystem.FIELD_TYPES,
    fieldRoles: typeSystem.FIELD_ROLES,
    aggregations: typeSystem.AGGREGATIONS,
    lookupProviders: lookupProviders.listProviders(),
  });
});

module.exports = router;
