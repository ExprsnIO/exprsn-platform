/**
 * Vault Admin Dashboard - Enhanced Production-Ready Frontend
 * Features: Socket.IO real-time updates, comprehensive error handling,
 * loading states, data export, keyboard shortcuts, and accessibility
 */

// ============================================================================
// INITIALIZATION & CONFIGURATION
// ============================================================================

const CONFIG = {
  API_BASE: '/api',
  SOCKET_URL: window.location.origin,
  REFRESH_INTERVAL: 30000, // 30 seconds
  TOAST_DURATION: 3000,
  PAGINATION: {
    DEFAULT_LIMIT: 50,
    MAX_LIMIT: 100
  }
};

// State management
const state = {
  currentView: 'dashboard',
  stats: {},
  tokens: [],
  secrets: [],
  policies: [],
  selectedTokens: [],
  filters: {},
  socket: null,
  isConnected: false,
  loading: false,
  user: null
};

// Charts
let charts = {
  tokenStatus: null,
  risk: null,
  trends: null
};

// ============================================================================
// SOCKET.IO REAL-TIME UPDATES
// ============================================================================

function initializeSocket() {
  // Initialize Socket.IO connection
  const token = localStorage.getItem('vaultAdminToken') || 'dev_token';

  state.socket = io(CONFIG.SOCKET_URL, {
    auth: { token },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5
  });

  // Connection events
  state.socket.on('connect', () => {
    state.isConnected = true;
    updateConnectionStatus(true);
    showToast('Connected to real-time updates', 'success');

    // Subscribe to admin channel
    state.socket.emit('subscribe', ['admin', 'tokens', 'policies', 'security']);
  });

  state.socket.on('disconnect', () => {
    state.isConnected = false;
    updateConnectionStatus(false);
    showToast('Disconnected from real-time updates', 'warning');
  });

  state.socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
    updateConnectionStatus(false);
  });

  state.socket.on('connected', (data) => {
    console.log('Socket.IO connected:', data);
  });

  // Real-time event handlers
  state.socket.on('token:event', handleTokenEvent);
  state.socket.on('policy:event', handlePolicyEvent);
  state.socket.on('security:alert', handleSecurityAlert);
  state.socket.on('stats:update', handleStatsUpdate);
  state.socket.on('cache:stats', handleCacheStatsUpdate);
  state.socket.on('audit:log', handleAuditLog);
  state.socket.on('notification', handleNotification);

  // Heartbeat
  setInterval(() => {
    if (state.socket && state.socket.connected) {
      state.socket.emit('ping');
    }
  }, 30000);

  state.socket.on('pong', (data) => {
    console.debug('Heartbeat:', data);
  });
}

function updateConnectionStatus(connected) {
  const indicator = document.getElementById('connectionStatus');
  if (indicator) {
    indicator.className = connected ? 'badge bg-success' : 'badge bg-danger';
    indicator.textContent = connected ? 'Connected' : 'Disconnected';
  }
}

// ============================================================================
// REAL-TIME EVENT HANDLERS
// ============================================================================

function handleTokenEvent(data) {
  console.log('Token event received:', data);

  const { event, data: eventData } = data;

  switch (event) {
    case 'created':
      showToast(`Token created: ${eventData.displayName}`, 'success');
      playNotificationSound();
      if (state.currentView === 'tokens') {
        loadTokens();
      }
      break;

    case 'revoked':
      showToast(`Token revoked: ${eventData.displayName}`, 'warning');
      playNotificationSound();
      if (state.currentView === 'tokens') {
        loadTokens();
      }
      break;

    case 'suspended':
      showToast(`Token suspended: ${eventData.displayName}`, 'info');
      if (state.currentView === 'tokens') {
        loadTokens();
      }
      break;
  }

  // Update dashboard stats
  loadDashboardStats();
}

function handlePolicyEvent(data) {
  console.log('Policy event received:', data);
  showToast(`Policy ${data.event}: ${data.data.name || 'Unknown'}`, 'info');

  if (state.currentView === 'policies') {
    loadPolicies();
  }
}

