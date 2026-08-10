/**
 * ═══════════════════════════════════════════════════════════
 * JSON Manager
 * Raw JSON editor with import/export and validation
 * ═══════════════════════════════════════════════════════════
 */

(function() {
  'use strict';

  class JSONManager {
    constructor() {
      this.editor = null;
      this.init();
    }

    init() {
      this.setupEventListeners();
    }

    setupEventListeners() {
      document.getElementById('importJsonBtn')?.addEventListener('click', () => {
        this.importJSON();
      });

      document.getElementById('exportJsonBtn')?.addEventListener('click', () => {
        this.exportJSON();
      });

      document.getElementById('validateJsonBtn')?.addEventListener('click', () => {
        this.validateJSON();
      });

      document.getElementById('formatJsonBtn')?.addEventListener('click', () => {
        this.formatJSON();
      });

      document.getElementById('copyJsonBtn')?.addEventListener('click', () => {
        this.copyJSON();
      });
    }

    initializeEditor() {
      if (this.editor) return;

      require(['vs/editor/editor.main'], () => {
        this.editor = monaco.editor.create(document.getElementById('jsonEditor'), {
          value: this.getFormJSON(),
          language: 'json',
          theme: 'vs-light',
          minimap: { enabled: false },
          fontSize: 14,
          lineNumbers: 'on',
          automaticLayout: true,
          scrollBeyondLastLine: false,
          formatOnPaste: true,
          formatOnType: true
        });

        // Mark as dirty on changes
        this.editor.onDidChangeModelContent(() => {
          window.FORM_DESIGNER_STATE.isDirty = true;
        });
      });
    }

    getFormJSON() {
      const state = window.FORM_DESIGNER_STATE;
      const formData = {
        name: state.form?.name || 'new-form',
        displayName: document.getElementById('formDisplayName')?.value || 'New Form',
        applicationId: state.appId,
        components: state.components || [],
        customFunctions: state.customFunctions || {},
        variables: state.variables || {},
        eventHandlers: state.eventHandlers || [],
        permissions: state.permissions || {},
        workflows: state.workflows || {},
        forgeMappings: state.forgeMappings || []
      };

      return JSON.stringify(formData, null, 2);
    }

    validateJSON() {
      if (!this.editor) {
        this.initializeEditor();
        setTimeout(() => this.validateJSON(), 500);
        return;
      }

      try {
        const jsonString = this.editor.getValue();
        const parsed = JSON.parse(jsonString);

        // Basic validation
        const errors = [];

        if (!parsed.name) {
          errors.push('Missing required field: name');
        }

        if (!parsed.applicationId) {
          errors.push('Missing required field: applicationId');
        }

        if (!Array.isArray(parsed.components)) {
          errors.push('components must be an array');
        }

        if (errors.length > 0) {
          alert('Validation failed:\n\n' + errors.join('\n'));
        } else {
          alert('✓ JSON is valid!\n\nAll required fields are present and properly formatted.');
        }

      } catch (error) {
        alert('JSON Syntax Error:\n\n' + error.message);
      }
    }

    formatJSON() {
      if (!this.editor) {
        this.initializeEditor();
        return;
      }

      try {
        const jsonString = this.editor.getValue();
        const parsed = JSON.parse(jsonString);
        const formatted = JSON.stringify(parsed, null, 2);
        this.editor.setValue(formatted);
        alert('JSON formatted successfully!');
      } catch (error) {
        alert('Cannot format invalid JSON:\n\n' + error.message);
      }
    }

    importJSON() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';

      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const json = event.target.result;
            const parsed = JSON.parse(json);

            // Update state
            window.FORM_DESIGNER_STATE.components = parsed.components || [];
            window.FORM_DESIGNER_STATE.customFunctions = parsed.customFunctions || {};
            window.FORM_DESIGNER_STATE.variables = parsed.variables || {};
            window.FORM_DESIGNER_STATE.eventHandlers = parsed.eventHandlers || [];
            window.FORM_DESIGNER_STATE.permissions = parsed.permissions || {};
            window.FORM_DESIGNER_STATE.workflows = parsed.workflows || {};
            window.FORM_DESIGNER_STATE.forgeMappings = parsed.forgeMappings || [];
            window.FORM_DESIGNER_STATE.isDirty = true;

            // Update editor
            if (this.editor) {
              this.editor.setValue(json);
            }

            // Reload managers
            this.reloadManagers();

            alert('Form JSON imported successfully!');
          } catch (error) {
            alert('Failed to import JSON:\n\n' + error.message);
          }
        };

        reader.readAsText(file);
      };

      input.click();
    }

    exportJSON() {
      const json = this.editor ? this.editor.getValue() : this.getFormJSON();

      try {
        // Validate before export
        JSON.parse(json);

        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `form-${window.FORM_DESIGNER_STATE.form?.name || 'export'}-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);

        alert('Form JSON exported successfully!');
      } catch (error) {
        alert('Cannot export invalid JSON:\n\n' + error.message);
      }
    }

    copyJSON() {
      if (!this.editor) {
        this.initializeEditor();
        setTimeout(() => this.copyJSON(), 500);
        return;
      }

      const json = this.editor.getValue();

      navigator.clipboard.writeText(json).then(() => {
        alert('JSON copied to clipboard!');
      }).catch(() => {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = json;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        alert('JSON copied to clipboard!');
      });
    }

    reloadManagers() {
      // Reload canvas
      if (window.formDesigner) {
        window.formDesigner.components = window.FORM_DESIGNER_STATE.components;
        window.formDesigner.renderCanvas();
      }

      // Reload managers
      if (window.functionsManager) {
        window.functionsManager.importFunctions(window.FORM_DESIGNER_STATE.customFunctions);
      }

      if (window.variablesManager) {
        window.variablesManager.loadVariables(window.FORM_DESIGNER_STATE.variables);
      }

      if (window.eventHandlersManager) {
        window.eventHandlersManager.importEventHandlers(window.FORM_DESIGNER_STATE.eventHandlers);
      }

      if (window.permissionsManager) {
        window.permissionsManager.importPermissions(window.FORM_DESIGNER_STATE.permissions);
      }

      if (window.forgeManager) {
        window.forgeManager.forgeMappings = window.FORM_DESIGNER_STATE.forgeMappings;
        window.forgeManager.renderFieldMappings();
      }
    }

    refreshFromState() {
      if (this.editor) {
        this.editor.setValue(this.getFormJSON());
      }
    }
  }

  // Initialize when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    window.jsonManager = new JSONManager();
  });

})();
