/**
 * Exprsn Setup Web UI - Client-side JavaScript
 */

// Global state
let socket;
let services = [];
let healthStatuses = [];
let currentConfigService = null;

// Initialize Socket.IO connection
function initSocket() {
  socket = io();

  socket.on('connect', () => {
    console.log('Connected to server');
    updateConnectionStatus(true);
    addLog('Connected to Exprsn Setup Service', 'success');
  });

  socket.on('disconnect', () => {
    console.log('Disconnected from server');
    updateConnectionStatus(false);
    addLog('Disconnected from server', 'warning');
  });

  socket.on('services:all', (data) => {
    services = data.services;
    updateServicesGrid();
    updateStats();
    updateServiceList();
  });

  socket.on('health:all', (data) => {
    healthStatuses = data.services;
    updateHealthStatuses();
    updateStats();
  });

  socket.on('service:health', (data) => {
    updateServiceHealth(data.health);
  });

  socket.on('database:progress', (data) => {
    updateUploadProgress(data.progress, data.database);
  });

  socket.on('config:saved', (data) => {
    showToast('Configuration saved for ' + data.service, 'success');
    addLog(`Configuration saved: ${data.service}`, 'success');
  });

  socket.on('error', (data) => {
    showToast('Error: ' + data.message, 'danger');
    addLog(`Error: ${data.message}`, 'error');
  });
}

// Update connection status indicator
function updateConnectionStatus(connected) {
  const statusElement = document.getElementById('connectionStatus');
  const textElement = document.getElementById('connectionText');

  if (connected) {
    statusElement.className = 'bi bi-circle-fill text-success me-1';
    textElement.textContent = 'Connected';
  } else {
    statusElement.className = 'bi bi-circle-fill text-danger me-1';
    textElement.textContent = 'Disconnected';
  }
}

// Update stats cards
function updateStats() {
  const runningCount = services.filter(s => s.running).length;
  const partialCount = services.filter(s => s.implementationStatus === 'partial').length;
  const healthyCount = healthStatuses.filter(h => h.overall === 'healthy').length;

  document.getElementById('totalServices').textContent = services.length;
  document.getElementById('runningServices').textContent = runningCount;
  document.getElementById('partialServices').textContent = partialCount;
  document.getElementById('healthyServices').textContent = healthyCount;
}

// Get status indicator HTML
function getStatusIndicator(service) {
  if (!service.running) {
    return '<span class="status-indicator status-stopped"></span>Stopped';
  }

  const health = healthStatuses.find(h => h.service === service.id);
  if (!health) {
    return '<span class="status-indicator status-unknown"></span>Unknown';
  }

  switch (health.overall) {
    case 'healthy':
      return '<span class="status-indicator status-running"></span>Healthy';
    case 'degraded':
      return '<span class="status-indicator status-degraded"></span>Degraded';
    case 'unhealthy':
      return '<span class="status-indicator status-stopped"></span>Unhealthy';
    default:
      return '<span class="status-indicator status-unknown"></span>Unknown';
  }
}

