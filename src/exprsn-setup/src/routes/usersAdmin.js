/**
 * ═══════════════════════════════════════════════════════════════════════
 * User Administration Routes
 * ═══════════════════════════════════════════════════════════════════════
 * Comprehensive user management including:
 * - User CRUD operations
 * - Suspension, banning, restriction
 * - Import/Export (individual and bulk)
 * - DID management
 * - Password and authentication policies
 * - Group membership management
 * - Role assignment (multiple roles per user)
 * - Token and certificate issuance/revocation
 * - Service access management
 * - OAuth scope definition
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');

// Service URLs
const AUTH_SERVICE_URL = process.env.AUTH_URL || 'http://localhost:3001';
const CA_SERVICE_URL = process.env.CA_URL || 'http://localhost:3000';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * USER MANAGEMENT - CRUD OPERATIONS
 * ═══════════════════════════════════════════════════════════════════════
 */

// GET /api/users - List all users with filtering and pagination
router.get('/', async (req, res) => {
  try {
    const { status, search, role, group, page = 1, limit = 50, sort = '-createdAt' } = req.query;

    const response = await axios.get(`${AUTH_SERVICE_URL}/api/admin/users`, {
      params: { status, search, role, group, page, limit, sort }
    });

    res.json(response.data);
  } catch (error) {
    logger.error('Failed to fetch users:', error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to fetch users'
    });
  }
});

// GET /api/users/stats - Get user statistics
router.get('/stats', async (req, res) => {
  try {
    const response = await axios.get(`${AUTH_SERVICE_URL}/api/admin/users/stats`);

    res.json(response.data);
  } catch (error) {
    logger.error('Failed to fetch user stats:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user statistics',
      data: {
        total: 0,
        active: 0,
        suspended: 0,
        inactive: 0,
        newToday: 0,
        newThisWeek: 0
      }
    });
  }
});

// GET /api/users/:id - Get specific user details
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const response = await axios.get(`${AUTH_SERVICE_URL}/api/admin/users/${id}`);

    res.json(response.data);
  } catch (error) {
    logger.error(`Failed to fetch user ${req.params.id}:`, error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to fetch user'
    });
  }
});

// POST /api/users - Create new user
router.post('/', async (req, res) => {
  try {
    const userData = req.body;

    const response = await axios.post(`${AUTH_SERVICE_URL}/api/admin/users`, userData);

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('user:created', {
        user: response.data.user,
        timestamp: new Date().toISOString()
      });
    }

    res.status(201).json(response.data);
  } catch (error) {
    logger.error('Failed to create user:', error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to create user'
    });
  }
});

// PUT /api/users/:id - Update user
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userData = req.body;

    const response = await axios.put(`${AUTH_SERVICE_URL}/api/admin/users/${id}`, userData);

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('user:updated', {
        userId: id,
        updates: userData,
        timestamp: new Date().toISOString()
      });
    }

    res.json(response.data);
  } catch (error) {
    logger.error(`Failed to update user ${req.params.id}:`, error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to update user'
    });
  }
});

// DELETE /api/users/:id - Delete user
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const response = await axios.delete(`${AUTH_SERVICE_URL}/api/admin/users/${id}`);

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('user:deleted', {
        userId: id,
        timestamp: new Date().toISOString()
      });
    }

    res.json(response.data);
  } catch (error) {
    logger.error(`Failed to delete user ${req.params.id}:`, error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to delete user'
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * USER STATUS MANAGEMENT
 * ═══════════════════════════════════════════════════════════════════════
 */

// POST /api/users/:id/suspend - Suspend user
router.post('/:id/suspend', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, duration } = req.body;

    const response = await axios.post(`${AUTH_SERVICE_URL}/api/admin/users/${id}/suspend`, {
      reason,
      duration
    });

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('user:suspended', {
        userId: id,
        reason,
        duration,
        timestamp: new Date().toISOString()
      });
    }

    res.json(response.data);
  } catch (error) {
    logger.error(`Failed to suspend user ${req.params.id}:`, error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to suspend user'
    });
  }
});

// POST /api/users/:id/unsuspend - Unsuspend user
router.post('/:id/unsuspend', async (req, res) => {
  try {
    const { id } = req.params;

    const response = await axios.post(`${AUTH_SERVICE_URL}/api/admin/users/${id}/unsuspend`);

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('user:unsuspended', {
        userId: id,
        timestamp: new Date().toISOString()
      });
    }

    res.json(response.data);
  } catch (error) {
    logger.error(`Failed to unsuspend user ${req.params.id}:`, error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to unsuspend user'
    });
  }
});

