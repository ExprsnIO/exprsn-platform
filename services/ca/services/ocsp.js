/**
 * ═══════════════════════════════════════════════════════════════════════
 * OCSP (Online Certificate Status Protocol) Service — RFC 6960
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Produces signed DER BasicOCSPResponse structures. The legacy JSON
 * status helpers (checkStatus / checkStatusBatch) are retained for the
 * internal /ocsp/batch and /ocsp/status endpoints.
 */

const { Op } = require('sequelize');
const { Certificate, RevocationList } = require('../models');
const { getStorage } = require('../storage');
const config = require('../config');
const logger = require('../utils/logger');
const ocspAsn1 = require('./ocspAsn1');

const ISSUER_CACHE_TTL_MS = 60 * 1000;
const DEFAULT_VALIDITY_SECONDS = parseInt(process.env.OCSP_VALIDITY_SECONDS, 10) || 3600;
// P0-6: revoked-status responses must not be cacheable for more than 60s
const REVOKED_MAX_AGE_SECONDS = 60;

/**
 * Candidate stored serial-number representations for a hex serial taken
 * from a DER INTEGER (leading zero bytes / sign byte may differ from the
 * 32-hex-char form stored in the database).
 */
function serialCandidates(hex) {
  const candidates = new Set();
  const lower = (hex || '').toLowerCase();
  candidates.add(lower);

  const stripped = lower.replace(/^0+/, '') || '0';
  candidates.add(stripped);
  if (stripped.length % 2 !== 0) {
    candidates.add('0' + stripped);
  }
  candidates.add(stripped.padStart(32, '0'));

  return Array.from(candidates);
}

class OCSPService {
  constructor() {
    this.cache = new Map();
    this.batchQueue = [];
    this.batchTimeout = null;
    this.issuerCache = { expiresAt: 0, issuers: [] };
  }

  // ───────────────────────────────────────────────────────────────────
  // RFC 6960 DER responder
  // ───────────────────────────────────────────────────────────────────

  /**
   * Load CA certificates and their CertID hashes (SHA-1 + SHA-256).
   */
  async getIssuers() {
    const now = Date.now();
    if (this.issuerCache.expiresAt > now && this.issuerCache.issuers.length > 0) {
      return this.issuerCache.issuers;
    }

    const caCerts = await Certificate.findAll({
      where: { type: { [Op.in]: ['root', 'intermediate'] } }
    });

    const issuers = [];
    for (const caCert of caCerts) {
      try {
        issuers.push({
          certificate: caCert,
          hashes: ocspAsn1.computeIssuerHashes(caCert.certificatePem)
        });
      } catch (error) {
        logger.warn('Failed to compute issuer hashes for CA cert', {
          id: caCert.id,
          error: error.message
        });
      }
    }

    this.issuerCache = { expiresAt: now + ISSUER_CACHE_TTL_MS, issuers };
    return issuers;
  }

  /**
   * Match a parsed CertID against our CA certificates.
   * @returns {Object|null} issuer entry or null
   */
  matchIssuer(request, issuers) {
    let algo = null;
    if (request.hashAlgorithm === ocspAsn1.OIDS.sha1) {
      algo = 'sha1';
    } else if (request.hashAlgorithm === ocspAsn1.OIDS.sha256) {
      algo = 'sha256';
    } else {
      return null;
    }

    return issuers.find(issuer =>
      issuer.hashes[algo].nameHash === request.issuerNameHash &&
      issuer.hashes[algo].keyHash === request.issuerKeyHash
    ) || null;
  }

