/**
 * Vault Admin Dashboard - Frontend Logic
 */

// API Base URL
const API_BASE = '/api';
let authToken = localStorage.getItem('vaultAdminToken');

// State
const state = {
  currentView: 'dashboard',
  stats: {},
  tokens: [],
  secrets: [],
  policies: [],
  selectedTokens: []
};

// Charts
let tokenStatusChart, riskChart;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initializeEventListeners();
  loadDashboard();
});

function initializeEventListeners() {
  // Navigation
  document.querySelectorAll('#sidebar .nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const view = e.currentTarget.dataset.view;
      switchView(view);
    });
  });

  // Refresh button
  document.getElementById('refreshBtn').addEventListener('click', () => {
    loadCurrentView();
  });

  // Generate token form
  document.getElementById('submitGenerateToken').addEventListener('click', handleGenerateToken);

  // Copy token button
  document.getElementById('copyTokenBtn')?.addEventListener('click', () => {
    const tokenValue = document.getElementById('generatedTokenValue').value;
    navigator.clipboard.writeText(tokenValue);
    showToast('Token copied to clipboard!', 'success');
  });

  // Token filters
  document.getElementById('applyTokenFiltersBtn')?.addEventListener('click', loadTokens);

  // AI Policy suggestions
  document.getElementById('aiSuggestPoliciesBtn')?.addEventListener('click', showAISuggestions);

  // Maintenance buttons
  document.getElementById('purgeExpiredBtn')?.addEventListener('click', purgeExpiredTokens);
  document.getElementById('clearCacheBtn')?.addEventListener('click', clearCache);

  // Generate report
  document.getElementById('generateReportBtn')?.addEventListener('click', generateAccessReport);

  // Bulk revoke
  document.getElementById('bulkRevokeBtn')?.addEventListener('click', bulkRevokeTokens);
}

function switchView(view) {
  // Update nav
  document.querySelectorAll('#sidebar .nav-link').forEach(link => {
    link.classList.remove('active');
  });
  event.target.closest('.nav-link').classList.add('active');

  // Hide all views
  document.querySelectorAll('.view-content').forEach(v => {
    v.style.display = 'none';
  });

  // Show selected view
  const viewElement = document.getElementById(`${view}View`);
  if (viewElement) {
    viewElement.style.display = 'block';
  }

  // Update title
  const titles = {
    dashboard: 'Dashboard',
    tokens: 'Token Management',
    secrets: 'Secrets Management',
    policies: 'Access Policies',
    audit: 'Audit Logs',
    analytics: 'Analytics & AI',
    maintenance: 'Maintenance'
  };
  document.getElementById('viewTitle').textContent = titles[view] || view;

  state.currentView = view;
  loadCurrentView();
}

function loadCurrentView() {
  switch (state.currentView) {
    case 'dashboard':
      loadDashboard();
      break;
    case 'tokens':
      loadTokens();
      break;
    case 'secrets':
      loadSecrets();
      break;
    case 'policies':
      loadPolicies();
      break;
    case 'analytics':
      // Analytics loads on demand
      break;
    case 'maintenance':
      loadCacheStats();
      break;
  }
}

async function loadDashboard() {
  try {
    const stats = await apiRequest('/admin/dashboard/stats');
    state.stats = stats;

    // Update stat cards
    document.getElementById('activeTokensCount').textContent = stats.tokens.byStatus.active || 0;
    document.getElementById('secretsCount').textContent = stats.secrets.total || 0;
    document.getElementById('keysCount').textContent = stats.keys.total || 0;
    document.getElementById('highRiskCount').textContent =
      (stats.risk.high || 0) + (stats.risk.critical || 0);

    // Update charts
    updateTokenStatusChart(stats.tokens.byStatus);
    updateRiskChart(stats.risk);

    // Load recent activity
    await loadRecentActivity();
  } catch (error) {
    console.error('Failed to load dashboard:', error);
    showToast('Failed to load dashboard', 'danger');
  }
}

function updateTokenStatusChart(data) {
  const ctx = document.getElementById('tokenStatusChart');
  if (!ctx) return;

  if (tokenStatusChart) {
    tokenStatusChart.destroy();
  }

  tokenStatusChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Active', 'Revoked', 'Expired', 'Suspended'],
      datasets: [{
        data: [
          data.active || 0,
          data.revoked || 0,
          data.expired || 0,
          data.suspended || 0
        ],
        backgroundColor: ['#28a745', '#dc3545', '#6c757d', '#ffc107']
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'bottom'
        }
      }
    }
  });
}

