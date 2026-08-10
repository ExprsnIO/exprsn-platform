/**
 * ═══════════════════════════════════════════════════════════
 * Event Handlers Manager
 * Manages event-driven behaviors for form components
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
      objectSelect.innerHTML += '<option value="_form">Form (onSubmit)</option>';

      console.log('[Event Handlers] Populated object select with', components.length, 'components');
    }

    updateContextualTriggers(objectId) {
      const triggerSelect = document.getElementById('eventTriggerSelect');
      if (!triggerSelect) return;

      // Get component type to determine available triggers
      let triggers = [];

      if (objectId === '_form') {
        triggers = [
          { value: 'onSubmit', label: 'On Submit' },
          { value: 'onLoad', label: 'On Load' },
          { value: 'onBeforeUnload', label: 'On Before Unload' }
        ];
      } else {
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
                { value: 'onKeyUp', label: 'On Key Up' }
              ];
              break;

            case 'button':
              triggers = [
                { value: 'onClick', label: 'On Click' },
                { value: 'onDoubleClick', label: 'On Double Click' }
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
                { value: 'onDrop', label: 'On File Drop' }
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
      if (!actionSelect) return;

      actionSelect.innerHTML = '<option value="">Select action...</option>';

      switch (actionType) {
        case 'function':
          // Populate with custom functions
          const functions = window.FORM_DESIGNER_STATE?.customFunctions || {};
          const functionCount = Object.keys(functions).length;

          if (functionCount > 0) {
            Object.keys(functions).forEach(funcName => {
              actionSelect.innerHTML += `<option value="${funcName}">${funcName}()</option>`;
            });
            console.log('[Event Handlers] Populated', functionCount, 'custom functions');
          } else {
            actionSelect.innerHTML += `<option value="">No functions defined - use Code & Functions tab</option>`;
            console.log('[Event Handlers] No custom functions available');
          }
          break;

        case 'navigation':
          actionSelect.innerHTML += `
            <option value="back">Go Back</option>
            <option value="home">Go Home</option>
            <option value="custom">Custom URL</option>
          `;
          console.log('[Event Handlers] Populated navigation actions');
          break;

        case 'data':
          actionSelect.innerHTML += `
            <option value="save">Save Form</option>
            <option value="load">Load Data</option>
            <option value="delete">Delete Record</option>
            <option value="refresh">Refresh Data</option>
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
            actionSelect.innerHTML += `<option value="">No workflows configured - use Workflows tab</option>`;
            console.log('[Event Handlers] No workflows configured');
          } else {
            console.log('[Event Handlers] Populated workflows');
          }
          break;

        case 'api':
          actionSelect.innerHTML += `
            <option value="get">GET Request</option>
            <option value="post">POST Request</option>
            <option value="put">PUT Request</option>
            <option value="delete">DELETE Request</option>
          `;
          console.log('[Event Handlers] Populated API actions');
          break;

        default:
          console.log('[Event Handlers] Unknown action type:', actionType);
      }
    }

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

      this.eventHandlers.push(handler);
      window.FORM_DESIGNER_STATE.eventHandlers = this.eventHandlers;
      window.FORM_DESIGNER_STATE.isDirty = true;

      this.renderEventHandlersList();
      this.clearForm();
    }

    clearForm() {
      document.getElementById('eventObjectSelect').value = '';
      document.getElementById('eventTriggerSelect').value = 'onClick';
      document.getElementById('eventActionType').value = 'function';
      document.getElementById('eventActionSelect').value = '';
      document.getElementById('eventConditional').checked = false;
      document.getElementById('eventCondition').value = '';
      document.getElementById('eventCondition').disabled = true;
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
        return `
          <div class="event-handler-item">
            <div class="event-handler-info">
              <div class="event-handler-object">${objectName}.${handler.trigger}</div>
              <div class="event-handler-details">
                → ${handler.actionType}: ${handler.action}
                ${handler.conditional ? ` (if ${handler.condition})` : ''}
              </div>
            </div>
            <button class="btn btn-sm btn-danger" onclick="eventHandlersManager.deleteHandler('${handler.id}')">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        `;
      }).join('');
    }

    getObjectName(objectId) {
      if (objectId === '_form') return 'Form';

      const components = window.FORM_DESIGNER_STATE?.components || [];
      const comp = components.find(c => c.id === objectId);
      return comp ? (comp.props?.label || comp.props?.name || comp.type) : objectId;
    }

    deleteHandler(handlerId) {
      this.eventHandlers = this.eventHandlers.filter(h => h.id !== handlerId);
      window.FORM_DESIGNER_STATE.eventHandlers = this.eventHandlers;
      window.FORM_DESIGNER_STATE.isDirty = true;
      this.renderEventHandlersList();
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
