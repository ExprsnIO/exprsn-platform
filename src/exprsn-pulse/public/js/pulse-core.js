/**
 * Exprsn Pulse - Core JavaScript
 * Utilities, API client, and common functions
 */

const PulseAPI = {
  baseURL: '/api',
  token: null,

  // Set authentication token
  setToken(token) {
    this.token = token;
    localStorage.setItem('pulse_token', token);
  },

  // Get authentication token
  getToken() {
    if (!this.token) {
      this.token = localStorage.getItem('pulse_token');
    }
    return this.token;
  },

  // Make authenticated request
  async request(endpoint, options = {}) {
    const token = this.getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers
    };

    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...options,
      headers
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return await response.json();
  },

  // GET request
  get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  },

  // POST request
  post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  // PUT request
  put(endpoint, data) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  // DELETE request
  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  },

  // Data Sources
  dataSources: {
    list: () => PulseAPI.get('/datasources'),
    get: (id) => PulseAPI.get(`/datasources/${id}`),
    create: (data) => PulseAPI.post('/datasources', data),
    update: (id, data) => PulseAPI.put(`/datasources/${id}`, data),
    delete: (id) => PulseAPI.delete(`/datasources/${id}`),
    test: (id) => PulseAPI.post(`/datasources/${id}/test`),
    discover: (id) => PulseAPI.post(`/datasources/${id}/discover`)
  },

  // Queries
  queries: {
    list: (params) => PulseAPI.get(`/queries?${new URLSearchParams(params)}`),
    get: (id) => PulseAPI.get(`/queries/${id}`),
    create: (data) => PulseAPI.post('/queries', data),
    execute: (id, params) => PulseAPI.post(`/queries/${id}/execute`, params),
    update: (id, data) => PulseAPI.put(`/queries/${id}`, data),
    delete: (id) => PulseAPI.delete(`/queries/${id}`)
  },

  // Datasets
  datasets: {
    list: (params) => PulseAPI.get(`/datasets?${new URLSearchParams(params)}`),
    get: (id) => PulseAPI.get(`/datasets/${id}`),
    create: (data) => PulseAPI.post('/datasets', data),
    refresh: (id) => PulseAPI.post(`/datasets/${id}/refresh`),
    statistics: (id) => PulseAPI.get(`/datasets/${id}/statistics`),
    delete: (id) => PulseAPI.delete(`/datasets/${id}`)
  },

  // Visualizations
  visualizations: {
    list: (params) => PulseAPI.get(`/visualizations?${new URLSearchParams(params)}`),
    get: (id) => PulseAPI.get(`/visualizations/${id}`),
    create: (data) => PulseAPI.post('/visualizations', data),
    render: (id) => PulseAPI.get(`/visualizations/${id}/render`),
    update: (id, data) => PulseAPI.put(`/visualizations/${id}`, data),
    clone: (id, name) => PulseAPI.post(`/visualizations/${id}/clone`, { name }),
    delete: (id) => PulseAPI.delete(`/visualizations/${id}`)
  },

  // Dashboards
  dashboards: {
    list: (params) => PulseAPI.get(`/dashboards?${new URLSearchParams(params)}`),
    get: (id) => PulseAPI.get(`/dashboards/${id}`),
    create: (data) => PulseAPI.post('/dashboards', data),
    render: (id) => PulseAPI.get(`/dashboards/${id}/render`),
    update: (id, data) => PulseAPI.put(`/dashboards/${id}`, data),
    delete: (id) => PulseAPI.delete(`/dashboards/${id}`),
    clone: (id, name) => PulseAPI.post(`/dashboards/${id}/clone`, { name }),
    addItem: (id, item) => PulseAPI.post(`/dashboards/${id}/items`, item),
    updateItem: (dashboardId, itemId, data) =>
      PulseAPI.put(`/dashboards/${dashboardId}/items/${itemId}`, data),
    removeItem: (dashboardId, itemId) =>
      PulseAPI.delete(`/dashboards/${dashboardId}/items/${itemId}`),
    updateLayout: (id, positions) =>
      PulseAPI.post(`/dashboards/${id}/layout`, { itemPositions: positions })
  },

  // Reports
  reports: {
    list: (params) => PulseAPI.get(`/reports?${new URLSearchParams(params)}`),
    get: (id) => PulseAPI.get(`/reports/${id}`),
    create: (data) => PulseAPI.post('/reports', data),
    execute: (id, params, format) =>
      PulseAPI.post(`/reports/${id}/execute`, { parameters: params, format }),
    update: (id, data) => PulseAPI.put(`/reports/${id}`, data),
    delete: (id) => PulseAPI.delete(`/reports/${id}`)
  },

  // Schedules
  schedules: {
    list: (params) => PulseAPI.get(`/schedules?${new URLSearchParams(params)}`),
    get: (id) => PulseAPI.get(`/schedules/${id}`),
    create: (data) => PulseAPI.post('/schedules', data),
    execute: (id) => PulseAPI.post(`/schedules/${id}/execute`),
    update: (id, data) => PulseAPI.put(`/schedules/${id}`, data),
    delete: (id) => PulseAPI.delete(`/schedules/${id}`)
  },

  // Settings
  settings: {
    get: () => PulseAPI.get('/settings'),
    update: (data) => PulseAPI.put('/settings', data),
    testEmail: () => PulseAPI.post('/settings/test-email'),
    export: () => window.location.href = '/api/settings/export'
  }
};

