'use strict';

/**
 * Inbound plugin callback. A webhook/script plugin calls back into the platform
 * with its derived service token (X-Service-ID: plugin:<key>) and operates
 * strictly within its granted capabilities (requirePluginCapability).
 *
 * This is the capability-gated re-entry point: e.g. a plugin granted
 * `emit:notifications` can ask the platform to notify a user, but the EFFECT is
 * performed by the platform with its own identity — the plugin never acts
 * directly, and any produced content still flows through moderation.
 */
const express = require('express');
const router = express.Router();
const { createLogger } = require('@exprsn/shared');
const { authenticatePlugin, requirePluginCapability } = require('../middleware/auth');
const { ACTIONS } = require('../services/pluginHost');
const { PluginDelivery } = require('../models');

const logger = createLogger('exprsn-plugins-callback');

/** POST /api/callback/:installationId/notify — emit a notification on behalf of a plugin. */
router.post('/:installationId/notify', authenticatePlugin, requirePluginCapability('emit:notifications'), async (req, res) => {
  const runCtx = { pluginKey: req.plugin.key, event: 'plugin.callback.notify', ctx: req.body || {} };
  try {
    const result = await ACTIONS.notify(req.body || {}, runCtx);
    await PluginDelivery.create({
      installationId: req.plugin.installation.id, pluginKey: req.plugin.key,
      event: 'plugin.callback.notify', kind: req.plugin.installation.plugin.kind || 'webhook',
      status: 'completed', result, finishedAt: new Date(),
    }).catch(() => {});
    res.json({ ok: true, result });
  } catch (err) {
    logger.warn('plugin notify callback failed', { plugin: req.plugin.key, error: err.message });
    res.status(502).json({ error: 'CALLBACK_FAILED', message: err.message });
  }
});

/** POST /api/callback/:installationId/flag — advisory moderation flag. */
router.post('/:installationId/flag', authenticatePlugin, requirePluginCapability('emit:moderator.flag'), (req, res) => {
  const runCtx = { pluginKey: req.plugin.key, event: 'plugin.callback.flag', ctx: req.body || {} };
  const result = ACTIONS.flag(req.body || {}, runCtx);
  res.json({ ok: true, result });
});

module.exports = router;
