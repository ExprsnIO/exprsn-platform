/**
 * ═══════════════════════════════════════════════════════════
 * Encryption Service
 * End-to-End Encryption (E2EE) Key Management
 * ═══════════════════════════════════════════════════════════
 */

const crypto = require('crypto');
const { EncryptionKey, MessageKey } = require('../models');
const logger = require('../utils/logger');

class EncryptionService {
  constructor() {
    // Algorithm constants
    this.RSA_KEY_SIZE = 4096;
    this.RSA_PUBLIC_EXPONENT = 65537;
    this.AES_ALGORITHM = 'aes-256-gcm';
    this.AES_KEY_LENGTH = 32; // 256 bits
    this.AES_IV_LENGTH = 16; // 128 bits
    this.AES_AUTH_TAG_LENGTH = 16; // 128 bits

    // Key expiration (1 year default)
    this.DEFAULT_KEY_EXPIRY_DAYS = 365;

    // Redis cache TTL (1 hour)
    this.CACHE_TTL = 3600;
  }

  /**
   * Generate RSA key pair for a user device
   * @param {string} userId - User ID
   * @param {string} deviceId - Device identifier
   * @param {string} passwordHash - User's password hash for encrypting private key
   * @returns {Promise<Object>} Generated key info
   */
  async generateKeyPair(userId, deviceId, passwordHash) {
    try {
      logger.info('Generating RSA key pair', { userId, deviceId });

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

      // Encrypt private key with user's password
      const encryptedPrivateKey = this._encryptPrivateKey(privateKey, passwordHash);

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
        keyFingerprint,
        keyType: 'rsa-4096',
        active: true,
        expiresAt,
        lastUsedAt: new Date()
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

      // Verify old password (attempt to decrypt)
      try {
        this._decryptPrivateKey(currentKey.encryptedPrivateKey, oldPasswordHash);
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
   * Encrypt private key with password-derived key
   * @private
   */
  _encryptPrivateKey(privateKey, passwordHash) {
    // Derive AES key from password hash
    const key = crypto.pbkdf2Sync(
      passwordHash,
      'exprsn-spark-encryption-salt',
      100000,
      this.AES_KEY_LENGTH,
      'sha256'
    );

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
   */
  _decryptPrivateKey(encryptedData, passwordHash) {
    const { iv, encrypted, authTag } = JSON.parse(encryptedData);

    // Derive AES key from password hash
    const key = crypto.pbkdf2Sync(
      passwordHash,
      'exprsn-spark-encryption-salt',
      100000,
      this.AES_KEY_LENGTH,
      'sha256'
    );

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