// Update services grid
function updateServicesGrid() {
  const grid = document.getElementById('servicesGrid');

  grid.innerHTML = services.map(service => `
    <div class="col-md-6 col-lg-4 mb-3">
      <div class="card service-card">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start mb-2">
            <h5 class="card-title mb-0">${service.name}</h5>
            <span class="badge ${service.implementationStatus === 'production' ? 'badge-production' : 'badge-partial'}">
              ${service.implementationStatus}
            </span>
          </div>

          <p class="card-text text-muted small mb-2">${service.id}</p>

          <div class="mb-3">
            ${getStatusIndicator(service)}
          </div>

          <div class="d-flex justify-content-between align-items-center text-muted small">
            <span><i class="bi bi-hdd-network me-1"></i>Port ${service.port}</span>
            ${service.version ? `<span><i class="bi bi-tag me-1"></i>${service.version}</span>` : ''}
          </div>

          ${service.running ? `
            <div class="mt-2">
              ${service.databaseHealth !== undefined ? `
                <span class="badge ${service.databaseHealth ? 'bg-success' : 'bg-danger'} me-1">
                  <i class="bi bi-database"></i> DB
                </span>
              ` : ''}
              ${service.redisHealth !== undefined ? `
                <span class="badge ${service.redisHealth ? 'bg-success' : 'bg-danger'}">
                  <i class="bi bi-server"></i> Redis
                </span>
              ` : ''}
            </div>
          ` : ''}

          <div class="mt-3">
            <button class="btn btn-sm btn-primary" onclick="showServiceDetails('${service.id}')">
              <i class="bi bi-info-circle me-1"></i>Details
            </button>
            ${service.running ? `
              <a href="http://localhost:${service.port}" target="_blank" class="btn btn-sm btn-outline-primary">
                <i class="bi bi-box-arrow-up-right me-1"></i>Open
              </a>
            ` : ''}
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

// Update health statuses
function updateHealthStatuses() {
  // This is called when health data is received
  // The grid will be updated with the new health data
  updateServicesGrid();
}

// Update single service health
function updateServiceHealth(health) {
  const index = healthStatuses.findIndex(h => h.service === health.service);
  if (index !== -1) {
    healthStatuses[index] = health;
  } else {
    healthStatuses.push(health);
  }
  updateServicesGrid();
  updateStats();
}

// Show service details modal
async function showServiceDetails(serviceId) {
  const service = services.find(s => s.id === serviceId);
  if (!service) return;

  const modal = new bootstrap.Modal(document.getElementById('serviceDetailModal'));
  document.getElementById('serviceDetailTitle').textContent = service.name;

  const body = document.getElementById('serviceDetailBody');
  body.innerHTML = '<div class="text-center"><div class="spinner-border" role="status"></div></div>';

  modal.show();

  try {
    const response = await fetch(`/api/services/${serviceId}`);
    const data = await response.json();

    if (data.success) {
      const details = data.service;
      body.innerHTML = `
        <div class="service-detail-row">
          <strong>Service ID:</strong>
          <span>${details.id}</span>
        </div>
        <div class="service-detail-row">
          <strong>Status:</strong>
          <span>${details.running ? '<span class="badge bg-success">Running</span>' : '<span class="badge bg-danger">Stopped</span>'}</span>
        </div>
        <div class="service-detail-row">
          <strong>Port:</strong>
          <span>${details.port}</span>
        </div>
        ${details.version ? `
          <div class="service-detail-row">
            <strong>Version:</strong>
            <span>${details.version}</span>
          </div>
        ` : ''}
        ${details.health ? `
          <div class="mt-3">
            <h6>Health Status</h6>
            <pre class="bg-light p-3 rounded">${JSON.stringify(details.health, null, 2)}</pre>
          </div>
        ` : ''}
        ${details.stats ? `
          <div class="mt-3">
            <h6>Statistics</h6>
            <pre class="bg-light p-3 rounded">${JSON.stringify(details.stats, null, 2)}</pre>
          </div>
        ` : ''}
      `;
    } else {
      body.innerHTML = '<div class="alert alert-danger">Failed to load service details</div>';
    }
  } catch (error) {
    body.innerHTML = '<div class="alert alert-danger">Error loading service details</div>';
  }
}

// Upload zone handling
function initUploadZone() {
  const uploadZone = document.getElementById('uploadZone');
  const fileInput = document.getElementById('sqlFileInput');

  uploadZone.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      const fileName = e.target.files[0].name;
      showToast(`Selected file: ${fileName}`, 'info');
    }
  });

  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
  });

  uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('drag-over');
  });

  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      fileInput.files = files;
      showToast(`Selected file: ${files[0].name}`, 'info');
    }
  });
}

// Upload SQL file
async function uploadSQL() {
  const fileInput = document.getElementById('sqlFileInput');
  const targetDatabase = document.getElementById('targetDatabase').value;

  if (!fileInput.files.length) {
    showToast('Please select a SQL file', 'warning');
    return;
  }

  if (!targetDatabase) {
    showToast('Please enter target database name', 'warning');
    return;
  }

  const formData = new FormData();
  formData.append('sqlFile', fileInput.files[0]);
  formData.append('database', targetDatabase);
  formData.append('dbHost', document.getElementById('dbHost').value);
  formData.append('dbPort', document.getElementById('dbPort').value);
  formData.append('dbUser', document.getElementById('dbUser').value);
  formData.append('dbPassword', document.getElementById('dbPassword').value);

  showUploadProgress(true);

  try {
    const response = await fetch('/api/database/upload-sql', {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    if (data.success) {
      showToast('SQL file uploaded and executed successfully', 'success');
      addLog(`SQL uploaded to ${targetDatabase}: ${data.fileName}`, 'success');
      fileInput.value = '';
      loadDatabaseInfo();
    } else {
      showToast('Upload failed: ' + data.error, 'danger');
      addLog(`Upload failed: ${data.error}`, 'error');
    }
  } catch (error) {
    showToast('Upload error: ' + error.message, 'danger');
    addLog(`Upload error: ${error.message}`, 'error');
  } finally {
    showUploadProgress(false);
  }
}

// Show/hide upload progress
function showUploadProgress(show) {
  const progressDiv = document.getElementById('uploadProgress');
  if (show) {
    progressDiv.style.display = 'block';
    document.getElementById('uploadStatus').textContent = 'Uploading and executing SQL...';
  } else {
    progressDiv.style.display = 'none';
  }
}

// Update upload progress
function updateUploadProgress(progress, database) {
  const progressBar = document.querySelector('#uploadProgress .progress-bar');
  const statusText = document.getElementById('uploadStatus');

  progressBar.style.width = progress + '%';
  statusText.textContent = `Processing ${database}: ${progress}%`;
}

// Create all databases
async function createAllDatabases() {
  if (!confirm('Create databases for all services?')) return;

  showToast('Creating databases...', 'info');
  addLog('Creating all service databases...', 'info');

  try {
    const response = await fetch('/api/database/create-service-dbs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dbHost: document.getElementById('dbHost').value,
        dbPort: document.getElementById('dbPort').value,
        dbUser: document.getElementById('dbUser').value,
        dbPassword: document.getElementById('dbPassword').value
      })
    });

    const data = await response.json();

    if (data.success) {
      showToast(`Created ${data.successful}/${data.total} databases`, 'success');
      addLog(`Database creation complete: ${data.successful}/${data.total} successful`, 'success');
      loadDatabaseInfo();
    } else {
      showToast('Failed to create databases', 'danger');
    }
  } catch (error) {
    showToast('Error: ' + error.message, 'danger');
    addLog(`Error creating databases: ${error.message}`, 'error');
  }
}

// Initialize all databases
async function initializeAllDatabases() {
  if (!confirm('Initialize all service databases with schemas?')) return;

  showToast('Initializing databases...', 'info');
  addLog('Initializing all service databases...', 'info');

  try {
    const response = await fetch('/api/database/initialize-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dbHost: document.getElementById('dbHost').value,
        dbPort: document.getElementById('dbPort').value,
        dbUser: document.getElementById('dbUser').value,
        dbPassword: document.getElementById('dbPassword').value
      })
    });

    const data = await response.json();

    if (data.success) {
      showToast(`Initialized ${data.successful}/${data.total} databases`, 'success');
      addLog(`Database initialization complete: ${data.successful}/${data.total} successful`, 'success');
      loadDatabaseInfo();
    } else {
      showToast('Failed to initialize databases', 'danger');
    }
  } catch (error) {
    showToast('Error: ' + error.message, 'danger');
    addLog(`Error initializing databases: ${error.message}`, 'error');
  }
}

// Load database information
async function loadDatabaseInfo() {
  const table = document.getElementById('databaseTable');
  table.innerHTML = '<tr><td colspan="6" class="text-center">Loading...</td></tr>';

  try {
    const response = await fetch('/api/database/list');
    const data = await response.json();

    if (data.success) {
      const databases = Object.entries(data.databases);

      // Get info for each database
      const infoPromises = databases.map(async ([serviceId, dbName]) => {
        try {
          const infoResponse = await fetch(`/api/database/info/${serviceId}`);
          const infoData = await infoResponse.json();
          return infoData.success ? infoData.info : null;
        } catch {
          return null;
        }
      });

      const infos = await Promise.all(infoPromises);

      table.innerHTML = databases.map(([serviceId, dbName], index) => {
        const info = infos[index];
        return `
          <tr>
            <td>${serviceId}</td>
            <td><code>${dbName}</code></td>
            <td>${info && info.exists ? '<span class="badge bg-success">Exists</span>' : '<span class="badge bg-secondary">Not Created</span>'}</td>
            <td>${info && info.tables !== undefined ? info.tables : '-'}</td>
            <td>${info && info.size ? info.size : '-'}</td>
            <td>
              <button class="btn btn-sm btn-primary" onclick="initializeServiceDB('${serviceId}')">
                <i class="bi bi-file-earmark-check"></i> Initialize
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }
  } catch (error) {
    table.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Error loading database info</td></tr>';
  }
}

