/**
 * ═══════════════════════════════════════════════════════════
 * Spark moderation action sink  (FEAT-009 / ADR 0004 §4.2)
 *
 * POST /spark/api/moderation/action
 *
 * The OUT-OF-PROCESS seam a human/admin moderator decision reaches spark
 * through (moderator's `moderationActions.js` POSTs here, routed by
 * sourceService). It is `authenticateService`-gated from day one — an
 * unauthenticated mutation sink that can redact any message is exactly BUG-006.
 *
 * The handler delegates to the SAME `moderationSink.applyVerdict` the in-process
 * worker path uses, so enforcement (content-hash compare-and-set + redact +
 * `message:redacted` emit on /spark) is identical whichever path lands. Because
 * this route runs in the gateway (where `registerSockets` called `setIo`), the
 * retraction here DOES reach connected clients in real time.
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const { authenticateService } = require('@exprsn/shared/middleware/auth');
const logger = require('../utils/logger');
const sink = require('../services/moderationSink');

const router = express.Router();

router.post('/action', authenticateService(), async (req, res) => {
  const body = req.body || {};
  if (!body.contentId || !body.status) {
    return res.status(400).json({ error: 'contentId and status are required' });
  }

  try {
    const result = await sink.applyVerdict({
      sourceService: 'spark',
      contentType: body.contentType || 'message',
      contentId: body.contentId,
      status: body.status,
      reason: body.reason,
      action: body.action,
      riskScore: body.riskScore,
      verdict: body.verdict,
      moderationItemId: body.moderationItemId,
      contentHash: body.contentHash,
      lastError: body.lastError,
      bumpAttempts: body.bumpAttempts,
    });
    return res.json({ ok: true, ...result });
  } catch (err) {
    logger.error('spark moderation action failed', {
      contentId: body.contentId, error: err.message,
    });
    return res.status(500).json({ error: 'moderation action failed' });
  }
});

module.exports = router;
