/**
 * Security Routes
 *
 * RBAC (Role-Based Access Control) and permissions management for the Low-Code Platform.
 * Manages users, roles, groups, and permissions for applications.
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { requireLowCodeAdmin } = require('../middleware/caTokenAuth');
const securityService = require('../services/SecurityService');
const logger = require('../utils/logger');

// Mock user ID for development
const getCurrentUserId = (req) => req.user?.id || 'mock-user-id';

// Async handler wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

// User Schemas
const listUsersSchema = Joi.object({
  applicationId: Joi.string().uuid().optional(),
  groupId: Joi.string().uuid().optional(),
  roleId: Joi.string().uuid().optional(),
  status: Joi.string().valid('active', 'inactive', 'suspended').optional(),
  limit: Joi.number().integer().min(1).max(100).default(25),
  offset: Joi.number().integer().min(0).default(0),
  sortBy: Joi.string().valid('created_at', 'updated_at', 'email', 'username').default('created_at'),
  sortOrder: Joi.string().valid('ASC', 'DESC').default('DESC'),
  search: Joi.string().max(255).optional()
});

const assignUserRoleSchema = Joi.object({
  userId: Joi.string().uuid().required(),
  roleId: Joi.string().uuid().required()
});

const assignUserGroupSchema = Joi.object({
  userId: Joi.string().uuid().required(),
  groupId: Joi.string().uuid().required()
});

// Role Schemas
const listRolesSchema = Joi.object({
  applicationId: Joi.string().uuid().optional(),
  limit: Joi.number().integer().min(1).max(100).default(25),
  offset: Joi.number().integer().min(0).default(0),
  sortBy: Joi.string().valid('created_at', 'updated_at', 'name').default('created_at'),
  sortOrder: Joi.string().valid('ASC', 'DESC').default('DESC')
});

const createRoleSchema = Joi.object({
  applicationId: Joi.string().uuid().required(),
  name: Joi.string().min(1).max(100).required().regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/),
  displayName: Joi.string().min(1).max(255).required(),
  description: Joi.string().max(1000).allow('', null).optional(),
  permissions: Joi.array().items(Joi.string()).default([]),
  priority: Joi.number().integer().min(0).max(100).default(0),
  isSystem: Joi.boolean().default(false)
});

const updateRoleSchema = Joi.object({
  displayName: Joi.string().min(1).max(255).optional(),
  description: Joi.string().max(1000).allow('', null).optional(),
  permissions: Joi.array().items(Joi.string()).optional(),
  priority: Joi.number().integer().min(0).max(100).optional()
}).min(1);

// Group Schemas
const listGroupsSchema = Joi.object({
  applicationId: Joi.string().uuid().optional(),
  limit: Joi.number().integer().min(1).max(100).default(25),
  offset: Joi.number().integer().min(0).default(0),
  sortBy: Joi.string().valid('created_at', 'updated_at', 'name').default('created_at'),
  sortOrder: Joi.string().valid('ASC', 'DESC').default('DESC')
});

const createGroupSchema = Joi.object({
  applicationId: Joi.string().uuid().required(),
  name: Joi.string().min(1).max(100).required().regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/),
  displayName: Joi.string().min(1).max(255).required(),
  description: Joi.string().max(1000).allow('', null).optional(),
  parentGroupId: Joi.string().uuid().allow(null).optional()
});

const updateGroupSchema = Joi.object({
  displayName: Joi.string().min(1).max(255).optional(),
  description: Joi.string().max(1000).allow('', null).optional(),
  parentGroupId: Joi.string().uuid().allow(null).optional()
}).min(1);

// Permission Schemas
const listPermissionsSchema = Joi.object({
  applicationId: Joi.string().uuid().optional(),
  resourceType: Joi.string().max(100).optional(),
  limit: Joi.number().integer().min(1).max(100).default(100),
  offset: Joi.number().integer().min(0).default(0)
});

const createPermissionSchema = Joi.object({
  applicationId: Joi.string().uuid().required(),
  name: Joi.string().min(1).max(100).required().regex(/^[a-zA-Z][a-zA-Z0-9_:.-]*$/),
  displayName: Joi.string().min(1).max(255).required(),
  description: Joi.string().max(1000).allow('', null).optional(),
  resourceType: Joi.string().max(100).default('general'),
  actions: Joi.array().items(Joi.string().valid('read', 'write', 'update', 'delete', 'append')).default(['read'])
});

const updatePermissionSchema = Joi.object({
  displayName: Joi.string().min(1).max(255).optional(),
  description: Joi.string().max(1000).allow('', null).optional(),
  resourceType: Joi.string().max(100).optional(),
  actions: Joi.array().items(Joi.string().valid('read', 'write', 'update', 'delete', 'append')).optional()
}).min(1);

const checkPermissionSchema = Joi.object({
  userId: Joi.string().uuid().required(),
  permission: Joi.string().required(),
  resourceId: Joi.string().uuid().optional()
});

// ============================================================================
// USER ROUTES
// ============================================================================

/**
 * GET /api/security/users
 * List users with filtering
 */
