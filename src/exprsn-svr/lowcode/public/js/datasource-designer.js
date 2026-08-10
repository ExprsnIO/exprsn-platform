/**
 * ═══════════════════════════════════════════════════════════
 * Datasource Designer - Modern Visual Interface
 * Matches Visual Query Builder design patterns
 * ═══════════════════════════════════════════════════════════
 */

class DatasourceDesigner {
  constructor() {
    this.currentDatasource = null;
    this.testResults = null;
    this.datasourceTypes = this.initializeDatasourceTypes();
  }

  initializeDatasourceTypes() {
    return {
      postgresql: {
        name: 'PostgreSQL',
        icon: 'fa-database',
        color: '#336791',
        description: 'Relational database with advanced features',
        fields: [
          { name: 'host', label: 'Host', type: 'text', required: true, default: 'localhost', help: 'Database server hostname or IP' },
          { name: 'port', label: 'Port', type: 'number', required: true, default: 5432, help: 'PostgreSQL port (default 5432)' },
          { name: 'database', label: 'Database', type: 'text', required: true, help: 'Database name to connect to' },
          { name: 'username', label: 'Username', type: 'text', required: true, help: 'Database user account' },
          { name: 'password', label: 'Password', type: 'password', required: true, help: 'User password' },
          { name: 'ssl', label: 'Use SSL', type: 'checkbox', required: false, default: false, advanced: true },
          { name: 'connectionTimeout', label: 'Connection Timeout (ms)', type: 'number', required: false, default: 30000, advanced: true },
          { name: 'schema', label: 'Default Schema', type: 'text', required: false, default: 'public', advanced: true }
        ]
      },
      redis: {
        name: 'Redis',
        icon: 'fa-bolt',
        color: '#DC382D',
        description: 'In-memory data structure store',
        fields: [
          { name: 'host', label: 'Host', type: 'text', required: true, default: 'localhost', help: 'Redis server hostname' },
          { name: 'port', label: 'Port', type: 'number', required: true, default: 6379, help: 'Redis port (default 6379)' },
          { name: 'password', label: 'Password', type: 'password', required: false, help: 'Redis password (optional)' },
          { name: 'database', label: 'Database Index', type: 'number', required: false, default: 0, help: 'Redis database index (0-15)' },
          { name: 'connectionTimeout', label: 'Connection Timeout (ms)', type: 'number', required: false, default: 5000, advanced: true },
          { name: 'retryStrategy', label: 'Enable Retry Strategy', type: 'checkbox', required: false, default: true, advanced: true }
        ]
      },
      forge: {
        name: 'Forge CRM/ERP',
        icon: 'fa-industry',
        color: '#FF6B35',
        description: 'Connect to Exprsn Forge modules',
        fields: [
          { name: 'baseUrl', label: 'Base URL', type: 'text', required: true, default: 'http://localhost:5001', help: 'Forge server URL' },
          { name: 'module', label: 'Module', type: 'select', required: true, options: [
            { value: 'crm', label: 'CRM' },
            { value: 'erp', label: 'ERP' },
            { value: 'groupware', label: 'Groupware' }
          ], help: 'Forge module to connect to' },
          { name: 'apiKey', label: 'API Key', type: 'password', required: false, help: 'Optional API key for authentication' },
          { name: 'version', label: 'API Version', type: 'select', required: false, options: [
            { value: 'v1', label: 'v1' },
            { value: 'v2', label: 'v2' }
          ], default: 'v1', advanced: true }
        ]
      },
      rest: {
        name: 'REST API',
        icon: 'fa-code',
        color: '#4A90E2',
        description: 'Generic REST API endpoint',
        fields: [
          { name: 'baseUrl', label: 'Base URL', type: 'text', required: true, placeholder: 'https://api.example.com', help: 'API base URL' },
          { name: 'authType', label: 'Authentication', type: 'select', required: false, options: [
            { value: 'none', label: 'None' },
            { value: 'bearer', label: 'Bearer Token' },
            { value: 'apikey', label: 'API Key' },
            { value: 'basic', label: 'Basic Auth' }
          ], default: 'none', help: 'Authentication method' },
          { name: 'authToken', label: 'Token/Key', type: 'password', required: false, help: 'Authentication token or key' },
          { name: 'authHeader', label: 'Auth Header Name', type: 'text', required: false, default: 'Authorization', advanced: true },
          { name: 'testEndpoint', label: 'Test Endpoint', type: 'text', required: false, placeholder: '/health', help: 'Endpoint to test connection', advanced: true },
          { name: 'timeout', label: 'Request Timeout (ms)', type: 'number', required: false, default: 30000, advanced: true }
        ]
      },
      soap: {
        name: 'SOAP Service',
        icon: 'fa-exchange-alt',
        color: '#8E44AD',
        description: 'SOAP web service endpoint',
        fields: [
          { name: 'wsdlUrl', label: 'WSDL URL', type: 'text', required: true, placeholder: 'https://service.example.com?wsdl', help: 'WSDL document URL' },
          { name: 'username', label: 'Username', type: 'text', required: false, help: 'WS-Security username' },
          { name: 'password', label: 'Password', type: 'password', required: false, help: 'WS-Security password' },
          { name: 'endpoint', label: 'Endpoint Override', type: 'text', required: false, help: 'Override WSDL endpoint', advanced: true }
        ]
      },
      mongodb: {
        name: 'MongoDB',
        icon: 'fa-leaf',
        color: '#47A248',
        description: 'Document-oriented NoSQL database',
        fields: [
          { name: 'connectionString', label: 'Connection String', type: 'text', required: true, placeholder: 'mongodb://localhost:27017', help: 'MongoDB connection string' },
          { name: 'database', label: 'Database', type: 'text', required: true, help: 'Database name' },
          { name: 'username', label: 'Username', type: 'text', required: false, help: 'Database user' },
          { name: 'password', label: 'Password', type: 'password', required: false, help: 'User password' },
          { name: 'authSource', label: 'Auth Database', type: 'text', required: false, default: 'admin', advanced: true }
        ]
      },
      mysql: {
        name: 'MySQL/MariaDB',
        icon: 'fa-database',
        color: '#00758F',
        description: 'Popular open-source RDBMS',
        fields: [
          { name: 'host', label: 'Host', type: 'text', required: true, default: 'localhost', help: 'Database server hostname' },
          { name: 'port', label: 'Port', type: 'number', required: true, default: 3306, help: 'MySQL port (default 3306)' },
          { name: 'database', label: 'Database', type: 'text', required: true, help: 'Database name' },
          { name: 'username', label: 'Username', type: 'text', required: true, help: 'Database user' },
          { name: 'password', label: 'Password', type: 'password', required: true, help: 'User password' },
          { name: 'charset', label: 'Character Set', type: 'text', required: false, default: 'utf8mb4', advanced: true }
        ]
      },
      graphql: {
        name: 'GraphQL',
        icon: 'fa-project-diagram',
        color: '#E10098',
        description: 'GraphQL API endpoint',
        fields: [
          { name: 'endpoint', label: 'GraphQL Endpoint', type: 'text', required: true, placeholder: 'https://api.example.com/graphql', help: 'GraphQL endpoint URL' },
          { name: 'authType', label: 'Authentication', type: 'select', required: false, options: [
            { value: 'none', label: 'None' },
            { value: 'bearer', label: 'Bearer Token' },
            { value: 'apikey', label: 'API Key' }
          ], default: 'none', help: 'Authentication method' },
          { name: 'authToken', label: 'Token/Key', type: 'password', required: false, help: 'Authentication token' },
          { name: 'introspectionQuery', label: 'Enable Introspection', type: 'checkbox', required: false, default: true, advanced: true }
        ]
      },
      json: {
        name: 'JSON Feed',
        icon: 'fa-file-code',
        color: '#F7DF1E',
        description: 'Static JSON data source',
        fields: [
          { name: 'url', label: 'JSON URL', type: 'text', required: true, placeholder: 'https://api.example.com/data.json', help: 'JSON feed URL' },
          { name: 'refreshInterval', label: 'Refresh Interval (seconds)', type: 'number', required: false, default: 300, help: 'How often to refresh data' },
          { name: 'rootPath', label: 'Data Root Path', type: 'text', required: false, placeholder: 'data.items', help: 'JSONPath to data array', advanced: true }
        ]
      },
      xml: {
        name: 'XML Feed',
        icon: 'fa-code',
        color: '#E34F26',
        description: 'XML/RSS data source',
        fields: [
          { name: 'url', label: 'XML URL', type: 'text', required: true, placeholder: 'https://example.com/feed.xml', help: 'XML feed URL' },
          { name: 'refreshInterval', label: 'Refresh Interval (seconds)', type: 'number', required: false, default: 300, help: 'How often to refresh data' },
          { name: 'xpath', label: 'XPath Expression', type: 'text', required: false, help: 'XPath to extract data', advanced: true }
        ]
      },
      csv: {
        name: 'CSV File',
        icon: 'fa-file-csv',
        color: '#34A853',
        description: 'CSV or delimited text file',
        fields: [
          { name: 'url', label: 'CSV URL', type: 'text', required: true, placeholder: 'https://example.com/data.csv', help: 'CSV file URL' },
          { name: 'delimiter', label: 'Delimiter', type: 'text', required: false, default: ',', help: 'Field delimiter character' },
          { name: 'hasHeader', label: 'Has Header Row', type: 'checkbox', required: false, default: true, help: 'First row contains column names' },
          { name: 'encoding', label: 'File Encoding', type: 'select', required: false, options: [
            { value: 'utf8', label: 'UTF-8' },
            { value: 'latin1', label: 'Latin-1' },
            { value: 'ascii', label: 'ASCII' }
          ], default: 'utf8', advanced: true }
        ]
      }
    };
  }

