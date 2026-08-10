/**
 * ═══════════════════════════════════════════════════════════
 * Exprsn Low-Code Platform - Application Runner
 * Executes low-code applications in the browser
 * ═══════════════════════════════════════════════════════════
 */

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const AppRuntime = {
  appId: window.APP_ID,
  formId: window.INITIAL_FORM_ID,
  gridId: null,
  application: null,
  currentForm: null,
  currentGrid: null,
  formData: {},
  navigation: [],
  isLoading: false,
  formEngines: new Map(), // Store form runtime engines
  gridEngines: new Map(), // Store grid runtime engines
};

// ============================================================================
// API CLIENT
// ============================================================================

const RuntimeAPI = {
  baseUrl: `/lowcode/api/runtime/${AppRuntime.appId}`,

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
      console.error('Runtime API Error:', error);
      throw error;
    }
  },

  async loadApplication() {
    return this.request('');
  },

  async loadForm(formId) {
    return this.request(`/forms/${formId}`);
  },

  async loadGrid(gridId) {
    return this.request(`/grids/${gridId}`);
  },

  async executeDataQuery(dataSourceId, query) {
    return this.request(`/data/${dataSourceId}`, {
      method: 'POST',
      body: JSON.stringify(query)
    });
  },

  async getNavigation() {
    return this.request('/navigation');
  },

  async recordAnalytics(event) {
    return this.request('/analytics', {
      method: 'POST',
      body: JSON.stringify(event)
    });
  }
};

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the application runtime
 */
async function initializeApp() {
  try {
    showLoading('Loading application...');

    // Load application metadata
    const appData = await RuntimeAPI.loadApplication();
    AppRuntime.application = appData.data;

    // Update UI with app info
    document.getElementById('appTitle').textContent = AppRuntime.application.displayName;
    document.title = `${AppRuntime.application.displayName} - Exprsn`;

    // Load navigation
    const navData = await RuntimeAPI.getNavigation();
    AppRuntime.navigation = navData.data;
    renderNavigation();

    // Determine which form to load
    const formToLoad = AppRuntime.formId || AppRuntime.application.startFormId;

    if (formToLoad) {
      await loadForm(formToLoad);
    } else if (AppRuntime.navigation.length > 0) {
      // Load first form in navigation
      await loadForm(AppRuntime.navigation[0].id);
    } else {
      showError('No forms available', 'This application has no forms to display.');
    }

    // Record analytics
    RuntimeAPI.recordAnalytics({
      event: 'app_launched',
      appId: AppRuntime.appId,
      timestamp: new Date().toISOString()
    }).catch(err => console.warn('Analytics failed:', err));

  } catch (error) {
    console.error('Failed to initialize app:', error);
    showError('Failed to Load Application', error.message);
  }
}

// ============================================================================
// NAVIGATION
// ============================================================================

/**
 * Render navigation menu
 */
function renderNavigation() {
  const nav = document.getElementById('sidebarNav');
  nav.innerHTML = '';

  AppRuntime.navigation.forEach(item => {
    const navItem = document.createElement('a');
    navItem.className = 'nav-item';
    navItem.href = `#`;
    navItem.onclick = (e) => {
      e.preventDefault();
      loadForm(item.id);
    };

    if (item.id === AppRuntime.formId) {
      navItem.classList.add('active');
    }

    navItem.innerHTML = `
      <i class="fas ${item.icon || 'fa-file'}"></i>
      <span>${escapeHtml(item.label)}</span>
    `;

    nav.appendChild(navItem);
  });
}

/**
 * Update active navigation item
 */
function updateActiveNav(formId) {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });

  const activeItem = Array.from(document.querySelectorAll('.nav-item'))
    .find(item => item.onclick.toString().includes(formId));

  if (activeItem) {
    activeItem.classList.add('active');
  }
}

/**
 * Toggle sidebar (mobile)
 */
function toggleSidebar() {
  document.getElementById('appSidebar').classList.toggle('show');
}