function updateRiskChart(data) {
  const ctx = document.getElementById('riskChart');
  if (!ctx) return;

  if (riskChart) {
    riskChart.destroy();
  }

  riskChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Low', 'Medium', 'High', 'Critical'],
      datasets: [{
        label: 'Tokens by Risk Level',
        data: [data.low || 0, data.medium || 0, data.high || 0, data.critical || 0],
        backgroundColor: ['#28a745', '#ffc107', '#fd7e14', '#dc3545']
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1
          }
        }
      }
    }
  });
}

async function loadRecentActivity() {
  try {
    const report = await apiRequest('/admin/reports/access', 'POST', {
      startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    });

    const html = `
      <table class="table table-sm">
        <thead>
          <tr>
            <th>Time</th>
            <th>Action</th>
            <th>Resource</th>
            <th>Actor</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${report.logs.slice(0, 10).map(log => `
            <tr>
              <td>${new Date(log.createdAt).toLocaleString()}</td>
              <td><span class="badge bg-secondary">${log.action}</span></td>
              <td>${log.resourceType}</td>
              <td>${log.actor}</td>
              <td><span class="badge bg-${log.success ? 'success' : 'danger'}">
                ${log.success ? 'Success' : 'Failed'}
              </span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    document.getElementById('recentActivity').innerHTML = html;
  } catch (error) {
    console.error('Failed to load recent activity:', error);
  }
}

async function loadTokens() {
  try {
    const status = document.getElementById('tokenStatusFilter')?.value;
    const entityType = document.getElementById('tokenEntityTypeFilter')?.value;
    const search = document.getElementById('tokenSearchInput')?.value;

    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (entityType) params.append('entityType', entityType);

    const tokens = await apiRequest(`/admin/tokens?${params}`);
    state.tokens = tokens;

    let filteredTokens = tokens;
    if (search) {
      filteredTokens = tokens.filter(t =>
        t.displayName.toLowerCase().includes(search.toLowerCase()) ||
        t.tokenId.toLowerCase().includes(search.toLowerCase())
      );
    }

    renderTokensTable(filteredTokens);
  } catch (error) {
    console.error('Failed to load tokens:', error);
    showToast('Failed to load tokens', 'danger');
  }
}

function renderTokensTable(tokens) {
  const html = `
    <table class="table table-hover">
      <thead>
        <tr>
          <th><input type="checkbox" id="selectAllTokens"></th>
          <th>Display Name</th>
          <th>Token ID</th>
          <th>Entity</th>
          <th>Status</th>
          <th>Risk</th>
          <th>Created</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${tokens.map(token => `
          <tr>
            <td><input type="checkbox" class="token-select" value="${token.tokenId}"></td>
            <td>${escapeHtml(token.displayName)}</td>
            <td><code>${token.tokenId}</code></td>
            <td>
              <span class="badge bg-info">${token.entityType}</span>
              <br><small>${token.entityId}</small>
            </td>
            <td><span class="badge bg-${getStatusColor(token.status)}">${token.status}</span></td>
            <td>
              <div class="progress" style="height: 20px;">
                <div class="progress-bar bg-${getRiskColor(token.riskScore)}"
                     style="width: ${token.riskScore * 100}%">
                  ${(token.riskScore * 100).toFixed(0)}%
                </div>
              </div>
            </td>
            <td>${new Date(token.createdAt).toLocaleDateString()}</td>
            <td>
              <button class="btn btn-sm btn-info" onclick="viewTokenDetails('${token.tokenId}')">
                <i class="bi bi-eye"></i>
              </button>
              <button class="btn btn-sm btn-warning" onclick="suspendToken('${token.tokenId}')">
                <i class="bi bi-pause"></i>
              </button>
              <button class="btn btn-sm btn-danger" onclick="revokeToken('${token.tokenId}')">
                <i class="bi bi-x-circle"></i>
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  document.getElementById('tokensTable').innerHTML = html;

  // Select all checkbox
  document.getElementById('selectAllTokens')?.addEventListener('change', (e) => {
    document.querySelectorAll('.token-select').forEach(cb => {
      cb.checked = e.target.checked;
    });
  });
}

