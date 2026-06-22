const { GroupMembership, Group, JoinRequest, GroupInvite } = require('../models');
const logger = require('../utils/logger');
const redis = require('../config/redis');
const crypto = require('crypto');
const { generateMembershipSignature } = require('./groupService');

/**
 * ═══════════════════════════════════════════════════════════
 * Membership Service
 * Handles group membership, joins, invites, and requests
 * ═══════════════════════════════════════════════════════════
 */

/**
 * Join a group
 */
async function joinGroup(userId, groupId, options = {}) {
  try {
    const group = await Group.findByPk(groupId);

    if (!group) {
      throw new Error('GROUP_NOT_FOUND');
    }

    if (!group.isActive) {
      throw new Error('GROUP_INACTIVE');
    }

    // Check if already a member
    const existing = await GroupMembership.findOne({
      where: { userId, groupId }
    });

    if (existing && existing.status === 'active') {
      throw new Error('ALREADY_MEMBER');
    }

    // Handle different join modes
    switch (group.joinMode) {
      case 'open':
        return await handleOpenJoin(userId, groupId);

      case 'request':
        return await handleRequestJoin(userId, groupId, options.message);

      case 'invite':
        return await handleInviteJoin(userId, groupId, options.inviteCode);

      default:
        throw new Error('INVALID_JOIN_MODE');
    }
  } catch (error) {
    logger.error('Error joining group:', error);
    throw error;
  }
}

/**
 * Handle open join mode
 */
async function handleOpenJoin(userId, groupId) {
  const joinedAt = Date.now();
  const signature = await generateMembershipSignature(userId, groupId, joinedAt);

  const membership = await GroupMembership.create({
    userId,
    groupId,
    role: 'member',
    signature,
    status: 'active',
    joinedAt
  });

  // Increment member count
  await Group.increment('memberCount', { where: { id: groupId } });

  // Invalidate cache
  await redis.del(`group:${groupId}:members`);

  logger.info('User joined group (open)', {
    userId,
    groupId
  });

  return {
    status: 'joined',
    membership
  };
}

/**
 * Handle request join mode
 */
async function handleRequestJoin(userId, groupId, message = null) {
  // Check for existing pending request
  const existing = await JoinRequest.findOne({
    where: {
      userId,
      groupId,
      status: 'pending'
    }
  });

  if (existing) {
    throw new Error('REQUEST_ALREADY_PENDING');
  }

  const request = await JoinRequest.create({
    userId,
    groupId,
    message,
    status: 'pending',
    createdAt: Date.now(),
    expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000) // 30 days
  });

  logger.info('Join request created', {
    userId,
    groupId,
    requestId: request.id
  });

  return {
    status: 'pending',
    request
  };
}

/**
 * Handle invite-only join mode
 */
async function handleInviteJoin(userId, groupId, inviteCode) {
  if (!inviteCode) {
    throw new Error('INVITE_CODE_REQUIRED');
  }

  const invite = await GroupInvite.findOne({
    where: {
      groupId,
      inviteCode,
      status: 'pending'
    }
  });

  if (!invite) {
    throw new Error('INVALID_INVITE_CODE');
  }

  // Check if invite is for specific user
  if (invite.userId && invite.userId !== userId) {
    throw new Error('INVITE_NOT_FOR_YOU');
  }

  // Check expiration
  if (invite.expiresAt && invite.expiresAt < Date.now()) {
    await invite.update({ status: 'expired' });
    throw new Error('INVITE_EXPIRED');
  }

  // Check max uses
  if (invite.maxUses && invite.useCount >= invite.maxUses) {
    await invite.update({ status: 'expired' });
    throw new Error('INVITE_MAX_USES_REACHED');
  }

  // Join the group
  const joinedAt = Date.now();
  const signature = await generateMembershipSignature(userId, groupId, joinedAt);

  const membership = await GroupMembership.create({
    userId,
    groupId,
    role: 'member',
    signature,
    status: 'active',
    joinedAt,
    invitedBy: invite.inviterId
  });

  // Update invite
  await invite.update({
    useCount: invite.useCount + 1,
    acceptedAt: joinedAt,
    status: invite.userId ? 'accepted' : 'pending' // Keep pending for multi-use invites
  });

  // Increment member count
  await Group.increment('memberCount', { where: { id: groupId } });

  // Invalidate cache
  await redis.del(`group:${groupId}:members`);

  logger.info('User joined group (invite)', {
    userId,
    groupId,
    inviterId: invite.inviterId
  });

  return {
    status: 'joined',
    membership
  };
}

