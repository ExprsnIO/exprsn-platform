#!/usr/bin/env node
/**
 * Generate TLS Certificates for All Exprsn Services
 * Creates self-signed certificates for development use
 */

const forge = require('node-forge');
const fs = require('fs');
const path = require('path');

const CERTS_DIR = path.join(__dirname, '..', 'certs');
const SERVICES = [
  { name: 'localhost', port: 3000, service: 'exprsn-ca' },
  { name: 'localhost', port: 3001, service: 'exprsn-auth' },
  { name: 'localhost', port: 3002, service: 'exprsn-spark' },
  { name: 'localhost', port: 3004, service: 'exprsn-timeline' },
  { name: 'localhost', port: 3005, service: 'exprsn-prefetch' },
  { name: 'localhost', port: 3006, service: 'exprsn-moderator' },
  { name: 'localhost', port: 3007, service: 'exprsn-filevault' },
  { name: 'localhost', port: 3008, service: 'exprsn-gallery' },
  { name: 'localhost', port: 3009, service: 'exprsn-live' },
  { name: 'localhost', port: 3010, service: 'exprsn-bridge' },
  { name: 'localhost', port: 3011, service: 'exprsn-nexus' },
  { name: 'localhost', port: 3012, service: 'exprsn-pulse' },
  { name: 'localhost', port: 3013, service: 'exprsn-vault' },
  { name: 'localhost', port: 3014, service: 'exprsn-herald' },
  { name: 'localhost', port: 3015, service: 'exprsn-setup' },
  { name: 'localhost', port: 3017, service: 'exprsn-workflow' },
  { name: 'localhost', port: 3018, service: 'exprsn-payments' },
  { name: 'localhost', port: 3019, service: 'exprsn-atlas' },
  { name: 'localhost', port: 5001, service: 'exprsn-svr' }
];

// Ensure certs directory exists
if (!fs.existsSync(CERTS_DIR)) {
  fs.mkdirSync(CERTS_DIR, { recursive: true });
}

console.log('🔐 Generating TLS certificates for Exprsn services...\n');

// Generate CA certificate first
function generateCA() {
  console.log('📜 Generating Root CA...');

  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

  const attrs = [
    { name: 'commonName', value: 'Exprsn Root CA' },
    { name: 'countryName', value: 'US' },
    { shortName: 'ST', value: 'California' },
    { name: 'localityName', value: 'San Francisco' },
    { name: 'organizationName', value: 'Exprsn IO' },
    { shortName: 'OU', value: 'Certificate Authority' }
  ];

  cert.setSubject(attrs);
  cert.setIssuer(attrs);
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
    }
  ]);

  cert.sign(keys.privateKey, forge.md.sha256.create());

  const pem = {
    privateKey: forge.pki.privateKeyToPem(keys.privateKey),
    publicKey: forge.pki.publicKeyToPem(keys.publicKey),
    certificate: forge.pki.certificateToPem(cert)
  };

  fs.writeFileSync(path.join(CERTS_DIR, 'ca-key.pem'), pem.privateKey);
  fs.writeFileSync(path.join(CERTS_DIR, 'ca-cert.pem'), pem.certificate);

  console.log('  ✓ CA certificate generated\n');

  return { keys, cert };
}

// Generate service certificate
function generateServiceCert(service, ca) {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = Math.floor(Math.random() * 100000).toString();
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 2);

  const attrs = [
    { name: 'commonName', value: service.name },
    { name: 'countryName', value: 'US' },
    { shortName: 'ST', value: 'California' },
    { name: 'localityName', value: 'San Francisco' },
    { name: 'organizationName', value: 'Exprsn IO' },
    { shortName: 'OU', value: service.service }
  ];

  cert.setSubject(attrs);
  cert.setIssuer(ca.cert.subject.attributes);

  cert.setExtensions([
    {
      name: 'basicConstraints',
      cA: false
    },
    {
      name: 'keyUsage',
      digitalSignature: true,
      nonRepudiation: true,
      keyEncipherment: true,
      dataEncipherment: true
    },
    {
      name: 'extKeyUsage',
      serverAuth: true,
      clientAuth: true
    },
    {
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: 'localhost' },
        { type: 2, value: '*.localhost' },
        { type: 7, ip: '127.0.0.1' },
        { type: 7, ip: '::1' }
      ]
    }
  ]);

  cert.sign(ca.keys.privateKey, forge.md.sha256.create());

  return {
    privateKey: forge.pki.privateKeyToPem(keys.privateKey),
    certificate: forge.pki.certificateToPem(cert)
  };
}

// Main execution
try {
  const ca = generateCA();

  // Generate shared localhost certificate
  console.log('🔑 Generating shared localhost certificate...');
  const sharedCert = generateServiceCert(
    { name: 'localhost', service: 'shared' },
    ca
  );

  fs.writeFileSync(path.join(CERTS_DIR, 'localhost-key.pem'), sharedCert.privateKey);
  fs.writeFileSync(path.join(CERTS_DIR, 'localhost-cert.pem'), sharedCert.certificate);
  console.log('  ✓ Shared certificate generated\n');

  // Generate individual service certificates
  console.log('🔐 Generating service-specific certificates...\n');
  SERVICES.forEach(service => {
    const cert = generateServiceCert(service, ca);
    const keyPath = path.join(CERTS_DIR, `${service.service}-key.pem`);
    const certPath = path.join(CERTS_DIR, `${service.service}-cert.pem`);

    fs.writeFileSync(keyPath, cert.privateKey);
    fs.writeFileSync(certPath, cert.certificate);

    console.log(`  ✓ ${service.service} (port ${service.port})`);
  });

  console.log('\n✅ All TLS certificates generated successfully!');
  console.log(`📂 Certificates location: ${CERTS_DIR}`);
  console.log('\n⚠️  These are self-signed certificates for development only.');
  console.log('   Do NOT use in production!\n');

} catch (error) {
  console.error('❌ Error generating certificates:', error.message);
  process.exit(1);
}