router.get('/users', asyncHandler(async (req, res) => {
  const { error, value } = listUsersSchema.validate(req.query);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const result = await securityService.listUsers(value);

  res.json({
    success: true,
    data: result
  });
}));

/**
 * GET /api/security/users/:userId/roles
 * Get user's roles
 */
router.get('/users/:userId/roles', asyncHandler(async (req, res) => {
  const { userId } = req.params;

  try {
    // For now, return mock data until we implement getUserRoles in SecurityService
    res.json({
      success: true,
      data: []
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: error.message
    });
  }
}));

/**
 * POST /api/security/users/:userId/roles
 * Assign role to user
 */
router.post('/users/:userId/roles', requireLowCodeAdmin, asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { error, value } = assignUserRoleSchema.validate({ userId, ...req.body });

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  try {
    const result = await securityService.assignUserRole(value.userId, value.roleId, getCurrentUserId(req));

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: 'BAD_REQUEST',
      message: error.message
    });
  }
}));

/**
 * DELETE /api/security/users/:userId/roles/:roleId
 * Remove role from user
 */
router.delete('/users/:userId/roles/:roleId', requireLowCodeAdmin, asyncHandler(async (req, res) => {
  const { userId, roleId } = req.params;

  try {
    const result = await securityService.removeUserRole(userId, roleId, getCurrentUserId(req));

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: 'BAD_REQUEST',
      message: error.message
    });
  }
}));

/**
 * POST /api/security/users/:userId/groups
 * Add user to group
 */
router.post('/users/:userId/groups', requireLowCodeAdmin, asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { error, value } = assignUserGroupSchema.validate({ userId, ...req.body });

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  try {
    const result = await securityService.addUserToGroup(value.userId, value.groupId, getCurrentUserId(req));

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: 'BAD_REQUEST',
      message: error.message
    });
  }
}));

/**
 * DELETE /api/security/users/:userId/groups/:groupId
 * Remove user from group
 */
router.delete('/users/:userId/groups/:groupId', requireLowCodeAdmin, asyncHandler(async (req, res) => {
  const { userId, groupId } = req.params;

  try {
    const result = await securityService.removeUserFromGroup(userId, groupId, getCurrentUserId(req));

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: 'BAD_REQUEST',
      message: error.message
    });
  }
}));

// ============================================================================
// ROLE ROUTES
// ============================================================================

/**
 * GET /api/security/roles
 * List all roles
 */
router.get('/roles', asyncHandler(async (req, res) => {
  const { error, value } = listRolesSchema.validate(req.query);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const result = await securityService.listRoles(value);

  res.json({
    success: true,
    data: result
  });
}));

/**
 * POST /api/security/roles
 * Create a new role
 */
router.post('/roles', requireLowCodeAdmin, asyncHandler(async (req, res) => {
  const { error, value } = createRoleSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  try {
    const role = await securityService.createRole(value, getCurrentUserId(req));

    res.status(201).json({
      success: true,
      data: role
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: 'BAD_REQUEST',
      message: error.message
    });
  }
}));

/**
 * GET /api/security/roles/:id
 * Get role by ID
 */
router.get('/roles/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const role = await securityService.getRoleById(id);

    res.json({
      success: true,
      data: role
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: error.message
    });
  }
}));

/**
 * PUT /api/security/roles/:id
 * Update role
 */
router.put('/roles/:id', requireLowCodeAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = updateRoleSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  try {
    const role = await securityService.updateRole(id, value, getCurrentUserId(req));

    res.json({
      success: true,
      data: role
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: error.message
    });
  }
}));

/**
 * DELETE /api/security/roles/:id
 * Delete role
 */
router.delete('/roles/:id', requireLowCodeAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const result = await securityService.deleteRole(id, getCurrentUserId(req));

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: error.message
    });
  }
}));

// ============================================================================
// GROUP ROUTES
// ============================================================================

/**
 * GET /api/security/groups
 * List all groups
 */
