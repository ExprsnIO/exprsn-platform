/**
 * API Designer
 *
 * Visual designer for creating and editing custom API endpoints in the Low-Code Platform.
 * Provides a complete interface for configuring all aspects of an API.
 */

class APIDesigner {
  constructor(apiData, applicationId) {
    this.api = apiData || this.getDefaultAPI(applicationId);
    this.applicationId = applicationId;
    this.currentTab = 'basic';
    this.editors = {};
    this.hasChanges = false;
  }

  /**
   * Get default API structure for new APIs
   */
  getDefaultAPI(applicationId) {
    return {
      applicationId: applicationId || null,
      path: '',
      displayName: '',
      description: '',
      method: 'GET',
      category: 'custom',
      handlerType: 'jsonlex',
      handlerConfig: {},
      requestSchema: {},
      responseSchema: {},
      authentication: {
        required: true,
        permissions: []
      },
      rateLimit: {
        enabled: true,
        maxRequests: 100,
        windowMs: 60000
      },
      cors: {
        enabled: true,
        allowedOrigins: ['*'],
        allowedMethods: ['GET', 'POST']
      },
      cache: {
        enabled: false,
        ttl: 300
      },
      enabled: true,
      version: '1.0.0',
      tags: []
    };
  }

  /**
   * Initialize the designer
   */
  async init() {
    this.showTab('basic');
    this.setupEventListeners();

    // Load Monaco Editor
    await this.initMonaco();

    console.log('API Designer initialized', { api: this.api });
  }

