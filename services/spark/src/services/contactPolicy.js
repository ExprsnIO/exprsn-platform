/**
 * ═══════════════════════════════════════════════════════════
 * Contact Policy — FEAT-070 spark block enforcement
 * ═══════════════════════════════════════════════════════════
 *
 * The ONE audited guard for every spark surface where user A can reach user B
 * (FEAT-011 ADR: S1 create-direct, S2 send, S3 add-participant, S4/S5 read
 * suppression, N2 notification suppression). Every Message.create/contact site
 * routes through here — do NOT re-implement per-site checks.
 *
 * Access contract: timeline's PUBLISHED relationship façade, LAZILY required
 * in-process (FEAT-011 ADR Decision 2 / ADR 0003 §2c). Never timeline models,
 * never cross-schema SQL, never a *_SERVICE_URL loopback hop.
 *
 * Semantics (FEAT-011 ADR §3):
 *  - Only DIRECT (1:1) contact is severed. Spark group conversations and
 *    nexus group-bound channels (conversation.groupId) are EXEMPT — group
 *    membership is the group admin's domain, never the block's.
 *  - Existing conversations are FROZEN, not deleted: new sends 403, history
 *    persists (suppressed-sender messages are filtered at read time).
 *  - No surface may reveal WHO blocked the caller. Rejection messages are
 *    generic ("You cannot ..."), matching timeline's FEAT-011 wording. The
 *    403-on-attempt itself is the only permitted signal (ADR §3).
 *
 * FAIL-CLOSED: if the relationship lookup itself fails, the write is REJECTED
 * (FEAT-011 precedent — a façade error aborts the timeline write too), but via
 * ContactCheckError (non-operational, surfaces as a generic 500 "Internal
 * server error"), NOT the 403 contact message — so a transient outage never
 * masquerades as a block signal in either direction.
 */

const { Conversation, Participant } = require('../models');
const logger = require('../utils/logger');

/** Generic 403 for conversation-scoped sends (S2 + reply/forward). */
const CONTACT_FORBIDDEN_CONVERSATION = 'You cannot send messages to this conversation';
/** Generic 403 for user-targeted ops (S1 create-direct, S3 add-participant). */
const CONTACT_FORBIDDEN_USER = 'You cannot interact with this user';

/**
 * Operational 403 — safe to surface. Message is deliberately generic (no
 * "block" oracle beyond the 403 the ADR permits).
 */
class ContactForbiddenError extends Error {
  constructor(message = CONTACT_FORBIDDEN_CONVERSATION) {
    super(message);
    this.name = 'ContactForbiddenError';
    this.statusCode = 403;
    this.errorCode = 'FORBIDDEN';
    this.isOperational = true;
  }
}

/**
 * Relationship lookup failed — fail closed. NON-operational on purpose: the
 * shared errorHandler masks it as a generic internal error, and socket/route
 * catch blocks emit their standard generic failure.
 */
class ContactCheckError extends Error {
  constructor(cause) {
    super('Contact policy check failed');
    this.name = 'ContactCheckError';
    this.statusCode = 500;
    this.errorCode = 'INTERNAL_ERROR';
    this.cause = cause;
  }
}

/**
 * Lazy in-process require of timeline's published façade (the ADR-blessed
 * boundary). Lazy so no eager require cycle can form between modules.
 */
function getRelationshipService() {
  // eslint-disable-next-line global-require
  return require('../../../timeline/src/services/relationshipService');
}

/** Accepts a Conversation instance/plain object or an id. */
async function resolveConversation(conversationOrId) {
  if (!conversationOrId) return null;
  if (typeof conversationOrId === 'object' && conversationOrId.id) {
    return conversationOrId;
  }
  return Conversation.findByPk(conversationOrId);
}

/**
 * Enforcement applies ONLY to direct (1:1), non-group-bound conversations
 * (ADR §3 — group-channel/group-conversation exempt).
 */
function isEnforceableDirect(conversation) {
  return !!conversation && conversation.type === 'direct' && !conversation.groupId;
}

/** The other active participant ids of a conversation (bounded: direct = 1). */
async function getCounterpartIds(conversationId, userId) {
  const participants = await Participant.findAll({
    where: { conversationId, active: true },
    attributes: ['userId']
  });
  return [...new Set(
    participants.map((p) => p.userId).filter((id) => id && id !== userId)
  )];
}

/**
 * S2 guard (socket send:message, messageService.sendMessage, thread reply).
 * Throws ContactForbiddenError (403) when the direct counterpart is blocked
 * either way; ContactCheckError when the lookup fails (fail-closed). Resolves
 * silently for group / group-bound conversations (exempt) and for a missing
 * conversation (existence is the caller's 404 concern, not the guard's).
 */
