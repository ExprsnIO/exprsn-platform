/**
 * ═══════════════════════════════════════════════════════════
 * Git Setup Service
 * Manages system configuration, templates, and global settings
 * ═══════════════════════════════════════════════════════════
 */

const axios = require('axios');
const crypto = require('crypto');

class GitSetupService {
  constructor(models) {
    this.GitSystemConfig = models.GitSystemConfig;
    this.GitRepositoryTemplate = models.GitRepositoryTemplate;
    this.GitIssueTemplate = models.GitIssueTemplate;
    this.GitAuditLog = models.GitAuditLog;

    // Service URLs from environment
    this.vaultUrl = process.env.VAULT_URL || 'http://localhost:3013';
    this.heraldUrl = process.env.HERALD_URL || 'http://localhost:3014';
  }

  // ═══════════════════════════════════════════════════════════
  // System Configuration Management
  // ═══════════════════════════════════════════════════════════

  /**
   * Get system configuration by key
   */
  async getConfig(key) {
    const config = await this.GitSystemConfig.findOne({ where: { key } });

    if (!config) {
      throw new Error(`Configuration key '${key}' not found`);
    }

    // Decrypt if encrypted
    if (config.encrypted) {
      config.value = await this.decryptValue(config.value);
    }

    return config;
  }

  /**
   * Get all system configurations
   */
  async getAllConfigs(filters = {}) {
    const where = {};

    if (filters.type) {
      where.type = filters.type;
    }

    const configs = await this.GitSystemConfig.findAll({
      where,
      order: [['type', 'ASC'], ['key', 'ASC']]
    });

    // Decrypt encrypted values
    for (const config of configs) {
      if (config.encrypted) {
        config.value = await this.decryptValue(config.value);
      }
    }

    return configs;
  }

  /**
   * Get configurations by type
   */
  async getConfigsByType(type) {
    const validTypes = ['system', 'security', 'cicd', 'deployment', 'integration', 'storage'];

    if (!validTypes.includes(type)) {
      throw new Error(`Invalid configuration type. Must be one of: ${validTypes.join(', ')}`);
    }

    return this.getAllConfigs({ type });
  }

  /**
   * Set or update system configuration
   */
  async setConfig(key, value, options = {}) {
    const {
      type = 'system',
      encrypted = false,
      updatedBy = null
    } = options;

    // Encrypt if needed
    let configValue = value;
    if (encrypted) {
      configValue = await this.encryptValue(value);
    }

    const [config, created] = await this.GitSystemConfig.findOrCreate({
      where: { key },
      defaults: {
        key,
        value: configValue,
        type,
        encrypted,
        updatedBy
      }
    });

    if (!created) {
      await config.update({
        value: configValue,
        type,
        encrypted,
        updatedBy
      });
    }

    // Audit log
    await this.createAuditLog({
      userId: updatedBy,
      action: created ? 'config_created' : 'config_updated',
      entityType: 'system_config',
      entityId: config.id,
      changes: { key, encrypted }
    });

    return config;
  }

  /**
   * Delete system configuration
   */
  async deleteConfig(key, userId = null) {
    const config = await this.GitSystemConfig.findOne({ where: { key } });

    if (!config) {
      throw new Error(`Configuration key '${key}' not found`);
    }

    await config.destroy();

    // Audit log
    await this.createAuditLog({
      userId,
      action: 'config_deleted',
      entityType: 'system_config',
      entityId: config.id,
      changes: { key }
    });

    return { success: true, message: `Configuration '${key}' deleted` };
  }

  /**
   * Bulk update configurations
   */
  async bulkUpdateConfigs(configs, userId = null) {
    const results = [];

    for (const { key, value, type, encrypted } of configs) {
      try {
        const config = await this.setConfig(key, value, { type, encrypted, updatedBy: userId });
        results.push({ key, success: true, config });
      } catch (error) {
        results.push({ key, success: false, error: error.message });
      }
    }

    return results;
  }

  // ═══════════════════════════════════════════════════════════
  // Repository Template Management
  // ═══════════════════════════════════════════════════════════