// Utility Functions
const PulseUtils = {
  // Show alert message
  showAlert(message, type = 'info') {
    const alertHTML = `
      <div class="alert alert-${type} alert-dismissible fade show" role="alert">
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
      </div>
    `;
    $('#alert-container').append(alertHTML);

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      $('#alert-container .alert').first().alert('close');
    }, 5000);
  },

  // Show loading spinner
  showLoading() {
    const spinnerHTML = `
      <div class="spinner-overlay" id="loading-spinner">
        <div class="spinner-border text-light" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
      </div>
    `;
    $('body').append(spinnerHTML);
  },

  // Hide loading spinner
  hideLoading() {
    $('#loading-spinner').remove();
  },

  // Format date
  formatDate(date) {
    return new Date(date).toLocaleString();
  },

  // Format number
  formatNumber(num) {
    return new Intl.NumberFormat().format(num);
  },

  // Format bytes
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  },

  // Debounce function
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  // Download file
  downloadFile(data, filename, mimeType) {
    const blob = new Blob([data], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }
};

// Modal Utility System
const PulseModals = {
  // Show quick create modal for resources
  showQuickCreate(type, onSuccess) {
    const modalId = 'quick-create-modal';
    const title = `Create ${type}`;

    let formHTML = '';

    if (type === 'Dashboard') {
      formHTML = `
        <div class="mb-3">
          <label for="quick-dashboard-name" class="form-label">Dashboard Name *</label>
          <input type="text" class="form-control" id="quick-dashboard-name" required
                 placeholder="e.g., Sales Overview">
        </div>
        <div class="mb-3">
          <label for="quick-dashboard-desc" class="form-label">Description</label>
          <textarea class="form-control" id="quick-dashboard-desc" rows="2"
                    placeholder="Optional description"></textarea>
        </div>
        <div class="form-check">
          <input type="checkbox" class="form-check-input" id="quick-dashboard-realtime">
          <label class="form-check-label" for="quick-dashboard-realtime">
            Enable real-time updates
          </label>
        </div>
      `;
    } else if (type === 'Report') {
      formHTML = `
        <div class="mb-3">
          <label for="quick-report-name" class="form-label">Report Name *</label>
          <input type="text" class="form-control" id="quick-report-name" required
                 placeholder="e.g., Monthly Sales Report">
        </div>
        <div class="mb-3">
          <label for="quick-report-desc" class="form-label">Description</label>
          <textarea class="form-control" id="quick-report-desc" rows="2"
                    placeholder="Optional description"></textarea>
        </div>
        <div class="mb-3">
          <label for="quick-report-format" class="form-label">Default Format</label>
          <select class="form-select" id="quick-report-format">
            <option value="pdf">PDF</option>
            <option value="excel">Excel</option>
            <option value="csv">CSV</option>
            <option value="html" selected>HTML</option>
          </select>
        </div>
      `;
    } else if (type === 'Data Source') {
      formHTML = `
        <div class="mb-3">
          <label for="quick-source-name" class="form-label">Data Source Name *</label>
          <input type="text" class="form-control" id="quick-source-name" required
                 placeholder="e.g., Production Database">
        </div>
        <div class="mb-3">
          <label for="quick-source-type" class="form-label">Type *</label>
          <select class="form-select" id="quick-source-type" required>
            <option value="">Select type...</option>
            <option value="exprsn-service">Exprsn Service</option>
            <option value="postgresql">PostgreSQL</option>
            <option value="rest-api">REST API</option>
            <option value="custom-query">Custom Query</option>
          </select>
        </div>
        <div class="mb-3">
          <label for="quick-source-desc" class="form-label">Description</label>
          <textarea class="form-control" id="quick-source-desc" rows="2"
                    placeholder="Optional description"></textarea>
        </div>
      `;
    }

    const modalHTML = `
      <div class="modal fade" id="${modalId}" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">${title}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <form id="quick-create-form">
                ${formHTML}
              </form>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="button" class="btn btn-primary" onclick="PulseModals.submitQuickCreate('${type}')">
                Create & Continue
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Remove existing modal if any
    $(`#${modalId}`).remove();

    // Add modal to body
    $('body').append(modalHTML);

    // Store callback
    this._quickCreateCallback = onSuccess;

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById(modalId));
    modal.show();

    // Focus first input
    $(`#${modalId}`).on('shown.bs.modal', function() {
      $(this).find('input[type="text"]').first().focus();
    });

    // Clean up on hide
    $(`#${modalId}`).on('hidden.bs.modal', function() {
      $(this).remove();
    });
  },

  // Submit quick create form
  async submitQuickCreate(type) {
    const form = $('#quick-create-form')[0];
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    try {
      PulseUtils.showLoading();

      let result;
      if (type === 'Dashboard') {
        const data = {
          name: $('#quick-dashboard-name').val(),
          description: $('#quick-dashboard-desc').val(),
          isRealtime: $('#quick-dashboard-realtime').is(':checked')
        };
        result = await PulseAPI.dashboards.create(data);

      } else if (type === 'Report') {
        const data = {
          name: $('#quick-report-name').val(),
          description: $('#quick-report-desc').val(),
          format: $('#quick-report-format').val(),
          definition: { sections: [], visualizations: [] }
        };
        result = await PulseAPI.reports.create(data);

      } else if (type === 'Data Source') {
        const data = {
          name: $('#quick-source-name').val(),
          description: $('#quick-source-desc').val(),
          type: $('#quick-source-type').val(),
          config: {}
        };
        result = await PulseAPI.dataSources.create(data);
      }

      PulseUtils.hideLoading();
      $('#quick-create-modal').modal('hide');

      // Call success callback
      if (this._quickCreateCallback) {
        this._quickCreateCallback(result.data);
      }

      PulseUtils.showAlert(`${type} created successfully!`, 'success');

    } catch (error) {
      PulseUtils.hideLoading();
      PulseUtils.showAlert(`Failed to create ${type}: ` + error.message, 'danger');
    }
  },

  // Show delete confirmation modal
  showDeleteConfirm(itemType, itemName, onConfirm) {
    const modalId = 'delete-confirm-modal';
    const modalHTML = `
      <div class="modal fade" id="${modalId}" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header bg-danger text-white">
              <h5 class="modal-title">
                <i class="bi bi-exclamation-triangle"></i> Confirm Delete
              </h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <p>Are you sure you want to delete this ${itemType}?</p>
              <div class="alert alert-warning">
                <strong>${itemName}</strong>
              </div>
              <p class="text-muted small mb-0">This action cannot be undone.</p>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="button" class="btn btn-danger" onclick="PulseModals.confirmDelete()">
                <i class="bi bi-trash"></i> Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Remove existing modal
    $(`#${modalId}`).remove();

    // Add modal
    $('body').append(modalHTML);

    // Store callback
    this._deleteCallback = onConfirm;

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById(modalId));
    modal.show();

    // Clean up
    $(`#${modalId}`).on('hidden.bs.modal', function() {
      $(this).remove();
    });
  },

  // Confirm delete action
  async confirmDelete() {
    $('#delete-confirm-modal').modal('hide');

    if (this._deleteCallback) {
      try {
        await this._deleteCallback();
      } catch (error) {
        PulseUtils.showAlert('Delete failed: ' + error.message, 'danger');
      }
    }
  },

  // Show details modal (view-only)
  showDetails(title, data) {
    const modalId = 'details-modal';

    // Format data as key-value pairs
    let contentHTML = '<dl class="row">';
    for (const [key, value] of Object.entries(data)) {
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      let displayValue = value;

      if (typeof value === 'object' && value !== null) {
        displayValue = `<pre class="small mb-0">${JSON.stringify(value, null, 2)}</pre>`;
      } else if (typeof value === 'boolean') {
        displayValue = value ? '<span class="badge bg-success">Yes</span>' : '<span class="badge bg-secondary">No</span>';
      }

      contentHTML += `
        <dt class="col-sm-4">${label}:</dt>
        <dd class="col-sm-8">${displayValue}</dd>
      `;
    }
    contentHTML += '</dl>';

    const modalHTML = `
      <div class="modal fade" id="${modalId}" tabindex="-1">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">${title}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              ${contentHTML}
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Remove existing modal
    $(`#${modalId}`).remove();

    // Add modal
    $('body').append(modalHTML);

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById(modalId));
    modal.show();

    // Clean up
    $(`#${modalId}`).on('hidden.bs.modal', function() {
      $(this).remove();
    });
  }
};

