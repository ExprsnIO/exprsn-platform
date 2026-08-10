/**
 * Tokens Controller
 * Handles token management operations
 */

const tokenService = require('../services/token');
const database = require('../config/database');
const logger = require('../utils/logger');
const { sanitizeToken } = require('../middleware/validation');

/**
 * Create a new token
 */
async function createToken(req, res) {
  try {
    const {
      type,
      subject,
      audience,
      permissions,
      scopes,
      resource_url,
      data,
      binding_type,
      binding_value,
      expires_in,
      uses_total,
      quotas,
      rate_limit,
      credits,
      refreshable,
      conditions,
    } = req.body;

    // Get certificate serial if binding to certificate
    let certificateSerial = null;
    if (binding_type === 'certificate') {
      if (req.certificate) {
        certificateSerial = req.certificate.serial;
      } else if (binding_value) {
        certificateSerial = binding_value;
      }
    }

    const result = await tokenService.createToken({
      type,
      subject: subject || req.auth.email || req.auth.userId,
      audience,
      permissions,
      scopes,
      resource_url,
      data,
      binding_type,
      binding_value: binding_type === 'certificate' ? certificateSerial :
                     binding_type === 'ip' ? (req.ip || req.connection.remoteAddress) :
                     binding_value,
      binding_required: binding_type !== null,
      expires_in,
      uses_total,
      quotas,
      rate_limit,
      credits,
      refreshable: refreshable || false,
      conditions,
      user_id: req.auth.userId,
      certificate_serial: certificateSerial,
    });

    logger.info('Token created', {
      tokenId: result.token.id,
      handle: result.handle,
      type,
      userId: req.auth.userId,
      requestId: req.requestId,
    });

    res.status(201).json({
      handle: result.handle,
      token: sanitizeToken(result.token),
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Token creation failed', {
      error: error.message,
      stack: error.stack,
      requestId: req.requestId,
    });

    res.status(500).json({
      error: {
        code: 'TOKEN_CREATION_FAILED',
        message: error.message,
        requestId: req.requestId,
      },
    });
  }
}

/**
 * Validate token
 */
async function validateToken(req, res) {
  try {
    const { handle } = req.body;

    if (!handle) {
      return res.status(400).json({
        error: {
          code: 'MISSING_HANDLE',
          message: 'Token handle is required',
          requestId: req.requestId,
        },
      });
    }

    const validation = await tokenService.validateToken(handle);

    res.json({
      valid: validation.valid,
      ...(validation.reason && { reason: validation.reason }),
      ...(validation.token && { token: sanitizeToken(validation.token) }),
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Token validation failed', {
      error: error.message,
      requestId: req.requestId,
    });

    res.status(500).json({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Token validation failed',
        requestId: req.requestId,
      },
    });
  }
}

/**
 * Get token by handle
 */
async function getToken(req, res) {
  try {
    const { handle } = req.params;

    const validation = await tokenService.validateToken(handle);

    if (!validation.valid) {
      return res.status(404).json({
        error: {
          code: 'TOKEN_NOT_FOUND',
          message: validation.reason || 'Token not found',
          requestId: req.requestId,
        },
      });
    }

    // Check if user owns the token or is admin
    if (!req.auth.roles.includes('admin') &&
        validation.token.created_by !== req.auth.userId) {
      return res.status(403).json({
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'You do not have permission to view this token',
          requestId: req.requestId,
        },
      });
    }

    res.json({
      token: sanitizeToken(validation.token),
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Get token failed', {
      error: error.message,
      handle: req.params.handle,
      requestId: req.requestId,
    });

    res.status(500).json({
      error: {
        code: 'GET_TOKEN_FAILED',
        message: 'Failed to get token',
        requestId: req.requestId,
      },
    });
  }
}

/**
 * List tokens
 */
async function listTokens(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status;
    const type = req.query.type;
    const userId = req.query.user_id || (req.query.my === 'true' ? req.auth.userId : null);

    // Non-admin users can only see their own tokens
    const effectiveUserId = req.auth.roles.includes('admin') ? userId : req.auth.userId;

    const tokens = await tokenService.listTokens({
      userId: effectiveUserId,
      status,
      type,
      limit,
      offset,
    });

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM tokens WHERE 1=1';
    const countParams = [];
    let paramCount = 1;

    if (effectiveUserId) {
      countQuery += ` AND created_by = $${paramCount}`;
      countParams.push(effectiveUserId);
      paramCount++;
    }

    if (status) {
      countQuery += ` AND status = $${paramCount}`;
      countParams.push(status);
      paramCount++;
    }

    if (type) {
      countQuery += ` AND type = $${paramCount}`;
      countParams.push(type);
      paramCount++;
    }

    const countResult = await database.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      tokens: tokens.map(sanitizeToken),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('List tokens failed', {
      error: error.message,
      requestId: req.requestId,
    });

    res.status(500).json({
      error: {
        code: 'LIST_TOKENS_FAILED',
        message: 'Failed to list tokens',
        requestId: req.requestId,
      },
    });
  }
}

/**
 * Use token
 */