  /**
   * Determine the single-response status for one CertID.
   */
  async resolveCertStatus(request, issuer) {
    const candidates = serialCandidates(request.serialNumber);

    const certificate = await Certificate.findOne({
      where: { serialNumber: { [Op.in]: candidates } }
    });

    if (!certificate || certificate.issuerId !== issuer.certificate.id) {
      return { status: 'unknown' };
    }

    const revocation = await RevocationList.findOne({
      where: { serialNumber: { [Op.in]: candidates } },
      order: [['revokedAt', 'ASC']]
    });

    if (revocation || certificate.status === 'revoked') {
      return {
        status: 'revoked',
        revokedAt: (revocation && revocation.revokedAt) || certificate.revokedAt || new Date(),
        reasonCode: this.getReasonCode(
          (revocation && revocation.reason) || certificate.revocationReason || 'unspecified'
        )
      };
    }

    return { status: 'good' };
  }

  /**
   * Handle a raw DER OCSPRequest and produce a DER OCSPResponse.
   *
   * @param {Buffer} derBuffer - DER OCSPRequest bytes
   * @returns {Promise<{buffer: Buffer, maxAge: number}>}
   */
  async handleOcspRequest(derBuffer) {
    let parsed;
    try {
      if (!derBuffer || !Buffer.isBuffer(derBuffer) || derBuffer.length === 0) {
        throw new Error('Empty request body');
      }
      parsed = ocspAsn1.parseOcspRequest(derBuffer);
      if (!parsed.requests.length) {
        throw new Error('No CertIDs in request');
      }
    } catch (error) {
      logger.debug('Malformed OCSP request', { error: error.message });
      return {
        buffer: ocspAsn1.buildStatusOnlyResponse(ocspAsn1.OCSP_RESPONSE_STATUS.malformedRequest),
        maxAge: 0
      };
    }

    try {
      const issuers = await this.getIssuers();

      // Scope to issuer: only answer for CertIDs whose issuer hashes
      // match one of our CA certificates.
      const matches = parsed.requests.map(request => ({
        request,
        issuer: this.matchIssuer(request, issuers)
      }));

      if (!matches.some(m => m.issuer)) {
        return {
          buffer: ocspAsn1.buildStatusOnlyResponse(ocspAsn1.OCSP_RESPONSE_STATUS.unauthorized),
          maxAge: 0
        };
      }

      const now = new Date();
      let validitySeconds = DEFAULT_VALIDITY_SECONDS;
      const singleResponses = [];

      for (const { request, issuer } of matches) {
        if (!issuer) {
          singleResponses.push({
            certIdAsn1: request.certIdAsn1,
            status: 'unknown',
            thisUpdate: now
          });
          continue;
        }

        const resolved = await this.resolveCertStatus(request, issuer);
        if (resolved.status === 'revoked') {
          validitySeconds = Math.min(validitySeconds, REVOKED_MAX_AGE_SECONDS);
        }

        singleResponses.push({
          certIdAsn1: request.certIdAsn1,
          status: resolved.status,
          revokedAt: resolved.revokedAt,
          reasonCode: resolved.reasonCode,
          thisUpdate: now
        });
      }

      const nextUpdate = new Date(now.getTime() + validitySeconds * 1000);
      for (const sr of singleResponses) {
        sr.nextUpdate = nextUpdate;
      }

      // Responder signing identity: OCSP_SIGNER_CERT_ID override, else the
      // (first matched) issuing CA certificate itself.
      const defaultSigner = matches.find(m => m.issuer).issuer.certificate;
      let signerCert = defaultSigner;
      if (process.env.OCSP_SIGNER_CERT_ID) {
        const override = await Certificate.findByPk(process.env.OCSP_SIGNER_CERT_ID);
        if (override) {
          signerCert = override;
        } else {
          logger.warn('OCSP_SIGNER_CERT_ID set but certificate not found; using issuing CA', {
            ocspSignerCertId: process.env.OCSP_SIGNER_CERT_ID
          });
        }
      }

      const storage = getStorage();
      const signerKeyPem = await storage.getPrivateKey(signerCert.id);

      const buffer = ocspAsn1.buildOcspResponse({
        signerCertPem: signerCert.certificatePem,
        signerKeyPem,
        singleResponses,
        nonce: parsed.nonce
      });

      return { buffer, maxAge: validitySeconds };
    } catch (error) {
      logger.error('OCSP responder internal error:', error);
      return {
        buffer: ocspAsn1.buildStatusOnlyResponse(ocspAsn1.OCSP_RESPONSE_STATUS.internalError),
        maxAge: 0
      };
    }
  }

