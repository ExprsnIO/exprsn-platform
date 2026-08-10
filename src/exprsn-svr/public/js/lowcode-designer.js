/**
 * Exprsn Low-Code Form Designer
 *
 * Interactive form designer with drag-drop components, property editing,
 * theme switching, and real-time preview.
 */

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const DesignerState = {
  currentView: 'design', // design, code, preview
  currentDevice: 'desktop', // desktop, tablet, mobile
  currentTheme: 'light', // light, dark
  selectedComponent: null,
  formDefinition: {
    id: null,
    name: 'Untitled Form',
    status: 'draft',
    controls: [],
    dataSources: [],
    collections: [],
    variables: [],
    events: {},
    validationRules: []
  },
  componentIdCounter: 0,
  isDirty: false // Track unsaved changes
};

// ============================================================================
// COMPONENT TEMPLATES
// ============================================================================

const ComponentTemplates = {
  textinput: {
    type: 'textinput',
    label: 'Text Input',
    icon: 'bi-input-cursor-text',
    defaultProps: {
      label: 'Text Input',
      placeholder: 'Enter text...',
      required: false,
      maxLength: 255,
      width: '100%'
    }
  },
  textarea: {
    type: 'textarea',
    label: 'Text Area',
    icon: 'bi-textarea',
    defaultProps: {
      label: 'Text Area',
      placeholder: 'Enter text...',
      required: false,
      rows: 4,
      maxLength: 5000,
      width: '100%'
    }
  },
  number: {
    type: 'number',
    label: 'Number Input',
    icon: 'bi-123',
    defaultProps: {
      label: 'Number',
      placeholder: '0',
      required: false,
      min: null,
      max: null,
      step: 1,
      width: '100%'
    }
  },
  email: {
    type: 'email',
    label: 'Email Input',
    icon: 'bi-envelope',
    defaultProps: {
      label: 'Email',
      placeholder: 'email@example.com',
      required: false,
      width: '100%'
    }
  },
  password: {
    type: 'password',
    label: 'Password',
    icon: 'bi-key',
    defaultProps: {
      label: 'Password',
      placeholder: 'Enter password',
      required: false,
      minLength: 8,
      width: '100%'
    }
  },
  date: {
    type: 'date',
    label: 'Date Picker',
    icon: 'bi-calendar',
    defaultProps: {
      label: 'Date',
      required: false,
      min: null,
      max: null,
      width: '100%'
    }
  },
  time: {
    type: 'time',
    label: 'Time Picker',
    icon: 'bi-clock',
    defaultProps: {
      label: 'Time',
      required: false,
      width: '100%'
    }
  },
  checkbox: {
    type: 'checkbox',
    label: 'Checkbox',
    icon: 'bi-check-square',
    defaultProps: {
      label: 'Checkbox',
      text: 'I agree',
      required: false,
      defaultValue: false
    }
  },
  radio: {
    type: 'radio',
    label: 'Radio Group',
    icon: 'bi-record-circle',
    defaultProps: {
      label: 'Radio Group',
      required: false,
      options: [
        { label: 'Option 1', value: 'option1' },
        { label: 'Option 2', value: 'option2' }
      ]
    }
  },
  select: {
    type: 'select',
    label: 'Dropdown',
    icon: 'bi-list',
    defaultProps: {
      label: 'Dropdown',
      placeholder: 'Select an option...',
      required: false,
      options: [
        { label: 'Option 1', value: 'option1' },
        { label: 'Option 2', value: 'option2' }
      ],
      width: '100%'
    }
  },
  file: {
    type: 'file',
    label: 'File Upload',
    icon: 'bi-file-earmark-arrow-up',
    defaultProps: {
      label: 'File Upload',
      required: false,
      accept: '*/*',
      multiple: false,
      maxSize: 10485760, // 10MB
      width: '100%'
    }
  },
  button: {
    type: 'button',
    label: 'Button',
    icon: 'bi-ui-radios',
    defaultProps: {
      text: 'Button',
      variant: 'primary',
      size: 'medium',
      width: 'auto',
      disabled: false
    }
  },
  heading: {
    type: 'heading',
    label: 'Heading',
    icon: 'bi-type-h1',
    defaultProps: {
      text: 'Heading',
      level: 'h2',
      align: 'left'
    }
  },
  text: {
    type: 'text',
    label: 'Text',
    icon: 'bi-text-paragraph',
    defaultProps: {
      text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
      align: 'left'
    }
  },
  label: {
    type: 'label',
    label: 'Label',
    icon: 'bi-type',
    defaultProps: {
      text: 'Label',
      for: null,
      required: false
    }
  }
};

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', function() {
  initializeTheme();
  initializeViewSwitching();
  initializeDeviceSwitching();
  initializeTabSwitching();
  initializeDragAndDrop();
  initializeCanvasInteraction();
  initializeFormActions();
  initializeComponentSearch();

  showToast('Designer ready', 'info');
});

