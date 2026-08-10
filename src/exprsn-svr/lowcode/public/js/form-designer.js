/**
 * ═══════════════════════════════════════════════════════════
 * Exprsn Form Designer - Visual Form Builder Engine
 * ═══════════════════════════════════════════════════════════
 */

(function() {
  'use strict';

  // ═══════════════════════════════════════════════════════════
  // Component Library - All available form components
  // ═══════════════════════════════════════════════════════════

  const COMPONENT_LIBRARY = {
    basic: [
      {
        type: 'text',
        name: 'Text Input',
        icon: 'fas fa-font',
        defaultProps: {
          label: 'Text Field',
          placeholder: 'Enter text...',
          required: false,
          readonly: false,
          maxLength: 255
        },
        render: (props) => `
          <div class="form-group">
            <label>${props.label}${props.required ? ' <span class="text-danger">*</span>' : ''}</label>
            <input type="text" class="form-control" placeholder="${props.placeholder}"
                   ${props.readonly ? 'readonly' : ''} ${props.required ? 'required' : ''}
                   maxlength="${props.maxLength}">
          </div>
        `
      },
      {
        type: 'textarea',
        name: 'Text Area',
        icon: 'fas fa-align-left',
        defaultProps: {
          label: 'Text Area',
          placeholder: 'Enter text...',
          rows: 4,
          required: false,
          readonly: false
        },
        render: (props) => `
          <div class="form-group">
            <label>${props.label}${props.required ? ' <span class="text-danger">*</span>' : ''}</label>
            <textarea class="form-control" rows="${props.rows}" placeholder="${props.placeholder}"
                      ${props.readonly ? 'readonly' : ''} ${props.required ? 'required' : ''}></textarea>
          </div>
        `
      },
      {
        type: 'number',
        name: 'Number',
        icon: 'fas fa-hashtag',
        defaultProps: {
          label: 'Number Field',
          placeholder: '0',
          min: null,
          max: null,
          step: 1,
          required: false,
          readonly: false
        },
        render: (props) => `
          <div class="form-group">
            <label>${props.label}${props.required ? ' <span class="text-danger">*</span>' : ''}</label>
            <input type="number" class="form-control" placeholder="${props.placeholder}"
                   ${props.min !== null ? `min="${props.min}"` : ''}
                   ${props.max !== null ? `max="${props.max}"` : ''}
                   step="${props.step}"
                   ${props.readonly ? 'readonly' : ''} ${props.required ? 'required' : ''}>
          </div>
        `
      },
      {
        type: 'email',
        name: 'Email',
        icon: 'fas fa-envelope',
        defaultProps: {
          label: 'Email',
          placeholder: 'email@example.com',
          required: false,
          readonly: false
        },
        render: (props) => `
          <div class="form-group">
            <label>${props.label}${props.required ? ' <span class="text-danger">*</span>' : ''}</label>
            <input type="email" class="form-control" placeholder="${props.placeholder}"
                   ${props.readonly ? 'readonly' : ''} ${props.required ? 'required' : ''}>
          </div>
        `
      },
      {
        type: 'date',
        name: 'Date',
        icon: 'fas fa-calendar',
        defaultProps: {
          label: 'Date',
          required: false,
          readonly: false
        },
        render: (props) => `
          <div class="form-group">
            <label>${props.label}${props.required ? ' <span class="text-danger">*</span>' : ''}</label>
            <input type="date" class="form-control"
                   ${props.readonly ? 'readonly' : ''} ${props.required ? 'required' : ''}>
          </div>
        `
      },
      {
        type: 'checkbox',
        name: 'Checkbox',
        icon: 'fas fa-check-square',
        defaultProps: {
          label: 'Checkbox',
          text: 'Check this box',
          required: false,
          readonly: false
        },
        render: (props) => `
          <div class="form-group">
            <div class="form-check">
              <input type="checkbox" class="form-check-input"
                     ${props.readonly ? 'disabled' : ''} ${props.required ? 'required' : ''}>
              <label class="form-check-label">${props.text}</label>
            </div>
          </div>
        `
      },
      {
        type: 'radio',
        name: 'Radio Group',
        icon: 'fas fa-dot-circle',
        defaultProps: {
          label: 'Radio Group',
          options: ['Option 1', 'Option 2', 'Option 3'],
          required: false,
          readonly: false
        },
        render: (props) => `
          <div class="form-group">
            <label>${props.label}${props.required ? ' <span class="text-danger">*</span>' : ''}</label>
            ${props.options.map((opt, idx) => `
              <div class="form-check">
                <input type="radio" class="form-check-input" name="radio-${Date.now()}"
                       ${props.readonly ? 'disabled' : ''}>
                <label class="form-check-label">${opt}</label>
              </div>
            `).join('')}
          </div>
        `
      },
      {
        type: 'select',
        name: 'Dropdown',
        icon: 'fas fa-caret-square-down',
        defaultProps: {
          label: 'Dropdown',
          options: ['Option 1', 'Option 2', 'Option 3'],
          required: false,
          readonly: false
        },
        render: (props) => `
          <div class="form-group">
            <label>${props.label}${props.required ? ' <span class="text-danger">*</span>' : ''}</label>
            <select class="form-control" ${props.readonly ? 'disabled' : ''} ${props.required ? 'required' : ''}>
              <option value="">Select...</option>
              ${props.options.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
            </select>
          </div>
        `
      },
      {
        type: 'button',
        name: 'Button',
        icon: 'fas fa-hand-pointer',
        defaultProps: {
          text: 'Click Me',
          style: 'primary',
          type: 'button'
        },
        render: (props) => `
          <button type="${props.type}" class="btn btn-${props.style}">${props.text}</button>
        `
      },
      {
        type: 'label',
        name: 'Label',
        icon: 'fas fa-tag',
        defaultProps: {
          text: 'Label Text',
          style: 'normal'
        },
        render: (props) => `
          <label class="${props.style === 'bold' ? 'font-weight-bold' : ''}">${props.text}</label>
        `
      },
      {
        type: 'heading',
        name: 'Heading',
        icon: 'fas fa-heading',
        defaultProps: {
          text: 'Heading',
          level: 2
        },
        render: (props) => `
          <h${props.level}>${props.text}</h${props.level}>
        `
      },
      {
        type: 'paragraph',
        name: 'Paragraph',
        icon: 'fas fa-paragraph',
        defaultProps: {
          text: 'This is a paragraph of text.'
        },
        render: (props) => `
          <p>${props.text}</p>
        `
      }
    ],

    data: [
      {
        type: 'entity-picker',
        name: 'Entity Picker',
        icon: 'fas fa-database',
        defaultProps: {
          label: 'Select Entity',
          entity: null,
          displayField: 'name',
          required: false
        },
        render: (props) => `
          <div class="form-group">
            <label>${props.label}${props.required ? ' <span class="text-danger">*</span>' : ''}</label>
            <div class="input-group">
              <input type="text" class="form-control" placeholder="Search ${props.entity || 'entity'}..." readonly>
              <div class="input-group-append">
                <button class="btn btn-outline-secondary" type="button">
                  <i class="fas fa-search"></i>
                </button>
              </div>
            </div>
            <small class="form-text text-muted">Entity: ${props.entity || 'Not selected'}</small>
          </div>
        `
      },
      {
        type: 'crud-interface',
        name: 'CRUD Interface',
        icon: 'fas fa-table',
        defaultProps: {
          entity: null,
          allowCreate: true,
          allowRead: true,
          allowUpdate: true,
          allowDelete: true
        },
        render: (props) => `
          <div class="card">
            <div class="card-header d-flex justify-content-between align-items-center">
              <span><i class="fas fa-database"></i> ${props.entity || 'Entity'} Records</span>
              ${props.allowCreate ? '<button class="btn btn-sm btn-primary"><i class="fas fa-plus"></i> New</button>' : ''}
            </div>
            <div class="card-body">
              <div class="table-responsive">
                <table class="table table-hover">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Name</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colspan="3" class="text-center text-muted">No records found</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        `
      },
      {
        type: 'subgrid',
        name: 'Subgrid',
        icon: 'fas fa-th',
        defaultProps: {
          label: 'Related Records',
          entity: null,
          columns: ['Name', 'Status', 'Date'],
          editable: true,
          readonly: false
        },
        render: (props) => `
          <div class="form-group">
            <label>${props.label}</label>
            <div class="table-responsive">
              <table class="table table-sm table-bordered">
                <thead class="thead-light">
                  <tr>
                    ${props.columns.map(col => `<th>${col}</th>`).join('')}
                    ${!props.readonly ? '<th width="100">Actions</th>' : ''}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colspan="${props.columns.length + (!props.readonly ? 1 : 0)}" class="text-center text-muted">
                      No records
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            ${props.editable && !props.readonly ? '<button class="btn btn-sm btn-outline-primary"><i class="fas fa-plus"></i> Add Row</button>' : ''}
          </div>
        `
      },
      {
        type: 'options-list',
        name: 'Options List',
        icon: 'fas fa-list-ul',
        defaultProps: {
          label: 'Options',
          dataSource: 'static',
          staticOptions: ['Option 1', 'Option 2', 'Option 3'],
          entitySource: null
        },
        render: (props) => `
          <div class="form-group">
            <label>${props.label}</label>
            <select class="form-control">
              <option value="">Select...</option>
              ${props.staticOptions.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
            </select>
            <small class="form-text text-muted">Source: ${props.dataSource}</small>
          </div>
        `
      },
      {
        type: 'file-upload',
        name: 'File Upload',
        icon: 'fas fa-upload',
        defaultProps: {
          label: 'Upload File',
          accept: '*',
          multiple: false,
          maxSize: 10
        },
        render: (props) => `
          <div class="form-group">
            <label>${props.label}</label>
            <div class="custom-file">
              <input type="file" class="custom-file-input" ${props.multiple ? 'multiple' : ''} accept="${props.accept}">
              <label class="custom-file-label">Choose file...</label>
            </div>
            <small class="form-text text-muted">Max size: ${props.maxSize} MB</small>
          </div>
        `
      }
    ],

    layout: [
      {
        type: 'container',
        name: 'Container',
        icon: 'fas fa-square',
        defaultProps: {
          columns: 1,
          padding: 'normal'
        },
        render: (props) => `
          <div class="container-fluid p-${props.padding === 'normal' ? '3' : props.padding === 'large' ? '4' : '2'}">
            <div class="row">
              <div class="col-12">
                <p class="text-muted text-center">Drop components here</p>
              </div>
            </div>
          </div>
        `
      },
      {
        type: 'tabs',
        name: 'Tabs',
        icon: 'fas fa-folder',
        defaultProps: {
          tabs: ['Tab 1', 'Tab 2', 'Tab 3']
        },
        render: (props) => `
          <ul class="nav nav-tabs">
            ${props.tabs.map((tab, idx) => `
              <li class="nav-item">
                <a class="nav-link ${idx === 0 ? 'active' : ''}" href="#">${tab}</a>
              </li>
            `).join('')}
          </ul>
          <div class="tab-content p-3 border border-top-0">
            <p class="text-muted">Tab content area</p>
          </div>
        `
      },
      {
        type: 'accordion',
        name: 'Accordion',
        icon: 'fas fa-bars',
        defaultProps: {
          sections: ['Section 1', 'Section 2', 'Section 3']
        },
        render: (props) => `
          <div class="accordion">
            ${props.sections.map((section, idx) => `
              <div class="card">
                <div class="card-header">
                  <button class="btn btn-link">${section}</button>
                </div>
                <div class="collapse ${idx === 0 ? 'show' : ''}">
                  <div class="card-body">Content for ${section}</div>
                </div>
              </div>
            `).join('')}
          </div>
        `
      },
      {
        type: 'divider',
        name: 'Divider',
        icon: 'fas fa-minus',
        defaultProps: {
          style: 'solid'
        },
        render: (props) => `
          <hr class="border-${props.style}">
        `
      },
      {
        type: 'spacer',
        name: 'Spacer',
        icon: 'fas fa-arrows-alt-v',
        defaultProps: {
          height: 20
        },
        render: (props) => `
          <div style="height: ${props.height}px;"></div>
        `
      }
    ]
  };

  // ═══════════════════════════════════════════════════════════
  // Form Designer State Manager
  // ═══════════════════════════════════════════════════════════

  class FormDesigner {
    constructor() {
      this.state = window.FORM_DESIGNER_STATE;
      this.components = [];
      this.selectedComponent = null;
      this.monacoEditor = null;
      this.currentCodeTab = 'functions';
      this.customFunctions = {};
      this.eventHandlers = {};
      this.variables = {};
      this.undoStack = [];
      this.redoStack = [];

      this.init();
    }

    async init() {
      console.log('[FormDesigner] Initializing...', this.state);

      // Initialize data binding manager
      if (window.DataBindingManager) {
        this.dataBinding = new window.DataBindingManager(this);
        await this.dataBinding.init();
      }

      // Initialize event handler manager
      if (window.EventHandlerManager) {
        this.eventHandlerMgr = new window.EventHandlerManager(this);
        await this.eventHandlerMgr.init();
      }

      // Initialize permissions manager
      if (window.PermissionsManager) {
        this.permissions = new window.PermissionsManager(this);
        await this.permissions.init();
      }

      // Initialize workflow integration
      if (window.WorkflowIntegration) {
        this.workflow = new window.WorkflowIntegration(this);
        await this.workflow.init();
      }

      // Initialize Forge CRM integration
      if (window.ForgeIntegration) {
        this.forge = new window.ForgeIntegration(this);
        await this.forge.init();
      }

      // Initialize UI components
      this.initializeToolbox();
      this.initializeCanvas();
      this.initializeProperties();
      this.initializeCodeEditor();
      this.initializeEventHandlers();

      // Load existing form if editing
      if (this.state.form) {
        this.loadForm(this.state.form);
      }

      console.log('[FormDesigner] Initialization complete');
    }

    // ───────────────────────────────────────────────────────────
    // Toolbox Initialization
    // ───────────────────────────────────────────────────────────

    initializeToolbox() {
      console.log('[FormDesigner] Initializing toolbox...');

      // Setup toolbox tabs
      const toolboxTabs = document.querySelectorAll('.toolbox-tab');
      toolboxTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
          const tabName = e.target.getAttribute('data-tab');
          this.switchToolboxTab(tabName);
        });
      });

      // Load initial tab (basic)
      this.switchToolboxTab('basic');
    }

    switchToolboxTab(tabName) {
      console.log('[FormDesigner] Switching to tab:', tabName);

      // Update active tab
      document.querySelectorAll('.toolbox-tab').forEach(tab => {
        tab.classList.toggle('active', tab.getAttribute('data-tab') === tabName);
      });

      // Render components for this tab
      this.renderToolboxComponents(tabName);
    }

    renderToolboxComponents(category) {
      const toolboxContent = document.getElementById('toolboxContent');
      const components = COMPONENT_LIBRARY[category] || [];

      const groupHtml = `
        <div class="component-group">
          <div class="group-title">${category.toUpperCase()}</div>
          <div class="component-list">
            ${components.map(comp => `
              <div class="component-item" draggable="true" data-component-type="${comp.type}" data-category="${category}">
                <div class="component-icon">
                  <i class="${comp.icon}"></i>
                </div>
                <div class="component-name">${comp.name}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;

      toolboxContent.innerHTML = groupHtml;

      // Add drag event listeners
      const componentItems = toolboxContent.querySelectorAll('.component-item');
      componentItems.forEach(item => {
        item.addEventListener('dragstart', (e) => this.handleDragStart(e));
        item.addEventListener('dragend', (e) => this.handleDragEnd(e));
      });
    }

    // ───────────────────────────────────────────────────────────
    // Drag and Drop Handling
    // ───────────────────────────────────────────────────────────

    handleDragStart(e) {
      const componentType = e.target.getAttribute('data-component-type');
      const category = e.target.getAttribute('data-category');

      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('component-type', componentType);
      e.dataTransfer.setData('component-category', category);

      console.log('[FormDesigner] Drag start:', componentType);
    }

    handleDragEnd(e) {
      console.log('[FormDesigner] Drag end');
    }

    // ───────────────────────────────────────────────────────────
    // Canvas Initialization
    // ───────────────────────────────────────────────────────────

    initializeCanvas() {
      console.log('[FormDesigner] Initializing canvas...');

      const canvas = document.getElementById('formCanvas');

      // Drop zone event listeners
      canvas.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        canvas.classList.add('drag-over');
      });

      canvas.addEventListener('dragleave', (e) => {
        canvas.classList.remove('drag-over');
      });

      canvas.addEventListener('drop', (e) => {
        e.preventDefault();
        canvas.classList.remove('drag-over');

        const componentType = e.dataTransfer.getData('component-type');
        const category = e.dataTransfer.getData('component-category');

        if (componentType && category) {
          this.addComponentToCanvas(componentType, category);
        }
      });

      // Remove empty class when components exist
      if (this.components.length > 0) {
        canvas.classList.remove('empty');
      }
    }

    addComponentToCanvas(type, category) {
      console.log('[FormDesigner] Adding component:', type, category);

      // Find component definition
      const componentDef = COMPONENT_LIBRARY[category].find(c => c.type === type);
      if (!componentDef) {
        console.error('[FormDesigner] Component not found:', type);
        return;
      }

      // Create component instance
      const component = {
        id: this.generateComponentId(),
        type: type,
        category: category,
        props: { ...componentDef.defaultProps },
        events: {},
        definition: componentDef
      };

      this.components.push(component);
      this.renderCanvas();
      this.selectComponent(component.id);
      this.saveToUndoStack();

      console.log('[FormDesigner] Component added:', component);
    }

    renderCanvas() {
      const canvas = document.getElementById('formCanvas');

      if (this.components.length === 0) {
        canvas.classList.add('empty');
        canvas.innerHTML = '';
        return;
      }

      canvas.classList.remove('empty');

      const componentsHtml = this.components.map(comp => {
        const isSelected = this.selectedComponent === comp.id;
        return `
          <div class="form-component ${isSelected ? 'selected' : ''}" data-component-id="${comp.id}">
            ${comp.definition.render(comp.props)}
            <div class="component-controls">
              <button class="control-btn" data-action="delete" data-component-id="${comp.id}" title="Delete">
                <i class="fas fa-trash"></i>
              </button>
              <button class="control-btn" data-action="duplicate" data-component-id="${comp.id}" title="Duplicate">
                <i class="fas fa-copy"></i>
              </button>
            </div>
          </div>
        `;
      }).join('');

      canvas.innerHTML = componentsHtml;

      // Add click handlers for components
      canvas.querySelectorAll('.form-component').forEach(elem => {
        // Use mousedown for more reliable selection
        elem.addEventListener('mousedown', (e) => {
          // Don't interfere with control buttons
          if (e.target.closest('.control-btn')) {
            return;
          }

          // Allow form inputs to work normally but still select component
          const componentId = elem.getAttribute('data-component-id');
          this.selectComponent(componentId);
        });

        // Also support click for accessibility
        elem.addEventListener('click', (e) => {
          // Don't interfere with control buttons or actual form interactions
          if (e.target.closest('.control-btn')) {
            return;
          }

          // Prevent default on preview elements to avoid unwanted behavior
          if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A') {
            e.preventDefault();
          }

          const componentId = elem.getAttribute('data-component-id');
          this.selectComponent(componentId);
        });
      });

      // Add control button handlers
      canvas.querySelectorAll('.control-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          const action = btn.getAttribute('data-action');
          const componentId = btn.getAttribute('data-component-id');

          if (action === 'delete') {
            this.deleteComponent(componentId);
          } else if (action === 'duplicate') {
            this.duplicateComponent(componentId);
          }
        });
      });

      // Deselect when clicking on empty canvas area
      canvas.addEventListener('click', (e) => {
        if (e.target === canvas || e.target.classList.contains('form-canvas')) {
          this.selectedComponent = null;
          this.renderCanvas();
          this.renderProperties();
        }
      });
    }

    selectComponent(componentId) {
      this.selectedComponent = componentId;
      this.renderCanvas();
      this.renderProperties();
      console.log('[FormDesigner] Component selected:', componentId);
    }

    deleteComponent(componentId) {
      this.components = this.components.filter(c => c.id !== componentId);
      if (this.selectedComponent === componentId) {
        this.selectedComponent = null;
      }
      this.renderCanvas();
      this.renderProperties();
      this.saveToUndoStack();
    }

    duplicateComponent(componentId) {
      const original = this.components.find(c => c.id === componentId);
      if (!original) return;

      const duplicate = {
        ...original,
        id: this.generateComponentId(),
        props: { ...original.props }
      };

      this.components.push(duplicate);
      this.renderCanvas();
      this.saveToUndoStack();
    }

    // ───────────────────────────────────────────────────────────
    // Properties Panel
    // ───────────────────────────────────────────────────────────

    initializeProperties() {
      console.log('[FormDesigner] Initializing properties panel...');
      this.renderProperties();
    }

    renderProperties() {
      const propertiesContent = document.getElementById('propertiesContent');

      if (!this.selectedComponent) {
        propertiesContent.innerHTML = `
          <div class="property-group">
            <div class="property-group-title">Form Settings</div>
            <p style="color: var(--text-secondary); font-size: 0.875rem;">
              Select a component to edit its properties
            </p>
          </div>
        `;
        return;
      }

      const component = this.components.find(c => c.id === this.selectedComponent);
      if (!component) return;

      const propertiesHtml = `
        <div style="background: linear-gradient(135deg, var(--primary-color), #005a9e);
                    padding: 1rem; margin: -1rem -1rem 1rem -1rem; color: white;
                    border-radius: 6px 6px 0 0;">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div style="width: 40px; height: 40px; background: rgba(255,255,255,0.2);
                        border-radius: 8px; display: flex; align-items: center;
                        justify-content: center; font-size: 1.25rem;">
              <i class="${component.definition.icon}"></i>
            </div>
            <div style="flex: 1;">
              <div style="font-weight: 600; font-size: 0.95rem;">${component.definition.name}</div>
              <div style="font-size: 0.7rem; opacity: 0.9;">ID: ${component.id.substring(0, 12)}...</div>
            </div>
          </div>
        </div>
        <div class="property-group">
          <div class="property-group-title">Properties</div>
          ${this.renderPropertyFields(component)}
        </div>
        ${this.dataBinding ? `
        <div class="property-group">
          <div class="property-group-title">Data Binding</div>
          ${this.renderDataBindingFields(component)}
        </div>
        ` : ''}
        <div class="property-group">
          <div class="property-group-title">Events</div>
          ${this.renderEventFields(component)}
        </div>
      `;

      propertiesContent.innerHTML = propertiesHtml;

      // Setup data source selector handler
      if (this.dataBinding) {
        const dataSourceSelect = document.getElementById('dataSourceSelect');
        if (dataSourceSelect) {
          dataSourceSelect.addEventListener('change', (e) => {
            if (e.target.value === '__new__') {
              this.dataBinding.showDataSourceModal();
            } else if (e.target.value) {
              this.handleDataSourceBinding(component.id, e.target.value);
            }
          });
        }
      }

      // Add event listeners for property changes
      propertiesContent.querySelectorAll('.property-input').forEach(input => {
        input.addEventListener('change', (e) => {
          this.handlePropertyChange(component.id, e.target.name, e.target.value, e.target);
        });

        // For text inputs, also update on input (real-time)
        if (input.type === 'text' || input.type === 'number' || input.tagName === 'TEXTAREA') {
          input.addEventListener('input', (e) => {
            // Debounce real-time updates
            clearTimeout(this._inputDebounce);
            this._inputDebounce = setTimeout(() => {
              this.handlePropertyChange(component.id, e.target.name, e.target.value, e.target);
            }, 300);
          });
        }
      });
    }

    renderPropertyFields(component) {
      const props = component.props;

      return Object.keys(props).map(key => {
        const value = props[key];
        const type = typeof value;

        let inputHtml = '';

        if (type === 'boolean') {
          inputHtml = `
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <input type="checkbox" class="property-input" name="${key}" ${value ? 'checked' : ''} id="prop_${key}">
              <label for="prop_${key}" style="margin: 0; cursor: pointer; font-weight: normal; text-transform: none;">
                ${value ? 'Enabled' : 'Disabled'}
              </label>
            </div>
          `;
        } else if (type === 'number') {
          inputHtml = `
            <input type="number" class="property-input" name="${key}" value="${value}"
                   style="font-family: monospace;">
          `;
        } else if (Array.isArray(value)) {
          inputHtml = `
            <textarea class="property-input" name="${key}" rows="4"
                      style="font-family: monospace; resize: vertical;">${value.join('\n')}</textarea>
            <small class="form-text" style="color: var(--text-secondary); font-size: 0.7rem; display: block; margin-top: 0.25rem;">
              <i class="fas fa-info-circle"></i> One item per line
            </small>
          `;
        } else if (key === 'style' || key === 'type' || key === 'level') {
          // Special handling for dropdown-style properties
          let options = [];
          if (key === 'style') {
            options = component.type === 'button'
              ? ['primary', 'secondary', 'success', 'danger', 'warning', 'info', 'light', 'dark']
              : ['normal', 'bold', 'italic'];
          } else if (key === 'type' && component.type === 'button') {
            options = ['button', 'submit', 'reset'];
          } else if (key === 'level') {
            options = ['1', '2', '3', '4', '5', '6'];
          }

          if (options.length > 0) {
            inputHtml = `
              <select class="property-input" name="${key}">
                ${options.map(opt => `
                  <option value="${opt}" ${value == opt ? 'selected' : ''}>${opt}</option>
                `).join('')}
              </select>
            `;
          } else {
            inputHtml = `
              <input type="text" class="property-input" name="${key}" value="${value || ''}">
            `;
          }
        } else {
          inputHtml = `
            <input type="text" class="property-input" name="${key}" value="${value || ''}"
                   placeholder="Enter ${this.formatPropertyName(key).toLowerCase()}...">
          `;
        }

        return `
          <div class="property-field">
            <label class="property-label">${this.formatPropertyName(key)}</label>
            ${inputHtml}
          </div>
        `;
      }).join('');
    }

    renderEventFields(component) {
      if (!this.eventHandlerMgr) {
        return '<p style="color: var(--text-secondary); font-size: 0.875rem;">Event handlers not available</p>';
      }

      const events = ['onClick', 'onChange', 'onFocus', 'onBlur', 'onSubmit'];

      return events.map(eventName => {
        const handlers = this.eventHandlerMgr.getEventHandlers(component.id, eventName);
        const handlerCount = handlers.length;

        return `
          <div class="property-field">
            <label class="property-label">${eventName}</label>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <button class="btn btn-sm btn-outline-primary"
                      onclick="window.formDesigner.configureEvent('${component.id}', '${eventName}')"
                      style="flex: 1;">
                <i class="fas fa-cog"></i> Configure
                ${handlerCount > 0 ? ` (${handlerCount})` : ''}
              </button>
              ${handlerCount > 0 ? `
                <span class="badge badge-success">${handlerCount} handler${handlerCount !== 1 ? 's' : ''}</span>
              ` : ''}
            </div>
          </div>
        `;
      }).join('');
    }

    configureEvent(componentId, eventName) {
      console.log('[FormDesigner] Configuring event:', componentId, eventName);

      if (!this.eventHandlerMgr) {
        alert('Event handler manager not available');
        return;
      }

      // Show event configuration modal
      alert(`Event configuration for ${eventName} - Full UI coming soon!\n\nYou can manually configure events in the Code tab.`);

      // TODO: Implement full event configuration modal
      // For now, users can use the Monaco editor to write custom event handlers
    }

    handlePropertyChange(componentId, propName, propValue, inputElement) {
      const component = this.components.find(c => c.id === componentId);
      if (!component) return;

      // Handle different property types
      if (typeof component.props[propName] === 'boolean') {
        // For checkboxes, use the checked property
        component.props[propName] = inputElement ? inputElement.checked : (propValue === 'true' || propValue === true);
      } else if (typeof component.props[propName] === 'number') {
        // Parse numbers
        component.props[propName] = parseFloat(propValue) || 0;
      } else if (Array.isArray(component.props[propName])) {
        // Handle array properties (textarea with one item per line)
        component.props[propName] = propValue.split('\n').filter(v => v.trim());
      } else {
        // String properties
        component.props[propName] = propValue;
      }

      this.renderCanvas();
      this.saveToUndoStack();
      console.log('[FormDesigner] Property changed:', propName, component.props[propName]);
    }

    formatPropertyName(name) {
      return name.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
    }

    renderDataBindingFields(component) {
      if (!this.dataBinding) return '';

      const binding = this.dataBinding.getComponentBinding(component.id);

      return `
        <div class="property-field">
          ${this.dataBinding.renderDataSourceSelector()}
        </div>
        ${binding ? `
          <div class="property-field">
            <label class="property-label">Field Path</label>
            <input type="text" class="property-input" id="fieldPath"
                   value="${binding.fieldPath || ''}"
                   placeholder="e.g., customer.name">
            <small class="form-text text-muted">Use dot notation for nested fields</small>
          </div>
          <div class="property-field">
            <label class="property-label">Binding Mode</label>
            <select class="property-input" id="bindingMode">
              <option value="two-way" ${binding.bindingMode === 'two-way' ? 'selected' : ''}>Two-Way</option>
              <option value="one-way" ${binding.bindingMode === 'one-way' ? 'selected' : ''}>One-Way</option>
              <option value="one-time" ${binding.bindingMode === 'one-time' ? 'selected' : ''}>One-Time</option>
            </select>
          </div>
        ` : ''}
        <div class="property-field">
          <button class="btn btn-sm btn-outline-primary" id="addDataSourceBtn">
            <i class="fas fa-plus"></i> Add Data Source
          </button>
        </div>
      `;
    }

    handleDataSourceBinding(componentId, dataSourceId) {
      if (!this.dataBinding) return;

      console.log('[FormDesigner] Binding component to data source:', componentId, dataSourceId);

      this.dataBinding.bindComponentToField(componentId, {
        dataSourceId,
        fieldPath: '',
        mode: 'two-way'
      });

      this.renderProperties();
    }

    // ───────────────────────────────────────────────────────────
    // Code Editor (Monaco)
    // ───────────────────────────────────────────────────────────

    initializeCodeEditor() {
      console.log('[FormDesigner] Initializing Monaco Editor...');

      // Setup code tabs
      const codeTabs = document.querySelectorAll('.code-tab');
      codeTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
          const tabName = e.target.getAttribute('data-code-tab');
          this.switchCodeTab(tabName);
        });
      });

      // Initialize Monaco
      require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' } });

      require(['vs/editor/editor.main'], () => {
        this.monacoEditor = monaco.editor.create(document.getElementById('codeEditor'), {
          value: '// Define custom functions here\n\nfunction onButtonClick() {\n  console.log("Button clicked!");\n}\n',
          language: 'javascript',
          theme: 'vs-dark',
          automaticLayout: true,
          minimap: { enabled: false },
          fontSize: 14,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          wordWrap: 'on'
        });

        console.log('[FormDesigner] Monaco Editor initialized');
      });
    }

    switchCodeTab(tabName) {
      console.log('[FormDesigner] Switching to code tab:', tabName);

      // Update active tab
      document.querySelectorAll('.code-tab').forEach(tab => {
        tab.classList.toggle('active', tab.getAttribute('data-code-tab') === tabName);
      });

      this.currentCodeTab = tabName;

      const editorDiv = document.getElementById('codeEditor');

      // Handle tabs with custom UI (not Monaco editor)
      if (tabName === 'permissions') {
        if (this.permissions) {
          editorDiv.innerHTML = this.permissions.renderPermissionsPanel();
          this.permissions.setupPermissionEventHandlers();
        } else {
          editorDiv.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-secondary);">Permissions manager not available</div>';
        }
        return;
      }

      if (tabName === 'workflow') {
        if (this.workflow) {
          editorDiv.innerHTML = this.workflow.renderWorkflowPanel();
          this.workflow.setupWorkflowEventHandlers();
        } else {
          editorDiv.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-secondary);">Workflow integration not available</div>';
        }
        return;
      }

      if (tabName === 'forge') {
        if (this.forge) {
          editorDiv.innerHTML = this.forge.renderForgePanel();
          this.forge.setupForgeEventHandlers();
        } else {
          editorDiv.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-secondary);">Forge integration not available</div>';
        }
        return;
      }

      // Update editor content based on tab (Monaco-based tabs)
      if (this.monacoEditor) {
        let content = '';

        switch(tabName) {
          case 'functions':
            content = '// Custom Functions\n\n' + (this.customFunctions.code || '');
            break;
          case 'events':
            content = '// Event Handlers\n\n' + (this.eventHandlers.code || '');
            break;
          case 'variables':
            content = JSON.stringify(this.variables, null, 2);
            this.monacoEditor.updateOptions({ language: 'json' });
            break;
          case 'json':
            content = JSON.stringify(this.getFormDefinition(), null, 2);
            this.monacoEditor.updateOptions({ language: 'json' });
            break;
        }

        this.monacoEditor.setValue(content);
      }
    }

    // ───────────────────────────────────────────────────────────
    // Event Handlers Setup
    // ───────────────────────────────────────────────────────────

    initializeEventHandlers() {
      // Save button
      document.getElementById('saveBtn').addEventListener('click', () => {
        this.saveForm();
      });

      // Preview button
      document.getElementById('previewBtn').addEventListener('click', () => {
        this.previewForm();
      });

      // Publish button
      document.getElementById('publishBtn').addEventListener('click', () => {
        this.publishForm();
      });

      // Undo/Redo buttons
      document.getElementById('undoBtn').addEventListener('click', () => {
        this.undo();
      });

      document.getElementById('redoBtn').addEventListener('click', () => {
        this.redo();
      });

      // Form type selector
      document.getElementById('formTypeSelect').addEventListener('change', (e) => {
        this.state.form = this.state.form || {};
        this.state.form.formType = e.target.value;
        console.log('[FormDesigner] Form type changed:', e.target.value);
      });

      // Form name input
      document.getElementById('formDisplayName').addEventListener('change', (e) => {
        this.state.form = this.state.form || {};
        this.state.form.displayName = e.target.value;
        this.state.isDirty = true;
      });

      // Add function button
      document.getElementById('addFunctionBtn').addEventListener('click', () => {
        this.addCustomFunction();
      });
    }

    // ───────────────────────────────────────────────────────────
    // Form Operations
    // ───────────────────────────────────────────────────────────

    getFormDefinition() {
      const definition = {
        id: this.state.formId,
        displayName: document.getElementById('formDisplayName').value,
        formType: document.getElementById('formTypeSelect').value,
        components: this.components.map(comp => ({
          id: comp.id,
          type: comp.type,
          category: comp.category,
          props: comp.props,
          events: comp.events
        })),
        customFunctions: this.customFunctions,
        eventHandlers: this.eventHandlers,
        variables: this.variables,
        metadata: {
          version: '1.0',
          lastModified: new Date().toISOString()
        }
      };

      // Add permissions if available
      if (this.permissions) {
        definition.permissions = this.permissions.getFormDefinition();
      }

      // Add workflow configuration if available
      if (this.workflow) {
        const workflowDef = this.workflow.getFormDefinition();
        if (workflowDef.workflowTriggers) {
          definition.workflowTriggers = workflowDef.workflowTriggers;
        }
      }

      // Add Forge CRM configuration if available
      if (this.forge) {
        const forgeDef = this.forge.getFormDefinition();
        if (forgeDef.forgeIntegration) {
          definition.forgeIntegration = forgeDef.forgeIntegration;
        }
      }

      return definition;
    }

    async saveForm() {
      console.log('[FormDesigner] Saving form...');

      const formData = this.getFormDefinition();

      try {
        const url = this.state.formId
          ? `/lowcode/api/forms/${this.state.formId}`
          : `/lowcode/api/forms`;

        const method = this.state.formId ? 'PUT' : 'POST';

        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...formData,
            applicationId: this.state.appId
          })
        });

        const result = await response.json();

        if (result.success) {
          this.state.formId = result.data.id;
          this.state.isDirty = false;
          this.showNotification('Form saved successfully!', 'success');
          console.log('[FormDesigner] Form saved:', result.data);
        } else {
          this.showNotification('Failed to save form: ' + result.message, 'error');
        }
      } catch (error) {
        console.error('[FormDesigner] Save error:', error);
        this.showNotification('Error saving form', 'error');
      }
    }

    previewForm() {
      console.log('[FormDesigner] Previewing form...');
      // TODO: Open preview in modal or new window
      alert('Preview feature coming soon!');
    }

    async publishForm() {
      console.log('[FormDesigner] Publishing form...');

      if (!this.state.formId) {
        this.showNotification('Please save the form first', 'warning');
        return;
      }

      try {
        const response = await fetch(`/lowcode/api/forms/${this.state.formId}/publish`, {
          method: 'POST'
        });

        const result = await response.json();

        if (result.success) {
          this.showNotification('Form published successfully!', 'success');
        } else {
          this.showNotification('Failed to publish form: ' + result.message, 'error');
        }
      } catch (error) {
        console.error('[FormDesigner] Publish error:', error);
        this.showNotification('Error publishing form', 'error');
      }
    }

    loadForm(formData) {
      console.log('[FormDesigner] Loading form:', formData);

      if (formData.components) {
        this.components = formData.components.map(comp => ({
          ...comp,
          definition: COMPONENT_LIBRARY[comp.category].find(c => c.type === comp.type)
        }));
      }

      if (formData.customFunctions) {
        this.customFunctions = formData.customFunctions;
      }

      if (formData.eventHandlers) {
        this.eventHandlers = formData.eventHandlers;
      }

      if (formData.variables) {
        this.variables = formData.variables;
      }

      if (formData.permissions && this.permissions) {
        this.permissions.loadPermissions(formData.permissions);
      }

      if (formData.workflowTriggers && this.workflow) {
        this.workflow.loadWorkflowTriggers(formData.workflowTriggers);
      }

      if (formData.forgeIntegration && this.forge) {
        this.forge.loadForgeIntegration(formData);
      }

      this.renderCanvas();
    }

    // ───────────────────────────────────────────────────────────
    // Undo/Redo System
    // ───────────────────────────────────────────────────────────

    saveToUndoStack() {
      const snapshot = JSON.stringify(this.components);
      this.undoStack.push(snapshot);
      this.redoStack = [];

      if (this.undoStack.length > 50) {
        this.undoStack.shift();
      }
    }

    undo() {
      if (this.undoStack.length === 0) return;

      const currentState = JSON.stringify(this.components);
      this.redoStack.push(currentState);

      const previousState = this.undoStack.pop();
      this.components = JSON.parse(previousState);
      this.renderCanvas();

      console.log('[FormDesigner] Undo executed');
    }

    redo() {
      if (this.redoStack.length === 0) return;

      const currentState = JSON.stringify(this.components);
      this.undoStack.push(currentState);

      const nextState = this.redoStack.pop();
      this.components = JSON.parse(nextState);
      this.renderCanvas();

      console.log('[FormDesigner] Redo executed');
    }

    // ───────────────────────────────────────────────────────────
    // Utility Functions
    // ───────────────────────────────────────────────────────────

    generateComponentId() {
      return 'comp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    addCustomFunction() {
      const functionName = prompt('Enter function name:');
      if (!functionName) return;

      const functionCode = `function ${functionName}() {\n  // Your code here\n}\n\n`;

      if (this.monacoEditor && this.currentCodeTab === 'functions') {
        const currentValue = this.monacoEditor.getValue();
        this.monacoEditor.setValue(currentValue + functionCode);
      }
    }

    showNotification(message, type = 'info') {
      // Simple alert for now, replace with toast notification
      alert(message);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Initialize on DOM Ready
  // ═══════════════════════════════════════════════════════════

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.formDesigner = new FormDesigner();
    });
  } else {
    window.formDesigner = new FormDesigner();
  }

})();