router.get('/groups', asyncHandler(async (req, res) => {
  const { error, value } = listGroupsSchema.validate(req.query);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const result = await securityService.listGroups(value);

  res.json({
    success: true,
    data: result
  });
}));

/**
 * POST /api/security/groups
 * Create a new group
 */
router.post('/groups', requireLowCodeAdmin, asyncHandler(async (req, res) => {
  const { error, value } = createGroupSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  try {
    const group = await securityService.createGroup(value, getCurrentUserId(req));

    res.status(201).json({
      success: true,
      data: group
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: 'BAD_REQUEST',
      message: error.message
    });
  }
}));

/**
 * GET /api/security/groups/:id
 * Get group by ID
 */
router.get('/groups/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const group = await securityService.getGroupById(id);

    res.json({
      success: true,
      data: group
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: error.message
    });
  }
}));

/**
 * PUT /api/security/groups/:id
 * Update group
 */
router.put('/groups/:id', requireLowCodeAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = updateGroupSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  try {
    const group = await securityService.updateGroup(id, value, getCurrentUserId(req));

    res.json({
      success: true,
      data: group
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: error.message
    });
  }
}));

/**
 * DELETE /api/security/groups/:id
 * Delete group
 */
router.delete('/groups/:id', requireLowCodeAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const result = await securityService.deleteGroup(id, getCurrentUserId(req));

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: error.message
    });
  }
}));

/**
 * GET /api/security/groups/:groupId/members
 * Get group members
 */
router.get('/groups/:groupId/members', asyncHandler(async (req, res) => {
  const { groupId } = req.params;

  try {
    // For now, return mock data until we implement getGroupMembers in SecurityService
    res.json({
      success: true,
      data: []
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: error.message
    });
  }
}));

/**
 * POST /api/security/groups/:groupId/members
 * Add member to group
 */
router.post('/groups/:groupId/members', requireLowCodeAdmin, asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'userId is required'
    });
  }

  try {
    const result = await securityService.addUserToGroup(userId, groupId, getCurrentUserId(req));

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: 'BAD_REQUEST',
      message: error.message
    });
  }
}));

/**
 * DELETE /api/security/groups/:groupId/members/:userId
 * Remove member from group
 */
router.delete('/groups/:groupId/members/:userId', requireLowCodeAdmin, asyncHandler(async (req, res) => {
  const { groupId, userId } = req.params;

  try {
    const result = await securityService.removeUserFromGroup(userId, groupId, getCurrentUserId(req));

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: 'BAD_REQUEST',
      message: error.message
    });
  }
}));

// ============================================================================
// PERMISSION ROUTES
// ============================================================================

/**
 * GET /api/security/permissions
 * List all permissions
 */
router.get('/permissions', asyncHandler(async (req, res) => {
  const { error, value } = listPermissionsSchema.validate(req.query);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const result = await securityService.listPermissions(value);

  res.json({
    success: true,
    data: result
  });
}));

/**
 * POST /api/security/permissions
 * Create a new permission
 */
router.post('/permissions', requireLowCodeAdmin, asyncHandler(async (req, res) => {
  const { error, value } = createPermissionSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  try {
    const permission = await securityService.createPermission(value, getCurrentUserId(req));

    res.status(201).json({
      success: true,
      data: permission
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: 'BAD_REQUEST',
      message: error.message
    });
  }
}));

/**
 * GET /api/security/permissions/:id
 * Get permission by ID
 */
router.get('/permissions/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const permission = await securityService.getPermissionById(id);

    res.json({
      success: true,
      data: permission
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: error.message
    });
  }
}));

/**
 * PUT /api/security/permissions/:id
 * Update permission
 */
router.put('/permissions/:id', requireLowCodeAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = updatePermissionSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  try {
    const permission = await securityService.updatePermission(id, value, getCurrentUserId(req));

    res.json({
      success: true,
      data: permission
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: error.message
    });
  }
}));

/**
 * DELETE /api/security/permissions/:id
 * Delete permission
 */
router.delete('/permissions/:id', requireLowCodeAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const result = await securityService.deletePermission(id, getCurrentUserId(req));

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: error.message
    });
  }
}));

/**
 * POST /api/security/permissions/check
 * Check if user has permission
 */
router.post('/permissions/check', asyncHandler(async (req, res) => {
  const { error, value } = checkPermissionSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  try {
    const result = await securityService.checkPermission(value.userId, value.permission, value.resourceId);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: 'BAD_REQUEST',
      message: error.message
    });
  }
}));

module.exports = router;