// Initialize single service database
async function initializeServiceDB(serviceId) {
  if (!confirm(`Initialize database for ${serviceId}?`)) return;

  try {
    const response = await fetch('/api/database/initialize-service', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service: serviceId,
        dbHost: document.getElementById('dbHost').value,
        dbPort: document.getElementById('dbPort').value,
        dbUser: document.getElementById('dbUser').value,
        dbPassword: document.getElementById('dbPassword').value
      })
    });

    const data = await response.json();

    if (data.success) {
      showToast(`Initialized database for ${serviceId}`, 'success');
      loadDatabaseInfo();
    } else {
      showToast('Initialization failed: ' + data.error, 'danger');
    }
  } catch (error) {
    showToast('Error: ' + error.message, 'danger');
  }
}

// Update service list for configuration
function updateServiceList() {
  const list = document.getElementById('serviceList');

  list.innerHTML = services.map(service => `
    <a href="#" class="list-group-item list-group-item-action" onclick="selectServiceConfig('${service.id}'); return false;">
      <div class="d-flex justify-content-between align-items-center">
        <div>
          <strong>${service.name}</strong>
          <br>
          <small class="text-muted">${service.id}</small>
        </div>
        <span class="badge ${service.implementationStatus === 'production' ? 'badge-production' : 'badge-partial'}">
          ${service.implementationStatus}
        </span>
      </div>
    </a>
  `).join('');
}

