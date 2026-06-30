'use strict';

/**
 * Record runtime API. Reads/writes strongly-typed records. Authenticated users
 * operate on records; writes are validated against the entity's typed fields and
 * fan out on the shared hook bus (entityService).
 */
const express = require('express');
const router = express.Router();
const { LcEntity, LcRecord } = require('../models');
const entityService = require('../services/entityService');
const { requireUser } = require('../../../plugins/src/middleware/auth');

router.use(requireUser);

async function loadEntity(req, res, next) {
  const entity = await LcEntity.findOne({ where: { key: req.params.entityKey } });
  if (!entity) return res.status(404).json({ error: 'NOT_FOUND', message: 'entity not found' });
  req.entity = entity;
  next();
}

router.get('/:entityKey/records', loadEntity, async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const records = await LcRecord.findAll({ where: { entityId: req.entity.id }, order: [['createdAt', 'DESC']], limit });
    res.json({ records });
  } catch (e) { next(e); }
});

router.post('/:entityKey/records', loadEntity, async (req, res, next) => {
  try {
    const record = await entityService.createRecord(req.entity, req.body || {}, { ownerId: req.userId, userId: req.userId });
    res.status(201).json({ record });
  } catch (e) { if (e.status) return res.status(e.status).json({ error: 'VALIDATION', message: e.message, details: e.details }); next(e); }
});

router.put('/:entityKey/records/:id', loadEntity, async (req, res, next) => {
  try {
    const record = await LcRecord.findOne({ where: { id: req.params.id, entityId: req.entity.id } });
    if (!record) return res.status(404).json({ error: 'NOT_FOUND' });
    const updated = await entityService.updateRecord(record, req.entity, req.body || {});
    res.json({ record: updated });
  } catch (e) { if (e.status) return res.status(e.status).json({ error: 'VALIDATION', message: e.message, details: e.details }); next(e); }
});

router.post('/:entityKey/records/:id/transition', loadEntity, async (req, res, next) => {
  try {
    const record = await LcRecord.findOne({ where: { id: req.params.id, entityId: req.entity.id } });
    if (!record) return res.status(404).json({ error: 'NOT_FOUND' });
    const out = await entityService.transitionRecord(record, req.entity, (req.body && req.body.event) || '');
    res.json({ record: out });
  } catch (e) { if (e.status) return res.status(e.status).json({ error: 'TRANSITION', message: e.message }); next(e); }
});

router.delete('/:entityKey/records/:id', loadEntity, async (req, res, next) => {
  try {
    const n = await LcRecord.destroy({ where: { id: req.params.id, entityId: req.entity.id } });
    res.json({ ok: n > 0 });
  } catch (e) { next(e); }
});

module.exports = router;
