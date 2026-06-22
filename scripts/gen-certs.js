'use strict';

// Generates a self-signed cert/key for the single HTTPS edge (development).
// For production, drop real certs at certs/platform.crt / certs/platform.key
// or point TLS_CERT_PATH / TLS_KEY_PATH at them.

const forge = require('node-forge');
const fs = require('fs');
const path = require('path');

const certDir = path.join(__dirname, '../certs');
fs.mkdirSync(certDir, { recursive: true });

const keys = forge.pki.rsa.generateKeyPair(2048);
const cert = forge.pki.createCertificate();
cert.publicKey = keys.publicKey;
cert.serialNumber = '01';
cert.validity.notBefore = new Date();
cert.validity.notAfter = new Date();
cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 2);

const attrs = [
  { name: 'commonName', value: 'exprsn.local' },
  { name: 'organizationName', value: 'Exprsn Platform' },
];
cert.setSubject(attrs);
cert.setIssuer(attrs);
cert.setExtensions([
  { name: 'basicConstraints', cA: true },
  { name: 'subjectAltName', altNames: [
    { type: 2, value: 'exprsn.local' },
    { type: 2, value: '*.exprsn.local' },
    { type: 2, value: 'localhost' },
    { type: 7, ip: '127.0.0.1' },
  ] },
]);
cert.sign(keys.privateKey, forge.md.sha256.create());

fs.writeFileSync(path.join(certDir, 'platform.key'), forge.pki.privateKeyToPem(keys.privateKey));
fs.writeFileSync(path.join(certDir, 'platform.crt'), forge.pki.certificateToPem(cert));
console.log('Wrote certs/platform.crt and certs/platform.key (self-signed, 2y).');