// ============================================================================
// THEME MANAGEMENT
// ============================================================================

function initializeTheme() {
  const themeToggle = document.getElementById('themeToggle');
  const savedTheme = localStorage.getItem('lowcode-theme') || 'light';

  setTheme(savedTheme);

  themeToggle.addEventListener('click', function() {
    const newTheme = DesignerState.currentTheme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  });
}

function setTheme(theme) {
  DesignerState.currentTheme = theme;
  document.body.setAttribute('data-theme', theme);

  const toggle = document.getElementById('themeToggle');
  const thumb = toggle.querySelector('.theme-toggle-thumb');

  if (theme === 'dark') {
    thumb.innerHTML = '<i class="bi bi-moon-fill"></i>';
    toggle.classList.add('active');
  } else {
    thumb.innerHTML = '<i class="bi bi-sun-fill"></i>';
    toggle.classList.remove('active');
  }

  localStorage.setItem('lowcode-theme', theme);

  // Update preview if in preview mode
  if (DesignerState.currentView === 'preview') {
    updatePreview();
  }
}

// ============================================================================
// VIEW SWITCHING (Design / Code / Preview)
// ============================================================================

function initializeViewSwitching() {
  const viewButtons = document.querySelectorAll('[data-view]');

  viewButtons.forEach(button => {
    button.addEventListener('click', function() {
      const view = this.getAttribute('data-view');
      switchView(view);
    });
  });
}

function switchView(view) {
  DesignerState.currentView = view;

  // Update button states
  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-view') === view);
  });

  // Show/hide view containers
  document.getElementById('designView').classList.toggle('d-none', view !== 'design');
  document.getElementById('codeView').classList.toggle('d-none', view !== 'code');
  document.getElementById('previewView').classList.toggle('d-none', view !== 'preview');

  // Update view-specific content
  if (view === 'code') {
    updateCodeView();
  } else if (view === 'preview') {
    updatePreview();
  }
}

// ============================================================================
// DEVICE SWITCHING (Desktop / Tablet / Mobile)
// ============================================================================

function initializeDeviceSwitching() {
  const deviceButtons = document.querySelectorAll('[data-device]');

  deviceButtons.forEach(button => {
    button.addEventListener('click', function() {
      const device = this.getAttribute('data-device');
      switchDevice(device);
    });
  });
}

function switchDevice(device) {
  DesignerState.currentDevice = device;

  // Update button states
  document.querySelectorAll('[data-device]').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-device') === device);
  });

  // Update canvas device attribute
  const canvases = document.querySelectorAll('.lowcode-canvas');
  canvases.forEach(canvas => {
    canvas.setAttribute('data-device', device);
  });
}

// ============================================================================
// TAB SWITCHING (Sidebars)
// ============================================================================

function initializeTabSwitching() {
  // Left sidebar tabs
  document.querySelectorAll('.lowcode-sidebar.left .lowcode-tab').forEach(tab => {
    tab.addEventListener('click', function() {
      switchLeftTab(this.getAttribute('data-tab'));
    });
  });

  // Right sidebar tabs
  document.querySelectorAll('.lowcode-sidebar.right .lowcode-tab').forEach(tab => {
    tab.addEventListener('click', function() {
      switchRightTab(this.getAttribute('data-tab'));
    });
  });
}

function switchLeftTab(tabName) {
  // Update active tab
  document.querySelectorAll('.lowcode-sidebar.left .lowcode-tab').forEach(tab => {
    tab.classList.toggle('active', tab.getAttribute('data-tab') === tabName);
  });

  // Show/hide content
  document.getElementById('componentsTab').classList.toggle('d-none', tabName !== 'components');
  document.getElementById('assetsTab').classList.toggle('d-none', tabName !== 'assets');
}

function switchRightTab(tabName) {
  // Update active tab
  document.querySelectorAll('.lowcode-sidebar.right .lowcode-tab').forEach(tab => {
    tab.classList.toggle('active', tab.getAttribute('data-tab') === tabName);
  });

  // Show/hide content
  document.getElementById('propertiesTab').classList.toggle('d-none', tabName !== 'properties');
  document.getElementById('eventsTab').classList.toggle('d-none', tabName !== 'events');
  document.getElementById('dataTab').classList.toggle('d-none', tabName !== 'data');
}

// ============================================================================
// DRAG AND DROP
// ============================================================================

let draggedComponentType = null;

function initializeDragAndDrop() {
  const componentItems = document.querySelectorAll('.component-item[draggable="true"]');
  const dropzone = document.getElementById('canvasDropzone');

  componentItems.forEach(item => {
    item.addEventListener('dragstart', handleDragStart);
    item.addEventListener('dragend', handleDragEnd);
  });

  dropzone.addEventListener('dragover', handleDragOver);
  dropzone.addEventListener('drop', handleDrop);
  dropzone.addEventListener('dragleave', handleDragLeave);
}

