const GroupRole = require('../models/GroupRole');
const GroupMembership = require('../models/GroupMembership');
const Group = require('../models/Group');
const redis = require('../config/redis');

/**
 * ═══════════════════════════════════════════════════════════
 * Role Service
 * Business logic for group roles and permissions
 * ═══════════════════════════════════════════════════════════
 */

// Default permission sets
const DEFAULT_PERMISSIONS = {
  owner: {
    manageGroup: true,
    manageMembers: true,
    manageRoles: true,
    manageEvents: true,
    manageContent: true,
    createProposals: true,
    vote: true,
    post: true,
    comment: true,
    invite: true,
    moderate: true
  },
  admin: {
    manageGroup: false,
    manageMembers: true,
    manageRoles: true,
    manageEvents: true,
    manageContent: true,
    createProposals: true,
    vote: true,
    post: true,
    comment: true,
    invite: true,
    moderate: true
  },
  moderator: {
    manageGroup: false,
    manageMembers: false,
    manageRoles: false,
    manageEvents: true,
    manageContent: true,
    createProposals: true,
    vote: true,
    post: true,
    comment: true,
    invite: true,
    moderate: true
  },
  member: {
    manageGroup: false,
    manageMembers: false,
    manageRoles: false,
    manageEvents: false,
    manageContent: false,
    createProposals: true,
    vote: true,
    post: true,
    comment: true,
    invite: false,
    moderate: false
  },
  guest: {
    manageGroup: false,
    manageMembers: false,
    manageRoles: false,
    manageEvents: false,
    manageContent: false,
    createProposals: false,
    vote: false,
    post: false,
    comment: true,
    invite: false,
    moderate: false
  }
};

class RoleService {
  /**
   * Create default roles for a new group
   */
  async createDefaultRoles(groupId) {
    const defaultRoles = [
      {
        groupId,
        name: 'owner',
        description: 'Group owner with full control',
        color: '#FF6B6B',
        position: 100,
        isDefault: false,
        isSystem: true,
        permissions: DEFAULT_PERMISSIONS.owner
      },
      {
        groupId,
        name: 'admin',
        description: 'Group administrator',
        color: '#4ECDC4',
        position: 90,
        isDefault: false,
        isSystem: true,
        permissions: DEFAULT_PERMISSIONS.admin
      },
      {
        groupId,
        name: 'moderator',
        description: 'Content moderator',
        color: '#95E1D3',
        position: 70,
        isDefault: false,
        isSystem: true,
        permissions: DEFAULT_PERMISSIONS.moderator
      },
      {
        groupId,
        name: 'member',
        description: 'Standard member',
        color: '#38A3A5',
        position: 50,
        isDefault: true,
        isSystem: true,
        permissions: DEFAULT_PERMISSIONS.member
      },
      {
        groupId,
        name: 'guest',
        description: 'Guest with limited access',
        color: '#CCCCCC',
        position: 10,
        isDefault: false,
        isSystem: true,
        permissions: DEFAULT_PERMISSIONS.guest
      }
    ];

    const roles = await GroupRole.bulkCreate(defaultRoles);
    return roles;
  }

  /**
   * Create a custom role
   */
  async createRole(groupId, creatorId, roleData) {
    // Verify group exists
    const group = await Group.findByPk(groupId);
    if (!group) {
      throw new Error('GROUP_NOT_FOUND');
    }

    // Verify creator is admin
    const membership = await GroupMembership.findOne({
      where: {
        userId: creatorId,
        groupId,
        status: 'active'
      }
    });

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      throw new Error('INSUFFICIENT_PERMISSIONS');
    }

    // Check if role name already exists
    const existing = await GroupRole.findOne({
      where: { groupId, name: roleData.name }
    });

    if (existing) {
      throw new Error('ROLE_NAME_EXISTS');
    }

    // Create role
    const role = await GroupRole.create({
      groupId,
      name: roleData.name,
      description: roleData.description || '',
      color: roleData.color || '#888888',
      position: roleData.position || 50,
      isDefault: roleData.isDefault || false,
      isSystem: false,
      permissions: roleData.permissions || DEFAULT_PERMISSIONS.member,
      createdAt: Date.now()
    });

    // Clear cache
    await redis.del(`group:${groupId}:roles`);

