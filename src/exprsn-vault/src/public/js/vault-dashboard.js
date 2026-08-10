/**
 * Exprsn Vault Dashboard JavaScript
 */

// Configuration
const API_BASE = window.location.origin;

// State
let currentSection = 'overview';
let authToken = localStorage.getItem('vaultToken') || null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initModals();
  loadOverview();
});

// Navigation
function initNavigation() {
  document.querySelectorAll('.list-group-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const section = item.getAttribute('data-section');
      switchSection(section);
    });
  });
}

function switchSection(section) {
  // Update active menu item
  document.querySelectorAll('.list-group-item').forEach(item => {
    item.classList.remove('active');
  });
  document.querySelector(`[data-section="${section}"]`).classList.add('active');

  // Hide all sections
  document.querySelectorAll('.content-section').forEach(sec => {
    sec.style.display = 'none';
  });

  // Show selected section
  document.getElementById(`${section}-section`).style.display = 'block';
  currentSection = section;

  // Load section data
  switch (section) {
    case 'overview':
      loadOverview();
      break;
    case 'secrets':
      loadSecrets();
      break;
    case 'keys':
      loadKeys();
      break;
    case 'leases':
      loadLeases();
      break;
    case 'audit':
      loadAuditLogs();
      break;
  }
}

// Overview
async function loadOverview() {
  try {
    // Load stats
    const [secrets, keys, leases] = await Promise.all([
      apiGet('/api/secrets'),
      apiGet('/api/keys'),
      apiGet('/api/dynamic/leases')
    ]);

    document.getElementById('stats-secrets').textContent = secrets.data?.length || 0;
    document.getElementById('stats-keys').textContent = keys.data?.length || 0;
    document.getElementById('stats-leases').textContent = leases.data?.length || 0;

    // Load audit stats
    const auditStats = await apiGet('/api/audit/stats');
    document.getElementById('stats-audit').textContent = auditStats.data?.total || 0;

    // Load recent activity
    loadRecentActivity();

    // Display activity stats
    displayActivityStats(auditStats.data);
  } catch (error) {
    console.error('Failed to load overview:', error);
  }
}

async function loadRecentActivity() {
  try {
    const response = await apiGet('/api/audit/logs?limit=10');
    const logs = response.data || [];

    const activityHtml = logs.map(log => `
      <div class="activity-item ${log.success ? 'success' : 'failure'}">
        <div class="activity-item-action">${log.action} ${log.resourceType}</div>
        <div class="activity-item-time">${formatDate(log.timestamp)} by ${log.actor}</div>
        ${log.errorMessage ? `<div class="text-danger small">${log.errorMessage}</div>` : ''}
      </div>
    `).join('');

    document.getElementById('recent-activity').innerHTML = activityHtml || '<p class="text-muted">No recent activity</p>';
  } catch (error) {
    document.getElementById('recent-activity').innerHTML = '<p class="text-danger">Failed to load activity</p>';
  }
}

function displayActivityStats(stats) {
  if (!stats) return;

  const statsHtml = `
    <div class="row">
      <div class="col-md-6">
        <p><strong>Total Actions:</strong> ${stats.total}</p>
        <p><strong>Success Rate:</strong> ${stats.successRate}%</p>
      </div>
      <div class="col-md-6">
        <p><strong>Successful:</strong> ${stats.success}</p>
        <p><strong>Failed:</strong> ${stats.failures}</p>
      </div>
    </div>
    <hr>
    <h6>Actions Breakdown</h6>
    ${Object.entries(stats.byAction || {}).map(([action, count]) =>
      `<p><span class="badge bg-primary">${action}</span> ${count}</p>`
    ).join('')}
  `;

  document.getElementById('activity-stats').innerHTML = statsHtml;
}

