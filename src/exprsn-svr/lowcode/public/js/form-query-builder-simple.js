/**
 * Simple Query Builder - Standalone Version
 * Minimal implementation for standalone query designer
 */

class QueryBuilderManager {
  constructor() {
    this.currentQuery = null;
    this.state = window.FORM_DESIGNER_STATE || { queries: [] };
    this.cachedFields = {}; // Cache for datasource fields
    this.cachedTables = null; // Cache for database tables
    this.cachedServices = null; // Cache for Exprsn services
  }

  updateQuery(updates) {
    if (this.currentQuery) {
      Object.assign(this.currentQuery, updates);
    }
  }

  getQuery() {
    return this.currentQuery;
  }

  async fetchDatabaseTables() {
    if (this.cachedTables) {
      return this.cachedTables;
    }

    try {
      const response = await fetch('/lowcode/api/datasource-introspection/database/tables');
      const data = await response.json();

      if (data.success) {
        this.cachedTables = data.tables;
        return data.tables;
      }
    } catch (error) {
      console.error('Failed to fetch database tables:', error);
    }

    return [];
  }

  async fetchTableColumns(schema, table) {
    const cacheKey = `${schema}.${table}`;

    if (this.cachedFields[cacheKey]) {
      return this.cachedFields[cacheKey];
    }

    try {
      const response = await fetch(`/lowcode/api/datasource-introspection/database/tables/${schema}/${table}/columns`);
      const data = await response.json();

      if (data.success) {
        this.cachedFields[cacheKey] = data.columns;
        return data.columns;
      }
    } catch (error) {
      console.error('Failed to fetch table columns:', error);
    }

    return [];
  }

  async fetchExpSynServices() {
    if (this.cachedServices) {
      return this.cachedServices;
    }

    try {
      const response = await fetch('/lowcode/api/datasource-introspection/services');
      const data = await response.json();

      if (data.success) {
        this.cachedServices = data.services;
        return data.services;
      }
    } catch (error) {
      console.error('Failed to fetch services:', error);
    }

    return [];
  }

  async fetchEntities(appId) {
    const cacheKey = `entities_${appId}`;
    if (this.cachedFields[cacheKey]) {
      console.log('[Entities] Returning cached entities:', this.cachedFields[cacheKey]);
      return this.cachedFields[cacheKey];
    }

    console.log('[Entities] Fetching entities for app:', appId);

    try {
      const url = `/lowcode/api/entities?applicationId=${appId}`;
      console.log('[Entities] Request URL:', url);

      const response = await fetch(url);
      console.log('[Entities] Response status:', response.status);

      const data = await response.json();
      console.log('[Entities] Response data:', data);

      if (data.success) {
        // API returns entities in data.data.entities (nested structure)
        const entities = data.data?.entities || data.entities || [];
        console.log('[Entities] Found', entities.length, 'entities');
        this.cachedFields[cacheKey] = entities;
        return entities;
      } else {
        console.warn('[Entities] Request failed, success=false');
      }
    } catch (error) {
      console.error('[Entities] Failed to fetch entities:', error);
    }
    return [];
  }

  async fetchEntityFields(entityId) {
    const cacheKey = `entity_fields_${entityId}`;
    if (this.cachedFields[cacheKey]) return this.cachedFields[cacheKey];

    try {
      const response = await fetch(`/lowcode/api/entities/${entityId}`);
      const data = await response.json();
      console.log('[Entity Fields] Response for entity', entityId, ':', data);

      if (data.success) {
        // API returns entity in data.data.entity (nested structure)
        const entity = data.data?.entity || data.entity;
        if (entity) {
          const fields = entity.schema?.fields || [];
          console.log('[Entity Fields] Found', fields.length, 'fields');
          // Convert entity schema format to field format
          const formattedFields = fields.map(field => ({
            name: field.name,
            type: field.type,
            displayType: field.type.toUpperCase(),
            nullable: !field.required,
            label: field.label || field.name
          }));
          this.cachedFields[cacheKey] = formattedFields;
          return formattedFields;
        }
      }
    } catch (error) {
      console.error('[Entity Fields] Failed to fetch entity fields:', error);
    }
    return [];
  }

  async getAvailableFields() {
    const datasource = this.currentQuery?.datasource;

    if (!datasource) return [];

    switch (datasource.type) {
      case 'database':
        if (datasource.config?.schema && datasource.config?.table) {
          return await this.fetchTableColumns(datasource.config.schema, datasource.config.table);
        }
        break;

      case 'entity':
        if (datasource.config?.entityId) {
          return await this.fetchEntityFields(datasource.config.entityId);
        }
        return [];

      default:
        return [];
    }

    return [];
  }
}

class QueryBuilderUI {
  constructor(manager) {
    this.qb = manager;
  }

  renderDatasourceTab(container) {
    const query = this.qb.currentQuery;
    const currentType = query?.datasource?.type || 'entity';

    container.innerHTML = `
      <div class="section-card">
        <h4>Select Datasource Type</h4>
        <div class="datasource-types-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1rem;">
          ${this.renderDatasourceTypeCard('entity', 'fa-database', 'Entity', '#667eea', currentType)}
          ${this.renderDatasourceTypeCard('rest', 'fa-cloud', 'REST API', '#4facfe', currentType)}
          ${this.renderDatasourceTypeCard('json', 'fa-file-code', 'JSON', '#43e97b', currentType)}
          ${this.renderDatasourceTypeCard('database', 'fa-server', 'Database', '#f093fb', currentType)}
        </div>

        <div id="datasourceConfig" class="mt-4">
          ${this.renderDatasourceConfig(query?.datasource)}
        </div>
      </div>
    `;
  }

  renderDatasourceTypeCard(type, icon, label, color, currentType) {
    const selected = type === currentType ? 'selected' : '';
    return `
      <div class="datasource-type-card ${selected}"
           onclick="window.queryBuilderUI.selectDatasourceType('${type}')"
           style="border: 2px solid ${type === currentType ? color : '#e0e0e0'}; padding: 1.5rem; text-align: center; cursor: pointer; border-radius: 8px;">
        <i class="fas ${icon} fa-3x" style="color: ${color}; margin-bottom: 0.75rem;"></i>
        <div style="font-weight: 600;">${label}</div>
        ${type === currentType ? '<i class="fas fa-check" style="color: ' + color + '; position: absolute; top: 0.5rem; right: 0.5rem;"></i>' : ''}
      </div>
    `;
  }

  selectDatasourceType(type) {
    if (this.qb.currentQuery) {
      this.qb.currentQuery.datasource = { type: type, config: {} };
      this.renderDatasourceTab(document.getElementById('queryTabContent'));
    }
  }

  renderDatasourceConfig(datasource) {
    if (!datasource) return '';

    switch (datasource.type) {
      case 'rest':
        return this.renderRestConfig(datasource.config || {});
      case 'json':
        return this.renderJsonConfig(datasource.config || {});
      case 'database':
        return this.renderDatabaseConfig(datasource.config || {});
      case 'entity':
        return this.renderEntityConfig(datasource.config || {});
      default:
        return `<p class="text-muted">Configuration for ${datasource.type} datasource</p>`;
    }
  }