async function handleGenerateToken() {
  try {
    const data = {
      displayName: document.getElementById('tokenDisplayName').value,
      description: document.getElementById('tokenDescription').value,
      entityType: document.getElementById('tokenEntityType').value,
      entityId: document.getElementById('tokenEntityId').value,
      permissions: {
        read: document.getElementById('permRead').checked,
        write: document.getElementById('permWrite').checked,
        delete: document.getElementById('permDelete').checked
      },
      pathPrefixes: document.getElementById('tokenPaths').value.split(',').map(s => s.trim()).filter(Boolean),
      ipWhitelist: document.getElementById('tokenIPs').value.split(',').map(s => s.trim()).filter(Boolean),
      expiresAt: document.getElementById('tokenExpiry').value || null,
      maxUses: document.getElementById('tokenMaxUses').value ? parseInt(document.getElementById('tokenMaxUses').value) : null,
      caIntegration: document.getElementById('tokenCAIntegration').checked
    };

    const result = await apiRequest('/admin/tokens/generate', 'POST', data);

    // Close generate modal
    bootstrap.Modal.getInstance(document.getElementById('generateTokenModal')).hide();

    // Show token display modal
    document.getElementById('generatedTokenValue').value = result.token;
    document.getElementById('generatedTokenId').value = result.tokenId;
    new bootstrap.Modal(document.getElementById('tokenDisplayModal')).show();

    showToast('Token generated successfully!', 'success');

    // Reset form
    document.getElementById('generateTokenForm').reset();
  } catch (error) {
    console.error('Failed to generate token:', error);
    showToast('Failed to generate token: ' + error.message, 'danger');
  }
}

async function revokeToken(tokenId) {
  if (!confirm('Are you sure you want to revoke this token?')) return;

  const reason = prompt('Reason for revocation:');
  if (!reason) return;

  try {
    await apiRequest(`/admin/tokens/${tokenId}/revoke`, 'POST', { reason });
    showToast('Token revoked successfully', 'success');
    loadTokens();
  } catch (error) {
    showToast('Failed to revoke token', 'danger');
  }
}

async function suspendToken(tokenId) {
  const reason = prompt('Reason for suspension:');
  if (!reason) return;

  try {
    await apiRequest(`/admin/tokens/${tokenId}/suspend`, 'POST', { reason });
    showToast('Token suspended successfully', 'success');
    loadTokens();
  } catch (error) {
    showToast('Failed to suspend token', 'danger');
  }
}

async function bulkRevokeTokens() {
  const selectedIds = Array.from(document.querySelectorAll('.token-select:checked'))
    .map(cb => cb.value);

  if (selectedIds.length === 0) {
    showToast('Please select tokens to revoke', 'warning');
    return;
  }

  if (!confirm(`Revoke ${selectedIds.length} token(s)?`)) return;

  const reason = prompt('Reason for bulk revocation:');
  if (!reason) return;

  try {
    await apiRequest('/admin/tokens/bulk/revoke', 'POST', {
      tokenIds: selectedIds,
      reason
    });
    showToast(`${selectedIds.length} token(s) revoked successfully`, 'success');
    loadTokens();
  } catch (error) {
    showToast('Failed to revoke tokens', 'danger');
  }
}

async function loadPolicies() {
  try {
    const policies = await apiRequest('/admin/policies');
    state.policies = policies;
    renderPoliciesTable(policies);
  } catch (error) {
    showToast('Failed to load policies', 'danger');
  }
}

function renderPoliciesTable(policies) {
  const html = `
    <table class="table table-hover">
      <thead>
        <tr>
          <th>Name</th>
          <th>Type</th>
          <th>Priority</th>
          <th>Mode</th>
          <th>AI Suggested</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${policies.map(policy => `
          <tr>
            <td>${escapeHtml(policy.name)}</td>
            <td><span class="badge bg-primary">${policy.policyType}</span></td>
            <td>${policy.priority}</td>
            <td><span class="badge bg-secondary">${policy.enforcementMode}</span></td>
            <td>
              ${policy.aiSuggested ?
                `<span class="badge bg-info"><i class="bi bi-magic"></i> Yes</span>` :
                'No'}
            </td>
            <td><span class="badge bg-${policy.status === 'active' ? 'success' : 'secondary'}">
              ${policy.status}
            </span></td>
            <td>
              <button class="btn btn-sm btn-primary" onclick="editPolicy('${policy.id}')">
                <i class="bi bi-pencil"></i>
              </button>
              <button class="btn btn-sm btn-danger" onclick="deletePolicy('${policy.id}')">
                <i class="bi bi-trash"></i>
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  document.getElementById('policiesTable').innerHTML = html;
}

