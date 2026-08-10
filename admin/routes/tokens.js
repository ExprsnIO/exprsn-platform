/**
 * ═══════════════════════════════════════════════════════════════════════
 * Token Administration Routes
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const logger = require('../utils/logger');

const CA_SERVICE_URL = process.env.CA_URL || 'http://localhost:3000';

/**
 * GET /api/tokens/stats - Get token statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const response = await axios.get(`${CA_SERVICE_URL}/api/admin/tokens/stats`);

    res.json({
      success: true,
      stats: response.data
    });
  } catch (error) {
    logger.error('Failed to fetch token stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch token statistics',
      stats: {
        total: 0,
        active: 0,
        expired: 0,
        revoked: 0
      }
    });
  }
});

/**
 * GET /api/tokens - List all tokens
 */
router.get('/', async (req, res) => {
  try {
    const { status, expiryType, userId, page = 1, limit = 50 } = req.query;

    const response = await axios.get(`${CA_SERVICE_URL}/api/admin/tokens`, {
      params: { status, expiryType, userId, page, limit }
    });

    res.json({
      success: true,
      tokens: response.data.tokens || response.data || []
    });
  } catch (error) {
    logger.error('Failed to list tokens:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list tokens',
      tokens: []
    });
  }
});

/**
 * POST /api/tokens/:id/revoke - Revoke token
 */
router.post('/:id/revoke', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const response = await axios.post(`${CA_SERVICE_URL}/api/tokens/${id}/revoke`, {
      reason: reason || 'admin_revocation'
    });

    // Emit Socket.IO event
    if (global.adminIO) {
      global.adminIO.emit('token:revoked', {
        tokenId: id,
        reason,
        timestamp: new Date().toISOString()
      });
    }

    res.json(response.data);
  } catch (error) {
    logger.error('Failed to revoke token:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to revoke token'
    });
  }
});

module.exports = router;
