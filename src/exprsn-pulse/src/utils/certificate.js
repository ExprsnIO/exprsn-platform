/**
 * Certificate Utility
 * Generates and manages self-signed TLS certificates for HTTPS support
 */

const fs = require('fs');
const path = require('path');
const forge = require('node-forge');
const logger = require('./logger');

const CERT_DIR = path.join(__dirname, '../../certs');
const KEY_PATH = path.join(CERT_DIR, 'server-key.pem');
const CERT_PATH = path.join(CERT_DIR, 'server-cert.pem');

/**
 * Ensure certificates directory exists
 */
function ensureCertDirectory() {
  if (!fs.existsSync(CERT_DIR)) {
    fs.mkdirSync(CERT_DIR, { recursive: true });
    logger.info('Created certificates directory', { path: CERT_DIR });
  }
}

/**
 * Check if valid certificates exist
 */
function certificatesExist() {
  return fs.existsSync(KEY_PATH) && fs.existsSync(CERT_PATH);
}

/**
 * Validate certificate is not expired
 */
function isCertificateValid() {
  try {
    if (!certificatesExist()) {
      return false;
    }

    const certPem = fs.readFileSync(CERT_PATH, 'utf8');
    const cert = forge.pki.certificateFromPem(certPem);

    // Check if certificate is expired
    const now = new Date();
    if (now < cert.validity.notBefore || now > cert.validity.notAfter) {
      logger.warn('Certificate expired or not yet valid', {
        notBefore: cert.validity.notBefore,
        notAfter: cert.validity.notAfter
      });
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Error validating certificate', { error: error.message });
    return false;
  }
}

/**
 * Generate self-signed certificate
 */
function generateSelfSignedCertificate() {
  try {
    logger.info('Generating self-signed TLS certificate...');

    // Generate RSA key pair (2048-bit)
    const keys = forge.pki.rsa.generateKeyPair(2048);

    // Create certificate
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';

    // Set validity period (1 year)
    const now = new Date();
    cert.validity.notBefore = now;
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 1);

    // Set certificate attributes
    const attrs = [
      { name: 'commonName', value: process.env.TLS_COMMON_NAME || 'localhost' },
      { name: 'countryName', value: process.env.TLS_COUNTRY || 'US' },
      { shortName: 'ST', value: process.env.TLS_STATE || 'California' },
      { name: 'localityName', value: process.env.TLS_LOCALITY || 'San Francisco' },
      { name: 'organizationName', value: process.env.TLS_ORG || 'Exprsn Pulse' },
      { shortName: 'OU', value: process.env.TLS_OU || 'Analytics' }
    ];

    cert.setSubject(attrs);
    cert.setIssuer(attrs);

    // Set extensions for a self-signed certificate
    cert.setExtensions([
      {
        name: 'basicConstraints',
        cA: true
      },
      {
        name: 'keyUsage',
        keyCertSign: true,
        digitalSignature: true,
        nonRepudiation: true,
        keyEncipherment: true,
        dataEncipherment: true
      },
      {
        name: 'extKeyUsage',
        serverAuth: true,
        clientAuth: true,
        codeSigning: true,
        emailProtection: true,
        timeStamping: true
      },
      {
        name: 'nsCertType',
        server: true,
        client: true
      },
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 2, value: '*.localhost' },
          { type: 7, ip: '127.0.0.1' },
          { type: 7, ip: '::1' }
        ]
      },
      {
        name: 'subjectKeyIdentifier'
      }
    ]);

    // Self-sign certificate
    cert.sign(keys.privateKey, forge.md.sha256.create());

    // Convert to PEM format
    const certPem = forge.pki.certificateToPem(cert);
    const keyPem = forge.pki.privateKeyToPem(keys.privateKey);

    // Ensure directory exists
    ensureCertDirectory();

    // Write certificate and key to files
    fs.writeFileSync(CERT_PATH, certPem, { mode: 0o600 });
    fs.writeFileSync(KEY_PATH, keyPem, { mode: 0o600 });

    logger.info('Self-signed TLS certificate generated successfully', {
      certPath: CERT_PATH,
      keyPath: KEY_PATH,
      validUntil: cert.validity.notAfter.toISOString()
    });

    return {
      cert: certPem,
      key: keyPem,
      certPath: CERT_PATH,
      keyPath: KEY_PATH
    };
  } catch (error) {
    logger.error('Failed to generate self-signed certificate', { error: error.message });
    throw error;
  }
}

/**
 * Load existing certificates or generate new ones
 */
function getCertificates() {
  // Check for custom certificate paths from environment
  const customKeyPath = process.env.TLS_KEY_PATH;
  const customCertPath = process.env.TLS_CERT_PATH;

  if (customKeyPath && customCertPath) {
    // Use custom certificates
    if (fs.existsSync(customKeyPath) && fs.existsSync(customCertPath)) {
      logger.info('Using custom TLS certificates', {
        keyPath: customKeyPath,
        certPath: customCertPath
      });

      return {
        key: fs.readFileSync(customKeyPath, 'utf8'),
        cert: fs.readFileSync(customCertPath, 'utf8'),
        keyPath: customKeyPath,
        certPath: customCertPath
      };
    } else {
      logger.warn('Custom certificate paths specified but files not found, generating self-signed');
    }
  }

  // Check if valid auto-generated certificates exist
  if (isCertificateValid()) {
    logger.info('Using existing self-signed TLS certificates', {
      certPath: CERT_PATH,
      keyPath: KEY_PATH
    });

    return {
      key: fs.readFileSync(KEY_PATH, 'utf8'),
      cert: fs.readFileSync(CERT_PATH, 'utf8'),
      keyPath: KEY_PATH,
      certPath: CERT_PATH
    };
  }

  // Generate new self-signed certificate
  return generateSelfSignedCertificate();
}

/**
 * Get certificate information
 */
function getCertificateInfo() {
  try {
    if (!certificatesExist()) {
      return null;
    }

    const certPem = fs.readFileSync(CERT_PATH, 'utf8');
    const cert = forge.pki.certificateFromPem(certPem);

    return {
      subject: cert.subject.attributes.reduce((acc, attr) => {
        acc[attr.name || attr.shortName] = attr.value;
        return acc;
      }, {}),
      issuer: cert.issuer.attributes.reduce((acc, attr) => {
        acc[attr.name || attr.shortName] = attr.value;
        return acc;
      }, {}),
      validity: {
        notBefore: cert.validity.notBefore,
        notAfter: cert.validity.notAfter
      },
      serialNumber: cert.serialNumber,
      fingerprint: forge.md.sha256.create()
        .update(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes())
        .digest()
        .toHex()
    };
  } catch (error) {
    logger.error('Error reading certificate info', { error: error.message });
    return null;
  }
}

module.exports = {
  getCertificates,
  getCertificateInfo,
  certificatesExist,
  isCertificateValid,
  generateSelfSignedCertificate
};
