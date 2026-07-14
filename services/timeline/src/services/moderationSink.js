'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * Timeline UGC moderation sink  (FEAT-009 / ADR 0004 §4.2)
 *
 * The TIMELINE side of the shared UGC text-moderation engine
 * (services/moderator/src/queues/ugcModeration.js + worker.js). This module is
 * the ONLY place that writes `timeline.post_moderation` and the ONLY place that
 * enforces a moderation verdict on `timeline.posts` — the moderator worker MUST
 * NOT touch either table directly (per-schema isolation, ADR 0004 §Consequences
 * 2). It is the published sink the worker's `ugcSinkRegistry` resolves for
 * `sourceService === 'timeline'`.
 *
 * Two directions:
 *   ── PRODUCER: `establishPostModerationState()` — the invariant every
 *      posts.content writer calls: PRE-CREATE the side-table row (pending) FIRST,
 *      then enqueue (fire-and-forget). Row existence, not the job, is the
 *      reconcile sweep's source of truth (§4.1).
 *   ── CONSUMER: `applyVerdict()` / `listStalePending()` — the sink contract the
 *      worker calls (in the worker process) and the authed HTTP action route
 *      calls (in the gateway process).
 *
 * Visibility posture (ADR 0004 §5b): TEXT IS FAIL-OPEN. A post is servable the
 * moment it is created; a later `rejected` verdict RETRACTS it (visibility→
 * private + socket retraction). `pending` text is held ONLY when
 * MODERATION_HOLD_TEXT_PENDING is on (default off). A MISSING row is servable
 * (legacy backfill correctness, mirrors filevault imageModerationService §66).
 * ═══════════════════════════════════════════════════════════════════════
 */

const { Op } = require('sequelize');
const logger = require('../utils/logger');

// The shared UGC queue lives in the moderator module. Required lazily so this
// sink can be pulled into the worker process (to consume) and the gateway
// process (to produce) without either building the Bull queue until first use —
// the same downward-require seam the atproto bridge uses.
// eslint-disable-next-line global-require
const ugcQueue = require('../../../moderator/src/queues/ugcModeration');

// Feature switch, deliberately separate from MODERATION_HOLD_TEXT_PENDING.
// "Moderation is not deployed" (skip enqueue entirely; missing row ⇒ servable;
// timeline behaves exactly as it did pre-FEAT-009) is a different state from
// "moderation is on but we don't hold pending text" (enqueue + report-only,
// fail-open) — collapsing them would either enqueue on deployments with no
// worker or hold text on deployments that never opted in.
const featureEnabled = () => process.env.TIMELINE_TEXT_MODERATION === 'true';

// The read-gate hold switch (default OFF ⇒ pending text is servable, §5b).
const holdPendingEnabled = () => process.env.MODERATION_HOLD_TEXT_PENDING === 'true';

// Statuses whose posts are servable to users other than the author.
// `pending` is servable UNLESS the hold flag is on (text fail-open). `failed`
// is servable — a scorer outage must never fail-CLOSE text (§5c). `rejected`
// is retracted at write time (visibility→private) so it is filtered by the
// normal visibility clause too; it is listed here for the getPostById path
// which bypasses that clause.
const HARD_HIDDEN = new Set(['rejected']);

// Moderator actions that auto-retract (mirror of worker REMOVE_ACTIONS).
const REMOVE_ACTIONS = new Set(['reject', 'remove', 'hide']);

// Socket.IO namespace, injected by timeline's registerSockets(). Null in the
// worker process — there the DB write + read-gate carry the retraction and no
// live emit is possible or needed.
let nsp = null;
function setNamespace(ns) { nsp = ns; }

// Lazy model access so require-time stays DB-free (unit tests inject fakes).
function models() {
  // eslint-disable-next-line global-require
  return require('../models');
}

function targetRoom(groupId) {
  return groupId ? `timeline:group:${groupId}` : 'timeline:global';
}

/**
 * The read-gate. `moderation` is a PostModeration row (or null).
 *   - null            → servable (predates FEAT-009 / not tracked). C6.
 *   - rejected        → NEVER servable to others.
 *   - pending         → servable UNLESS the hold flag is on (text fail-open).
 *   - approved/skipped/failed → servable.
 */
function isServableToOthers(moderation) {
  if (!moderation) return true;
  if (HARD_HIDDEN.has(moderation.status)) return false;
  if (moderation.status === 'pending' && holdPendingEnabled()) return false;
  return true;
}

/**
 * Filter a list of already-fetched posts down to what `requesterId` may see.
 * The author always sees their own posts. Cheap default: when the hold flag is
 * off AND nothing is hard-hidden, the common case needs no extra query — but a
 * `rejected` post is retracted to visibility:private at write time and is thus
 * already excluded by the feed's visibility clause, so this filter only does DB
 * work when the hold flag is on. Best-effort: on any error, return the input
 * unchanged (fail-open).
 */
