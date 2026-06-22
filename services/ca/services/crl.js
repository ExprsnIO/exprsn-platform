/**
 * ═══════════════════════════════════════════════════════════════════════
 * CRL (Certificate Revocation List) Service — RFC 5280 §5
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Generates real DER CertificateList structures (X.509 v2 CRL) signed
 * with sha256WithRSAEncryption. node-forge has no CRL builder, so the
 * structure is constructed with forge.asn1 (see ocspAsn1.js).
 *
 * The cRLNumber extension is backed by a persistent, atomically
 * incremented database counter (CrlCounter model).
 */

const forge = require('node-forge');
const { Certificate, RevocationList, CrlCounter } = require('../models');
const { getStorage } = require('../storage');
const config = require('../config');
const logger = require('../utils/logger');
const ocspAsn1 = require('./ocspAsn1');

class CRLService {
  constructor() {
    this.currentCRL = null;
    this.crlNumber = 0;
    this.updateTimer = null;
  }

  /**
   * Initialize CRL service
   */
  async initialize() {
    logger.info('Initializing CRL service...');

    // Generate initial CRL
    await this.updateCRL();

    // Schedule automatic updates
    if (config.crl.enabled && config.crl.updateInterval > 0) {
      this.updateTimer = setInterval(() => {
        this.updateCRL().catch(error => {
          logger.error('Scheduled CRL update failed:', error);
        });
      }, config.crl.updateInterval * 1000);

      logger.info(`CRL updates scheduled every ${config.crl.updateInterval} seconds`);
    }
  }

  /**
   * Update/regenerate CRL
   */
  async updateCRL() {
    try {
      logger.info('Updating CRL...');

      // Get root CA certificate (CRL signer)
      const rootCA = await Certificate.findOne({
        where: { type: 'root', status: 'active' }
      });

      if (!rootCA) {
        throw new Error('Root CA certificate not found');
      }

      // Get root CA private key
      const storage = getStorage();
      const privateKeyPem = await storage.getPrivateKey(rootCA.id);
      const caCert = forge.pki.certificateFromPem(rootCA.certificatePem);

      // Get all revoked certificates
      const revocations = await RevocationList.findAll({
        order: [['revokedAt', 'ASC']]
      });

      // Deduplicate by serial number (first revocation wins)
      const seen = new Set();
      const revokedEntries = [];
      for (const revocation of revocations) {
        const serial = (revocation.serialNumber || '').toLowerCase();
        if (!serial || seen.has(serial)) {
          continue;
        }
        seen.add(serial);

        revokedEntries.push({
          serialNumberHex: serial,
          revokedAt: new Date(revocation.revokedAt),
          reasonCode: this.getReasonCode(revocation.reason)
        });
      }

      const thisUpdate = new Date();
      const nextUpdate = new Date(thisUpdate);
      nextUpdate.setDate(nextUpdate.getDate() + config.crl.nextUpdateDays);

      // Allocate next monotonic cRLNumber (persistent, atomic)
      this.crlNumber = await CrlCounter.nextNumber(rootCA.id);

      // Build signed DER CertificateList
      const crlDerBuffer = ocspAsn1.buildCrl({
        caCert,
        caKeyPem: privateKeyPem,
        thisUpdate,
        nextUpdate,
        crlNumber: this.crlNumber,
        revoked: revokedEntries
      });

      // PEM encoding
      const crlPem = forge.pem.encode({
        type: 'X509 CRL',
        body: crlDerBuffer.toString('binary')
      });

      // Save to storage
      await storage.saveCRL(crlDerBuffer);

      this.currentCRL = {
        pem: crlPem,
        der: crlDerBuffer,
        crlNumber: this.crlNumber,
        thisUpdate,
        nextUpdate,
        revokedCount: revokedEntries.length
      };

      logger.info('CRL updated successfully', {
        crlNumber: this.crlNumber,
        revokedCount: revokedEntries.length,
        nextUpdate
      });

      return this.currentCRL;
    } catch (error) {
      logger.error('Failed to update CRL:', error);
      throw error;
    }
  }

  /**
   * Get current CRL
   * @param {string} format - 'pem' | 'der'
   */
  getCurrentCRL(format = 'pem') {
    if (!this.currentCRL) {
      throw new Error('CRL not available');
    }

    if (format === 'der') {
      return Buffer.from(this.currentCRL.der);
    }

    return this.currentCRL.pem;
  }

  /**
   * Get CRL metadata
   */
  getCRLInfo() {
    if (!this.currentCRL) {
      return null;
    }

    return {
      crlNumber: this.currentCRL.crlNumber,
      thisUpdate: this.currentCRL.thisUpdate,
      nextUpdate: this.currentCRL.nextUpdate,
      revokedCount: this.currentCRL.revokedCount,
      url: config.crl.url
    };
  }

  /**
   * Seconds until nextUpdate (for HTTP cache headers)
   */
  getSecondsUntilNextUpdate() {
    if (!this.currentCRL || !this.currentCRL.nextUpdate) {
      return 0;
    }

    return Math.max(0, Math.floor((this.currentCRL.nextUpdate.getTime() - Date.now()) / 1000));
  }

  /**
   * Map revocation reason to code
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

  /**
   * Shutdown service
   */
  shutdown() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      logger.info('CRL service shut down');
    }
  }
}

module.exports = new CRLService();