function handleDragStart(e) {
  draggedComponentType = this.getAttribute('data-component');
  this.style.opacity = '0.5';
  e.dataTransfer.effectAllowed = 'copy';
  e.dataTransfer.setData('text/html', this.innerHTML);
}

function handleDragEnd(e) {
  this.style.opacity = '1';
}

function handleDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }
  e.dataTransfer.dropEffect = 'copy';
  this.classList.add('drag-over');
  return false;
}

function handleDragLeave(e) {
  this.classList.remove('drag-over');
}

function handleDrop(e) {
  if (e.stopPropagation) {
    e.stopPropagation();
  }

  this.classList.remove('drag-over');

  if (draggedComponentType) {
    addComponentToCanvas(draggedComponentType);
    draggedComponentType = null;
  }

  return false;
}

// ============================================================================
// COMPONENT MANAGEMENT
// ============================================================================

function addComponentToCanvas(componentType) {
  const template = ComponentTemplates[componentType];
  if (!template) {
    console.error('Unknown component type:', componentType);
    return;
  }

  // Create component instance
  const component = {
    id: `component_${++DesignerState.componentIdCounter}`,
    type: componentType,
    name: `${template.label}_${DesignerState.componentIdCounter}`,
    props: { ...template.defaultProps }
  };

  // Add to form definition
  DesignerState.formDefinition.controls.push(component);

  // Mark as dirty
  DesignerState.isDirty = true;

  // Render on canvas
  renderCanvas();

  // Select the new component
  selectComponent(component.id);

  showToast(`Added ${template.label}`, 'success');
}

function removeComponent(componentId) {
  const index = DesignerState.formDefinition.controls.findIndex(c => c.id === componentId);
  if (index !== -1) {
    const component = DesignerState.formDefinition.controls[index];
    DesignerState.formDefinition.controls.splice(index, 1);
    DesignerState.isDirty = true;
    renderCanvas();

    if (DesignerState.selectedComponent === componentId) {
      DesignerState.selectedComponent = null;
      clearPropertiesPanel();
    }

    showToast(`Removed ${component.name}`, 'info');
  }
}

function duplicateComponent(componentId) {
  const component = DesignerState.formDefinition.controls.find(c => c.id === componentId);
  if (component) {
    const duplicate = {
      id: `component_${++DesignerState.componentIdCounter}`,
      type: component.type,
      name: `${component.name}_copy`,
      props: JSON.parse(JSON.stringify(component.props))
    };

    DesignerState.formDefinition.controls.push(duplicate);
    DesignerState.isDirty = true;
    renderCanvas();
    selectComponent(duplicate.id);

    showToast(`Duplicated ${component.name}`, 'success');
  }
}

function moveComponent(componentId, direction) {
  const index = DesignerState.formDefinition.controls.findIndex(c => c.id === componentId);
  if (index === -1) return;

  if (direction === 'up' && index > 0) {
    [DesignerState.formDefinition.controls[index], DesignerState.formDefinition.controls[index - 1]] =
    [DesignerState.formDefinition.controls[index - 1], DesignerState.formDefinition.controls[index]];
    DesignerState.isDirty = true;
    renderCanvas();
  } else if (direction === 'down' && index < DesignerState.formDefinition.controls.length - 1) {
    [DesignerState.formDefinition.controls[index], DesignerState.formDefinition.controls[index + 1]] =
    [DesignerState.formDefinition.controls[index + 1], DesignerState.formDefinition.controls[index]];
    DesignerState.isDirty = true;
    renderCanvas();
  }
}

// ============================================================================
// CANVAS RENDERING
// ============================================================================

function renderCanvas() {
  const dropzone = document.getElementById('canvasDropzone');

  if (DesignerState.formDefinition.controls.length === 0) {
    dropzone.innerHTML = `
      <div class="empty-canvas">
        <i class="bi bi-inbox"></i>
        <p><strong>Drag & drop components here</strong></p>
        <p class="text-muted">Start building your form by dragging components from the left panel</p>
      </div>
    `;
    return;
  }

  dropzone.innerHTML = DesignerState.formDefinition.controls.map(component =>
    renderComponent(component)
  ).join('');

  // Reattach event listeners
  attachCanvasEventListeners();
}

function renderComponent(component) {
  const template = ComponentTemplates[component.type];
  const isSelected = DesignerState.selectedComponent === component.id;

  return `
    <div class="canvas-element ${isSelected ? 'selected' : ''}"
         data-component-id="${component.id}"
         data-component-type="${component.type}">

      <!-- Element Toolbar -->
      <div class="element-toolbar">
        <button type="button" class="btn-move-up" title="Move Up">
          <i class="bi bi-arrow-up"></i>
        </button>
        <button type="button" class="btn-move-down" title="Move Down">
          <i class="bi bi-arrow-down"></i>
        </button>
        <button type="button" class="btn-duplicate" title="Duplicate">
          <i class="bi bi-files"></i>
        </button>
        <button type="button" class="btn-delete" title="Delete">
          <i class="bi bi-trash"></i>
        </button>
      </div>

      <!-- Component Preview -->
      ${renderComponentPreview(component)}
    </div>
  `;
}

