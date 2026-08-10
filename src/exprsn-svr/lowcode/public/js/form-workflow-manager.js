/**
 * ═══════════════════════════════════════════════════════════
 * Workflow Manager
 * Integrates Exprsn-Kicks visual workflow builder
 * ═══════════════════════════════════════════════════════════
 */

(function() {
  'use strict';

  class WorkflowManager {
    constructor() {
      this.workflows = {};
      this.kicksInstance = null;
      this.init();
    }

    init() {
      this.setupEventListeners();
      this.loadWorkflows();
    }

    setupEventListeners() {
      // Workflow trigger checkboxes
      document.getElementById('workflowOnSubmit')?.addEventListener('change', () => {
        this.updateWorkflows();
      });

      document.getElementById('workflowOnChange')?.addEventListener('change', () => {
        this.updateWorkflows();
      });

      document.getElementById('workflowOnLoad')?.addEventListener('change', () => {
        this.updateWorkflows();
      });

      // Workflow selects
      document.getElementById('workflowOnSubmitSelect')?.addEventListener('change', () => {
        this.updateWorkflows();
      });

      document.getElementById('workflowOnChangeSelect')?.addEventListener('change', () => {
        this.updateWorkflows();
      });

      document.getElementById('workflowOnLoadSelect')?.addEventListener('change', () => {
        this.updateWorkflows();
      });

      // Workflow buttons
      document.getElementById('newWorkflowBtn')?.addEventListener('click', () => {
        this.createNewWorkflow();
      });

      document.getElementById('importWorkflowBtn')?.addEventListener('click', () => {
        this.importWorkflow();
      });

      document.getElementById('exportWorkflowBtn')?.addEventListener('click', () => {
        this.exportWorkflow();
      });

      document.getElementById('launchKicksBtn')?.addEventListener('click', () => {
        this.launchExprnKicks();
      });
    }

    updateWorkflows() {
      this.workflows = {
        onSubmit: {
          enabled: document.getElementById('workflowOnSubmit')?.checked,
          workflowId: document.getElementById('workflowOnSubmitSelect')?.value
        },
        onChange: {
          enabled: document.getElementById('workflowOnChange')?.checked,
          workflowId: document.getElementById('workflowOnChangeSelect')?.value
        },
        onLoad: {
          enabled: document.getElementById('workflowOnLoad')?.checked,
          workflowId: document.getElementById('workflowOnLoadSelect')?.value
        }
      };

      window.FORM_DESIGNER_STATE.workflows = this.workflows;
      window.FORM_DESIGNER_STATE.isDirty = true;
    }

    loadWorkflows() {
      const workflows = window.FORM_DESIGNER_STATE.workflows || this.workflows;

      if (workflows.onSubmit) {
        if (document.getElementById('workflowOnSubmit')) {
          document.getElementById('workflowOnSubmit').checked = workflows.onSubmit.enabled;
        }
        if (document.getElementById('workflowOnSubmitSelect')) {
          document.getElementById('workflowOnSubmitSelect').value = workflows.onSubmit.workflowId || '';
        }
      }

      if (workflows.onChange) {
        if (document.getElementById('workflowOnChange')) {
          document.getElementById('workflowOnChange').checked = workflows.onChange.enabled;
        }
        if (document.getElementById('workflowOnChangeSelect')) {
          document.getElementById('workflowOnChangeSelect').value = workflows.onChange.workflowId || '';
        }
      }

      if (workflows.onLoad) {
        if (document.getElementById('workflowOnLoad')) {
          document.getElementById('workflowOnLoad').checked = workflows.onLoad.enabled;
        }
        if (document.getElementById('workflowOnLoadSelect')) {
          document.getElementById('workflowOnLoadSelect').value = workflows.onLoad.workflowId || '';
        }
      }

      this.workflows = workflows;
    }

    async launchExprnKicks() {
      const container = document.getElementById('exprsn-kicks-container');

      // Check if Exprsn-Kicks is available
      if (typeof ExprnKicks === 'undefined') {
        // Try to load Exprsn-Kicks dynamically
        try {
          await this.loadExprnKicksLibrary();
        } catch (error) {
          alert('Exprsn-Kicks library could not be loaded. Please ensure it is installed and available.');
          console.error('Exprsn-Kicks load error:', error);
          return;
        }
      }

      // Clear container
      container.innerHTML = '';

      // Initialize Exprsn-Kicks
      try {
        this.kicksInstance = new ExprnKicks({
          container: container,
          mode: 'designer',
          onSave: (workflowData) => {
            this.saveWorkflowData(workflowData);
          },
          onExecute: (workflowData) => {
            console.log('Workflow executed:', workflowData);
          }
        });

        // Load existing workflow if available
        if (this.workflows.definition) {
          this.kicksInstance.load(this.workflows.definition);
        }

      } catch (error) {
        container.innerHTML = `
          <div style="padding: 2rem; text-align: center; color: var(--error-color);">
            <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
            <p><strong>Exprsn-Kicks Initialization Failed</strong></p>
            <p class="text-muted">${error.message}</p>
            <p class="text-muted mt-2">Please check the console for details.</p>
          </div>
        `;
        console.error('Exprsn-Kicks initialization error:', error);
      }
    }

    async loadExprnKicksLibrary() {
      return new Promise((resolve, reject) => {
        // TODO: Update this path to actual Exprsn-Kicks library location
        const script = document.createElement('script');
        script.src = '/static/js/exprsn-kicks.min.js'; // or CDN URL
        script.onload = resolve;
        script.onerror = () => reject(new Error('Failed to load Exprsn-Kicks library'));
        document.head.appendChild(script);
      });
    }

    saveWorkflowData(workflowData) {
      this.workflows.definition = workflowData;
      window.FORM_DESIGNER_STATE.workflows = this.workflows;
      window.FORM_DESIGNER_STATE.isDirty = true;
      alert('Workflow saved!');
    }

    createNewWorkflow() {
      const name = prompt('Enter workflow name:');
      if (!name) return;

      const workflowId = 'workflow_' + Date.now();

      // Add to select dropdowns
      const selects = [
        document.getElementById('workflowOnSubmitSelect'),
        document.getElementById('workflowOnChangeSelect'),
        document.getElementById('workflowOnLoadSelect')
      ];

      selects.forEach(select => {
        if (select) {
          const option = document.createElement('option');
          option.value = workflowId;
          option.textContent = name;
          select.appendChild(option);
        }
      });

      alert('Workflow created! Select it from the dropdown and configure it.');
    }

    importWorkflow() {
      const json = prompt('Paste workflow JSON:');
      if (!json) return;

      try {
        const workflowData = JSON.parse(json);
        this.workflows.definition = workflowData;
        window.FORM_DESIGNER_STATE.workflows = this.workflows;
        window.FORM_DESIGNER_STATE.isDirty = true;

        if (this.kicksInstance) {
          this.kicksInstance.load(workflowData);
        }

        alert('Workflow imported successfully!');
      } catch (error) {
        alert('Invalid workflow JSON: ' + error.message);
      }
    }

    exportWorkflow() {
      if (!this.workflows.definition) {
        alert('No workflow to export');
        return;
      }

      const json = JSON.stringify(this.workflows.definition, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'workflow-' + Date.now() + '.json';
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  // Initialize when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    window.workflowManager = new WorkflowManager();
  });

})();
