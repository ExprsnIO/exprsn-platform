/**
 * ═══════════════════════════════════════════════════════════
 * Git Auth Service
 * Manages SSH keys, Personal Access Tokens, and OAuth apps
 * ═══════════════════════════════════════════════════════════
 */

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const forge = require('node-forge');

class GitAuthService {
  constructor(models) {
    this.GitSSHKey = models.GitSSHKey;
    this.GitPersonalAccessToken = models.GitPersonalAccessToken;
    this.GitOAuthApplication = models.GitOAuthApplication;
    this.GitAuditLog = models.GitAuditLog;
  }

  // ═══════════════════════════════════════════════════════════
  // SSH Key Management
  // ═══════════════════════════════════════════════════════════

  /**
   * Add SSH key for user
   */
  async addSSHKey(userId, keyData) {
    const { title, publicKey, keyType = 'rsa', expiresAt = null } = keyData;

    // Validate public key format
    this.validatePublicKey(publicKey, keyType);

    // Generate fingerprint
    const fingerprint = this.generateKeyFingerprint(publicKey);

    // Check for duplicate fingerprint
    const existing = await this.GitSSHKey.findOne({ where: { fingerprint } });
    if (existing) {
      throw new Error('This SSH key is already registered');
    }

    const sshKey = await this.GitSSHKey.create({
      userId,
      title,
      publicKey,
      fingerprint,
      keyType,
      expiresAt
    });

    // Audit log
    await this.createAuditLog({
      userId,
      action: 'ssh_key_added',
      entityType: 'ssh_key',
      entityId: sshKey.id,
      metadata: { title, keyType, fingerprint }
    });

    return sshKey;
  }

