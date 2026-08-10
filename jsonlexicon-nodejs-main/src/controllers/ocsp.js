/**
 * OCSP (Online Certificate Status Protocol) Controller
 * Handles certificate status checking via OCSP
 */

const forge = require('node-forge');
const database = require('../config/database');
const redis = require('../config/redis');
const logger = require('../utils/logger');
const caService = require('../services/ca');

// OCSP Response status codes
const OCSP_STATUS = {
  GOOD: 0,
  REVOKED: 1,
  UNKNOWN: 2,
};

// OCSP cache TTL (5 minutes)
const OCSP_CACHE_TTL = 300;

/**
 * Handle OCSP request
 */
async function handleOCSPRequest(req, res) {
  try {
    let ocspRequest;

    // OCSP requests can be GET or POST
    if (req.method === 'GET') {
      // Decode base64-encoded request from URL path
      const base64Request = req.params[0]; // Captures everything after /ocsp/
      const requestDer = Buffer.from(base64Request, 'base64');
      ocspRequest = requestDer;
    } else {
      // POST request with DER-encoded body
      ocspRequest = req.body;
    }

    // Parse OCSP request (simplified - in production use a proper OCSP library)
    // For now, we'll extract the serial number from the request
    const serialNumber = extractSerialFromOCSPRequest(ocspRequest);

    if (!serialNumber) {
      return res.status(400).send('Invalid OCSP request');
    }

    // Check cache first
    const cached = await redis.client.get(`ocsp:${serialNumber}`);
    if (cached) {
      logger.debug('OCSP cache hit', { serial: serialNumber });
      return res
        .setHeader('Content-Type', 'application/ocsp-response')
        .send(Buffer.from(cached, 'base64'));
    }

    // Get certificate from database
    const cert = await caService.getCertificate(serialNumber);

    let ocspStatus = OCSP_STATUS.UNKNOWN;
    let revocationTime = null;
    let revocationReason = null;

    if (cert) {
      if (cert.status === 'active') {
        // Check if expired
        const now = new Date();
        if (now >= new Date(cert.not_after)) {
          ocspStatus = OCSP_STATUS.REVOKED;
          revocationTime = new Date(cert.not_after);
          revocationReason = 'expired';
        } else {
          ocspStatus = OCSP_STATUS.GOOD;
        }
      } else if (cert.status === 'revoked') {
        ocspStatus = OCSP_STATUS.REVOKED;
        revocationTime = new Date(cert.revoked_at);
        revocationReason = cert.revoked_reason;
      }
    }

    // Generate OCSP response
    const response = await generateOCSPResponse({
      serialNumber,
      status: ocspStatus,
      revocationTime,
      revocationReason,
    });

    // Cache the response
    await redis.client.setex(
      `ocsp:${serialNumber}`,
      OCSP_CACHE_TTL,
      response.toString('base64')
    );

    // Store in database
    await database.query(
      `INSERT INTO ocsp_responses (certificate_serial, response_der, produced_at, next_update)
       VALUES ($1, $2, NOW(), NOW() + INTERVAL '${OCSP_CACHE_TTL} seconds')
       ON CONFLICT (certificate_serial)
       DO UPDATE SET
         response_der = $2,
         produced_at = NOW(),
         next_update = NOW() + INTERVAL '${OCSP_CACHE_TTL} seconds'`,
      [serialNumber, response]
    );

    logger.info('OCSP response generated', {
      serial: serialNumber,
      status: ocspStatus,
      requestId: req.requestId,
    });

    res
      .setHeader('Content-Type', 'application/ocsp-response')
      .send(response);
  } catch (error) {
    logger.error('OCSP request failed', {
      error: error.message,
      stack: error.stack,
      requestId: req.requestId,
    });

    // Return "internal error" OCSP response
    res.status(500).send('OCSP service error');
  }
}

/**
 * Extract serial number from OCSP request (simplified)
 */