// POST /api/users/:id/ban - Ban user permanently
router.post('/:id/ban', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const response = await axios.post(`${AUTH_SERVICE_URL}/api/admin/users/${id}/ban`, { reason });

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('user:banned', {
        userId: id,
        reason,
        timestamp: new Date().toISOString()
      });
    }

    res.json(response.data);
  } catch (error) {
    logger.error(`Failed to ban user ${req.params.id}:`, error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to ban user'
    });
  }
});

// POST /api/users/:id/activate - Activate user
router.post('/:id/activate', async (req, res) => {
  try {
    const { id } = req.params;

    const response = await axios.post(`${AUTH_SERVICE_URL}/api/admin/users/${id}/activate`);

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('user:activated', {
        userId: id,
        timestamp: new Date().toISOString()
      });
    }

    res.json(response.data);
  } catch (error) {
    logger.error(`Failed to activate user ${req.params.id}:`, error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to activate user'
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * BULK OPERATIONS
 * ═══════════════════════════════════════════════════════════════════════
 */

// POST /api/users/bulk/suspend - Bulk suspend users
router.post('/bulk/suspend', async (req, res) => {
  try {
    const { userIds, reason, duration } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'userIds array is required'
      });
    }

    const response = await axios.post(`${AUTH_SERVICE_URL}/api/admin/users/bulk/suspend`, {
      userIds,
      reason,
      duration
    });

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('users:bulk-suspended', {
        count: userIds.length,
        userIds,
        reason,
        timestamp: new Date().toISOString()
      });
    }

    res.json(response.data);
  } catch (error) {
    logger.error('Bulk suspend failed:', error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Bulk suspend operation failed'
    });
  }
});

// POST /api/users/bulk/delete - Bulk delete users
router.post('/bulk/delete', async (req, res) => {
  try {
    const { userIds } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'userIds array is required'
      });
    }

    const response = await axios.post(`${AUTH_SERVICE_URL}/api/admin/users/bulk/delete`, {
      userIds
    });

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('users:bulk-deleted', {
        count: userIds.length,
        userIds,
        timestamp: new Date().toISOString()
      });
    }

    res.json(response.data);
  } catch (error) {
    logger.error('Bulk delete failed:', error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Bulk delete operation failed'
    });
  }
});

// POST /api/users/bulk/update-role - Bulk update user roles
router.post('/bulk/update-role', async (req, res) => {
  try {
    const { userIds, roleId, action } = req.body; // action: 'add' or 'remove'

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'userIds array is required'
      });
    }

    const response = await axios.post(`${AUTH_SERVICE_URL}/api/admin/users/bulk/update-role`, {
      userIds,
      roleId,
      action
    });

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('users:bulk-role-updated', {
        count: userIds.length,
        roleId,
        action,
        timestamp: new Date().toISOString()
      });
    }

    res.json(response.data);
  } catch (error) {
    logger.error('Bulk role update failed:', error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Bulk role update operation failed'
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * IMPORT / EXPORT
 * ═══════════════════════════════════════════════════════════════════════
 */

// GET /api/users/:id/export - Export individual user data
router.get('/:id/export', async (req, res) => {
  try {
    const { id } = req.params;
    const { format = 'json' } = req.query; // json or csv

    const response = await axios.get(`${AUTH_SERVICE_URL}/api/admin/users/${id}/export`, {
      params: { format }
    });

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="user_${id}.json"`);
      res.json(response.data);
    } else {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="user_${id}.csv"`);
      res.send(response.data);
    }
  } catch (error) {
    logger.error(`Failed to export user ${req.params.id}:`, error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to export user'
    });
  }
});

// POST /api/users/bulk/export - Bulk export users
router.post('/bulk/export', async (req, res) => {
  try {
    const { userIds, format = 'json' } = req.body;

    const response = await axios.post(`${AUTH_SERVICE_URL}/api/admin/users/bulk/export`, {
      userIds,
      format
    });

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="users_export.json"');
      res.json(response.data);
    } else {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="users_export.csv"');
      res.send(response.data);
    }
  } catch (error) {
    logger.error('Bulk export failed:', error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Bulk export operation failed'
    });
  }
});