function handleSecurityAlert(data) {
  console.warn('Security alert:', data);

  showAlert({
    title: 'Security Alert',
    message: `Anomaly detected on token ${data.tokenId}`,
    type: 'danger',
    persistent: true
  });

  playNotificationSound('alert');

  // Create desktop notification if permitted
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('Vault Security Alert', {
      body: `Critical anomaly detected on token ${data.tokenId}`,
      icon: '/favicon.ico',
      tag: 'security-alert'
    });
  }
}

function handleStatsUpdate(data) {
  state.stats = data.stats;
  updateDashboardCards(data.stats);
}

function handleCacheStatsUpdate(data) {
  updateCacheDisplay(data.stats);
}

function handleAuditLog(data) {
  if (state.currentView === 'audit') {
    prependAuditLog(data.log);
  }
}

function handleNotification(data) {
  showToast(data.message || 'Notification received', data.type || 'info');
}

// ============================================================================
// LOADING STATES & UI FEEDBACK
// ============================================================================

function setLoading(isLoading, target = 'body') {
  state.loading = isLoading;

  const element = document.querySelector(target);
  if (!element) return;

  if (isLoading) {
    element.classList.add('loading');
    element.style.pointerEvents = 'none';
    element.style.opacity = '0.6';
  } else {
    element.classList.remove('loading');
    element.style.pointerEvents = '';
    element.style.opacity = '';
  }
}

function showLoadingSpinner(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <div class="text-center py-5">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
      <p class="mt-3 text-muted">Loading data...</p>
    </div>
  `;
}

function hideLoadingSpinner(containerId) {
  // Content will be replaced by actual data
}

// ============================================================================
// ENHANCED TOAST NOTIFICATIONS
// ============================================================================

const toastQueue = [];
let toastContainer = null;

function ensureToastContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toastContainer';
    toastContainer.className = 'toast-container position-fixed top-0 end-0 p-3';
    toastContainer.style.zIndex = '9999';
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

function showToast(message, type = 'info', duration = CONFIG.TOAST_DURATION) {
  const container = ensureToastContainer();

  const toastId = `toast-${Date.now()}`;
  const toast = document.createElement('div');
  toast.id = toastId;
  toast.className = `toast align-items-center text-white bg-${type} border-0`;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'assertive');
  toast.setAttribute('aria-atomic', 'true');

  const icons = {
    success: 'check-circle-fill',
    danger: 'exclamation-triangle-fill',
    warning: 'exclamation-circle-fill',
    info: 'info-circle-fill'
  };

  toast.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">
        <i class="bi bi-${icons[type] || icons.info} me-2"></i>
        ${escapeHtml(message)}
      </div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>
  `;

  container.appendChild(toast);

  const bsToast = new bootstrap.Toast(toast, {
    autohide: true,
    delay: duration
  });

  bsToast.show();

  toast.addEventListener('hidden.bs.toast', () => {
    toast.remove();
  });

  return bsToast;
}

// ============================================================================
// MODAL DIALOGS WITH VALIDATION
// ============================================================================