// Select service for configuration
async function selectServiceConfig(serviceId) {
  currentConfigService = serviceId;
  document.getElementById('currentConfigService').textContent = serviceId;

  const editor = document.getElementById('configEditor');
  editor.value = 'Loading...';

  try {
    // Try to load existing config
    const loadResponse = await fetch(`/api/config/load/${serviceId}`);
    const loadData = await loadResponse.json();

    if (loadData.success && loadData.exists) {
      // Convert config object to .env format
      editor.value = Object.entries(loadData.config)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
    } else {
      // Generate new config
      const genResponse = await fetch('/api/config/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: serviceId })
      });

      const genData = await genResponse.json();

      if (genData.success) {
        editor.value = genData.envContent;
      } else {
        editor.value = '# Failed to load configuration';
        showToast('Failed to load config', 'danger');
      }
    }
  } catch (error) {
    editor.value = '# Error loading configuration';
    showToast('Error: ' + error.message, 'danger');
  }
}

// Load current config
function loadConfig() {
  if (!currentConfigService) {
    showToast('No service selected', 'warning');
    return;
  }
  selectServiceConfig(currentConfigService);
}

// Save current config
async function saveCurrentConfig() {
  if (!currentConfigService) {
    showToast('No service selected', 'warning');
    return;
  }

  const editor = document.getElementById('configEditor');
  const envContent = editor.value;

  // Parse .env content to object
  const config = {};
  envContent.split('\n').forEach(line => {
    line = line.trim();
    if (line && !line.startsWith('#')) {
      const [key, ...valueParts] = line.split('=');
      if (key) {
        let value = valueParts.join('=').trim();
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        config[key.trim()] = value;
      }
    }
  });

  try {
    const response = await fetch('/api/config/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service: currentConfigService,
        config
      })
    });

    const data = await response.json();

    if (data.success) {
      showToast('Configuration saved successfully', 'success');
      addLog(`Configuration saved: ${currentConfigService}`, 'success');
    } else {
      showToast('Save failed: ' + data.error, 'danger');
    }
  } catch (error) {
    showToast('Error: ' + error.message, 'danger');
  }
}

// Generate all configs
async function generateAllConfigs() {
  if (!confirm('Generate configurations for all services?')) return;

  showToast('Generating configurations...', 'info');

  try {
    const response = await fetch('/api/config/generate-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ overrides: {} })
    });

    const data = await response.json();

    if (data.success) {
      showToast(`Generated ${data.successful}/${data.total} configurations`, 'success');
      addLog(`Configuration generation complete: ${data.successful}/${data.total} successful`, 'success');
    } else {
      showToast('Failed to generate configurations', 'danger');
    }
  } catch (error) {
    showToast('Error: ' + error.message, 'danger');
  }
}

// Save all configs
async function saveAllConfigs() {
  if (!confirm('Save configurations for all services?')) return;

  showToast('Saving configurations...', 'info');

  try {
    const response = await fetch('/api/config/save-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ overrides: {} })
    });

    const data = await response.json();

    if (data.success) {
      showToast(`Saved ${data.successful}/${data.total} configurations`, 'success');
      addLog(`Configuration save complete: ${data.successful}/${data.total} successful`, 'success');
    } else {
      showToast('Failed to save configurations', 'danger');
    }
  } catch (error) {
    showToast('Error: ' + error.message, 'danger');
  }
}

// Add log entry
function addLog(message, level = 'info') {
  const logConsole = document.getElementById('logConsole');
  const timestamp = new Date().toLocaleTimeString();
  const levelColors = {
    info: '#60a5fa',
    success: '#34d399',
    warning: '#fbbf24',
    error: '#f87171'
  };

  const color = levelColors[level] || '#9ca3af';

  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `<span class="log-timestamp">[${timestamp}]</span> <span style="color: ${color};">[${level.toUpperCase()}]</span> ${message}`;

  logConsole.appendChild(entry);
  logConsole.scrollTop = logConsole.scrollHeight;

  // Keep only last 100 entries
  while (logConsole.children.length > 100) {
    logConsole.removeChild(logConsole.firstChild);
  }
}

// Clear logs
function clearLogs() {
  const logConsole = document.getElementById('logConsole');
  logConsole.innerHTML = '<div class="log-entry"><span class="log-timestamp">[System]</span> Logs cleared</div>';
}

