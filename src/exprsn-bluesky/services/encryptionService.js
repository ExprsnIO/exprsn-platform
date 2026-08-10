const crypto = require('crypto');
const { logger } = require('@exprsn/shared');

/**
 * Encryption Service
 * Provides AES-256-GCM encryption for sensitive data (private keys, secrets)
 */
class EncryptionService {
  constructor() {
    // Get encryption key from environment or generate for dev
    this.encryptionKey = this.getEncryptionKey();
    this.algorithm = 'aes-256-gcm';
    this.ivLength = 16; // 128 bits
    this.saltLength = 64;
    this.tagLength = 16; // 128 bits
    this.iterations = 100000; // PBKDF2 iterations
  }

  /**
   * Get or generate encryption key
   */
  getEncryptionKey() {
    // In production, this should come from a Key Management Service (KMS)
    // like AWS KMS, Azure Key Vault, or HashiCorp Vault
    const envKey = process.env.ENCRYPTION_KEY;

    if (!envKey) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('ENCRYPTION_KEY must be set in production');
      }

      // Development only: generate a key
      logger.warn('Using generated encryption key (development only)');
      return crypto.randomBytes(32);
    }

    // Derive key from provided string
    return crypto.pbkdf2Sync(
      envKey,
      'exprsn-bluesky-salt', // Static salt for key derivation
      this.iterations,
      32,
      'sha512'
    );
  }

  /**
   * Encrypt data using AES-256-GCM
   * @param {string} plaintext - Data to encrypt
   * @returns {string} - Base64 encoded encrypted data with IV and auth tag
   */
  encrypt(plaintext) {
    try {
      // Generate random IV
      const iv = crypto.randomBytes(this.ivLength);

      // Create cipher
      const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);

      // Encrypt data
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

      return combined.toString('base64');
    } catch (error) {
      logger.error('Encryption failed', {
        error: error.message,
        stack: error.stack
      });
      throw new Error('Encryption failed');
    }
  }

  /**
   * Decrypt data using AES-256-GCM
   * @param {string} encryptedData - Base64 encoded encrypted data
   * @returns {string} - Decrypted plaintext
   */
  decrypt(encryptedData) {
    try {
      // Decode from base64
      const combined = Buffer.from(encryptedData, 'base64');

      // Extract IV
      const iv = combined.slice(0, this.ivLength);

      // Extract auth tag
      const authTag = combined.slice(-this.tagLength);

      // Extract encrypted data
      const encrypted = combined.slice(this.ivLength, -this.tagLength);

      // Create decipher
      const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv);
      decipher.setAuthTag(authTag);

      // Decrypt data
      let decrypted = decipher.update(encrypted, null, 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      logger.error('Decryption failed', {
        error: error.message
      });
      throw new Error('Decryption failed');
    }
  }

  /**
   * Encrypt private key
   * @param {string} privateKey - PEM formatted private key
   * @returns {string} - Encrypted private key
   */
  encryptPrivateKey(privateKey) {
    return this.encrypt(privateKey);
  }

  /**
   * Decrypt private key
   * @param {string} encryptedKey - Encrypted private key
   * @returns {string} - PEM formatted private key
   */
  decryptPrivateKey(encryptedKey) {
    return this.decrypt(encryptedKey);
  }

  /**
   * Hash sensitive data (one-way)
   * @param {string} data - Data to hash
   * @returns {string} - SHA-256 hash
   */
  hash(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Generate random token
   * @param {number} length - Token length in bytes
   * @returns {string} - Hex encoded token
   */
  generateToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Compare hash (constant time)
   * @param {string} data - Data to compare
   * @param {string} hash - Hash to compare against
   * @returns {boolean} - True if match
   */
  compareHash(data, hash) {
    const dataHash = this.hash(data);
    return crypto.timingSafeEqual(
      Buffer.from(dataHash),
      Buffer.from(hash)
    );
  }

  /**
   * Encrypt with password (for user-specific encryption)
   * @param {string} plaintext - Data to encrypt
   * @param {string} password - User password
   * @returns {string} - Encrypted data with salt
   */
  encryptWithPassword(plaintext, password) {
    try {
      // Generate random salt
      const salt = crypto.randomBytes(this.saltLength);

      // Derive key from password
      const key = crypto.pbkdf2Sync(
        password,
        salt,
        this.iterations,
        32,
        'sha512'
      );

      // Generate IV
      const iv = crypto.randomBytes(this.ivLength);

      // Create cipher
      const cipher = crypto.createCipheriv(this.algorithm, key, iv);

      // Encrypt
      let encrypted = cipher.update(plaintext, 'utf8', 'base64');
      encrypted += cipher.final('base64');

      // Get auth tag
      const authTag = cipher.getAuthTag();

      // Combine salt + IV + encrypted + auth tag
      const combined = Buffer.concat([
        salt,
        iv,
        Buffer.from(encrypted, 'base64'),
        authTag
      ]);

      return combined.toString('base64');
    } catch (error) {
      logger.error('Password encryption failed', {
        error: error.message
      });
      throw new Error('Password encryption failed');
    }
  }

  /**
   * Decrypt with password
   * @param {string} encryptedData - Encrypted data with salt
   * @param {string} password - User password
   * @returns {string} - Decrypted plaintext
   */
  decryptWithPassword(encryptedData, password) {
    try {
      // Decode
      const combined = Buffer.from(encryptedData, 'base64');

      // Extract components
      const salt = combined.slice(0, this.saltLength);
      const iv = combined.slice(this.saltLength, this.saltLength + this.ivLength);
      const authTag = combined.slice(-this.tagLength);
      const encrypted = combined.slice(
        this.saltLength + this.ivLength,
        -this.tagLength
      );

      // Derive key
      const key = crypto.pbkdf2Sync(
        password,
        salt,
        this.iterations,
        32,
        'sha512'
      );

      // Create decipher
      const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
      decipher.setAuthTag(authTag);

      // Decrypt
      let decrypted = decipher.update(encrypted, null, 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      logger.error('Password decryption failed', {
        error: error.message
      });
      throw new Error('Password decryption failed');
    }
  }
}

module.exports = new EncryptionService();
