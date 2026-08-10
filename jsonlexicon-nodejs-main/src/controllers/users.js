/**
 * Users Controller
 * Handles user management operations
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const database = require('../config/database');
const redis = require('../config/redis');
const logger = require('../utils/logger');
const config = require('../config');
const { sanitizeUser } = require('../middleware/validation');

/**
 * Register a new user
 */
async function register(req, res) {
  try {
    const {
      email,
      password,
      first_name,
      last_name,
      display_name,
    } = req.body;

    // Check if user already exists
    const existing = await database.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existing && existing.rowCount > 0) {
      return res.status(409).json({
        error: {
          code: 'USER_ALREADY_EXISTS',
          message: 'A user with this email already exists',
          requestId: req.requestId,
        },
      });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, config.security.bcryptRounds);

    // Create user
    const result = await database.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, display_name)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [email, password_hash, first_name, last_name, display_name || `${first_name} ${last_name}`]
    );

    const user = result.rows[0];

    logger.info('User registered', {
      userId: user.id,
      email: user.email,
      requestId: req.requestId,
    });

    res.status(201).json({
      user: sanitizeUser(user),
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('User registration failed', {
      error: error.message,
      stack: error.stack,
      requestId: req.requestId,
    });

    res.status(500).json({
      error: {
        code: 'REGISTRATION_FAILED',
        message: 'Failed to register user',
        requestId: req.requestId,
      },
    });
  }
}

/**
 * Login user
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;

    // Find user
    const result = await database.query(
      'SELECT * FROM users WHERE email = $1 AND status = $2',
      [email, 'active']
    );

    if (!result || result.rowCount === 0) {
      return res.status(401).json({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
          requestId: req.requestId,
        },
      });
    }

    const user = result.rows[0];

    // Check if user is suspended
    if (user.suspended_at) {
      return res.status(403).json({
        error: {
          code: 'USER_SUSPENDED',
          message: user.suspended_reason || 'Your account has been suspended',
          requestId: req.requestId,
        },
      });
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.status(401).json({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
          requestId: req.requestId,
        },
      });
    }

    // Check MFA if enabled
    if (user.mfa_enabled) {
      // For now, just note that MFA would be required
      // In a full implementation, you'd verify the MFA code here
      logger.info('MFA enabled for user', { userId: user.id });
    }

    // Update last login
    const clientIp = req.ip || req.connection.remoteAddress;
    await database.query(
      'UPDATE users SET last_login_at = NOW(), last_login_ip = $1, updated_at = NOW() WHERE id = $2',
      [clientIp, user.id]
    );

    // Generate JWT
    const token = jwt.sign(
      {
        sub: user.id,
        userId: user.id,
        email: user.email,
        roles: user.roles,
        permissions: user.permissions,
      },
      config.security.jwtSecret,
      {
        expiresIn: config.security.jwtExpiresIn || '24h',
        issuer: config.api.name,
      }
    );

    logger.info('User logged in', {
      userId: user.id,
      email: user.email,
      ip: clientIp,
      requestId: req.requestId,
    });

    res.json({
      token,
      user: sanitizeUser(user),
      expiresIn: config.security.jwtExpiresIn || '24h',
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Login failed', {
      error: error.message,
      stack: error.stack,
      requestId: req.requestId,
    });

    res.status(500).json({
      error: {
        code: 'LOGIN_FAILED',
        message: 'Login failed',
        requestId: req.requestId,
      },
    });
  }
}

/**
 * Get current user profile
 */
async function getProfile(req, res) {
  try {
    const result = await database.query(
      'SELECT * FROM users WHERE id = $1',
      [req.auth.userId]
    );

    if (!result || result.rowCount === 0) {
      return res.status(404).json({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
          requestId: req.requestId,
        },
      });
    }

    res.json({
      user: sanitizeUser(result.rows[0]),
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Get profile failed', {
      error: error.message,
      userId: req.auth.userId,
      requestId: req.requestId,
    });

    res.status(500).json({
      error: {
        code: 'PROFILE_FETCH_FAILED',
        message: 'Failed to fetch profile',
        requestId: req.requestId,
      },
    });
  }
}

/**
 * Update user profile
 */
async function updateProfile(req, res) {
  try {
    const { first_name, last_name, display_name } = req.body;
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (first_name !== undefined) {
      updates.push(`first_name = $${paramCount++}`);
      values.push(first_name);
    }

    if (last_name !== undefined) {
      updates.push(`last_name = $${paramCount++}`);
      values.push(last_name);
    }

    if (display_name !== undefined) {
      updates.push(`display_name = $${paramCount++}`);
      values.push(display_name);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        error: {
          code: 'NO_UPDATES',
          message: 'No fields to update',
          requestId: req.requestId,
        },
      });
    }

    updates.push(`updated_at = NOW()`);
    values.push(req.auth.userId);

    const result = await database.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );

    logger.info('Profile updated', {
      userId: req.auth.userId,
      requestId: req.requestId,
    });

    res.json({
      user: sanitizeUser(result.rows[0]),
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Profile update failed', {
      error: error.message,
      userId: req.auth.userId,
      requestId: req.requestId,
    });

    res.status(500).json({
      error: {
        code: 'PROFILE_UPDATE_FAILED',
        message: 'Failed to update profile',
        requestId: req.requestId,
      },
    });
  }
}

/**
 * Change password
 */