async function assertCanContact(senderId, conversationOrId) {
  const conversation = await resolveConversation(conversationOrId);
  if (!isEnforceableDirect(conversation)) {
    return;
  }

  const counterpartIds = await getCounterpartIds(conversation.id, senderId);
  try {
    const relationshipService = getRelationshipService();
    // Bounded pairwise checks (direct conversation ⇒ one counterpart) — the
    // write-path form the ADR reserves isBlockedEitherWay for.
    for (const counterpartId of counterpartIds) {
      // eslint-disable-next-line no-await-in-loop
      if (await relationshipService.isBlockedEitherWay(senderId, counterpartId)) {
        throw new ContactForbiddenError(CONTACT_FORBIDDEN_CONVERSATION);
      }
    }
  } catch (err) {
    if (err instanceof ContactForbiddenError) throw err;
    logger.warn('FEAT-070 contact check failed — rejecting send (fail-closed)', {
      conversationId: conversation.id,
      error: err.message
    });
    throw new ContactCheckError(err);
  }
}

/**
 * S1/S3 guard (create direct conversation, add participant): may the actor
 * initiate contact with each of targetIds? Throws ContactForbiddenError (403,
 * user-flavored message) / ContactCheckError (fail-closed).
 */
async function assertCanContactUsers(actorId, targetIds) {
  const targets = [...new Set((targetIds || []).filter((id) => id && id !== actorId))];
  if (targets.length === 0) return;

  try {
    const relationshipService = getRelationshipService();
    for (const targetId of targets) {
      // eslint-disable-next-line no-await-in-loop
      if (await relationshipService.isBlockedEitherWay(actorId, targetId)) {
        throw new ContactForbiddenError(CONTACT_FORBIDDEN_USER);
      }
    }
  } catch (err) {
    if (err instanceof ContactForbiddenError) throw err;
    logger.warn('FEAT-070 contact check failed — rejecting (fail-closed)', {
      actorId,
      error: err.message
    });
    throw new ContactCheckError(err);
  }
}

/**
 * Boolean form for surfaces that silently skip instead of erroring (forward
 * targets, typing indicators). NEVER throws: false on block AND false when the
 * lookup fails (fail-closed skip).
 */
async function canContactInConversation(senderId, conversationOrId) {
  try {
    await assertCanContact(senderId, conversationOrId);
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * S4/S5 read primitive: the viewer's suppressed-id set (blocks both ways +
 * viewer's unexpired mutes), one façade call per request. Errors propagate —
 * a read that cannot be filtered fails rather than leaking (matches timeline's
 * FEAT-011 read paths).
 */
async function getSuppressedIds(viewerId) {
  if (!viewerId) return [];
  const relationshipService = getRelationshipService();
  return (await relationshipService.getSuppressedIds(viewerId)) || [];
}

/**
 * S4 helper: which of these conversations must be hidden from the viewer's
 * list? A direct conversation is hidden when its counterpart is in the
 * viewer's suppressed set. Group/group-bound conversations are never hidden.
 * Two set queries total — no per-conversation lookups.
 *
 * @param {string} viewerId
 * @param {Array<{id: string, type: string, groupId?: string}>} conversations
 * @returns {Promise<Set<string>>} conversation ids to hide
 */
async function getHiddenConversationIds(viewerId, conversations) {
  const hidden = new Set();
  const directIds = (conversations || [])
    .filter((c) => isEnforceableDirect(c))
    .map((c) => c.id);
  if (directIds.length === 0) return hidden;

  const suppressed = await getSuppressedIds(viewerId);
  if (suppressed.length === 0) return hidden;

  const { Op } = require('sequelize');
  const rows = await Participant.findAll({
    where: {
      conversationId: { [Op.in]: directIds },
      userId: { [Op.in]: suppressed }
    },
    attributes: ['conversationId']
  });
  for (const row of rows) hidden.add(row.conversationId);
  return hidden;
}

/**
 * N2 guard: drop recipients whose own suppressed set contains the sender —
 * i.e. block either way (bidirectional) OR the recipient muted the sender
 * (one-way, muter-only), exactly the ADR §3 notification matrix. Per-recipient
 * set lookups are bounded by conversation membership (the ADR's N1b-shaped
 * bounded loop, not the feed N+1). NEVER throws; a failed lookup DROPS the
 * notification (fail-closed).
 *
 * @returns {Promise<string[]>} recipient ids still notifiable
 */
async function filterNotifiableRecipients(senderId, recipientIds) {
  const candidates = (recipientIds || []).filter((id) => id && id !== senderId);
  if (candidates.length === 0) return [];

  const relationshipService = getRelationshipService();
  const results = await Promise.all(
    candidates.map(async (recipientId) => {
      try {
        const suppressed = (await relationshipService.getSuppressedIds(recipientId)) || [];
        return suppressed.includes(senderId) ? null : recipientId;
      } catch (err) {
        logger.warn('FEAT-070 notification suppression check failed — dropping (fail-closed)', {
          recipientId,
          error: err.message
        });
        return null;
      }
    })
  );
  return results.filter(Boolean);
}

module.exports = {
  ContactForbiddenError,
  ContactCheckError,
  CONTACT_FORBIDDEN_CONVERSATION,
  CONTACT_FORBIDDEN_USER,
  assertCanContact,
  assertCanContactUsers,
  canContactInConversation,
  getSuppressedIds,
  getHiddenConversationIds,
  filterNotifiableRecipients
};
