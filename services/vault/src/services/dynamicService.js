const { Lease } = require('../models');
const encryptionService = require('./encryptionService');
const keyService = require('./keyService');
const auditService = require('./auditService');
const logger = require('../utils/logger');
const crypto = require('crypto');

/**
 * Dynamic Secrets Service
 * Generates temporary credentials with TTL
 */
class DynamicService {
  /**
   * Generate dynamic database credentials
   * @param {Object} config - Database configuration
   * @param {string} actor - User or service requesting credentials
   * @returns {Object} Lease with credentials
   */
  async generateDatabaseCredentials(config, actor) {
    const startTime = Date.now();

    try {
      const {
        path,
        ttl = 3600, // 1 hour default
        maxTTL = 86400, // 24 hours max
        renewable = true,
        databaseType = 'postgresql'
      } = config;

      // Generate random username and password
      const username = `vault_${crypto.randomBytes(8).toString('hex')}`;
      const password = encryptionService.generatePassword(32, {
        includeUppercase: true,
        includeLowercase: true,
        includeNumbers: true,
        includeSymbols: false // Avoid symbols for DB compatibility
      });

      const credentialData = {
        type: 'database',
        databaseType,
        username,
        password,
        connection: config.connection || {}
      };

      // Create lease
      const lease = await this.createLease({
        secretType: 'database',
        secretPath: path,
        credentialData,
        ttl,
        maxTTL,
        renewable,
        actor
      });

      await auditService.log({
        action: 'generate',
        resourceType: 'dynamic_secret',
        resourceId: lease.id,
        resourcePath: path,
        actor,
        success: true,
        duration: Date.now() - startTime,
        metadata: { secretType: 'database', databaseType }
      });

      logger.info('Database credentials generated', {
        leaseId: lease.id,
        path,
        username,
        actor
      });

      return {
        leaseId: lease.leaseId,
        data: {
          username,
          password
        },
        ttl,
        renewable,
        expiresAt: lease.expiresAt
      };
    } catch (error) {
      logger.error('Failed to generate database credentials', {
        error: error.message,
        actor
      });

      await auditService.log({
        action: 'generate',
        resourceType: 'dynamic_secret',
        resourcePath: config.path,
        actor,
        success: false,
        errorMessage: error.message,
        duration: Date.now() - startTime
      });

      throw error;
    }
  }

  /**
   * Generate API key
   * @param {Object} config - API key configuration
   * @param {string} actor - User or service requesting API key
   * @returns {Object} Lease with API key
   */
  async generateApiKey(config, actor) {
    const startTime = Date.now();

    try {
      const {
        path,
        ttl = 3600,
        maxTTL = 86400,
        renewable = true,
        prefix = 'vlt',
        scopes = []
      } = config;

      const apiKey = encryptionService.generateApiKey(prefix);

      const credentialData = {
        type: 'api_key',
        apiKey,
        scopes
      };

      const lease = await this.createLease({
        secretType: 'api_key',
        secretPath: path,
        credentialData,
        ttl,
        maxTTL,
        renewable,
        actor
      });

      await auditService.log({
        action: 'generate',
        resourceType: 'dynamic_secret',
        resourceId: lease.id,
        resourcePath: path,
        actor,
        success: true,
        duration: Date.now() - startTime,
        metadata: { secretType: 'api_key', scopes }
      });

      logger.info('API key generated', {
        leaseId: lease.id,
        path,
        actor
      });

      return {
        leaseId: lease.leaseId,
        data: {
          apiKey,
          scopes
        },
        ttl,
        renewable,
        expiresAt: lease.expiresAt
      };
    } catch (error) {
      logger.error('Failed to generate API key', {
        error: error.message,
        actor
      });

      await auditService.log({
        action: 'generate',
        resourceType: 'dynamic_secret',
        resourcePath: config.path,
        actor,
        success: false,
        errorMessage: error.message,
        duration: Date.now() - startTime
      });

      throw error;
    }
  }

  /**
   * Create a lease record
   * @param {Object} data - Lease data
   * @returns {Object} Created lease
   */
  async createLease(data) {
    const {
      secretType,
      secretPath,
      credentialData,
      ttl,
      maxTTL,
      renewable,
      actor
    } = data;

    // Get default encryption key
    const defaultKey = await keyService.getKeyByName('default', 'system');

    // Encrypt credential data
    const dek = await keyService.getDecryptedKey(defaultKey.id);
    const { encryptedData, iv, authTag } = encryptionService.encrypt(
      JSON.stringify(credentialData),
      dek
    );

    const leaseId = `lease_${crypto.randomBytes(16).toString('hex')}`;
    const expiresAt = new Date(Date.now() + ttl * 1000);

    const lease = await Lease.create({
      leaseId,
      secretType,
      secretPath,
      credentialData: {
        encrypted: encryptedData,
        iv,
        authTag
      },
      encryptionKeyId: defaultKey.id,
      ttl,
      renewable,
      maxTTL,
      expiresAt,
      createdBy: actor,
      status: 'active'
    });

    return lease;
  }