// POST /api/users/import - Import users from file
router.post('/import', async (req, res) => {
  try {
    const { users, mode = 'create' } = req.body; // mode: 'create', 'update', or 'upsert'

    if (!users || !Array.isArray(users) || users.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'users array is required'
      });
    }

    const response = await axios.post(`${AUTH_SERVICE_URL}/api/admin/users/import`, {
      users,
      mode
    });

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('users:imported', {
        count: users.length,
        mode,
        timestamp: new Date().toISOString()
      });
    }

    res.json(response.data);
  } catch (error) {
    logger.error('User import failed:', error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'User import failed'
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * GROUP MANAGEMENT
 * ═══════════════════════════════════════════════════════════════════════
 */

// GET /api/users/:id/groups - Get user's groups
router.get('/:id/groups', async (req, res) => {
  try {
    const { id } = req.params;

    const response = await axios.get(`${AUTH_SERVICE_URL}/api/admin/users/${id}/groups`);

    res.json(response.data);
  } catch (error) {
    logger.error(`Failed to fetch groups for user ${req.params.id}:`, error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to fetch user groups'
    });
  }
});

// POST /api/users/:id/groups - Add user to group
router.post('/:id/groups', async (req, res) => {
  try {
    const { id } = req.params;
    const { groupId, role = 'member' } = req.body;

    const response = await axios.post(`${AUTH_SERVICE_URL}/api/admin/users/${id}/groups`, {
      groupId,
      role
    });

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('user:group-added', {
        userId: id,
        groupId,
        role,
        timestamp: new Date().toISOString()
      });
    }

    res.json(response.data);
  } catch (error) {
    logger.error(`Failed to add user ${req.params.id} to group:`, error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to add user to group'
    });
  }
});

// DELETE /api/users/:id/groups/:groupId - Remove user from group
router.delete('/:id/groups/:groupId', async (req, res) => {
  try {
    const { id, groupId } = req.params;

    const response = await axios.delete(
      `${AUTH_SERVICE_URL}/api/admin/users/${id}/groups/${groupId}`
    );

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('user:group-removed', {
        userId: id,
        groupId,
        timestamp: new Date().toISOString()
      });
    }

    res.json(response.data);
  } catch (error) {
    logger.error(`Failed to remove user ${req.params.id} from group:`, error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to remove user from group'
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * ROLE MANAGEMENT
 * ═══════════════════════════════════════════════════════════════════════
 */

// GET /api/users/:id/roles - Get user's roles
router.get('/:id/roles', async (req, res) => {
  try {
    const { id } = req.params;

    const response = await axios.get(`${AUTH_SERVICE_URL}/api/admin/users/${id}/roles`);

    res.json(response.data);
  } catch (error) {
    logger.error(`Failed to fetch roles for user ${req.params.id}:`, error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to fetch user roles'
    });
  }
});

// POST /api/users/:id/roles - Assign role to user
router.post('/:id/roles', async (req, res) => {
  try {
    const { id } = req.params;
    const { roleId } = req.body;

    const response = await axios.post(`${AUTH_SERVICE_URL}/api/admin/users/${id}/roles`, {
      roleId
    });

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('user:role-assigned', {
        userId: id,
        roleId,
        timestamp: new Date().toISOString()
      });
    }

    res.json(response.data);
  } catch (error) {
    logger.error(`Failed to assign role to user ${req.params.id}:`, error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to assign role'
    });
  }
});

