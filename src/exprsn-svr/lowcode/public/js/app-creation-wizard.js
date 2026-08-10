/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Low-Code Platform - Application Creation Wizard
 * Multi-step wizard for creating applications with comprehensive configuration
 * ═══════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════
// STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════

const WizardState = {
  currentStep: 1,
  totalSteps: 7,
  formData: {
    // Step 1: Template
    template: 'blank',
    cloneSourceId: null,
    cloneOptions: {
      entities: true,
      forms: true,
      data: false,
      workflows: false,
      permissions: false
    },

    // Step 2: Basic Settings
    name: '',
    displayName: '',
    description: '',
    version: '1.0.0',
    status: 'draft',
    icon: 'fa-rocket',
    color: '#0078D4',

    // Step 3: Git
    gitEnabled: false,
    gitRepository: '',
    gitBranch: 'main',
    gitStrategy: 'gitflow',
    autoCommit: true,
    enableCiCd: false,

    // Step 4: Access Control
    visibility: 'private',
    roles: ['admin', 'editor', 'viewer'],
    userGroups: [],

    // Step 5: Theme
    theme: 'exprsn-default',

    // Step 6: Data
    dataSources: [],
    queries: []
  },
  availableApps: [],
  availableDataSources: [],
  availableQueries: []
};

// ═══════════════════════════════════════════════════════════════════════
// API CLIENT
// ═══════════════════════════════════════════════════════════════════════

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

  async getApplications() {
    return this.request('/applications?limit=100&sortBy=created_at&sortOrder=DESC');
  },

  async getApplication(id) {
    return this.request(`/applications/${id}?includeEntities=true&includeForms=true&includeDataSources=true`);
  },

  async createApplication(data) {
    return this.request('/applications', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async cloneApplication(sourceId, options) {
    return this.request(`/applications/${sourceId}/clone`, {
      method: 'POST',
      body: JSON.stringify(options)
    });
  },

  async getDataSources(appId) {
    return this.request(`/datasources?applicationId=${appId}`);
  },

  async getQueries(appId) {
    return this.request(`/queries?applicationId=${appId}`);
  }
};

// ═══════════════════════════════════════════════════════════════════════
// WIZARD NAVIGATION
// ═══════════════════════════════════════════════════════════════════════

function nextStep() {
  if (!validateCurrentStep()) {
    return;
  }

  if (WizardState.currentStep < WizardState.totalSteps) {
    WizardState.currentStep++;
    updateWizardDisplay();
  }
}

function previousStep() {
  if (WizardState.currentStep > 1) {
    WizardState.currentStep--;
    updateWizardDisplay();
  }
}

function goToStep(stepNumber) {
  if (stepNumber >= 1 && stepNumber <= WizardState.totalSteps) {
    WizardState.currentStep = stepNumber;
    updateWizardDisplay();
  }
}

function updateWizardDisplay() {
  const steps = document.querySelectorAll('.wizard-step');
  const progressSteps = document.querySelectorAll('.progress-step');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const createBtn = document.getElementById('createBtn');

  // Update step display
  steps.forEach((step, index) => {
    step.classList.toggle('active', index + 1 === WizardState.currentStep);
  });

  // Update progress bar
  progressSteps.forEach((step, index) => {
    const stepNum = index + 1;
    step.classList.toggle('active', stepNum === WizardState.currentStep);
    step.classList.toggle('completed', stepNum < WizardState.currentStep);
  });

  // Update buttons
  prevBtn.style.display = WizardState.currentStep > 1 ? 'flex' : 'none';

  if (WizardState.currentStep === WizardState.totalSteps) {
    nextBtn.style.display = 'none';
    createBtn.style.display = 'flex';
    updateSummary();
  } else {
    nextBtn.style.display = 'flex';
    createBtn.style.display = 'none';
  }

  // Scroll to top of wizard body
  document.querySelector('.wizard-body').scrollTop = 0;
}

function validateCurrentStep() {
  switch (WizardState.currentStep) {
    case 1:
      return validateStep1();
    case 2:
      return validateStep2();
    case 3:
      return validateStep3();
    case 4:
      return validateStep4();
    case 5:
      return validateStep5();
    case 6:
      return validateStep6();
    default:
      return true;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// STEP VALIDATION
// ═══════════════════════════════════════════════════════════════════════

function validateStep1() {
  // Template selection is always valid
  if (WizardState.formData.template === 'clone' && !WizardState.formData.cloneSourceId) {
    showToast('Please select an application to clone', 'error');
    return false;
  }
  return true;
}

function validateStep2() {
  const name = document.getElementById('appName').value.trim();
  const displayName = document.getElementById('appDisplayName').value.trim();
  const version = document.getElementById('appVersion').value.trim();

  if (!name) {
    showToast('Application name is required', 'error');
    return false;
  }

  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)) {
    showToast('Application name must start with a letter and contain only letters, numbers, hyphens, and underscores', 'error');
    return false;
  }

  if (!displayName) {
    showToast('Display name is required', 'error');
    return false;
  }

  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    showToast('Version must be in MAJOR.MINOR.PATCH format (e.g., 1.0.0)', 'error');
    return false;
  }

  // Save values
  WizardState.formData.name = name;
  WizardState.formData.displayName = displayName;
  WizardState.formData.description = document.getElementById('appDescription').value.trim();
  WizardState.formData.version = version;
  WizardState.formData.status = document.getElementById('appStatus').value;
  WizardState.formData.icon = document.getElementById('appIcon').value.trim() || 'fa-rocket';
  WizardState.formData.color = document.getElementById('appColor').value;

  return true;
}

