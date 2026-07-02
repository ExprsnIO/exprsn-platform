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
const recordQuery = require('../services/recordQuery');
const recordAggregate = require('../services/recordAggregate');
const csv = require('../services/csv');
const membershipResolver = require('../services/membershipResolver');
const { requireUser } = require('../../../plugins/src/middleware/auth');

const IMPORT_MAX_ROWS = 2000;
const BULK_MAX_ITEMS = 1000;
const EXPORT_MAX_ROWS = 10000;

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
async function loadVisibleRecord(req, id = req.params.id) {
  return LcRecord.findOne({ where: { id, entityId: req.entity.id, ...(await visibilityWhere(req)) } });
}

router.get('/:entityKey/records', loadEntity, async (req, res, next) => {
  try {
    // Advanced filter/sort/pagination (see recordQuery); AND'd with visibility.
    const { conditions, order, limit, offset } = recordQuery.build(req.entity, req.query);
    const where = {
      entityId: req.entity.id,
      [Op.and]: [await visibilityWhere(req), ...conditions],
    };
    const { count, rows } = await LcRecord.findAndCountAll({ where, order, limit, offset });
    res.json({ records: rows, total: count, limit, offset });
  } catch (e) { next(e); }
});

/**
 * Aggregate records server-side (group-by dimensions + measure aggregations).
 * ?groupBy=status,region&metrics=sum:amount,count:* — filters (?f.*) and the
 * caller's visibility both apply. See recordAggregate for the vocabulary.
 */
router.get('/:entityKey/aggregate', loadEntity, async (req, res, next) => {
  try {
    const { conditions } = recordQuery.build(req.entity, req.query);
    const where = { entityId: req.entity.id, [Op.and]: [await visibilityWhere(req), ...conditions] };
    const result = await recordAggregate.aggregate(req.entity, req.query, where);
    res.json(result);
  } catch (e) { if (e.status) return res.status(e.status).json({ error: 'BAD_AGGREGATE', message: e.message }); next(e); }
});

/**
 * Export visible records as CSV (default) or JSON. The same filter/sort/search
 * query params as the list route apply; declared BEFORE `/:id` so "export"
 * never resolves as a record id.
 */
router.get('/:entityKey/records/export', loadEntity, async (req, res, next) => {
  try {
    const { conditions, order } = recordQuery.build(req.entity, req.query);
    const where = { entityId: req.entity.id, [Op.and]: [await visibilityWhere(req), ...conditions] };
    const rows = await LcRecord.findAll({ where, order, limit: EXPORT_MAX_ROWS });
    if ((req.query.format || 'csv') === 'json') {
      res.setHeader('Content-Disposition', `attachment; filename="${req.entity.key}.json"`);
      return res.json({ entity: req.entity.key, records: rows });
    }
    const columns = [
      { key: 'id' },
      ...(req.entity.fields || []).map((f) => ({ key: f.key })),
      { key: 'state' }, { key: 'createdAt' }, { key: 'updatedAt' },
    ];
    const flat = rows.map((r) => ({ id: r.id, ...r.data, state: r.state, createdAt: r.createdAt && r.createdAt.toISOString(), updatedAt: r.updatedAt && r.updatedAt.toISOString() }));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${req.entity.key}.csv"`);
    res.send(csv.toCsv(columns, flat));
  } catch (e) { next(e); }
});

router.get('/:entityKey/records/:id', loadEntity, async (req, res, next) => {
  try {
    const record = await loadVisibleRecord(req);
    if (!record) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json({ record });
  } catch (e) { next(e); }
});

/**
 * Import records from CSV text or a JSON array. Each row is validated exactly
 * like a single create (types, uniqueness, references, storage fan-out, hook
 * events); invalid rows are reported per-row and skipped — never all-or-nothing.
 * Body: { csv: "..." } or { records: [{...}] }.
 */
