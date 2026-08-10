/**
 * Certificates Administration Routes
 * API endpoints for managing certificates in the CA service
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const logger = require('../utils/logger');

// CA Service connection
const CA_SERVICE_URL = process.env.CA_URL || 'http://localhost:3000';

/**
 * GET /api/certificates/stats
 * Get certificate statistics
 */
router.get('/stats', async (req, res) => {
  try {
    // Fetch all certificates to calculate stats
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
      data: stats
    });
  } catch (error) {
    logger.error('Failed to fetch certificate stats:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch certificate statistics',
      data: {
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
 * GET /api/certificates
 * List all certificates with optional filtering
 */
router.get('/', async (req, res) => {
  try {
    const { type, status, search, page = 1, limit = 100 } = req.query;

    const params = new URLSearchParams({
      ...(page && { page }),
      ...(limit && { limit })
    });

    const response = await axios.get(`${CA_SERVICE_URL}/api/certificates?${params}`);
    let certificates = response.data.certificates || response.data || [];

    // Apply filters on the setup service side for better UX
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
        c.fingerprint?.toLowerCase().includes(searchLower) ||
        c.organization?.toLowerCase().includes(searchLower)
      );
    }

    res.json({
      success: true,
      data: certificates,
      pagination: response.data.pagination || {
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
      data: []
    });
  }
});

/**
 * GET /api/certificates/:id
 * Get a single certificate by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const response = await axios.get(`${CA_SERVICE_URL}/api/certificates/${id}`);

    res.json({
      success: true,
      data: response.data.certificate || response.data
    });
  } catch (error) {
    logger.error(`Failed to fetch certificate ${req.params.id}:`, error.message);

    if (error.response?.status === 404) {
      return res.status(404).json({
        success: false,
        error: 'Certificate not found'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to fetch certificate details'
    });
  }
});

/**
 * GET /api/certificates/:id/chain
 * Get the certificate chain for a certificate
 */
router.get('/:id/chain', async (req, res) => {
  try {
    const { id } = req.params;

    const response = await axios.get(`${CA_SERVICE_URL}/api/certificates/${id}/chain`);

    res.json({
      success: true,
      data: response.data.chain || response.data || []
    });
  } catch (error) {
    logger.error(`Failed to fetch certificate chain for ${req.params.id}:`, error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch certificate chain',
      data: []
    });
  }
});

/**
 * POST /api/certificates
 * Issue a new certificate
 */
router.post('/', async (req, res) => {
  try {
    const {
      type,
      commonName,
      organization,
      organizationalUnit,
      locality,
      state,
      country,
      validityDays,
      keySize,
      subjectAlternativeNames,
      email
    } = req.body;

    // Validate required fields
    if (!type || !commonName || !validityDays || !keySize) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: type, commonName, validityDays, keySize'
      });
    }

    // Prepare certificate data
    const certData = {
      type,
      commonName,
      organization: organization || '',
      organizationalUnit: organizationalUnit || '',
      locality: locality || '',
      state: state || '',
      country: country || '',
      email: email || '',
      validityDays: parseInt(validityDays),
      keySize: parseInt(keySize),
      algorithm: 'RSA-SHA256' // Default algorithm
    };

    // Add SANs if provided
    if (subjectAlternativeNames && Array.isArray(subjectAlternativeNames)) {
      certData.subjectAlternativeNames = subjectAlternativeNames;
    }

    // Issue the certificate
    const response = await axios.post(
      `${CA_SERVICE_URL}/api/certificates/issue`,
      certData
    );

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('certificate:issued', {
        certificateId: response.data.certificate?.id || response.data.id,
        commonName: certData.commonName,
        type: certData.type,
        timestamp: new Date().toISOString()
      });
    }

    res.status(201).json({
      success: true,
      data: response.data.certificate || response.data,
      message: 'Certificate issued successfully'
    });
  } catch (error) {
    logger.error('Failed to issue certificate:', error.message);

    if (error.response?.data) {
      return res.status(error.response.status || 500).json({
        success: false,
        error: error.response.data.error || error.response.data.message || 'Failed to issue certificate'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to issue certificate'
    });
  }
});

/**
 * POST /api/certificates/:id/revoke
 * Revoke a certificate
 */
router.post('/:id/revoke', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, notes } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        error: 'Revocation reason is required'
      });
    }

    const response = await axios.post(
      `${CA_SERVICE_URL}/api/certificates/${id}/revoke`,
      {
        reason,
        notes: notes || ''
      }
    );

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('certificate:revoked', {
        certificateId: id,
        reason,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: response.data,
      message: 'Certificate revoked successfully'
    });
  } catch (error) {
    logger.error(`Failed to revoke certificate ${req.params.id}:`, error.message);

    if (error.response?.status === 404) {
      return res.status(404).json({
        success: false,
        error: 'Certificate not found'
      });
    }

    if (error.response?.data) {
      return res.status(error.response.status || 500).json({
        success: false,
        error: error.response.data.error || error.response.data.message || 'Failed to revoke certificate'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to revoke certificate'
    });
  }
});

