/**
 * ═══════════════════════════════════════════════════════════
 * /atproto ops routes (JSON API, mounted at the module prefix)
 *
 * Operational + admin surface for the bridge: health, identity status, the
 * service-record declaration, label stats, and manual labeling. Mutating
 * endpoints are guarded by adminGuard — a platform-admin CA bearer (so console
 * operators can act) OR the admin service token (server-to-server).
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const config = require('../../config');
const identityService = require('../labeler/identityService');
const labelService = require('../labeler/labelService');
const { verifyInboundLabel } = require('../labeler/labelVerifier');
const { moderationQueue } = require('../ingest/queue');
const { enqueueNegation } = require('../ingest/enqueue');
const { subscribe, unsubscribe } = require('../ingest/labelConsumer');
const { adminGuard } = require('../middleware/adminGuard');

function createOpsRouter(models) {
  const router = express.Router();

  router.get('/health', (req, res) => {
    res.json({ ok: true, enabled: config.enabled, transport: config.firehose.transport });
  });

  router.get('/identity', async (req, res) => {
    const active = await identityService.loadActive(models);
    res.json({
      did: (active && active.did) || config.labeler.did || null,
      method: (active && active.didMethod) || config.labeler.didMethod,
      publicKeyMultibase: active ? active.publicKeyMultibase : null,
      published: active ? Boolean(active.publishedAt) : false,
      host: config.labeler.host,
    });
  });

  router.get('/service-record', (req, res) => {
    res.json(identityService.buildServiceRecord(config.labeler.labelValues));
  });

  // The app.bsky.feed.generator record to publish (rkey from config).
  router.get('/feed-record', async (req, res) => {
    const feedRecord = require('../feed/feedRecord');
    const active = await identityService.loadActive(models);
    const did = (active && active.did) || config.labeler.did;
    if (!did) return res.status(404).json({ error: 'no_identity' });
    res.json({ rkey: config.feed.rkey, uri: feedRecord.feedUri(did), record: feedRecord.buildGeneratorRecord(did) });
  });

  router.get('/stats', async (req, res) => {
    try {
      const [total, max, inbound, counts] = await Promise.all([
        models.Label.count(),
        models.Label.max('seq'),
        models.InboundLabel.count(),
        moderationQueue.getJobCounts(),
      ]);
      res.json({ labels: { total, lastSeq: max || 0 }, inboundLabels: inbound, queue: counts });
    } catch (err) {
      res.status(500).json({ error: 'stats_failed' });
    }
  });

  // Inbound labels consumed from external labelers (INGEST). Filter by uri/src.
  router.get('/inbound-labels', async (req, res) => {
    try {
      const where = {};
      if (req.query.uri) where.uri = String(req.query.uri);
      if (req.query.src) where.src = String(req.query.src);
      if (req.query.verified != null) where.verified = String(req.query.verified) === 'true';
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 250);
      const rows = await models.InboundLabel.findAll({ where, order: [['created_at', 'DESC']], limit });
      res.json({
        labels: rows.map((r) => ({
          labeler: r.labelerEndpoint, src: r.src, uri: r.uri, val: r.val,
          neg: r.neg, verified: r.verified, cts: r.cts, srcSeq: r.srcSeq != null ? String(r.srcSeq) : null,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: 'inbound_query_failed' });
    }
  });

  // Status of the labelers we subscribe to.
  router.get('/external-labelers', async (req, res) => {
    try {
      const rows = await models.ExternalLabeler.findAll({ order: [['endpoint', 'ASC']] });
      res.json({
        labelers: rows.map((r) => ({
          endpoint: r.endpoint, did: r.did, cursor: r.cursor != null ? String(r.cursor) : null,
          active: r.active, status: r.status, lastConnectedAt: r.lastConnectedAt,
          lastEventAt: r.lastEventAt, connectAttempts: r.connectAttempts,
          heartbeatAt: r.heartbeatAt, lastError: r.lastError,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: 'labelers_query_failed' });
    }
  });

  // Subscribe to an external labeler (admin). `labeler` is a DID or wss URL. The
  // worker reconciles and connects within its interval (~15s).
  router.post('/external-labelers', adminGuard, async (req, res) => {
    const { labeler } = req.body || {};
    if (!labeler) return res.status(400).json({ error: 'invalid_request', message: 'labeler (DID or wss URL) required' });
    try {
      const row = await subscribe(models, String(labeler));
      res.status(201).json({ endpoint: row.endpoint, did: row.did, active: row.active });
    } catch (err) {
      res.status(400).json({ error: 'subscribe_failed', message: err.message });
    }
  });

  // Unsubscribe (admin). Deactivates by default (keeps cursor); ?purge=true deletes.
  router.delete('/external-labelers', adminGuard, async (req, res) => {
    const endpoint = (req.body && req.body.endpoint) || req.query.endpoint;
    if (!endpoint) return res.status(400).json({ error: 'invalid_request', message: 'endpoint required' });
    try {
      const row = await unsubscribe(models, String(endpoint), { purge: String(req.query.purge) === 'true' });
      if (!row) return res.status(404).json({ error: 'not_found' });
      res.json({ endpoint: String(endpoint), active: false, purged: Boolean(row.purged) });
    } catch (err) {
      res.status(400).json({ error: 'unsubscribe_failed', message: err.message });
    }
  });

  // Verify an inbound label (INGEST): resolve its issuer DID and check the sig.
  // Open endpoint — verification is a pure read with no side effects.
  router.post('/labels/verify', async (req, res) => {
    const label = req.body || {};
    if (!label.src || !label.sig) {
      return res.status(400).json({ error: 'invalid_request', message: 'src and sig required' });
    }
    try {
      const result = await verifyInboundLabel(label);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: 'verify_failed', message: err.message });
    }
  });

  // Manual label / negation (admin).
  router.post('/labels', adminGuard, async (req, res) => {
    const { uri, val, cid = null, neg = false } = req.body || {};
    if (!uri || !val) return res.status(400).json({ error: 'invalid_request', message: 'uri and val required' });
    try {
      labelService.init(models);
      const row = await labelService.createLabel({ uri, val, cid, neg });
      if (!row) return res.status(409).json({ error: 'no_identity', message: 'labeler identity not provisioned' });
      res.status(201).json({ seq: String(row.seq), uri, val, neg });
    } catch (err) {
      res.status(500).json({ error: 'label_failed', message: err.message });
    }
  });

  // Negate ALL our active labels for a URI (admin). Routed through the worker
  // (single writer) via a negate-atproto job, so seq ordering is preserved.
  router.post('/labels/negate', adminGuard, async (req, res) => {
    const { uri, reason = 'manual' } = req.body || {};
    if (!uri) return res.status(400).json({ error: 'invalid_request', message: 'uri required' });
    try {
      await enqueueNegation(uri, reason);
      res.status(202).json({ status: 'queued', uri, reason });
    } catch (err) {
      res.status(500).json({ error: 'negate_failed', message: err.message });
    }
  });

  return router;
}

module.exports = { createOpsRouter };
