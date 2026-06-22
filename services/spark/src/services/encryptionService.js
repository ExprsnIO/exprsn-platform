/**
 * ═══════════════════════════════════════════════════════════
 * Encryption Service
 * Message Encryption Key Management
 *
 * HONESTY NOTE on E2EE: keys registered via registerClientKeyPair
 * (client-generated keypair, private key encrypted client-side) are
 * end-to-end encrypted — the server never sees the private key or the
 * password material. Keys created via generateKeyPair (legacy server-side
 * generation) are NOT true E2EE: the private key and the password-derived
 * material transit and are processed by the server.
 * ═══════════════════════════════════════════════════════════
 */

const crypto = require('crypto');
const { EncryptionKey, MessageKey } = require('../models');
const logger = require('../utils/logger');

// Legacy static PBKDF2 salt — DEPRECATED. Only used to decrypt rows
// created before per-key random salts were introduced (salt column null).
const LEGACY_PBKDF2_SALT = 'exprsn-spark-encryption-salt';

class EncryptionService {
  constructor() {
    // Algorithm constants
    this.RSA_KEY_SIZE = 4096;
    this.RSA_PUBLIC_EXPONENT = 65537;
    this.AES_ALGORITHM = 'aes-256-gcm';
    this.AES_KEY_LENGTH = 32; // 256 bits
    this.AES_IV_LENGTH = 16; // 128 bits
    this.AES_AUTH_TAG_LENGTH = 16; // 128 bits
    this.PBKDF2_SALT_LENGTH = 16; // 128 bits, per-key random salt

    // Key expiration (1 year default)
    this.DEFAULT_KEY_EXPIRY_DAYS = 365;

    // Redis cache TTL (1 hour)
    this.CACHE_TTL = 3600;
  }

