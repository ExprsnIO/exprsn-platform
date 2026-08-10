/**
 * ═══════════════════════════════════════════════════════════
 * Form Designer - Workflow Integration Module
 * Connects forms to exprsn-workflow for automated processes
 * ═══════════════════════════════════════════════════════════
 */

(function() {
  'use strict';

  class WorkflowIntegration {
    constructor(formDesigner) {
      this.formDesigner = formDesigner;
      this.appId = formDesigner.state.appId;

      // Available workflows
      this.workflows = [];

      // Workflow triggers mapped to form events
      this.workflowTriggers = {};

      this.init();
    }

    async init() {
      console.log('[Workflow] Initializing workflow integration...');

      // Load available workflows
      await this.loadWorkflows();

      // Load existing triggers from form
      if (this.formDesigner.state.form?.workflowTriggers) {
        this.workflowTriggers = this.formDesigner.state.form.workflowTriggers;
      }

      console.log('[Workflow] Initialization complete');
    }

    // ───────────────────────────────────────────────────────────
    // Load Workflows
    // ───────────────────────────────────────────────────────────

    async loadWorkflows() {
      try {
        const response = await fetch(`/workflow/api/workflows?appId=${this.appId}`);
        const result = await response.json();

        if (result.success) {
          this.workflows = result.data || [];
          console.log('[Workflow] Loaded', this.workflows.length, 'workflows');
        } else {
          console.error('[Workflow] Failed to load workflows:', result.message);
        }
      } catch (error) {
        console.error('[Workflow] Error loading workflows:', error);
        // Use mock data for development
        this.workflows = [
          {
            id: 'wf-1',
            name: 'Lead Qualification Workflow',
            description: 'Automatically qualify and route new leads',
            status: 'published',
            inputs: ['leadId', 'source', 'score']
          },
          {
            id: 'wf-2',
            name: 'Order Processing Workflow',
            description: 'Process and fulfill customer orders',
            status: 'published',
            inputs: ['orderId', 'customerId', 'items']
          },
          {
            id: 'wf-3',
            name: 'Customer Onboarding',
            description: 'Onboard new customers with welcome sequence',
            status: 'published',
            inputs: ['customerId', 'plan', 'startDate']
          }
        ];
      }
    }

    // ───────────────────────────────────────────────────────────
    // Workflow Triggers
    // ───────────────────────────────────────────────────────────

    addWorkflowTrigger(triggerConfig) {
      // triggerConfig: {
      //   event: 'onFormSubmit' | 'onFieldChange' | 'onRecordCreate' | 'onRecordUpdate',
      //   workflowId: string,
      //   fieldMapping: { workflowInputName: formFieldName }
      //   conditions: { field: string, operator: string, value: any }[]
      // }

      const triggerId = this.generateTriggerId();

      this.workflowTriggers[triggerId] = {
        id: triggerId,
        event: triggerConfig.event,
        workflowId: triggerConfig.workflowId,
        fieldMapping: triggerConfig.fieldMapping || {},
        conditions: triggerConfig.conditions || [],
        enabled: true,
        createdAt: new Date().toISOString()
      };

      console.log('[Workflow] Added trigger:', triggerId);
      return triggerId;
    }

    updateWorkflowTrigger(triggerId, updates) {
      if (!this.workflowTriggers[triggerId]) {
        console.error('[Workflow] Trigger not found:', triggerId);
        return false;
      }

      this.workflowTriggers[triggerId] = {
        ...this.workflowTriggers[triggerId],
        ...updates
      };

      return true;
    }

    removeWorkflowTrigger(triggerId) {
      delete this.workflowTriggers[triggerId];
      console.log('[Workflow] Removed trigger:', triggerId);
    }

    getWorkflowTriggers(event = null) {
      if (event) {
        return Object.values(this.workflowTriggers).filter(t => t.event === event);
      }
      return Object.values(this.workflowTriggers);
    }

    // ───────────────────────────────────────────────────────────
    // Execute Workflow
    // ───────────────────────────────────────────────────────────

    async executeWorkflow(workflowId, inputs, context = {}) {
      console.log('[Workflow] Executing workflow:', workflowId, inputs);

      try {
        const response = await fetch('/workflow/api/executions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workflowId,
            inputs,
            context: {
              ...context,
              formId: this.formDesigner.state.formId,
              appId: this.appId
            }
          })
        });

        const result = await response.json();

        if (result.success) {
          console.log('[Workflow] Execution started:', result.data.executionId);
          return result.data;
        } else {
          throw new Error(result.message);
        }
      } catch (error) {
        console.error('[Workflow] Execution error:', error);
        throw error;
      }
    }

    async checkExecutionStatus(executionId) {
      try {
        const response = await fetch(`/workflow/api/executions/${executionId}`);
        const result = await response.json();

        if (result.success) {
          return result.data;
        } else {
          throw new Error(result.message);
        }
      } catch (error) {
        console.error('[Workflow] Status check error:', error);
        return null;
      }
    }

    // ───────────────────────────────────────────────────────────
    // Trigger Evaluation
    // ───────────────────────────────────────────────────────────

    async evaluateTriggers(event, formData) {
      const triggers = this.getWorkflowTriggers(event);

      for (const trigger of triggers) {
        if (!trigger.enabled) continue;

        // Check conditions
        if (!this.evaluateConditions(trigger.conditions, formData)) {
          console.log('[Workflow] Trigger conditions not met:', trigger.id);
          continue;
        }

        // Map form fields to workflow inputs
        const inputs = this.mapFieldsToInputs(trigger.fieldMapping, formData);

        // Execute workflow
        try {
          await this.executeWorkflow(trigger.workflowId, inputs, {
            triggerId: trigger.id,
            event: event
          });
        } catch (error) {
          console.error('[Workflow] Failed to execute trigger:', trigger.id, error);
        }
      }
    }

    evaluateConditions(conditions, formData) {
      if (!conditions || conditions.length === 0) {
        return true; // No conditions = always true
      }

      return conditions.every(condition => {
        const fieldValue = this.getFieldValue(condition.field, formData);
        return this.evaluateCondition(fieldValue, condition.operator, condition.value);
      });
    }

    evaluateCondition(fieldValue, operator, compareValue) {
      switch (operator) {
        case 'equals':
          return fieldValue == compareValue;
        case 'not_equals':
          return fieldValue != compareValue;
        case 'greater_than':
          return fieldValue > compareValue;
        case 'less_than':
          return fieldValue < compareValue;
        case 'contains':
          return String(fieldValue).includes(compareValue);
        case 'not_contains':
          return !String(fieldValue).includes(compareValue);
        case 'is_empty':
          return !fieldValue || fieldValue === '';
        case 'is_not_empty':
          return fieldValue && fieldValue !== '';
        default:
          return false;
      }
    }

    mapFieldsToInputs(fieldMapping, formData) {
      const inputs = {};

      for (const [workflowInput, formField] of Object.entries(fieldMapping)) {
        inputs[workflowInput] = this.getFieldValue(formField, formData);
      }

      return inputs;
    }

    getFieldValue(fieldPath, formData) {
      const parts = fieldPath.split('.');
      let value = formData;

      for (const part of parts) {
        value = value?.[part];
      }

      return value;
    }

    // ───────────────────────────────────────────────────────────
    // UI Rendering
    // ───────────────────────────────────────────────────────────

    renderWorkflowPanel() {
      return `
        <div class="workflow-panel" style="padding: 1rem;">
          <h4 style="font-size: 1rem; margin-bottom: 1rem;">Workflow Integration</h4>

          <div style="margin-bottom: 1.5rem;">
            <button class="btn btn-sm btn-primary" id="addWorkflowTriggerBtn">
              <i class="fas fa-plus"></i> Add Workflow Trigger
            </button>
          </div>

          <div id="workflowTriggersList">
            ${this.renderWorkflowTriggersList()}
          </div>
        </div>
      `;
    }

    renderWorkflowTriggersList() {
      const triggers = Object.values(this.workflowTriggers);

      if (triggers.length === 0) {
        return `
          <div style="padding: 2rem; text-align: center; color: var(--text-secondary); border: 2px dashed var(--border-color); border-radius: 4px;">
            <i class="fas fa-project-diagram" style="font-size: 2rem; margin-bottom: 0.5rem; opacity: 0.5;"></i>
            <p>No workflow triggers configured</p>
            <p style="font-size: 0.875rem;">Click "Add Workflow Trigger" to automate form actions</p>
          </div>
        `;
      }

      return triggers.map(trigger => {
        const workflow = this.workflows.find(w => w.id === trigger.workflowId);

        return `
          <div class="workflow-trigger-item" style="margin-bottom: 1rem; padding: 1rem; border: 1px solid var(--border-color); border-radius: 4px;">
            <div style="display: flex; justify-content: space-between; align-items: start;">
              <div style="flex: 1;">
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                  <i class="fas fa-project-diagram" style="color: var(--primary-color);"></i>
                  <strong>${workflow?.name || 'Unknown Workflow'}</strong>
                  <span class="badge badge-${trigger.enabled ? 'success' : 'secondary'}">
                    ${trigger.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <p style="font-size: 0.875rem; color: var(--text-secondary); margin: 0.25rem 0;">
                  <strong>Event:</strong> ${this.formatEventName(trigger.event)}
                </p>
                ${trigger.conditions.length > 0 ? `
                  <p style="font-size: 0.875rem; color: var(--text-secondary); margin: 0.25rem 0;">
                    <strong>Conditions:</strong> ${trigger.conditions.length} condition(s)
                  </p>
                ` : ''}
              </div>
              <div style="display: flex; gap: 0.25rem;">
                <button class="btn btn-sm btn-outline-primary" onclick="window.formDesigner.workflow.editTrigger('${trigger.id}')" title="Edit">
                  <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="window.formDesigner.workflow.removeTrigger('${trigger.id}')" title="Delete">
                  <i class="fas fa-trash"></i>
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    renderWorkflowSelector() {
      return `
        <select class="form-control" id="workflowSelect">
          <option value="">Select a workflow...</option>
          ${this.workflows.map(wf => `
            <option value="${wf.id}">${wf.name}</option>
          `).join('')}
        </select>
      `;
    }

    // ───────────────────────────────────────────────────────────
    // Event Handlers
    // ───────────────────────────────────────────────────────────

    setupWorkflowEventHandlers() {
      const addBtn = document.getElementById('addWorkflowTriggerBtn');
      if (addBtn) {
        addBtn.addEventListener('click', () => {
          this.showAddTriggerModal();
        });
      }
    }

    showAddTriggerModal() {
      // For now, use a simple implementation
      // TODO: Create a proper modal UI
      const workflowId = prompt('Enter workflow ID (from the list above):');
      if (!workflowId) return;

      const event = prompt('Enter event (onFormSubmit, onFieldChange, onRecordCreate, onRecordUpdate):');
      if (!event) return;

      this.addWorkflowTrigger({
        workflowId,
        event,
        fieldMapping: {},
        conditions: []
      });

      this.refreshWorkflowPanel();
    }

    editTrigger(triggerId) {
      console.log('[Workflow] Edit trigger:', triggerId);
      // TODO: Implement trigger editor modal
      alert('Trigger editor coming soon!');
    }

    removeTrigger(triggerId) {
      if (confirm('Are you sure you want to remove this workflow trigger?')) {
        this.removeWorkflowTrigger(triggerId);
        this.refreshWorkflowPanel();
      }
    }

    refreshWorkflowPanel() {
      const panel = document.querySelector('.workflow-panel');
      if (panel) {
        panel.innerHTML = this.renderWorkflowPanel().replace(/<div class="workflow-panel"[^>]*>|<\/div>$/g, '');
        this.setupWorkflowEventHandlers();
      }
    }

    // ───────────────────────────────────────────────────────────
    // Utility Functions
    // ───────────────────────────────────────────────────────────

    formatEventName(event) {
      const names = {
        'onFormSubmit': 'On Form Submit',
        'onFieldChange': 'On Field Change',
        'onRecordCreate': 'On Record Create',
        'onRecordUpdate': 'On Record Update',
        'onRecordDelete': 'On Record Delete'
      };
      return names[event] || event;
    }

    generateTriggerId() {
      return 'trigger_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // ───────────────────────────────────────────────────────────
    // Persistence
    // ───────────────────────────────────────────────────────────

    getFormDefinition() {
      return {
        workflowTriggers: this.workflowTriggers
      };
    }

    loadWorkflowTriggers(triggers) {
      if (triggers) {
        this.workflowTriggers = triggers;
        console.log('[Workflow] Loaded workflow triggers');
      }
    }
  }

  // Export to window
  window.WorkflowIntegration = WorkflowIntegration;

})();
