const { SubGroup, SubGroupMembership, Group, GroupMembership } = require('../models');
const logger = require('../utils/logger');
const redis = require('../config/redis');
const crypto = require('crypto');
const { Op } = require('sequelize');

/**
 * ═══════════════════════════════════════════════════════════
 * SubGroup Service
 * Manages sub-groups/channels with permission inheritance
 * ═══════════════════════════════════════════════════════════
 */

/**
 * Generate a unique slug from name
 */
function generateSlug(name, suffix = '') {
  const baseSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return suffix ? `${baseSlug}-${suffix}` : baseSlug;
}

/**
 * Create a sub-group or channel
 * @param {string} parentGroupId - Parent group ID
 * @param {string} userId - Creator user ID
 * @param {object} data - SubGroup data
 * @returns {Promise<object>} Created sub-group
 */
async function createSubGroup(parentGroupId, userId, data) {
  try {
    // Validate parent group exists
    const parentGroup = await Group.findByPk(parentGroupId);
    if (!parentGroup) {
      throw new Error('PARENT_GROUP_NOT_FOUND');
    }

    // Check if user has permission to create sub-groups (admin or owner)
    const membership = await GroupMembership.findOne({
      where: {
        userId,
        groupId: parentGroupId,
        status: 'active'
      }
    });

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      throw new Error('INSUFFICIENT_PERMISSIONS');
    }

    // Generate unique slug within parent group
    let slug = generateSlug(data.name);
    let slugExists = await SubGroup.findOne({
      where: { parentGroupId, slug }
    });
    let attempts = 0;

    while (slugExists && attempts < 10) {
      const suffix = crypto.randomBytes(3).toString('hex');
      slug = generateSlug(data.name, suffix);
      slugExists = await SubGroup.findOne({
        where: { parentGroupId, slug }
      });
      attempts++;
    }

    if (slugExists) {
      throw new Error('Unable to generate unique slug for sub-group');
    }

    // Create sub-group
    const subGroup = await SubGroup.create({
      parentGroupId,
      name: data.name,
      slug,
      description: data.description,
      type: data.type || 'channel',
      creatorId: userId,
      visibility: data.visibility || 'members',
      inheritPermissions: data.inheritPermissions !== undefined ? data.inheritPermissions : true,
      permissions: data.permissions || {},
      allowedRoles: data.allowedRoles || [],
      category: data.category,
      tags: data.tags || [],
      avatarUrl: data.avatarUrl,
      bannerUrl: data.bannerUrl,
      maxMembers: data.maxMembers,
      sortOrder: data.sortOrder || 0,
      settings: data.settings || {},
      metadata: data.metadata || {},
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    logger.info('SubGroup created', {
      subGroupId: subGroup.id,
      parentGroupId,
      name: subGroup.name,
      type: subGroup.type,
      creatorId: userId
    });

    // Invalidate cache
    await redis.del(`group:${parentGroupId}:subgroups`);

    return subGroup;
  } catch (error) {
    logger.error('Error creating sub-group:', error);
    throw error;
  }
}

/**
 * Get sub-group by ID with access check
 * @param {string} subGroupId - SubGroup ID
 * @param {string} userId - User ID (for permission check)
 * @returns {Promise<object>} SubGroup
 */
async function getSubGroup(subGroupId, userId = null) {
  try {
    const subGroup = await SubGroup.findByPk(subGroupId, {
      include: [{
        model: Group,
        as: 'parentGroup',
        attributes: ['id', 'name', 'visibility']
      }]
    });

    if (!subGroup) {
      throw new Error('SUBGROUP_NOT_FOUND');
    }

    // Check access permission
    if (userId) {
      const hasAccess = await checkSubGroupAccess(subGroup, userId);
      if (!hasAccess) {
        throw new Error('ACCESS_DENIED');
      }
    }

    return subGroup;
  } catch (error) {
    logger.error('Error getting sub-group:', error);
    throw error;
  }
}

/**
 * List sub-groups for a parent group
 * @param {string} parentGroupId - Parent group ID
 * @param {string} userId - User ID (for filtering)
 * @param {object} filters - Filters
 * @returns {Promise<Array>} Sub-groups
 */
async function listSubGroups(parentGroupId, userId = null, filters = {}) {
  try {
    const where = {
      parentGroupId,
      isActive: true
    };

    if (filters.type) {
      where.type = filters.type;
    }

    if (filters.visibility) {
      where.visibility = filters.visibility;
    }

    if (!filters.includeArchived) {
      where.isArchived = false;
    }

    const subGroups = await SubGroup.findAll({
      where,
      order: [
        ['isPinned', 'DESC'],
        ['sortOrder', 'ASC'],
        ['createdAt', 'DESC']
      ]
    });

    // Filter by access if userId provided
    if (userId) {
      const accessibleSubGroups = [];
      for (const subGroup of subGroups) {
        const hasAccess = await checkSubGroupAccess(subGroup, userId);
        if (hasAccess) {
          accessibleSubGroups.push(subGroup);
        }
      }
      return accessibleSubGroups;
    }

    return subGroups;
  } catch (error) {
    logger.error('Error listing sub-groups:', error);
    throw error;
  }
}

/**
 * Update sub-group
 * @param {string} subGroupId - SubGroup ID
 * @param {string} userId - User ID
 * @param {object} data - Update data
 * @returns {Promise<object>} Updated sub-group
 */
async function updateSubGroup(subGroupId, userId, data) {
  try {
    const subGroup = await SubGroup.findByPk(subGroupId);
    if (!subGroup) {
      throw new Error('SUBGROUP_NOT_FOUND');
    }

    // Check permission (admin or owner of parent group, or sub-group moderator)
    const hasPermission = await checkSubGroupManagePermission(subGroup, userId);
    if (!hasPermission) {
      throw new Error('INSUFFICIENT_PERMISSIONS');
    }

    // Allowed update fields
    const allowedFields = [
      'name',
      'description',
      'visibility',
      'category',
      'tags',
      'avatarUrl',
      'bannerUrl',
      'maxMembers',
      'sortOrder',
      'isPinned',
      'settings',
      'metadata',
      'allowedRoles',
      'permissions',
      'inheritPermissions'
    ];

    const updates = {};
    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        updates[field] = data[field];
      }
    }

    updates.updatedAt = Date.now();

    await subGroup.update(updates);

    // Invalidate cache
    await redis.del(`group:${subGroup.parentGroupId}:subgroups`);
    await redis.del(`subgroup:${subGroupId}:access:*`);

    logger.info('SubGroup updated', {
      subGroupId,
      userId,
      fields: Object.keys(updates)
    });

    return subGroup;
  } catch (error) {
    logger.error('Error updating sub-group:', error);
    throw error;
  }
}

