/**
 * Process Monitor - Real-time Process Execution Monitoring
 * Displays running process instances, logs, and statistics
 */

class ProcessMonitor {
  constructor(options) {
    this.processId = options.processId;
    this.instancesElement = options.instancesElement;
    this.detailsElement = options.detailsElement;

    // State
    this.instances = [];
    this.selectedInstanceId = null;
    this.statusFilter = '';
    this.autoRefresh = true;
    this.refreshInterval = null;
    this.statistics = null;

    // Initialize
    this.init();
  }

  async init() {
    this.setupEventListeners();
    await this.loadProcess();
    await this.loadInstances();
    this.startAutoRefresh();
  }

  setupEventListeners() {
    // Header buttons
    document.getElementById('refresh-btn')?.addEventListener('click', () => this.refresh());
    document.getElementById('stats-btn')?.addEventListener('click', () => this.showStatistics());
    document.getElementById('start-instance-btn')?.addEventListener('click', () => this.startNewInstance());

    // Filter
    document.getElementById('status-filter')?.addEventListener('change', (e) => {
      this.statusFilter = e.target.value;
      this.filterInstances();
    });
  }

  async loadProcess() {
    try {
      const response = await fetch(`/lowcode/api/processes/${this.processId}`);
      if (!response.ok) throw new Error('Failed to load process');

      const data = await response.json();
      if (data.success && data.process) {
        document.getElementById('process-title').textContent =
          `${data.process.displayName} - Monitor`;
      }
    } catch (error) {
      console.error('Failed to load process:', error);
    }
  }

  async loadInstances() {
    try {
      const params = new URLSearchParams();
      if (this.statusFilter) params.append('status', this.statusFilter);
      params.append('limit', '100');

      const response = await fetch(
        `/lowcode/api/processes/${this.processId}/instances?${params}`
      );

      if (!response.ok) throw new Error('Failed to load instances');

      const data = await response.json();
      if (data.success) {
        this.instances = data.instances || [];
        this.renderInstancesList();
      }
    } catch (error) {
      console.error('Failed to load instances:', error);
      this.showError('Failed to load process instances');
    }
  }

