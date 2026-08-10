/**
 * Certificates Controller
 * Handles certificate management operations
 */

const caService = require('../services/ca');
const database = require('../config/database');
const logger = require('../utils/logger');
const { sanitizeCertificate } = require('../middleware/validation');

/**
 * Create a new certificate
 */
async function createCertificate(req, res) {
  try {
    const {
      common_name,
      organization,
      organizational_unit,
      country,
      state,
      locality,
      email,
      validity_days,
      key_usage,
      extended_key_usage,
      subject_alt_names,
      profile,
    } = req.body;

    // Generate certificate
    const result = await caService.generateCertificate({
      common_name,
      organization,
      organizational_unit,
      country,
      state,
      locality,
      email,
      validity_days,
      key_usage,
      extended_key_usage,
      subject_alt_names,
      profile: profile || 'client',
      user_id: req.auth.userId,
    });

    logger.info('Certificate created', {
      serial: result.certificate.serial_number,
      commonName: common_name,
      userId: req.auth.userId,
      requestId: req.requestId,
    });

    res.status(201).json({
      certificate: sanitizeCertificate(result.certificate),
      private_key: result.private_key,
      certificate_chain: result.certificate_chain,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Certificate creation failed', {
      error: error.message,
      stack: error.stack,
      requestId: req.requestId,
    });

    res.status(500).json({
      error: {
        code: 'CERTIFICATE_CREATION_FAILED',
        message: error.message,
        requestId: req.requestId,
      },
    });
  }
}

/**
 * Get certificate by serial number
 */
async function getCertificate(req, res) {
  try {
    const { serial } = req.params;

    const cert = await caService.getCertificate(serial);

    if (!cert) {
      return res.status(404).json({
        error: {
          code: 'CERTIFICATE_NOT_FOUND',
          message: 'Certificate not found',
          requestId: req.requestId,
        },
      });
    }

    res.json({
      certificate: sanitizeCertificate(cert),
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Get certificate failed', {
      error: error.message,
      serial: req.params.serial,
      requestId: req.requestId,
    });

    res.status(500).json({
      error: {
        code: 'GET_CERTIFICATE_FAILED',
        message: 'Failed to get certificate',
        requestId: req.requestId,
      },
    });
  }
}

/**
 * List certificates
 */
async function listCertificates(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status;
    const userId = req.query.user_id || (req.query.my === 'true' ? req.auth.userId : null);

    const certificates = await caService.listCertificates({
      userId,
      status,
      limit,
      offset,
    });

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM certificates c';
    const countParams = [];
    const conditions = [];

    if (userId) {
      countQuery += ' JOIN user_certificates uc ON c.serial_number = uc.certificate_serial';
      conditions.push(`uc.user_id = $${countParams.length + 1}`);
      countParams.push(userId);
    }

    if (status) {
      conditions.push(`c.status = $${countParams.length + 1}`);
      countParams.push(status);
    }

    if (conditions.length > 0) {
      countQuery += ' WHERE ' + conditions.join(' AND ');
    }

    const countResult = await database.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      certificates: certificates.map(sanitizeCertificate),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('List certificates failed', {
      error: error.message,
      requestId: req.requestId,
    });

    res.status(500).json({
      error: {
        code: 'LIST_CERTIFICATES_FAILED',
        message: 'Failed to list certificates',
        requestId: req.requestId,
      },
    });
  }
}

/**
 * Revoke certificate
 */
async function revokeCertificate(req, res) {
  try {
    const { serial } = req.params;
    const { reason } = req.body;

    // Check if user owns the certificate or is admin
    if (!req.auth.roles.includes('admin')) {
      const ownership = await database.query(
        'SELECT * FROM user_certificates WHERE certificate_serial = $1 AND user_id = $2',
        [serial, req.auth.userId]
      );

      if (!ownership || ownership.rowCount === 0) {
        return res.status(403).json({
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: 'You do not have permission to revoke this certificate',
            requestId: req.requestId,
          },
        });
      }
    }

    const cert = await caService.revokeCertificate(
      serial,
      reason || 'unspecified',
      req.auth.userId
    );

    logger.info('Certificate revoked', {
      serial,
      reason,
      revokedBy: req.auth.userId,
      requestId: req.requestId,
    });

    res.json({
      certificate: sanitizeCertificate(cert),
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Certificate revocation failed', {
      error: error.message,
      serial: req.params.serial,
      requestId: req.requestId,
    });

    res.status(500).json({
      error: {
        code: 'REVOKE_CERTIFICATE_FAILED',
        message: error.message,
        requestId: req.requestId,
      },
    });
  }
}