/**
 * Leave a group
 */
async function leaveGroup(userId, groupId) {
  try {
    const membership = await GroupMembership.findOne({
      where: {
        userId,
        groupId,
        status: 'active'
      }
    });

    if (!membership) {
      throw new Error('NOT_MEMBER');
    }

    // Owner cannot leave (must transfer ownership first)
    if (membership.role === 'owner') {
      throw new Error('OWNER_CANNOT_LEAVE');
    }

    await membership.update({
      status: 'left',
      leftAt: Date.now()
    });

    // Decrement member count
    await Group.decrement('memberCount', { where: { id: groupId } });

    // Invalidate cache
    await redis.del(`group:${groupId}:members`);
    await redis.del(`group:${groupId}:member:${userId}`);

    logger.info('User left group', {
      userId,
      groupId
    });

    return membership;
  } catch (error) {
    logger.error('Error leaving group:', error);
    throw error;
  }
}

/**
 * Remove a member from group (admin action)
 */
async function removeMember(adminUserId, groupId, targetUserId, reason = null) {
  try {
    // Check admin permissions
    const adminMembership = await GroupMembership.findOne({
      where: {
        userId: adminUserId,
        groupId,
        status: 'active'
      }
    });

    if (!adminMembership || !['owner', 'admin'].includes(adminMembership.role)) {
      throw new Error('INSUFFICIENT_PERMISSIONS');
    }

    // Cannot remove owner
    const targetMembership = await GroupMembership.findOne({
      where: {
        userId: targetUserId,
        groupId,
        status: 'active'
      }
    });

    if (!targetMembership) {
      throw new Error('USER_NOT_MEMBER');
    }

    if (targetMembership.role === 'owner') {
      throw new Error('CANNOT_REMOVE_OWNER');
    }

    await targetMembership.update({
      status: 'left',
      leftAt: Date.now(),
      suspendedReason: reason
    });

    // Decrement member count
    await Group.decrement('memberCount', { where: { id: groupId } });

    // Invalidate cache
    await redis.del(`group:${groupId}:members`);
    await redis.del(`group:${groupId}:member:${targetUserId}`);

    logger.info('Member removed from group', {
      adminUserId,
      targetUserId,
      groupId,
      reason
    });

    return targetMembership;
  } catch (error) {
    logger.error('Error removing member:', error);
    throw error;
  }
}

/**
 * Create an invite
 */
async function createInvite(inviterId, groupId, options = {}) {
  try {
    const inviterMembership = await GroupMembership.findOne({
      where: {
        userId: inviterId,
        groupId,
        status: 'active'
      }
    });

    if (!inviterMembership) {
      throw new Error('NOT_MEMBER');
    }

    // Generate invite code
    const inviteCode = crypto.randomBytes(16).toString('hex');

    const invite = await GroupInvite.create({
      groupId,
      userId: options.userId || null,
      inviterId,
      inviteCode,
      message: options.message,
      status: 'pending',
      maxUses: options.maxUses || null,
      useCount: 0,
      createdAt: Date.now(),
      expiresAt: options.expiresAt || (Date.now() + (7 * 24 * 60 * 60 * 1000)) // 7 days default
    });

    logger.info('Invite created', {
      inviterId,
      groupId,
      inviteId: invite.id
    });

    return invite;
  } catch (error) {
    logger.error('Error creating invite:', error);
    throw error;
  }
}

/**
 * Approve a join request
 */