async function filterServablePosts(posts, requesterId) {
  if (!Array.isArray(posts) || posts.length === 0) return posts;
  // Skip the query only when moderation is NOT deployed — then establish is a
  // no-op so there are no rows to consult and behavior is unchanged. When the
  // feature IS on we must consult even with the hold flag off, because a
  // `rejected` post must be hidden from others on EVERY surface, including the
  // group/user feeds that apply no visibility filter of their own.
  if (!featureEnabled() && !holdPendingEnabled()) return posts;
  try {
    const { PostModeration } = models();
    const ids = posts.map((p) => (p && (p.id || (p.get && p.get('id')))) ).filter(Boolean);
    if (ids.length === 0) return posts;
    const rows = await PostModeration.findAll({
      where: { postId: { [Op.in]: ids } },
      attributes: ['postId', 'status'],
    });
    const byId = new Map(rows.map((r) => [String(r.postId), r.status]));
    return posts.filter((p) => {
      const id = String(p.id || (p.get && p.get('id')));
      const userId = p.userId || (p.get && p.get('userId'));
      if (requesterId && String(userId) === String(requesterId)) return true;
      const status = byId.get(id);
      if (!status) return true; // missing row ⇒ servable (C6)
      return isServableToOthers({ status });
    });
  } catch (err) {
    logger.warn('post moderation read-gate skipped (fail-open)', { error: err.message });
    return posts;
  }
}

/**
 * THE producer invariant (ADR 0004 §4.1). Whenever a post's content is created
 * or rewritten, (re)establish its moderation state BEFORE the verdict lane can
 * act: PRE-CREATE/reset the side-table row (status='pending') FIRST, then
 * enqueue. Called from createPost, updatePost AND the Bluesky record.updated
 * webhook (the BUG-018 class: a content-byte-ingress path that bypasses
 * postService). `mode:'reset'` re-moderates an EDIT — it removes the stale job
 * (BUG-016) and clears the prior verdict (an old verdict does not describe new
 * bytes).
 *
 * Best-effort by contract: NEVER throws into the caller's request path
 * (fail-open write path, §5a). Awaits ONLY the row write (fast, guarantees the
 * row exists before any job can be processed — else the worker's compare-and-set
 * would miss and the content would never be scored); the enqueue is
 * fire-and-forget so Redis latency never touches the response.
 *
 * @param {object} args
 * @param {object} args.post  a Post instance/plain object with id, userId, content, groupId
 * @param {'create'|'reset'} [args.mode]
 * @returns {Promise<{status:string, reason:(string|null)}>}
 */
async function establishPostModerationState({ post, mode = 'create' }) {
  if (!featureEnabled()) {
    // Moderation not deployed: no row, no job. Missing row ⇒ servable, so
    // timeline behaves exactly as pre-FEAT-009. (Text is fail-open, so unlike
    // images we need no explicit 'skipped' row to justify servability.)
    return { status: 'skipped', reason: 'feature_disabled' };
  }

  const contentHash = ugcQueue.hashContent(post.content);

  try {
    const { PostModeration } = models();
    const resetFields = {
      status: 'pending', reason: null, action: null, contentHash,
      riskScore: null, verdict: null, moderationItemId: null,
      lastError: null, attempts: 0,
    };
    const existing = await PostModeration.findOne({ where: { postId: post.id } });
    if (existing) {
      await existing.update(resetFields);
    } else {
      await PostModeration.create({ postId: post.id, ...resetFields });
    }
  } catch (err) {
    // Row write failed — do NOT block the post. Fail-open: the post is served;
    // moderation simply did not get established this time.
    logger.error('could not establish post moderation row (post still served)', {
      postId: post.id, mode, error: err.message,
    });
    return { status: 'pending', reason: 'establish_error' };
  }

  // Fire-and-forget enqueue (never awaited into the response). If it is
  // swallowed (Redis down), the row stays pending and the reconcile sweep
  // re-enqueues it — row existence is the source of truth.
  ugcQueue.submitForModeration({
    sourceService: 'timeline',
    contentType: 'post',
    contentId: post.id,
    userId: post.userId || null,
    contentText: post.content,
    contentHash,
    contentMetadata: { groupId: post.groupId || null },
    mode,
  }).catch((err) => logger.error('submitForModeration threw (swallowed)', { postId: post.id, error: err.message }));

  return { status: 'pending', reason: null };
}

/**
 * THE sink contract (ADR 0004 §4.2). Write ONE post's verdict to
 * timeline.post_moderation with a content-hash COMPARE-AND-SET (BUG-022), then
 * enforce locally. Called by the worker (worker process) and the authed HTTP
 * action route (gateway process). NEVER throws into the reconcile/worker caller.
 *
 * @param {object} verdict  { sourceService, contentType, contentId, status,
 *   reason, action, riskScore, verdict, moderationItemId, contentHash,
 *   lastError, bumpAttempts }
 * @returns {Promise<{applied:boolean, superseded?:boolean, status?:string}>}
 */
