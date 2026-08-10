/**
 * ═══════════════════════════════════════════════════════════════════
 * CA & Auth Configuration Manager
 * Handles Certificate Authority and Authentication configuration UI
 * ═══════════════════════════════════════════════════════════════════
 */

class CAAuthConfigManager {
  constructor() {
    this.caConfig = null;
    this.authConfig = null;
  }

  /**
   * Initialize and render the CA & Auth panel
   */
  async render() {
    const container = document.getElementById('caAuthContainer');
    if (!container) return;

    container.innerHTML = `
      <div class="row g-4">
        <!-- CA Configuration Column -->
        <div class="col-md-6">
          <div class="config-section">
            <div class="config-section-title">
              <i class="fas fa-certificate"></i>
              Certificate Authority (CA)
            </div>

            <div id="caConfigContent">
              <div class="text-center py-5">
                <div class="spinner-border text-primary" role="status">
                  <span class="visually-hidden">Loading...</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Auth Configuration Column -->
        <div class="col-md-6">
          <div class="config-section">
            <div class="config-section-title">
              <i class="fas fa-key"></i>
              Authentication & SSO
            </div>

            <div id="authConfigContent">
              <div class="text-center py-5">
                <div class="spinner-border text-primary" role="status">
                  <span class="visually-hidden">Loading...</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Load both configurations
    await Promise.all([
      this.loadCAConfiguration(),
      this.loadAuthConfiguration()
    ]);
  }

  /**
   * Load CA Configuration
   */
  async loadCAConfiguration() {
    try {
      const response = await fetch('/lowcode/setup-config/api/ca/configuration');
      const data = await response.json();

      if (data.success) {
        this.caConfig = data.configuration;
        this.renderCAConfiguration();
      } else {
        this.showCAError(data.message || 'Failed to load CA configuration');
      }
    } catch (error) {
      console.error('[CA Config] Load error:', error);
      this.showCAError(error.message);
    }
  }

  /**
   * Render CA Configuration UI
   */
  renderCAConfiguration() {
    const container = document.getElementById('caConfigContent');
    if (!container || !this.caConfig) return;

    const { service, publicKey, validation, integration } = this.caConfig;

    container.innerHTML = `
      <!-- Service Status -->
      <div class="mb-4">
        <h5 class="text-muted mb-3"><i class="fas fa-heartbeat"></i> Service Status</h5>
        <div class="status-grid">
          <div class="status-item">
            <div class="status-label">Service URL</div>
            <div class="status-value">
              ${service.url}
              ${service.health.running ?
                '<span class="badge bg-success ms-2">Running</span>' :
                '<span class="badge bg-danger ms-2">Stopped</span>'}
            </div>
          </div>
          ${service.health.running ? `
            <div class="status-item">
              <div class="status-label">Response Time</div>
              <div class="status-value">${service.health.responseTime}ms</div>
            </div>
            <div class="status-item">
              <div class="status-label">Certificates</div>
              <div class="status-value">${service.health.certificates || 0}</div>
            </div>
            <div class="status-item">
              <div class="status-label">Tokens</div>
              <div class="status-value">${service.health.tokens || 0}</div>
            </div>
          ` : ''}
        </div>
        <div class="mt-3">
          <button class="btn btn-sm btn-outline-primary" onclick="caAuthManager.testCAConnection()">
            <i class="fas fa-plug"></i> Test Connection
          </button>
        </div>
      </div>

      <hr>

      <!-- Public Key Status -->
      <div class="mb-4">
        <h5 class="text-muted mb-3"><i class="fas fa-key"></i> Public Key</h5>
        ${publicKey.exists ? `
          <div class="status-grid">
            <div class="status-item">
              <div class="status-label">Path</div>
              <div class="status-value"><code>${publicKey.path}</code></div>
            </div>
            <div class="status-item">
              <div class="status-label">Size</div>
              <div class="status-value">${publicKey.size} bytes</div>
            </div>
            <div class="status-item">
              <div class="status-label">Fingerprint</div>
              <div class="status-value"><code class="text-xs">${publicKey.fingerprint}</code></div>
            </div>
            <div class="status-item">
              <div class="status-label">Modified</div>
              <div class="status-value">${new Date(publicKey.modified).toLocaleString()}</div>
            </div>
          </div>
        ` : `
          <div class="alert alert-warning">
            <i class="fas fa-exclamation-triangle"></i>
            Public key not found at <code>${publicKey.path}</code>
            <p class="mb-0 mt-2 small">Token validation will fail until the CA public key is configured.</p>
          </div>
        `}
      </div>

      <hr>

      <!-- Token Validation -->
      <div class="mb-4">
        <h5 class="text-muted mb-3"><i class="fas fa-shield-alt"></i> Token Validation</h5>
        <div class="form-check form-switch mb-3">
          <input class="form-check-input" type="checkbox" id="caVerifyTokens"
                 ${validation.enabled ? 'checked' : ''}
                 onchange="caAuthManager.toggleCAVerification(this.checked)">
          <label class="form-check-label" for="caVerifyTokens">
            Enable Token Signature Verification
          </label>
        </div>
        <div class="form-check form-switch mb-3">
          <input class="form-check-input" type="checkbox" id="caDevBypass"
                 ${validation.devBypass ? 'checked' : ''}
                 onchange="caAuthManager.toggleCADevBypass(this.checked)">
          <label class="form-check-label" for="caDevBypass">
            Development Bypass (disable validation)
            <small class="text-danger d-block">⚠️ Never enable in production!</small>
          </label>
        </div>
      </div>

      <hr>

      <!-- Integration -->
      <div class="mb-4">
        <h5 class="text-muted mb-3"><i class="fas fa-network-wired"></i> Integration</h5>
        <div class="form-check form-switch mb-3">
          <input class="form-check-input" type="checkbox" id="lowCodeDevAuth"
                 ${integration.lowCodeDevAuth ? 'checked' : ''}
                 onchange="caAuthManager.toggleLowCodeDevAuth(this.checked)">
          <label class="form-check-label" for="lowCodeDevAuth">
            Low-Code Dev Mode (bypass authentication)
            <small class="text-danger d-block">⚠️ Development only!</small>
          </label>
        </div>

        ${integration.servicesUsingCA.length > 0 ? `
          <div class="mt-3">
            <div class="small text-muted mb-2">Services using CA:</div>
            <div class="d-flex flex-wrap gap-2">
              ${integration.servicesUsingCA.map(s =>
                `<span class="badge bg-info">${s.name}</span>`
              ).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * Show CA Error
   */
  showCAError(message) {
    const container = document.getElementById('caConfigContent');
    if (!container) return;

    container.innerHTML = `
      <div class="alert alert-danger">
        <i class="fas fa-exclamation-circle"></i>
        <strong>Error:</strong> ${message}
      </div>
    `;
  }

  /**
   * Load Auth Configuration
   */
  async loadAuthConfiguration() {
    try {
      const response = await fetch('/lowcode/setup-config/api/auth/configuration');
      const data = await response.json();

      if (data.success) {
        this.authConfig = data.configuration;
        this.renderAuthConfiguration();
      } else {
        this.showAuthError(data.message || 'Failed to load Auth configuration');
      }
    } catch (error) {
      console.error('[Auth Config] Load error:', error);
      this.showAuthError(error.message);
    }
  }

  /**
   * Render Auth Configuration UI
   */
  renderAuthConfiguration() {
    const container = document.getElementById('authConfigContent');
    if (!container || !this.authConfig) return;

    const { service, session, jwt, security, features, integration } = this.authConfig;

    container.innerHTML = `
      <!-- Service Status -->
      <div class="mb-4">
        <h5 class="text-muted mb-3"><i class="fas fa-heartbeat"></i> Service Status</h5>
        <div class="status-grid">
          <div class="status-item">
            <div class="status-label">Port</div>
            <div class="status-value">
              ${service.port}
              ${service.health.running ?
                '<span class="badge bg-success ms-2">Running</span>' :
                '<span class="badge bg-danger ms-2">Stopped</span>'}
            </div>
          </div>
          ${service.health.running ? `
            <div class="status-item">
              <div class="status-label">Response Time</div>
              <div class="status-value">${service.health.responseTime}ms</div>
            </div>
            <div class="status-item">
              <div class="status-label">Users</div>
              <div class="status-value">${service.health.users || 0}</div>
            </div>
            <div class="status-item">
              <div class="status-label">Sessions</div>
              <div class="status-value">${service.health.sessions || 0}</div>
            </div>
          ` : ''}
        </div>
        <div class="mt-3">
          <button class="btn btn-sm btn-outline-primary" onclick="caAuthManager.testAuthConnection()">
            <i class="fas fa-plug"></i> Test Connection
          </button>
        </div>
      </div>

      <hr>

      <!-- Session Configuration -->
      <div class="mb-4">
        <h5 class="text-muted mb-3"><i class="fas fa-clock"></i> Session Configuration</h5>
        <div class="status-grid">
          <div class="status-item">
            <div class="status-label">Secret</div>
            <div class="status-value"><code>${session.secret || 'Not configured'}</code></div>
          </div>
          <div class="status-item">
            <div class="status-label">Max Age</div>
            <div class="status-value">${session.maxAge / 1000 / 60 / 60} hours</div>
          </div>
        </div>
        <div class="mt-3">
          <button class="btn btn-sm btn-outline-secondary" onclick="caAuthManager.generateSecrets()">
            <i class="fas fa-random"></i> Generate New Secrets
          </button>
        </div>
      </div>

      <hr>

      <!-- JWT Configuration -->
      <div class="mb-4">
        <h5 class="text-muted mb-3"><i class="fas fa-id-card"></i> JWT Configuration</h5>
        <div class="status-grid">
          <div class="status-item">
            <div class="status-label">Secret</div>
            <div class="status-value"><code>${jwt.secret || 'Not configured'}</code></div>
          </div>
          <div class="status-item">
            <div class="status-label">Expires In</div>
            <div class="status-value">${jwt.expiresIn}</div>
          </div>
        </div>
      </div>

      <hr>

      <!-- Security -->
      <div class="mb-4">
        <h5 class="text-muted mb-3"><i class="fas fa-lock"></i> Security Features</h5>
        <div class="form-check form-switch mb-2">
          <input class="form-check-input" type="checkbox" id="sqlInjectionDetection"
                 ${security.sqlInjectionDetection ? 'checked' : ''}
                 onchange="caAuthManager.toggleSecurity('sqlInjectionDetection', this.checked)">
          <label class="form-check-label" for="sqlInjectionDetection">
            SQL Injection Detection
          </label>
        </div>
        <div class="form-check form-switch mb-2">
          <input class="form-check-input" type="checkbox" id="xssProtection"
                 ${security.xssProtection ? 'checked' : ''}
                 onchange="caAuthManager.toggleSecurity('xssProtection', this.checked)">
          <label class="form-check-label" for="xssProtection">
            XSS Protection
          </label>
        </div>
        ${security.allowedOrigins.length > 0 ? `
          <div class="mt-3">
            <div class="small text-muted mb-2">Allowed Origins:</div>
            <div class="d-flex flex-wrap gap-2">
              ${security.allowedOrigins.map(origin =>
                `<span class="badge bg-secondary">${origin}</span>`
              ).join('')}
            </div>
          </div>
        ` : ''}
      </div>

      <hr>

      <!-- Features -->
      <div class="mb-4">
        <h5 class="text-muted mb-3"><i class="fas fa-star"></i> Authentication Features</h5>

        <div class="mb-3">
          <h6 class="text-secondary mb-2">OAuth 2.0</h6>
          <div class="d-flex flex-wrap gap-2">
            ${features.oauth.providers.map(p =>
              `<span class="badge bg-success">${p.charAt(0).toUpperCase() + p.slice(1)}</span>`
            ).join('')}
          </div>
        </div>

        <div class="mb-3">
          <h6 class="text-secondary mb-2">SAML 2.0</h6>
          ${features.saml.enabled ?
            '<span class="badge bg-success">Enabled</span>' :
            '<span class="badge bg-secondary">Disabled</span>'}
        </div>

        <div class="mb-3">
          <h6 class="text-secondary mb-2">Multi-Factor Authentication (MFA)</h6>
          <div class="d-flex flex-wrap gap-2">
            ${features.mfa.methods.map(m =>
              `<span class="badge bg-info">${m.toUpperCase()}</span>`
            ).join('')}
          </div>
        </div>
      </div>

      <hr>

      <!-- Integration -->
      <div class="mb-4">
        <h5 class="text-muted mb-3"><i class="fas fa-network-wired"></i> Integration</h5>
        <div class="form-check form-switch mb-3">
          <input class="form-check-input" type="checkbox" id="authLowCodeDevMode"
                 ${integration.lowCodeDevMode ? 'checked' : ''} disabled>
          <label class="form-check-label" for="authLowCodeDevMode">
            Low-Code Dev Mode (controlled by CA config)
          </label>
        </div>

        ${integration.servicesUsingAuth.length > 0 ? `
          <div class="mt-3">
            <div class="small text-muted mb-2">Services using Auth:</div>
            <div class="d-flex flex-wrap gap-2">
              ${integration.servicesUsingAuth.map(s =>
                `<span class="badge bg-info">${s.name}</span>`
              ).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * Show Auth Error
   */
  showAuthError(message) {
    const container = document.getElementById('authConfigContent');
    if (!container) return;

    container.innerHTML = `
      <div class="alert alert-danger">
        <i class="fas fa-exclamation-circle"></i>
        <strong>Error:</strong> ${message}
      </div>
    `;
  }

  /**
   * Test CA Connection
   */
  async testCAConnection() {
    try {
      const response = await fetch('/lowcode/setup-config/api/ca/test-connection', {
        method: 'POST'
      });
      const data = await response.json();

      if (data.success) {
        alert(`✅ CA Connection Successful\n\nResponse Time: ${data.responseTime}ms\nVersion: ${data.version}\n\n${data.message}`);
      } else {
        alert(`❌ CA Connection Failed\n\n${data.message || data.error}`);
      }
    } catch (error) {
      alert(`❌ Connection Error\n\n${error.message}`);
    }
  }

  /**
   * Test Auth Connection
   */
  async testAuthConnection() {
    try {
      const response = await fetch('/lowcode/setup-config/api/auth/test-connection', {
        method: 'POST'
      });
      const data = await response.json();

      if (data.success) {
        alert(`✅ Auth Connection Successful\n\nResponse Time: ${data.responseTime}ms\nVersion: ${data.version}\n\n${data.message}`);
      } else {
        alert(`❌ Auth Connection Failed\n\n${data.message || data.error}`);
      }
    } catch (error) {
      alert(`❌ Connection Error\n\n${error.message}`);
    }
  }

  /**
   * Toggle CA Token Verification
   */
  async toggleCAVerification(enabled) {
    try {
      const response = await fetch('/lowcode/setup-config/api/ca/configuration', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verifyTokens: enabled })
      });
      const data = await response.json();

      if (data.success) {
        alert(`✅ Configuration Updated\n\n${data.message}`);
        await this.loadCAConfiguration();
      } else {
        alert(`❌ Update Failed\n\n${data.message}`);
      }
    } catch (error) {
      alert(`❌ Error\n\n${error.message}`);
    }
  }

  /**
   * Toggle CA Dev Bypass
   */
  async toggleCADevBypass(enabled) {
    try {
      const response = await fetch('/lowcode/setup-config/api/ca/configuration', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devBypass: enabled })
      });
      const data = await response.json();

      if (data.success) {
        alert(`✅ Configuration Updated\n\n${data.message}`);
        await this.loadCAConfiguration();
      } else {
        alert(`❌ Update Failed\n\n${data.message}`);
      }
    } catch (error) {
      alert(`❌ Error\n\n${error.message}`);
    }
  }

  /**
   * Toggle Low-Code Dev Auth
   */
  async toggleLowCodeDevAuth(enabled) {
    try {
      const response = await fetch('/lowcode/setup-config/api/ca/configuration', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lowCodeDevAuth: enabled })
      });
      const data = await response.json();

      if (data.success) {
        alert(`✅ Configuration Updated\n\n${data.message}`);
        await Promise.all([
          this.loadCAConfiguration(),
          this.loadAuthConfiguration()
        ]);
      } else {
        alert(`❌ Update Failed\n\n${data.message}`);
      }
    } catch (error) {
      alert(`❌ Error\n\n${error.message}`);
    }
  }

  /**
   * Toggle Security Feature
   */
  async toggleSecurity(feature, enabled) {
    try {
      const updates = {};
      if (feature === 'sqlInjectionDetection') {
        updates.enableSQLInjectionDetection = enabled;
      } else if (feature === 'xssProtection') {
        updates.enableXSSProtection = enabled;
      }

      const response = await fetch('/lowcode/setup-config/api/auth/configuration', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      const data = await response.json();

      if (data.success) {
        alert(`✅ Configuration Updated\n\n${data.message}`);
        await this.loadAuthConfiguration();
      } else {
        alert(`❌ Update Failed\n\n${data.message}`);
      }
    } catch (error) {
      alert(`❌ Error\n\n${error.message}`);
    }
  }

  /**
   * Generate New Secrets
   */
  async generateSecrets() {
    if (!confirm('⚠️ This will generate new session and JWT secrets.\n\nAll existing sessions will be invalidated!\n\nContinue?')) {
      return;
    }

    try {
      const response = await fetch('/lowcode/setup-config/api/auth/generate-secrets', {
        method: 'POST'
      });
      const data = await response.json();

      if (data.success) {
        const { sessionSecret, jwtSecret, timestamp } = data.secrets;

        const secretsText = `
Session Secret:
${sessionSecret}

JWT Secret:
${jwtSecret}

Generated: ${timestamp}

⚠️ Copy these secrets and update your .env file manually.
The server must be restarted to apply the changes.
        `.trim();

        // Show in a modal or copy to clipboard
        prompt('Generated Secrets (copy to .env file):', secretsText);
      } else {
        alert(`❌ Failed to generate secrets\n\n${data.message}`);
      }
    } catch (error) {
      alert(`❌ Error\n\n${error.message}`);
    }
  }
}

// Global instance - attach to window for access from setup-manager.js
window.caAuthManager = new CAAuthConfigManager();
