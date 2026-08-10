/**
 * Exprsn Admin Console - Core JavaScript
 */

// Initialize Socket.IO
const socket = io();

// Theme management
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);

  const btn = document.querySelector('.theme-toggle');
  if (newTheme === 'dark') {
    btn.innerHTML = '<i class="bi bi-sun"></i><span>Light Mode</span>';
  } else {
    btn.innerHTML = '<i class="bi bi-moon-stars"></i><span>Dark Mode</span>';
  }
}

// Load saved theme
const savedTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);

// Sidebar toggle (mobile)
function toggleSidebar() {
  document.querySelector('.admin-sidebar').classList.toggle('show');
}

// Navigation is now handled by admin-router.js
// The loadPage function is defined in admin-router.js

// Notification System
function showNotification(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `alert alert-${type} position-fixed top-0 end-0 m-3`;
  toast.style.zIndex = '9999';
  toast.style.minWidth = '300px';
  toast.innerHTML = `
    <div class="d-flex align-items-center">
      <i class="bi bi-${type === 'success' ? 'check-circle' : type === 'error' || type === 'danger' ? 'x-circle' : 'info-circle'} me-2"></i>
      <div>${message}</div>
      <button type="button" class="btn-close ms-auto" onclick="this.parentElement.parentElement.remove()"></button>
    </div>
  `;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 5000);
}

// Make globally available
window.showNotification = showNotification;

