/**
 * Moderation Dashboard Client-Side JavaScript
 * Handles real-time updates, charts, and user interactions
 */

// Socket.IO connection
const socket = io('/moderation', {
  auth: {
    token: localStorage.getItem('ca_token') || ''
  }
});

// Chart instances
let activityChart = null;
let actionsChart = null;

// Current period
let currentPeriod = 'week';

/**
 * Initialize dashboard on page load
 */
document.addEventListener('DOMContentLoaded', () => {
  initializeCharts();
  loadMetrics(currentPeriod);
  loadRecentActions();
  loadActiveWorkflows();
  loadAIProviders();
  initializeThemeToggle();
  setupSocketListeners();
});

/**
 * Initialize Chart.js charts
 */
function initializeCharts() {
  // Activity Chart (Line)
  const activityCtx = document.getElementById('activityChart').getContext('2d');
  activityChart = new Chart(activityCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Approved',
          data: [],
          borderColor: 'rgb(25, 135, 84)',
          backgroundColor: 'rgba(25, 135, 84, 0.1)',
          tension: 0.4
        },
        {
          label: 'Removed',
          data: [],
          borderColor: 'rgb(220, 53, 69)',
          backgroundColor: 'rgba(220, 53, 69, 0.1)',
          tension: 0.4
        },
        {
          label: 'Warned',
          data: [],
          borderColor: 'rgb(255, 193, 7)',
          backgroundColor: 'rgba(255, 193, 7, 0.1)',
          tension: 0.4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top'
        }
      },
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });

  // Actions Chart (Doughnut)
  const actionsCtx = document.getElementById('actionsChart').getContext('2d');
  actionsChart = new Chart(actionsCtx, {
    type: 'doughnut',
    data: {
      labels: ['Approved', 'Removed', 'Warned', 'Banned'],
      datasets: [{
        data: [0, 0, 0, 0],
        backgroundColor: [
          'rgb(25, 135, 84)',
          'rgb(220, 53, 69)',
          'rgb(255, 193, 7)',
          'rgb(33, 37, 41)'
        ]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom'
        }
      }
    }
  });
}

/**
 * Load metrics for specified period
 */
async function loadMetrics(period) {
  try {
    currentPeriod = period;

    // Update active button
    document.querySelectorAll('[data-period]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.period === period);
    });

    const response = await fetch(`/api/metrics?period=${period}`);
    const data = await response.json();

    // Update metric cards
    document.getElementById('metricPending').textContent = data.pending || 0;
    document.getElementById('metricReviewed').textContent = data.reviewed || 0;
    document.getElementById('metricActions').textContent = data.actions || 0;
    document.getElementById('metricResponseTime').textContent = formatTime(data.responseTime || 0);
    document.getElementById('reviewedChange').textContent = data.reviewedChange || 0;

    // Update activity chart
    if (data.activity) {
      activityChart.data.labels = data.activity.labels;
      activityChart.data.datasets[0].data = data.activity.approved;
      activityChart.data.datasets[1].data = data.activity.removed;
      activityChart.data.datasets[2].data = data.activity.warned;
      activityChart.update();
    }

    // Update actions chart
    if (data.actionTypes) {
      actionsChart.data.datasets[0].data = [
        data.actionTypes.approved || 0,
        data.actionTypes.removed || 0,
        data.actionTypes.warned || 0,
        data.actionTypes.banned || 0
      ];
      actionsChart.update();
    }

    // Update badge counts
    updateBadgeCounts(data);

  } catch (error) {
    console.error('Failed to load metrics:', error);
  }
}

/**
 * Load recent actions
 */
async function loadRecentActions() {
  try {
    const response = await fetch('/api/actions/recent?limit=10');
    const actions = await response.json();

    const container = document.getElementById('recentActions');

    if (actions.length === 0) {
      container.innerHTML = `
        <div class="list-group-item text-center text-muted py-4">
          <i class="bi bi-inbox fs-3"></i>
          <p class="mb-0 mt-2">No recent actions</p>
        </div>
      `;
      return;
    }

    container.innerHTML = actions.map(action => `
      <div class="list-group-item list-group-item-action">
        <div class="d-flex w-100 justify-content-between">
          <h6 class="mb-1">
            <span class="badge ${getActionBadgeClass(action.action)}">${action.action}</span>
            ${action.contentType}
          </h6>
          <small class="text-muted">${formatTimeAgo(action.createdAt)}</small>
        </div>
        <p class="mb-1 text-truncate">${escapeHtml(action.reason || 'No reason provided')}</p>
        <small class="text-muted">by ${action.moderatorName}</small>
      </div>
    `).join('');

  } catch (error) {
    console.error('Failed to load recent actions:', error);
  }
}

/**
 * Load active workflows
 */
async function loadActiveWorkflows() {
  try {
    const response = await fetch('/api/workflows/active');
    const workflows = await response.json();

    const container = document.getElementById('activeWorkflows');

    if (workflows.length === 0) {
      container.innerHTML = `
        <div class="list-group-item text-center text-muted py-4">
          <i class="bi bi-diagram-3 fs-3"></i>
          <p class="mb-0 mt-2">No active workflows</p>
        </div>
      `;
      return;
    }

    container.innerHTML = workflows.map(workflow => `
      <div class="list-group-item">
        <div class="d-flex w-100 justify-content-between">
          <h6 class="mb-1">${escapeHtml(workflow.name)}</h6>
          <span class="badge ${workflow.enabled ? 'bg-success' : 'bg-secondary'}">
            ${workflow.enabled ? 'Active' : 'Paused'}
          </span>
        </div>
        <p class="mb-1 small text-muted">${escapeHtml(workflow.description || 'No description')}</p>
        <div class="d-flex justify-content-between align-items-center">
          <small class="text-muted">${workflow.executionCount || 0} executions</small>
          <small class="text-muted">${formatTimeAgo(workflow.updatedAt)}</small>
        </div>
      </div>
    `).join('');

  } catch (error) {
    console.error('Failed to load workflows:', error);
  }
}