  /**
   * Get all repository templates
   */
  async getRepositoryTemplates(filters = {}) {
    const where = {};

    if (filters.isPublic !== undefined) {
      where.isPublic = filters.isPublic;
    }

    if (filters.language) {
      where.language = filters.language;
    }

    return this.GitRepositoryTemplate.findAll({
      where,
      order: [['name', 'ASC']]
    });
  }

  /**
   * Get repository template by ID
   */
  async getRepositoryTemplate(id) {
    const template = await this.GitRepositoryTemplate.findByPk(id);

    if (!template) {
      throw new Error('Repository template not found');
    }

    return template;
  }

  /**
   * Create repository template
   */
  async createRepositoryTemplate(templateData, userId) {
    const {
      name,
      description,
      language,
      framework,
      fileStructure = {},
      defaultFiles = {},
      gitignoreContent,
      readmeTemplate,
      cicdTemplate = {},
      dockerfileTemplate,
      isPublic = true
    } = templateData;

    const template = await this.GitRepositoryTemplate.create({
      name,
      description,
      language,
      framework,
      fileStructure,
      defaultFiles,
      gitignoreContent,
      readmeTemplate,
      cicdTemplate,
      dockerfileTemplate,
      isPublic,
      createdBy: userId
    });

    // Audit log
    await this.createAuditLog({
      userId,
      action: 'template_created',
      entityType: 'repository_template',
      entityId: template.id,
      changes: { name, language }
    });

    return template;
  }

  /**
   * Update repository template
   */
  async updateRepositoryTemplate(id, updates, userId) {
    const template = await this.getRepositoryTemplate(id);

    await template.update(updates);

    // Audit log
    await this.createAuditLog({
      userId,
      action: 'template_updated',
      entityType: 'repository_template',
      entityId: template.id,
      changes: updates
    });

    return template;
  }

  /**
   * Delete repository template
   */
  async deleteRepositoryTemplate(id, userId) {
    const template = await this.getRepositoryTemplate(id);

    await template.destroy();

    // Audit log
    await this.createAuditLog({
      userId,
      action: 'template_deleted',
      entityType: 'repository_template',
      entityId: id,
      changes: { name: template.name }
    });

    return { success: true, message: 'Template deleted' };
  }

  // ═══════════════════════════════════════════════════════════
  // Issue Template Management
  // ═══════════════════════════════════════════════════════════

  /**
   * Get issue templates (global or repository-specific)
   */
  async getIssueTemplates(repositoryId = null) {
    const where = { repositoryId };

    return this.GitIssueTemplate.findAll({
      where,
      order: [['isDefault', 'DESC'], ['name', 'ASC']]
    });
  }

  /**
   * Get issue template by ID
   */
  async getIssueTemplate(id) {
    const template = await this.GitIssueTemplate.findByPk(id);

    if (!template) {
      throw new Error('Issue template not found');
    }

    return template;
  }

  /**
   * Create issue template
   */
  async createIssueTemplate(templateData, userId) {
    const {
      repositoryId = null,
      name,
      title,
      description,
      templateType,
      body,
      labels = [],
      assignees = [],
      isDefault = false
    } = templateData;

    const template = await this.GitIssueTemplate.create({
      repositoryId,
      name,
      title,
      description,
      templateType,
      body,
      labels,
      assignees,
      isDefault,
      createdBy: userId
    });

    // Audit log
    await this.createAuditLog({
      userId,
      action: 'issue_template_created',
      entityType: 'issue_template',
      entityId: template.id,
      repositoryId,
      changes: { name, templateType }
    });

    return template;
  }

  /**
   * Update issue template
   */
  async updateIssueTemplate(id, updates, userId) {
    const template = await this.getIssueTemplate(id);

    await template.update(updates);

    // Audit log
    await this.createAuditLog({
      userId,
      action: 'issue_template_updated',
      entityType: 'issue_template',
      entityId: template.id,
      repositoryId: template.repositoryId,
      changes: updates
    });

    return template;
  }

  /**
   * Delete issue template
   */
  async deleteIssueTemplate(id, userId) {
    const template = await this.getIssueTemplate(id);

    await template.destroy();

    // Audit log
    await this.createAuditLog({
      userId,
      action: 'issue_template_deleted',
      entityType: 'issue_template',
      entityId: id,
      repositoryId: template.repositoryId,
      changes: { name: template.name }
    });

    return { success: true, message: 'Issue template deleted' };
  }