async function applyVerdict(verdict) {
  const { PostModeration, Post, sequelize } = models();
  const {
    contentId, status, reason, action, riskScore,
    moderationItemId, contentHash, lastError, bumpAttempts,
  } = verdict;

  if (!contentId || !status) {
    return { applied: false };
  }

  // Compare-and-set: only touch the row while content_hash still matches — a
  // mid-flight EDIT changed the hash (a fresh job for the new bytes is already
  // queued), so a stale verdict must be DISCARDED (BUG-022). A human HTTP
  // decision may omit contentHash; then match on postId alone (a deliberate
  // human verdict is authoritative and is not gated on the hash).
  const where = { postId: String(contentId) };
  if (contentHash != null) where.contentHash = contentHash;

  const patch = {
    status,
    reason: reason != null ? reason : null,
    action: action != null ? action : null,
    riskScore: typeof riskScore === 'number' ? riskScore : null,
    verdict: verdict.verdict != null ? verdict.verdict : null,
    moderationItemId: moderationItemId != null ? moderationItemId : null,
  };
  if (lastError != null) patch.lastError = String(lastError).slice(0, 1000);
  if (bumpAttempts) patch.attempts = sequelize.literal('"attempts" + 1');

  let affected;
  try {
    [affected] = await PostModeration.update(patch, { where });
  } catch (err) {
    logger.error('applyVerdict: post_moderation update failed', { contentId, error: err.message });
    return { applied: false, error: err.message };
  }

  if (!affected) {
    // 0 rows: either the content was edited under us (hash moved) or the row is
    // absent (C6). Either way write NOTHING and do not resurrect the row.
    return { applied: false, superseded: true };
  }

  // Local enforcement. Only an ADVERSE verdict touches the hot `posts` row.
  const adverse = status === 'rejected' || REMOVE_ACTIONS.has(action);
  if (adverse) {
    try {
      const post = await Post.findByPk(String(contentId));
      if (post && !post.deleted) {
        await post.update({
          visibility: 'private',
          metadata: {
            ...(post.metadata || {}),
            moderation: {
              status: 'rejected',
              action: action || 'reject',
              reason: reason || 'flagged',
              riskScore: typeof riskScore === 'number' ? riskScore : null,
              moderationItemId: moderationItemId || null,
              at: new Date().toISOString(),
            },
          },
        });
        // Live retraction — only possible in the gateway process (nsp set by
        // registerSockets). No-op in the worker; the read-gate + visibility flip
        // already hide it on the next fetch.
        if (nsp) {
          nsp.to(targetRoom(post.groupId)).emit('post:retracted', {
            postId: post.id, groupId: post.groupId || null, reason: 'moderation',
          });
        }
      }
    } catch (err) {
      // The side-table verdict is written; the enforcement write failed. Report
      // it so the worker can retry (moderateContent is idempotent). Never throw.
      logger.error('applyVerdict: retraction enforcement failed', { contentId, error: err.message });
      return { applied: true, status, enforcementError: err.message };
    }
  }

  return { applied: true, status };
}

/**
 * Reconcile source (ADR 0004 §4.2 step 6). Rows stuck at status='pending' past
 * the grace window, shaped as re-submittable payloads. Reads ONLY the timeline
 * schema. Best-effort; never throws.
 */
async function listStalePending({ graceMs, limit } = {}) {
  try {
    const { PostModeration, Post } = models();
    const cutoff = new Date(Date.now() - (Number(graceMs) || 5 * 60 * 1000));
    const rows = await PostModeration.findAll({
      where: { status: 'pending', updatedAt: { [Op.lt]: cutoff } },
      include: [{ model: Post, as: 'post', attributes: ['id', 'userId', 'content', 'groupId', 'deleted'] }],
      order: [['updatedAt', 'ASC']],
      limit: Number(limit) || 500,
    });
    return rows
      .filter((r) => r.post && !r.post.deleted)
      .map((r) => ({
        sourceService: 'timeline',
        contentType: 'post',
        contentId: r.postId,
        userId: (r.post && r.post.userId) || null,
        contentText: (r.post && r.post.content) || null,
        contentUrl: null,
        contentMetadata: { groupId: (r.post && r.post.groupId) || null },
        contentHash: r.contentHash,
      }));
  } catch (err) {
    logger.error('listStalePending failed (returning none)', { error: err.message });
    return [];
  }
}

module.exports = {
  featureEnabled,
  holdPendingEnabled,
  isServableToOthers,
  filterServablePosts,
  establishPostModerationState,
  applyVerdict,
  listStalePending,
  setNamespace,
  REMOVE_ACTIONS,
};
