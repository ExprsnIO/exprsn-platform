/**
 * ═══════════════════════════════════════════════════════════
 * HTML Components Seeder
 * Populates default reusable UI components
 * ═══════════════════════════════════════════════════════════
 */

const { v4: uuidv4 } = require('uuid');

// System user ID for default components
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const components = [
      // LAYOUT COMPONENTS
      {
        id: uuidv4(),
        name: 'Container',
        slug: 'container',
        category: 'layout',
        description: 'Responsive container with Bootstrap grid system',
        html_template: '<div class="container {{fluid}}">\n  {{content}}\n</div>',
        css: '.container { max-width: 1200px; margin: 0 auto; padding: 0 15px; }',
        javascript: '',
        properties: JSON.stringify([
          { name: 'fluid', type: 'boolean', default: false, label: 'Fluid width' },
          { name: 'content', type: 'html', default: '', label: 'Content' }
        ]),
        dependencies: JSON.stringify([]),
        icon: 'fa fa-box',
        is_public: true,
        is_system: true,
        author_id: SYSTEM_USER_ID,
        version: '1.0.0',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        name: 'Card',
        slug: 'card',
        category: 'layout',
        description: 'Bootstrap card component with header, body, and footer',
        html_template: `<div class="card {{class}}" style="{{style}}">
  {{#if header}}<div class="card-header">{{header}}</div>{{/if}}
  <div class="card-body">
    {{#if title}}<h5 class="card-title">{{title}}</h5>{{/if}}
    {{body}}
  </div>
  {{#if footer}}<div class="card-footer">{{footer}}</div>{{/if}}
</div>`,
        css: '.card { box-shadow: 0 2px 4px rgba(0,0,0,0.1); border-radius: 8px; }',
        javascript: '',
        properties: JSON.stringify([
          { name: 'header', type: 'string', default: '', label: 'Header text' },
          { name: 'title', type: 'string', default: '', label: 'Title' },
          { name: 'body', type: 'html', default: '', label: 'Body content' },
          { name: 'footer', type: 'string', default: '', label: 'Footer text' },
          { name: 'class', type: 'string', default: '', label: 'CSS classes' },
          { name: 'style', type: 'string', default: '', label: 'Inline styles' }
        ]),
        dependencies: JSON.stringify(['Bootstrap']),
        icon: 'fa fa-id-card',
        is_public: true,
        is_system: true,
        author_id: SYSTEM_USER_ID,
        version: '1.0.0',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        name: 'Modal',
        slug: 'modal',
        category: 'layout',
        description: 'Bootstrap modal dialog',
        html_template: `<div class="modal fade" id="{{id}}" tabindex="-1">
  <div class="modal-dialog {{size}}">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">{{title}}</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body">{{body}}</div>
      <div class="modal-footer">{{footer}}</div>
    </div>
  </div>
</div>`,
        css: '',
        javascript: '',
        properties: JSON.stringify([
          { name: 'id', type: 'string', default: 'modal', label: 'Modal ID' },
          { name: 'title', type: 'string', default: 'Modal Title', label: 'Title' },
          { name: 'body', type: 'html', default: '', label: 'Body content' },
          { name: 'footer', type: 'html', default: '', label: 'Footer content' },
          { name: 'size', type: 'select', options: ['', 'modal-sm', 'modal-lg', 'modal-xl'], default: '', label: 'Size' }
        ]),
        dependencies: JSON.stringify(['Bootstrap']),
        icon: 'fa fa-window-maximize',
        is_public: true,
        is_system: true,
        author_id: SYSTEM_USER_ID,
        version: '1.0.0',
        created_at: new Date(),
        updated_at: new Date()
      },

      // FORM COMPONENTS
      {
        id: uuidv4(),
        name: 'Text Input',
        slug: 'text-input',
        category: 'forms',
        description: 'Single-line text input field',
        html_template: `<div class="mb-3">
  {{#if label}}<label for="{{id}}" class="form-label">{{label}}</label>{{/if}}
  <input type="text" class="form-control" id="{{id}}" name="{{name}}" placeholder="{{placeholder}}" value="{{value}}" {{required}}>
  {{#if help}}<div class="form-text">{{help}}</div>{{/if}}
</div>`,
        css: '',
        javascript: '',
        properties: JSON.stringify([
          { name: 'id', type: 'string', default: '', label: 'ID' },
          { name: 'name', type: 'string', default: '', label: 'Name' },
          { name: 'label', type: 'string', default: '', label: 'Label' },
          { name: 'placeholder', type: 'string', default: '', label: 'Placeholder' },
          { name: 'value', type: 'string', default: '', label: 'Default value' },
          { name: 'help', type: 'string', default: '', label: 'Help text' },
          { name: 'required', type: 'boolean', default: false, label: 'Required' }
        ]),
        dependencies: JSON.stringify(['Bootstrap']),
        icon: 'fa fa-i-cursor',
        is_public: true,
        is_system: true,
        author_id: SYSTEM_USER_ID,
        version: '1.0.0',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        name: 'Button',
        slug: 'button',
        category: 'forms',
        description: 'Bootstrap styled button',
        html_template: '<button type="{{type}}" class="btn btn-{{variant}} {{size}}" onclick="{{onclick}}">{{text}}</button>',
        css: '',
        javascript: '',
        properties: JSON.stringify([
          { name: 'text', type: 'string', default: 'Click me', label: 'Button text' },
          { name: 'type', type: 'select', options: ['button', 'submit', 'reset'], default: 'button', label: 'Type' },
          { name: 'variant', type: 'select', options: ['primary', 'secondary', 'success', 'danger', 'warning', 'info'], default: 'primary', label: 'Style' },
          { name: 'size', type: 'select', options: ['', 'btn-sm', 'btn-lg'], default: '', label: 'Size' },
          { name: 'onclick', type: 'string', default: '', label: 'onClick handler' }
        ]),
        dependencies: JSON.stringify(['Bootstrap']),
        icon: 'fa fa-hand-pointer',
        is_public: true,
        is_system: true,
        author_id: SYSTEM_USER_ID,
        version: '1.0.0',
        created_at: new Date(),
        updated_at: new Date()
      },

      // DATA COMPONENTS
      {
        id: uuidv4(),
        name: 'Data Table',
        slug: 'data-table',
        category: 'data',
        description: 'Sortable, filterable data table with DataTables',
        html_template: `<table id="{{id}}" class="table table-striped table-bordered">
  <thead>
    <tr>{{headers}}</tr>
  </thead>
  <tbody>{{rows}}</tbody>
</table>`,
        css: '',
        javascript: `$(document).ready(function() {
  $('#{{id}}').DataTable({
    pageLength: {{pageLength}},
    ordering: {{ordering}},
    searching: {{searching}}
  });
});`,
        properties: JSON.stringify([
          { name: 'id', type: 'string', default: 'dataTable', label: 'Table ID' },
          { name: 'headers', type: 'html', default: '<th>Column 1</th><th>Column 2</th>', label: 'Headers' },
          { name: 'rows', type: 'html', default: '', label: 'Row data' },
          { name: 'pageLength', type: 'number', default: 10, label: 'Rows per page' },
          { name: 'ordering', type: 'boolean', default: true, label: 'Enable sorting' },
          { name: 'searching', type: 'boolean', default: true, label: 'Enable search' }
        ]),
        dependencies: JSON.stringify(['jQuery', 'DataTables']),
        icon: 'fa fa-table',
        is_public: true,
        is_system: true,
        author_id: SYSTEM_USER_ID,
        version: '1.0.0',
        created_at: new Date(),
        updated_at: new Date()
      },

      // CHART COMPONENTS
      {
        id: uuidv4(),
        name: 'Line Chart',
        slug: 'line-chart',
        category: 'charts',
        description: 'Animated line chart with Chart.js',
        html_template: '<canvas id="{{id}}" width="{{width}}" height="{{height}}"></canvas>',
        css: '',
        javascript: `const ctx = document.getElementById('{{id}}').getContext('2d');
new Chart(ctx, {
  type: 'line',
  data: {
    labels: {{labels}},
    datasets: [{
      label: '{{label}}',
      data: {{data}},
      borderColor: '{{color}}',
      tension: 0.1
    }]
  },
  options: {
    responsive: true,
    plugins: {
      title: {
        display: true,
        text: '{{title}}'
      }
    }
  }
});`,
        properties: JSON.stringify([
          { name: 'id', type: 'string', default: 'lineChart', label: 'Chart ID' },
          { name: 'title', type: 'string', default: 'Line Chart', label: 'Title' },
          { name: 'label', type: 'string', default: 'Dataset', label: 'Dataset label' },
          { name: 'labels', type: 'array', default: [], label: 'X-axis labels' },
          { name: 'data', type: 'array', default: [], label: 'Data points' },
          { name: 'color', type: 'color', default: '#3b82f6', label: 'Line color' },
          { name: 'width', type: 'number', default: 400, label: 'Width' },
          { name: 'height', type: 'number', default: 200, label: 'Height' }
        ]),
        dependencies: JSON.stringify(['Chart.js']),
        icon: 'fa fa-chart-line',
        is_public: true,
        is_system: true,
        author_id: SYSTEM_USER_ID,
        version: '1.0.0',
        created_at: new Date(),
        updated_at: new Date()
      },

      // NAVIGATION COMPONENTS
      {
        id: uuidv4(),
        name: 'Navbar',
        slug: 'navbar',
        category: 'navigation',
        description: 'Responsive navigation bar',
        html_template: `<nav class="navbar navbar-expand-lg navbar-{{theme}} bg-{{bg}}">
  <div class="container-fluid">
    <a class="navbar-brand" href="#">{{brand}}</a>
    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#{{id}}">
      <span class="navbar-toggler-icon"></span>
    </button>
    <div class="collapse navbar-collapse" id="{{id}}">
      <ul class="navbar-nav me-auto mb-2 mb-lg-0">{{links}}</ul>
    </div>
  </div>
</nav>`,
        css: '',
        javascript: '',
        properties: JSON.stringify([
          { name: 'id', type: 'string', default: 'navbarNav', label: 'Navbar ID' },
          { name: 'brand', type: 'string', default: 'Brand', label: 'Brand name' },
          { name: 'theme', type: 'select', options: ['light', 'dark'], default: 'light', label: 'Theme' },
          { name: 'bg', type: 'select', options: ['light', 'dark', 'primary', 'secondary'], default: 'light', label: 'Background' },
          { name: 'links', type: 'html', default: '<li class="nav-item"><a class="nav-link" href="#">Home</a></li>', label: 'Nav links' }
        ]),
        dependencies: JSON.stringify(['Bootstrap']),
        icon: 'fa fa-bars',
        is_public: true,
        is_system: true,
        author_id: SYSTEM_USER_ID,
        version: '1.0.0',
        created_at: new Date(),
        updated_at: new Date()
      },

      // DISPLAY COMPONENTS
      {
        id: uuidv4(),
        name: 'Alert',
        slug: 'alert',
        category: 'display',
        description: 'Bootstrap alert message',
        html_template: `<div class="alert alert-{{variant}} {{dismissible}}" role="alert">
  {{message}}
  {{#if dismissible}}<button type="button" class="btn-close" data-bs-dismiss="alert"></button>{{/if}}
</div>`,
        css: '',
        javascript: '',
        properties: JSON.stringify([
          { name: 'message', type: 'string', default: 'This is an alert', label: 'Message' },
          { name: 'variant', type: 'select', options: ['primary', 'secondary', 'success', 'danger', 'warning', 'info'], default: 'info', label: 'Type' },
          { name: 'dismissible', type: 'boolean', default: false, label: 'Dismissible' }
        ]),
        dependencies: JSON.stringify(['Bootstrap']),
        icon: 'fa fa-exclamation-triangle',
        is_public: true,
        is_system: true,
        author_id: SYSTEM_USER_ID,
        version: '1.0.0',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        name: 'Progress Bar',
        slug: 'progress-bar',
        category: 'display',
        description: 'Animated progress indicator',
        html_template: `<div class="progress" style="height: {{height}}px;">
  <div class="progress-bar bg-{{variant}}" role="progressbar" style="width: {{value}}%" aria-valuenow="{{value}}" aria-valuemin="0" aria-valuemax="100">
    {{#if showLabel}}{{value}}%{{/if}}
  </div>
</div>`,
        css: '',
        javascript: '',
        properties: JSON.stringify([
          { name: 'value', type: 'number', default: 50, min: 0, max: 100, label: 'Progress value (%)' },
          { name: 'variant', type: 'select', options: ['primary', 'success', 'info', 'warning', 'danger'], default: 'primary', label: 'Color' },
          { name: 'height', type: 'number', default: 20, label: 'Height (px)' },
          { name: 'showLabel', type: 'boolean', default: true, label: 'Show percentage' }
        ]),
        dependencies: JSON.stringify(['Bootstrap']),
        icon: 'fa fa-tasks',
        is_public: true,
        is_system: true,
        author_id: SYSTEM_USER_ID,
        version: '1.0.0',
        created_at: new Date(),
        updated_at: new Date()
      }
    ];

    await queryInterface.bulkInsert('html_components', components);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('html_components', null, {});
  }
};