// Secrets
async function loadSecrets() {
  try {
    const response = await apiGet('/api/secrets');
    const secrets = response.data || [];

    const tableHtml = secrets.map(secret => `
      <tr>
        <td><code class="text-truncate-150">${secret.path}</code></td>
        <td>${secret.key}</td>
        <td>${secret.version}</td>
        <td><span class="badge status-${secret.status}">${secret.status}</span></td>
        <td>${formatDate(secret.createdAt)}</td>
        <td>
          <button class="btn btn-sm btn-info" onclick="viewSecret('${secret.path}')">
            <i class="bi bi-eye"></i>
          </button>
          <button class="btn btn-sm btn-warning" onclick="rotateSecret('${secret.path}')">
            <i class="bi bi-arrow-clockwise"></i>
          </button>
          <button class="btn btn-sm btn-danger" onclick="deleteSecret('${secret.path}')">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      </tr>
    `).join('');

    document.getElementById('secrets-table').innerHTML = tableHtml || '<tr><td colspan="6" class="text-center text-muted">No secrets found</td></tr>';
  } catch (error) {
    document.getElementById('secrets-table').innerHTML = '<tr><td colspan="6" class="text-center text-danger">Failed to load secrets</td></tr>';
  }
}

async function viewSecret(path) {
  try {
    const response = await apiGet(`/api/secrets${path}?includeValue=true`);
    const secret = response.data;

    document.getElementById('view-secret-path').value = secret.path;
    document.getElementById('view-secret-key').value = secret.key;
    document.getElementById('view-secret-value').value = secret.value || '';
    document.getElementById('view-secret-version').value = secret.version;
    document.getElementById('view-secret-created').value = formatDate(secret.createdAt);

    new bootstrap.Modal(document.getElementById('viewSecretModal')).show();
  } catch (error) {
    alert('Failed to load secret: ' + error.message);
  }
}

async function rotateSecret(path) {
  if (!confirm(`Rotate secret at ${path}?`)) return;

  try {
    await apiPost(`/api/secrets${path}/rotate`, {});
    alert('Secret rotated successfully');
    loadSecrets();
  } catch (error) {
    alert('Failed to rotate secret: ' + error.message);
  }
}

async function deleteSecret(path) {
  if (!confirm(`Delete secret at ${path}? This cannot be undone.`)) return;

  try {
    await apiDelete(`/api/secrets${path}`);
    alert('Secret deleted successfully');
    loadSecrets();
  } catch (error) {
    alert('Failed to delete secret: ' + error.message);
  }
}

// Keys
async function loadKeys() {
  try {
    const response = await apiGet('/api/keys');
    const keys = response.data || [];

    const tableHtml = keys.map(key => `
      <tr>
        <td>${key.name}</td>
        <td>${key.algorithm}</td>
        <td>${key.purpose}</td>
        <td>${key.version}</td>
        <td><span class="badge status-${key.status}">${key.status}</span></td>
        <td>${formatDate(key.createdAt)}</td>
        <td>
          <button class="btn btn-sm btn-warning" onclick="rotateKey('${key.id}')">
            <i class="bi bi-arrow-clockwise"></i>
          </button>
          <button class="btn btn-sm btn-danger" onclick="revokeKey('${key.id}')">
            <i class="bi bi-x-circle"></i>
          </button>
        </td>
      </tr>
    `).join('');

    document.getElementById('keys-table').innerHTML = tableHtml || '<tr><td colspan="7" class="text-center text-muted">No keys found</td></tr>';
  } catch (error) {
    document.getElementById('keys-table').innerHTML = '<tr><td colspan="7" class="text-center text-danger">Failed to load keys</td></tr>';
  }
}

async function rotateKey(keyId) {
  if (!confirm('Rotate this encryption key?')) return;

  try {
    await apiPost(`/api/keys/${keyId}/rotate`, {});
    alert('Key rotated successfully');
    loadKeys();
  } catch (error) {
    alert('Failed to rotate key: ' + error.message);
  }
}

async function revokeKey(keyId) {
  if (!confirm('Revoke this encryption key? This cannot be undone.')) return;

  try {
    await apiDelete(`/api/keys/${keyId}`);
    alert('Key revoked successfully');
    loadKeys();
  } catch (error) {
    alert('Failed to revoke key: ' + error.message);
  }
}