/**
 * POST /api/certificates/bulk/revoke
 * Bulk revoke certificates
 */
router.post('/bulk/revoke', async (req, res) => {
  try {
    const { certificateIds, reason, notes } = req.body;

    if (!certificateIds || !Array.isArray(certificateIds) || certificateIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'certificateIds array is required'
      });
    }

    if (!reason) {
      return res.status(400).json({
        success: false,
        error: 'Revocation reason is required'
      });
    }

    const results = [];
    let successCount = 0;
    let failCount = 0;

    for (const certId of certificateIds) {
      try {
        await axios.post(
          `${CA_SERVICE_URL}/api/certificates/${certId}/revoke`,
          { reason, notes: notes || 'Bulk revocation' }
        );
        results.push({ certificateId: certId, success: true });
        successCount++;
      } catch (error) {
        results.push({
          certificateId: certId,
          success: false,
          error: error.response?.data?.error || error.message
        });
        failCount++;
      }
    }

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('certificates:bulk-revoked', {
        successCount,
        failCount,
        reason,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: {
        successCount,
        failCount,
        results
      },
      message: `Revoked ${successCount} certificates. Failed: ${failCount}`
    });
  } catch (error) {
    logger.error('Bulk revoke failed:', error.message);
    res.status(500).json({
      success: false,
      error: 'Bulk revoke operation failed'
    });
  }
});

/**
 * POST /api/certificates/bulk/export
 * Bulk export certificates
 */
router.post('/bulk/export', async (req, res) => {
  try {
    const { certificateIds, format = 'pem' } = req.body;

    if (!certificateIds || !Array.isArray(certificateIds) || certificateIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'certificateIds array is required'
      });
    }

    const certificates = [];

    for (const certId of certificateIds) {
      try {
        const response = await axios.get(`${CA_SERVICE_URL}/api/certificates/${certId}`);
        certificates.push(response.data.certificate || response.data);
      } catch (error) {
        logger.error(`Failed to fetch certificate ${certId}:`, error.message);
      }
    }

    if (format === 'pem') {
      // Concatenate all PEM certificates
      const pemBundle = certificates.map(cert => cert.certificatePem).join('\n\n');

      res.setHeader('Content-Type', 'application/x-pem-file');
      res.setHeader('Content-Disposition', 'attachment; filename="certificates_bundle.pem"');
      res.send(pemBundle);
    } else if (format === 'json') {
      res.json({
        success: true,
        data: certificates
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Invalid format. Supported: pem, json'
      });
    }
  } catch (error) {
    logger.error('Bulk export failed:', error.message);
    res.status(500).json({
      success: false,
      error: 'Bulk export operation failed'
    });
  }
});

/**
 * GET /api/certificates/:id/download
 * Download a certificate in various formats
 */
router.get('/:id/download', async (req, res) => {
  try {
    const { id } = req.params;
    const { format = 'pem' } = req.query;

    const response = await axios.get(
      `${CA_SERVICE_URL}/api/certificates/${id}`,
      { responseType: 'json' }
    );

    const certificate = response.data.certificate || response.data;

    if (!certificate || !certificate.certificatePem) {
      return res.status(404).json({
        success: false,
        error: 'Certificate not found or PEM data unavailable'
      });
    }

    // Set appropriate headers for download
    const filename = `${certificate.commonName.replace(/[^a-zA-Z0-9]/g, '_')}.${format}`;

    if (format === 'pem') {
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'application/x-pem-file');
      res.send(certificate.certificatePem);
    } else if (format === 'der') {
      // For DER, fetch from CA service if available
      try {
        const derResponse = await axios.get(
          `${CA_SERVICE_URL}/api/certificates/${id}/der`,
          { responseType: 'arraybuffer' }
        );
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/pkix-cert');
        res.send(derResponse.data);
      } catch (error) {
        res.status(500).json({
          success: false,
          error: 'DER format not available'
        });
      }
    } else if (format === 'json') {
      res.json({
        success: true,
        data: certificate
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Invalid format. Supported: pem, der, json'
      });
    }
  } catch (error) {
    logger.error(`Failed to download certificate ${req.params.id}:`, error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to download certificate'
    });
  }
});

/**
 * PUT /api/certificates/:id
 * Update certificate metadata (not the certificate itself)
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const response = await axios.put(
      `${CA_SERVICE_URL}/api/certificates/${id}`,
      updates
    );

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('certificate:updated', {
        certificateId: id,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: response.data,
      message: 'Certificate updated successfully'
    });
  } catch (error) {
    logger.error(`Failed to update certificate ${req.params.id}:`, error.message);

    if (error.response?.status === 404) {
      return res.status(404).json({
        success: false,
        error: 'Certificate not found'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to update certificate'
    });
  }
});

/**
 * DELETE /api/certificates/:id
 * Delete a certificate (admin only, use with caution)
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const response = await axios.delete(`${CA_SERVICE_URL}/api/certificates/${id}`);

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('certificate:deleted', {
        certificateId: id,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: 'Certificate deleted successfully'
    });
  } catch (error) {
    logger.error(`Failed to delete certificate ${req.params.id}:`, error.message);

    if (error.response?.status === 404) {
      return res.status(404).json({
        success: false,
        error: 'Certificate not found'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to delete certificate'
    });
  }
});

/**
 * POST /api/certificates/search
 * Advanced certificate search
 */
