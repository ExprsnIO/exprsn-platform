/**
 * Complete Page Components with Subgrid Layouts - Part 1: Core Functions
 */

// Helper Functions First
window.getServiceIcon = function(serviceName) {
  const icons = {
    ca: '🔐', auth: '🔑', spark: '💬', timeline: '📝',
    moderator: '🛡️', filevault: '📁', gallery: '🖼️', live: '📺',
    bridge: '🌉', nexus: '👥', pulse: '📊', vault: '🔒',
    herald: '📨', setup: '⚙️', forge: '💼', workflow: '⚡',
    svr: '🌐', prefetch: '⚡'
  };
  return icons[serviceName] || '⚙️';
};

window.formatUptime = function(seconds) {
  if (!seconds) return 'N/A';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

// Service Control
window.startService = async function(name) {
  const res = await fetch(`/api/services/${name}/start`, { method: 'POST' });
  const data = await res.json();
  if (data.success) showNotification(`${name} started`, 'success');
  else showNotification(`Failed: ${data.error}`, 'error');
  setTimeout(() => loadPage('dashboard'), 1000);
};

window.stopService = async function(name) {
  const res = await fetch(`/api/services/${name}/stop`, { method: 'POST' });
  const data = await res.json();
  if (data.success) showNotification(`${name} stopped`, 'success');
  else showNotification(`Failed: ${data.error}`, 'error');
  setTimeout(() => loadPage('dashboard'), 1000);
};

window.restartService = async function(name) {
  const res = await fetch(`/api/services/${name}/restart`, { method: 'POST' });
  const data = await res.json();
  if (data.success) showNotification(`${name} restarted`, 'success');
  else showNotification(`Failed: ${data.error}`, 'error');
  setTimeout(() => loadPage('dashboard'), 1000);
};

// User Functions
window.showUserCreateModal = function() {
  document.getElementById('user-modals-container').innerHTML = Modals.userCreate();
  Modals.show('modal-user-create');
};

window.editUser = async function(userId) {
  const res = await fetch(`/api/users/${userId}`);
  const data = await res.json();
  if (data.success) {
    document.getElementById('user-modals-container').innerHTML = Modals.userEdit(data.user || data.data);
  }
};

window.confirmDeleteUser = function(userId, username) {
  document.getElementById('user-modals-container').innerHTML =  
    Modals.deleteConfirm('User', username, `Modals.handleUserDelete('${userId}', '${username}')`);
};

window.revokeCertificate = async function(certId) {
  if (!confirm('Revoke this certificate?')) return;
  const res = await fetch(`/api/certificates/${certId}/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'admin_revocation' })
  });
  if (res.ok) {
    showNotification('Certificate revoked', 'success');
    loadPage('certificates');
  }
};

window.revokeToken = async function(tokenId) {
  if (!confirm('Revoke this token?')) return;
  const res = await fetch(`/api/tokens/${tokenId}/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'admin_revocation' })
  });
  if (res.ok) {
    showNotification('Token revoked', 'success');
    loadPage('tokens');
  }
};

window.testRedisConnection = async function() {
  const form = document.getElementById('redis-config-form');
  const data = Object.fromEntries(new FormData(form));
  const res = await fetch('/api/redis/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const result = await res.json();
  showNotification(result.success ? 'Connected!' : result.error, result.success ? 'success' : 'error');
};

window.flushRedis = async function() {
  if (!confirm('Flush Redis? Cannot be undone!')) return;
  const res = await fetch('/api/redis/flush', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ db: 0 })
  });
  if (res.ok) showNotification('Redis flushed', 'success');
};

// Bulk Service Operations
window.startAllServices = async function() {
  if (!confirm('Start all services?')) return;
  showNotification('Starting all services...', 'info');
  const res = await fetch('/api/services/bulk/start-all', { method: 'POST' });
  const data = await res.json();
  if (data.success) {
    showNotification('All services starting', 'success');
    setTimeout(() => loadPage('dashboard'), 2000);
  }
};

window.stopAllServices = async function() {
  if (!confirm('Stop all services? This will shut down the entire platform!')) return;
  showNotification('Stopping all services...', 'warning');
  const res = await fetch('/api/services/bulk/stop-all', { method: 'POST' });
  const data = await res.json();
  if (data.success) {
    showNotification('All services stopping', 'warning');
    setTimeout(() => loadPage('dashboard'), 2000);
  }
};

window.restartAllServices = async function() {
  if (!confirm('Restart all services?')) return;
  showNotification('Restarting all services...', 'info');
  // Stop all then start all
  await fetch('/api/services/bulk/stop-all', { method: 'POST' });
  setTimeout(async () => {
    await fetch('/api/services/bulk/start-all', { method: 'POST' });
    showNotification('All services restarting', 'success');
    setTimeout(() => loadPage('dashboard'), 3000);
  }, 2000);
};

// Service Logs
window.viewServiceLogs = async function(serviceName) {
  const res = await fetch(`/api/services/${serviceName}/logs`);
  const data = await res.json();
  if (data.success) {
    const logsElement = document.getElementById(`service-logs-${serviceName}`);
    if (logsElement) {
      logsElement.textContent = data.logs.join('\n') || 'No logs available';
      logsElement.scrollTop = logsElement.scrollHeight;
    }
  }
};