// DELETE /api/users/:id/roles/:roleId - Remove role from user
router.delete('/:id/roles/:roleId', async (req, res) => {
  try {
    const { id, roleId } = req.params;

    const response = await axios.delete(
      `${AUTH_SERVICE_URL}/api/admin/users/${id}/roles/${roleId}`
    );

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('user:role-removed', {
        userId: id,
        roleId,
        timestamp: new Date().toISOString()
      });
    }

    res.json(response.data);
  } catch (error) {
    logger.error(`Failed to remove role from user ${req.params.id}:`, error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to remove role'
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * DID MANAGEMENT
 * ═══════════════════════════════════════════════════════════════════════
 */

// GET /api/users/:id/did - Get user's DID
router.get('/:id/did', async (req, res) => {
  try {
    const { id } = req.params;

    const response = await axios.get(`${AUTH_SERVICE_URL}/api/admin/users/${id}/did`);

    res.json(response.data);
  } catch (error) {
    logger.error(`Failed to fetch DID for user ${req.params.id}:`, error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to fetch DID',
      data: { did: null }
    });
  }
});

// POST /api/users/:id/did - Create or update user's DID
router.post('/:id/did', async (req, res) => {
  try {
    const { id } = req.params;
    const { method = 'did:key', options = {} } = req.body;

    const response = await axios.post(`${AUTH_SERVICE_URL}/api/admin/users/${id}/did`, {
      method,
      options
    });

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('user:did-updated', {
        userId: id,
        did: response.data.did,
        timestamp: new Date().toISOString()
      });
    }

    res.json(response.data);
  } catch (error) {
    logger.error(`Failed to create/update DID for user ${req.params.id}:`, error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to create/update DID'
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * PASSWORD & AUTHENTICATION POLICIES
 * ═══════════════════════════════════════════════════════════════════════
 */

// POST /api/users/:id/reset-password - Admin reset user password
router.post('/:id/reset-password', async (req, res) => {
  try {
    const { id } = req.params;
    const { password, requirePasswordChange = true } = req.body;

    const response = await axios.post(`${AUTH_SERVICE_URL}/api/admin/users/${id}/reset-password`, {
      password,
      requirePasswordChange
    });

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('user:password-reset', {
        userId: id,
        timestamp: new Date().toISOString()
      });
    }

    res.json(response.data);
  } catch (error) {
    logger.error(`Failed to reset password for user ${req.params.id}:`, error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to reset password'
    });
  }
});

// POST /api/users/:id/force-password-change - Force password change on next login
router.post('/:id/force-password-change', async (req, res) => {
  try {
    const { id } = req.params;

    const response = await axios.post(
      `${AUTH_SERVICE_URL}/api/admin/users/${id}/force-password-change`
    );

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('user:force-password-change', {
        userId: id,
        timestamp: new Date().toISOString()
      });
    }

    res.json(response.data);
  } catch (error) {
    logger.error(`Failed to force password change for user ${req.params.id}:`, error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to force password change'
    });
  }
});

// POST /api/users/:id/mfa/enable - Enable MFA for user
router.post('/:id/mfa/enable', async (req, res) => {
  try {
    const { id } = req.params;

    const response = await axios.post(`${AUTH_SERVICE_URL}/api/admin/users/${id}/mfa/enable`);

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('user:mfa-enabled', {
        userId: id,
        timestamp: new Date().toISOString()
      });
    }

    res.json(response.data);
  } catch (error) {
    logger.error(`Failed to enable MFA for user ${req.params.id}:`, error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to enable MFA'
    });
  }
});

// POST /api/users/:id/mfa/disable - Disable MFA for user
router.post('/:id/mfa/disable', async (req, res) => {
  try {
    const { id } = req.params;

    const response = await axios.post(`${AUTH_SERVICE_URL}/api/admin/users/${id}/mfa/disable`);

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('user:mfa-disabled', {
        userId: id,
        timestamp: new Date().toISOString()
      });
    }

    res.json(response.data);
  } catch (error) {
    logger.error(`Failed to disable MFA for user ${req.params.id}:`, error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to disable MFA'
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * TOKEN & CERTIFICATE MANAGEMENT
 * ═══════════════════════════════════════════════════════════════════════
 */

// GET /api/users/:id/tokens - Get user's tokens
router.get('/:id/tokens', async (req, res) => {
  try {
    const { id } = req.params;

    const response = await axios.get(`${AUTH_SERVICE_URL}/api/admin/users/${id}/tokens`);

    res.json(response.data);
  } catch (error) {
    logger.error(`Failed to fetch tokens for user ${req.params.id}:`, error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to fetch tokens',
      data: { tokens: [] }
    });
  }
});

// POST /api/users/:id/tokens/issue - Issue token for user
router.post('/:id/tokens/issue', async (req, res) => {
  try {
    const { id } = req.params;
    const { type, permissions, expiryType, duration, maxUses } = req.body;

    // Issue CA token
    const response = await axios.post(`${CA_SERVICE_URL}/api/tokens/generate`, {
      userId: id,
      type, // 'time' or 'use'
      permissions,
      expiryType,
      duration,
      maxUses
    });

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('user:token-issued', {
        userId: id,
        tokenId: response.data.tokenId,
        type,
        timestamp: new Date().toISOString()
      });
    }

    res.json(response.data);
  } catch (error) {
    logger.error(`Failed to issue token for user ${req.params.id}:`, error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to issue token'
    });
  }
});