router.post('/search', async (req, res) => {
  try {
    const searchCriteria = req.body;

    // Fetch all certificates and filter on setup service side
    const response = await axios.get(`${CA_SERVICE_URL}/api/certificates`);
    let certificates = response.data.certificates || response.data || [];

    // Apply search criteria
    if (searchCriteria.commonName) {
      certificates = certificates.filter(c =>
        c.commonName?.toLowerCase().includes(searchCriteria.commonName.toLowerCase())
      );
    }

    if (searchCriteria.organization) {
      certificates = certificates.filter(c =>
        c.organization?.toLowerCase().includes(searchCriteria.organization.toLowerCase())
      );
    }

    if (searchCriteria.serialNumber) {
      certificates = certificates.filter(c =>
        c.serialNumber?.toLowerCase().includes(searchCriteria.serialNumber.toLowerCase())
      );
    }

    if (searchCriteria.fingerprint) {
      certificates = certificates.filter(c =>
        c.fingerprint?.toLowerCase().includes(searchCriteria.fingerprint.toLowerCase())
      );
    }

    if (searchCriteria.type) {
      certificates = certificates.filter(c => c.type === searchCriteria.type);
    }

    if (searchCriteria.status) {
      certificates = certificates.filter(c => c.status === searchCriteria.status);
    }

    if (searchCriteria.keySize) {
      certificates = certificates.filter(c => c.keySize === parseInt(searchCriteria.keySize));
    }

    if (searchCriteria.algorithm) {
      certificates = certificates.filter(c => c.algorithm === searchCriteria.algorithm);
    }

    // Date filters
    if (searchCriteria.issuedAfter) {
      const afterDate = new Date(searchCriteria.issuedAfter);
      certificates = certificates.filter(c => new Date(c.notBefore || c.createdAt) >= afterDate);
    }

    if (searchCriteria.issuedBefore) {
      const beforeDate = new Date(searchCriteria.issuedBefore);
      certificates = certificates.filter(c => new Date(c.notBefore || c.createdAt) <= beforeDate);
    }

    if (searchCriteria.expiresAfter) {
      const afterDate = new Date(searchCriteria.expiresAfter);
      certificates = certificates.filter(c => new Date(c.notAfter) >= afterDate);
    }

    if (searchCriteria.expiresBefore) {
      const beforeDate = new Date(searchCriteria.expiresBefore);
      certificates = certificates.filter(c => new Date(c.notAfter) <= beforeDate);
    }

    res.json({
      success: true,
      data: certificates,
      pagination: {
        total: certificates.length
      }
    });
  } catch (error) {
    logger.error('Failed to search certificates:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to search certificates',
      data: []
    });
  }
});

/**
 * GET /api/certificates/:id/verify
 * Verify a certificate's validity and chain
 */
router.get('/:id/verify', async (req, res) => {
  try {
    const { id } = req.params;

    const response = await axios.get(`${CA_SERVICE_URL}/api/certificates/${id}/verify`);

    res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    logger.error(`Failed to verify certificate ${req.params.id}:`, error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to verify certificate'
    });
  }
});

/**
 * GET /api/certificates/expiring/:days
 * Get certificates expiring within specified days
 */
router.get('/expiring/:days', async (req, res) => {
  try {
    const { days } = req.params;
    const daysInt = parseInt(days);

    if (isNaN(daysInt) || daysInt < 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid days parameter'
      });
    }

    // Fetch all certificates and filter
    const response = await axios.get(`${CA_SERVICE_URL}/api/certificates`);
    const certificates = response.data.certificates || response.data || [];

    const now = new Date();
    const futureDate = new Date(now.getTime() + (daysInt * 24 * 60 * 60 * 1000));

    const expiring = certificates.filter(cert => {
      const expiryDate = new Date(cert.notAfter);
      return cert.status === 'active' && expiryDate > now && expiryDate <= futureDate;
    });

    res.json({
      success: true,
      data: expiring
    });
  } catch (error) {
    logger.error(`Failed to fetch expiring certificates:`, error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch expiring certificates',
      data: []
    });
  }
});

/**
 * GET /api/certificates/ocsp/:serialNumber
 * Check OCSP status of a certificate by serial number
 */
router.get('/ocsp/:serialNumber', async (req, res) => {
  try {
    const { serialNumber } = req.params;

    const response = await axios.post(
      `${CA_SERVICE_URL}/ocsp`,
      { serialNumber }
    );

    res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    logger.error(`OCSP check failed for ${req.params.serialNumber}:`, error.message);
    res.status(500).json({
      success: false,
      error: 'OCSP check failed'
    });
  }
});

module.exports = router;
