/**
 * ═══════════════════════════════════════════════════════════════════════
 * Token Administration Routes
 * Comprehensive token management interface for Exprsn CA Tokens
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const logger = require('../utils/logger');

// CA service configuration
const CA_SERVICE_URL = process.env.CA_SERVICE_URL || 'http://localhost:3000';

/**
 * Helper: Proxy request to CA service
 */
async function proxyToCA(req, method, path, data = null) {
  try {
    const config = {
      method,
      url: `${CA_SERVICE_URL}${path}`,
      headers: {
        'Content-Type': 'application/json',
        ...(req.headers.authorization && { 'Authorization': req.headers.authorization })
      }
    };

    if (data) {
      config.data = data;
    }

    if (method === 'GET' && req.query) {
      config.params = req.query;
    }

    const response = await axios(config);
    return response.data;
  } catch (error) {
    logger.error('CA service proxy error:', error.message);
    throw error;
  }
}

/**
 * Get token statistics
 * GET /api/tokens/stats
 */
router.get('/stats', async (req, res) => {
  try {
    logger.info('Fetching token statistics');

    const stats = await proxyToCA(req, 'GET', '/api/admin/tokens/stats');

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    logger.error('Failed to fetch token stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch token statistics',
      message: error.message
    });
  }
});

/**
 * List all tokens with filtering and pagination
 * GET /api/tokens
 * Query params: status, expiryType, resourceType, userId, search, page, limit, sortBy, sortOrder
 */
router.get('/', async (req, res) => {
  try {
    const {
      status,
      expiryType,
      resourceType,
      userId,
      search,
      page = 1,
      limit = 50,
      sortBy = 'createdAt',
      sortOrder = 'DESC'
    } = req.query;

    logger.info('Listing tokens', {
      filters: { status, expiryType, resourceType, userId, search },
      pagination: { page, limit }
    });

    const tokens = await proxyToCA(req, 'GET', '/api/admin/tokens', {
      status,
      expiryType,
      resourceType,
      userId,
      search,
      page,
      limit,
      sortBy,
      sortOrder
    });

    res.json({
      success: true,
      data: tokens
    });
  } catch (error) {
    logger.error('Failed to list tokens:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list tokens',
      message: error.message
    });
  }
});

/**
 * Get specific token by ID
 * GET /api/tokens/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    logger.info('Fetching token details', { tokenId: id });

    const token = await proxyToCA(req, 'GET', `/api/admin/tokens/${id}`);

    res.json({
      success: true,
      data: token
    });
  } catch (error) {
    logger.error('Failed to fetch token:', error);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to fetch token',
      message: error.response?.data?.message || error.message
    });
  }
});

/**
 * Issue new token
 * POST /api/tokens/issue
 * Body: {
 *   userId, certificateId,
 *   permissions: { read, write, append, delete, update },
 *   resourceType, resourceValue,
 *   expiryType, duration, maxUses,
 *   notBefore, tokenData, metadata
 * }
 */
router.post('/issue', async (req, res) => {
  try {
    const {
      userId,
      certificateId,
      permissions,
      resourceType,
      resourceValue,
      expiryType,
      duration,
      maxUses,
      notBefore,
      tokenData,
      metadata
    } = req.body;

    logger.info('Issuing new token', {
      userId,
      expiryType,
      resourceType
    });

    const token = await proxyToCA(req, 'POST', '/api/admin/tokens/issue', {
      userId,
      certificateId,
      permissions,
      resourceType,
      resourceValue,
      expiryType,
      duration,
      maxUses,
      notBefore,
      tokenData,
      metadata
    });

    // Emit Socket.IO event
    req.app.get('io').emit('token:issued', {
      tokenId: token.id,
      userId,
      expiryType,
      resourceType,
      timestamp: new Date().toISOString()
    });

    res.status(201).json({
      success: true,
      data: token,
      message: 'Token issued successfully'
    });
  } catch (error) {
    logger.error('Failed to issue token:', error);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to issue token',
      message: error.response?.data?.message || error.message
    });
  }
});

/**
 * Revoke token
 * POST /api/tokens/:id/revoke
 * Body: { reason }
 */
router.post('/:id/revoke', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason = 'Administrative action' } = req.body;

    logger.info('Revoking token', { tokenId: id, reason });

    const result = await proxyToCA(req, 'POST', `/api/admin/tokens/${id}/revoke`, {
      reason
    });

    // Emit Socket.IO event
    req.app.get('io').emit('token:revoked', {
      tokenId: id,
      reason,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: result,
      message: 'Token revoked successfully'
    });
  } catch (error) {
    logger.error('Failed to revoke token:', error);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to revoke token',
      message: error.response?.data?.message || error.message
    });
  }
});

/**
 * Bulk revoke tokens
 * POST /api/tokens/bulk/revoke
 * Body: { tokenIds: [], reason }
 */
