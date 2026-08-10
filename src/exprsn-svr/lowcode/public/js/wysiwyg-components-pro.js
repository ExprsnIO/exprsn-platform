/**
 * ═══════════════════════════════════════════════════════════
 * WYSIWYG Components Pro - Enhanced Component Library
 * Combines HTML5, Bootstrap, Form Designer, Workflow, Charts
 * ═══════════════════════════════════════════════════════════
 */

const WYSIWYGComponentsPro = {
  /**
   * All component categories
   */
  categories: {
    html5: {
      name: 'HTML5 Elements',
      icon: 'fa-html5',
      color: '#e34c26',
      collapsed: false
    },
    forms: {
      name: 'Form Components',
      icon: 'fa-wpforms',
      color: '#0d6efd',
      collapsed: false
    },
    layout: {
      name: 'Layout & Containers',
      icon: 'fa-object-group',
      color: '#6f42c1',
      collapsed: false
    },
    bootstrap: {
      name: 'Bootstrap UI',
      icon: 'fa-bootstrap',
      color: '#7952b3',
      collapsed: true
    },
    data: {
      name: 'Data & Entities',
      icon: 'fa-database',
      color: '#198754',
      collapsed: false
    },
    charts: {
      name: 'Charts & Visualizations',
      icon: 'fa-chart-line',
      color: '#0dcaf0',
      collapsed: true
    },
    workflow: {
      name: 'Workflow Elements',
      icon: 'fa-diagram-project',
      color: '#fd7e14',
      collapsed: true
    },
    media: {
      name: 'Media & Content',
      icon: 'fa-photo-film',
      color: '#d63384',
      collapsed: true
    },
    advanced: {
      name: 'Advanced Components',
      icon: 'fa-wand-magic-sparkles',
      color: '#20c997',
      collapsed: true
    }
  },

  /**
   * Component library
   */
  components: {
    // ────────────────────────────────────────────────────────
    // HTML5 ELEMENTS
    // ────────────────────────────────────────────────────────
    'html-div': {
      name: 'Div Container',
      icon: 'fa-square',
      category: 'html5',
      draggable: true,
      droppable: true,
      template: '<div class="component-wrapper" data-component="html-div"></div>',
      properties: {
        id: '',
        className: '',
        style: {},
        padding: '1rem',
        margin: '0',
        backgroundColor: '',
        borderRadius: '0'
      }
    },
    'html-section': {
      name: 'Section',
      icon: 'fa-bars',
      category: 'html5',
      draggable: true,
      droppable: true,
      template: '<section class="component-wrapper" data-component="html-section"><h2>Section Title</h2><p>Section content goes here...</p></section>',
      properties: {
        id: '',
        className: '',
        padding: '2rem 0',
        backgroundColor: ''
      }
    },
    'html-heading': {
      name: 'Heading',
      icon: 'fa-heading',
      category: 'html5',
      draggable: true,
      droppable: false,
      template: '<h2 data-component="html-heading">Heading Text</h2>',
      properties: {
        level: 'h2',
        text: 'Heading Text',
        color: '',
        align: 'left',
        fontWeight: 'normal'
      }
    },
    'html-paragraph': {
      name: 'Paragraph',
      icon: 'fa-paragraph',
      category: 'html5',
      draggable: true,
      droppable: false,
      template: '<p data-component="html-paragraph">This is a paragraph of text. You can edit this content in the properties panel.</p>',
      properties: {
        text: 'This is a paragraph of text.',
        color: '',
        align: 'left',
        fontSize: '16px',
        lineHeight: '1.5'
      }
    },
    'html-link': {
      name: 'Link',
      icon: 'fa-link',
      category: 'html5',
      draggable: true,
      droppable: false,
      template: '<a href="#" data-component="html-link">Link Text</a>',
      properties: {
        text: 'Link Text',
        href: '#',
        target: '_self',
        color: '#0d6efd',
        textDecoration: 'underline'
      }
    },
    'html-image': {
      name: 'Image',
      icon: 'fa-image',
      category: 'html5',
      draggable: true,
      droppable: false,
      template: '<img src="https://via.placeholder.com/600x400" alt="Placeholder" class="img-fluid" data-component="html-image">',
      properties: {
        src: 'https://via.placeholder.com/600x400',
        alt: 'Image description',
        width: '100%',
        height: 'auto',
        objectFit: 'cover',
        borderRadius: '0'
      }
    },
    'html-list': {
      name: 'List',
      icon: 'fa-list-ul',
      category: 'html5',
      draggable: true,
      droppable: false,
      template: '<ul data-component="html-list"><li>List item 1</li><li>List item 2</li><li>List item 3</li></ul>',
      properties: {
        type: 'ul',
        items: ['List item 1', 'List item 2', 'List item 3'],
        listStyle: 'disc'
      }
    },
    'html-table': {
      name: 'Table',
      icon: 'fa-table',
      category: 'html5',
      draggable: true,
      droppable: false,
      template: `<table class="table" data-component="html-table">
        <thead><tr><th>Column 1</th><th>Column 2</th><th>Column 3</th></tr></thead>
        <tbody><tr><td>Data 1</td><td>Data 2</td><td>Data 3</td></tr></tbody>
      </table>`,
      properties: {
        headers: ['Column 1', 'Column 2', 'Column 3'],
        striped: true,
        bordered: false,
        hover: true,
        responsive: true
      }
    },

    // ────────────────────────────────────────────────────────
    // FORM COMPONENTS
    // ────────────────────────────────────────────────────────
    'form-text-input': {
      name: 'Text Input',
      icon: 'fa-font',
      category: 'forms',
      draggable: true,
      droppable: false,
      template: `<div class="mb-3" data-component="form-text-input">
        <label class="form-label">Text Input</label>
        <input type="text" class="form-control" placeholder="Enter text...">
      </div>`,
      properties: {
        label: 'Text Input',
        placeholder: 'Enter text...',
        required: false,
        hideLabel: false,
        defaultValue: '',
        minLength: null,
        maxLength: null,
        pattern: '',
        helpText: ''
      }
    },
    'form-textarea': {
      name: 'Text Area',
      icon: 'fa-align-left',
      category: 'forms',
      draggable: true,
      droppable: false,
      template: `<div class="mb-3" data-component="form-textarea">
        <label class="form-label">Text Area</label>
        <textarea class="form-control" rows="3" placeholder="Enter text..."></textarea>
      </div>`,
      properties: {
        label: 'Text Area',
        placeholder: 'Enter text...',
        rows: 3,
        required: false,
        hideLabel: false,
        contentType: 'plain'
      }
    },
    'form-number': {
      name: 'Number Input',
      icon: 'fa-hashtag',
      category: 'forms',
      draggable: true,
      droppable: false,
      template: `<div class="mb-3" data-component="form-number">
        <label class="form-label">Number</label>
        <input type="number" class="form-control" placeholder="0">
      </div>`,
      properties: {
        label: 'Number',
        placeholder: '0',
        required: false,
        min: null,
        max: null,
        step: 1
      }
    },
    'form-email': {
      name: 'Email Input',
      icon: 'fa-envelope',
      category: 'forms',
      draggable: true,
      droppable: false,
      template: `<div class="mb-3" data-component="form-email">
        <label class="form-label">Email</label>
        <input type="email" class="form-control" placeholder="email@example.com">
      </div>`,
      properties: {
        label: 'Email',
        placeholder: 'email@example.com',
        required: false
      }
    },
    'form-password': {
      name: 'Password Input',
      icon: 'fa-lock',
      category: 'forms',
      draggable: true,
      droppable: false,
      template: `<div class="mb-3" data-component="form-password">
        <label class="form-label">Password</label>
        <input type="password" class="form-control" placeholder="Enter password">
      </div>`,
      properties: {
        label: 'Password',
        placeholder: 'Enter password',
        required: false,
        minLength: 8
      }
    },
    'form-date': {
      name: 'Date Picker',
      icon: 'fa-calendar',
      category: 'forms',
      draggable: true,
      droppable: false,
      template: `<div class="mb-3" data-component="form-date">
        <label class="form-label">Date</label>
        <input type="date" class="form-control">
      </div>`,
      properties: {
        label: 'Date',
        required: false,
        min: '',
        max: ''
      }
    },
    'form-checkbox': {
      name: 'Checkbox',
      icon: 'fa-check-square',
      category: 'forms',
      draggable: true,
      droppable: false,
      template: `<div class="mb-3 form-check" data-component="form-checkbox">
        <input type="checkbox" class="form-check-input" id="checkbox1">
        <label class="form-check-label" for="checkbox1">Checkbox label</label>
      </div>`,
      properties: {
        label: 'Checkbox label',
        checked: false,
        required: false
      }
    },
    'form-radio-group': {
      name: 'Radio Group',
      icon: 'fa-circle-dot',
      category: 'forms',
      draggable: true,
      droppable: false,
      template: `<div class="mb-3" data-component="form-radio-group">
        <label class="form-label">Radio Group</label>
        <div class="form-check">
          <input type="radio" class="form-check-input" name="radio1" id="radio1-1" value="option1" checked>
          <label class="form-check-label" for="radio1-1">Option 1</label>
        </div>
        <div class="form-check">
          <input type="radio" class="form-check-input" name="radio1" id="radio1-2" value="option2">
          <label class="form-check-label" for="radio1-2">Option 2</label>
        </div>
      </div>`,
      properties: {
        label: 'Radio Group',
        options: ['Option 1', 'Option 2'],
        required: false
      }
    },
    'form-dropdown': {
      name: 'Dropdown',
      icon: 'fa-caret-down',
      category: 'forms',
      draggable: true,
      droppable: false,
      template: `<div class="mb-3" data-component="form-dropdown">
        <label class="form-label">Dropdown</label>
        <select class="form-select">
          <option selected>Choose...</option>
          <option value="1">Option 1</option>
          <option value="2">Option 2</option>
          <option value="3">Option 3</option>
        </select>
      </div>`,
      properties: {
        label: 'Dropdown',
        options: ['Option 1', 'Option 2', 'Option 3'],
        required: false,
        multiple: false
      }
    },
    'form-file-upload': {
      name: 'File Upload',
      icon: 'fa-file-arrow-up',
      category: 'forms',
      draggable: true,
      droppable: false,
      template: `<div class="mb-3" data-component="form-file-upload">
        <label class="form-label">File Upload</label>
        <input type="file" class="form-control">
      </div>`,
      properties: {
        label: 'File Upload',
        accept: '*',
        multiple: false,
        maxSize: '10MB'
      }
    },

    // ────────────────────────────────────────────────────────
    // LAYOUT & CONTAINERS
    // ────────────────────────────────────────────────────────
    'layout-container': {
      name: 'Container',
      icon: 'fa-container-storage',
      category: 'layout',
      draggable: true,
      droppable: true,
      template: '<div class="container component-wrapper" data-component="layout-container"></div>',
      properties: {
        fluid: false,
        padding: '1rem',
        maxWidth: '1140px'
      }
    },
    'layout-row': {
      name: 'Row',
      icon: 'fa-grip-lines',
      category: 'layout',
      draggable: true,
      droppable: true,
      template: '<div class="row component-wrapper" data-component="layout-row"></div>',
      properties: {
        gutter: 3,
        align: 'start',
        justify: 'start'
      }
    },
    'layout-column': {
      name: 'Column',
      icon: 'fa-rectangle-vertical',
      category: 'layout',
      draggable: true,
      droppable: true,
      template: '<div class="col component-wrapper" data-component="layout-column"></div>',
      properties: {
        xs: 12,
        sm: null,
        md: null,
        lg: null,
        xl: null,
        xxl: null
      }
    },
    'layout-grid-2col': {
      name: '2 Column Grid',
      icon: 'fa-table-cells',
      category: 'layout',
      draggable: true,
      droppable: true,
      template: `<div class="row" data-component="layout-grid-2col">
        <div class="col-md-6 component-wrapper"></div>
        <div class="col-md-6 component-wrapper"></div>
      </div>`,
      properties: {
        gutter: 3
      }
    },
    'layout-grid-3col': {
      name: '3 Column Grid',
      icon: 'fa-table-cells',
      category: 'layout',
      draggable: true,
      droppable: true,
      template: `<div class="row" data-component="layout-grid-3col">
        <div class="col-md-4 component-wrapper"></div>
        <div class="col-md-4 component-wrapper"></div>
        <div class="col-md-4 component-wrapper"></div>
      </div>`,
      properties: {
        gutter: 3
      }
    },
    'layout-tabs': {
      name: 'Tabs',
      icon: 'fa-folder',
      category: 'layout',
      draggable: true,
      droppable: true,
      template: `<div data-component="layout-tabs">
        <ul class="nav nav-tabs" role="tablist">
          <li class="nav-item"><a class="nav-link active" data-bs-toggle="tab" href="#tab1">Tab 1</a></li>
          <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab2">Tab 2</a></li>
        </ul>
        <div class="tab-content p-3">
          <div class="tab-pane fade show active component-wrapper" id="tab1"></div>
          <div class="tab-pane fade component-wrapper" id="tab2"></div>
        </div>
      </div>`,
      properties: {
        tabs: ['Tab 1', 'Tab 2'],
        style: 'tabs'
      }
    },
    'layout-accordion': {
      name: 'Accordion',
      icon: 'fa-bars-staggered',
      category: 'layout',
      draggable: true,
      droppable: true,
      template: `<div class="accordion" data-component="layout-accordion">
        <div class="accordion-item">
          <h2 class="accordion-header">
            <button class="accordion-button" type="button" data-bs-toggle="collapse" data-bs-target="#collapse1">
              Section 1
            </button>
          </h2>
          <div id="collapse1" class="accordion-collapse collapse show">
            <div class="accordion-body component-wrapper"></div>
          </div>
        </div>
      </div>`,
      properties: {
        sections: ['Section 1'],
        alwaysOpen: false
      }
    },

    // ────────────────────────────────────────────────────────
    // BOOTSTRAP UI COMPONENTS
    // ────────────────────────────────────────────────────────
    'bs-button': {
      name: 'Button',
      icon: 'fa-hand-pointer',
      category: 'bootstrap',
      draggable: true,
      droppable: false,
      template: '<button type="button" class="btn btn-primary" data-component="bs-button">Button</button>',
      properties: {
        text: 'Button',
        variant: 'primary',
        size: '',
        outline: false,
        disabled: false
      }
    },
    'bs-alert': {
      name: 'Alert',
      icon: 'fa-triangle-exclamation',
      category: 'bootstrap',
      draggable: true,
      droppable: false,
      template: '<div class="alert alert-info" role="alert" data-component="bs-alert">This is an info alert!</div>',
      properties: {
        text: 'This is an info alert!',
        variant: 'info',
        dismissible: true
      }
    },
    'bs-badge': {
      name: 'Badge',
      icon: 'fa-tag',
      category: 'bootstrap',
      draggable: true,
      droppable: false,
      template: '<span class="badge bg-primary" data-component="bs-badge">Badge</span>',
      properties: {
        text: 'Badge',
        variant: 'primary',
        pill: false
      }
    },
    'bs-card': {
      name: 'Card',
      icon: 'fa-credit-card',
      category: 'bootstrap',
      draggable: true,
      droppable: true,
      template: `<div class="card" data-component="bs-card">
        <div class="card-header">Card Header</div>
        <div class="card-body component-wrapper">
          <h5 class="card-title">Card Title</h5>
          <p class="card-text">Card content goes here.</p>
        </div>
      </div>`,
      properties: {
        headerText: 'Card Header',
        showHeader: true,
        showFooter: false,
        footerText: ''
      }
    },
    'bs-modal': {
      name: 'Modal',
      icon: 'fa-window-restore',
      category: 'bootstrap',
      draggable: true,
      droppable: true,
      template: `<button type="button" class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#modal1">
        Open Modal
      </button>
      <div class="modal fade" id="modal1" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Modal Title</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body component-wrapper">
              <p>Modal content goes here.</p>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
              <button type="button" class="btn btn-primary">Save changes</button>
            </div>
          </div>
        </div>
      </div>`,
      properties: {
        title: 'Modal Title',
        size: '',
        centered: false
      }
    },
    'bs-progress': {
      name: 'Progress Bar',
      icon: 'fa-spinner',
      category: 'bootstrap',
      draggable: true,
      droppable: false,
      template: '<div class="progress" data-component="bs-progress"><div class="progress-bar" role="progressbar" style="width: 50%">50%</div></div>',
      properties: {
        value: 50,
        variant: 'primary',
        striped: false,
        animated: false
      }
    },

    // ────────────────────────────────────────────────────────
    // DATA & ENTITY COMPONENTS
    // ────────────────────────────────────────────────────────
    'data-entity-picker': {
      name: 'Entity Picker',
      icon: 'fa-object-ungroup',
      category: 'data',
      draggable: true,
      droppable: false,
      template: `<div class="mb-3" data-component="data-entity-picker">
        <label class="form-label">Select Entity</label>
        <select class="form-select">
          <option selected>Choose entity...</option>
        </select>
      </div>`,
      properties: {
        label: 'Select Entity',
        entityName: '',
        displayField: 'name',
        multiple: false
      }
    },
    'data-subgrid': {
      name: 'Subgrid',
      icon: 'fa-table-list',
      category: 'data',
      draggable: true,
      droppable: false,
      template: `<div class="subgrid-container" data-component="data-subgrid">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <h5>Related Records</h5>
          <button class="btn btn-sm btn-primary">Add New</button>
        </div>
        <table class="table table-hover">
          <thead><tr><th>Name</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody><tr><td colspan="3" class="text-center text-muted">No records found</td></tr></tbody>
        </table>
      </div>`,
      properties: {
        entityName: '',
        relationshipField: '',
        columns: ['name', 'status'],
        editable: true,
        deletable: true
      }
    },
    'data-crud-interface': {
      name: 'CRUD Interface',
      icon: 'fa-database',
      category: 'data',
      draggable: true,
      droppable: true,
      template: `<div class="crud-interface" data-component="data-crud-interface">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h4>Entity Records</h4>
          <button class="btn btn-primary">Create New</button>
        </div>
        <div class="table-responsive">
          <table class="table table-striped">
            <thead><tr><th>ID</th><th>Name</th><th>Created</th><th>Actions</th></tr></thead>
            <tbody><tr><td colspan="4" class="text-center text-muted">Loading...</td></tr></tbody>
          </table>
        </div>
      </div>`,
      properties: {
        entityName: '',
        showCreate: true,
        showEdit: true,
        showDelete: true,
        pageSize: 10
      }
    },
    'data-datasource': {
      name: 'Data Source',
      icon: 'fa-plug',
      category: 'data',
      draggable: true,
      droppable: false,
      template: '<div class="data-source" data-component="data-datasource" style="padding: 1rem; background: #f8f9fa; border: 2px dashed #dee2e6; border-radius: 0.5rem;"><i class="fa fa-plug"></i> Data Source (JSON, XML, Database, API)</div>',
      properties: {
        type: 'json',
        url: '',
        method: 'GET',
        refreshInterval: 0,
        cacheEnabled: false
      }
    },

    // ────────────────────────────────────────────────────────
    // CHARTS & VISUALIZATIONS
    // ────────────────────────────────────────────────────────
    'chart-line': {
      name: 'Line Chart',
      icon: 'fa-chart-line',
      category: 'charts',
      draggable: true,
      droppable: false,
      template: '<div class="chart-container" data-component="chart-line" style="height: 300px; background: #f8f9fa; border: 1px solid #dee2e6; display: flex; align-items: center; justify-content: center;"><i class="fa fa-chart-line fa-3x text-muted"></i></div>',
      properties: {
        dataSource: '',
        xField: '',
        yField: '',
        title: 'Line Chart',
        showLegend: true
      }
    },
    'chart-bar': {
      name: 'Bar Chart',
      icon: 'fa-chart-bar',
      category: 'charts',
      draggable: true,
      droppable: false,
      template: '<div class="chart-container" data-component="chart-bar" style="height: 300px; background: #f8f9fa; border: 1px solid #dee2e6; display: flex; align-items: center; justify-content: center;"><i class="fa fa-chart-bar fa-3x text-muted"></i></div>',
      properties: {
        dataSource: '',
        xField: '',
        yField: '',
        title: 'Bar Chart',
        orientation: 'vertical'
      }
    },
    'chart-pie': {
      name: 'Pie Chart',
      icon: 'fa-chart-pie',
      category: 'charts',
      draggable: true,
      droppable: false,
      template: '<div class="chart-container" data-component="chart-pie" style="height: 300px; background: #f8f9fa; border: 1px solid #dee2e6; display: flex; align-items: center; justify-content: center;"><i class="fa fa-chart-pie fa-3x text-muted"></i></div>',
      properties: {
        dataSource: '',
        labelField: '',
        valueField: '',
        title: 'Pie Chart',
        showLegend: true
      }
    },
    'chart-area': {
      name: 'Area Chart',
      icon: 'fa-chart-area',
      category: 'charts',
      draggable: true,
      droppable: false,
      template: '<div class="chart-container" data-component="chart-area" style="height: 300px; background: #f8f9fa; border: 1px solid #dee2e6; display: flex; align-items: center; justify-content: center;"><i class="fa fa-chart-area fa-3x text-muted"></i></div>',
      properties: {
        dataSource: '',
        xField: '',
        yField: '',
        title: 'Area Chart',
        stacked: false
      }
    },

    // ────────────────────────────────────────────────────────
    // WORKFLOW ELEMENTS
    // ────────────────────────────────────────────────────────
    'workflow-trigger': {
      name: 'Workflow Trigger',
      icon: 'fa-bolt',
      category: 'workflow',
      draggable: true,
      droppable: false,
      template: '<div class="workflow-node" data-component="workflow-trigger" style="padding: 1rem; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 0.5rem; text-align: center;"><i class="fa fa-bolt"></i><br><small>Workflow Trigger</small></div>',
      properties: {
        triggerType: 'manual',
        entityName: '',
        event: 'onCreate'
      }
    },
    'workflow-action': {
      name: 'Action Step',
      icon: 'fa-play',
      category: 'workflow',
      draggable: true,
      droppable: false,
      template: '<div class="workflow-node" data-component="workflow-action" style="padding: 1rem; background: #0dcaf0; color: white; border-radius: 0.5rem; text-align: center;"><i class="fa fa-play"></i><br><small>Action Step</small></div>',
      properties: {
        actionType: 'createRecord',
        entityName: '',
        fieldMappings: {}
      }
    },
    'workflow-condition': {
      name: 'Condition',
      icon: 'fa-code-branch',
      category: 'workflow',
      draggable: true,
      droppable: false,
      template: '<div class="workflow-node" data-component="workflow-condition" style="padding: 1rem; background: #fd7e14; color: white; border-radius: 0.5rem; text-align: center;"><i class="fa fa-code-branch"></i><br><small>Condition</small></div>',
      properties: {
        field: '',
        operator: 'equals',
        value: ''
      }
    },
    'workflow-loop': {
      name: 'Loop',
      icon: 'fa-repeat',
      category: 'workflow',
      draggable: true,
      droppable: false,
      template: '<div class="workflow-node" data-component="workflow-loop" style="padding: 1rem; background: #6f42c1; color: white; border-radius: 0.5rem; text-align: center;"><i class="fa fa-repeat"></i><br><small>Loop</small></div>',
      properties: {
        loopType: 'forEach',
        collection: '',
        maxIterations: 100
      }
    },

    // ────────────────────────────────────────────────────────
    // MEDIA & CONTENT
    // ────────────────────────────────────────────────────────
    'media-video': {
      name: 'Video',
      icon: 'fa-video',
      category: 'media',
      draggable: true,
      droppable: false,
      template: '<video controls class="w-100" data-component="media-video"><source src="" type="video/mp4">Your browser does not support video.</video>',
      properties: {
        src: '',
        autoplay: false,
        loop: false,
        muted: false,
        controls: true
      }
    },
    'media-audio': {
      name: 'Audio',
      icon: 'fa-volume-high',
      category: 'media',
      draggable: true,
      droppable: false,
      template: '<audio controls class="w-100" data-component="media-audio"><source src="" type="audio/mp3">Your browser does not support audio.</audio>',
      properties: {
        src: '',
        autoplay: false,
        loop: false
      }
    },
    'media-iframe': {
      name: 'iFrame',
      icon: 'fa-window-maximize',
      category: 'media',
      draggable: true,
      droppable: false,
      template: '<iframe src="about:blank" class="w-100" style="height: 400px; border: 1px solid #dee2e6;" data-component="media-iframe"></iframe>',
      properties: {
        src: 'about:blank',
        height: '400px',
        allowFullscreen: false
      }
    },
    'media-icon': {
      name: 'Icon',
      icon: 'fa-icons',
      category: 'media',
      draggable: true,
      droppable: false,
      template: '<i class="fa fa-star fa-3x" data-component="media-icon"></i>',
      properties: {
        icon: 'fa-star',
        size: '3x',
        color: '',
        rotation: 0
      }
    },

    // ────────────────────────────────────────────────────────
    // ADVANCED COMPONENTS
    // ────────────────────────────────────────────────────────
    'advanced-code': {
      name: 'Code Block',
      icon: 'fa-code',
      category: 'advanced',
      draggable: true,
      droppable: false,
      template: '<pre data-component="advanced-code"><code class="language-javascript">// Your code here\nconsole.log("Hello World");</code></pre>',
      properties: {
        language: 'javascript',
        code: '// Your code here\nconsole.log("Hello World");',
        theme: 'default',
        lineNumbers: true
      }
    },
    'advanced-html': {
      name: 'Custom HTML',
      icon: 'fa-file-code',
      category: 'advanced',
      draggable: true,
      droppable: false,
      template: '<div data-component="advanced-html"><!-- Custom HTML goes here --></div>',
      properties: {
        html: '<!-- Custom HTML goes here -->'
      }
    },
    'advanced-script': {
      name: 'JavaScript',
      icon: 'fa-js',
      category: 'advanced',
      draggable: true,
      droppable: false,
      template: '<div data-component="advanced-script" style="padding: 1rem; background: #fff3cd; border: 1px solid #ffc107; border-radius: 0.25rem;"><i class="fa fa-js"></i> JavaScript Code Block</div>',
      properties: {
        script: '// JavaScript code',
        executeOnLoad: false
      }
    },
    'advanced-spacer': {
      name: 'Spacer',
      icon: 'fa-arrows-up-down',
      category: 'advanced',
      draggable: true,
      droppable: false,
      template: '<div data-component="advanced-spacer" style="height: 2rem;"></div>',
      properties: {
        height: '2rem'
      }
    },
    'advanced-divider': {
      name: 'Divider',
      icon: 'fa-minus',
      category: 'advanced',
      draggable: true,
      droppable: false,
      template: '<hr data-component="advanced-divider">',
      properties: {
        color: '#dee2e6',
        thickness: '1px',
        style: 'solid'
      }
    }
  },

  /**
   * Get components by category
   */
  getComponentsByCategory(categoryId) {
    return Object.entries(this.components)
      .filter(([key, comp]) => comp.category === categoryId)
      .map(([key, comp]) => ({ ...comp, id: key }));
  },

  /**
   * Get all components
   */
  getAllComponents() {
    return Object.entries(this.components)
      .map(([key, comp]) => ({ ...comp, id: key }));
  },

  /**
   * Search components
   */
  searchComponents(query) {
    const lowerQuery = query.toLowerCase();
    return this.getAllComponents().filter(comp =>
      comp.name.toLowerCase().includes(lowerQuery) ||
      comp.category.toLowerCase().includes(lowerQuery)
    );
  },

  /**
   * Get component by ID
   */
  getComponent(id) {
    return this.components[id] ? { ...this.components[id], id } : null;
  }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WYSIWYGComponentsPro;
}