  /**
   * Generate RSA key pair for a user device (LEGACY server-side generation)
   *
   * WARNING: server-side key generation is NOT end-to-end encryption — the
   * private key and the password-derived encryption material are handled by
   * the server. Prefer client-generated keypairs registered via
   * registerClientKeyPair, where the private key is encrypted on the client
   * and opaque to the server.
   *
   * @param {string} userId - User ID
   * @param {string} deviceId - Device identifier
   * @param {string} passwordHash - User's password hash for encrypting private key
   * @returns {Promise<Object>} Generated key info
   */
  async generateKeyPair(userId, deviceId, passwordHash) {
    try {
      logger.info('Generating RSA key pair', { userId, deviceId });
      logger.warn(
        'Server-side key generation in use — this is NOT E2EE. ' +
        'Clients should generate keypairs locally and register them instead.',
        { userId, deviceId }
      );

      // Generate RSA-4096 key pair
      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: this.RSA_KEY_SIZE,
        publicExponent: this.RSA_PUBLIC_EXPONENT,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem'
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem'
        }
      });

      // Per-key random PBKDF2 salt (stored alongside the encrypted key)
      const salt = crypto.randomBytes(this.PBKDF2_SALT_LENGTH).toString('hex');

      // Encrypt private key with user's password
      const encryptedPrivateKey = this._encryptPrivateKey(privateKey, passwordHash, salt);

      // Generate key fingerprint
      const keyFingerprint = this._generateKeyFingerprint(publicKey);

      // Calculate expiration date
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + this.DEFAULT_KEY_EXPIRY_DAYS);

      // Deactivate any existing active keys for this device
      await EncryptionKey.update(
        { active: false },
        {
          where: {
            userId,
            deviceId,
            active: true
          }
        }
      );

      // Store in database
      const keyRecord = await EncryptionKey.create({
        userId,
        deviceId,
        publicKey,
        encryptedPrivateKey,
        salt,
        keyFingerprint,
        keyType: 'rsa-4096',
        active: true,
        expiresAt,
        lastUsedAt: new Date(),
        metadata: { keyOrigin: 'server' }
      });

      logger.info('Key pair generated successfully', {
        userId,
        deviceId,
        keyId: keyRecord.id,
        keyFingerprint
      });

      return {
        keyId: keyRecord.id,
        publicKey,
        keyFingerprint,
        expiresAt
      };

    } catch (error) {
      logger.error('Failed to generate key pair', {
        userId,
        deviceId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Register a client-generated key pair (true E2EE)
   *
   * The client generates the RSA keypair locally and encrypts the private
   * key with locally-derived key material. The encryptedPrivateKey blob is
   * OPAQUE to the server — it is stored as-is and never decrypted here.
   *
   * @param {string} userId - User ID
   * @param {string} deviceId - Device identifier
   * @param {string} publicKey - Client-generated RSA public key (PEM, SPKI)
   * @param {string} encryptedPrivateKey - Client-encrypted private key blob (opaque)
   * @returns {Promise<Object>} Registered key info
   */
  async registerClientKeyPair(userId, deviceId, publicKey, encryptedPrivateKey) {
    try {
      logger.info('Registering client-generated key pair', { userId, deviceId });

      // Validate the public key parses as an RSA public key
      let keyObject;
      try {
        keyObject = crypto.createPublicKey(publicKey);
      } catch (error) {
        throw new Error('Invalid public key: not parseable PEM');
      }

      if (keyObject.asymmetricKeyType !== 'rsa') {
        throw new Error('Invalid public key: only RSA keys are supported');
      }

      // Generate key fingerprint
      const keyFingerprint = this._generateKeyFingerprint(publicKey);

      // Calculate expiration date
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + this.DEFAULT_KEY_EXPIRY_DAYS);

      // Deactivate any existing active keys for this device
      await EncryptionKey.update(
        { active: false },
        {
          where: {
            userId,
            deviceId,
            active: true
          }
        }
      );

      // Store in database. The encrypted private key blob is stored as-is;
      // no server-side salt applies (decryption happens on the client).
      const keyRecord = await EncryptionKey.create({
        userId,
        deviceId,
        publicKey,
        encryptedPrivateKey,
        salt: null,
        keyFingerprint,
        keyType: 'rsa-4096',
        active: true,
        expiresAt,
        lastUsedAt: new Date(),
        metadata: { keyOrigin: 'client' }
      });

      logger.info('Client key pair registered successfully', {
        userId,
        deviceId,
        keyId: keyRecord.id,
        keyFingerprint
      });

      return {
        keyId: keyRecord.id,
        publicKey,
        keyFingerprint,
        expiresAt,
        keyOrigin: 'client'
      };

    } catch (error) {
      logger.error('Failed to register client key pair', {
        userId,
        deviceId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get user's public key
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} Public key info
   */
  async getPublicKey(userId) {
    try {
      // Try cache first
      const cached = await this._getCachedPublicKey(userId);
      if (cached) {
        logger.debug('Public key cache hit', { userId });
        return cached;
      }

      // Fetch from database
      const keyRecord = await EncryptionKey.findActiveByUser(userId);

      if (!keyRecord) {
        logger.warn('No active public key found', { userId });
        return null;
      }

      const result = {
        keyId: keyRecord.id,
        publicKey: keyRecord.publicKey,
        keyFingerprint: keyRecord.keyFingerprint,
        keyType: keyRecord.keyType
      };

      // Cache it
      await this._cachePublicKey(userId, result);

      return result;

    } catch (error) {
      logger.error('Failed to get public key', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get multiple users' public keys in batch
   * @param {Array<string>} userIds - Array of user IDs
   * @returns {Promise<Object>} Map of userId to public key info
   */
  async getBatchPublicKeys(userIds) {
    try {
      const keys = await EncryptionKey.findAll({
        where: {
          userId: userIds,
          active: true
        },
        order: [['createdAt', 'DESC']]
      });

      // Create map, keeping only the most recent key per user
      const keyMap = {};
      for (const key of keys) {
        if (!keyMap[key.userId]) {
          keyMap[key.userId] = {
            keyId: key.id,
            publicKey: key.publicKey,
            keyFingerprint: key.keyFingerprint,
            keyType: key.keyType
          };
        }
      }

      return keyMap;

    } catch (error) {
      logger.error('Failed to get batch public keys', {
        userIds,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Rotate encryption key
   * @param {string} userId - User ID
   * @param {string} deviceId - Device identifier
   * @param {string} oldPasswordHash - Old password hash
   * @param {string} newPasswordHash - New password hash
   * @returns {Promise<Object>} New key info
   */
  async rotateKey(userId, deviceId, oldPasswordHash, newPasswordHash) {
    try {
      logger.info('Rotating encryption key', { userId, deviceId });

      // Verify old password by attempting to decrypt current key
      const currentKey = await EncryptionKey.findOne({
        where: {
          userId,
          deviceId,
          active: true
        }
      });

      if (!currentKey) {
        throw new Error('No active key found for this device');
      }

      // Client-generated keys are opaque to the server and cannot be
      // rotated server-side — the client must register a new keypair.
      if (currentKey.metadata && currentKey.metadata.keyOrigin === 'client') {
        throw new Error(
          'Client-generated keys cannot be rotated server-side. Register a new keypair instead.'
        );
      }

      // Verify old password (attempt to decrypt)
      try {
        this._decryptPrivateKey(
          currentKey.encryptedPrivateKey,
          oldPasswordHash,
          currentKey.salt
        );
      } catch (error) {
        throw new Error('Invalid old password');
      }

      // Mark old key as inactive
      await currentKey.deactivate();

      // Clear cache
      await this._clearCachedPublicKey(userId);

      // Generate new key pair
      return await this.generateKeyPair(userId, deviceId, newPasswordHash);

    } catch (error) {
      logger.error('Failed to rotate key', {
        userId,
        deviceId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Delete all keys for a device (logout)
   * @param {string} userId - User ID
   * @param {string} deviceId - Device identifier
   * @returns {Promise<number>} Number of keys deleted
   */
  async deleteDeviceKeys(userId, deviceId) {
    try {
      logger.info('Deleting device keys', { userId, deviceId });

      const result = await EncryptionKey.update(
        { active: false },
        {
          where: {
            userId,
            deviceId,
            active: true
          }
        }
      );

      // Clear cache
      await this._clearCachedPublicKey(userId);

      logger.info('Device keys deleted', {
        userId,
        deviceId,
        count: result[0]
      });

      return result[0];

    } catch (error) {
      logger.error('Failed to delete device keys', {
        userId,
        deviceId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get all keys for a user (all devices)
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Array of key info
   */
  async getUserKeys(userId) {
    try {
      const keys = await EncryptionKey.findAll({
        where: { userId },
        order: [['createdAt', 'DESC']],
        attributes: [
          'id',
          'deviceId',
          'keyFingerprint',
          'keyType',
          'active',
          'createdAt',
          'lastUsedAt',
          'expiresAt'
        ]
      });

      return keys.map(key => ({
        keyId: key.id,
        deviceId: key.deviceId,
        keyFingerprint: key.keyFingerprint,
        keyType: key.keyType,
        active: key.active,
        createdAt: key.createdAt,
        lastUsedAt: key.lastUsedAt,
        expiresAt: key.expiresAt,
        isExpired: key.isExpired()
      }));

    } catch (error) {
      logger.error('Failed to get user keys', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get the caller's own active key material, INCLUDING the encrypted private
   * key blob. Unlike getPublicKey/getUserKeys (which deliberately omit private
   * material), this returns the opaque encryptedPrivateKey so the owner can
   * unwrap it client-side with their passphrase on any device. Restricted to
   * the owner by the route (userId comes from the authenticated request).
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} Own key material or null if none active
   */
  async getOwnKeyMaterial(userId) {
    try {
      const keyRecord = await EncryptionKey.findActiveByUser(userId);

      if (!keyRecord) {
        return null;
      }

      return {
        keyId: keyRecord.id,
        deviceId: keyRecord.deviceId,
        publicKey: keyRecord.publicKey,
        encryptedPrivateKey: keyRecord.encryptedPrivateKey,
        keyFingerprint: keyRecord.keyFingerprint,
        keyType: keyRecord.keyType,
        keyOrigin: (keyRecord.metadata && keyRecord.metadata.keyOrigin) || 'server',
        expiresAt: keyRecord.expiresAt
      };
    } catch (error) {
      logger.error('Failed to get own key material', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Validate key ownership
   * @param {string} keyId - Key ID
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} Whether user owns the key
   */
  async validateKeyOwnership(keyId, userId) {
    try {
      const key = await EncryptionKey.findOne({
        where: { id: keyId, userId }
      });

      return !!key;

    } catch (error) {
      logger.error('Failed to validate key ownership', {
        keyId,
        userId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Store encrypted message keys for recipients
   * @param {string} messageId - Message ID
   * @param {Array<Object>} recipientKeys - Array of {userId, encryptedKey}
   * @returns {Promise<void>}
   */
  async storeMessageKeys(messageId, recipientKeys) {
    try {
      logger.info('Storing message keys', {
        messageId,
        recipientCount: recipientKeys.length
      });

      const records = recipientKeys.map(({ userId, encryptedKey }) => ({
        messageId,
        recipientId: userId,
        encryptedMessageKey: encryptedKey
      }));

      await MessageKey.bulkCreate(records);

      logger.info('Message keys stored', { messageId });

    } catch (error) {
      logger.error('Failed to store message keys', {
        messageId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get encrypted message key for a recipient
   * @param {string} messageId - Message ID
   * @param {string} userId - Recipient user ID
   * @returns {Promise<string|null>} Encrypted message key
   */
  async getMessageKey(messageId, userId) {
    try {
      const messageKey = await MessageKey.findOne({
        where: {
          messageId,
          recipientId: userId
        }
      });

      return messageKey ? messageKey.encryptedMessageKey : null;

    } catch (error) {
      logger.error('Failed to get message key', {
        messageId,
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update key last used timestamp
   * @param {string} keyId - Key ID
   * @returns {Promise<void>}
   */
  async updateKeyLastUsed(keyId) {
    try {
      await EncryptionKey.update(
        { lastUsedAt: new Date() },
        { where: { id: keyId } }
      );
    } catch (error) {
      logger.error('Failed to update key last used', {
        keyId,
        error: error.message
      });
      // Don't throw - this is non-critical
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Private Helper Methods
  // ═══════════════════════════════════════════════════════════

  /**
   * Derive the AES key-encryption key from the password hash and the
   * per-key salt. Rows created before per-key salts (salt = null) fall
   * back to the deprecated legacy static salt so they remain decryptable.
   * @private
   * @param {string} passwordHash - User's password hash
   * @param {string|null} saltHex - Hex-encoded per-key salt (null = legacy)
   * @returns {Buffer} Derived AES key
   */
  _deriveKeyEncryptionKey(passwordHash, saltHex) {
    let salt;

    if (saltHex) {
      salt = Buffer.from(saltHex, 'hex');
    } else {
      logger.warn(
        'DEPRECATED: encryption key row has no per-key salt — falling back to ' +
        'the legacy static PBKDF2 salt. Rotate this key to migrate it.'
      );
      salt = LEGACY_PBKDF2_SALT;
    }

    return crypto.pbkdf2Sync(
      passwordHash,
      salt,
      100000,
      this.AES_KEY_LENGTH,
      'sha256'
    );
  }

  /**
   * Encrypt private key with password-derived key
   * @private
   * @param {string} privateKey - Private key PEM
   * @param {string} passwordHash - User's password hash
   * @param {string} saltHex - Hex-encoded per-key random salt
   */
  _encryptPrivateKey(privateKey, passwordHash, saltHex) {
    // Derive AES key from password hash and per-key salt
    const key = this._deriveKeyEncryptionKey(passwordHash, saltHex);

    // Generate random IV
    const iv = crypto.randomBytes(this.AES_IV_LENGTH);

    // Create cipher
    const cipher = crypto.createCipheriv(this.AES_ALGORITHM, key, iv);

    // Encrypt
    let encrypted = cipher.update(privateKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Get auth tag
    const authTag = cipher.getAuthTag();

    // Combine IV + encrypted + auth tag
    return JSON.stringify({
      iv: iv.toString('hex'),
      encrypted,
      authTag: authTag.toString('hex')
    });
  }

  /**
   * Decrypt private key with password-derived key
   * @private
   * @param {string} encryptedData - JSON blob { iv, encrypted, authTag }
   * @param {string} passwordHash - User's password hash
   * @param {string|null} saltHex - Per-key salt (null = legacy static salt)
   */
  _decryptPrivateKey(encryptedData, passwordHash, saltHex = null) {
    const { iv, encrypted, authTag } = JSON.parse(encryptedData);

    // Derive AES key from password hash and per-key salt (legacy fallback)
    const key = this._deriveKeyEncryptionKey(passwordHash, saltHex);

    // Create decipher
    const decipher = crypto.createDecipheriv(
      this.AES_ALGORITHM,
      key,
      Buffer.from(iv, 'hex')
    );

    // Set auth tag
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    // Decrypt
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Generate key fingerprint (SHA-256 of public key)
   * @private
   */
  _generateKeyFingerprint(publicKey) {
    return crypto
      .createHash('sha256')
      .update(publicKey)
      .digest('hex');
  }

  /**
   * Cache public key in Redis
   * @private
   */
  async _cachePublicKey(userId, keyInfo) {
    try {
      const redis = require('../config').redis;
      if (!redis) return;

      const cacheKey = `publickey:${userId}`;
      await redis.setex(
        cacheKey,
        this.CACHE_TTL,
        JSON.stringify(keyInfo)
      );
    } catch (error) {
      logger.warn('Failed to cache public key', {
        userId,
        error: error.message
      });
      // Non-critical - don't throw
    }
  }

  /**
   * Get cached public key from Redis
   * @private
   */
  async _getCachedPublicKey(userId) {
    try {
      const redis = require('../config').redis;
      if (!redis) return null;

      const cacheKey = `publickey:${userId}`;
      const cached = await redis.get(cacheKey);

      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      logger.warn('Failed to get cached public key', {
        userId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Clear cached public key from Redis
   * @private
   */
  async _clearCachedPublicKey(userId) {
    try {
      const redis = require('../config').redis;
      if (!redis) return;

      const cacheKey = `publickey:${userId}`;
      await redis.del(cacheKey);
    } catch (error) {
      logger.warn('Failed to clear cached public key', {
        userId,
        error: error.message
      });
      // Non-critical - don't throw
    }
  }
}

// Export singleton instance
module.exports = new EncryptionService();
