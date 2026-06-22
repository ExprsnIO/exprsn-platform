const { EncryptionKey } = require('../models');
const encryptionService = require('./encryptionService');
const auditService = require('./auditService');
const logger = require('../utils/logger');

/**
 * Key Management Service
 * Handles encryption key lifecycle management
 */
class KeyService {
  /**
   * Create a new encryption key
   * @param {Object} data - Key data
   * @param {string} actor - User or service creating the key
   * @returns {Object} Created key (without sensitive data)
   */
  async createKey(data, actor) {
    const startTime = Date.now();

    try {
      const { name, purpose = 'general', rotationSchedule, expiresAt, metadata = {} } = data;

      // Generate new data encryption key
      const { key, encryptedKey, salt } = await encryptionService.generateDataKey();

      // Create key record
      const encryptionKey = await EncryptionKey.create({
        name,
        algorithm: 'AES-256-GCM',
        encryptedKey,
        keyDerivation: {
          algorithm: 'scrypt',
          salt,
          iterations: 32768
        },
        version: 1,
        purpose,
        rotationSchedule,
        expiresAt,
        createdBy: actor,
        status: 'active',
        metadata
      });

      // Audit log
      await auditService.log({
        action: 'create',
        resourceType: 'key',
        resourceId: encryptionKey.id,
        resourcePath: name,
        actor,
        success: true,
        duration: Date.now() - startTime,
        metadata: { purpose, version: 1 }
      });

      logger.info('Encryption key created', {
        keyId: encryptionKey.id,
        name,
        purpose,
        actor
      });

      // Return key without sensitive data
      return this.sanitizeKey(encryptionKey);
    } catch (error) {
      logger.error('Failed to create encryption key', { error: error.message, actor });

      await auditService.log({
        action: 'create',
        resourceType: 'key',
        resourcePath: data.name,
        actor,
        success: false,
        errorMessage: error.message,
        duration: Date.now() - startTime
      });

      throw error;
    }
  }

  /**
   * Get encryption key by ID
   * @param {string} keyId - Key ID
   * @param {string} actor - User or service requesting the key
   * @returns {Object} Key data
   */
  async getKey(keyId, actor) {
    const startTime = Date.now();

    try {
      const key = await EncryptionKey.findByPk(keyId);

      if (!key) {
        throw new Error('Encryption key not found');
      }

      await auditService.log({
        action: 'read',
        resourceType: 'key',
        resourceId: keyId,
        resourcePath: key.name,
        actor,
        success: true,
        duration: Date.now() - startTime
      });

      return this.sanitizeKey(key);
    } catch (error) {
      logger.error('Failed to get encryption key', { error: error.message, keyId, actor });

      await auditService.log({
        action: 'read',
        resourceType: 'key',
        resourceId: keyId,
        actor,
        success: false,
        errorMessage: error.message,
        duration: Date.now() - startTime
      });

      throw error;
    }
  }

  /**
   * Get encryption key by name
   * @param {string} name - Key name
   * @param {string} actor - User or service requesting the key
   * @returns {Object} Key data
   */
  async getKeyByName(name, actor) {
    const key = await EncryptionKey.findOne({ where: { name, status: 'active' } });

    if (!key) {
      throw new Error(`Encryption key '${name}' not found`);
    }

    return this.sanitizeKey(key);
  }

  /**
   * List all encryption keys
   * @param {Object} filters - Filter options
   * @param {string} actor - User or service requesting keys
   * @returns {Array} List of keys
   */
  async listKeys(filters = {}, actor) {
    try {
      const { status, purpose, limit = 100, offset = 0 } = filters;

      const where = {};
      if (status) where.status = status;
      if (purpose) where.purpose = purpose;

      const keys = await EncryptionKey.findAll({
        where,
        limit,
        offset,
        order: [['createdAt', 'DESC']]
      });

      return keys.map(key => this.sanitizeKey(key));
    } catch (error) {
      logger.error('Failed to list encryption keys', { error: error.message, actor });
      throw error;
    }
  }