function renderComponentPreview(component) {
  const props = component.props;

  switch (component.type) {
    case 'textinput':
      return `
        <div class="mb-3">
          <label class="form-label">${props.label}${props.required ? ' <span class="text-danger">*</span>' : ''}</label>
          <input type="text" class="form-control" placeholder="${props.placeholder}" disabled>
        </div>
      `;

    case 'textarea':
      return `
        <div class="mb-3">
          <label class="form-label">${props.label}${props.required ? ' <span class="text-danger">*</span>' : ''}</label>
          <textarea class="form-control" rows="${props.rows}" placeholder="${props.placeholder}" disabled></textarea>
        </div>
      `;

    case 'number':
      return `
        <div class="mb-3">
          <label class="form-label">${props.label}${props.required ? ' <span class="text-danger">*</span>' : ''}</label>
          <input type="number" class="form-control" placeholder="${props.placeholder}" disabled>
        </div>
      `;

    case 'email':
      return `
        <div class="mb-3">
          <label class="form-label">${props.label}${props.required ? ' <span class="text-danger">*</span>' : ''}</label>
          <input type="email" class="form-control" placeholder="${props.placeholder}" disabled>
        </div>
      `;

    case 'password':
      return `
        <div class="mb-3">
          <label class="form-label">${props.label}${props.required ? ' <span class="text-danger">*</span>' : ''}</label>
          <input type="password" class="form-control" placeholder="${props.placeholder}" disabled>
        </div>
      `;

    case 'date':
      return `
        <div class="mb-3">
          <label class="form-label">${props.label}${props.required ? ' <span class="text-danger">*</span>' : ''}</label>
          <input type="date" class="form-control" disabled>
        </div>
      `;

    case 'time':
      return `
        <div class="mb-3">
          <label class="form-label">${props.label}${props.required ? ' <span class="text-danger">*</span>' : ''}</label>
          <input type="time" class="form-control" disabled>
        </div>
      `;

    case 'checkbox':
      return `
        <div class="mb-3 form-check">
          <input type="checkbox" class="form-check-input" id="${component.id}_preview" disabled>
          <label class="form-check-label" for="${component.id}_preview">
            ${props.text}${props.required ? ' <span class="text-danger">*</span>' : ''}
          </label>
        </div>
      `;

    case 'radio':
      return `
        <div class="mb-3">
          <label class="form-label">${props.label}${props.required ? ' <span class="text-danger">*</span>' : ''}</label>
          ${props.options.map((opt, idx) => `
            <div class="form-check">
              <input type="radio" class="form-check-input" name="${component.id}_radio" id="${component.id}_${idx}" disabled>
              <label class="form-check-label" for="${component.id}_${idx}">${opt.label}</label>
            </div>
          `).join('')}
        </div>
      `;

    case 'select':
      return `
        <div class="mb-3">
          <label class="form-label">${props.label}${props.required ? ' <span class="text-danger">*</span>' : ''}</label>
          <select class="form-select" disabled>
            <option>${props.placeholder}</option>
            ${props.options.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('')}
          </select>
        </div>
      `;

    case 'file':
      return `
        <div class="mb-3">
          <label class="form-label">${props.label}${props.required ? ' <span class="text-danger">*</span>' : ''}</label>
          <input type="file" class="form-control" ${props.multiple ? 'multiple' : ''} disabled>
        </div>
      `;

    case 'button':
      return `
        <div class="mb-3">
          <button type="button" class="btn btn-${props.variant} btn-${props.size === 'small' ? 'sm' : props.size === 'large' ? 'lg' : ''}" disabled>
            ${props.text}
          </button>
        </div>
      `;

    case 'heading':
      return `
        <${props.level} class="text-${props.align}">${props.text}</${props.level}>
      `;

    case 'text':
      return `
        <p class="text-${props.align}">${props.text}</p>
      `;

    case 'label':
      return `
        <label class="form-label">${props.text}${props.required ? ' <span class="text-danger">*</span>' : ''}</label>
      `;

    default:
      return `<div class="alert alert-warning">Unknown component type: ${component.type}</div>`;
  }
}

// ============================================================================
// CANVAS INTERACTION
// ============================================================================

function initializeCanvasInteraction() {
  attachCanvasEventListeners();
}

