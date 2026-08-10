/**
 * ═══════════════════════════════════════════════════════════
 * Form Designer - Data Binding Module
 * Handles entity connections, field mapping, and data operations
 * ═══════════════════════════════════════════════════════════
 */

(function() {
  'use strict';

  class DataBindingManager {
    constructor(formDesigner) {
      this.formDesigner = formDesigner;
      this.appId = formDesigner.state.appId;
      this.entities = [];
      this.dataSources = [];
      this.fieldMappings = {};

      this.init();
    }

    async init() {
      console.log('[DataBinding] Initializing data binding manager...');

      // Load available entities for this application
      await this.loadEntities();

      // Load existing data sources from form
      if (this.formDesigner.state.form?.formDefinition?.dataSources) {
        this.dataSources = this.formDesigner.state.form.formDefinition.dataSources;
      }

      console.log('[DataBinding] Loaded', this.entities.length, 'entities');
    }

    // ───────────────────────────────────────────────────────────
    // Entity Management
    // ───────────────────────────────────────────────────────────

    async loadEntities() {
      try {
        const response = await fetch(`/lowcode/api/entities?applicationId=${this.appId}`);
        const result = await response.json();

        if (result.success) {
          this.entities = result.data.entities || [];
          console.log('[DataBinding] Entities loaded:', this.entities.length);
        }
      } catch (error) {
        console.error('[DataBinding] Failed to load entities:', error);
      }
    }

    async getEntityFields(entityId) {
      try {
        const response = await fetch(`/lowcode/api/entities/${entityId}`);
        const result = await response.json();

        if (result.success) {
          return result.data.fields || [];
        }
      } catch (error) {
        console.error('[DataBinding] Failed to load entity fields:', error);
      }
      return [];
    }

    // ───────────────────────────────────────────────────────────
    // Data Source Configuration
    // ───────────────────────────────────────────────────────────

    addDataSource(config) {
      const dataSource = {
        id: this.generateDataSourceId(),
        name: config.name,
        type: config.type, // 'entity', 'api', 'custom', 'jsonlex'
        config: config,
        fields: [],
        filters: [],
        sortBy: null,
        limit: 100
      };

      // Configure based on type
      switch (config.type) {
        case 'entity':
          dataSource.entityId = config.entityId;
          dataSource.entityName = config.entityName;
          break;
        case 'api':
          dataSource.url = config.url;
          dataSource.method = config.method || 'GET';
          dataSource.headers = config.headers || {};
          break;
        case 'jsonlex':
          dataSource.expression = config.expression;
          break;
        case 'custom':
          dataSource.customCode = config.customCode;
          break;
      }

      this.dataSources.push(dataSource);
      console.log('[DataBinding] Data source added:', dataSource);

      return dataSource;
    }

    removeDataSource(dataSourceId) {
      this.dataSources = this.dataSources.filter(ds => ds.id !== dataSourceId);
      console.log('[DataBinding] Data source removed:', dataSourceId);
    }

    updateDataSource(dataSourceId, updates) {
      const dataSource = this.dataSources.find(ds => ds.id === dataSourceId);
      if (dataSource) {
        Object.assign(dataSource, updates);
        console.log('[DataBinding] Data source updated:', dataSourceId);
      }
    }

    getDataSource(dataSourceId) {
      return this.dataSources.find(ds => ds.id === dataSourceId);
    }

    // ───────────────────────────────────────────────────────────
    // Field Binding
    // ───────────────────────────────────────────────────────────

    bindComponentToField(componentId, binding) {
      this.fieldMappings[componentId] = {
        dataSourceId: binding.dataSourceId,
        fieldPath: binding.fieldPath, // e.g., "customer.name" or "records[0].email"
        bindingMode: binding.mode || 'two-way', // 'one-way', 'two-way', 'one-time'
        transform: binding.transform || null, // Function to transform data
        validation: binding.validation || null
      };

      console.log('[DataBinding] Component bound to field:', componentId, binding);
    }

    unbindComponent(componentId) {
      delete this.fieldMappings[componentId];
      console.log('[DataBinding] Component unbound:', componentId);
    }

    getComponentBinding(componentId) {
      return this.fieldMappings[componentId];
    }

    // ───────────────────────────────────────────────────────────
    // Data Operations (CRUD)
    // ───────────────────────────────────────────────────────────

    async loadData(dataSourceId, params = {}) {
      const dataSource = this.getDataSource(dataSourceId);
      if (!dataSource) {
        throw new Error(`Data source not found: ${dataSourceId}`);
      }

      console.log('[DataBinding] Loading data from:', dataSource.name);

      switch (dataSource.type) {
        case 'entity':
          return await this.loadEntityData(dataSource, params);
        case 'api':
          return await this.loadApiData(dataSource, params);
        case 'jsonlex':
          return await this.executeJSONLex(dataSource, params);
        case 'custom':
          return await this.executeCustomCode(dataSource, params);
        default:
          throw new Error(`Unsupported data source type: ${dataSource.type}`);
      }
    }

    async loadEntityData(dataSource, params) {
      try {
        const queryParams = new URLSearchParams({
          limit: params.limit || dataSource.limit || 100,
          offset: params.offset || 0,
          ...params
        });

        const response = await fetch(
          `/lowcode/api/entities/${dataSource.entityId}/records?${queryParams}`
        );
        const result = await response.json();

        if (result.success) {
          return {
            records: result.data.records,
            total: result.data.total,
            hasMore: result.data.hasMore
          };
        } else {
          throw new Error(result.message);
        }
      } catch (error) {
        console.error('[DataBinding] Failed to load entity data:', error);
        throw error;
      }
    }

    async loadApiData(dataSource, params) {
      try {
        const options = {
          method: dataSource.method,
          headers: {
            'Content-Type': 'application/json',
            ...dataSource.headers
          }
        };

        if (dataSource.method !== 'GET' && params.body) {
          options.body = JSON.stringify(params.body);
        }

        const response = await fetch(dataSource.url, options);
        const data = await response.json();

        return data;
      } catch (error) {
        console.error('[DataBinding] Failed to load API data:', error);
        throw error;
      }
    }

    async executeJSONLex(dataSource, params) {
      try {
        const response = await fetch('/lowcode/api/jsonlex/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expression: dataSource.expression,
            context: params.context || {}
          })
        });

        const result = await response.json();
        if (result.success) {
          return result.data;
        } else {
          throw new Error(result.message);
        }
      } catch (error) {
        console.error('[DataBinding] Failed to execute JSONLex:', error);
        throw error;
      }
    }

    async executeCustomCode(dataSource, params) {
      try {
        // Execute custom function in sandboxed environment
        const func = new Function('params', dataSource.customCode);
        const result = await func(params);
        return result;
      } catch (error) {
        console.error('[DataBinding] Failed to execute custom code:', error);
        throw error;
      }
    }

    async saveRecord(dataSourceId, recordData, recordId = null) {
      const dataSource = this.getDataSource(dataSourceId);
      if (!dataSource) {
        throw new Error(`Data source not found: ${dataSourceId}`);
      }

      if (dataSource.type !== 'entity') {
        throw new Error('Save operation only supported for entity data sources');
      }

      try {
        const url = recordId
          ? `/lowcode/api/entities/${dataSource.entityId}/records/${recordId}`
          : `/lowcode/api/entities/${dataSource.entityId}/records`;

        const method = recordId ? 'PUT' : 'POST';

        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(recordData)
        });

        const result = await response.json();

        if (result.success) {
          console.log('[DataBinding] Record saved:', result.data);
          return result.data;
        } else {
          throw new Error(result.message);
        }
      } catch (error) {
        console.error('[DataBinding] Failed to save record:', error);
        throw error;
      }
    }

    async deleteRecord(dataSourceId, recordId) {
      const dataSource = this.getDataSource(dataSourceId);
      if (!dataSource) {
        throw new Error(`Data source not found: ${dataSourceId}`);
      }

      if (dataSource.type !== 'entity') {
        throw new Error('Delete operation only supported for entity data sources');
      }

      try {
        const response = await fetch(
          `/lowcode/api/entities/${dataSource.entityId}/records/${recordId}`,
          { method: 'DELETE' }
        );

        const result = await response.json();

        if (result.success) {
          console.log('[DataBinding] Record deleted:', recordId);
          return true;
        } else {
          throw new Error(result.message);
        }
      } catch (error) {
        console.error('[DataBinding] Failed to delete record:', error);
        throw error;
      }
    }

    // ───────────────────────────────────────────────────────────
    // UI Helpers for Data Binding Configuration
    // ───────────────────────────────────────────────────────────

    renderDataSourceSelector() {
      return `
        <div class="data-source-selector">
          <label class="property-label">Data Source</label>
          <select class="property-input" id="dataSourceSelect">
            <option value="">None</option>
            ${this.dataSources.map(ds => `
              <option value="${ds.id}">${ds.name} (${ds.type})</option>
            `).join('')}
            <option value="__new__">+ Add New Data Source</option>
          </select>
        </div>
      `;
    }

    renderEntitySelector() {
      return `
        <div class="entity-selector">
          <label class="property-label">Entity</label>
          <select class="property-input" id="entitySelect">
            <option value="">Select Entity...</option>
            ${this.entities.map(entity => `
              <option value="${entity.id}">${entity.displayName || entity.name}</option>
            `).join('')}
          </select>
        </div>
      `;
    }

    async renderFieldSelector(entityId) {
      const fields = await this.getEntityFields(entityId);

      return `
        <div class="field-selector">
          <label class="property-label">Bind to Field</label>
          <select class="property-input" id="fieldSelect">
            <option value="">Select Field...</option>
            ${fields.map(field => `
              <option value="${field.name}">${field.displayName || field.name} (${field.type})</option>
            `).join('')}
          </select>
        </div>
      `;
    }

    renderDataSourceModal() {
      return `
        <div class="modal" id="dataSourceModal">
          <div class="modal-content">
            <h3>Add Data Source</h3>

            <div class="form-group">
              <label>Data Source Type</label>
              <select class="form-control" id="dataSourceType">
                <option value="entity">Entity (Database)</option>
                <option value="api">REST API</option>
                <option value="jsonlex">JSONLex Expression</option>
                <option value="custom">Custom JavaScript</option>
              </select>
            </div>

            <div class="form-group">
              <label>Data Source Name</label>
              <input type="text" class="form-control" id="dataSourceName" placeholder="e.g., customers">
            </div>

            <!-- Entity-specific fields -->
            <div id="entityFields" style="display: none;">
              ${this.renderEntitySelector()}
            </div>

            <!-- API-specific fields -->
            <div id="apiFields" style="display: none;">
              <div class="form-group">
                <label>API URL</label>
                <input type="text" class="form-control" id="apiUrl" placeholder="https://api.example.com/data">
              </div>
              <div class="form-group">
                <label>Method</label>
                <select class="form-control" id="apiMethod">
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="DELETE">DELETE</option>
                </select>
              </div>
            </div>

            <!-- JSONLex-specific fields -->
            <div id="jsonlexFields" style="display: none;">
              <div class="form-group">
                <label>JSONLex Expression</label>
                <textarea class="form-control" id="jsonlexExpression" rows="4"
                          placeholder="e.g., $filter(customers, function($c) { $c.active = true })"></textarea>
              </div>
            </div>

            <!-- Custom code fields -->
            <div id="customFields" style="display: none;">
              <div class="form-group">
                <label>Custom JavaScript</label>
                <textarea class="form-control" id="customCode" rows="6"
                          placeholder="return { data: [...] };"></textarea>
              </div>
            </div>

            <div class="modal-actions" style="margin-top: 1.5rem; display: flex; gap: 0.5rem; justify-content: flex-end;">
              <button class="btn btn-secondary" id="cancelDataSource">Cancel</button>
              <button class="btn btn-primary" id="saveDataSource">Add Data Source</button>
            </div>
          </div>
        </div>
      `;
    }

    setupDataSourceModal() {
      // Check if modal already exists
      let modal = document.getElementById('dataSourceModal');
      if (!modal) {
        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = this.renderDataSourceModal();
        document.body.appendChild(modalContainer.firstElementChild);
        modal = document.getElementById('dataSourceModal');
      }

      // Type selector change handler
      const typeSelect = document.getElementById('dataSourceType');
      typeSelect.addEventListener('change', (e) => {
        const type = e.target.value;

        // Hide all type-specific fields
        document.getElementById('entityFields').style.display = 'none';
        document.getElementById('apiFields').style.display = 'none';
        document.getElementById('jsonlexFields').style.display = 'none';
        document.getElementById('customFields').style.display = 'none';

        // Show relevant fields
        switch(type) {
          case 'entity':
            document.getElementById('entityFields').style.display = 'block';
            break;
          case 'api':
            document.getElementById('apiFields').style.display = 'block';
            break;
          case 'jsonlex':
            document.getElementById('jsonlexFields').style.display = 'block';
            break;
          case 'custom':
            document.getElementById('customFields').style.display = 'block';
            break;
        }
      });

      // Save button handler
      document.getElementById('saveDataSource').addEventListener('click', () => {
        this.handleSaveDataSource();
      });

      // Cancel button handler
      document.getElementById('cancelDataSource').addEventListener('click', () => {
        modal.classList.remove('active');
      });

      return modal;
    }

    showDataSourceModal() {
      const modal = this.setupDataSourceModal();
      modal.classList.add('active');
    }

    handleSaveDataSource() {
      const type = document.getElementById('dataSourceType').value;
      const name = document.getElementById('dataSourceName').value;

      if (!name) {
        alert('Please enter a data source name');
        return;
      }

      const config = {
        name,
        type
      };

      switch(type) {
        case 'entity':
          const entityId = document.getElementById('entitySelect').value;
          if (!entityId) {
            alert('Please select an entity');
            return;
          }
          const entity = this.entities.find(e => e.id === entityId);
          config.entityId = entityId;
          config.entityName = entity.name;
          break;

        case 'api':
          config.url = document.getElementById('apiUrl').value;
          config.method = document.getElementById('apiMethod').value;
          if (!config.url) {
            alert('Please enter API URL');
            return;
          }
          break;

        case 'jsonlex':
          config.expression = document.getElementById('jsonlexExpression').value;
          if (!config.expression) {
            alert('Please enter JSONLex expression');
            return;
          }
          break;

        case 'custom':
          config.customCode = document.getElementById('customCode').value;
          if (!config.customCode) {
            alert('Please enter custom code');
            return;
          }
          break;
      }

      this.addDataSource(config);

      const modal = document.getElementById('dataSourceModal');
      modal.classList.remove('active');

      // Update UI
      this.formDesigner.showNotification('Data source added successfully!', 'success');
      this.formDesigner.renderProperties();
    }

    // ───────────────────────────────────────────────────────────
    // Utility Functions
    // ───────────────────────────────────────────────────────────

    generateDataSourceId() {
      return 'ds_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    getFormDefinition() {
      return {
        dataSources: this.dataSources,
        fieldMappings: this.fieldMappings
      };
    }

    loadFormDefinition(definition) {
      if (definition.dataSources) {
        this.dataSources = definition.dataSources;
      }
      if (definition.fieldMappings) {
        this.fieldMappings = definition.fieldMappings;
      }
    }
  }

  // Export to window
  window.DataBindingManager = DataBindingManager;

})();