// API Call Helper
async function apiCall(endpoint, options = {}) {
  try {
    const response = await fetch(`/api${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }

    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// Make globally available
window.apiCall = apiCall;

// Socket.IO Event Handlers
socket.on('connect', () => {
  console.log('Connected to server');
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
});

socket.on('service:started', (data) => {
  console.log('Service started:', data);
  showNotification(`Service ${data.service} started`, 'success');
});

socket.on('service:stopped', (data) => {
  console.log('Service stopped:', data);
  showNotification(`Service ${data.service} stopped`, 'info');
});

socket.on('service:restarted', (data) => {
  console.log('Service restarted:', data);
  showNotification(`Service ${data.service} restarted`, 'success');
});

socket.on('service:error', (data) => {
  console.error('Service error:', data);
  showNotification(`Service ${data.service} error: ${data.error}`, 'danger');
});

socket.on('service:log', (data) => {
  console.log(`[${data.service}]`, data.message);
});

// Old loadDashboard function - keeping for reference but not used
function oldLoadDashboard(content) {
  content.innerHTML = `
    <div class="col-12">
      <h3 class="mb-4">System Overview</h3>
    </div>

    <div class="service-grid">
      <div class="service-card">
        <div class="service-card-header">
          <div class="service-icon"><i class="bi bi-hdd-rack"></i></div>
          <div>
            <h5 class="mb-0">Services</h5>
            <small class="text-muted">Platform Services</small>
          </div>
          <span class="badge badge-status badge-running">18 Total</span>
        </div>
        <p class="mb-0">All Exprsn platform services</p>
      </div>

      <div class="service-card">
        <div class="service-card-header">
          <div class="service-icon"><i class="bi bi-shield-check"></i></div>
          <div>
            <h5 class="mb-0">Certificate Authority</h5>
            <small class="text-muted">Port 3000</small>
          </div>
          <span class="badge badge-status badge-stopped">Stopped</span>
        </div>
        <p class="mb-0">X.509 certificates and CA tokens</p>
        <div class="service-actions">
          <button class="btn btn-sm btn-success" onclick="startService('ca')">
            <i class="bi bi-play-fill"></i> Start
          </button>
          <button class="btn btn-sm btn-outline-secondary">
            <i class="bi bi-gear"></i>
          </button>
        </div>
      </div>

      <div class="service-card">
        <div class="service-card-header">
          <div class="service-icon"><i class="bi bi-key"></i></div>
          <div>
            <h5 class="mb-0">Authentication</h5>
            <small class="text-muted">Port 3001</small>
          </div>
          <span class="badge badge-status badge-stopped">Stopped</span>
        </div>
        <p class="mb-0">OAuth2, OIDC, SAML SSO</p>
        <div class="service-actions">
          <button class="btn btn-sm btn-success" onclick="startService('auth')">
            <i class="bi bi-play-fill"></i> Start
          </button>
          <button class="btn btn-sm btn-outline-secondary">
            <i class="bi bi-gear"></i>
          </button>
        </div>
      </div>

      <div class="service-card">
        <div class="service-card-header">
          <div class="service-icon"><i class="bi bi-briefcase"></i></div>
          <div>
            <h5 class="mb-0">Forge (CRM/ERP)</h5>
            <small class="text-muted">Port 3016</small>
          </div>
          <span class="badge badge-status badge-stopped">Stopped</span>
        </div>
        <p class="mb-0">Business platform with 212 records</p>
        <div class="service-actions">
          <button class="btn btn-sm btn-success" onclick="startService('forge')">
            <i class="bi bi-play-fill"></i> Start
          </button>
          <button class="btn btn-sm btn-outline-secondary">
            <i class="bi bi-gear"></i>
          </button>
        </div>
      </div>
    </div>

    <div class="col-12 mt-4">
      <div class="alert alert-info">
        <h5 class="alert-heading"><i class="bi bi-info-circle"></i> Welcome to Exprsn Admin Console</h5>
        <p class="mb-0">Manage all 18 Exprsn platform services from this unified interface.</p>
      </div>
    </div>
  `;
}

// Load services page
async function loadServices(content) {
  content.innerHTML = '<div class="col-12"><p>Loading services...</p></div>';
  await fetchServices();
}

// Socket.IO event listeners
socket.on('connect', () => {
  console.log('Connected to admin server');
  updateConnectionStatus('online');
});

socket.on('disconnect', () => {
  console.log('Disconnected from admin server');
  updateConnectionStatus('offline');
});

socket.on('service:started', (data) => {
  showNotification(`Service ${data.service} started`, 'success');
});

socket.on('service:stopped', (data) => {
  showNotification(`Service ${data.service} stopped`, 'info');
});

// Helper functions
function updateConnectionStatus(status) {
  const indicator = document.querySelector('.status-indicator');
  const text = document.querySelector('.status-text');

  if (status === 'online') {
    indicator.className = 'status-indicator status-online';
    text.textContent = 'Connected';
  } else {
    indicator.className = 'status-indicator status-offline';
    text.textContent = 'Disconnected';
  }
}

function showNotification(message, type = 'info') {
  const toastContainer = document.createElement('div');
  toastContainer.style.position = 'fixed';
  toastContainer.style.top = '20px';
  toastContainer.style.right = '20px';
  toastContainer.style.zIndex = '9999';

  const toast = document.createElement('div');
  toast.className = `alert alert-${type} alert-dismissible fade show`;
  toast.setAttribute('role', 'alert');
  toast.innerHTML = `
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
  `;

  toastContainer.appendChild(toast);
  document.body.appendChild(toastContainer);

  setTimeout(() => {
    toastContainer.remove();
  }, 5000);
}

// API helpers
async function apiCall(endpoint, options = {}) {
  try {
    const response = await fetch(`/api${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }

    return data;
  } catch (error) {
    console.error('API call failed:', error);
    showNotification(error.message, 'danger');
    throw error;
  }
}

// Service management functions
async function startService(name) {
  try {
    showNotification(`Starting ${name}...`, 'info');
    await apiCall(`/services/${name}/start`, { method: 'POST' });
  } catch (error) {
    console.error('Failed to start service:', error);
  }
}

async function stopService(name) {
  try {
    showNotification(`Stopping ${name}...`, 'info');
    await apiCall(`/services/${name}/stop`, { method: 'POST' });
  } catch (error) {
    console.error('Failed to stop service:', error);
  }
}

async function restartService(name) {
  try {
    showNotification(`Restarting ${name}...`, 'info');
    await apiCall(`/services/${name}/restart`, { method: 'POST' });
  } catch (error) {
    console.error('Failed to restart service:', error);
  }
}

async function fetchServices() {
  try {
    const data = await apiCall('/services');
    displayServices(data.services || []);
  } catch (error) {
    const content = document.getElementById('admin-content');
    content.innerHTML = `
      <div class="col-12">
        <div class="alert alert-warning">
          <h5>Service Discovery Not Yet Implemented</h5>
          <p>The service management API is under construction. Please check the IMPLEMENTATION-GUIDE.md to complete the routes.</p>
        </div>
      </div>
    `;
  }
}

function displayServices(services) {
  const content = document.getElementById('admin-content');
  content.innerHTML = '<div class="service-grid"></div>';
  const grid = content.querySelector('.service-grid');

  services.forEach(service => {
    const card = document.createElement('div');
    card.className = 'service-card';
    card.innerHTML = `
      <div class="service-card-header">
        <div class="service-icon"><i class="bi bi-hdd-rack"></i></div>
        <div>
          <h5 class="mb-0">${service.name}</h5>
          <small class="text-muted">Port ${service.port}</small>
        </div>
        <span class="badge badge-status badge-stopped">Stopped</span>
      </div>
      <p class="mb-0">${service.description || 'Exprsn platform service'}</p>
      <div class="service-actions">
        <button class="btn btn-sm btn-success" onclick="startService('${service.name}')">
          <i class="bi bi-play-fill"></i> Start
        </button>
        <button class="btn btn-sm btn-warning" onclick="restartService('${service.name}')">
          <i class="bi bi-arrow-clockwise"></i>
        </button>
        <button class="btn btn-sm btn-danger" onclick="stopService('${service.name}')">
          <i class="bi bi-stop-fill"></i>
        </button>
      </div>
    `;
    grid.appendChild(card);
  });
}