async function useToken(req, res) {
  try {
    const { handle } = req.params;

    // Validate token first
    const validation = await tokenService.validateToken(handle);

    if (!validation.valid) {
      return res.status(400).json({
        error: {
          code: 'INVALID_TOKEN',
          message: validation.reason || 'Token is not valid',
          requestId: req.requestId,
        },
      });
    }

    // Use the token
    const updatedToken = await tokenService.useToken(validation.token.id);

    logger.info('Token used', {
      tokenId: updatedToken.id,
      handle,
      usesRemaining: updatedToken.uses_remaining,
      requestId: req.requestId,
    });

    res.json({
      token: sanitizeToken(updatedToken),
      uses_remaining: updatedToken.uses_remaining,
      status: updatedToken.status,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Use token failed', {
      error: error.message,
      handle: req.params.handle,
      requestId: req.requestId,
    });

    res.status(500).json({
      error: {
        code: 'USE_TOKEN_FAILED',
        message: error.message,
        requestId: req.requestId,
      },
    });
  }
}

/**
 * Revoke token
 */
async function revokeToken(req, res) {
  try {
    const { handle } = req.params;
    const { reason } = req.body;

    // Get token
    const validation = await tokenService.validateToken(handle);

    if (!validation.token) {
      return res.status(404).json({
        error: {
          code: 'TOKEN_NOT_FOUND',
          message: 'Token not found',
          requestId: req.requestId,
        },
      });
    }

    // Check if user owns the token or is admin
    if (!req.auth.roles.includes('admin') &&
        validation.token.created_by !== req.auth.userId) {
      return res.status(403).json({
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'You do not have permission to revoke this token',
          requestId: req.requestId,
        },
      });
    }

    const revokedToken = await tokenService.revokeToken(
      validation.token.id,
      reason || 'user_requested',
      req.auth.userId
    );

    logger.info('Token revoked', {
      tokenId: revokedToken.id,
      handle,
      reason,
      revokedBy: req.auth.userId,
      requestId: req.requestId,
    });

    res.json({
      token: sanitizeToken(revokedToken),
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Token revocation failed', {
      error: error.message,
      handle: req.params.handle,
      requestId: req.requestId,
    });

    res.status(500).json({
      error: {
        code: 'REVOKE_TOKEN_FAILED',
        message: error.message,
        requestId: req.requestId,
      },
    });
  }
}

/**
 * Refresh token
 */
async function refreshToken(req, res) {
  try {
    const { handle } = req.params;

    // Get token
    const validation = await tokenService.validateToken(handle);

    if (!validation.token) {
      return res.status(404).json({
        error: {
          code: 'TOKEN_NOT_FOUND',
          message: 'Token not found',
          requestId: req.requestId,
        },
      });
    }

    // Check if user owns the token or is admin
    if (!req.auth.roles.includes('admin') &&
        validation.token.created_by !== req.auth.userId) {
      return res.status(403).json({
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'You do not have permission to refresh this token',
          requestId: req.requestId,
        },
      });
    }

    const newToken = await tokenService.refreshToken(
      validation.token.id,
      req.auth.userId
    );

    logger.info('Token refreshed', {
      originalTokenId: validation.token.id,
      newTokenId: newToken.token.id,
      newHandle: newToken.handle,
      userId: req.auth.userId,
      requestId: req.requestId,
    });

    res.json({
      handle: newToken.handle,
      token: sanitizeToken(newToken.token),
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Token refresh failed', {
      error: error.message,
      handle: req.params.handle,
      requestId: req.requestId,
    });

    res.status(500).json({
      error: {
        code: 'REFRESH_TOKEN_FAILED',
        message: error.message,
        requestId: req.requestId,
      },
    });
  }
}

/**
 * Get token statistics
 */
async function getTokenStats(req, res) {
  try {
    const userId = req.query.user_id || (req.query.my === 'true' ? req.auth.userId : null);

    // Non-admin users can only see their own stats
    const effectiveUserId = req.auth.roles.includes('admin') ? userId : req.auth.userId;

    let baseQuery = 'SELECT status, COUNT(*) as count FROM tokens';
    const params = [];

    if (effectiveUserId) {
      baseQuery += ' WHERE created_by = $1';
      params.push(effectiveUserId);
    }

    const statusResult = await database.query(
      `${baseQuery} GROUP BY status`,
      params
    );

    const stats = {
      total: 0,
      active: 0,
      expired: 0,
      revoked: 0,
      used: 0,
    };

    statusResult.rows.forEach(row => {
      stats[row.status] = parseInt(row.count);
      stats.total += parseInt(row.count);
    });

    // Get type breakdown
    const typeResult = await database.query(
      `${baseQuery.replace('status', 'type')} GROUP BY type`,
      params
    );

    const typeStats = {};
    typeResult.rows.forEach(row => {
      typeStats[row.type] = parseInt(row.count);
    });

    res.json({
      stats,
      by_type: typeStats,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Get token stats failed', {
      error: error.message,
      requestId: req.requestId,
    });

    res.status(500).json({
      error: {
        code: 'GET_STATS_FAILED',
        message: 'Failed to get token statistics',
        requestId: req.requestId,
      },
    });
  }
}

module.exports = {
  createToken,
  validateToken,
  getToken,
  listTokens,
  useToken,
  revokeToken,
  refreshToken,
  getTokenStats,
};