  /**
   * Map revocation reason name to RFC 5280 CRLReason code
   */
  getReasonCode(reason) {
    const reasonMap = {
      unspecified: 0,
      keyCompromise: 1,
      caCompromise: 2,
      affiliationChanged: 3,
      superseded: 4,
      cessationOfOperation: 5,
      certificateHold: 6,
      removeFromCRL: 8,
      privilegeWithdrawn: 9,
      aaCompromise: 10
    };

    return reasonMap[reason] || 0;
  }

  // ───────────────────────────────────────────────────────────────────
  // Legacy JSON status helpers (internal API)
  // ───────────────────────────────────────────────────────────────────

  /**
   * Check certificate status (JSON helper)
   * @param {string} serialNumber - Certificate serial number
   * @returns {Promise<Object>} status descriptor
   */
  async checkStatus(serialNumber) {
    try {
      logger.debug('OCSP status check', { serialNumber });

      if (config.ocsp.cache.enabled) {
        const cached = this.cache.get(serialNumber);
        if (cached && Date.now() - cached.timestamp < config.ocsp.cache.ttl * 1000) {
          logger.debug('OCSP cache hit', { serialNumber });
          return cached.response;
        }
      }

      const certificate = await Certificate.findOne({
        where: { serialNumber }
      });

      if (!certificate) {
        const response = {
          status: 'unknown',
          serialNumber,
          message: 'Certificate not found'
        };

        this.cacheResponse(serialNumber, response);
        return response;
      }

      const revocation = await RevocationList.findOne({
        where: { serialNumber }
      });

      let response;

      if (revocation || certificate.status === 'revoked') {
        response = {
          status: 'revoked',
          serialNumber,
          revokedAt: (revocation && revocation.revokedAt) || certificate.revokedAt,
          reason: (revocation && revocation.reason) || certificate.revocationReason,
          message: 'Certificate has been revoked'
        };
      } else if (certificate.status === 'active' && !certificate.isExpired()) {
        response = {
          status: 'good',
          serialNumber,
          validUntil: certificate.notAfter,
          message: 'Certificate is valid'
        };
      } else {
        response = {
          status: 'expired',
          serialNumber,
          expiredAt: certificate.notAfter,
          message: 'Certificate has expired'
        };
      }

      this.cacheResponse(serialNumber, response);

      logger.debug('OCSP status determined', { serialNumber, status: response.status });

      return response;
    } catch (error) {
      logger.error('OCSP check failed:', error);
      throw error;
    }
  }

  /**
   * Batch OCSP check
   * @param {string[]} serialNumbers - Array of certificate serial numbers
   * @returns {Promise<Object[]>} Array of status descriptors
   */
  async checkStatusBatch(serialNumbers) {
    logger.debug('OCSP batch check', { count: serialNumbers.length });

    return Promise.all(serialNumbers.map(sn => this.checkStatus(sn)));
  }

  /**
   * Cache JSON status response
   */
  cacheResponse(serialNumber, response) {
    if (!config.ocsp.cache.enabled) return;

    this.cache.set(serialNumber, {
      response,
      timestamp: Date.now()
    });

    if (this.cache.size > 10000) {
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      entries.slice(0, 1000).forEach(([key]) => this.cache.delete(key));
    }
  }

  /**
   * Clear caches
   */
  clearCache() {
    this.cache.clear();
    this.issuerCache = { expiresAt: 0, issuers: [] };
    logger.info('OCSP cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      enabled: config.ocsp.cache.enabled,
      ttl: config.ocsp.cache.ttl
    };
  }
}

module.exports = new OCSPService();