  renderRestConfig(config) {
    // Trigger loading of services when this renders
    setTimeout(() => this.loadExpSynServices(), 0);

    return `
      <div class="config-section">
        <label class="form-label fw-bold">
          <i class="fas fa-network-wired text-primary"></i> Exprsn Services
        </label>
        <select class="form-select" id="restServiceSelect"
                onchange="window.queryBuilderUI.onServiceChange(this.value)">
          <option value="">-- Select Exprsn Service (Optional) --</option>
        </select>
        <small class="form-text text-muted">
          Quick select from internal Exprsn services, or enter custom URL below
        </small>
      </div>

      <div class="config-section mt-3" id="serviceEndpointSection" style="display: none;">
        <label class="form-label fw-bold">
          <i class="fas fa-route text-info"></i> Endpoint
        </label>
        <select class="form-select" id="restEndpointSelect"
                onchange="window.queryBuilderUI.onEndpointChange(this.value)">
          <option value="">-- Select Endpoint --</option>
        </select>
      </div>

      <div class="config-section mt-3">
        <label class="form-label fw-bold">
          <i class="fas fa-link text-success"></i> URL
        </label>
        <input type="text" class="form-control" id="restUrlInput" value="${config.url || ''}"
               onchange="window.queryBuilderUI.updateConfig('url', this.value)"
               placeholder="https://api.example.com/data">
        <small class="form-text text-muted">
          Full URL to the REST API endpoint
        </small>
      </div>

      <div class="config-section mt-3">
        <label class="form-label fw-bold">HTTP Method</label>
        <select class="form-select" onchange="window.queryBuilderUI.updateConfig('method', this.value)">
          <option value="GET" ${!config.method || config.method === 'GET' ? 'selected' : ''}>GET</option>
          <option value="POST" ${config.method === 'POST' ? 'selected' : ''}>POST</option>
          <option value="PUT" ${config.method === 'PUT' ? 'selected' : ''}>PUT</option>
          <option value="DELETE" ${config.method === 'DELETE' ? 'selected' : ''}>DELETE</option>
          <option value="PATCH" ${config.method === 'PATCH' ? 'selected' : ''}>PATCH</option>
        </select>
      </div>

      <div class="config-section mt-3">
        <label class="form-label fw-bold">Headers (Optional)</label>
        <textarea class="form-control" rows="3"
                  onchange="window.queryBuilderUI.updateConfig('headers', this.value)"
                  placeholder='{"Authorization": "Bearer token", "Content-Type": "application/json"}'>${config.headers || ''}</textarea>
        <small class="form-text text-muted">
          JSON object with HTTP headers
        </small>
      </div>

      <div class="config-section mt-3" id="restBodySection" style="display: ${config.method === 'POST' || config.method === 'PUT' || config.method === 'PATCH' ? 'block' : 'none'};">
        <label class="form-label fw-bold">Request Body (Optional)</label>
        <textarea class="form-control" rows="4"
                  onchange="window.queryBuilderUI.updateConfig('body', this.value)"
                  placeholder='{"key": "value"}'>${config.body || ''}</textarea>
        <small class="form-text text-muted">
          JSON request body for POST/PUT/PATCH requests
        </small>
      </div>
    `;
  }

  async loadExpSynServices() {
    const services = await this.qb.fetchExpSynServices();
    const serviceSelect = document.getElementById('restServiceSelect');

    if (!serviceSelect) return;

    // Populate services dropdown
    services.forEach(service => {
      const option = document.createElement('option');
      option.value = service.name;
      option.textContent = service.name;
      option.dataset.baseUrl = service.baseUrl;
      option.dataset.endpoints = JSON.stringify(service.endpoints);
      serviceSelect.appendChild(option);
    });
  }

  onServiceChange(serviceName) {
    if (!serviceName) {
      // Hide endpoint section if no service selected
      const endpointSection = document.getElementById('serviceEndpointSection');
      if (endpointSection) endpointSection.style.display = 'none';
      return;
    }

    // Get service data
    const serviceSelect = document.getElementById('restServiceSelect');
    const selectedOption = serviceSelect.querySelector(`option[value="${serviceName}"]`);

    if (!selectedOption) return;

    const baseUrl = selectedOption.dataset.baseUrl;
    const endpoints = JSON.parse(selectedOption.dataset.endpoints || '[]');

    // Show and populate endpoint dropdown
    const endpointSection = document.getElementById('serviceEndpointSection');
    const endpointSelect = document.getElementById('restEndpointSelect');

    if (endpointSection && endpointSelect) {
      endpointSection.style.display = 'block';

      // Clear existing options
      endpointSelect.innerHTML = '<option value="">-- Select Endpoint --</option>';

      // Add endpoints
      endpoints.forEach(endpoint => {
        const option = document.createElement('option');
        option.value = JSON.stringify({ path: endpoint.path, method: endpoint.method });
        option.textContent = `${endpoint.method} ${endpoint.path} - ${endpoint.description}`;
        option.dataset.baseUrl = baseUrl;
        endpointSelect.appendChild(option);
      });
    }
  }

  onEndpointChange(endpointData) {
    if (!endpointData) return;

    try {
      const endpoint = JSON.parse(endpointData);
      const endpointSelect = document.getElementById('restEndpointSelect');
      const selectedOption = endpointSelect.querySelector(`option[value='${endpointData}']`);

      if (!selectedOption) return;

      const baseUrl = selectedOption.dataset.baseUrl;
      const fullUrl = `${baseUrl}${endpoint.path}`;

      // Update URL input
      const urlInput = document.getElementById('restUrlInput');
      if (urlInput) {
        urlInput.value = fullUrl;
        this.updateConfig('url', fullUrl);
      }

      // Update method
      this.updateConfig('method', endpoint.method);

      // Show/hide body section based on method
      const bodySection = document.getElementById('restBodySection');
      if (bodySection) {
        bodySection.style.display = ['POST', 'PUT', 'PATCH'].includes(endpoint.method) ? 'block' : 'none';
      }

      // Re-render to reflect method change
      this.renderDatasourceTab(document.getElementById('queryTabContent'));
    } catch (e) {
      console.error('Failed to parse endpoint data:', e);
    }
  }

  renderJsonConfig(config) {
    return `
      <div class="config-section">
        <label class="form-label">JSON Data or URL</label>
        <textarea class="form-control" rows="5"
                  onchange="window.queryBuilderUI.updateConfig('data', this.value)"
                  placeholder='{"items": [...]}'>${config.data || ''}</textarea>
      </div>
    `;
  }

  renderEntityConfig(config) {
    // Trigger loading of entities when this renders
    setTimeout(() => this.loadEntities(), 0);

    return `
      <div class="config-section">
        <label class="form-label fw-bold">
          <i class="fas fa-database text-primary"></i> Entity
        </label>
        <select class="form-select" id="entitySelect"
                onchange="window.queryBuilderUI.onEntityChange(this.value)">
          <option value="">-- Select Entity --</option>
        </select>
        <small class="form-text text-muted">
          Choose a Low-Code entity from this application
        </small>
      </div>
      <div class="config-section mt-3" id="entityInfo"></div>
    `;
  }

  async loadEntities() {
    const entities = await this.qb.fetchEntities(APP_ID);
    const entitySelect = document.getElementById('entitySelect');

    if (!entitySelect) return;

    // Populate entity dropdown
    entities.forEach(entity => {
      const option = document.createElement('option');
      option.value = entity.id;
      option.textContent = entity.displayName || entity.name;
      if (this.qb.currentQuery?.datasource?.config?.entityId === entity.id) {
        option.selected = true;
      }
      entitySelect.appendChild(option);
    });

    // If entity already selected, load fields
    if (this.qb.currentQuery?.datasource?.config?.entityId) {
      this.onEntityChange(this.qb.currentQuery.datasource.config.entityId);
    }
  }

  async onEntityChange(entityId) {
    if (!entityId) {
      const entityInfo = document.getElementById('entityInfo');
      if (entityInfo) entityInfo.innerHTML = '';
      return;
    }

    this.updateConfig('entityId', entityId);

    // Load entity details and field count
    const fields = await this.qb.fetchEntityFields(entityId);

    // Display entity info
    const entityInfo = document.getElementById('entityInfo');
    if (entityInfo && fields.length > 0) {
      entityInfo.innerHTML = `
        <div class="alert alert-info">
          <strong>Entity Selected</strong><br>
          <small>${fields.length} fields available</small>
        </div>
      `;
    }
  }