  /**
   * Renew a lease
   * @param {string} leaseId - Lease ID
   * @param {number} increment - TTL increment in seconds
   * @param {string} actor - User or service renewing lease
   * @returns {Object} Updated lease
   */
  async renewLease(leaseId, increment, actor) {
    const startTime = Date.now();

    try {
      const lease = await Lease.findOne({ where: { leaseId, status: 'active' } });

      if (!lease) {
        throw new Error('Lease not found');
      }

      if (!lease.renewable) {
        throw new Error('Lease is not renewable');
      }

      // Check if lease has expired
      if (new Date(lease.expiresAt) < new Date()) {
        await lease.update({ status: 'expired' });
        throw new Error('Lease has expired');
      }

      // Calculate new expiration
      const newTTL = increment || lease.ttl;
      const newExpiresAt = new Date(Date.now() + newTTL * 1000);

      // Check max TTL
      if (lease.maxTTL) {
        const createdTime = new Date(lease.createdAt).getTime();
        const maxExpiresAt = new Date(createdTime + lease.maxTTL * 1000);

        if (newExpiresAt > maxExpiresAt) {
          throw new Error('Renewal would exceed maximum TTL');
        }
      }

      await lease.update({
        expiresAt: newExpiresAt,
        renewCount: lease.renewCount + 1,
        lastRenewedAt: new Date()
      });

      await auditService.log({
        action: 'renew',
        resourceType: 'lease',
        resourceId: lease.id,
        resourcePath: lease.secretPath,
        actor,
        success: true,
        duration: Date.now() - startTime,
        metadata: {
          renewCount: lease.renewCount,
          newExpiresAt: newExpiresAt.toISOString()
        }
      });

      logger.info('Lease renewed', {
        leaseId,
        renewCount: lease.renewCount,
        actor
      });

      return {
        leaseId: lease.leaseId,
        renewable: lease.renewable,
        ttl: newTTL,
        expiresAt: lease.expiresAt,
        renewCount: lease.renewCount
      };
    } catch (error) {
      logger.error('Failed to renew lease', {
        error: error.message,
        leaseId,
        actor
      });

      await auditService.log({
        action: 'renew',
        resourceType: 'lease',
        resourcePath: leaseId,
        actor,
        success: false,
        errorMessage: error.message,
        duration: Date.now() - startTime
      });

      throw error;
    }
  }

  /**
   * Revoke a lease
   * @param {string} leaseId - Lease ID
   * @param {string} actor - User or service revoking lease
   */
  async revokeLease(leaseId, actor) {
    const startTime = Date.now();

    try {
      const lease = await Lease.findOne({ where: { leaseId } });

      if (!lease) {
        throw new Error('Lease not found');
      }

      await lease.update({
        status: 'revoked',
        revokedAt: new Date(),
        revokedBy: actor
      });

      await auditService.log({
        action: 'revoke',
        resourceType: 'lease',
        resourceId: lease.id,
        resourcePath: lease.secretPath,
        actor,
        success: true,
        duration: Date.now() - startTime
      });

      logger.info('Lease revoked', {
        leaseId,
        actor
      });
    } catch (error) {
      logger.error('Failed to revoke lease', {
        error: error.message,
        leaseId,
        actor
      });

      await auditService.log({
        action: 'revoke',
        resourceType: 'lease',
        resourcePath: leaseId,
        actor,
        success: false,
        errorMessage: error.message,
        duration: Date.now() - startTime
      });

      throw error;
    }
  }

  /**
   * List active leases
   * @param {Object} filters - Filter options
   * @returns {Array} List of leases
   */
  async listLeases(filters = {}) {
    try {
      const {
        secretType,
        status = 'active',
        limit = 100,
        offset = 0
      } = filters;

      const where = { status };
      if (secretType) where.secretType = secretType;

      const leases = await Lease.findAll({
        where,
        limit,
        offset,
        order: [['createdAt', 'DESC']],
        attributes: { exclude: ['credentialData'] } // Don't return encrypted credentials
      });

      return leases;
    } catch (error) {
      logger.error('Failed to list leases', { error: error.message });
      throw error;
    }
  }

  /**
   * Clean up expired leases (background job)
   */
  async cleanupExpiredLeases() {
    try {
      const expiredLeases = await Lease.findAll({
        where: {
          status: 'active',
          expiresAt: {
            [Lease.sequelize.Op.lt]: new Date()
          }
        }
      });

      for (const lease of expiredLeases) {
        await lease.update({ status: 'expired' });
        logger.info('Lease expired', { leaseId: lease.leaseId });
      }

      return expiredLeases.length;
    } catch (error) {
      logger.error('Failed to cleanup expired leases', { error: error.message });
      throw error;
    }
  }
}

module.exports = new DynamicService();