// System Logs
window.refreshLogs = async function() {
  showNotification('Refreshing logs...', 'info');
  const logsElement = document.getElementById('system-logs');
  if (logsElement) {
    // Fetch logs from admin server
    try {
      const res = await fetch('/api/logs');
      const data = await res.json();
      if (data.success && data.logs) {
        logsElement.textContent = data.logs.join('\n');
        logsElement.scrollTop = logsElement.scrollHeight;
      } else {
        logsElement.textContent = 'No logs available';
      }
    } catch (err) {
      logsElement.textContent = 'Error loading logs: ' + err.message;
    }
  }
};

window.clearLogs = function() {
  if (!confirm('Clear all logs? This cannot be undone.')) return;
  const logsElement = document.getElementById('system-logs');
  if (logsElement) {
    logsElement.textContent = 'Logs cleared';
    showNotification('Logs cleared', 'success');
  }
};

// Backup Operations
window.createBackup = async function() {
  if (!confirm('Create a new backup? This may take several minutes.')) return;
  showNotification('Creating backup...', 'info');
  try {
    const res = await fetch('/api/backups/create', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showNotification('Backup created successfully', 'success');
      loadPage('backups');
    } else {
      showNotification('Backup failed: ' + data.error, 'error');
    }
  } catch (err) {
    showNotification('Backup failed: ' + err.message, 'error');
  }
};

window.configureBackups = function() {
  showNotification('Backup configuration coming soon', 'info');
};

window.restoreBackup = async function(backupId) {
  if (!confirm(`Restore backup ${backupId}? This will overwrite current data!`)) return;
  showNotification('Restoring backup...', 'info');
  try {
    const res = await fetch('/api/backups/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backupId })
    });
    const data = await res.json();
    if (data.success) {
      showNotification('Backup restored successfully', 'success');
    } else {
      showNotification('Restore failed: ' + data.error, 'error');
    }
  } catch (err) {
    showNotification('Restore failed: ' + err.message, 'error');
  }
};

window.downloadBackup = function(backupId) {
  window.location.href = `/api/backups/download/${backupId}`;
  showNotification('Downloading backup...', 'info');
};

// Workflow Operations
window.editWorkflow = async function(workflowId) {
  // Load workflow into designer
  window.location.hash = `#/workflow/designer?id=${workflowId}`;
};

