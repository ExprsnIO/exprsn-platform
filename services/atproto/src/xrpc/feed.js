/**
 * ═══════════════════════════════════════════════════════════
 * Bluesky feed generator XRPC
 *
 *   GET /xrpc/app.bsky.feed.describeFeedGenerator → { did, feeds:[{uri}] }
 *   GET /xrpc/app.bsky.feed.getFeedSkeleton?feed&limit&cursor
 *        → { cursor, feed: [{ post: <at-uri> }] }
 *
 * The "clean" feed = posts we've ingested (uri_case_map) minus any with an
 * ACTIVE !hide label (latest !hide row non-negated). Newest first, cursor by the
 * ingest timestamp (ms). Public — getFeedSkeleton service-auth JWT is ignored.
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const { Op } = require('sequelize');
const config = require('../../config');
const identityService = require('../labeler/identityService');
const feedRecord = require('../feed/feedRecord');

async function activeDid(models) {
  const active = await identityService.loadActive(models);
  return (active && active.did) || config.labeler.did || null;
}

/** Compute the set of URIs that are currently hidden by an active !hide label. */
async function hiddenUris(models, uris) {
  if (!uris.length) return new Set();
  const rows = await models.Label.findAll({
    where: { uri: { [Op.in]: uris }, val: '!hide' },
    order: [['seq', 'ASC']],
  });
  const latest = new Map(); // uri → latest !hide row (asc, last wins)
  for (const r of rows) latest.set(r.uri, r);
  return new Set([...latest.entries()].filter(([, r]) => !r.neg).map(([u]) => u));
}

function createFeedRouter(models) {
  const router = express.Router();

  router.get('/xrpc/app.bsky.feed.describeFeedGenerator', async (req, res) => {
    const did = await activeDid(models);
    if (!did) return res.status(404).json({ error: 'FeedGeneratorNotConfigured' });
    res.json(feedRecord.describe(did));
  });

  router.get('/xrpc/app.bsky.feed.getFeedSkeleton', async (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
      const cursor = req.query.cursor ? Number(req.query.cursor) : null;

      const where = {};
      if (cursor) where.created_at = { [Op.lt]: new Date(cursor) };

      // Overfetch so filtering hidden posts still fills the page.
      const rows = await models.UriCaseMap.findAll({
        where,
        order: [['created_at', 'DESC']],
        limit: limit * 3,
      });
      if (!rows.length) return res.json({ feed: [] });

      const hidden = await hiddenUris(models, rows.map((r) => r.uri));
      const visible = rows.filter((r) => !hidden.has(r.uri)).slice(0, limit);

      const feed = visible.map((r) => ({ post: r.uri }));
      const last = visible[visible.length - 1];
      const nextCursor = last ? String(new Date(last.createdAt).getTime()) : undefined;
      res.json({ cursor: nextCursor, feed });
    } catch (err) {
      res.status(500).json({ error: 'InternalServerError' });
    }
  });

  return router;
}

module.exports = { createFeedRouter };
