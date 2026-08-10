/**
 * ═══════════════════════════════════════════════════════════
 * Git Environment Service
 * Manages deployment environments, variables, and registries
 * ═══════════════════════════════════════════════════════════
 */

const axios = require('axios');
const crypto = require('crypto');

class GitEnvironmentService {
  constructor(models) {
    this.GitDeploymentEnvironment = models.GitDeploymentEnvironment;
    this.GitEnvironmentVariable = models.GitEnvironmentVariable;
    this.GitRegistryConfig = models.GitRegistryConfig;
    this.GitDeploymentTarget = models.GitDeploymentTarget;
    this.GitRepository = models.GitRepository;
    this.GitAuditLog = models.GitAuditLog;

    // Service URLs
    this.vaultUrl = process.env.VAULT_URL || 'http://localhost:3013';
  }

  // ═══════════════════════════════════════════════════════════
  // Deployment Environment Management
  // ═══════════════════════════════════════════════════════════

  /**
   * Create deployment environment
   */
  async createEnvironment(repositoryId, environmentData, userId) {
    const {
      name,
      displayName,
      url,
      protectedBranches = [],
      requireApproval = false,
      approvers = [],
      deploymentTargetId = null,
      autoDeployBranch = null,
      variables = {}
    } = environmentData;

    // Validate environment name
    const validNames = ['development', 'staging', 'production', 'testing', 'qa', 'custom'];
    if (!validNames.includes(name)) {
      throw new Error(`Invalid environment name. Must be one of: ${validNames.join(', ')}`);
    }

    await this.validateRepository(repositoryId);

    const environment = await this.GitDeploymentEnvironment.create({
      repositoryId,
      name,
      displayName: displayName || name,
      url,
      protectedBranches,
      requireApproval,
      approvers,
      deploymentTargetId,
      autoDeployBranch,
      variables,
      createdBy: userId
    });

    // Audit log
    await this.createAuditLog({
      userId,
      action: 'environment_created',
      entityType: 'deployment_environment',
      entityId: environment.id,
      repositoryId,
      metadata: { name, url }
    });

    return environment;
  }

  /**
   * Get deployment environments for repository
   */
  async getEnvironments(repositoryId) {
    await this.validateRepository(repositoryId);

    return this.GitDeploymentEnvironment.findAll({
      where: { repositoryId },
      include: [{
        model: this.GitDeploymentTarget,
        as: 'deploymentTarget'
      }],
      order: [['name', 'ASC']]
    });
  }

  /**
   * Get environment by ID
   */
  async getEnvironment(environmentId) {
    const environment = await this.GitDeploymentEnvironment.findByPk(environmentId, {
      include: [{
        model: this.GitDeploymentTarget,
        as: 'deploymentTarget'
      }]
    });

    if (!environment) {
      throw new Error('Deployment environment not found');
    }

    return environment;
  }

  /**
   * Update deployment environment
   */
  async updateEnvironment(environmentId, updates, userId) {
    const environment = await this.getEnvironment(environmentId);

    await environment.update(updates);

    // Audit log
    await this.createAuditLog({
      userId,
      action: 'environment_updated',
      entityType: 'deployment_environment',
      entityId: environmentId,
      repositoryId: environment.repositoryId,
      metadata: { name: environment.name }
    });

    return environment;
  }

  /**
   * Delete deployment environment
   */
  async deleteEnvironment(environmentId, userId) {
    const environment = await this.getEnvironment(environmentId);

    await environment.destroy();

    // Audit log
    await this.createAuditLog({
      userId,
      action: 'environment_deleted',
      entityType: 'deployment_environment',
      entityId: environmentId,
      repositoryId: environment.repositoryId,
      metadata: { name: environment.name }
    });

    return { success: true, message: 'Environment deleted' };
  }

  /**
   * Check if deployment is allowed for branch
   */
  async canDeployToBranch(environmentId, branchName) {
    const environment = await this.getEnvironment(environmentId);

    // Check protected branches
    if (environment.protectedBranches.length > 0) {
      const isProtected = environment.protectedBranches.some(pattern => {
        const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);
        return regex.test(branchName);
      });

      if (!isProtected) {
        return {
          allowed: false,
          reason: `Branch '${branchName}' is not in protected branches list`
        };
      }
    }