function extractSerialFromOCSPRequest(requestDer) {
  try {
    // This is a simplified extraction
    // In production, use a proper ASN.1 parser for OCSP requests
    const requestHex = Buffer.from(requestDer).toString('hex');

    // Look for serial number pattern in the request
    // This is a placeholder - real implementation would parse the ASN.1 structure
    // For now, we'll assume the serial is passed in a custom header as fallback
    return null;
  } catch (error) {
    logger.error('Failed to extract serial from OCSP request', {
      error: error.message,
    });
    return null;
  }
}

/**
 * Generate OCSP response (simplified)
 */
async function generateOCSPResponse(options) {
  const {
    serialNumber,
    status,
    revocationTime,
    revocationReason,
  } = options;

  try {
    // Load CA certificates
    const ca = await caService.loadCACertificates();

    // Create OCSP response structure
    // This is simplified - in production use a proper OCSP library
    const response = {
      version: 'v1',
      responderID: {
        byName: ca.intermediateCert.subject,
      },
      producedAt: new Date(),
      responses: [
        {
          certID: {
            hashAlgorithm: 'sha1',
            issuerNameHash: 'placeholder',
            issuerKeyHash: 'placeholder',
            serialNumber: serialNumber,
          },
          certStatus: status,
          thisUpdate: new Date(),
          nextUpdate: new Date(Date.now() + OCSP_CACHE_TTL * 1000),
          ...(status === OCSP_STATUS.REVOKED && {
            revocationTime,
            revocationReason,
          }),
        },
      ],
    };

    // In production, this would be properly DER-encoded and signed
    // For now, return a placeholder
    return Buffer.from(JSON.stringify(response));
  } catch (error) {
    logger.error('OCSP response generation failed', {
      error: error.message,
      serial: serialNumber,
    });
    throw error;
  }
}

/**
 * Get OCSP responder info
 */
async function getOCSPInfo(req, res) {
  try {
    const ca = await caService.loadCACertificates();

    res.json({
      responder: 'Exprsn Platform OCSP Responder',
      version: '1.0',
      issuer: ca.intermediateCert.subject.getField('CN').value,
      cache_ttl: OCSP_CACHE_TTL,
      endpoint: '/api/ocsp',
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Get OCSP info failed', {
      error: error.message,
      requestId: req.requestId,
    });

    res.status(500).json({
      error: {
        code: 'OCSP_INFO_FAILED',
        message: 'Failed to get OCSP info',
        requestId: req.requestId,
      },
    });
  }
}

/**
 * Check certificate status via serial number (JSON API)
 */
async function checkCertificateStatus(req, res) {
  try {
    const { serial } = req.params;

    // Check cache
    const cached = await redis.client.get(`cert:status:${serial}`);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

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

    const now = new Date();
    let status = cert.status;
    let reason = null;

    // Check if expired
    if (status === 'active' && now >= new Date(cert.not_after)) {
      status = 'expired';
      reason = 'Certificate validity period ended';
    }

    const response = {
      serial: serial,
      status: status,
      valid: status === 'active',
      ...(reason && { reason }),
      ...(cert.revoked_at && { revoked_at: cert.revoked_at }),
      ...(cert.revoked_reason && { revoked_reason: cert.revoked_reason }),
      not_before: cert.not_before,
      not_after: cert.not_after,
      checked_at: new Date().toISOString(),
      requestId: req.requestId,
    };

    // Cache for 1 minute
    await redis.client.setex(
      `cert:status:${serial}`,
      60,
      JSON.stringify(response)
    );

    res.json(response);
  } catch (error) {
    logger.error('Certificate status check failed', {
      error: error.message,
      serial: req.params.serial,
      requestId: req.requestId,
    });

    res.status(500).json({
      error: {
        code: 'STATUS_CHECK_FAILED',
        message: 'Failed to check certificate status',
        requestId: req.requestId,
      },
    });
  }
}

module.exports = {
  handleOCSPRequest,
  getOCSPInfo,
  checkCertificateStatus,
};
