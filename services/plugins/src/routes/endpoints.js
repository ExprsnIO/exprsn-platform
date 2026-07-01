'use strict';

/** Endpoint management — register/list/update/delete managed plugin endpoints. */
const crypto = require('node:crypto');
const express = require('express');
const router = express.Router();
const { PluginEndpoint, PluginInstallation } = require('../models');
const { requireAdmin } = require('../middleware/auth');
const { isPrivateOrLoopback } = require('../services/manifestValidator');

router.get('/', requireAdmin, async (req, res, next) => {
  try {
    const where = {};
    if (req.query.installationId) where.installationId = req.query.installationId;
    const endpoints = await PluginEndpoint.findAll({ where, order: [['createdAt', 'DESC']] });
    res.json({ endpoints });
  } catch (err) { next(err); }
});

router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const { installationId, name, direction = 'outbound', method = 'POST', url, timeoutMs = 4000, secretRef } = req.body || {};
    if (!name) return res.status(400).json({ error: 'BAD_REQUEST', message: 'name is required' });
    if (installationId && !(await PluginInstallation.findByPk(installationId))) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'installation not found' });
    }
    if (direction === 'outbound') {
      if (!url) return res.status(400).json({ error: 'BAD_REQUEST', message: 'outbound endpoint requires url' });
      try {
        const u = new URL(url);
        const prod = process.env.NODE_ENV === 'production';
        if (prod && u.protocol !== 'https:') return res.status(400).json({ error: 'INSECURE_URL', message: 'https required in production' });
        if (process.env.PLUGINS_WEBHOOK_ALLOW_PRIVATE !== 'true' && isPrivateOrLoopback(u.hostname)) {
          return res.status(400).json({ error: 'SSRF_BLOCKED', message: `private/loopback host ${u.hostname} blocked` });
        }
      } catch { return res.status(400).json({ error: 'BAD_URL', message: 'invalid url' }); }
    }
    const inboundPath = direction === 'inbound' ? `/in/${crypto.randomBytes(12).toString('hex')}` : null;
    const endpoint = await PluginEndpoint.create({ installationId, name, direction, method, url, inboundPath, timeoutMs, secretRef });
    res.status(201).json({ endpoint });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') return res.status(409).json({ error: 'DUPLICATE', message: 'endpoint name already exists for this installation' });
    next(err);
  }
});

router.patch('/:id', requireAdmin, async (req, res, next) => {
  try {
    const endpoint = await PluginEndpoint.findByPk(req.params.id);
    if (!endpoint) return res.status(404).json({ error: 'NOT_FOUND' });
    for (const k of ['method', 'url', 'timeoutMs', 'secretRef', 'enabled']) {
      if (req.body[k] !== undefined) endpoint[k] = req.body[k];
    }
    // Reset the breaker on an explicit re-enable.
    if (req.body.enabled === true) { endpoint.failureCount = 0; endpoint.openedUntil = null; }
    await endpoint.save();
    res.json({ endpoint });
  } catch (err) { next(err); }
});

router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const n = await PluginEndpoint.destroy({ where: { id: req.params.id } });
    res.json({ ok: n > 0 });
  } catch (err) { next(err); }
});

module.exports = router;
