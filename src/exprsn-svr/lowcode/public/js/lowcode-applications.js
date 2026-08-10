/**
 * Exprsn Low-Code Platform - Application Management
 *
 * Interactive UI for managing low-code applications
 */

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const AppState = {
  applications: [],
  filteredApplications: [],
  currentView: 'grid',
  searchQuery: '',
  statusFilter: '',
  sortBy: 'created_at',
  currentApp: null,
  isLoading: false,

  // Wizard state
  wizard: {
    currentStep: 1,
    totalSteps: 9,
    completedSteps: new Set(),
    formData: {}
  }
};

// ============================================================================
// API CLIENT
// ============================================================================

const API = {
  baseUrl: '/lowcode/api',

  async request(endpoint, options = {}) {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        ...options
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'API request failed');
      }

      return data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },

  // Application endpoints
  async getApplications(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.request(`/applications?${queryString}`);
  },

  async getApplication(id) {
    return this.request(`/applications/${id}`);
  },

  async createApplication(data) {
    return this.request('/applications', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async updateApplication(id, data) {
    return this.request(`/applications/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async deleteApplication(id) {
    return this.request(`/applications/${id}`, {
      method: 'DELETE'
    });
  },

  async publishApplication(id) {
    return this.request(`/applications/${id}/publish`, {
      method: 'POST'
    });
  },

  async archiveApplication(id) {
    return this.request(`/applications/${id}/archive`, {
      method: 'POST'
    });
  }
};

// ============================================================================
// UI FUNCTIONS
// ============================================================================

/**
 * Load applications from API
 */
async function loadApplications() {
  AppState.isLoading = true;
  showSpinner();

  try {
    const response = await API.getApplications({
      limit: 100,
      sortBy: AppState.sortBy,
      sortOrder: 'DESC'
    });

    AppState.applications = response.data.applications || [];
    filterAndDisplayApplications();
  } catch (error) {
    showToast('Failed to load applications: ' + error.message, 'error');
    showEmptyState();
  } finally {
    AppState.isLoading = false;
    hideSpinner();
  }
}

/**
 * Filter applications based on search and filters
 */
function filterApplications() {
  let filtered = [...AppState.applications];

  // Apply search filter
  if (AppState.searchQuery) {
    const query = AppState.searchQuery.toLowerCase();
    filtered = filtered.filter(app =>
      app.name.toLowerCase().includes(query) ||
      app.displayName.toLowerCase().includes(query) ||
      (app.description && app.description.toLowerCase().includes(query))
    );
  }

  // Apply status filter
  if (AppState.statusFilter) {
    filtered = filtered.filter(app => app.status === AppState.statusFilter);
  }

  AppState.filteredApplications = filtered;
}

/**
 * Filter and display applications
 */
function filterAndDisplayApplications() {
  filterApplications();

  if (AppState.filteredApplications.length === 0) {
    showEmptyState();
  } else {
    hideEmptyState();
    if (AppState.currentView === 'grid') {
      displayGridView();
    } else {
      displayListView();
    }
  }
}

/**
 * Display applications in grid view
 */
function displayGridView() {
  const grid = document.getElementById('appsGrid');
  grid.innerHTML = '';

  AppState.filteredApplications.forEach(app => {
    const card = createAppCard(app);
    grid.appendChild(card);
  });
}

/**
 * Create application card element
 */
function createAppCard(app) {
  const card = document.createElement('div');
  card.className = 'app-card';
  card.onclick = () => openApplication(app.id);

  const statusClass = app.status.toLowerCase();
  const iconClass = getAppIcon(app);
  const createdDate = new Date(app.createdAt).toLocaleDateString();
  const updatedDate = new Date(app.updatedAt).toLocaleDateString();

  card.innerHTML = `
    <div class="app-card-header">
      <div class="app-icon">
        <i class="${iconClass}"></i>
      </div>
      <span class="app-status ${statusClass}">${app.status}</span>
    </div>
    <div class="app-card-body">
      <h3 class="app-name">${escapeHtml(app.displayName)}</h3>
      <p class="app-description">${escapeHtml(app.description || 'No description')}</p>
    </div>
    <div class="app-card-footer">
      <div class="app-meta">
        <div class="app-meta-item">
          <i class="fas fa-tag"></i>
          Version ${app.version}
        </div>
        <div class="app-meta-item">
          <i class="fas fa-clock"></i>
          Updated ${updatedDate}
        </div>
      </div>
      <div class="app-actions">
        <button
          class="app-action-btn"
          title="Edit"
          onclick="editApplication('${app.id}', event)"
        >
          <i class="fas fa-edit"></i>
        </button>
        ${app.status === 'draft' ? `
          <button
            class="app-action-btn"
            title="Publish"
            onclick="publishApplication('${app.id}', event)"
          >
            <i class="fas fa-rocket"></i>
          </button>
        ` : ''}
        <button
          class="app-action-btn"
          title="Delete"
          onclick="deleteApplication('${app.id}', event)"
        >
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>
  `;

  return card;
}

/**
 * Display applications in list view
 */
function displayListView() {
  const tbody = document.getElementById('appsTableBody');
  tbody.innerHTML = '';

  AppState.filteredApplications.forEach(app => {
    const row = createAppRow(app);
    tbody.appendChild(row);
  });
}

/**
 * Create application table row
 */
function createAppRow(app) {
  const row = document.createElement('tr');
  row.onclick = () => openApplication(app.id);

  const statusClass = app.status.toLowerCase();
  const createdDate = new Date(app.createdAt).toLocaleDateString();
  const updatedDate = new Date(app.updatedAt).toLocaleDateString();

  row.innerHTML = `
    <td>
      <strong>${escapeHtml(app.displayName)}</strong>
      <br>
      <small style="color: var(--text-secondary);">${escapeHtml(app.name)}</small>
    </td>
    <td><span class="app-status ${statusClass}">${app.status}</span></td>
    <td>${app.version}</td>
    <td>${createdDate}</td>
    <td>${updatedDate}</td>
    <td>
      <div class="app-actions" onclick="event.stopPropagation()">
        <button
          class="app-action-btn"
          title="Edit"
          onclick="editApplication('${app.id}', event)"
        >
          <i class="fas fa-edit"></i>
        </button>
        ${app.status === 'draft' ? `
          <button
            class="app-action-btn"
            title="Publish"
            onclick="publishApplication('${app.id}', event)"
          >
            <i class="fas fa-rocket"></i>
          </button>
        ` : ''}
        <button
          class="app-action-btn"
          title="Delete"
          onclick="deleteApplication('${app.id}', event)"
        >
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </td>
  `;

  return row;
}

/**
 * Open application designer
 */
function openApplication(appId) {
  window.location.href = `/lowcode/designer?appId=${appId}`;
}

/**
 * Show/hide empty state
 */
function showEmptyState() {
  document.getElementById('emptyState').style.display = 'block';
  document.getElementById('appsGrid').style.display = 'none';
  document.getElementById('appsList').style.display = 'none';
}

function hideEmptyState() {
  document.getElementById('emptyState').style.display = 'none';
  if (AppState.currentView === 'grid') {
    document.getElementById('appsGrid').style.display = 'grid';
    document.getElementById('appsList').style.display = 'none';
  } else {
    document.getElementById('appsGrid').style.display = 'none';
    document.getElementById('appsList').style.display = 'block';
  }
}

/**
 * Show/hide loading spinner
 */
function showSpinner() {
  document.getElementById('loadingSpinner').style.display = 'block';
}

function hideSpinner() {
  document.getElementById('loadingSpinner').style.display = 'none';
}

// ============================================================================
// APPLICATION CRUD OPERATIONS
// ============================================================================

/**
 * Open new application modal
 */
function openNewApplicationModal() {
  AppState.currentApp = null;
  document.getElementById('modalTitle').textContent = 'New Application Wizard';
  document.getElementById('appForm').reset();
  document.getElementById('appId').value = '';

  // Reset wizard to step 1
  AppState.wizard = {
    currentStep: 1,
    totalSteps: 9,
    completedSteps: new Set(),
    formData: {}
  };

  // Update wizard UI immediately
  updateWizardUIOnOpen();

  document.getElementById('appModal').classList.add('active');
}

/**
 * Edit application
 */
async function editApplication(appId, event) {
  if (event) event.stopPropagation();

  try {
    const response = await API.getApplication(appId);
    const app = response.data;

    AppState.currentApp = app;
    document.getElementById('modalTitle').textContent = 'Edit Application';
    document.getElementById('appId').value = app.id;
    document.getElementById('appName').value = app.name;
    document.getElementById('appDisplayName').value = app.displayName;
    document.getElementById('appDescription').value = app.description || '';
    document.getElementById('appModal').classList.add('active');
  } catch (error) {
    showToast('Failed to load application: ' + error.message, 'error');
  }
}

/**
 * Save application (create or update)
 */
async function saveApplication() {
  const form = document.getElementById('appForm');

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const appId = document.getElementById('appId').value;

  // Get selected app type
  const appType = document.querySelector('.app-type-card.active')?.dataset.type || 'blank';

  // Collect basic data
  const data = {
    name: document.getElementById('appName').value,
    displayName: document.getElementById('appDisplayName').value,
    description: document.getElementById('appDescription').value,

    // Application type and source
    creationType: appType,

    // Git integration
    gitIntegration: {
      enabled: document.getElementById('initGitRepo').checked,
      generateReadme: document.getElementById('generateReadme').checked,
      generateGitignore: document.getElementById('generateGitignore').checked,
      initialCommit: document.getElementById('initialCommit').checked,
      license: document.getElementById('licenseType').value
    },

    // Advanced options
    version: document.getElementById('appVersion').value || '1.0.0',
    author: document.getElementById('appAuthor').value || '',
    tags: document.getElementById('appTags').value.split(',').map(t => t.trim()).filter(Boolean),
    enableCI: document.getElementById('enableCI').checked
  };

  // Add template-specific data
  if (appType === 'template') {
    data.templateId = document.getElementById('templateSelect').value;
  }

  // Add git import data
  if (appType === 'git') {
    data.gitImport = {
      url: document.getElementById('gitUrl').value,
      branch: document.getElementById('gitBranch').value || 'main',
      requiresAuth: document.getElementById('gitAuthentication').checked
    };

    if (data.gitImport.requiresAuth) {
      data.gitImport.username = document.getElementById('gitUsername').value;
      data.gitImport.token = document.getElementById('gitToken').value;
    }
  }

  try {
    if (appId) {
      // Update existing application
      await API.updateApplication(appId, data);
      showToast('Application updated successfully', 'success');
    } else {
      // Create new application
      const result = await API.createApplication(data);

      // Show success message with details
      let message = 'Application created successfully';
      if (data.gitIntegration.enabled) {
        message += ' with Git repository initialized';
      }
      showToast(message, 'success');

      // Redirect to the new application
      if (result.data && result.data.id) {
        setTimeout(() => {
          window.location.href = `/lowcode/applications/${result.data.id}`;
        }, 1500);
      }
    }

    closeModal();
    loadApplications();
  } catch (error) {
    showToast('Failed to save application: ' + error.message, 'error');
  }
}

/**
 * Delete application
 */
async function deleteApplication(appId, event) {
  if (event) event.stopPropagation();

  if (!confirm('Are you sure you want to delete this application? This action cannot be undone.')) {
    return;
  }

  try {
    await API.deleteApplication(appId);
    showToast('Application deleted successfully', 'success');
    loadApplications();
  } catch (error) {
    showToast('Failed to delete application: ' + error.message, 'error');
  }
}

/**
 * Publish application
 */
async function publishApplication(appId, event) {
  if (event) event.stopPropagation();

  try {
    await API.publishApplication(appId);
    showToast('Application published successfully', 'success');
    loadApplications();
  } catch (error) {
    showToast('Failed to publish application: ' + error.message, 'error');
  }
}

/**
 * Close modal
 */
function closeModal() {
  document.getElementById('appModal').classList.remove('active');
  AppState.currentApp = null;
}

// ============================================================================
// WIZARD NAVIGATION FUNCTIONS (Global scope)
// ============================================================================

/**
 * Navigate to specific wizard step
 */
function goToStep(stepNumber) {
  if (stepNumber < 1 || stepNumber > AppState.wizard.totalSteps) return;

  // Validate current step before moving forward
  if (stepNumber > AppState.wizard.currentStep) {
    if (!validateCurrentStep()) {
      return;
    }
    // Collect data from current step
    collectStepData(AppState.wizard.currentStep);
  }

  // Mark previous step as completed when moving forward
  if (stepNumber > AppState.wizard.currentStep) {
    AppState.wizard.completedSteps.add(AppState.wizard.currentStep);
  }

  // Update state
  AppState.wizard.currentStep = stepNumber;

  // Update UI
  updateWizardUI();
}

/**
 * Update wizard UI based on current state
 */
function updateWizardUI() {
  const currentStep = AppState.wizard.currentStep;
  const totalSteps = AppState.wizard.totalSteps;

  // Update progress bar
  const percentage = Math.round((currentStep / totalSteps) * 100);
  const progressBar = document.getElementById('wizardProgress');
  const progressText = document.getElementById('wizardProgressText');
  const progressPercent = document.getElementById('wizardProgressPercent');

  if (progressBar) progressBar.style.width = `${percentage}%`;
  if (progressText) progressText.textContent = `Step ${currentStep} of ${totalSteps}`;
  if (progressPercent) progressPercent.textContent = `${percentage}%`;

  // Update step panels visibility
  document.querySelectorAll('.wizard-step-panel').forEach(panel => {
    panel.classList.remove('active');
  });
  const currentPanel = document.querySelector(`[data-step-panel="${currentStep}"]`);
  if (currentPanel) currentPanel.classList.add('active');

  // Update sidebar steps
  document.querySelectorAll('.wizard-step').forEach(step => {
    const stepNum = parseInt(step.dataset.step);
    step.classList.remove('active');

    if (stepNum === currentStep) {
      step.classList.add('active');
    }
    if (AppState.wizard.completedSteps.has(stepNum)) {
      step.classList.add('completed');
    } else {
      step.classList.remove('completed');
    }
  });

  // Update buttons
  const prevBtn = document.getElementById('wizardPrevBtn');
  const nextBtn = document.getElementById('wizardNextBtn');

  if (prevBtn) {
    prevBtn.style.display = currentStep === 1 ? 'none' : 'inline-flex';
  }

  if (nextBtn) {
    if (currentStep === totalSteps) {
      nextBtn.innerHTML = '<i class="fas fa-rocket"></i> Create Application';
      nextBtn.className = 'btn btn-success';
    } else {
      nextBtn.innerHTML = 'Next <i class="fas fa-arrow-right"></i>';
      nextBtn.className = 'btn btn-primary';
    }
  }
}

/**
 * Validate current wizard step
 */
function validateCurrentStep() {
  const currentStep = AppState.wizard.currentStep;

  switch(currentStep) {
    case 1: // Basic Information
      const appName = document.getElementById('appName')?.value;
      const appDisplayName = document.getElementById('appDisplayName')?.value;

      if (!appName || !appDisplayName) {
        showToast('Please fill in required fields: Application Name and Display Name', 'error');
        return false;
      }

      // Validate app name format
      const appNamePattern = /^[a-z0-9-]+$/;
      if (!appNamePattern.test(appName)) {
        showToast('Application name must be lowercase alphanumeric with hyphens only', 'error');
        return false;
      }

      break;

    case 3: // Git Integration
      const initGit = document.getElementById('gitInitRepo')?.checked;
      const gitRemoteUrl = document.getElementById('gitRemoteUrl')?.value;

      if (initGit && gitRemoteUrl) {
        try {
          new URL(gitRemoteUrl);
        } catch {
          showToast('Please enter a valid Git remote URL', 'error');
          return false;
        }
      }
      break;

    case 5: // Data Sources
      const dataSources = document.querySelectorAll('input[name="dataSources"]:checked');
      if (dataSources.length === 0) {
        if (!confirm('No data sources selected. Continue anyway?')) {
          return false;
        }
      }
      break;

    // Other steps are optional or have no required validation
  }

  return true;
}

/**
 * Collect data from current wizard step
 */
function collectStepData(stepNumber) {
  const formData = AppState.wizard.formData;

  switch(stepNumber) {
    case 1: // Basic Information
      formData.name = document.getElementById('appName')?.value;
      formData.displayName = document.getElementById('appDisplayName')?.value;
      formData.description = document.getElementById('appDescription')?.value || '';
      formData.version = document.getElementById('appVersion')?.value || '1.0.0';
      break;

    case 2: // CA & Authentication
      formData.caAuth = {
        enableCAToken: document.getElementById('enableCAToken')?.checked || false,
        groups: Array.from(document.querySelectorAll('.group-tag')).map(tag => tag.textContent.replace('×', '').trim()),
        roles: Array.from(document.querySelectorAll('.role-item')).map(item => ({
          name: item.querySelector('.role-name')?.textContent,
          permissions: item.querySelector('.role-permissions')?.textContent
        }))
      };
      break;

    case 3: // Git Integration
      formData.gitIntegration = {
        enabled: document.getElementById('gitInitRepo')?.checked || false,
        generateReadme: document.getElementById('gitGenerateReadme')?.checked || false,
        generateGitignore: document.getElementById('gitGenerateGitignore')?.checked || false,
        initialCommit: document.getElementById('gitInitialCommit')?.checked || false,
        license: document.getElementById('gitLicense')?.value || 'MIT',
        remoteUrl: document.getElementById('gitRemoteUrl')?.value || ''
      };
      break;

    case 4: // Application Template
      const selectedTemplate = document.querySelector('.template-card.active');
      formData.template = selectedTemplate ? selectedTemplate.dataset.template : 'blank';
      break;

    case 5: // Data Sources
      formData.dataSources = Array.from(document.querySelectorAll('input[name="dataSources"]:checked'))
        .map(cb => cb.value);
      break;

    case 6: // Queries
      formData.queries = {
        create: document.getElementById('createQueries')?.checked || false,
        queryNames: document.getElementById('queryNames')?.value.split('\n').filter(Boolean) || []
      };
      break;

    case 7: // Forms
      formData.forms = {
        create: document.getElementById('createForms')?.checked || false,
        formNames: document.getElementById('formNames')?.value.split('\n').filter(Boolean) || []
      };
      break;

    case 8: // HTML Applications
      formData.htmlApps = Array.from(document.querySelectorAll('input[name="htmlPages"]:checked'))
        .map(cb => cb.value);
      break;

    case 9: // Charts & Functions
      formData.chartsAndFunctions = {
        chartLibrary: document.getElementById('chartLibrary')?.value || 'chart.js',
        functionTemplates: Array.from(document.querySelectorAll('input[name="functionTemplates"]:checked'))
          .map(cb => cb.value),
        globalVariables: Array.from(document.querySelectorAll('.variable-item')).map(item => ({
          name: item.querySelector('.variable-name')?.textContent,
          value: item.querySelector('.variable-value')?.textContent
        }))
      };
      break;
  }
}

/**
 * Move to next wizard step
 */
function nextStep() {
  if (AppState.wizard.currentStep === AppState.wizard.totalSteps) {
    // Last step - submit the wizard
    submitWizard();
  } else {
    goToStep(AppState.wizard.currentStep + 1);
  }
}

/**
 * Move to previous wizard step
 */
function previousStep() {
  goToStep(AppState.wizard.currentStep - 1);
}

/**
 * Submit wizard and create application
 */
async function submitWizard() {
  // Collect data from final step
  collectStepData(AppState.wizard.currentStep);

  // Validate all collected data
  const formData = AppState.wizard.formData;

  if (!formData.name || !formData.displayName) {
    showToast('Missing required fields. Please check Step 1.', 'error');
    goToStep(1);
    return;
  }

  try {
    // Show loading state
    const submitBtn = document.getElementById('wizardNextBtn');
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating Application...';

    // Prepare comprehensive application data
    const applicationData = {
      // Basic info
      name: formData.name,
      displayName: formData.displayName,
      description: formData.description,
      version: formData.version,

      // CA & Authentication
      caAuth: formData.caAuth || {},

      // Git integration
      gitIntegration: formData.gitIntegration || { enabled: false },

      // Template
      template: formData.template || 'blank',

      // Data sources
      dataSources: formData.dataSources || [],

      // Queries
      queries: formData.queries || { create: false, queryNames: [] },

      // Forms
      forms: formData.forms || { create: false, formNames: [] },

      // HTML pages
      htmlApps: formData.htmlApps || [],

      // Charts & Functions
      chartsAndFunctions: formData.chartsAndFunctions || {
        chartLibrary: 'chart.js',
        functionTemplates: [],
        globalVariables: []
      }
    };

    // Create application via API
    const result = await API.createApplication(applicationData);

    // Show success message
    let successMessage = 'Application created successfully!';
    if (formData.gitIntegration?.enabled) {
      successMessage += ' Git repository initialized.';
    }
    if (formData.template && formData.template !== 'blank') {
      successMessage += ` ${formData.template} template applied.`;
    }

    showToast(successMessage, 'success');

    // Close modal and redirect
    setTimeout(() => {
      closeModal();
      if (result.data && result.data.id) {
        window.location.href = `/lowcode/applications/${result.data.id}`;
      } else {
        loadApplications();
      }
    }, 1500);

  } catch (error) {
    showToast('Failed to create application: ' + error.message, 'error');

    // Restore button
    const submitBtn = document.getElementById('wizardNextBtn');
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fas fa-rocket"></i> Create Application';
  }
}

/**
 * Reset wizard state
 */
function resetWizard() {
  AppState.wizard = {
    currentStep: 1,
    totalSteps: 9,
    completedSteps: new Set(),
    formData: {}
  };
  updateWizardUI();
}

/**
 * Update wizard UI when opening modal
 */
function updateWizardUIOnOpen() {
  // Set all panels to inactive
  const panels = document.querySelectorAll('.wizard-step-panel');
  panels.forEach(p => p.classList.remove('active'));

  // Activate first panel
  const firstPanel = document.querySelector('[data-step-panel="1"]');
  if (firstPanel) firstPanel.classList.add('active');

  // Reset sidebar steps
  const steps = document.querySelectorAll('.wizard-step');
  steps.forEach(step => {
    step.classList.remove('active', 'completed');
    if (step.dataset.step === '1') {
      step.classList.add('active');
    }
  });

  // Reset progress bar
  const progressBar = document.getElementById('wizardProgress');
  const progressText = document.getElementById('wizardProgressText');
  const progressPercent = document.getElementById('wizardProgressPercent');

  if (progressBar) progressBar.style.width = '11%';
  if (progressText) progressText.textContent = 'Step 1 of 9';
  if (progressPercent) progressPercent.textContent = '11%';

  // Reset buttons
  const prevBtn = document.getElementById('wizardPrevBtn');
  const nextBtn = document.getElementById('wizardNextBtn');

  if (prevBtn) prevBtn.style.display = 'none';
  if (nextBtn) {
    nextBtn.innerHTML = 'Next <i class="fas fa-arrow-right"></i>';
    nextBtn.className = 'btn btn-primary';
    nextBtn.disabled = false;
  }
}

// ============================================================================
// THEME & UI HELPERS
// ============================================================================

/**
 * Toggle theme (light/dark)
 */
function toggleTheme() {
  const html = document.documentElement;
  const currentTheme = html.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

  html.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
}

/**
 * Load theme from localStorage
 */
function loadTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
}

/**
 * Switch view (grid/list)
 */
function switchView(view) {
  AppState.currentView = view;

  // Update toggle buttons
  document.querySelectorAll('.view-toggle').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  filterAndDisplayApplications();
}

/**
 * Show toast notification
 */
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = {
    success: 'fa-check-circle',
    error: 'fa-exclamation-circle',
    warning: 'fa-exclamation-triangle'
  };

  toast.innerHTML = `
    <i class="fas ${icons[type]} toast-icon"></i>
    <span class="toast-message">${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 4000);
}

/**
 * Get icon for application
 */
function getAppIcon(app) {
  const icons = {
    draft: 'fa-file-alt',
    development: 'fa-code',
    published: 'fa-globe'
  };
  return icons[app.status] || 'fa-cubes';
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  // Load theme
  loadTheme();

  // Load applications
  loadApplications();

  // Theme toggle
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }

  // New application buttons
  const newAppBtn = document.getElementById('newAppBtn');
  if (newAppBtn) {
    newAppBtn.addEventListener('click', openNewApplicationModal);
  }

  const emptyCreateBtn = document.getElementById('emptyCreateBtn');
  if (emptyCreateBtn) {
    emptyCreateBtn.addEventListener('click', openNewApplicationModal);
  }

  // Modal buttons (wizard uses wizardNextBtn, wizardPrevBtn, cancelBtn)
  const cancelBtn = document.getElementById('cancelBtn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeModal);
  }

  // Close modal on outside click
  const appModal = document.getElementById('appModal');
  if (appModal) {
    appModal.addEventListener('click', (e) => {
      if (e.target.id === 'appModal') {
        closeModal();
      }
    });
  }

  // Search input
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      AppState.searchQuery = e.target.value;
      filterAndDisplayApplications();
    });
  }

  // Status filter
  const statusFilter = document.getElementById('statusFilter');
  if (statusFilter) {
    statusFilter.addEventListener('change', (e) => {
      AppState.statusFilter = e.target.value;
      filterAndDisplayApplications();
    });
  }

  // Sort by
  const sortBy = document.getElementById('sortBy');
  if (sortBy) {
    sortBy.addEventListener('change', (e) => {
      AppState.sortBy = e.target.value;
      loadApplications();
    });
  }

  // View toggles
  document.querySelectorAll('.view-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      switchView(btn.dataset.view);
    });
  });

  // ============================================================================
  // MODAL INTERACTION HANDLERS
  // ============================================================================

  // App type card selection
  document.querySelectorAll('.app-type-card').forEach(card => {
    card.addEventListener('click', function() {
      // Remove active class from all cards
      document.querySelectorAll('.app-type-card').forEach(c => c.classList.remove('active'));

      // Add active class to clicked card
      this.classList.add('active');

      // Get selected type
      const type = this.dataset.type;

      // Show/hide relevant sections
      const templateSection = document.getElementById('templateSection');
      const gitSection = document.getElementById('gitSection');

      templateSection.style.display = type === 'template' ? 'block' : 'none';
      gitSection.style.display = type === 'git' ? 'block' : 'none';
    });
  });

  // Git authentication toggle
  const gitAuthCheckbox = document.getElementById('gitAuthentication');
  if (gitAuthCheckbox) {
    gitAuthCheckbox.addEventListener('change', function() {
      const gitAuthSection = document.getElementById('gitAuthSection');
      gitAuthSection.style.display = this.checked ? 'block' : 'none';
    });
  }

  // Git initialization toggle
  const initGitCheckbox = document.getElementById('initGitRepo');
  if (initGitCheckbox) {
    initGitCheckbox.addEventListener('change', function() {
      const gitOptions = document.getElementById('gitOptions');
      gitOptions.style.display = this.checked ? 'block' : 'none';
    });
  }

  // Auto-fill application name from display name
  const appDisplayNameInput = document.getElementById('appDisplayName');
  const appNameInput = document.getElementById('appName');

  if (appDisplayNameInput && appNameInput) {
    appDisplayNameInput.addEventListener('input', function() {
      // Only auto-fill if app name is empty
      if (!appNameInput.value || appNameInput.dataset.autoFilled === 'true') {
        // Convert display name to valid app name
        const generatedName = this.value
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/^-+|-+$/g, '')
          .substring(0, 50);

        if (generatedName) {
          appNameInput.value = generatedName;
          appNameInput.dataset.autoFilled = 'true';
        }
      }
    });

    appNameInput.addEventListener('input', function() {
      // Mark as manually edited
      if (this.value) {
        this.dataset.autoFilled = 'false';
      }
    });
  }

  // ============================================================================
  // WIZARD EVENT LISTENERS
  // ============================================================================

  // Previous button
  const wizardPrevBtn = document.getElementById('wizardPrevBtn');
  if (wizardPrevBtn) {
    wizardPrevBtn.addEventListener('click', previousStep);
  }

  // Next/Submit button
  const wizardNextBtn = document.getElementById('wizardNextBtn');
  if (wizardNextBtn) {
    wizardNextBtn.addEventListener('click', nextStep);
  }

  // Sidebar step navigation
  document.querySelectorAll('.wizard-step').forEach(step => {
    step.addEventListener('click', function() {
      const targetStep = parseInt(this.dataset.step);
      // Only allow navigation to current step or earlier (no skipping ahead)
      if (targetStep <= AppState.wizard.currentStep || AppState.wizard.completedSteps.has(targetStep - 1)) {
        goToStep(targetStep);
      }
    });
  });

  // Template card selection
  document.querySelectorAll('.template-card').forEach(card => {
    card.addEventListener('click', function() {
      document.querySelectorAll('.template-card').forEach(c => c.classList.remove('active'));
      this.classList.add('active');
    });
  });

  // Skip buttons for optional steps
  document.querySelectorAll('.skip-step-btn').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      nextStep();
    });
  });

  // Add Role button (Step 2)
  const addRoleBtn = document.getElementById('addRoleBtn');
  if (addRoleBtn) {
    addRoleBtn.addEventListener('click', function() {
      const roleName = document.getElementById('newRoleName')?.value;
      const rolePermissions = document.getElementById('newRolePermissions')?.value;

      if (roleName && rolePermissions) {
        const rolesList = document.getElementById('rolesList');
        const roleItem = document.createElement('div');
        roleItem.className = 'role-item';
        roleItem.innerHTML = `
          <div>
            <div class="role-name">${escapeHtml(roleName)}</div>
            <div class="role-permissions">${escapeHtml(rolePermissions)}</div>
          </div>
          <button class="btn-icon" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
          </button>
        `;
        rolesList.appendChild(roleItem);

        // Clear inputs
        document.getElementById('newRoleName').value = '';
        document.getElementById('newRolePermissions').value = '';
      }
    });
  }

  // Add Variable button (Step 9)
  const addVariableBtn = document.getElementById('addVariableBtn');
  if (addVariableBtn) {
    addVariableBtn.addEventListener('click', function() {
      const varName = document.getElementById('newVariableName')?.value;
      const varValue = document.getElementById('newVariableValue')?.value;

      if (varName && varValue) {
        const variablesList = document.getElementById('variablesList');
        const variableItem = document.createElement('div');
        variableItem.className = 'variable-item';
        variableItem.innerHTML = `
          <div>
            <div class="variable-name">${escapeHtml(varName)}</div>
            <div class="variable-value">${escapeHtml(varValue)}</div>
          </div>
          <button class="btn-icon" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
          </button>
        `;
        variablesList.appendChild(variableItem);

        // Clear inputs
        document.getElementById('newVariableName').value = '';
        document.getElementById('newVariableValue').value = '';
      }
    });
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + N: New application
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      openNewApplicationModal();
    }

    // Escape: Close modal
    if (e.key === 'Escape') {
      closeModal();
    }

    // Arrow keys for wizard navigation (when modal is open)
    const modalActive = document.getElementById('appModal')?.classList.contains('active');
    if (modalActive) {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextStep();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        previousStep();
      }
    }
  });
});