// Leases
async function loadLeases() {
  try {
    const response = await apiGet('/api/dynamic/leases');
    const leases = response.data || [];

    const tableHtml = leases.map(lease => `
      <tr>
        <td><code>${lease.leaseId.substring(0, 20)}...</code></td>
        <td>${lease.secretType}</td>
        <td><code class="text-truncate-150">${lease.secretPath}</code></td>
        <td>${lease.ttl}s</td>
        <td>${formatDate(lease.expiresAt)}</td>
        <td>${lease.renewCount}</td>
        <td><span class="badge status-${lease.status}">${lease.status}</span></td>
        <td>
          ${lease.renewable && lease.status === 'active' ?
            `<button class="btn btn-sm btn-primary" onclick="renewLease('${lease.leaseId}')">
              <i class="bi bi-arrow-repeat"></i>
            </button>` : ''}
          <button class="btn btn-sm btn-danger" onclick="revokeLease('${lease.leaseId}')">
            <i class="bi bi-x-circle"></i>
          </button>
        </td>
      </tr>
    `).join('');

    document.getElementById('leases-table').innerHTML = tableHtml || '<tr><td colspan="8" class="text-center text-muted">No leases found</td></tr>';
  } catch (error) {
    document.getElementById('leases-table').innerHTML = '<tr><td colspan="8" class="text-center text-danger">Failed to load leases</td></tr>';
  }
}

async function renewLease(leaseId) {
  try {
    await apiPost(`/api/dynamic/leases/${leaseId}/renew`, { increment: 3600 });
    alert('Lease renewed successfully');
    loadLeases();
  } catch (error) {
    alert('Failed to renew lease: ' + error.message);
  }
}

async function revokeLease(leaseId) {
  if (!confirm('Revoke this lease?')) return;

  try {
    await apiDelete(`/api/dynamic/leases/${leaseId}`);
    alert('Lease revoked successfully');
    loadLeases();
  } catch (error) {
    alert('Failed to revoke lease: ' + error.message);
  }
}

// Audit Logs
async function loadAuditLogs() {
  try {
    const action = document.getElementById('audit-action')?.value || '';
    const resourceType = document.getElementById('audit-resource-type')?.value || '';
    const success = document.getElementById('audit-success')?.value || '';

    const params = new URLSearchParams();
    if (action) params.append('action', action);
    if (resourceType) params.append('resourceType', resourceType);
    if (success) params.append('success', success);
    params.append('limit', '100');

    const response = await apiGet(`/api/audit/logs?${params.toString()}`);
    const logs = response.data || [];

    const tableHtml = logs.map(log => `
      <tr class="${log.success ? '' : 'table-danger'}">
        <td>${formatDate(log.timestamp)}</td>
        <td><span class="badge bg-secondary">${log.action}</span></td>
        <td>${log.resourceType}<br><small class="text-muted">${log.resourcePath || log.resourceId || '-'}</small></td>
        <td>${log.actor}</td>
        <td>${log.success ? '<i class="bi bi-check-circle text-success"></i>' : '<i class="bi bi-x-circle text-danger"></i>'}</td>
        <td>${log.duration || '-'}ms</td>
      </tr>
    `).join('');

    document.getElementById('audit-table').innerHTML = tableHtml || '<tr><td colspan="6" class="text-center text-muted">No audit logs found</td></tr>';
  } catch (error) {
    document.getElementById('audit-table').innerHTML = '<tr><td colspan="6" class="text-center text-danger">Failed to load audit logs</td></tr>';
  }
}

