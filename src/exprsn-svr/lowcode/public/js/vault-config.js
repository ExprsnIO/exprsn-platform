/**
 * ═══════════════════════════════════════════════════════════════════
 * Vault (Secrets Management) Configuration Manager
 * Handles comprehensive configuration UI for exprsn-vault service
 * ═══════════════════════════════════════════════════════════════════
 */

class VaultConfigManager {
  constructor() {
    this.vaultConfig = null;
  }

  /**
   * Load Vault configuration from API
   */
  async loadVaultConfiguration() {
    try {
      const response = await fetch('/lowcode/setup-config/api/vault/configuration');
      const data = await response.json();

      if (data.success) {
        this.vaultConfig = data.configuration;
        this.renderVaultConfiguration();
      } else {
        this.showError(data.message || 'Failed to load Vault configuration');
      }
    } catch (error) {
      console.error('[Vault Config] Load error:', error);
      this.showError(error.message);
    }
  }

  /**
   * Render complete Vault configuration UI
   */
  renderVaultConfiguration() {
    const container = document.getElementById('vaultConfigContent');
    if (!container || !this.vaultConfig) return;

    const { service, storage, secrets, security } = this.vaultConfig;

    container.innerHTML = `
      <!-- Service Status -->
      <div class="mb-4">
        <h5 class="text-muted mb-3">
          <i class="fas fa-heartbeat"></i> Service Status
        </h5>

        <div class="status-grid">
          <div class="status-item">
            <div class="status-label">Service</div>
            <div class="status-value">
              ${service.health.running ?
                '<span class="badge bg-success">Running</span>' :
                '<span class="badge bg-danger">Stopped</span>'}
            </div>
          </div>

          ${service.health.running ? `
            <div class="status-item">
              <div class="status-label">Response Time</div>
              <div class="status-value">${service.health.responseTime}ms</div>
            </div>

            <div class="status-item">
              <div class="status-label">Version</div>
              <div class="status-value">${service.health.version}</div>
            </div>

            <div class="status-item">
              <div class="status-label">Status</div>
              <div class="status-value">
                ${service.health.sealed ?
                  '<span class="badge bg-warning text-dark">Sealed</span>' :
                  '<span class="badge bg-success">Unsealed</span>'}
              </div>
            </div>

            <div class="status-item">
              <div class="status-label">Initialized</div>
              <div class="status-value">
                ${service.health.initialized ?
                  '<i class="fas fa-check-circle text-success"></i> Yes' :
                  '<i class="fas fa-times-circle text-danger"></i> No'}
              </div>
            </div>
          ` : ''}
        </div>

        <div class="mt-3">
          <button class="btn btn-sm btn-primary" onclick="window.vaultManager.testConnection()">
            <i class="fas fa-plug"></i> Test Connection
          </button>
        </div>
      </div>

      <hr class="my-4"/>

      <!-- Storage Configuration -->
      <div class="mb-4">
        <h5 class="text-muted mb-3">
          <i class="fas fa-database"></i> Storage Configuration
        </h5>

        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label">Storage Backend</label>
            <select class="form-select" id="storageBackend" onchange="window.vaultManager.updateConfiguration()">
              <option value="filesystem" ${storage.backend === 'filesystem' ? 'selected' : ''}>Filesystem</option>
              <option value="database" ${storage.backend === 'database' ? 'selected' : ''}>Database (PostgreSQL)</option>
              <option value="s3" ${storage.backend === 's3' ? 'selected' : ''}>AWS S3</option>
            </select>
            <div class="form-text">Backend for encrypted secret storage</div>
          </div>

          <div class="col-md-6">
            <label class="form-label">Storage Path</label>
            <input type="text" class="form-control" id="storagePath" value="${storage.path}"
                   onchange="window.vaultManager.updateConfiguration()"/>
            <div class="form-text">Directory or bucket for vault data</div>
          </div>

          <div class="col-12">
            <div class="alert alert-info mb-0">
              <i class="fas fa-lock"></i>
              <strong>Encryption:</strong> ${storage.encryptionAlgorithm}
              ${storage.encrypted ? '(Active)' : '(Inactive)'}
            </div>
          </div>
        </div>
      </div>

      <hr class="my-4"/>

      <!-- Secrets Statistics -->
      <div class="mb-4">
        <h5 class="text-muted mb-3">
          <i class="fas fa-key"></i> Secrets Overview
        </h5>

        ${service.health.running && !service.health.sealed ? `
          <div class="row text-center mb-3">
            <div class="col-3">
              <div class="card bg-primary text-white">
                <div class="card-body py-3">
                  <h2 class="mb-0">${secrets.total}</h2>
                  <small>Total Secrets</small>
                </div>
              </div>
            </div>
            <div class="col-3">
              <div class="card bg-success text-white">
                <div class="card-body py-3">
                  <h2 class="mb-0">${secrets.recentlyAccessed}</h2>
                  <small>Recently Used</small>
                </div>
              </div>
            </div>
            <div class="col-3">
              <div class="card bg-warning text-white">
                <div class="card-body py-3">
                  <h2 class="mb-0">${secrets.expiringSoon}</h2>
                  <small>Expiring Soon</small>
                </div>
              </div>
            </div>
            <div class="col-3">
              <div class="card bg-info text-white">
                <div class="card-body py-3">
                  <h2 class="mb-0">${Object.keys(secrets.byType || {}).length}</h2>
                  <small>Secret Types</small>
                </div>
              </div>
            </div>
          </div>

          <button class="btn btn-sm btn-secondary" onclick="window.vaultManager.listSecrets()">
            <i class="fas fa-list"></i> View Secrets List
          </button>
        ` : `
          <div class="alert alert-warning">
            <i class="fas fa-lock"></i>
            Vault must be running and unsealed to view secrets statistics
          </div>
        `}
      </div>

      <hr class="my-4"/>

      <!-- Security Settings -->
      <div class="mb-4">
        <h5 class="text-muted mb-3">
          <i class="fas fa-shield-alt"></i> Security & Access Control
        </h5>

        <!-- Seal/Unseal Controls -->
        <div class="mb-3">
          <label class="form-label">Vault Seal Controls</label>
          <div class="btn-group d-block" role="group">
            ${!service.health.sealed ? `
              <button class="btn btn-warning" onclick="window.vaultManager.sealVault()">
                <i class="fas fa-lock"></i> Seal Vault
              </button>
            ` : `
              <button class="btn btn-success" onclick="window.vaultManager.unsealVault()">
                <i class="fas fa-unlock"></i> Unseal Vault
              </button>
            `}
          </div>
          <div class="form-text">
            ${!service.health.sealed ?
              'Sealing the vault encrypts all secrets and requires unseal keys to access' :
              'Unsealing the vault allows access to secrets'}
          </div>
        </div>

        <!-- Audit Logging -->
        <div class="form-check form-switch mb-3">
          <input class="form-check-input" type="checkbox" id="auditLogging"
                 ${security.auditLogging ? 'checked' : ''}
                 onchange="window.vaultManager.toggleAuditLogging(this.checked)"/>
          <label class="form-check-label" for="auditLogging">
            <strong>Audit Logging</strong>
            <div class="text-muted small">Log all secret access and modifications</div>
          </label>
        </div>

        <!-- Access Policies -->
        <div class="form-check form-switch mb-3">
          <input class="form-check-input" type="checkbox" id="accessPolicies"
                 ${security.accessPolicies ? 'checked' : ''}
                 onchange="window.vaultManager.toggleAccessPolicies(this.checked)"/>
          <label class="form-check-label" for="accessPolicies">
            <strong>Access Policies</strong>
            <div class="text-muted small">Enforce fine-grained access control on secrets</div>
          </label>
        </div>

        <!-- Master Key Rotation -->
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label">Master Key Rotation (days)</label>
            <input type="number" class="form-control" id="keyRotationDays"
                   value="${security.masterKeyRotation}" min="30" max="365"
                   onchange="window.vaultManager.updateConfiguration()"/>
            <div class="form-text">Automatically rotate master encryption key</div>
          </div>

          <div class="col-md-6">
            <label class="form-label">Token TTL</label>
            <input type="text" class="form-control" id="tokenTTL"
                   value="${security.tokenTTL}"
                   onchange="window.vaultManager.updateConfiguration()"/>
            <div class="form-text">Time-to-live for vault tokens (e.g., 768h)</div>
          </div>
        </div>

        <div class="mt-3">
          <button class="btn btn-sm btn-danger" onclick="window.vaultManager.rotateMasterKey()">
            <i class="fas fa-sync"></i> Rotate Master Key Now
          </button>
        </div>
      </div>

      <hr class="my-4"/>

      <!-- Service URL Configuration -->
      <div class="mb-4">
        <h5 class="text-muted mb-3">
          <i class="fas fa-cog"></i> Service Configuration
        </h5>

        <div class="row g-3">
          <div class="col-12">
            <label class="form-label">Vault Service URL</label>
            <input type="url" class="form-control" id="vaultUrl"
                   value="${service.url}"
                   onchange="window.vaultManager.updateConfiguration()"/>
            <div class="form-text">URL of the exprsn-vault service</div>
          </div>

          <div class="col-12">
            <label class="form-label">Vault Token</label>
            <div class="input-group">
              <input type="password" class="form-control" id="vaultToken"
                     value="${service.token || ''}"
                     placeholder="${service.token ? 'Token configured' : 'Not configured'}"
                     readonly/>
              <span class="input-group-text">
                ${service.token ? '<i class="fas fa-check-circle text-success"></i>' :
                  '<i class="fas fa-exclamation-triangle text-warning"></i>'}
              </span>
            </div>
            <div class="form-text">Root token for vault administration (set in .env)</div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Test Vault connection
   */
  async testConnection() {
    try {
      const response = await fetch('/lowcode/setup-config/api/vault/test-connection', {
        method: 'POST'
      });
      const data = await response.json();

      if (data.success && data.connection.reachable) {
        alert(`✅ Connection Successful\n\nResponse Time: ${data.connection.responseTime}ms\nVersion: ${data.connection.version}\nSealed: ${data.connection.sealed ? 'Yes' : 'No'}\n\nAuthentication: ${data.authentication.authenticated ? 'Valid' : 'Not configured'}`);
      } else {
        alert(`❌ Connection Failed\n\n${data.error || data.connection.error}`);
      }
    } catch (error) {
      alert(`❌ Error\n\n${error.message}`);
    }
  }

  /**
   * Update Vault configuration
   */
  async updateConfiguration() {
    const updates = {
      url: document.getElementById('vaultUrl')?.value,
      storageBackend: document.getElementById('storageBackend')?.value,
      storagePath: document.getElementById('storagePath')?.value,
      keyRotationDays: parseInt(document.getElementById('keyRotationDays')?.value),
      tokenTTL: document.getElementById('tokenTTL')?.value
    };

    try {
      const response = await fetch('/lowcode/setup-config/api/vault/configuration', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      const data = await response.json();

      if (data.success) {
        console.log('[Vault Config] Configuration updated successfully');
        if (data.requiresRestart) {
          console.warn('[Vault Config] Server restart required for changes to take effect');
        }
      } else {
        alert(`❌ Update Failed\n\n${data.message}`);
      }
    } catch (error) {
      alert(`❌ Error\n\n${error.message}`);
    }
  }

  /**
   * Toggle audit logging
   */
  async toggleAuditLogging(enabled) {
    try {
      const response = await fetch('/lowcode/setup-config/api/vault/configuration', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auditLogging: enabled })
      });
      const data = await response.json();

      if (data.success) {
        console.log(`[Vault Config] Audit logging ${enabled ? 'enabled' : 'disabled'}`);
      } else {
        alert(`❌ Update Failed\n\n${data.message}`);
        // Revert checkbox
        document.getElementById('auditLogging').checked = !enabled;
      }
    } catch (error) {
      alert(`❌ Error\n\n${error.message}`);
      document.getElementById('auditLogging').checked = !enabled;
    }
  }

  /**
   * Toggle access policies
   */
  async toggleAccessPolicies(enabled) {
    try {
      const response = await fetch('/lowcode/setup-config/api/vault/configuration', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessPolicies: enabled })
      });
      const data = await response.json();

      if (data.success) {
        console.log(`[Vault Config] Access policies ${enabled ? 'enabled' : 'disabled'}`);
      } else {
        alert(`❌ Update Failed\n\n${data.message}`);
        document.getElementById('accessPolicies').checked = !enabled;
      }
    } catch (error) {
      alert(`❌ Error\n\n${error.message}`);
      document.getElementById('accessPolicies').checked = !enabled;
    }
  }

  /**
   * Seal the Vault
   */
  async sealVault() {
    if (!confirm('⚠️ WARNING: Sealing the vault will:\n\n• Encrypt all secrets\n• Require unseal keys to access\n• Interrupt all active connections\n\nAre you sure you want to seal the vault?')) {
      return;
    }

    try {
      const response = await fetch('/lowcode/setup-config/api/vault/seal', {
        method: 'POST'
      });
      const data = await response.json();

      if (data.success) {
        alert('✅ Vault Sealed Successfully\n\nAll secrets are now encrypted and inaccessible until the vault is unsealed.');
        await this.loadVaultConfiguration();
      } else {
        alert(`❌ Seal Failed\n\n${data.message}`);
      }
    } catch (error) {
      alert(`❌ Error\n\n${error.message}`);
    }
  }

  /**
   * Unseal the Vault
   */
  async unsealVault() {
    const unsealKey = prompt('Enter Unseal Key:\n\n⚠️ This key was provided when the vault was initialized.');

    if (!unsealKey) return;

    try {
      const response = await fetch('/lowcode/setup-config/api/vault/unseal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unsealKey })
      });
      const data = await response.json();

      if (data.success) {
        alert('✅ Vault Unsealed Successfully\n\nSecrets are now accessible.');
        await this.loadVaultConfiguration();
      } else {
        alert(`❌ Unseal Failed\n\n${data.message}`);
      }
    } catch (error) {
      alert(`❌ Error\n\n${error.message}`);
    }
  }

  /**
   * Rotate master encryption key
   */
  async rotateMasterKey() {
    if (!confirm('⚠️ Master Key Rotation\n\nThis will:\n• Generate a new master encryption key\n• Re-encrypt all secrets with the new key\n• May take several minutes\n\nContinue?')) {
      return;
    }

    try {
      const response = await fetch('/lowcode/setup-config/api/vault/rotate-master-key', {
        method: 'POST'
      });
      const data = await response.json();

      if (data.success) {
        alert(`✅ Master Key Rotation Initiated\n\nRotation ID: ${data.rotationId}\nTimestamp: ${data.timestamp}\n\nMonitor the vault logs for progress.`);
      } else {
        alert(`❌ Rotation Failed\n\n${data.message}`);
      }
    } catch (error) {
      alert(`❌ Error\n\n${error.message}`);
    }
  }

  /**
   * List secrets (metadata only)
   */
  async listSecrets() {
    try {
      const response = await fetch('/lowcode/setup-config/api/vault/secrets');
      const data = await response.json();

      if (data.success) {
        const secretsList = data.secrets.map(s => `• ${s.path} (Type: ${s.type || 'generic'})`).join('\n');
        alert(`Vault Secrets (${data.secrets.length} total):\n\n${secretsList || 'No secrets found'}`);
      } else {
        alert(`❌ Failed to list secrets\n\n${data.message}`);
      }
    } catch (error) {
      alert(`❌ Error\n\n${error.message}`);
    }
  }

  /**
   * Show error message
   */
  showError(message) {
    const container = document.getElementById('vaultConfigContent');
    if (container) {
      container.innerHTML = `
        <div class="alert alert-danger">
          <i class="fas fa-exclamation-triangle"></i>
          <strong>Error:</strong> ${message}
        </div>
      `;
    }
  }
}

// Global instance - attach to window for access from setup-manager.js
window.vaultManager = new VaultConfigManager();
