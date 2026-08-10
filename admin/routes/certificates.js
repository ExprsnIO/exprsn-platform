/**
 * ═══════════════════════════════════════════════════════════════════════
 * Certificates Administration Routes
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const logger = require('../utils/logger');

const CA_SERVICE_URL = process.env.CA_URL || 'http://localhost:3000';

/**
 * GET /api/certificates/stats - Get certificate statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const response = await axios.get(`${CA_SERVICE_URL}/api/certificates`);
    const certificates = response.data.certificates || response.data || [];

    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));

    const stats = {
      total: certificates.length,
      active: certificates.filter(c => c.status === 'active').length,
      revoked: certificates.filter(c => c.status === 'revoked').length,
      expired: certificates.filter(c => c.status === 'expired' || new Date(c.notAfter) < now).length,
      expiring: certificates.filter(c => {
        const expiryDate = new Date(c.notAfter);
        return c.status === 'active' && expiryDate > now && expiryDate <= thirtyDaysFromNow;
      }).length
    };

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    logger.error('Failed to fetch certificate stats:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch certificate statistics',
      stats: {
        total: 0,
        active: 0,
        revoked: 0,
        expired: 0,
        expiring: 0
      }
    });
  }
});

/**
 * GET /api/certificates - List all certificates
 */
router.get('/', async (req, res) => {
  try {
    const { type, status, search, page = 1, limit = 100 } = req.query;

    const response = await axios.get(`${CA_SERVICE_URL}/api/certificates`, {
      params: { page, limit }
    });

    let certificates = response.data.certificates || response.data || [];

    // Apply filters
    if (type) {
      certificates = certificates.filter(c => c.type === type);
    }

    if (status) {
      certificates = certificates.filter(c => c.status === status);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      certificates = certificates.filter(c =>
        c.commonName?.toLowerCase().includes(searchLower) ||
        c.serialNumber?.toLowerCase().includes(searchLower) ||
        c.organization?.toLowerCase().includes(searchLower)
      );
    }

    res.json({
      success: true,
      certificates,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: certificates.length
      }
    });
  } catch (error) {
    logger.error('Failed to fetch certificates:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch certificates',
      certificates: []
    });
  }
});

/**
 * POST /api/certificates/:id/revoke - Revoke certificate
 */
router.post('/:id/revoke', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const response = await axios.post(`${CA_SERVICE_URL}/api/certificates/${id}/revoke`, {
      reason: reason || 'unspecified'
    });

    // Emit Socket.IO event
    if (global.adminIO) {
      global.adminIO.emit('certificate:revoked', {
        certificateId: id,
        reason,
        timestamp: new Date().toISOString()
      });
    }

    res.json(response.data);
  } catch (error) {
    logger.error('Failed to revoke certificate:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to revoke certificate'
    });
  }
});

module.exports = router;
