/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Certificate Authority - Cryptographic Operations
 * ═══════════════════════════════════════════════════════════════════════
 */

const forge = require('node-forge');
const crypto = require('crypto');
const { pki, asn1, md } = forge;

/**
 * Resolve the externally-reachable base URL of this CA.
 * @returns {string} Base URL without trailing slash
 */
function getCaBaseUrl() {
  return (process.env.CA_BASE_URL || 'https://localhost:8443/ca').replace(/\/+$/, '');
}

// ─────────────────────────────────────────────────────────────────────────
// RFC 5280 extension builders (CRL Distribution Points + AIA)
// node-forge has no value builders for these, so the extension DER is
// constructed manually with forge.asn1 and passed as { id, value }.
// ─────────────────────────────────────────────────────────────────────────

function _asn1Seq(items) {
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, items);
}

function _asn1Oid(oid) {
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(oid).getBytes());
}

/**
 * GeneralName uniformResourceIdentifier — context tag [6], primitive IA5String
 */
function _asn1UriGeneralName(uri) {
  return asn1.create(asn1.Class.CONTEXT_SPECIFIC, 6, false, uri);
}

/**
 * Build cRLDistributionPoints (OID 2.5.29.31) extension.
 *
 * CRLDistributionPoints ::= SEQUENCE OF DistributionPoint
 * DistributionPoint ::= SEQUENCE { distributionPoint [0] EXPLICIT DistributionPointName }
 * DistributionPointName ::= CHOICE { fullName [0] IMPLICIT GeneralNames }
 *
 * @param {string} crlUrl - HTTP URL of the DER CRL
 * @returns {Object} forge extension descriptor { id, critical, value }
 */
function buildCrlDistributionPointsExtension(crlUrl) {
  const fullName = asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [
    _asn1UriGeneralName(crlUrl)
  ]);
  const distributionPointName = asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [fullName]);
  const distributionPoint = _asn1Seq([distributionPointName]);
  const crlDistributionPoints = _asn1Seq([distributionPoint]);

  return {
    id: '2.5.29.31', // cRLDistributionPoints
    critical: false,
    value: asn1.toDer(crlDistributionPoints).getBytes()
  };
}

/**
 * Build authorityInfoAccess (OID 1.3.6.1.5.5.7.1.1) extension.
 *
 * AuthorityInfoAccessSyntax ::= SEQUENCE OF AccessDescription
 * AccessDescription ::= SEQUENCE { accessMethod OID, accessLocation GeneralName }
 *
 * @param {string} ocspUrl - OCSP responder URL (access method 1.3.6.1.5.5.7.48.1)
 * @param {string} [caIssuersUrl] - Optional caIssuers URL (1.3.6.1.5.5.7.48.2)
 * @returns {Object} forge extension descriptor { id, critical, value }
 */
function buildAuthorityInfoAccessExtension(ocspUrl, caIssuersUrl) {
  const accessDescriptions = [
    _asn1Seq([_asn1Oid('1.3.6.1.5.5.7.48.1'), _asn1UriGeneralName(ocspUrl)])
  ];

  if (caIssuersUrl) {
    accessDescriptions.push(
      _asn1Seq([_asn1Oid('1.3.6.1.5.5.7.48.2'), _asn1UriGeneralName(caIssuersUrl)])
    );
  }

  return {
    id: '1.3.6.1.5.5.7.1.1', // authorityInfoAccess
    critical: false,
    value: asn1.toDer(_asn1Seq(accessDescriptions)).getBytes()
  };
}

/**
 * Standard revocation-related extensions for issued certificates.
 * @param {Object} [options]
 * @param {boolean} [options.includeAia=true] - Include AIA (omit for self-signed root)
 * @returns {Object[]} Array of forge extension descriptors
 */
function buildRevocationExtensions({ includeAia = true } = {}) {
  const base = getCaBaseUrl();
  const extensions = [
    buildCrlDistributionPointsExtension(`${base}/crl/current.crl`)
  ];

  if (includeAia) {
    extensions.push(buildAuthorityInfoAccessExtension(`${base}/ocsp`));
  }

  return extensions;
}

