/**
 * ═══════════════════════════════════════════════════════════════════════
 * Certificate Service
 * ═══════════════════════════════════════════════════════════════════════
 */

const crypto = require('../crypto');
const { Certificate, AuditLog } = require('../models');
const { getStorage } = require('../storage');
const config = require('../config');
const logger = require('../utils/logger');

class CertificateService {
  /**
   * Create root CA certificate
   */
  async createRootCertificate(options, userId = null) {
    try {
      logger.info('Generating root CA certificate...', { options });

      // Generate certificate using crypto module
      const certData = await crypto.generateRootCertificate({
        commonName: options.commonName || config.ca.name,
        country: options.country || config.ca.country,
        state: options.state || config.ca.state,
        locality: options.locality || config.ca.locality,
        organization: options.organization || config.ca.organization,
        organizationalUnit: options.organizationalUnit || config.ca.organizationalUnit,
        keySize: config.ca.keySize.root,
        validityDays: config.ca.validity.root
      });

      // Save to database
      const certificate = await Certificate.create({
        serialNumber: certData.serialNumber,
        type: 'root',
        userId,
        issuerId: null, // Self-signed
        commonName: options.commonName || config.ca.name,
        organization: options.organization || config.ca.organization,
        organizationalUnit: options.organizationalUnit || config.ca.organizationalUnit,
        country: options.country || config.ca.country,
        state: options.state || config.ca.state,
        locality: options.locality || config.ca.locality,
        email: options.email || config.ca.email,
        keySize: config.ca.keySize.root,
        algorithm: 'RSA-SHA256',
        publicKey: certData.publicKey,
        certificatePem: certData.certificate,
        fingerprint: certData.fingerprint,
        notBefore: certData.notBefore,
        notAfter: certData.notAfter,
        status: 'active'
      });

      // Save to storage
      const storage = getStorage();
      await storage.saveCertificate(certificate.id, certData.certificate);
      await storage.savePrivateKey(certificate.id, certData.privateKey);

      // Update storage path
      certificate.storagePath = `certs/${certificate.id}.pem`;
      await certificate.save();

      // Audit log (non-fatal)
      try {
        await AuditLog.log({
          userId,
          action: 'certificate.create.root',
          resourceType: 'certificate',
          resourceId: certificate.id,
          status: 'success',
          severity: 'info',
          message: `Root CA certificate created: ${certificate.commonName}`,
          details: {
            serialNumber: certificate.serialNumber,
            fingerprint: certificate.fingerprint
          }
        });
      } catch (auditError) {
        logger.error('Audit logging failed (non-fatal):', auditError);
      }

      logger.info('Root CA certificate created successfully', {
        id: certificate.id,
        serialNumber: certificate.serialNumber
      });

      return certificate;
    } catch (error) {
      logger.error('Failed to create root certificate:', error);

      try {
        await AuditLog.log({
          userId,
          action: 'certificate.create.root',
          resourceType: 'certificate',
          status: 'error',
          severity: 'error',
          message: `Failed to create root CA certificate: ${error.message}`,
          details: { error: error.message }
        });
      } catch (auditError) {
        logger.error('Audit logging failed (non-fatal):', auditError);
      }

      throw error;
    }
  }

