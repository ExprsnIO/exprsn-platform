'use strict';

/**
 * Record runtime API. Reads/writes strongly-typed records. Authenticated users
 * operate on records; writes are validated against the entity's typed fields and
 * fan out on the shared hook bus (entityService).
 */
const express = require('express');
const { Op } = require('sequelize');
const router = express.Router();
const { LcApp, LcEntity, LcRecord } = require('../models');
const entityService = require('../services/entityService');
const membershipResolver = require('../services/membershipResolver');
const { requireUser } = require('../../../plugins/src/middleware/auth');

router.use(requireUser);

/**
 * Resolve the entity for :entityKey. Entity keys are unique per app, not
 * globally, so an app must be given (?appKey or ?appId) whenever the key is
 * ambiguous; with one match we accept it for backward compatibility.
 */
async function loadEntity(req, res, next) {
  try {
    const where = { key: req.params.entityKey };
    if (req.query.appId) where.appId = req.query.appId;
    else if (req.query.appKey) {
      const app = await LcApp.findOne({ where: { key: req.query.appKey }, attributes: ['id'] });
      if (!app) return res.status(404).json({ error: 'NOT_FOUND', message: 'app not found' });
      where.appId = app.id;
    }
    const matches = await LcEntity.findAll({ where, limit: 2 });
    if (!matches.length) return res.status(404).json({ error: 'NOT_FOUND', message: 'entity not found' });
    if (matches.length > 1) return res.status(409).json({ error: 'AMBIGUOUS_ENTITY', message: `entity key '${req.params.entityKey}' exists in multiple apps — pass ?appKey or ?appId` });
    req.entity = matches[0];
    next();
  } catch (e) { next(e); }
}

/**
 * A record is visible to the requester if it is platform-scoped, owned by them,
 * or scoped to an organization/group they belong to (record-level data
 * isolation). Membership resolution is secure-fail-empty — an outage narrows
 * visibility to platform + owned records, never widens it.
 */
async function visibilityWhere(req) {
  const or = [{ scopeType: 'platform' }, { ownerId: req.userId }];
  const { orgIds, groupIds } = await membershipResolver.resolveMemberships(req.userId);
  if (orgIds.length) or.push({ scopeType: 'organization', scopeId: { [Op.in]: orgIds } });
  if (groupIds.length) or.push({ scopeType: 'group', scopeId: { [Op.in]: groupIds } });
  return { [Op.or]: or };
}

/** Load a record of the current entity that the requester is allowed to see. */
async function loadVisibleRecord(req) {
  return LcRecord.findOne({ where: { id: req.params.id, entityId: req.entity.id, ...(await visibilityWhere(req)) } });
}

router.get('/:entityKey/records', loadEntity, async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const where = { entityId: req.entity.id, ...(await visibilityWhere(req)) };
    // Optional exact-match field filters: ?f.<field>=<value> → data.<field> = value
    for (const [k, v] of Object.entries(req.query)) {
      if (k.startsWith('f.')) where[`data.${k.slice(2)}`] = v;
    }
    const records = await LcRecord.findAll({ where, order: [['createdAt', 'DESC']], limit });
    res.json({ records });
  } catch (e) { next(e); }
});

router.post('/:entityKey/records', loadEntity, async (req, res, next) => {
  try {
    const { _scopeType, _scopeId, ...data } = req.body || {};
    const record = await entityService.createRecord(req.entity, data, { ownerId: req.userId, userId: req.userId, scopeType: _scopeType, scopeId: _scopeId, authorization: req.get('authorization') });
    res.status(201).json({ record });
  } catch (e) { if (e.status) return res.status(e.status).json({ error: 'VALIDATION', message: e.message, details: e.details }); next(e); }
});

router.put('/:entityKey/records/:id', loadEntity, async (req, res, next) => {
  try {
    const record = await loadVisibleRecord(req);
    if (!record) return res.status(404).json({ error: 'NOT_FOUND' });
    const updated = await entityService.updateRecord(record, req.entity, req.body || {}, { userId: req.userId, authorization: req.get('authorization') });
    res.json({ record: updated });
  } catch (e) { if (e.status) return res.status(e.status).json({ error: 'VALIDATION', message: e.message, details: e.details }); next(e); }
});

router.post('/:entityKey/records/:id/transition', loadEntity, async (req, res, next) => {
  try {
    const record = await loadVisibleRecord(req);
    if (!record) return res.status(404).json({ error: 'NOT_FOUND' });
    const out = await entityService.transitionRecord(record, req.entity, (req.body && req.body.event) || '');
    res.json({ record: out });
  } catch (e) { if (e.status) return res.status(e.status).json({ error: 'TRANSITION', message: e.message }); next(e); }
});

router.delete('/:entityKey/records/:id', loadEntity, async (req, res, next) => {
  try {
    const record = await loadVisibleRecord(req);
    if (!record) return res.json({ ok: false });
    await entityService.deleteRecord(record, req.entity, { authorization: req.get('authorization') });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