function showConfirmDialog(options) {
  return new Promise((resolve) => {
    const { title, message, confirmText = 'Confirm', cancelText = 'Cancel', type = 'warning' } = options;

    const modalId = 'confirmModal';
    let modal = document.getElementById(modalId);

    if (!modal) {
      modal = document.createElement('div');
      modal.id = modalId;
      modal.className = 'modal fade';
      modal.innerHTML = `
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header bg-${type} text-white">
              <h5 class="modal-title"></h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body"></div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal"></button>
              <button type="button" class="btn btn-${type}"></button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    modal.querySelector('.modal-title').textContent = title;
    modal.querySelector('.modal-body').innerHTML = message;
    modal.querySelector('.btn-secondary').textContent = cancelText;
    modal.querySelector(`.btn-${type}`).textContent = confirmText;

    const bsModal = new bootstrap.Modal(modal);

    const confirmBtn = modal.querySelector(`.btn-${type}`);
    const cancelBtn = modal.querySelector('.btn-secondary');

    const cleanup = () => {
      confirmBtn.removeEventListener('click', confirmHandler);
      cancelBtn.removeEventListener('click', cancelHandler);
      modal.removeEventListener('hidden.bs.modal', hideHandler);
    };

    const confirmHandler = () => {
      cleanup();
      bsModal.hide();
      resolve(true);
    };

    const cancelHandler = () => {
      cleanup();
      resolve(false);
    };

    const hideHandler = () => {
      cleanup();
      resolve(false);
    };

    confirmBtn.addEventListener('click', confirmHandler);
    cancelBtn.addEventListener('click', cancelHandler);
    modal.addEventListener('hidden.bs.modal', hideHandler);

    bsModal.show();
  });
}

function showPromptDialog(options) {
  return new Promise((resolve) => {
    const { title, message, placeholder = '', defaultValue = '', type = 'text', required = false } = options;

    const modalId = 'promptModal';
    let modal = document.getElementById(modalId);

    if (!modal) {
      modal = document.createElement('div');
      modal.id = modalId;
      modal.className = 'modal fade';
      modal.innerHTML = `
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title"></h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <p class="mb-3"></p>
              <input type="text" class="form-control" />
              <div class="invalid-feedback"></div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="button" class="btn btn-primary">OK</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    modal.querySelector('.modal-title').textContent = title;
    modal.querySelector('.modal-body p').textContent = message;
    const input = modal.querySelector('input');
    input.type = type;
    input.placeholder = placeholder;
    input.value = defaultValue;
    input.required = required;

    const bsModal = new bootstrap.Modal(modal);

    const okBtn = modal.querySelector('.btn-primary');
    const cancelBtn = modal.querySelector('.btn-secondary');

    const cleanup = () => {
      okBtn.removeEventListener('click', okHandler);
      cancelBtn.removeEventListener('click', cancelHandler);
      modal.removeEventListener('hidden.bs.modal', hideHandler);
    };

    const okHandler = () => {
      const value = input.value.trim();

      if (required && !value) {
        input.classList.add('is-invalid');
        modal.querySelector('.invalid-feedback').textContent = 'This field is required';
        return;
      }

      cleanup();
      bsModal.hide();
      resolve(value);
    };

    const cancelHandler = () => {
      cleanup();
      resolve(null);
    };

    const hideHandler = () => {
      cleanup();
      resolve(null);
    };

    okBtn.addEventListener('click', okHandler);
    cancelBtn.addEventListener('click', cancelHandler);
    modal.addEventListener('hidden.bs.modal', hideHandler);

    bsModal.show();

    // Focus input
    setTimeout(() => input.focus(), 200);
  });
}

// ============================================================================
// DATA EXPORT FUNCTIONALITY
// ============================================================================

function exportData(data, filename, format = 'json') {
  let content, mimeType;

  switch (format) {
    case 'json':
      content = JSON.stringify(data, null, 2);
      mimeType = 'application/json';
      filename = filename.endsWith('.json') ? filename : `${filename}.json`;
      break;

    case 'csv':
      content = convertToCSV(data);
      mimeType = 'text/csv';
      filename = filename.endsWith('.csv') ? filename : `${filename}.csv`;
      break;

    default:
      throw new Error(`Unsupported export format: ${format}`);
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showToast(`Exported ${filename}`, 'success');
}

function convertToCSV(data) {
  if (!Array.isArray(data) || data.length === 0) {
    return '';
  }

  const headers = Object.keys(data[0]);
  const csvRows = [headers.join(',')];

  for (const row of data) {
    const values = headers.map(header => {
      const value = row[header];
      const escaped = ('' + value).replace(/"/g, '""');
      return `"${escaped}"`;
    });
    csvRows.push(values.join(','));
  }

  return csvRows.join('\n');
}

// ============================================================================
// KEYBOARD SHORTCUTS
// ============================================================================

function initializeKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + K: Focus search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      const searchInput = document.querySelector('input[type="search"], input[placeholder*="Search"]');
      if (searchInput) searchInput.focus();
    }

    // Ctrl/Cmd + N: New token
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      if (state.currentView === 'tokens') {
        const newTokenBtn = document.querySelector('[data-bs-target="#generateTokenModal"]');
        if (newTokenBtn) newTokenBtn.click();
      }
    }

    // Ctrl/Cmd + R: Refresh
    if ((e.ctrlKey || e.metaKey) && e.key === 'r' && e.shiftKey) {
      e.preventDefault();
      loadCurrentView();
    }

    // ESC: Close modals
    if (e.key === 'Escape') {
      const modals = document.querySelectorAll('.modal.show');
      modals.forEach(modal => {
        const bsModal = bootstrap.Modal.getInstance(modal);
        if (bsModal) bsModal.hide();
      });
    }

    // 1-6: Navigate to views
    if (e.altKey && e.key >= '1' && e.key <= '6') {
      e.preventDefault();
      const views = ['dashboard', 'tokens', 'secrets', 'policies', 'audit', 'analytics'];
      const viewIndex = parseInt(e.key) - 1;
      if (views[viewIndex]) {
        switchView(views[viewIndex]);
      }
    }
  });
}

