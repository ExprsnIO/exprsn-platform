const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Generate RSA key pair for JWT
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 4096,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem'
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem'
  }
});

// Base64 encode the keys
const privateKeyB64 = Buffer.from(privateKey).toString('base64');
const publicKeyB64 = Buffer.from(publicKey).toString('base64');

// Generate session secret
const sessionSecret = crypto.randomBytes(64).toString('hex');

// Read .env file
const envPath = path.join(__dirname, '.env');
let envContent = fs.readFileSync(envPath, 'utf8');

// Replace empty values
envContent = envContent.replace(/^JWT_PRIVATE_KEY=$/m, `JWT_PRIVATE_KEY=${privateKeyB64}`);
envContent = envContent.replace(/^JWT_PUBLIC_KEY=$/m, `JWT_PUBLIC_KEY=${publicKeyB64}`);
envContent = envContent.replace(/^SESSION_SECRET=$/m, `SESSION_SECRET=${sessionSecret}`);
// Also replace the duplicate SESSION_SECRET at line 282
envContent = envContent.split('\n').map(line => {
  if (line.startsWith('SESSION_SECRET=') && line.endsWith('SESSION_SECRET=')) {
    return `SESSION_SECRET=${sessionSecret}`;
  }
  return line;
}).join('\n');

// Write back to .env
fs.writeFileSync(envPath, envContent, 'utf8');

console.log('✓ JWT keys generated and added to .env');
console.log('✓ Session secret generated and added to .env');
console.log('\nSetup complete!');
