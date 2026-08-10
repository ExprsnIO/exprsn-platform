/**
 * Certificate Generation Script (Node.js)
 * Alternative to bash script for cross-platform compatibility
 */

const forge = require('node-forge');
const fs = require('fs');
const path = require('path');

const config = {
  rootCA: {
    dir: './certs/root-ca',
    keySize: 4096,
    validYears: 20,
    subject: {
      commonName: 'Exprsn Root Certificate Authority',
      countryName: 'US',
      stateOrProvinceName: 'California',
      localityName: 'San Francisco',
      organizationName: 'Exprsn',
      organizationalUnitName: 'Exprsn Root CA',
    },
  },
  intermediateCA: {
    dir: './certs/intermediate',
    keySize: 4096,
    validYears: 10,
    subject: {
      commonName: 'Exprsn Intermediate Certificate Authority',
      countryName: 'US',
      stateOrProvinceName: 'California',
      localityName: 'San Francisco',
      organizationName: 'Exprsn',
      organizationalUnitName: 'Exprsn Intermediate CA',
    },
  },
  server: {
    dir: './certs/server',
    keySize: 2048,
    validYears: 1,
    subject: {
      commonName: 'api.exprsn.local',
      countryName: 'US',
      stateOrProvinceName: 'California',
      localityName: 'San Francisco',
      organizationName: 'Exprsn',
      organizationalUnitName: 'Exprsn Server',
    },
  },
};

/**
 * Ensure directory exists
 */
function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Create Root CA
 */
function createRootCA() {
  console.log('Creating Root CA...');

  const rootKeyPath = path.join(config.rootCA.dir, 'ca.key');
  const rootCertPath = path.join(config.rootCA.dir, 'ca.crt');

  if (fs.existsSync(rootKeyPath)) {
    console.log('Root CA already exists, skipping...');
    return {
      privateKey: forge.pki.privateKeyFromPem(fs.readFileSync(rootKeyPath, 'utf8')),
      certificate: forge.pki.certificateFromPem(fs.readFileSync(rootCertPath, 'utf8')),
    };
  }

  // Generate key pair
  console.log('Generating Root CA key pair...');
  const keys = forge.pki.rsa.generateKeyPair(config.rootCA.keySize);

  // Create certificate
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + config.rootCA.validYears);

  const attrs = [];
  Object.entries(config.rootCA.subject).forEach(([name, value]) => {
    attrs.push({ name, value });
  });
  cert.setSubject(attrs);
  cert.setIssuer(attrs);

  // Add extensions
  cert.setExtensions([
    {
      name: 'basicConstraints',
      cA: true,
      critical: true,
    },
    {
      name: 'keyUsage',
      keyCertSign: true,
      cRLSign: true,
      critical: true,
    },
    {
      name: 'subjectKeyIdentifier',
    },
  ]);

  // Self-sign certificate
  cert.sign(keys.privateKey, forge.md.sha256.create());

  // Save to files
  ensureDirectory(config.rootCA.dir);
  fs.writeFileSync(rootKeyPath, forge.pki.privateKeyToPem(keys.privateKey));
  fs.writeFileSync(rootCertPath, forge.pki.certificateToPem(cert));

  console.log('✓ Root CA created');

  return { privateKey: keys.privateKey, certificate: cert };
}

/**
 * Create Intermediate CA
 */
