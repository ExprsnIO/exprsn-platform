/**
 * Certificate Authority Service
 * Handles certificate generation, validation, and revocation
 */

const forge = require('node-forge');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const database = require('../../config/database');
const redis = require('../../config/redis');
const logger = require('../../utils/logger');
const config = require('../../config');

// Paths to CA certificates
const CERTS_DIR = path.join(process.cwd(), 'certs');
const ROOT_CA_DIR = path.join(CERTS_DIR, 'root-ca');
const INTERMEDIATE_DIR = path.join(CERTS_DIR, 'intermediate');

/**
 * Load CA certificates and keys
 */
async function loadCACertificates() {
  try {
    // Load intermediate CA (used for signing)
    const intermediateCert = await fs.readFile(
      path.join(INTERMEDIATE_DIR, 'intermediate.crt'),
      'utf8'
    );
    const intermediateKey = await fs.readFile(
      path.join(INTERMEDIATE_DIR, 'intermediate.key'),
      'utf8'
    );

    // Load root CA (for chain verification)
    const rootCert = await fs.readFile(
      path.join(ROOT_CA_DIR, 'root.crt'),
      'utf8'
    );

    return {
      intermediateCert: forge.pki.certificateFromPem(intermediateCert),
      intermediateKey: forge.pki.privateKeyFromPem(intermediateKey),
      rootCert: forge.pki.certificateFromPem(rootCert),
      intermediatePem: intermediateCert,
      rootPem: rootCert,
    };
  } catch (error) {
    logger.error('Failed to load CA certificates', {
      error: error.message,
      stack: error.stack,
    });
    throw new Error('CA certificates not available');
  }
}

/**
 * Generate a new certificate
 */
async function generateCertificate(options) {
  const {
    common_name,
    organization,
    organizational_unit,
    country,
    state,
    locality,
    email,
    validity_days = 365,
    key_usage = ['digitalSignature', 'keyEncipherment'],
    extended_key_usage = ['clientAuth'],
    subject_alt_names = [],
    is_ca = false,
    path_length = null,
    profile = 'client',
    user_id = null,
  } = options;

  try {
    // Load CA certificates
    const ca = await loadCACertificates();

    // Generate key pair
    logger.info('Generating key pair');
    const keys = forge.pki.rsa.generateKeyPair(2048);

    // Create certificate
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;

    // Generate serial number
    const serialNumber = crypto.randomBytes(16).toString('hex');
    cert.serialNumber = serialNumber;

    // Set validity
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setDate(
      cert.validity.notBefore.getDate() + validity_days
    );

    // Set subject
    const subject = [
      { name: 'commonName', value: common_name },
    ];

    if (organization) {
      subject.push({ name: 'organizationName', value: organization });
    }
    if (organizational_unit) {
      subject.push({ name: 'organizationalUnitName', value: organizational_unit });
    }
    if (country) {
      subject.push({ name: 'countryName', value: country });
    }
    if (state) {
      subject.push({ name: 'stateOrProvinceName', value: state });
    }
    if (locality) {
      subject.push({ name: 'localityName', value: locality });
    }
    if (email) {
      subject.push({ name: 'emailAddress', value: email });
    }

    cert.setSubject(subject);

    // Set issuer (intermediate CA)
    cert.setIssuer(ca.intermediateCert.subject.attributes);

    // Set extensions
    const extensions = [
      {
        name: 'basicConstraints',
        cA: is_ca,
        ...(is_ca && path_length !== null && { pathLenConstraint: path_length }),
      },
      {
        name: 'keyUsage',
        ...key_usage.reduce((acc, usage) => {
          acc[usage] = true;
          return acc;
        }, {}),
      },
      {
        name: 'subjectKeyIdentifier',
      },
      {
        name: 'authorityKeyIdentifier',
      },
    ];

    // Extended key usage
    if (extended_key_usage.length > 0) {
      extensions.push({
        name: 'extKeyUsage',
        ...extended_key_usage.reduce((acc, usage) => {
          acc[usage] = true;
          return acc;
        }, {}),
      });
    }

    // Subject alternative names
    if (subject_alt_names.length > 0) {
      extensions.push({
        name: 'subjectAltName',
        altNames: subject_alt_names.map(name => {
          if (name.includes('@')) {
            return { type: 1, value: name }; // Email
          } else if (name.match(/^\d+\.\d+\.\d+\.\d+$/)) {
            return { type: 7, value: name }; // IP
          } else {
            return { type: 2, value: name }; // DNS
          }
        }),
      });
    }

    cert.setExtensions(extensions);

    // Sign certificate
    cert.sign(ca.intermediateKey, forge.md.sha256.create());

    // Convert to PEM
    const certificatePem = forge.pki.certificateToPem(cert);
    const publicKeyPem = forge.pki.publicKeyToPem(keys.publicKey);
    const privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey);

    // Calculate fingerprints
    const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    const fingerprintSha1 = crypto.createHash('sha1').update(certDer).digest('hex');
    const fingerprintSha256 = crypto.createHash('sha256').update(certDer).digest('hex');

    // Store in database
    const result = await database.query(
      `INSERT INTO certificates (
        serial_number, subject_common_name, subject_organization,
        subject_organizational_unit, subject_country, subject_state,
        subject_locality, subject_email, issuer_common_name,
        issuer_serial_number, certificate_pem, public_key_pem,
        not_before, not_after, status, key_usage, extended_key_usage,
        subject_alt_names, is_ca, path_length, profile,
        fingerprint_sha1, fingerprint_sha256, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21, $22, $23, $24
      ) RETURNING *`,
      [
        serialNumber, common_name, organization, organizational_unit,
        country, state, locality, email,
        ca.intermediateCert.subject.getField('CN').value,
        ca.intermediateCert.serialNumber,
        certificatePem, publicKeyPem,
        cert.validity.notBefore, cert.validity.notAfter,
        'active', key_usage, extended_key_usage, subject_alt_names,
        is_ca, path_length, profile,
        fingerprintSha1, fingerprintSha256, user_id,
      ]
    );

    const certRecord = result.rows[0];

    // If user_id provided, link certificate to user
    if (user_id) {
      await database.query(
        `INSERT INTO user_certificates (user_id, certificate_serial)
         VALUES ($1, $2)`,
        [user_id, serialNumber]
      );
    }

    logger.info('Certificate generated', {
      serial: serialNumber,
      commonName: common_name,
      userId: user_id,
    });

    return {
      certificate: certRecord,
      private_key: privateKeyPem,
      certificate_chain: [certificatePem, ca.intermediatePem, ca.rootPem].join('\n'),
    };
  } catch (error) {
    logger.error('Certificate generation failed', {
      error: error.message,
      stack: error.stack,
      commonName: common_name,
    });
    throw error;
  }
}