router.post('/bulk/revoke', async (req, res) => {
  try {
    const { tokenIds, reason = 'Bulk administrative action' } = req.body;

    if (!Array.isArray(tokenIds) || tokenIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        message: 'tokenIds must be a non-empty array'
      });
    }

    logger.info('Bulk revoking tokens', { count: tokenIds.length, reason });

    const results = await proxyToCA(req, 'POST', '/api/admin/tokens/bulk/revoke', {
      tokenIds,
      reason
    });

    // Emit Socket.IO event
    req.app.get('io').emit('tokens:bulk-revoked', {
      count: tokenIds.length,
      tokenIds,
      reason,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: results,
      message: `${results.success} token(s) revoked successfully`
    });
  } catch (error) {
    logger.error('Failed to bulk revoke tokens:', error);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to bulk revoke tokens',
      message: error.response?.data?.message || error.message
    });
  }
});

/**
 * Validate token
 * POST /api/tokens/:id/validate
 * Body: { requiredPermissions, resourceValue }
 */
router.post('/:id/validate', async (req, res) => {
  try {
    const { id } = req.params;
    const { requiredPermissions, resourceValue } = req.body;

    logger.info('Validating token', { tokenId: id });

    const validation = await proxyToCA(req, 'POST', `/api/admin/tokens/${id}/validate`, {
      requiredPermissions,
      resourceValue
    });

    res.json({
      success: true,
      data: validation
    });
  } catch (error) {
    logger.error('Failed to validate token:', error);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to validate token',
      message: error.response?.data?.message || error.message
    });
  }
});

/**
 * Get token usage history
 * GET /api/tokens/:id/usage
 */
router.get('/:id/usage', async (req, res) => {
  try {
    const { id } = req.params;
    logger.info('Fetching token usage history', { tokenId: id });

    const usage = await proxyToCA(req, 'GET', `/api/admin/tokens/${id}/usage`);

    res.json({
      success: true,
      data: usage
    });
  } catch (error) {
    logger.error('Failed to fetch token usage:', error);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to fetch token usage',
      message: error.response?.data?.message || error.message
    });
  }
});

/**
 * Get token activity log
 * GET /api/tokens/:id/activity
 */
router.get('/:id/activity', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    logger.info('Fetching token activity log', { tokenId: id });

    const activity = await proxyToCA(req, 'GET', `/api/admin/tokens/${id}/activity`, {
      limit,
      offset
    });

    res.json({
      success: true,
      data: activity
    });
  } catch (error) {
    logger.error('Failed to fetch token activity:', error);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to fetch token activity',
      message: error.response?.data?.message || error.message
    });
  }
});

/**
 * Update token metadata
 * PUT /api/tokens/:id/metadata
 * Body: { metadata }
 */
router.put('/:id/metadata', async (req, res) => {
  try {
    const { id } = req.params;
    const { metadata } = req.body;

    logger.info('Updating token metadata', { tokenId: id });

    const result = await proxyToCA(req, 'PUT', `/api/admin/tokens/${id}/metadata`, {
      metadata
    });

    // Emit Socket.IO event
    req.app.get('io').emit('token:metadata-updated', {
      tokenId: id,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: result,
      message: 'Token metadata updated successfully'
    });
  } catch (error) {
    logger.error('Failed to update token metadata:', error);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to update token metadata',
      message: error.response?.data?.message || error.message
    });
  }
});

/**
 * Get tokens expiring soon
 * GET /api/tokens/expiring-soon
 * Query params: days (default: 7)
 */
router.get('/expiring-soon', async (req, res) => {
  try {
    const { days = 7 } = req.query;

    logger.info('Fetching tokens expiring soon', { days });

    const tokens = await proxyToCA(req, 'GET', '/api/admin/tokens/expiring-soon', {
      days
    });

    res.json({
      success: true,
      data: tokens
    });
  } catch (error) {
    logger.error('Failed to fetch expiring tokens:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch expiring tokens',
      message: error.message
    });
  }
});

/**
 * Get tokens by user
 * GET /api/tokens/user/:userId
 */
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, expiryType, limit = 50 } = req.query;

    logger.info('Fetching tokens for user', { userId });

    const tokens = await proxyToCA(req, 'GET', `/api/admin/tokens/user/${userId}`, {
      status,
      expiryType,
      limit
    });

    res.json({
      success: true,
      data: tokens
    });
  } catch (error) {
    logger.error('Failed to fetch user tokens:', error);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to fetch user tokens',
      message: error.response?.data?.message || error.message
    });
  }
});

/**
 * Get tokens by certificate
 * GET /api/tokens/certificate/:certificateId
 */
router.get('/certificate/:certificateId', async (req, res) => {
  try {
    const { certificateId } = req.params;
    const { status, limit = 50 } = req.query;

    logger.info('Fetching tokens for certificate', { certificateId });

    const tokens = await proxyToCA(req, 'GET', `/api/admin/tokens/certificate/${certificateId}`, {
      status,
      limit
    });

    res.json({
      success: true,
      data: tokens
    });
  } catch (error) {
    logger.error('Failed to fetch certificate tokens:', error);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to fetch certificate tokens',
      message: error.response?.data?.message || error.message
    });
  }
});

