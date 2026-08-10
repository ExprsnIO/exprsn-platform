/**
 * ═══════════════════════════════════════════════════════════
 * Form Designer - Enhanced Workflow Integration Module
 * Connects forms to exprsn-workflow with Low-Code entity support
 * ═══════════════════════════════════════════════════════════
 */

(function() {
  'use strict';

  class WorkflowIntegrationEnhanced extends WorkflowIntegration {
    constructor(formDesigner) {
      super(formDesigner);

      // Configuration
      this.workflowServiceUrl = 'http://localhost:3017'; // exprsn-workflow service

      // Entity workflow templates
      this.entityWorkflowTemplates = {
        createRecord: {
          name: 'Create Entity Record',
          description: 'Create a new record in a Low-Code entity',
          stepType: 'lowcode_create',
          requiredFields: ['entityId', 'data']
        },
        queryRecords: {
          name: 'Query Entity Records',
          description: 'Search and retrieve entity records',
          stepType: 'lowcode_query',
          requiredFields: ['entityId', 'query']
        },
        updateRecord: {
          name: 'Update Entity Record',
          description: 'Update an existing entity record',
          stepType: 'lowcode_update',
          requiredFields: ['entityId', 'recordId', 'data']
        },
        deleteRecord: {
          name: 'Delete Entity Record',
          description: 'Delete an entity record',
          stepType: 'lowcode_delete',
          requiredFields: ['entityId', 'recordId']
        },
        executeFormula: {
          name: 'Execute Entity Formula',
          description: 'Run a computed field calculation',
          stepType: 'lowcode_formula',
          requiredFields: ['entityId', 'recordId', 'formulaName']
        }
      };

      console.log('[Enhanced Workflow] Initialized with entity workflow support');
    }

    // ───────────────────────────────────────────────────────────
    // Enhanced Workflow Loading (from workflow service)
    // ───────────────────────────────────────────────────────────

    async loadWorkflows() {
      try {
        const response = await fetch(`${this.workflowServiceUrl}/api/workflows?appId=${this.appId}`);
        const result = await response.json();

        if (result.success) {
          this.workflows = result.data || [];
          console.log('[Enhanced Workflow] Loaded', this.workflows.length, 'workflows from service');
        } else {
          console.error('[Enhanced Workflow] Failed to load workflows:', result.message);
          this.workflows = [];
        }
      } catch (error) {
        console.error('[Enhanced Workflow] Error loading workflows:', error);
        console.log('[Enhanced Workflow] Using fallback mode');
        this.workflows = [];
      }
    }

    // ───────────────────────────────────────────────────────────
    // Entity Workflow Helpers
    // ───────────────────────────────────────────────────────────

    /**
     * Create a workflow that creates an entity record when form is submitted
     */
    async createEntityRecordWorkflow(config) {
      // config: { entityId, formFieldMappings, workflowName }

      const workflowDefinition = {
        name: config.workflowName || `Create ${config.entityId} from Form`,
        description: `Automatically create ${config.entityId} record when form is submitted`,
        status: 'active',
        applicationId: this.appId,
        steps: [
          {
            step_type: 'lowcode_create',
            name: 'Create Entity Record',
            config: {
              parameters: {
                entityId: config.entityId,
                data: '${formData}', // Will be resolved at runtime
                applicationId: this.appId
              },
              outputVariable: 'created_record'
            },
            order: 1,
            is_enabled: true,
            next_steps: { default: null }
          }
        ]
      };

      try {
        const response = await fetch(`${this.workflowServiceUrl}/api/workflows`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(workflowDefinition)
        });

        const result = await response.json();

        if (result.success) {
          const workflowId = result.data.id;
          console.log('[Enhanced Workflow] Created entity workflow:', workflowId);

          // Add trigger to form
          this.addWorkflowTrigger({
            event: 'onFormSubmit',
            workflowId: workflowId,
            fieldMapping: config.formFieldMappings || {},
            conditions: []
          });

          return workflowId;
        } else {
          throw new Error(result.error);
        }
      } catch (error) {
        console.error('[Enhanced Workflow] Failed to create entity workflow:', error);
        throw error;
      }
    }

    /**
     * Create a workflow that queries entity records
     */
    async createQueryWorkflow(config) {
      // config: { entityId, query, workflowName, triggerEvent }

      const workflowDefinition = {
        name: config.workflowName || `Query ${config.entityId}`,
        description: `Query records from ${config.entityId}`,
        status: 'active',
        applicationId: this.appId,
        steps: [
          {
            step_type: 'lowcode_query',
            name: 'Query Entity Records',
            config: {
              parameters: {
                entityId: config.entityId,
                query: config.query || {},
                applicationId: this.appId
              },
              outputVariable: 'query_results'
            },
            order: 1,
            is_enabled: true,
            next_steps: { default: null }
          }
        ]
      };

      try {
        const response = await fetch(`${this.workflowServiceUrl}/api/workflows`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(workflowDefinition)
        });

        const result = await response.json();

        if (result.success) {
          const workflowId = result.data.id;
          console.log('[Enhanced Workflow] Created query workflow:', workflowId);

          // Add trigger to form
          this.addWorkflowTrigger({
            event: config.triggerEvent || 'onFormLoad',
            workflowId: workflowId,
            fieldMapping: {},
            conditions: []
          });

          return workflowId;
        } else {
          throw new Error(result.error);
        }
      } catch (error) {
        console.error('[Enhanced Workflow] Failed to create query workflow:', error);
        throw error;
      }
    }

    /**
     * Create a workflow that updates an entity record
     */
    async createUpdateWorkflow(config) {
      // config: { entityId, recordIdField, formFieldMappings, workflowName }

      const workflowDefinition = {
        name: config.workflowName || `Update ${config.entityId} from Form`,
        description: `Update ${config.entityId} record when form is submitted`,
        status: 'active',
        applicationId: this.appId,
        steps: [
          {
            step_type: 'lowcode_update',
            name: 'Update Entity Record',
            config: {
              parameters: {
                entityId: config.entityId,
                recordId: `\${${config.recordIdField}}`, // Form field containing record ID
                data: '${formData}',
                applicationId: this.appId
              },
              outputVariable: 'updated_record'
            },
            order: 1,
            is_enabled: true,
            next_steps: { default: null }
          }
        ]
      };

      try {
        const response = await fetch(`${this.workflowServiceUrl}/api/workflows`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(workflowDefinition)
        });

        const result = await response.json();

        if (result.success) {
          const workflowId = result.data.id;
          console.log('[Enhanced Workflow] Created update workflow:', workflowId);

          // Add trigger to form
          this.addWorkflowTrigger({
            event: 'onFormSubmit',
            workflowId: workflowId,
            fieldMapping: config.formFieldMappings || {},
            conditions: []
          });

          return workflowId;
        } else {
          throw new Error(result.error);
        }
      } catch (error) {
        console.error('[Enhanced Workflow] Failed to create update workflow:', error);
        throw error;
      }
    }

    // ───────────────────────────────────────────────────────────
    // Enhanced Execution (with entity context)
    // ───────────────────────────────────────────────────────────

    async executeWorkflow(workflowId, inputs, context = {}) {
      console.log('[Enhanced Workflow] Executing workflow:', workflowId, inputs);

      try {
        const response = await fetch(`${this.workflowServiceUrl}/api/workflows/${workflowId}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input_data: inputs,
            context: {
              ...context,
              formId: this.formDesigner.state.formId,
              appId: this.appId,
              userId: this.getCurrentUserId()
            }
          })
        });

        const result = await response.json();

        if (result.success) {
          console.log('[Enhanced Workflow] Execution started:', result.data.id);
          return result.data;
        } else {
          throw new Error(result.error || result.message);
        }
      } catch (error) {
        console.error('[Enhanced Workflow] Execution error:', error);
        throw error;
      }
    }

    async checkExecutionStatus(executionId) {
      try {
        const response = await fetch(`${this.workflowServiceUrl}/api/executions/${executionId}`);
        const result = await response.json();

        if (result.success) {
          return result.data;
        } else {
          throw new Error(result.error);
        }
      } catch (error) {
        console.error('[Enhanced Workflow] Status check error:', error);
        return null;
      }
    }

    // ───────────────────────────────────────────────────────────
    // Enhanced UI Rendering
    // ───────────────────────────────────────────────────────────

    renderWorkflowPanel() {
      return `
        <div class="workflow-panel" style="padding: 1rem;">
          <h4 style="font-size: 1rem; margin-bottom: 1rem;">
            <i class="fas fa-sitemap"></i> Workflow Integration
          </h4>

          <div style="margin-bottom: 1.5rem;">
            <div class="btn-group" role="group">
              <button class="btn btn-sm btn-primary" id="addWorkflowTriggerBtn">
                <i class="fas fa-plus"></i> Add Trigger
              </button>
              <button class="btn btn-sm btn-success" id="createEntityWorkflowBtn">
                <i class="fas fa-database"></i> Entity Workflow
              </button>
              <button class="btn btn-sm btn-info" id="openVisualDesignerBtn">
                <i class="fas fa-project-diagram"></i> Visual Designer
              </button>
            </div>
          </div>

          <div id="workflowTriggersList">
            ${this.renderWorkflowTriggersList()}
          </div>

          <div id="entityWorkflowTemplates" style="margin-top: 1.5rem;">
            ${this.renderEntityWorkflowTemplates()}
          </div>
        </div>
      `;
    }

    renderEntityWorkflowTemplates() {
      return `
        <div class="card">
          <div class="card-header">
            <h5 class="mb-0">Entity Workflow Templates</h5>
          </div>
          <div class="card-body">
            <div class="row">
              ${Object.entries(this.entityWorkflowTemplates).map(([key, template]) => `
                <div class="col-md-6 mb-3">
                  <div class="card border">
                    <div class="card-body p-3">
                      <h6 class="card-title mb-2">${template.name}</h6>
                      <p class="card-text small text-muted mb-2">${template.description}</p>
                      <button class="btn btn-sm btn-outline-primary use-template-btn"
                              data-template="${key}">
                        <i class="fas fa-magic"></i> Use Template
                      </button>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
    }

    // ───────────────────────────────────────────────────────────
    // Helper Methods
    // ───────────────────────────────────────────────────────────

    getCurrentUserId() {
      // Get current user ID from global state or session
      return window.currentUser?.id || 'dev-user-123';
    }

    generateTriggerId() {
      return 'trigger-' + Date.now() + '-' + Math.random().toString(36).substring(7);
    }

    // ───────────────────────────────────────────────────────────
    // Event Handlers
    // ───────────────────────────────────────────────────────────

    attachEventHandlers() {
      super.attachEventHandlers?.();

      // Open visual designer
      document.addEventListener('click', (e) => {
        if (e.target.closest('#openVisualDesignerBtn')) {
          this.openVisualDesigner();
        }

        if (e.target.closest('#createEntityWorkflowBtn')) {
          this.showEntityWorkflowWizard();
        }

        if (e.target.closest('.use-template-btn')) {
          const template = e.target.closest('.use-template-btn').dataset.template;
          this.useEntityWorkflowTemplate(template);
        }
      });
    }

    openVisualDesigner() {
      const url = `/lowcode/workflows/designer?appId=${this.appId}`;
      window.open(url, '_blank');
    }

    showEntityWorkflowWizard() {
      // TODO: Implement wizard UI
      console.log('[Enhanced Workflow] Opening entity workflow wizard...');
      alert('Entity Workflow Wizard coming soon!');
    }

    async useEntityWorkflowTemplate(templateKey) {
      const template = this.entityWorkflowTemplates[templateKey];
      console.log('[Enhanced Workflow] Using template:', template.name);
      alert(`Template "${template.name}" selected. Configuration UI coming soon!`);
    }
  }

  // Export enhanced version
  window.WorkflowIntegrationEnhanced = WorkflowIntegrationEnhanced;

  console.log('[Enhanced Workflow] Module loaded');
})();
