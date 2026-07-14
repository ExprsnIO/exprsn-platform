/**
 * ═══════════════════════════════════════════════════════════
 * Timeline moderation action sink  (FEAT-009 / ADR 0004 §4.2)
 *
 * POST /timeline/api/moderation/action
 *
 * The OUT-OF-PROCESS verdict seam. The moderator's `moderationActions.js`
 * (`_notifySourceService` → `${TIMELINE_SERVICE_URL}/api/moderation/action`)
 * POSTs a human/agent moderation decision here when it routes by sourceService.
 * It hits the SAME `moderationSink.applyVerdict` the in-process worker calls, so
 * enforcement (retract / metadata.moderation / socket retraction) is identical
 * whichever path a verdict arrives on.
 *
 * Gated by `authenticateService` from day one — an unauthenticated mutation sink
 * that can retract any post is exactly BUG-006. Fails closed (401) without valid
 * X-Service-ID / X-Service-Token headers.
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const { asyncHandler } = require('@exprsn/shared');
const { authenticateService } = require('../../../shared/middleware/auth');
const logger = require('../utils/logger');
const moderationSink = require('../services/moderationSink');

const router = express.Router();

// Map the moderator's action verb → a post_moderation status.
function statusForAction(action, explicitStatus) {
  if (explicitStatus) return explicitStatus;
  if (moderationSink.REMOVE_ACTIONS.has(action)) return 'rejected';
  if (action === 'approve') return 'approved';
  return null;
}

/**
 * POST /api/moderation/action
 * Body (from moderationActions): {
 *   action: 'remove'|'hide'|'reject'|'approve'|'flag',
 *   contentId | postId, contentType?, status?, reason?, riskScore?,
 *   moderationItemId?, contentHash?
 * }
 */
router.post('/action',
  authenticateService(),
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const contentId = body.contentId || body.postId;
    const action = body.action || null;
    const status = statusForAction(action, body.status);

    if (!contentId || !status) {
      return res.status(400).json({
        success: false,
        error: 'BAD_REQUEST',
        message: 'contentId (or postId) and a resolvable action/status are required',
      });
    }

    const result = await moderationSink.applyVerdict({
      sourceService: 'timeline',
      contentType: body.contentType || 'post',
      contentId,
      status,
      reason: body.reason || (status === 'rejected' ? 'flagged' : 'clean'),
      action,
      riskScore: typeof body.riskScore === 'number' ? body.riskScore : null,
      verdict: body.verdict || null,
      moderationItemId: body.moderationItemId || null,
      // Human decisions may omit contentHash → applyVerdict matches on postId
      // alone (a deliberate verdict is authoritative, not hash-gated).
      contentHash: body.contentHash != null ? body.contentHash : null,
    });

    logger.info('moderation action applied', {
      contentId, action, status, applied: !!(result && result.applied), superseded: !!(result && result.superseded),
    });

    return res.json({ success: true, ...result });
  })
);

module.exports = router;