/**
 * Generate RSA key pair
 * @param {number} keySize - Key size in bits (2048, 4096)
 * @returns {Promise<{privateKey: string, publicKey: string}>}
 */
async function generateKeyPair(keySize = 2048) {
  return new Promise((resolve, reject) => {
    pki.rsa.generateKeyPair({ bits: keySize, workers: -1 }, (err, keypair) => {
      if (err) {
        return reject(err);
      }

      const privateKeyPem = pki.privateKeyToPem(keypair.privateKey);
      const publicKeyPem = pki.publicKeyToPem(keypair.publicKey);

      resolve({
        privateKey: privateKeyPem,
        publicKey: publicKeyPem,
        privateKeyObj: keypair.privateKey,
        publicKeyObj: keypair.publicKey
      });
    });
  });
}

/**
 * Generate root CA certificate
 * @param {Object} options - Certificate options
 * @returns {Promise<{certificate: string, privateKey: string, serialNumber: string}>}
 */
async function generateRootCertificate(options) {
  const {
    commonName,
    country = 'US',
    state = 'California',
    locality = 'San Francisco',
    organization = 'Exprsn IO',
    organizationalUnit = 'Certificate Authority',
    keySize = 4096,
    validityDays = 7300 // 20 years
  } = options;

  // Generate key pair
  const { privateKeyObj, publicKeyObj, privateKey } = await generateKeyPair(keySize);

  // Create certificate
  const cert = pki.createCertificate();
  cert.publicKey = publicKeyObj;
  cert.serialNumber = generateSerialNumber();

  const notBefore = new Date();
  const notAfter = new Date();
  notAfter.setDate(notBefore.getDate() + validityDays);

  cert.validity.notBefore = notBefore;
  cert.validity.notAfter = notAfter;

  // Set subject
  const attrs = [
    { name: 'commonName', value: commonName },
    { name: 'countryName', value: country },
    { shortName: 'ST', value: state },
    { name: 'localityName', value: locality },
    { name: 'organizationName', value: organization },
    { shortName: 'OU', value: organizationalUnit }
  ];

  cert.setSubject(attrs);
  cert.setIssuer(attrs); // Self-signed

  // Extensions for root CA (CDP included; AIA omitted for self-signed root)
  cert.setExtensions([
    {
      name: 'basicConstraints',
      cA: true,
      critical: true
    },
    {
      name: 'keyUsage',
      keyCertSign: true,
      cRLSign: true,
      critical: true
    },
    {
      name: 'subjectKeyIdentifier'
    },
    {
      name: 'authorityKeyIdentifier'
    },
    ...buildRevocationExtensions({ includeAia: false })
  ]);

  // Sign certificate
  cert.sign(privateKeyObj, md.sha256.create());

  const certificatePem = pki.certificateToPem(cert);
  const fingerprint = calculateFingerprint(cert);

  return {
    certificate: certificatePem,
    certificateObj: cert,
    privateKey,
    publicKey: pki.publicKeyToPem(publicKeyObj),
    serialNumber: cert.serialNumber,
    fingerprint,
    notBefore,
    notAfter
  };
}

/**
 * Generate intermediate CA certificate
 * @param {Object} options - Certificate options
 * @returns {Promise<Object>}
 */