function attachCanvasEventListeners() {
  // Component selection
  document.querySelectorAll('.canvas-element').forEach(element => {
    element.addEventListener('click', function(e) {
      e.stopPropagation();
      const componentId = this.getAttribute('data-component-id');
      selectComponent(componentId);
    });
  });

  // Toolbar buttons
  document.querySelectorAll('.btn-move-up').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const componentId = this.closest('.canvas-element').getAttribute('data-component-id');
      moveComponent(componentId, 'up');
    });
  });

  document.querySelectorAll('.btn-move-down').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const componentId = this.closest('.canvas-element').getAttribute('data-component-id');
      moveComponent(componentId, 'down');
    });
  });

  document.querySelectorAll('.btn-duplicate').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const componentId = this.closest('.canvas-element').getAttribute('data-component-id');
      duplicateComponent(componentId);
    });
  });

  document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const componentId = this.closest('.canvas-element').getAttribute('data-component-id');
      if (confirm('Are you sure you want to delete this component?')) {
        removeComponent(componentId);
      }
    });
  });

  // Click outside to deselect
  document.getElementById('canvasDropzone').addEventListener('click', function(e) {
    if (e.target === this || e.target.classList.contains('empty-canvas')) {
      deselectComponent();
    }
  });
}

function selectComponent(componentId) {
  DesignerState.selectedComponent = componentId;

  // Update canvas UI
  document.querySelectorAll('.canvas-element').forEach(el => {
    el.classList.toggle('selected', el.getAttribute('data-component-id') === componentId);
  });

  // Update properties panel
  updatePropertiesPanel(componentId);

  // Update events panel
  updateEventsPanel(componentId);
}

function deselectComponent() {
  DesignerState.selectedComponent = null;

  document.querySelectorAll('.canvas-element').forEach(el => {
    el.classList.remove('selected');
  });

  clearPropertiesPanel();
  clearEventsPanel();
}

// ============================================================================
// PROPERTIES PANEL
// ============================================================================

function updatePropertiesPanel(componentId) {
  const component = DesignerState.formDefinition.controls.find(c => c.id === componentId);
  if (!component) return;

  const template = ComponentTemplates[component.type];
  const panel = document.getElementById('propertiesPanel');

  panel.innerHTML = `
    <div class="property-group">
      <h6 class="property-group-header">Component Info</h6>
      <div class="property-item">
        <label class="property-label">Type</label>
        <div class="property-value">
          <span class="badge bg-secondary">
            <i class="${template.icon}"></i> ${template.label}
          </span>
        </div>
      </div>
      <div class="property-item">
        <label class="property-label">Name</label>
        <input type="text"
               class="lowcode-input"
               value="${component.name}"
               data-property="name"
               placeholder="Component name">
      </div>
    </div>

    <div class="property-group">
      <h6 class="property-group-header">Properties</h6>
      ${renderProperties(component)}
    </div>
  `;

  // Attach property change listeners
  attachPropertyListeners();
}