// Show toast notification
function showToast(message, type = 'info') {
  const container = document.querySelector('.toast-container');

  const bgClass = {
    info: 'bg-info',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger'
  }[type] || 'bg-info';

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'alert');
  toast.innerHTML = `
    <div class="toast-header ${bgClass} text-white">
      <strong class="me-auto">Exprsn Setup</strong>
      <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast"></button>
    </div>
    <div class="toast-body">
      ${message}
    </div>
  `;

  container.appendChild(toast);

  const bsToast = new bootstrap.Toast(toast, { delay: 5000 });
  bsToast.show();

  toast.addEventListener('hidden.bs.toast', () => {
    toast.remove();
  });
}

// Refresh all data
async function refreshAll() {
  addLog('Refreshing all data...', 'info');

  try {
    const response = await fetch('/api/services');
    const data = await response.json();

    if (data.success) {
      services = data.services;
      updateServicesGrid();
      updateStats();
      updateServiceList();
      loadDatabaseInfo();
      showToast('Refreshed successfully', 'success');
    }
  } catch (error) {
    showToast('Refresh failed: ' + error.message, 'danger');
  }
}

// ===============================================
// Scaffold Functions
// ===============================================

/**
 * Load available service templates
 */
async function loadServiceTemplates() {
  try {
    const response = await fetch('/api/scaffold/templates');
    const data = await response.json();

    if (data.success) {
      const container = document.getElementById('templatesList');
      container.innerHTML = '';

      for (const [key, template] of Object.entries(data.templates)) {
        container.innerHTML += `
          <div class="col-md-6 mb-3">
            <div class="card h-100">
              <div class="card-body">
                <h6 class="card-title">${template.name}</h6>
                <p class="card-text text-muted small">${template.description}</p>
                <div class="mt-2">
                  ${template.features.map(f => `<span class="badge bg-light text-dark me-1">${f}</span>`).join('')}
                </div>
              </div>
            </div>
          </div>
        `;
      }
    }
  } catch (error) {
    console.error('Error loading templates:', error);
  }
}

/**
 * Validate service name
 */
async function validateServiceName() {
  const serviceName = document.getElementById('serviceName').value;

  if (!serviceName) {
    showToast('Please enter a service name', 'warning');
    return;
  }

  try {
    const response = await fetch(`/api/scaffold/validate-name/${serviceName}`);
    const data = await response.json();

    if (data.valid) {
      showToast('Service name is available', 'success');
    } else {
      showToast(data.error || 'Service name is not available', 'danger');
    }
  } catch (error) {
    showToast('Validation failed: ' + error.message, 'danger');
  }
}

/**
 * Validate port availability
 */
async function validatePort() {
  const port = document.getElementById('servicePort').value;

  if (!port) {
    showToast('Please enter a port number', 'warning');
    return;
  }

  try {
    const response = await fetch(`/api/scaffold/validate-port/${port}`);
    const data = await response.json();

    if (data.valid) {
      showToast('Port is available', 'success');
    } else {
      showToast(data.error || 'Port is not available', 'danger');
    }
  } catch (error) {
    showToast('Validation failed: ' + error.message, 'danger');
  }
}

/**
 * Handle scaffold form submission
 */
document.addEventListener('DOMContentLoaded', () => {
  const scaffoldForm = document.getElementById('scaffoldForm');
  if (scaffoldForm) {
    scaffoldForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const serviceName = document.getElementById('serviceName').value;
      const displayName = document.getElementById('displayName').value;
      const port = parseInt(document.getElementById('servicePort').value);
      const template = document.getElementById('serviceTemplate').value;
      const description = document.getElementById('serviceDescription').value;
      const author = document.getElementById('serviceAuthor').value;

      const resultDiv = document.getElementById('scaffoldResult');
      resultDiv.style.display = 'block';
      resultDiv.innerHTML = '<div class="alert alert-info"><i class="bi bi-hourglass-split me-2"></i>Creating service...</div>';

      try {
        const response = await fetch('/api/scaffold/service', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serviceName,
            displayName,
            port,
            template,
            description,
            author
          })
        });

        const data = await response.json();

        if (data.success) {
          resultDiv.innerHTML = `
            <div class="alert alert-success">
              <h6><i class="bi bi-check-circle me-2"></i>Service Created Successfully!</h6>
              <p class="mb-0"><strong>Name:</strong> ${data.serviceName}</p>
              <p class="mb-0"><strong>Port:</strong> ${data.port}</p>
              <p class="mb-0"><strong>Template:</strong> ${data.template}</p>
              <p class="mb-0"><strong>Path:</strong> <code>${data.path}</code></p>
              <hr>
              <p class="mb-0"><strong>Files created:</strong> ${data.files.join(', ')}</p>
              <hr>
              <p class="mb-1"><strong>Next steps:</strong></p>
              <ol class="mb-0">
                <li>cd ${data.path}</li>
                <li>npm install</li>
                <li>cp .env.example .env</li>
                <li>npm run dev</li>
              </ol>
            </div>
          `;
          showToast('Service created successfully!', 'success');
          scaffoldForm.reset();
        } else {
          resultDiv.innerHTML = `
            <div class="alert alert-danger">
              <i class="bi bi-x-circle me-2"></i>${data.error || 'Failed to create service'}
              ${data.message ? `<p class="mb-0 mt-2 small">${data.message}</p>` : ''}
            </div>
          `;
          showToast('Failed to create service', 'danger');
        }
      } catch (error) {
        resultDiv.innerHTML = `
          <div class="alert alert-danger">
            <i class="bi bi-x-circle me-2"></i>Error: ${error.message}
          </div>
        `;
        showToast('Failed to create service', 'danger');
      }
    });
  }
});

