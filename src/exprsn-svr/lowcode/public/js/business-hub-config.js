/**
 * Business Hub (exprsn-svr) Configuration Manager
 *
 * Provides UI and API interaction for configuring the Business Hub service,
 * managing Low-Code platform, Forge CRM/ERP/Groupware, database, and features.
 */

class BusinessHubConfigManager {
  constructor() {
    this.businessHubConfig = null;
  }

  /**
   * Load Business Hub configuration from the API
   */
  async loadBusinessHubConfiguration() {
    const container = document.getElementById('businessHubConfigContent');

    if (!container) {
      console.error('[Business Hub Config] Container not found');
      return;
    }

    try {
      container.innerHTML = `
        <div class="text-center py-5">
          <div class="spinner-border text-primary" role="status">
            <span class="visibly-hidden">Loading...</span>
          </div>
          <p class="mt-3 text-muted">Loading Business Hub configuration...</p>
        </div>
      `;

      const response = await fetch('/lowcode/setup-config/api/business-hub/configuration');
      const data = await response.json();

      if (data.success) {
        this.businessHubConfig = data.configuration;
        this.renderBusinessHubConfiguration();
      } else {
        this.showError(data.message || 'Failed to load Business Hub configuration');
      }
    } catch (error) {
      console.error('[Business Hub Config] Load error:', error);
      this.showError(error.message);
    }
  }

