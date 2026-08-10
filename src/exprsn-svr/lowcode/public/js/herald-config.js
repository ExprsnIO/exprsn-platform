/**
 * Herald (Notifications) Configuration Manager
 *
 * Provides UI and API interaction for configuring the Herald notification service,
 * managing delivery channels, notification settings, and templates.
 */

class HeraldConfigManager {
  constructor() {
    this.heraldConfig = null;
  }

  /**
   * Load Herald configuration from the API
   */
  async loadHeraldConfiguration() {
    const container = document.getElementById('heraldConfigContent');

    if (!container) {
      console.error('[Herald Config] Container not found');
      return;
    }

    try {
      container.innerHTML = `
        <div class="text-center py-5">
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
          <p class="mt-3 text-muted">Loading Herald configuration...</p>
        </div>
      `;

      const response = await fetch('/lowcode/setup-config/api/herald/configuration');
      const data = await response.json();

      if (data.success) {
        this.heraldConfig = data.configuration;
        this.renderHeraldConfiguration();
      } else {
        this.showError(data.message || 'Failed to load Herald configuration');
      }
    } catch (error) {
      console.error('[Herald Config] Load error:', error);
      this.showError(error.message);
    }
  }

  /**
   * Render the Herald configuration UI
   */
  renderHeraldConfiguration() {
    const container = document.getElementById('heraldConfigContent');
    if (!container) return;

    const config = this.heraldConfig;
    const isRunning = config.service.health.running;

    container.innerHTML = `
      <div class="herald-config">
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
                    <i class="fas fa-layer-group text-warning" style="font-size: 2rem;"></i>
                  </div>
                  <div class="fw-bold">${isRunning ? config.service.health.queueSize : 'N/A'}</div>
                  <small class="text-muted">Queue Size</small>
                </div>
              </div>
              <div class="col-md-3">
                <div class="text-center p-3">
                  <div class="mb-2">
                    <i class="fas fa-tachometer-alt text-success" style="font-size: 2rem;"></i>
                  </div>
                  <div class="fw-bold">${isRunning && config.service.health.deliveryRate ? config.service.health.deliveryRate + '/min' : 'N/A'}</div>
                  <small class="text-muted">Delivery Rate</small>
                </div>
              </div>
            </div>

            <div class="mt-3">
              <button class="btn btn-sm btn-outline-primary" onclick="heraldManager.testConnection()">
                <i class="fas fa-plug"></i> Test Connection
              </button>
              <button class="btn btn-sm btn-outline-secondary ms-2" onclick="heraldManager.loadHeraldConfiguration()">
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
              <input type="text" class="form-control" id="heraldUrl"
                     value="${config.service.url}" placeholder="http://localhost:3014">
              <small class="text-muted">Base URL for Herald notification service</small>
            </div>
            <div class="mb-3">
              <label class="form-label">API Key</label>
              <input type="password" class="form-control" id="heraldApiKey"
                     value="${config.service.apiKey || ''}" placeholder="Enter API key">
              <small class="text-muted">Authentication key for Herald API</small>
            </div>
          </div>
        </div>

        <!-- Notification Channels -->
        <div class="card mb-3">
          <div class="card-header">
            <h6 class="mb-0">
              <i class="fas fa-broadcast-tower"></i> Notification Channels
            </h6>
          </div>
          <div class="card-body">
            <!-- Email Channel -->
            <div class="border rounded p-3 mb-3">
              <div class="d-flex justify-content-between align-items-center mb-3">
                <div>
                  <h6 class="mb-0">
                    <i class="fas fa-envelope text-primary"></i> Email Notifications
                  </h6>
                </div>
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" id="heraldEmailEnabled"
                         ${config.channels.email.enabled ? 'checked' : ''}>
                  <label class="form-check-label" for="heraldEmailEnabled">Enabled</label>
                </div>
              </div>
              <div class="row">
                <div class="col-md-6 mb-2">
                  <label class="form-label small">Email Provider</label>
                  <select class="form-select form-select-sm" id="heraldEmailProvider">
                    <option value="smtp" ${config.channels.email.provider === 'smtp' ? 'selected' : ''}>SMTP</option>
                    <option value="sendgrid" ${config.channels.email.provider === 'sendgrid' ? 'selected' : ''}>SendGrid</option>
                    <option value="mailgun" ${config.channels.email.provider === 'mailgun' ? 'selected' : ''}>Mailgun</option>
                    <option value="ses" ${config.channels.email.provider === 'ses' ? 'selected' : ''}>Amazon SES</option>
                  </select>
                </div>
                <div class="col-md-6 mb-2">
                  <label class="form-label small">From Address</label>
                  <input type="email" class="form-control form-control-sm" id="heraldEmailFrom"
                         value="${config.channels.email.from}" placeholder="noreply@exprsn.io">
                </div>
              </div>
            </div>

            <!-- SMS Channel -->
            <div class="border rounded p-3 mb-3">
              <div class="d-flex justify-content-between align-items-center mb-3">
                <div>
                  <h6 class="mb-0">
                    <i class="fas fa-sms text-success"></i> SMS Notifications
                  </h6>
                </div>
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" id="heraldSmsEnabled"
                         ${config.channels.sms.enabled ? 'checked' : ''}>
                  <label class="form-check-label" for="heraldSmsEnabled">Enabled</label>
                </div>
              </div>
              <div class="row">
                <div class="col-md-6 mb-2">
                  <label class="form-label small">SMS Provider</label>
                  <select class="form-select form-select-sm" id="heraldSmsProvider">
                    <option value="twilio" ${config.channels.sms.provider === 'twilio' ? 'selected' : ''}>Twilio</option>
                    <option value="nexmo" ${config.channels.sms.provider === 'nexmo' ? 'selected' : ''}>Nexmo/Vonage</option>
                    <option value="aws-sns" ${config.channels.sms.provider === 'aws-sns' ? 'selected' : ''}>AWS SNS</option>
                  </select>
                </div>
                <div class="col-md-6 mb-2">
                  <label class="form-label small">From Number</label>
                  <input type="tel" class="form-control form-control-sm" id="heraldSmsFrom"
                         value="${config.channels.sms.from}" placeholder="+1234567890">
                </div>
              </div>
            </div>

            <!-- Push Notifications -->
            <div class="border rounded p-3 mb-3">
              <div class="d-flex justify-content-between align-items-center mb-3">
                <div>
                  <h6 class="mb-0">
                    <i class="fas fa-mobile-alt text-info"></i> Push Notifications
                  </h6>
                </div>
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" id="heraldPushEnabled"
                         ${config.channels.push.enabled ? 'checked' : ''}>
                  <label class="form-check-label" for="heraldPushEnabled">Enabled</label>
                </div>
              </div>
              <div class="row">
                <div class="col-md-6 mb-2">
                  <label class="form-label small">Push Provider</label>
                  <select class="form-select form-select-sm" id="heraldPushProvider">
                    <option value="fcm" ${config.channels.push.provider === 'fcm' ? 'selected' : ''}>Firebase Cloud Messaging</option>
                    <option value="apns" ${config.channels.push.provider === 'apns' ? 'selected' : ''}>Apple Push Notification</option>
                    <option value="onesignal" ${config.channels.push.provider === 'onesignal' ? 'selected' : ''}>OneSignal</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- Webhook Channel -->
            <div class="border rounded p-3">
              <div class="d-flex justify-content-between align-items-center">
                <div>
                  <h6 class="mb-0">
                    <i class="fas fa-webhook text-warning"></i> Webhook Notifications
                  </h6>
                  <small class="text-muted">Send notifications to external endpoints</small>
                </div>
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" id="heraldWebhookEnabled"
                         ${config.channels.webhook.enabled ? 'checked' : ''}>
                  <label class="form-check-label" for="heraldWebhookEnabled">Enabled</label>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Delivery Settings -->
        <div class="card mb-3">
          <div class="card-header">
            <h6 class="mb-0">
              <i class="fas fa-cogs"></i> Delivery Settings
            </h6>
          </div>
          <div class="card-body">
            <div class="row">
              <div class="col-md-3 mb-3">
                <label class="form-label">Retry Attempts</label>
                <input type="number" class="form-control" id="heraldRetryAttempts"
                       value="${config.settings.retryAttempts}" min="0" max="10">
                <small class="text-muted">Failed delivery retries</small>
              </div>
              <div class="col-md-3 mb-3">
                <label class="form-label">Retry Delay (seconds)</label>
                <input type="number" class="form-control" id="heraldRetryDelay"
                       value="${config.settings.retryDelay}" min="0">
                <small class="text-muted">Wait between retries</small>
              </div>
              <div class="col-md-3 mb-3">
                <label class="form-label">Batch Size</label>
                <input type="number" class="form-control" id="heraldBatchSize"
                       value="${config.settings.batchSize}" min="1" max="1000">
                <small class="text-muted">Notifications per batch</small>
              </div>
              <div class="col-md-3 mb-3">
                <label class="form-label">Rate Limit (per minute)</label>
                <input type="number" class="form-control" id="heraldRateLimit"
                       value="${config.settings.rateLimitPerMinute}" min="1">
                <small class="text-muted">Max sends per minute</small>
              </div>
            </div>
          </div>
        </div>

        <!-- Template Settings -->
        <div class="card mb-3">
          <div class="card-header">
            <h6 class="mb-0">
              <i class="fas fa-file-alt"></i> Template Settings
            </h6>
          </div>
          <div class="card-body">
            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label">Template Path</label>
                <input type="text" class="form-control" id="heraldTemplatesPath"
                       value="${config.templates.path}" placeholder="./templates">
                <small class="text-muted">Directory for notification templates</small>
              </div>
              <div class="col-md-6 mb-3">
                <label class="form-label">Template Engine</label>
                <div class="form-check form-switch mt-2">
                  <input class="form-check-input" type="checkbox" id="heraldTemplatesEnabled"
                         ${config.templates.enabled ? 'checked' : ''}>
                  <label class="form-check-label" for="heraldTemplatesEnabled">
                    Enable template rendering
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Notification Statistics -->
        <div class="card mb-3">
          <div class="card-header">
            <h6 class="mb-0">
              <i class="fas fa-chart-line"></i> Notification Statistics
            </h6>
          </div>
          <div class="card-body">
            <div class="row">
              <div class="col-md-4 text-center">
                <div class="p-3">
                  <i class="fas fa-paper-plane text-success" style="font-size: 2rem;"></i>
                  <div class="mt-2 fw-bold">${config.notifications.totalSent || 0}</div>
                  <small class="text-muted">Total Sent</small>
                </div>
              </div>
              <div class="col-md-4 text-center">
                <div class="p-3">
                  <i class="fas fa-exclamation-triangle text-danger" style="font-size: 2rem;"></i>
                  <div class="mt-2 fw-bold">${config.notifications.totalFailed || 0}</div>
                  <small class="text-muted">Total Failed</small>
                </div>
              </div>
              <div class="col-md-4 text-center">
                <div class="p-3">
                  <i class="fas fa-percentage text-info" style="font-size: 2rem;"></i>
                  <div class="mt-2 fw-bold">${this.calculateSuccessRate(config.notifications)}%</div>
                  <small class="text-muted">Success Rate</small>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Save Button -->
        <div class="text-end">
          <button class="btn btn-primary" onclick="heraldManager.saveConfiguration()">
            <i class="fas fa-save"></i> Save Configuration
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Save Herald configuration
   */
  async saveConfiguration() {
    try {
      const config = {
        service: {
          url: document.getElementById('heraldUrl').value,
          apiKey: document.getElementById('heraldApiKey').value
        },
        channels: {
          email: {
            enabled: document.getElementById('heraldEmailEnabled').checked,
            provider: document.getElementById('heraldEmailProvider').value,
            from: document.getElementById('heraldEmailFrom').value
          },
          sms: {
            enabled: document.getElementById('heraldSmsEnabled').checked,
            provider: document.getElementById('heraldSmsProvider').value,
            from: document.getElementById('heraldSmsFrom').value
          },
          push: {
            enabled: document.getElementById('heraldPushEnabled').checked,
            provider: document.getElementById('heraldPushProvider').value
          },
          webhook: {
            enabled: document.getElementById('heraldWebhookEnabled').checked
          }
        },
        settings: {
          retryAttempts: parseInt(document.getElementById('heraldRetryAttempts').value),
          retryDelay: parseInt(document.getElementById('heraldRetryDelay').value),
          batchSize: parseInt(document.getElementById('heraldBatchSize').value),
          rateLimitPerMinute: parseInt(document.getElementById('heraldRateLimit').value)
        },
        templates: {
          enabled: document.getElementById('heraldTemplatesEnabled').checked,
          path: document.getElementById('heraldTemplatesPath').value
        }
      };

      const response = await fetch('/lowcode/setup-config/api/herald/configuration', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      const data = await response.json();

      if (data.success) {
        alert('✅ Herald Configuration Saved\n\n' +
              (data.requiresRestart ? 'Server restart required for changes to take effect.' : 'Changes applied.'));
        await this.loadHeraldConfiguration();
      } else {
        alert('❌ Error\n\n' + (data.message || 'Failed to save configuration'));
      }
    } catch (error) {
      console.error('[Herald Config] Save error:', error);
      alert('❌ Error\n\n' + error.message);
    }
  }

  /**
   * Test Herald connection
   */
  async testConnection() {
    try {
      const response = await fetch('/lowcode/setup-config/api/herald/test-connection', {
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
   * Calculate success rate from notification stats
   */
  calculateSuccessRate(stats) {
    const total = (stats.totalSent || 0) + (stats.totalFailed || 0);
    if (total === 0) return 100;
    return Math.round(((stats.totalSent || 0) / total) * 100);
  }

  /**
   * Show error message
   */
  showError(message) {
    const container = document.getElementById('heraldConfigContent');
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
window.heraldManager = new HeraldConfigManager();