// ============================================================================
// FORM LOADING & RENDERING
// ============================================================================

/**
 * Load and render a form
 */
async function loadForm(formId) {
  try {
    showLoading('Loading form...');

    // Clean up previous form engine
    if (AppRuntime.formEngines.has(AppRuntime.formId)) {
      const engine = AppRuntime.formEngines.get(AppRuntime.formId);
      if (engine && typeof engine.destroy === 'function') {
        engine.destroy();
      }
      AppRuntime.formEngines.delete(AppRuntime.formId);
    }

    // Load form data
    const formData = await RuntimeAPI.loadForm(formId);
    AppRuntime.currentForm = formData.data;
    AppRuntime.formId = formId;

    // Update URL without reload
    const newUrl = `/lowcode/apps/${AppRuntime.appId}/forms/${formId}`;
    window.history.pushState({ formId }, '', newUrl);

    // Update navigation
    updateActiveNav(formId);

    // Render form
    renderForm(AppRuntime.currentForm);

    // Record analytics
    RuntimeAPI.recordAnalytics({
      event: 'form_viewed',
      formId,
      timestamp: new Date().toISOString()
    }).catch(err => console.warn('Analytics failed:', err));

  } catch (error) {
    console.error('Failed to load form:', error);
    showError('Failed to Load Form', error.message);
  }
}

/**
 * Render form in the content area
 */
function renderForm(form) {
  const content = document.getElementById('appContent');

  // Build form HTML
  let formHtml = `
    <div class="content-wrapper">
      <div class="form-container">
        <h1 class="form-title">${escapeHtml(form.displayName)}</h1>
        ${form.schema.description ? `<p class="form-description">${escapeHtml(form.schema.description)}</p>` : ''}

        <form id="runtimeForm" onsubmit="handleFormSubmit(event)">
  `;

  // Render form fields
  if (form.schema.components && Array.isArray(form.schema.components)) {
    form.schema.components.forEach(component => {
      formHtml += renderComponent(component);
    });
  }

  // Add form actions
  formHtml += `
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" onclick="resetForm()">
              <i class="fas fa-undo"></i>
              Reset
            </button>
            <button type="submit" class="btn btn-primary">
              <i class="fas fa-save"></i>
              Submit
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  content.innerHTML = formHtml;

  // Initialize form runtime engine if needed
  // TODO: Integrate with FormRuntimeEngine from backend
  initializeFormEngine(form);
}

/**
 * Render a single form component
 */
function renderComponent(component) {
  if (!component || !component.type) return '';

  const id = component.id || `field_${Date.now()}`;
  const label = component.label || component.name || 'Field';
  const required = component.required || false;

  let html = `<div class="form-field" data-component-id="${id}" data-component-type="${component.type}">`;

  // Label
  if (!['heading', 'text', 'button'].includes(component.type)) {
    html += `<label class="field-label ${required ? 'required' : ''}" for="${id}">${escapeHtml(label)}</label>`;
  }

  // Field based on type
  switch (component.type) {
    case 'textInput':
      html += `<input type="text" id="${id}" name="${component.name}" class="field-input" data-field-id="${id}" ${required ? 'required' : ''} ${component.placeholder ? `placeholder="${escapeHtml(component.placeholder)}"` : ''}>`;
      break;

    case 'textArea':
      html += `<textarea id="${id}" name="${component.name}" class="field-input" data-field-id="${id}" ${required ? 'required' : ''} ${component.placeholder ? `placeholder="${escapeHtml(component.placeholder)}"` : ''}></textarea>`;
      break;

    case 'numberInput':
      html += `<input type="number" id="${id}" name="${component.name}" class="field-input" data-field-id="${id}" ${required ? 'required' : ''}>`;
      break;

    case 'emailInput':
      html += `<input type="email" id="${id}" name="${component.name}" class="field-input" data-field-id="${id}" ${required ? 'required' : ''}>`;
      break;

    case 'passwordInput':
      html += `<input type="password" id="${id}" name="${component.name}" class="field-input" data-field-id="${id}" ${required ? 'required' : ''}>`;
      break;

    case 'dateInput':
      html += `<input type="date" id="${id}" name="${component.name}" class="field-input" data-field-id="${id}" ${required ? 'required' : ''}>`;
      break;

    case 'timeInput':
      html += `<input type="time" id="${id}" name="${component.name}" class="field-input" data-field-id="${id}" ${required ? 'required' : ''}>`;
      break;

    case 'checkbox':
      html += `<input type="checkbox" id="${id}" name="${component.name}" data-field-id="${id}" ${required ? 'required' : ''}> ${escapeHtml(component.label || '')}`;
      break;

    case 'dropdown':
      html += `<select id="${id}" name="${component.name}" class="field-input" data-field-id="${id}" ${required ? 'required' : ''}>`;
      html += `<option value="">Select...</option>`;
      if (component.options && Array.isArray(component.options)) {
        component.options.forEach(opt => {
          html += `<option value="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</option>`;
        });
      }
      html += `</select>`;
      break;

    case 'heading':
      html += `<h${component.level || 2} style="margin-bottom: 1rem;">${escapeHtml(component.text || label)}</h${component.level || 2}>`;
      break;

    case 'text':
      html += `<p>${escapeHtml(component.text || '')}</p>`;
      break;

    case 'button':
      html += `<button type="button" class="btn btn-primary" data-button-id="${id}" onclick="handleButtonClick('${id}')">${escapeHtml(label)}</button>`;
      break;

    default:
      html += `<div class="field-input" style="padding: 1rem; background: var(--bg-secondary); border-radius: 6px;">Unsupported component type: ${component.type}</div>`;
  }

  // Error message container
  if (!['heading', 'text'].includes(component.type)) {
    html += `<div class="field-error" id="error-${id}" style="display: none;"></div>`;
  }

  html += `</div>`;

  return html;
}