  renderTypeTab(container) {
    const types = this.datasourceTypes;
    const selectedType = this.currentDatasource.sourceType;

    container.innerHTML = `
      <div class="section-card">
        <h4><i class="fas fa-layer-group"></i> Select Data Source Type</h4>
        <p class="text-muted">Choose the type of data source you want to connect to</p>

        <div class="datasource-types-grid">
          ${Object.entries(types).map(([key, type]) => `
            <div class="datasource-type-card ${selectedType === key ? 'selected' : ''}"
                 onclick="selectDatasourceType('${key}')">
              <i class="fas fa-check-circle card-check"></i>
              <i class="fas ${type.icon} type-icon" style="color: ${type.color};"></i>
              <span class="type-name">${type.name}</span>
              <span class="type-description">${type.description}</span>
            </div>
          `).join('')}
        </div>

        ${selectedType ? `
          <div class="alert alert-info mt-4">
            <i class="fas fa-info-circle"></i>
            <strong>Selected:</strong> ${types[selectedType].name}
            <br>
            <small>Click the "Configuration" tab to set up your connection</small>
          </div>
        ` : `
          <div class="alert alert-warning mt-4">
            <i class="fas fa-exclamation-triangle"></i>
            Please select a data source type to continue
          </div>
        `}
      </div>
    `;
  }