/**
 * Revoke a certificate
 */
async function revokeCertificate(serialNumber, reason, revokedBy) {
  try {
    // Update certificate status
    const result = await database.query(
      `UPDATE certificates
       SET status = 'revoked',
           revoked_at = NOW(),
           revoked_reason = $1,
           revoked_by = $2,
           updated_at = NOW()
       WHERE serial_number = $3
         AND status = 'active'
       RETURNING *`,
      [reason, revokedBy, serialNumber]
    );

    if (!result || result.rowCount === 0) {
      throw new Error('Certificate not found or already revoked');
    }

    const cert = result.rows[0];

    // Get current CRL number
    const crlResult = await database.query(
      'SELECT MAX(crl_number) as max_crl FROM crl_entries'
    );
    const crlNumber = (crlResult.rows[0].max_crl || 0) + 1;

    // Add to CRL
    await database.query(
      `INSERT INTO crl_entries (certificate_serial, revoked_at, revoked_reason, crl_number)
       VALUES ($1, NOW(), $2, $3)`,
      [serialNumber, reason, crlNumber]
    );

    // Invalidate OCSP cache
    await redis.client.del(`ocsp:${serialNumber}`);
    await database.query(
      'DELETE FROM ocsp_responses WHERE certificate_serial = $1',
      [serialNumber]
    );

    logger.info('Certificate revoked', {
      serial: serialNumber,
      reason,
      revokedBy,
    });

    return cert;
  } catch (error) {
    logger.error('Certificate revocation failed', {
      error: error.message,
      serial: serialNumber,
    });
    throw error;
  }
}

/**
 * Validate certificate
 */
async function validateCertificate(certificatePem) {
  try {
    const cert = forge.pki.certificateFromPem(certificatePem);
    const ca = await loadCACertificates();

    // Check validity dates
    const now = new Date();
    if (now < cert.validity.notBefore || now > cert.validity.notAfter) {
      return {
        valid: false,
        reason: 'Certificate is expired or not yet valid',
      };
    }

    // Verify certificate chain
    const caStore = forge.pki.createCaStore([
      ca.rootPem,
      ca.intermediatePem,
    ]);

    try {
      forge.pki.verifyCertificateChain(caStore, [cert]);
    } catch (error) {
      return {
        valid: false,
        reason: 'Certificate chain verification failed',
        error: error.message,
      };
    }

    // Check revocation status
    const serialNumber = cert.serialNumber;
    const dbResult = await database.query(
      'SELECT status FROM certificates WHERE serial_number = $1',
      [serialNumber]
    );

    if (dbResult && dbResult.rowCount > 0) {
      const status = dbResult.rows[0].status;
      if (status === 'revoked') {
        return {
          valid: false,
          reason: 'Certificate has been revoked',
        };
      }
    }

    return {
      valid: true,
      certificate: cert,
    };
  } catch (error) {
    logger.error('Certificate validation failed', {
      error: error.message,
    });

    return {
      valid: false,
      reason: 'Certificate validation error',
      error: error.message,
    };
  }
}

/**
 * Get certificate by serial number
 */
async function getCertificate(serialNumber) {
  try {
    const result = await database.query(
      'SELECT * FROM certificates WHERE serial_number = $1',
      [serialNumber]
    );

    if (!result || result.rowCount === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    logger.error('Get certificate failed', {
      error: error.message,
      serial: serialNumber,
    });
    throw error;
  }
}

/**
 * List certificates
 */
async function listCertificates(options = {}) {
  const {
    userId = null,
    status = null,
    limit = 20,
    offset = 0,
  } = options;

  try {
    let query = 'SELECT c.* FROM certificates c';
    const params = [];
    const conditions = [];

    if (userId) {
      query += ' JOIN user_certificates uc ON c.serial_number = uc.certificate_serial';
      conditions.push(`uc.user_id = $${params.length + 1}`);
      params.push(userId);
    }

    if (status) {
      conditions.push(`c.status = $${params.length + 1}`);
      params.push(status);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ` ORDER BY c.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await database.query(query, params);

    return result.rows;
  } catch (error) {
    logger.error('List certificates failed', {
      error: error.message,
    });
    throw error;
  }
}

module.exports = {
  generateCertificate,
  revokeCertificate,
  validateCertificate,
  getCertificate,
  listCertificates,
  loadCACertificates,
};