// Initialize on page load
$(document).ready(function() {
  // Global search handler
  $('#global-search').on('keyup', PulseUtils.debounce(function() {
    const query = $(this).val();
    if (query.length >= 3) {
      // Implement global search
      console.log('Searching for:', query);
    }
  }, 300));

  // Initialize tooltips
  const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  tooltipTriggerList.map(function (tooltipTriggerEl) {
    return new bootstrap.Tooltip(tooltipTriggerEl);
  });

  // Initialize popovers
  const popoverTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="popover"]'));
  popoverTriggerList.map(function (popoverTriggerEl) {
    return new bootstrap.Popover(popoverTriggerEl);
  });

  // Theme Toggle
  initializeTheme();

  // Keyboard Shortcuts
  initializeKeyboardShortcuts();
});

// Theme Management
function initializeTheme() {
  const themePreference = localStorage.getItem('pulse-theme-preference') || 'auto';
  const isAuto = localStorage.getItem('pulse-theme-auto') === 'true' || themePreference === 'auto';

  if (isAuto || themePreference === 'auto') {
    // Use system preference
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = systemPrefersDark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('pulse-theme', theme);
    updateThemeIcon(theme);

    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      // Only apply system preference if auto mode is enabled
      if (localStorage.getItem('pulse-theme-preference') === 'auto' || localStorage.getItem('pulse-theme-auto') === 'true') {
        const newTheme = e.matches ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('pulse-theme', newTheme);
        updateThemeIcon(newTheme);
      }
    });
  } else {
    // Use explicitly saved theme
    const savedTheme = localStorage.getItem('pulse-theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
  }
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';

  // When toggling manually, disable auto mode
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('pulse-theme', newTheme);
  localStorage.setItem('pulse-theme-preference', newTheme);
  localStorage.removeItem('pulse-theme-auto');
  updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
  const icon = document.querySelector('#theme-toggle i');
  if (icon) {
    icon.className = theme === 'light' ? 'bi bi-moon-stars' : 'bi bi-sun';
  }
}

