'use strict';

/**
 * Design-time API (admin-only): apps, lookups, entities, forms, flows. These
 * define the low-code platform's shape. Record runtime lives in records.js.
 */
const express = require('express');
const router = express.Router();
const { LcApp, LcLookup, LcEntity, LcForm, LcFlow } = require('../models');
const typeSystem = require('../services/typeSystem');
const { requireAdmin } = require('../../../plugins/src/middleware/auth');
const events = require('../../../plugins/src/events');

router.use(requireAdmin);

// ── Apps ────────────────────────────────────────────────────────────────────
router.get('/apps', async (req, res, next) => {
  try { res.json({ apps: await LcApp.findAll({ order: [['name', 'ASC']] }) }); } catch (e) { next(e); }
});
router.post('/apps', async (req, res, next) => {
  try {
    const { key, name, description } = req.body || {};
    const app = await LcApp.create({ key, name, description, createdBy: req.userId });
    res.status(201).json({ app });
  } catch (e) { if (e.name && e.name.startsWith('Sequelize')) return res.status(400).json({ error: 'BAD_REQUEST', message: e.message }); next(e); }
});

// ── Lookups ───────────────────────────────────────────────────────────────
router.get('/lookups', async (req, res, next) => {
  try {
    const where = {};
    if (req.query.appId) where.appId = req.query.appId;
    res.json({ lookups: await LcLookup.findAll({ where, order: [['name', 'ASC']] }) });
  } catch (e) { next(e); }
});
router.post('/lookups', async (req, res, next) => {
  try {
    const { appId = null, key, name, values = [] } = req.body || {};
    if (!Array.isArray(values)) return res.status(400).json({ error: 'BAD_REQUEST', message: 'values must be an array' });
    const lookup = await LcLookup.create({ appId, key, name, values });
    res.status(201).json({ lookup });
  } catch (e) { if (e.name && e.name.startsWith('Sequelize')) return res.status(400).json({ error: 'BAD_REQUEST', message: e.message }); next(e); }
});
router.put('/lookups/:id', async (req, res, next) => {
  try {
    const lookup = await LcLookup.findByPk(req.params.id);
    if (!lookup) return res.status(404).json({ error: 'NOT_FOUND' });
    if (req.body.values !== undefined) lookup.values = req.body.values;
    if (req.body.name !== undefined) lookup.name = req.body.name;
    await lookup.save();
    res.json({ lookup });
  } catch (e) { next(e); }
});

// ── Entities (strong-typed property model) ──────────────────────────────────
router.get('/entities', async (req, res, next) => {
  try {
    const where = {};
    if (req.query.appId) where.appId = req.query.appId;
    res.json({ entities: await LcEntity.findAll({ where, order: [['name', 'ASC']] }) });
  } catch (e) { next(e); }
});
router.post('/entities', async (req, res, next) => {
  try {
    const { appId, key, name, description, fields = [], stateMachine = null } = req.body || {};
    const fieldErrors = fields.flatMap((f) => typeSystem.validateFieldDef(f));
    if (fieldErrors.length) return res.status(400).json({ error: 'INVALID_FIELDS', details: fieldErrors });
    const entity = await LcEntity.create({ appId, key, name, description, fields, stateMachine });
    res.status(201).json({ entity });
  } catch (e) { if (e.name && e.name.startsWith('Sequelize')) return res.status(400).json({ error: 'BAD_REQUEST', message: e.message }); next(e); }
});
router.put('/entities/:id', async (req, res, next) => {
  try {
    const entity = await LcEntity.findByPk(req.params.id);
    if (!entity) return res.status(404).json({ error: 'NOT_FOUND' });
    if (req.body.fields !== undefined) {
      const fieldErrors = req.body.fields.flatMap((f) => typeSystem.validateFieldDef(f));
      if (fieldErrors.length) return res.status(400).json({ error: 'INVALID_FIELDS', details: fieldErrors });
      entity.fields = req.body.fields;
    }
    for (const k of ['name', 'description', 'stateMachine']) if (req.body[k] !== undefined) entity[k] = req.body[k];
    await entity.save();
    res.json({ entity });
  } catch (e) { next(e); }
});

// ── Forms ───────────────────────────────────────────────────────────────────
router.get('/forms', async (req, res, next) => {
  try {
    const where = {};
    if (req.query.appId) where.appId = req.query.appId;
    res.json({ forms: await LcForm.findAll({ where }) });
  } catch (e) { next(e); }
});
router.post('/forms', async (req, res, next) => {
  try {
    const { appId, entityKey, key, name, layout = {} } = req.body || {};
    const form = await LcForm.create({ appId, entityKey, key, name, layout });
    res.status(201).json({ form });
  } catch (e) { if (e.name && e.name.startsWith('Sequelize')) return res.status(400).json({ error: 'BAD_REQUEST', message: e.message }); next(e); }
});

// ── Flows ───────────────────────────────────────────────────────────────────
router.get('/flows', async (req, res, next) => {
  try {
    const where = {};
    if (req.query.appId) where.appId = req.query.appId;
    res.json({ flows: await LcFlow.findAll({ where }) });
  } catch (e) { next(e); }
});
router.post('/flows', async (req, res, next) => {
  try {
    const { appId, key, name, event, match = null, actions = [], scopeType = 'platform', enabled = true } = req.body || {};
    if (!events.isKnownEvent(event)) return res.status(400).json({ error: 'UNKNOWN_EVENT', message: `event '${event}' is not a known hook-bus event`, known: events.eventKeys() });
    const flow = await LcFlow.create({ appId, key, name, event, match, actions, scopeType, enabled });
    res.status(201).json({ flow });
  } catch (e) { if (e.name && e.name.startsWith('Sequelize')) return res.status(400).json({ error: 'BAD_REQUEST', message: e.message }); next(e); }
});
router.patch('/flows/:id', async (req, res, next) => {
  try {
    const flow = await LcFlow.findByPk(req.params.id);
    if (!flow) return res.status(404).json({ error: 'NOT_FOUND' });
    for (const k of ['name', 'match', 'actions', 'enabled', 'scopeType']) if (req.body[k] !== undefined) flow[k] = req.body[k];
    await flow.save();
    res.json({ flow });
  } catch (e) { next(e); }
});

module.exports = router;
