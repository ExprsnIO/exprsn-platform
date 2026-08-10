/**
 * Token Service
 * Handles token generation, validation, and management
 * Implements Token Specification v1.1
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const forge = require('node-forge');
const database = require('../../config/database');
const redis = require('../../config/redis');
const logger = require('../../utils/logger');
const config = require('../../config');
const caService = require('../ca');

/**
 * Generate token handle (35-byte opaque reference)
 * Format: tk_<32_hex_chars>
 */
function generateTokenHandle() {
  const uuid = uuidv4().replace(/-/g, '');
  return `tk_${uuid}`;
}

/**
 * Generate RSA signature for token
 */
async function signToken(tokenData) {
  try {
    // Load intermediate CA key for signing
    const ca = await caService.loadCACertificates();

    // Create token payload
    const payload = JSON.stringify(tokenData);

    // Create RSA-PSS signature
    const md = forge.md.sha256.create();
    md.update(payload, 'utf8');

    const pss = forge.pss.create({
      md: forge.md.sha256.create(),
      mgf: forge.mgf.mgf1.create(forge.md.sha256.create()),
      saltLength: 32,
    });

    const signature = ca.intermediateKey.sign(md, pss);
    return forge.util.encode64(signature);
  } catch (error) {
    logger.error('Token signing failed', {
      error: error.message,
    });
    throw error;
  }
}

/**
 * Create a new token
 */
