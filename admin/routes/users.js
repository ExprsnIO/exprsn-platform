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
    if (global.adminIO) {
      global.adminIO.emit('user:created', {
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
    if (global.adminIO) {
      global.adminIO.emit('user:updated', {
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
    if (global.adminIO) {
      global.adminIO.emit('user:deleted', {
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
    if (global.adminIO) {
      global.adminIO.emit('user:suspended', {
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
    if (global.adminIO) {
      global.adminIO.emit('user:unsuspended', {
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
    if (global.adminIO) {
      global.adminIO.emit('user:banned', {
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
    if (global.adminIO) {
      global.adminIO.emit('user:activated', {
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
 * Additional routes for groups, roles, tokens, certificates, etc.
 * See full implementation in exprsn-setup/src/routes/usersAdmin.js
 */

module.exports = router;
