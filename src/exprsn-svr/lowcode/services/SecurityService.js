/**
 * Security Service
 *
 * Business logic for RBAC (Role-Based Access Control) in the low-code platform.
 * Manages users, roles, groups, and permissions.
 */

const { Op } = require('sequelize');
const { AppUser, AppRole, AppGroup, AppPermission, AppUserRole, Application } = require('../models');
const logger = require('../utils/logger');

class SecurityService {
  // ============================================================================
  // USER OPERATIONS
  // ============================================================================

  /**
   * List users with pagination and filtering
   */
  async listUsers(options = {}) {
    const {
      applicationId,
      groupId,
      roleId,
      status,
      limit = 25,
      offset = 0,
      sortBy = 'created_at',
      sortOrder = 'DESC',
      search
    } = options;

    const where = {};

    if (applicationId) {
      where.applicationId = applicationId;
    }

    if (status) {
      where.status = status;
    }

    if (search) {
      where[Op.or] = [
        { username: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { displayName: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const include = [];

    if (groupId) {
      include.push({
        model: AppGroup,
        as: 'groups',
        where: { id: groupId },
        through: { attributes: [] }
      });
    }

    if (roleId) {
      include.push({
        model: AppRole,
        as: 'roles',
        where: { id: roleId },
        through: { attributes: [] }
      });
    }

    const { count, rows } = await AppUser.findAndCountAll({
      where,
      limit,
      offset,
      order: [[sortBy, sortOrder]],
      include: [
        ...include,
        {
          model: Application,
          as: 'application',
          attributes: ['id', 'name', 'displayName']
        }
      ]
    });

    return {
      total: count,
      users: rows,
      limit,
      offset,
      hasMore: offset + limit < count
    };
  }

  /**
   * Assign role to user
   */
  async assignUserRole(userId, roleId, assignedBy) {
    const user = await AppUser.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const role = await AppRole.findByPk(roleId);
    if (!role) {
      throw new Error('Role not found');
    }

    // Check if already assigned
    const existing = await AppUserRole.findOne({
      where: { userId, roleId }
    });

    if (existing) {
      throw new Error('User already has this role');
    }

    await AppUserRole.create({
      userId,
      roleId
    });

    logger.info('Role assigned to user', { userId, roleId, assignedBy });

    return { success: true, message: 'Role assigned successfully' };
  }

  /**
   * Remove role from user
   */
  async removeUserRole(userId, roleId, removedBy) {
    const result = await AppUserRole.destroy({
      where: { userId, roleId }
    });

    if (result === 0) {
      throw new Error('User role assignment not found');
    }

    logger.info('Role removed from user', { userId, roleId, removedBy });

    return { success: true, message: 'Role removed successfully' };
  }

  /**
   * Add user to group
   */
  async addUserToGroup(userId, groupId, addedBy) {
    const user = await AppUser.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const group = await AppGroup.findByPk(groupId);
    if (!group) {
      throw new Error('Group not found');
    }

    await group.addMember(userId);

    logger.info('User added to group', { userId, groupId, addedBy });

    return { success: true, message: 'User added to group successfully' };
  }

  /**
   * Remove user from group
   */
  async removeUserFromGroup(userId, groupId, removedBy) {
    const group = await AppGroup.findByPk(groupId);
    if (!group) {
      throw new Error('Group not found');
    }

    await group.removeMember(userId);

    logger.info('User removed from group', { userId, groupId, removedBy });

    return { success: true, message: 'User removed from group successfully' };
  }

  // ============================================================================
  // ROLE OPERATIONS
  // ============================================================================

  /**
   * List roles with pagination
   */
  async listRoles(options = {}) {
    const {
      applicationId,
      limit = 25,
      offset = 0,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = options;

    const where = {};

    if (applicationId) {
      where.applicationId = applicationId;
    }

    const { count, rows } = await AppRole.findAndCountAll({
      where,
      limit,
      offset,
      order: [[sortBy, sortOrder]],
      include: [
        {
          model: Application,
          as: 'application',
          attributes: ['id', 'name', 'displayName']
        },
        {
          model: AppPermission,
          as: 'rolePermissions'
        }
      ]
    });

    return {
      total: count,
      roles: rows,
      limit,
      offset,
      hasMore: offset + limit < count
    };
  }

  /**
   * Get role by ID
   */
  async getRoleById(roleId) {
    const role = await AppRole.findByPk(roleId, {
      include: [
        {
          model: Application,
          as: 'application',
          attributes: ['id', 'name', 'displayName']
        },
        {
          model: AppPermission,
          as: 'rolePermissions'
        }
      ]
    });

    if (!role) {
      throw new Error('Role not found');
    }

    return role;
  }

  /**
   * Create new role
   */
  async createRole(data, userId) {
    const { applicationId, name, displayName, permissions = [] } = data;

    // Verify application exists
    const application = await Application.findByPk(applicationId);
    if (!application) {
      throw new Error('Application not found');
    }

    // Check for duplicate role name
    const existing = await AppRole.findOne({
      where: { applicationId, name }
    });

    if (existing) {
      throw new Error(`Role "${name}" already exists in this application`);
    }

    // Create role
    const role = await AppRole.create({
      applicationId,
      name,
      displayName: displayName || name,
      description: data.description || '',
      permissions: permissions,
      priority: data.priority || 0,
      isSystemRole: false
    });

    logger.info('Role created', { id: role.id, name, applicationId });

    return role;
  }

  /**
   * Update role
   */
  async updateRole(roleId, data, userId) {
    const role = await AppRole.findByPk(roleId);

    if (!role) {
      throw new Error('Role not found');
    }

    if (role.isSystemRole) {
      throw new Error('Cannot modify system role');
    }

    // If updating name, check for conflicts
    if (data.name && data.name !== role.name) {
      const existing = await AppRole.findOne({
        where: {
          applicationId: role.applicationId,
          name: data.name,
          id: { [Op.ne]: roleId }
        }
      });

      if (existing) {
        throw new Error(`Role "${data.name}" already exists in this application`);
      }
    }

    const updatedRole = await role.update(data);

    logger.info('Role updated', { id: roleId, name: role.name });

    return updatedRole;
  }

  /**
   * Delete role
   */
  async deleteRole(roleId, userId) {
    const role = await AppRole.findByPk(roleId);

    if (!role) {
      throw new Error('Role not found');
    }

    if (role.isSystemRole) {
      throw new Error('Cannot delete system role');
    }

    await role.destroy();

    logger.info('Role deleted', { id: roleId, name: role.name, deletedBy: userId });

    return { success: true, message: 'Role deleted successfully' };
  }

  // ============================================================================
  // GROUP OPERATIONS
  // ============================================================================

  /**
   * List groups with pagination
   */
  async listGroups(options = {}) {
    const {
      applicationId,
      limit = 25,
      offset = 0,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = options;

    const where = {};

    if (applicationId) {
      where.applicationId = applicationId;
    }

    const { count, rows } = await AppGroup.findAndCountAll({
      where,
      limit,
      offset,
      order: [[sortBy, sortOrder]],
      include: [
        {
          model: Application,
          as: 'application',
          attributes: ['id', 'name', 'displayName']
        },
        {
          model: AppGroup,
          as: 'parentGroup',
          attributes: ['id', 'name', 'displayName']
        }
      ]
    });

    return {
      total: count,
      groups: rows,
      limit,
      offset,
      hasMore: offset + limit < count
    };
  }

  /**
   * Get group by ID
   */
  async getGroupById(groupId) {
    const group = await AppGroup.findByPk(groupId, {
      include: [
        {
          model: Application,
          as: 'application',
          attributes: ['id', 'name', 'displayName']
        },
        {
          model: AppGroup,
          as: 'parentGroup',
          attributes: ['id', 'name', 'displayName']
        },
        {
          model: AppGroup,
          as: 'childGroups',
          attributes: ['id', 'name', 'displayName', 'memberCount']
        }
      ]
    });

    if (!group) {
      throw new Error('Group not found');
    }

    return group;
  }

  /**
   * Create new group
   */
  async createGroup(data, userId) {
    const { applicationId, name, displayName } = data;

    // Verify application exists
    const application = await Application.findByPk(applicationId);
    if (!application) {
      throw new Error('Application not found');
    }

    // Check for duplicate group name
    const existing = await AppGroup.findOne({
      where: { applicationId, name }
    });

    if (existing) {
      throw new Error(`Group "${name}" already exists in this application`);
    }

    // If parent group specified, verify it exists
    if (data.parentGroupId) {
      const parentGroup = await AppGroup.findByPk(data.parentGroupId);
      if (!parentGroup) {
        throw new Error('Parent group not found');
      }
      if (parentGroup.applicationId !== applicationId) {
        throw new Error('Parent group must be in the same application');
      }
    }

    // Create group
    const group = await AppGroup.create({
      applicationId,
      name,
      displayName: displayName || name,
      description: data.description || '',
      parentGroupId: data.parentGroupId || null
    });

    logger.info('Group created', { id: group.id, name, applicationId });

    return group;
  }

  /**
   * Update group
   */
  async updateGroup(groupId, data, userId) {
    const group = await AppGroup.findByPk(groupId);

    if (!group) {
      throw new Error('Group not found');
    }

    // If updating name, check for conflicts
    if (data.name && data.name !== group.name) {
      const existing = await AppGroup.findOne({
        where: {
          applicationId: group.applicationId,
          name: data.name,
          id: { [Op.ne]: groupId }
        }
      });

      if (existing) {
        throw new Error(`Group "${data.name}" already exists in this application`);
      }
    }

    // If updating parent, check for circular references
    if (data.parentGroupId && data.parentGroupId !== group.parentGroupId) {
      const newParent = await AppGroup.findByPk(data.parentGroupId);
      if (!newParent) {
        throw new Error('Parent group not found');
      }

      // Check if new parent is a descendant (would create circular reference)
      const descendants = await group.getDescendants();
      if (descendants.some(d => d.id === data.parentGroupId)) {
        throw new Error('Cannot set descendant as parent (circular reference)');
      }
    }

    const updatedGroup = await group.update(data);

    logger.info('Group updated', { id: groupId, name: group.name });

    return updatedGroup;
  }

  /**
   * Delete group
   */
  async deleteGroup(groupId, userId) {
    const group = await AppGroup.findByPk(groupId);

    if (!group) {
      throw new Error('Group not found');
    }

    // Check for child groups
    const children = await group.getChildGroups();
    if (children.length > 0) {
      throw new Error('Cannot delete group with child groups. Delete or reassign child groups first.');
    }

    await group.destroy();

    logger.info('Group deleted', { id: groupId, name: group.name, deletedBy: userId });

    return { success: true, message: 'Group deleted successfully' };
  }

  // ============================================================================
  // PERMISSION OPERATIONS
  // ============================================================================

  /**
   * List permissions with pagination
   */
  async listPermissions(options = {}) {
    const {
      applicationId,
      resourceType,
      limit = 100,
      offset = 0
    } = options;

    const where = {};

    if (applicationId) {
      where.applicationId = applicationId;
    }

    if (resourceType) {
      where.resourceType = resourceType;
    }

    const { count, rows } = await AppPermission.findAndCountAll({
      where,
      limit,
      offset,
      order: [['name', 'ASC']],
      include: [
        {
          model: Application,
          as: 'application',
          attributes: ['id', 'name', 'displayName']
        }
      ]
    });

    return {
      total: count,
      permissions: rows,
      limit,
      offset,
      hasMore: offset + limit < count
    };
  }

  /**
   * Get permission by ID
   */
  async getPermissionById(permissionId) {
    const permission = await AppPermission.findByPk(permissionId, {
      include: [
        {
          model: Application,
          as: 'application',
          attributes: ['id', 'name', 'displayName']
        }
      ]
    });

    if (!permission) {
      throw new Error('Permission not found');
    }

    return permission;
  }

  /**
   * Create new permission
   */
  async createPermission(data, userId) {
    const { applicationId, name, displayName, actions } = data;

    // Verify application exists
    const application = await Application.findByPk(applicationId);
    if (!application) {
      throw new Error('Application not found');
    }

    // Check for duplicate permission name
    const existing = await AppPermission.findOne({
      where: { applicationId, name }
    });

    if (existing) {
      throw new Error(`Permission "${name}" already exists in this application`);
    }

    // Create permission
    const permission = await AppPermission.create({
      applicationId,
      name,
      displayName: displayName || name,
      description: data.description || '',
      resourceType: data.resourceType || 'general',
      actions: actions || ['read']
    });

    logger.info('Permission created', { id: permission.id, name, applicationId });

    return permission;
  }

  /**
   * Update permission
   */
  async updatePermission(permissionId, data, userId) {
    const permission = await AppPermission.findByPk(permissionId);

    if (!permission) {
      throw new Error('Permission not found');
    }

    // If updating name, check for conflicts
    if (data.name && data.name !== permission.name) {
      const existing = await AppPermission.findOne({
        where: {
          applicationId: permission.applicationId,
          name: data.name,
          id: { [Op.ne]: permissionId }
        }
      });

      if (existing) {
        throw new Error(`Permission "${data.name}" already exists in this application`);
      }
    }

    const updatedPermission = await permission.update(data);

    logger.info('Permission updated', { id: permissionId, name: permission.name });

    return updatedPermission;
  }

  /**
   * Delete permission
   */
  async deletePermission(permissionId, userId) {
    const permission = await AppPermission.findByPk(permissionId);

    if (!permission) {
      throw new Error('Permission not found');
    }

    await permission.destroy();

    logger.info('Permission deleted', { id: permissionId, name: permission.name, deletedBy: userId });

    return { success: true, message: 'Permission deleted successfully' };
  }

  /**
   * Check if user has permission
   */
  async checkPermission(userId, permissionName, resourceId = null) {
    const user = await AppUser.findByPk(userId);

    if (!user) {
      throw new Error('User not found');
    }

    const hasPermission = await user.hasPermission(permissionName);

    return {
      hasPermission,
      reason: hasPermission ? 'User has required permission' : 'User lacks required permission'
    };
  }
}

module.exports = new SecurityService();