function createIntermediateCA(rootCA) {
  console.log('Creating Intermediate CA...');

  const intermKeyPath = path.join(config.intermediateCA.dir, 'intermediate.key');
  const intermCertPath = path.join(config.intermediateCA.dir, 'intermediate.crt');

  if (fs.existsSync(intermKeyPath)) {
    console.log('Intermediate CA already exists, skipping...');
    return {
      privateKey: forge.pki.privateKeyFromPem(fs.readFileSync(intermKeyPath, 'utf8')),
      certificate: forge.pki.certificateFromPem(fs.readFileSync(intermCertPath, 'utf8')),
    };
  }

  // Generate key pair
  console.log('Generating Intermediate CA key pair...');
  const keys = forge.pki.rsa.generateKeyPair(config.intermediateCA.keySize);

  // Create certificate
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '02';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + config.intermediateCA.validYears);

  const attrs = [];
  Object.entries(config.intermediateCA.subject).forEach(([name, value]) => {
    attrs.push({ name, value });
  });
  cert.setSubject(attrs);
  cert.setIssuer(rootCA.certificate.subject.attributes);

  // Add extensions
  cert.setExtensions([
    {
      name: 'basicConstraints',
      cA: true,
      pathLenConstraint: 0,
      critical: true,
    },
    {
      name: 'keyUsage',
      keyCertSign: true,
      cRLSign: true,
      critical: true,
    },
    {
      name: 'subjectKeyIdentifier',
    },
    {
      name: 'authorityKeyIdentifier',
    },
  ]);

  // Sign with root CA
  cert.sign(rootCA.privateKey, forge.md.sha256.create());

  // Save to files
  ensureDirectory(config.intermediateCA.dir);
  fs.writeFileSync(intermKeyPath, forge.pki.privateKeyToPem(keys.privateKey));
  fs.writeFileSync(intermCertPath, forge.pki.certificateToPem(cert));

  // Create chain file
  const chainPath = path.join(config.intermediateCA.dir, 'ca-chain.crt');
  fs.writeFileSync(
    chainPath,
    forge.pki.certificateToPem(cert) + forge.pki.certificateToPem(rootCA.certificate)
  );

  console.log('✓ Intermediate CA created');

  return { privateKey: keys.privateKey, certificate: cert };
}

/**
 * Create Server Certificate
 */
function createServerCertificate(intermediateCA) {
  console.log('Creating Server Certificate...');

  const serverKeyPath = path.join(config.server.dir, 'server.key');
  const serverCertPath = path.join(config.server.dir, 'server.crt');

  if (fs.existsSync(serverKeyPath)) {
    console.log('Server certificate already exists, skipping...');
    return;
  }

  // Generate key pair
  console.log('Generating Server key pair...');
  const keys = forge.pki.rsa.generateKeyPair(config.server.keySize);

  // Create certificate
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '03';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + config.server.validYears);

  const attrs = [];
  Object.entries(config.server.subject).forEach(([name, value]) => {
    attrs.push({ name, value });
  });
  cert.setSubject(attrs);
  cert.setIssuer(intermediateCA.certificate.subject.attributes);

  // Add extensions
  cert.setExtensions([
    {
      name: 'basicConstraints',
      cA: false,
    },
    {
      name: 'keyUsage',
      digitalSignature: true,
      keyEncipherment: true,
      critical: true,
    },
    {
      name: 'extendedKeyUsage',
      serverAuth: true,
    },
    {
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: 'api.exprsn.local' },
        { type: 2, value: 'localhost' },
        { type: 7, ip: '127.0.0.1' },
      ],
    },
    {
      name: 'subjectKeyIdentifier',
    },
    {
      name: 'authorityKeyIdentifier',
    },
  ]);

  // Sign with intermediate CA
  cert.sign(intermediateCA.privateKey, forge.md.sha256.create());

  // Save to files
  ensureDirectory(config.server.dir);
  fs.writeFileSync(serverKeyPath, forge.pki.privateKeyToPem(keys.privateKey));
  fs.writeFileSync(serverCertPath, forge.pki.certificateToPem(cert));

  // Copy to nginx if directory exists
  if (fs.existsSync('./nginx/ssl')) {
    fs.copyFileSync(serverCertPath, './nginx/ssl/server.crt');
    fs.copyFileSync(serverKeyPath, './nginx/ssl/server.key');
    fs.copyFileSync('./certs/root-ca/ca.crt', './nginx/ssl/ca.crt');
    console.log('✓ Certificates copied to nginx/ssl');
  }

  console.log('✓ Server certificate created');
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('=== Exprsn Certificate Authority Setup ===\n');

    const rootCA = createRootCA();
    const intermediateCA = createIntermediateCA(rootCA);
    createServerCertificate(intermediateCA);

    console.log('\n=== Certificate Authority Setup Complete ===');
    console.log('Root CA:         ./certs/root-ca/ca.crt');
    console.log('Intermediate CA: ./certs/intermediate/intermediate.crt');
    console.log('Server Cert:     ./certs/server/server.crt');
    console.log('Server Key:      ./certs/server/server.key');
    console.log('\nNote: This is a development CA. DO NOT use in production without proper key management!');
  } catch (error) {
    console.error('Error setting up CA:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { createRootCA, createIntermediateCA, createServerCertificate };