    return role;
  }

  /**
   * Get role by ID
   */
  async getRole(roleId) {
    const role = await GroupRole.findByPk(roleId);
    if (!role) {
      throw new Error('ROLE_NOT_FOUND');
    }

    return role;
  }

  /**
   * List roles for a group
   */
  async listRoles(groupId) {
    // Try cache first
    const cached = await redis.get(`group:${groupId}:roles`);
    if (cached) {
      return JSON.parse(cached);
    }

    const roles = await GroupRole.findAll({
      where: { groupId },
      order: [['position', 'DESC']]
    });

    // Cache for 10 minutes
    await redis.setex(`group:${groupId}:roles`, 600, JSON.stringify(roles));

    return roles;
  }

  /**
   * Update a role
   */
  async updateRole(roleId, userId, updates) {
    const role = await GroupRole.findByPk(roleId);
    if (!role) {
      throw new Error('ROLE_NOT_FOUND');
    }

    // System roles cannot be modified (except permissions can be tweaked)
    if (role.isSystem && (updates.name || updates.isDefault !== undefined)) {
      throw new Error('CANNOT_MODIFY_SYSTEM_ROLE');
    }

    // Verify admin permissions
    const membership = await GroupMembership.findOne({
      where: {
        userId,
        groupId: role.groupId,
        status: 'active'
      }
    });

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      throw new Error('INSUFFICIENT_PERMISSIONS');
    }

    // Update allowed fields
    const allowedFields = ['description', 'color', 'position', 'permissions'];
    if (!role.isSystem) {
      allowedFields.push('name', 'isDefault');
    }

    const updateData = {};
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field];
      }
    }

    updateData.updatedAt = Date.now();

    await role.update(updateData);

    // Clear cache
    await redis.del(`group:${role.groupId}:roles`);

    return role;
  }

  /**
   * Delete a custom role
   */
  async deleteRole(roleId, userId) {
    const role = await GroupRole.findByPk(roleId);
    if (!role) {
      throw new Error('ROLE_NOT_FOUND');
    }

    // Cannot delete system roles
    if (role.isSystem) {
      throw new Error('CANNOT_DELETE_SYSTEM_ROLE');
    }

    // Verify admin permissions
    const membership = await GroupMembership.findOne({
      where: {
        userId,
        groupId: role.groupId,
        status: 'active'
      }
    });

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      throw new Error('INSUFFICIENT_PERMISSIONS');
    }

    // Check if role is assigned to any members
    const membersWithRole = await GroupMembership.count({
      where: {
        groupId: role.groupId,
        customRoleId: roleId,
        status: 'active'
      }
    });

    if (membersWithRole > 0) {
      throw new Error('ROLE_IN_USE');
    }

    const groupId = role.groupId;

    await role.destroy();

    // Clear cache
    await redis.del(`group:${groupId}:roles`);

    return { success: true };
  }

  /**
   * Assign role to a member
   */
  async assignRole(groupId, userId, targetUserId, roleNameOrId) {
    // Verify assigner is admin
    const assignerMembership = await GroupMembership.findOne({
      where: {
        userId,
        groupId,
        status: 'active'
      }
    });

    if (!assignerMembership || !['owner', 'admin'].includes(assignerMembership.role)) {
      throw new Error('INSUFFICIENT_PERMISSIONS');
    }

    // Get target member
    const targetMembership = await GroupMembership.findOne({
      where: {
        userId: targetUserId,
        groupId,
        status: 'active'
      }
    });

    if (!targetMembership) {
      throw new Error('MEMBER_NOT_FOUND');
    }

    // Find role
    let role;
    if (roleNameOrId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      // UUID
      role = await GroupRole.findByPk(roleNameOrId);
    } else {
      // Role name
      role = await GroupRole.findOne({
        where: { groupId, name: roleNameOrId }
      });
    }

    if (!role) {
      throw new Error('ROLE_NOT_FOUND');
    }

    // Update member's role
    await targetMembership.update({
      role: role.isSystem ? role.name : 'member',
      customRoleId: role.isSystem ? null : role.id
    });

    // Clear cache
    await redis.del(`group:${groupId}:members`);
    await redis.del(`membership:${targetUserId}:${groupId}`);

    return targetMembership;
  }

  /**
   * Check if user has specific permission
   */
  async hasPermission(groupId, userId, permission) {
    // Try cache first
    const cacheKey = `permission:${userId}:${groupId}:${permission}`;
    const cached = await redis.get(cacheKey);
    if (cached !== null) {
      return cached === 'true';
    }

    // Get member
    const membership = await GroupMembership.findOne({
      where: {
        userId,
        groupId,
        status: 'active'
      }
    });

    if (!membership) {
      await redis.setex(cacheKey, 300, 'false');
      return false;
    }

    // Get role permissions
    let permissions;

    if (membership.customRoleId) {
      // Custom role
      const role = await GroupRole.findByPk(membership.customRoleId);
      permissions = role ? role.permissions : {};
    } else {
      // System role
      permissions = DEFAULT_PERMISSIONS[membership.role] || {};
    }

    const hasPermission = permissions[permission] === true;

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, hasPermission ? 'true' : 'false');

    return hasPermission;
  }

  /**
   * Get user's permissions in a group
   */
  async getUserPermissions(groupId, userId) {
    const membership = await GroupMembership.findOne({
      where: {
        userId,
        groupId,
        status: 'active'
      }
    });

    if (!membership) {
      return {};
    }

    if (membership.customRoleId) {
      const role = await GroupRole.findByPk(membership.customRoleId);
      return role ? role.permissions : {};
    }

    return DEFAULT_PERMISSIONS[membership.role] || {};
  }

  /**
   * Get default role for a group
   */
  async getDefaultRole(groupId) {
    const role = await GroupRole.findOne({
      where: {
        groupId,
        isDefault: true
      }
    });

    return role;
  }

  /**
   * Set default role
   */
  async setDefaultRole(groupId, roleId, userId) {
    // Verify admin permissions
    const membership = await GroupMembership.findOne({
      where: {
        userId,
        groupId,
        status: 'active'
      }
    });

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      throw new Error('INSUFFICIENT_PERMISSIONS');
    }

    // Clear current default
    await GroupRole.update(
      { isDefault: false },
      { where: { groupId, isDefault: true } }
    );

    // Set new default
    const role = await GroupRole.findByPk(roleId);
    if (!role || role.groupId !== groupId) {
      throw new Error('ROLE_NOT_FOUND');
    }

    await role.update({ isDefault: true });

    // Clear cache
    await redis.del(`group:${groupId}:roles`);

    return role;
  }
}

module.exports = new RoleService();
