/**
 * Setup (Service Discovery) Configuration Manager
 *
 * Provides UI and API interaction for configuring the Setup service discovery system,
 * managing service registry, health checks, and monitoring.
 */

class SetupServiceConfigManager {
  constructor() {
    this.setupConfig = null;
  }

  /**
   * Load Setup configuration from the API
   */
  async loadSetupServiceConfiguration() {
    const container = document.getElementById('setupServiceConfigContent');

    if (!container) {
      console.error('[Setup Service Config] Container not found');
      return;
    }

    try {
      container.innerHTML = `
        <div class="text-center py-5">
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
          <p class="mt-3 text-muted">Loading Setup service configuration...</p>
        </div>
      `;

      const response = await fetch('/lowcode/setup-config/api/setup/configuration');
      const data = await response.json();

      if (data.success) {
        this.setupConfig = data.configuration;
        this.renderSetupServiceConfiguration();
      } else {
        this.showError(data.message || 'Failed to load Setup configuration');
      }
    } catch (error) {
      console.error('[Setup Service Config] Load error:', error);
      this.showError(error.message);
    }
  }

  /**
   * Render the Setup service configuration UI
   */
  renderSetupServiceConfiguration() {
    const container = document.getElementById('setupServiceConfigContent');
    if (!container) return;

    const config = this.setupConfig;
    const isRunning = config.service.health.running;

    container.innerHTML = `
      <div class="setup-service-config">
        <!-- Service Health -->
        <div class="card mb-3">
          <div class="card-header bg-primary text-white">
            <h6 class="mb-0">
              <i class="fas fa-heartbeat"></i> Service Health
            </h6>
          </div>
          <div class="card-body">
            <div class="row">
              <div class="col-md-3">
                <div class="text-center p-3">
                  <div class="mb-2">
                    <i class="fas fa-${isRunning ? 'check-circle text-success' : 'times-circle text-danger'}" style="font-size: 2rem;"></i>
                  </div>
                  <div class="fw-bold">${isRunning ? 'Running' : 'Stopped'}</div>
                  <small class="text-muted">Status</small>
                </div>
              </div>
              <div class="col-md-3">
                <div class="text-center p-3">
                  <div class="mb-2">
                    <i class="fas fa-clock text-info" style="font-size: 2rem;"></i>
                  </div>
                  <div class="fw-bold">${isRunning ? config.service.health.responseTime + 'ms' : 'N/A'}</div>
                  <small class="text-muted">Response Time</small>
                </div>
              </div>
              <div class="col-md-3">
                <div class="text-center p-3">
                  <div class="mb-2">
                    <i class="fas fa-network-wired text-warning" style="font-size: 2rem;"></i>
                  </div>
                  <div class="fw-bold">${isRunning ? config.service.health.registeredServices : 'N/A'}</div>
                  <small class="text-muted">Registered Services</small>
                </div>
              </div>
              <div class="col-md-3">
                <div class="text-center p-3">
                  <div class="mb-2">
                    <i class="fas fa-check-double text-success" style="font-size: 2rem;"></i>
                  </div>
                  <div class="fw-bold">${isRunning ? config.service.health.healthyServices : 'N/A'}</div>
                  <small class="text-muted">Healthy Services</small>
                </div>
              </div>
            </div>

            <div class="mt-3">
              <button class="btn btn-sm btn-outline-primary" onclick="setupServiceManager.testConnection()">
                <i class="fas fa-plug"></i> Test Connection
              </button>
              <button class="btn btn-sm btn-outline-secondary ms-2" onclick="setupServiceManager.loadSetupServiceConfiguration()">
                <i class="fas fa-sync-alt"></i> Refresh
              </button>
            </div>
          </div>
        </div>

        <!-- Service Connection -->
        <div class="card mb-3">
          <div class="card-header">
            <h6 class="mb-0">
              <i class="fas fa-link"></i> Service Connection
            </h6>
          </div>
          <div class="card-body">
            <div class="mb-3">
              <label class="form-label">Service URL</label>
              <input type="text" class="form-control" id="setupUrl"
                     value="${config.service.url}" placeholder="http://localhost:3015">
              <small class="text-muted">Base URL for Setup service discovery</small>
            </div>
            <div class="mb-3">
              <label class="form-label">API Key</label>
              <input type="password" class="form-control" id="setupApiKey"
                     value="${config.service.apiKey || ''}" placeholder="Enter API key">
              <small class="text-muted">Authentication key for Setup API</small>
            </div>
          </div>
        </div>

        <!-- Service Discovery Settings -->
        <div class="card mb-3">
          <div class="card-header">
            <h6 class="mb-0">
              <i class="fas fa-radar"></i> Service Discovery Settings
            </h6>
          </div>
          <div class="card-body">
            <div class="mb-3">
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" id="setupDiscoveryEnabled"
                       ${config.discovery.enabled ? 'checked' : ''}>
                <label class="form-check-label" for="setupDiscoveryEnabled">
                  <strong>Enable Service Discovery</strong>
                  <br><small class="text-muted">Automatically discover and register services</small>
                </label>
              </div>
            </div>

            <div class="row">
              <div class="col-md-4 mb-3">
                <label class="form-label">Heartbeat Interval (seconds)</label>
                <input type="number" class="form-control" id="setupHeartbeatInterval"
                       value="${config.discovery.heartbeatInterval}" min="5" max="300">
                <small class="text-muted">How often services send heartbeats</small>
              </div>
              <div class="col-md-4 mb-3">
                <label class="form-label">Health Check Interval (seconds)</label>
                <input type="number" class="form-control" id="setupHealthCheckInterval"
                       value="${config.discovery.healthCheckInterval}" min="10" max="600">
                <small class="text-muted">How often to check service health</small>
              </div>
              <div class="col-md-4 mb-3">
                <label class="form-label">Discovery Timeout (seconds)</label>
                <input type="number" class="form-control" id="setupDiscoveryTimeout"
                       value="${config.discovery.timeout}" min="1" max="30">
                <small class="text-muted">Health check request timeout</small>
              </div>
            </div>
          </div>
        </div>

        <!-- Service Registry Settings -->
        <div class="card mb-3">
          <div class="card-header">
            <h6 class="mb-0">
              <i class="fas fa-book"></i> Service Registry Settings
            </h6>
          </div>
          <div class="card-body">
            <div class="row">
              <div class="col-md-6">
                <div class="form-check form-switch mb-3">
                  <input class="form-check-input" type="checkbox" id="setupPersistRegistry"
                         ${config.registry.persistToDatabase ? 'checked' : ''}>
                  <label class="form-check-label" for="setupPersistRegistry">
                    <i class="fas fa-database text-primary"></i> Persist Registry to Database
                    <br><small class="text-muted">Save service registry in PostgreSQL</small>
                  </label>
                </div>
              </div>
              <div class="col-md-6">
                <div class="form-check form-switch mb-3">
                  <input class="form-check-input" type="checkbox" id="setupCacheEnabled"
                         ${config.registry.cacheEnabled ? 'checked' : ''}>
                  <label class="form-check-label" for="setupCacheEnabled">
                    <i class="fas fa-bolt text-warning"></i> Enable Registry Cache
                    <br><small class="text-muted">Cache service info in Redis</small>
                  </label>
                </div>
              </div>
            </div>

            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label">Cache TTL (seconds)</label>
                <input type="number" class="form-control" id="setupCacheTTL"
                       value="${config.registry.cacheTTL}" min="60" max="3600">
                <small class="text-muted">How long to cache service info</small>
              </div>
            </div>
          </div>
        </div>

        <!-- Monitoring Settings -->
        <div class="card mb-3">
          <div class="card-header">
            <h6 class="mb-0">
              <i class="fas fa-chart-line"></i> Monitoring & Alerts
            </h6>
          </div>
          <div class="card-body">
            <div class="row">
              <div class="col-md-6">
                <div class="form-check form-switch mb-3">
                  <input class="form-check-input" type="checkbox" id="setupMetricsEnabled"
                         ${config.monitoring.metricsEnabled ? 'checked' : ''}>
                  <label class="form-check-label" for="setupMetricsEnabled">
                    <i class="fas fa-chart-bar text-info"></i> Enable Metrics Collection
                    <br><small class="text-muted">Track service performance metrics</small>
                  </label>
                </div>
              </div>
              <div class="col-md-6">
                <div class="form-check form-switch mb-3">
                  <input class="form-check-input" type="checkbox" id="setupAlertsEnabled"
                         ${config.monitoring.alertsEnabled ? 'checked' : ''}>
                  <label class="form-check-label" for="setupAlertsEnabled">
                    <i class="fas fa-bell text-danger"></i> Enable Health Alerts
                    <br><small class="text-muted">Send alerts when services are unhealthy</small>
                  </label>
                </div>
              </div>
            </div>

            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label">Alert Email</label>
                <input type="email" class="form-control" id="setupAlertEmail"
                       value="${config.monitoring.alertEmail}" placeholder="admin@exprsn.io">
                <small class="text-muted">Where to send health alerts</small>
              </div>
              <div class="col-md-6 mb-3">
                <div class="form-check form-switch mt-4">
                  <input class="form-check-input" type="checkbox" id="setupDashboardEnabled"
                         ${config.monitoring.dashboardEnabled ? 'checked' : ''}>
                  <label class="form-check-label" for="setupDashboardEnabled">
                    <i class="fas fa-tachometer-alt text-success"></i> Enable Monitoring Dashboard
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Save Button -->
        <div class="text-end">
          <button class="btn btn-primary" onclick="setupServiceManager.saveConfiguration()">
            <i class="fas fa-save"></i> Save Configuration
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Save Setup service configuration
   */
  async saveConfiguration() {
    try {
      const config = {
        service: {
          url: document.getElementById('setupUrl').value,
          apiKey: document.getElementById('setupApiKey').value
        },
        discovery: {
          enabled: document.getElementById('setupDiscoveryEnabled').checked,
          heartbeatInterval: parseInt(document.getElementById('setupHeartbeatInterval').value),
          healthCheckInterval: parseInt(document.getElementById('setupHealthCheckInterval').value),
          timeout: parseInt(document.getElementById('setupDiscoveryTimeout').value)
        },
        registry: {
          persistToDatabase: document.getElementById('setupPersistRegistry').checked,
          cacheEnabled: document.getElementById('setupCacheEnabled').checked,
          cacheTTL: parseInt(document.getElementById('setupCacheTTL').value)
        },
        monitoring: {
          metricsEnabled: document.getElementById('setupMetricsEnabled').checked,
          alertsEnabled: document.getElementById('setupAlertsEnabled').checked,
          alertEmail: document.getElementById('setupAlertEmail').value,
          dashboardEnabled: document.getElementById('setupDashboardEnabled').checked
        }
      };

      const response = await fetch('/lowcode/setup-config/api/setup/configuration', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      const data = await response.json();

      if (data.success) {
        alert('✅ Setup Configuration Saved\n\n' +
              (data.requiresRestart ? 'Server restart required for changes to take effect.' : 'Changes applied.'));
        await this.loadSetupServiceConfiguration();
      } else {
        alert('❌ Error\n\n' + (data.message || 'Failed to save configuration'));
      }
    } catch (error) {
      console.error('[Setup Service Config] Save error:', error);
      alert('❌ Error\n\n' + error.message);
    }
  }

  /**
   * Test Setup service connection
   */
  async testConnection() {
    try {
      const response = await fetch('/lowcode/setup-config/api/setup/test-connection', {
        method: 'POST'
      });
      const data = await response.json();

      if (data.success) {
        alert(`✅ Connection Successful\n\nResponse Time: ${data.responseTime}ms\nVersion: ${data.version}`);
      } else {
        alert('❌ Connection Failed\n\n' + data.message);
      }
    } catch (error) {
      alert('❌ Connection Failed\n\n' + error.message);
    }
  }

  /**
   * Show error message
   */
  showError(message) {
    const container = document.getElementById('setupServiceConfigContent');
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
window.setupServiceManager = new SetupServiceConfigManager();
