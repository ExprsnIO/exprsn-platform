/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Timeline - Relationship Service (FEAT-011)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * The ONLY supported access point to the block/mute store
 * (timeline.user_relationships). Timeline code requires it directly; other
 * modules require it LAZILY inside the calling function (ADR 0003 §2c) — never
 * the model, never a loopback HTTP hop, never a shared/ client.
 *
 * The API is deliberately SET-RETURNING first: getSuppressedIds is the
 * read-path primitive (one query per request). isBlockedEitherWay is a single
 * pairwise check for WRITE paths ONLY — it must NEVER be called inside a
 * .map()/loop over a collection (that turns an N-item read into N+1 queries).
 *
 * Semantics (ADR §3):
 *   - block: directed row, BIDIRECTIONAL enforcement (A↮B suppressed), breaks
 *            follows both ways, never expires.
 *   - mute:  directed row, ONE-WAY silent suppression (A does not see B),
 *            optional expiresAt (temporary mute).
 */

const { Op } = require('sequelize');
const { UserRelationship, Follow } = require('../models');
const logger = require('../utils/logger');

/**
 * Build the unexpired-mute predicate for a mute row (ADR binding EXPIRED-MUTE
 * contract): a mute counts only while (expiresAt IS NULL OR expiresAt > now()).
 * Blocks never expire.
 */
function unexpiredMuteClause(now) {
  return {
    type: 'mute',
    [Op.or]: [
      { expiresAt: null },
      { expiresAt: { [Op.gt]: now } }
    ]
  };
}

/**
 * PRIMARY read-path primitive. Returns the set of user ids the viewer must not
 * see, in ONE query:
 *   (viewer blocked X)  ∪  (X blocked viewer)  ∪  (viewer muted X, unexpired)
 *
 * @param {string} viewerId
 * @returns {Promise<string[]>} deduped suppressed user ids
 */
async function getSuppressedIds(viewerId) {
  if (!viewerId) {
    return [];
  }

  const now = new Date();

  // ONE set-returning query (mirrors feedService.js Follow.findAll shape).
  const rows = (await UserRelationship.findAll({
    where: {
      [Op.or]: [
        // Outgoing edges from the viewer: any block OR an unexpired mute.
        {
          actorId: viewerId,
          [Op.or]: [
            { type: 'block' },
            unexpiredMuteClause(now)
          ]
        },
        // Incoming blocks: someone blocked the viewer (mutes are one-way, so
        // an incoming mute does NOT suppress).
        { targetId: viewerId, type: 'block' }
      ]
    },
    attributes: ['actorId', 'targetId', 'type']
  })) || [];

  // For an outgoing edge the suppressed id is the target; for an incoming
  // block it is the actor.
  const suppressed = new Set();
  for (const row of rows) {
    if (row.actorId === viewerId) {
      suppressed.add(row.targetId);
    } else {
      suppressed.add(row.actorId);
    }
  }

  return Array.from(suppressed);
}

/**
 * Outgoing blocks only ("who I blocked"). Internal helper.
 * @returns {Promise<string[]>}
 */
async function getBlockedIds(actorId) {
  if (!actorId) {
    return [];
  }
  const rows = await UserRelationship.findAll({
    where: { actorId, type: 'block' },
    attributes: ['targetId']
  });
  return rows.map(r => r.targetId);
}

/**
 * Incoming blocks only ("who blocked me"). INTERNAL server-side use only — this
 * is used to build the suppression set. It MUST NEVER be projected to a client:
 * an endpoint revealing who blocked the caller is a harassment vector (ADR §5).
 * @returns {Promise<string[]>}
 */
async function getBlockedByIds(targetId) {
  if (!targetId) {
    return [];
  }
  const rows = await UserRelationship.findAll({
    where: { targetId, type: 'block' },
    attributes: ['actorId']
  });
  return rows.map(r => r.actorId);
}

/**
 * WRITE-PATH ONLY pairwise check: is there a block edge in EITHER direction
 * between a and b? Used for contact rejection (like/comment/repost/follow/DM).
 * NEVER call this inside an iteration over a collection.
 * @returns {Promise<boolean>}
 */