// Get current theme preference (for use in other scripts)
function getThemePreference() {
  return {
    preference: localStorage.getItem('pulse-theme-preference') || 'auto',
    current: document.documentElement.getAttribute('data-theme') || 'light',
    isAuto: localStorage.getItem('pulse-theme-auto') === 'true' || localStorage.getItem('pulse-theme-preference') === 'auto'
  };
}

// Apply theme preference (for use in settings page)
function applyThemePreference(preference) {
  if (preference === 'auto') {
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = systemPrefersDark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('pulse-theme', theme);
    localStorage.setItem('pulse-theme-auto', 'true');
    localStorage.setItem('pulse-theme-preference', 'auto');
    updateThemeIcon(theme);
  } else {
    document.documentElement.setAttribute('data-theme', preference);
    localStorage.setItem('pulse-theme', preference);
    localStorage.setItem('pulse-theme-preference', preference);
    localStorage.removeItem('pulse-theme-auto');
    updateThemeIcon(preference);
  }
}

// Keyboard Shortcuts
function initializeKeyboardShortcuts() {
  document.addEventListener('keydown', function(e) {
    // Cmd/Ctrl + K: Focus search
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      const searchInput = document.querySelector('#search-input, #global-search, .search-input');
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
    }

    // Escape: Close modals/dropdowns
    if (e.key === 'Escape') {
      // Close any open modals (Bootstrap handles this, but for custom modals)
      document.querySelectorAll('.modal-overlay.show').forEach(overlay => {
        overlay.classList.remove('show');
      });
      document.querySelectorAll('.modal-dialog.show').forEach(modal => {
        modal.classList.remove('show');
      });
    }

    // Cmd/Ctrl + D: Toggle dark mode
    if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
      e.preventDefault();
      toggleTheme();
    }

    // Cmd/Ctrl + N: New dashboard (if on dashboards page)
    if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
      if (window.location.pathname.includes('/dashboards')) {
        e.preventDefault();
        window.location.href = '/dashboards/new';
      }
    }
  });
}

// Export theme functions for use in UI
if (typeof window !== 'undefined') {
  window.toggleTheme = toggleTheme;
  window.getThemePreference = getThemePreference;
  window.applyThemePreference = applyThemePreference;
}