function validateStep3() {
  if (WizardState.formData.gitEnabled) {
    const repo = document.getElementById('gitRepository').value.trim();
    if (!repo) {
      showToast('Git repository URL is required when Git integration is enabled', 'error');
      return false;
    }

    try {
      new URL(repo);
    } catch (e) {
      showToast('Please enter a valid repository URL', 'error');
      return false;
    }

    WizardState.formData.gitRepository = repo;
    WizardState.formData.gitBranch = document.getElementById('gitBranch').value.trim();
    WizardState.formData.gitStrategy = document.getElementById('gitStrategy').value;
  }

  return true;
}

function validateStep4() {
  WizardState.formData.visibility = document.getElementById('appVisibility').value;

  // Get selected user groups
  const select = document.getElementById('userGroups');
  WizardState.formData.userGroups = Array.from(select.selectedOptions).map(opt => opt.value);

  return true;
}

function validateStep5() {
  // Theme is always valid (has default)
  return true;
}

function validateStep6() {
  // Data sources are optional
  return true;
}

// ═══════════════════════════════════════════════════════════════════════
// STEP 1: TEMPLATE SELECTION
// ═══════════════════════════════════════════════════════════════════════

function initializeStep1() {
  const templateCards = document.querySelectorAll('.template-card');
  const cloneOptions = document.getElementById('cloneOptions');

  templateCards.forEach(card => {
    card.addEventListener('click', () => {
      // Deselect all
      templateCards.forEach(c => {
        c.classList.remove('selected');
        const icon = c.querySelector('.selection-indicator i');
        if (icon) icon.style.display = 'none';
      });

      // Select this one
      card.classList.add('selected');
      const icon = card.querySelector('.selection-indicator i');
      if (icon) icon.style.display = 'block';

      const template = card.dataset.template;
      WizardState.formData.template = template;

      // Show clone options if clone template selected
      if (template === 'clone') {
        cloneOptions.style.display = 'block';
        loadApplicationsForCloning();
      } else {
        cloneOptions.style.display = 'none';
      }
    });
  });

  // Clone option toggles
  document.querySelectorAll('#cloneOptions .option-item').forEach(item => {
    item.addEventListener('click', () => {
      item.classList.toggle('selected');
      const option = item.dataset.option;
      WizardState.formData.cloneOptions[option] = item.classList.contains('selected');
    });
  });

  // Clone source selection
  const cloneSourceSelect = document.getElementById('cloneSource');
  cloneSourceSelect.addEventListener('change', (e) => {
    WizardState.formData.cloneSourceId = e.target.value;
  });
}