  renderInstancesList() {
    if (this.instances.length === 0) {
      this.instancesElement.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-inbox"></i>
          <p>No process instances found</p>
        </div>
      `;
      document.getElementById('instance-count').textContent = '0';
      return;
    }

    document.getElementById('instance-count').textContent = this.instances.length;

    this.instancesElement.innerHTML = this.instances.map(instance => {
      const isSelected = instance.id === this.selectedInstanceId;
      const shortId = instance.id.split('-')[0];
      const createdAt = new Date(instance.createdAt).toLocaleString();

      let duration = '';
      if (instance.status === 'completed' || instance.status === 'error' || instance.status === 'cancelled') {
        const start = new Date(instance.createdAt);
        const end = new Date(instance.completedAt);
        const ms = end - start;
        duration = this.formatDuration(ms);
      } else {
        const start = new Date(instance.createdAt);
        const now = new Date();
        const ms = now - start;
        duration = this.formatDuration(ms) + ' (running)';
      }

      return `
        <div class="instance-item ${isSelected ? 'selected' : ''}" data-instance-id="${instance.id}">
          <div class="instance-header">
            <span class="instance-id">${shortId}</span>
            <span class="instance-status ${instance.status}">${instance.status}</span>
          </div>
          <div class="instance-meta">
            <div>Step: ${instance.currentStep || 'N/A'}</div>
            <div class="instance-time">Created: ${createdAt}</div>
            <div class="instance-time">Duration: ${duration}</div>
          </div>
        </div>
      `;
    }).join('');

    // Add click listeners
    this.instancesElement.querySelectorAll('.instance-item').forEach(item => {
      item.addEventListener('click', () => {
        this.selectInstance(item.dataset.instanceId);
      });
    });
  }

  filterInstances() {
    this.loadInstances();
  }

  async selectInstance(instanceId) {
    this.selectedInstanceId = instanceId;
    this.renderInstancesList(); // Re-render to show selection

    // Load instance details
    try {
      const response = await fetch(`/lowcode/api/processes/instances/${instanceId}`);
      if (!response.ok) throw new Error('Failed to load instance');

      const data = await response.json();
      if (data.success && data.instance) {
        this.renderInstanceDetails(data.instance);
      }
    } catch (error) {
      console.error('Failed to load instance details:', error);
      this.showError('Failed to load instance details');
    }
  }

  renderInstanceDetails(instance) {
    const createdAt = new Date(instance.createdAt).toLocaleString();
    const completedAt = instance.completedAt
      ? new Date(instance.completedAt).toLocaleString()
      : 'N/A';

    let duration = 'N/A';
    if (instance.completedAt) {
      const ms = new Date(instance.completedAt) - new Date(instance.createdAt);
      duration = this.formatDuration(ms);
    } else {
      const ms = new Date() - new Date(instance.createdAt);
      duration = this.formatDuration(ms) + ' (running)';
    }

    this.detailsElement.innerHTML = `
      <div class="details-header">
        <div class="details-title">
          Instance ${instance.id.split('-')[0]}
          <span class="instance-status ${instance.status}">${instance.status}</span>
        </div>
        <div class="details-info">
          <div class="info-item">
            <i class="fas fa-clock"></i>
            <span>${duration}</span>
          </div>
          <div class="info-item">
            <i class="fas fa-user"></i>
            <span>Initiated by: ${instance.initiatedBy || 'System'}</span>
          </div>
        </div>
      </div>

      <div class="details-tabs">
        <button class="details-tab active" data-tab="overview">Overview</button>
        <button class="details-tab" data-tab="variables">Variables</button>
        <button class="details-tab" data-tab="logs">Execution Log</button>
        <button class="details-tab" data-tab="actions">Actions</button>
      </div>

      <div class="details-content" id="tab-content">
        ${this.renderOverviewTab(instance)}
      </div>
    `;

    // Add tab listeners
    this.detailsElement.querySelectorAll('.details-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        this.detailsElement.querySelectorAll('.details-tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        this.renderTab(e.target.dataset.tab, instance);
      });
    });
  }

  renderTab(tabName, instance) {
    const content = document.getElementById('tab-content');

    switch (tabName) {
      case 'overview':
        content.innerHTML = this.renderOverviewTab(instance);
        break;
      case 'variables':
        content.innerHTML = this.renderVariablesTab(instance);
        break;
      case 'logs':
        content.innerHTML = this.renderLogsTab(instance);
        break;
      case 'actions':
        content.innerHTML = this.renderActionsTab(instance);
        this.setupActionListeners(instance);
        break;
    }
  }

  renderOverviewTab(instance) {
    const createdAt = new Date(instance.createdAt).toLocaleString();
    const completedAt = instance.completedAt
      ? new Date(instance.completedAt).toLocaleString()
      : 'N/A';

    return `
      <div class="info-grid">
        <div class="info-card">
          <div class="info-card-label">Instance ID</div>
          <div class="info-card-value mono">${instance.id}</div>
        </div>

        <div class="info-card">
          <div class="info-card-label">Process ID</div>
          <div class="info-card-value mono">${instance.processId}</div>
        </div>

        <div class="info-card">
          <div class="info-card-label">Status</div>
          <div class="info-card-value">
            <span class="instance-status ${instance.status}">${instance.status}</span>
          </div>
        </div>

        <div class="info-card">
          <div class="info-card-label">Current Step</div>
          <div class="info-card-value">${instance.currentStep || 'N/A'}</div>
        </div>

        <div class="info-card">
          <div class="info-card-label">Created At</div>
          <div class="info-card-value">${createdAt}</div>
        </div>

        <div class="info-card">
          <div class="info-card-label">Completed At</div>
          <div class="info-card-value">${completedAt}</div>
        </div>

        <div class="info-card">
          <div class="info-card-label">Initiated By</div>
          <div class="info-card-value">${instance.initiatedBy || 'System'}</div>
        </div>

        ${instance.endMessage ? `
          <div class="info-card">
            <div class="info-card-label">End Message</div>
            <div class="info-card-value">${instance.endMessage}</div>
          </div>
        ` : ''}
      </div>

      ${instance.waitingFor ? `
        <div class="info-card" style="margin-top: 1rem;">
          <div class="info-card-label">Waiting For</div>
          <div class="info-card-value">
            ${this.renderWaitingInfo(instance.waitingFor)}
          </div>
        </div>
      ` : ''}
    `;
  }

  renderWaitingInfo(waitingFor) {
    if (waitingFor.type === 'user-task') {
      return `
        <div style="margin-top: 0.5rem;">
          <strong>User Task</strong><br>
          Element ID: ${waitingFor.elementId}<br>
          ${waitingFor.assignee ? `Assignee: ${waitingFor.assignee}<br>` : ''}
          ${waitingFor.dueDate ? `Due: ${waitingFor.dueDate}<br>` : ''}
          ${waitingFor.formKey ? `Form: ${waitingFor.formKey}` : ''}
        </div>
      `;
    }
    return JSON.stringify(waitingFor, null, 2);
  }

  renderVariablesTab(instance) {
    const variables = instance.variables || {};
    const varCount = Object.keys(variables).length;

    if (varCount === 0) {
      return `
        <div class="empty-state">
          <i class="fas fa-database"></i>
          <p>No process variables</p>
        </div>
      `;
    }

    return `
      <table class="variables-table">
        <thead>
          <tr>
            <th>Variable Name</th>
            <th>Value</th>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(variables).map(([key, value]) => `
            <tr>
              <td class="variable-key">${key}</td>
              <td class="variable-value">${this.formatValue(value)}</td>
              <td>${typeof value}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  renderLogsTab(instance) {
    const logs = instance.executionLog || [];

    if (logs.length === 0) {
      return `
        <div class="empty-state">
          <i class="fas fa-file-alt"></i>
          <p>No execution logs</p>
        </div>
      `;
    }

    return logs.map(log => {
      const timestamp = new Date(log.timestamp).toLocaleString();
      const hasData = log.data && Object.keys(log.data).length > 0;

      return `
        <div class="log-entry ${log.level}">
          <div class="log-header">
            <span class="log-level ${log.level}">${log.level}</span>
            <span class="log-timestamp">${timestamp}</span>
          </div>
          <div class="log-message">${log.message}</div>
          ${hasData ? `
            <div class="log-data">${JSON.stringify(log.data, null, 2)}</div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  renderActionsTab(instance) {
    const canCancel = instance.status === 'running' || instance.status === 'waiting';

    return `
      <div style="max-width: 600px;">
        <h3 style="margin-bottom: 1rem; font-size: 1.125rem;">Instance Actions</h3>

        ${instance.status === 'waiting' && instance.waitingFor?.type === 'user-task' ? `
          <div class="info-card" style="margin-bottom: 1rem;">
            <div class="info-card-label">Complete User Task</div>
            <p style="margin: 0.5rem 0; color: var(--text-secondary); font-size: 0.875rem;">
              This instance is waiting for a user task to be completed.
            </p>
            <button class="btn btn-primary" id="complete-task-btn">
              <i class="fas fa-check"></i> Complete Task
            </button>
          </div>
        ` : ''}

        ${canCancel ? `
          <div class="info-card" style="margin-bottom: 1rem;">
            <div class="info-card-label">Cancel Instance</div>
            <p style="margin: 0.5rem 0; color: var(--text-secondary); font-size: 0.875rem;">
              Cancel this running process instance. This action cannot be undone.
            </p>
            <button class="btn btn-danger" id="cancel-instance-btn">
              <i class="fas fa-times-circle"></i> Cancel Instance
            </button>
          </div>
        ` : ''}

        <div class="info-card" style="margin-bottom: 1rem;">
          <div class="info-card-label">Refresh Details</div>
          <p style="margin: 0.5rem 0; color: var(--text-secondary); font-size: 0.875rem;">
            Reload the latest instance data from the server.
          </p>
          <button class="btn btn-secondary" id="refresh-instance-btn">
            <i class="fas fa-sync"></i> Refresh Instance
          </button>
        </div>

        <div class="info-card">
          <div class="info-card-label">Export Instance Data</div>
          <p style="margin: 0.5rem 0; color: var(--text-secondary); font-size: 0.875rem;">
            Download instance data as JSON for debugging or archival.
          </p>
          <button class="btn btn-secondary" id="export-instance-btn">
            <i class="fas fa-download"></i> Export as JSON
          </button>
        </div>
      </div>
    `;
  }

  setupActionListeners(instance) {
    // Complete task
    document.getElementById('complete-task-btn')?.addEventListener('click', () => {
      this.completeUserTask(instance.id);
    });

    // Cancel instance
    document.getElementById('cancel-instance-btn')?.addEventListener('click', () => {
      this.cancelInstance(instance.id);
    });

    // Refresh instance
    document.getElementById('refresh-instance-btn')?.addEventListener('click', () => {
      this.selectInstance(instance.id);
    });

    // Export instance
    document.getElementById('export-instance-btn')?.addEventListener('click', () => {
      this.exportInstance(instance);
    });
  }

  async completeUserTask(instanceId) {
    const taskData = prompt('Enter task completion data (JSON format):\nExample: {"approved": true, "comments": "Looks good"}');

    if (!taskData) return;

    try {
      const data = JSON.parse(taskData);

      const response = await fetch(`/lowcode/api/processes/instances/${instanceId}/complete-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskData: data })
      });

