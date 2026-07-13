const { Group, GroupMembership, GroupRole } = require('../models');
const logger = require('../utils/logger');
const redis = require('../config/redis');
const crypto = require('crypto');
const roleService = require('./roleService');

/**
 * ═══════════════════════════════════════════════════════════
 * Group Service
 * Core business logic for group management
 * ═══════════════════════════════════════════════════════════
 */

/**
 * Generate a unique slug from group name
 */
function generateSlug(name, suffix = '') {
  const baseSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return suffix ? `${baseSlug}-${suffix}` : baseSlug;
}

/**
 * Generate cryptographic membership signature
 */
async function generateMembershipSignature(userId, groupId, timestamp) {
  const data = `${userId}:${groupId}:${timestamp}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Create a new group.
 *
 * @param {string} userId - creator user id (owner)
 * @param {Object} data - group attributes (name, description, visibility, …)
 * @param {Object} [options]
 * @param {string} [options.slug] - a DETERMINISTIC slug (e.g. derived from an org
 *   id) that makes creation idempotent: FEAT-032 / ADR-0003 S7 passes
 *   `org-<orgId>` so a re-run reuses the existing group instead of minting a
 *   duplicate. When an active/soft-deleted group already exists for this slug it
 *   is returned as-is (no second Group/membership/roles). When omitted the
 *   historical auto-slug generation (collision-suffixed) is used — fully
 *   backward-compatible with the two-arg callers.
 * @returns {Promise<Group>}
 */
async function createGroup(userId, data, options = {}) {
  try {
    let slug;

    if (options.slug) {
      // Deterministic slug → idempotent by construction (S7 dedup). Reuse an
      // existing group for this slug rather than erroring on the unique index.
      slug = options.slug;
      const existing = await Group.findOne({ where: { slug } });
      if (existing) {
        logger.info('Group create is idempotent — reusing existing group', {
          groupId: existing.id,
          slug
        });
        return existing;
      }
    } else {
      // Generate unique slug (auto, collision-suffixed).
      slug = generateSlug(data.name);
      let slugExists = await Group.findOne({ where: { slug } });
      let attempts = 0;

      while (slugExists && attempts < 10) {
        const suffix = crypto.randomBytes(3).toString('hex');
        slug = generateSlug(data.name, suffix);
        slugExists = await Group.findOne({ where: { slug } });
        attempts++;
      }

      if (slugExists) {
        throw new Error('Unable to generate unique slug');
      }
    }

    // Create group
    const group = await Group.create({
      name: data.name,
      slug,
      description: data.description,
      creatorId: userId,
      visibility: data.visibility || 'public',
      joinMode: data.joinMode || 'request',
      governanceModel: data.governanceModel || 'centralized',
      governanceRules: data.governanceRules || {},
      category: data.category,
      tags: data.tags || [],
      avatarUrl: data.avatarUrl,
      bannerUrl: data.bannerUrl,
      maxMembers: data.maxMembers,
      location: data.location,
      latitude: data.latitude,
      longitude: data.longitude,
      website: data.website,
      metadata: data.metadata || {},
      memberCount: 1,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    // Add creator as owner with signature
    const joinedAt = Date.now();
    const signature = await generateMembershipSignature(userId, group.id, joinedAt);

    await GroupMembership.create({
      userId,
      groupId: group.id,
      role: 'owner',
      signature,
      status: 'active',
      joinedAt
    });

    // Create default roles
    await roleService.createDefaultRoles(group.id);

    logger.info('Group created', {
      groupId: group.id,
      name: group.name,
      creatorId: userId
    });

    return group;
  } catch (error) {
    logger.error('Error creating group:', error);
    throw error;
  }
}


/**
 * Get group by ID
 */
async function getGroup(groupId, userId = null) {
  try {
    // Check cache first
    const cacheKey = `group:${groupId}:full`;
    const cached = await redis.get(cacheKey);

    let group;
    if (cached) {
      group = JSON.parse(cached);
    } else {
      group = await Group.findByPk(groupId);

      if (!group) {
        throw new Error('GROUP_NOT_FOUND');
      }

      // Cache for 10 minutes
      await redis.setex(cacheKey, 600, JSON.stringify(group));
    }

    // Check visibility
    if (group.visibility === 'private' && userId) {
      const membership = await GroupMembership.findOne({
        where: {
          userId,
          groupId,
          status: 'active'
        }
      });

      if (!membership) {
        throw new Error('ACCESS_DENIED');
      }
    }

    return group;
  } catch (error) {
    logger.error('Error getting group:', error);
    throw error;
  }
}

/**
 * Update group
 */
async function updateGroup(groupId, userId, data, options = {}) {
  const { isPlatformAdmin = false } = options;
  try {
    const group = await Group.findByPk(groupId);

    if (!group) {
      throw new Error('GROUP_NOT_FOUND');
    }

    // Check if user is owner or admin. A verified platform admin bypasses the
    // group-scoped membership/role requirement entirely (acts as owner).
    const membership = isPlatformAdmin ? null : await GroupMembership.findOne({
      where: {
        userId,
        groupId,
        status: 'active'
      }
    });

    if (!isPlatformAdmin && (!membership || !['owner', 'admin'].includes(membership.role))) {
      throw new Error('INSUFFICIENT_PERMISSIONS');
    }

    // Update allowed fields
    const allowedFields = [
      'name',
      'description',
      'category',
      'tags',
      'avatarUrl',
      'bannerUrl',
      'location',
      'latitude',
      'longitude',
      'website',
      'visibility',
      'joinMode',
      'maxMembers',
      'metadata'
    ];

    // Only owner can change governance model (platform admins are exempt).
    if (data.governanceModel && !isPlatformAdmin && membership.role !== 'owner') {
      throw new Error('ONLY_OWNER_CAN_CHANGE_GOVERNANCE');
    }

    if (data.governanceModel) {
      allowedFields.push('governanceModel', 'governanceRules');
    }

    const updates = {};
    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        updates[field] = data[field];
      }
    }

    updates.updatedAt = Date.now();

    await group.update(updates);

    // Invalidate cache
    await redis.del(`group:${groupId}:full`);
    await redis.del(`group:${groupId}:info`);

    logger.info('Group updated', {
      groupId,
      userId,
      fields: Object.keys(updates)
    });

    return group;
  } catch (error) {
    logger.error('Error updating group:', error);
    throw error;
  }
}

/**
 * Delete (soft delete) group
 */
async function deleteGroup(groupId, userId, options = {}) {
  const { isPlatformAdmin = false } = options;
  try {
    const group = await Group.findByPk(groupId);

    if (!group) {
      throw new Error('GROUP_NOT_FOUND');
    }

    // Only owner can delete group (platform admins bypass this).
    const membership = isPlatformAdmin ? null : await GroupMembership.findOne({
      where: {
        userId,
        groupId,
        role: 'owner',
        status: 'active'
      }
    });

    if (!isPlatformAdmin && !membership) {
      throw new Error('ONLY_OWNER_CAN_DELETE');
    }

    // Soft delete
    await group.update({
      isActive: false,
      deletedAt: Date.now(),
      updatedAt: Date.now()
    });

    // Invalidate caches
    await redis.del(`group:${groupId}:full`);
    await redis.del(`group:${groupId}:info`);

    logger.info('Group deleted', {
      groupId,
      userId
    });

    return group;
  } catch (error) {
    logger.error('Error deleting group:', error);
    throw error;
  }
}

/**
 * HARD-delete a group and its dependents (memberships + default roles), for
 * FEAT-032 / ADR-0003 S7 compensation — when a later saga step fails the
 * provisioned Nexus group must leave no orphan. Unlike `deleteGroup` (a soft
 * `isActive=false` toggle used by the product UI), this fully removes the rows
 * so a re-provision with the same deterministic slug starts clean. Idempotent:
 * a missing group is a no-op. Best-effort cache invalidation.
 *
 * @param {string} groupId
 * @returns {Promise<void>}
 */
async function deleteGroupCascade(groupId) {
  try {
    await GroupMembership.destroy({ where: { groupId } });
    await GroupRole.destroy({ where: { groupId } });
    await Group.destroy({ where: { id: groupId } });

    try {
      await redis.del(`group:${groupId}:full`);
      await redis.del(`group:${groupId}:info`);
    } catch (cacheError) {
      logger.warn('Group cache invalidation failed during cascade delete', {
        groupId,
        error: cacheError.message
      });
    }

    logger.info('Group cascade-deleted (provisioning compensation)', { groupId });
  } catch (error) {
    logger.error('Error cascade-deleting group:', error);
    throw error;
  }
}

/**
 * List groups with filters and pagination
 */
async function listGroups(filters = {}, pagination = {}) {
  try {
    const {
      visibility,
      category,
      tags,
      search,
      isFeatured,
      isVerified,
      creatorId
    } = filters;

    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'DESC'
    } = pagination;

    const where = {
      isActive: true
    };

    // Apply filters
    if (visibility) {
      where.visibility = visibility;
    }

    if (category) {
      where.category = category;
    }

    if (isFeatured !== undefined) {
      where.isFeatured = isFeatured;
    }

    if (isVerified !== undefined) {
      where.isVerified = isVerified;
    }

    if (creatorId) {
      where.creatorId = creatorId;
    }

    if (tags && tags.length > 0) {
      where.tags = {
        [require('sequelize').Op.contains]: tags
      };
    }

    if (search) {
      where[require('sequelize').Op.or] = [
        { name: { [require('sequelize').Op.iLike]: `%${search}%` } },
        { description: { [require('sequelize').Op.iLike]: `%${search}%` } }
      ];
    }

    const offset = (page - 1) * limit;

    const { count, rows } = await Group.findAndCountAll({
      where,
      limit,
      offset,
      order: [[sortBy, sortOrder]]
    });

    return {
      groups: rows,
      pagination: {
        total: count,
        page,
        limit,
        pages: Math.ceil(count / limit)
      }
    };
  } catch (error) {
    logger.error('Error listing groups:', error);
    throw error;
  }
}

module.exports = {
  generateSlug,
  generateMembershipSignature,
  createGroup,
  getGroup,
  updateGroup,
  deleteGroup,
  deleteGroupCascade,
  listGroups
};