async function generateIntermediateCertificate(options) {
  const {
    commonName,
    country = 'US',
    state = 'California',
    locality = 'San Francisco',
    organization = 'Exprsn IO',
    organizationalUnit = 'Certificate Authority',
    keySize = 4096,
    validityDays = 3650, // 10 years
    issuerCert,
    issuerKey,
    pathLen = 0
  } = options;

  if (!issuerCert || !issuerKey) {
    throw new Error('Issuer certificate and key are required');
  }

  // Parse issuer cert and key
  const issuerCertObj = pki.certificateFromPem(issuerCert);
  const issuerKeyObj = pki.privateKeyFromPem(issuerKey);

  // Generate key pair
  const { privateKeyObj, publicKeyObj, privateKey } = await generateKeyPair(keySize);

  // Create certificate
  const cert = pki.createCertificate();
  cert.publicKey = publicKeyObj;
  cert.serialNumber = generateSerialNumber();

  const notBefore = new Date();
  const notAfter = new Date();
  notAfter.setDate(notBefore.getDate() + validityDays);

  cert.validity.notBefore = notBefore;
  cert.validity.notAfter = notAfter;

  // Set subject
  const attrs = [
    { name: 'commonName', value: commonName },
    { name: 'countryName', value: country },
    { shortName: 'ST', value: state },
    { name: 'localityName', value: locality },
    { name: 'organizationName', value: organization },
    { shortName: 'OU', value: organizationalUnit }
  ];

  cert.setSubject(attrs);
  cert.setIssuer(issuerCertObj.subject.attributes);

  // Extensions for intermediate CA
  cert.setExtensions([
    {
      name: 'basicConstraints',
      cA: true,
      pathLenConstraint: pathLen,
      critical: true
    },
    {
      name: 'keyUsage',
      keyCertSign: true,
      cRLSign: true,
      digitalSignature: true,
      critical: true
    },
    {
      name: 'subjectKeyIdentifier'
    },
    {
      name: 'authorityKeyIdentifier',
      keyIdentifier: issuerCertObj.generateSubjectKeyIdentifier().getBytes()
    },
    ...buildRevocationExtensions()
  ]);

  // Sign certificate
  cert.sign(issuerKeyObj, md.sha256.create());

  const certificatePem = pki.certificateToPem(cert);
  const fingerprint = calculateFingerprint(cert);

  return {
    certificate: certificatePem,
    certificateObj: cert,
    privateKey,
    publicKey: pki.publicKeyToPem(publicKeyObj),
    serialNumber: cert.serialNumber,
    fingerprint,
    notBefore,
    notAfter
  };
}

/**
 * Generate entity certificate (client, server, code signing)
 * @param {Object} options - Certificate options
 * @returns {Promise<Object>}
 */
async function generateEntityCertificate(options) {
  const {
    commonName,
    country,
    state,
    locality,
    organization,
    organizationalUnit,
    email,
    subjectAltNames = [],
    type = 'client', // client, server, code_signing
    keySize = 2048,
    validityDays = 365,
    issuerCert,
    issuerKey
  } = options;

  if (!issuerCert || !issuerKey) {
    throw new Error('Issuer certificate and key are required');
  }

  // Parse issuer cert and key
  const issuerCertObj = pki.certificateFromPem(issuerCert);
  const issuerKeyObj = pki.privateKeyFromPem(issuerKey);

  // Generate key pair
  const { privateKeyObj, publicKeyObj, privateKey } = await generateKeyPair(keySize);

  // Create certificate
  const cert = pki.createCertificate();
  cert.publicKey = publicKeyObj;
  cert.serialNumber = generateSerialNumber();

  const notBefore = new Date();
  const notAfter = new Date();
  notAfter.setDate(notBefore.getDate() + validityDays);

  cert.validity.notBefore = notBefore;
  cert.validity.notAfter = notAfter;

  // Set subject
  const attrs = [
    { name: 'commonName', value: commonName }
  ];

  if (country) attrs.push({ name: 'countryName', value: country });
  if (state) attrs.push({ shortName: 'ST', value: state });
  if (locality) attrs.push({ name: 'localityName', value: locality });
  if (organization) attrs.push({ name: 'organizationName', value: organization });
  if (organizationalUnit) attrs.push({ shortName: 'OU', value: organizationalUnit });
  if (email) attrs.push({ name: 'emailAddress', value: email });

  cert.setSubject(attrs);
  cert.setIssuer(issuerCertObj.subject.attributes);

  // Build extensions based on type
  const extensions = [
    {
      name: 'basicConstraints',
      cA: false,
      critical: true
    },
    {
      name: 'subjectKeyIdentifier'
    },
    {
      name: 'authorityKeyIdentifier',
      keyIdentifier: issuerCertObj.generateSubjectKeyIdentifier().getBytes()
    },
    ...buildRevocationExtensions()
  ];

  // Key usage / extended key usage based on type
  extensions.push(...buildTypeExtensions(type));

  // Add Subject Alternative Names
  if (subjectAltNames.length > 0) {
    const altNames = subjectAltNames.map(name => {
      if (name.startsWith('IP:')) {
        return { type: 7, ip: name.substring(3) };
      } else if (name.startsWith('email:')) {
        return { type: 1, value: name.substring(6) };
      } else {
        return { type: 2, value: name }; // DNS
      }
    });

    extensions.push({
      name: 'subjectAltName',
      altNames
    });
  }

  cert.setExtensions(extensions);

  // Sign certificate
  cert.sign(issuerKeyObj, md.sha256.create());

  const certificatePem = pki.certificateToPem(cert);
  const fingerprint = calculateFingerprint(cert);

  return {
    certificate: certificatePem,
    certificateObj: cert,
    privateKey,
    publicKey: pki.publicKeyToPem(publicKeyObj),
    serialNumber: cert.serialNumber,
    fingerprint,
    notBefore,
    notAfter
  };
}