/**
 * Delete (archive) sub-group
 * @param {string} subGroupId - SubGroup ID
 * @param {string} userId - User ID
 * @returns {Promise<object>} Archived sub-group
 */
async function deleteSubGroup(subGroupId, userId) {
  try {
    const subGroup = await SubGroup.findByPk(subGroupId);
    if (!subGroup) {
      throw new Error('SUBGROUP_NOT_FOUND');
    }

    // Check permission (admin or owner of parent group only)
    const membership = await GroupMembership.findOne({
      where: {
        userId,
        groupId: subGroup.parentGroupId,
        status: 'active'
      }
    });

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      throw new Error('INSUFFICIENT_PERMISSIONS');
    }

    // Archive instead of delete
    await subGroup.update({
      isArchived: true,
      isActive: false,
      archivedAt: Date.now(),
      updatedAt: Date.now()
    });

    // Invalidate cache
    await redis.del(`group:${subGroup.parentGroupId}:subgroups`);

    logger.info('SubGroup archived', { subGroupId, userId });

    return subGroup;
  } catch (error) {
    logger.error('Error deleting sub-group:', error);
    throw error;
  }
}

/**
 * Check if user has access to sub-group
 * @param {object} subGroup - SubGroup instance
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} Has access
 */
async function checkSubGroupAccess(subGroup, userId) {
  try {
    // Check cache first
    const cacheKey = `subgroup:${subGroup.id}:access:${userId}`;
    const cached = await redis.get(cacheKey);
    if (cached !== null) {
      return cached === 'true';
    }

    let hasAccess = false;

    // Public sub-groups are accessible to all
    if (subGroup.visibility === 'public') {
      hasAccess = true;
    } else {
      // Check parent group membership
      const parentMembership = await GroupMembership.findOne({
        where: {
          userId,
          groupId: subGroup.parentGroupId,
          status: 'active'
        }
      });

      if (!parentMembership) {
        hasAccess = false;
      } else if (subGroup.visibility === 'members') {
        // All parent group members have access
        hasAccess = true;
      } else if (subGroup.visibility === 'restricted') {
        // Check if user's role is in allowedRoles
        const allowedRoles = subGroup.allowedRoles || [];
        hasAccess = allowedRoles.includes(parentMembership.role);

        // Or check explicit sub-group membership
        if (!hasAccess) {
          const subGroupMembership = await SubGroupMembership.findOne({
            where: {
              subGroupId: subGroup.id,
              userId,
              status: 'active'
            }
          });
          hasAccess = !!subGroupMembership;
        }
      }
    }

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, hasAccess ? 'true' : 'false');

    return hasAccess;
  } catch (error) {
    logger.error('Error checking sub-group access:', error);
    return false;
  }
}

