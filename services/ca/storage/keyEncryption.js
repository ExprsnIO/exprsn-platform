/**
 * ═══════════════════════════════════════════════════════════════════════
 * Private Key Envelope Encryption (AES-256-GCM)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Encrypts private key material at rest using a master key supplied via
 * the CA_KEY_ENCRYPTION_KEY environment variable (64 hex chars / 32 bytes).
 *
 * Stored format (JSON):
 *   { v: 1, alg: 'aes-256-gcm', iv: <base64>, tag: <base64>, data: <base64> }
 *
 * Behavior when CA_KEY_ENCRYPTION_KEY is unset:
 *   - production: throws on any save/load of private keys
 *   - development: logs a prominent warning and proceeds with plaintext
 *
 * Legacy plaintext PEM files (content starting with '-----BEGIN') are still
 * readable; a warning is logged once so operators can re-encrypt them.
 */

const crypto = require('crypto');
const logger = require('../utils/logger');

const ENV_VAR = 'CA_KEY_ENCRYPTION_KEY';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

let warnedPlaintextMode = false;
let warnedLegacyPlaintext = false;

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

/**
 * Load and validate the master key from the environment
 * @returns {Buffer|null} 32-byte key buffer, or null if unset
 */
function getMasterKey() {
  const hex = process.env[ENV_VAR];
  if (!hex) {
    return null;
  }
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(`${ENV_VAR} must be exactly 64 hex characters (32 bytes)`);
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Get the master key, enforcing production policy
 * @param {string} operation - 'encryption' or 'decryption' (for messages)
 * @returns {Buffer|null} key buffer, or null in non-production plaintext mode
 */
function requireMasterKey(operation) {
  const key = getMasterKey();
  if (key) {
    return key;
  }

  if (isProduction()) {
    throw new Error(
      `${ENV_VAR} is required in production for private key ${operation}. ` +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  if (!warnedPlaintextMode) {
    warnedPlaintextMode = true;
    logger.warn('═══════════════════════════════════════════════════════════');
    logger.warn(`SECURITY WARNING: ${ENV_VAR} is not set.`);
    logger.warn('Private keys will be stored in PLAINTEXT (development only).');
    logger.warn('Set a 32-byte hex key to enable AES-256-GCM encryption at rest.');
    logger.warn('═══════════════════════════════════════════════════════════');
  }

  return null;
}

/**
 * Encrypt private key material for storage
 * @param {string} pem - PEM-encoded private key
 * @returns {string} Encrypted JSON envelope, or plaintext in dev without a key
 */
function encryptPrivateKey(pem) {
  const key = requireMasterKey('encryption');
  if (!key) {
    return pem; // Development plaintext fallback
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const data = Buffer.concat([cipher.update(pem, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return JSON.stringify({
    v: 1,
    alg: ALGORITHM,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: data.toString('base64')
  });
}

/**
 * Decrypt stored private key material
 * Detects legacy plaintext PEM content and returns it as-is (with a warning)
 * @param {string} content - Stored content (JSON envelope or legacy PEM)
 * @returns {string} PEM-encoded private key
 */
function decryptPrivateKey(content) {
  if (typeof content !== 'string') {
    content = String(content);
  }

  // Legacy plaintext PEM detection
  if (content.trimStart().startsWith('-----BEGIN')) {
    if (!warnedLegacyPlaintext) {
      warnedLegacyPlaintext = true;
      logger.warn(
        'Legacy PLAINTEXT private key encountered in storage. ' +
        'Re-save keys to encrypt them at rest with ' + ENV_VAR + '.'
      );
    }
    // In production without a key configured, refuse to operate on key material
    if (isProduction() && !getMasterKey()) {
      throw new Error(`${ENV_VAR} is required in production for private key decryption`);
    }
    return content;
  }

  let envelope;
  try {
    envelope = JSON.parse(content);
  } catch (error) {
    throw new Error('Unrecognized private key storage format');
  }

  if (!envelope || envelope.alg !== ALGORITHM || !envelope.iv || !envelope.tag || !envelope.data) {
    throw new Error('Invalid encrypted private key envelope');
  }

  const key = requireMasterKey('decryption');
  if (!key) {
    throw new Error(`${ENV_VAR} must be set to decrypt stored private keys`);
  }

  const iv = Buffer.from(envelope.iv, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');
  const data = Buffer.from(envelope.data, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

module.exports = {
  encryptPrivateKey,
  decryptPrivateKey
};