/**
 * keyUsage / extKeyUsage extension descriptors for an end-entity type
 * @param {string} type - client | server | code_signing
 * @returns {Object[]} forge extension descriptors
 */
function buildTypeExtensions(type) {
  if (type === 'server') {
    return [
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
      { name: 'extKeyUsage', serverAuth: true, clientAuth: true }
    ];
  }

  if (type === 'code_signing') {
    return [
      { name: 'keyUsage', digitalSignature: true, critical: true },
      { name: 'extKeyUsage', codeSigning: true }
    ];
  }

  // Default: client
  return [
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
    { name: 'extKeyUsage', clientAuth: true }
  ];
}

/**
 * Get a subject field value from forge attributes
 */
function _getSubjectField(subject, nameOrShortName) {
  const attr =
    subject.getField({ name: nameOrShortName }) ||
    subject.getField({ shortName: nameOrShortName });
  return attr ? attr.value : null;
}

/**
 * Sign a PKCS#10 Certificate Signing Request and issue an end-entity
 * certificate (RFC 5280 conformant: SKI/AKI, keyUsage, EKU, CDP, AIA).
 *
 * Accepts either signCertificateRequest(csrPem, options) or a single
 * options object containing csrPem (the form services/certificate.js uses).
 *
 * @param {string|Object} csrPemOrOptions - CSR PEM string, or options object
 * @param {Object} [maybeOptions] - Options when first arg is a PEM string
 * @param {string} maybeOptions.issuerCert - Issuing CA certificate PEM
 * @param {string} maybeOptions.issuerKey - Issuing CA private key PEM
 * @param {string} [maybeOptions.type='client'] - client | server | code_signing
 * @param {number} [maybeOptions.validityDays=365]
 * @returns {Promise<Object>} Issued certificate data
 */
