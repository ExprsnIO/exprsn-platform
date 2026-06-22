/**
 * ═══════════════════════════════════════════════════════════════════════
 * OCSP Routes — RFC 6960 responder
 * ═══════════════════════════════════════════════════════════════════════
 *
 * POST /         application/ocsp-request  → application/ocsp-response
 * GET  /{b64}    URL-safe base64 DER OCSPRequest (RFC 6960 Appendix A.1)
 * POST /batch    legacy JSON batch status (internal API)
 * GET  /status   service status (internal API)
 */

const express = require('express');
const router = express.Router();
const ocspService = require('../services/ocsp');
const ocspAsn1 = require('../services/ocspAsn1');

/**
 * Send a DER OCSP response with appropriate headers.
 */
function sendOcspResponse(res, result, { cacheable = false } = {}) {
  res.setHeader('Content-Type', 'application/ocsp-response');

  if (cacheable && result.maxAge > 0) {
    res.setHeader('Cache-Control', `public, max-age=${result.maxAge}`);
    res.setHeader('Expires', new Date(Date.now() + result.maxAge * 1000).toUTCString());
    res.setHeader('Last-Modified', new Date().toUTCString());
  } else {
    res.setHeader('Cache-Control', 'no-cache, no-store');
  }

  res.status(200).send(result.buffer);
}

/**
 * POST /ocsp - RFC 6960 OCSP responder (raw DER body)
 */
router.post(
  '/',
  express.raw({ type: 'application/ocsp-request', limit: '10kb' }),
  async (req, res) => {
    try {
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const result = await ocspService.handleOcspRequest(body);
      sendOcspResponse(res, result);
    } catch (error) {
      (req.logger || console).error('OCSP responder failed:', error);
      sendOcspResponse(res, {
        buffer: ocspAsn1.buildStatusOnlyResponse(ocspAsn1.OCSP_RESPONSE_STATUS.internalError),
        maxAge: 0
      });
    }
  }
);

/**
 * POST /ocsp/batch - Legacy JSON batch status check (internal API)
 */
router.post('/batch', async (req, res) => {
  try {
    const { serialNumbers } = req.body || {};

    if (!Array.isArray(serialNumbers) || serialNumbers.length === 0) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'serialNumbers array is required'
      });
    }

    const responses = await ocspService.checkStatusBatch(serialNumbers);

    res.status(200).json({
      success: true,
      responses
    });
  } catch (error) {
    (req.logger || console).error('OCSP batch check failed:', error);

    res.status(500).json({
      error: 'OCSP_UNAVAILABLE',
      message: 'OCSP service unavailable'
    });
  }
});

/**
 * GET /ocsp/status - OCSP service status (internal API)
 */
router.get('/status', (req, res) => {
  const stats = ocspService.getCacheStats();

  res.status(200).json({
    status: 'operational',
    cache: stats,
    url: require('../config').ocsp.url
  });
});

/**
 * GET /ocsp/{base64-request} - RFC 6960 Appendix A.1 GET responder.
 * The request is the base64 DER OCSPRequest, URL-encoded (may contain
 * '/', '+', '=' characters, so this is a wildcard route).
 */
router.get('/*', async (req, res) => {
  try {
    let encoded = req.params[0] || '';
    try {
      encoded = decodeURIComponent(encoded);
    } catch (e) {
      // keep raw value if URL-decoding fails
    }

    // Accept URL-safe base64 variants as well
    encoded = encoded.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');

    const der = Buffer.from(encoded, 'base64');
    if (der.length === 0) {
      return sendOcspResponse(res, {
        buffer: ocspAsn1.buildStatusOnlyResponse(ocspAsn1.OCSP_RESPONSE_STATUS.malformedRequest),
        maxAge: 0
      });
    }

    const result = await ocspService.handleOcspRequest(der);
    sendOcspResponse(res, result, { cacheable: true });
  } catch (error) {
    (req.logger || console).error('OCSP GET responder failed:', error);
    sendOcspResponse(res, {
      buffer: ocspAsn1.buildStatusOnlyResponse(ocspAsn1.OCSP_RESPONSE_STATUS.internalError),
      maxAge: 0
    });
  }
});

module.exports = router;