  // ═══════════════════════════════════════════════════════════
  // Encryption/Decryption (with Vault integration)
  // ═══════════════════════════════════════════════════════════

  /**
   * Encrypt sensitive value using Vault
   */
  async encryptValue(value) {
    try {
      const response = await axios.post(`${this.vaultUrl}/api/encrypt`, {
        data: JSON.stringify(value)
      });

      return response.data.encrypted;
    } catch (error) {
      // Fallback to local encryption if Vault unavailable
      console.warn('Vault unavailable, using local encryption');
      return this.localEncrypt(value);
    }
  }

  /**
   * Decrypt sensitive value using Vault
   */
  async decryptValue(encryptedValue) {
    try {
      const response = await axios.post(`${this.vaultUrl}/api/decrypt`, {
        data: encryptedValue
      });

      return JSON.parse(response.data.decrypted);
    } catch (error) {
      // Fallback to local decryption
      console.warn('Vault unavailable, using local decryption');
      return this.localDecrypt(encryptedValue);
    }
  }

  /**
   * Local encryption fallback (AES-256-GCM)
   */
  localEncrypt(value) {
    const key = process.env.ENCRYPTION_KEY || crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(JSON.stringify(value), 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  /**
   * Local decryption fallback
   */
  localDecrypt(encryptedData) {
    const key = process.env.ENCRYPTION_KEY || crypto.randomBytes(32);
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(encryptedData.iv, 'hex')
    );

    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));

    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  }

  // ═══════════════════════════════════════════════════════════
  // Audit Logging
  // ═══════════════════════════════════════════════════════════

  /**
   * Create audit log entry
   */
  async createAuditLog(logData) {
    const {
      userId,
      action,
      entityType,
      entityId,
      repositoryId = null,
      changes = {},
      metadata = {},
      ipAddress = null,
      userAgent = null
    } = logData;

    return this.GitAuditLog.create({
      userId,
      action,
      entityType,
      entityId,
      repositoryId,
      changes,
      metadata,
      ipAddress,
      userAgent,
      timestamp: new Date()
    });
  }

  /**
   * Get audit logs
   */
  async getAuditLogs(filters = {}) {
    const where = {};

    if (filters.userId) where.userId = filters.userId;
    if (filters.entityType) where.entityType = filters.entityType;
    if (filters.repositoryId) where.repositoryId = filters.repositoryId;
    if (filters.action) where.action = filters.action;

    const limit = filters.limit || 100;
    const offset = filters.offset || 0;

    return this.GitAuditLog.findAll({
      where,
      limit,
      offset,
      order: [['timestamp', 'DESC']]
    });
  }

  // ═══════════════════════════════════════════════════════════
  // System Health & Statistics
  // ═══════════════════════════════════════════════════════════

  /**
   * Get system statistics
   */
  async getSystemStats() {
    const [
      configCount,
      templateCount,
      issueTemplateCount,
      recentAuditLogs
    ] = await Promise.all([
      this.GitSystemConfig.count(),
      this.GitRepositoryTemplate.count(),
      this.GitIssueTemplate.count({ where: { repositoryId: null } }),
      this.GitAuditLog.count({
        where: {
          timestamp: {
            [this.GitAuditLog.sequelize.Sequelize.Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000)
          }
        }
      })
    ]);

    return {
      configurations: configCount,
      repositoryTemplates: templateCount,
      globalIssueTemplates: issueTemplateCount,
      auditLogsLast24h: recentAuditLogs
    };
  }

  /**
   * Validate system configuration
   */
  async validateConfiguration() {
    const requiredConfigs = [
      'git.default_branch',
      'cicd.max_pipeline_duration_minutes',
      'cicd.max_concurrent_jobs'
    ];

    const missing = [];

    for (const key of requiredConfigs) {
      try {
        await this.getConfig(key);
      } catch (error) {
        missing.push(key);
      }
    }

    return {
      valid: missing.length === 0,
      missing
    };
  }
}

module.exports = GitSetupService;
