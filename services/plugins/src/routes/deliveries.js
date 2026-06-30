'use strict';

/** Delivery / execution log — the per-plugin audit trail. */
const express = require('express');
const router = express.Router();
const { PluginDelivery } = require('../models');
const { requireAdmin } = require('../middleware/auth');

router.get('/', requireAdmin, async (req, res, next) => {
  try {
    const where = {};
    if (req.query.installationId) where.installationId = req.query.installationId;
    if (req.query.event) where.event = req.query.event;
    if (req.query.status) where.status = req.query.status;
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const deliveries = await PluginDelivery.findAll({ where, order: [['createdAt', 'DESC']], limit });
    res.json({ deliveries });
  } catch (err) { next(err); }
});

module.exports = router;
