'use strict';

/**
 * Room-membership predicate — the ONE definition of "is this user a member of
 * this room", extracted from roomCollab's requireRoomMember middleware
 * (TASK-057) so the route middleware and the RoomFile capability adapter
 * (roomFileCapabilityAdapter.js) enforce the identical rule and can never
 * drift apart.
 *
 * A member is the host, an active participant, an invitee (pending/accepted),
 * or an approved join-requester — the same signals the join flow honors.
 */

const { Participant, RoomInvite, RoomJoinRequest } = require('../models');

/**
 * @param {object} room   Room row (host_id + id are read)
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
async function isRoomMember(room, userId) {
  if (String(room.host_id) === String(userId)) return true;
  const [participant, invite, joinReq] = await Promise.all([
    Participant.findOne({ where: { room_id: room.id, user_id: userId } }),
    RoomInvite.findOne({ where: { room_id: room.id, invitee_id: userId, status: ['pending', 'accepted'] } }),
    RoomJoinRequest.findOne({ where: { room_id: room.id, user_id: userId, status: 'approved' } })
  ]);
  return Boolean(participant || invite || joinReq);
}

module.exports = { isRoomMember };