/**
 * Load AI provider status
 */
async function loadAIProviders() {
  try {
    const response = await fetch('/api/providers/status');
    const providers = await response.json();

    const container = document.getElementById('aiProviders');

    container.innerHTML = providers.map(provider => `
      <div class="col-md-4">
        <div class="d-flex align-items-center">
          <i class="bi bi-circle-fill ${provider.available ? 'text-success' : 'text-danger'} me-2" style="font-size: 0.5rem;"></i>
          <strong>${provider.name}</strong>
          <span class="ms-2 badge ${provider.available ? 'bg-success' : 'bg-danger'}">
            ${provider.available ? 'Available' : 'Unavailable'}
          </span>
        </div>
        <small class="text-muted ms-3">${provider.model || 'N/A'}</small>
      </div>
    `).join('');

  } catch (error) {
    console.error('Failed to load AI providers:', error);
    document.getElementById('aiProviders').innerHTML = `
      <div class="col-12">
        <span class="text-danger">Failed to load AI provider status</span>
      </div>
    `;
  }
}

/**
 * Setup Socket.IO listeners
 */
function setupSocketListeners() {
  // Connection status
  socket.on('connect', () => {
    console.log('Connected to moderation server');
    document.querySelector('.real-time-indicator i').classList.add('text-success');
    document.querySelector('.real-time-indicator i').classList.remove('text-danger');
  });

  socket.on('disconnect', () => {
    console.log('Disconnected from moderation server');
    document.querySelector('.real-time-indicator i').classList.add('text-danger');
    document.querySelector('.real-time-indicator i').classList.remove('text-success');
  });

  // Real-time metric updates
  socket.on('metrics:update', (data) => {
    if (data.pending !== undefined) {
      document.getElementById('metricPending').textContent = data.pending;
    }
    if (data.reviewed !== undefined) {
      document.getElementById('metricReviewed').textContent = data.reviewed;
    }
    if (data.actions !== undefined) {
      document.getElementById('metricActions').textContent = data.actions;
    }
    if (data.responseTime !== undefined) {
      document.getElementById('metricResponseTime').textContent = formatTime(data.responseTime);
    }
  });

  // New action notification
  socket.on('action:new', (action) => {
    loadRecentActions();
    loadMetrics(currentPeriod);
  });

  // Queue count updates
  socket.on('queue:update', (data) => {
    updateBadgeCounts(data);
  });

  // Workflow updates
  socket.on('workflow:update', () => {
    loadActiveWorkflows();
  });
}

/**
 * Update badge counts
 */
function updateBadgeCounts(data) {
  if (data.queueCount !== undefined) {
    document.getElementById('queueCount').textContent = data.queueCount;
  }
  if (data.reportsCount !== undefined) {
    document.getElementById('reportsCount').textContent = data.reportsCount;
  }
  if (data.appealsCount !== undefined) {
    document.getElementById('appealsCount').textContent = data.appealsCount;
  }
}

/**
 * Initialize theme toggle
 */
function initializeThemeToggle() {
  const themeToggle = document.getElementById('themeToggle');
  const themeIcon = document.getElementById('themeIcon');
  const html = document.documentElement;

  // Load saved theme
  const savedTheme = localStorage.getItem('theme') || 'light';
  html.setAttribute('data-bs-theme', savedTheme);
  updateThemeIcon(savedTheme, themeIcon);

  // Toggle theme
  themeToggle.addEventListener('click', () => {
    const currentTheme = html.getAttribute('data-bs-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';

    html.setAttribute('data-bs-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme, themeIcon);
  });
}

/**
 * Update theme icon
 */
function updateThemeIcon(theme, icon) {
  if (theme === 'dark') {
    icon.classList.remove('bi-sun-fill');
    icon.classList.add('bi-moon-fill');
  } else {
    icon.classList.remove('bi-moon-fill');
    icon.classList.add('bi-sun-fill');
  }
}

/**
 * Export report
 */
async function exportReport() {
  try {
    const response = await fetch(`/api/metrics/export?period=${currentPeriod}`);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `moderation-report-${currentPeriod}-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to export report:', error);
    alert('Failed to export report');
  }
}

/**
 * Refresh dashboard
 */
function refreshDashboard() {
  loadMetrics(currentPeriod);
  loadRecentActions();
  loadActiveWorkflows();
  loadAIProviders();
}

// Auto-refresh every 30 seconds
setInterval(refreshDashboard, 30000);

/**
 * Utility functions
 */
function formatTime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

function formatTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - new Date(timestamp)) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function getActionBadgeClass(action) {
  const classes = {
    approve: 'bg-success',
    approved: 'bg-success',
    remove: 'bg-danger',
    removed: 'bg-danger',
    warn: 'bg-warning',
    warned: 'bg-warning',
    ban: 'bg-dark',
    banned: 'bg-dark'
  };
  return classes[action.toLowerCase()] || 'bg-secondary';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