// ============================================================================
// SOUND NOTIFICATIONS
// ============================================================================

function playNotificationSound(type = 'default') {
  if (!window.notificationsEnabled) return;

  const sounds = {
    default: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTQIGGS15ueZTRALUKXh8LNiHAU7kdfy0H0tBSp+zPDckj8KFF60 ',
    alert: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTQIGGS15ueZTRALUKXh8LNiHAU7kdfy0H0tBSp+zPDckj8KFF60'
  };

  try {
    const audio = new Audio(sounds[type] || sounds.default);
    audio.volume = 0.3;
    audio.play().catch(console.error);
  } catch (error) {
    console.error('Failed to play notification sound:', error);
  }
}

// ============================================================================
// ACCESSIBILITY ENHANCEMENTS
// ============================================================================

function initializeAccessibility() {
  // Add ARIA labels
  document.querySelectorAll('button:not([aria-label])').forEach(btn => {
    if (!btn.textContent.trim() && btn.querySelector('i')) {
      const icon = btn.querySelector('i');
      const iconClass = icon.className;
      if (iconClass.includes('eye')) btn.setAttribute('aria-label', 'View details');
      else if (iconClass.includes('pencil')) btn.setAttribute('aria-label', 'Edit');
      else if (iconClass.includes('trash')) btn.setAttribute('aria-label', 'Delete');
      else if (iconClass.includes('pause')) btn.setAttribute('aria-label', 'Suspend');
      else if (iconClass.includes('x')) btn.setAttribute('aria-label', 'Revoke');
    }
  });

  // Improve focus visibility
  const style = document.createElement('style');
  style.textContent = `
    *:focus-visible {
      outline: 2px solid #0d6efd !important;
      outline-offset: 2px !important;
    }
  `;
  document.head.appendChild(style);

  // Skip to main content link
  const skipLink = document.createElement('a');
  skipLink.href = '#main-content';
  skipLink.className = 'visually-hidden-focusable btn btn-primary position-absolute top-0 start-0 m-3';
  skipLink.textContent = 'Skip to main content';
  skipLink.style.zIndex = '10000';
  document.body.insertBefore(skipLink, document.body.firstChild);

  const main = document.querySelector('main');
  if (main && !main.id) {
    main.id = 'main-content';
  }
}

// ============================================================================
// REQUEST NOTIFICATION PERMISSION
// ============================================================================

async function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      showToast('Desktop notifications enabled', 'success');
    }
  }
}

// ============================================================================
// MODAL HANDLERS & VALIDATION
// ============================================================================

