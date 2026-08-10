/**
 * Encryption Service
 * Handles encryption/decryption of sensitive credentials
 * (OAuth tokens, stream keys, etc.)
 */

const crypto = require('crypto');
const logger = require('../utils/logger');

class EncryptionService {
  constructor() {
    // Use environment variable or generate a key
    const envKey = process.env.ENCRYPTION_KEY;

    if (!envKey) {
      logger.warn('ENCRYPTION_KEY not set in environment. Generating temporary key.');
      logger.warn('This key will not persist across restarts. Set ENCRYPTION_KEY in production.');
      this.key = crypto.randomBytes(32);
    } else {
      // Derive 32-byte key from environment variable
      this.key = crypto.scryptSync(envKey, 'salt', 32);
    }

    this.algorithm = 'aes-256-gcm';
    this.ivLength = 16;
    this.authTagLength = 16;
  }

  /**
   * Encrypt sensitive data
   * @param {string} plaintext - Data to encrypt
   * @returns {string} Encrypted data (base64 encoded with IV and auth tag)
   */
  encrypt(plaintext) {
    try {
      if (!plaintext) {
        return null;
      }

      // Generate random IV
      const iv = crypto.randomBytes(this.ivLength);

      // Create cipher
      const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

      // Encrypt the plaintext
      let encrypted = cipher.update(plaintext, 'utf8', 'base64');
      encrypted += cipher.final('base64');

      // Get authentication tag
      const authTag = cipher.getAuthTag();

      // Combine IV + encrypted data + auth tag
      const combined = Buffer.concat([
        iv,
        Buffer.from(encrypted, 'base64'),
        authTag
      ]);

      // Return as base64 string
      return combined.toString('base64');
    } catch (error) {
      logger.error('Encryption failed:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt encrypted data
   * @param {string} encryptedData - Encrypted data (base64 encoded)
   * @returns {string} Decrypted plaintext
   */
  decrypt(encryptedData) {
    try {
      if (!encryptedData) {
        return null;
      }

      // Convert from base64
      const combined = Buffer.from(encryptedData, 'base64');

      // Extract IV, encrypted data, and auth tag
      const iv = combined.subarray(0, this.ivLength);
      const authTag = combined.subarray(combined.length - this.authTagLength);
      const encrypted = combined.subarray(this.ivLength, combined.length - this.authTagLength);

      // Create decipher
      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
      decipher.setAuthTag(authTag);

      // Decrypt the data
      let decrypted = decipher.update(encrypted, undefined, 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      logger.error('Decryption failed:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Hash data (one-way, for stream keys that need to be compared but not revealed)
   * @param {string} data - Data to hash
   * @returns {string} Hex-encoded hash
   */
  hash(data) {
    return crypto
      .createHash('sha256')
      .update(data)
      .digest('hex');
  }

  /**
   * Generate a secure random token
   * @param {number} length - Length in bytes (default 32)
   * @returns {string} Hex-encoded random token
   */
  generateToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Encrypt OAuth tokens
   * @param {Object} tokens - Token object
   * @returns {Object} Encrypted token object
   */
  encryptTokens(tokens) {
    if (!tokens) return null;

    const encrypted = {};

    if (tokens.accessToken) {
      encrypted.accessToken = this.encrypt(tokens.accessToken);
    }

    if (tokens.refreshToken) {
      encrypted.refreshToken = this.encrypt(tokens.refreshToken);
    }

    if (tokens.expiresAt) {
      encrypted.expiresAt = tokens.expiresAt; // Don't encrypt timestamp
    }

    return encrypted;
  }

  /**
   * Decrypt OAuth tokens
   * @param {Object} encryptedTokens - Encrypted token object
   * @returns {Object} Decrypted token object
   */
  decryptTokens(encryptedTokens) {
    if (!encryptedTokens) return null;

    const decrypted = {};

    if (encryptedTokens.accessToken) {
      decrypted.accessToken = this.decrypt(encryptedTokens.accessToken);
    }

    if (encryptedTokens.refreshToken) {
      decrypted.refreshToken = this.decrypt(encryptedTokens.refreshToken);
    }

    if (encryptedTokens.expiresAt) {
      decrypted.expiresAt = encryptedTokens.expiresAt;
    }

    return decrypted;
  }

  /**
   * Check if tokens are expired
   * @param {Object} tokens - Token object with expiresAt
   * @returns {boolean} True if expired
   */
  areTokensExpired(tokens) {
    if (!tokens || !tokens.expiresAt) {
      return true;
    }

    const expiryDate = new Date(tokens.expiresAt);
    const now = new Date();

    // Add 5 minute buffer
    const bufferMs = 5 * 60 * 1000;
    return expiryDate.getTime() - bufferMs < now.getTime();
  }

  /**
   * Mask sensitive data for logging
   * @param {string} data - Sensitive data
   * @param {number} showLength - How many characters to show (default 4)
   * @returns {string} Masked data
   */
  maskSensitive(data, showLength = 4) {
    if (!data) return '';
    if (data.length <= showLength) return '***';

    const visible = data.substring(0, showLength);
    const masked = '*'.repeat(Math.min(data.length - showLength, 20));
    return `${visible}${masked}`;
  }
}

// Export singleton instance
module.exports = new EncryptionService();