function renderProperties(component) {
  const props = component.props;
  let html = '';

  // Common properties for input components
  if (['textinput', 'textarea', 'number', 'email', 'password', 'date', 'time', 'select', 'file'].includes(component.type)) {
    html += `
      <div class="property-item">
        <label class="property-label">Label</label>
        <input type="text" class="lowcode-input" value="${props.label}" data-property="props.label">
      </div>
    `;

    if (component.type !== 'checkbox') {
      html += `
        <div class="property-item">
          <label class="property-label">
            <input type="checkbox" class="form-check-input me-2" ${props.required ? 'checked' : ''} data-property="props.required">
            Required
          </label>
        </div>
      `;
    }
  }

  // Type-specific properties
  if (['textinput', 'textarea', 'email', 'password'].includes(component.type)) {
    html += `
      <div class="property-item">
        <label class="property-label">Placeholder</label>
        <input type="text" class="lowcode-input" value="${props.placeholder}" data-property="props.placeholder">
      </div>
    `;
  }

  if (component.type === 'textarea') {
    html += `
      <div class="property-item">
        <label class="property-label">Rows</label>
        <input type="number" class="lowcode-input" value="${props.rows}" data-property="props.rows" min="1" max="20">
      </div>
    `;
  }

  if (component.type === 'number') {
    html += `
      <div class="property-item">
        <label class="property-label">Min Value</label>
        <input type="number" class="lowcode-input" value="${props.min || ''}" data-property="props.min">
      </div>
      <div class="property-item">
        <label class="property-label">Max Value</label>
        <input type="number" class="lowcode-input" value="${props.max || ''}" data-property="props.max">
      </div>
      <div class="property-item">
        <label class="property-label">Step</label>
        <input type="number" class="lowcode-input" value="${props.step}" data-property="props.step">
      </div>
    `;
  }

  if (component.type === 'checkbox') {
    html += `
      <div class="property-item">
        <label class="property-label">Text</label>
        <input type="text" class="lowcode-input" value="${props.text}" data-property="props.text">
      </div>
    `;
  }

  if (['radio', 'select'].includes(component.type)) {
    html += `
      <div class="property-item">
        <label class="property-label">Options</label>
        <div id="optionsEditor">
          ${props.options.map((opt, idx) => `
            <div class="d-flex gap-2 mb-2">
              <input type="text" class="lowcode-input" value="${opt.label}" placeholder="Label" data-option-idx="${idx}" data-option-field="label">
              <input type="text" class="lowcode-input" value="${opt.value}" placeholder="Value" data-option-idx="${idx}" data-option-field="value">
              <button type="button" class="lowcode-btn icon-only btn-remove-option" data-option-idx="${idx}">
                <i class="bi bi-trash"></i>
              </button>
            </div>
          `).join('')}
          <button type="button" class="lowcode-btn w-100" id="btnAddOption">
            <i class="bi bi-plus-circle"></i> Add Option
          </button>
        </div>
      </div>
    `;
  }

  if (component.type === 'button') {
    html += `
      <div class="property-item">
        <label class="property-label">Text</label>
        <input type="text" class="lowcode-input" value="${props.text}" data-property="props.text">
      </div>
      <div class="property-item">
        <label class="property-label">Variant</label>
        <select class="lowcode-select" data-property="props.variant">
          <option value="primary" ${props.variant === 'primary' ? 'selected' : ''}>Primary</option>
          <option value="secondary" ${props.variant === 'secondary' ? 'selected' : ''}>Secondary</option>
          <option value="success" ${props.variant === 'success' ? 'selected' : ''}>Success</option>
          <option value="danger" ${props.variant === 'danger' ? 'selected' : ''}>Danger</option>
          <option value="warning" ${props.variant === 'warning' ? 'selected' : ''}>Warning</option>
          <option value="info" ${props.variant === 'info' ? 'selected' : ''}>Info</option>
        </select>
      </div>
      <div class="property-item">
        <label class="property-label">Size</label>
        <select class="lowcode-select" data-property="props.size">
          <option value="small" ${props.size === 'small' ? 'selected' : ''}>Small</option>
          <option value="medium" ${props.size === 'medium' ? 'selected' : ''}>Medium</option>
          <option value="large" ${props.size === 'large' ? 'selected' : ''}>Large</option>
        </select>
      </div>
    `;
  }

  if (component.type === 'heading') {
    html += `
      <div class="property-item">
        <label class="property-label">Text</label>
        <input type="text" class="lowcode-input" value="${props.text}" data-property="props.text">
      </div>
      <div class="property-item">
        <label class="property-label">Level</label>
        <select class="lowcode-select" data-property="props.level">
          <option value="h1" ${props.level === 'h1' ? 'selected' : ''}>H1</option>
          <option value="h2" ${props.level === 'h2' ? 'selected' : ''}>H2</option>
          <option value="h3" ${props.level === 'h3' ? 'selected' : ''}>H3</option>
          <option value="h4" ${props.level === 'h4' ? 'selected' : ''}>H4</option>
          <option value="h5" ${props.level === 'h5' ? 'selected' : ''}>H5</option>
          <option value="h6" ${props.level === 'h6' ? 'selected' : ''}>H6</option>
        </select>
      </div>
      <div class="property-item">
        <label class="property-label">Alignment</label>
        <select class="lowcode-select" data-property="props.align">
          <option value="left" ${props.align === 'left' ? 'selected' : ''}>Left</option>
          <option value="center" ${props.align === 'center' ? 'selected' : ''}>Center</option>
          <option value="right" ${props.align === 'right' ? 'selected' : ''}>Right</option>
        </select>
      </div>
    `;
  }

  if (component.type === 'text') {
    html += `
      <div class="property-item">
        <label class="property-label">Text</label>
        <textarea class="lowcode-textarea" rows="4" data-property="props.text">${props.text}</textarea>
      </div>
      <div class="property-item">
        <label class="property-label">Alignment</label>
        <select class="lowcode-select" data-property="props.align">
          <option value="left" ${props.align === 'left' ? 'selected' : ''}>Left</option>
          <option value="center" ${props.align === 'center' ? 'selected' : ''}>Center</option>
          <option value="right" ${props.align === 'right' ? 'selected' : ''}>Right</option>
        </select>
      </div>
    `;
  }

  return html;
}

function attachPropertyListeners() {
  const inputs = document.querySelectorAll('[data-property]');

  inputs.forEach(input => {
    input.addEventListener('input', function() {
      updateComponentProperty(this);
    });

    input.addEventListener('change', function() {
      updateComponentProperty(this);
    });
  });

  // Options editor listeners
  const optionInputs = document.querySelectorAll('[data-option-idx]');
  optionInputs.forEach(input => {
    input.addEventListener('input', function() {
      updateComponentOption(this);
    });
  });

  const removeButtons = document.querySelectorAll('.btn-remove-option');
  removeButtons.forEach(btn => {
    btn.addEventListener('click', function() {
      const idx = parseInt(this.getAttribute('data-option-idx'));
      removeComponentOption(idx);
    });
  });

  const addButton = document.getElementById('btnAddOption');
  if (addButton) {
    addButton.addEventListener('click', addComponentOption);
  }
}