  renderDatabaseConfig(config) {
    // Trigger loading of tables when this renders
    setTimeout(() => this.loadDatabaseTables(), 0);

    return `
      <div class="config-section">
        <label class="form-label">Schema</label>
        <select class="form-select" id="dbSchemaSelect"
                onchange="window.queryBuilderUI.onSchemaChange(this.value)">
          <option value="">-- Select Schema --</option>
        </select>
      </div>
      <div class="config-section mt-3">
        <label class="form-label">Table</label>
        <select class="form-select" id="dbTableSelect"
                onchange="window.queryBuilderUI.onTableChange(this.value)">
          <option value="">-- Select Table --</option>
        </select>
      </div>
      <div class="config-section mt-3" id="tableInfo"></div>
    `;
  }

  async loadDatabaseTables() {
    const tables = await this.qb.fetchDatabaseTables();
    const schemaSelect = document.getElementById('dbSchemaSelect');

    if (!schemaSelect) return;

    // Get unique schemas
    const schemas = [...new Set(tables.map(t => t.schema))];

    // Populate schema dropdown
    schemas.forEach(schema => {
      const option = document.createElement('option');
      option.value = schema;
      option.textContent = schema;
      if (this.qb.currentQuery?.datasource?.config?.schema === schema) {
        option.selected = true;
      }
      schemaSelect.appendChild(option);
    });

    // If schema already selected, load tables
    if (this.qb.currentQuery?.datasource?.config?.schema) {
      this.onSchemaChange(this.qb.currentQuery.datasource.config.schema);
    }
  }

  async onSchemaChange(schema) {
    this.updateConfig('schema', schema);

    const tables = await this.qb.fetchDatabaseTables();
    const tableSelect = document.getElementById('dbTableSelect');

    if (!tableSelect) return;

    // Clear existing options
    tableSelect.innerHTML = '<option value="">-- Select Table --</option>';

    // Filter tables by schema
    const schemaTables = tables.filter(t => t.schema === schema);

    schemaTables.forEach(table => {
      const option = document.createElement('option');
      option.value = table.name;
      option.textContent = `${table.name} (${table.type})`;
      if (this.qb.currentQuery?.datasource?.config?.table === table.name) {
        option.selected = true;
      }
      tableSelect.appendChild(option);
    });

    // If table already selected, load columns
    if (this.qb.currentQuery?.datasource?.config?.table) {
      this.onTableChange(this.qb.currentQuery.datasource.config.table);
    }
  }

  async onTableChange(table) {
    this.updateConfig('table', table);

    const schema = this.qb.currentQuery?.datasource?.config?.schema;
    if (!schema) return;

    // Load column metadata
    const columns = await this.qb.fetchTableColumns(schema, table);

    // Display table info
    const tableInfo = document.getElementById('tableInfo');
    if (tableInfo && columns.length > 0) {
      tableInfo.innerHTML = `
        <div class="alert alert-info">
          <strong>Table: ${schema}.${table}</strong><br>
          <small>${columns.length} columns available</small>
        </div>
      `;
    }
  }

  updateConfig(key, value) {
    if (this.qb.currentQuery && this.qb.currentQuery.datasource) {
      if (!this.qb.currentQuery.datasource.config) {
        this.qb.currentQuery.datasource.config = {};
      }
      this.qb.currentQuery.datasource.config[key] = value;
    }
  }
}

class QueryBuilderTabsUI {
  constructor(manager) {
    this.qb = manager;
  }

  async renderFieldsTab(container) {
    // Load available fields from datasource
    const availableFields = await this.qb.getAvailableFields();

    container.innerHTML = `
      <div class="section-card">
        <h4>Field Selection</h4>
        <p class="text-muted">Select which fields to include in the query results</p>
        <div class="mb-3">
          <button class="btn btn-primary btn-sm" onclick="window.queryBuilderTabsUI.addField()">
            <i class="fas fa-plus"></i> Add Field
          </button>
        </div>
        <div id="fieldsList">
          ${await this.renderFieldsList(availableFields)}
        </div>
      </div>
    `;
  }

  async renderFieldsList(availableFields = []) {
    const fields = this.qb.currentQuery?.fields || [];

    if (fields.length === 0) {
      return '<p class="text-muted">No fields added yet. Click "Add Field" to begin.</p>';
    }

    const fieldHtml = fields.map((field, idx) => {
      const selectedField = availableFields.find(f => f.name === field.name);
      const dataType = selectedField ? selectedField.displayType || selectedField.type : '';

      return `
        <div class="field-item mb-3 p-3" style="border: 1px solid #dee2e6; border-radius: 6px; background: #f8f9fa;">
          <div class="row">
            <div class="col-md-6">
              <label class="form-label fw-bold">Field Name</label>
              ${availableFields.length > 0 ? `
                <select class="form-select form-select-sm"
                        onchange="window.queryBuilderTabsUI.updateField(${idx}, 'name', this.value)">
                  <option value="">-- Select Field --</option>
                  ${availableFields.map(f => `
                    <option value="${f.name}" ${field.name === f.name ? 'selected' : ''}>
                      ${f.name} ${f.displayType ? '(' + f.displayType + ')' : ''}
                    </option>
                  `).join('')}
                </select>
              ` : `
                <input type="text" class="form-control form-control-sm" value="${field.name || ''}"
                       onchange="window.queryBuilderTabsUI.updateField(${idx}, 'name', this.value)"
                       placeholder="Field name">
              `}
              ${dataType ? `<span class="badge bg-info mt-1">${dataType}</span>` : ''}
            </div>
            <div class="col-md-6">
              <label class="form-label fw-bold">Alias (Optional)</label>
              <input type="text" class="form-control form-control-sm" value="${field.alias || ''}"
                     onchange="window.queryBuilderTabsUI.updateField(${idx}, 'alias', this.value)"
                     placeholder="Display name">
            </div>
          </div>

          <div class="row mt-2">
            <div class="col-md-6">
              <label class="form-label fw-bold">Null Handling</label>
              <select class="form-select form-select-sm"
                      onchange="window.queryBuilderTabsUI.updateField(${idx}, 'nullHandling', this.value)">
                <option value="include" ${!field.nullHandling || field.nullHandling === 'include' ? 'selected' : ''}>Include All</option>
                <option value="omit" ${field.nullHandling === 'omit' ? 'selected' : ''}>Omit Nulls (IS NOT NULL)</option>
                <option value="only" ${field.nullHandling === 'only' ? 'selected' : ''}>Only Nulls (IS NULL)</option>
              </select>
            </div>
            <div class="col-md-6">
              <label class="form-label fw-bold">Transform</label>
              <select class="form-select form-select-sm"
                      onchange="window.queryBuilderTabsUI.updateField(${idx}, 'transform', this.value)">
                <option value="" ${!field.transform ? 'selected' : ''}>None</option>
                <option value="UPPER" ${field.transform === 'UPPER' ? 'selected' : ''}>UPPER</option>
                <option value="LOWER" ${field.transform === 'LOWER' ? 'selected' : ''}>LOWER</option>
                <option value="TRIM" ${field.transform === 'TRIM' ? 'selected' : ''}>TRIM</option>
                <option value="LENGTH" ${field.transform === 'LENGTH' ? 'selected' : ''}>LENGTH</option>
              </select>
            </div>
          </div>

          <div class="mt-2 text-end">
            <button class="btn btn-danger btn-sm" onclick="window.queryBuilderTabsUI.removeField(${idx})">
              <i class="fas fa-trash"></i> Remove
            </button>
          </div>
        </div>
      `;
    }).join('');

    return fieldHtml;
  }

