/**
 * ═══════════════════════════════════════════════════════════
 * Variables Manager
 * Manages form-level variables with key/value table interface
 * ═══════════════════════════════════════════════════════════
 */

(function() {
  'use strict';

  class VariablesManager {
    constructor() {
      this.variables = {};
      this.init();
    }

    init() {
      this.setupEventListeners();
      this.renderVariablesTable();
    }

    setupEventListeners() {
      // Add Variable button
      document.getElementById('addVariableBtn')?.addEventListener('click', () => {
        this.showAddVariableModal();
      });

      // Save Variable button (in modal)
      document.getElementById('saveVariableBtn')?.addEventListener('click', () => {
        this.saveVariable();
      });

      // Clear Variables button
      document.getElementById('clearVariablesBtn')?.addEventListener('click', () => {
        if (confirm('Clear all variables?')) {
          this.variables = {};
          window.FORM_DESIGNER_STATE.variables = this.variables;
          window.FORM_DESIGNER_STATE.isDirty = true;
          this.renderVariablesTable();
        }
      });

      // Import Variables button
      document.getElementById('importVariablesBtn')?.addEventListener('click', () => {
        this.importVariables();
      });
    }

    showAddVariableModal() {
      const modal = document.getElementById('addVariableModal');
      modal.classList.add('active');

      // Clear previous values
      this.clearVariableModal();
    }

    closeAddVariableModal() {
      // Clear form fields
      this.clearVariableModal();

      // Close modal
      document.getElementById('addVariableModal').classList.remove('active');

      console.log('[Variables Manager] Modal closed and cleared');
    }

    clearVariableModal() {
      document.getElementById('varKey').value = '';
      document.getElementById('varType').value = 'string';
      document.getElementById('varScope').value = 'form';
      document.getElementById('varDefault').value = '';
    }

    saveVariable() {
      const key = document.getElementById('varKey')?.value.trim();
      const type = document.getElementById('varType')?.value;
      const scope = document.getElementById('varScope')?.value;
      const defaultValue = document.getElementById('varDefault')?.value.trim();

      if (!key) {
        alert('Variable key is required');
        return;
      }

      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
        alert('Variable key must be a valid JavaScript identifier');
        return;
      }

      // Parse default value based on type
      let parsedValue = defaultValue;
      try {
        if (type === 'number') {
          parsedValue = parseFloat(defaultValue) || 0;
        } else if (type === 'boolean') {
          parsedValue = defaultValue.toLowerCase() === 'true';
        } else if (type === 'object' || type === 'array') {
          parsedValue = defaultValue ? JSON.parse(defaultValue) : (type === 'array' ? [] : {});
        }
      } catch (error) {
        alert('Invalid default value for type: ' + type);
        return;
      }

      this.variables[key] = {
        type,
        scope,
        defaultValue: parsedValue
      };

      window.FORM_DESIGNER_STATE.variables = this.variables;
      window.FORM_DESIGNER_STATE.isDirty = true;

      this.renderVariablesTable();
      document.getElementById('addVariableModal').classList.remove('active');
    }

    renderVariablesTable() {
      const tbody = document.getElementById('variablesTableBody');
      const variablesArray = Object.entries(this.variables);

      if (variablesArray.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="5" class="text-muted" style="text-align: center; padding: 2rem;">
              No variables defined. Click "Add Variable" to create one.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = variablesArray.map(([key, variable]) => {
        const displayValue = typeof variable.defaultValue === 'object'
          ? JSON.stringify(variable.defaultValue)
          : String(variable.defaultValue);

        return `
          <tr>
            <td><strong>${key}</strong></td>
            <td><span class="badge bg-primary">${variable.type}</span></td>
            <td><span class="badge bg-secondary">${variable.scope}</span></td>
            <td><code style="font-size: 0.875rem;">${displayValue}</code></td>
            <td>
              <button class="btn btn-sm btn-danger" onclick="variablesManager.deleteVariable('${key}')">
                <i class="fas fa-trash"></i>
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }

    deleteVariable(key) {
      if (confirm(`Delete variable "${key}"?`)) {
        delete this.variables[key];
        window.FORM_DESIGNER_STATE.variables = this.variables;
        window.FORM_DESIGNER_STATE.isDirty = true;
        this.renderVariablesTable();
      }
    }

    importVariables() {
      const json = prompt('Paste variables JSON:');
      if (!json) return;

      try {
        const imported = JSON.parse(json);
        this.variables = { ...this.variables, ...imported };
        window.FORM_DESIGNER_STATE.variables = this.variables;
        window.FORM_DESIGNER_STATE.isDirty = true;
        this.renderVariablesTable();
        alert('Variables imported successfully!');
      } catch (error) {
        alert('Invalid JSON: ' + error.message);
      }
    }

    exportVariables() {
      return this.variables;
    }

    loadVariables(variables) {
      this.variables = variables;
      window.FORM_DESIGNER_STATE.variables = this.variables;
      this.renderVariablesTable();
    }
  }

  // Initialize when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    window.variablesManager = new VariablesManager();

    // Load existing variables from state
    if (window.FORM_DESIGNER_STATE.variables) {
      window.variablesManager.loadVariables(window.FORM_DESIGNER_STATE.variables);
    }
  });

})();