function initializeModalHandlers() {
  // Create Secret Modal
  const submitCreateSecret = document.getElementById('submitCreateSecret');
  if (submitCreateSecret) {
    submitCreateSecret.addEventListener('click', async () => {
      const form = document.getElementById('createSecretForm');

      if (!validateForm(form)) {
        showToast('Please fix validation errors', 'warning');
        return;
      }

      const secretData = {
        path: document.getElementById('secretPath').value.trim(),
        value: document.getElementById('secretValue').value,
        metadata: document.getElementById('secretMetadata').value || '{}',
        expiresAt: document.getElementById('secretExpiry').value || null,
        versioning: document.getElementById('secretVersion').value === 'true'
      };

      // Validate JSON metadata
      try {
        JSON.parse(secretData.metadata);
      } catch (e) {
        showToast('Invalid JSON in metadata field', 'danger');
        document.getElementById('secretMetadata').classList.add('is-invalid');
        return;
      }

      setLoading(true);
      try {
        const response = await fetch(`${CONFIG.API_BASE}/secrets${secretData.path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(secretData)
        });

        if (!response.ok) throw new Error('Failed to create secret');

        showToast('Secret created successfully', 'success');
        playNotificationSound();
        bootstrap.Modal.getInstance(document.getElementById('createSecretModal')).hide();
        form.reset();

        // Refresh secrets view if active
        if (state.currentView === 'secrets') {
          loadSecretsView();
        }
      } catch (error) {
        console.error('Error creating secret:', error);
        showToast('Failed to create secret', 'danger');
      } finally {
        setLoading(false);
      }
    });
  }

  // Create Policy Modal
  const submitCreatePolicy = document.getElementById('submitCreatePolicy');
  if (submitCreatePolicy) {
    submitCreatePolicy.addEventListener('click', async () => {
      const form = document.getElementById('createPolicyForm');

      if (!validateForm(form)) {
        showToast('Please fix validation errors', 'warning');
        return;
      }

      const policyData = {
        name: document.getElementById('policyName').value.trim(),
        policyType: document.getElementById('policyType').value,
        description: document.getElementById('policyDescription').value.trim(),
        rules: document.getElementById('policyRules').value,
        priority: parseInt(document.getElementById('policyPriority').value),
        enforcementMode: document.getElementById('policyEnforcement').value,
        status: document.getElementById('policyActive').checked ? 'active' : 'inactive'
      };

      // Validate JSON rules
      try {
        JSON.parse(policyData.rules);
      } catch (e) {
        showToast('Invalid JSONLex format in policy rules', 'danger');
        document.getElementById('policyRules').classList.add('is-invalid');
        return;
      }

      setLoading(true);
      try {
        const response = await fetch(`${CONFIG.API_BASE}/admin/policies`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(policyData)
        });

        if (!response.ok) throw new Error('Failed to create policy');

        const result = await response.json();
        showToast('Policy created successfully', 'success');
        playNotificationSound();
        bootstrap.Modal.getInstance(document.getElementById('createPolicyModal')).hide();
        form.reset();

        // Refresh policies view if active
        if (state.currentView === 'policies') {
          loadPoliciesView();
        }
      } catch (error) {
        console.error('Error creating policy:', error);
        showToast('Failed to create policy', 'danger');
      } finally {
        setLoading(false);
      }
    });
  }

  // Validate Policy JSONLex Button
  const validatePolicyBtn = document.getElementById('validatePolicyBtn');
  if (validatePolicyBtn) {
    validatePolicyBtn.addEventListener('click', () => {
      const rulesInput = document.getElementById('policyRules');
      try {
        const rules = JSON.parse(rulesInput.value);
        rulesInput.classList.remove('is-invalid');
        rulesInput.classList.add('is-valid');
        showToast('JSONLex validation passed', 'success');
      } catch (e) {
        rulesInput.classList.remove('is-valid');
        rulesInput.classList.add('is-invalid');
        showToast(`JSONLex validation failed: ${e.message}`, 'danger');
      }
    });
  }

  // Edit Policy Modal
  const submitEditPolicy = document.getElementById('submitEditPolicy');
  if (submitEditPolicy) {
    submitEditPolicy.addEventListener('click', async () => {
      const form = document.getElementById('editPolicyForm');

      if (!validateForm(form)) {
        showToast('Please fix validation errors', 'warning');
        return;
      }

      const policyId = document.getElementById('editPolicyId').value;
      const policyData = {
        name: document.getElementById('editPolicyName').value.trim(),
        policyType: document.getElementById('editPolicyType').value,
        description: document.getElementById('editPolicyDescription').value.trim(),
        rules: document.getElementById('editPolicyRules').value,
        priority: parseInt(document.getElementById('editPolicyPriority').value),
        enforcementMode: document.getElementById('editPolicyEnforcement').value
      };

      // Validate JSON rules
      try {
        JSON.parse(policyData.rules);
      } catch (e) {
        showToast('Invalid JSONLex format in policy rules', 'danger');
        document.getElementById('editPolicyRules').classList.add('is-invalid');
        return;
      }

      setLoading(true);
      try {
        const response = await fetch(`${CONFIG.API_BASE}/admin/policies/${policyId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(policyData)
        });

        if (!response.ok) throw new Error('Failed to update policy');

        showToast('Policy updated successfully', 'success');
        playNotificationSound();
        bootstrap.Modal.getInstance(document.getElementById('editPolicyModal')).hide();

        // Refresh policies view
        if (state.currentView === 'policies') {
          loadPoliciesView();
        }
      } catch (error) {
        console.error('Error updating policy:', error);
        showToast('Failed to update policy', 'danger');
      } finally {
        setLoading(false);
      }
    });
  }

  // Delete Policy Button
  const deletePolicyBtn = document.getElementById('deletePolicyBtn');
  if (deletePolicyBtn) {
    deletePolicyBtn.addEventListener('click', async () => {
      const policyId = document.getElementById('editPolicyId').value;
      const policyName = document.getElementById('editPolicyName').value;

      const confirmed = await showConfirmDialog(
        `Are you sure you want to delete policy "${policyName}"?`,
        'Delete Policy',
        'danger'
      );

      if (!confirmed) return;

      setLoading(true);
      try {
        const response = await fetch(`${CONFIG.API_BASE}/admin/policies/${policyId}`, {
          method: 'DELETE'
        });

        if (!response.ok) throw new Error('Failed to delete policy');

        showToast('Policy deleted successfully', 'success');
        bootstrap.Modal.getInstance(document.getElementById('editPolicyModal')).hide();

        // Refresh policies view
        if (state.currentView === 'policies') {
          loadPoliciesView();
        }
      } catch (error) {
        console.error('Error deleting policy:', error);
        showToast('Failed to delete policy', 'danger');
      } finally {
        setLoading(false);
      }
    });
  }

  // Export Data Modal
  const exportBtn = document.getElementById('exportBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const modal = new bootstrap.Modal(document.getElementById('exportDataModal'));
      modal.show();
    });
  }

  const submitExportData = document.getElementById('submitExportData');
  if (submitExportData) {
    submitExportData.addEventListener('click', async () => {
      const form = document.getElementById('exportDataForm');

      if (!validateForm(form)) {
        showToast('Please select a data type', 'warning');
        return;
      }

      const dataType = document.getElementById('exportDataType').value;
      const format = document.getElementById('exportFormat').value;
      const startDate = document.getElementById('exportStartDate').value;
      const endDate = document.getElementById('exportEndDate').value;
      const includeRevoked = document.getElementById('exportIncludeRevoked').checked;

      setLoading(true);
      try {
        // Build query parameters
        const params = new URLSearchParams({
          format,
          includeRevoked: includeRevoked.toString()
        });

        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);

        // Map data type to API endpoint
        const endpoints = {
          tokens: '/admin/tokens',
          secrets: '/secrets', // metadata only
          policies: '/admin/policies',
          audit: '/admin/audit/report',
          analytics: '/admin/analytics/report'
        };

        const endpoint = endpoints[dataType];
        const response = await fetch(`${CONFIG.API_BASE}${endpoint}?${params}`);

        if (!response.ok) throw new Error('Export failed');

        const data = await response.json();

        // Export using the existing exportData function
        await exportData(data.data || data, dataType, format);

        showToast('Export completed successfully', 'success');
        bootstrap.Modal.getInstance(document.getElementById('exportDataModal')).hide();
        form.reset();
      } catch (error) {
        console.error('Export error:', error);
        showToast('Export failed', 'danger');
      } finally {
        setLoading(false);
      }
    });
  }

  // Token Details Modal handlers
  const revokeTokenBtn = document.getElementById('revokeTokenBtn');
  if (revokeTokenBtn) {
    revokeTokenBtn.addEventListener('click', async () => {
      const tokenId = revokeTokenBtn.dataset.tokenId;
      const tokenName = revokeTokenBtn.dataset.tokenName;

      const reason = await showPromptDialog(
        `Why are you revoking token "${tokenName}"?`,
        'Revoke Token'
      );

      if (!reason) return;

      setLoading(true);
      try {
        const response = await fetch(`${CONFIG.API_BASE}/admin/tokens/${tokenId}/revoke`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason })
        });

        if (!response.ok) throw new Error('Revocation failed');

        showToast('Token revoked successfully', 'success');
        playNotificationSound();
        bootstrap.Modal.getInstance(document.getElementById('tokenDetailsModal')).hide();

        if (state.currentView === 'tokens') {
          loadTokensView();
        }
      } catch (error) {
        console.error('Revocation error:', error);
        showToast('Failed to revoke token', 'danger');
      } finally {
        setLoading(false);
      }
    });
  }

  const suspendTokenBtn = document.getElementById('suspendTokenBtn');
  if (suspendTokenBtn) {
    suspendTokenBtn.addEventListener('click', async () => {
      const tokenId = suspendTokenBtn.dataset.tokenId;
      const tokenName = suspendTokenBtn.dataset.tokenName;

      const reason = await showPromptDialog(
        `Why are you suspending token "${tokenName}"?`,
        'Suspend Token'
      );

      if (!reason) return;

      setLoading(true);
      try {
        const response = await fetch(`${CONFIG.API_BASE}/admin/tokens/${tokenId}/suspend`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason })
        });

        if (!response.ok) throw new Error('Suspension failed');

        showToast('Token suspended successfully', 'success');
        bootstrap.Modal.getInstance(document.getElementById('tokenDetailsModal')).hide();

        if (state.currentView === 'tokens') {
          loadTokensView();
        }
      } catch (error) {
        console.error('Suspension error:', error);
        showToast('Failed to suspend token', 'danger');
      } finally {
        setLoading(false);
      }
    });
  }

  // Security Alert Modal handlers
  const acknowledgeAlertBtn = document.getElementById('acknowledgeAlertBtn');
  if (acknowledgeAlertBtn) {
    acknowledgeAlertBtn.addEventListener('click', () => {
      const tokenId = acknowledgeAlertBtn.dataset.tokenId;
      const anomalies = JSON.parse(acknowledgeAlertBtn.dataset.anomalies || '[]');

      showConfirmDialog(
        'This will revoke the token immediately. Continue?',
        'Take Action',
        'danger'
      ).then(async (confirmed) => {
        if (!confirmed) return;

        setLoading(true);
        try {
          const response = await fetch(`${CONFIG.API_BASE}/admin/tokens/${tokenId}/revoke`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              reason: `Security alert: ${anomalies.map(a => a.type).join(', ')}`
            })
          });

          if (!response.ok) throw new Error('Failed to revoke token');

          showToast('Token revoked due to security alert', 'success');
          bootstrap.Modal.getInstance(document.getElementById('securityAlertModal')).hide();

          if (state.currentView === 'tokens') {
            loadTokensView();
          }
        } catch (error) {
          console.error('Error revoking token:', error);
          showToast('Failed to take action', 'danger');
        } finally {
          setLoading(false);
        }
      });
    });
  }
}