  /**
   * Get SSH keys for user
   */
  async getSSHKeys(userId) {
    return this.GitSSHKey.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']]
    });
  }

  /**
   * Get SSH key by ID
   */
  async getSSHKey(id, userId) {
    const key = await this.GitSSHKey.findOne({
      where: { id, userId }
    });

    if (!key) {
      throw new Error('SSH key not found');
    }

    return key;
  }

  /**
   * Delete SSH key
   */
  async deleteSSHKey(id, userId) {
    const key = await this.getSSHKey(id, userId);

    await key.destroy();

    // Audit log
    await this.createAuditLog({
      userId,
      action: 'ssh_key_deleted',
      entityType: 'ssh_key',
      entityId: id,
      metadata: { title: key.title, fingerprint: key.fingerprint }
    });

    return { success: true, message: 'SSH key deleted' };
  }

  /**
   * Verify SSH key for authentication
   */
  async verifySSHKey(fingerprint) {
    const key = await this.GitSSHKey.findOne({ where: { fingerprint } });

    if (!key) {
      return { valid: false, reason: 'Key not found' };
    }

    // Check expiration
    if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
      return { valid: false, reason: 'Key expired' };
    }

    // Update last used
    await key.update({ lastUsedAt: new Date() });

    return { valid: true, userId: key.userId, key };
  }

  /**
   * Validate public key format
   */
  validatePublicKey(publicKey, keyType) {
    const trimmedKey = publicKey.trim();

    if (keyType === 'rsa') {
      if (!trimmedKey.startsWith('ssh-rsa ')) {
        throw new Error('Invalid RSA public key format');
      }
    } else if (keyType === 'ed25519') {
      if (!trimmedKey.startsWith('ssh-ed25519 ')) {
        throw new Error('Invalid ED25519 public key format');
      }
    } else if (keyType === 'ecdsa') {
      if (!trimmedKey.startsWith('ecdsa-sha2-')) {
        throw new Error('Invalid ECDSA public key format');
      }
    } else {
      throw new Error('Unsupported key type');
    }

    return true;
  }

  /**
   * Generate SSH key fingerprint (SHA256)
   */
  generateKeyFingerprint(publicKey) {
    const parts = publicKey.trim().split(' ');
    const keyData = parts[1]; // Base64 encoded key data

    const hash = crypto.createHash('sha256')
      .update(Buffer.from(keyData, 'base64'))
      .digest('base64')
      .replace(/=+$/, ''); // Remove trailing =

    return `SHA256:${hash}`;
  }

  // ═══════════════════════════════════════════════════════════
  // Personal Access Token (PAT) Management
  // ═══════════════════════════════════════════════════════════

  /**
   * Generate Personal Access Token
   */
  async generatePAT(userId, tokenData) {
    const {
      name,
      scopes = ['read_repository', 'write_repository'],
      expiresAt = null
    } = tokenData;

    // Generate random token
    const token = this.generateRandomToken();
    const tokenHash = await bcrypt.hash(token, 10);

    const pat = await this.GitPersonalAccessToken.create({
      userId,
      name,
      tokenHash,
      scopes,
      expiresAt,
      revoked: false
    });

    // Audit log
    await this.createAuditLog({
      userId,
      action: 'pat_created',
      entityType: 'personal_access_token',
      entityId: pat.id,
      metadata: { name, scopes }
    });

    // Return token only once (it won't be stored in plaintext)
    return {
      ...pat.toJSON(),
      token // Only shown at creation time
    };
  }

  /**
   * Get Personal Access Tokens for user
   */
  async getPATs(userId) {
    return this.GitPersonalAccessToken.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      attributes: { exclude: ['tokenHash'] } // Never return hash
    });
  }

  /**
   * Get PAT by ID
   */
  async getPAT(id, userId) {
    const pat = await this.GitPersonalAccessToken.findOne({
      where: { id, userId },
      attributes: { exclude: ['tokenHash'] }
    });

    if (!pat) {
      throw new Error('Personal Access Token not found');
    }

    return pat;
  }

  /**
   * Revoke Personal Access Token
   */
  async revokePAT(id, userId) {
    const pat = await this.GitPersonalAccessToken.findOne({
      where: { id, userId }
    });

    if (!pat) {
      throw new Error('Personal Access Token not found');
    }

    await pat.update({
      revoked: true,
      revokedAt: new Date()
    });

    // Audit log
    await this.createAuditLog({
      userId,
      action: 'pat_revoked',
      entityType: 'personal_access_token',
      entityId: id,
      metadata: { name: pat.name }
    });

    return { success: true, message: 'Token revoked' };
  }

  /**
   * Verify Personal Access Token
   */
  async verifyPAT(token) {
    // Find all non-revoked PATs
    const pats = await this.GitPersonalAccessToken.findAll({
      where: { revoked: false }
    });

    // Check each token hash
    for (const pat of pats) {
      const match = await bcrypt.compare(token, pat.tokenHash);

      if (match) {
        // Check expiration
        if (pat.expiresAt && new Date(pat.expiresAt) < new Date()) {
          return { valid: false, reason: 'Token expired' };
        }

        // Update last used
        await pat.update({ lastUsedAt: new Date() });

        return {
          valid: true,
          userId: pat.userId,
          scopes: pat.scopes,
          pat
        };
      }
    }

    return { valid: false, reason: 'Invalid token' };
  }

  /**
   * Generate random token (cryptographically secure)
   */
  generateRandomToken() {
    const prefix = 'exprsn_pat';
    const randomBytes = crypto.randomBytes(32).toString('hex');
    return `${prefix}_${randomBytes}`;
  }

  /**
   * Delete PAT (permanently)
   */
  async deletePAT(id, userId) {
    const pat = await this.GitPersonalAccessToken.findOne({
      where: { id, userId }
    });

    if (!pat) {
      throw new Error('Personal Access Token not found');
    }

    await pat.destroy();

    // Audit log
    await this.createAuditLog({
      userId,
      action: 'pat_deleted',
      entityType: 'personal_access_token',
      entityId: id,
      metadata: { name: pat.name }
    });

    return { success: true, message: 'Token deleted' };
  }

  // ═══════════════════════════════════════════════════════════
  // OAuth Application Management
  // ═══════════════════════════════════════════════════════════

  /**
   * Register OAuth application
   */
  async registerOAuthApp(userId, appData) {
    const {
      name,
      description,
      redirectUris = [],
      scopes = ['read_user', 'read_repository'],
      logoUrl,
      homepageUrl,
      privacyPolicyUrl,
      termsOfServiceUrl
    } = appData;

    // Generate client ID and secret
    const clientId = this.generateClientId();
    const clientSecret = this.generateClientSecret();
    const clientSecretHash = await bcrypt.hash(clientSecret, 10);

    const app = await this.GitOAuthApplication.create({
      name,
      description,
      clientId,
      clientSecretHash,
      redirectUris,
      scopes,
      logoUrl,
      homepageUrl,
      privacyPolicyUrl,
      termsOfServiceUrl,
      ownerId: userId,
      active: true
    });

    // Audit log
    await this.createAuditLog({
      userId,
      action: 'oauth_app_created',
      entityType: 'oauth_application',
      entityId: app.id,
      metadata: { name, clientId }
    });

    // Return client secret only once
    return {
      ...app.toJSON(),
      clientSecret // Only shown at creation time
    };
  }

  /**
   * Get OAuth applications for user
   */
  async getOAuthApps(userId) {
    return this.GitOAuthApplication.findAll({
      where: { ownerId: userId },
      order: [['createdAt', 'DESC']],
      attributes: { exclude: ['clientSecretHash'] }
    });
  }

  /**
   * Get OAuth app by ID
   */
  async getOAuthApp(id, userId) {
    const app = await this.GitOAuthApplication.findOne({
      where: { id, ownerId: userId },
      attributes: { exclude: ['clientSecretHash'] }
    });

    if (!app) {
      throw new Error('OAuth application not found');
    }

    return app;
  }

  /**
   * Update OAuth application
   */
  async updateOAuthApp(id, userId, updates) {
    const app = await this.GitOAuthApplication.findOne({
      where: { id, ownerId: userId }
    });

    if (!app) {
      throw new Error('OAuth application not found');
    }

    // Don't allow updating clientId or clientSecretHash
    delete updates.clientId;
    delete updates.clientSecretHash;
    delete updates.ownerId;

    await app.update(updates);

    // Audit log
    await this.createAuditLog({
      userId,
      action: 'oauth_app_updated',
      entityType: 'oauth_application',
      entityId: id,
      metadata: { name: app.name }
    });

    return app;
  }

  /**
   * Regenerate OAuth client secret
   */
  async regenerateClientSecret(id, userId) {
    const app = await this.GitOAuthApplication.findOne({
      where: { id, ownerId: userId }
    });

    if (!app) {
      throw new Error('OAuth application not found');
    }

    const clientSecret = this.generateClientSecret();
    const clientSecretHash = await bcrypt.hash(clientSecret, 10);

    await app.update({ clientSecretHash });

    // Audit log
    await this.createAuditLog({
      userId,
      action: 'oauth_secret_regenerated',
      entityType: 'oauth_application',
      entityId: id,
      metadata: { name: app.name }
    });

    // Return new secret only once
    return { clientSecret };
  }

  /**
   * Delete OAuth application
   */
  async deleteOAuthApp(id, userId) {
    const app = await this.GitOAuthApplication.findOne({
      where: { id, ownerId: userId }
    });

    if (!app) {
      throw new Error('OAuth application not found');
    }

    await app.destroy();

    // Audit log
    await this.createAuditLog({
      userId,
      action: 'oauth_app_deleted',
      entityType: 'oauth_application',
      entityId: id,
      metadata: { name: app.name, clientId: app.clientId }
    });

    return { success: true, message: 'OAuth application deleted' };
  }

  /**
   * Verify OAuth client credentials
   */
  async verifyOAuthClient(clientId, clientSecret) {
    const app = await this.GitOAuthApplication.findOne({
      where: { clientId, active: true }
    });

    if (!app) {
      return { valid: false, reason: 'Client not found' };
    }

    const match = await bcrypt.compare(clientSecret, app.clientSecretHash);

    if (!match) {
      return { valid: false, reason: 'Invalid credentials' };
    }

    return { valid: true, app };
  }

  /**
   * Generate OAuth client ID
   */
  generateClientId() {
    return `exprsn_oauth_${crypto.randomBytes(16).toString('hex')}`;
  }

  /**
   * Generate OAuth client secret
   */
  generateClientSecret() {
    return crypto.randomBytes(32).toString('hex');
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

  // ═══════════════════════════════════════════════════════════
  // Statistics
  // ═══════════════════════════════════════════════════════════

  /**
   * Get authentication statistics for user
   */
  async getUserAuthStats(userId) {
    const [sshKeyCount, patCount, oauthAppCount] = await Promise.all([
      this.GitSSHKey.count({ where: { userId } }),
      this.GitPersonalAccessToken.count({ where: { userId, revoked: false } }),
      this.GitOAuthApplication.count({ where: { ownerId: userId } })
    ]);

    return {
      sshKeys: sshKeyCount,
      personalAccessTokens: patCount,
      oauthApplications: oauthAppCount
    };
  }
}

module.exports = GitAuthService;