async function signCertificateRequest(csrPemOrOptions, maybeOptions) {
  const options = typeof csrPemOrOptions === 'string'
    ? { ...(maybeOptions || {}), csrPem: csrPemOrOptions }
    : (csrPemOrOptions || {});

  const {
    csrPem,
    type = 'client',
    validityDays = 365,
    issuerCert,
    issuerKey
  } = options;

  if (!csrPem) {
    throw new Error('CSR PEM is required');
  }
  if (!issuerCert || !issuerKey) {
    throw new Error('Issuer certificate and key are required');
  }

  // Parse and verify the CSR self-signature (proof-of-possession)
  const csr = pki.certificationRequestFromPem(csrPem);
  if (!csr.verify()) {
    throw new Error('CSR signature verification failed');
  }

  const issuerCertObj = typeof issuerCert === 'string'
    ? pki.certificateFromPem(issuerCert)
    : issuerCert;
  const issuerKeyObj = typeof issuerKey === 'string'
    ? pki.privateKeyFromPem(issuerKey)
    : issuerKey;

  // Create certificate from CSR
  const cert = pki.createCertificate();
  cert.publicKey = csr.publicKey;
  cert.serialNumber = generateSerialNumber();

  const notBefore = new Date();
  const notAfter = new Date();
  notAfter.setDate(notBefore.getDate() + validityDays);

  cert.validity.notBefore = notBefore;
  cert.validity.notAfter = notAfter;

  // Copy subject from CSR
  cert.setSubject(csr.subject.attributes);
  cert.setIssuer(issuerCertObj.subject.attributes);

  // Extensions: never copy CA-relevant extensions from the CSR.
  // Only the SAN extension request is honoured.
  const extensions = [
    {
      name: 'basicConstraints',
      cA: false,
      critical: true
    },
    {
      name: 'subjectKeyIdentifier'
    },
    {
      name: 'authorityKeyIdentifier',
      keyIdentifier: issuerCertObj.generateSubjectKeyIdentifier().getBytes()
    },
    ...buildRevocationExtensions(),
    ...buildTypeExtensions(type)
  ];

  // Copy SAN from the CSR extensionRequest attribute, if present
  const subjectAlternativeNames = [];
  const extensionRequest = csr.getAttribute({ name: 'extensionRequest' });
  if (extensionRequest && Array.isArray(extensionRequest.extensions)) {
    const sanExt = extensionRequest.extensions.find(
      ext => ext.name === 'subjectAltName' || ext.id === '2.5.29.17'
    );
    if (sanExt && Array.isArray(sanExt.altNames) && sanExt.altNames.length > 0) {
      extensions.push({
        name: 'subjectAltName',
        altNames: sanExt.altNames
      });

      for (const altName of sanExt.altNames) {
        if (altName.type === 7 && altName.ip) {
          subjectAlternativeNames.push(`IP:${altName.ip}`);
        } else if (altName.type === 1) {
          subjectAlternativeNames.push(`email:${altName.value}`);
        } else if (altName.value) {
          subjectAlternativeNames.push(altName.value);
        }
      }
    }
  }

  cert.setExtensions(extensions);

  // Sign with the issuing CA key
  cert.sign(issuerKeyObj, md.sha256.create());

  const certificatePem = pki.certificateToPem(cert);
  const fingerprint = calculateFingerprint(cert);

  let keySize = null;
  if (csr.publicKey && csr.publicKey.n && typeof csr.publicKey.n.bitLength === 'function') {
    keySize = csr.publicKey.n.bitLength();
  }

  return {
    certificate: certificatePem,
    certificateObj: cert,
    publicKey: pki.publicKeyToPem(csr.publicKey),
    serialNumber: cert.serialNumber,
    fingerprint,
    notBefore,
    notAfter,
    keySize,
    subject: {
      commonName: _getSubjectField(csr.subject, 'commonName'),
      organization: _getSubjectField(csr.subject, 'organizationName'),
      organizationalUnit: _getSubjectField(csr.subject, 'OU'),
      country: _getSubjectField(csr.subject, 'countryName'),
      state: _getSubjectField(csr.subject, 'ST'),
      locality: _getSubjectField(csr.subject, 'localityName'),
      email: _getSubjectField(csr.subject, 'emailAddress')
    },
    subjectAlternativeNames
  };
}

/**
 * Generate serial number for certificate
 * @returns {string} Hex serial number
 */
function generateSerialNumber() {
  const bytes = crypto.randomBytes(16);
  return bytes.toString('hex');
}

/**
 * Calculate SHA-256 fingerprint of certificate
 * @param {Object} cert - Forge certificate object
 * @returns {string} Hex fingerprint
 */
function calculateFingerprint(cert) {
  const der = asn1.toDer(pki.certificateToAsn1(cert)).getBytes();
  const hash = crypto.createHash('sha256');
  hash.update(der, 'binary');
  return hash.digest('hex');
}