// POST /api/users/:id/tokens/:tokenId/revoke - Revoke token
router.post('/:id/tokens/:tokenId/revoke', async (req, res) => {
  try {
    const { id, tokenId } = req.params;
    const { reason = 'admin_revocation' } = req.body;

    const response = await axios.post(`${CA_SERVICE_URL}/api/tokens/${tokenId}/revoke`, {
      reason
    });

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('user:token-revoked', {
        userId: id,
        tokenId,
        reason,
        timestamp: new Date().toISOString()
      });
    }

    res.json(response.data);
  } catch (error) {
    logger.error(`Failed to revoke token for user ${req.params.id}:`, error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to revoke token'
    });
  }
});

// GET /api/users/:id/certificates - Get user's certificates
router.get('/:id/certificates', async (req, res) => {
  try {
    const { id } = req.params;

    const response = await axios.get(`${CA_SERVICE_URL}/api/certificates`, {
      params: { userId: id }
    });

    res.json(response.data);
  } catch (error) {
    logger.error(`Failed to fetch certificates for user ${req.params.id}:`, error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to fetch certificates',
      data: { certificates: [] }
    });
  }
});

// POST /api/users/:id/certificates/issue - Issue certificate for user
router.post('/:id/certificates/issue', async (req, res) => {
  try {
    const { id } = req.params;
    const certificateData = req.body;

    const response = await axios.post(`${CA_SERVICE_URL}/api/certificates/issue`, {
      userId: id,
      ...certificateData
    });

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('user:certificate-issued', {
        userId: id,
        certificateId: response.data.certificateId,
        timestamp: new Date().toISOString()
      });
    }

    res.json(response.data);
  } catch (error) {
    logger.error(`Failed to issue certificate for user ${req.params.id}:`, error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to issue certificate'
    });
  }
});

// POST /api/users/:id/certificates/:certId/revoke - Revoke certificate
router.post('/:id/certificates/:certId/revoke', async (req, res) => {
  try {
    const { id, certId } = req.params;
    const { reason = 'unspecified' } = req.body;

    const response = await axios.post(`${CA_SERVICE_URL}/api/certificates/${certId}/revoke`, {
      reason
    });

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('user:certificate-revoked', {
        userId: id,
        certificateId: certId,
        reason,
        timestamp: new Date().toISOString()
      });
    }

    res.json(response.data);
  } catch (error) {
    logger.error(`Failed to revoke certificate for user ${req.params.id}:`, error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to revoke certificate'
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * SERVICE ACCESS MANAGEMENT
 * ═══════════════════════════════════════════════════════════════════════
 */

// GET /api/users/:id/services - Get user's service access
router.get('/:id/services', async (req, res) => {
  try {
    const { id } = req.params;

    const response = await axios.get(`${AUTH_SERVICE_URL}/api/admin/users/${id}/services`);

    res.json(response.data);
  } catch (error) {
    logger.error(`Failed to fetch service access for user ${req.params.id}:`, error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to fetch service access',
      data: { services: [] }
    });
  }
});

// POST /api/users/:id/services - Grant service access
router.post('/:id/services', async (req, res) => {
  try {
    const { id } = req.params;
    const { serviceKey, permissions = [] } = req.body;

    const response = await axios.post(`${AUTH_SERVICE_URL}/api/admin/users/${id}/services`, {
      serviceKey,
      permissions
    });

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('user:service-granted', {
        userId: id,
        serviceKey,
        permissions,
        timestamp: new Date().toISOString()
      });
    }

    res.json(response.data);
  } catch (error) {
    logger.error(`Failed to grant service access for user ${req.params.id}:`, error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to grant service access'
    });
  }
});

