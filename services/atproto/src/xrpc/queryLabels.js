/**
 * ═══════════════════════════════════════════════════════════
 * GET /xrpc/com.atproto.label.queryLabels
 *
 * Paginated HTTP query over the labels we've emitted. Params:
 *   uriPatterns (required, repeated) — exact or trailing-'*' prefix match; '*'
 *                                      matches all.
 *   sources (optional, repeated)     — filter by issuer DID(s).
 *   limit  (1..250, default 50)
 *   cursor (opaque; the last seq returned)
 * Returns { cursor, labels: [...] } with labels in atproto JSON form.
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const { Op } = require('sequelize');
const labelService = require('../labeler/labelService');

function arr(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function buildUriWhere(patterns) {
  // '*' alone → no uri constraint.
  if (patterns.some((p) => p === '*')) return null;
  const clauses = patterns.map((p) =>
    p.endsWith('*') ? { uri: { [Op.like]: `${p.slice(0, -1)}%` } } : { uri: p }
  );
  return clauses.length === 1 ? clauses[0] : { [Op.or]: clauses };
}

function createQueryLabelsRouter(models) {
  const router = express.Router();

  router.get('/xrpc/com.atproto.label.queryLabels', async (req, res) => {
    try {
      const patterns = arr(req.query.uriPatterns);
      if (patterns.length === 0) {
        return res.status(400).json({ error: 'InvalidRequest', message: 'uriPatterns is required' });
      }
      const sources = arr(req.query.sources);
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 250);
      const cursor = req.query.cursor ? String(req.query.cursor) : null;

      const where = { [Op.and]: [] };
      const uriWhere = buildUriWhere(patterns);
      if (uriWhere) where[Op.and].push(uriWhere);
      if (sources.length) where[Op.and].push({ src: { [Op.in]: sources } });
      if (cursor) where[Op.and].push({ seq: { [Op.gt]: cursor } });

      const rows = await models.Label.findAll({
        where,
        order: [['seq', 'ASC']],
        limit,
      });

      const labels = rows.map((r) => labelService.serializeForJson(r));
      const nextCursor = rows.length ? String(rows[rows.length - 1].seq) : undefined;
      return res.json({ cursor: nextCursor, labels });
    } catch (err) {
      req.log?.error?.('queryLabels failed', { error: err.message });
      return res.status(500).json({ error: 'InternalServerError' });
    }
  });

  return router;
}

module.exports = { createQueryLabelsRouter };