/**
 * Create RSA-SHA256-PSS signature (for tokens)
 * @param {string} data - Data to sign
 * @param {string} privateKeyPem - PEM-encoded private key
 * @returns {string} Base64-encoded signature
 */
function signData(data, privateKeyPem) {
  const privateKey = pki.privateKeyFromPem(privateKeyPem);
  const digest = md.sha256.create();
  digest.update(data, 'utf8');

  // PSS padding
  const pss = forge.pss.create({
    md: forge.md.sha256.create(),
    mgf: forge.mgf.mgf1.create(forge.md.sha256.create()),
    saltLength: 32
  });

  const signature = privateKey.sign(digest, pss);
  return forge.util.encode64(signature);
}

/**
 * Verify RSA-SHA256-PSS signature
 * @param {string} data - Original data
 * @param {string} signature - Base64-encoded signature
 * @param {string} publicKeyPem - PEM-encoded public key
 * @returns {boolean} Verification result
 */
function verifySignature(data, signature, publicKeyPem) {
  try {
    const publicKey = pki.publicKeyFromPem(publicKeyPem);
    const digest = md.sha256.create();
    digest.update(data, 'utf8');

    const signatureBytes = forge.util.decode64(signature);

    // PSS padding
    const pss = forge.pss.create({
      md: forge.md.sha256.create(),
      mgf: forge.mgf.mgf1.create(forge.md.sha256.create()),
      saltLength: 32
    });

    return publicKey.verify(digest.digest().bytes(), signatureBytes, pss);
  } catch (error) {
    return false;
  }
}

/**
 * Calculate SHA-256 checksum
 * @param {Object} data - Data object to hash
 * @returns {string} Hex checksum
 */
function calculateChecksum(data) {
  // Canonical JSON serialization (sorted keys)
  const canonical = JSON.stringify(data, Object.keys(data).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Verify certificate chain
 * @param {string} certPem - Certificate to verify
 * @param {string[]} chainPems - Chain of CA certificates
 * @returns {boolean} Verification result
 */
function verifyCertificateChain(certPem, chainPems) {
  try {
    const cert = pki.certificateFromPem(certPem);
    const caStore = pki.createCaStore();

    // Add CA certificates to store
    for (const caPem of chainPems) {
      const caCert = pki.certificateFromPem(caPem);
      caStore.addCertificate(caCert);
    }

    // Verify certificate
    return pki.verifyCertificateChain(caStore, [cert]);
  } catch (error) {
    return false;
  }
}

/**
 * Encrypt private key with password
 * @param {string} privateKeyPem - PEM-encoded private key
 * @param {string} password - Encryption password
 * @returns {string} Encrypted PEM
 */
function encryptPrivateKey(privateKeyPem, password) {
  const privateKey = pki.privateKeyFromPem(privateKeyPem);
  return pki.encryptRsaPrivateKey(privateKey, password, {
    algorithm: 'aes256'
  });
}

/**
 * Decrypt private key with password
 * @param {string} encryptedPem - Encrypted PEM-encoded private key
 * @param {string} password - Decryption password
 * @returns {string} Decrypted PEM
 */
function decryptPrivateKey(encryptedPem, password) {
  const privateKey = pki.decryptRsaPrivateKey(encryptedPem, password);
  return pki.privateKeyToPem(privateKey);
}

module.exports = {
  generateKeyPair,
  generateRootCertificate,
  generateIntermediateCertificate,
  generateEntityCertificate,
  signCertificateRequest,
  getCaBaseUrl,
  buildCrlDistributionPointsExtension,
  buildAuthorityInfoAccessExtension,
  buildRevocationExtensions,
  buildTypeExtensions,
  generateSerialNumber,
  calculateFingerprint,
  signData,
  verifySignature,
  calculateChecksum,
  verifyCertificateChain,
  encryptPrivateKey,
  decryptPrivateKey
};