/**
 * Check if user can manage sub-group
 * @param {object} subGroup - SubGroup instance
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} Can manage
 */
async function checkSubGroupManagePermission(subGroup, userId) {
  try {
    // Check if user is parent group admin/owner
    const parentMembership = await GroupMembership.findOne({
      where: {
        userId,
        groupId: subGroup.parentGroupId,
        status: 'active'
      }
    });

    if (parentMembership && ['owner', 'admin'].includes(parentMembership.role)) {
      return true;
    }

    // Check if user is sub-group moderator
    const subGroupMembership = await SubGroupMembership.findOne({
      where: {
        subGroupId: subGroup.id,
        userId,
        status: 'active',
        role: 'moderator'
      }
    });

    return !!subGroupMembership;
  } catch (error) {
    logger.error('Error checking sub-group manage permission:', error);
    return false;
  }
}

/**
 * Add member to sub-group (for restricted sub-groups)
 * @param {string} subGroupId - SubGroup ID
 * @param {string} userId - User ID to add
 * @param {string} adminId - Admin performing the action
 * @param {string} role - Role (moderator or member)
 * @returns {Promise<object>} SubGroup membership
 */
async function addSubGroupMember(subGroupId, userId, adminId, role = 'member') {
  try {
    const subGroup = await SubGroup.findByPk(subGroupId);
    if (!subGroup) {
      throw new Error('SUBGROUP_NOT_FOUND');
    }

    // Check admin permission
    const hasPermission = await checkSubGroupManagePermission(subGroup, adminId);
    if (!hasPermission) {
      throw new Error('INSUFFICIENT_PERMISSIONS');
    }

    // Check if user is member of parent group
    const parentMembership = await GroupMembership.findOne({
      where: {
        userId,
        groupId: subGroup.parentGroupId,
        status: 'active'
      }
    });

    if (!parentMembership) {
      throw new Error('USER_NOT_PARENT_GROUP_MEMBER');
    }

    // Check if already member
    const existingMembership = await SubGroupMembership.findOne({
      where: { subGroupId, userId }
    });

    if (existingMembership) {
      if (existingMembership.status === 'active') {
        throw new Error('ALREADY_MEMBER');
      } else {
        // Reactivate
        await existingMembership.update({
          status: 'active',
          role,
          joinedAt: Date.now()
        });
        return existingMembership;
      }
    }

    // Create membership
    const membership = await SubGroupMembership.create({
      subGroupId,
      userId,
      role,
      status: 'active',
      joinedAt: Date.now()
    });

    // Update member count
    await subGroup.increment('memberCount');

    logger.info('Added member to sub-group', { subGroupId, userId, role });

    return membership;
  } catch (error) {
    logger.error('Error adding sub-group member:', error);
    throw error;
  }
}

/**
 * Remove member from sub-group
 * @param {string} subGroupId - SubGroup ID
 * @param {string} userId - User ID to remove
 * @param {string} adminId - Admin performing the action
 * @returns {Promise<void>}
 */
async function removeSubGroupMember(subGroupId, userId, adminId) {
  try {
    const subGroup = await SubGroup.findByPk(subGroupId);
    if (!subGroup) {
      throw new Error('SUBGROUP_NOT_FOUND');
    }

    // Check admin permission (or user removing themselves)
    const hasPermission = userId === adminId || await checkSubGroupManagePermission(subGroup, adminId);
    if (!hasPermission) {
      throw new Error('INSUFFICIENT_PERMISSIONS');
    }

    const membership = await SubGroupMembership.findOne({
      where: { subGroupId, userId, status: 'active' }
    });

    if (!membership) {
      throw new Error('NOT_MEMBER');
    }

    await membership.update({
      status: 'removed',
      leftAt: Date.now()
    });

    // Update member count
    await subGroup.decrement('memberCount');

    logger.info('Removed member from sub-group', { subGroupId, userId });
  } catch (error) {
    logger.error('Error removing sub-group member:', error);
    throw error;
  }
}

module.exports = {
  createSubGroup,
  getSubGroup,
  listSubGroups,
  updateSubGroup,
  deleteSubGroup,
  checkSubGroupAccess,
  checkSubGroupManagePermission,
  addSubGroupMember,
  removeSubGroupMember,
  generateSlug
};
