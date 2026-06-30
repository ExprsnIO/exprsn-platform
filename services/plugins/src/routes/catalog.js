'use strict';

/** Plugin catalog: list/inspect/register/validate plugins. Mutations are admin-only. */
const express = require('express');
const router = express.Router();
const { Plugin, PluginVersion } = require('../models');
const { requireAdmin } = require('../middleware/auth');
const { validateManifest } = require('../services/manifestValidator');
const lifecycle = require('../services/lifecycleService');

router.get('/', async (req, res, next) => {
  try {
    const where = {};
    if (req.query.kind) where.kind = req.query.kind;
    if (req.query.status) where.status = req.query.status;
    const plugins = await Plugin.findAll({ where, order: [['name', 'ASC']] });
    res.json({ plugins });
  } catch (err) { next(err); }
});

router.get('/:key', async (req, res, next) => {
  try {
    const plugin = await Plugin.findOne({
      where: { pluginKey: req.params.key },
      include: [{ model: PluginVersion, as: 'versions' }],
    });
    if (!plugin) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json({ plugin });
  } catch (err) { next(err); }
});

/** Validate a manifest without registering it (rule-builder "test" affordance). */
router.post('/validate', requireAdmin, (req, res) => {
  const { valid, errors } = validateManifest(req.body || {});
  res.json({ valid, errors });
});

/** Register / update a plugin from a manifest. */
router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const plugin = await lifecycle.register(req.body || {}, { source: 'uploaded' });
    res.status(201).json({ plugin });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: 'INVALID_MANIFEST', message: err.message, details: err.details });
    next(err);
  }
});

router.delete('/:key', requireAdmin, async (req, res, next) => {
  try {
    const plugin = await Plugin.findOne({ where: { pluginKey: req.params.key } });
    if (!plugin) return res.status(404).json({ error: 'NOT_FOUND' });
    if (plugin.source === 'builtin') return res.status(400).json({ error: 'BUILTIN', message: 'cannot delete a builtin plugin' });
    plugin.status = 'disabled';
    await plugin.save();
    res.json({ ok: true, status: plugin.status });
  } catch (err) { next(err); }
});

module.exports = router;