function updateComponentProperty(input) {
  const component = DesignerState.formDefinition.controls.find(c => c.id === DesignerState.selectedComponent);
  if (!component) return;

  const propertyPath = input.getAttribute('data-property');
  const value = input.type === 'checkbox' ? input.checked : input.value;

  // Handle nested property paths (e.g., "props.label")
  const parts = propertyPath.split('.');
  let target = component;

  for (let i = 0; i < parts.length - 1; i++) {
    target = target[parts[i]];
  }

  target[parts[parts.length - 1]] = value;

  DesignerState.isDirty = true;
  renderCanvas();

  // Re-select the component to maintain selection
  setTimeout(() => selectComponent(component.id), 0);
}

function updateComponentOption(input) {
  const component = DesignerState.formDefinition.controls.find(c => c.id === DesignerState.selectedComponent);
  if (!component) return;

  const idx = parseInt(input.getAttribute('data-option-idx'));
  const field = input.getAttribute('data-option-field');

  component.props.options[idx][field] = input.value;
  DesignerState.isDirty = true;
  renderCanvas();
}

function addComponentOption() {
  const component = DesignerState.formDefinition.controls.find(c => c.id === DesignerState.selectedComponent);
  if (!component) return;

  component.props.options.push({
    label: `Option ${component.props.options.length + 1}`,
    value: `option${component.props.options.length + 1}`
  });

  DesignerState.isDirty = true;
  updatePropertiesPanel(component.id);
}

function removeComponentOption(idx) {
  const component = DesignerState.formDefinition.controls.find(c => c.id === DesignerState.selectedComponent);
  if (!component) return;

  if (component.props.options.length <= 1) {
    showToast('Cannot remove last option', 'warning');
    return;
  }

  component.props.options.splice(idx, 1);
  DesignerState.isDirty = true;
  updatePropertiesPanel(component.id);
}

function clearPropertiesPanel() {
  const panel = document.getElementById('propertiesPanel');
  panel.innerHTML = `
    <div class="text-center text-muted py-5">
      <i class="bi bi-cursor" style="font-size: 48px; opacity: 0.3;"></i>
      <p class="mt-3">Select a component to edit its properties</p>
    </div>
  `;
}

// ============================================================================
// EVENTS PANEL
// ============================================================================

function updateEventsPanel(componentId) {
  const component = DesignerState.formDefinition.controls.find(c => c.id === componentId);
  if (!component) return;

  const panel = document.getElementById('eventsPanel');
  panel.innerHTML = `
    <div class="property-group">
      <h6 class="property-group-header">Events</h6>
      <p class="text-muted small">Event configuration coming soon...</p>
    </div>
  `;
}

function clearEventsPanel() {
  const panel = document.getElementById('eventsPanel');
  panel.innerHTML = `
    <div class="text-center text-muted py-5">
      <i class="bi bi-lightning" style="font-size: 48px; opacity: 0.3;"></i>
      <p class="mt-3">Select a component to configure events</p>
    </div>
  `;
}

// ============================================================================
// CODE VIEW
// ============================================================================

function updateCodeView() {
  const codeEditor = document.getElementById('codeEditor');
  codeEditor.value = JSON.stringify(DesignerState.formDefinition, null, 2);

  // Listen for changes
  codeEditor.addEventListener('input', function() {
    try {
      DesignerState.formDefinition = JSON.parse(this.value);
      DesignerState.isDirty = true;
    } catch (e) {
      // Invalid JSON, don't update
    }
  });
}

// ============================================================================
// PREVIEW
// ============================================================================

function updatePreview() {
  const iframe = document.getElementById('previewIframe');

  // Generate HTML for preview
  const html = generatePreviewHTML();

  // Write to iframe
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
}

function generatePreviewHTML() {
  const theme = DesignerState.currentTheme;

  return `
    <!DOCTYPE html>
    <html lang="en" data-theme="${theme}">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${DesignerState.formDefinition.name} - Preview</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
      <link href="/css/lowcode-theme.css" rel="stylesheet">
    </head>
    <body data-theme="${theme}">
      <div class="container py-4">
        <h2>${DesignerState.formDefinition.name}</h2>
        <form>
          ${DesignerState.formDefinition.controls.map(component =>
            renderComponentPreview(component)
          ).join('')}
          <button type="submit" class="btn btn-primary">Submit</button>
        </form>
      </div>
    </body>
    </html>
  `;
}

// ============================================================================
// FORM ACTIONS (Save / Publish)
// ============================================================================

