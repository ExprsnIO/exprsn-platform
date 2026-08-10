/**
 * ═══════════════════════════════════════════════════════════
 * Form Designer - Event Handler Module
 * Visual event editor and runtime event execution
 * ═══════════════════════════════════════════════════════════
 */

(function() {
  'use strict';

  class EventHandlerManager {
    constructor(formDesigner) {
      this.formDesigner = formDesigner;
      this.appId = formDesigner.state.appId;
      this.eventHandlers = {};
      this.availableWorkflows = [];
      this.customFunctions = {};

      this.init();
    }

    async init() {
      console.log('[EventHandler] Initializing event handler manager...');

      // Load available workflows for this application
      await this.loadWorkflows();

      // Load existing event handlers from form
      if (this.formDesigner.state.form?.formDefinition?.eventHandlers) {
        this.eventHandlers = this.formDesigner.state.form.formDefinition.eventHandlers;
      }

      console.log('[EventHandler] Loaded', Object.keys(this.eventHandlers).length, 'event handlers');
    }

    // ───────────────────────────────────────────────────────────
    // Event Handler Configuration
    // ───────────────────────────────────────────────────────────

    addEventHandler(componentId, eventName, config) {
      const handlerId = this.generateHandlerId();
      const handler = {
        id: handlerId,
        componentId,
        eventName, // onClick, onChange, onFocus, onBlur, onSubmit, etc.
        type: config.type, // 'function', 'navigate', 'data', 'workflow', 'show-hide', 'validation', 'api'
        config: config,
        enabled: true
      };

      // Configure based on type
      switch (config.type) {
        case 'function':
          handler.functionName = config.functionName;
          handler.parameters = config.parameters || [];
          break;

        case 'navigate':
          handler.navigationType = config.navigationType; // 'form', 'page', 'url', 'back'
          handler.target = config.target;
          handler.newWindow = config.newWindow || false;
          break;

        case 'data':
          handler.operation = config.operation; // 'save', 'load', 'delete', 'refresh'
          handler.dataSourceId = config.dataSourceId;
          handler.confirmMessage = config.confirmMessage;
          break;

        case 'workflow':
          handler.workflowId = config.workflowId;
          handler.workflowInputs = config.workflowInputs || {};
          handler.async = config.async || false;
          break;

        case 'show-hide':
          handler.targetComponents = config.targetComponents || [];
          handler.action = config.action; // 'show', 'hide', 'toggle'
          handler.condition = config.condition; // Optional JavaScript expression
          break;

        case 'validation':
          handler.validationType = config.validationType; // 'required', 'regex', 'custom', 'range'
          handler.validationRule = config.validationRule;
          handler.errorMessage = config.errorMessage;
          break;

        case 'api':
          handler.method = config.method || 'POST';
          handler.url = config.url;
          handler.headers = config.headers || {};
          handler.body = config.body;
          handler.onSuccess = config.onSuccess;
          handler.onError = config.onError;
          break;
      }

      // Store handler
      if (!this.eventHandlers[componentId]) {
        this.eventHandlers[componentId] = {};
      }
      if (!this.eventHandlers[componentId][eventName]) {
        this.eventHandlers[componentId][eventName] = [];
      }

      this.eventHandlers[componentId][eventName].push(handler);

      console.log('[EventHandler] Event handler added:', handler);
      return handler;
    }

    removeEventHandler(handlerId) {
      for (const componentId in this.eventHandlers) {
        for (const eventName in this.eventHandlers[componentId]) {
          this.eventHandlers[componentId][eventName] =
            this.eventHandlers[componentId][eventName].filter(h => h.id !== handlerId);
        }
      }
      console.log('[EventHandler] Event handler removed:', handlerId);
    }

    updateEventHandler(handlerId, updates) {
      for (const componentId in this.eventHandlers) {
        for (const eventName in this.eventHandlers[componentId]) {
          const handler = this.eventHandlers[componentId][eventName].find(h => h.id === handlerId);
          if (handler) {
            Object.assign(handler, updates);
            console.log('[EventHandler] Event handler updated:', handlerId);
            return handler;
          }
        }
      }
    }

    getEventHandlers(componentId, eventName = null) {
      if (!this.eventHandlers[componentId]) {
        return eventName ? [] : {};
      }

      if (eventName) {
        return this.eventHandlers[componentId][eventName] || [];
      }

      return this.eventHandlers[componentId];
    }

    // ───────────────────────────────────────────────────────────
    // Workflow Integration
    // ───────────────────────────────────────────────────────────

    async loadWorkflows() {
      try {
        const response = await fetch(`/lowcode/api/workflows?applicationId=${this.appId}`);
        const result = await response.json();

        if (result.success) {
          this.availableWorkflows = result.data.workflows || [];
          console.log('[EventHandler] Workflows loaded:', this.availableWorkflows.length);
        }
      } catch (error) {
        console.error('[EventHandler] Failed to load workflows:', error);
      }
    }

    async triggerWorkflow(workflowId, inputs) {
      try {
        const response = await fetch(`/workflow/api/workflows/${workflowId}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inputs })
        });

        const result = await response.json();

        if (result.success) {
          console.log('[EventHandler] Workflow executed:', result.data);
          return result.data;
        } else {
          throw new Error(result.message);
        }
      } catch (error) {
        console.error('[EventHandler] Failed to trigger workflow:', error);
        throw error;
      }
    }

    // ───────────────────────────────────────────────────────────
    // Event Execution (Runtime)
    // ───────────────────────────────────────────────────────────

    async executeEvent(componentId, eventName, event, context = {}) {
      const handlers = this.getEventHandlers(componentId, eventName);

      if (handlers.length === 0) {
        console.log('[EventHandler] No handlers for event:', componentId, eventName);
        return;
      }

      console.log('[EventHandler] Executing', handlers.length, 'handler(s) for:', eventName);

      for (const handler of handlers) {
        if (!handler.enabled) continue;

        try {
          await this.executeHandler(handler, event, context);
        } catch (error) {
          console.error('[EventHandler] Handler execution failed:', handler.id, error);

          // Show error to user
          this.showNotification('Event handler error: ' + error.message, 'error');
        }
      }
    }

    async executeHandler(handler, event, context) {
      console.log('[EventHandler] Executing handler:', handler.type);

      switch (handler.type) {
        case 'function':
          return this.executeFunctionHandler(handler, event, context);

        case 'navigate':
          return this.executeNavigateHandler(handler, event, context);

        case 'data':
          return this.executeDataHandler(handler, event, context);

        case 'workflow':
          return this.executeWorkflowHandler(handler, event, context);

        case 'show-hide':
          return this.executeShowHideHandler(handler, event, context);

        case 'validation':
          return this.executeValidationHandler(handler, event, context);

        case 'api':
          return this.executeApiHandler(handler, event, context);

        default:
          console.warn('[EventHandler] Unknown handler type:', handler.type);
      }
    }

    executeFunctionHandler(handler, event, context) {
      const func = this.customFunctions[handler.functionName];

      if (!func) {
        // Try to get from window scope
        if (typeof window[handler.functionName] === 'function') {
          return window[handler.functionName](event, context, ...handler.parameters);
        }

        throw new Error(`Function not found: ${handler.functionName}`);
      }

      return func(event, context, ...handler.parameters);
    }

    executeNavigateHandler(handler, event, context) {
      console.log('[EventHandler] Navigating:', handler.navigationType, handler.target);

      switch (handler.navigationType) {
        case 'form':
          window.location.href = `/lowcode/forms/${handler.target}`;
          break;

        case 'page':
          window.location.href = handler.target;
          break;

        case 'url':
          if (handler.newWindow) {
            window.open(handler.target, '_blank');
          } else {
            window.location.href = handler.target;
          }
          break;

        case 'back':
          window.history.back();
          break;

        default:
          console.warn('[EventHandler] Unknown navigation type:', handler.navigationType);
      }
    }

    async executeDataHandler(handler, event, context) {
      if (!this.formDesigner.dataBinding) {
        throw new Error('Data binding not available');
      }

      const dataSource = this.formDesigner.dataBinding.getDataSource(handler.dataSourceId);
      if (!dataSource) {
        throw new Error(`Data source not found: ${handler.dataSourceId}`);
      }

      // Confirm if message is provided
      if (handler.confirmMessage) {
        if (!confirm(handler.confirmMessage)) {
          console.log('[EventHandler] Data operation cancelled by user');
          return;
        }
      }

      console.log('[EventHandler] Executing data operation:', handler.operation);

      switch (handler.operation) {
        case 'save':
          const recordData = this.collectFormData();
          await this.formDesigner.dataBinding.saveRecord(
            handler.dataSourceId,
            recordData,
            context.recordId
          );
          this.showNotification('Record saved successfully', 'success');
          break;

        case 'load':
          const data = await this.formDesigner.dataBinding.loadData(
            handler.dataSourceId,
            context.params || {}
          );
          this.populateFormData(data);
          break;

        case 'delete':
          if (context.recordId) {
            await this.formDesigner.dataBinding.deleteRecord(
              handler.dataSourceId,
              context.recordId
            );
            this.showNotification('Record deleted successfully', 'success');
          }
          break;

        case 'refresh':
          const refreshedData = await this.formDesigner.dataBinding.loadData(
            handler.dataSourceId,
            context.params || {}
          );
          this.populateFormData(refreshedData);
          this.showNotification('Data refreshed', 'info');
          break;

        default:
          throw new Error(`Unknown data operation: ${handler.operation}`);
      }
    }

    async executeWorkflowHandler(handler, event, context) {
      console.log('[EventHandler] Triggering workflow:', handler.workflowId);

      // Prepare workflow inputs
      const inputs = {};
      for (const key in handler.workflowInputs) {
        const value = handler.workflowInputs[key];

        // Check if it's a reference to form data
        if (typeof value === 'string' && value.startsWith('$form.')) {
          const fieldName = value.substring(6);
          inputs[key] = this.getFormFieldValue(fieldName);
        } else {
          inputs[key] = value;
        }
      }

      if (handler.async) {
        // Fire and forget
        this.triggerWorkflow(handler.workflowId, inputs).catch(err => {
          console.error('[EventHandler] Async workflow error:', err);
        });
        this.showNotification('Workflow started', 'info');
      } else {
        // Wait for completion
        const result = await this.triggerWorkflow(handler.workflowId, inputs);
        this.showNotification('Workflow completed', 'success');
        return result;
      }
    }

    executeShowHideHandler(handler, event, context) {
      console.log('[EventHandler] Show/hide:', handler.action, handler.targetComponents);

      // Evaluate condition if provided
      if (handler.condition) {
        try {
          const conditionFunc = new Function('event', 'context', `return ${handler.condition}`);
          if (!conditionFunc(event, context)) {
            console.log('[EventHandler] Condition not met, skipping show/hide');
            return;
          }
        } catch (error) {
          console.error('[EventHandler] Condition evaluation failed:', error);
          return;
        }
      }

      // Apply show/hide to target components
      for (const targetId of handler.targetComponents) {
        const element = document.querySelector(`[data-component-id="${targetId}"]`);
        if (!element) continue;

        switch (handler.action) {
          case 'show':
            element.style.display = '';
            break;
          case 'hide':
            element.style.display = 'none';
            break;
          case 'toggle':
            element.style.display = element.style.display === 'none' ? '' : 'none';
            break;
        }
      }
    }

    async executeValidationHandler(handler, event, context) {
      console.log('[EventHandler] Validating:', handler.validationType);

      const element = event.target;
      const value = element.value;
      let isValid = true;

      switch (handler.validationType) {
        case 'required':
          isValid = value && value.trim().length > 0;
          break;

        case 'regex':
          const regex = new RegExp(handler.validationRule);
          isValid = regex.test(value);
          break;

        case 'range':
          const num = parseFloat(value);
          const [min, max] = handler.validationRule.split(',').map(v => parseFloat(v));
          isValid = num >= min && num <= max;
          break;

        case 'custom':
          const validationFunc = new Function('value', 'element', handler.validationRule);
          isValid = validationFunc(value, element);
          break;
      }

      if (!isValid) {
        // Show error
        element.classList.add('is-invalid');

        let errorElement = element.parentElement.querySelector('.invalid-feedback');
        if (!errorElement) {
          errorElement = document.createElement('div');
          errorElement.className = 'invalid-feedback';
          element.parentElement.appendChild(errorElement);
        }
        errorElement.textContent = handler.errorMessage || 'Validation failed';
        errorElement.style.display = 'block';

        throw new Error(handler.errorMessage || 'Validation failed');
      } else {
        // Clear error
        element.classList.remove('is-invalid');
        const errorElement = element.parentElement.querySelector('.invalid-feedback');
        if (errorElement) {
          errorElement.style.display = 'none';
        }
      }
    }

    async executeApiHandler(handler, event, context) {
      console.log('[EventHandler] Calling API:', handler.method, handler.url);

      try {
        const options = {
          method: handler.method,
          headers: {
            'Content-Type': 'application/json',
            ...handler.headers
          }
        };

        if (handler.method !== 'GET' && handler.body) {
          // Parse body and replace form field references
          let body = handler.body;
          if (typeof body === 'string') {
            body = body.replace(/\$form\.(\w+)/g, (match, fieldName) => {
              return JSON.stringify(this.getFormFieldValue(fieldName));
            });
          }
          options.body = typeof body === 'string' ? body : JSON.stringify(body);
        }

        const response = await fetch(handler.url, options);
        const data = await response.json();

        if (response.ok) {
          console.log('[EventHandler] API call successful:', data);

          // Execute success handler if provided
          if (handler.onSuccess) {
            const successFunc = new Function('data', 'response', handler.onSuccess);
            successFunc(data, response);
          }

          this.showNotification('API call successful', 'success');
          return data;
        } else {
          throw new Error(data.message || 'API call failed');
        }
      } catch (error) {
        console.error('[EventHandler] API call failed:', error);

        // Execute error handler if provided
        if (handler.onError) {
          const errorFunc = new Function('error', handler.onError);
          errorFunc(error);
        }

        this.showNotification('API call failed: ' + error.message, 'error');
        throw error;
      }
    }

    // ───────────────────────────────────────────────────────────
    // UI Helpers
    // ───────────────────────────────────────────────────────────

    renderEventHandlerModal(componentId, eventName) {
      const existingHandlers = this.getEventHandlers(componentId, eventName);

      return `
        <div class="modal" id="eventHandlerModal">
          <div class="modal-content" style="max-width: 800px;">
            <h3>Configure ${eventName} Event</h3>

            <div class="existing-handlers" style="margin-bottom: 1.5rem;">
              <h4 style="font-size: 1rem; margin-bottom: 0.5rem;">Existing Handlers</h4>
              ${existingHandlers.length > 0 ? `
                <ul class="list-group" style="margin-bottom: 1rem;">
                  ${existingHandlers.map(handler => `
                    <li class="list-group-item d-flex justify-content-between align-items-center">
                      <span>${handler.type}: ${this.getHandlerDescription(handler)}</span>
                      <button class="btn btn-sm btn-danger" onclick="removeHandler('${handler.id}')">
                        <i class="fas fa-trash"></i>
                      </button>
                    </li>
                  `).join('')}
                </ul>
              ` : '<p style="color: var(--text-secondary); font-size: 0.875rem;">No handlers configured</p>'}
            </div>

            <div class="form-group">
              <label>Handler Type</label>
              <select class="form-control" id="handlerType">
                <option value="">Select type...</option>
                <option value="function">Custom Function</option>
                <option value="navigate">Navigate</option>
                <option value="data">Data Operation</option>
                <option value="workflow">Run Workflow</option>
                <option value="show-hide">Show/Hide Components</option>
                <option value="validation">Validate Input</option>
                <option value="api">API Call</option>
              </select>
            </div>

            <div id="handlerConfig"></div>

            <div class="modal-actions" style="margin-top: 1.5rem; display: flex; gap: 0.5rem; justify-content: flex-end;">
              <button class="btn btn-secondary" id="cancelEventHandler">Cancel</button>
              <button class="btn btn-primary" id="saveEventHandler">Add Handler</button>
            </div>
          </div>
        </div>
      `;
    }

    getHandlerDescription(handler) {
      switch (handler.type) {
        case 'function':
          return handler.functionName;
        case 'navigate':
          return `${handler.navigationType} → ${handler.target}`;
        case 'data':
          return `${handler.operation} data`;
        case 'workflow':
          return `Workflow ${handler.workflowId}`;
        case 'show-hide':
          return `${handler.action} ${handler.targetComponents.length} component(s)`;
        case 'validation':
          return `Validate: ${handler.validationType}`;
        case 'api':
          return `${handler.method} ${handler.url}`;
        default:
          return handler.type;
      }
    }

    // ───────────────────────────────────────────────────────────
    // Form Data Helpers
    // ───────────────────────────────────────────────────────────

    collectFormData() {
      const formData = {};
      const formElements = document.querySelectorAll('.form-canvas input, .form-canvas textarea, .form-canvas select');

      formElements.forEach(element => {
        if (element.name) {
          formData[element.name] = element.value;
        }
      });

      return formData;
    }

    populateFormData(data) {
      if (!data || typeof data !== 'object') return;

      for (const key in data) {
        const element = document.querySelector(`[name="${key}"]`);
        if (element) {
          element.value = data[key];
        }
      }
    }

    getFormFieldValue(fieldName) {
      const element = document.querySelector(`[name="${fieldName}"]`);
      return element ? element.value : null;
    }

    setFormFieldValue(fieldName, value) {
      const element = document.querySelector(`[name="${fieldName}"]`);
      if (element) {
        element.value = value;
      }
    }

    // ───────────────────────────────────────────────────────────
    // Utility Functions
    // ───────────────────────────────────────────────────────────

    generateHandlerId() {
      return 'handler_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    registerCustomFunction(name, func) {
      this.customFunctions[name] = func;
      console.log('[EventHandler] Custom function registered:', name);
    }

    showNotification(message, type = 'info') {
      // Simple alert for now, replace with toast notification
      if (type === 'error') {
        alert('Error: ' + message);
      } else {
        console.log('[Notification]', type, message);
      }
    }

    getFormDefinition() {
      return {
        eventHandlers: this.eventHandlers,
        customFunctions: Object.keys(this.customFunctions)
      };
    }

    loadFormDefinition(definition) {
      if (definition.eventHandlers) {
        this.eventHandlers = definition.eventHandlers;
      }
    }
  }

  // Export to window
  window.EventHandlerManager = EventHandlerManager;

})();