  /**
   * Create intermediate CA certificate
   */
  async createIntermediateCertificate(options, userId = null) {
    try {
      logger.info('Generating intermediate CA certificate...', { options });

      // Get issuer certificate (must be root CA)
      const issuer = await Certificate.findByPk(options.rootCertificateId);
      if (!issuer) {
        throw new Error('Root CA certificate not found');
      }

      if (issuer.type !== 'root') {
        throw new Error('Issuer must be a root CA certificate');
      }

      if (!issuer.isValid()) {
        throw new Error('Root CA certificate is not valid');
      }

      // Get issuer private key from storage
      const storage = getStorage();
      const issuerKey = await storage.getPrivateKey(issuer.id);

      // Calculate validity days from years
      const validityYears = options.validityYears || 10;
      const validityDays = validityYears * 365;

      // Generate certificate using crypto module
      const certData = await crypto.generateIntermediateCertificate({
        commonName: options.commonName || `${config.ca.name} Intermediate CA`,
        country: options.country || config.ca.country,
        state: options.state || config.ca.state,
        locality: options.locality || config.ca.locality,
        organization: options.organization || config.ca.organization,
        organizationalUnit: options.organizationalUnit || config.ca.organizationalUnit,
        keySize: config.ca.keySize.intermediate || config.ca.keySize.root,
        validityDays,
        issuerCert: issuer.certificatePem,
        issuerKey,
        pathLen: options.pathLen || 0
      });

      // Save to database
      const certificate = await Certificate.create({
        serialNumber: certData.serialNumber,
        type: 'intermediate',
        userId,
        issuerId: issuer.id,
        commonName: options.commonName || `${config.ca.name} Intermediate CA`,
        organization: options.organization || config.ca.organization,
        organizationalUnit: options.organizationalUnit || config.ca.organizationalUnit,
        country: options.country || config.ca.country,
        state: options.state || config.ca.state,
        locality: options.locality || config.ca.locality,
        email: options.email || config.ca.email,
        keySize: config.ca.keySize.intermediate || config.ca.keySize.root,
        algorithm: 'RSA-SHA256',
        publicKey: certData.publicKey,
        certificatePem: certData.certificate,
        fingerprint: certData.fingerprint,
        notBefore: certData.notBefore,
        notAfter: certData.notAfter,
        status: 'active'
      });

      // Save to storage
      await storage.saveCertificate(certificate.id, certData.certificate);
      await storage.savePrivateKey(certificate.id, certData.privateKey);

      // Update storage path
      certificate.storagePath = `certs/${certificate.id}.pem`;
      await certificate.save();

      // Audit log (non-fatal)
      try {
        await AuditLog.log({
          userId,
          action: 'certificate.create.intermediate',
          resourceType: 'certificate',
          resourceId: certificate.id,
          status: 'success',
          severity: 'info',
          message: `Intermediate CA certificate created: ${certificate.commonName}`,
          details: {
            serialNumber: certificate.serialNumber,
            fingerprint: certificate.fingerprint,
            issuerId: issuer.id
          }
        });
      } catch (auditError) {
        logger.error('Audit logging failed (non-fatal):', auditError);
      }

      logger.info('Intermediate CA certificate created successfully', {
        id: certificate.id,
        serialNumber: certificate.serialNumber
      });

      return certificate;
    } catch (error) {
      logger.error('Failed to create intermediate certificate:', error);

      try {
        await AuditLog.log({
          userId,
          action: 'certificate.create.intermediate',
          resourceType: 'certificate',
          status: 'error',
          severity: 'error',
          message: `Failed to create intermediate CA certificate: ${error.message}`,
          details: { error: error.message }
        });
      } catch (auditError) {
        logger.error('Audit logging failed (non-fatal):', auditError);
      }

      throw error;
    }
  }

  /**
   * Resolve the default issuing CA certificate for end-entity issuance.
   * Prefers an active intermediate CA (the conventional issuer), falling back
   * to the active root CA. Lets a normal user request a certificate without
   * having to know/supply an issuerId.
   * @returns {Promise<string>} Issuer certificate id
   */
  async getDefaultIssuerId() {
    const intermediate = await Certificate.findOne({
      where: { type: 'intermediate', status: 'active' },
      order: [['createdAt', 'DESC']]
    });
    if (intermediate && intermediate.isValid()) {
      return intermediate.id;
    }

    const root = await Certificate.findOne({
      where: { type: 'root', status: 'active' },
      order: [['createdAt', 'DESC']]
    });
    if (root && root.isValid()) {
      return root.id;
    }

    throw new Error('No active issuing CA certificate available');
  }