/**
 * Initialize form runtime engine
 */
async function initializeFormEngine(form) {
  try {
    console.log('Initializing Form Runtime Engine for:', form.id);

    // Check for recordId in URL for edit mode
    const urlParams = new URLSearchParams(window.location.search);
    const recordId = urlParams.get('recordId') || urlParams.get('id');

    // Create FormRuntimeEngine instance
    const engine = new FormRuntimeEngine(form, {
      recordId: recordId, // Will trigger edit mode if present
      autoSave: true,
      autoSaveInterval: 30000, // 30 seconds
      validateOnChange: true
    });

    // Initialize the engine
    await engine.initialize();

    // Wire up DOM input events to engine
    setupFormEventListeners(engine, form);

    // Listen to engine events and update DOM
    setupEngineEventHandlers(engine, form);

    // Store engine instance
    AppRuntime.formEngines.set(form.id, engine);

    console.log('Form Runtime Engine initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Form Runtime Engine:', error);
    showToast('Failed to initialize form engine: ' + error.message, 'error');
  }
}

/**
 * Set up form event listeners (DOM -> Engine)
 */
function setupFormEventListeners(engine, form) {
  // Get all form fields
  const formElement = document.getElementById('runtimeForm');
  if (!formElement) return;

  // Listen to input/change events on all fields
  const fields = formElement.querySelectorAll('[data-field-id]');

  fields.forEach(field => {
    const fieldId = field.getAttribute('data-field-id');
    const fieldType = field.tagName.toLowerCase();
    const inputType = field.type;

    // ===== OnChange Event =====
    // Determine event type based on field type
    const changeEventType = inputType === 'checkbox' || fieldType === 'select' ? 'change' : 'input';

    field.addEventListener(changeEventType, (e) => {
      const value = inputType === 'checkbox' ? field.checked : field.value;

      // Update engine state (this triggers onChange handler automatically)
      engine.setValue(fieldId, value, { validate: true });
    });

    // ===== OnSelect Event (for dropdowns) =====
    if (fieldType === 'select') {
      field.addEventListener('change', (e) => {
        const selectedValue = field.value;
        const selectedOption = field.options[field.selectedIndex];
        const selectedText = selectedOption ? selectedOption.text : '';

        // Trigger onSelect event handler
        engine.triggerEventHandler(fieldId, 'onSelect', {
          value: selectedValue,
          text: selectedText,
          index: field.selectedIndex
        });
      });
    }

    // ===== OnFocus Event =====
    field.addEventListener('focus', (e) => {
      // Trigger onFocus event handler if defined
      engine.triggerEventHandler(fieldId, 'onFocus', {
        value: engine.getValue(fieldId)
      });
    });

    // ===== OnBlur Event =====
    field.addEventListener('blur', (e) => {
      // Validate field
      engine.validateField(fieldId);

      // Trigger onBlur event handler if defined
      engine.triggerEventHandler(fieldId, 'onBlur', {
        value: engine.getValue(fieldId)
      });
    });
  });

  // ===== Button Click Events =====
  const buttons = formElement.querySelectorAll('[data-button-id]');
  buttons.forEach(button => {
    const buttonId = button.getAttribute('data-button-id');

    button.addEventListener('click', (e) => {
      // Trigger onClick event handler
      engine.triggerEventHandler(buttonId, 'onClick', {
        buttonId: buttonId
      });
    });
  });
}

