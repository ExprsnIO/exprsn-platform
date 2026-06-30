'use strict';

/** Install lifecycle: install / enable / disable / transition / uninstall. */
const express = require('express');
const router = express.Router();
const { Plugin, PluginInstallation, PluginGrant, PluginTransition } = require('../models');
const { requireAdmin, requireUser } = require('../middleware/auth');
const { availableEvents, INSTALL_MACHINE } = require('../services/stateMachine');
const lifecycle = require('../services/lifecycleService');

function withEvents(inst) {
  const json = inst.toJSON ? inst.toJSON() : inst;
  return { ...json, availableEvents: availableEvents(INSTALL_MACHINE, json.lifecycleState) };
}

router.get('/', requireAdmin, async (req, res, next) => {
  try {
    const where = {};
    if (req.query.scopeType) where.scopeType = req.query.scopeType;
    if (req.query.status) where.status = req.query.status;
    const installs = await PluginInstallation.findAll({
      where,
      include: [
        { model: Plugin, as: 'plugin' },
        { model: PluginGrant, as: 'grants' },
      ],
      order: [['createdAt', 'DESC']],
    });
    res.json({ installations: installs.map(withEvents) });
  } catch (err) { next(err); }
});

/**
 * Install. Platform/organization/group scope ⇒ admin. user scope ⇒ the
 * authenticated user installing for themselves.
 */
router.post('/', (req, res, next) => {
  const scopeType = (req.body && req.body.scopeType) || 'platform';
  return scopeType === 'user' ? requireUser(req, res, next) : requireAdmin(req, res, next);
}, async (req, res, next) => {
  try {
    const { pluginKey, scopeType = 'platform', config = {}, capabilities } = req.body || {};
    // user-scope binds scopeId to the caller; never trust a client-supplied id.
    const scopeId = scopeType === 'user' ? req.userId : (req.body.scopeId || null);
    const installation = await lifecycle.install({
      pluginKey, scopeType, scopeId, config, capabilities, installedBy: req.userId || null,
    });
    res.status(201).json({ installation: withEvents(installation) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: 'INSTALL_FAILED', message: err.message, details: err.details });
    next(err);
  }
});

router.get('/:id/transitions', requireAdmin, async (req, res, next) => {
  try {
    const rows = await PluginTransition.findAll({ where: { installationId: req.params.id }, order: [['createdAt', 'DESC']] });
    res.json({ transitions: rows });
  } catch (err) { next(err); }
});

/** Generic state-machine event: { event: 'enable'|'disable'|'fail'|'uninstall' }. */
router.post('/:id/transition', requireAdmin, async (req, res, next) => {
  try {
    const out = await lifecycle.transition(req.params.id, (req.body && req.body.event) || '', { actorId: req.userId });
    res.json(out);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: 'TRANSITION_FAILED', message: err.message });
    next(err);
  }
});

// Convenience aliases for the common lifecycle events.
function aliasTransition(event) {
  return async (req, res, next) => {
    try {
      const out = await lifecycle.transition(req.params.id, event, { actorId: req.userId });
      res.json(out);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: 'TRANSITION_FAILED', message: err.message });
      next(err);
    }
  };
}
router.post('/:id/enable', requireAdmin, aliasTransition('enable'));
router.post('/:id/disable', requireAdmin, aliasTransition('disable'));
router.delete('/:id', requireAdmin, aliasTransition('uninstall'));

module.exports = router;