async function loadApplicationsForCloning() {
  try {
    const response = await API.getApplications();
    const apps = response.data.applications || [];
    WizardState.availableApps = apps;

    const select = document.getElementById('cloneSource');
    select.innerHTML = '<option value="">Select an application...</option>';

    apps.forEach(app => {
      const option = document.createElement('option');
      option.value = app.id;
      option.textContent = `${app.displayName} (v${app.version})`;
      select.appendChild(option);
    });
  } catch (error) {
    console.error('Failed to load applications:', error);
    showToast('Failed to load applications for cloning', 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// STEP 2: BASIC SETTINGS
// ═══════════════════════════════════════════════════════════════════════

function initializeStep2() {
  // Auto-generate app name from display name
  const displayNameInput = document.getElementById('appDisplayName');
  const nameInput = document.getElementById('appName');

  displayNameInput.addEventListener('input', (e) => {
    if (!nameInput.value || nameInput.dataset.autoGenerated === 'true') {
      const generated = e.target.value
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/^[^a-z]+/, ''); // Ensure starts with letter

      nameInput.value = generated;
      nameInput.dataset.autoGenerated = 'true';
    }
  });

  nameInput.addEventListener('input', () => {
    nameInput.dataset.autoGenerated = 'false';
  });

  // Color presets
  document.querySelectorAll('.color-preset').forEach(preset => {
    preset.addEventListener('click', () => {
      document.querySelectorAll('.color-preset').forEach(p => p.classList.remove('selected'));
      preset.classList.add('selected');

      const color = preset.dataset.color;
      document.getElementById('appColor').value = color;
    });
  });

  // Sync color input with presets
  document.getElementById('appColor').addEventListener('input', (e) => {
    const color = e.target.value.toUpperCase();

    // Check if it matches a preset
    const matchingPreset = document.querySelector(`.color-preset[data-color="${color}"]`);
    document.querySelectorAll('.color-preset').forEach(p => p.classList.remove('selected'));
    if (matchingPreset) {
      matchingPreset.classList.add('selected');
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════
// STEP 3: GIT INTEGRATION
// ═══════════════════════════════════════════════════════════════════════

function initializeStep3() {
  const enableGitToggle = document.getElementById('enableGitToggle');
  const gitOptions = document.getElementById('gitOptions');

  enableGitToggle.addEventListener('click', () => {
    enableGitToggle.classList.toggle('selected');
    const enabled = enableGitToggle.classList.contains('selected');
    WizardState.formData.gitEnabled = enabled;
    gitOptions.style.display = enabled ? 'block' : 'none';
  });

  // Auto-commit toggle
  const autoCommitOption = document.querySelector('[data-option="autoCommit"]');
  if (autoCommitOption) {
    autoCommitOption.addEventListener('click', () => {
      autoCommitOption.classList.toggle('selected');
      WizardState.formData.autoCommit = autoCommitOption.classList.contains('selected');
    });
  }

  // CI/CD toggle
  const ciCdOption = document.querySelector('[data-option="enableCiCd"]');
  if (ciCdOption) {
    ciCdOption.addEventListener('click', () => {
      ciCdOption.classList.toggle('selected');
      WizardState.formData.enableCiCd = ciCdOption.classList.contains('selected');
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════
// STEP 4: ACCESS CONTROL
// ═══════════════════════════════════════════════════════════════════════

function initializeStep4() {
  // Role toggles
  document.querySelectorAll('[data-role]').forEach(item => {
    item.addEventListener('click', () => {
      item.classList.toggle('selected');
      updateSelectedRoles();
    });
  });
}

function updateSelectedRoles() {
  const roles = [];
  document.querySelectorAll('[data-role].selected').forEach(item => {
    roles.push(item.dataset.role);
  });
  WizardState.formData.roles = roles;
}

// ═══════════════════════════════════════════════════════════════════════
// STEP 5: THEME SELECTION
// ═══════════════════════════════════════════════════════════════════════

function initializeStep5() {
  const themeCards = document.querySelectorAll('[data-theme]');

  themeCards.forEach(card => {
    card.addEventListener('click', () => {
      // Deselect all
      themeCards.forEach(c => {
        c.classList.remove('selected');
        const icon = c.querySelector('.selection-indicator i');
        if (icon) icon.style.display = 'none';
      });

      // Select this one
      card.classList.add('selected');
      const icon = card.querySelector('.selection-indicator i');
      if (icon) icon.style.display = 'block';

      WizardState.formData.theme = card.dataset.theme;
    });
  });

  // Select default theme
  const defaultTheme = document.querySelector('[data-theme="exprsn-default"]');
  if (defaultTheme) {
    defaultTheme.click();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// STEP 6: DATA SOURCES
// ═══════════════════════════════════════════════════════════════════════

function initializeStep6() {
  loadDataSources();
  loadQueries();
}

async function loadDataSources() {
  const container = document.getElementById('datasourceList');

  try {
    // Load all data sources from all applications
    const response = await API.getDataSources('');
    const dataSources = response.data.dataSources || [];
    WizardState.availableDataSources = dataSources;

    if (dataSources.length === 0) {
      // Empty state already shown in HTML
      return;
    }

    container.innerHTML = '';
    dataSources.forEach(ds => {
      const item = createDataSourceItem(ds);
      container.appendChild(item);
    });
  } catch (error) {
    console.error('Failed to load data sources:', error);
  }
}

function createDataSourceItem(dataSource) {
  const div = document.createElement('div');
  div.className = 'datasource-item';
  div.dataset.datasourceId = dataSource.id;

  const iconColors = {
    postgresql: '#336791',
    rest: '#61DAFB',
    redis: '#DC382D',
    json: '#FFA500',
    forge: '#0078D4'
  };

  const iconColor = iconColors[dataSource.sourceType] || '#667eea';

  div.innerHTML = `
    <div class="checkbox-custom">
      <i class="fas fa-check"></i>
    </div>
    <div class="datasource-icon" style="background: ${iconColor}; color: white;">
      <i class="fas ${dataSource.icon || 'fa-database'}"></i>
    </div>
    <div class="datasource-info">
      <div class="datasource-name">${escapeHtml(dataSource.displayName)}</div>
      <div class="datasource-type">${dataSource.sourceType.toUpperCase()}</div>
    </div>
  `;

  div.addEventListener('click', () => {
    div.classList.toggle('selected');
    updateSelectedDataSources();
  });

  return div;
}

function updateSelectedDataSources() {
  const selected = [];
  document.querySelectorAll('#datasourceList .datasource-item.selected').forEach(item => {
    selected.push(item.dataset.datasourceId);
  });
  WizardState.formData.dataSources = selected;
}

async function loadQueries() {
  const container = document.getElementById('queryList');

  try {
    // Load all queries from all applications
    const response = await API.getQueries('');
    const queries = response.data.queries || [];
    WizardState.availableQueries = queries;

    if (queries.length === 0) {
      // Empty state already shown in HTML
      return;
    }

    container.innerHTML = '';
    queries.forEach(query => {
      const item = createQueryItem(query);
      container.appendChild(item);
    });
  } catch (error) {
    console.error('Failed to load queries:', error);
  }
}

function createQueryItem(query) {
  const div = document.createElement('div');
  div.className = 'datasource-item';
  div.dataset.queryId = query.id;

  div.innerHTML = `
    <div class="checkbox-custom">
      <i class="fas fa-check"></i>
    </div>
    <div class="datasource-icon" style="background: #8B5CF6; color: white;">
      <i class="fas fa-search"></i>
    </div>
    <div class="datasource-info">
      <div class="datasource-name">${escapeHtml(query.name)}</div>
      <div class="datasource-type">QUERY</div>
    </div>
  `;

  div.addEventListener('click', () => {
    div.classList.toggle('selected');
    updateSelectedQueries();
  });

  return div;
}

function updateSelectedQueries() {
  const selected = [];
  document.querySelectorAll('#queryList .datasource-item.selected').forEach(item => {
    selected.push(item.dataset.queryId);
  });
  WizardState.formData.queries = selected;
}

// ═══════════════════════════════════════════════════════════════════════
// STEP 7: SUMMARY
// ═══════════════════════════════════════════════════════════════════════

function updateSummary() {
  const data = WizardState.formData;

  // Basic Information
  document.getElementById('summaryTemplate').textContent = getTemplateName(data.template);
  document.getElementById('summaryName').textContent = data.name || '-';
  document.getElementById('summaryDisplayName').textContent = data.displayName || '-';
  document.getElementById('summaryVersion').textContent = data.version;
  document.getElementById('summaryStatus').textContent = data.status.charAt(0).toUpperCase() + data.status.slice(1);

  // Git Integration
  document.getElementById('summaryGitEnabled').textContent = data.gitEnabled ? 'Yes' : 'No';

  if (data.gitEnabled) {
    document.getElementById('summaryGitRepoItem').style.display = 'flex';
    document.getElementById('summaryGitBranchItem').style.display = 'flex';
    document.getElementById('summaryGitRepo').textContent = data.gitRepository || '-';
    document.getElementById('summaryGitBranch').textContent = data.gitBranch;
  } else {
    document.getElementById('summaryGitRepoItem').style.display = 'none';
    document.getElementById('summaryGitBranchItem').style.display = 'none';
  }

  // Access & Security
  document.getElementById('summaryVisibility').textContent =
    data.visibility.charAt(0).toUpperCase() + data.visibility.slice(1);
  document.getElementById('summaryRoles').textContent =
    data.roles.length > 0 ? data.roles.join(', ') : 'None';
  document.getElementById('summaryGroups').textContent =
    data.userGroups.length > 0 ? data.userGroups.join(', ') : 'None';

  // Customization
  document.getElementById('summaryTheme').textContent = getThemeName(data.theme);
  document.getElementById('summaryDataSources').textContent =
    `${data.dataSources.length} selected`;
  document.getElementById('summaryQueries').textContent =
    `${data.queries.length} selected`;
}

function getTemplateName(template) {
  const names = {
    blank: 'Blank Application',
    crm: 'CRM Template',
    inventory: 'Inventory Manager',
    project: 'Project Management',
    clone: 'Cloned Application'
  };
  return names[template] || template;
}

function getThemeName(theme) {
  const names = {
    'exprsn-default': 'Exprsn Default',
    'material': 'Material Design',
    'nord': 'Nord',
    'dracula': 'Dracula',
    'high-contrast': 'High Contrast',
    'custom': 'Custom Theme'
  };
  return names[theme] || theme;
}

// ═══════════════════════════════════════════════════════════════════════
// APPLICATION CREATION
// ═══════════════════════════════════════════════════════════════════════

async function createApplication() {
  const createBtn = document.getElementById('createBtn');
  createBtn.disabled = true;
  createBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';

  try {
    let result;

    if (WizardState.formData.template === 'clone' && WizardState.formData.cloneSourceId) {
      // Clone existing application
      result = await cloneApplication();
    } else {
      // Create new application
      result = await createNewApplication();
    }

    showToast('Application created successfully!', 'success');

    // Redirect to the new application
    setTimeout(() => {
      window.location.href = `/lowcode/designer?appId=${result.data.id}`;
    }, 1500);

  } catch (error) {
    console.error('Failed to create application:', error);
    showToast('Failed to create application: ' + error.message, 'error');
    createBtn.disabled = false;
    createBtn.innerHTML = '<i class="fas fa-rocket"></i> Create Application';
  }
}

async function createNewApplication() {
  const payload = {
    name: WizardState.formData.name,
    displayName: WizardState.formData.displayName,
    description: WizardState.formData.description,
    version: WizardState.formData.version,
    color: WizardState.formData.color,
    icon: WizardState.formData.icon,
    status: WizardState.formData.status,
    settings: {
      template: WizardState.formData.template,
      theme: {
        name: WizardState.formData.theme
      },
      git: WizardState.formData.gitEnabled ? {
        enabled: true,
        autoCommit: WizardState.formData.autoCommit,
        strategy: WizardState.formData.gitStrategy
      } : { enabled: false },
      security: {
        visibility: WizardState.formData.visibility,
        initialRoles: WizardState.formData.roles,
        userGroups: WizardState.formData.userGroups
      },
      cicd: {
        enabled: WizardState.formData.enableCiCd
      }
    },
    metadata: {
      createdViaWizard: true,
      wizardVersion: '1.0.0',
      selectedDataSources: WizardState.formData.dataSources,
      selectedQueries: WizardState.formData.queries
    }
  };

  if (WizardState.formData.gitEnabled) {
    payload.gitRepository = WizardState.formData.gitRepository;
    payload.gitBranch = WizardState.formData.gitBranch;
  }

  return await API.createApplication(payload);
}

async function cloneApplication() {
  const sourceId = WizardState.formData.cloneSourceId;

  const payload = {
    name: WizardState.formData.name,
    displayName: WizardState.formData.displayName,
    description: WizardState.formData.description,
    version: WizardState.formData.version,
    cloneOptions: WizardState.formData.cloneOptions,
    overrides: {
      color: WizardState.formData.color,
      icon: WizardState.formData.icon,
      status: WizardState.formData.status,
      settings: {
        theme: {
          name: WizardState.formData.theme
        },
        git: WizardState.formData.gitEnabled ? {
          enabled: true,
          autoCommit: WizardState.formData.autoCommit,
          strategy: WizardState.formData.gitStrategy
        } : { enabled: false }
      }
    }
  };

  if (WizardState.formData.gitEnabled) {
    payload.overrides.gitRepository = WizardState.formData.gitRepository;
    payload.overrides.gitBranch = WizardState.formData.gitBranch;
  }

  return await API.cloneApplication(sourceId, payload);
}

// ═══════════════════════════════════════════════════════════════════════
// UI HELPERS
// ═══════════════════════════════════════════════════════════════════════

function showToast(message, type = 'success') {
  // Create toast container if it doesn't exist
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10001;
      display: flex;
      flex-direction: column;
      gap: 10px;
    `;
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.style.cssText = `
    background: ${type === 'error' ? '#DC2626' : '#059669'};
    color: white;
    padding: 1rem 1.5rem;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 300px;
    animation: slideIn 0.3s ease;
  `;

  const icons = {
    success: 'fa-check-circle',
    error: 'fa-exclamation-circle',
    warning: 'fa-exclamation-triangle'
  };

  toast.innerHTML = `
    <i class="fas ${icons[type]}"></i>
    <span>${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function cancelWizard() {
  if (confirm('Are you sure you want to cancel? All progress will be lost.')) {
    window.location.href = '/lowcode/applications';
  }
}

// ═══════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  // Initialize all steps
  initializeStep1();
  initializeStep2();
  initializeStep3();
  initializeStep4();
  initializeStep5();
  initializeStep6();

  // Navigation buttons
  document.getElementById('nextBtn').addEventListener('click', nextStep);
  document.getElementById('prevBtn').addEventListener('click', previousStep);
  document.getElementById('createBtn').addEventListener('click', createApplication);
  document.getElementById('cancelBtn').addEventListener('click', cancelWizard);

  // Allow clicking on progress steps to navigate (only to completed steps)
  document.querySelectorAll('.progress-step').forEach((step, index) => {
    step.addEventListener('click', () => {
      const stepNumber = index + 1;
      if (stepNumber < WizardState.currentStep) {
        goToStep(stepNumber);
      }
    });
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Escape: Cancel
    if (e.key === 'Escape') {
      cancelWizard();
    }

    // Enter: Next/Create (if not in textarea)
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      if (WizardState.currentStep === WizardState.totalSteps) {
        createApplication();
      } else {
        nextStep();
      }
    }
  });

  // Add CSS animations
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }

    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(100%);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);

  console.log('✅ Application Creation Wizard initialized');
});