/**
 * Set up engine event handlers (Engine -> DOM)
 */
function setupEngineEventHandlers(engine, form) {
  // Listen to validation events
  engine.on('validated', (data) => {
    updateValidationDisplay(data);
  });

  // Listen to field validation
  engine.on('fieldValidated', ({ fieldId, isValid, errors }) => {
    updateFieldError(fieldId, isValid, errors);
  });

  // Listen to component visibility changes
  engine.on('componentVisibilityChanged', ({ componentId, visible }) => {
    const component = document.querySelector(`[data-component-id="${componentId}"]`);
    if (component) {
      component.style.display = visible ? '' : 'none';
    }
  });

  // Listen to component enabled state changes
  engine.on('componentEnabledChanged', ({ componentId, enabled }) => {
    const field = document.getElementById(componentId);
    if (field) {
      field.disabled = !enabled;
    }
  });

  // Listen to form submission events
  engine.on('submitting', () => {
    const submitBtn = document.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
    }
  });

  engine.on('submitted', (data) => {
    const submitBtn = document.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-save"></i> Submit';
    }
  });

  engine.on('submitFailed', ({ reason, errors }) => {
    const submitBtn = document.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-save"></i> Submit';
    }

    if (reason === 'validation') {
      showToast('Please fix validation errors before submitting', 'error');
    }
  });

  // Listen to auto-save events
  engine.on('autoSaved', ({ timestamp, values }) => {
    console.log('Form auto-saved at', timestamp);
    // Could show a subtle indicator
  });
}

/**
 * Update validation display for entire form
 */
function updateValidationDisplay(data) {
  const { isValid, errorCount, errors } = data;

  // Update each field's error display
  errors.forEach(error => {
    updateFieldError(error.fieldId, false, error.messages);
  });

  // Clear errors for valid fields
  const allFields = document.querySelectorAll('[data-field-id]');
  allFields.forEach(field => {
    const fieldId = field.getAttribute('data-field-id');
    const hasError = errors.find(e => e.fieldId === fieldId);
    if (!hasError) {
      updateFieldError(fieldId, true, []);
    }
  });
}

/**
 * Update field error display
 */
function updateFieldError(fieldId, isValid, errors = []) {
  const errorContainer = document.getElementById(`error-${fieldId}`);
  const field = document.getElementById(fieldId);

  if (!errorContainer) return;

  if (isValid || errors.length === 0) {
    errorContainer.style.display = 'none';
    errorContainer.textContent = '';
    if (field) field.classList.remove('field-error');
  } else {
    errorContainer.style.display = 'block';
    errorContainer.textContent = errors.join(', ');
    if (field) field.classList.add('field-error');
  }
}