// ===============================================
// Schema Builder Functions
// ===============================================

let columnCounter = 0;

/**
 * Load databases for schema builder
 */
async function loadSchemaDatabases() {
  try {
    const response = await fetch('/api/database/list');
    const data = await response.json();

    if (data.success) {
      const selects = [
        'tableDatabase',
        'indexDatabase',
        'viewDatabase',
        'enumDatabase',
        'browseDatabase'
      ];

      selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (select) {
          select.innerHTML = '<option value="">Select database...</option>';
          data.databases.forEach(db => {
            select.innerHTML += `<option value="${db.name}">${db.name}</option>`;
          });
        }
      });
    }
  } catch (error) {
    console.error('Error loading databases:', error);
  }
}

/**
 * Add column to table builder
 */
function addColumn() {
  const container = document.getElementById('columnsContainer');
  const id = ++columnCounter;

  const columnHtml = `
    <div class="card mb-2" id="column-${id}">
      <div class="card-body">
        <div class="row align-items-end">
          <div class="col-md-3 mb-2">
            <label class="form-label small">Column Name</label>
            <input type="text" class="form-control form-control-sm column-name" placeholder="id">
          </div>
          <div class="col-md-2 mb-2">
            <label class="form-label small">Type</label>
            <select class="form-select form-select-sm column-type">
              <option value="INTEGER">INTEGER</option>
              <option value="BIGINT">BIGINT</option>
              <option value="VARCHAR">VARCHAR</option>
              <option value="TEXT">TEXT</option>
              <option value="BOOLEAN">BOOLEAN</option>
              <option value="TIMESTAMP">TIMESTAMP</option>
              <option value="UUID">UUID</option>
              <option value="JSONB">JSONB</option>
            </select>
          </div>
          <div class="col-md-2 mb-2">
            <label class="form-label small">Length</label>
            <input type="number" class="form-control form-control-sm column-length" placeholder="255">
          </div>
          <div class="col-md-2 mb-2">
            <label class="form-label small">Default</label>
            <input type="text" class="form-control form-control-sm column-default" placeholder="NULL">
          </div>
          <div class="col-md-2 mb-2">
            <label class="form-label small d-block">&nbsp;</label>
            <div class="form-check form-check-inline">
              <input class="form-check-input column-pk" type="checkbox">
              <label class="form-check-label small">PK</label>
            </div>
            <div class="form-check form-check-inline">
              <input class="form-check-input column-notnull" type="checkbox">
              <label class="form-check-label small">NOT NULL</label>
            </div>
          </div>
          <div class="col-md-1 mb-2">
            <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeColumn(${id})">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  container.insertAdjacentHTML('beforeend', columnHtml);
}

/**
 * Remove column from table builder
 */
function removeColumn(id) {
  const element = document.getElementById(`column-${id}`);
  if (element) {
    element.remove();
  }
}

/**
 * Get columns from form
 */
function getColumns() {
  const columns = [];
  const columnCards = document.querySelectorAll('#columnsContainer .card');

  columnCards.forEach(card => {
    const name = card.querySelector('.column-name').value;
    const type = card.querySelector('.column-type').value;
    const length = card.querySelector('.column-length').value;
    const defaultValue = card.querySelector('.column-default').value;
    const pk = card.querySelector('.column-pk').checked;
    const notNull = card.querySelector('.column-notnull').checked;

    if (name && type) {
      const column = {
        name,
        type,
        primaryKey: pk,
        notNull: notNull || pk
      };

      if (length) {
        column.length = parseInt(length);
      }

      if (defaultValue && defaultValue !== 'NULL') {
        column.default = defaultValue;
      }

      columns.push(column);
    }
  });

  return columns;
}

/**
 * Handle create table form submission
 */
document.addEventListener('DOMContentLoaded', () => {
  const createTableForm = document.getElementById('createTableForm');
  if (createTableForm) {
    createTableForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const database = document.getElementById('tableDatabase').value;
      const tableName = document.getElementById('tableName').value;
      const columns = getColumns();

      if (columns.length === 0) {
        showToast('Please add at least one column', 'warning');
        return;
      }

      const resultDiv = document.getElementById('tableResult');
      resultDiv.style.display = 'block';
      resultDiv.innerHTML = '<div class="alert alert-info"><i class="bi bi-hourglass-split me-2"></i>Creating table...</div>';

      try {
        const response = await fetch('/api/schema/table', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            database,
            tableName,
            columns
          })
        });

        const data = await response.json();

        if (data.success) {
          resultDiv.innerHTML = `
            <div class="alert alert-success">
              <h6><i class="bi bi-check-circle me-2"></i>Table Created Successfully!</h6>
              <p class="mb-0"><strong>Table:</strong> ${data.tableName}</p>
              <hr>
              <p class="mb-0"><strong>Generated SQL:</strong></p>
              <pre class="bg-light p-2 rounded mt-2 mb-0"><code>${data.sql}</code></pre>
            </div>
          `;
          showToast('Table created successfully!', 'success');
        } else {
          resultDiv.innerHTML = `
            <div class="alert alert-danger">
              <i class="bi bi-x-circle me-2"></i>${data.error || 'Failed to create table'}
              ${data.message ? `<p class="mb-0 mt-2 small">${data.message}</p>` : ''}
            </div>
          `;
          showToast('Failed to create table', 'danger');
        }
      } catch (error) {
        resultDiv.innerHTML = `
          <div class="alert alert-danger">
            <i class="bi bi-x-circle me-2"></i>Error: ${error.message}
          </div>
        `;
        showToast('Failed to create table', 'danger');
      }
    });
  }

  // Initialize other schema forms
  initSchemaForms();
});

/**
 * Initialize schema builder forms
 */
function initSchemaForms() {
  // Create Index Form
  const createIndexForm = document.getElementById('createIndexForm');
  if (createIndexForm) {
    createIndexForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const database = document.getElementById('indexDatabase').value;
      const tableName = document.getElementById('indexTableName').value;
      const indexName = document.getElementById('indexName').value;
      const columns = document.getElementById('indexColumns').value.split(',').map(c => c.trim());
      const unique = document.getElementById('indexUnique').checked;
      const method = document.getElementById('indexMethod').value;

      const resultDiv = document.getElementById('indexResult');
      resultDiv.style.display = 'block';
      resultDiv.innerHTML = '<div class="alert alert-info"><i class="bi bi-hourglass-split me-2"></i>Creating index...</div>';

      try {
        const response = await fetch('/api/schema/index', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            database,
            tableName,
            indexName,
            columns,
            unique,
            method
          })
        });

        const data = await response.json();

        if (data.success) {
          resultDiv.innerHTML = `
            <div class="alert alert-success">
              <h6><i class="bi bi-check-circle me-2"></i>Index Created Successfully!</h6>
              <pre class="bg-light p-2 rounded mt-2 mb-0"><code>${data.sql}</code></pre>
            </div>
          `;
          showToast('Index created successfully!', 'success');
        } else {
          resultDiv.innerHTML = `<div class="alert alert-danger"><i class="bi bi-x-circle me-2"></i>${data.error || 'Failed to create index'}</div>`;
          showToast('Failed to create index', 'danger');
        }
      } catch (error) {
        resultDiv.innerHTML = `<div class="alert alert-danger"><i class="bi bi-x-circle me-2"></i>Error: ${error.message}</div>`;
        showToast('Failed to create index', 'danger');
      }
    });
  }

  // Create View Form
  const createViewForm = document.getElementById('createViewForm');
  if (createViewForm) {
    createViewForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const database = document.getElementById('viewDatabase').value;
      const viewName = document.getElementById('viewName').value;
      const query = document.getElementById('viewQuery').value;

      const resultDiv = document.getElementById('viewResult');
      resultDiv.style.display = 'block';
      resultDiv.innerHTML = '<div class="alert alert-info"><i class="bi bi-hourglass-split me-2"></i>Creating view...</div>';

      try {
        const response = await fetch('/api/schema/view', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ database, viewName, query })
        });

        const data = await response.json();

        if (data.success) {
          resultDiv.innerHTML = `<div class="alert alert-success"><h6><i class="bi bi-check-circle me-2"></i>View Created Successfully!</h6></div>`;
          showToast('View created successfully!', 'success');
        } else {
          resultDiv.innerHTML = `<div class="alert alert-danger"><i class="bi bi-x-circle me-2"></i>${data.error || 'Failed to create view'}</div>`;
          showToast('Failed to create view', 'danger');
        }
      } catch (error) {
        resultDiv.innerHTML = `<div class="alert alert-danger"><i class="bi bi-x-circle me-2"></i>Error: ${error.message}</div>`;
        showToast('Failed to create view', 'danger');
      }
    });
  }

  // Create Enum Form
  const createEnumForm = document.getElementById('createEnumForm');
  if (createEnumForm) {
    createEnumForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const database = document.getElementById('enumDatabase').value;
      const enumName = document.getElementById('enumName').value;
      const values = document.getElementById('enumValues').value.split(',').map(v => v.trim());

      const resultDiv = document.getElementById('enumResult');
      resultDiv.style.display = 'block';
      resultDiv.innerHTML = '<div class="alert alert-info"><i class="bi bi-hourglass-split me-2"></i>Creating enum...</div>';

      try {
        const response = await fetch('/api/schema/enum', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ database, enumName, values })
        });

        const data = await response.json();

        if (data.success) {
          resultDiv.innerHTML = `<div class="alert alert-success"><h6><i class="bi bi-check-circle me-2"></i>Enum Created Successfully!</h6></div>`;
          showToast('Enum created successfully!', 'success');
        } else {
          resultDiv.innerHTML = `<div class="alert alert-danger"><i class="bi bi-x-circle me-2"></i>${data.error || 'Failed to create enum'}</div>`;
          showToast('Failed to create enum', 'danger');
        }
      } catch (error) {
        resultDiv.innerHTML = `<div class="alert alert-danger"><i class="bi bi-x-circle me-2"></i>Error: ${error.message}</div>`;
        showToast('Failed to create enum', 'danger');
      }
    });
  }
}

/**
 * Load tables for browsing
 */
async function loadTables() {
  const database = document.getElementById('browseDatabase').value;
  if (!database) return;

  const container = document.getElementById('tablesListContainer');
  container.innerHTML = '<div class="spinner-border spinner-border-sm me-2"></div>Loading tables...';

  try {
    const response = await fetch(`/api/schema/tables/${database}`);
    const data = await response.json();

    if (data.success && data.tables.length > 0) {
      container.innerHTML = `
        <div class="table-responsive">
          <table class="table table-hover">
            <thead>
              <tr>
                <th>Table Name</th>
                <th>Columns</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${data.tables.map(table => `
                <tr>
                  <td><code>${table.table_name}</code></td>
                  <td>${table.column_count}</td>
                  <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="viewTableSchema('${database}', '${table.table_name}')">
                      <i class="bi bi-eye"></i> View Schema
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else {
      container.innerHTML = '<p class="text-muted">No tables found in this database</p>';
    }
  } catch (error) {
    container.innerHTML = `<div class="alert alert-danger">Error loading tables: ${error.message}</div>`;
  }
}

/**
 * View table schema
 */
async function viewTableSchema(database, tableName) {
  try {
    const response = await fetch(`/api/schema/table/${database}/${tableName}`);
    const data = await response.json();

    if (data.success) {
      // Display schema in a modal or alert
      let schemaHtml = `<h6>Table: ${tableName}</h6><hr>`;
      schemaHtml += '<h6>Columns:</h6><ul>';
      data.columns.forEach(col => {
        schemaHtml += `<li><code>${col.column_name}</code> - ${col.data_type}${col.character_maximum_length ? `(${col.character_maximum_length})` : ''} ${col.is_nullable === 'NO' ? 'NOT NULL' : ''}</li>`;
      });
      schemaHtml += '</ul>';

      if (data.primaryKeys.length > 0) {
        schemaHtml += `<h6>Primary Keys:</h6><p>${data.primaryKeys.map(pk => `<code>${pk}</code>`).join(', ')}</p>`;
      }

      alert(schemaHtml); // Simple alert for now; could use a modal
    }
  } catch (error) {
    showToast('Failed to load schema: ' + error.message, 'danger');
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  initSocket();
  initUploadZone();
  loadDatabaseInfo();
  loadServiceTemplates();
  loadSchemaDatabases();

  // Add initial column to table builder
  addColumn();

  // Auto-validate config on change
  const configEditor = document.getElementById('configEditor');
  const autoValidate = document.getElementById('autoValidate');

  configEditor.addEventListener('input', () => {
    if (autoValidate.checked) {
      // Debounced validation (not implemented here for brevity)
    }
  });

  addLog('Exprsn Setup Service initialized', 'success');
});