      if (!response.ok) throw new Error('Failed to complete task');

      const result = await response.json();
      if (result.success) {
        alert('Task completed successfully!');
        await this.refresh();
        this.selectInstance(instanceId);
      }
    } catch (error) {
      console.error('Failed to complete task:', error);
      alert('Failed to complete task: ' + error.message);
    }
  }

  async cancelInstance(instanceId) {
    const reason = prompt('Enter cancellation reason:');
    if (!reason) return;

    if (!confirm('Are you sure you want to cancel this process instance?')) return;

    try {
      const response = await fetch(`/lowcode/api/processes/instances/${instanceId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });

      if (!response.ok) throw new Error('Failed to cancel instance');

      const result = await response.json();
      if (result.success) {
        alert('Instance cancelled successfully');
        await this.refresh();
        this.selectInstance(instanceId);
      }
    } catch (error) {
      console.error('Failed to cancel instance:', error);
      alert('Failed to cancel instance: ' + error.message);
    }
  }

  exportInstance(instance) {
    const dataStr = JSON.stringify(instance, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `instance-${instance.id}.json`;
    link.click();

    URL.revokeObjectURL(url);
  }

  async showStatistics() {
    try {
      const response = await fetch(`/lowcode/api/processes/${this.processId}/statistics`);
      if (!response.ok) throw new Error('Failed to load statistics');

      const data = await response.json();
      if (data.success && data.statistics) {
        this.renderStatistics(data.statistics);
      }
    } catch (error) {
      console.error('Failed to load statistics:', error);
      alert('Failed to load statistics: ' + error.message);
    }
  }

  renderStatistics(stats) {
    const avgTimeFormatted = this.formatDuration(stats.averageExecutionTime);

    this.detailsElement.innerHTML = `
      <div class="details-header">
        <div class="details-title">Process Statistics</div>
      </div>

      <div class="details-content">
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">${stats.total}</div>
            <div class="stat-label">Total Instances</div>
          </div>

          <div class="stat-card">
            <div class="stat-value">${stats.byStatus.completed}</div>
            <div class="stat-label">Completed</div>
          </div>

          <div class="stat-card">
            <div class="stat-value">${stats.byStatus.running}</div>
            <div class="stat-label">Running</div>
          </div>

          <div class="stat-card">
            <div class="stat-value">${stats.byStatus.waiting}</div>
            <div class="stat-label">Waiting</div>
          </div>

          <div class="stat-card">
            <div class="stat-value">${stats.byStatus.error}</div>
            <div class="stat-label">Errors</div>
          </div>

          <div class="stat-card">
            <div class="stat-value">${stats.byStatus.cancelled}</div>
            <div class="stat-label">Cancelled</div>
          </div>
        </div>

        <div class="info-grid" style="margin-top: 1.5rem;">
          <div class="info-card">
            <div class="info-card-label">Success Rate</div>
            <div class="info-card-value" style="font-size: 2rem; color: var(--primary-color);">
              ${stats.successRate}%
            </div>
          </div>

          <div class="info-card">
            <div class="info-card-label">Average Execution Time</div>
            <div class="info-card-value" style="font-size: 2rem; color: var(--primary-color);">
              ${avgTimeFormatted}
            </div>
          </div>
        </div>
      </div>
    `;

    this.selectedInstanceId = null;
    this.renderInstancesList();
  }

  async startNewInstance() {
    const inputData = prompt('Enter input data (JSON format):\nExample: {"customerId": "123", "amount": 1000}');

    try {
      const data = inputData ? JSON.parse(inputData) : {};

      const response = await fetch(`/lowcode/api/processes/${this.processId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputData: data })
      });

      if (!response.ok) throw new Error('Failed to start instance');

      const result = await response.json();
      if (result.success) {
        alert('Process instance started successfully!');
        await this.refresh();
        this.selectInstance(result.instance.id);
      }
    } catch (error) {
      console.error('Failed to start instance:', error);
      alert('Failed to start instance: ' + error.message);
    }
  }

  async refresh() {
    await this.loadInstances();
    if (this.selectedInstanceId) {
      await this.selectInstance(this.selectedInstanceId);
    }
  }

  startAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    if (this.autoRefresh) {
      this.refreshInterval = setInterval(() => {
        this.refresh();
      }, 5000); // Refresh every 5 seconds
    }
  }

  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
    return `${Math.round(ms / 3600000)}h`;
  }

  formatValue(value) {
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }

  showError(message) {
    this.detailsElement.innerHTML = `
      <div class="empty-state" style="height: 100%;">
        <i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i>
        <p>${message}</p>
      </div>
    `;
  }
}
