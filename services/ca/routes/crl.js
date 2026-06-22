/**
 * ═══════════════════════════════════════════════════════════════════════
 * CRL Routes — RFC 5280 distribution point
 * ═══════════════════════════════════════════════════════════════════════
 *
 * GET /current.crl  DER CertificateList (application/pkix-crl) —
 *                   this is the URL embedded in issued certificates'
 *                   cRLDistributionPoints extension.
 * GET /             PEM CRL
 * GET /der          DER CRL (legacy alias)
 * GET /info         JSON metadata
 */

const express = require('express');
const router = express.Router();
const crlService = require('../services/crl');

/**
 * Set cache headers valid until the CRL's nextUpdate.
 */
function setCrlCacheHeaders(res) {
  const maxAge = crlService.getSecondsUntilNextUpdate();
  if (maxAge > 0) {
    res.setHeader('Cache-Control', `public, max-age=${maxAge}`);
    res.setHeader('Expires', new Date(Date.now() + maxAge * 1000).toUTCString());
  } else {
    res.setHeader('Cache-Control', 'no-cache');
  }

  const info = crlService.getCRLInfo();
  if (info && info.thisUpdate) {
    res.setHeader('Last-Modified', new Date(info.thisUpdate).toUTCString());
  }
}

/**
 * GET /crl/current.crl - Download current CRL (DER, RFC 5280)
 */
router.get('/current.crl', (req, res) => {
  try {
    const crl = crlService.getCurrentCRL('der');

    setCrlCacheHeaders(res);
    res.setHeader('Content-Type', 'application/pkix-crl');
    res.setHeader('Content-Disposition', 'inline; filename="current.crl"');
    res.send(crl);
  } catch (error) {
    (req.logger || console).error('CRL download failed:', error);

    res.status(503).json({
      error: 'CRL_UNAVAILABLE',
      message: 'Certificate Revocation List is not available'
    });
  }
});

/**
 * GET /crl - Download CRL (PEM format)
 */
router.get('/', (req, res) => {
  try {
    const crl = crlService.getCurrentCRL('pem');

    setCrlCacheHeaders(res);
    res.setHeader('Content-Type', 'application/x-pem-file');
    res.setHeader('Content-Disposition', 'attachment; filename="ca.crl.pem"');
    res.send(crl);
  } catch (error) {
    (req.logger || console).error('CRL download failed:', error);

    res.status(503).json({
      error: 'CRL_UNAVAILABLE',
      message: 'Certificate Revocation List is not available'
    });
  }
});

/**
 * GET /crl/der - Download CRL (DER format, legacy alias)
 */
router.get('/der', (req, res) => {
  try {
    const crl = crlService.getCurrentCRL('der');

    setCrlCacheHeaders(res);
    res.setHeader('Content-Type', 'application/pkix-crl');
    res.setHeader('Content-Disposition', 'attachment; filename="ca.crl"');
    res.send(crl);
  } catch (error) {
    (req.logger || console).error('CRL download failed:', error);

    res.status(503).json({
      error: 'CRL_UNAVAILABLE',
      message: 'Certificate Revocation List is not available'
    });
  }
});

/**
 * GET /crl/info - CRL information
 */
router.get('/info', (req, res) => {
  try {
    const info = crlService.getCRLInfo();

    if (!info) {
      return res.status(503).json({
        error: 'CRL_UNAVAILABLE',
        message: 'CRL not yet generated'
      });
    }

    res.status(200).json({
      success: true,
      crl: info
    });
  } catch (error) {
    (req.logger || console).error('Failed to get CRL info:', error);

    res.status(500).json({
      error: 'CRL_ERROR',
      message: 'Failed to get CRL information'
    });
  }
});

module.exports = router;
