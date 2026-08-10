/**
 * CRL (Certificate Revocation List) Controller
 * Handles generation and distribution of certificate revocation lists
 */

const forge = require('node-forge');
const database = require('../config/database');
const redis = require('../config/redis');
const logger = require('../utils/logger');
const caService = require('../services/ca');

// CRL cache TTL (24 hours)
const CRL_CACHE_TTL = 86400;

/**
 * Generate CRL
 */
async function generateCRL() {
  try {
    // Load CA certificates
    const ca = await caService.loadCACertificates();

    // Get all revoked certificates
    const result = await database.query(
      `SELECT DISTINCT c.serial_number, c.revoked_at, c.revoked_reason, crl.crl_number
       FROM certificates c
       JOIN crl_entries crl ON c.serial_number = crl.certificate_serial
       WHERE c.status = 'revoked'
       ORDER BY c.revoked_at DESC`
    );

    // Create CRL
    const crl = forge.pki.createCaStore();

    // In a real implementation, you would use forge.pki.createCrl()
    // This is a simplified representation
    const crlData = {
      version: 'v2',
      signature_algorithm: 'SHA256withRSA',
      issuer: ca.intermediateCert.subject,
      this_update: new Date(),
      next_update: new Date(Date.now() + CRL_CACHE_TTL * 1000),
      revoked_certificates: result.rows.map(row => ({
        serial_number: row.serial_number,
        revocation_date: row.revoked_at,
        reason: row.revoked_reason,
        crl_number: row.crl_number,
      })),
      extensions: [
        {
          name: 'cRLNumber',
          value: result.rows.length > 0 ? Math.max(...result.rows.map(r => r.crl_number)) : 1,
        },
        {
          name: 'authorityKeyIdentifier',
        },
      ],
    };

    // In production, this would be properly DER/PEM encoded and signed
    // For now, we'll return a JSON representation
    return {
      crl: crlData,
      crl_pem: generateCRLPEM(crlData, ca),
      total_revoked: result.rows.length,
    };
  } catch (error) {
    logger.error('CRL generation failed', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Generate CRL in PEM format (simplified)
 */
function generateCRLPEM(crlData, ca) {
  try {
    // Create a text representation of the CRL
    // In production, this would be a proper X.509 CRL structure
    const crlText = `-----BEGIN X509 CRL-----
Version: ${crlData.version}
Signature Algorithm: ${crlData.signature_algorithm}
Issuer: ${crlData.issuer.getField('CN').value}
This Update: ${crlData.this_update.toISOString()}
Next Update: ${crlData.next_update.toISOString()}
CRL Number: ${crlData.extensions[0].value}

Revoked Certificates:
${crlData.revoked_certificates.map(cert =>
  `  Serial: ${cert.serial_number}, Revocation Date: ${cert.revocation_date}, Reason: ${cert.reason}`
).join('\n')}
-----END X509 CRL-----`;

    return crlText;
  } catch (error) {
    logger.error('CRL PEM generation failed', {
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get CRL (PEM format)
 */
async function getCRL(req, res) {
  try {
    // Check cache
    const cached = await redis.client.get('crl:latest');
    if (cached) {
      logger.debug('CRL cache hit');
      const crlData = JSON.parse(cached);

      res
        .setHeader('Content-Type', 'application/x-pem-file')
        .setHeader('Content-Disposition', 'attachment; filename="crl.pem"')
        .setHeader('Cache-Control', `public, max-age=${CRL_CACHE_TTL}`)
        .send(crlData.crl_pem);
      return;
    }

    // Generate new CRL
    const crlData = await generateCRL();

    // Cache it
    await redis.client.setex(
      'crl:latest',
      CRL_CACHE_TTL,
      JSON.stringify(crlData)
    );

    logger.info('CRL generated', {
      total_revoked: crlData.total_revoked,
      requestId: req.requestId,
    });

    res
      .setHeader('Content-Type', 'application/x-pem-file')
      .setHeader('Content-Disposition', 'attachment; filename="crl.pem"')
      .setHeader('Cache-Control', `public, max-age=${CRL_CACHE_TTL}`)
      .send(crlData.crl_pem);
  } catch (error) {
    logger.error('Get CRL failed', {
      error: error.message,
      requestId: req.requestId,
    });

    res.status(500).json({
      error: {
        code: 'CRL_GENERATION_FAILED',
        message: 'Failed to generate CRL',
        requestId: req.requestId,
      },
    });
  }
}

/**
 * Get CRL info (JSON)
 */
async function getCRLInfo(req, res) {
  try {
    // Check cache
    const cached = await redis.client.get('crl:latest');
    let crlData;

    if (cached) {
      crlData = JSON.parse(cached);
    } else {
      crlData = await generateCRL();
      await redis.client.setex(
        'crl:latest',
        CRL_CACHE_TTL,
        JSON.stringify(crlData)
      );
    }

    res.json({
      version: crlData.crl.version,
      issuer: crlData.crl.issuer.getField('CN').value,
      this_update: crlData.crl.this_update,
      next_update: crlData.crl.next_update,
      total_revoked: crlData.total_revoked,
      crl_number: crlData.crl.extensions[0].value,
      download_url: '/api/crl.pem',
      cache_ttl: CRL_CACHE_TTL,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Get CRL info failed', {
      error: error.message,
      requestId: req.requestId,
    });

    res.status(500).json({
      error: {
        code: 'CRL_INFO_FAILED',
        message: 'Failed to get CRL info',
        requestId: req.requestId,
      },
    });
  }
}

/**
 * List revoked certificates
 */
async function listRevokedCertificates(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const result = await database.query(
      `SELECT c.*, crl.crl_number, crl.revoked_at as crl_revoked_at
       FROM certificates c
       JOIN crl_entries crl ON c.serial_number = crl.certificate_serial
       WHERE c.status = 'revoked'
       ORDER BY c.revoked_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    // Get total count
    const countResult = await database.query(
      'SELECT COUNT(*) FROM certificates WHERE status = $1',
      ['revoked']
    );
    const total = parseInt(countResult.rows[0].count);

    res.json({
      revoked_certificates: result.rows.map(cert => ({
        serial_number: cert.serial_number,
        subject_common_name: cert.subject_common_name,
        revoked_at: cert.revoked_at,
        revoked_reason: cert.revoked_reason,
        crl_number: cert.crl_number,
        not_before: cert.not_before,
        not_after: cert.not_after,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('List revoked certificates failed', {
      error: error.message,
      requestId: req.requestId,
    });

    res.status(500).json({
      error: {
        code: 'LIST_REVOKED_FAILED',
        message: 'Failed to list revoked certificates',
        requestId: req.requestId,
      },
    });
  }
}

/**
 * Check if certificate is in CRL
 */
async function checkCertificateInCRL(req, res) {
  try {
    const { serial } = req.params;

    const result = await database.query(
      `SELECT c.*, crl.crl_number
       FROM certificates c
       LEFT JOIN crl_entries crl ON c.serial_number = crl.certificate_serial
       WHERE c.serial_number = $1`,
      [serial]
    );

    if (!result || result.rowCount === 0) {
      return res.status(404).json({
        error: {
          code: 'CERTIFICATE_NOT_FOUND',
          message: 'Certificate not found',
          requestId: req.requestId,
        },
      });
    }

    const cert = result.rows[0];
    const isRevoked = cert.status === 'revoked';

    res.json({
      serial: serial,
      in_crl: isRevoked,
      status: cert.status,
      ...(isRevoked && {
        revoked_at: cert.revoked_at,
        revoked_reason: cert.revoked_reason,
        crl_number: cert.crl_number,
      }),
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('CRL check failed', {
      error: error.message,
      serial: req.params.serial,
      requestId: req.requestId,
    });

    res.status(500).json({
      error: {
        code: 'CRL_CHECK_FAILED',
        message: 'Failed to check CRL',
        requestId: req.requestId,
      },
    });
  }
}

/**
 * Force CRL regeneration (admin only)
 */
async function regenerateCRL(req, res) {
  try {
    // Clear cache
    await redis.client.del('crl:latest');

    // Generate new CRL
    const crlData = await generateCRL();

    // Cache it
    await redis.client.setex(
      'crl:latest',
      CRL_CACHE_TTL,
      JSON.stringify(crlData)
    );

    logger.info('CRL regenerated', {
      total_revoked: crlData.total_revoked,
      regeneratedBy: req.auth.userId,
      requestId: req.requestId,
    });

    res.json({
      message: 'CRL regenerated successfully',
      total_revoked: crlData.total_revoked,
      crl_number: crlData.crl.extensions[0].value,
      next_update: crlData.crl.next_update,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('CRL regeneration failed', {
      error: error.message,
      requestId: req.requestId,
    });

    res.status(500).json({
      error: {
        code: 'CRL_REGENERATION_FAILED',
        message: 'Failed to regenerate CRL',
        requestId: req.requestId,
      },
    });
  }
}

module.exports = {
  getCRL,
  getCRLInfo,
  listRevokedCertificates,
  checkCertificateInCRL,
  regenerateCRL,
  generateCRL,
};