  /**
   * Initialize Monaco Editor
   */
  async initMonaco() {
    return new Promise((resolve) => {
      require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' } });
      require(['vs/editor/editor.main'], () => {
        monaco.editor.defineTheme('exprsn-dark', {
          base: 'vs-dark',
          inherit: true,
          rules: [],
          colors: {}
        });
        console.log('Monaco Editor loaded');
        resolve();
      });
    });
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Warn before leaving if there are unsaved changes
    window.addEventListener('beforeunload', (e) => {
      if (this.hasChanges) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
      }
    });
  }

  /**
   * Show a specific tab
   */
  showTab(tabName) {
    this.currentTab = tabName;

    // Update sidebar active state
    document.querySelectorAll('.sidebar-item').forEach(item => {
      item.classList.remove('active');
    });
    event?.target.closest('.sidebar-item')?.classList.add('active');

    // Render tab content
    const content = document.getElementById('designerContent');

    switch (tabName) {
      case 'basic':
        content.innerHTML = this.renderBasicTab();
        break;
      case 'handler':
        content.innerHTML = this.renderHandlerTab();
        this.setupHandlerListeners();
        break;
      case 'schema':
        content.innerHTML = this.renderSchemaTab();
        this.setupSchemaEditors();
        break;
      case 'auth':
        content.innerHTML = this.renderAuthTab();
        break;
      case 'advanced':
        content.innerHTML = this.renderAdvancedTab();
        break;
      case 'test':
        content.innerHTML = this.renderTestTab();
        break;
      default:
        content.innerHTML = '<p>Tab not found</p>';
    }
  }

  /**
   * Render Basic Info tab
   */
  renderBasicTab() {
    return `
      <div class="form-section">
        <div class="form-section-header">
          <i class="fas fa-info-circle icon"></i>
          <h3>Basic Information</h3>
        </div>

        <div class="form-group">
          <label>Display Name <span class="required">*</span></label>
          <input type="text" id="displayName" value="${this.api.displayName || ''}"
                 placeholder="e.g., Get Users" onchange="apiDesigner.updateField('displayName', this.value)">
          <small>A user-friendly name for this API endpoint</small>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>HTTP Method <span class="required">*</span></label>
            <select id="method" onchange="apiDesigner.updateField('method', this.value)">
              <option value="GET" ${this.api.method === 'GET' ? 'selected' : ''}>GET</option>
              <option value="POST" ${this.api.method === 'POST' ? 'selected' : ''}>POST</option>
              <option value="PUT" ${this.api.method === 'PUT' ? 'selected' : ''}>PUT</option>
              <option value="PATCH" ${this.api.method === 'PATCH' ? 'selected' : ''}>PATCH</option>
              <option value="DELETE" ${this.api.method === 'DELETE' ? 'selected' : ''}>DELETE</option>
            </select>
          </div>

          <div class="form-group">
            <label>Path <span class="required">*</span></label>
            <input type="text" id="path" value="${this.api.path || ''}"
                   placeholder="/api/users" onchange="apiDesigner.updateField('path', this.value)">
            <small>Will be accessible at: /lowcode/custom${this.api.path || '{path}'}</small>
          </div>
        </div>

        <div class="form-group">
          <label>Description</label>
          <textarea id="description" rows="3"
                    onchange="apiDesigner.updateField('description', this.value)">${this.api.description || ''}</textarea>
          <small>Describe what this API endpoint does</small>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Category</label>
            <select id="category" onchange="apiDesigner.updateField('category', this.value)">
              <option value="custom" ${this.api.category === 'custom' ? 'selected' : ''}>Custom</option>
              <option value="integration" ${this.api.category === 'integration' ? 'selected' : ''}>Integration</option>
              <option value="webhook" ${this.api.category === 'webhook' ? 'selected' : ''}>Webhook</option>
              <option value="utility" ${this.api.category === 'utility' ? 'selected' : ''}>Utility</option>
            </select>
          </div>

          <div class="form-group">
            <label>Version</label>
            <input type="text" id="version" value="${this.api.version || '1.0.0'}"
                   placeholder="1.0.0" onchange="apiDesigner.updateField('version', this.value)">
            <small>Semantic versioning (e.g., 1.0.0)</small>
          </div>
        </div>

        <div class="form-group">
          <label>Tags</label>
          <input type="text" id="tags" value="${(this.api.tags || []).join(', ')}"
                 placeholder="user, management, api" onchange="apiDesigner.updateTags(this.value)">
          <small>Comma-separated tags for organization</small>
        </div>

        <div class="form-group">
          <label style="display: flex; align-items: center; gap: 0.5rem;">
            <input type="checkbox" id="enabled" ${this.api.enabled ? 'checked' : ''}
                   onchange="apiDesigner.updateField('enabled', this.checked)" style="width: auto;">
            Enable this API endpoint
          </label>
          <small>Disabled endpoints will not be accessible</small>
        </div>
      </div>

      <div class="preview-panel">
        <div class="preview-header">
          <h4 style="margin: 0; font-size: 1rem;">Endpoint Preview</h4>
        </div>
        <div class="preview-content">
          <div style="margin-bottom: 0.5rem;">
            <strong>URL:</strong>
            <code>https://your-domain/lowcode/custom${this.api.path || '{path}'}</code>
          </div>
          <div style="margin-bottom: 0.5rem;">
            <strong>Method:</strong>
            <code>${this.api.method || 'GET'}</code>
          </div>
          <div>
            <strong>Status:</strong>
            <span class="status-badge ${this.api.enabled ? 'active' : 'inactive'}">
              ${this.api.enabled ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render Handler tab
   */
  renderHandlerTab() {
    return `
      <div class="form-section">
        <div class="form-section-header">
          <i class="fas fa-cogs icon"></i>
          <h3>Handler Type</h3>
        </div>
        <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">
          Choose how this API endpoint will process requests and generate responses.
        </p>

        <div class="handler-cards">
          <div class="handler-card ${this.api.handlerType === 'jsonlex' ? 'selected' : ''}"
               onclick="apiDesigner.selectHandler('jsonlex')">
            <div class="icon"><i class="fas fa-code"></i></div>
            <div class="title">JSONLex Expression</div>
            <div class="description">Use JSONLex expressions to transform data</div>
          </div>

          <div class="handler-card ${this.api.handlerType === 'external_api' ? 'selected' : ''}"
               onclick="apiDesigner.selectHandler('external_api')">
            <div class="icon"><i class="fas fa-globe"></i></div>
            <div class="title">External API</div>
            <div class="description">Proxy requests to external services</div>
          </div>

          <div class="handler-card ${this.api.handlerType === 'workflow' ? 'selected' : ''}"
               onclick="apiDesigner.selectHandler('workflow')">
            <div class="icon"><i class="fas fa-project-diagram"></i></div>
            <div class="title">Workflow</div>
            <div class="description">Trigger a workflow process</div>
          </div>

          <div class="handler-card ${this.api.handlerType === 'custom_code' ? 'selected' : ''}"
               onclick="apiDesigner.selectHandler('custom_code')">
            <div class="icon"><i class="fas fa-terminal"></i></div>
            <div class="title">Custom Code</div>
            <div class="description">Execute custom JavaScript code</div>
          </div>

          <div class="handler-card ${this.api.handlerType === 'entity_query' ? 'selected' : ''}"
               onclick="apiDesigner.selectHandler('entity_query')">
            <div class="icon"><i class="fas fa-database"></i></div>
            <div class="title">Entity Query</div>
            <div class="description">Query Low-Code entities</div>
          </div>
        </div>
      </div>

      <div class="form-section" id="handlerConfigSection">
        <div class="form-section-header">
          <i class="fas fa-sliders-h icon"></i>
          <h3>Handler Configuration</h3>
        </div>
        <div id="handlerConfigContent">
          ${this.renderHandlerConfig()}
        </div>
      </div>
    `;
  }

  /**
   * Render handler-specific configuration
   */
  renderHandlerConfig() {
    const config = this.api.handlerConfig || {};

    switch (this.api.handlerType) {
      case 'jsonlex':
        return `
          <div class="form-group">
            <label>JSONLex Expression <span class="required">*</span></label>
            <textarea id="jsonlexExpression" rows="10"
                      style="font-family: monospace;"
                      onchange="apiDesigner.updateHandlerConfig('expression', this.value)">${config.expression || ''}</textarea>
            <small>
              Available context: <code>$.request.body</code>, <code>$.request.query</code>,
              <code>$.request.params</code>, <code>$.user</code>
            </small>
          </div>
          <div class="form-group">
            <button class="btn btn-secondary" onclick="apiDesigner.showExpressionHelp()">
              <i class="fas fa-question-circle"></i> Expression Help
            </button>
          </div>
        `;

      case 'external_api':
        return `
          <div class="form-group">
            <label>External URL <span class="required">*</span></label>
            <input type="url" id="externalUrl" value="${config.url || ''}"
                   placeholder="https://api.example.com/endpoint"
                   onchange="apiDesigner.updateHandlerConfig('url', this.value)">
          </div>
          <div class="form-group">
            <label>HTTP Method</label>
            <select id="externalMethod" onchange="apiDesigner.updateHandlerConfig('method', this.value)">
              <option value="GET" ${config.method === 'GET' ? 'selected' : ''}>GET</option>
              <option value="POST" ${config.method === 'POST' ? 'selected' : ''}>POST</option>
              <option value="PUT" ${config.method === 'PUT' ? 'selected' : ''}>PUT</option>
              <option value="DELETE" ${config.method === 'DELETE' ? 'selected' : ''}>DELETE</option>
            </select>
          </div>
          <div class="form-group">
            <label>Headers (JSON)</label>
            <textarea id="externalHeaders" rows="4"
                      style="font-family: monospace;"
                      onchange="apiDesigner.updateHandlerConfigJSON('headers', this.value)">${JSON.stringify(config.headers || {}, null, 2)}</textarea>
          </div>
          <div class="form-group">
            <label>Timeout (ms)</label>
            <input type="number" id="externalTimeout" value="${config.timeout || 30000}"
                   onchange="apiDesigner.updateHandlerConfig('timeout', parseInt(this.value))">
          </div>
        `;

      case 'workflow':
        return `
          <div class="form-group">
            <label>Workflow ID <span class="required">*</span></label>
            <input type="text" id="workflowId" value="${config.workflowId || ''}"
                   placeholder="Select workflow..."
                   onchange="apiDesigner.updateHandlerConfig('workflowId', this.value)">
            <small>
              <button class="btn btn-sm btn-secondary" onclick="apiDesigner.selectWorkflow()">
                <i class="fas fa-search"></i> Browse Workflows
              </button>
            </small>
          </div>
          <div class="form-group">
            <label>Input Mapping (JSONLex)</label>
            <textarea id="workflowInput" rows="6"
                      style="font-family: monospace;"
                      onchange="apiDesigner.updateHandlerConfigJSON('inputMapping', this.value)">${JSON.stringify(config.inputMapping || {}, null, 2)}</textarea>
            <small>Map request data to workflow inputs</small>
          </div>
          <div class="form-group">
            <label>Output Mapping (JSONLex)</label>
            <textarea id="workflowOutput" rows="6"
                      style="font-family: monospace;"
                      onchange="apiDesigner.updateHandlerConfigJSON('outputMapping', this.value)">${JSON.stringify(config.outputMapping || {}, null, 2)}</textarea>
            <small>Map workflow output to API response</small>
          </div>
        `;

      case 'custom_code':
        return `
          <div class="form-group">
            <label>JavaScript Code <span class="required">*</span></label>
            <div class="code-editor-container">
              <div id="customCodeEditor" style="height: 100%;"></div>
            </div>
            <small>
              Return data directly. Available: <code>request</code>, <code>context</code>, <code>console</code>
            </small>
          </div>
          <script>
            setTimeout(() => {
              const editor = monaco.editor.create(document.getElementById('customCodeEditor'), {
                value: ${JSON.stringify(config.code || '// Write your code here\nreturn { message: "Hello World" };\n')},
                language: 'javascript',
                theme: 'vs-dark',
                minimap: { enabled: false },
                lineNumbers: 'on',
                automaticLayout: true
              });
              editor.onDidChangeModelContent(() => {
                apiDesigner.updateHandlerConfig('code', editor.getValue());
              });
              apiDesigner.editors.customCode = editor;
            }, 100);
          </script>
        `;

      case 'entity_query':
        return `
          <div class="form-group">
            <label>Entity <span class="required">*</span></label>
            <input type="text" id="entityId" value="${config.entityId || ''}"
                   placeholder="Select entity..."
                   onchange="apiDesigner.updateHandlerConfig('entityId', this.value)">
            <small>
              <button class="btn btn-sm btn-secondary" onclick="apiDesigner.selectEntity()">
                <i class="fas fa-search"></i> Browse Entities
              </button>
            </small>
          </div>
          <div class="form-group">
            <label>Operation</label>
            <select id="entityOperation" onchange="apiDesigner.updateHandlerConfig('operation', this.value)">
              <option value="list" ${config.operation === 'list' ? 'selected' : ''}>List Records</option>
              <option value="get" ${config.operation === 'get' ? 'selected' : ''}>Get Single Record</option>
              <option value="create" ${config.operation === 'create' ? 'selected' : ''}>Create Record</option>
              <option value="update" ${config.operation === 'update' ? 'selected' : ''}>Update Record</option>
              <option value="delete" ${config.operation === 'delete' ? 'selected' : ''}>Delete Record</option>
            </select>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Limit</label>
              <input type="number" id="entityLimit" value="${config.limit || 25}"
                     onchange="apiDesigner.updateHandlerConfig('limit', parseInt(this.value))">
            </div>
            <div class="form-group">
              <label>Offset</label>
              <input type="number" id="entityOffset" value="${config.offset || 0}"
                     onchange="apiDesigner.updateHandlerConfig('offset', parseInt(this.value))">
            </div>
          </div>
        `;

      default:
        return '<p>Select a handler type above to configure it.</p>';
    }
  }

  /**
   * Render Schema tab
   */
  renderSchemaTab() {
    return `
      <div class="form-section">
        <div class="form-section-header">
          <i class="fas fa-file-code icon"></i>
          <h3>Request Schema (JSON Schema)</h3>
        </div>
        <p style="color: var(--text-secondary); margin-bottom: 1rem;">
          Define validation rules for incoming requests. Leave empty to skip validation.
        </p>
        <div class="code-editor-container">
          <div id="requestSchemaEditor" style="height: 100%;"></div>
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-header">
          <i class="fas fa-file-code icon"></i>
          <h3>Response Schema (JSON Schema)</h3>
        </div>
        <p style="color: var(--text-secondary); margin-bottom: 1rem;">
          Define the structure of API responses for documentation purposes.
        </p>
        <div class="code-editor-container">
          <div id="responseSchemaEditor" style="height: 100%;"></div>
        </div>
      </div>
    `;
  }

  /**
   * Render Auth tab
   */
  renderAuthTab() {
    const auth = this.api.authentication || { required: true, permissions: [] };

    return `
      <div class="form-section">
        <div class="form-section-header">
          <i class="fas fa-shield-alt icon"></i>
          <h3>Authentication</h3>
        </div>

        <div class="form-group">
          <label style="display: flex; align-items: center; gap: 0.5rem;">
            <input type="checkbox" id="authRequired" ${auth.required ? 'checked' : ''}
                   onchange="apiDesigner.updateAuth('required', this.checked)" style="width: auto;">
            Require authentication (CA Token)
          </label>
          <small>If enabled, users must provide a valid CA token to access this endpoint</small>
        </div>

        <div class="form-group">
          <label>Required Permissions</label>
          <input type="text" id="authPermissions" value="${(auth.permissions || []).join(', ')}"
                 placeholder="read, write, admin"
                 onchange="apiDesigner.updateAuthPermissions(this.value)">
          <small>Comma-separated list of required permissions</small>
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-header">
          <i class="fas fa-tachometer-alt icon"></i>
          <h3>Rate Limiting</h3>
        </div>

        <div class="form-group">
          <label style="display: flex; align-items: center; gap: 0.5rem;">
            <input type="checkbox" id="rateLimitEnabled" ${this.api.rateLimit?.enabled ? 'checked' : ''}
                   onchange="apiDesigner.updateRateLimit('enabled', this.checked)" style="width: auto;">
            Enable rate limiting
          </label>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Max Requests</label>
            <input type="number" id="rateLimitMax" value="${this.api.rateLimit?.maxRequests || 100}"
                   onchange="apiDesigner.updateRateLimit('maxRequests', parseInt(this.value))">
          </div>
          <div class="form-group">
            <label>Window (ms)</label>
            <input type="number" id="rateLimitWindow" value="${this.api.rateLimit?.windowMs || 60000}"
                   onchange="apiDesigner.updateRateLimit('windowMs', parseInt(this.value))">
            <small>${Math.round((this.api.rateLimit?.windowMs || 60000) / 1000)} seconds</small>
          </div>
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-header">
          <i class="fas fa-globe icon"></i>
          <h3>CORS (Cross-Origin Resource Sharing)</h3>
        </div>

        <div class="form-group">
          <label style="display: flex; align-items: center; gap: 0.5rem;">
            <input type="checkbox" id="corsEnabled" ${this.api.cors?.enabled ? 'checked' : ''}
                   onchange="apiDesigner.updateCORS('enabled', this.checked)" style="width: auto;">
            Enable CORS
          </label>
        </div>

        <div class="form-group">
          <label>Allowed Origins</label>
          <input type="text" id="corsOrigins" value="${(this.api.cors?.allowedOrigins || ['*']).join(', ')}"
                 placeholder="*, https://example.com"
                 onchange="apiDesigner.updateCORSOrigins(this.value)">
          <small>Comma-separated origins. Use * to allow all</small>
        </div>

        <div class="form-group">
          <label>Allowed Methods</label>
          <input type="text" id="corsMethods" value="${(this.api.cors?.allowedMethods || []).join(', ')}"
                 placeholder="GET, POST, PUT, DELETE"
                 onchange="apiDesigner.updateCORSMethods(this.value)">
        </div>
      </div>
    `;
  }

  /**
   * Render Advanced tab
   */
  renderAdvancedTab() {
    return `
      <div class="form-section">
        <div class="form-section-header">
          <i class="fas fa-database icon"></i>
          <h3>Caching</h3>
        </div>

        <div class="form-group">
          <label style="display: flex; align-items: center; gap: 0.5rem;">
            <input type="checkbox" id="cacheEnabled" ${this.api.cache?.enabled ? 'checked' : ''}
                   onchange="apiDesigner.updateCache('enabled', this.checked)" style="width: auto;">
            Enable response caching
          </label>
          <small>Cache responses to improve performance (GET requests only)</small>
        </div>

        <div class="form-group">
          <label>Cache TTL (seconds)</label>
          <input type="number" id="cacheTtl" value="${this.api.cache?.ttl || 300}"
                 onchange="apiDesigner.updateCache('ttl', parseInt(this.value))">
          <small>How long to cache responses (${this.api.cache?.ttl || 300} seconds = ${Math.round((this.api.cache?.ttl || 300) / 60)} minutes)</small>
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-header">
          <i class="fas fa-info-circle icon"></i>
          <h3>Metadata</h3>
        </div>

        <div class="form-group">
          <label>Additional Metadata (JSON)</label>
          <textarea id="metadata" rows="10"
                    style="font-family: monospace;"
                    onchange="apiDesigner.updateMetadata(this.value)">${JSON.stringify(this.api.metadata || {}, null, 2)}</textarea>
          <small>Store additional configuration or notes</small>
        </div>
      </div>
    `;
  }

  /**
   * Render Test tab
   */
  renderTestTab() {
    return `
      <div class="form-section">
        <div class="form-section-header">
          <i class="fas fa-flask icon"></i>
          <h3>Test API Endpoint</h3>
        </div>

        <div class="form-group">
          <label>Request Body (JSON)</label>
          <textarea id="testBody" rows="10"
                    style="font-family: monospace;"
                    placeholder='{ "name": "John Doe" }'>{}</textarea>
        </div>

        <div class="form-group">
          <label>Query Parameters (JSON)</label>
          <textarea id="testQuery" rows="4"
                    style="font-family: monospace;"
                    placeholder='{ "page": 1, "limit": 10 }'>{}</textarea>
        </div>

        <div class="form-group">
          <label>Headers (JSON)</label>
          <textarea id="testHeaders" rows="4"
                    style="font-family: monospace;"
                    placeholder='{ "Authorization": "Bearer token" }'>{}</textarea>
        </div>

        <div class="form-group">
          <button class="btn btn-success btn-lg" onclick="apiDesigner.runTest()">
            <i class="fas fa-play"></i> Run Test
          </button>
        </div>
      </div>

      <div id="testResultsContainer"></div>
    `;
  }

  /**
   * Setup schema editors
   */
  setupSchemaEditors() {
    setTimeout(() => {
      // Request schema editor
      const requestEditor = monaco.editor.create(document.getElementById('requestSchemaEditor'), {
        value: JSON.stringify(this.api.requestSchema || {}, null, 2),
        language: 'json',
        theme: 'vs-dark',
        minimap: { enabled: false },
        automaticLayout: true
      });

      requestEditor.onDidChangeModelContent(() => {
        try {
          this.api.requestSchema = JSON.parse(requestEditor.getValue());
          this.hasChanges = true;
        } catch (e) {
          // Invalid JSON, ignore
        }
      });

      this.editors.requestSchema = requestEditor;

      // Response schema editor
      const responseEditor = monaco.editor.create(document.getElementById('responseSchemaEditor'), {
        value: JSON.stringify(this.api.responseSchema || {}, null, 2),
        language: 'json',
        theme: 'vs-dark',
        minimap: { enabled: false },
        automaticLayout: true
      });

      responseEditor.onDidChangeModelContent(() => {
        try {
          this.api.responseSchema = JSON.parse(responseEditor.getValue());
          this.hasChanges = true;
        } catch (e) {
          // Invalid JSON, ignore
        }
      });

      this.editors.responseSchema = responseEditor;
    }, 100);
  }

  /**
   * Setup handler-specific listeners
   */
  setupHandlerListeners() {
    // Handler-specific setup is done in renderHandlerConfig
  }

  /**
   * Select handler type
   */
  selectHandler(handlerType) {
    this.api.handlerType = handlerType;
    this.hasChanges = true;

    // Re-render handler tab
    this.showTab('handler');
  }

  /**
   * Update basic field
   */
  updateField(field, value) {
    this.api[field] = value;
    this.hasChanges = true;

    // Update UI elements
    if (field === 'displayName') {
      document.getElementById('apiTitle').textContent = value || 'New API Endpoint';
    }

    if (field === 'enabled') {
      const badge = document.getElementById('statusBadge');
      badge.className = `status-badge ${value ? 'active' : 'inactive'}`;
      badge.textContent = value ? 'Active' : 'Inactive';
    }
  }

  /**
   * Update tags
   */
  updateTags(tagsString) {
    this.api.tags = tagsString.split(',').map(t => t.trim()).filter(t => t);
    this.hasChanges = true;
  }

  /**
   * Update handler config field
   */
  updateHandlerConfig(field, value) {
    if (!this.api.handlerConfig) {
      this.api.handlerConfig = {};
    }
    this.api.handlerConfig[field] = value;
    this.hasChanges = true;
  }

  /**
   * Update handler config from JSON string
   */
  updateHandlerConfigJSON(field, jsonString) {
    try {
      const value = JSON.parse(jsonString);
      this.updateHandlerConfig(field, value);
    } catch (e) {
      console.error('Invalid JSON:', e);
    }
  }

  /**
   * Update authentication
   */
  updateAuth(field, value) {
    if (!this.api.authentication) {
      this.api.authentication = { required: true, permissions: [] };
    }
    this.api.authentication[field] = value;
    this.hasChanges = true;
  }

  /**
   * Update auth permissions
   */
  updateAuthPermissions(permissionsString) {
    if (!this.api.authentication) {
      this.api.authentication = { required: true, permissions: [] };
    }
    this.api.authentication.permissions = permissionsString.split(',').map(p => p.trim()).filter(p => p);
    this.hasChanges = true;
  }

  /**
   * Update rate limit
   */
  updateRateLimit(field, value) {
    if (!this.api.rateLimit) {
      this.api.rateLimit = { enabled: true, maxRequests: 100, windowMs: 60000 };
    }
    this.api.rateLimit[field] = value;
    this.hasChanges = true;
  }

  /**
   * Update CORS
   */
  updateCORS(field, value) {
    if (!this.api.cors) {
      this.api.cors = { enabled: true, allowedOrigins: ['*'], allowedMethods: [] };
    }
    this.api.cors[field] = value;
    this.hasChanges = true;
  }

  /**
   * Update CORS origins
   */
  updateCORSOrigins(originsString) {
    if (!this.api.cors) {
      this.api.cors = { enabled: true, allowedOrigins: ['*'], allowedMethods: [] };
    }
    this.api.cors.allowedOrigins = originsString.split(',').map(o => o.trim()).filter(o => o);
    this.hasChanges = true;
  }

  /**
   * Update CORS methods
   */
  updateCORSMethods(methodsString) {
    if (!this.api.cors) {
      this.api.cors = { enabled: true, allowedOrigins: ['*'], allowedMethods: [] };
    }
    this.api.cors.allowedMethods = methodsString.split(',').map(m => m.trim()).filter(m => m);
    this.hasChanges = true;
  }

  /**
   * Update cache
   */
  updateCache(field, value) {
    if (!this.api.cache) {
      this.api.cache = { enabled: false, ttl: 300 };
    }
    this.api.cache[field] = value;
    this.hasChanges = true;
  }

  /**
   * Update metadata
   */
  updateMetadata(jsonString) {
    try {
      this.api.metadata = JSON.parse(jsonString);
      this.hasChanges = true;
    } catch (e) {
      console.error('Invalid JSON:', e);
      alert('Invalid JSON in metadata');
    }
  }

  /**
   * Run test
   */
  async runTest() {
    try {
      const body = JSON.parse(document.getElementById('testBody').value || '{}');
      const query = JSON.parse(document.getElementById('testQuery').value || '{}');
      const headers = JSON.parse(document.getElementById('testHeaders').value || '{}');

      const response = await fetch(`/lowcode/api/apis/${this.api.id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: this.api.method,
          body,
          queryParams: query,
          headers
        })
      });

      const result = await response.json();

      const container = document.getElementById('testResultsContainer');
      container.innerHTML = `
        <div class="test-results ${result.success ? 'success' : 'error'}">
          <h4>${result.success ? '✅ Test Successful' : '❌ Test Failed'}</h4>
          <div style="margin-top: 1rem;">
            <strong>Status Code:</strong> ${result.statusCode}<br>
            <strong>Response Time:</strong> ${result.responseTime}ms<br>
            <strong>Execution ID:</strong> ${result.executionId || 'N/A'}
          </div>
          <div style="margin-top: 1rem;">
            <strong>Response:</strong>
            <pre style="background: var(--bg-secondary); padding: 1rem; border-radius: 4px; overflow-x: auto;">${JSON.stringify(result.response, null, 2)}</pre>
          </div>
        </div>
      `;
    } catch (error) {
      alert('Error running test: ' + error.message);
    }
  }

  /**
   * Save API
   */
  async saveAPI() {
    try {
      // Validate required fields
      if (!this.api.displayName) {
        alert('Please enter a display name');
        this.showTab('basic');
        return;
      }

      if (!this.api.path) {
        alert('Please enter a path');
        this.showTab('basic');
        return;
      }

      if (!this.api.applicationId && this.applicationId) {
        this.api.applicationId = this.applicationId;
      }

      if (!this.api.applicationId) {
        alert('Application ID is required');
        return;
      }

      const url = this.api.id
        ? `/lowcode/api/apis/${this.api.id}`
        : '/lowcode/api/apis';

      const method = this.api.id ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.api)
      });

      const result = await response.json();

      if (result.success) {
        this.hasChanges = false;
        alert('API endpoint saved successfully!');

        // Redirect to API list or stay in designer
        if (confirm('Go to API list?')) {
          window.location.href = `/lowcode/apis?appId=${this.applicationId}`;
        } else {
          // Update with returned data
          this.api = result.data;
          window.location.href = `/lowcode/apis/${result.data.id}/designer`;
        }
      } else {
        alert('Error saving API: ' + result.message);
      }
    } catch (error) {
      alert('Error saving API: ' + error.message);
    }
  }

  /**
   * Helper methods
   */
  showExpressionHelp() {
    alert('JSONLex Expression Help:\n\n' +
          '$.request.body - Request body data\n' +
          '$.request.query - Query parameters\n' +
          '$.request.params - URL parameters\n' +
          '$.user - Current user object\n' +
          '$.timestamp - Current timestamp\n' +
          '$.env - Environment (development/production)');
  }

  selectWorkflow() {
    alert('Workflow browser not yet implemented. Please enter workflow ID manually.');
  }

  selectEntity() {
    alert('Entity browser not yet implemented. Please enter entity ID manually.');
  }
}

// Global functions for onclick handlers
function showTab(tab) {
  window.apiDesigner.showTab(tab);
}

function testEndpoint() {
  window.apiDesigner.showTab('test');
}

function saveAPI() {
  window.apiDesigner.saveAPI();
}