/**
 * Search tokens
 * POST /api/tokens/search
 * Body: { query, filters, page, limit }
 */
router.post('/search', async (req, res) => {
  try {
    const { query, filters, page = 1, limit = 50 } = req.body;

    logger.info('Searching tokens', { query, filters });

    const results = await proxyToCA(req, 'POST', '/api/admin/tokens/search', {
      query,
      filters,
      page,
      limit
    });

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    logger.error('Failed to search tokens:', error);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to search tokens',
      message: error.response?.data?.message || error.message
    });
  }
});

/**
 * Export tokens
 * POST /api/tokens/export
 * Body: { filters, format: 'json' | 'csv' }
 */
router.post('/export', async (req, res) => {
  try {
    const { filters = {}, format = 'json' } = req.body;

    logger.info('Exporting tokens', { format, filters });

    const data = await proxyToCA(req, 'POST', '/api/admin/tokens/export', {
      filters,
      format
    });

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=tokens.csv');
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=tokens.json');
    }

    res.send(data);
  } catch (error) {
    logger.error('Failed to export tokens:', error);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to export tokens',
      message: error.response?.data?.message || error.message
    });
  }
});

/**
 * Delete token (permanent - use with caution)
 * DELETE /api/tokens/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    logger.warn('Permanently deleting token', { tokenId: id });

    await proxyToCA(req, 'DELETE', `/api/admin/tokens/${id}`);

    // Emit Socket.IO event
    req.app.get('io').emit('token:deleted', {
      tokenId: id,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Token deleted successfully'
    });
  } catch (error) {
    logger.error('Failed to delete token:', error);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to delete token',
      message: error.response?.data?.message || error.message
    });
  }
});

/**
 * Bulk delete tokens (permanent - use with caution)
 * POST /api/tokens/bulk/delete
 * Body: { tokenIds: [] }
 */
router.post('/bulk/delete', async (req, res) => {
  try {
    const { tokenIds } = req.body;

    if (!Array.isArray(tokenIds) || tokenIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        message: 'tokenIds must be a non-empty array'
      });
    }

    logger.warn('Bulk deleting tokens', { count: tokenIds.length });

    const results = await proxyToCA(req, 'POST', '/api/admin/tokens/bulk/delete', {
      tokenIds
    });

    // Emit Socket.IO event
    req.app.get('io').emit('tokens:bulk-deleted', {
      count: tokenIds.length,
      tokenIds,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: results,
      message: `${results.success} token(s) deleted successfully`
    });
  } catch (error) {
    logger.error('Failed to bulk delete tokens:', error);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to bulk delete tokens',
      message: error.response?.data?.message || error.message
    });
  }
});

/**
 * Get token statistics by resource type
 * GET /api/tokens/stats/by-resource-type
 */
router.get('/stats/by-resource-type', async (req, res) => {
  try {
    logger.info('Fetching token stats by resource type');

    const stats = await proxyToCA(req, 'GET', '/api/admin/tokens/stats/by-resource-type');

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Failed to fetch resource type stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch resource type statistics',
      message: error.message
    });
  }
});

/**
 * Get token statistics by expiry type
 * GET /api/tokens/stats/by-expiry-type
 */
router.get('/stats/by-expiry-type', async (req, res) => {
  try {
    logger.info('Fetching token stats by expiry type');

    const stats = await proxyToCA(req, 'GET', '/api/admin/tokens/stats/by-expiry-type');

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Failed to fetch expiry type stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch expiry type statistics',
      message: error.message
    });
  }
});

/**
 * Cleanup expired tokens
 * POST /api/tokens/cleanup/expired
 */
router.post('/cleanup/expired', async (req, res) => {
  try {
    logger.info('Cleaning up expired tokens');

    const result = await proxyToCA(req, 'POST', '/api/admin/tokens/cleanup/expired');

    // Emit Socket.IO event
    req.app.get('io').emit('tokens:cleanup-completed', {
      count: result.count,
      type: 'expired',
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: result,
      message: `${result.count} expired token(s) cleaned up`
    });
  } catch (error) {
    logger.error('Failed to cleanup expired tokens:', error);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to cleanup expired tokens',
      message: error.response?.data?.message || error.message
    });
  }
});

/**
 * Cleanup exhausted tokens
 * POST /api/tokens/cleanup/exhausted
 */
router.post('/cleanup/exhausted', async (req, res) => {
  try {
    logger.info('Cleaning up exhausted tokens');

    const result = await proxyToCA(req, 'POST', '/api/admin/tokens/cleanup/exhausted');

    // Emit Socket.IO event
    req.app.get('io').emit('tokens:cleanup-completed', {
      count: result.count,
      type: 'exhausted',
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: result,
      message: `${result.count} exhausted token(s) cleaned up`
    });
  } catch (error) {
    logger.error('Failed to cleanup exhausted tokens:', error);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to cleanup exhausted tokens',
      message: error.response?.data?.message || error.message
    });
  }
});

module.exports = router;