async function createToken(options) {
  const {
    type,
    subject,
    audience = [],
    permissions = {},
    scopes = [],
    resource_url = null,
    data = {},
    binding_type = null,
    binding_value = null,
    binding_required = false,
    expires_in = null, // seconds
    uses_total = null,
    quotas = null,
    rate_limit = null,
    credits = null,
    refreshable = false,
    parent_token_id = null,
    conditions = null,
    user_id = null,
    certificate_serial = null,
  } = options;

  try {
    const now = Math.floor(Date.now() / 1000);
    const tokenId = uuidv4();
    const familyId = parent_token_id ? null : tokenId; // Root token uses its own ID as family

    // Determine expiry type
    let expiryType = 'none';
    if (expires_in) expiryType = 'time';
    else if (uses_total) expiryType = 'uses';
    else if (quotas) expiryType = 'quota';
    else if (rate_limit) expiryType = 'rate-limited';
    else if (credits) expiryType = 'credits';

    // Calculate expiry timestamps
    const expiresAt = expires_in ? now + expires_in : null;
    const absoluteExpiryAt = expiresAt;

    // Create token data
    const tokenData = {
      id: tokenId,
      version: '1.1',
      type,
      expiry_type: expiryType,
      issuer_domain: config.api.name,
      issuer_certificate_serial: certificate_serial,
      subject,
      audience,
      permissions,
      scopes,
      resource_url,
      data,
      binding_type,
      binding_value,
      binding_required,
      issued_at: now,
      not_before: now,
      expires_at: expiresAt,
      absolute_expiry_at: absoluteExpiryAt,
      last_activity_at: now,
      uses_total,
      uses_remaining: uses_total,
      use_count: 0,
      quotas,
      rate_limit,
      credits,
      parent_token_id,
      family_id: familyId || (await getTokenFamilyId(parent_token_id)),
      delegation_depth: parent_token_id ? await getTokenDelegationDepth(parent_token_id) + 1 : 0,
      refreshable,
      conditions,
      status: 'active',
    };

    // Sign token
    const signature = await signToken(tokenData);
    tokenData.signature = signature;

    // Insert into database
    const result = await database.query(
      `INSERT INTO tokens (
        id, version, token_version, type, expiry_type,
        issuer_domain, issuer_certificate_serial, subject, audience,
        permissions, scopes, resource_url, data,
        binding_type, binding_value, binding_required,
        issued_at, not_before, expires_at, absolute_expiry_at, last_activity_at,
        uses_total, uses_remaining, use_count,
        quotas, rate_limit, credits,
        parent_token_id, family_id, delegation_depth,
        refreshable, conditions, status,
        signature, signature_algorithm, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24,
        $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36
      ) RETURNING *`,
      [
        tokenId, '1.1', 1, type, expiryType,
        config.api.name, certificate_serial, subject, audience,
        JSON.stringify(permissions), scopes, resource_url, JSON.stringify(data),
        binding_type, binding_value, binding_required,
        now, now, expiresAt, absoluteExpiryAt, now,
        uses_total, uses_total, 0,
        JSON.stringify(quotas), JSON.stringify(rate_limit), JSON.stringify(credits),
        parent_token_id, familyId || tokenId, parent_token_id ? await getTokenDelegationDepth(parent_token_id) + 1 : 0,
        refreshable, JSON.stringify(conditions), 'active',
        signature, 'RSA-SHA256-PSS', user_id,
      ]
    );

    const token = result.rows[0];

    // Generate handle
    const handle = generateTokenHandle();

    // Store handle mapping
    await database.query(
      'INSERT INTO token_handles (handle, token_id) VALUES ($1, $2)',
      [handle, tokenId]
    );

    // Cache token for fast lookup
    await redis.client.setex(
      `token:handle:${handle}`,
      300, // 5 minutes
      JSON.stringify(token)
    );

    logger.info('Token created', {
      tokenId,
      handle,
      type,
      subject,
      expiryType,
      userId: user_id,
    });

    return {
      token,
      handle,
    };
  } catch (error) {
    logger.error('Token creation failed', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Get token family ID
 */
async function getTokenFamilyId(parentTokenId) {
  if (!parentTokenId) return null;

  const result = await database.query(
    'SELECT family_id FROM tokens WHERE id = $1',
    [parentTokenId]
  );

  return result && result.rowCount > 0 ? result.rows[0].family_id : null;
}

/**
 * Get token delegation depth
 */
async function getTokenDelegationDepth(parentTokenId) {
  if (!parentTokenId) return 0;

  const result = await database.query(
    'SELECT delegation_depth FROM tokens WHERE id = $1',
    [parentTokenId]
  );

  return result && result.rowCount > 0 ? result.rows[0].delegation_depth : 0;
}

/**
 * Validate token
 */
async function validateToken(handle) {
  try {
    // Check cache first
    const cached = await redis.client.get(`token:handle:${handle}`);
    if (cached) {
      const token = JSON.parse(cached);
      return await checkTokenValidity(token);
    }

    // Query database
    const result = await database.query(
      `SELECT t.*, th.handle
       FROM tokens t
       JOIN token_handles th ON t.id = th.token_id
       WHERE th.handle = $1`,
      [handle]
    );

    if (!result || result.rowCount === 0) {
      return {
        valid: false,
        reason: 'Token not found',
      };
    }

    const token = result.rows[0];

    // Cache token
    await redis.client.setex(
      `token:handle:${handle}`,
      300,
      JSON.stringify(token)
    );

    return await checkTokenValidity(token);
  } catch (error) {
    logger.error('Token validation failed', {
      error: error.message,
      handle,
    });

    return {
      valid: false,
      reason: 'Validation error',
      error: error.message,
    };
  }
}

/**
 * Check token validity
 */
async function checkTokenValidity(token) {
  const now = Math.floor(Date.now() / 1000);

  // Check status
  if (token.status !== 'active') {
    return {
      valid: false,
      reason: `Token is ${token.status}`,
      token,
    };
  }

  // Check expiry (time-based)
  if (token.expires_at && now >= token.expires_at) {
    // Mark as expired
    await database.query(
      'UPDATE tokens SET status = $1, updated_at = NOW() WHERE id = $2',
      ['expired', token.id]
    );

    return {
      valid: false,
      reason: 'Token has expired',
      token,
    };
  }

  // Check not before
  if (token.not_before && now < token.not_before) {
    return {
      valid: false,
      reason: 'Token not yet valid',
      token,
    };
  }

  // Check uses remaining
  if (token.uses_remaining !== null && token.uses_remaining <= 0) {
    return {
      valid: false,
      reason: 'Token has no uses remaining',
      token,
    };
  }

  return {
    valid: true,
    token,
  };
}

/**
 * Use token (decrement uses)
 */
async function useToken(tokenId, incrementUsage = true) {
  try {
    const now = Math.floor(Date.now() / 1000);

    // Use optimistic locking
    const result = await database.query(
      `SELECT * FROM tokens WHERE id = $1 FOR UPDATE`,
      [tokenId]
    );

    if (!result || result.rowCount === 0) {
      throw new Error('Token not found');
    }

    const token = result.rows[0];
    const currentVersion = token.token_version;

    // Build update query
    let updateQuery = `
      UPDATE tokens
      SET last_activity_at = $1,
          use_count = use_count + 1,
          token_version = token_version + 1`;

    const params = [now];
    let paramCount = 2;

    if (token.uses_remaining !== null && incrementUsage) {
      updateQuery += `, uses_remaining = uses_remaining - 1`;

      // Check if this was the last use
      if (token.uses_remaining <= 1) {
        updateQuery += `, status = 'used', used_at = $${paramCount}`;
        params.push(now);
        paramCount++;
      }
    }

    updateQuery += `
      WHERE id = $${paramCount}
        AND token_version = $${paramCount + 1}
        AND status = 'active'
      RETURNING *`;

    params.push(tokenId, currentVersion);

    const updateResult = await database.query(updateQuery, params);

    if (!updateResult || updateResult.rowCount === 0) {
      throw new Error('CONCURRENT_MODIFICATION_DETECTED');
    }

    const updatedToken = updateResult.rows[0];

    // Invalidate cache
    await redis.client.del(`token:${tokenId}`);
    const handleResult = await database.query(
      'SELECT handle FROM token_handles WHERE token_id = $1',
      [tokenId]
    );
    if (handleResult && handleResult.rowCount > 0) {
      await redis.client.del(`token:handle:${handleResult.rows[0].handle}`);
    }

    logger.info('Token used', {
      tokenId,
      usesRemaining: updatedToken.uses_remaining,
      useCount: updatedToken.use_count,
    });

    return updatedToken;
  } catch (error) {
    logger.error('Token use failed', {
      error: error.message,
      tokenId,
    });
    throw error;
  }
}

/**
 * Revoke token
 */
async function revokeToken(tokenId, reason, revokedBy) {
  try {
    const now = Math.floor(Date.now() / 1000);

    const result = await database.query(
      `UPDATE tokens
       SET status = 'revoked',
           revoked_at = $1,
           revoked_reason = $2,
           revoked_by = $3,
           updated_at = NOW()
       WHERE id = $4
         AND status = 'active'
       RETURNING *`,
      [now, reason, revokedBy, tokenId]
    );

    if (!result || result.rowCount === 0) {
      throw new Error('Token not found or already revoked');
    }

    const token = result.rows[0];

    // Invalidate cache
    await redis.client.del(`token:${tokenId}`);
    const handleResult = await database.query(
      'SELECT handle FROM token_handles WHERE token_id = $1',
      [tokenId]
    );
    if (handleResult && handleResult.rowCount > 0) {
      await redis.client.del(`token:handle:${handleResult.rows[0].handle}`);
    }

    logger.info('Token revoked', {
      tokenId,
      reason,
      revokedBy,
    });

    return token;
  } catch (error) {
    logger.error('Token revocation failed', {
      error: error.message,
      tokenId,
    });
    throw error;
  }
}

/**
 * Refresh token
 */
async function refreshToken(tokenId, userId) {
  try {
    // Get original token
    const result = await database.query(
      'SELECT * FROM tokens WHERE id = $1',
      [tokenId]
    );

    if (!result || result.rowCount === 0) {
      throw new Error('Token not found');
    }

    const originalToken = result.rows[0];

    if (!originalToken.refreshable) {
      throw new Error('Token is not refreshable');
    }

    if (originalToken.status !== 'active') {
      throw new Error('Cannot refresh inactive token');
    }

    // Create new token with same properties
    const newToken = await createToken({
      type: originalToken.type,
      subject: originalToken.subject,
      audience: originalToken.audience,
      permissions: originalToken.permissions,
      scopes: originalToken.scopes,
      resource_url: originalToken.resource_url,
      data: originalToken.data,
      binding_type: originalToken.binding_type,
      binding_value: originalToken.binding_value,
      binding_required: originalToken.binding_required,
      expires_in: originalToken.expires_at ? originalToken.expires_at - originalToken.issued_at : null,
      uses_total: originalToken.uses_total,
      quotas: originalToken.quotas,
      rate_limit: originalToken.rate_limit,
      credits: originalToken.credits,
      refreshable: originalToken.refreshable,
      parent_token_id: originalToken.id,
      conditions: originalToken.conditions,
      user_id: userId,
      certificate_serial: originalToken.issuer_certificate_serial,
    });

    logger.info('Token refreshed', {
      originalTokenId: tokenId,
      newTokenId: newToken.token.id,
      userId,
    });

    return newToken;
  } catch (error) {
    logger.error('Token refresh failed', {
      error: error.message,
      tokenId,
    });
    throw error;
  }
}

/**
 * List tokens
 */
async function listTokens(options = {}) {
  const {
    userId = null,
    status = null,
    type = null,
    limit = 20,
    offset = 0,
  } = options;

  try {
    let query = 'SELECT * FROM tokens WHERE 1=1';
    const params = [];
    let paramCount = 1;

    if (userId) {
      query += ` AND created_by = $${paramCount}`;
      params.push(userId);
      paramCount++;
    }

    if (status) {
      query += ` AND status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    if (type) {
      query += ` AND type = $${paramCount}`;
      params.push(type);
      paramCount++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await database.query(query, params);

    return result.rows;
  } catch (error) {
    logger.error('List tokens failed', {
      error: error.message,
    });
    throw error;
  }
}

module.exports = {
  createToken,
  validateToken,
  useToken,
  revokeToken,
  refreshToken,
  listTokens,
  generateTokenHandle,
  signToken,
  checkTokenValidity,
};