  /**
   * Create entity certificate (client, server, code signing)
   */
  async createEntityCertificate(options, userId) {
    try {
      logger.info('Generating entity certificate...', { type: options.type, userId });

      // Default the issuer to the platform's signing CA (intermediate, else
      // root) when the caller did not specify one.
      const issuerId = options.issuerId || await this.getDefaultIssuerId();

      // Get issuer certificate
      const issuer = await Certificate.findByPk(issuerId);
      if (!issuer) {
        throw new Error('Issuer certificate not found');
      }

      if (!issuer.isValid()) {
        throw new Error('Issuer certificate is not valid');
      }

      // Get issuer private key from storage
      const storage = getStorage();
      const issuerKey = await storage.getPrivateKey(issuer.id);

      // Generate certificate
      const certData = await crypto.generateEntityCertificate({
        commonName: options.commonName,
        country: options.country,
        state: options.state,
        locality: options.locality,
        organization: options.organization,
        organizationalUnit: options.organizationalUnit,
        email: options.email,
        subjectAltNames: options.subjectAltNames || [],
        type: options.type || 'client',
        keySize: config.ca.keySize.entity,
        validityDays: options.validityDays || config.ca.validity.entity,
        issuerCert: issuer.certificatePem,
        issuerKey
      });

      // Encrypt private key if password provided
      let privateKeyEncrypted = null;
      if (options.password) {
        privateKeyEncrypted = crypto.encryptPrivateKey(certData.privateKey, options.password);
      }

      // Save to database
      const certificate = await Certificate.create({
        serialNumber: certData.serialNumber,
        type: options.type || 'client',
        userId,
        issuerId: issuer.id,
        commonName: options.commonName,
        subjectAlternativeNames: options.subjectAltNames || [],
        organization: options.organization,
        organizationalUnit: options.organizationalUnit,
        country: options.country,
        state: options.state,
        locality: options.locality,
        email: options.email,
        keySize: config.ca.keySize.entity,
        algorithm: 'RSA-SHA256',
        publicKey: certData.publicKey,
        privateKeyEncrypted,
        certificatePem: certData.certificate,
        fingerprint: certData.fingerprint,
        notBefore: certData.notBefore,
        notAfter: certData.notAfter,
        status: 'active'
      });

      // Save to storage
      await storage.saveCertificate(certificate.id, certData.certificate);
      if (!options.password) {
        // Only save unencrypted key to storage if no password
        await storage.savePrivateKey(certificate.id, certData.privateKey);
      }

      certificate.storagePath = `certs/${certificate.id}.pem`;
      await certificate.save();

      // Audit log (non-fatal - issuance must not fail on audit hiccup)
      try {
        await AuditLog.log({
          userId,
          action: `certificate.create.${options.type || 'client'}`,
          resourceType: 'certificate',
          resourceId: certificate.id,
          status: 'success',
          severity: 'info',
          message: `${options.type} certificate created: ${certificate.commonName}`,
          details: {
            serialNumber: certificate.serialNumber,
            fingerprint: certificate.fingerprint,
            issuerId: issuer.id
          }
        });
      } catch (auditError) {
        logger.error('Audit logging failed (non-fatal):', auditError);
      }

      logger.info('Entity certificate created successfully', {
        id: certificate.id,
        type: certificate.type,
        serialNumber: certificate.serialNumber
      });

      return { certificate, privateKey: certData.privateKey };
    } catch (error) {
      logger.error('Failed to create entity certificate:', error);

      try {
        await AuditLog.log({
          userId,
          action: `certificate.create.${options.type || 'client'}`,
          resourceType: 'certificate',
          status: 'error',
          severity: 'error',
          message: `Failed to create certificate: ${error.message}`,
          details: { error: error.message, options }
        });
      } catch (auditError) {
        logger.error('Audit logging failed (non-fatal):', auditError);
      }

      throw error;
    }
  }

  /**
   * Revoke certificate
   */
  async revokeCertificate(certificateId, reason = 'unspecified', userId = null) {
    try {
      const certificate = await Certificate.findByPk(certificateId);
      if (!certificate) {
        throw new Error('Certificate not found');
      }

      if (certificate.status === 'revoked') {
        throw new Error('Certificate already revoked');
      }

      await certificate.revoke(reason);

      // Add to revocation list
      const { RevocationList } = require('../models');
      await RevocationList.create({
        certificateId: certificate.id,
        serialNumber: certificate.serialNumber,
        revokedAt: new Date(),
        reason,
        issuerId: certificate.issuerId || certificate.id
      });

      // ─── Revocation cascade (security-critical) ──────────────────────────
      // Now that the cert is marked revoked, revoke every active token it
      // signed. Best-effort: a cascade hiccup must NEVER leave the cert
      // un-revoked, so failures are logged but not re-thrown. The count is
      // attached to the returned instance (non-persisted) for the API layer.
      let revokedTokenCount = 0;
      try {
        const tokenService = require('./token');
        revokedTokenCount = await tokenService.revokeTokensByCertificateId(
          certificate.id,
          'certificate_revoked'
        );

        await AuditLog.log({
          userId,
          action: 'certificate.revoke.cascade',
          resourceType: 'certificate',
          resourceId: certificate.id,
          status: 'success',
          severity: 'warning',
          message: `Revocation cascade: ${revokedTokenCount} token(s) revoked for ${certificate.commonName}`,
          details: {
            certificateId: certificate.id,
            serialNumber: certificate.serialNumber,
            revokedTokenCount
          }
        });
      } catch (cascadeError) {
        logger.error('Token revocation cascade failed (non-fatal):', cascadeError);
        try {
          await AuditLog.log({
            userId,
            action: 'certificate.revoke.cascade',
            resourceType: 'certificate',
            resourceId: certificate.id,
            status: 'error',
            severity: 'error',
            message: `Revocation cascade failed for ${certificate.commonName}: ${cascadeError.message}`,
            details: { certificateId: certificate.id, error: cascadeError.message }
          });
        } catch (auditError) {
          logger.error('Audit logging failed (non-fatal):', auditError);
        }
      }
      certificate.revokedTokenCount = revokedTokenCount;

      // Audit log
      await AuditLog.log({
        userId,
        action: 'certificate.revoke',
        resourceType: 'certificate',
        resourceId: certificate.id,
        status: 'success',
        severity: 'warning',
        message: `Certificate revoked: ${certificate.commonName}`,
        details: {
          serialNumber: certificate.serialNumber,
          reason
        }
      });

      logger.info('Certificate revoked', {
        id: certificate.id,
        serialNumber: certificate.serialNumber,
        reason,
        revokedTokenCount
      });

      // Trigger CRL update
      await require('./crl').updateCRL();

      return certificate;
    } catch (error) {
      logger.error('Failed to revoke certificate:', error);
      throw error;
    }
  }