// DELETE /api/users/:id/services/:serviceKey - Revoke service access
router.delete('/:id/services/:serviceKey', async (req, res) => {
  try {
    const { id, serviceKey } = req.params;

    const response = await axios.delete(
      `${AUTH_SERVICE_URL}/api/admin/users/${id}/services/${serviceKey}`
    );

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('user:service-revoked', {
        userId: id,
        serviceKey,
        timestamp: new Date().toISOString()
      });
    }

    res.json(response.data);
  } catch (error) {
    logger.error(`Failed to revoke service access for user ${req.params.id}:`, error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to revoke service access'
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * OAUTH SCOPE MANAGEMENT
 * ═══════════════════════════════════════════════════════════════════════
 */

// GET /api/users/:id/oauth-scopes - Get user's OAuth scopes
router.get('/:id/oauth-scopes', async (req, res) => {
  try {
    const { id } = req.params;

    const response = await axios.get(`${AUTH_SERVICE_URL}/api/admin/users/${id}/oauth-scopes`);

    res.json(response.data);
  } catch (error) {
    logger.error(`Failed to fetch OAuth scopes for user ${req.params.id}:`, error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to fetch OAuth scopes',
      data: { scopes: [] }
    });
  }
});

// POST /api/users/:id/oauth-scopes - Add OAuth scopes
router.post('/:id/oauth-scopes', async (req, res) => {
  try {
    const { id } = req.params;
    const { scopes } = req.body;

    if (!scopes || !Array.isArray(scopes)) {
      return res.status(400).json({
        success: false,
        error: 'scopes array is required'
      });
    }

    const response = await axios.post(`${AUTH_SERVICE_URL}/api/admin/users/${id}/oauth-scopes`, {
      scopes
    });

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('user:oauth-scopes-updated', {
        userId: id,
        scopes,
        timestamp: new Date().toISOString()
      });
    }

    res.json(response.data);
  } catch (error) {
    logger.error(`Failed to add OAuth scopes for user ${req.params.id}:`, error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to add OAuth scopes'
    });
  }
});

// DELETE /api/users/:id/oauth-scopes - Remove OAuth scope
router.delete('/:id/oauth-scopes', async (req, res) => {
  try {
    const { id } = req.params;
    const { scope } = req.body;

    const response = await axios.delete(`${AUTH_SERVICE_URL}/api/admin/users/${id}/oauth-scopes`, {
      data: { scope }
    });

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('user:oauth-scope-removed', {
        userId: id,
        scope,
        timestamp: new Date().toISOString()
      });
    }

    res.json(response.data);
  } catch (error) {
    logger.error(`Failed to remove OAuth scope for user ${req.params.id}:`, error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to remove OAuth scope'
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * SESSIONS & ACTIVITY
 * ═══════════════════════════════════════════════════════════════════════
 */

// GET /api/users/:id/sessions - Get active sessions
router.get('/:id/sessions', async (req, res) => {
  try {
    const { id } = req.params;

    const response = await axios.get(`${AUTH_SERVICE_URL}/api/admin/users/${id}/sessions`);

    res.json(response.data);
  } catch (error) {
    logger.error(`Failed to fetch sessions for user ${req.params.id}:`, error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to fetch sessions',
      data: { sessions: [] }
    });
  }
});

// DELETE /api/users/:id/sessions/:sessionId - Terminate session
router.delete('/:id/sessions/:sessionId', async (req, res) => {
  try {
    const { id, sessionId } = req.params;

    const response = await axios.delete(
      `${AUTH_SERVICE_URL}/api/admin/users/${id}/sessions/${sessionId}`
    );

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('user:session-terminated', {
        userId: id,
        sessionId,
        timestamp: new Date().toISOString()
      });
    }

    res.json(response.data);
  } catch (error) {
    logger.error(`Failed to terminate session for user ${req.params.id}:`, error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to terminate session'
    });
  }
});

// POST /api/users/:id/sessions/terminate-all - Terminate all sessions
router.post('/:id/sessions/terminate-all', async (req, res) => {
  try {
    const { id } = req.params;

    const response = await axios.post(
      `${AUTH_SERVICE_URL}/api/admin/users/${id}/sessions/terminate-all`
    );

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('user:all-sessions-terminated', {
        userId: id,
        timestamp: new Date().toISOString()
      });
    }

    res.json(response.data);
  } catch (error) {
    logger.error(`Failed to terminate all sessions for user ${req.params.id}:`, error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to terminate all sessions'
    });
  }
});

// GET /api/users/:id/activity - Get user activity log
router.get('/:id/activity', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const response = await axios.get(`${AUTH_SERVICE_URL}/api/admin/users/${id}/activity`, {
      params: { limit, offset }
    });

    res.json(response.data);
  } catch (error) {
    logger.error(`Failed to fetch activity for user ${req.params.id}:`, error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to fetch activity',
      data: { activities: [] }
    });
  }
});

module.exports = router;