async function changePassword(req, res) {
  try {
    const { current_password, new_password } = req.body;

    // Get user
    const result = await database.query(
      'SELECT * FROM users WHERE id = $1',
      [req.auth.userId]
    );

    const user = result.rows[0];

    // Verify current password
    const valid = await bcrypt.compare(current_password, user.password_hash);

    if (!valid) {
      return res.status(401).json({
        error: {
          code: 'INVALID_PASSWORD',
          message: 'Current password is incorrect',
          requestId: req.requestId,
        },
      });
    }

    // Hash new password
    const new_hash = await bcrypt.hash(new_password, config.security.bcryptRounds);

    // Update password
    await database.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [new_hash, req.auth.userId]
    );

    logger.info('Password changed', {
      userId: req.auth.userId,
      requestId: req.requestId,
    });

    res.json({
      message: 'Password changed successfully',
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Password change failed', {
      error: error.message,
      userId: req.auth.userId,
      requestId: req.requestId,
    });

    res.status(500).json({
      error: {
        code: 'PASSWORD_CHANGE_FAILED',
        message: 'Failed to change password',
        requestId: req.requestId,
      },
    });
  }
}

/**
 * List all users (admin only)
 */
async function listUsers(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status;

    let query = 'SELECT * FROM users';
    const params = [];

    if (status) {
      query += ' WHERE status = $1';
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await database.query(query, params);

    // Get total count
    const countQuery = status
      ? 'SELECT COUNT(*) FROM users WHERE status = $1'
      : 'SELECT COUNT(*) FROM users';
    const countParams = status ? [status] : [];
    const countResult = await database.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      users: result.rows.map(sanitizeUser),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('List users failed', {
      error: error.message,
      requestId: req.requestId,
    });

    res.status(500).json({
      error: {
        code: 'LIST_USERS_FAILED',
        message: 'Failed to list users',
        requestId: req.requestId,
      },
    });
  }
}

/**
 * Get user by ID (admin only)
 */
async function getUserById(req, res) {
  try {
    const { id } = req.params;

    const result = await database.query(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );

    if (!result || result.rowCount === 0) {
      return res.status(404).json({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
          requestId: req.requestId,
        },
      });
    }

    res.json({
      user: sanitizeUser(result.rows[0]),
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Get user failed', {
      error: error.message,
      userId: req.params.id,
      requestId: req.requestId,
    });

    res.status(500).json({
      error: {
        code: 'GET_USER_FAILED',
        message: 'Failed to get user',
        requestId: req.requestId,
      },
    });
  }
}

/**
 * Suspend user (admin only)
 */
async function suspendUser(req, res) {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const result = await database.query(
      `UPDATE users
       SET status = 'suspended',
           suspended_at = NOW(),
           suspended_reason = $1,
           suspended_by = $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [reason, req.auth.userId, id]
    );

    if (!result || result.rowCount === 0) {
      return res.status(404).json({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
          requestId: req.requestId,
        },
      });
    }

    logger.info('User suspended', {
      userId: id,
      suspendedBy: req.auth.userId,
      reason,
      requestId: req.requestId,
    });

    res.json({
      user: sanitizeUser(result.rows[0]),
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Suspend user failed', {
      error: error.message,
      userId: req.params.id,
      requestId: req.requestId,
    });

    res.status(500).json({
      error: {
        code: 'SUSPEND_USER_FAILED',
        message: 'Failed to suspend user',
        requestId: req.requestId,
      },
    });
  }
}

/**
 * Reactivate user (admin only)
 */
async function reactivateUser(req, res) {
  try {
    const { id } = req.params;

    const result = await database.query(
      `UPDATE users
       SET status = 'active',
           suspended_at = NULL,
           suspended_reason = NULL,
           suspended_by = NULL,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (!result || result.rowCount === 0) {
      return res.status(404).json({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
          requestId: req.requestId,
        },
      });
    }

    logger.info('User reactivated', {
      userId: id,
      reactivatedBy: req.auth.userId,
      requestId: req.requestId,
    });

    res.json({
      user: sanitizeUser(result.rows[0]),
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Reactivate user failed', {
      error: error.message,
      userId: req.params.id,
      requestId: req.requestId,
    });

    res.status(500).json({
      error: {
        code: 'REACTIVATE_USER_FAILED',
        message: 'Failed to reactivate user',
        requestId: req.requestId,
      },
    });
  }
}

/**
 * Logout (blacklist JWT token)
 */
async function logout(req, res) {
  try {
    if (req.auth.type === 'jwt') {
      const token = req.headers.authorization.substring(7);
      const decoded = jwt.decode(token);
      const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);

      // Blacklist token in Redis
      await redis.client.setex(
        `blacklist:jwt:${token}`,
        expiresIn,
        '1'
      );
    }

    logger.info('User logged out', {
      userId: req.auth.userId,
      requestId: req.requestId,
    });

    res.json({
      message: 'Logged out successfully',
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Logout failed', {
      error: error.message,
      userId: req.auth.userId,
      requestId: req.requestId,
    });

    res.status(500).json({
      error: {
        code: 'LOGOUT_FAILED',
        message: 'Failed to logout',
        requestId: req.requestId,
      },
    });
  }
}

module.exports = {
  register,
  login,
  logout,
  getProfile,
  updateProfile,
  changePassword,
  listUsers,
  getUserById,
  suspendUser,
  reactivateUser,
};
