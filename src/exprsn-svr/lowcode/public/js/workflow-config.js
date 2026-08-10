/**
 * Workflow Automation Configuration Manager
 *
 * Provides UI and API interaction for configuring the Workflow service,
 * managing execution settings, workflow features, and automation capabilities.
 */

class WorkflowConfigManager {
  constructor() {
    this.workflowConfig = null;
  }

  /**
   * Load Workflow configuration from the API
   */
  async loadWorkflowConfiguration() {
    const container = document.getElementById('workflowConfigContent');

    if (!container) {
      console.error('[Workflow Config] Container not found');
      return;
    }

    try {
      container.innerHTML = `
        <div class="text-center py-5">
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
          <p class="mt-3 text-muted">Loading Workflow configuration...</p>
        </div>
      `;

      const response = await fetch('/lowcode/setup-config/api/workflow/configuration');
      const data = await response.json();

      if (data.success) {
        this.workflowConfig = data.configuration;
        this.renderWorkflowConfiguration();
      } else {
        this.showError(data.message || 'Failed to load Workflow configuration');
      }
    } catch (error) {
      console.error('[Workflow Config] Load error:', error);
      this.showError(error.message);
    }
  }

  /**
   * Render the Workflow configuration UI
   */
  renderWorkflowConfiguration() {
    const container = document.getElementById('workflowConfigContent');
    if (!container) return;

    const config = this.workflowConfig;
    const isRunning = config.service.health.running;

    container.innerHTML = `
      <div class="workflow-config">
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
                    <i class="fas fa-project-diagram text-warning" style="font-size: 2rem;"></i>
                  </div>
                  <div class="fw-bold">${isRunning ? config.service.health.activeWorkflows : 'N/A'}</div>
                  <small class="text-muted">Active Workflows</small>
                </div>
              </div>
              <div class="col-md-3">
                <div class="text-center p-3">
                  <div class="mb-2">
                    <i class="fas fa-play-circle text-success" style="font-size: 2rem;"></i>
                  </div>
                  <div class="fw-bold">${isRunning ? config.service.health.executionsToday : 'N/A'}</div>
                  <small class="text-muted">Executions Today</small>
                </div>
              </div>
            </div>

            <div class="mt-3">
              <button class="btn btn-sm btn-outline-primary" onclick="workflowManager.testConnection()">
                <i class="fas fa-plug"></i> Test Connection
              </button>
              <button class="btn btn-sm btn-outline-secondary ms-2" onclick="workflowManager.loadWorkflowConfiguration()">
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
              <input type="text" class="form-control" id="workflowUrl"
                     value="${config.service.url}" placeholder="http://localhost:3017">
              <small class="text-muted">Base URL for Workflow automation service</small>
            </div>
            <div class="mb-3">
              <label class="form-label">API Key</label>
              <input type="password" class="form-control" id="workflowApiKey"
                     value="${config.service.apiKey || ''}" placeholder="Enter API key">
              <small class="text-muted">Authentication key for Workflow API</small>
            </div>
          </div>
        </div>

        <!-- Execution Settings -->
        <div class="card mb-3">
          <div class="card-header">
            <h6 class="mb-0">
              <i class="fas fa-cogs"></i> Execution Settings
            </h6>
          </div>
          <div class="card-body">
            <div class="row">
              <div class="col-md-3 mb-3">
                <label class="form-label">Max Concurrent Workflows</label>
                <input type="number" class="form-control" id="workflowMaxConcurrent"
                       value="${config.execution.maxConcurrent}" min="1" max="100">
                <small class="text-muted">Parallel executions limit</small>
              </div>
              <div class="col-md-3 mb-3">
                <label class="form-label">Execution Timeout (seconds)</label>
                <input type="number" class="form-control" id="workflowTimeout"
                       value="${config.execution.timeout}" min="1">
                <small class="text-muted">Max runtime per workflow</small>
              </div>
              <div class="col-md-3 mb-3">
                <label class="form-label">Retry Attempts</label>
                <input type="number" class="form-control" id="workflowRetryAttempts"
                       value="${config.execution.retryAttempts}" min="0" max="10">
                <small class="text-muted">Failed execution retries</small>
              </div>
              <div class="col-md-3 mb-3">
                <label class="form-label">Retry Delay (seconds)</label>
                <input type="number" class="form-control" id="workflowRetryDelay"
                       value="${config.execution.retryDelay}" min="0">
                <small class="text-muted">Wait between retries</small>
              </div>
            </div>
          </div>
        </div>

        <!-- Workflow Features -->
        <div class="card mb-3">
          <div class="card-header">
            <h6 class="mb-0">
              <i class="fas fa-star"></i> Workflow Features
            </h6>
          </div>
          <div class="card-body">
            <div class="row">
              <div class="col-md-6">
                <div class="form-check form-switch mb-3">
                  <input class="form-check-input" type="checkbox" id="workflowScheduling"
                         ${config.features.scheduling ? 'checked' : ''}>
                  <label class="form-check-label" for="workflowScheduling">
                    <i class="fas fa-calendar-alt text-primary"></i> Workflow Scheduling
                    <br><small class="text-muted">Cron-based scheduled workflow execution</small>
                  </label>
                </div>
              </div>
              <div class="col-md-6">
                <div class="form-check form-switch mb-3">
                  <input class="form-check-input" type="checkbox" id="workflowWebhooks"
                         ${config.features.webhooks ? 'checked' : ''}>
                  <label class="form-check-label" for="workflowWebhooks">
                    <i class="fas fa-webhook text-success"></i> Webhook Triggers
                    <br><small class="text-muted">Trigger workflows from external events</small>
                  </label>
                </div>
              </div>
            </div>

            <div class="row">
              <div class="col-md-6">
                <div class="form-check form-switch mb-3">
                  <input class="form-check-input" type="checkbox" id="workflowApiIntegrations"
                         ${config.features.apiIntegrations ? 'checked' : ''}>
                  <label class="form-check-label" for="workflowApiIntegrations">
                    <i class="fas fa-plug text-info"></i> API Integrations
                    <br><small class="text-muted">Connect to third-party APIs</small>
                  </label>
                </div>
              </div>
              <div class="col-md-6">
                <div class="form-check form-switch mb-3">
                  <input class="form-check-input" type="checkbox" id="workflowConditionalLogic"
                         ${config.features.conditionalLogic ? 'checked' : ''}>
                  <label class="form-check-label" for="workflowConditionalLogic">
                    <i class="fas fa-code-branch text-warning"></i> Conditional Logic
                    <br><small class="text-muted">If/else branching in workflows</small>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Storage & Logging -->
        <div class="card mb-3">
          <div class="card-header">
            <h6 class="mb-0">
              <i class="fas fa-database"></i> Storage & Logging
            </h6>
          </div>
          <div class="card-body">
            <div class="row">
              <div class="col-md-4">
                <div class="form-check form-switch mb-3">
                  <input class="form-check-input" type="checkbox" id="workflowLogsEnabled"
                         ${config.storage.logsEnabled ? 'checked' : ''}>
                  <label class="form-check-label" for="workflowLogsEnabled">
                    <i class="fas fa-file-alt text-primary"></i> Enable Execution Logs
                    <br><small class="text-muted">Store detailed workflow execution logs</small>
                  </label>
                </div>
              </div>
              <div class="col-md-4">
                <label class="form-label">Log Retention (days)</label>
                <input type="number" class="form-control" id="workflowLogsRetention"
                       value="${config.storage.logsRetentionDays}" min="1" max="365">
                <small class="text-muted">How long to keep logs</small>
              </div>
              <div class="col-md-4">
                <div class="form-check form-switch mb-3">
                  <input class="form-check-input" type="checkbox" id="workflowHistoryEnabled"
                         ${config.storage.executionHistory ? 'checked' : ''}>
                  <label class="form-check-label" for="workflowHistoryEnabled">
                    <i class="fas fa-history text-success"></i> Execution History
                    <br><small class="text-muted">Track all workflow runs</small>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Workflow Statistics -->
        <div class="card mb-3">
          <div class="card-header">
            <h6 class="mb-0">
              <i class="fas fa-chart-pie"></i> Workflow Statistics
            </h6>
          </div>
          <div class="card-body">
            <div class="row">
              <div class="col-md-3 text-center">
                <div class="p-3">
                  <i class="fas fa-project-diagram text-primary" style="font-size: 2rem;"></i>
                  <div class="mt-2 fw-bold">${config.workflows.totalWorkflows || 0}</div>
                  <small class="text-muted">Total Workflows</small>
                </div>
              </div>
              <div class="col-md-3 text-center">
                <div class="p-3">
                  <i class="fas fa-play text-success" style="font-size: 2rem;"></i>
                  <div class="mt-2 fw-bold">${config.workflows.activeWorkflows || 0}</div>
                  <small class="text-muted">Active Workflows</small>
                </div>
              </div>
              <div class="col-md-3 text-center">
                <div class="p-3">
                  <i class="fas fa-list-ol text-info" style="font-size: 2rem;"></i>
                  <div class="mt-2 fw-bold">${config.workflows.totalExecutions || 0}</div>
                  <small class="text-muted">Total Executions</small>
                </div>
              </div>
              <div class="col-md-3 text-center">
                <div class="p-3">
                  <i class="fas fa-percentage text-warning" style="font-size: 2rem;"></i>
                  <div class="mt-2 fw-bold">${config.workflows.successRate || 0}%</div>
                  <small class="text-muted">Success Rate</small>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Save Button -->
        <div class="text-end">
          <button class="btn btn-primary" onclick="workflowManager.saveConfiguration()">
            <i class="fas fa-save"></i> Save Configuration
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Save Workflow configuration
   */
  async saveConfiguration() {
    try {
      const config = {
        service: {
          url: document.getElementById('workflowUrl').value,
          apiKey: document.getElementById('workflowApiKey').value
        },
        execution: {
          maxConcurrent: parseInt(document.getElementById('workflowMaxConcurrent').value),
          timeout: parseInt(document.getElementById('workflowTimeout').value),
          retryAttempts: parseInt(document.getElementById('workflowRetryAttempts').value),
          retryDelay: parseInt(document.getElementById('workflowRetryDelay').value)
        },
        features: {
          scheduling: document.getElementById('workflowScheduling').checked,
          webhooks: document.getElementById('workflowWebhooks').checked,
          apiIntegrations: document.getElementById('workflowApiIntegrations').checked,
          conditionalLogic: document.getElementById('workflowConditionalLogic').checked
        },
        storage: {
          logsEnabled: document.getElementById('workflowLogsEnabled').checked,
          logsRetentionDays: parseInt(document.getElementById('workflowLogsRetention').value),
          executionHistory: document.getElementById('workflowHistoryEnabled').checked
        }
      };

      const response = await fetch('/lowcode/setup-config/api/workflow/configuration', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      const data = await response.json();

      if (data.success) {
        alert('✅ Workflow Configuration Saved\n\n' +
              (data.requiresRestart ? 'Server restart required for changes to take effect.' : 'Changes applied.'));
        await this.loadWorkflowConfiguration();
      } else {
        alert('❌ Error\n\n' + (data.message || 'Failed to save configuration'));
      }
    } catch (error) {
      console.error('[Workflow Config] Save error:', error);
      alert('❌ Error\n\n' + error.message);
    }
  }

  /**
   * Test Workflow connection
   */
  async testConnection() {
    try {
      const response = await fetch('/lowcode/setup-config/api/workflow/test-connection', {
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
    const container = document.getElementById('workflowConfigContent');
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
window.workflowManager = new WorkflowConfigManager();