  async addField() {
    if (!this.qb.currentQuery.fields) {
      this.qb.currentQuery.fields = [];
    }
    this.qb.currentQuery.fields.push({
      name: '',
      alias: '',
      nullHandling: 'include',
      transform: ''
    });
    await this.renderFieldsTab(document.getElementById('queryTabContent'));
  }

  async updateField(idx, key, value) {
    if (this.qb.currentQuery.fields[idx]) {
      this.qb.currentQuery.fields[idx][key] = value;

      // Re-render to update UI (e.g., show data type badge)
      if (key === 'name') {
        const availableFields = await this.qb.getAvailableFields();
        const fieldsListContainer = document.getElementById('fieldsList');
        if (fieldsListContainer) {
          fieldsListContainer.innerHTML = await this.renderFieldsList(availableFields);
        }
      }
    }
  }

  removeField(idx) {
    this.qb.currentQuery.fields.splice(idx, 1);
    this.renderFieldsTab(document.getElementById('queryTabContent'));
  }

  async renderFiltersTab(container) {
    // Load available fields for dropdowns
    this.availableFields = await this.qb.getAvailableFields();

    const filters = this.qb.currentQuery?.filters || { condition: 'AND', rules: [] };

    container.innerHTML = `
      <div class="section-card">
        <h4>Filters</h4>
        <p class="text-muted">Add conditions to filter your data with AND/OR logic and nested groups</p>

        <div class="mb-3">
          <button class="btn btn-primary btn-sm" onclick="window.queryBuilderTabsUI.addFilterRule()">
            <i class="fas fa-plus"></i> Add Rule
          </button>
          <button class="btn btn-secondary btn-sm ms-2" onclick="window.queryBuilderTabsUI.addFilterGroup()">
            <i class="fas fa-layer-group"></i> Add Group
          </button>
        </div>

        <div class="filter-builder-container" style="background: #f8f9fa; padding: 1rem; border-radius: 8px;">
          ${this.renderFilterGroup(filters, [])}
        </div>
      </div>
    `;
  }

  renderFilterGroup(group, path) {
    if (!group || !group.rules) {
      return '<p class="text-muted">No filters defined</p>';
    }

    const pathStr = path.join('.');
    const isRoot = path.length === 0;

    return `
      <div class="filter-group p-3 mb-2" style="background: white; border: 2px solid ${group.not ? '#dc3545' : '#dee2e6'}; border-radius: 6px; ${group.not ? 'box-shadow: 0 0 0 2px rgba(220, 53, 69, 0.1);' : ''}">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <div class="d-flex align-items-center gap-2">
            <div class="btn-group" role="group">
              <button type="button" class="btn btn-sm ${group.condition === 'AND' ? 'btn-primary' : 'btn-outline-primary'}"
                      onclick="window.queryBuilderTabsUI.updateFilterCondition('${pathStr}', 'AND')">
                AND
              </button>
              <button type="button" class="btn btn-sm ${group.condition === 'OR' ? 'btn-primary' : 'btn-outline-primary'}"
                      onclick="window.queryBuilderTabsUI.updateFilterCondition('${pathStr}', 'OR')">
                OR
              </button>
            </div>
            <div class="form-check mb-0">
              <input type="checkbox" class="form-check-input" id="not_${pathStr}"
                     ${group.not ? 'checked' : ''}
                     onchange="window.queryBuilderTabsUI.toggleNot('${pathStr}', this.checked)">
              <label class="form-check-label" for="not_${pathStr}" style="font-weight: 600; color: ${group.not ? '#dc3545' : '#6c757d'};">
                NOT
              </label>
            </div>
          </div>
          <div class="d-flex gap-2">
            ${group.not ? '<span class="badge bg-danger">Inverted</span>' : ''}
            ${!isRoot ? `<button class="btn btn-danger btn-sm" onclick="window.queryBuilderTabsUI.removeFilterItem('${pathStr}')">
              <i class="fas fa-trash"></i>
            </button>` : ''}
          </div>
        </div>

        <div class="filter-rules">
          ${group.rules.map((rule, idx) => {
            const rulePath = [...path, idx];
            if (rule.type === 'group') {
              return this.renderFilterGroup(rule, rulePath);
            } else {
              return this.renderFilterRule(rule, rulePath);
            }
          }).join('')}

          ${group.rules.length === 0 ? '<p class="text-muted small mb-0">No rules yet. Click "Add Rule" to begin.</p>' : ''}
        </div>
      </div>
    `;
  }

  renderFilterRule(rule, path) {
    const pathStr = path.join('.');
    const availableFields = this.availableFields || [];

    // Get field data type for smart operator suggestions
    const selectedField = availableFields.find(f => f.name === rule.field);
    const dataType = selectedField ? selectedField.displayType || selectedField.type : '';

    return `
      <div class="filter-rule p-2 mb-2" style="background: white; border: 1px solid #dee2e6; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <div class="row g-2 align-items-center">
          <div class="col-md-3">
            <label class="form-label small mb-1 fw-bold">Field</label>
            ${availableFields.length > 0 ? `
              <select class="form-select form-select-sm"
                      onchange="window.queryBuilderTabsUI.updateFilterRule('${pathStr}', 'field', this.value)">
                <option value="">-- Select Field --</option>
                ${availableFields.map(f => `
                  <option value="${f.name}" ${rule.field === f.name ? 'selected' : ''}>
                    ${f.name} ${f.displayType ? '(' + f.displayType + ')' : ''}
                  </option>
                `).join('')}
              </select>
            ` : `
              <input type="text" class="form-control form-control-sm"
                     value="${rule.field || ''}"
                     onchange="window.queryBuilderTabsUI.updateFilterRule('${pathStr}', 'field', this.value)"
                     placeholder="Field name">
            `}
            ${dataType ? `<span class="badge bg-info mt-1" style="font-size: 0.65rem;">${dataType}</span>` : ''}
          </div>
          <div class="col-md-2">
            <label class="form-label small mb-1 fw-bold">Operator</label>
            <select class="form-select form-select-sm"
                    onchange="window.queryBuilderTabsUI.updateFilterRule('${pathStr}', 'operator', this.value)">
              ${this.getOperatorOptions(rule.operator, dataType)}
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label small mb-1 fw-bold">Value</label>
            <input type="text" class="form-control form-control-sm"
                   value="${rule.value || ''}"
                   onchange="window.queryBuilderTabsUI.updateFilterRule('${pathStr}', 'value', this.value)"
                   placeholder="Value"
                   ${rule.operator === 'IS NULL' || rule.operator === 'IS NOT NULL' ? 'disabled' : ''}>
          </div>
          <div class="col-md-2">
            <label class="form-label small mb-1 fw-bold">Type</label>
            <select class="form-select form-select-sm"
                    onchange="window.queryBuilderTabsUI.updateFilterRule('${pathStr}', 'valueType', this.value)"
                    ${rule.operator === 'IS NULL' || rule.operator === 'IS NOT NULL' ? 'disabled' : ''}>
              <option value="literal" ${!rule.valueType || rule.valueType === 'literal' ? 'selected' : ''}>Literal</option>
              <option value="field" ${rule.valueType === 'field' ? 'selected' : ''}>Field</option>
              <option value="variable" ${rule.valueType === 'variable' ? 'selected' : ''}>Variable</option>
            </select>
          </div>
          <div class="col-md-2">
            <label class="form-label small mb-1 fw-bold">&nbsp;</label>
            <button class="btn btn-danger btn-sm w-100" onclick="window.queryBuilderTabsUI.removeFilterItem('${pathStr}')">
              <i class="fas fa-trash"></i> Remove
            </button>
          </div>
        </div>
      </div>
    `;
  }

