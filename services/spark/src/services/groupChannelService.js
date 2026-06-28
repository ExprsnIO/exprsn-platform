/**
 * ═══════════════════════════════════════════════════════════
 * Group Channel Service (Phase 4)
 *
 * Auto-provisioning and live authorization for nexus group-bound
 * conversations. Every group gets exactly two channels:
 *
 *   - 'chat'         — all members read + write
 *   - 'announcement' — all members read, only admins/owners write
 *
 * Authorization for group-bound conversations is resolved LIVE from nexus via
 * the shared membership guard's resolveMembership() (service-to-service HMAC,
 * Redis-cached) so a stale local Participant row can never grant access after a
 * user has been removed from the group.
 * ═══════════════════════════════════════════════════════════
 */

const { resolveMembership } = require('@exprsn/shared/middleware/groupMembership');
const { Conversation, Participant } = require('../models');

const CHANNEL_KINDS = ['chat', 'announcement'];

// nexus roles: owner > admin > moderator > member.
// Participant.role enum is owner|admin|member, so collapse moderator -> member.
function mapNexusRoleToParticipantRole(role) {
  if (role === 'owner') return 'owner';
  if (role === 'admin') return 'admin';
  return 'member';
}

// Who may WRITE to a given channel kind, by nexus role.
function canWriteChannel(channelKind, nexusRole) {
  if (channelKind === 'announcement') {
    return nexusRole === 'admin' || nexusRole === 'owner';
  }
  return true; // 'chat' and any non-group conversation
}

function channelLabel(channelKind) {
  return channelKind === 'announcement' ? 'Announcements' : 'General';
}

/**
 * Ensure both channels exist for a group, creating any that are missing.
 * @param {string} groupId
 * @param {string} createdBy - userId to record as creator on first creation
 * @returns {Promise<{chat: Object, announcement: Object}>}
 */
async function ensureGroupChannels(groupId, createdBy) {
  const channels = {};
  for (const kind of CHANNEL_KINDS) {
    // NOTE: there is no DB unique constraint on (group_id, channel_kind), only
    // an index, so two truly-concurrent first-access requests could in theory
    // create a duplicate. Acceptable for MVP; a partial unique index is a
    // follow-up if it proves a problem.
    const [conversation] = await Conversation.findOrCreate({
      where: { groupId, channelKind: kind },
      defaults: {
        type: 'group',
        groupId,
        channelKind: kind,
        name: channelLabel(kind),
        createdBy
      }
    });
    channels[kind] = conversation;
  }
  return channels;
}

/**
 * Ensure a group member has an (active) Participant row for a conversation,
 * keeping its role roughly in sync with their nexus role. This is "sync on
 * access". A full join/leave webhook sync from nexus is a future follow-up;
 * live authorization does not depend on these rows for group conversations.
 * @param {string} conversationId
 * @param {string} userId
 * @param {string} nexusRole
 * @returns {Promise<Object>} the Participant
 */
async function ensureParticipant(conversationId, userId, nexusRole) {
  const role = mapNexusRoleToParticipantRole(nexusRole);
  const [participant, created] = await Participant.findOrCreate({
    where: { conversationId, userId },
    defaults: { conversationId, userId, role, active: true }
  });

  if (!created) {
    let changed = false;
    if (!participant.active) {
      participant.active = true;
      participant.leftAt = null;
      changed = true;
    }
    if (participant.role !== role) {
      participant.role = role;
      changed = true;
    }
    if (changed) await participant.save();
  }

  return participant;
}

/**
 * Authorize a user against a (possibly group-bound) conversation, resolving
 * membership LIVE from nexus. For non-group conversations this is a no-op
 * (returns ok: true) and the caller's local Participant check governs.
 *
 * @param {Object} conversation - a Conversation instance/row (must have groupId, channelKind)
 * @param {string} userId
 * @param {Object} opts
 * @param {boolean} opts.write - true to also enforce write permission for the channel
 * @returns {Promise<{ok: boolean, code?: string, message?: string, role?: string}>}
 */
async function authorizeConversationAccess(conversation, userId, opts = {}) {
  if (!conversation || !conversation.groupId) {
    return { ok: true };
  }

  const membership = await resolveMembership(conversation.groupId, userId);

  if (membership._error === 'not_found') {
    return { ok: false, code: 'GROUP_NOT_FOUND', message: 'Group not found' };
  }
  if (membership._error === 'unavailable') {
    return {
      ok: false,
      code: 'MEMBERSHIP_SERVICE_UNAVAILABLE',
      message: 'Unable to verify group membership'
    };
  }
  if (!membership.isMember) {
    return {
      ok: false,
      code: 'NOT_GROUP_MEMBER',
      message: 'You must be a member of this group'
    };
  }

  if (opts.write && !canWriteChannel(conversation.channelKind, membership.role)) {
    return {
      ok: false,
      code: 'ANNOUNCEMENT_ADMIN_ONLY',
      message: 'Only group admins can post to the announcement channel',
      role: membership.role
    };
  }

  return { ok: true, role: membership.role };
}

module.exports = {
  CHANNEL_KINDS,
  mapNexusRoleToParticipantRole,
  canWriteChannel,
  ensureGroupChannels,
  ensureParticipant,
  authorizeConversationAccess
};