/**
 * Validate Bootstrap form
 */
function validateForm(form) {
  form.classList.add('was-validated');
  return form.checkValidity();
}

/**
 * Show token details modal
 */
async function showTokenDetails(tokenId) {
  setLoading(true);
  try {
    const response = await fetch(`${CONFIG.API_BASE}/admin/tokens/${tokenId}`);
    if (!response.ok) throw new Error('Failed to load token details');

    const { data: token } = await response.json();

    // Populate modal
    const content = document.getElementById('tokenDetailsContent');
    content.innerHTML = `
      <div class="row">
        <div class="col-md-6 mb-3">
          <label class="fw-bold">Token ID</label>
          <p class="font-monospace">${token.tokenId}</p>
        </div>
        <div class="col-md-6 mb-3">
          <label class="fw-bold">Display Name</label>
          <p>${token.displayName}</p>
        </div>
      </div>
      <div class="row">
        <div class="col-md-6 mb-3">
          <label class="fw-bold">Entity Type</label>
          <p><span class="badge bg-info">${token.entityType}</span></p>
        </div>
        <div class="col-md-6 mb-3">
          <label class="fw-bold">Entity ID</label>
          <p>${token.entityId}</p>
        </div>
      </div>
      <div class="row">
        <div class="col-md-6 mb-3">
          <label class="fw-bold">Status</label>
          <p><span class="badge bg-${token.status === 'active' ? 'success' : 'danger'}">${token.status}</span></p>
        </div>
        <div class="col-md-6 mb-3">
          <label class="fw-bold">Risk Score</label>
          <p><span class="badge bg-${token.riskScore > 0.7 ? 'danger' : token.riskScore > 0.4 ? 'warning' : 'success'}">${(token.riskScore * 100).toFixed(1)}%</span></p>
        </div>
      </div>
      <div class="mb-3">
        <label class="fw-bold">Permissions</label>
        <pre class="bg-light p-2 rounded">${JSON.stringify(token.permissions, null, 2)}</pre>
      </div>
      <div class="mb-3">
        <label class="fw-bold">Path Prefixes</label>
        <p>${token.pathPrefixes?.join(', ') || 'None'}</p>
      </div>
      <div class="mb-3">
        <label class="fw-bold">IP Whitelist</label>
        <p>${token.ipWhitelist?.join(', ') || 'None'}</p>
      </div>
      <div class="row">
        <div class="col-md-6 mb-3">
          <label class="fw-bold">Created</label>
          <p>${new Date(token.createdAt).toLocaleString()}</p>
        </div>
        <div class="col-md-6 mb-3">
          <label class="fw-bold">Last Used</label>
          <p>${token.lastUsedAt ? new Date(token.lastUsedAt).toLocaleString() : 'Never'}</p>
        </div>
      </div>
      <div class="row">
        <div class="col-md-6 mb-3">
          <label class="fw-bold">Usage Count</label>
          <p>${token.usageCount} / ${token.maxUses || '∞'}</p>
        </div>
        <div class="col-md-6 mb-3">
          <label class="fw-bold">Expires</label>
          <p>${token.expiresAt ? new Date(token.expiresAt).toLocaleString() : 'Never'}</p>
        </div>
      </div>
    `;

    // Set button data
    document.getElementById('revokeTokenBtn').dataset.tokenId = token.tokenId;
    document.getElementById('revokeTokenBtn').dataset.tokenName = token.displayName;
    document.getElementById('suspendTokenBtn').dataset.tokenId = token.tokenId;
    document.getElementById('suspendTokenBtn').dataset.tokenName = token.displayName;

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('tokenDetailsModal'));
    modal.show();
  } catch (error) {
    console.error('Error loading token details:', error);
    showToast('Failed to load token details', 'danger');
  } finally {
    setLoading(false);
  }
}

// Make function globally available
window.showTokenDetails = showTokenDetails;

// ============================================================================
// ENHANCED ERROR HANDLING
// ============================================================================

window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
  showToast('An unexpected error occurred', 'danger');
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  showToast('An error occurred processing your request', 'danger');
});

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Initializing Vault Admin Dashboard (Enhanced)');

  // Initialize all components
  initializeSocket();
  initializeModalHandlers();
  initializeKeyboardShortcuts();
  initializeAccessibility();
  requestNotificationPermission();

  // Show keyboard shortcuts help
  const helpText = `
Keyboard Shortcuts:
• Ctrl/Cmd + K: Focus search
• Ctrl/Cmd + N: New token
• Ctrl/Cmd + Shift + R: Refresh
• Alt + 1-6: Navigate views
• ESC: Close modals
  `.trim();

  console.log(helpText);

  showToast('Dashboard ready! Press Ctrl+K for search', 'info', 5000);
});

// Export functions for use in main dashboard script
window.VaultDashboard = {
  showToast,
  showConfirmDialog,
  showPromptDialog,
  exportData,
  setLoading,
  playNotificationSound
};