  getOperatorOptions(selected, dataType = '') {
    // Common operators for all types
    const commonOperators = [
      { value: '=', label: 'Equals (=)', types: ['all'] },
      { value: '!=', label: 'Not Equals (!=)', types: ['all'] },
      { value: 'IS NULL', label: 'Is Null', types: ['all'] },
      { value: 'IS NOT NULL', label: 'Is Not Null', types: ['all'] },
      { value: 'IN', label: 'In (IN)', types: ['all'] },
      { value: 'NOT IN', label: 'Not In (NOT IN)', types: ['all'] }
    ];

    // Comparison operators for numeric/date types
    const comparisonOperators = [
      { value: '>', label: 'Greater Than (>)', types: ['numeric', 'date', 'timestamp'] },
      { value: '>=', label: 'Greater or Equal (>=)', types: ['numeric', 'date', 'timestamp'] },
      { value: '<', label: 'Less Than (<)', types: ['numeric', 'date', 'timestamp'] },
      { value: '<=', label: 'Less or Equal (<=)', types: ['numeric', 'date', 'timestamp'] },
      { value: 'BETWEEN', label: 'Between', types: ['numeric', 'date', 'timestamp'] }
    ];

    // String operators
    const stringOperators = [
      { value: 'LIKE', label: 'Like (LIKE)', types: ['string', 'text', 'varchar', 'character'] },
      { value: 'NOT LIKE', label: 'Not Like (NOT LIKE)', types: ['string', 'text', 'varchar', 'character'] },
      { value: 'CONTAINS', label: 'Contains', types: ['string', 'text', 'varchar', 'character'] },
      { value: 'STARTS_WITH', label: 'Starts With', types: ['string', 'text', 'varchar', 'character'] },
      { value: 'ENDS_WITH', label: 'Ends With', types: ['string', 'text', 'varchar', 'character'] }
    ];

    // Combine all operators
    let operators = [...commonOperators];

    // Detect data type category
    const typeStr = (dataType || '').toLowerCase();
    const isNumeric = typeStr.includes('int') || typeStr.includes('numeric') ||
                      typeStr.includes('decimal') || typeStr.includes('float') ||
                      typeStr.includes('double') || typeStr.includes('real');
    const isDate = typeStr.includes('date') || typeStr.includes('timestamp') || typeStr.includes('time');
    const isString = typeStr.includes('char') || typeStr.includes('text') || typeStr.includes('string');

    // Add type-specific operators
    if (isNumeric || isDate) {
      operators = [...operators, ...comparisonOperators];
    }

    if (isString || !dataType) {
      operators = [...operators, ...stringOperators];
    }

    return operators.map(op =>
      `<option value="${op.value}" ${selected === op.value ? 'selected' : ''}>${op.label}</option>`
    ).join('');
  }

  addFilterRule() {
    if (!this.qb.currentQuery.filters) {
      this.qb.currentQuery.filters = { condition: 'AND', rules: [] };
    }

    this.qb.currentQuery.filters.rules.push({
      type: 'rule',
      field: '',
      operator: '=',
      value: '',
      valueType: 'literal'
    });

    this.renderFiltersTab(document.getElementById('queryTabContent'));
  }

  addFilterGroup() {
    if (!this.qb.currentQuery.filters) {
      this.qb.currentQuery.filters = { condition: 'AND', rules: [] };
    }

    this.qb.currentQuery.filters.rules.push({
      type: 'group',
      condition: 'AND',
      rules: []
    });

    this.renderFiltersTab(document.getElementById('queryTabContent'));
  }

  updateFilterCondition(path, condition) {
    const group = this.getFilterItemByPath(path);
    if (group) {
      group.condition = condition;
      this.renderFiltersTab(document.getElementById('queryTabContent'));
    }
  }

  toggleNot(path, enabled) {
    const group = this.getFilterItemByPath(path);
    if (group) {
      if (enabled) {
        group.not = true;
      } else {
        delete group.not;
      }
      this.renderFiltersTab(document.getElementById('queryTabContent'));
    }
  }

  updateFilterRule(path, key, value) {
    const rule = this.getFilterItemByPath(path);
    if (rule) {
      rule[key] = value;
    }
  }

  removeFilterItem(path) {
    const pathParts = path.split('.').filter(p => p !== '').map(Number);

    if (pathParts.length === 0) return;

    let parent = this.qb.currentQuery.filters;

    for (let i = 0; i < pathParts.length - 1; i++) {
      parent = parent.rules[pathParts[i]];
    }

    parent.rules.splice(pathParts[pathParts.length - 1], 1);
    this.renderFiltersTab(document.getElementById('queryTabContent'));
  }

  getFilterItemByPath(path) {
    if (!path || path === '') return this.qb.currentQuery.filters;

    const pathParts = path.split('.').filter(p => p !== '').map(Number);
    let current = this.qb.currentQuery.filters;

    for (const idx of pathParts) {
      current = current.rules[idx];
    }

    return current;
  }
}

class QueryBuilderAdvancedUI {
  constructor(manager) {
    this.qb = manager;
  }

  async renderAggregationTab(container) {
    const query = this.qb.currentQuery;
    const groupBy = query.groupBy || [];
    const aggregations = query.aggregations || [];

    container.innerHTML = `
      <div class="section-card">
        <h4>Aggregation & Grouping</h4>
        <p class="text-muted">Group your data and apply aggregate functions</p>

        <!-- Group By Section -->
        <div class="mb-4">
          <h5>Group By</h5>
          <p class="text-muted small">Group results by one or more fields</p>
          <button class="btn btn-primary btn-sm mb-3" onclick="window.queryBuilderAdvancedUI.addGroupByField()">
            <i class="fas fa-plus"></i> Add Group Field
          </button>
          <div id="groupByList">
            ${await this.renderGroupByList(groupBy)}
          </div>
        </div>

        <!-- Aggregations Section -->
        <div class="mb-4">
          <h5>Aggregations</h5>
          <p class="text-muted small">Apply aggregate functions to fields (includes COUNT DISTINCT)</p>
          <button class="btn btn-primary btn-sm mb-3" onclick="window.queryBuilderAdvancedUI.addAggregation()">
            <i class="fas fa-plus"></i> Add Aggregation
          </button>
          <div id="aggregationsList">
            ${await this.renderAggregationsList(aggregations)}
          </div>
        </div>

        <!-- Having Clause Section -->
        <div class="mb-4">
          <h5>Having Clause <span class="badge bg-secondary">Advanced</span></h5>
          <p class="text-muted small">Filter aggregated results (similar to WHERE but for aggregated data)</p>
          ${this.renderHavingClause(query.having)}
        </div>
      </div>
    `;
  }