// ============================================================================
// FORM SUBMISSION & EVENTS
// ============================================================================

/**
 * Handle form submission
 */
async function handleFormSubmit(event) {
  event.preventDefault();

  // Get the form engine for the current form
  const engine = AppRuntime.formEngines.get(AppRuntime.formId);

  if (!engine) {
    console.error('Form engine not found for form:', AppRuntime.formId);
    showToast('Form engine not initialized', 'error');
    return;
  }

  try {
    console.log('Submitting form via engine...');

    // Use the engine's submit method (handles validation, events, etc.)
    const result = await engine.submit();

    if (result.success) {
      showToast('Form submitted successfully!', 'success');

      // Store in runtime state
      AppRuntime.formData[AppRuntime.formId] = result.data;

      // Record analytics
      RuntimeAPI.recordAnalytics({
        event: 'form_submitted',
        formId: AppRuntime.formId,
        timestamp: new Date().toISOString()
      }).catch(err => console.warn('Analytics failed:', err));
    } else {
      // Engine returned failure (validation errors, etc.)
      console.error('Form submission failed:', result.error);
      showToast(result.error || 'Form submission failed', 'error');
    }

  } catch (error) {
    console.error('Form submission error:', error);
    showToast('Failed to submit form: ' + error.message, 'error');
  }
}

/**
 * Handle button click events
 */
function handleButtonClick(buttonId) {
  console.log('Button clicked:', buttonId);
  showToast('Button clicked!', 'info');
}

/**
 * Reset form
 */
function resetForm() {
  const form = document.getElementById('runtimeForm');
  if (form) {
    form.reset();
    showToast('Form reset', 'info');
  }
}

// ============================================================================
// GRID LOADING & RENDERING
// ============================================================================

/**
 * Load and render a grid
 */
async function loadGrid(gridId) {
  try {
    showLoading('Loading grid...');

    // Clean up previous grid engine
    if (AppRuntime.gridEngines.has(AppRuntime.gridId)) {
      const engine = AppRuntime.gridEngines.get(AppRuntime.gridId);
      if (engine && typeof engine.destroy === 'function') {
        engine.destroy();
      }
      AppRuntime.gridEngines.delete(AppRuntime.gridId);
    }

    // Load grid data
    const gridData = await RuntimeAPI.loadGrid(gridId);
    AppRuntime.currentGrid = gridData.data;
    AppRuntime.gridId = gridId;

    // Update URL without reload
    const newUrl = `/lowcode/apps/${AppRuntime.appId}/grids/${gridId}`;
    window.history.pushState({ gridId }, '', newUrl);

    // Update navigation
    updateActiveNav(gridId);

    // Render grid
    renderGrid(AppRuntime.currentGrid);

    // Record analytics
    RuntimeAPI.recordAnalytics({
      event: 'grid_viewed',
      gridId,
      timestamp: new Date().toISOString()
    }).catch(err => console.warn('Analytics failed:', err));

  } catch (error) {
    console.error('Failed to load grid:', error);
    showError('Failed to Load Grid', error.message);
  }
}

/**
 * Render grid in the content area
 */
function renderGrid(grid) {
  const content = document.getElementById('appContent');

  // Build grid HTML with container
  const gridHtml = `
    <div class="content-wrapper">
      <div id="gridContainer"></div>
    </div>
  `;

  content.innerHTML = gridHtml;

  // Initialize grid runtime engine
  initializeGridEngine(grid);
}

/**
 * Initialize grid runtime engine
 */