/**
 * Validate certificate
 */
async function validateCertificate(req, res) {
  try {
    const { certificate } = req.body;

    if (!certificate) {
      return res.status(400).json({
        error: {
          code: 'MISSING_CERTIFICATE',
          message: 'Certificate PEM is required',
          requestId: req.requestId,
        },
      });
    }

    const validation = await caService.validateCertificate(certificate);

    res.json({
      valid: validation.valid,
      ...(validation.reason && { reason: validation.reason }),
      ...(validation.error && { error: validation.error }),
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Certificate validation failed', {
      error: error.message,
      requestId: req.requestId,
    });

    res.status(500).json({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Certificate validation failed',
        requestId: req.requestId,
      },
    });
  }
}

/**
 * Download certificate (PEM format)
 */
async function downloadCertificate(req, res) {
  try {
    const { serial } = req.params;

    const cert = await caService.getCertificate(serial);

    if (!cert) {
      return res.status(404).json({
        error: {
          code: 'CERTIFICATE_NOT_FOUND',
          message: 'Certificate not found',
          requestId: req.requestId,
        },
      });
    }

    res.setHeader('Content-Type', 'application/x-pem-file');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="certificate-${serial}.pem"`
    );
    res.send(cert.certificate_pem);
  } catch (error) {
    logger.error('Certificate download failed', {
      error: error.message,
      serial: req.params.serial,
      requestId: req.requestId,
    });

    res.status(500).json({
      error: {
        code: 'DOWNLOAD_FAILED',
        message: 'Failed to download certificate',
        requestId: req.requestId,
      },
    });
  }
}

/**
 * Get certificate chain
 */
async function getCertificateChain(req, res) {
  try {
    const { serial } = req.params;

    const cert = await caService.getCertificate(serial);

    if (!cert) {
      return res.status(404).json({
        error: {
          code: 'CERTIFICATE_NOT_FOUND',
          message: 'Certificate not found',
          requestId: req.requestId,
        },
      });
    }

    // Get CA certificates
    const ca = await caService.loadCACertificates();

    const chain = [
      cert.certificate_pem,
      ca.intermediatePem,
      ca.rootPem,
    ].join('\n');

    res.setHeader('Content-Type', 'application/x-pem-file');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="certificate-chain-${serial}.pem"`
    );
    res.send(chain);
  } catch (error) {
    logger.error('Get certificate chain failed', {
      error: error.message,
      serial: req.params.serial,
      requestId: req.requestId,
    });

    res.status(500).json({
      error: {
        code: 'GET_CHAIN_FAILED',
        message: 'Failed to get certificate chain',
        requestId: req.requestId,
      },
    });
  }
}

/**
 * Get certificate statistics
 */
async function getCertificateStats(req, res) {
  try {
    const userId = req.query.user_id || (req.query.my === 'true' ? req.auth.userId : null);

    let baseQuery = 'SELECT status, COUNT(*) as count FROM certificates';
    const params = [];

    if (userId) {
      baseQuery = `SELECT c.status, COUNT(*) as count
                   FROM certificates c
                   JOIN user_certificates uc ON c.serial_number = uc.certificate_serial
                   WHERE uc.user_id = $1`;
      params.push(userId);
    }

    const statusResult = await database.query(
      `${baseQuery} GROUP BY ${userId ? 'c.status' : 'status'}`,
      params
    );

    const stats = {
      total: 0,
      active: 0,
      revoked: 0,
      expired: 0,
      archived: 0,
    };

    statusResult.rows.forEach(row => {
      stats[row.status] = parseInt(row.count);
      stats.total += parseInt(row.count);
    });

    res.json({
      stats,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Get certificate stats failed', {
      error: error.message,
      requestId: req.requestId,
    });

    res.status(500).json({
      error: {
        code: 'GET_STATS_FAILED',
        message: 'Failed to get certificate statistics',
        requestId: req.requestId,
      },
    });
  }
}

module.exports = {
  createCertificate,
  getCertificate,
  listCertificates,
  revokeCertificate,
  validateCertificate,
  downloadCertificate,
  getCertificateChain,
  getCertificateStats,
};