  renderConfigTab(container) {
    const datasource = this.currentDatasource;

    if (!datasource.sourceType) {
      container.innerHTML = `
        <div class="section-card">
          <h4><i class="fas fa-cog"></i> Configuration</h4>
          <div class="alert alert-warning">
            <i class="fas fa-exclamation-triangle"></i>
            Please select a data source type first
          </div>
        </div>
      `;
      return;
    }

    const typeConfig = this.datasourceTypes[datasource.sourceType];
    const basicFields = typeConfig.fields.filter(f => !f.advanced);
    const advancedFields = typeConfig.fields.filter(f => f.advanced);

    container.innerHTML = `
      <div class="section-card">
        <h4><i class="fas fa-cog"></i> Connection Configuration</h4>
        <p class="text-muted">Configure your ${typeConfig.name} connection</p>

        <!-- Basic Information -->
        <div class="connection-config-section">
          <h5 style="margin-bottom: 1.25rem; color: var(--text-primary);">Basic Information</h5>

          <div class="config-form-group">
            <label>
              Identifier
              <span class="required">*</span>
            </label>
            <input type="text"
                   id="datasourceName"
                   value="${escapeHtml(datasource.name || '')}"
                   onchange="updateDatasourceField('name', this.value)"
                   pattern="[a-zA-Z][a-zA-Z0-9_]*"
                   placeholder="my_datasource">
            <small>Unique identifier (letters, numbers, underscores only)</small>
          </div>

          <div class="config-form-group">
            <label>Description</label>
            <textarea id="datasourceDescription"
                      onchange="updateDatasourceField('description', this.value)"
                      placeholder="Describe this data source...">${escapeHtml(datasource.description || '')}</textarea>
          </div>
        </div>

        <!-- Connection Settings -->
        <div class="connection-config-section">
          <h5 style="margin-bottom: 1.25rem; color: var(--text-primary);">Connection Settings</h5>
          ${this.renderConfigFields(basicFields)}
        </div>

        <!-- Advanced Options -->
        ${advancedFields.length > 0 ? `
          <button class="advanced-toggle" onclick="toggleAdvancedOptions()" id="advancedToggle">
            <i class="fas fa-chevron-right"></i>
            Advanced Options
          </button>

          <div class="advanced-options" id="advancedOptions">
            <div class="connection-config-section">
              <h5 style="margin-bottom: 1.25rem; color: var(--text-primary);">Advanced Settings</h5>
              ${this.renderConfigFields(advancedFields)}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  renderConfigFields(fields) {
    const config = this.currentDatasource.connectionConfig || {};

    return fields.map(field => {
      const value = config[field.name] !== undefined ? config[field.name] : (field.default || '');

      switch (field.type) {
        case 'select':
          return `
            <div class="config-form-group">
              <label>
                ${field.label}
                ${field.required ? '<span class="required">*</span>' : ''}
              </label>
              <select onchange="updateConnectionConfig('${field.name}', this.value)"
                      ${field.required ? 'required' : ''}>
                <option value="">-- Select ${field.label} --</option>
                ${field.options.map(opt => {
                  const optValue = opt.value || opt;
                  const optLabel = opt.label || opt;
                  return `<option value="${optValue}" ${value === optValue ? 'selected' : ''}>${optLabel}</option>`;
                }).join('')}
              </select>
              ${field.help ? `<small>${field.help}</small>` : ''}
            </div>
          `;

        case 'checkbox':
          return `
            <div class="config-form-group">
              <div class="form-check">
                <input type="checkbox"
                       class="form-check-input"
                       id="config_${field.name}"
                       onchange="updateConnectionConfig('${field.name}', this.checked)"
                       ${value === true || value === 'true' ? 'checked' : ''}>
                <label class="form-check-label" for="config_${field.name}">
                  ${field.label}
                </label>
              </div>
              ${field.help ? `<small>${field.help}</small>` : ''}
            </div>
          `;

        case 'textarea':
          return `
            <div class="config-form-group">
              <label>
                ${field.label}
                ${field.required ? '<span class="required">*</span>' : ''}
              </label>
              <textarea onchange="updateConnectionConfig('${field.name}', this.value)"
                        ${field.required ? 'required' : ''}
                        ${field.placeholder ? `placeholder="${field.placeholder}"` : ''}>${escapeHtml(String(value))}</textarea>
              ${field.help ? `<small>${field.help}</small>` : ''}
            </div>
          `;

        default:
          return `
            <div class="config-form-group">
              <label>
                ${field.label}
                ${field.required ? '<span class="required">*</span>' : ''}
              </label>
              <input type="${field.type}"
                     onchange="updateConnectionConfig('${field.name}', this.value)"
                     value="${escapeHtml(String(value))}"
                     ${field.required ? 'required' : ''}
                     ${field.placeholder ? `placeholder="${field.placeholder}"` : ''}>
              ${field.help ? `<small>${field.help}</small>` : ''}
            </div>
          `;
      }
    }).join('');
  }

  renderSettingsTab(container) {
    const datasource = this.currentDatasource;

    container.innerHTML = `
      <div class="section-card">
        <h4><i class="fas fa-sliders-h"></i> Data Source Settings</h4>
        <p class="text-muted">Configure additional options and metadata</p>

        <div class="connection-config-section">
          <div class="config-form-group">
            <label>Icon</label>
            <input type="text"
                   value="${datasource.icon || 'fa-database'}"
                   onchange="updateDatasourceField('icon', this.value)"
                   placeholder="fa-database">
            <small>Font Awesome icon class (e.g., fa-database, fa-bolt)</small>
          </div>

          <div class="config-form-group">
            <label>Color</label>
            <input type="color"
                   value="${datasource.color || '#667eea'}"
                   onchange="updateDatasourceField('color', this.value)">
            <small>Brand color for this data source</small>
          </div>

          <div class="config-form-group">
            <label>
              <input type="checkbox"
                     ${datasource.enableCaching ? 'checked' : ''}
                     onchange="updateDatasourceField('enableCaching', this.checked)">
              Enable Query Caching
            </label>
            <small>Cache query results to improve performance</small>
          </div>

          <div class="config-form-group">
            <label>Cache Duration (seconds)</label>
            <input type="number"
                   value="${datasource.cacheDuration || 300}"
                   onchange="updateDatasourceField('cacheDuration', parseInt(this.value))"
                   ${!datasource.enableCaching ? 'disabled' : ''}>
            <small>How long to cache results (default: 300 seconds)</small>
          </div>

          <div class="config-form-group">
            <label>
              <input type="checkbox"
                     ${datasource.enableLogging ? 'checked' : ''}
                     onchange="updateDatasourceField('enableLogging', this.checked)">
              Enable Query Logging
            </label>
            <small>Log all queries executed on this data source</small>
          </div>

          <div class="config-form-group">
            <label>Tags</label>
            <input type="text"
                   value="${(datasource.tags || []).join(', ')}"
                   onchange="updateDatasourceTags(this.value)"
                   placeholder="production, primary, reporting">
            <small>Comma-separated tags for organization</small>
          </div>
        </div>
      </div>
    `;
  }

  renderTestTab(container) {
    const datasource = this.currentDatasource;
    const results = this.testResults;

    container.innerHTML = `
      <div class="section-card">
        <h4><i class="fas fa-vial"></i> Test Connection</h4>
        <p class="text-muted">Verify your data source connection and configuration</p>

        <div style="margin-bottom: 1.5rem;">
          <button class="btn btn-primary" onclick="testConnection()">
            <i class="fas fa-play"></i> Run Connection Test
          </button>
        </div>

        ${results ? `
          <div class="test-connection-panel ${results.success ? 'success' : 'error'}">
            <div class="panel-header">
              <i class="fas ${results.success ? 'fa-check-circle text-success' : 'fa-times-circle text-danger'}"></i>
              <h5 style="margin: 0; color: ${results.success ? '#28a745' : '#dc3545'};">
                ${results.success ? 'Connection Successful' : 'Connection Failed'}
              </h5>
            </div>
            <div class="panel-body">
              ${results.message ? `<p><strong>Message:</strong> ${escapeHtml(results.message)}</p>` : ''}
              ${results.details ? `
                <p><strong>Details:</strong></p>
                <pre style="background: rgba(0,0,0,0.1); padding: 1rem; border-radius: 4px; overflow-x: auto;">${JSON.stringify(results.details, null, 2)}</pre>
              ` : ''}
              ${results.error ? `<p><strong>Error:</strong> ${escapeHtml(results.error)}</p>` : ''}
            </div>
          </div>
        ` : `
          <div class="alert alert-info">
            <i class="fas fa-info-circle"></i>
            Click "Run Connection Test" to verify your configuration
          </div>
        `}

        ${datasource.lastTestedAt ? `
          <div class="mt-3">
            <small class="text-muted">
              Last tested: ${new Date(datasource.lastTestedAt).toLocaleString()}
            </small>
          </div>
        ` : ''}
      </div>
    `;
  }
}

// Global helper functions
function selectDatasourceType(type) {
  window.datasourceDesigner.currentDatasource.sourceType = type;
  window.datasourceDesigner.currentDatasource.icon = window.datasourceDesigner.datasourceTypes[type].icon;
  window.datasourceDesigner.currentDatasource.color = window.datasourceDesigner.datasourceTypes[type].color;

  // Re-render the type tab
  switchTab('type');

  // Auto-switch to config tab
  setTimeout(() => switchTab('config'), 300);
}

function updateDatasourceField(field, value) {
  window.datasourceDesigner.currentDatasource[field] = value;
  saveDatasource(false);
}

function updateConnectionConfig(field, value) {
  if (!window.datasourceDesigner.currentDatasource.connectionConfig) {
    window.datasourceDesigner.currentDatasource.connectionConfig = {};
  }
  window.datasourceDesigner.currentDatasource.connectionConfig[field] = value;
  saveDatasource(false);
}

function updateDatasourceTags(value) {
  const tags = value.split(',').map(t => t.trim()).filter(t => t);
  window.datasourceDesigner.currentDatasource.tags = tags;
  saveDatasource(false);
}

function toggleAdvancedOptions() {
  const toggle = document.getElementById('advancedToggle');
  const options = document.getElementById('advancedOptions');

  toggle.classList.toggle('expanded');
  options.classList.toggle('visible');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