async function isBlockedEitherWay(a, b) {
  if (!a || !b || a === b) {
    return false;
  }
  const row = await UserRelationship.findOne({
    where: {
      type: 'block',
      [Op.or]: [
        { actorId: a, targetId: b },
        { actorId: b, targetId: a }
      ]
    },
    attributes: ['id']
  });
  return !!row;
}

/**
 * Alias used by spark (FEAT-036): can the actor contact the target?
 * @returns {Promise<boolean>}
 */
async function canContact(actorId, targetId) {
  return !(await isBlockedEitherWay(actorId, targetId));
}

/**
 * Block target. Creates the directed block edge (idempotent) and BREAKS any
 * Follow in BOTH directions inside the same operation (the follow-break).
 * @returns {Promise<UserRelationship>}
 */
async function block(actorId, targetId, { reason = null } = {}) {
  if (!actorId || !targetId) {
    throw new Error('actorId and targetId are required');
  }
  if (actorId === targetId) {
    throw new Error('Cannot block yourself');
  }

  const [relationship] = await UserRelationship.findOrCreate({
    where: { actorId, targetId, type: 'block' },
    defaults: { actorId, targetId, type: 'block', reason }
  });

  // Follow-break: destroy the follow edge both ways (destructive; NOT restored
  // on unblock). Intra-module Follow.destroy — no cross-module call.
  await Follow.destroy({
    where: {
      [Op.or]: [
        { followerId: actorId, followingId: targetId },
        { followerId: targetId, followingId: actorId }
      ]
    }
  });

  logger.info('User blocked', { actorId, targetId });
  return relationship;
}

/**
 * Undo a block. Does NOT restore broken follows (ADR §3).
 * @returns {Promise<{ success: boolean }>}
 */
async function unblock(actorId, targetId) {
  await UserRelationship.destroy({
    where: { actorId, targetId, type: 'block' }
  });
  logger.info('User unblocked', { actorId, targetId });
  return { success: true };
}

/**
 * Mute target (one-way, silent). Optional expiresAt for a temporary mute.
 * Idempotent: re-muting updates expiresAt.
 * @returns {Promise<UserRelationship>}
 */
async function mute(actorId, targetId, { expiresAt = null, reason = null } = {}) {
  if (!actorId || !targetId) {
    throw new Error('actorId and targetId are required');
  }
  if (actorId === targetId) {
    throw new Error('Cannot mute yourself');
  }

  const [relationship, created] = await UserRelationship.findOrCreate({
    where: { actorId, targetId, type: 'mute' },
    defaults: { actorId, targetId, type: 'mute', expiresAt, reason }
  });

  if (!created) {
    relationship.expiresAt = expiresAt;
    if (reason !== null) {
      relationship.reason = reason;
    }
    await relationship.save();
  }

  logger.info('User muted', { actorId, targetId, expiresAt });
  return relationship;
}

/**
 * Undo a mute.
 * @returns {Promise<{ success: boolean }>}
 */
async function unmute(actorId, targetId) {
  await UserRelationship.destroy({
    where: { actorId, targetId, type: 'mute' }
  });
  logger.info('User unmuted', { actorId, targetId });
  return { success: true };
}

/**
 * List the actor's OWN OUTGOING edges only (ADR §5 — never incoming). Optional
 * type filter ('block' | 'mute').
 * @returns {Promise<UserRelationship[]>}
 */
async function listRelationships(actorId, { type } = {}) {
  if (!actorId) {
    return [];
  }
  const where = { actorId };
  if (type) {
    where.type = type;
  }
  return UserRelationship.findAll({
    where,
    order: [['createdAt', 'DESC']]
  });
}

module.exports = {
  getSuppressedIds,
  getBlockedIds,
  getBlockedByIds,
  isBlockedEitherWay,
  canContact,
  block,
  unblock,
  mute,
  unmute,
  listRelationships
};
