/**
 * ═══════════════════════════════════════════════════════════
 * Queue Builder Routes
 * Admin API for managing named review "buckets" (queues). Each bucket is a
 * spec persisted in moderator_config and (for redis backends) backed by a live
 * Bull queue. Mounted at /api/queues by the orchestrator.
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const logger = require('../src/utils/logger');
const requireAdmin = require('../src/middleware/requireAdmin');
const queueRegistry = require('../services/queueRegistry');

// Queue management is admin-only (read + write).
router.use(requireAdmin);

/** Merge each stats entry with its full spec for the list view. */
function mergeStatsWithSpecs(specs, stats) {
  const byName = new Map(stats.map((s) => [s.name, s]));
  return specs.map((spec) => ({ ...spec, ...(byName.get(spec.name) || {}) }));
}

/**
 * GET /api/queues
 * List all queues with live stats.
 */
router.get('/', async (req, res) => {
  try {
    await queueRegistry.ensureLiveQueues();
    const [specs, stats] = await Promise.all([queueRegistry.listQueues(), queueRegistry.stats()]);
    res.json({ success: true, queues: mergeStatsWithSpecs(specs, stats) });
  } catch (error) {
    logger.error('Failed to list queues', { error: error.message });
    res.status(500).json({ error: 'FETCH_FAILED', message: error.message });
  }
});

/**
 * GET /api/queues/:name
 * Get a single queue spec.
 */
router.get('/:name', async (req, res) => {
  try {
    const queue = await queueRegistry.getQueue(req.params.name);
    if (!queue) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Queue not found' });
    }
    res.json({ success: true, queue });
  } catch (error) {
    logger.error('Failed to get queue', { error: error.message });
    res.status(500).json({ error: 'FETCH_FAILED', message: error.message });
  }
});

/**
 * PUT /api/queues/:name
 * Create or update a queue spec.
 */
router.put('/:name', async (req, res) => {
  try {
    const spec = { ...req.body, name: req.body.name || req.params.name };
    const saved = await queueRegistry.saveQueue(spec, req.userId);
    await queueRegistry.ensureLiveQueues();
    res.json({ success: true, queue: saved });
  } catch (error) {
    logger.error('Failed to save queue', { error: error.message });
    const status = /invalid queue name/i.test(error.message) ? 400 : 500;
    res.status(status).json({ error: status === 400 ? 'INVALID_REQUEST' : 'SAVE_FAILED', message: error.message });
  }
});

/**
 * DELETE /api/queues/:name
 * Delete a queue spec + tear down its live queue.
 */
router.delete('/:name', async (req, res) => {
  try {
    await queueRegistry.deleteQueue(req.params.name);
    await queueRegistry.clearCache();
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete queue', { error: error.message });
    res.status(500).json({ error: 'DELETE_FAILED', message: error.message });
  }
});

/**
 * GET /api/queues/:name/stats
 * Stats for a single queue.
 */
router.get('/:name/stats', async (req, res) => {
  try {
    const queue = await queueRegistry.getQueue(req.params.name);
    if (!queue) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Queue not found' });
    }
    await queueRegistry.ensureLiveQueues();
    const all = await queueRegistry.stats();
    const stats = all.find((s) => s.name === queue.name) || null;
    res.json({ success: true, stats });
  } catch (error) {
    logger.error('Failed to get queue stats', { error: error.message });
    res.status(500).json({ error: 'FETCH_FAILED', message: error.message });
  }
});

/**
 * POST /api/queues/:name/test
 * Test whether sample content/scores match the queue's `match` condition tree.
 */
router.post('/:name/test', async (req, res) => {
  try {
    const queue = await queueRegistry.getQueue(req.params.name);
    if (!queue) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Queue not found' });
    }

    if (!queue.match) {
      // No match tree → never auto-routes; report unmatched.
      return res.json({ success: true, matched: false });
    }

    const { scores, contentType, sourceService, contentText, authorDid, riskScore, contentMetadata } = req.body;
    const ruleEngineService = require('../services/ruleEngineService');

    const content = {
      contentType,
      sourceService: sourceService || 'test',
      contentText,
      contentMetadata: contentMetadata || (authorDid ? { authorDid } : {}),
      authorDid
    };
    const testScores = { riskScore, ...(scores || {}) };

    const matched = await ruleEngineService.evaluateSingleRule(
      { conditions: queue.match, appliesTo: null, sourceServices: null, thresholdScore: null },
      content,
      testScores
    );

    res.json({ success: true, matched: !!matched });
  } catch (error) {
    logger.error('Failed to test queue', { error: error.message });
    res.status(500).json({ error: 'TEST_FAILED', message: error.message });
  }
});

// ── dead-letter management ───────────────────────────────────────────────────

/** GET /:name/dlq — inspect a bucket's dead-lettered items. */
router.get('/:name/dlq', async (req, res) => {
  try {
    const queue = await queueRegistry.getQueue(req.params.name);
    if (!queue) return res.status(404).json({ error: 'NOT_FOUND', message: 'Queue not found' });
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const { items, depth } = await queueRegistry.listDlq(req.params.name, limit);
    res.json({ success: true, items, depth });
  } catch (error) {
    logger.error('Failed to list DLQ', { error: error.message });
    res.status(500).json({ error: 'DLQ_LIST_FAILED', message: error.message });
  }
});

/** POST /:name/dlq/redrive — move dead-lettered items back onto the bucket. */
router.post('/:name/dlq/redrive', async (req, res) => {
  try {
    const queue = await queueRegistry.getQueue(req.params.name);
    if (!queue) return res.status(404).json({ error: 'NOT_FOUND', message: 'Queue not found' });
    const limit = Math.min(parseInt(req.body && req.body.limit, 10) || 100, 1000);
    const moved = await queueRegistry.redriveDlq(req.params.name, limit);
    res.json({ success: true, moved });
  } catch (error) {
    logger.error('Failed to redrive DLQ', { error: error.message });
    res.status(500).json({ error: 'DLQ_REDRIVE_FAILED', message: error.message });
  }
});

/** DELETE /:name/dlq — purge a bucket's dead-letter queue. */
router.delete('/:name/dlq', async (req, res) => {
  try {
    const queue = await queueRegistry.getQueue(req.params.name);
    if (!queue) return res.status(404).json({ error: 'NOT_FOUND', message: 'Queue not found' });
    const purged = await queueRegistry.purgeDlq(req.params.name);
    res.json({ success: true, purged });
  } catch (error) {
    logger.error('Failed to purge DLQ', { error: error.message });
    res.status(500).json({ error: 'DLQ_PURGE_FAILED', message: error.message });
  }
});

module.exports = router;