// Modal Handlers
function initModals() {
  // Create Secret
  document.getElementById('create-secret-btn')?.addEventListener('click', async () => {
    const path = document.getElementById('secret-path').value;
    const key = document.getElementById('secret-key').value;
    const value = document.getElementById('secret-value').value;
    const metadataText = document.getElementById('secret-metadata').value;

    let metadata = {};
    if (metadataText) {
      try {
        metadata = JSON.parse(metadataText);
      } catch (e) {
        alert('Invalid JSON in metadata field');
        return;
      }
    }

    try {
      await apiPost(`/api/secrets${path}`, { key, value, metadata });
      alert('Secret created successfully');
      bootstrap.Modal.getInstance(document.getElementById('createSecretModal')).hide();
      document.getElementById('create-secret-form').reset();
      if (currentSection === 'secrets') loadSecrets();
    } catch (error) {
      alert('Failed to create secret: ' + error.message);
    }
  });

  // Create Key
  document.getElementById('create-key-btn')?.addEventListener('click', async () => {
    const name = document.getElementById('key-name').value;
    const purpose = document.getElementById('key-purpose').value;
    const metadataText = document.getElementById('key-metadata').value;

    let metadata = {};
    if (metadataText) {
      try {
        metadata = JSON.parse(metadataText);
      } catch (e) {
        alert('Invalid JSON in metadata field');
        return;
      }
    }

    try {
      await apiPost('/api/keys/generate', { name, purpose, metadata });
      alert('Encryption key generated successfully');
      bootstrap.Modal.getInstance(document.getElementById('createKeyModal')).hide();
      document.getElementById('create-key-form').reset();
      if (currentSection === 'keys') loadKeys();
    } catch (error) {
      alert('Failed to generate key: ' + error.message);
    }
  });

  // Generate Database Credentials
  document.getElementById('generate-database-btn')?.addEventListener('click', async () => {
    const path = document.getElementById('db-path').value;
    const databaseType = document.getElementById('db-type').value;
    const ttl = parseInt(document.getElementById('db-ttl').value);

    try {
      const response = await apiPost('/api/dynamic/database', { path, databaseType, ttl });
      const data = response.data;

      document.getElementById('db-username').textContent = data.data.username;
      document.getElementById('db-password').textContent = data.data.password;
      document.getElementById('db-lease-id').textContent = data.leaseId;
      document.getElementById('db-expires').textContent = formatDate(data.expiresAt);
      document.getElementById('db-credentials-result').style.display = 'block';
      document.getElementById('generate-database-btn').style.display = 'none';

      if (currentSection === 'leases') loadLeases();
    } catch (error) {
      alert('Failed to generate database credentials: ' + error.message);
    }
  });

  // Generate API Key
  document.getElementById('generate-apikey-btn')?.addEventListener('click', async () => {
    const path = document.getElementById('apikey-path').value;
    const prefix = document.getElementById('apikey-prefix').value;
    const ttl = parseInt(document.getElementById('apikey-ttl').value);

    try {
      const response = await apiPost('/api/dynamic/api-key', { path, prefix, ttl });
      const data = response.data;

      document.getElementById('apikey-value').textContent = data.data.apiKey;
      document.getElementById('apikey-lease-id').textContent = data.leaseId;
      document.getElementById('apikey-expires').textContent = formatDate(data.expiresAt);
      document.getElementById('apikey-result').style.display = 'block';
      document.getElementById('generate-apikey-btn').style.display = 'none';

      if (currentSection === 'leases') loadLeases();
    } catch (error) {
      alert('Failed to generate API key: ' + error.message);
    }
  });

  // Toggle secret visibility
  document.getElementById('toggle-secret-visibility')?.addEventListener('click', () => {
    const input = document.getElementById('view-secret-value');
    const icon = document.querySelector('#toggle-secret-visibility i');
    if (input.type === 'password') {
      input.type = 'text';
      icon.className = 'bi bi-eye-slash';
    } else {
      input.type = 'password';
      icon.className = 'bi bi-eye';
    }
  });

  // Audit filter button
  document.getElementById('audit-filter-btn')?.addEventListener('click', loadAuditLogs);

  // Export audit logs
  document.getElementById('export-audit-btn')?.addEventListener('click', () => {
    window.location.href = `${API_BASE}/api/audit/export`;
  });

  // Reset modals on close
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('hidden.bs.modal', () => {
      modal.querySelectorAll('form').forEach(form => form.reset());
      modal.querySelectorAll('[id$="-result"]').forEach(el => el.style.display = 'none');
      modal.querySelectorAll('[id$="-btn"]').forEach(el => el.style.display = 'inline-block');
    });
  });
}

// API Helper Functions
async function apiGet(endpoint) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken && { 'Authorization': `Bearer ${authToken}` })
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || error.message || 'Request failed');
  }

  return await response.json();
}

async function apiPost(endpoint, data) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken && { 'Authorization': `Bearer ${authToken}` })
    },
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || error.message || 'Request failed');
  }

  return await response.json();
}

async function apiDelete(endpoint) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken && { 'Authorization': `Bearer ${authToken}` })
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || error.message || 'Request failed');
  }

  return await response.json();
}

// Utility Functions
function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleString();
}

function formatDuration(ms) {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
