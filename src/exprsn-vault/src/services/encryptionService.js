const crypto = require('crypto');
const { promisify } = require('util');
const logger = require('../utils/logger');

const scrypt = promisify(crypto.scrypt);

/**
 * Encryption Service
 * Handles AES-256-GCM encryption/decryption with master key encryption
 */
class EncryptionService {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32; // 256 bits
    this.ivLength = 16; // 128 bits
    this.authTagLength = 16; // 128 bits
    this.saltLength = 32;
    this.masterKey = null;
    this.initMasterKey();
  }

  /**
   * Initialize or load master key from environment
   */
  initMasterKey() {
    const masterKeyHex = process.env.VAULT_MASTER_KEY;

    if (masterKeyHex) {
      this.masterKey = Buffer.from(masterKeyHex, 'hex');
      if (this.masterKey.length !== this.keyLength) {
        throw new Error('Invalid master key length. Must be 32 bytes (256 bits)');
      }
      logger.info('Master key loaded from environment');
    } else {
      // Generate new master key (in production, this should be stored securely)
      this.masterKey = crypto.randomBytes(this.keyLength);
      logger.warn('No master key found in environment. Generated new master key:', {
        key: this.masterKey.toString('hex')
      });
      logger.warn('IMPORTANT: Store this master key securely and set VAULT_MASTER_KEY environment variable');
    }
  }

  /**
   * Generate a new data encryption key (DEK)
   * @returns {Object} { key: Buffer, encryptedKey: string, salt: string }
   */
  async generateDataKey() {
    try {
      // Generate random DEK
      const dek = crypto.randomBytes(this.keyLength);

      // Encrypt DEK with master key
      const salt = crypto.randomBytes(this.saltLength);
      const encryptedKey = await this.encryptWithMasterKey(dek, salt);

      return {
        key: dek,
        encryptedKey: encryptedKey.toString('hex'),
        salt: salt.toString('hex')
      };
    } catch (error) {
      logger.error('Failed to generate data key', { error: error.message });
      throw error;
    }
  }

  /**
   * Decrypt a data encryption key using master key
   * @param {string} encryptedKeyHex - Hex-encoded encrypted key
   * @param {string} saltHex - Hex-encoded salt
   * @returns {Buffer} Decrypted key
   */
  async decryptDataKey(encryptedKeyHex, saltHex) {
    try {
      const encryptedKey = Buffer.from(encryptedKeyHex, 'hex');
      const salt = Buffer.from(saltHex, 'hex');

      return await this.decryptWithMasterKey(encryptedKey, salt);
    } catch (error) {
      logger.error('Failed to decrypt data key', { error: error.message });
      throw error;
    }
  }

  /**
   * Encrypt data with a data encryption key
   * @param {string} plaintext - Data to encrypt
   * @param {Buffer} key - Encryption key
   * @returns {Object} { encryptedData, iv, authTag }
   */
  encrypt(plaintext, key) {
    try {
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipheriv(this.algorithm, key, iv);

      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag();

      return {
        encryptedData: encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex')
      };
    } catch (error) {
      logger.error('Encryption failed', { error: error.message });
      throw new Error('Encryption failed');
    }
  }

  /**
   * Decrypt data with a data encryption key
   * @param {string} encryptedDataHex - Hex-encoded encrypted data
   * @param {string} ivHex - Hex-encoded IV
   * @param {string} authTagHex - Hex-encoded auth tag
   * @param {Buffer} key - Decryption key
   * @returns {string} Decrypted plaintext
   */
  decrypt(encryptedDataHex, ivHex, authTagHex, key) {
    try {
      const encryptedData = Buffer.from(encryptedDataHex, 'hex');
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');

      const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encryptedData, undefined, 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      logger.error('Decryption failed', { error: error.message });
      throw new Error('Decryption failed - invalid key or corrupted data');
    }
  }

  /**
   * Encrypt data encryption key with master key
   * @param {Buffer} dek - Data encryption key
   * @param {Buffer} salt - Salt for key derivation
   * @returns {Buffer} Encrypted DEK
   */
  async encryptWithMasterKey(dek, salt) {
    try {
      // Derive key from master key and salt using scrypt
      const derivedKey = await scrypt(this.masterKey, salt, this.keyLength);
      const iv = crypto.randomBytes(this.ivLength);

      const cipher = crypto.createCipheriv(this.algorithm, derivedKey, iv);
      let encrypted = cipher.update(dek);
      encrypted = Buffer.concat([encrypted, cipher.final()]);

      const authTag = cipher.getAuthTag();

      // Combine IV + encrypted data + auth tag
      return Buffer.concat([iv, encrypted, authTag]);
    } catch (error) {
      logger.error('Master key encryption failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Decrypt data encryption key with master key
   * @param {Buffer} encryptedDek - Encrypted DEK (IV + encrypted data + auth tag)
   * @param {Buffer} salt - Salt for key derivation
   * @returns {Buffer} Decrypted DEK
   */
  async decryptWithMasterKey(encryptedDek, salt) {
    try {
      // Extract IV, encrypted data, and auth tag
      const iv = encryptedDek.slice(0, this.ivLength);
      const authTag = encryptedDek.slice(-this.authTagLength);
      const encrypted = encryptedDek.slice(this.ivLength, -this.authTagLength);

      // Derive key from master key and salt
      const derivedKey = await scrypt(this.masterKey, salt, this.keyLength);

      const decipher = crypto.createDecipheriv(this.algorithm, derivedKey, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      return decrypted;
    } catch (error) {
      logger.error('Master key decryption failed', { error: error.message });
      throw new Error('Failed to decrypt with master key');
    }
  }

  /**
   * Generate a random password
   * @param {number} length - Password length
   * @param {Object} options - Password options
   * @returns {string} Random password
   */
  generatePassword(length = 32, options = {}) {
    const {
      includeUppercase = true,
      includeLowercase = true,
      includeNumbers = true,
      includeSymbols = true
    } = options;

    let charset = '';
    if (includeUppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (includeLowercase) charset += 'abcdefghijklmnopqrstuvwxyz';
    if (includeNumbers) charset += '0123456789';
    if (includeSymbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';

    if (charset.length === 0) {
      throw new Error('At least one character type must be included');
    }

    let password = '';
    const randomBytes = crypto.randomBytes(length);

    for (let i = 0; i < length; i++) {
      password += charset[randomBytes[i] % charset.length];
    }

    return password;
  }

  /**
   * Generate a random API key
   * @param {string} prefix - Optional prefix
   * @returns {string} Random API key
   */
  generateApiKey(prefix = 'vlt') {
    const randomPart = crypto.randomBytes(32).toString('base64url');
    return `${prefix}_${randomPart}`;
  }

  /**
   * Hash a password using scrypt
   * @param {string} password - Password to hash
   * @returns {Object} { hash, salt }
   */
  async hashPassword(password) {
    const salt = crypto.randomBytes(this.saltLength);
    const hash = await scrypt(password, salt, 64);

    return {
      hash: hash.toString('hex'),
      salt: salt.toString('hex')
    };
  }

  /**
   * Verify a password against a hash
   * @param {string} password - Password to verify
   * @param {string} hashHex - Stored hash
   * @param {string} saltHex - Stored salt
   * @returns {boolean} True if password matches
   */
  async verifyPassword(password, hashHex, saltHex) {
    const salt = Buffer.from(saltHex, 'hex');
    const hash = await scrypt(password, salt, 64);
    const storedHash = Buffer.from(hashHex, 'hex');

    return crypto.timingSafeEqual(hash, storedHash);
  }
}

module.exports = new EncryptionService();