function initializeFormActions() {
  const formNameInput = document.getElementById('formNameInput');
  const saveBtn = document.getElementById('saveBtn');
  const publishBtn = document.getElementById('publishBtn');

  formNameInput.addEventListener('input', function() {
    DesignerState.formDefinition.name = this.value;
    DesignerState.isDirty = true;
  });

  saveBtn.addEventListener('click', saveForm);
  publishBtn.addEventListener('click', publishForm);

  // Auto-save every 30 seconds if dirty
  setInterval(() => {
    if (DesignerState.isDirty) {
      autoSave();
    }
  }, 30000);

  // Warn before leaving with unsaved changes
  window.addEventListener('beforeunload', function(e) {
    if (DesignerState.isDirty) {
      e.preventDefault();
      e.returnValue = '';
      return '';
    }
  });
}

async function saveForm() {
  try {
    const formData = {
      name: DesignerState.formDefinition.name,
      displayName: DesignerState.formDefinition.name,
      controls: DesignerState.formDefinition.controls,
      dataSources: DesignerState.formDefinition.dataSources,
      collections: DesignerState.formDefinition.collections,
      variables: DesignerState.formDefinition.variables,
      events: DesignerState.formDefinition.events,
      validationRules: DesignerState.formDefinition.validationRules
    };

    let response;

    if (DesignerState.formDefinition.id) {
      // Update existing form
      response = await fetch(`/lowcode/api/forms/${DesignerState.formDefinition.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
    } else {
      // Create new form - need applicationId
      // For now, use a mock applicationId (should come from route params)
      formData.applicationId = new URLSearchParams(window.location.search).get('appId') || 'mock-app-id';
      response = await fetch('/lowcode/api/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
    }

    const result = await response.json();

    if (result.success) {
      DesignerState.formDefinition.id = result.data.id;
      DesignerState.isDirty = false;
      showToast('Form saved successfully', 'success');
      updateFormStatus('draft');
    } else {
      throw new Error(result.message || 'Failed to save form');
    }
  } catch (error) {
    console.error('Save error:', error);
    showToast('Error saving form: ' + error.message, 'error');
  }
}

async function publishForm() {
  if (!DesignerState.formDefinition.controls.length) {
    showToast('Cannot publish empty form', 'warning');
    return;
  }

  if (!DesignerState.formDefinition.id) {
    showToast('Please save the form before publishing', 'warning');
    return;
  }

  try {
    const response = await fetch(`/lowcode/api/forms/${DesignerState.formDefinition.id}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    const result = await response.json();

    if (result.success) {
      DesignerState.isDirty = false;
      showToast('Form published successfully', 'success');
      updateFormStatus('published');
    } else {
      throw new Error(result.message || 'Failed to publish form');
    }
  } catch (error) {
    console.error('Publish error:', error);
    showToast('Error publishing form: ' + error.message, 'error');
  }
}

async function autoSave() {
  if (!DesignerState.formDefinition.controls.length) return;
  if (!DesignerState.formDefinition.id) return; // Can't auto-save unsaved forms

  try {
    const formData = {
      controls: DesignerState.formDefinition.controls,
      dataSources: DesignerState.formDefinition.dataSources,
      collections: DesignerState.formDefinition.collections,
      variables: DesignerState.formDefinition.variables,
      events: DesignerState.formDefinition.events,
      validationRules: DesignerState.formDefinition.validationRules
    };

    const response = await fetch(`/lowcode/api/forms/${DesignerState.formDefinition.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });

    const result = await response.json();

    if (result.success) {
      DesignerState.isDirty = false;
      showToast('Auto-saved', 'info', 2000);
    }
  } catch (error) {
    console.error('Auto-save error:', error);
    // Don't show error toast for auto-save failures (non-intrusive)
  }
}

function updateFormStatus(status) {
  const badge = document.getElementById('formStatus');
  badge.className = `status-badge ${status}`;
  badge.textContent = status.charAt(0).toUpperCase() + status.slice(1);
  DesignerState.formDefinition.status = status;
}

// ============================================================================
// COMPONENT SEARCH
// ============================================================================

function initializeComponentSearch() {
  const searchInput = document.getElementById('componentSearch');

  searchInput.addEventListener('input', function() {
    const query = this.value.toLowerCase();

    document.querySelectorAll('.component-item').forEach(item => {
      const text = item.textContent.toLowerCase();
      const match = text.includes(query);
      item.style.display = match ? 'flex' : 'none';
    });
  });
}

// ============================================================================
// TOAST NOTIFICATIONS
// ============================================================================

function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toastContainer');

  const toast = document.createElement('div');
  toast.className = `lowcode-toast ${type}`;
  toast.innerHTML = `
    <i class="bi bi-${getToastIcon(type)}"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  // Trigger animation
  setTimeout(() => toast.classList.add('show'), 10);

  // Remove after duration
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function getToastIcon(type) {
  switch (type) {
    case 'success': return 'check-circle';
    case 'error': return 'x-circle';
    case 'warning': return 'exclamation-triangle';
    case 'info':
    default: return 'info-circle';
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