  /**
   * Get certificate by ID
   */
  async getCertificate(certificateId) {
    return await Certificate.findByPk(certificateId, {
      include: [
        { association: 'user', attributes: ['id', 'email', 'username'] },
        { association: 'issuer', attributes: ['id', 'commonName', 'serialNumber'] }
      ]
    });
  }

  /**
   * List certificates
   */
  async listCertificates(filters = {}) {
    const where = {};

    if (filters.userId) where.userId = filters.userId;
    if (filters.type) where.type = filters.type;
    if (filters.status) where.status = filters.status;

    return await Certificate.findAll({
      where,
      include: [
        { association: 'user', attributes: ['id', 'email', 'username'] },
        { association: 'issuer', attributes: ['id', 'commonName', 'serialNumber'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: filters.limit || 50
    });
  }

  /**
   * Process Certificate Signing Request (CSR)
   */
  async processCsr(csrPem, options, userId) {
    try {
      logger.info('Processing CSR...', { userId });

      // Get issuer certificate
      const issuer = await Certificate.findByPk(options.issuerId);
      if (!issuer) {
        throw new Error('Issuer certificate not found');
      }

      if (!issuer.isValid()) {
        throw new Error('Issuer certificate is not valid');
      }

      // Get issuer private key from storage
      const storage = getStorage();
      const issuerKey = await storage.getPrivateKey(issuer.id);

      // Sign CSR using crypto module
      const certData = await crypto.signCertificateRequest({
        csrPem,
        type: options.type || 'client',
        validityDays: options.validityDays || config.ca.validity.entity,
        issuerCert: issuer.certificatePem,
        issuerKey
      });

      // Save to database
      const certificate = await Certificate.create({
        serialNumber: certData.serialNumber,
        type: options.type || 'client',
        userId,
        issuerId: issuer.id,
        commonName: certData.subject.commonName,
        subjectAlternativeNames: certData.subjectAlternativeNames || [],
        organization: certData.subject.organization,
        organizationalUnit: certData.subject.organizationalUnit,
        country: certData.subject.country,
        state: certData.subject.state,
        locality: certData.subject.locality,
        email: certData.subject.email,
        keySize: certData.keySize,
        algorithm: 'RSA-SHA256',
        publicKey: certData.publicKey,
        certificatePem: certData.certificate,
        fingerprint: certData.fingerprint,
        notBefore: certData.notBefore,
        notAfter: certData.notAfter,
        status: 'active'
      });

      // Save to storage
      await storage.saveCertificate(certificate.id, certData.certificate);

      certificate.storagePath = `certs/${certificate.id}.pem`;
      await certificate.save();

      // Audit log
      await AuditLog.log({
        userId,
        action: 'certificate.csr.process',
        resourceType: 'certificate',
        resourceId: certificate.id,
        status: 'success',
        severity: 'info',
        message: `CSR processed and certificate issued: ${certificate.commonName}`,
        details: {
          serialNumber: certificate.serialNumber,
          fingerprint: certificate.fingerprint,
          issuerId: issuer.id
        }
      });

      logger.info('CSR processed successfully', {
        id: certificate.id,
        serialNumber: certificate.serialNumber
      });

      return certificate;
    } catch (error) {
      logger.error('Failed to process CSR:', error);

      await AuditLog.log({
        userId,
        action: 'certificate.csr.process',
        resourceType: 'certificate',
        status: 'error',
        severity: 'error',
        message: `Failed to process CSR: ${error.message}`,
        details: { error: error.message }
      });

      throw error;
    }
  }

  /**
   * Renew certificate
   */
  async renewCertificate(certificateId, options, userId) {
    try {
      logger.info('Renewing certificate...', { certificateId, userId });

      // Get existing certificate
      const oldCert = await Certificate.findByPk(certificateId);
      if (!oldCert) {
        throw new Error('Certificate not found');
      }

      // Get issuer certificate
      const issuer = await Certificate.findByPk(oldCert.issuerId);
      if (!issuer) {
        throw new Error('Issuer certificate not found');
      }

      if (!issuer.isValid()) {
        throw new Error('Issuer certificate is not valid');
      }

      // Get issuer private key from storage
      const storage = getStorage();
      const issuerKey = await storage.getPrivateKey(issuer.id);

      // Generate new certificate with same subject but new validity
      const certData = await crypto.generateEntityCertificate({
        commonName: oldCert.commonName,
        country: oldCert.country,
        state: oldCert.state,
        locality: oldCert.locality,
        organization: oldCert.organization,
        organizationalUnit: oldCert.organizationalUnit,
        email: oldCert.email,
        subjectAltNames: oldCert.subjectAlternativeNames || [],
        type: oldCert.type,
        keySize: options.keySize || oldCert.keySize,
        validityDays: options.validityDays || config.ca.validity.entity,
        issuerCert: issuer.certificatePem,
        issuerKey
      });

      // Save new certificate to database
      const newCert = await Certificate.create({
        serialNumber: certData.serialNumber,
        type: oldCert.type,
        userId,
        issuerId: issuer.id,
        commonName: oldCert.commonName,
        subjectAlternativeNames: oldCert.subjectAlternativeNames || [],
        organization: oldCert.organization,
        organizationalUnit: oldCert.organizationalUnit,
        country: oldCert.country,
        state: oldCert.state,
        locality: oldCert.locality,
        email: oldCert.email,
        keySize: options.keySize || oldCert.keySize,
        algorithm: 'RSA-SHA256',
        publicKey: certData.publicKey,
        certificatePem: certData.certificate,
        fingerprint: certData.fingerprint,
        notBefore: certData.notBefore,
        notAfter: certData.notAfter,
        status: 'active'
      });

      // Save to storage
      await storage.saveCertificate(newCert.id, certData.certificate);
      await storage.savePrivateKey(newCert.id, certData.privateKey);

      newCert.storagePath = `certs/${newCert.id}.pem`;
      await newCert.save();

      // Revoke old certificate
      await oldCert.revoke('superseded');

      // Audit log
      await AuditLog.log({
        userId,
        action: 'certificate.renew',
        resourceType: 'certificate',
        resourceId: newCert.id,
        status: 'success',
        severity: 'info',
        message: `Certificate renewed: ${newCert.commonName}`,
        details: {
          oldCertificateId: oldCert.id,
          oldSerialNumber: oldCert.serialNumber,
          newSerialNumber: newCert.serialNumber,
          newFingerprint: newCert.fingerprint
        }
      });

      logger.info('Certificate renewed successfully', {
        oldId: oldCert.id,
        newId: newCert.id,
        newSerialNumber: newCert.serialNumber
      });

      return { certificate: newCert, privateKey: certData.privateKey };
    } catch (error) {
      logger.error('Failed to renew certificate:', error);

      await AuditLog.log({
        userId,
        action: 'certificate.renew',
        resourceType: 'certificate',
        resourceId: certificateId,
        status: 'error',
        severity: 'error',
        message: `Failed to renew certificate: ${error.message}`,
        details: { error: error.message }
      });

      throw error;
    }
  }

  /**
   * Get certificate chain
   */
  async getCertificateChain(certificateId) {
    try {
      const chain = [];
      let currentCert = await Certificate.findByPk(certificateId);

      if (!currentCert) {
        throw new Error('Certificate not found');
      }

      // Build chain from entity cert up to root
      while (currentCert) {
        chain.push({
          id: currentCert.id,
          serialNumber: currentCert.serialNumber,
          commonName: currentCert.commonName,
          type: currentCert.type,
          fingerprint: currentCert.fingerprint,
          notBefore: currentCert.notBefore,
          notAfter: currentCert.notAfter,
          status: currentCert.status,
          pem: currentCert.certificatePem
        });

        // Get issuer if not self-signed
        if (currentCert.issuerId && currentCert.issuerId !== currentCert.id) {
          currentCert = await Certificate.findByPk(currentCert.issuerId);
        } else {
          // Reached root CA (self-signed)
          currentCert = null;
        }
      }

      logger.info('Certificate chain retrieved', {
        certificateId,
        chainLength: chain.length
      });

      return chain;
    } catch (error) {
      logger.error('Failed to get certificate chain:', error);
      throw error;
    }
  }
}

module.exports = new CertificateService();
