'use strict';

/**
 * Declarative SPA surfaces feed (decisions ledger §SPA surfaces = "declarative
 * surfaces feed"). The SPA fetches this and renders KNOWN surface types
 * (admin-section, widget, menu-item). No plugin JS is ever shipped to the
 * browser — a surface is pure metadata contributed by an enabled installation.
 */
const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { Plugin, PluginInstallation } = require('../models');
const { requireUser } = require('../middleware/auth');

router.get('/', requireUser, async (req, res, next) => {
  try {
    // Surfaces from platform-scoped enabled installs + the caller's own installs.
    const installs = await PluginInstallation.findAll({
      where: {
        status: 'enabled',
        [Op.or]: [{ scopeType: 'platform' }, { scopeType: 'user', scopeId: req.userId }],
      },
      include: [{ model: Plugin, as: 'plugin', where: { status: { [Op.ne]: 'disabled' } }, required: true }],
    });

    const surfaces = [];
    for (const inst of installs) {
      const manifest = inst.plugin.manifest || {};
      for (const s of manifest.surfaces || []) {
        surfaces.push({ ...s, pluginKey: inst.plugin.pluginKey, installationId: inst.id });
      }
    }
    res.json({ surfaces });
  } catch (err) { next(err); }
});

module.exports = router;