window.executeWorkflow = async function(workflowId) {
  if (!confirm('Execute this workflow now?')) return;
  showNotification('Executing workflow...', 'info');
  try {
    const res = await fetch(`/api/workflows/${workflowId}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (data.success) {
      showNotification('Workflow executed successfully', 'success');
    } else {
      showNotification('Workflow execution failed: ' + data.error, 'error');
    }
  } catch (err) {
    showNotification('Error executing workflow: ' + err.message, 'error');
  }
};

window.deleteWorkflow = async function(workflowId) {
  if (!confirm('Delete this workflow? This cannot be undone.')) return;
  try {
    const res = await fetch(`/api/workflows/${workflowId}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (data.success) {
      showNotification('Workflow deleted', 'success');
      loadPage('workflow');
    } else {
      showNotification('Delete failed: ' + data.error, 'error');
    }
  } catch (err) {
    showNotification('Error deleting workflow: ' + err.message, 'error');
  }
};

window.loadWorkflowTemplates = async function() {
  showNotification('Loading workflow templates...', 'info');
  // This would show a modal with predefined workflow templates
  // For now, just show a placeholder
  showNotification('Workflow templates coming soon', 'info');
};

// Service Configuration
window.saveServiceConfig = async function(serviceName) {
  const formId = `${serviceName}-config-form`;
  const form = document.getElementById(formId);
  if (!form) {
    showNotification('Form not found', 'error');
    return;
  }

  const formData = new FormData(form);
  const config = {};

  for (let [key, value] of formData.entries()) {
    // Handle checkboxes
    if (form.elements[key]?.type === 'checkbox') {
      config[key] = form.elements[key].checked;
    } else if (form.elements[key]?.type === 'number') {
      config[key] = parseFloat(value);
    } else {
      config[key] = value;
    }
  }

  try {
    const res = await fetch(`/api/services/${serviceName}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config })
    });
    const data = await res.json();
    if (data.success) {
      showNotification(`${serviceName.toUpperCase()} configuration saved`, 'success');
    } else {
      showNotification(`Save failed: ${data.error}`, 'error');
    }
  } catch (err) {
    showNotification('Error saving configuration: ' + err.message, 'error');
  }
};

// Authentication Configuration (Nested Object Handler)
window.saveAuthConfig = async function() {
  const form = document.getElementById('auth-config-form');
  if (!form) {
    showNotification('Form not found', 'error');
    return;
  }

  // Helper function to set nested property
  const setNestedProperty = (obj, path, value) => {
    const keys = path.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
  };

  const config = {};
  const formData = new FormData(form);
  const processedFields = new Set();

  // First pass: collect all checkboxes (including unchecked ones)
  const checkboxes = form.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach(checkbox => {
    const name = checkbox.getAttribute('name');
    if (name) {
      setNestedProperty(config, name, checkbox.checked);
      processedFields.add(name);
    }
  });

  // Second pass: process all other form fields
  for (let [key, value] of formData.entries()) {
    // Skip if already processed as checkbox
    if (processedFields.has(key)) continue;

    const element = form.elements[key];
    let processedValue = value;

    // Handle different input types
    if (element?.type === 'number') {
      processedValue = parseFloat(value);
    } else if (element?.type === 'textarea' || element?.tagName === 'TEXTAREA') {
      // Handle comma-separated arrays (scopes, IP lists, etc.)
      if (key.includes('scopes') || key.includes('Whitelist') || key.includes('Blacklist') || key.includes('allowedOrigins')) {
        processedValue = value.split(',').map(v => v.trim()).filter(v => v);
      }
    } else if (element?.type === 'text' && (key.includes('scopes'))) {
      // Handle inline comma-separated scopes
      processedValue = value.split(',').map(v => v.trim()).filter(v => v);
    }

    // Set the nested property
    setNestedProperty(config, key, processedValue);
  }

  try {
    showNotification('Saving authentication configuration...', 'info');

    const res = await fetch('/api/services/auth/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config })
    });

    const data = await res.json();

    if (data.success) {
      showNotification('Authentication configuration saved successfully', 'success');
    } else {
      showNotification(`Save failed: ${data.error || 'Unknown error'}`, 'error');
    }
  } catch (err) {
    showNotification('Error saving configuration: ' + err.message, 'error');
    console.error('Save auth config error:', err);
  }
};

// CA Configuration (Nested Object Handler)
window.saveCAConfig = async function() {
  const form = document.getElementById('ca-config-form');
  if (!form) {
    showNotification('Form not found', 'error');
    return;
  }

  // Helper function to set nested property
  const setNestedProperty = (obj, path, value) => {
    const keys = path.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
  };

  const config = {};
  const formData = new FormData(form);
  const processedFields = new Set();

  // First pass: collect all checkboxes (including unchecked ones)
  const checkboxes = form.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach(checkbox => {
    const name = checkbox.getAttribute('name');
    if (name) {
      // Skip revocation.allowedReasons checkboxes - handle them separately as array
      if (name.startsWith('revocation.allowedReasons.')) {
        return;
      }
      setNestedProperty(config, name, checkbox.checked);
      processedFields.add(name);
    }
  });

  // Handle revocation.allowedReasons as array from checkboxes
  const allowedReasonCheckboxes = form.querySelectorAll('input[name^="revocation.allowedReasons."]:checked');
  if (allowedReasonCheckboxes.length > 0) {
    const allowedReasons = Array.from(allowedReasonCheckboxes).map(cb => {
      const name = cb.getAttribute('name');
      return name.replace('revocation.allowedReasons.', '');
    });
    setNestedProperty(config, 'revocation.allowedReasons', allowedReasons);
    // Mark all allowedReasons fields as processed
    form.querySelectorAll('input[name^="revocation.allowedReasons."]').forEach(cb => {
      processedFields.add(cb.getAttribute('name'));
    });
  }

  // Second pass: process all other form fields
  for (let [key, value] of formData.entries()) {
    // Skip if already processed as checkbox
    if (processedFields.has(key)) continue;
    // Skip revocation.allowedReasons individual checkboxes
    if (key.startsWith('revocation.allowedReasons.')) continue;

    const element = form.elements[key];
    let processedValue = value;

    // Handle different input types
    if (element?.type === 'number') {
      processedValue = parseFloat(value);
    } else if (element?.type === 'textarea' || element?.tagName === 'TEXTAREA') {
      // Handle line-separated arrays (distribution points)
      if (key === 'crl.distributionPoints') {
        processedValue = value.split('\n').map(v => v.trim()).filter(v => v);
      }
    } else if (key === 'keyManagement.escrow.escrowAgents') {
      // Handle comma-separated escrow agents
      processedValue = value.split(',').map(v => v.trim()).filter(v => v);
    }

    // Set the nested property
    setNestedProperty(config, key, processedValue);
  }

  try {
    showNotification('Saving CA configuration...', 'info');

    const res = await fetch('/api/services/ca/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config })
    });

    const data = await res.json();

    if (data.success) {
      showNotification('CA configuration saved successfully', 'success');
    } else {
      showNotification(`Save failed: ${data.error || 'Unknown error'}`, 'error');
    }
  } catch (err) {
    showNotification('Error saving configuration: ' + err.message, 'error');
    console.error('Save CA config error:', err);
  }
};

// Timeline Configuration (Nested Object Handler)
window.saveTimelineConfig = async function() {
  const form = document.getElementById('timeline-config-form');
  if (!form) {
    showNotification('Form not found', 'error');
    return;
  }

  // Helper function to set nested property
  const setNestedProperty = (obj, path, value) => {
    const keys = path.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
  };

  const config = {};
  const formData = new FormData(form);
  const processedFields = new Set();

  // First pass: collect all checkboxes (including unchecked ones)
  const checkboxes = form.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach(checkbox => {
    const name = checkbox.getAttribute('name');
    if (name) {
      setNestedProperty(config, name, checkbox.checked);
      processedFields.add(name);
    }
  });

  // Second pass: process all other form fields
  for (let [key, value] of formData.entries()) {
    // Skip if already processed as checkbox
    if (processedFields.has(key)) continue;

    const element = form.elements[key];
    let processedValue = value;

    // Handle different input types
    if (element?.type === 'number') {
      processedValue = parseFloat(value);
    } else if (element?.type === 'select-one') {
      // Keep as string
      processedValue = value;
    }

    // Set the nested property
    setNestedProperty(config, key, processedValue);
  }

  try {
    showNotification('Saving Timeline configuration...', 'info');

    const res = await fetch('/api/services/timeline/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config })
    });

    const data = await res.json();

    if (data.success) {
      showNotification('Timeline configuration saved successfully', 'success');
    } else {
      showNotification(`Save failed: ${data.error || 'Unknown error'}`, 'error');
    }
  } catch (err) {
    showNotification('Error saving configuration: ' + err.message, 'error');
    console.error('Save Timeline config error:', err);
  }
};

// Spark Messaging Configuration (Nested Object Handler)
window.saveSparkConfig = async function() {
  const form = document.getElementById('spark-config-form');
  if (!form) {
    showNotification('Form not found', 'error');
    return;
  }

  // Helper function to set nested property
  const setNestedProperty = (obj, path, value) => {
    const keys = path.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
  };

  const config = {};
  const formData = new FormData(form);
  const processedFields = new Set();

  // First pass: collect all checkboxes (including unchecked ones)
  const checkboxes = form.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach(checkbox => {
    const name = checkbox.getAttribute('name');
    if (name) {
      setNestedProperty(config, name, checkbox.checked);
      processedFields.add(name);
    }
  });

  // Second pass: process all other form fields
  for (let [key, value] of formData.entries()) {
    // Skip if already processed as checkbox
    if (processedFields.has(key)) continue;

    const element = form.elements[key];
    let processedValue = value;

    // Handle different input types
    if (element?.type === 'number') {
      processedValue = parseFloat(value);
    } else if (element?.type === 'select-one') {
      // Keep as string
      processedValue = value;
    } else if (element?.type === 'time') {
      // Keep time as string
      processedValue = value;
    }

    // Set the nested property
    setNestedProperty(config, key, processedValue);
  }

  try {
    showNotification('Saving Spark configuration...', 'info');

    const res = await fetch('/api/services/spark/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config })
    });

    const data = await res.json();

    if (data.success) {
      showNotification('Spark configuration saved successfully', 'success');
    } else {
      showNotification(`Save failed: ${data.error || 'Unknown error'}`, 'error');
    }
  } catch (err) {
    showNotification('Error saving configuration: ' + err.message, 'error');
    console.error('Save Spark config error:', err);
  }
};

// Moderator Service Configuration
window.saveModeratorConfig = async function() {
  const form = document.getElementById('moderator-config-form');
  if (!form) {
    showNotification('Form not found', 'error');
    return;
  }

  // Helper function to set nested property
  const setNestedProperty = (obj, path, value) => {
    const keys = path.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
  };

  const config = {};
  const formData = new FormData(form);
  const processedFields = new Set();

  // First pass: collect all checkboxes (including unchecked ones)
  const checkboxes = form.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach(checkbox => {
    const name = checkbox.getAttribute('name');
    if (name) {
      setNestedProperty(config, name, checkbox.checked);
      processedFields.add(name);
    }
  });

  // Second pass: process all other form fields
  for (let [key, value] of formData.entries()) {
    if (processedFields.has(key)) continue;

    const element = form.elements[key];
    let processedValue = value;

    if (element?.type === 'number') {
      processedValue = parseFloat(value);
    } else if (element?.type === 'password') {
      // Keep password as string, skip if empty
      if (!value) continue;
      processedValue = value;
    } else if (element?.type === 'select-one') {
      processedValue = value;
    } else if (element?.type === 'range') {
      processedValue = parseFloat(value);
    }

    setNestedProperty(config, key, processedValue);
  }

  try {
    showNotification('Saving Moderator configuration...', 'info');

    const res = await fetch('/api/services/moderator/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config })
    });

    const data = await res.json();

    if (data.success) {
      showNotification('Moderator configuration saved successfully', 'success');
      // Optionally reload the page to reflect changes
      setTimeout(() => loadPage('services/moderator'), 1000);
    } else {
      showNotification(`Save failed: ${data.error || 'Unknown error'}`, 'error');
    }
  } catch (err) {
    showNotification('Error saving configuration: ' + err.message, 'error');
    console.error('Save Moderator config error:', err);
  }
};

// Global Configuration
window.saveGlobalConfig = async function() {
  const form = document.getElementById('global-config-form');
  if (!form) {
    showNotification('Form not found', 'error');
    return;
  }

  const formData = new FormData(form);
  const config = {};

  for (let [key, value] of formData.entries()) {
    // Handle checkboxes
    if (form.elements[key]?.type === 'checkbox') {
      config[key] = form.elements[key].checked;
    } else if (form.elements[key]?.type === 'number') {
      config[key] = parseFloat(value);
    } else {
      config[key] = value;
    }
  }

  // Don't send empty SMTP password
  if (!config.smtpPassword) {
    delete config.smtpPassword;
  }

  try {
    const res = await fetch('/api/config/global', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config })
    });
    const data = await res.json();
    if (data.success) {
      showNotification('Global settings saved successfully', 'success');
      if (config.maintenanceMode) {
        showNotification('Maintenance mode is now enabled', 'warning');
      }
    } else {
      showNotification('Save failed: ' + (data.error || 'Unknown error'), 'error');
    }
  } catch (err) {
    showNotification('Error saving global settings: ' + err.message, 'error');
  }
};

window.testEmailConfig = async function() {
  const form = document.getElementById('global-config-form');
  if (!form) {
    showNotification('Form not found', 'error');
    return;
  }

  const formData = new FormData(form);
  const emailConfig = {
    smtpHost: formData.get('smtpHost'),
    smtpPort: parseInt(formData.get('smtpPort')),
    smtpSecure: form.elements['smtpSecure']?.checked,
    smtpUser: formData.get('smtpUser'),
    smtpPassword: formData.get('smtpPassword'),
    smtpFrom: formData.get('smtpFrom')
  };

  try {
    showNotification('Testing email connection...', 'info');
    const res = await fetch('/api/config/test-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emailConfig)
    });
    const data = await res.json();
    if (data.success) {
      showNotification('Email connection successful!', 'success');
    } else {
      showNotification('Email test failed: ' + (data.error || 'Unknown error'), 'error');
    }
  } catch (err) {
    showNotification('Error testing email: ' + err.message, 'error');
  }
};

// Database Browser Functions
window.loadDatabaseTables = async function(database) {
  const listEl = document.getElementById(`table-list-${database}`);
  if (!listEl) return;

  try {
    const res = await fetch(`/api/database/${database}/tables`);
    const data = await res.json();

    if (data.success && data.tables) {
      listEl.innerHTML = data.tables.map(t => `
        <div class="list-group-item list-group-item-action"
             style="cursor:pointer;padding:0.75rem;border-radius:4px;margin-bottom:0.5rem"
             onclick="viewTableData('${database}', '${t.name}')">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <i class="bi bi-table"></i> <strong>${t.name}</strong>
            </div>
            <span class="badge bg-secondary">${t.rowCount || 0}</span>
          </div>
        </div>
      `).join('');
    } else {
      // Fallback sample tables
      const sampleTables = {
        'exprsn_ca': ['certificates', 'certificate_revocations', 'tokens', 'ocsp_responses'],
        'exprsn_auth': ['users', 'sessions', 'oauth_clients', 'roles', 'permissions'],
        'exprsn_timeline': ['posts', 'likes', 'comments', 'follows', 'notifications'],
        'exprsn_spark': ['messages', 'conversations', 'participants', 'attachments'],
        'exprsn_forge': ['companies', 'contacts', 'deals', 'leads', 'activities', 'invoices', 'products'],
        'exprsn_workflow': ['workflows', 'executions', 'steps', 'triggers'],
        'exprsn_nexus': ['groups', 'events', 'members', 'calendars', 'contacts']
      };

      const tables = sampleTables[database] || [];
      listEl.innerHTML = tables.map(t => `
        <div class="list-group-item list-group-item-action"
             style="cursor:pointer;padding:0.75rem;border-radius:4px;margin-bottom:0.5rem"
             onclick="viewTableData('${database}', '${t}')">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <i class="bi bi-table"></i> <strong>${t}</strong>
            </div>
            <span class="badge bg-secondary">-</span>
          </div>
        </div>
      `).join('');
    }
  } catch (err) {
    listEl.innerHTML = `<div class="alert alert-danger">Error loading tables: ${err.message}</div>`;
  }
};

window.filterTables = function(database) {
  const searchInput = document.getElementById(`table-search-${database}`);
  const filter = searchInput.value.toLowerCase();
  const listEl = document.getElementById(`table-list-${database}`);
  const items = listEl.getElementsByClassName('list-group-item');

  Array.from(items).forEach(item => {
    const text = item.textContent || item.innerText;
    if (text.toLowerCase().indexOf(filter) > -1) {
      item.style.display = '';
    } else {
      item.style.display = 'none';
    }
  });
};

window.viewTableData = async function(database, tableName) {
  const viewerEl = document.getElementById(`table-viewer-${database}`);
  if (!viewerEl) return;

  viewerEl.innerHTML = `
    <div class="text-center py-3">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
    </div>
  `;

  try {
    const res = await fetch(`/api/database/${database}/tables/${tableName}/data?limit=50`);
    const data = await res.json();

    if (data.success && data.rows && data.columns) {
      const { rows, columns } = data;

      viewerEl.innerHTML = `
        <div style="margin-bottom:1rem;display:flex;justify-content:space-between;align-items:center">
          <div>
            <h5 style="margin:0"><i class="bi bi-table"></i> ${tableName}</h5>
            <small class="text-muted">${rows.length} rows shown</small>
          </div>
          <div>
            <button class="btn btn-sm btn-success" onclick="createNewRow('${database}', '${tableName}')">
              <i class="bi bi-plus-circle"></i> New Row
            </button>
            <button class="btn btn-sm btn-outline-secondary" onclick="exportTableData('${database}', '${tableName}')">
              <i class="bi bi-download"></i> Export
            </button>
            <button class="btn btn-sm btn-outline-primary" onclick="viewTableData('${database}', '${tableName}')">
              <i class="bi bi-arrow-clockwise"></i> Refresh
            </button>
          </div>
        </div>

        <div style="overflow-x:auto;max-height:500px;overflow-y:auto">
          <table class="table table-sm table-hover table-bordered">
            <thead style="position:sticky;top:0;background:white;z-index:1">
              <tr>
                ${columns.map(col => `<th style="white-space:nowrap">${col}</th>`).join('')}
                <th style="width:120px">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((row, idx) => `
                <tr>
                  ${columns.map(col => `
                    <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                        title="${String(row[col] || '').replace(/"/g, '&quot;')}">
                      ${row[col] !== null ? String(row[col]) : '<span class="text-muted">NULL</span>'}
                    </td>
                  `).join('')}
                  <td style="white-space:nowrap">
                    <button class="btn btn-xs btn-outline-primary"
                            onclick='editRow("${database}", "${tableName}", ${JSON.stringify(row).replace(/'/g, "\\'")})'
                            title="Edit">
                      <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-xs btn-outline-danger"
                            onclick='deleteRow("${database}", "${tableName}", "${row.id || row[columns[0]]}")'
                            title="Delete">
                      <i class="bi bi-trash"></i>
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else {
      // Fallback sample data
      viewerEl.innerHTML = `
        <div class="alert alert-info">
          <h5><i class="bi bi-table"></i> ${tableName}</h5>
          <p>Table viewer requires backend API implementation.</p>
          <p class="mb-0"><small>API endpoint: <code>GET /api/database/${database}/tables/${tableName}/data</code></small></p>
        </div>
      `;
    }
  } catch (err) {
    viewerEl.innerHTML = `<div class="alert alert-danger">Error loading table data: ${err.message}</div>`;
  }
};

window.refreshDatabases = function() {
  showNotification('Refreshing database connections...', 'info');
  loadPage('config/database');
};

window.createNewRow = function(database, tableName) {
  showNotification('Create new row functionality - coming soon', 'info');
  // TODO: Show modal with form for new row
};

window.editRow = function(database, tableName, row) {
  showNotification(`Edit row in ${tableName} - coming soon`, 'info');
  // TODO: Show modal with form to edit row
  console.log('Edit row:', database, tableName, row);
};

window.deleteRow = async function(database, tableName, rowId) {
  if (!confirm(`Delete row with ID ${rowId} from ${tableName}? This cannot be undone.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/database/${database}/tables/${tableName}/rows/${rowId}`, {
      method: 'DELETE'
    });
    const data = await res.json();

    if (data.success) {
      showNotification('Row deleted successfully', 'success');
      viewTableData(database, tableName);
    } else {
      showNotification('Delete failed: ' + (data.error || 'Unknown error'), 'error');
    }
  } catch (err) {
    showNotification('Error deleting row: ' + err.message, 'error');
  }
};

window.exportTableData = function(database, tableName) {
  showNotification(`Exporting ${tableName}...`, 'info');
  window.location.href = `/api/database/${database}/tables/${tableName}/export?format=csv`;
};

// Redis Configuration Functions
window.saveRedisConfig = async function() {
  const form = document.getElementById('redis-config-form');
  if (!form) {
    showNotification('Form not found', 'error');
    return;
  }

  const formData = new FormData(form);
  const config = {
    host: formData.get('host'),
    port: parseInt(formData.get('port')),
    db: parseInt(formData.get('db')),
    password: formData.get('password')
  };

  // Don't send empty password
  if (!config.password) {
    delete config.password;
  }

  try {
    const res = await fetch('/api/redis/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    const data = await res.json();

    if (data.success) {
      showNotification('Redis configuration saved', 'success');
      setTimeout(() => loadPage('config/redis'), 1000);
    } else {
      showNotification('Save failed: ' + (data.error || 'Unknown error'), 'error');
    }
  } catch (err) {
    showNotification('Error saving Redis config: ' + err.message, 'error');
  }
};

window.saveAllPrefixes = async function() {
  const services = ['ca', 'auth', 'timeline', 'spark', 'moderator', 'filevault', 'gallery',
                   'live', 'bridge', 'nexus', 'pulse', 'vault', 'herald', 'setup',
                   'forge', 'workflow', 'svr', 'prefetch'];

  const prefixes = {};
  services.forEach(service => {
    const input = document.getElementById(`prefix-${service}`);
    if (input) {
      prefixes[service] = input.value;
    }
  });

  try {
    const res = await fetch('/api/redis/prefixes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes })
    });
    const data = await res.json();

    if (data.success) {
      showNotification('Service prefixes saved successfully', 'success');
    } else {
      showNotification('Save failed: ' + (data.error || 'Unknown error'), 'error');
    }
  } catch (err) {
    showNotification('Error saving prefixes: ' + err.message, 'error');
  }
};

window.resetPrefix = function(service) {
  const input = document.getElementById(`prefix-${service}`);
  if (input) {
    input.value = `exprsn:${service}`;
    showNotification(`Reset ${service} prefix to default`, 'info');
  }
};

window.flushServiceKeys = async function() {
  if (!confirm('Flush all service-related keys? This will clear sessions, cache, and queues for ALL services!')) {
    return;
  }

  try {
    const res = await fetch('/api/redis/flush-service-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();

    if (data.success) {
      showNotification(`Flushed ${data.count || 'all'} service keys`, 'success');
    } else {
      showNotification('Flush failed: ' + (data.error || 'Unknown error'), 'error');
    }
  } catch (err) {
    showNotification('Error flushing service keys: ' + err.message, 'error');
  }
};

window.viewRedisKeys = async function() {
  try {
    const res = await fetch('/api/redis/keys?pattern=*&limit=100');
    const data = await res.json();

    if (data.success && data.keys) {
      const keyList = data.keys.slice(0, 50).join('\n');
      alert(`Redis Keys (first 50 of ${data.total || data.keys.length}):\n\n${keyList}`);
    } else {
      showNotification('Could not retrieve Redis keys', 'error');
    }
  } catch (err) {
    showNotification('Error viewing Redis keys: ' + err.message, 'error');
  }
};

// Users Page Functions
window.filterUsers = function() {
  const searchInput = document.getElementById('user-search');
  const statusFilter = document.getElementById('user-status-filter');
  const roleFilter = document.getElementById('user-role-filter');

  const search = searchInput ? searchInput.value.toLowerCase() : '';
  const status = statusFilter ? statusFilter.value : 'all';
  const role = roleFilter ? roleFilter.value : 'all';

  const rows = document.querySelectorAll('.user-row');
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    const rowStatus = row.dataset.status;
    const rowRole = row.dataset.role;

    const matchesSearch = text.includes(search);
    const matchesStatus = status === 'all' || rowStatus === status;
    const matchesRole = role === 'all' || rowRole === role;

    row.style.display = (matchesSearch && matchesStatus && matchesRole) ? '' : 'none';
  });
};

window.toggleAllUsers = function(checked) {
  document.querySelectorAll('.user-checkbox').forEach(cb => cb.checked = checked);
};

window.viewUserDetails = async function(userId) {
  try {
    const res = await fetch(`/api/users/${userId}`);
    const data = await res.json();
    if (data.success && data.user) {
      const user = data.user || data.data;
      alert(`User Details:\n\nUsername: ${user.username}\nEmail: ${user.email}\nStatus: ${user.status}\nCreated: ${new Date(user.createdAt).toLocaleString()}`);
    }
  } catch (err) {
    showNotification('Error loading user details', 'error');
  }
};

window.bulkActivateUsers = async function() {
  const selectedIds = Array.from(document.querySelectorAll('.user-checkbox:checked')).map(cb => cb.value);
  if (selectedIds.length === 0) {
    showNotification('No users selected', 'warning');
    return;
  }

  if (!confirm(`Activate ${selectedIds.length} user(s)?`)) return;

  try {
    const res = await fetch('/api/users/bulk/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds: selectedIds })
    });
    const data = await res.json();
    if (data.success) {
      showNotification(`Activated ${selectedIds.length} user(s)`, 'success');
      loadPage('users');
    }
  } catch (err) {
    showNotification('Error activating users', 'error');
  }
};

window.bulkDeactivateUsers = async function() {
  const selectedIds = Array.from(document.querySelectorAll('.user-checkbox:checked')).map(cb => cb.value);
  if (selectedIds.length === 0) {
    showNotification('No users selected', 'warning');
    return;
  }

  if (!confirm(`Deactivate ${selectedIds.length} user(s)?`)) return;

  try {
    const res = await fetch('/api/users/bulk/deactivate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds: selectedIds })
    });
    const data = await res.json();
    if (data.success) {
      showNotification(`Deactivated ${selectedIds.length} user(s)`, 'success');
      loadPage('users');
    }
  } catch (err) {
    showNotification('Error deactivating users', 'error');
  }
};

window.bulkDeleteUsers = async function() {
  const selectedIds = Array.from(document.querySelectorAll('.user-checkbox:checked')).map(cb => cb.value);
  if (selectedIds.length === 0) {
    showNotification('No users selected', 'warning');
    return;
  }

  if (!confirm(`DELETE ${selectedIds.length} user(s)? This cannot be undone!`)) return;

  try {
    const res = await fetch('/api/users/bulk/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds: selectedIds })
    });
    const data = await res.json();
    if (data.success) {
      showNotification(`Deleted ${selectedIds.length} user(s)`, 'success');
      loadPage('users');
    }
  } catch (err) {
    showNotification('Error deleting users', 'error');
  }
};

// Tokens Page Functions
window.filterTokens = function() {
  const searchInput = document.getElementById('token-search');
  const statusFilter = document.getElementById('token-status-filter');
  const typeFilter = document.getElementById('token-type-filter');

  const search = searchInput ? searchInput.value.toLowerCase() : '';
  const status = statusFilter ? statusFilter.value : 'all';
  const type = typeFilter ? typeFilter.value : 'all';

  const rows = document.querySelectorAll('.token-row');
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    const rowStatus = row.dataset.status;
    const rowType = row.dataset.type;

    const matchesSearch = text.includes(search);
    const matchesStatus = status === 'all' || rowStatus === status;
    const matchesType = type === 'all' || rowType === type;

    row.style.display = (matchesSearch && matchesStatus && matchesType) ? '' : 'none';
  });
};

window.toggleAllTokens = function(checked) {
  document.querySelectorAll('.token-checkbox').forEach(cb => cb.checked = checked);
};

window.viewTokenDetails = async function(tokenId) {
  try {
    const res = await fetch(`/api/tokens/${tokenId}`);
    const data = await res.json();
    if (data.success && data.token) {
      const token = data.token || data.data;
      const details = `Token Details:\n\nID: ${token.id}\nResource: ${token.resource?.value || 'N/A'}\nStatus: ${token.status}\nExpires: ${token.expiresAt ? new Date(token.expiresAt).toLocaleString() : 'Never'}`;
      alert(details);
    }
  } catch (err) {
    showNotification('Error loading token details', 'error');
  }
};

window.generateNewToken = function() {
  showNotification('Generate new token functionality - coming soon', 'info');
  // TODO: Show modal with token generation form
};

window.bulkRevokeTokens = async function() {
  const selectedIds = Array.from(document.querySelectorAll('.token-checkbox:checked')).map(cb => cb.value);
  if (selectedIds.length === 0) {
    showNotification('No tokens selected', 'warning');
    return;
  }

  if (!confirm(`Revoke ${selectedIds.length} token(s)? This cannot be undone!`)) return;

  try {
    const res = await fetch('/api/tokens/bulk/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokenIds: selectedIds })
    });
    const data = await res.json();
    if (data.success) {
      showNotification(`Revoked ${selectedIds.length} token(s)`, 'success');
      loadPage('tokens');
    }
  } catch (err) {
    showNotification('Error revoking tokens', 'error');
  }
};

window.bulkExportTokens = function() {
  const selectedIds = Array.from(document.querySelectorAll('.token-checkbox:checked')).map(cb => cb.value);
  if (selectedIds.length === 0) {
    showNotification('No tokens selected', 'warning');
    return;
  }
  showNotification(`Exporting ${selectedIds.length} token(s)...`, 'info');
  window.location.href = `/api/tokens/export?ids=${selectedIds.join(',')}`;
};

// Certificates Page Functions
window.filterCertificates = function() {
  const searchInput = document.getElementById('cert-search');
  const statusFilter = document.getElementById('cert-status-filter');
  const typeFilter = document.getElementById('cert-type-filter');

  const search = searchInput ? searchInput.value.toLowerCase() : '';
  const status = statusFilter ? statusFilter.value : 'all';
  const type = typeFilter ? typeFilter.value : 'all';

  const rows = document.querySelectorAll('.cert-row');
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    const rowStatus = row.dataset.status;
    const rowType = row.dataset.type;

    const matchesSearch = text.includes(search);
    const matchesStatus = status === 'all' || rowStatus === status;
    const matchesType = type === 'all' || rowType === type;

    row.style.display = (matchesSearch && matchesStatus && matchesType) ? '' : 'none';
  });
};

window.toggleAllCertificates = function(checked) {
  document.querySelectorAll('.cert-checkbox').forEach(cb => cb.checked = checked);
};

window.viewCertDetails = async function(certId) {
  try {
    const res = await fetch(`/api/certificates/${certId}`);
    const data = await res.json();
    if (data.success && data.certificate) {
      const cert = data.certificate || data.data;
      const details = `Certificate Details:\n\nCommon Name: ${cert.commonName}\nSerial: ${cert.serialNumber}\nOrganization: ${cert.organization || 'N/A'}\nStatus: ${cert.status}\nValid From: ${new Date(cert.notBefore).toLocaleString()}\nValid Until: ${new Date(cert.notAfter).toLocaleString()}`;
      alert(details);
    }
  } catch (err) {
    showNotification('Error loading certificate details', 'error');
  }
};

window.issueCertificate = function() {
  showNotification('Issue new certificate functionality - coming soon', 'info');
  // TODO: Show modal with certificate issuance form
};

window.downloadCertificate = function(certId) {
  showNotification('Downloading certificate...', 'info');
  window.location.href = `/api/certificates/${certId}/download`;
};

window.bulkRevokeCertificates = async function() {
  const selectedIds = Array.from(document.querySelectorAll('.cert-checkbox:checked')).map(cb => cb.value);
  if (selectedIds.length === 0) {
    showNotification('No certificates selected', 'warning');
    return;
  }

  if (!confirm(`Revoke ${selectedIds.length} certificate(s)? This cannot be undone!`)) return;

  try {
    const res = await fetch('/api/certificates/bulk/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ certificateIds: selectedIds, reason: 'admin_bulk_revocation' })
    });
    const data = await res.json();
    if (data.success) {
      showNotification(`Revoked ${selectedIds.length} certificate(s)`, 'success');
      loadPage('certificates');
    }
  } catch (err) {
    showNotification('Error revoking certificates', 'error');
  }
};

window.bulkExportCertificates = function() {
  const selectedIds = Array.from(document.querySelectorAll('.cert-checkbox:checked')).map(cb => cb.value);
  if (selectedIds.length === 0) {
    showNotification('No certificates selected', 'warning');
    return;
  }
  showNotification(`Exporting ${selectedIds.length} certificate(s)...`, 'info');
  window.location.href = `/api/certificates/export?ids=${selectedIds.join(',')}`;
};

window.checkOCSPStatus = async function() {
  const selectedIds = Array.from(document.querySelectorAll('.cert-checkbox:checked')).map(cb => cb.value);
  if (selectedIds.length === 0) {
    showNotification('No certificates selected', 'warning');
    return;
  }

  try {
    showNotification('Checking OCSP status...', 'info');
    const res = await fetch('/api/certificates/ocsp/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ certificateIds: selectedIds })
    });
    const data = await res.json();
    if (data.success) {
      const results = data.results || [];
      const summary = results.map(r => `${r.serialNumber}: ${r.status}`).join('\n');
      alert(`OCSP Status Check Results:\n\n${summary}`);
    }
  } catch (err) {
    showNotification('Error checking OCSP status', 'error');
  }
};

console.log('Pages functions loaded');
