/**
 * ═══════════════════════════════════════════════════════════
 * Form Designer Pro - Main Controller
 * Professional IDE-style form builder with tabbed interface
 * ═══════════════════════════════════════════════════════════
 */

(function() {
  'use strict';

  // Component Definitions
  const COMPONENT_TYPES = {
    // Basic Components
    'text-input': {
      name: 'Text Input',
      icon: 'fa-font',
      category: 'basic',
      template: (props) => `
        <div class="mb-3">
          ${!props.hideLabel ? `<label class="form-label">${props.label || 'Text Input'}</label>` : ''}
          <input type="text" class="form-control" placeholder="${props.placeholder || ''}" ${props.required ? 'required' : ''} value="${props.defaultValue || ''}">
          ${props.helpText ? `<small class="form-text text-muted">${props.helpText}</small>` : ''}
        </div>
      `,
      defaultProps: {
        label: 'Text Input',
        placeholder: '',
        required: false,
        helpText: '',
        hideLabel: false,
        defaultValue: '',
        defaultValueType: 'static',  // 'static', 'variable', 'parameter', 'script'
        defaultValueSource: '',      // Variable/parameter name or script code
        minLength: null,
        maxLength: null,
        pattern: '',                 // Regex pattern
        patternMessage: '',          // Custom validation message
        customValidation: ''         // JavaScript validation function
      }
    },
    'textarea': {
      name: 'Text Area',
      icon: 'fa-align-left',
      category: 'basic',
      template: (props) => `
        <div class="mb-3">
          ${!props.hideLabel ? `<label class="form-label">${props.label || 'Text Area'}</label>` : ''}
          <textarea class="form-control" rows="${props.rows || 3}" placeholder="${props.placeholder || ''}" ${props.required ? 'required' : ''}>${props.defaultValue || ''}</textarea>
          ${props.helpText ? `<small class="form-text text-muted">${props.helpText}</small>` : ''}
          ${props.contentType === 'markdown' ? `<small class="form-text text-muted"><i class="fab fa-markdown"></i> Markdown supported</small>` : ''}
          ${props.contentType === 'html' ? `<small class="form-text text-muted"><i class="fa fa-code"></i> HTML supported</small>` : ''}
        </div>
      `,
      defaultProps: {
        label: 'Text Area',
        placeholder: '',
        rows: 3,
        required: false,
        helpText: '',
        hideLabel: false,
        defaultValue: '',
        defaultValueType: 'static',
        defaultValueSource: '',
        minLength: null,
        maxLength: null,
        pattern: '',
        patternMessage: '',
        customValidation: '',
        contentType: 'plain'  // 'plain', 'html', 'markdown'
      }
    },
    'number': {
      name: 'Number',
      icon: 'fa-hashtag',
      category: 'basic',
      template: (props) => `
        <div class="mb-3">
          ${!props.hideLabel ? `<label class="form-label">${props.label || 'Number'}</label>` : ''}
          <input type="number" class="form-control"
            placeholder="${props.placeholder || ''}"
            ${props.required ? 'required' : ''}
            ${props.min !== null && props.min !== '' ? `min="${props.min}"` : ''}
            ${props.max !== null && props.max !== '' ? `max="${props.max}"` : ''}
            ${props.step ? `step="${props.step}"` : ''}
            value="${props.defaultValue || ''}">
        </div>
      `,
      defaultProps: {
        label: 'Number',
        placeholder: '',
        required: false,
        hideLabel: false,
        defaultValue: '',
        min: null,
        max: null,
        step: null,
        decimalPlaces: null,
        numberType: 'int'
      }
    },
    'email': {
      name: 'Email',
      icon: 'fa-envelope',
      category: 'basic',
      template: (props) => `
        <div class="mb-3">
          ${!props.hideLabel ? `<label class="form-label">${props.label || 'Email'}</label>` : ''}
          <input type="email" class="form-control" placeholder="${props.placeholder || ''}" ${props.required ? 'required' : ''} value="${props.defaultValue || ''}">
          ${props.helpText ? `<small class="form-text text-muted">${props.helpText}</small>` : ''}
        </div>
      `,
      defaultProps: {
        label: 'Email',
        placeholder: '',
        required: false,
        helpText: '',
        hideLabel: false,
        defaultValue: '',
        defaultValueType: 'static',
        defaultValueSource: '',
        minLength: null,
        maxLength: null,
        pattern: '',
        patternMessage: '',
        customValidation: ''
      }
    },
    'date': {
      name: 'Date',
      icon: 'fa-calendar',
      category: 'basic',
      template: (props) => `
        <div class="mb-3">
          ${!props.hideLabel ? `<label class="form-label">${props.label || 'Date'}</label>` : ''}
          <input type="date" class="form-control"
            ${props.required ? 'required' : ''}
            ${props.min ? `min="${props.min}"` : ''}
            ${props.max ? `max="${props.max}"` : ''}
            value="${props.defaultValue || ''}">
          ${props.helpText ? `<small class="form-text text-muted">${props.helpText}</small>` : ''}
        </div>
      `,
      defaultProps: {
        label: 'Date',
        hideLabel: false,
        required: false,
        helpText: '',
        min: '',                    // Minimum date (YYYY-MM-DD)
        max: '',                    // Maximum date (YYYY-MM-DD)
        defaultValue: '',           // Default date value
        defaultValueType: 'static', // 'static', 'today', 'variable', 'parameter', 'script'
        defaultValueSource: '',
        dateFormat: 'YYYY-MM-DD'    // Display format (for future runtime rendering)
      }
    },
    'checkbox': {
      name: 'Checkbox',
      icon: 'fa-check-square',
      category: 'basic',
      template: (props) => `
        <div class="mb-3 form-check">
          <input type="checkbox" class="form-check-input" id="${props.id || 'checkbox'}"
            ${props.checked || props.defaultValue ? 'checked' : ''}
            ${props.required ? 'required' : ''}>
          <label class="form-check-label" for="${props.id || 'checkbox'}">
            ${props.label || 'Checkbox'}
          </label>
          ${props.helpText ? `<div><small class="form-text text-muted">${props.helpText}</small></div>` : ''}
        </div>
      `,
      defaultProps: {
        label: 'Checkbox',
        id: 'checkbox_' + Date.now(),
        checked: false,             // Default checked state
        required: false,
        helpText: '',
        defaultValue: false,        // Default checked (boolean)
        defaultValueType: 'static', // 'static', 'variable', 'parameter', 'script'
        defaultValueSource: ''
      }
    },
    'radio-group': {
      name: 'Radio Group',
      icon: 'fa-circle-dot',
      category: 'basic',
      template: (props) => `
        <div class="mb-3">
          ${!props.hideLabel ? `<label class="form-label">${props.label || 'Radio Group'}</label>` : ''}
          ${(props.options || ['Option 1', 'Option 2']).map((opt, i) => {
            const value = typeof opt === 'object' ? opt.value : opt;
            const label = typeof opt === 'object' ? opt.label : opt;
            const checked = value === props.defaultValue ? 'checked' : '';
            return `
              <div class="form-check">
                <input type="radio" class="form-check-input" name="${props.name || 'radio'}" id="${props.name}_${i}" value="${value}" ${checked} ${props.required ? 'required' : ''}>
                <label class="form-check-label" for="${props.name}_${i}">${label}</label>
              </div>
            `;
          }).join('')}
          ${props.helpText ? `<small class="form-text text-muted">${props.helpText}</small>` : ''}
        </div>
      `,
      defaultProps: {
        label: 'Radio Group',
        name: 'radio_' + Date.now(),
        options: ['Option 1', 'Option 2'],
        required: false,
        hideLabel: false,
        helpText: '',
        defaultValue: '',
        defaultValueType: 'static',
        defaultValueSource: '',
        optionsSource: 'static'  // 'static', 'variable', 'entity'
      }
    },
    'dropdown': {
      name: 'Dropdown',
      icon: 'fa-caret-down',
      category: 'basic',
      template: (props) => `
        <div class="mb-3">
          ${!props.hideLabel ? `<label class="form-label">${props.label || 'Dropdown'}</label>` : ''}
          <select class="form-control" ${props.required ? 'required' : ''}>
            <option value="">${props.placeholder || 'Select...'}</option>
            ${(props.options || ['Option 1', 'Option 2']).map(opt => {
              const value = typeof opt === 'object' ? opt.value : opt;
              const label = typeof opt === 'object' ? opt.label : opt;
              const selected = value === props.defaultValue ? 'selected' : '';
              return `<option value="${value}" ${selected}>${label}</option>`;
            }).join('')}
          </select>
          ${props.helpText ? `<small class="form-text text-muted">${props.helpText}</small>` : ''}
        </div>
      `,
      defaultProps: {
        label: 'Dropdown',
        placeholder: 'Select...',
        options: ['Option 1', 'Option 2'],
        required: false,
        hideLabel: false,
        helpText: '',
        defaultValue: '',
        defaultValueType: 'static',
        defaultValueSource: '',
        optionsSource: 'static'  // 'static', 'variable', 'entity'
      }
    },
    'button': {
      name: 'Button',
      icon: 'fa-hand-pointer',
      category: 'basic',
      template: (props) => `
        <div class="mb-3">
          <button type="${props.buttonType || 'button'}"
            class="btn btn-${props.variant || 'primary'} ${props.size ? `btn-${props.size}` : ''} ${props.block ? 'w-100' : ''}"
            ${props.disabled ? 'disabled' : ''}>
            ${props.icon ? `<i class="fa ${props.icon}"></i> ` : ''}${props.label || 'Button'}
          </button>
          ${props.helpText ? `<div><small class="form-text text-muted">${props.helpText}</small></div>` : ''}
        </div>
      `,
      defaultProps: {
        label: 'Button',
        buttonType: 'button',       // 'button', 'submit', 'reset'
        variant: 'primary',          // 'primary', 'secondary', 'success', 'danger', 'warning', 'info', 'light', 'dark', 'link'
        size: '',                    // '', 'sm', 'lg'
        icon: '',                    // Font Awesome icon class (e.g., 'fa-save')
        disabled: false,
        block: false,                // Full-width button
        helpText: ''
      }
    },
    'label': {
      name: 'Label',
      icon: 'fa-tag',
      category: 'basic',
      template: (props) => `
        <div class="mb-2" style="${props.hidden ? 'display: none;' : ''}">
          <label class="form-label" style="
            color: ${props.color || 'inherit'};
            font-weight: ${props.fontWeight || 'normal'};
            font-size: ${props.fontSize || '1rem'};
            text-align: ${props.textAlign || 'left'};
          ">${props.text || 'Label Text'}</label>
          ${props.helpText ? `<div><small class="form-text text-muted">${props.helpText}</small></div>` : ''}
        </div>
      `,
      defaultProps: {
        text: 'Label Text',
        color: '',                  // Text color (hex or CSS color name)
        fontWeight: 'normal',       // 'normal', 'bold', 'lighter', 'bolder'
        fontSize: '1rem',           // Font size (CSS units)
        textAlign: 'left',          // 'left', 'center', 'right', 'justify'
        hidden: false,              // Conditional visibility
        helpText: ''                // Optional help text below label
      }
    },
    'heading': {
      name: 'Heading',
      icon: 'fa-heading',
      category: 'basic',
      template: (props) => `
        <h${props.level || 3} class="mb-3" style="
          color: ${props.color || 'inherit'};
          font-weight: ${props.fontWeight || 'bold'};
          text-align: ${props.textAlign || 'left'};
          ${props.hidden ? 'display: none;' : ''}
        ">${props.text || 'Heading'}</h${props.level || 3}>
        ${props.helpText ? `<div><small class="form-text text-muted">${props.helpText}</small></div>` : ''}
      `,
      defaultProps: {
        text: 'Heading',
        level: 3,                   // 1-6 (h1-h6)
        color: '',                  // Text color (hex or CSS color name)
        fontWeight: 'bold',         // 'normal', 'bold', 'lighter', 'bolder'
        textAlign: 'left',          // 'left', 'center', 'right', 'justify'
        hidden: false,              // Conditional visibility
        helpText: ''                // Optional help text below heading
      }
    },
    'paragraph': {
      name: 'Paragraph',
      icon: 'fa-paragraph',
      category: 'basic',
      template: (props) => `
        <p class="mb-3" style="
          color: ${props.color || 'inherit'};
          font-size: ${props.fontSize || '1rem'};
          text-align: ${props.textAlign || 'left'};
          line-height: ${props.lineHeight || '1.5'};
          ${props.hidden ? 'display: none;' : ''}
        ">${props.text || 'Paragraph text'}</p>
        ${props.helpText ? `<div><small class="form-text text-muted">${props.helpText}</small></div>` : ''}
      `,
      defaultProps: {
        text: 'Paragraph text',
        color: '',                  // Text color (hex or CSS color name)
        fontSize: '1rem',           // Font size (CSS units)
        textAlign: 'left',          // 'left', 'center', 'right', 'justify'
        lineHeight: '1.5',          // Line height (unitless or CSS units)
        hidden: false,              // Conditional visibility
        helpText: ''                // Optional help text below paragraph
      }
    },

    // Data Components
    'entity-picker': {
      name: 'Entity Picker',
      icon: 'fa-database',
      category: 'data',
      template: (props) => `
        <div class="mb-3" style="${props.hidden ? 'display: none;' : ''}">
          ${!props.hideLabel ? `<label class="form-label">${props.label || 'Entity Picker'}${props.required ? ' <span class="text-danger">*</span>' : ''}</label>` : ''}
          <div class="input-group">
            <select class="form-control ${props.size ? `form-control-${props.size}` : ''}"
                    ${props.required ? 'required' : ''}
                    ${props.disabled ? 'disabled' : ''}>
              <option value="">${props.placeholder || `Select ${props.entityName || 'entity'}...`}</option>
              ${props.displayField && props.entityName ? `
                <option value="1" disabled>Loading ${props.entityName} records...</option>
              ` : ''}
            </select>
            ${props.allowClear ? `
              <button type="button" class="btn btn-outline-secondary" title="Clear selection">
                <i class="fa fa-times"></i>
              </button>
            ` : ''}
            ${props.allowAdd ? `
              <button type="button" class="btn btn-outline-primary" title="Add new ${props.entityName || 'record'}">
                <i class="fa fa-plus"></i>
              </button>
            ` : ''}
            ${props.showSearch ? `
              <button type="button" class="btn btn-outline-secondary" title="Advanced search">
                <i class="fa fa-search"></i>
              </button>
            ` : ''}
          </div>
          ${props.helpText ? `<small class="form-text text-muted">${props.helpText}</small>` : ''}
          ${props.entityName && props.displayField ? `
            <small class="form-text text-muted">
              <i class="fa fa-info-circle"></i> Lookup from: <strong>${props.entityName}</strong> (showing: ${props.displayField})
            </small>
          ` : `
            <small class="form-text text-danger">
              <i class="fa fa-exclamation-triangle"></i> Entity not configured
            </small>
          `}
        </div>
      `,
      defaultProps: {
        label: 'Entity Picker',
        hideLabel: false,
        placeholder: '',
        required: false,
        disabled: false,
        size: '',                    // '', 'sm', 'lg'
        helpText: '',

        // Entity Configuration
        entityName: '',              // Low-Code entity name
        displayField: '',            // Field to show in dropdown
        valueField: 'id',            // Field to use as value
        filterField: '',             // Field to filter by
        filterValue: '',             // Value to filter by
        orderBy: '',                 // Field to sort by
        orderDirection: 'asc',       // 'asc' or 'desc'

        // Features
        allowClear: true,            // Show clear button
        allowAdd: false,             // Show add new button
        showSearch: false,           // Show advanced search button
        enableTypeahead: true,       // Enable search as you type
        multiSelect: false,          // Allow multiple selections

        // Display Options
        showIcon: false,             // Show entity icon
        iconField: '',               // Field containing icon class
        showDescription: false,      // Show secondary text
        descriptionField: '',        // Field for description

        hidden: false                // Conditional visibility
      }
    },
    'crud-interface': {
      name: 'CRUD Interface',
      icon: 'fa-edit',
      category: 'data',
      template: (props) => `
        <div class="card mb-3 ${props.cardStyle || ''}" style="${props.hidden ? 'display: none;' : ''}">
          <div class="card-header ${props.headerStyle || 'bg-light'}" style="${props.headerColor ? `background-color: ${props.headerColor} !important; color: white;` : ''}">
            <h5 class="mb-0" style="display: inline-block;">${props.title || 'CRUD Interface'}</h5>
            ${props.showAdd ? `
              <button type="button" class="btn btn-sm ${props.addButtonVariant || 'btn-primary'} float-end">
                <i class="fa fa-plus"></i> ${props.addButtonText || 'Add New'}
              </button>
            ` : ''}
            ${props.showSearch ? `
              <div class="float-end me-2">
                <input type="search" class="form-control form-control-sm" placeholder="Search..." style="width: 200px; display: inline-block;">
              </div>
            ` : ''}
          </div>
          <div class="card-body" style="padding: ${props.bodyPadding || 1}rem;">
            ${props.entityName ? `
              <div class="table-responsive">
                <table class="table ${props.tableStyle || 'table-striped'} ${props.tableBordered ? 'table-bordered' : ''} ${props.tableHover ? 'table-hover' : ''} table-sm">
                  <thead class="${props.theadStyle || ''}">
                    <tr>
                      ${props.showCheckboxes ? '<th><input type="checkbox"></th>' : ''}
                      ${(props.columns || []).map(col => `<th>${col.label || col.field}</th>`).join('')}
                      ${props.showActions ? '<th>Actions</th>' : ''}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      ${props.showCheckboxes ? '<td><input type="checkbox"></td>' : ''}
                      ${(props.columns || [{field: 'Field1'}, {field: 'Field2'}]).map(() => `<td class="text-muted">Sample data</td>`).join('')}
                      ${props.showActions ? `
                        <td>
                          ${props.enableEdit ? '<button class="btn btn-sm btn-outline-primary me-1"><i class="fa fa-edit"></i></button>' : ''}
                          ${props.enableDelete ? '<button class="btn btn-sm btn-outline-danger"><i class="fa fa-trash"></i></button>' : ''}
                          ${props.enableView ? '<button class="btn btn-sm btn-outline-info me-1"><i class="fa fa-eye"></i></button>' : ''}
                        </td>
                      ` : ''}
                    </tr>
                  </tbody>
                </table>
              </div>
              ${props.showPagination ? `
                <nav>
                  <ul class="pagination pagination-sm justify-content-end mb-0">
                    <li class="page-item disabled"><a class="page-link" href="#">Previous</a></li>
                    <li class="page-item active"><a class="page-link" href="#">1</a></li>
                    <li class="page-item"><a class="page-link" href="#">2</a></li>
                    <li class="page-item"><a class="page-link" href="#">3</a></li>
                    <li class="page-item"><a class="page-link" href="#">Next</a></li>
                  </ul>
                </nav>
              ` : ''}
            ` : `
              <p class="text-danger mb-0"><i class="fa fa-exclamation-triangle"></i> Entity not configured</p>
            `}
          </div>
        </div>
      `,
      defaultProps: {
        title: 'CRUD Interface',
        entityName: '',
        columns: [],

        // Display Options
        cardStyle: '',
        headerStyle: 'bg-light',
        headerColor: '',
        bodyPadding: 1,

        // Table Styling
        tableStyle: 'table-striped',
        tableBordered: true,
        tableHover: true,
        theadStyle: '',

        // Features
        showAdd: true,
        addButtonText: 'Add New',
        addButtonVariant: 'btn-primary',
        showSearch: true,
        showPagination: true,
        showCheckboxes: false,
        showActions: true,

        // CRUD Operations
        enableView: true,
        enableEdit: true,
        enableDelete: true,

        // Pagination
        pageSize: 10,

        hidden: false
      }
    },
    'subgrid': {
      name: 'Subgrid',
      icon: 'fa-th-list',
      category: 'data',
      template: (props) => `
        <div class="mb-3" style="${props.hidden ? 'display: none;' : ''}">
          ${!props.hideLabel ? `<label class="form-label">${props.label || 'Subgrid'}${props.required ? ' <span class="text-danger">*</span>' : ''}</label>` : ''}
          <div class="border rounded p-2" style="background-color: ${props.backgroundColor || '#f8f9fa'};">
            ${props.showToolbar ? `
              <div class="mb-2 d-flex justify-content-between align-items-center">
                <span class="text-muted small">
                  <i class="fa fa-database"></i> ${props.entityName || 'Not configured'}
                  ${props.relationshipField ? ` (via ${props.relationshipField})` : ''}
                </span>
                ${props.allowAdd ? '<button type="button" class="btn btn-sm btn-primary"><i class="fa fa-plus"></i> Add</button>' : ''}
              </div>
            ` : ''}
            <div class="table-responsive">
              <table class="table ${props.tableStyle || 'table-sm'} ${props.tableBordered ? 'table-bordered' : ''} ${props.tableHover ? 'table-hover' : ''} mb-0">
                <thead class="${props.theadStyle || 'table-light'}">
                  <tr>
                    ${(props.columns || [{field: 'Column 1'}, {field: 'Column 2'}]).map(col => `
                      <th>${col.label || col.field}</th>
                    `).join('')}
                    ${props.editable ? '<th style="width: 100px;">Actions</th>' : ''}
                  </tr>
                </thead>
                <tbody>
                  ${props.entityName ? `
                    <tr>
                      ${(props.columns || [{field: 'Column 1'}, {field: 'Column 2'}]).map(() => `<td class="text-muted">Sample data</td>`).join('')}
                      ${props.editable ? `
                        <td>
                          <button class="btn btn-sm btn-outline-primary me-1"><i class="fa fa-edit"></i></button>
                          <button class="btn btn-sm btn-outline-danger"><i class="fa fa-trash"></i></button>
                        </td>
                      ` : ''}
                    </tr>
                  ` : `
                    <tr><td colspan="${(props.columns || []).length + (props.editable ? 1 : 0)}" class="text-center text-muted">No data</td></tr>
                  `}
                </tbody>
              </table>
            </div>
            ${props.showPagination ? `
              <div class="mt-2 d-flex justify-content-between align-items-center small text-muted">
                <span>Showing 1-${props.pageSize || 10} of ${props.pageSize || 10}</span>
                <nav>
                  <ul class="pagination pagination-sm mb-0">
                    <li class="page-item disabled"><a class="page-link" href="#">‹</a></li>
                    <li class="page-item active"><a class="page-link" href="#">1</a></li>
                    <li class="page-item"><a class="page-link" href="#">›</a></li>
                  </ul>
                </nav>
              </div>
            ` : ''}
          </div>
          ${props.helpText ? `<small class="form-text text-muted">${props.helpText}</small>` : ''}
        </div>
      `,
      defaultProps: {
        label: 'Subgrid',
        hideLabel: false,
        required: false,
        helpText: '',

        // Entity Configuration
        entityName: '',
        relationshipField: '',
        columns: [],

        // Display Options
        backgroundColor: '#f8f9fa',
        tableStyle: 'table-sm',
        tableBordered: true,
        tableHover: true,
        theadStyle: 'table-light',

        // Features
        showToolbar: true,
        allowAdd: true,
        editable: true,
        showPagination: false,
        pageSize: 10,

        hidden: false
      }
    },
    'options-list': {
      name: 'Options List',
      icon: 'fa-list-ul',
      category: 'data',
      template: (props) => `
        <div class="mb-3" style="${props.hidden ? 'display: none;' : ''}">
          ${!props.hideLabel ? `<label class="form-label">${props.label || 'Options List'}${props.required ? ' <span class="text-danger">*</span>' : ''}</label>` : ''}
          <div class="list-group ${props.listStyle || ''}" style="${props.maxHeight ? `max-height: ${props.maxHeight}px; overflow-y: auto;` : ''}">
            ${(props.options || ['Option 1', 'Option 2']).map((opt, index) => {
              const optionValue = typeof opt === 'object' ? opt.value : opt;
              const optionLabel = typeof opt === 'object' ? opt.label : opt;
              const optionIcon = typeof opt === 'object' ? opt.icon : '';
              const optionDescription = typeof opt === 'object' ? opt.description : '';

              return `
                <label class="list-group-item ${props.interactive ? 'list-group-item-action' : ''} ${props.selectedStyle || ''}">
                  ${props.selectionType === 'checkbox' ? `
                    <input type="checkbox" class="form-check-input me-2" value="${optionValue}" ${props.required && index === 0 ? 'required' : ''}>
                  ` : props.selectionType === 'radio' ? `
                    <input type="radio" class="form-check-input me-2" name="${props.label || 'options-list'}" value="${optionValue}" ${props.required && index === 0 ? 'required' : ''}>
                  ` : ''}
                  ${optionIcon ? `<i class="fa ${optionIcon} me-2"></i>` : ''}
                  <span style="${props.boldLabels ? 'font-weight: bold;' : ''}">${optionLabel}</span>
                  ${optionDescription ? `<small class="d-block text-muted">${optionDescription}</small>` : ''}
                </label>
              `;
            }).join('')}
          </div>
          ${props.helpText ? `<small class="form-text text-muted">${props.helpText}</small>` : ''}
          ${props.dataSource === 'entity' && props.entityName ? `
            <small class="form-text text-muted">
              <i class="fa fa-database"></i> Loading from: <strong>${props.entityName}</strong>
            </small>
          ` : ''}
        </div>
      `,
      defaultProps: {
        label: 'Options List',
        hideLabel: false,
        required: false,
        helpText: '',

        // Options Configuration
        dataSource: 'static',        // 'static' or 'entity'
        options: [
          'Option 1',
          'Option 2',
          'Option 3'
        ],

        // Entity Data Source
        entityName: '',
        displayField: '',
        valueField: 'id',
        filterField: '',
        filterValue: '',

        // Selection Type
        selectionType: 'checkbox',   // 'checkbox', 'radio', or 'none'

        // Display Options
        listStyle: '',
        selectedStyle: '',
        interactive: true,
        boldLabels: false,
        maxHeight: 0,               // 0 = no limit

        hidden: false
      }
    },
    'file-upload': {
      name: 'File Upload',
      icon: 'fa-upload',
      category: 'data',
      template: (props) => `
        <div class="mb-3">
          ${!props.hideLabel ? `<label class="form-label">${props.label || 'File Upload'}</label>` : ''}
          <input type="file" class="form-control"
            ${props.multiple ? 'multiple' : ''}
            ${props.accept ? `accept="${props.accept}"` : ''}
            ${props.required ? 'required' : ''}>
          <small class="form-text text-muted">
            ${props.helpText || 'Select files to upload'}
            ${props.maxFileSize ? ` (Max: ${props.maxFileSize}MB)` : ''}
            ${props.accept ? ` (Formats: ${props.accept})` : ''}
          </small>
        </div>
      `,
      defaultProps: {
        label: 'File Upload',
        hideLabel: false,
        multiple: false,
        required: false,
        helpText: 'Select files to upload',
        accept: '',               // MIME types or extensions (.pdf, .jpg, image/*, etc.)
        maxFileSize: 10,          // MB
        allowedFormats: 'all',    // 'all', 'images', 'documents', 'media', 'custom'
        uploadDestination: 'filevault'  // 'filevault', 's3', 'local'
      }
    },

    // Layout Components
    'container': {
      name: 'Container',
      icon: 'fa-square',
      category: 'layout',
      template: (props) => `
        <div class="row mb-3" style="${props.hidden ? 'display: none;' : ''}">
          ${props.numColumns === 1 ? `
            <div class="col-12">
              <div class="p-${props.padding || 3} ${props.border ? 'border' : ''} ${props.rounded ? 'rounded' : ''} ${props.shadow ? 'shadow' : ''}"
                   style="min-height: ${props.minHeight || 100}px;
                          background: ${props.backgroundColor || 'rgba(0,120,212,0.05)'};
                          ${props.borderColor && props.border ? `border-color: ${props.borderColor};` : ''}">
                <p class="text-muted text-center mb-0">Drop components here</p>
              </div>
            </div>
          ` : props.numColumns === 2 ? `
            <div class="col-md-${props.col1Width || 6}">
              <div class="p-${props.padding || 3} ${props.border ? 'border' : ''} ${props.rounded ? 'rounded' : ''}"
                   style="min-height: ${props.minHeight || 100}px; background: ${props.backgroundColor || 'rgba(0,120,212,0.05)'};">
                <p class="text-muted text-center mb-0">Column 1</p>
              </div>
            </div>
            <div class="col-md-${props.col2Width || 6}">
              <div class="p-${props.padding || 3} ${props.border ? 'border' : ''} ${props.rounded ? 'rounded' : ''}"
                   style="min-height: ${props.minHeight || 100}px; background: ${props.backgroundColor || 'rgba(0,120,212,0.05)'};">
                <p class="text-muted text-center mb-0">Column 2</p>
              </div>
            </div>
          ` : props.numColumns === 3 ? `
            <div class="col-md-${props.col1Width || 4}">
              <div class="p-${props.padding || 3} ${props.border ? 'border' : ''} ${props.rounded ? 'rounded' : ''}"
                   style="min-height: ${props.minHeight || 100}px; background: ${props.backgroundColor || 'rgba(0,120,212,0.05)'};">
                <p class="text-muted text-center mb-0">Column 1</p>
              </div>
            </div>
            <div class="col-md-${props.col2Width || 4}">
              <div class="p-${props.padding || 3} ${props.border ? 'border' : ''} ${props.rounded ? 'rounded' : ''}"
                   style="min-height: ${props.minHeight || 100}px; background: ${props.backgroundColor || 'rgba(0,120,212,0.05)'};">
                <p class="text-muted text-center mb-0">Column 2</p>
              </div>
            </div>
            <div class="col-md-${props.col3Width || 4}">
              <div class="p-${props.padding || 3} ${props.border ? 'border' : ''} ${props.rounded ? 'rounded' : ''}"
                   style="min-height: ${props.minHeight || 100}px; background: ${props.backgroundColor || 'rgba(0,120,212,0.05)'};">
                <p class="text-muted text-center mb-0">Column 3</p>
              </div>
            </div>
          ` : `
            <div class="col-md-${props.col1Width || 3}">
              <div class="p-${props.padding || 3} ${props.border ? 'border' : ''} ${props.rounded ? 'rounded' : ''}"
                   style="min-height: ${props.minHeight || 100}px; background: ${props.backgroundColor || 'rgba(0,120,212,0.05)'};">
                <p class="text-muted text-center mb-0">Col 1</p>
              </div>
            </div>
            <div class="col-md-${props.col2Width || 3}">
              <div class="p-${props.padding || 3} ${props.border ? 'border' : ''} ${props.rounded ? 'rounded' : ''}"
                   style="min-height: ${props.minHeight || 100}px; background: ${props.backgroundColor || 'rgba(0,120,212,0.05)'};">
                <p class="text-muted text-center mb-0">Col 2</p>
              </div>
            </div>
            <div class="col-md-${props.col3Width || 3}">
              <div class="p-${props.padding || 3} ${props.border ? 'border' : ''} ${props.rounded ? 'rounded' : ''}"
                   style="min-height: ${props.minHeight || 100}px; background: ${props.backgroundColor || 'rgba(0,120,212,0.05)'};">
                <p class="text-muted text-center mb-0">Col 3</p>
              </div>
            </div>
            <div class="col-md-${props.col4Width || 3}">
              <div class="p-${props.padding || 3} ${props.border ? 'border' : ''} ${props.rounded ? 'rounded' : ''}"
                   style="min-height: ${props.minHeight || 100}px; background: ${props.backgroundColor || 'rgba(0,120,212,0.05)'};">
                <p class="text-muted text-center mb-0">Col 4</p>
              </div>
            </div>
          `}
        </div>
      `,
      defaultProps: {
        numColumns: 1,             // Number of columns (1-4)
        col1Width: 12,             // Column 1 width (1-12)
        col2Width: 6,              // Column 2 width (1-12)
        col3Width: 4,              // Column 3 width (1-12)
        col4Width: 3,              // Column 4 width (1-12)
        padding: 3,                // Bootstrap padding (0-5)
        minHeight: 100,            // Minimum height in pixels
        backgroundColor: 'rgba(0,120,212,0.05)',  // Background color
        border: true,              // Show border
        borderColor: '',           // Custom border color
        rounded: true,             // Rounded corners
        shadow: false,             // Drop shadow
        hidden: false              // Conditional visibility
      }
    },
    'tabs': {
      name: 'Tabs',
      icon: 'fa-folder',
      category: 'layout',
      template: (props) => {
        const tabs = props.tabs || [
          { id: 'tab1', label: 'Tab 1', content: 'Tab 1 content' },
          { id: 'tab2', label: 'Tab 2', content: 'Tab 2 content' }
        ];
        const activeTabId = props.activeTab || tabs[0]?.id;
        const navClass = props.tabStyle === 'pills' ? 'nav-pills' :
                         props.tabStyle === 'underline' ? 'nav-tabs border-bottom-0' :
                         'nav-tabs';

        return `
          <div class="mb-3" style="${props.hidden ? 'display: none;' : ''}">
            <ul class="nav ${navClass} ${props.fill ? 'nav-fill' : ''} ${props.justified ? 'nav-justified' : ''}"
                style="border-color: ${props.borderColor || '#dee2e6'};">
              ${tabs.map((tab, index) => `
                <li class="nav-item">
                  <a class="nav-link ${tab.id === activeTabId ? 'active' : ''}"
                     href="#${tab.id}"
                     style="${tab.id === activeTabId ? `background-color: ${props.activeTabColor || '#0d6efd'}; color: white;` : ''}">
                    ${tab.icon ? `<i class="fa ${tab.icon}"></i> ` : ''}${tab.label}
                  </a>
                </li>
              `).join('')}
            </ul>
            <div class="tab-content p-${props.padding || 3} ${props.contentBorder ? 'border border-top-0' : ''}"
                 style="background-color: ${props.contentBackground || 'transparent'};
                        min-height: ${props.minHeight || 100}px;
                        ${props.contentBorder ? `border-color: ${props.borderColor || '#dee2e6'};` : ''}">
              ${tabs.map((tab, index) => `
                <div class="tab-pane ${tab.id === activeTabId ? 'active show' : ''}" id="${tab.id}">
                  ${tab.content || `Drop components here for ${tab.label}`}
                </div>
              `).join('')}
            </div>
          </div>
        `;
      },
      defaultProps: {
        tabs: [
          { id: 'tab1', label: 'Tab 1', icon: '', content: 'Tab 1 content' },
          { id: 'tab2', label: 'Tab 2', icon: '', content: 'Tab 2 content' }
        ],
        activeTab: 'tab1',              // ID of initially active tab
        tabStyle: 'tabs',               // 'tabs', 'pills', 'underline'
        fill: false,                    // Fill available space equally
        justified: false,               // Justify tabs to fill width
        activeTabColor: '#0d6efd',      // Active tab background color
        borderColor: '#dee2e6',         // Border color for tabs and content
        contentBorder: true,            // Show border around content area
        contentBackground: 'transparent', // Content area background
        padding: 3,                     // Content area padding (0-5)
        minHeight: 100,                 // Minimum content height (px)
        hidden: false                   // Conditional visibility
      }
    },
    'accordion': {
      name: 'Accordion',
      icon: 'fa-bars',
      category: 'layout',
      template: (props) => {
        const panels = props.panels || [
          { id: 'panel1', header: 'Section 1', content: 'Section 1 content', icon: '' }
        ];
        const openPanels = props.openPanels || [panels[0]?.id];
        const accordionId = `accordion-${Date.now()}`;

        return `
          <div class="accordion ${props.flush ? 'accordion-flush' : ''} mb-3" id="${accordionId}"
               style="${props.hidden ? 'display: none;' : ''}">
            ${panels.map((panel, index) => {
              const isOpen = openPanels.includes(panel.id);
              const panelId = `${accordionId}-${panel.id}`;

              return `
                <div class="accordion-item" style="
                  ${props.itemBackground ? `background-color: ${props.itemBackground};` : ''}
                  ${props.itemBorder ? `border-color: ${props.borderColor || '#dee2e6'};` : 'border: none;'}
                ">
                  <h2 class="accordion-header" id="heading-${panelId}">
                    <button class="accordion-button ${!isOpen ? 'collapsed' : ''}" type="button"
                            style="
                              ${props.headerBackground ? `background-color: ${props.headerBackground};` : ''}
                              ${props.headerColor ? `color: ${props.headerColor};` : ''}
                              ${props.headerBold ? 'font-weight: bold;' : ''}
                            "
                            data-bs-toggle="collapse"
                            data-bs-target="#collapse-${panelId}"
                            aria-expanded="${isOpen}"
                            aria-controls="collapse-${panelId}">
                      ${panel.icon ? `<i class="fa ${panel.icon} me-2"></i>` : ''}${panel.header}
                    </button>
                  </h2>
                  <div id="collapse-${panelId}"
                       class="accordion-collapse collapse ${isOpen ? 'show' : ''}"
                       aria-labelledby="heading-${panelId}"
                       ${!props.alwaysOpen ? `data-bs-parent="#${accordionId}"` : ''}>
                    <div class="accordion-body" style="
                      ${props.bodyBackground ? `background-color: ${props.bodyBackground};` : ''}
                      padding: ${props.bodyPadding || 1}rem;
                    ">
                      ${panel.content || `Drop components here for ${panel.header}`}
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `;
      },
      defaultProps: {
        panels: [
          { id: 'panel1', header: 'Section 1', icon: '', content: 'Section 1 content' },
          { id: 'panel2', header: 'Section 2', icon: '', content: 'Section 2 content' }
        ],
        openPanels: ['panel1'],         // Array of IDs of initially open panels
        alwaysOpen: false,              // Allow multiple panels open (true) or accordion mode (false)
        flush: false,                   // Remove borders and rounded corners

        // Header Styling
        headerBackground: '',           // Header background color
        headerColor: '',                // Header text color
        headerBold: false,              // Bold header text

        // Panel Styling
        itemBackground: '',             // Panel item background
        itemBorder: true,               // Show borders on items
        borderColor: '#dee2e6',         // Border color

        // Body Styling
        bodyBackground: '',             // Body background color
        bodyPadding: 1,                 // Body padding in rem (0-5)

        hidden: false                   // Conditional visibility
      }
    },
    'divider': {
      name: 'Divider',
      icon: 'fa-minus',
      category: 'layout',
      template: (props) => `
        <hr style="
          border-color: ${props.color || '#dee2e6'};
          border-style: ${props.style || 'solid'};
          border-width: ${props.thickness || 1}px 0 0 0;
          width: ${props.width || '100%'};
          margin: ${props.marginTop || 1}rem 0 ${props.marginBottom || 1}rem 0;
          ${props.hidden ? 'display: none;' : ''}
        ">
      `,
      defaultProps: {
        color: '#dee2e6',          // Border color (hex or CSS color)
        style: 'solid',            // 'solid', 'dashed', 'dotted', 'double'
        thickness: 1,              // Border thickness in pixels
        width: '100%',             // Width (percentage or CSS units)
        marginTop: 1,              // Top margin in rem
        marginBottom: 1,           // Bottom margin in rem
        hidden: false              // Conditional visibility
      }
    },
    'spacer': {
      name: 'Spacer',
      icon: 'fa-arrows-alt-v',
      category: 'layout',
      template: (props) => `
        <div style="
          height: ${props.height || 20}px;
          ${props.hidden ? 'display: none;' : ''}
        "></div>
      `,
      defaultProps: {
        height: 20,                // Height in pixels
        hidden: false              // Conditional visibility
      }
    }
  };

  class FormDesignerPro {
    constructor() {
      this.state = window.FORM_DESIGNER_STATE;
      this.components = [];
      this.selectedComponent = null;
      this.monacoEditors = {};

      this.init();
    }

    init() {
      this.loadToolbox();
      this.setupEventListeners();
      this.setupDragAndDrop();
      this.initializeMonacoEditors();
      this.setupPropertyTabs();

      // Load existing form if editing
      if (this.state.form) {
        this.loadForm(this.state.form);
      }
    }

    loadToolbox() {
      const toolboxContent = document.getElementById('toolboxContent');
      const categories = {
        basic: 'Basic Components',
        data: 'Data Components',
        layout: 'Layout Components'
      };

      // Show basic category by default
      this.renderToolboxCategory('basic');

      // Setup toolbox tab switching
      document.querySelectorAll('.toolbox-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          document.querySelectorAll('.toolbox-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          this.renderToolboxCategory(tab.dataset.tab);
        });
      });
    }

    renderToolboxCategory(category) {
      const toolboxContent = document.getElementById('toolboxContent');
      const components = Object.entries(COMPONENT_TYPES).filter(([_, def]) => def.category === category);

      toolboxContent.innerHTML = `
        <div class="component-group">
          <div class="component-list">
            ${components.map(([type, def]) => `
              <div class="component-item" draggable="true" data-type="${type}">
                <div class="component-icon"><i class="fas ${def.icon}"></i></div>
                <div class="component-name">${def.name}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;

      // Add drag event listeners to new items
      toolboxContent.querySelectorAll('.component-item').forEach(item => {
        item.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('componentType', e.target.dataset.type);
          e.dataTransfer.effectAllowed = 'copy';
        });
      });
    }

    setupEventListeners() {
      // Top tab navigation
      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          this.switchTab(btn.dataset.tab);
        });
      });

      // Canvas toolbar buttons
      document.getElementById('undoBtn')?.addEventListener('click', () => this.undo());
      document.getElementById('redoBtn')?.addEventListener('click', () => this.redo());
      document.getElementById('previewBtn')?.addEventListener('click', () => this.preview());
      document.getElementById('saveBtn')?.addEventListener('click', () => this.save());
      document.getElementById('publishBtn')?.addEventListener('click', () => this.publish());
      document.getElementById('togglePreviewBtn')?.addEventListener('click', () => this.toggleLivePreview());
    }

    switchTab(tabName) {
      // Update tab buttons
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

      // Update tab content
      document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
      document.getElementById(`${tabName}Tab`).classList.add('active');

      // Update state
      this.state.currentTab = tabName;

      // Initialize tab-specific features
      if (tabName === 'functions' && !this.monacoEditors.functions) {
        this.initializeFunctionsEditor();
      } else if (tabName === 'json' && !this.monacoEditors.json) {
        this.initializeJsonEditor();
      }
    }

    setupDragAndDrop() {
      const canvas = document.getElementById('formCanvas');

      canvas.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        canvas.classList.add('drag-over');
      });

      canvas.addEventListener('dragleave', () => {
        canvas.classList.remove('drag-over');
      });

      canvas.addEventListener('drop', (e) => {
        e.preventDefault();
        canvas.classList.remove('drag-over');
        canvas.classList.remove('empty');

        const componentType = e.dataTransfer.getData('componentType');
        if (componentType) {
          this.addComponent(componentType);
        }
      });
    }

    setupPropertyTabs() {
      // Add event listeners for property tab switching
      document.querySelectorAll('.prop-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const tabName = btn.dataset.propTab;
          this.switchPropertyTab(tabName);
        });
      });
    }

    switchPropertyTab(tabName) {
      // Update tab buttons
      document.querySelectorAll('.prop-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.propTab === tabName);
      });

      // Update tab content
      document.querySelectorAll('.prop-tab-content').forEach(content => {
        content.classList.remove('active');
      });

      const targetTab = document.getElementById(`propTab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
      if (targetTab) {
        targetTab.classList.add('active');
      }

      console.log('[Form Designer] Switched to property tab:', tabName);
    }

    addComponent(type) {
      const componentDef = COMPONENT_TYPES[type];
      if (!componentDef) return;

      const component = {
        id: 'comp_' + Date.now(),
        type: type,
        props: { ...componentDef.defaultProps }
      };

      // Add to local components array
      this.components.push(component);

      // Sync with global state
      this.state.components = this.components;

      // Render and select
      this.renderCanvas();
      this.selectComponent(component.id);

      // Mark as dirty
      this.state.isDirty = true;

      console.log('[Form Designer] Component added:', type, component.id);
    }

    renderCanvas() {
      const canvas = document.getElementById('formCanvas');

      if (this.components.length === 0) {
        canvas.classList.add('empty');
        canvas.innerHTML = '';
        return;
      }

      canvas.classList.remove('empty');
      canvas.innerHTML = this.components.map(comp => {
        const def = COMPONENT_TYPES[comp.type];
        return `
          <div class="form-component ${this.selectedComponent === comp.id ? 'selected' : ''}"
               data-component-id="${comp.id}">
            <div class="component-controls">
              <button class="control-btn" onclick="formDesigner.selectComponent('${comp.id}')">
                <i class="fas fa-cog"></i>
              </button>
              <button class="control-btn" onclick="formDesigner.deleteComponent('${comp.id}')">
                <i class="fas fa-trash"></i>
              </button>
            </div>
            ${def.template(comp.props)}
          </div>
        `;
      }).join('');

      // Add click handlers to components
      canvas.querySelectorAll('.form-component').forEach(el => {
        el.addEventListener('click', (e) => {
          if (!e.target.closest('.component-controls')) {
            this.selectComponent(el.dataset.componentId);
          }
        });
      });
    }

    selectComponent(componentId) {
      this.selectedComponent = componentId;
      this.renderCanvas();
      this.renderProperties(componentId);
    }

    renderProperties(componentId) {
      const component = this.components.find(c => c.id === componentId);
      if (!component) {
        // Clear all property tabs when no component is selected
        this.clearPropertyTabs();
        return;
      }

      const def = COMPONENT_TYPES[component.type];

      // Update panel title
      document.getElementById('propertiesPanelTitle').textContent = `${def.name} Properties`;

      // Render all property tabs
      this.renderPropertiesTab(component, def);
      this.renderEventsTab(component);
      this.renderVariablesTab(component);
      this.renderPermissionsTab(component);
      this.renderWorkflowsTab(component);
      this.renderJsonTab(component);
    }

    renderPropertiesTab(component, def) {
      const propertiesContent = document.getElementById('propertiesContent');

      // Initialize component state properties if they don't exist
      if (!component.state) {
        component.state = {
          required: false,
          locked: false,
          readonly: false
        };
      }

      // Build property fields
      const propFields = Object.keys(def.defaultProps).map(key => {
        const value = component.props[key];
        const type = typeof value;

        let input = '';
        if (type === 'boolean') {
          input = `<input type="checkbox" class="property-input" data-prop="${key}" ${value ? 'checked' : ''}>`;
        } else if (type === 'number') {
          input = `<input type="number" class="property-input" data-prop="${key}" value="${value}">`;
        } else if (Array.isArray(value)) {
          input = `<textarea class="property-input" data-prop="${key}" rows="3">${value.join('\n')}</textarea>`;
        } else {
          input = `<input type="text" class="property-input" data-prop="${key}" value="${value || ''}">`;
        }

        return `
          <div class="property-field">
            <label class="property-label">${key}</label>
            ${input}
          </div>
        `;
      }).join('');

      propertiesContent.innerHTML = `
        <div class="property-group">
          <div class="property-group-title">${def.name} Properties</div>
          ${propFields}
        </div>

        <div class="property-group">
          <div class="property-group-title">State</div>
          <div class="property-field">
            <label class="property-label" style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
              <input type="checkbox" class="state-input" data-state="required" ${component.state.required ? 'checked' : ''}>
              <span>Required</span>
            </label>
          </div>
          <div class="property-field">
            <label class="property-label" style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
              <input type="checkbox" class="state-input" data-state="locked" ${component.state.locked ? 'checked' : ''}>
              <span>Locked</span>
            </label>
          </div>
          <div class="property-field">
            <label class="property-label" style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
              <input type="checkbox" class="state-input" data-state="readonly" ${component.state.readonly ? 'checked' : ''}>
              <span>Readonly</span>
            </label>
          </div>
        </div>

        <div class="property-group">
          <div class="property-group-title">Size & Formatting</div>
          <div class="property-field">
            <label class="property-label">Width</label>
            <input type="text" class="property-input" data-style="width" value="${component.style?.width || 'auto'}" placeholder="auto, 100%, 300px">
          </div>
          <div class="property-field">
            <label class="property-label">Height</label>
            <input type="text" class="property-input" data-style="height" value="${component.style?.height || 'auto'}" placeholder="auto, 100px">
          </div>
          <div class="property-field">
            <label class="property-label">Padding</label>
            <input type="text" class="property-input" data-style="padding" value="${component.style?.padding || ''}" placeholder="10px, 1rem">
          </div>
          <div class="property-field">
            <label class="property-label">Margin</label>
            <input type="text" class="property-input" data-style="margin" value="${component.style?.margin || ''}" placeholder="10px, 1rem">
          </div>
        </div>

        ${this.renderTextInputEnhancements(component)}
        ${this.renderNumberEnhancements(component)}
        ${this.renderTextAreaEnhancements(component)}
        ${this.renderDropdownEnhancements(component)}
        ${this.renderRadioGroupEnhancements(component)}
        ${this.renderFileUploadEnhancements(component)}
        ${this.renderDateEnhancements(component)}
        ${this.renderCheckboxEnhancements(component)}
        ${this.renderButtonEnhancements(component)}
        ${this.renderLabelEnhancements(component)}
        ${this.renderHeadingEnhancements(component)}
        ${this.renderParagraphEnhancements(component)}
        ${this.renderDividerEnhancements(component)}
        ${this.renderSpacerEnhancements(component)}
        ${this.renderContainerEnhancements(component)}
        ${this.renderTabsEnhancements(component)}
        ${this.renderAccordionEnhancements(component)}
        ${this.renderEntityPickerEnhancements(component)}
        ${this.renderCRUDInterfaceEnhancements(component)}
        ${this.renderSubgridEnhancements(component)}
        ${this.renderOptionsListEnhancements(component)}
      `;

      // Add change listeners for properties
      propertiesContent.querySelectorAll('.property-input[data-prop]').forEach(input => {
        input.addEventListener('change', (e) => {
          const prop = e.target.dataset.prop;
          let value = e.target.value;

          if (e.target.type === 'checkbox') {
            value = e.target.checked;
          } else if (e.target.type === 'number') {
            value = parseFloat(value);
          } else if (e.target.tagName === 'TEXTAREA') {
            value = value.split('\n').filter(v => v.trim());
          }

          component.props[prop] = value;
          this.renderCanvas();
          this.state.isDirty = true;
        });
      });

      // Add change listeners for state checkboxes
      propertiesContent.querySelectorAll('.state-input').forEach(input => {
        input.addEventListener('change', (e) => {
          const state = e.target.dataset.state;
          component.state[state] = e.target.checked;
          this.renderCanvas();
          this.state.isDirty = true;
          console.log('[Form Designer] Component state updated:', state, e.target.checked);
        });
      });

      // Add change listeners for style properties
      propertiesContent.querySelectorAll('.property-input[data-style]').forEach(input => {
        input.addEventListener('change', (e) => {
          const styleProp = e.target.dataset.style;
          if (!component.style) component.style = {};
          component.style[styleProp] = e.target.value;
          this.renderCanvas();
          this.state.isDirty = true;
        });
      });

      // Special handler for defaultValueType change - update defaultValueField
      const defaultValueTypeSelect = propertiesContent.querySelector('[data-prop="defaultValueType"]');
      if (defaultValueTypeSelect) {
        defaultValueTypeSelect.addEventListener('change', (e) => {
          component.props.defaultValueType = e.target.value;

          // Update the defaultValueField
          const defaultValueFieldContainer = document.getElementById('defaultValueField');
          if (defaultValueFieldContainer) {
            defaultValueFieldContainer.innerHTML = this.renderDefaultValueField(component);

            // Re-attach listeners to the new inputs
            defaultValueFieldContainer.querySelectorAll('.property-input[data-prop]').forEach(input => {
              input.addEventListener('change', (e) => {
                const prop = e.target.dataset.prop;
                let value = e.target.value;

                if (e.target.type === 'checkbox') {
                  value = e.target.checked;
                } else if (e.target.tagName === 'TEXTAREA') {
                  value = value; // Keep as string for scripts
                }

                component.props[prop] = value;
                this.state.isDirty = true;
                console.log(`[Form Designer] Updated ${prop}:`, value);
              });
            });
          }

          this.state.isDirty = true;
          console.log('[Form Designer] Default value type changed to:', e.target.value);
        });
      }

      // Special handler for allowedFormats change - show/hide custom accept field
      const allowedFormatsSelect = propertiesContent.querySelector('#allowedFormats');
      if (allowedFormatsSelect) {
        allowedFormatsSelect.addEventListener('change', (e) => {
          const customField = document.getElementById('customAcceptField');
          if (customField) {
            customField.style.display = e.target.value === 'custom' ? 'block' : 'none';
          }

          // Update accept attribute based on preset
          const formatPresets = {
            all: '',
            images: 'image/*',
            documents: '.pdf,.doc,.docx,.txt,.xls,.xlsx,.ppt,.pptx',
            media: 'image/*,video/*,audio/*',
            archives: '.zip,.rar,.7z,.tar,.gz',
            custom: component.props.accept || ''
          };

          if (e.target.value !== 'custom') {
            component.props.accept = formatPresets[e.target.value];
          }

          this.state.isDirty = true;
          console.log('[Form Designer] Allowed formats changed to:', e.target.value);
        });
      }
    }

    // ───────────────────────────────────────────────────────────
    // Component-Specific Enhancements
    // ───────────────────────────────────────────────────────────

    renderTextInputEnhancements(component) {
      // Only show for text-input and email components
      if (component.type !== 'text-input' && component.type !== 'email') {
        return '';
      }

      // Initialize enhancement properties if they don't exist
      if (!component.props.defaultValueType) component.props.defaultValueType = 'static';
      if (component.props.minLength === undefined) component.props.minLength = null;
      if (component.props.maxLength === undefined) component.props.maxLength = null;
      if (!component.props.pattern) component.props.pattern = '';
      if (!component.props.patternMessage) component.props.patternMessage = '';

      return `
        <div class="property-group">
          <div class="property-group-title">Default Value</div>
          <div class="property-field">
            <label class="property-label">Default Value Type</label>
            <select class="property-input" data-prop="defaultValueType">
              <option value="static" ${component.props.defaultValueType === 'static' ? 'selected' : ''}>Static</option>
              <option value="variable" ${component.props.defaultValueType === 'variable' ? 'selected' : ''}>Variable</option>
              <option value="parameter" ${component.props.defaultValueType === 'parameter' ? 'selected' : ''}>Parameter</option>
              <option value="script" ${component.props.defaultValueType === 'script' ? 'selected' : ''}>Script</option>
            </select>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              How the default value is determined
            </small>
          </div>
          <div class="property-field" id="defaultValueField">
            ${this.renderDefaultValueField(component)}
          </div>
        </div>

        <div class="property-group">
          <div class="property-group-title">Validation</div>
          <div class="property-field">
            <label class="property-label">Minimum Length</label>
            <input type="number" class="property-input" data-prop="minLength" value="${component.props.minLength || ''}" placeholder="No minimum" min="0">
          </div>
          <div class="property-field">
            <label class="property-label">Maximum Length</label>
            <input type="number" class="property-input" data-prop="maxLength" value="${component.props.maxLength || ''}" placeholder="No maximum" min="0">
          </div>
          <div class="property-field">
            <label class="property-label">Regex Pattern</label>
            <input type="text" class="property-input" data-prop="pattern" value="${component.props.pattern || ''}" placeholder="^[A-Za-z]+$">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              JavaScript regex pattern for validation
            </small>
          </div>
          <div class="property-field">
            <label class="property-label">Pattern Error Message</label>
            <input type="text" class="property-input" data-prop="patternMessage" value="${component.props.patternMessage || ''}" placeholder="Please enter a valid value">
          </div>
          <div class="property-field">
            <label class="property-label">Custom Validation</label>
            <textarea class="property-input" data-prop="customValidation" rows="3" placeholder="function validate(value) { return true; }">${component.props.customValidation || ''}</textarea>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              JavaScript function that returns true if valid, or error message string
            </small>
          </div>
        </div>
      `;
    }

    renderDefaultValueField(component) {
      const type = component.props.defaultValueType;

      switch (type) {
        case 'static':
          return `
            <label class="property-label">Static Value</label>
            <input type="text" class="property-input" data-prop="defaultValue" value="${component.props.defaultValue || ''}" placeholder="Enter default value">
          `;

        case 'variable':
          // Get available variables from form state
          const variables = Object.keys(window.FORM_DESIGNER_STATE?.variables || {});
          const variableOptions = variables.length > 0
            ? variables.map(v => `<option value="${v}" ${component.props.defaultValueSource === v ? 'selected' : ''}>${v}</option>`).join('')
            : '<option value="">No variables available</option>';

          return `
            <label class="property-label">Variable</label>
            <select class="property-input" data-prop="defaultValueSource">
              <option value="">Select a variable...</option>
              ${variableOptions}
            </select>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Default value from form variable
            </small>
          `;

        case 'parameter':
          return `
            <label class="property-label">Parameter Name</label>
            <input type="text" class="property-input" data-prop="defaultValueSource" value="${component.props.defaultValueSource || ''}" placeholder="parameterName">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Get default value from form/workflow parameter
            </small>
          `;

        case 'script':
          return `
            <label class="property-label">JavaScript Expression</label>
            <textarea class="property-input" data-prop="defaultValueSource" rows="3" placeholder="new Date().toISOString()">${component.props.defaultValueSource || ''}</textarea>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              JavaScript expression to calculate default value
            </small>
          `;

        default:
          return '';
      }
    }

    renderNumberEnhancements(component) {
      // Only show for number components
      if (component.type !== 'number') {
        return '';
      }

      // Initialize enhancement properties if they don't exist
      if (!component.props.min) component.props.min = null;
      if (!component.props.max) component.props.max = null;
      if (!component.props.step) component.props.step = null;
      if (!component.props.decimalPlaces) component.props.decimalPlaces = null;
      if (!component.props.numberType) component.props.numberType = 'int';

      return `
        <div class="property-group">
          <div class="property-group-title">Number Settings</div>
          <div class="property-field">
            <label class="property-label">Number Type</label>
            <select class="property-input" data-prop="numberType">
              <option value="int" ${component.props.numberType === 'int' ? 'selected' : ''}>Integer</option>
              <option value="float" ${component.props.numberType === 'float' ? 'selected' : ''}>Float</option>
              <option value="double" ${component.props.numberType === 'double' ? 'selected' : ''}>Double</option>
              <option value="long" ${component.props.numberType === 'long' ? 'selected' : ''}>Long</option>
            </select>
          </div>
          <div class="property-field">
            <label class="property-label">Minimum Value</label>
            <input type="number" class="property-input" data-prop="min" value="${component.props.min || ''}" placeholder="No minimum">
          </div>
          <div class="property-field">
            <label class="property-label">Maximum Value</label>
            <input type="number" class="property-input" data-prop="max" value="${component.props.max || ''}" placeholder="No maximum">
          </div>
          <div class="property-field">
            <label class="property-label">Step</label>
            <input type="number" class="property-input" data-prop="step" value="${component.props.step || ''}" placeholder="1" step="any">
          </div>
          <div class="property-field">
            <label class="property-label">Decimal Places</label>
            <input type="number" class="property-input" data-prop="decimalPlaces" value="${component.props.decimalPlaces || ''}" placeholder="Auto" min="0" max="10">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Number of decimal places to display/round to
            </small>
          </div>
        </div>
      `;
    }

    renderTextAreaEnhancements(component) {
      // Only show for textarea components
      if (component.type !== 'textarea') {
        return '';
      }

      // Initialize enhancement properties if they don't exist
      if (!component.props.defaultValueType) component.props.defaultValueType = 'static';
      if (component.props.minLength === undefined) component.props.minLength = null;
      if (component.props.maxLength === undefined) component.props.maxLength = null;
      if (!component.props.pattern) component.props.pattern = '';
      if (!component.props.patternMessage) component.props.patternMessage = '';
      if (!component.props.contentType) component.props.contentType = 'plain';

      return `
        <div class="property-group">
          <div class="property-group-title">Content Type</div>
          <div class="property-field">
            <label class="property-label">Content Format</label>
            <select class="property-input" data-prop="contentType">
              <option value="plain" ${component.props.contentType === 'plain' ? 'selected' : ''}>Plain Text</option>
              <option value="html" ${component.props.contentType === 'html' ? 'selected' : ''}>HTML</option>
              <option value="markdown" ${component.props.contentType === 'markdown' ? 'selected' : ''}>Markdown</option>
            </select>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              How the text content should be interpreted and rendered
            </small>
          </div>
          <div class="property-field">
            <label class="property-label">Rows (Height)</label>
            <input type="number" class="property-input" data-prop="rows" value="${component.props.rows || 3}" placeholder="3" min="1" max="50">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Number of visible text rows
            </small>
          </div>
        </div>

        <div class="property-group">
          <div class="property-group-title">Default Value</div>
          <div class="property-field">
            <label class="property-label">Default Value Type</label>
            <select class="property-input" data-prop="defaultValueType">
              <option value="static" ${component.props.defaultValueType === 'static' ? 'selected' : ''}>Static</option>
              <option value="variable" ${component.props.defaultValueType === 'variable' ? 'selected' : ''}>Variable</option>
              <option value="parameter" ${component.props.defaultValueType === 'parameter' ? 'selected' : ''}>Parameter</option>
              <option value="script" ${component.props.defaultValueType === 'script' ? 'selected' : ''}>Script</option>
            </select>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              How the default value is determined
            </small>
          </div>
          <div class="property-field" id="defaultValueField-textarea">
            ${this.renderDefaultValueField(component)}
          </div>
        </div>

        <div class="property-group">
          <div class="property-group-title">Validation</div>
          <div class="property-field">
            <label class="property-label">Minimum Length</label>
            <input type="number" class="property-input" data-prop="minLength" value="${component.props.minLength || ''}" placeholder="No minimum" min="0">
          </div>
          <div class="property-field">
            <label class="property-label">Maximum Length</label>
            <input type="number" class="property-input" data-prop="maxLength" value="${component.props.maxLength || ''}" placeholder="No maximum" min="0">
          </div>
          <div class="property-field">
            <label class="property-label">Regex Pattern</label>
            <input type="text" class="property-input" data-prop="pattern" value="${component.props.pattern || ''}" placeholder="^[A-Za-z]+$">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              JavaScript regex pattern for validation
            </small>
          </div>
          <div class="property-field">
            <label class="property-label">Pattern Error Message</label>
            <input type="text" class="property-input" data-prop="patternMessage" value="${component.props.patternMessage || ''}" placeholder="Please enter a valid value">
          </div>
          <div class="property-field">
            <label class="property-label">Custom Validation</label>
            <textarea class="property-input" data-prop="customValidation" rows="3" placeholder="function validate(value) { return true; }">${component.props.customValidation || ''}</textarea>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              JavaScript function that returns true if valid, or error message string
            </small>
          </div>
        </div>
      `;
    }

    renderDropdownEnhancements(component) {
      // Only show for dropdown components
      if (component.type !== 'dropdown') {
        return '';
      }

      // Initialize enhancement properties
      if (!component.props.defaultValueType) component.props.defaultValueType = 'static';
      if (!component.props.optionsSource) component.props.optionsSource = 'static';

      return `
        <div class="property-group">
          <div class="property-group-title">Options Configuration</div>
          <div class="property-field">
            <label class="property-label">Options Source</label>
            <select class="property-input" data-prop="optionsSource">
              <option value="static" ${component.props.optionsSource === 'static' ? 'selected' : ''}>Static List</option>
              <option value="variable" ${component.props.optionsSource === 'variable' ? 'selected' : ''}>From Variable</option>
              <option value="entity" ${component.props.optionsSource === 'entity' ? 'selected' : ''}>From Entity</option>
            </select>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Where the dropdown options come from
            </small>
          </div>
          ${component.props.optionsSource === 'static' ? `
            <div class="property-field">
              <label class="property-label">Options (one per line)</label>
              <textarea class="property-input" data-prop="options" rows="4" placeholder="Option 1&#10;Option 2&#10;Option 3">${(component.props.options || []).join('\n')}</textarea>
              <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
                Enter each option on a new line, or use key:value format
              </small>
            </div>
          ` : ''}
        </div>

        <div class="property-group">
          <div class="property-group-title">Default Value</div>
          <div class="property-field">
            <label class="property-label">Default Value Type</label>
            <select class="property-input" data-prop="defaultValueType">
              <option value="static" ${component.props.defaultValueType === 'static' ? 'selected' : ''}>Static</option>
              <option value="variable" ${component.props.defaultValueType === 'variable' ? 'selected' : ''}>Variable</option>
              <option value="parameter" ${component.props.defaultValueType === 'parameter' ? 'selected' : ''}>Parameter</option>
              <option value="script" ${component.props.defaultValueType === 'script' ? 'selected' : ''}>Script</option>
            </select>
          </div>
          <div class="property-field" id="defaultValueField-dropdown">
            ${this.renderDefaultValueField(component)}
          </div>
        </div>
      `;
    }

    renderRadioGroupEnhancements(component) {
      // Only show for radio-group components
      if (component.type !== 'radio-group') {
        return '';
      }

      // Initialize enhancement properties
      if (!component.props.defaultValueType) component.props.defaultValueType = 'static';
      if (!component.props.optionsSource) component.props.optionsSource = 'static';

      return `
        <div class="property-group">
          <div class="property-group-title">Options Configuration</div>
          <div class="property-field">
            <label class="property-label">Options Source</label>
            <select class="property-input" data-prop="optionsSource">
              <option value="static" ${component.props.optionsSource === 'static' ? 'selected' : ''}>Static List</option>
              <option value="variable" ${component.props.optionsSource === 'variable' ? 'selected' : ''}>From Variable</option>
              <option value="entity" ${component.props.optionsSource === 'entity' ? 'selected' : ''}>From Entity</option>
            </select>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Where the radio options come from
            </small>
          </div>
          ${component.props.optionsSource === 'static' ? `
            <div class="property-field">
              <label class="property-label">Options (one per line)</label>
              <textarea class="property-input" data-prop="options" rows="4" placeholder="Option 1&#10;Option 2&#10;Option 3">${(component.props.options || []).join('\n')}</textarea>
              <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
                Enter each option on a new line, or use key:value format
              </small>
            </div>
          ` : ''}
          <div class="property-field">
            <label class="property-label">Radio Name</label>
            <input type="text" class="property-input" data-prop="name" value="${component.props.name || ''}" placeholder="radio_group">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Unique name for this radio group (required for grouping)
            </small>
          </div>
        </div>

        <div class="property-group">
          <div class="property-group-title">Default Value</div>
          <div class="property-field">
            <label class="property-label">Default Value Type</label>
            <select class="property-input" data-prop="defaultValueType">
              <option value="static" ${component.props.defaultValueType === 'static' ? 'selected' : ''}>Static</option>
              <option value="variable" ${component.props.defaultValueType === 'variable' ? 'selected' : ''}>Variable</option>
              <option value="parameter" ${component.props.defaultValueType === 'parameter' ? 'selected' : ''}>Parameter</option>
              <option value="script" ${component.props.defaultValueType === 'script' ? 'selected' : ''}>Script</option>
            </select>
          </div>
          <div class="property-field" id="defaultValueField-radio">
            ${this.renderDefaultValueField(component)}
          </div>
        </div>
      `;
    }

    renderFileUploadEnhancements(component) {
      // Only show for file-upload components
      if (component.type !== 'file-upload') {
        return '';
      }

      // Initialize enhancement properties
      if (!component.props.allowedFormats) component.props.allowedFormats = 'all';
      if (!component.props.maxFileSize) component.props.maxFileSize = 10;
      if (!component.props.uploadDestination) component.props.uploadDestination = 'filevault';

      // Format presets for common use cases
      const formatPresets = {
        all: '',
        images: 'image/*',
        documents: '.pdf,.doc,.docx,.txt,.xls,.xlsx,.ppt,.pptx',
        media: 'image/*,video/*,audio/*',
        archives: '.zip,.rar,.7z,.tar,.gz',
        custom: component.props.accept || ''
      };

      return `
        <div class="property-group">
          <div class="property-group-title">File Restrictions</div>
          <div class="property-field">
            <label class="property-label">Allowed Formats</label>
            <select class="property-input" data-prop="allowedFormats" id="allowedFormats">
              <option value="all" ${component.props.allowedFormats === 'all' ? 'selected' : ''}>All Files</option>
              <option value="images" ${component.props.allowedFormats === 'images' ? 'selected' : ''}>Images Only</option>
              <option value="documents" ${component.props.allowedFormats === 'documents' ? 'selected' : ''}>Documents Only</option>
              <option value="media" ${component.props.allowedFormats === 'media' ? 'selected' : ''}>Media Files (Images/Video/Audio)</option>
              <option value="archives" ${component.props.allowedFormats === 'archives' ? 'selected' : ''}>Archives Only</option>
              <option value="custom" ${component.props.allowedFormats === 'custom' ? 'selected' : ''}>Custom</option>
            </select>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Which file types can be uploaded
            </small>
          </div>
          <div class="property-field" id="customAcceptField" style="display: ${component.props.allowedFormats === 'custom' ? 'block' : 'none'};">
            <label class="property-label">Custom Accept String</label>
            <input type="text" class="property-input" data-prop="accept" value="${component.props.accept || ''}" placeholder=".pdf,.jpg,image/*">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              MIME types or file extensions (.pdf, image/*, etc.)
            </small>
          </div>
          <div class="property-field">
            <label class="property-label">Maximum File Size (MB)</label>
            <input type="number" class="property-input" data-prop="maxFileSize" value="${component.props.maxFileSize || 10}" placeholder="10" min="0.1" max="1000" step="0.1">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Maximum size per file in megabytes
            </small>
          </div>
          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="multiple" ${component.props.multiple ? 'checked' : ''}>
              Allow Multiple Files
            </label>
          </div>
        </div>

        <div class="property-group">
          <div class="property-group-title">Upload Configuration</div>
          <div class="property-field">
            <label class="property-label">Upload Destination</label>
            <select class="property-input" data-prop="uploadDestination">
              <option value="filevault" ${component.props.uploadDestination === 'filevault' ? 'selected' : ''}>FileVault (exprsn-filevault)</option>
              <option value="s3" ${component.props.uploadDestination === 's3' ? 'selected' : ''}>Amazon S3</option>
              <option value="local" ${component.props.uploadDestination === 'local' ? 'selected' : ''}>Local Storage</option>
            </select>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Where uploaded files will be stored
            </small>
          </div>
        </div>
      `;
    }

    renderDateEnhancements(component) {
      // Only show for date components
      if (component.type !== 'date') {
        return '';
      }

      // Initialize enhancement properties
      if (!component.props.defaultValueType) component.props.defaultValueType = 'static';
      if (!component.props.dateFormat) component.props.dateFormat = 'YYYY-MM-DD';

      return `
        <div class="property-group">
          <div class="property-group-title">Date Range</div>
          <div class="property-field">
            <label class="property-label">Minimum Date</label>
            <input type="date" class="property-input" data-prop="min" value="${component.props.min || ''}">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Earliest date that can be selected
            </small>
          </div>
          <div class="property-field">
            <label class="property-label">Maximum Date</label>
            <input type="date" class="property-input" data-prop="max" value="${component.props.max || ''}">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Latest date that can be selected
            </small>
          </div>
        </div>

        <div class="property-group">
          <div class="property-group-title">Default Value</div>
          <div class="property-field">
            <label class="property-label">Default Value Type</label>
            <select class="property-input" data-prop="defaultValueType">
              <option value="static" ${component.props.defaultValueType === 'static' ? 'selected' : ''}>Static Value</option>
              <option value="today" ${component.props.defaultValueType === 'today' ? 'selected' : ''}>Today's Date</option>
              <option value="variable" ${component.props.defaultValueType === 'variable' ? 'selected' : ''}>From Variable</option>
              <option value="parameter" ${component.props.defaultValueType === 'parameter' ? 'selected' : ''}>From Parameter</option>
              <option value="script" ${component.props.defaultValueType === 'script' ? 'selected' : ''}>Script/Expression</option>
            </select>
          </div>
          <div class="property-field" id="defaultValueField">
            ${this.renderDefaultValueField(component, 'date')}
          </div>
        </div>

        <div class="property-group">
          <div class="property-group-title">Display Format</div>
          <div class="property-field">
            <label class="property-label">Date Format</label>
            <select class="property-input" data-prop="dateFormat">
              <option value="YYYY-MM-DD" ${component.props.dateFormat === 'YYYY-MM-DD' ? 'selected' : ''}>YYYY-MM-DD (2025-12-24)</option>
              <option value="MM/DD/YYYY" ${component.props.dateFormat === 'MM/DD/YYYY' ? 'selected' : ''}>MM/DD/YYYY (12/24/2025)</option>
              <option value="DD/MM/YYYY" ${component.props.dateFormat === 'DD/MM/YYYY' ? 'selected' : ''}>DD/MM/YYYY (24/12/2025)</option>
              <option value="MMMM D, YYYY" ${component.props.dateFormat === 'MMMM D, YYYY' ? 'selected' : ''}>MMMM D, YYYY (December 24, 2025)</option>
              <option value="MMM D, YYYY" ${component.props.dateFormat === 'MMM D, YYYY' ? 'selected' : ''}>MMM D, YYYY (Dec 24, 2025)</option>
            </select>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              How the date will be displayed at runtime
            </small>
          </div>
        </div>
      `;
    }

    renderCheckboxEnhancements(component) {
      // Only show for checkbox components
      if (component.type !== 'checkbox') {
        return '';
      }

      // Initialize enhancement properties
      if (component.props.defaultValueType === undefined) component.props.defaultValueType = 'static';
      if (component.props.defaultValue === undefined) component.props.defaultValue = false;

      return `
        <div class="property-group">
          <div class="property-group-title">Default Value</div>
          <div class="property-field">
            <label class="property-label">Default Value Type</label>
            <select class="property-input" data-prop="defaultValueType">
              <option value="static" ${component.props.defaultValueType === 'static' ? 'selected' : ''}>Static Value</option>
              <option value="variable" ${component.props.defaultValueType === 'variable' ? 'selected' : ''}>From Variable</option>
              <option value="parameter" ${component.props.defaultValueType === 'parameter' ? 'selected' : ''}>From Parameter</option>
              <option value="script" ${component.props.defaultValueType === 'script' ? 'selected' : ''}>Script/Expression</option>
            </select>
          </div>
          <div class="property-field" id="defaultValueField">
            ${this.renderDefaultValueField(component, 'checkbox')}
          </div>
        </div>
      `;
    }

    renderButtonEnhancements(component) {
      // Only show for button components
      if (component.type !== 'button') {
        return '';
      }

      // Initialize enhancement properties
      if (!component.props.buttonType) component.props.buttonType = 'button';
      if (!component.props.variant) component.props.variant = 'primary';
      if (!component.props.size) component.props.size = '';

      return `
        <div class="property-group">
          <div class="property-group-title">Button Configuration</div>
          <div class="property-field">
            <label class="property-label">Button Type</label>
            <select class="property-input" data-prop="buttonType">
              <option value="button" ${component.props.buttonType === 'button' ? 'selected' : ''}>Button</option>
              <option value="submit" ${component.props.buttonType === 'submit' ? 'selected' : ''}>Submit</option>
              <option value="reset" ${component.props.buttonType === 'reset' ? 'selected' : ''}>Reset</option>
            </select>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              HTML button type attribute
            </small>
          </div>
          <div class="property-field">
            <label class="property-label">Variant (Color)</label>
            <select class="property-input" data-prop="variant">
              <option value="primary" ${component.props.variant === 'primary' ? 'selected' : ''}>Primary (Blue)</option>
              <option value="secondary" ${component.props.variant === 'secondary' ? 'selected' : ''}>Secondary (Gray)</option>
              <option value="success" ${component.props.variant === 'success' ? 'selected' : ''}>Success (Green)</option>
              <option value="danger" ${component.props.variant === 'danger' ? 'selected' : ''}>Danger (Red)</option>
              <option value="warning" ${component.props.variant === 'warning' ? 'selected' : ''}>Warning (Yellow)</option>
              <option value="info" ${component.props.variant === 'info' ? 'selected' : ''}>Info (Cyan)</option>
              <option value="light" ${component.props.variant === 'light' ? 'selected' : ''}>Light</option>
              <option value="dark" ${component.props.variant === 'dark' ? 'selected' : ''}>Dark</option>
              <option value="link" ${component.props.variant === 'link' ? 'selected' : ''}>Link (No background)</option>
            </select>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Bootstrap color variant
            </small>
          </div>
          <div class="property-field">
            <label class="property-label">Size</label>
            <select class="property-input" data-prop="size">
              <option value="" ${component.props.size === '' ? 'selected' : ''}>Normal</option>
              <option value="sm" ${component.props.size === 'sm' ? 'selected' : ''}>Small</option>
              <option value="lg" ${component.props.size === 'lg' ? 'selected' : ''}>Large</option>
            </select>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Button size
            </small>
          </div>
          <div class="property-field">
            <label class="property-label">Icon (Font Awesome)</label>
            <input type="text" class="property-input" data-prop="icon" value="${component.props.icon || ''}" placeholder="fa-save, fa-download, etc.">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Font Awesome icon class (optional)
            </small>
          </div>
          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="disabled" ${component.props.disabled ? 'checked' : ''}>
              Disabled
            </label>
          </div>
          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="block" ${component.props.block ? 'checked' : ''}>
              Full Width (Block)
            </label>
          </div>
        </div>
      `;
    }

    renderLabelEnhancements(component) {
      // Only show for label components
      if (component.type !== 'label') {
        return '';
      }

      // Initialize enhancement properties
      if (!component.props.fontWeight) component.props.fontWeight = 'normal';
      if (!component.props.fontSize) component.props.fontSize = '1rem';
      if (!component.props.textAlign) component.props.textAlign = 'left';

      return `
        <div class="property-group">
          <div class="property-group-title">Text Styling</div>
          <div class="property-field">
            <label class="property-label">Text Color</label>
            <input type="color" class="property-input" data-prop="color" value="${component.props.color || '#000000'}">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Color for the label text
            </small>
          </div>
          <div class="property-field">
            <label class="property-label">Font Weight</label>
            <select class="property-input" data-prop="fontWeight">
              <option value="normal" ${component.props.fontWeight === 'normal' ? 'selected' : ''}>Normal</option>
              <option value="bold" ${component.props.fontWeight === 'bold' ? 'selected' : ''}>Bold</option>
              <option value="lighter" ${component.props.fontWeight === 'lighter' ? 'selected' : ''}>Lighter</option>
              <option value="bolder" ${component.props.fontWeight === 'bolder' ? 'selected' : ''}>Bolder</option>
            </select>
          </div>
          <div class="property-field">
            <label class="property-label">Font Size</label>
            <input type="text" class="property-input" data-prop="fontSize" value="${component.props.fontSize || '1rem'}" placeholder="1rem, 16px, 1.2em">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              CSS font size (rem, px, em, %)
            </small>
          </div>
          <div class="property-field">
            <label class="property-label">Text Alignment</label>
            <select class="property-input" data-prop="textAlign">
              <option value="left" ${component.props.textAlign === 'left' ? 'selected' : ''}>Left</option>
              <option value="center" ${component.props.textAlign === 'center' ? 'selected' : ''}>Center</option>
              <option value="right" ${component.props.textAlign === 'right' ? 'selected' : ''}>Right</option>
              <option value="justify" ${component.props.textAlign === 'justify' ? 'selected' : ''}>Justify</option>
            </select>
          </div>
        </div>

        <div class="property-group">
          <div class="property-group-title">Visibility</div>
          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="hidden" ${component.props.hidden ? 'checked' : ''}>
              Hidden (Conditional Visibility)
            </label>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Hide label from view (use with event handlers for dynamic show/hide)
            </small>
          </div>
        </div>
      `;
    }

    renderHeadingEnhancements(component) {
      // Only show for heading components
      if (component.type !== 'heading') {
        return '';
      }

      // Initialize enhancement properties
      if (!component.props.level) component.props.level = 3;
      if (!component.props.fontWeight) component.props.fontWeight = 'bold';
      if (!component.props.textAlign) component.props.textAlign = 'left';

      return `
        <div class="property-group">
          <div class="property-group-title">Heading Configuration</div>
          <div class="property-field">
            <label class="property-label">Heading Level</label>
            <select class="property-input" data-prop="level">
              <option value="1" ${component.props.level === 1 || component.props.level === '1' ? 'selected' : ''}>H1 (Largest)</option>
              <option value="2" ${component.props.level === 2 || component.props.level === '2' ? 'selected' : ''}>H2</option>
              <option value="3" ${component.props.level === 3 || component.props.level === '3' ? 'selected' : ''}>H3</option>
              <option value="4" ${component.props.level === 4 || component.props.level === '4' ? 'selected' : ''}>H4</option>
              <option value="5" ${component.props.level === 5 || component.props.level === '5' ? 'selected' : ''}>H5</option>
              <option value="6" ${component.props.level === 6 || component.props.level === '6' ? 'selected' : ''}>H6 (Smallest)</option>
            </select>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              HTML heading tag (h1-h6)
            </small>
          </div>
          <div class="property-field">
            <label class="property-label">Text Color</label>
            <input type="color" class="property-input" data-prop="color" value="${component.props.color || '#000000'}">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Color for the heading text
            </small>
          </div>
          <div class="property-field">
            <label class="property-label">Font Weight</label>
            <select class="property-input" data-prop="fontWeight">
              <option value="normal" ${component.props.fontWeight === 'normal' ? 'selected' : ''}>Normal</option>
              <option value="bold" ${component.props.fontWeight === 'bold' ? 'selected' : ''}>Bold</option>
              <option value="lighter" ${component.props.fontWeight === 'lighter' ? 'selected' : ''}>Lighter</option>
              <option value="bolder" ${component.props.fontWeight === 'bolder' ? 'selected' : ''}>Bolder</option>
            </select>
          </div>
          <div class="property-field">
            <label class="property-label">Text Alignment</label>
            <select class="property-input" data-prop="textAlign">
              <option value="left" ${component.props.textAlign === 'left' ? 'selected' : ''}>Left</option>
              <option value="center" ${component.props.textAlign === 'center' ? 'selected' : ''}>Center</option>
              <option value="right" ${component.props.textAlign === 'right' ? 'selected' : ''}>Right</option>
              <option value="justify" ${component.props.textAlign === 'justify' ? 'selected' : ''}>Justify</option>
            </select>
          </div>
        </div>

        <div class="property-group">
          <div class="property-group-title">Visibility</div>
          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="hidden" ${component.props.hidden ? 'checked' : ''}>
              Hidden (Conditional Visibility)
            </label>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Hide heading from view (use with event handlers for dynamic show/hide)
            </small>
          </div>
        </div>
      `;
    }

    renderParagraphEnhancements(component) {
      // Only show for paragraph components
      if (component.type !== 'paragraph') {
        return '';
      }

      // Initialize enhancement properties
      if (!component.props.fontSize) component.props.fontSize = '1rem';
      if (!component.props.textAlign) component.props.textAlign = 'left';
      if (!component.props.lineHeight) component.props.lineHeight = '1.5';

      return `
        <div class="property-group">
          <div class="property-group-title">Text Styling</div>
          <div class="property-field">
            <label class="property-label">Text Color</label>
            <input type="color" class="property-input" data-prop="color" value="${component.props.color || '#000000'}">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Color for the paragraph text
            </small>
          </div>
          <div class="property-field">
            <label class="property-label">Font Size</label>
            <input type="text" class="property-input" data-prop="fontSize" value="${component.props.fontSize || '1rem'}" placeholder="1rem, 16px, 1.2em">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              CSS font size (rem, px, em, %)
            </small>
          </div>
          <div class="property-field">
            <label class="property-label">Text Alignment</label>
            <select class="property-input" data-prop="textAlign">
              <option value="left" ${component.props.textAlign === 'left' ? 'selected' : ''}>Left</option>
              <option value="center" ${component.props.textAlign === 'center' ? 'selected' : ''}>Center</option>
              <option value="right" ${component.props.textAlign === 'right' ? 'selected' : ''}>Right</option>
              <option value="justify" ${component.props.textAlign === 'justify' ? 'selected' : ''}>Justify</option>
            </select>
          </div>
          <div class="property-field">
            <label class="property-label">Line Height</label>
            <input type="text" class="property-input" data-prop="lineHeight" value="${component.props.lineHeight || '1.5'}" placeholder="1.5, 1.8, 24px">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Line spacing (unitless or CSS units)
            </small>
          </div>
        </div>

        <div class="property-group">
          <div class="property-group-title">Visibility</div>
          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="hidden" ${component.props.hidden ? 'checked' : ''}>
              Hidden (Conditional Visibility)
            </label>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Hide paragraph from view (use with event handlers for dynamic show/hide)
            </small>
          </div>
        </div>
      `;
    }

    renderDividerEnhancements(component) {
      // Only show for divider components
      if (component.type !== 'divider') {
        return '';
      }

      // Initialize enhancement properties
      if (!component.props.color) component.props.color = '#dee2e6';
      if (!component.props.style) component.props.style = 'solid';
      if (!component.props.thickness) component.props.thickness = 1;
      if (!component.props.width) component.props.width = '100%';
      if (!component.props.marginTop) component.props.marginTop = 1;
      if (!component.props.marginBottom) component.props.marginBottom = 1;

      return `
        <div class="property-group">
          <div class="property-group-title">Divider Styling</div>
          <div class="property-field">
            <label class="property-label">Color</label>
            <input type="color" class="property-input" data-prop="color" value="${component.props.color || '#dee2e6'}">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Border color for the divider line
            </small>
          </div>
          <div class="property-field">
            <label class="property-label">Style</label>
            <select class="property-input" data-prop="style">
              <option value="solid" ${component.props.style === 'solid' ? 'selected' : ''}>Solid</option>
              <option value="dashed" ${component.props.style === 'dashed' ? 'selected' : ''}>Dashed</option>
              <option value="dotted" ${component.props.style === 'dotted' ? 'selected' : ''}>Dotted</option>
              <option value="double" ${component.props.style === 'double' ? 'selected' : ''}>Double</option>
            </select>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Line pattern for the divider
            </small>
          </div>
          <div class="property-field">
            <label class="property-label">Thickness (px)</label>
            <input type="number" class="property-input" data-prop="thickness" value="${component.props.thickness || 1}" min="1" max="10" step="1">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Border thickness in pixels (1-10)
            </small>
          </div>
          <div class="property-field">
            <label class="property-label">Width</label>
            <input type="text" class="property-input" data-prop="width" value="${component.props.width || '100%'}" placeholder="100%, 80%, 50%">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Divider width (percentage or CSS units)
            </small>
          </div>
        </div>

        <div class="property-group">
          <div class="property-group-title">Spacing</div>
          <div class="property-field">
            <label class="property-label">Top Margin (rem)</label>
            <input type="number" class="property-input" data-prop="marginTop" value="${component.props.marginTop || 1}" min="0" max="10" step="0.5">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Space above divider (0-10 rem)
            </small>
          </div>
          <div class="property-field">
            <label class="property-label">Bottom Margin (rem)</label>
            <input type="number" class="property-input" data-prop="marginBottom" value="${component.props.marginBottom || 1}" min="0" max="10" step="0.5">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Space below divider (0-10 rem)
            </small>
          </div>
        </div>

        <div class="property-group">
          <div class="property-group-title">Visibility</div>
          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="hidden" ${component.props.hidden ? 'checked' : ''}>
              Hidden (Conditional Visibility)
            </label>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Hide divider from view (use with event handlers for dynamic show/hide)
            </small>
          </div>
        </div>
      `;
    }

    renderSpacerEnhancements(component) {
      // Only show for spacer components
      if (component.type !== 'spacer') {
        return '';
      }

      // Initialize enhancement properties
      if (!component.props.height) component.props.height = 20;

      return `
        <div class="property-group">
          <div class="property-group-title">Spacer Configuration</div>
          <div class="property-field">
            <label class="property-label">Height (px)</label>
            <input type="number" class="property-input" data-prop="height" value="${component.props.height || 20}" min="5" max="500" step="5">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Vertical spacing in pixels (5-500)
            </small>
          </div>
          <div class="property-field">
            <label class="property-label">Quick Presets</label>
            <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
              <button type="button" class="btn btn-sm btn-outline-secondary" onclick="document.querySelector('[data-prop=\\'height\\']').value = 10; document.querySelector('[data-prop=\\'height\\']').dispatchEvent(new Event('change'));">10px</button>
              <button type="button" class="btn btn-sm btn-outline-secondary" onclick="document.querySelector('[data-prop=\\'height\\']').value = 20; document.querySelector('[data-prop=\\'height\\']').dispatchEvent(new Event('change'));">20px</button>
              <button type="button" class="btn btn-sm btn-outline-secondary" onclick="document.querySelector('[data-prop=\\'height\\']').value = 40; document.querySelector('[data-prop=\\'height\\']').dispatchEvent(new Event('change'));">40px</button>
              <button type="button" class="btn btn-sm btn-outline-secondary" onclick="document.querySelector('[data-prop=\\'height\\']').value = 80; document.querySelector('[data-prop=\\'height\\']').dispatchEvent(new Event('change'));">80px</button>
            </div>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.5rem; display: block;">
              Common spacing presets for quick selection
            </small>
          </div>
        </div>

        <div class="property-group">
          <div class="property-group-title">Visibility</div>
          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="hidden" ${component.props.hidden ? 'checked' : ''}>
              Hidden (Conditional Visibility)
            </label>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Hide spacer from view (use with event handlers for dynamic show/hide)
            </small>
          </div>
        </div>
      `;
    }

    renderContainerEnhancements(component) {
      // Only show for container components
      if (component.type !== 'container') {
        return '';
      }

      // Initialize enhancement properties
      if (!component.props.numColumns) component.props.numColumns = 1;
      if (!component.props.padding) component.props.padding = 3;
      if (!component.props.minHeight) component.props.minHeight = 100;
      if (!component.props.backgroundColor) component.props.backgroundColor = 'rgba(0,120,212,0.05)';

      return `
        <div class="property-group">
          <div class="property-group-title">Layout Configuration</div>
          <div class="property-field">
            <label class="property-label">Number of Columns</label>
            <select class="property-input" data-prop="numColumns">
              <option value="1" ${component.props.numColumns === 1 || component.props.numColumns === '1' ? 'selected' : ''}>1 Column (Full Width)</option>
              <option value="2" ${component.props.numColumns === 2 || component.props.numColumns === '2' ? 'selected' : ''}>2 Columns</option>
              <option value="3" ${component.props.numColumns === 3 || component.props.numColumns === '3' ? 'selected' : ''}>3 Columns</option>
              <option value="4" ${component.props.numColumns === 4 || component.props.numColumns === '4' ? 'selected' : ''}>4 Columns</option>
            </select>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Number of columns in this container
            </small>
          </div>
          ${component.props.numColumns >= 1 ? `
            <div class="property-field">
              <label class="property-label">Column 1 Width (1-12)</label>
              <input type="number" class="property-input" data-prop="col1Width" value="${component.props.col1Width || (component.props.numColumns === 1 ? 12 : component.props.numColumns === 2 ? 6 : component.props.numColumns === 3 ? 4 : 3)}" min="1" max="12" step="1">
              <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
                Bootstrap grid columns (1-12, total should equal 12)
              </small>
            </div>
          ` : ''}
          ${component.props.numColumns >= 2 ? `
            <div class="property-field">
              <label class="property-label">Column 2 Width (1-12)</label>
              <input type="number" class="property-input" data-prop="col2Width" value="${component.props.col2Width || (component.props.numColumns === 2 ? 6 : component.props.numColumns === 3 ? 4 : 3)}" min="1" max="12" step="1">
            </div>
          ` : ''}
          ${component.props.numColumns >= 3 ? `
            <div class="property-field">
              <label class="property-label">Column 3 Width (1-12)</label>
              <input type="number" class="property-input" data-prop="col3Width" value="${component.props.col3Width || (component.props.numColumns === 3 ? 4 : 3)}" min="1" max="12" step="1">
            </div>
          ` : ''}
          ${component.props.numColumns >= 4 ? `
            <div class="property-field">
              <label class="property-label">Column 4 Width (1-12)</label>
              <input type="number" class="property-input" data-prop="col4Width" value="${component.props.col4Width || 3}" min="1" max="12" step="1">
            </div>
          ` : ''}
          <div class="property-field">
            <label class="property-label">Quick Layouts</label>
            <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem; flex-wrap: wrap;">
              <button type="button" class="btn btn-sm btn-outline-secondary" onclick="
                const nc = document.querySelector('[data-prop=\\'numColumns\\']');
                nc.value = 2;
                nc.dispatchEvent(new Event('change'));
                setTimeout(() => {
                  const c1 = document.querySelector('[data-prop=\\'col1Width\\']');
                  const c2 = document.querySelector('[data-prop=\\'col2Width\\']');
                  if (c1) { c1.value = 6; c1.dispatchEvent(new Event('change')); }
                  if (c2) { c2.value = 6; c2.dispatchEvent(new Event('change')); }
                }, 100);
              ">50/50</button>
              <button type="button" class="btn btn-sm btn-outline-secondary" onclick="
                const nc = document.querySelector('[data-prop=\\'numColumns\\']');
                nc.value = 2;
                nc.dispatchEvent(new Event('change'));
                setTimeout(() => {
                  const c1 = document.querySelector('[data-prop=\\'col1Width\\']');
                  const c2 = document.querySelector('[data-prop=\\'col2Width\\']');
                  if (c1) { c1.value = 8; c1.dispatchEvent(new Event('change')); }
                  if (c2) { c2.value = 4; c2.dispatchEvent(new Event('change')); }
                }, 100);
              ">66/33</button>
              <button type="button" class="btn btn-sm btn-outline-secondary" onclick="
                const nc = document.querySelector('[data-prop=\\'numColumns\\']');
                nc.value = 2;
                nc.dispatchEvent(new Event('change'));
                setTimeout(() => {
                  const c1 = document.querySelector('[data-prop=\\'col1Width\\']');
                  const c2 = document.querySelector('[data-prop=\\'col2Width\\']');
                  if (c1) { c1.value = 4; c1.dispatchEvent(new Event('change')); }
                  if (c2) { c2.value = 8; c2.dispatchEvent(new Event('change')); }
                }, 100);
              ">33/66</button>
              <button type="button" class="btn btn-sm btn-outline-secondary" onclick="
                const nc = document.querySelector('[data-prop=\\'numColumns\\']');
                nc.value = 3;
                nc.dispatchEvent(new Event('change'));
                setTimeout(() => {
                  const c1 = document.querySelector('[data-prop=\\'col1Width\\']');
                  const c2 = document.querySelector('[data-prop=\\'col2Width\\']');
                  const c3 = document.querySelector('[data-prop=\\'col3Width\\']');
                  if (c1) { c1.value = 4; c1.dispatchEvent(new Event('change')); }
                  if (c2) { c2.value = 4; c2.dispatchEvent(new Event('change')); }
                  if (c3) { c3.value = 4; c3.dispatchEvent(new Event('change')); }
                }, 100);
              ">Equal 3</button>
            </div>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.5rem; display: block;">
              Common layout presets for quick selection
            </small>
          </div>
        </div>

        <div class="property-group">
          <div class="property-group-title">Container Styling</div>
          <div class="property-field">
            <label class="property-label">Background Color</label>
            <input type="text" class="property-input" data-prop="backgroundColor" value="${component.props.backgroundColor || 'rgba(0,120,212,0.05)'}" placeholder="rgba(0,120,212,0.05)">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Background color (hex, rgb, rgba, or CSS color name)
            </small>
          </div>
          <div class="property-field">
            <label class="property-label">Padding (0-5)</label>
            <input type="number" class="property-input" data-prop="padding" value="${component.props.padding || 3}" min="0" max="5" step="1">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Bootstrap padding scale (0=0, 1=0.25rem, 2=0.5rem, 3=1rem, 4=1.5rem, 5=3rem)
            </small>
          </div>
          <div class="property-field">
            <label class="property-label">Minimum Height (px)</label>
            <input type="number" class="property-input" data-prop="minHeight" value="${component.props.minHeight || 100}" min="50" max="1000" step="10">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Minimum container height in pixels
            </small>
          </div>
          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="border" ${component.props.border !== false ? 'checked' : ''}>
              Show Border
            </label>
          </div>
          <div class="property-field" ${component.props.border !== false ? '' : 'style="display: none;"'}>
            <label class="property-label">Border Color</label>
            <input type="color" class="property-input" data-prop="borderColor" value="${component.props.borderColor || '#dee2e6'}">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Custom border color (only if border is enabled)
            </small>
          </div>
          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="rounded" ${component.props.rounded !== false ? 'checked' : ''}>
              Rounded Corners
            </label>
          </div>
          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="shadow" ${component.props.shadow ? 'checked' : ''}>
              Drop Shadow
            </label>
          </div>
        </div>

        <div class="property-group">
          <div class="property-group-title">Visibility</div>
          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="hidden" ${component.props.hidden ? 'checked' : ''}>
              Hidden (Conditional Visibility)
            </label>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Hide container from view (use with event handlers for dynamic show/hide)
            </small>
          </div>
        </div>
      `;
    }

    renderTabsEnhancements(component) {
      if (component.type !== 'tabs') return '';

      return `
        <div class="property-group">
          <div class="property-group-title">Tab Management</div>
          <div class="property-field">
            <label class="property-label">Manage Tabs</label>
            <div id="tabs-manager" style="margin-top: 0.5rem;">
              ${(component.props.tabs || []).map((tab, index) => `
                <div class="tab-item" style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem; align-items: center; padding: 0.5rem; border: 1px solid #dee2e6; border-radius: 0.25rem; background: #f8f9fa;">
                  <span style="font-weight: 500; min-width: 60px;">Tab ${index + 1}:</span>
                  <input type="text" class="form-control form-control-sm" value="${tab.label}"
                    onchange="
                      const tabs = JSON.parse(JSON.stringify(window.FORM_DESIGNER_STATE.selectedComponent.props.tabs));
                      tabs[${index}].label = this.value;
                      window.FORM_DESIGNER_STATE.selectedComponent.props.tabs = tabs;
                      window.FORM_DESIGNER_STATE.isDirty = true;
                      window.FORM_DESIGNER_STATE.instance.renderCanvas();
                      window.FORM_DESIGNER_STATE.instance.showProperties(window.FORM_DESIGNER_STATE.selectedComponent);
                    " placeholder="Tab Label" style="flex: 1;">
                  <input type="text" class="form-control form-control-sm" value="${tab.icon || ''}"
                    onchange="
                      const tabs = JSON.parse(JSON.stringify(window.FORM_DESIGNER_STATE.selectedComponent.props.tabs));
                      tabs[${index}].icon = this.value;
                      window.FORM_DESIGNER_STATE.selectedComponent.props.tabs = tabs;
                      window.FORM_DESIGNER_STATE.isDirty = true;
                      window.FORM_DESIGNER_STATE.instance.renderCanvas();
                      window.FORM_DESIGNER_STATE.instance.showProperties(window.FORM_DESIGNER_STATE.selectedComponent);
                    " placeholder="Icon (e.g., fa-home)" style="flex: 0.7;">
                  <button type="button" class="btn btn-sm btn-danger"
                    onclick="
                      const tabs = JSON.parse(JSON.stringify(window.FORM_DESIGNER_STATE.selectedComponent.props.tabs));
                      if (tabs.length > 1) {
                        tabs.splice(${index}, 1);
                        window.FORM_DESIGNER_STATE.selectedComponent.props.tabs = tabs;
                        if (window.FORM_DESIGNER_STATE.selectedComponent.props.activeTab === '${tab.id}') {
                          window.FORM_DESIGNER_STATE.selectedComponent.props.activeTab = tabs[0].id;
                        }
                        window.FORM_DESIGNER_STATE.isDirty = true;
                        window.FORM_DESIGNER_STATE.instance.renderCanvas();
                        window.FORM_DESIGNER_STATE.instance.showProperties(window.FORM_DESIGNER_STATE.selectedComponent);
                      } else {
                        alert('Cannot delete the last tab');
                      }
                    " style="padding: 0.25rem 0.5rem;">
                    <i class="fa fa-trash"></i>
                  </button>
                </div>
              `).join('')}
              <button type="button" class="btn btn-sm btn-primary w-100"
                onclick="
                  const tabs = JSON.parse(JSON.stringify(window.FORM_DESIGNER_STATE.selectedComponent.props.tabs));
                  const newTabNumber = tabs.length + 1;
                  const newTabId = 'tab' + Date.now();
                  tabs.push({
                    id: newTabId,
                    label: 'Tab ' + newTabNumber,
                    icon: '',
                    content: 'Tab ' + newTabNumber + ' content'
                  });
                  window.FORM_DESIGNER_STATE.selectedComponent.props.tabs = tabs;
                  window.FORM_DESIGNER_STATE.isDirty = true;
                  window.FORM_DESIGNER_STATE.instance.renderCanvas();
                  window.FORM_DESIGNER_STATE.instance.showProperties(window.FORM_DESIGNER_STATE.selectedComponent);
                " style="margin-top: 0.5rem;">
                <i class="fa fa-plus"></i> Add Tab
              </button>
            </div>
          </div>

          <div class="property-field" style="margin-top: 1rem;">
            <label class="property-label">Active Tab</label>
            <select class="property-input" data-prop="activeTab">
              ${(component.props.tabs || []).map(tab => `
                <option value="${tab.id}" ${component.props.activeTab === tab.id ? 'selected' : ''}>
                  ${tab.label}
                </option>
              `).join('')}
            </select>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Select which tab is initially active when the form loads
            </small>
          </div>
        </div>

        <div class="property-group">
          <div class="property-group-title">Tab Styling</div>
          <div class="property-field">
            <label class="property-label">Tab Style</label>
            <select class="property-input" data-prop="tabStyle">
              <option value="tabs" ${component.props.tabStyle === 'tabs' ? 'selected' : ''}>Tabs (Standard)</option>
              <option value="pills" ${component.props.tabStyle === 'pills' ? 'selected' : ''}>Pills (Rounded)</option>
              <option value="underline" ${component.props.tabStyle === 'underline' ? 'selected' : ''}>Underline</option>
            </select>
          </div>

          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="fill" ${component.props.fill ? 'checked' : ''}>
              Fill (Equal Width Tabs)
            </label>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Make all tabs the same width, filling available space equally
            </small>
          </div>

          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="justified" ${component.props.justified ? 'checked' : ''}>
              Justified (Full Width)
            </label>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Stretch tabs to fill the full width of the container
            </small>
          </div>
        </div>

        <div class="property-group">
          <div class="property-group-title">Tab Colors</div>
          <div class="property-field">
            <label class="property-label">Active Tab Color</label>
            <input type="color" class="property-input" data-prop="activeTabColor" value="${component.props.activeTabColor || '#0d6efd'}">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Background color for the currently active tab
            </small>
          </div>

          <div class="property-field">
            <label class="property-label">Border Color</label>
            <input type="color" class="property-input" data-prop="borderColor" value="${component.props.borderColor || '#dee2e6'}">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Color for tab borders and content area border
            </small>
          </div>
        </div>

        <div class="property-group">
          <div class="property-group-title">Content Area</div>
          <div class="property-field">
            <label class="property-label">Background Color</label>
            <input type="color" class="property-input" data-prop="contentBackground" value="${component.props.contentBackground || '#ffffff'}">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Background color for the tab content area (use transparent for none)
            </small>
          </div>

          <div class="property-field">
            <label class="property-label">Padding (0-5)</label>
            <select class="property-input" data-prop="padding">
              <option value="0" ${component.props.padding === 0 ? 'selected' : ''}>None (p-0)</option>
              <option value="1" ${component.props.padding === 1 ? 'selected' : ''}>Tight (p-1)</option>
              <option value="2" ${component.props.padding === 2 ? 'selected' : ''}>Compact (p-2)</option>
              <option value="3" ${component.props.padding === 3 ? 'selected' : ''}>Normal (p-3)</option>
              <option value="4" ${component.props.padding === 4 ? 'selected' : ''}>Comfortable (p-4)</option>
              <option value="5" ${component.props.padding === 5 ? 'selected' : ''}>Spacious (p-5)</option>
            </select>
          </div>

          <div class="property-field">
            <label class="property-label">Min Height (px)</label>
            <input type="number" class="property-input" data-prop="minHeight" value="${component.props.minHeight || 100}" min="50" max="1000" step="10">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Minimum height for tab content area
            </small>
          </div>

          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="contentBorder" ${component.props.contentBorder ? 'checked' : ''}>
              Show Content Border
            </label>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Display border around the content area
            </small>
          </div>
        </div>

        <div class="property-group">
          <div class="property-group-title">Visibility</div>
          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="hidden" ${component.props.hidden ? 'checked' : ''}>
              Hidden (Conditional Visibility)
            </label>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Hide tabs from view (use with event handlers for dynamic show/hide)
            </small>
          </div>
        </div>
      `;
    }

    renderAccordionEnhancements(component) {
      if (component.type !== 'accordion') return '';

      return `
        <div class="property-group">
          <div class="property-group-title">Panel Management</div>
          <div class="property-field">
            <label class="property-label">Manage Panels</label>
            <div id="panels-manager" style="margin-top: 0.5rem;">
              ${(component.props.panels || []).map((panel, index) => `
                <div class="panel-item" style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem; align-items: center; padding: 0.5rem; border: 1px solid #dee2e6; border-radius: 0.25rem; background: #f8f9fa;">
                  <span style="font-weight: 500; min-width: 70px;">Panel ${index + 1}:</span>
                  <input type="text" class="form-control form-control-sm" value="${panel.header}"
                    onchange="
                      const panels = JSON.parse(JSON.stringify(window.FORM_DESIGNER_STATE.selectedComponent.props.panels));
                      panels[${index}].header = this.value;
                      window.FORM_DESIGNER_STATE.selectedComponent.props.panels = panels;
                      window.FORM_DESIGNER_STATE.isDirty = true;
                      window.FORM_DESIGNER_STATE.instance.renderCanvas();
                      window.FORM_DESIGNER_STATE.instance.showProperties(window.FORM_DESIGNER_STATE.selectedComponent);
                    " placeholder="Panel Header" style="flex: 1;">
                  <input type="text" class="form-control form-control-sm" value="${panel.icon || ''}"
                    onchange="
                      const panels = JSON.parse(JSON.stringify(window.FORM_DESIGNER_STATE.selectedComponent.props.panels));
                      panels[${index}].icon = this.value;
                      window.FORM_DESIGNER_STATE.selectedComponent.props.panels = panels;
                      window.FORM_DESIGNER_STATE.isDirty = true;
                      window.FORM_DESIGNER_STATE.instance.renderCanvas();
                      window.FORM_DESIGNER_STATE.instance.showProperties(window.FORM_DESIGNER_STATE.selectedComponent);
                    " placeholder="Icon (e.g., fa-info)" style="flex: 0.7;">
                  <button type="button" class="btn btn-sm btn-danger"
                    onclick="
                      const panels = JSON.parse(JSON.stringify(window.FORM_DESIGNER_STATE.selectedComponent.props.panels));
                      if (panels.length > 1) {
                        panels.splice(${index}, 1);
                        window.FORM_DESIGNER_STATE.selectedComponent.props.panels = panels;
                        // Remove from openPanels if present
                        const openPanels = window.FORM_DESIGNER_STATE.selectedComponent.props.openPanels || [];
                        const newOpenPanels = openPanels.filter(id => id !== '${panel.id}');
                        window.FORM_DESIGNER_STATE.selectedComponent.props.openPanels = newOpenPanels.length > 0 ? newOpenPanels : [panels[0].id];
                        window.FORM_DESIGNER_STATE.isDirty = true;
                        window.FORM_DESIGNER_STATE.instance.renderCanvas();
                        window.FORM_DESIGNER_STATE.instance.showProperties(window.FORM_DESIGNER_STATE.selectedComponent);
                      } else {
                        alert('Cannot delete the last panel');
                      }
                    " style="padding: 0.25rem 0.5rem;">
                    <i class="fa fa-trash"></i>
                  </button>
                </div>
              `).join('')}
              <button type="button" class="btn btn-sm btn-primary w-100"
                onclick="
                  const panels = JSON.parse(JSON.stringify(window.FORM_DESIGNER_STATE.selectedComponent.props.panels));
                  const newPanelNumber = panels.length + 1;
                  const newPanelId = 'panel' + Date.now();
                  panels.push({
                    id: newPanelId,
                    header: 'Section ' + newPanelNumber,
                    icon: '',
                    content: 'Section ' + newPanelNumber + ' content'
                  });
                  window.FORM_DESIGNER_STATE.selectedComponent.props.panels = panels;
                  window.FORM_DESIGNER_STATE.isDirty = true;
                  window.FORM_DESIGNER_STATE.instance.renderCanvas();
                  window.FORM_DESIGNER_STATE.instance.showProperties(window.FORM_DESIGNER_STATE.selectedComponent);
                " style="margin-top: 0.5rem;">
                <i class="fa fa-plus"></i> Add Panel
              </button>
            </div>
          </div>
        </div>

        <div class="property-group">
          <div class="property-group-title">Panel Behavior</div>
          <div class="property-field">
            <label class="property-label">Initially Open Panels</label>
            <div style="margin-top: 0.5rem;">
              ${(component.props.panels || []).map(panel => `
                <label class="property-checkbox-label" style="display: block; margin-bottom: 0.5rem;">
                  <input type="checkbox" class="form-check-input"
                    ${(component.props.openPanels || []).includes(panel.id) ? 'checked' : ''}
                    onchange="
                      const openPanels = JSON.parse(JSON.stringify(window.FORM_DESIGNER_STATE.selectedComponent.props.openPanels || []));
                      if (this.checked) {
                        if (!openPanels.includes('${panel.id}')) {
                          openPanels.push('${panel.id}');
                        }
                      } else {
                        const idx = openPanels.indexOf('${panel.id}');
                        if (idx > -1) openPanels.splice(idx, 1);
                      }
                      window.FORM_DESIGNER_STATE.selectedComponent.props.openPanels = openPanels;
                      window.FORM_DESIGNER_STATE.isDirty = true;
                      window.FORM_DESIGNER_STATE.instance.renderCanvas();
                      window.FORM_DESIGNER_STATE.instance.showProperties(window.FORM_DESIGNER_STATE.selectedComponent);
                    ">
                  ${panel.header}
                </label>
              `).join('')}
            </div>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.5rem; display: block;">
              Select which panels are initially expanded when the form loads
            </small>
          </div>

          <div class="property-field" style="margin-top: 1rem;">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="alwaysOpen" ${component.props.alwaysOpen ? 'checked' : ''}>
              Always Open (Multiple Panels)
            </label>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Allow multiple panels to be open at the same time. If unchecked, opening one panel will close others (accordion behavior).
            </small>
          </div>

          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="flush" ${component.props.flush ? 'checked' : ''}>
              Flush (Remove Borders)
            </label>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Remove borders and rounded corners for a seamless look
            </small>
          </div>
        </div>

        <div class="property-group">
          <div class="property-group-title">Header Styling</div>
          <div class="property-field">
            <label class="property-label">Header Background</label>
            <input type="color" class="property-input" data-prop="headerBackground" value="${component.props.headerBackground || '#ffffff'}">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Background color for panel headers
            </small>
          </div>

          <div class="property-field">
            <label class="property-label">Header Text Color</label>
            <input type="color" class="property-input" data-prop="headerColor" value="${component.props.headerColor || '#000000'}">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Text color for panel headers
            </small>
          </div>

          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="headerBold" ${component.props.headerBold ? 'checked' : ''}>
              Bold Header Text
            </label>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Make header text bold for emphasis
            </small>
          </div>
        </div>

        <div class="property-group">
          <div class="property-group-title">Panel Styling</div>
          <div class="property-field">
            <label class="property-label">Item Background</label>
            <input type="color" class="property-input" data-prop="itemBackground" value="${component.props.itemBackground || '#ffffff'}">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Background color for entire panel items
            </small>
          </div>

          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="itemBorder" ${component.props.itemBorder ? 'checked' : ''}>
              Show Item Borders
            </label>
          </div>

          <div class="property-field">
            <label class="property-label">Border Color</label>
            <input type="color" class="property-input" data-prop="borderColor" value="${component.props.borderColor || '#dee2e6'}">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Color for panel borders
            </small>
          </div>
        </div>

        <div class="property-group">
          <div class="property-group-title">Body Styling</div>
          <div class="property-field">
            <label class="property-label">Body Background</label>
            <input type="color" class="property-input" data-prop="bodyBackground" value="${component.props.bodyBackground || '#ffffff'}">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Background color for panel content areas
            </small>
          </div>

          <div class="property-field">
            <label class="property-label">Body Padding (rem)</label>
            <input type="number" class="property-input" data-prop="bodyPadding" value="${component.props.bodyPadding || 1}" min="0" max="5" step="0.5">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Padding for panel content in rem units (0-5)
            </small>
          </div>
        </div>

        <div class="property-group">
          <div class="property-group-title">Visibility</div>
          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="hidden" ${component.props.hidden ? 'checked' : ''}>
              Hidden (Conditional Visibility)
            </label>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Hide accordion from view (use with event handlers for dynamic show/hide)
            </small>
          </div>
        </div>
      `;
    }

    renderEntityPickerEnhancements(component) {
      if (component.type !== 'entity-picker') return '';

      return `
        <div class="property-group">
          <div class="property-group-title">Entity Configuration</div>
          <div class="property-field">
            <label class="property-label">Entity Name</label>
            <input type="text" class="property-input" data-prop="entityName" value="${component.props.entityName || ''}" placeholder="e.g., Contact, Account">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Name of the Low-Code entity to fetch records from
            </small>
          </div>

          <div class="property-field">
            <label class="property-label">Display Field</label>
            <input type="text" class="property-input" data-prop="displayField" value="${component.props.displayField || ''}" placeholder="e.g., name, fullName, title">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Field to display in the dropdown options
            </small>
          </div>

          <div class="property-field">
            <label class="property-label">Value Field</label>
            <input type="text" class="property-input" data-prop="valueField" value="${component.props.valueField || 'id'}" placeholder="id">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Field to use as the value when a record is selected (usually 'id')
            </small>
          </div>
        </div>

        <div class="property-group">
          <div class="property-group-title">Filtering & Sorting</div>
          <div class="property-field">
            <label class="property-label">Filter Field</label>
            <input type="text" class="property-input" data-prop="filterField" value="${component.props.filterField || ''}" placeholder="e.g., status, category">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Optional field to filter records by
            </small>
          </div>

          <div class="property-field">
            <label class="property-label">Filter Value</label>
            <input type="text" class="property-input" data-prop="filterValue" value="${component.props.filterValue || ''}" placeholder="e.g., active, published">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Value to match in the filter field
            </small>
          </div>

          <div class="property-field">
            <label class="property-label">Order By Field</label>
            <input type="text" class="property-input" data-prop="orderBy" value="${component.props.orderBy || ''}" placeholder="e.g., name, createdAt">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Field to sort records by
            </small>
          </div>

          <div class="property-field">
            <label class="property-label">Order Direction</label>
            <select class="property-input" data-prop="orderDirection">
              <option value="asc" ${component.props.orderDirection === 'asc' ? 'selected' : ''}>Ascending (A-Z, 0-9)</option>
              <option value="desc" ${component.props.orderDirection === 'desc' ? 'selected' : ''}>Descending (Z-A, 9-0)</option>
            </select>
          </div>
        </div>

        <div class="property-group">
          <div class="property-group-title">Features</div>
          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="allowClear" ${component.props.allowClear ? 'checked' : ''}>
              Allow Clear
            </label>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Show a button to clear the selected value
            </small>
          </div>

          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="allowAdd" ${component.props.allowAdd ? 'checked' : ''}>
              Allow Add New
            </label>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Show a button to create new records inline
            </small>
          </div>

          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="showSearch" ${component.props.showSearch ? 'checked' : ''}>
              Show Advanced Search
            </label>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Show a button to open advanced search dialog
            </small>
          </div>

          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="enableTypeahead" ${component.props.enableTypeahead ? 'checked' : ''}>
              Enable Typeahead Search
            </label>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Enable real-time search as user types
            </small>
          </div>

          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="multiSelect" ${component.props.multiSelect ? 'checked' : ''}>
              Multi-Select
            </label>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Allow selecting multiple records (changes to multi-select dropdown)
            </small>
          </div>
        </div>

        <div class="property-group">
          <div class="property-group-title">Display Options</div>
          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="showIcon" ${component.props.showIcon ? 'checked' : ''}>
              Show Icons
            </label>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Display icons next to options in the dropdown
            </small>
          </div>

          <div class="property-field">
            <label class="property-label">Icon Field</label>
            <input type="text" class="property-input" data-prop="iconField" value="${component.props.iconField || ''}" placeholder="e.g., icon, iconClass">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Field containing Font Awesome icon class (e.g., 'fa-user')
            </small>
          </div>

          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="showDescription" ${component.props.showDescription ? 'checked' : ''}>
              Show Description
            </label>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Show secondary description text under each option
            </small>
          </div>

          <div class="property-field">
            <label class="property-label">Description Field</label>
            <input type="text" class="property-input" data-prop="descriptionField" value="${component.props.descriptionField || ''}" placeholder="e.g., description, email, subtitle">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Field containing secondary text to show under the main display
            </small>
          </div>
        </div>

        <div class="property-group">
          <div class="property-group-title">Basic Configuration</div>
          <div class="property-field">
            <label class="property-label">Label</label>
            <input type="text" class="property-input" data-prop="label" value="${component.props.label || 'Entity Picker'}" placeholder="Entity Picker">
          </div>

          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="hideLabel" ${component.props.hideLabel ? 'checked' : ''}>
              Hide Label
            </label>
          </div>

          <div class="property-field">
            <label class="property-label">Placeholder</label>
            <input type="text" class="property-input" data-prop="placeholder" value="${component.props.placeholder || ''}" placeholder="Select...">
          </div>

          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="required" ${component.props.required ? 'checked' : ''}>
              Required
            </label>
          </div>

          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="disabled" ${component.props.disabled ? 'checked' : ''}>
              Disabled
            </label>
          </div>

          <div class="property-field">
            <label class="property-label">Size</label>
            <select class="property-input" data-prop="size">
              <option value="" ${component.props.size === '' ? 'selected' : ''}>Normal</option>
              <option value="sm" ${component.props.size === 'sm' ? 'selected' : ''}>Small</option>
              <option value="lg" ${component.props.size === 'lg' ? 'selected' : ''}>Large</option>
            </select>
          </div>

          <div class="property-field">
            <label class="property-label">Help Text</label>
            <textarea class="property-input" data-prop="helpText" rows="2" placeholder="Additional help text">${component.props.helpText || ''}</textarea>
          </div>
        </div>

        <div class="property-group">
          <div class="property-group-title">Visibility</div>
          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="hidden" ${component.props.hidden ? 'checked' : ''}>
              Hidden (Conditional Visibility)
            </label>
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Hide entity picker from view (use with event handlers for dynamic show/hide)
            </small>
          </div>
        </div>
      `;
    }

    renderCRUDInterfaceEnhancements(component) {
      if (component.type !== 'crud-interface') return '';

      return `
        <div class="property-group">
          <div class="property-group-title">Entity Configuration</div>
          <div class="property-field">
            <label class="property-label">Entity Name</label>
            <input type="text" class="property-input" data-prop="entityName" value="${component.props.entityName || ''}" placeholder="e.g., Contact, Task">
          </div>

          <div class="property-field">
            <label class="property-label">Title</label>
            <input type="text" class="property-input" data-prop="title" value="${component.props.title || 'CRUD Interface'}" placeholder="CRUD Interface">
          </div>
        </div>

        <div class="property-group">
          <div class="property-group-title">Table Styling</div>
          <div class="property-field">
            <label class="property-label">Table Style</label>
            <select class="property-input" data-prop="tableStyle">
              <option value="table-striped" ${component.props.tableStyle === 'table-striped' ? 'selected' : ''}>Striped</option>
              <option value="" ${component.props.tableStyle === '' ? 'selected' : ''}>Plain</option>
              <option value="table-dark" ${component.props.tableStyle === 'table-dark' ? 'selected' : ''}>Dark</option>
            </select>
          </div>

          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="tableBordered" ${component.props.tableBordered ? 'checked' : ''}>
              Show Borders
            </label>
          </div>

          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="tableHover" ${component.props.tableHover ? 'checked' : ''}>
              Hover Effect
            </label>
          </div>

          <div class="property-field">
            <label class="property-label">Header Color</label>
            <input type="color" class="property-input" data-prop="headerColor" value="${component.props.headerColor || '#ffffff'}">
          </div>
        </div>

        <div class="property-group">
          <div class="property-group-title">Features</div>
          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="showAdd" ${component.props.showAdd ? 'checked' : ''}>
              Show Add Button
            </label>
          </div>

          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="showSearch" ${component.props.showSearch ? 'checked' : ''}>
              Show Search Box
            </label>
          </div>

          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="showPagination" ${component.props.showPagination ? 'checked' : ''}>
              Show Pagination
            </label>
          </div>

          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="showCheckboxes" ${component.props.showCheckboxes ? 'checked' : ''}>
              Show Selection Checkboxes
            </label>
          </div>

          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="showActions" ${component.props.showActions ? 'checked' : ''}>
              Show Actions Column
            </label>
          </div>
        </div>

        <div class="property-group">
          <div class="property-group-title">CRUD Operations</div>
          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="enableView" ${component.props.enableView ? 'checked' : ''}>
              Enable View
            </label>
          </div>

          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="enableEdit" ${component.props.enableEdit ? 'checked' : ''}>
              Enable Edit
            </label>
          </div>

          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="enableDelete" ${component.props.enableDelete ? 'checked' : ''}>
              Enable Delete
            </label>
          </div>
        </div>

        <div class="property-group">
          <div class="property-group-title">Visibility</div>
          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="hidden" ${component.props.hidden ? 'checked' : ''}>
              Hidden
            </label>
          </div>
        </div>
      `;
    }

    renderSubgridEnhancements(component) {
      if (component.type !== 'subgrid') return '';

      return `
        <div class="property-group">
          <div class="property-group-title">Entity Configuration</div>
          <div class="property-field">
            <label class="property-label">Label</label>
            <input type="text" class="property-input" data-prop="label" value="${component.props.label || 'Subgrid'}" placeholder="Subgrid">
          </div>

          <div class="property-field">
            <label class="property-label">Entity Name</label>
            <input type="text" class="property-input" data-prop="entityName" value="${component.props.entityName || ''}" placeholder="e.g., OrderItem, Note">
          </div>

          <div class="property-field">
            <label class="property-label">Relationship Field</label>
            <input type="text" class="property-input" data-prop="relationshipField" value="${component.props.relationshipField || ''}" placeholder="e.g., orderId, contactId">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Foreign key field that links to parent record
            </small>
          </div>
        </div>

        <div class="property-group">
          <div class="property-group-title">Display Options</div>
          <div class="property-field">
            <label class="property-label">Background Color</label>
            <input type="color" class="property-input" data-prop="backgroundColor" value="${component.props.backgroundColor || '#f8f9fa'}">
          </div>

          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="tableBordered" ${component.props.tableBordered ? 'checked' : ''}>
              Table Bordered
            </label>
          </div>

          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="tableHover" ${component.props.tableHover ? 'checked' : ''}>
              Table Hover
            </label>
          </div>
        </div>

        <div class="property-group">
          <div class="property-group-title">Features</div>
          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="showToolbar" ${component.props.showToolbar ? 'checked' : ''}>
              Show Toolbar
            </label>
          </div>

          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="allowAdd" ${component.props.allowAdd ? 'checked' : ''}>
              Allow Add
            </label>
          </div>

          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="editable" ${component.props.editable ? 'checked' : ''}>
              Editable (Inline Edit/Delete)
            </label>
          </div>

          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="showPagination" ${component.props.showPagination ? 'checked' : ''}>
              Show Pagination
            </label>
          </div>
        </div>

        <div class="property-group">
          <div class="property-group-title">Visibility</div>
          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="hidden" ${component.props.hidden ? 'checked' : ''}>
              Hidden
            </label>
          </div>
        </div>
      `;
    }

    renderOptionsListEnhancements(component) {
      if (component.type !== 'options-list') return '';

      return `
        <div class="property-group">
          <div class="property-group-title">Basic Configuration</div>
          <div class="property-field">
            <label class="property-label">Label</label>
            <input type="text" class="property-input" data-prop="label" value="${component.props.label || 'Options List'}" placeholder="Options List">
          </div>

          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="required" ${component.props.required ? 'checked' : ''}>
              Required
            </label>
          </div>

          <div class="property-field">
            <label class="property-label">Help Text</label>
            <textarea class="property-input" data-prop="helpText" rows="2">${component.props.helpText || ''}</textarea>
          </div>
        </div>

        <div class="property-group">
          <div class="property-group-title">Data Source</div>
          <div class="property-field">
            <label class="property-label">Source Type</label>
            <select class="property-input" data-prop="dataSource">
              <option value="static" ${component.props.dataSource === 'static' ? 'selected' : ''}>Static Options</option>
              <option value="entity" ${component.props.dataSource === 'entity' ? 'selected' : ''}>Entity Data</option>
            </select>
          </div>

          ${component.props.dataSource === 'entity' ? `
            <div class="property-field">
              <label class="property-label">Entity Name</label>
              <input type="text" class="property-input" data-prop="entityName" value="${component.props.entityName || ''}" placeholder="e.g., Category, Status">
            </div>

            <div class="property-field">
              <label class="property-label">Display Field</label>
              <input type="text" class="property-input" data-prop="displayField" value="${component.props.displayField || ''}" placeholder="e.g., name, title">
            </div>
          ` : ''}
        </div>

        <div class="property-group">
          <div class="property-group-title">Selection Type</div>
          <div class="property-field">
            <label class="property-label">Type</label>
            <select class="property-input" data-prop="selectionType">
              <option value="checkbox" ${component.props.selectionType === 'checkbox' ? 'selected' : ''}>Checkbox (Multi-select)</option>
              <option value="radio" ${component.props.selectionType === 'radio' ? 'selected' : ''}>Radio (Single-select)</option>
              <option value="none" ${component.props.selectionType === 'none' ? 'selected' : ''}>None (Display only)</option>
            </select>
          </div>
        </div>

        <div class="property-group">
          <div class="property-group-title">Display Options</div>
          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="interactive" ${component.props.interactive ? 'checked' : ''}>
              Interactive (Hover effects)
            </label>
          </div>

          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="boldLabels" ${component.props.boldLabels ? 'checked' : ''}>
              Bold Labels
            </label>
          </div>

          <div class="property-field">
            <label class="property-label">Max Height (px)</label>
            <input type="number" class="property-input" data-prop="maxHeight" value="${component.props.maxHeight || 0}" min="0" step="50" placeholder="0 = no limit">
            <small style="color: var(--text-secondary); font-size: 0.813rem; margin-top: 0.25rem; display: block;">
              Maximum height before scrolling (0 = no limit)
            </small>
          </div>
        </div>

        <div class="property-group">
          <div class="property-group-title">Visibility</div>
          <div class="property-field">
            <label class="property-checkbox-label">
              <input type="checkbox" class="form-check-input property-input" data-prop="hidden" ${component.props.hidden ? 'checked' : ''}>
              Hidden
            </label>
          </div>
        </div>
      `;
    }

    renderEventsTab(component) {
      const eventsTable = document.getElementById('componentEventsTable');

      // Get events associated with this component
      const componentEvents = (this.state.eventHandlers || []).filter(handler =>
        handler.objectId === component.id
      );

      if (componentEvents.length === 0) {
        eventsTable.innerHTML = `
          <p style="color: var(--text-secondary); font-size: 0.875rem; padding: 1rem;">
            No events configured for this component. Use the Event Handlers tab to add events.
          </p>
        `;
        return;
      }

      eventsTable.innerHTML = `
        <table class="table-simple" style="width: 100%; margin-top: 0.5rem;">
          <thead>
            <tr>
              <th>Trigger</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${componentEvents.map(event => `
              <tr>
                <td><span class="badge bg-primary">${event.trigger}</span></td>
                <td>${event.action || event.actionType}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    renderVariablesTab(component) {
      const variablesTable = document.getElementById('componentVariablesTable');
      variablesTable.innerHTML = `
        <p style="color: var(--text-secondary); font-size: 0.875rem; padding: 1rem;">
          Variables associated with this component will appear here. Use data binding to connect variables.
        </p>
      `;
    }

    renderPermissionsTab(component) {
      const permissionsTable = document.getElementById('componentPermissionsTable');

      // Initialize component permissions if they don't exist
      if (!component.permissions) {
        component.permissions = {
          visible: 'all',
          editable: 'all'
        };
      }

      permissionsTable.innerHTML = `
        <div class="property-field" style="margin-top: 1rem;">
          <label class="property-label">Visibility</label>
          <select class="property-input" id="compPermVisible">
            <option value="all" ${component.permissions.visible === 'all' ? 'selected' : ''}>All Users</option>
            <option value="authenticated" ${component.permissions.visible === 'authenticated' ? 'selected' : ''}>Authenticated Only</option>
            <option value="owner" ${component.permissions.visible === 'owner' ? 'selected' : ''}>Owner Only</option>
            <option value="specific" ${component.permissions.visible === 'specific' ? 'selected' : ''}>Specific Users/Roles</option>
            <option value="none" ${component.permissions.visible === 'none' ? 'selected' : ''}>Hidden</option>
          </select>
        </div>
        <div class="property-field">
          <label class="property-label">Editability</label>
          <select class="property-input" id="compPermEditable">
            <option value="all" ${component.permissions.editable === 'all' ? 'selected' : ''}>All Users</option>
            <option value="authenticated" ${component.permissions.editable === 'authenticated' ? 'selected' : ''}>Authenticated Only</option>
            <option value="owner" ${component.permissions.editable === 'owner' ? 'selected' : ''}>Owner Only</option>
            <option value="specific" ${component.permissions.editable === 'specific' ? 'selected' : ''}>Specific Users/Roles</option>
            <option value="none" ${component.permissions.editable === 'none' ? 'selected' : ''}>Readonly</option>
          </select>
        </div>
      `;

      // Add change listeners
      document.getElementById('compPermVisible')?.addEventListener('change', (e) => {
        component.permissions.visible = e.target.value;
        this.state.isDirty = true;
      });

      document.getElementById('compPermEditable')?.addEventListener('change', (e) => {
        component.permissions.editable = e.target.value;
        this.state.isDirty = true;
      });
    }

    renderWorkflowsTab(component) {
      const workflowsTable = document.getElementById('componentWorkflowsTable');
      workflowsTable.innerHTML = `
        <p style="color: var(--text-secondary); font-size: 0.875rem; padding: 1rem;">
          Workflows triggered by this component will appear here. Configure workflows in the Workflows tab.
        </p>
      `;
    }

    renderJsonTab(component) {
      const jsonView = document.getElementById('componentJsonView');
      jsonView.textContent = JSON.stringify(component, null, 2);
    }

    clearPropertyTabs() {
      document.getElementById('propertiesPanelTitle').textContent = 'Properties';
      document.getElementById('propertiesContent').innerHTML = `
        <div class="property-group">
          <div class="property-group-title">Component Settings</div>
          <p style="color: var(--text-secondary); font-size: 0.875rem;">
            Select a component to edit its properties
          </p>
        </div>
      `;
      document.getElementById('componentEventsTable').innerHTML = '';
      document.getElementById('componentVariablesTable').innerHTML = '';
      document.getElementById('componentPermissionsTable').innerHTML = '';
      document.getElementById('componentWorkflowsTable').innerHTML = '';
      document.getElementById('componentJsonView').textContent = '';
    }

    deleteComponent(componentId) {
      if (confirm('Delete this component?')) {
        // Remove from local components array
        this.components = this.components.filter(c => c.id !== componentId);

        // Sync with global state
        this.state.components = this.components;

        // Clear selection if deleted component was selected
        if (this.selectedComponent && this.selectedComponent.id === componentId) {
          this.selectedComponent = null;
        }

        // Re-render canvas and properties
        this.renderCanvas();
        this.renderProperties(null);

        // Mark as dirty
        this.state.isDirty = true;

        console.log('[Form Designer] Component deleted:', componentId);
      }
    }

    initializeMonacoEditors() {
      require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' } });
    }

    initializeFunctionsEditor() {
      require(['vs/editor/editor.main'], () => {
        const editor = monaco.editor.create(document.getElementById('functionEditor'), {
          value: '// Write your custom function here\nfunction myFunction() {\n  \n}',
          language: 'javascript',
          theme: 'vs-light',
          minimap: { enabled: false },
          fontSize: 14,
          lineNumbers: 'on',
          automaticLayout: true
        });
        this.monacoEditors.functions = editor;
      });
    }

    initializeJsonEditor() {
      require(['vs/editor/editor.main'], () => {
        const editor = monaco.editor.create(document.getElementById('jsonEditor'), {
          value: JSON.stringify(this.getFormJSON(), null, 2),
          language: 'json',
          theme: 'vs-light',
          minimap: { enabled: false },
          fontSize: 14,
          automaticLayout: true
        });
        this.monacoEditors.json = editor;
      });
    }

    getFormJSON() {
      return {
        name: this.state.form?.name || 'new-form',
        displayName: document.getElementById('formDisplayName').value,
        applicationId: this.state.appId,
        components: this.components,
        customFunctions: this.state.customFunctions,
        variables: this.state.variables,
        eventHandlers: this.state.eventHandlers,
        permissions: this.state.permissions,
        workflows: this.state.workflows,
        forgeMappings: this.state.forgeMappings
      };
    }

    loadForm(form) {
      if (form.components) {
        this.components = form.components;
        this.renderCanvas();
      }
    }

    toggleLivePreview() {
      const canvas = document.getElementById('formCanvas');
      canvas.classList.toggle('live-preview');

      if (canvas.classList.contains('live-preview')) {
        // Enable form interactions
        canvas.querySelectorAll('input, textarea, select, button').forEach(el => {
          el.disabled = false;
        });
      } else {
        // Disable form interactions
        canvas.querySelectorAll('input, textarea, select, button').forEach(el => {
          el.disabled = true;
        });
      }
    }

    async save() {
      const formData = this.getFormJSON();

      try {
        const response = await fetch(`/lowcode/api/forms${this.state.formId ? '/' + this.state.formId : ''}`, {
          method: this.state.formId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });

        if (response.ok) {
          const result = await response.json();
          this.state.formId = result.data.id;
          this.state.isDirty = false;
          alert('Form saved successfully!');
        } else {
          alert('Failed to save form');
        }
      } catch (error) {
        console.error('Save error:', error);
        alert('Error saving form');
      }
    }

    async publish() {
      await this.save();
      alert('Form published successfully!');
    }

    preview() {
      window.open(`/lowcode/apps/${this.state.appId}/forms/${this.state.formId}`, '_blank');
    }

    undo() {
      // TODO: Implement undo functionality
      console.log('Undo');
    }

    redo() {
      // TODO: Implement redo functionality
      console.log('Redo');
    }
  }

  // Initialize when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    window.formDesigner = new FormDesignerPro();
  });

})();