router.post('/:entityKey/records/import', loadEntity, async (req, res, next) => {
  try {
    const body = req.body || {};
    let rows;
    if (typeof body.csv === 'string') {
      const parsed = csv.parseCsv(body.csv);
      // CSV headers may be field keys or labels — map labels back to keys.
      const byLabel = new Map((req.entity.fields || []).map((f) => [String(f.label || '').toLowerCase(), f.key]));
      const keys = new Set((req.entity.fields || []).map((f) => f.key));
      rows = parsed.rows.map((r) => {
        const out = {};
        for (const [h, v] of Object.entries(r)) {
          if (v === '') continue;
          if (keys.has(h)) out[h] = v;
          else if (byLabel.has(h.toLowerCase())) out[byLabel.get(h.toLowerCase())] = v;
        }
        return out;
      });
    } else if (Array.isArray(body.records)) {
      rows = body.records;
    } else {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'body must include csv (string) or records (array)' });
    }
    if (rows.length > IMPORT_MAX_ROWS) return res.status(400).json({ error: 'TOO_MANY_ROWS', message: `import supports at most ${IMPORT_MAX_ROWS} rows per call` });

    const results = { created: 0, failed: 0, errors: [] };
    for (let i = 0; i < rows.length; i += 1) {
      try {
        await entityService.createRecord(req.entity, rows[i], { ownerId: req.userId, userId: req.userId, authorization: req.get('authorization') });
        results.created += 1;
      } catch (err) {
        results.failed += 1;
        if (results.errors.length < 100) results.errors.push({ row: i + 1, errors: err.details || [err.message] });
      }
    }
    res.status(results.created ? 201 : 400).json(results);
  } catch (e) { next(e); }
});

/**
 * Bulk mutations in one call: { create: [data…], update: [{ id, data }…],
 * delete: [id…] }. Items are processed independently with per-item results
 * (index-aligned), capped at BULK_MAX_ITEMS total.
 */
router.post('/:entityKey/records/bulk', loadEntity, async (req, res, next) => {
  try {
    const { create = [], update = [], delete: remove = [] } = req.body || {};
    if (![create, update, remove].every(Array.isArray)) return res.status(400).json({ error: 'BAD_REQUEST', message: 'create/update/delete must be arrays' });
    if (create.length + update.length + remove.length > BULK_MAX_ITEMS) {
      return res.status(400).json({ error: 'TOO_MANY_ITEMS', message: `bulk supports at most ${BULK_MAX_ITEMS} items per call` });
    }
    const auth = req.get('authorization');
    const out = { created: [], updated: [], deleted: [] };

    for (const data of create) {
      try {
        const { _scopeType, _scopeId, ...rest } = data || {};
        const record = await entityService.createRecord(req.entity, rest, { ownerId: req.userId, userId: req.userId, scopeType: _scopeType, scopeId: _scopeId, authorization: auth });
        out.created.push({ ok: true, id: record.id });
      } catch (err) { out.created.push({ ok: false, errors: err.details || [err.message] }); }
    }
    for (const item of update) {
      try {
        const record = item && item.id ? await loadVisibleRecord(req, item.id) : null;
        if (!record) { out.updated.push({ ok: false, id: item && item.id, errors: ['not found'] }); continue; }
        await entityService.updateRecord(record, req.entity, (item && item.data) || {}, { userId: req.userId, authorization: auth });
        out.updated.push({ ok: true, id: record.id });
      } catch (err) { out.updated.push({ ok: false, id: item && item.id, errors: err.details || [err.message] }); }
    }
    for (const id of remove) {
      try {
        const record = id ? await loadVisibleRecord(req, id) : null;
        if (!record) { out.deleted.push({ ok: false, id, errors: ['not found'] }); continue; }
        await entityService.deleteRecord(record, req.entity, { authorization: auth });
        out.deleted.push({ ok: true, id });
      } catch (err) { out.deleted.push({ ok: false, id, errors: [err.message] }); }
    }
    res.json(out);
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