  async renderGroupByList(groupBy) {
    if (!groupBy || groupBy.length === 0) {
      return '<p class="text-muted">No grouping fields. Click "Add Group Field" to begin.</p>';
    }

    // Get available fields for dropdown
    const availableFields = await this.qb.getAvailableFields();

    return groupBy.map((field, idx) => `
      <div class="group-by-item mb-3 p-3" style="border: 1px solid #dee2e6; border-radius: 6px; background: #f8f9fa;">
        <div class="row g-2 align-items-center">
          <div class="col-md-10">
            <label class="form-label small fw-bold mb-1">Field</label>
            ${availableFields.length > 0 ? `
              <select class="form-select form-select-sm"
                      onchange="window.queryBuilderAdvancedUI.updateGroupByField(${idx}, 'field', this.value)">
                <option value="">-- Select Field --</option>
                ${availableFields.map(f => `
                  <option value="${f.name}" ${field.field === f.name ? 'selected' : ''}>
                    ${f.name} ${f.displayType ? '(' + f.displayType + ')' : ''}
                  </option>
                `).join('')}
              </select>
            ` : `
              <input type="text" class="form-control form-control-sm"
                     value="${field.field || ''}"
                     onchange="window.queryBuilderAdvancedUI.updateGroupByField(${idx}, 'field', this.value)"
                     placeholder="Field name">
            `}
          </div>
          <div class="col-md-2">
            <label class="form-label small fw-bold mb-1">&nbsp;</label>
            <button class="btn btn-danger btn-sm w-100" onclick="window.queryBuilderAdvancedUI.removeGroupByField(${idx})">
              <i class="fas fa-trash"></i> Remove
            </button>
          </div>
        </div>
      </div>
    `).join('');
  }

  async renderAggregationsList(aggregations) {
    if (!aggregations || aggregations.length === 0) {
      return '<p class="text-muted">No aggregations. Click "Add Aggregation" to begin.</p>';
    }

    // Get available fields for dropdown
    const availableFields = await this.qb.getAvailableFields();

    return aggregations.map((agg, idx) => `
      <div class="aggregation-item mb-3 p-3" style="border: 1px solid #dee2e6; border-radius: 6px; background: #f8f9fa;">
        <div class="row g-2">
          <div class="col-md-3">
            <label class="form-label small fw-bold mb-1">Function</label>
            <select class="form-select form-select-sm"
                    onchange="window.queryBuilderAdvancedUI.updateAggregation(${idx}, 'function', this.value)">
              ${this.getAggregationFunctionOptions(agg.function)}
            </select>
          </div>
          <div class="col-md-4">
            <label class="form-label small fw-bold mb-1">Field</label>
            ${availableFields.length > 0 ? `
              <select class="form-select form-select-sm"
                      onchange="window.queryBuilderAdvancedUI.updateAggregation(${idx}, 'field', this.value)">
                <option value="">-- Select Field --</option>
                ${availableFields.map(f => `
                  <option value="${f.name}" ${agg.field === f.name ? 'selected' : ''}>
                    ${f.name} ${f.displayType ? '(' + f.displayType + ')' : ''}
                  </option>
                `).join('')}
              </select>
            ` : `
              <input type="text" class="form-control form-control-sm"
                     value="${agg.field || ''}"
                     onchange="window.queryBuilderAdvancedUI.updateAggregation(${idx}, 'field', this.value)"
                     placeholder="Field name">
            `}
          </div>
          <div class="col-md-3">
            <label class="form-label small fw-bold mb-1">Alias</label>
            <input type="text" class="form-control form-control-sm"
                   value="${agg.alias || ''}"
                   onchange="window.queryBuilderAdvancedUI.updateAggregation(${idx}, 'alias', this.value)"
                   placeholder="e.g., total_count">
          </div>
          <div class="col-md-2">
            <label class="form-label small fw-bold mb-1">&nbsp;</label>
            <button class="btn btn-danger btn-sm w-100" onclick="window.queryBuilderAdvancedUI.removeAggregation(${idx})">
              <i class="fas fa-trash"></i> Remove
            </button>
          </div>
        </div>
      </div>
    `).join('');
  }

  getAggregationFunctionOptions(selected) {
    const functions = [
      { value: 'COUNT', label: 'COUNT - Count rows' },
      { value: 'SUM', label: 'SUM - Sum values' },
      { value: 'AVG', label: 'AVG - Average value' },
      { value: 'MIN', label: 'MIN - Minimum value' },
      { value: 'MAX', label: 'MAX - Maximum value' },
      { value: 'COUNT_DISTINCT', label: 'COUNT DISTINCT - Count unique values' },
      { value: 'STDDEV', label: 'STDDEV - Standard deviation' },
      { value: 'VARIANCE', label: 'VARIANCE - Variance' },
      { value: 'MEDIAN', label: 'MEDIAN - Median value' },
      { value: 'FIRST', label: 'FIRST - First value' },
      { value: 'LAST', label: 'LAST - Last value' }
    ];

    return functions.map(fn =>
      `<option value="${fn.value}" ${selected === fn.value ? 'selected' : ''}>${fn.label}</option>`
    ).join('');
  }

  renderHavingClause(having) {
    const hasCondition = having && having.condition;

    return `
      <div class="having-clause-container">
        <div class="mb-2">
          <label class="form-check-label">
            <input type="checkbox" class="form-check-input"
                   ${hasCondition ? 'checked' : ''}
                   onchange="window.queryBuilderAdvancedUI.toggleHavingClause(this.checked)">
            Enable HAVING clause
          </label>
        </div>
        ${hasCondition ? `
          <div class="p-3" style="border: 1px solid #dee2e6; border-radius: 4px; background: #f8f9fa;">
            <div class="row g-2">
              <div class="col-md-3">
                <input type="text" class="form-control form-control-sm"
                       value="${having.field || ''}"
                       onchange="window.queryBuilderAdvancedUI.updateHaving('field', this.value)"
                       placeholder="Aggregation or field">
              </div>
              <div class="col-md-2">
                <select class="form-select form-select-sm"
                        onchange="window.queryBuilderAdvancedUI.updateHaving('operator', this.value)">
                  <option value="=" ${having.operator === '=' ? 'selected' : ''}>=</option>
                  <option value="!=" ${having.operator === '!=' ? 'selected' : ''}>!=</option>
                  <option value=">" ${having.operator === '>' ? 'selected' : ''}>&gt;</option>
                  <option value=">=" ${having.operator === '>=' ? 'selected' : ''}>>=</option>
                  <option value="<" ${having.operator === '<' ? 'selected' : ''}>&lt;</option>
                  <option value="<=" ${having.operator === '<=' ? 'selected' : ''}><=</option>
                </select>
              </div>
              <div class="col-md-3">
                <input type="text" class="form-control form-control-sm"
                       value="${having.value || ''}"
                       onchange="window.queryBuilderAdvancedUI.updateHaving('value', this.value)"
                       placeholder="Value">
              </div>
            </div>
            <p class="text-muted small mt-2 mb-0">
              <i class="fas fa-info-circle"></i> Example: COUNT(*) > 5 or SUM(amount) >= 1000
            </p>
          </div>
        ` : ''}
      </div>
    `;
  }

  addGroupByField() {
    if (!this.qb.currentQuery.groupBy) {
      this.qb.currentQuery.groupBy = [];
    }

    this.qb.currentQuery.groupBy.push({ field: '' });
    this.renderAggregationTab(document.getElementById('queryTabContent'));
  }

  updateGroupByField(idx, key, value) {
    if (this.qb.currentQuery.groupBy && this.qb.currentQuery.groupBy[idx]) {
      this.qb.currentQuery.groupBy[idx][key] = value;
    }
  }

  removeGroupByField(idx) {
    if (this.qb.currentQuery.groupBy) {
      this.qb.currentQuery.groupBy.splice(idx, 1);
      this.renderAggregationTab(document.getElementById('queryTabContent'));
    }
  }

  addAggregation() {
    if (!this.qb.currentQuery.aggregations) {
      this.qb.currentQuery.aggregations = [];
    }

    this.qb.currentQuery.aggregations.push({
      function: 'COUNT',
      field: '*',
      alias: ''
    });

    this.renderAggregationTab(document.getElementById('queryTabContent'));
  }

  updateAggregation(idx, key, value) {
    if (this.qb.currentQuery.aggregations && this.qb.currentQuery.aggregations[idx]) {
      this.qb.currentQuery.aggregations[idx][key] = value;
    }
  }