  /**
   * Rotate an encryption key
   * @param {string} keyId - Key ID to rotate
   * @param {string} actor - User or service rotating the key
   * @returns {Object} New key
   */
  async rotateKey(keyId, actor) {
    const startTime = Date.now();

    try {
      const oldKey = await EncryptionKey.findByPk(keyId);

      if (!oldKey) {
        throw new Error('Encryption key not found');
      }

      // Mark old key as rotating
      await oldKey.update({ status: 'rotating' });

      // Generate new data encryption key
      const { key, encryptedKey, salt } = await encryptionService.generateDataKey();

      // Create new key version
      const newKey = await EncryptionKey.create({
        name: `${oldKey.name}-v${oldKey.version + 1}`,
        algorithm: oldKey.algorithm,
        encryptedKey,
        keyDerivation: {
          algorithm: 'scrypt',
          salt,
          iterations: 32768
        },
        version: oldKey.version + 1,
        purpose: oldKey.purpose,
        rotationSchedule: oldKey.rotationSchedule,
        expiresAt: oldKey.expiresAt,
        createdBy: actor,
        status: 'active',
        metadata: { ...oldKey.metadata, rotatedFrom: keyId }
      });

      // Deprecate old key
      await oldKey.update({
        status: 'deprecated',
        lastRotatedAt: new Date()
      });

      await auditService.log({
        action: 'rotate',
        resourceType: 'key',
        resourceId: keyId,
        resourcePath: oldKey.name,
        actor,
        success: true,
        duration: Date.now() - startTime,
        metadata: {
          oldVersion: oldKey.version,
          newVersion: newKey.version,
          newKeyId: newKey.id
        }
      });

      logger.info('Encryption key rotated', {
        oldKeyId: keyId,
        newKeyId: newKey.id,
        actor
      });

      return this.sanitizeKey(newKey);
    } catch (error) {
      logger.error('Failed to rotate encryption key', { error: error.message, keyId, actor });

      await auditService.log({
        action: 'rotate',
        resourceType: 'key',
        resourceId: keyId,
        actor,
        success: false,
        errorMessage: error.message,
        duration: Date.now() - startTime
      });

      throw error;
    }
  }

  /**
   * Revoke an encryption key
   * @param {string} keyId - Key ID to revoke
   * @param {string} actor - User or service revoking the key
   */
  async revokeKey(keyId, actor) {
    const startTime = Date.now();

    try {
      const key = await EncryptionKey.findByPk(keyId);

      if (!key) {
        throw new Error('Encryption key not found');
      }

      await key.update({ status: 'revoked' });

      await auditService.log({
        action: 'revoke',
        resourceType: 'key',
        resourceId: keyId,
        resourcePath: key.name,
        actor,
        success: true,
        duration: Date.now() - startTime
      });

      logger.warn('Encryption key revoked', { keyId, actor });
    } catch (error) {
      logger.error('Failed to revoke encryption key', { error: error.message, keyId, actor });

      await auditService.log({
        action: 'revoke',
        resourceType: 'key',
        resourceId: keyId,
        actor,
        success: false,
        errorMessage: error.message,
        duration: Date.now() - startTime
      });

      throw error;
    }
  }

  /**
   * Get decrypted data encryption key for internal use
   * @param {string} keyId - Key ID
   * @returns {Buffer} Decrypted DEK
   */
  async getDecryptedKey(keyId) {
    const key = await EncryptionKey.findByPk(keyId);

    if (!key) {
      throw new Error('Encryption key not found');
    }

    if (key.status !== 'active') {
      throw new Error(`Encryption key is ${key.status}`);
    }

    // Decrypt the data encryption key
    const dek = await encryptionService.decryptDataKey(
      key.encryptedKey,
      key.keyDerivation.salt
    );

    return dek;
  }

  /**
   * Remove sensitive data from key object
   * @param {Object} key - Key object
   * @returns {Object} Sanitized key
   */
  sanitizeKey(key) {
    const sanitized = key.toJSON ? key.toJSON() : key;
    delete sanitized.encryptedKey;
    delete sanitized.keyDerivation;
    return sanitized;
  }
}

module.exports = new KeyService();