async function approveJoinRequest(adminUserId, groupId, requestId) {
  try {
    // Check admin permissions
    const adminMembership = await GroupMembership.findOne({
      where: {
        userId: adminUserId,
        groupId,
        status: 'active'
      }
    });

    if (!adminMembership || !['owner', 'admin', 'moderator'].includes(adminMembership.role)) {
      throw new Error('INSUFFICIENT_PERMISSIONS');
    }

    const request = await JoinRequest.findByPk(requestId);

    if (!request || request.groupId !== groupId) {
      throw new Error('REQUEST_NOT_FOUND');
    }

    if (request.status !== 'pending') {
      throw new Error('REQUEST_NOT_PENDING');
    }

    // Add user to group
    const joinedAt = Date.now();
    const signature = await generateMembershipSignature(request.userId, groupId, joinedAt);

    const membership = await GroupMembership.create({
      userId: request.userId,
      groupId,
      role: 'member',
      signature,
      status: 'active',
      joinedAt
    });

    // Update request
    await request.update({
      status: 'approved',
      reviewedBy: adminUserId,
      reviewedAt: Date.now()
    });

    // Increment member count
    await Group.increment('memberCount', { where: { id: groupId } });

    // Invalidate cache
    await redis.del(`group:${groupId}:members`);

    logger.info('Join request approved', {
      adminUserId,
      userId: request.userId,
      groupId,
      requestId
    });

    return { request, membership };
  } catch (error) {
    logger.error('Error approving join request:', error);
    throw error;
  }
}

/**
 * Reject a join request
 */
async function rejectJoinRequest(adminUserId, groupId, requestId, reason = null) {
  try {
    // Check admin permissions
    const adminMembership = await GroupMembership.findOne({
      where: {
        userId: adminUserId,
        groupId,
        status: 'active'
      }
    });

    if (!adminMembership || !['owner', 'admin', 'moderator'].includes(adminMembership.role)) {
      throw new Error('INSUFFICIENT_PERMISSIONS');
    }

    const request = await JoinRequest.findByPk(requestId);

    if (!request || request.groupId !== groupId) {
      throw new Error('REQUEST_NOT_FOUND');
    }

    if (request.status !== 'pending') {
      throw new Error('REQUEST_NOT_PENDING');
    }

    await request.update({
      status: 'rejected',
      reviewedBy: adminUserId,
      reviewedAt: Date.now(),
      reviewMessage: reason
    });

    logger.info('Join request rejected', {
      adminUserId,
      userId: request.userId,
      groupId,
      requestId,
      reason
    });

    return request;
  } catch (error) {
    logger.error('Error rejecting join request:', error);
    throw error;
  }
}

/**
 * List group members
 */
async function listMembers(groupId, filters = {}, pagination = {}) {
  try {
    const {
      role,
      status = 'active'
    } = filters;

    const {
      page = 1,
      limit = 50
    } = pagination;

    const where = {
      groupId,
      status
    };

    if (role) {
      where.role = role;
    }

    const offset = (page - 1) * limit;

    const { count, rows } = await GroupMembership.findAndCountAll({
      where,
      limit,
      offset,
      order: [['joinedAt', 'DESC']]
    });

    return {
      members: rows,
      pagination: {
        total: count,
        page,
        limit,
        pages: Math.ceil(count / limit)
      }
    };
  } catch (error) {
    logger.error('Error listing members:', error);
    throw error;
  }
}

/**
 * Get user's group memberships
 */
async function getUserMemberships(userId, filters = {}, pagination = {}) {
  try {
    const {
      status = 'active',
      role
    } = filters;

    const {
      page = 1,
      limit = 50
    } = pagination;

    const where = {
      userId,
      status
    };

    if (role) {
      where.role = role;
    }

    const offset = (page - 1) * limit;

    const { count, rows } = await GroupMembership.findAndCountAll({
      where,
      include: [{
        model: Group,
        as: 'group',
        attributes: ['id', 'name', 'slug', 'description', 'avatarUrl', 'visibility', 'memberCount', 'createdAt']
      }],
      limit,
      offset,
      order: [['joinedAt', 'DESC']]
    });

    return {
      memberships: rows,
      pagination: {
        total: count,
        page,
        limit,
        pages: Math.ceil(count / limit)
      }
    };
  } catch (error) {
    logger.error('Error getting user memberships:', error);
    throw error;
  }
}

module.exports = {
  joinGroup,
  leaveGroup,
  removeMember,
  createInvite,
  approveJoinRequest,
  rejectJoinRequest,
  listMembers,
  getUserMemberships
};
