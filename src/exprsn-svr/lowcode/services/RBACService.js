/**
 * ═══════════════════════════════════════════════════════════
 * RBAC Service - Role-Based Access Control
 * Provides granular permissions at multiple levels:
 * - Application level
 * - Form level
 * - Entity level
 * - Field level
 * - Record level
 * ═══════════════════════════════════════════════════════════
 */

const { AppRole, AppPermission, AppUserRole } = require('../models');
const { Op } = require('sequelize');

class RBACService {
  constructor() {
    // Permission cache (TTL: 5 minutes)
    this.permissionCache = new Map();
    this.cacheTTL = 5 * 60 * 1000;
  }

  /**
   * Check if user can access application
   */
  async canAccessApplication(userId, applicationId, action = 'read') {
    try {
      const cacheKey = `app_${userId}_${applicationId}_${action}`;

      // Check cache first
      if (this.permissionCache.has(cacheKey)) {
        const cached = this.permissionCache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheTTL) {
          return cached.value;
        }
      }

      // Get user roles for this application
      const userRoles = await this.getUserRoles(userId, applicationId);

      if (userRoles.length === 0) {
        this.cachePermission(cacheKey, false);
        return false;
      }

      // Get permissions for these roles
      const permissions = await AppPermission.findAll({
        where: {
          roleId: { [Op.in]: userRoles.map(r => r.id) },
          resourceType: 'application',
          resourceId: applicationId
        }
      });

      // Check if any permission grants the action
      const hasPermission = permissions.some(perm => {
        const actions = perm.actions || {};
        return actions[action] === true || actions.all === true;
      });

      this.cachePermission(cacheKey, hasPermission);
      return hasPermission;
    } catch (error) {
      console.error('[RBAC] Error checking application access:', error);
      return false;
    }
  }

  /**
   * Check if user can access form
   */
  async canAccessForm(userId, formId, action = 'read') {
    try {
      const cacheKey = `form_${userId}_${formId}_${action}`;

      if (this.permissionCache.has(cacheKey)) {
        const cached = this.permissionCache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheTTL) {
          return cached.value;
        }
      }

      // Get form to find application
      const { AppForm } = require('../models');
      const form = await AppForm.findByPk(formId);

      if (!form) return false;

      // First check application-level access
      const hasAppAccess = await this.canAccessApplication(userId, form.applicationId, action);
      if (!hasAppAccess) {
        this.cachePermission(cacheKey, false);
        return false;
      }

      // Get user roles
      const userRoles = await this.getUserRoles(userId, form.applicationId);

      // Get form-specific permissions
      const permissions = await AppPermission.findAll({
        where: {
          roleId: { [Op.in]: userRoles.map(r => r.id) },
          resourceType: 'form',
          resourceId: formId
        }
      });

      // If no form-specific permissions, inherit from application
      if (permissions.length === 0) {
        this.cachePermission(cacheKey, hasAppAccess);
        return hasAppAccess;
      }

      // Check explicit form permissions
      const hasPermission = permissions.some(perm => {
        const actions = perm.actions || {};
        return actions[action] === true || actions.all === true;
      });

      this.cachePermission(cacheKey, hasPermission);
      return hasPermission;
    } catch (error) {
      console.error('[RBAC] Error checking form access:', error);
      return false;
    }
  }

  /**
   * Check if user can access entity
   */
  async canAccessEntity(userId, entityId, action = 'read') {
    try {
      const cacheKey = `entity_${userId}_${entityId}_${action}`;

      if (this.permissionCache.has(cacheKey)) {
        const cached = this.permissionCache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheTTL) {
          return cached.value;
        }
      }

      // Get entity to find application
      const { Entity } = require('../models');
      const entity = await Entity.findByPk(entityId);

      if (!entity) return false;

      // Check application-level access
      const hasAppAccess = await this.canAccessApplication(userId, entity.applicationId, action);
      if (!hasAppAccess) {
        this.cachePermission(cacheKey, false);
        return false;
      }

      // Get user roles
      const userRoles = await this.getUserRoles(userId, entity.applicationId);

      // Get entity-specific permissions
      const permissions = await AppPermission.findAll({
        where: {
          roleId: { [Op.in]: userRoles.map(r => r.id) },
          resourceType: 'entity',
          resourceId: entityId
        }
      });

      // Inherit from application if no entity-specific permissions
      if (permissions.length === 0) {
        this.cachePermission(cacheKey, hasAppAccess);
        return hasAppAccess;
      }

      const hasPermission = permissions.some(perm => {
        const actions = perm.actions || {};
        return actions[action] === true || actions.all === true;
      });

      this.cachePermission(cacheKey, hasPermission);
      return hasPermission;
    } catch (error) {
      console.error('[RBAC] Error checking entity access:', error);
      return false;
    }
  }

  /**
   * Check field-level access
   */
  async canAccessField(userId, entityId, fieldName, action = 'read') {
    try {
      const cacheKey = `field_${userId}_${entityId}_${fieldName}_${action}`;

      if (this.permissionCache.has(cacheKey)) {
        const cached = this.permissionCache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheTTL) {
          return cached.value;
        }
      }

      // First check entity-level access
      const hasEntityAccess = await this.canAccessEntity(userId, entityId, action);
      if (!hasEntityAccess) {
        this.cachePermission(cacheKey, false);
        return false;
      }

      // Get entity to check field-specific permissions
      const { Entity } = require('../models');
      const entity = await Entity.findByPk(entityId);

      if (!entity) return false;

      // Get user roles
      const userRoles = await this.getUserRoles(userId, entity.applicationId);

      // Check field-level permissions in entity schema
      const field = entity.schema.fields.find(f => f.name === fieldName);
      if (!field || !field.permissions) {
        // No field-specific permissions, inherit from entity
        this.cachePermission(cacheKey, hasEntityAccess);
        return hasEntityAccess;
      }

      // Check if any user role has access to this field
      const hasFieldAccess = userRoles.some(role => {
        const fieldPerms = field.permissions[role.name] || field.permissions[role.id];
        if (!fieldPerms) return false;
        return fieldPerms[action] === true || fieldPerms.all === true;
      });

      this.cachePermission(cacheKey, hasFieldAccess);
      return hasFieldAccess;
    } catch (error) {
      console.error('[RBAC] Error checking field access:', error);
      return false;
    }
  }

  /**
   * Filter entity fields based on user permissions
   */
  async filterFields(userId, entityId, fields, action = 'read') {
    const allowedFields = [];

    for (const field of fields) {
      const canAccess = await this.canAccessField(userId, entityId, field.name, action);
      if (canAccess) {
        allowedFields.push(field);
      }
    }

    return allowedFields;
  }

  /**
   * Check record-level access (based on ownership or conditions)
   */
  async canAccessRecord(userId, entityId, recordId, action = 'read') {
    try {
      // First check entity-level access
      const hasEntityAccess = await this.canAccessEntity(userId, entityId, action);
      if (!hasEntityAccess) {
        return false;
      }

      // Get entity to check record-level rules
      const { Entity } = require('../models');
      const entity = await Entity.findByPk(entityId);

      if (!entity) return false;

      // Get user roles
      const userRoles = await this.getUserRoles(userId, entity.applicationId);

      // Check for record-level permission rules
      for (const role of userRoles) {
        const permissions = await AppPermission.findAll({
          where: {
            roleId: role.id,
            resourceType: 'entity',
            resourceId: entityId
          }
        });

        for (const perm of permissions) {
          // Check if permission has record-level conditions
          if (perm.conditions) {
            const meetsConditions = await this.evaluateRecordConditions(
              perm.conditions,
              userId,
              recordId,
              entity
            );

            if (meetsConditions) {
              const actions = perm.actions || {};
              if (actions[action] === true || actions.all === true) {
                return true;
              }
            }
          }
        }
      }

      // Default to entity-level access
      return hasEntityAccess;
    } catch (error) {
      console.error('[RBAC] Error checking record access:', error);
      return false;
    }
  }

  /**
   * Evaluate record-level conditions
   */
  async evaluateRecordConditions(conditions, userId, recordId, entity) {
    try {
      // Common conditions:
      // - owner: user owns the record
      // - department: user in same department
      // - custom: custom JavaScript expression

      if (conditions.type === 'owner') {
        // Check if user owns the record
        const ownerField = conditions.ownerField || 'createdBy';
        // TODO: Query actual record to check ownership
        return true; // Placeholder
      }

      if (conditions.type === 'department') {
        // Check if user in same department as record
        // TODO: Implement department matching logic
        return true; // Placeholder
      }

      if (conditions.type === 'custom') {
        // Evaluate custom condition
        return this.evaluateCustomCondition(conditions.expression, userId, recordId);
      }

      return false;
    } catch (error) {
      console.error('[RBAC] Error evaluating record conditions:', error);
      return false;
    }
  }

  /**
   * Evaluate custom condition expression
   */
  evaluateCustomCondition(expression, userId, recordId) {
    try {
      // Create safe evaluation context
      const context = { userId, recordId };
      const func = new Function(...Object.keys(context), `return ${expression}`);
      return func(...Object.values(context));
    } catch (error) {
      console.error('[RBAC] Error evaluating custom condition:', error);
      return false;
    }
  }

  /**
   * Get user roles for an application
   */
  async getUserRoles(userId, applicationId) {
    try {
      const userRoles = await AppUserRole.findAll({
        where: {
          userId,
          applicationId
        },
        include: [{
          model: AppRole,
          as: 'role'
        }]
      });

      return userRoles.map(ur => ur.role);
    } catch (error) {
      console.error('[RBAC] Error getting user roles:', error);
      return [];
    }
  }

  /**
   * Assign role to user
   */
  async assignRole(userId, applicationId, roleId) {
    try {
      // Check if already assigned
      const existing = await AppUserRole.findOne({
        where: {
          userId,
          applicationId,
          roleId
        }
      });

      if (existing) {
        return { success: true, message: 'Role already assigned' };
      }

      await AppUserRole.create({
        userId,
        applicationId,
        roleId
      });

      // Invalidate cache
      this.clearCacheForUser(userId);

      return { success: true, message: 'Role assigned successfully' };
    } catch (error) {
      console.error('[RBAC] Error assigning role:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Remove role from user
   */
  async removeRole(userId, applicationId, roleId) {
    try {
      await AppUserRole.destroy({
        where: {
          userId,
          applicationId,
          roleId
        }
      });

      // Invalidate cache
      this.clearCacheForUser(userId);

      return { success: true, message: 'Role removed successfully' };
    } catch (error) {
      console.error('[RBAC] Error removing role:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create new role
   */
  async createRole(applicationId, roleData) {
    try {
      const role = await AppRole.create({
        applicationId,
        name: roleData.name,
        displayName: roleData.displayName,
        description: roleData.description,
        isSystemRole: roleData.isSystemRole || false,
        permissions: roleData.permissions || {}
      });

      return { success: true, role };
    } catch (error) {
      console.error('[RBAC] Error creating role:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update role
   */
  async updateRole(roleId, updates) {
    try {
      const role = await AppRole.findByPk(roleId);

      if (!role) {
        return { success: false, error: 'Role not found' };
      }

      // Don't allow modification of system roles
      if (role.isSystemRole && !updates.allowSystemRoleEdit) {
        return { success: false, error: 'Cannot modify system role' };
      }

      await role.update(updates);

      // Invalidate cache for all users with this role
      this.clearCacheForRole(roleId);

      return { success: true, role };
    } catch (error) {
      console.error('[RBAC] Error updating role:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete role
   */
  async deleteRole(roleId) {
    try {
      const role = await AppRole.findByPk(roleId);

      if (!role) {
        return { success: false, error: 'Role not found' };
      }

      if (role.isSystemRole) {
        return { success: false, error: 'Cannot delete system role' };
      }

      // Remove all user assignments
      await AppUserRole.destroy({ where: { roleId } });

      // Remove all permissions
      await AppPermission.destroy({ where: { roleId } });

      // Delete role
      await role.destroy();

      // Clear cache
      this.clearCacheForRole(roleId);

      return { success: true, message: 'Role deleted successfully' };
    } catch (error) {
      console.error('[RBAC] Error deleting role:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Grant permission to role
   */
  async grantPermission(roleId, permissionData) {
    try {
      const permission = await AppPermission.create({
        roleId,
        resourceType: permissionData.resourceType,
        resourceId: permissionData.resourceId,
        actions: permissionData.actions,
        conditions: permissionData.conditions || null,
        fieldPermissions: permissionData.fieldPermissions || null
      });

      // Clear cache
      this.clearCacheForRole(roleId);

      return { success: true, permission };
    } catch (error) {
      console.error('[RBAC] Error granting permission:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Revoke permission from role
   */
  async revokePermission(permissionId) {
    try {
      const permission = await AppPermission.findByPk(permissionId);

      if (!permission) {
        return { success: false, error: 'Permission not found' };
      }

      const roleId = permission.roleId;
      await permission.destroy();

      // Clear cache
      this.clearCacheForRole(roleId);

      return { success: true, message: 'Permission revoked successfully' };
    } catch (error) {
      console.error('[RBAC] Error revoking permission:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Cache permission result
   */
  cachePermission(key, value) {
    this.permissionCache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  /**
   * Clear cache for specific user
   */
  clearCacheForUser(userId) {
    for (const [key] of this.permissionCache) {
      if (key.includes(`_${userId}_`)) {
        this.permissionCache.delete(key);
      }
    }
  }

  /**
   * Clear cache for specific role
   */
  clearCacheForRole(roleId) {
    // This requires more sophisticated caching, for now clear all
    this.permissionCache.clear();
  }

  /**
   * Clear entire cache
   */
  clearCache() {
    this.permissionCache.clear();
  }
}

module.exports = RBACService;