    return { allowed: true };
  }

  // ═══════════════════════════════════════════════════════════
  // Environment Variables Management
  // ═══════════════════════════════════════════════════════════

  /**
   * Set environment variable
   */
  async setEnvironmentVariable(variableData, userId) {
    const {
      repositoryId = null,
      environmentId = null,
      key,
      value,
      encrypted = false,
      masked = false,
      protected: isProtected = false,
      scope = 'repository'
    } = variableData;

    // Validate key format (uppercase letters, numbers, underscores)
    if (!/^[A-Z0-9_]+$/.test(key)) {
      throw new Error('Variable key must be uppercase letters, numbers, and underscores only');
    }

    // Validate scope
    const validScopes = ['global', 'repository', 'environment'];
    if (!validScopes.includes(scope)) {
      throw new Error(`Invalid scope. Must be one of: ${validScopes.join(', ')}`);
    }

    // Encrypt if needed
    let variableValue = value;
    if (encrypted) {
      variableValue = await this.encryptValue(value);
    }

    const [variable, created] = await this.GitEnvironmentVariable.findOrCreate({
      where: { repositoryId, environmentId, key },
      defaults: {
        repositoryId,
        environmentId,
        key,
        value: variableValue,
        encrypted,
        masked,
        protected: isProtected,
        scope,
        createdBy: userId
      }
    });

    if (!created) {
      await variable.update({
        value: variableValue,
        encrypted,
        masked,
        protected: isProtected
      });
    }

    // Audit log
    await this.createAuditLog({
      userId,
      action: created ? 'env_variable_created' : 'env_variable_updated',
      entityType: 'environment_variable',
      entityId: variable.id,
      repositoryId,
      metadata: { key, scope, encrypted, masked }
    });

    return variable;
  }

  /**
   * Get environment variables
   */
  async getEnvironmentVariables(filters = {}) {
    const where = {};

    if (filters.repositoryId) where.repositoryId = filters.repositoryId;
    if (filters.environmentId) where.environmentId = filters.environmentId;
    if (filters.scope) where.scope = filters.scope;

    const variables = await this.GitEnvironmentVariable.findAll({
      where,
      order: [['key', 'ASC']],
      attributes: { exclude: ['value'] } // Don't return values in list
    });

    return variables;
  }

  /**
   * Get environment variable (with decryption)
   */
  async getEnvironmentVariable(variableId, decrypt = true) {
    const variable = await this.GitEnvironmentVariable.findByPk(variableId);

    if (!variable) {
      throw new Error('Environment variable not found');
    }

    // Decrypt if needed and requested
    if (variable.encrypted && decrypt) {
      variable.value = await this.decryptValue(variable.value);
    }

    return variable;
  }

  /**
   * Delete environment variable
   */
  async deleteEnvironmentVariable(variableId, userId) {
    const variable = await this.GitEnvironmentVariable.findByPk(variableId);

    if (!variable) {
      throw new Error('Environment variable not found');
    }

    await variable.destroy();

    // Audit log
    await this.createAuditLog({
      userId,
      action: 'env_variable_deleted',
      entityType: 'environment_variable',
      entityId: variableId,
      repositoryId: variable.repositoryId,
      metadata: { key: variable.key }
    });

    return { success: true, message: 'Environment variable deleted' };
  }

  /**
   * Get effective variables for deployment (merged from all scopes)
   */
  async getEffectiveVariables(repositoryId, environmentId) {
    const variables = {};

    // Global variables (lowest priority)
    const globalVars = await this.getEnvironmentVariables({ scope: 'global' });
    for (const v of globalVars) {
      const decrypted = await this.getEnvironmentVariable(v.id);
      variables[v.key] = decrypted.value;
    }

    // Repository variables (medium priority)
    const repoVars = await this.getEnvironmentVariables({ repositoryId, scope: 'repository' });
    for (const v of repoVars) {
      const decrypted = await this.getEnvironmentVariable(v.id);
      variables[v.key] = decrypted.value;
    }

    // Environment-specific variables (highest priority)
    if (environmentId) {
      const envVars = await this.getEnvironmentVariables({ environmentId, scope: 'environment' });
      for (const v of envVars) {
        const decrypted = await this.getEnvironmentVariable(v.id);
        variables[v.key] = decrypted.value;
      }
    }

    return variables;
  }

  // ═══════════════════════════════════════════════════════════
  // Registry Configuration Management
  // ═══════════════════════════════════════════════════════════

  /**
   * Create registry configuration
   */
  async createRegistryConfig(registryData, userId) {
    const {
      repositoryId = null,
      name,
      registryType,
      url,
      username,
      password = null,
      token = null,
      isDefault = false,
      scope = 'repository'
    } = registryData;

    // Validate registry type
    const validTypes = ['docker', 'npm', 'maven', 'pypi', 'nuget', 'rubygems'];
    if (!validTypes.includes(registryType)) {
      throw new Error(`Invalid registry type. Must be one of: ${validTypes.join(', ')}`);
    }

    // Encrypt credentials
    const passwordEncrypted = password ? await this.encryptValue(password) : null;
    const tokenEncrypted = token ? await this.encryptValue(token) : null;

    const registry = await this.GitRegistryConfig.create({
      repositoryId,
      name,
      registryType,
      url,
      username,
      passwordEncrypted,
      tokenEncrypted,
      isDefault,
      scope,
      createdBy: userId
    });

    // Audit log
    await this.createAuditLog({
      userId,
      action: 'registry_config_created',
      entityType: 'registry_config',
      entityId: registry.id,
      repositoryId,
      metadata: { name, registryType, url }
    });

    return registry;
  }

  /**
   * Get registry configurations
   */
  async getRegistryConfigs(repositoryId = null) {
    const where = {};
    if (repositoryId) where.repositoryId = repositoryId;

    return this.GitRegistryConfig.findAll({
      where,
      order: [['isDefault', 'DESC'], ['name', 'ASC']],
      attributes: { exclude: ['passwordEncrypted', 'tokenEncrypted'] }
    });
  }

  /**
   * Get registry configuration by ID
   */
  async getRegistryConfig(registryId, includeCredentials = false) {
    const attributes = includeCredentials
      ? undefined
      : { exclude: ['passwordEncrypted', 'tokenEncrypted'] };

    const registry = await this.GitRegistryConfig.findByPk(registryId, { attributes });

    if (!registry) {
      throw new Error('Registry configuration not found');
    }

    // Decrypt credentials if included
    if (includeCredentials) {
      if (registry.passwordEncrypted) {
        registry.password = await this.decryptValue(registry.passwordEncrypted);
      }
      if (registry.tokenEncrypted) {
        registry.token = await this.decryptValue(registry.tokenEncrypted);
      }
    }

    return registry;
  }

  /**
   * Update registry configuration
   */
  async updateRegistryConfig(registryId, updates, userId) {
    const registry = await this.GitRegistryConfig.findByPk(registryId);

    if (!registry) {
      throw new Error('Registry configuration not found');
    }

    // Encrypt new credentials if provided
    if (updates.password) {
      updates.passwordEncrypted = await this.encryptValue(updates.password);
      delete updates.password;
    }
    if (updates.token) {
      updates.tokenEncrypted = await this.encryptValue(updates.token);
      delete updates.token;
    }

    await registry.update(updates);

    // Audit log
    await this.createAuditLog({
      userId,
      action: 'registry_config_updated',
      entityType: 'registry_config',
      entityId: registryId,
      repositoryId: registry.repositoryId,
      metadata: { name: registry.name }
    });

    return registry;
  }

  /**
   * Delete registry configuration
   */
  async deleteRegistryConfig(registryId, userId) {
    const registry = await this.GitRegistryConfig.findByPk(registryId);

    if (!registry) {
      throw new Error('Registry configuration not found');
    }

    await registry.destroy();

    // Audit log
    await this.createAuditLog({
      userId,
      action: 'registry_config_deleted',
      entityType: 'registry_config',
      entityId: registryId,
      repositoryId: registry.repositoryId,
      metadata: { name: registry.name, registryType: registry.registryType }
    });

    return { success: true, message: 'Registry configuration deleted' };
  }

  // ═══════════════════════════════════════════════════════════
  // Encryption/Decryption
  // ═══════════════════════════════════════════════════════════

  /**
   * Encrypt value using Vault
   */
  async encryptValue(value) {
    try {
      const response = await axios.post(`${this.vaultUrl}/api/encrypt`, {
        data: typeof value === 'string' ? value : JSON.stringify(value)
      });
      return response.data.encrypted;
    } catch (error) {
      // Fallback to local encryption
      console.warn('Vault unavailable, using local encryption');
      return this.localEncrypt(value);
    }
  }

  /**
   * Decrypt value using Vault
   */
  async decryptValue(encryptedValue) {
    try {
      const response = await axios.post(`${this.vaultUrl}/api/decrypt`, {
        data: encryptedValue
      });
      return response.data.decrypted;
    } catch (error) {
      // Fallback to local decryption
      console.warn('Vault unavailable, using local decryption');
      return this.localDecrypt(encryptedValue);
    }
  }

  /**
   * Local encryption fallback
   */
  localEncrypt(value) {
    const key = process.env.ENCRYPTION_KEY || crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    let encrypted = cipher.update(stringValue, 'utf8', 'hex');
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

    return decrypted;
  }

  // ═══════════════════════════════════════════════════════════
  // Helper Methods
  // ═══════════════════════════════════════════════════════════

  /**
   * Validate repository exists
   */
  async validateRepository(repositoryId) {
    const repo = await this.GitRepository.findByPk(repositoryId);
    if (!repo) {
      throw new Error('Repository not found');
    }
    return repo;
  }

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
      metadata = {}
    } = logData;

    return this.GitAuditLog.create({
      userId,
      action,
      entityType,
      entityId,
      repositoryId,
      metadata,
      timestamp: new Date()
    });
  }
}

module.exports = GitEnvironmentService;
