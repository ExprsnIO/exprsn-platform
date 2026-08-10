/**
 * ═══════════════════════════════════════════════════════════
 * Visual Query Builder - UI Components
 * Professional drag-and-drop query builder interface
 * ═══════════════════════════════════════════════════════════
 */

(function() {
  'use strict';

  class QueryBuilderUI {
    constructor(queryBuilder) {
      this.qb = queryBuilder;
      this.currentTab = 'datasource';
      this.selectedFields = new Set();
      this.availableFields = [];

      console.log('[QueryBuilderUI] Initializing UI components...');
    }

    // ═══════════════════════════════════════════════════════════
    // Main Query Builder Interface
    // ═══════════════════════════════════════════════════════════

    renderQueryBuilder() {
      const container = document.getElementById('queryBuilderContainer');
      if (!container) {
        console.error('[QueryBuilderUI] Container not found');
        return;
      }

      container.innerHTML = `
        <div class="query-builder-wrapper">
          <!-- Header -->
          <div class="query-builder-header">
            <div class="query-info">
              <input type="text"
                id="queryName"
                class="query-name-input"
                placeholder="Untitled Query"
                value="${this.qb.currentQuery?.name || 'Untitled Query'}">
              <span class="query-status">
                <i class="fas fa-circle ${this.qb.currentQuery ? 'text-success' : 'text-muted'}"></i>
                ${this.qb.currentQuery ? 'Active' : 'No Query Selected'}
              </span>
            </div>
            <div class="query-actions">
              <button class="btn btn-sm btn-outline-primary" onclick="window.queryBuilderUI.testQuery()">
                <i class="fas fa-play"></i> Test Query
              </button>
              <button class="btn btn-sm btn-outline-success" onclick="window.queryBuilderUI.saveQuery()">
                <i class="fas fa-save"></i> Save
              </button>
              <button class="btn btn-sm btn-outline-secondary" onclick="window.queryBuilderUI.showQueryList()">
                <i class="fas fa-list"></i> All Queries
              </button>
            </div>
          </div>

          <!-- Tab Navigation -->
          <div class="query-builder-tabs">
            <button class="query-tab ${this.currentTab === 'datasource' ? 'active' : ''}"
              onclick="window.queryBuilderUI.switchTab('datasource')">
              <i class="fas fa-database"></i> Data Source
            </button>
            <button class="query-tab ${this.currentTab === 'fields' ? 'active' : ''}"
              onclick="window.queryBuilderUI.switchTab('fields')">
              <i class="fas fa-columns"></i> Fields
            </button>
            <button class="query-tab ${this.currentTab === 'filters' ? 'active' : ''}"
              onclick="window.queryBuilderUI.switchTab('filters')">
              <i class="fas fa-filter"></i> Filters
            </button>
            <button class="query-tab ${this.currentTab === 'aggregation' ? 'active' : ''}"
              onclick="window.queryBuilderUI.switchTab('aggregation')">
              <i class="fas fa-chart-bar"></i> Aggregation
            </button>
            <button class="query-tab ${this.currentTab === 'ordering' ? 'active' : ''}"
              onclick="window.queryBuilderUI.switchTab('ordering')">
              <i class="fas fa-sort"></i> Order & Limit
            </button>
            <button class="query-tab ${this.currentTab === 'preview' ? 'active' : ''}"
              onclick="window.queryBuilderUI.switchTab('preview')">
              <i class="fas fa-eye"></i> Preview
            </button>
          </div>

          <!-- Tab Content -->
          <div class="query-builder-content">
            <div id="queryTabContent" class="tab-content-area"></div>
          </div>

          <!-- Results Panel -->
          <div class="query-results-panel" id="queryResults" style="display: none;">
            <div class="results-header">
              <h5><i class="fas fa-table"></i> Query Results</h5>
              <button class="btn btn-sm btn-outline-secondary" onclick="window.queryBuilderUI.closeResults()">
                <i class="fas fa-times"></i>
              </button>
            </div>
            <div class="results-content" id="resultsContent"></div>
          </div>
        </div>
      `;

      this.renderTabContent();
    }

    // ═══════════════════════════════════════════════════════════
    // Tab Management
    // ═══════════════════════════════════════════════════════════

    switchTab(tabName) {
      this.currentTab = tabName;

      // Update tab buttons
      document.querySelectorAll('.query-tab').forEach(tab => {
        tab.classList.remove('active');
      });
      event.target.closest('.query-tab').classList.add('active');

      this.renderTabContent();
    }

    renderTabContent() {
      const container = document.getElementById('queryTabContent');
      if (!container) return;

      switch (this.currentTab) {
        case 'datasource':
          this.renderDatasourceTab(container);
          break;
        case 'fields':
          this.renderFieldsTab(container);
          break;
        case 'filters':
          this.renderFiltersTab(container);
          break;
        case 'aggregation':
          this.renderAggregationTab(container);
          break;
        case 'ordering':
          this.renderOrderingTab(container);
          break;
        case 'preview':
          this.renderPreviewTab(container);
          break;
      }
    }

    // ═══════════════════════════════════════════════════════════
    // Data Source Tab
    // ═══════════════════════════════════════════════════════════

    renderDatasourceTab(container) {
      const query = this.qb.currentQuery;
      const currentType = query?.datasource?.type || 'entity';

      container.innerHTML = `
        <div class="datasource-selector">
          <div class="section-header">
            <h4><i class="fas fa-database"></i> Select Data Source</h4>
            <p class="text-muted">Choose where your data comes from</p>
          </div>

          <!-- Data Source Type Grid -->
          <div class="datasource-types-grid">
            ${Object.entries(window.DATASOURCE_TYPES).map(([type, info]) => `
              <div class="datasource-type-card ${currentType === type ? 'selected' : ''}"
                onclick="window.queryBuilderUI.selectDatasourceType('${type}')">
                <div class="card-icon" style="color: ${info.color}">
                  <i class="fas ${info.icon} fa-3x"></i>
                </div>
                <div class="card-title">${info.label}</div>
                <div class="card-check">
                  <i class="fas fa-check-circle"></i>
                </div>
              </div>
            `).join('')}
          </div>

          <!-- Data Source Configuration -->
          <div class="datasource-config" id="datasourceConfig">
            ${this.renderDatasourceConfig(currentType)}
          </div>
        </div>
      `;
    }

    renderDatasourceConfig(type) {
      const query = this.qb.currentQuery;
      const config = query?.datasource?.config || {};

      switch (type) {
        case 'entity':
          return `
            <div class="config-section">
              <label class="form-label">Select Entity</label>
              <select class="form-select" id="datasourceEntityId" onchange="window.queryBuilderUI.updateDatasourceConfig()">
                <option value="">-- Select an entity --</option>
                ${this.qb.availableEntities.map(e => `
                  <option value="${e.id}" ${config.entityId === e.id ? 'selected' : ''}>
                    ${e.name} (${e.tableName || e.id})
                  </option>
                `).join('')}
              </select>
              <small class="form-text text-muted">Database tables created in Entity Designer</small>
            </div>
          `;

        case 'forge':
          return `
            <div class="config-section">
              <label class="form-label">Forge Module</label>
              <select class="form-select" id="datasourceForgeModule" onchange="window.queryBuilderUI.updateDatasourceConfig()">
                <option value="">-- Select a module --</option>
                <option value="contacts" ${config.module === 'contacts' ? 'selected' : ''}>Contacts</option>
                <option value="accounts" ${config.module === 'accounts' ? 'selected' : ''}>Accounts</option>
                <option value="leads" ${config.module === 'leads' ? 'selected' : ''}>Leads</option>
                <option value="opportunities" ${config.module === 'opportunities' ? 'selected' : ''}>Opportunities</option>
                <option value="cases" ${config.module === 'cases' ? 'selected' : ''}>Cases</option>
                <option value="tasks" ${config.module === 'tasks' ? 'selected' : ''}>Tasks</option>
              </select>
              <small class="form-text text-muted">Forge CRM/ERP modules</small>
            </div>
          `;

        case 'database':
          return `
            <div class="config-section">
              <label class="form-label">Database Connection</label>
              <select class="form-select" id="datasourceDbConnection">
                <option value="default" selected>Default (Application Database)</option>
                <option value="custom">Custom Connection...</option>
              </select>
            </div>
            <div class="config-section">
              <label class="form-label">Table Name</label>
              <input type="text" class="form-control" id="datasourceTableName"
                value="${config.table || ''}"
                placeholder="Enter table name"
                onchange="window.queryBuilderUI.updateDatasourceConfig()">
            </div>
          `;

        case 'rest':
          return `
            <div class="config-section">
              <label class="form-label">API URL</label>
              <input type="text" class="form-control" id="datasourceRestUrl"
                value="${config.url || ''}"
                placeholder="https://api.example.com/endpoint"
                onchange="window.queryBuilderUI.updateDatasourceConfig()">
            </div>
            <div class="config-section">
              <label class="form-label">HTTP Method</label>
              <select class="form-select" id="datasourceRestMethod" onchange="window.queryBuilderUI.updateDatasourceConfig()">
                <option value="GET" ${config.method === 'GET' ? 'selected' : ''}>GET</option>
                <option value="POST" ${config.method === 'POST' ? 'selected' : ''}>POST</option>
              </select>
            </div>
            <div class="config-section">
              <label class="form-label">Headers (JSON)</label>
              <textarea class="form-control font-monospace" id="datasourceRestHeaders" rows="3"
                onchange="window.queryBuilderUI.updateDatasourceConfig()">${JSON.stringify(config.headers || {}, null, 2)}</textarea>
            </div>
            <div class="config-section">
              <label class="form-label">Response Data Path</label>
              <input type="text" class="form-control" id="datasourceRestDataPath"
                value="${config.dataPath || 'data'}"
                placeholder="data"
                onchange="window.queryBuilderUI.updateDatasourceConfig()">
              <small class="form-text text-muted">JSONPath to the data array (e.g., "data.results")</small>
            </div>
          `;

        case 'json':
          return `
            <div class="config-section">
              <label class="form-label">JSON Source</label>
              <div class="btn-group w-100 mb-2" role="group">
                <input type="radio" class="btn-check" name="jsonSource" id="jsonUrl" value="url"
                  ${config.sourceType !== 'inline' ? 'checked' : ''} onchange="window.queryBuilderUI.toggleJsonSource()">
                <label class="btn btn-outline-primary" for="jsonUrl">URL</label>

                <input type="radio" class="btn-check" name="jsonSource" id="jsonInline" value="inline"
                  ${config.sourceType === 'inline' ? 'checked' : ''} onchange="window.queryBuilderUI.toggleJsonSource()">
                <label class="btn btn-outline-primary" for="jsonInline">Inline JSON</label>
              </div>

              <div id="jsonUrlInput" style="display: ${config.sourceType === 'inline' ? 'none' : 'block'}">
                <input type="text" class="form-control" id="datasourceJsonUrl"
                  value="${config.url || ''}"
                  placeholder="https://example.com/data.json"
                  onchange="window.queryBuilderUI.updateDatasourceConfig()">
              </div>

              <div id="jsonInlineInput" style="display: ${config.sourceType === 'inline' ? 'block' : 'none'}">
                <textarea class="form-control font-monospace" id="datasourceJsonData" rows="6"
                  placeholder='[{"id": 1, "name": "Item 1"}, ...]'
                  onchange="window.queryBuilderUI.updateDatasourceConfig()">${config.data || ''}</textarea>
              </div>
            </div>
          `;

        case 'xml':
          return `
            <div class="config-section">
              <label class="form-label">XML Source</label>
              <div class="btn-group w-100 mb-2" role="group">
                <input type="radio" class="btn-check" name="xmlSource" id="xmlUrl" value="url"
                  ${config.sourceType !== 'inline' ? 'checked' : ''} onchange="window.queryBuilderUI.toggleXmlSource()">
                <label class="btn btn-outline-primary" for="xmlUrl">URL</label>

                <input type="radio" class="btn-check" name="xmlSource" id="xmlInline" value="inline"
                  ${config.sourceType === 'inline' ? 'checked' : ''} onchange="window.queryBuilderUI.toggleXmlSource()">
                <label class="btn btn-outline-primary" for="xmlInline">Inline XML</label>
              </div>

              <div id="xmlUrlInput" style="display: ${config.sourceType === 'inline' ? 'none' : 'block'}">
                <input type="text" class="form-control" id="datasourceXmlUrl"
                  value="${config.url || ''}"
                  placeholder="https://example.com/data.xml"
                  onchange="window.queryBuilderUI.updateDatasourceConfig()">
              </div>

              <div id="xmlInlineInput" style="display: ${config.sourceType === 'inline' ? 'block' : 'none'}">
                <textarea class="form-control font-monospace" id="datasourceXmlData" rows="6"
                  placeholder='<items><item id="1">...</item></items>'
                  onchange="window.queryBuilderUI.updateDatasourceConfig()">${config.data || ''}</textarea>
              </div>

              <label class="form-label mt-2">XPath to Items</label>
              <input type="text" class="form-control" id="datasourceXmlPath"
                value="${config.xpath || '/items/item'}"
                placeholder="/items/item"
                onchange="window.queryBuilderUI.updateDatasourceConfig()">
            </div>
          `;

        case 'jsonlex':
          return `
            <div class="config-section">
              <label class="form-label">JSONLex Expression</label>
              <textarea class="form-control font-monospace" id="datasourceJsonlexExpression" rows="8"
                placeholder="// Write JSONLex expression here\nreturn data.filter(item => item.active).map(item => ({ id: item.id, name: item.name }));"
                onchange="window.queryBuilderUI.updateDatasourceConfig()">${config.expression || ''}</textarea>
              <small class="form-text text-muted">Use JSONLex to transform and query data</small>
            </div>
            <div class="config-section">
              <label class="form-label">Input Data Source</label>
              <select class="form-select" id="datasourceJsonlexInput" onchange="window.queryBuilderUI.updateDatasourceConfig()">
                <option value="">-- Select input --</option>
                ${this.qb.availableVariables.map(v => `
                  <option value="variable:${v.name}" ${config.inputSource === \`variable:\${v.name}\` ? 'selected' : ''}>
                    Variable: ${v.name}
                  </option>
                `).join('')}
              </select>
            </div>
          `;

        case 'redis':
          return `
            <div class="config-section">
              <label class="form-label">Redis Key Pattern</label>
              <input type="text" class="form-control" id="datasourceRedisKey"
                value="${config.key || ''}"
                placeholder="myapp:*"
                onchange="window.queryBuilderUI.updateDatasourceConfig()">
              <small class="form-text text-muted">Use * for wildcard patterns</small>
            </div>
            <div class="config-section">
              <label class="form-label">Data Type</label>
              <select class="form-select" id="datasourceRedisType" onchange="window.queryBuilderUI.updateDatasourceConfig()">
                <option value="string" ${config.dataType === 'string' ? 'selected' : ''}>String</option>
                <option value="hash" ${config.dataType === 'hash' ? 'selected' : ''}>Hash</option>
                <option value="list" ${config.dataType === 'list' ? 'selected' : ''}>List</option>
                <option value="set" ${config.dataType === 'set' ? 'selected' : ''}>Set</option>
                <option value="zset" ${config.dataType === 'zset' ? 'selected' : ''}>Sorted Set</option>
              </select>
            </div>
          `;

        case 'variable':
          return `
            <div class="config-section">
              <label class="form-label">Form Variable</label>
              <select class="form-select" id="datasourceVariable" onchange="window.queryBuilderUI.updateDatasourceConfig()">
                <option value="">-- Select a variable --</option>
                ${this.qb.availableVariables.map(v => `
                  <option value="${v.name}" ${config.variableName === v.name ? 'selected' : ''}>
                    ${v.name} (${v.type || 'any'})
                  </option>
                `).join('')}
              </select>
              <small class="form-text text-muted">Variable must contain array or object data</small>
            </div>
          `;

        case 'custom':
          return `
            <div class="config-section">
              <label class="form-label">Custom Data Function</label>
              <textarea class="form-control font-monospace" id="datasourceCustomCode" rows="10"
                placeholder="// Return array of objects\nasync function getData(context) {\n  // Your code here\n  return [];\n}"
                onchange="window.queryBuilderUI.updateDatasourceConfig()">${config.code || ''}</textarea>
              <small class="form-text text-muted">Must return an array of objects</small>
            </div>
          `;

        default:
          return '<p class="text-muted">Select a data source type</p>';
      }
    }

    selectDatasourceType(type) {
      if (!this.qb.currentQuery) {
        this.qb.createQuery();
      }

      this.qb.currentQuery.datasource.type = type;
      this.qb.currentQuery.datasource.config = {};

      this.renderDatasourceTab(document.getElementById('queryTabContent'));
    }

    async updateDatasourceConfig() {
      if (!this.qb.currentQuery) return;

      const type = this.qb.currentQuery.datasource.type;
      const config = {};

      switch (type) {
        case 'entity':
          const entityId = document.getElementById('datasourceEntityId')?.value;
          if (entityId) {
            config.entityId = entityId;
            const entity = this.qb.availableEntities.find(e => e.id === entityId);
            config.entityName = entity?.tableName || entity?.name;

            // Load entity fields
            await this.loadEntityFields(entityId);
          }
          break;

        case 'forge':
          config.module = document.getElementById('datasourceForgeModule')?.value;
          if (config.module) {
            await this.loadForgeFields(config.module);
          }
          break;

        case 'database':
          config.connection = document.getElementById('datasourceDbConnection')?.value;
          config.table = document.getElementById('datasourceTableName')?.value;
          break;

        case 'rest':
          config.url = document.getElementById('datasourceRestUrl')?.value;
          config.method = document.getElementById('datasourceRestMethod')?.value;
          try {
            config.headers = JSON.parse(document.getElementById('datasourceRestHeaders')?.value || '{}');
          } catch (e) {
            config.headers = {};
          }
          config.dataPath = document.getElementById('datasourceRestDataPath')?.value;
          break;

        case 'json':
          config.sourceType = document.querySelector('input[name="jsonSource"]:checked')?.value;
          if (config.sourceType === 'url') {
            config.url = document.getElementById('datasourceJsonUrl')?.value;
          } else {
            config.data = document.getElementById('datasourceJsonData')?.value;
          }
          break;

        case 'xml':
          config.sourceType = document.querySelector('input[name="xmlSource"]:checked')?.value;
          if (config.sourceType === 'url') {
            config.url = document.getElementById('datasourceXmlUrl')?.value;
          } else {
            config.data = document.getElementById('datasourceXmlData')?.value;
          }
          config.xpath = document.getElementById('datasourceXmlPath')?.value;
          break;

        case 'jsonlex':
          config.expression = document.getElementById('datasourceJsonlexExpression')?.value;
          config.inputSource = document.getElementById('datasourceJsonlexInput')?.value;
          break;

        case 'redis':
          config.key = document.getElementById('datasourceRedisKey')?.value;
          config.dataType = document.getElementById('datasourceRedisType')?.value;
          break;

        case 'variable':
          config.variableName = document.getElementById('datasourceVariable')?.value;
          break;

        case 'custom':
          config.code = document.getElementById('datasourceCustomCode')?.value;
          break;
      }

      this.qb.currentQuery.datasource.config = config;
      this.qb.updateQuery(this.qb.currentQuery.id, {});

      console.log('[QueryBuilderUI] Datasource config updated:', config);
    }

    async loadEntityFields(entityId) {
      try {
        const response = await fetch(`/lowcode/api/entities/${entityId}`);
        const result = await response.json();

        if (result.success && result.data.fields) {
          this.availableFields = result.data.fields.map(f => ({
            name: f.name,
            type: f.dataType,
            label: f.label || f.name
          }));
          console.log('[QueryBuilderUI] Loaded', this.availableFields.length, 'fields');
        }
      } catch (error) {
        console.error('[QueryBuilderUI] Failed to load entity fields:', error);
      }
    }

    async loadForgeFields(module) {
      // Define Forge module fields
      const forgeFieldMaps = {
        contacts: [
          { name: 'id', type: 'uuid', label: 'ID' },
          { name: 'firstName', type: 'string', label: 'First Name' },
          { name: 'lastName', type: 'string', label: 'Last Name' },
          { name: 'email', type: 'string', label: 'Email' },
          { name: 'phone', type: 'string', label: 'Phone' },
          { name: 'accountId', type: 'uuid', label: 'Account' },
          { name: 'createdAt', type: 'datetime', label: 'Created' }
        ],
        accounts: [
          { name: 'id', type: 'uuid', label: 'ID' },
          { name: 'name', type: 'string', label: 'Account Name' },
          { name: 'industry', type: 'string', label: 'Industry' },
          { name: 'revenue', type: 'decimal', label: 'Annual Revenue' },
          { name: 'employees', type: 'integer', label: 'Employees' },
          { name: 'createdAt', type: 'datetime', label: 'Created' }
        ],
        leads: [
          { name: 'id', type: 'uuid', label: 'ID' },
          { name: 'name', type: 'string', label: 'Lead Name' },
          { name: 'email', type: 'string', label: 'Email' },
          { name: 'status', type: 'string', label: 'Status' },
          { name: 'score', type: 'integer', label: 'Score' },
          { name: 'createdAt', type: 'datetime', label: 'Created' }
        ],
        opportunities: [
          { name: 'id', type: 'uuid', label: 'ID' },
          { name: 'name', type: 'string', label: 'Name' },
          { name: 'amount', type: 'decimal', label: 'Amount' },
          { name: 'stage', type: 'string', label: 'Stage' },
          { name: 'probability', type: 'integer', label: 'Probability' },
          { name: 'closeDate', type: 'date', label: 'Close Date' },
          { name: 'createdAt', type: 'datetime', label: 'Created' }
        ]
      };

      this.availableFields = forgeFieldMaps[module] || [];
      console.log('[QueryBuilderUI] Loaded', this.availableFields.length, 'Forge fields for', module);
    }

    toggleJsonSource() {
      const sourceType = document.querySelector('input[name="jsonSource"]:checked').value;
      document.getElementById('jsonUrlInput').style.display = sourceType === 'url' ? 'block' : 'none';
      document.getElementById('jsonInlineInput').style.display = sourceType === 'inline' ? 'block' : 'none';
      this.updateDatasourceConfig();
    }

    toggleXmlSource() {
      const sourceType = document.querySelector('input[name="xmlSource"]:checked').value;
      document.getElementById('xmlUrlInput').style.display = sourceType === 'url' ? 'block' : 'none';
      document.getElementById('xmlInlineInput').style.display = sourceType === 'inline' ? 'block' : 'none';
      this.updateDatasourceConfig();
    }

    // ═══════════════════════════════════════════════════════════
    // Continue in next part...
    // ═══════════════════════════════════════════════════════════
  }

  // Export
  window.QueryBuilderUI = QueryBuilderUI;

})();
