/**
 * ═══════════════════════════════════════════════════════════
 * Event Handlers Manager - Enhanced Edition
 * Advanced event-driven behaviors with API builder, Socket.io, Webhooks, JSONLex
 * ═══════════════════════════════════════════════════════════
 */

(function() {
  'use strict';

  class EventHandlersManager {
    constructor() {
      this.eventHandlers = [];
      this.init();
    }

    init() {
      this.setupEventListeners();
      this.renderEventHandlersList();
    }

    setupEventListeners() {
      // Add Event Handler button
      document.getElementById('addEventHandlerBtn')?.addEventListener('click', () => {
        this.addEventHandler();
      });

      // Clear button
      document.getElementById('clearEventHandlerBtn')?.addEventListener('click', () => {
        this.clearForm();
      });

      // Refresh objects button
      document.getElementById('refreshObjectsBtn')?.addEventListener('click', () => {
        this.populateObjectSelect();
      });

      // Object selection change - update contextual triggers
      document.getElementById('eventObjectSelect')?.addEventListener('change', (e) => {
        this.updateContextualTriggers(e.target.value);
      });

      // Conditional checkbox
      document.getElementById('eventConditional')?.addEventListener('change', (e) => {
        document.getElementById('eventCondition').disabled = !e.target.checked;
      });

      // Action type change
      document.getElementById('eventActionType')?.addEventListener('change', (e) => {
        this.updateActionOptions(e.target.value);
      });

      // API Call Builder button
      document.getElementById('apiCallBuilderBtn')?.addEventListener('click', () => {
        this.showAPICallBuilder();
      });

      // Socket.io Config button
      document.getElementById('socketConfigBtn')?.addEventListener('click', () => {
        this.showSocketIOConfig();
      });

      // Webhook Config button
      document.getElementById('webhookConfigBtn')?.addEventListener('click', () => {
        this.showWebhookConfig();
      });

      // JSONLex Config button
      document.getElementById('jsonlexConfigBtn')?.addEventListener('click', () => {
        this.showJSONLexConfig();
      });

      // Populate object select when components are available
      this.populateObjectSelect();
    }

    populateObjectSelect() {
      const objectSelect = document.getElementById('eventObjectSelect');
      if (!objectSelect) return;

      // Get components from canvas
      const components = window.FORM_DESIGNER_STATE?.components || [];

      objectSelect.innerHTML = '<option value="">Select an object...</option>';

      components.forEach(comp => {
        const label = comp.props?.label || comp.props?.name || comp.type;
        objectSelect.innerHTML += `<option value="${comp.id}">${label} (${comp.type})</option>`;
      });

      // Add form-level events
      objectSelect.innerHTML += '<option value="_form">Form (onSubmit, onLoad)</option>';

      // Add variable change events
      const variables = Object.keys(window.FORM_DESIGNER_STATE?.variables || {});
      if (variables.length > 0) {
        objectSelect.innerHTML += '<optgroup label="Variables">';
        variables.forEach(varKey => {
          objectSelect.innerHTML += `<option value="_var_${varKey}">Variable: ${varKey}</option>`;
        });
        objectSelect.innerHTML += '</optgroup>';
      }

      console.log('[Event Handlers] Populated object select with', components.length, 'components and', variables.length, 'variables');
    }

    updateContextualTriggers(objectId) {
      const triggerSelect = document.getElementById('eventTriggerSelect');
      if (!triggerSelect) return;

      let triggers = [];

      // Variable change events
      if (objectId.startsWith('_var_')) {
        triggers = [
          { value: 'onVariableChange', label: 'On Variable Change' },
          { value: 'onVariableSet', label: 'On Variable Set' },
          { value: 'onVariableClear', label: 'On Variable Clear' }
        ];
      }
      // Form-level events
      else if (objectId === '_form') {
        triggers = [
          { value: 'onSubmit', label: 'On Submit' },
          { value: 'onLoad', label: 'On Load' },
          { value: 'onBeforeUnload', label: 'On Before Unload' },
          { value: 'onValidate', label: 'On Validate' },
          { value: 'onError', label: 'On Error' }
        ];
      }
      // Component events
      else {
        const components = window.FORM_DESIGNER_STATE?.components || [];
        const comp = components.find(c => c.id === objectId);

        if (comp) {
          // Determine triggers based on component type
          switch (comp.type) {
            case 'text-input':
            case 'textarea':
            case 'email':
            case 'number':
            case 'date':
              triggers = [
                { value: 'onChange', label: 'On Change' },
                { value: 'onFocus', label: 'On Focus' },
                { value: 'onBlur', label: 'On Blur' },
                { value: 'onKeyPress', label: 'On Key Press' },
                { value: 'onKeyUp', label: 'On Key Up' },
                { value: 'onInput', label: 'On Input' }
              ];
              break;

            case 'button':
              triggers = [
                { value: 'onClick', label: 'On Click' },
                { value: 'onDoubleClick', label: 'On Double Click' },
                { value: 'onMouseEnter', label: 'On Mouse Enter' },
                { value: 'onMouseLeave', label: 'On Mouse Leave' }
              ];
              break;

            case 'checkbox':
            case 'radio-group':
              triggers = [
                { value: 'onChange', label: 'On Change' },
                { value: 'onClick', label: 'On Click' }
              ];
              break;

            case 'dropdown':
              triggers = [
                { value: 'onChange', label: 'On Change' },
                { value: 'onFocus', label: 'On Focus' },
                { value: 'onBlur', label: 'On Blur' }
              ];
              break;

            case 'file-upload':
              triggers = [
                { value: 'onChange', label: 'On File Select' },
                { value: 'onDrop', label: 'On File Drop' },
                { value: 'onProgress', label: 'On Upload Progress' },
                { value: 'onComplete', label: 'On Upload Complete' }
              ];
              break;

            default:
              // Default triggers for all components
              triggers = [
                { value: 'onClick', label: 'On Click' },
                { value: 'onChange', label: 'On Change' },
                { value: 'onFocus', label: 'On Focus' },
                { value: 'onBlur', label: 'On Blur' }
              ];
          }
        }
      }

      // Populate trigger dropdown
      triggerSelect.innerHTML = triggers.map(t =>
        `<option value="${t.value}">${t.label}</option>`
      ).join('');

      console.log('[Event Handlers] Updated contextual triggers for', objectId, ':', triggers.length, 'triggers');
    }

    updateActionOptions(actionType) {
      const actionSelect = document.getElementById('eventActionSelect');
      const apiBuilderBtn = document.getElementById('apiCallBuilderBtn');
      const socketConfigBtn = document.getElementById('socketConfigBtn');
      const webhookConfigBtn = document.getElementById('webhookConfigBtn');
      const jsonlexConfigBtn = document.getElementById('jsonlexConfigBtn');

      if (!actionSelect) return;

      // Hide all config buttons
      [apiBuilderBtn, socketConfigBtn, webhookConfigBtn, jsonlexConfigBtn].forEach(btn => {
        if (btn) btn.style.display = 'none';
      });

      actionSelect.innerHTML = '<option value="">Select action...</option>';

      switch (actionType) {
        case 'function':
          // Populate with custom functions
          const functions = window.FORM_DESIGNER_STATE?.customFunctions || {};
          const functionCount = Object.keys(functions).length;

          if (functionCount > 0) {
            Object.keys(functions).forEach(funcName => {
              const func = functions[funcName];
              const params = func.params?.map(p => p.name).join(', ') || '';
              actionSelect.innerHTML += `<option value="${funcName}">${funcName}(${params})</option>`;
            });
            console.log('[Event Handlers] Populated', functionCount, 'custom functions');
          } else {
            actionSelect.innerHTML += `<option value="" disabled>No functions defined - use Code & Functions tab</option>`;
            console.log('[Event Handlers] No custom functions available');
          }
          break;

        case 'navigation':
          actionSelect.innerHTML += `
            <option value="back">Go Back</option>
            <option value="home">Go Home</option>
            <option value="custom-url">Custom URL (external)</option>
            <option value="internal-route">Internal Route</option>
            <option value="reload">Reload Page</option>
          `;
          console.log('[Event Handlers] Populated navigation actions');
          break;

        case 'data':
          actionSelect.innerHTML += `
            <option value="save">Save Form</option>
            <option value="load">Load Data</option>
            <option value="delete">Delete Record</option>
            <option value="refresh">Refresh Data</option>
            <option value="clear">Clear Form</option>
            <option value="reset">Reset to Defaults</option>
          `;
          console.log('[Event Handlers] Populated data actions');
          break;

        case 'workflow':
          // Populate with configured workflows
          const workflows = window.FORM_DESIGNER_STATE?.workflows || {};
          let hasWorkflows = false;

          // Check for workflows in each trigger type
          if (workflows.onSubmit && workflows.onSubmit.enabled) {
            actionSelect.innerHTML += `<option value="onSubmit">On Submit Workflow</option>`;
            hasWorkflows = true;
          }
          if (workflows.onChange && workflows.onChange.enabled) {
            actionSelect.innerHTML += `<option value="onChange">On Change Workflow</option>`;
            hasWorkflows = true;
          }
          if (workflows.onLoad && workflows.onLoad.enabled) {
            actionSelect.innerHTML += `<option value="onLoad">On Load Workflow</option>`;
            hasWorkflows = true;
          }

          if (!hasWorkflows) {
            actionSelect.innerHTML += `<option value="" disabled>No workflows configured - use Workflows tab</option>`;
            console.log('[Event Handlers] No workflows configured');
          } else {
            console.log('[Event Handlers] Populated workflows');
          }
          break;

        case 'api':
          actionSelect.innerHTML += `
            <option value="configured">Custom API Call (click button below)</option>
          `;
          if (apiBuilderBtn) apiBuilderBtn.style.display = 'inline-block';
          console.log('[Event Handlers] API call builder available');
          break;

        case 'socketio':
          actionSelect.innerHTML += `
            <option value="emit">Emit Event</option>
            <option value="broadcast">Broadcast to Room</option>
            <option value="send-user">Send to Specific User</option>
          `;
          if (socketConfigBtn) socketConfigBtn.style.display = 'inline-block';
          console.log('[Event Handlers] Socket.io emitter available');
          break;

        case 'webhook':
          actionSelect.innerHTML += `
            <option value="trigger">Trigger Webhook</option>
            <option value="subscribe">Subscribe to Events</option>
          `;
          if (webhookConfigBtn) webhookConfigBtn.style.display = 'inline-block';
          console.log('[Event Handlers] Webhook configuration available');
          break;

        case 'jsonlex':
          actionSelect.innerHTML += `
            <option value="evaluate">Evaluate Expression</option>
            <option value="transform">Transform Data</option>
            <option value="validate">Validate with Expression</option>
          `;
          if (jsonlexConfigBtn) jsonlexConfigBtn.style.display = 'inline-block';
          console.log('[Event Handlers] JSONLex integration available');
          break;

        case 'ui':
          actionSelect.innerHTML += `
            <option value="show">Show Component</option>
            <option value="hide">Hide Component</option>
            <option value="enable">Enable Component</option>
            <option value="disable">Disable Component</option>
            <option value="focus">Focus Component</option>
            <option value="scroll">Scroll to Component</option>
          `;
          console.log('[Event Handlers] UI manipulation actions');
          break;

        case 'state':
          actionSelect.innerHTML += `
            <option value="pending">Set State: Pending</option>
            <option value="processing">Set State: Processing</option>
            <option value="complete">Set State: Complete</option>
            <option value="error">Set State: Error</option>
            <option value="cancelled">Set State: Cancelled</option>
          `;
          console.log('[Event Handlers] State management actions');
          break;

        default:
          console.log('[Event Handlers] Unknown action type:', actionType);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // API Call Builder
    // ═══════════════════════════════════════════════════════════

    showAPICallBuilder() {
      const modal = document.getElementById('apiCallBuilderModal');
      if (!modal) {
        this.createAPICallBuilderModal();
        return this.showAPICallBuilder();
      }

      // Reset form
      document.getElementById('apiUrl').value = '';
      document.getElementById('apiMethod').value = 'GET';
      document.getElementById('apiAuthType').value = 'none';
      this.clearAPIHeaders();
      document.getElementById('apiBody').value = '';
      document.getElementById('apiTimeout').value = '30000';

      modal.classList.add('active');
    }

    createAPICallBuilderModal() {
      const modal = document.createElement('div');
      modal.id = 'apiCallBuilderModal';
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-content" style="max-width: 800px;">
          <div class="modal-header">
            <h3 class="modal-title">API Call Builder</h3>
            <button class="modal-close" onclick="eventHandlersManager.closeAPICallBuilder()">
              <i class="fas fa-times"></i>
            </button>
          </div>

          <div class="modal-body">
            <!-- URL & Method -->
            <div class="form-row" style="display: grid; grid-template-columns: 1fr 150px; gap: 1rem; margin-bottom: 1rem;">
              <div class="form-group" style="margin: 0;">
                <label class="form-label">URL *</label>
                <input type="text" id="apiUrl" class="property-input" placeholder="https://api.example.com/endpoint">
                <small style="color: var(--text-secondary); font-size: 0.75rem;">
                  Use {{variableName}} for variable interpolation
                </small>
              </div>
              <div class="form-group" style="margin: 0;">
                <label class="form-label">Method</label>
                <select id="apiMethod" class="property-input" onchange="eventHandlersManager.toggleBodySection()">
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="PATCH">PATCH</option>
                  <option value="DELETE">DELETE</option>
                </select>
              </div>
            </div>

            <!-- Authentication -->
            <div class="form-group">
              <label class="form-label">Authentication</label>
              <select id="apiAuthType" class="property-input" onchange="eventHandlersManager.toggleAuthFields()">
                <option value="none">None</option>
                <option value="basic">Basic Auth</option>
                <option value="bearer">Bearer Token</option>
                <option value="api-key">API Key</option>
              </select>
            </div>

            <!-- Auth Fields -->
            <div id="authFieldsBasic" style="display: none; margin-bottom: 1rem;">
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div class="form-group" style="margin: 0;">
                  <label class="form-label">Username</label>
                  <input type="text" id="apiAuthUsername" class="property-input">
                </div>
                <div class="form-group" style="margin: 0;">
                  <label class="form-label">Password</label>
                  <input type="password" id="apiAuthPassword" class="property-input">
                </div>
              </div>
            </div>

            <div id="authFieldsBearer" style="display: none; margin-bottom: 1rem;">
              <div class="form-group" style="margin: 0;">
                <label class="form-label">Token</label>
                <input type="text" id="apiAuthToken" class="property-input" placeholder="Bearer token or {{tokenVariable}}">
              </div>
            </div>

            <div id="authFieldsAPIKey" style="display: none; margin-bottom: 1rem;">
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div class="form-group" style="margin: 0;">
                  <label class="form-label">Header Name</label>
                  <input type="text" id="apiAuthKeyName" class="property-input" placeholder="X-API-Key">
                </div>
                <div class="form-group" style="margin: 0;">
                  <label class="form-label">API Key</label>
                  <input type="text" id="apiAuthKeyValue" class="property-input">
                </div>
              </div>
            </div>

            <!-- Headers -->
            <div class="form-group">
              <label class="form-label" style="display: flex; justify-content: space-between; align-items: center;">
                <span>Headers</span>
                <button type="button" class="btn btn-sm btn-primary" onclick="eventHandlersManager.addAPIHeader()">
                  <i class="fas fa-plus"></i> Add Header
                </button>
              </label>
              <div style="max-height: 150px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 4px;">
                <table class="param-table" style="width: 100%; border-collapse: collapse;">
                  <thead style="position: sticky; top: 0; background: var(--bg-secondary); z-index: 1;">
                    <tr style="border-bottom: 1px solid var(--border-color);">
                      <th style="padding: 0.5rem; text-align: left; font-size: 0.75rem; color: var(--text-secondary);">Header Name</th>
                      <th style="padding: 0.5rem; text-align: left; font-size: 0.75rem; color: var(--text-secondary);">Value</th>
                      <th style="padding: 0.5rem; text-align: center; font-size: 0.75rem; color: var(--text-secondary); width: 50px;"></th>
                    </tr>
                  </thead>
                  <tbody id="apiHeadersTable">
                    <tr>
                      <td colspan="3" style="padding: 1rem; text-align: center; color: var(--text-secondary); font-size: 0.875rem;">
                        No custom headers. Click "+ Add Header" to add one.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Request Body -->
            <div id="apiBodySection" style="display: none;">
              <div class="form-group">
                <label class="form-label">Request Body (JSON)</label>
                <textarea id="apiBody" class="property-input" rows="6" placeholder='{"key": "value", "data": "{{formData}}"}'></textarea>
                <small style="color: var(--text-secondary); font-size: 0.75rem;">
                  Use {{variableName}} for variable interpolation in JSON values
                </small>
              </div>
            </div>

            <!-- Advanced Settings -->
            <div class="form-group">
              <label class="form-label">Timeout (ms)</label>
              <input type="number" id="apiTimeout" class="property-input" value="30000" min="1000" max="120000">
            </div>

            <div class="form-group">
              <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                <input type="checkbox" id="apiRetryEnabled" style="cursor: pointer;">
                <span>Enable Retry on Failure</span>
              </label>
            </div>

            <div id="apiRetryConfig" style="display: none; margin-left: 1.5rem;">
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div class="form-group" style="margin: 0;">
                  <label class="form-label">Max Attempts</label>
                  <input type="number" id="apiRetryAttempts" class="property-input" value="3" min="1" max="10">
                </div>
                <div class="form-group" style="margin: 0;">
                  <label class="form-label">Backoff Strategy</label>
                  <select id="apiRetryBackoff" class="property-input">
                    <option value="linear">Linear</option>
                    <option value="exponential">Exponential</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn btn-secondary" onclick="eventHandlersManager.closeAPICallBuilder()">Cancel</button>
            <button class="btn btn-primary" onclick="eventHandlersManager.saveAPICallConfig()">Save Configuration</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      // Setup retry checkbox toggle
      document.getElementById('apiRetryEnabled').addEventListener('change', (e) => {
        document.getElementById('apiRetryConfig').style.display = e.target.checked ? 'block' : 'none';
      });

      console.log('[Event Handlers] API Call Builder modal created');
    }

    toggleBodySection() {
      const method = document.getElementById('apiMethod').value;
      const bodySection = document.getElementById('apiBodySection');
      if (bodySection) {
        bodySection.style.display = ['POST', 'PUT', 'PATCH'].includes(method) ? 'block' : 'none';
      }
    }

    toggleAuthFields() {
      const authType = document.getElementById('apiAuthType').value;

      document.getElementById('authFieldsBasic').style.display = authType === 'basic' ? 'block' : 'none';
      document.getElementById('authFieldsBearer').style.display = authType === 'bearer' ? 'block' : 'none';
      document.getElementById('authFieldsAPIKey').style.display = authType === 'api-key' ? 'block' : 'none';
    }

    addAPIHeader() {
      const tbody = document.getElementById('apiHeadersTable');

      // Remove empty message if it exists
      const emptyRow = tbody.querySelector('tr td[colspan="3"]');
      if (emptyRow) {
        tbody.innerHTML = '';
      }

      const row = document.createElement('tr');
      row.innerHTML = `
        <td style="padding: 0.5rem;">
          <input type="text" class="property-input header-name" placeholder="Content-Type" style="font-size: 0.875rem; padding: 0.375rem;">
        </td>
        <td style="padding: 0.5rem;">
          <input type="text" class="property-input header-value" placeholder="application/json" style="font-size: 0.875rem; padding: 0.375rem;">
        </td>
        <td style="padding: 0.5rem; text-align: center;">
          <button type="button" class="btn btn-sm btn-danger" onclick="this.closest('tr').remove()" title="Remove header">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      `;
      tbody.appendChild(row);
    }

    clearAPIHeaders() {
      const tbody = document.getElementById('apiHeadersTable');
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="3" style="padding: 1rem; text-align: center; color: var(--text-secondary); font-size: 0.875rem;">
              No custom headers. Click "+ Add Header" to add one.
            </td>
          </tr>
        `;
      }
    }

    saveAPICallConfig() {
      const url = document.getElementById('apiUrl').value.trim();
      if (!url) {
        alert('URL is required');
        return;
      }

      const config = {
        url,
        method: document.getElementById('apiMethod').value,
        auth: this.getAuthConfig(),
        headers: this.getHeaders(),
        timeout: parseInt(document.getElementById('apiTimeout').value),
        retry: this.getRetryConfig()
      };

      // Add body for POST/PUT/PATCH
      if (['POST', 'PUT', 'PATCH'].includes(config.method)) {
        const body = document.getElementById('apiBody').value.trim();
        if (body) {
          try {
            JSON.parse(body.replace(/\{\{[^}]+\}\}/g, '""')); // Validate JSON structure
            config.body = body;
          } catch (e) {
            alert('Invalid JSON in request body');
            return;
          }
        }
      }

      // Store in global state for this event handler
      window.FORM_DESIGNER_STATE.tempAPIConfig = config;

      this.closeAPICallBuilder();
      alert('API call configuration saved! Click "Add Event Handler" to complete.');
    }

    getAuthConfig() {
      const authType = document.getElementById('apiAuthType').value;

      switch (authType) {
        case 'basic':
          return {
            type: 'basic',
            username: document.getElementById('apiAuthUsername').value,
            password: document.getElementById('apiAuthPassword').value
          };
        case 'bearer':
          return {
            type: 'bearer',
            token: document.getElementById('apiAuthToken').value
          };
        case 'api-key':
          return {
            type: 'api-key',
            headerName: document.getElementById('apiAuthKeyName').value,
            key: document.getElementById('apiAuthKeyValue').value
          };
        default:
          return { type: 'none' };
      }
    }

    getHeaders() {
      const rows = document.querySelectorAll('#apiHeadersTable tr');
      const headers = [];

      rows.forEach(row => {
        const nameInput = row.querySelector('.header-name');
        const valueInput = row.querySelector('.header-value');

        if (nameInput && valueInput) {
          const name = nameInput.value.trim();
          const value = valueInput.value.trim();
          if (name && value) {
            headers.push({ name, value });
          }
        }
      });

      return headers;
    }

    getRetryConfig() {
      const enabled = document.getElementById('apiRetryEnabled')?.checked;
      if (!enabled) return null;

      return {
        enabled: true,
        maxAttempts: parseInt(document.getElementById('apiRetryAttempts').value),
        backoff: document.getElementById('apiRetryBackoff').value
      };
    }

    closeAPICallBuilder() {
      document.getElementById('apiCallBuilderModal')?.classList.remove('active');
    }

    // ═══════════════════════════════════════════════════════════
    // Socket.IO Configuration
    // ═══════════════════════════════════════════════════════════

    showSocketIOConfig() {
      const modal = document.getElementById('socketIOConfigModal');
      if (!modal) {
        this.createSocketIOConfigModal();
        return this.showSocketIOConfig();
      }

      // Reset form
      document.getElementById('socketEventName').value = '';
      document.getElementById('socketRoom').value = '';
      document.getElementById('socketUserId').value = '';
      document.getElementById('socketPayload').value = '';
      document.getElementById('socketAck').checked = false;

      modal.classList.add('active');
    }

    createSocketIOConfigModal() {
      const modal = document.createElement('div');
      modal.id = 'socketIOConfigModal';
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
          <div class="modal-header">
            <h3 class="modal-title">Socket.IO Configuration</h3>
            <button class="modal-close" onclick="eventHandlersManager.closeSocketIOConfig()">
              <i class="fas fa-times"></i>
            </button>
          </div>

          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Event Name *</label>
              <input type="text" id="socketEventName" class="property-input" placeholder="user_action">
              <small style="color: var(--text-secondary); font-size: 0.75rem;">
                The Socket.IO event name to emit
              </small>
            </div>

            <div class="form-group">
              <label class="form-label">Room (optional)</label>
              <input type="text" id="socketRoom" class="property-input" placeholder="room_123 or {{roomVariable}}">
              <small style="color: var(--text-secondary); font-size: 0.75rem;">
                Broadcast to all users in this room
              </small>
            </div>

            <div class="form-group">
              <label class="form-label">Target User ID (optional)</label>
              <input type="text" id="socketUserId" class="property-input" placeholder="user_456 or {{userId}}">
              <small style="color: var(--text-secondary); font-size: 0.75rem;">
                Send to a specific user only
              </small>
            </div>

            <div class="form-group">
              <label class="form-label">Payload (JSON)</label>
              <textarea id="socketPayload" class="property-input" rows="8" placeholder='{
  "message": "{{message}}",
  "userId": "{{currentUser}}",
  "timestamp": "{{now}}"
}'></textarea>
              <small style="color: var(--text-secondary); font-size: 0.75rem;">
                Data to send with the event. Use {{variableName}} for interpolation.
              </small>
            </div>

            <div class="form-group">
              <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                <input type="checkbox" id="socketAck" style="cursor: pointer;">
                <span>Require Acknowledgement</span>
              </label>
              <small style="color: var(--text-secondary); font-size: 0.75rem; margin-left: 1.5rem;">
                Wait for server confirmation before continuing
              </small>
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn btn-secondary" onclick="eventHandlersManager.closeSocketIOConfig()">Cancel</button>
            <button class="btn btn-primary" onclick="eventHandlersManager.saveSocketIOConfig()">Save Configuration</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
    }

    saveSocketIOConfig() {
      const eventName = document.getElementById('socketEventName').value.trim();
      if (!eventName) {
        alert('Event name is required');
        return;
      }

      const payload = document.getElementById('socketPayload').value.trim();
      if (payload) {
        try {
          JSON.parse(payload.replace(/\{\{[^}]+\}\}/g, '""')); // Validate JSON structure
        } catch (e) {
          alert('Invalid JSON in payload');
          return;
        }
      }

      const config = {
        eventName,
        room: document.getElementById('socketRoom').value.trim() || null,
        userId: document.getElementById('socketUserId').value.trim() || null,
        payload: payload || '{}',
        acknowledgement: document.getElementById('socketAck').checked
      };

      window.FORM_DESIGNER_STATE.tempSocketConfig = config;

      this.closeSocketIOConfig();
      alert('Socket.IO configuration saved! Click "Add Event Handler" to complete.');
    }

    closeSocketIOConfig() {
      document.getElementById('socketIOConfigModal')?.classList.remove('active');
    }

    // ═══════════════════════════════════════════════════════════
    // Webhook Configuration
    // ═══════════════════════════════════════════════════════════

    showWebhookConfig() {
      const modal = document.getElementById('webhookConfigModal');
      if (!modal) {
        this.createWebhookConfigModal();
        return this.showWebhookConfig();
      }

      // Reset form
      document.getElementById('webhookUrl').value = '';
      document.getElementById('webhookMethod').value = 'POST';
      document.getElementById('webhookPayload').value = '';
      document.getElementById('webhookSecret').value = '';
      document.getElementById('webhookRetryEnabled').checked = false;

      modal.classList.add('active');
    }

    createWebhookConfigModal() {
      const modal = document.createElement('div');
      modal.id = 'webhookConfigModal';
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-content" style="max-width: 700px;">
          <div class="modal-header">
            <h3 class="modal-title">Webhook Configuration</h3>
            <button class="modal-close" onclick="eventHandlersManager.closeWebhookConfig()">
              <i class="fas fa-times"></i>
            </button>
          </div>

          <div class="modal-body">
            <div class="form-row" style="display: grid; grid-template-columns: 1fr 120px; gap: 1rem; margin-bottom: 1rem;">
              <div class="form-group" style="margin: 0;">
                <label class="form-label">Webhook URL *</label>
                <input type="text" id="webhookUrl" class="property-input" placeholder="https://webhook.site/unique-id">
              </div>
              <div class="form-group" style="margin: 0;">
                <label class="form-label">Method</label>
                <select id="webhookMethod" class="property-input">
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Payload (JSON)</label>
              <textarea id="webhookPayload" class="property-input" rows="8" placeholder='{
  "event": "form_submitted",
  "formId": "{{formId}}",
  "userId": "{{userId}}",
  "data": {{formData}},
  "timestamp": "{{timestamp}}"
}'></textarea>
              <small style="color: var(--text-secondary); font-size: 0.75rem;">
                Use {{variableName}} for variable interpolation
              </small>
            </div>

            <div class="form-group">
              <label class="form-label">Webhook Secret (optional)</label>
              <input type="password" id="webhookSecret" class="property-input" placeholder="Secret for HMAC signature">
              <small style="color: var(--text-secondary); font-size: 0.75rem;">
                If provided, generates HMAC-SHA256 signature in X-Webhook-Signature header
              </small>
            </div>

            <div class="form-group">
              <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                <input type="checkbox" id="webhookRetryEnabled" style="cursor: pointer;">
                <span>Enable Retry on Failure</span>
              </label>
            </div>

            <div id="webhookRetryConfig" style="display: none; margin-left: 1.5rem;">
              <div class="form-group" style="margin: 0;">
                <label class="form-label">Max Attempts</label>
                <input type="number" id="webhookRetryAttempts" class="property-input" value="3" min="1" max="10">
              </div>
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn btn-secondary" onclick="eventHandlersManager.closeWebhookConfig()">Cancel</button>
            <button class="btn btn-primary" onclick="eventHandlersManager.saveWebhookConfig()">Save Configuration</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      // Setup retry checkbox toggle
      document.getElementById('webhookRetryEnabled').addEventListener('change', (e) => {
        document.getElementById('webhookRetryConfig').style.display = e.target.checked ? 'block' : 'none';
      });
    }

    saveWebhookConfig() {
      const url = document.getElementById('webhookUrl').value.trim();
      if (!url) {
        alert('Webhook URL is required');
        return;
      }

      const payload = document.getElementById('webhookPayload').value.trim();
      if (payload) {
        try {
          JSON.parse(payload.replace(/\{\{[^}]+\}\}/g, '""')); // Validate JSON structure
        } catch (e) {
          alert('Invalid JSON in payload');
          return;
        }
      }

      const config = {
        url,
        method: document.getElementById('webhookMethod').value,
        payload: payload || '{}',
        secret: document.getElementById('webhookSecret').value.trim() || null,
        retry: document.getElementById('webhookRetryEnabled').checked ? {
          enabled: true,
          maxAttempts: parseInt(document.getElementById('webhookRetryAttempts').value)
        } : null
      };

      window.FORM_DESIGNER_STATE.tempWebhookConfig = config;

      this.closeWebhookConfig();
      alert('Webhook configuration saved! Click "Add Event Handler" to complete.');
    }

    closeWebhookConfig() {
      document.getElementById('webhookConfigModal')?.classList.remove('active');
    }

    // ═══════════════════════════════════════════════════════════
    // JSONLex Configuration
    // ═══════════════════════════════════════════════════════════

    showJSONLexConfig() {
      const modal = document.getElementById('jsonlexConfigModal');
      if (!modal) {
        this.createJSONLexConfigModal();
        return this.showJSONLexConfig();
      }

      // Reset form
      document.getElementById('jsonlexExpression').value = '';
      document.getElementById('jsonlexResultVar').value = '';
      document.getElementById('jsonlexServerSide').checked = false;

      // Populate context variables
      this.populateJSONLexContext();

      modal.classList.add('active');
    }

    createJSONLexConfigModal() {
      const modal = document.createElement('div');
      modal.id = 'jsonlexConfigModal';
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-content" style="max-width: 700px;">
          <div class="modal-header">
            <h3 class="modal-title">JSONLex Configuration</h3>
            <button class="modal-close" onclick="eventHandlersManager.closeJSONLexConfig()">
              <i class="fas fa-times"></i>
            </button>
          </div>

          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Expression *</label>
              <textarea id="jsonlexExpression" class="property-input" rows="6" placeholder="$.firstName + ' ' + $.lastName" style="font-family: monospace;"></textarea>
              <small style="color: var(--text-secondary); font-size: 0.75rem;">
                JSONLex expression using $ notation for variables
              </small>
            </div>

            <div class="form-group">
              <label class="form-label">Context Variables</label>
              <div id="jsonlexContextVars" style="max-height: 150px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 4px; padding: 0.5rem;">
                <!-- Will be populated with available variables -->
              </div>
              <small style="color: var(--text-secondary); font-size: 0.75rem;">
                Click to insert variable into expression
              </small>
            </div>

            <div class="form-group">
              <label class="form-label">Result Variable Name</label>
              <input type="text" id="jsonlexResultVar" class="property-input" placeholder="calculatedValue">
              <small style="color: var(--text-secondary); font-size: 0.75rem;">
                Variable name to store the result (optional - will be returned in event)
              </small>
            </div>

            <div class="form-group">
              <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                <input type="checkbox" id="jsonlexServerSide" style="cursor: pointer;">
                <span>Server-Side Evaluation</span>
              </label>
              <small style="color: var(--text-secondary); font-size: 0.75rem; margin-left: 1.5rem;">
                Evaluate on server (exprsn-svr) instead of client browser
              </small>
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn btn-secondary" onclick="eventHandlersManager.closeJSONLexConfig()">Cancel</button>
            <button class="btn btn-primary" onclick="eventHandlersManager.saveJSONLexConfig()">Save Configuration</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
    }

    populateJSONLexContext() {
      const container = document.getElementById('jsonlexContextVars');
      if (!container) return;

      const components = window.FORM_DESIGNER_STATE?.components || [];
      const variables = window.FORM_DESIGNER_STATE?.variables || {};

      let html = '<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem;">';

      // Add form field variables
      components.forEach(comp => {
        const name = comp.props?.name || comp.id;
        const label = comp.props?.label || comp.type;
        html += `
          <button type="button" class="btn btn-sm btn-secondary" onclick="eventHandlersManager.insertJSONLexVar('${name}')" style="font-size: 0.75rem; padding: 0.25rem 0.5rem;">
            $.${name}
            <br><small style="opacity: 0.7;">${label}</small>
          </button>
        `;
      });

      // Add custom variables
      Object.keys(variables).forEach(varKey => {
        html += `
          <button type="button" class="btn btn-sm btn-secondary" onclick="eventHandlersManager.insertJSONLexVar('${varKey}')" style="font-size: 0.75rem; padding: 0.25rem 0.5rem;">
            $.${varKey}
            <br><small style="opacity: 0.7;">${variables[varKey].type}</small>
          </button>
        `;
      });

      html += '</div>';
      container.innerHTML = html;
    }

    insertJSONLexVar(varName) {
      const textarea = document.getElementById('jsonlexExpression');
      const cursorPos = textarea.selectionStart;
      const textBefore = textarea.value.substring(0, cursorPos);
      const textAfter = textarea.value.substring(cursorPos);

      textarea.value = textBefore + '$.'+varName + textAfter;
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = cursorPos + varName.length + 2;
    }

    saveJSONLexConfig() {
      const expression = document.getElementById('jsonlexExpression').value.trim();
      if (!expression) {
        alert('Expression is required');
        return;
      }

      const config = {
        expression,
        resultVariable: document.getElementById('jsonlexResultVar').value.trim() || null,
        serverSide: document.getElementById('jsonlexServerSide').checked,
        serviceEndpoint: '/lowcode/api/jsonlex/evaluate'
      };

      window.FORM_DESIGNER_STATE.tempJSONLexConfig = config;

      this.closeJSONLexConfig();
      alert('JSONLex configuration saved! Click "Add Event Handler" to complete.');
    }

    closeJSONLexConfig() {
      document.getElementById('jsonlexConfigModal')?.classList.remove('active');
    }

    // ═══════════════════════════════════════════════════════════
    // Event Handler Management
    // ═══════════════════════════════════════════════════════════

    addEventHandler() {
      const objectId = document.getElementById('eventObjectSelect')?.value;
      const trigger = document.getElementById('eventTriggerSelect')?.value;
      const actionType = document.getElementById('eventActionType')?.value;
      const action = document.getElementById('eventActionSelect')?.value;
      const conditional = document.getElementById('eventConditional')?.checked;
      const condition = document.getElementById('eventCondition')?.value;

      if (!objectId || !trigger || !actionType || !action) {
        alert('Please fill in all required fields');
        return;
      }

      const handler = {
        id: 'handler_' + Date.now(),
        objectId,
        trigger,
        actionType,
        action,
        conditional,
        condition: conditional ? condition : null
      };

      // Attach configuration based on action type
      if (actionType === 'api' && window.FORM_DESIGNER_STATE.tempAPIConfig) {
        handler.apiConfig = window.FORM_DESIGNER_STATE.tempAPIConfig;
        delete window.FORM_DESIGNER_STATE.tempAPIConfig;
      } else if (actionType === 'socketio' && window.FORM_DESIGNER_STATE.tempSocketConfig) {
        handler.socketConfig = window.FORM_DESIGNER_STATE.tempSocketConfig;
        delete window.FORM_DESIGNER_STATE.tempSocketConfig;
      } else if (actionType === 'webhook' && window.FORM_DESIGNER_STATE.tempWebhookConfig) {
        handler.webhookConfig = window.FORM_DESIGNER_STATE.tempWebhookConfig;
        delete window.FORM_DESIGNER_STATE.tempWebhookConfig;
      } else if (actionType === 'jsonlex' && window.FORM_DESIGNER_STATE.tempJSONLexConfig) {
        handler.jsonlexConfig = window.FORM_DESIGNER_STATE.tempJSONLexConfig;
        delete window.FORM_DESIGNER_STATE.tempJSONLexConfig;
      }

      this.eventHandlers.push(handler);
      window.FORM_DESIGNER_STATE.eventHandlers = this.eventHandlers;
      window.FORM_DESIGNER_STATE.isDirty = true;

      this.renderEventHandlersList();
      this.clearForm();

      console.log('[Event Handlers] Added event handler:', handler);
    }

    clearForm() {
      document.getElementById('eventObjectSelect').value = '';
      document.getElementById('eventTriggerSelect').innerHTML = '<option value="">Select object first...</option>';
      document.getElementById('eventActionType').value = 'function';
      document.getElementById('eventActionSelect').value = '';
      document.getElementById('eventConditional').checked = false;
      document.getElementById('eventCondition').value = '';
      document.getElementById('eventCondition').disabled = true;

      // Hide config buttons
      ['apiCallBuilderBtn', 'socketConfigBtn', 'webhookConfigBtn', 'jsonlexConfigBtn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.style.display = 'none';
      });

      // Update action options to default
      this.updateActionOptions('function');
    }

    renderEventHandlersList() {
      const list = document.getElementById('eventHandlersList');
      if (!list) return;

      if (this.eventHandlers.length === 0) {
        list.innerHTML = `
          <div style="padding: 2rem; text-align: center; color: var(--text-secondary);">
            No event handlers configured yet.
          </div>
        `;
        return;
      }

      list.innerHTML = this.eventHandlers.map(handler => {
        const objectName = this.getObjectName(handler.objectId);
        const configBadge = this.getConfigBadge(handler);

        return `
          <div class="event-handler-item" style="padding: 1rem; border: 1px solid var(--border-color); border-radius: 6px; margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: start;">
            <div class="event-handler-info" style="flex: 1;">
              <div class="event-handler-object" style="font-weight: 600; color: var(--text-primary); margin-bottom: 0.25rem;">
                ${objectName}.${handler.trigger}
              </div>
              <div class="event-handler-details" style="font-size: 0.875rem; color: var(--text-secondary);">
                → ${handler.actionType}: ${handler.action}
                ${configBadge}
                ${handler.conditional ? ` <span style="color: var(--warning-color);">(if ${handler.condition})</span>` : ''}
              </div>
            </div>
            <div style="display: flex; gap: 0.5rem;">
              <button class="btn btn-sm btn-secondary" onclick="eventHandlersManager.editHandler('${handler.id}')" title="Edit">
                <i class="fas fa-edit"></i>
              </button>
              <button class="btn btn-sm btn-danger" onclick="eventHandlersManager.deleteHandler('${handler.id}')" title="Delete">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

    getObjectName(objectId) {
      if (objectId === '_form') return 'Form';
      if (objectId.startsWith('_var_')) return 'Variable: ' + objectId.substring(5);

      const components = window.FORM_DESIGNER_STATE?.components || [];
      const comp = components.find(c => c.id === objectId);
      return comp ? (comp.props?.label || comp.props?.name || comp.type) : objectId;
    }

    getConfigBadge(handler) {
      const badges = [];

      if (handler.apiConfig) {
        badges.push('<span style="background: var(--primary-color); color: white; padding: 0.125rem 0.5rem; border-radius: 12px; font-size: 0.75rem; margin-left: 0.5rem;">API</span>');
      }
      if (handler.socketConfig) {
        badges.push('<span style="background: var(--success-color); color: white; padding: 0.125rem 0.5rem; border-radius: 12px; font-size: 0.75rem; margin-left: 0.5rem;">Socket.IO</span>');
      }
      if (handler.webhookConfig) {
        badges.push('<span style="background: var(--warning-color); color: white; padding: 0.125rem 0.5rem; border-radius: 12px; font-size: 0.75rem; margin-left: 0.5rem;">Webhook</span>');
      }
      if (handler.jsonlexConfig) {
        badges.push('<span style="background: var(--info-color); color: white; padding: 0.125rem 0.5rem; border-radius: 12px; font-size: 0.75rem; margin-left: 0.5rem;">JSONLex</span>');
      }

      return badges.join('');
    }

    editHandler(handlerId) {
      const handler = this.eventHandlers.find(h => h.id === handlerId);
      if (!handler) return;

      // Populate form with handler data
      document.getElementById('eventObjectSelect').value = handler.objectId;
      this.updateContextualTriggers(handler.objectId);
      document.getElementById('eventTriggerSelect').value = handler.trigger;
      document.getElementById('eventActionType').value = handler.actionType;
      this.updateActionOptions(handler.actionType);
      document.getElementById('eventActionSelect').value = handler.action;
      document.getElementById('eventConditional').checked = handler.conditional;
      document.getElementById('eventCondition').value = handler.condition || '';
      document.getElementById('eventCondition').disabled = !handler.conditional;

      // Remove handler temporarily (will be re-added on save)
      this.deleteHandler(handlerId);

      // Store configs if they exist
      if (handler.apiConfig) window.FORM_DESIGNER_STATE.tempAPIConfig = handler.apiConfig;
      if (handler.socketConfig) window.FORM_DESIGNER_STATE.tempSocketConfig = handler.socketConfig;
      if (handler.webhookConfig) window.FORM_DESIGNER_STATE.tempWebhookConfig = handler.webhookConfig;
      if (handler.jsonlexConfig) window.FORM_DESIGNER_STATE.tempJSONLexConfig = handler.jsonlexConfig;
    }

    deleteHandler(handlerId) {
      if (!confirm('Delete this event handler?')) return;

      this.eventHandlers = this.eventHandlers.filter(h => h.id !== handlerId);
      window.FORM_DESIGNER_STATE.eventHandlers = this.eventHandlers;
      window.FORM_DESIGNER_STATE.isDirty = true;
      this.renderEventHandlersList();

      console.log('[Event Handlers] Deleted handler:', handlerId);
    }

    importEventHandlers(handlers) {
      this.eventHandlers = handlers;
      window.FORM_DESIGNER_STATE.eventHandlers = this.eventHandlers;
      this.renderEventHandlersList();
    }
  }

  // Initialize when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    window.eventHandlersManager = new EventHandlersManager();

    // Load existing handlers from state
    if (window.FORM_DESIGNER_STATE.eventHandlers) {
      window.eventHandlersManager.importEventHandlers(window.FORM_DESIGNER_STATE.eventHandlers);
    }
  });

})();