  removeAggregation(idx) {
    if (this.qb.currentQuery.aggregations) {
      this.qb.currentQuery.aggregations.splice(idx, 1);
      this.renderAggregationTab(document.getElementById('queryTabContent'));
    }
  }

  toggleHavingClause(enabled) {
    if (enabled) {
      this.qb.currentQuery.having = {
        condition: 'simple',
        field: '',
        operator: '>',
        value: ''
      };
    } else {
      delete this.qb.currentQuery.having;
    }
    this.renderAggregationTab(document.getElementById('queryTabContent'));
  }

  updateHaving(key, value) {
    if (this.qb.currentQuery.having) {
      this.qb.currentQuery.having[key] = value;
    }
  }

  renderOrderTab(container) {
    const query = this.qb.currentQuery;
    const orderBy = query.orderBy || [];

    container.innerHTML = `
      <div class="section-card">
        <h4>Sorting, Pagination & Distinct</h4>
        <p class="text-muted">Control how results are ordered, limited, and deduplicated</p>

        <!-- Order By Section -->
        <div class="mb-4">
          <h5>Order By (Sorting)</h5>
          <p class="text-muted small">Sort results by one or more fields</p>
          <button class="btn btn-primary btn-sm mb-3" onclick="window.queryBuilderAdvancedUI.addOrderByField()">
            <i class="fas fa-plus"></i> Add Sort Field
          </button>
          <div id="orderByList">
            ${this.renderOrderByList(orderBy)}
          </div>
        </div>

        <!-- Limit & Offset Section -->
        <div class="mb-4">
          <h5>Pagination</h5>
          <div class="row">
            <div class="col-md-6">
              <label class="form-label">Limit (Max Results)</label>
              <input type="number" class="form-control" value="${query.limit || 100}"
                     onchange="window.queryBuilderAdvancedUI.updateLimit(this.value)"
                     min="1" max="10000">
              <small class="text-muted">Maximum number of rows to return</small>
            </div>

            <div class="col-md-6">
              <label class="form-label">Offset (Skip Rows)</label>
              <input type="number" class="form-control" value="${query.offset || 0}"
                     onchange="window.queryBuilderAdvancedUI.updateOffset(this.value)"
                     min="0">
              <small class="text-muted">Number of rows to skip before returning results</small>
            </div>
          </div>
        </div>

        <!-- Distinct Section -->
        <div class="mb-4">
          <h5>Distinct Results</h5>
          <div class="form-check">
            <input type="checkbox" class="form-check-input" id="distinctCheck"
                   ${query.distinct ? 'checked' : ''}
                   onchange="window.queryBuilderAdvancedUI.updateDistinct(this.checked)">
            <label class="form-check-label" for="distinctCheck">
              Return only distinct (unique) rows
            </label>
          </div>
          <small class="text-muted">Removes duplicate rows from results</small>
        </div>

        <!-- Cache Section -->
        <div class="mb-4">
          <h5>Caching <span class="badge bg-info">Performance</span></h5>
          <div class="form-check mb-2">
            <input type="checkbox" class="form-check-input" id="cacheCheck"
                   ${query.enableCache ? 'checked' : ''}
                   onchange="window.queryBuilderAdvancedUI.updateCache(this.checked)">
            <label class="form-check-label" for="cacheCheck">
              Enable query result caching
            </label>
          </div>
          ${query.enableCache ? `
            <div class="mt-2">
              <label class="form-label">Cache Duration (seconds)</label>
              <input type="number" class="form-control" value="${query.cacheDuration || 300}"
                     onchange="window.queryBuilderAdvancedUI.updateCacheDuration(this.value)"
                     min="60" max="3600">
              <small class="text-muted">How long to cache results (60-3600 seconds)</small>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  renderOrderByList(orderBy) {
    if (!orderBy || orderBy.length === 0) {
      return '<p class="text-muted">No sorting applied. Click "Add Sort Field" to begin.</p>';
    }

    return orderBy.map((order, idx) => `
      <div class="order-by-item mb-2 p-2" style="border: 1px solid #e0e0e0; border-radius: 4px; background: #f8f9fa;">
        <div class="row g-2 align-items-center">
          <div class="col-md-1 text-center">
            <span class="badge bg-secondary">${idx + 1}</span>
          </div>
          <div class="col-md-6">
            <input type="text" class="form-control form-control-sm"
                   value="${order.field || ''}"
                   onchange="window.queryBuilderAdvancedUI.updateOrderByField(${idx}, 'field', this.value)"
                   placeholder="Field name">
          </div>
          <div class="col-md-3">
            <select class="form-select form-select-sm"
                    onchange="window.queryBuilderAdvancedUI.updateOrderByField(${idx}, 'direction', this.value)">
              <option value="ASC" ${order.direction === 'ASC' ? 'selected' : ''}>Ascending (A-Z, 0-9)</option>
              <option value="DESC" ${order.direction === 'DESC' ? 'selected' : ''}>Descending (Z-A, 9-0)</option>
            </select>
          </div>
          <div class="col-md-2">
            <button class="btn btn-danger btn-sm w-100" onclick="window.queryBuilderAdvancedUI.removeOrderByField(${idx})">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
      </div>
    `).join('');
  }

  addOrderByField() {
    if (!this.qb.currentQuery.orderBy) {
      this.qb.currentQuery.orderBy = [];
    }

    this.qb.currentQuery.orderBy.push({
      field: '',
      direction: 'ASC'
    });

    this.renderOrderTab(document.getElementById('queryTabContent'));
  }

  updateOrderByField(idx, key, value) {
    if (this.qb.currentQuery.orderBy && this.qb.currentQuery.orderBy[idx]) {
      this.qb.currentQuery.orderBy[idx][key] = value;
    }
  }

  removeOrderByField(idx) {
    if (this.qb.currentQuery.orderBy) {
      this.qb.currentQuery.orderBy.splice(idx, 1);
      this.renderOrderTab(document.getElementById('queryTabContent'));
    }
  }

  updateDistinct(enabled) {
    this.qb.currentQuery.distinct = enabled;
  }

  updateCache(enabled) {
    this.qb.currentQuery.enableCache = enabled;
    this.renderOrderTab(document.getElementById('queryTabContent'));
  }

  updateCacheDuration(value) {
    this.qb.currentQuery.cacheDuration = parseInt(value) || 300;
  }

  updateLimit(value) {
    this.qb.currentQuery.limit = parseInt(value) || 100;
  }

  updateOffset(value) {
    this.qb.currentQuery.offset = parseInt(value) || 0;
  }

  renderPreviewTab(container) {
    const query = this.qb.currentQuery;

    container.innerHTML = `
      <div class="section-card">
        <h4>Query Preview & Testing</h4>
        <p class="text-muted">Review your query configuration and test execution</p>

        <!-- Configuration Summary -->
        <div class="mb-4">
          <h5><i class="fas fa-list-check"></i> Configuration Summary</h5>
          <div class="row">
            <div class="col-md-6">
              <table class="table table-sm table-bordered">
                <tbody>
                  <tr>
                    <th style="width: 40%;">Datasource Type:</th>
                    <td><span class="badge bg-primary">${query.datasource?.type || 'Not set'}</span></td>
                  </tr>
                  <tr>
                    <th>Fields Selected:</th>
                    <td>${query.fields?.length || 0} fields</td>
                  </tr>
                  <tr>
                    <th>Filter Rules:</th>
                    <td>${this.countFilterRules(query.filters)} conditions</td>
                  </tr>
                  <tr>
                    <th>Group By:</th>
                    <td>${query.groupBy?.length || 0} fields</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="col-md-6">
              <table class="table table-sm table-bordered">
                <tbody>
                  <tr>
                    <th style="width: 40%;">Aggregations:</th>
                    <td>${query.aggregations?.length || 0} functions</td>
                  </tr>
                  <tr>
                    <th>Order By:</th>
                    <td>${query.orderBy?.length || 0} fields</td>
                  </tr>
                  <tr>
                    <th>Limit / Offset:</th>
                    <td>${query.limit || 100} / ${query.offset || 0}</td>
                  </tr>
                  <tr>
                    <th>Options:</th>
                    <td>
                      ${query.distinct ? '<span class="badge bg-info">DISTINCT</span> ' : ''}
                      ${query.enableCache ? '<span class="badge bg-success">CACHED</span>' : ''}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Validation Status -->
        <div class="mb-4">
          <h5><i class="fas fa-check-circle"></i> Validation Status</h5>
          ${this.renderValidationStatus(query)}
        </div>

        <!-- Query JSON -->
        <div class="mb-4">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h5><i class="fas fa-code"></i> Query JSON</h5>
            <button class="btn btn-sm btn-outline-secondary" onclick="navigator.clipboard.writeText(JSON.stringify(window.queryBuilderManager.currentQuery, null, 2))">
              <i class="fas fa-copy"></i> Copy JSON
            </button>
          </div>
          <pre style="background: #1e1e1e; color: #d4d4d4; padding: 1rem; border-radius: 4px; max-height: 400px; overflow: auto; font-size: 0.85rem;">${this.escapeHtml(JSON.stringify(query, null, 2))}</pre>
        </div>

        <!-- Test Query Section -->
        <div class="mb-4">
          <h5><i class="fas fa-flask"></i> Test Execution</h5>
          <div class="d-flex gap-2">
            <button class="btn btn-success" onclick="window.testQuery()">
              <i class="fas fa-play"></i> Test Query
            </button>
            <button class="btn btn-outline-primary" onclick="window.queryBuilderAdvancedUI.generateSQL()">
              <i class="fas fa-database"></i> Generate SQL
            </button>
            <button class="btn btn-outline-info" onclick="window.queryBuilderAdvancedUI.explainQuery()">
              <i class="fas fa-info-circle"></i> Explain Query
            </button>
          </div>
        </div>

        <!-- Results Container -->
        <div id="queryResults" class="mt-3"></div>
      </div>
    `;
  }

  countFilterRules(filters) {
    if (!filters || !filters.rules) return 0;

    let count = 0;
    const countRules = (group) => {
      if (!group || !group.rules) return;

      group.rules.forEach(rule => {
        if (rule.type === 'group') {
          countRules(rule);
        } else {
          count++;
        }
      });
    };

    countRules(filters);
    return count;
  }

  renderValidationStatus(query) {
    const issues = [];
    const warnings = [];

    // Check datasource
    if (!query.datasource || !query.datasource.type) {
      issues.push('No datasource selected');
    }

    // Check fields
    if (!query.fields || query.fields.length === 0) {
      warnings.push('No fields selected - will return all fields (SELECT *)');
    }

    // Check aggregations without grouping
    if (query.aggregations && query.aggregations.length > 0 && (!query.groupBy || query.groupBy.length === 0)) {
      warnings.push('Aggregations without GROUP BY may produce unexpected results');
    }

    // Check HAVING without aggregations
    if (query.having && (!query.aggregations || query.aggregations.length === 0)) {
      warnings.push('HAVING clause without aggregations is unusual - consider using WHERE instead');
    }

    if (issues.length === 0 && warnings.length === 0) {
      return `
        <div class="alert alert-success mb-0">
          <i class="fas fa-check-circle"></i> Query configuration is valid and ready to execute
        </div>
      `;
    }

    let html = '';

    if (issues.length > 0) {
      html += `
        <div class="alert alert-danger mb-2">
          <strong><i class="fas fa-exclamation-circle"></i> Issues Found:</strong>
          <ul class="mb-0 mt-2">
            ${issues.map(issue => `<li>${issue}</li>`).join('')}
          </ul>
        </div>
      `;
    }

    if (warnings.length > 0) {
      html += `
        <div class="alert alert-warning mb-0">
          <strong><i class="fas fa-exclamation-triangle"></i> Warnings:</strong>
          <ul class="mb-0 mt-2">
            ${warnings.map(warning => `<li>${warning}</li>`).join('')}
          </ul>
        </div>
      `;
    }

    return html;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  generateSQL() {
    const query = this.qb.currentQuery;

    // This is a simplified SQL generator for demonstration
    let sql = 'SELECT ';

    // Handle DISTINCT
    if (query.distinct) {
      sql += 'DISTINCT ';
    }

    // Handle fields and aggregations
    const selectParts = [];

    if (query.aggregations && query.aggregations.length > 0) {
      query.aggregations.forEach(agg => {
        const aggStr = `${agg.function}(${agg.field})${agg.alias ? ' AS ' + agg.alias : ''}`;
        selectParts.push(aggStr);
      });
    }

    if (query.fields && query.fields.length > 0) {
      query.fields.forEach(field => {
        const fieldStr = field.alias ? `${field.name} AS ${field.alias}` : field.name;
        selectParts.push(fieldStr);
      });
    }

    sql += selectParts.length > 0 ? selectParts.join(', ') : '*';

    // FROM clause - placeholder
    sql += '\nFROM <datasource>';

    // WHERE clause
    if (query.filters && query.filters.rules && query.filters.rules.length > 0) {
      sql += '\nWHERE <filters>';
    }

    // GROUP BY
    if (query.groupBy && query.groupBy.length > 0) {
      sql += '\nGROUP BY ' + query.groupBy.map(g => g.field).join(', ');
    }

    // HAVING
    if (query.having) {
      sql += `\nHAVING ${query.having.field} ${query.having.operator} ${query.having.value}`;
    }

    // ORDER BY
    if (query.orderBy && query.orderBy.length > 0) {
      sql += '\nORDER BY ' + query.orderBy.map(o => `${o.field} ${o.direction}`).join(', ');
    }

    // LIMIT/OFFSET
    if (query.limit) {
      sql += `\nLIMIT ${query.limit}`;
    }
    if (query.offset) {
      sql += ` OFFSET ${query.offset}`;
    }

    // Display SQL
    alert('Generated SQL (Approximate):\n\n' + sql);
  }

  explainQuery() {
    const query = this.qb.currentQuery;
    let explanation = 'Query Explanation:\n\n';

    explanation += `This query will:\n`;
    explanation += `1. Connect to ${query.datasource?.type || 'a datasource'}\n`;

    if (query.filters && query.filters.rules && query.filters.rules.length > 0) {
      explanation += `2. Filter data using ${this.countFilterRules(query.filters)} conditions\n`;
    }

    if (query.groupBy && query.groupBy.length > 0) {
      explanation += `3. Group results by ${query.groupBy.length} field(s)\n`;
    }

    if (query.aggregations && query.aggregations.length > 0) {
      explanation += `4. Calculate ${query.aggregations.length} aggregation(s)\n`;
    }

    if (query.orderBy && query.orderBy.length > 0) {
      explanation += `5. Sort results by ${query.orderBy.length} field(s)\n`;
    }

    explanation += `6. Return ${query.limit || 100} rows`;

    if (query.distinct) {
      explanation += ' (unique only)';
    }

    alert(explanation);
  }
}

// Make classes globally available
window.QueryBuilderManager = QueryBuilderManager;
window.QueryBuilderUI = QueryBuilderUI;
window.QueryBuilderTabsUI = QueryBuilderTabsUI;
window.QueryBuilderAdvancedUI = QueryBuilderAdvancedUI;