async function showAISuggestions() {
  const entityType = prompt('Entity type (user/group/organization/service):');
  const entityId = prompt('Entity ID:');

  if (!entityType || !entityId) return;

  try {
    const suggestions = await apiRequest('/admin/policies/suggest', 'POST', {
      entityType,
      entityId
    });

    if (suggestions.length === 0) {
      showToast('No AI suggestions available', 'info');
      return;
    }

    // Display suggestions
    alert(`Found ${suggestions.length} AI-suggested policies:\n\n` +
      suggestions.map((s, i) => `${i + 1}. ${s.name} (Confidence: ${(s.aiConfidence * 100).toFixed(0)}%)`).join('\n'));
  } catch (error) {
    showToast('Failed to generate suggestions', 'danger');
  }
}

async function generateAccessReport() {
  try {
    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;

    const report = await apiRequest('/admin/reports/access', 'POST', {
      startDate: startDate ? new Date(startDate).toISOString() : null,
      endDate: endDate ? new Date(endDate).toISOString() : null
    });

    const html = `
      <div class="row">
        <div class="col-md-4">
          <div class="card text-center">
            <div class="card-body">
              <h6>Total Access</h6>
              <h3>${report.insights.totalAccess}</h3>
            </div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="card text-center">
            <div class="card-body">
              <h6>Success Rate</h6>
              <h3>${report.insights.successRate.toFixed(1)}%</h3>
            </div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="card text-center">
            <div class="card-body">
              <h6>Trend</h6>
              <h3>${report.insights.trends.trend}</h3>
            </div>
          </div>
        </div>
      </div>
      <div class="mt-3">
        <h6>Top Actions</h6>
        <ul class="list-group">
          ${report.insights.topActions.map(a => `
            <li class="list-group-item d-flex justify-content-between">
              <span>${a.action}</span>
              <span class="badge bg-primary">${a.count}</span>
            </li>
          `).join('')}
        </ul>
      </div>
    `;

    document.getElementById('reportResults').innerHTML = html;
  } catch (error) {
    showToast('Failed to generate report', 'danger');
  }
}

async function loadCacheStats() {
  try {
    const stats = await apiRequest('/admin/dashboard/stats');
    const cacheHTML = `
      <dl class="row">
        <dt class="col-sm-6">Status:</dt>
        <dd class="col-sm-6"><span class="badge bg-${stats.cache.connected ? 'success' : 'danger'}">
          ${stats.cache.connected ? 'Connected' : 'Disconnected'}
        </span></dd>
        <dt class="col-sm-6">Cached Tokens:</dt>
        <dd class="col-sm-6">${stats.cache.cachedTokens || 0}</dd>
      </dl>
    `;
    document.getElementById('cacheStats').innerHTML = cacheHTML;
  } catch (error) {
    console.error('Failed to load cache stats:', error);
  }
}

async function purgeExpiredTokens() {
  if (!confirm('Purge all expired tokens?')) return;

  try {
    const result = await apiRequest('/admin/maintenance/purge', 'POST');
    showToast(`${result.purged} expired token(s) purged`, 'success');
    loadDashboard();
  } catch (error) {
    showToast('Failed to purge tokens', 'danger');
  }
}

async function clearCache() {
  if (!confirm('Clear all cached tokens? This may temporarily impact performance.')) return;

  try {
    const result = await apiRequest('/admin/maintenance/cache/clear', 'POST');
    showToast(`${result.cleared} cached token(s) cleared`, 'success');
    loadCacheStats();
  } catch (error) {
    showToast('Failed to clear cache', 'danger');
  }
}

// Utility functions
async function apiRequest(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(API_BASE + endpoint, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data.data || data;
}

function showToast(message, type = 'info') {
  // Simple toast implementation
  const toast = document.createElement('div');
  toast.className = `alert alert-${type} position-fixed top-0 end-0 m-3`;
  toast.style.zIndex = '9999';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getStatusColor(status) {
  const colors = {
    active: 'success',
    revoked: 'danger',
    expired: 'secondary',
    suspended: 'warning'
  };
  return colors[status] || 'secondary';
}

function getRiskColor(riskScore) {
  if (riskScore < 0.3) return 'success';
  if (riskScore < 0.6) return 'warning';
  if (riskScore < 0.8) return 'orange';
  return 'danger';
}