  /**
   * Render the Business Hub configuration UI
   */
  renderBusinessHubConfiguration() {
    const container = document.getElementById('businessHubConfigContent');
    if (!container) return;

    const config = this.businessHubConfig;

    container.innerHTML = `
      <div class="business-hub-config">
        <!-- Service Status -->
        <div class="card mb-3">
          <div class="card-header bg-success text-white">
            <h6 class="mb-0">
              <i class="fas fa-server"></i> Business Hub Status
            </h6>
          </div>
          <div class="card-body">
            <div class="row">
              <div class="col-md-3 text-center">
                <div class="p-3">
                  <i class="fas fa-check-circle text-success" style="font-size: 2rem;"></i>
                  <div class="mt-2 fw-bold">Running</div>
                  <small class="text-muted">Status</small>
                </div>
              </div>
              <div class="col-md-3 text-center">
                <div class="p-3">
                  <i class="fas fa-network-wired text-info" style="font-size: 2rem;"></i>
                  <div class="mt-2 fw-bold">${config.service.health.port}</div>
                  <small class="text-muted">Port</small>
                </div>
              </div>
              <div class="col-md-3 text-center">
                <div class="p-3">
                  <i class="fas fa-lock text-warning" style="font-size: 2rem;"></i>
                  <div class="mt-2 fw-bold">${config.service.health.protocol.toUpperCase()}</div>
                  <small class="text-muted">Protocol</small>
                </div>
              </div>
              <div class="col-md-3 text-center">
                <div class="p-3">
                  <i class="fas fa-code-branch text-primary" style="font-size: 2rem;"></i>
                  <div class="mt-2 fw-bold">${config.service.health.environment}</div>
                  <small class="text-muted">Environment</small>
                </div>
              </div>
            </div>

            <div class="mt-3">
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" id="devAuthEnabled"
                       ${config.service.devAuthEnabled ? 'checked' : ''}>
                <label class="form-check-label" for="devAuthEnabled">
                  <i class="fas fa-shield-alt text-danger"></i> Enable Dev Auth (Bypass authentication in development)
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- Low-Code Platform -->
        <div class="card mb-3">
          <div class="card-header">
            <h6 class="mb-0">
              <i class="fas fa-magic"></i> Low-Code Platform
            </h6>
          </div>
          <div class="card-body">
            <div class="alert alert-info">
              <i class="fas fa-info-circle"></i> Low-Code Platform is always enabled in exprsn-svr
            </div>

            <div class="row">
              <div class="col-md-6">
                <div class="form-check form-switch mb-3">
                  <input class="form-check-input" type="checkbox" id="entityDesigner"
                         ${config.lowcode.entityDesigner ? 'checked' : ''}>
                  <label class="form-check-label" for="entityDesigner">
                    <i class="fas fa-database text-primary"></i> Entity Designer
                    <br><small class="text-muted">Visual database schema designer</small>
                  </label>
                </div>
              </div>
              <div class="col-md-6">
                <div class="form-check form-switch mb-3">
                  <input class="form-check-input" type="checkbox" id="formDesigner"
                         ${config.lowcode.formDesigner ? 'checked' : ''}>
                  <label class="form-check-label" for="formDesigner">
                    <i class="fas fa-wpforms text-success"></i> Form Designer
                    <br><small class="text-muted">27-component form builder</small>
                  </label>
                </div>
              </div>
            </div>

            <div class="row">
              <div class="col-md-6">
                <div class="form-check form-switch mb-3">
                  <input class="form-check-input" type="checkbox" id="gridDesigner"
                         ${config.lowcode.gridDesigner ? 'checked' : ''}>
                  <label class="form-check-label" for="gridDesigner">
                    <i class="fas fa-table text-info"></i> Grid Designer
                    <br><small class="text-muted">Data grid configuration tool</small>
                  </label>
                </div>
              </div>
              <div class="col-md-6">
                <div class="form-check form-switch mb-3">
                  <input class="form-check-input" type="checkbox" id="apiBuilder"
                         ${config.lowcode.apiBuilder ? 'checked' : ''}>
                  <label class="form-check-label" for="apiBuilder">
                    <i class="fas fa-code text-warning"></i> API Builder
                    <br><small class="text-muted">RESTful API generator</small>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Forge Platform -->
        <div class="card mb-3">
          <div class="card-header">
            <h6 class="mb-0">
              <i class="fas fa-industry"></i> Forge Business Platform
            </h6>
          </div>
          <div class="card-body">
            <div class="mb-3">
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" id="forgeEnabled"
                       ${config.forge.enabled ? 'checked' : ''}>
                <label class="form-check-label" for="forgeEnabled">
                  <strong>Enable Forge Platform</strong>
                  <br><small class="text-muted">CRM, ERP, and Groupware applications</small>
                </label>
              </div>
            </div>

            <!-- CRM -->
            <div class="border rounded p-3 mb-3">
              <div class="d-flex justify-content-between align-items-center mb-3">
                <div>
                  <h6 class="mb-0">
                    <i class="fas fa-users text-primary"></i> Customer Relationship Management (CRM)
                  </h6>
                </div>
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" id="forgeCrmEnabled"
                         ${config.forge.crm.enabled ? 'checked' : ''}>
                  <label class="form-check-label" for="forgeCrmEnabled">Enabled</label>
                </div>
              </div>
              <div class="row">
                <div class="col-md-12">
                  <small class="text-muted">
                    <strong>Modules:</strong> ${config.forge.crm.modules.join(', ')}
                  </small>
                </div>
              </div>
            </div>

            <!-- ERP -->
            <div class="border rounded p-3 mb-3">
              <div class="d-flex justify-content-between align-items-center mb-3">
                <div>
                  <h6 class="mb-0">
                    <i class="fas fa-chart-line text-success"></i> Enterprise Resource Planning (ERP)
                  </h6>
                </div>
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" id="forgeErpEnabled"
                         ${config.forge.erp.enabled ? 'checked' : ''}>
                  <label class="form-check-label" for="forgeErpEnabled">Enabled</label>
                </div>
              </div>
              <div class="row">
                <div class="col-md-12">
                  <small class="text-muted">
                    <strong>Modules:</strong> ${config.forge.erp.modules.join(', ')}
                  </small>
                </div>
              </div>
            </div>

            <!-- Groupware -->
            <div class="border rounded p-3">
              <div class="d-flex justify-content-between align-items-center mb-3">
                <div>
                  <h6 class="mb-0">
                    <i class="fas fa-sitemap text-info"></i> Groupware & Collaboration
                  </h6>
                </div>
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" id="forgeGroupwareEnabled"
                         ${config.forge.groupware.enabled ? 'checked' : ''}>
                  <label class="form-check-label" for="forgeGroupwareEnabled">Enabled</label>
                </div>
              </div>
              <div class="row">
                <div class="col-md-12">
                  <small class="text-muted">
                    <strong>Modules:</strong> ${config.forge.groupware.modules.join(', ')}
                  </small>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Database Configuration -->
        <div class="card mb-3">
          <div class="card-header">
            <h6 class="mb-0">
              <i class="fas fa-database"></i> PostgreSQL Database
            </h6>
          </div>
          <div class="card-body">
            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label">Database Host</label>
                <input type="text" class="form-control" id="dbHost"
                       value="${config.database.host}" placeholder="localhost">
              </div>
              <div class="col-md-6 mb-3">
                <label class="form-label">Database Port</label>
                <input type="number" class="form-control" id="dbPort"
                       value="${config.database.port}" placeholder="5432">
              </div>
            </div>

            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label">Database Name</label>
                <input type="text" class="form-control" id="dbName"
                       value="${config.database.name}" placeholder="exprsn_svr">
              </div>
              <div class="col-md-6 mb-3">
                <label class="form-label">Connection Pool Size</label>
                <input type="number" class="form-control" id="dbPoolSize"
                       value="${config.database.poolSize}" min="1" max="100" placeholder="10">
                <small class="text-muted">Number of concurrent database connections</small>
              </div>
            </div>
          </div>
        </div>

        <!-- Redis Configuration -->
        <div class="card mb-3">
          <div class="card-header">
            <h6 class="mb-0">
              <i class="fas fa-memory"></i> Redis Cache
            </h6>
          </div>
          <div class="card-body">
            <div class="mb-3">
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" id="redisEnabled"
                       ${config.redis.enabled ? 'checked' : ''}>
                <label class="form-check-label" for="redisEnabled">
                  <strong>Enable Redis Cache</strong>
                  <br><small class="text-muted">High-performance caching and session storage</small>
                </label>
              </div>
            </div>

            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label">Redis Host</label>
                <input type="text" class="form-control" id="redisHost"
                       value="${config.redis.host}" placeholder="localhost">
              </div>
              <div class="col-md-6 mb-3">
                <label class="form-label">Redis Port</label>
                <input type="number" class="form-control" id="redisPort"
                       value="${config.redis.port}" placeholder="6379">
              </div>
            </div>
          </div>
        </div>

        <!-- Platform Features -->
        <div class="card mb-3">
          <div class="card-header">
            <h6 class="mb-0">
              <i class="fas fa-puzzle-piece"></i> Platform Features
            </h6>
          </div>
          <div class="card-body">
            <div class="row">
              <div class="col-md-6">
                <div class="form-check form-switch mb-3">
                  <input class="form-check-input" type="checkbox" id="socketIO"
                         ${config.features.socketIO ? 'checked' : ''}>
                  <label class="form-check-label" for="socketIO">
                    <i class="fas fa-bolt text-warning"></i> Socket.IO Real-time
                    <br><small class="text-muted">WebSocket connections for live updates</small>
                  </label>
                </div>
              </div>
              <div class="col-md-6">
                <div class="form-check form-switch mb-3">
                  <input class="form-check-input" type="checkbox" id="plugins"
                         ${config.features.plugins ? 'checked' : ''}>
                  <label class="form-check-label" for="plugins">
                    <i class="fas fa-plug text-primary"></i> Plugin System
                    <br><small class="text-muted">Extensibility via plugins</small>
                  </label>
                </div>
              </div>
            </div>

            <div class="row">
              <div class="col-md-6">
                <div class="form-check form-switch mb-3">
                  <input class="form-check-input" type="checkbox" id="workflows"
                         ${config.features.workflows ? 'checked' : ''}>
                  <label class="form-check-label" for="workflows">
                    <i class="fas fa-project-diagram text-info"></i> Workflow Integration
                    <br><small class="text-muted">Connect to Workflow Automation service</small>
                  </label>
                </div>
              </div>
              <div class="col-md-6">
                <div class="form-check form-switch mb-3">
                  <input class="form-check-input" type="checkbox" id="notifications"
                         ${config.features.notifications ? 'checked' : ''}>
                  <label class="form-check-label" for="notifications">
                    <i class="fas fa-bell text-success"></i> Notification Integration
                    <br><small class="text-muted">Connect to Herald notification service</small>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Save Button -->
        <div class="text-end">
          <button class="btn btn-primary" onclick="businessHubManager.saveConfiguration()">
            <i class="fas fa-save"></i> Save Configuration
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Save Business Hub configuration
   */
  async saveConfiguration() {
    try {
      const config = {
        service: {
          devAuthEnabled: document.getElementById('devAuthEnabled').checked
        },
        lowcode: {
          entityDesigner: document.getElementById('entityDesigner').checked,
          formDesigner: document.getElementById('formDesigner').checked,
          gridDesigner: document.getElementById('gridDesigner').checked,
          apiBuilder: document.getElementById('apiBuilder').checked
        },
        forge: {
          enabled: document.getElementById('forgeEnabled').checked,
          crm: {
            enabled: document.getElementById('forgeCrmEnabled').checked
          },
          erp: {
            enabled: document.getElementById('forgeErpEnabled').checked
          },
          groupware: {
            enabled: document.getElementById('forgeGroupwareEnabled').checked
          }
        },
        database: {
          host: document.getElementById('dbHost').value,
          port: parseInt(document.getElementById('dbPort').value),
          name: document.getElementById('dbName').value,
          poolSize: parseInt(document.getElementById('dbPoolSize').value)
        },
        redis: {
          enabled: document.getElementById('redisEnabled').checked,
          host: document.getElementById('redisHost').value,
          port: parseInt(document.getElementById('redisPort').value)
        },
        features: {
          socketIO: document.getElementById('socketIO').checked,
          plugins: document.getElementById('plugins').checked,
          workflows: document.getElementById('workflows').checked,
          notifications: document.getElementById('notifications').checked
        }
      };

      const response = await fetch('/lowcode/setup-config/api/business-hub/configuration', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      const data = await response.json();

      if (data.success) {
        alert('✅ Business Hub Configuration Saved\n\n' +
              (data.requiresRestart ? 'Server restart required for changes to take effect.' : 'Changes applied.'));
        await this.loadBusinessHubConfiguration();
      } else {
        alert('❌ Error\n\n' + (data.message || 'Failed to save configuration'));
      }
    } catch (error) {
      console.error('[Business Hub Config] Save error:', error);
      alert('❌ Error\n\n' + error.message);
    }
  }

  /**
   * Show error message
   */
  showError(message) {
    const container = document.getElementById('businessHubConfigContent');
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

// Initialize global instance
window.businessHubManager = new BusinessHubConfigManager();