async function initializeGridEngine(grid) {
  try {
    console.log('Initializing Grid Runtime Engine for:', grid.id);

    // Ensure global reference for grid runtime
    if (!window.gridRuntime) {
      window.gridRuntime = null;
    }

    // Create GridRuntimeEngine instance
    const engine = new GridRuntimeEngine(grid, {
      containerId: 'gridContainer',
      autoLoad: true,
      enableSorting: true,
      enableFiltering: true,
      enablePagination: grid.pagination?.enabled !== false,
      pageSize: grid.pagination?.pageSize || 25,

      // Row actions
      onRowClick: (rowData, rowId) => {
        console.log('Row clicked:', rowId, rowData);
        // Could navigate to detail view or open modal
      },

      onRowEdit: (rowData, rowId) => {
        console.log('Edit row:', rowId, rowData);
        // Navigate to edit form with recordId
        const editUrl = `/lowcode/apps/${AppRuntime.appId}/forms/${grid.formId}?recordId=${rowId}`;
        window.location.href = editUrl;
      },

      onRowDelete: async (rowData, rowId) => {
        console.log('Delete row:', rowId, rowData);
        try {
          // Delete via data source
          await RuntimeAPI.executeDataQuery(grid.dataSource.id, {
            operation: 'delete',
            recordId: rowId
          });

          showToast('Record deleted successfully', 'success');
          return true;
        } catch (error) {
          console.error('Delete failed:', error);
          showToast('Failed to delete record: ' + error.message, 'error');
          throw error;
        }
      }
    });

    // Initialize the engine
    await engine.initialize();

    // Store engine instance
    AppRuntime.gridEngines.set(grid.id, engine);
    window.gridRuntime = engine; // Global reference for button handlers

    // Listen to engine events
    engine.on('dataLoaded', ({ rows, total }) => {
      console.log('Grid data loaded:', rows.length, 'rows of', total);
    });

    engine.on('error', ({ type, error }) => {
      console.error('Grid error:', type, error);
      showToast('Grid error: ' + error.message, 'error');
    });

    engine.on('rowAction', ({ action, row, rowId }) => {
      console.log('Row action:', action, rowId, row);
      showToast(`Action "${action}" triggered on row ${rowId}`, 'info');
    });

    console.log('Grid Runtime Engine initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Grid Runtime Engine:', error);
    showToast('Failed to initialize grid engine: ' + error.message, 'error');
  }
}

// ============================================================================
// UI HELPERS
// ============================================================================

/**
 * Show loading state
 */
function showLoading(message = 'Loading...') {
  const content = document.getElementById('appContent');
  content.innerHTML = `
    <div class="loading-container">
      <div class="spinner"></div>
      <div>${escapeHtml(message)}</div>
    </div>
  `;
}

/**
 * Show error state
 */
function showError(title, message) {
  const content = document.getElementById('appContent');
  content.innerHTML = `
    <div class="error-container">
      <div class="error-icon">
        <i class="fas fa-exclamation-triangle"></i>
      </div>
      <h2 class="error-title">${escapeHtml(title)}</h2>
      <p class="error-message">${escapeHtml(message)}</p>
      <button class="btn btn-primary" onclick="initializeApp()">
        <i class="fas fa-redo"></i>
        Retry
      </button>
    </div>
  `;
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
    warning: 'fa-exclamation-triangle',
    info: 'fa-info-circle'
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
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

/**
 * Toggle theme (light/dark)
 */
function toggleTheme() {
  const html = document.documentElement;
  const currentTheme = html.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

  html.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);

  const icon = document.getElementById('themeIcon');
  icon.className = newTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

/**
 * Load saved theme
 */
function loadTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);

  const icon = document.getElementById('themeIcon');
  if (icon) {
    icon.className = savedTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
  }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  // Load theme
  loadTheme();

  // Initialize app
  initializeApp();

  // Handle browser back/forward
  window.addEventListener('popstate', (event) => {
    if (event.state && event.state.formId) {
      loadForm(event.state.formId);
    }
  });

  // Close sidebar on outside click (mobile)
  document.addEventListener('click', (e) => {
    const sidebar = document.getElementById('appSidebar');
    const toggle = document.querySelector('.mobile-menu-toggle');

    if (window.innerWidth < 769 &&
        sidebar?.classList.contains('show') &&
        !sidebar.contains(e.target) &&
        !toggle?.contains(e.target)) {
      sidebar.classList.remove('show');
    }
  });
});
