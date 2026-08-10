/**
 * ═══════════════════════════════════════════════════════════
 * Variables Manager - Enhanced Edition
 * Advanced variable management with workflow scope, array configurator, associations
 * ═══════════════════════════════════════════════════════════
 */

(function() {
  'use strict';

  class VariablesManager {
    constructor() {
      this.variables = {};
      this.selectedVariable = null;
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
          this.clearPropertiesPanel();
        }
      });

      // Import Variables button
      document.getElementById('importVariablesBtn')?.addEventListener('click', () => {
        this.importVariables();
      });

      // Export Variables button
      document.getElementById('exportVariablesBtn')?.addEventListener('click', () => {
        this.exportVariables();
      });

      // Type change handler for array configurator
      document.getElementById('varType')?.addEventListener('change', (e) => {
        this.toggleArrayConfigurator(e.target.value);
      });
    }

    showAddVariableModal() {
      const modal = document.getElementById('addVariableModal');
      if (!modal) {
        console.error('[Variables Manager] Add Variable modal not found');
        return;
      }

      modal.classList.add('active');

      // Clear previous values
      this.clearVariableModal();
    }

    closeAddVariableModal() {
      // Clear form fields
      this.clearVariableModal();

      // Close modal
      const modal = document.getElementById('addVariableModal');
      if (modal) {
        modal.classList.remove('active');
      }

      console.log('[Variables Manager] Modal closed and cleared');
    }

    clearVariableModal() {
      document.getElementById('varKey').value = '';
      document.getElementById('varType').value = 'string';
      document.getElementById('varScope').value = 'form';
      document.getElementById('varDefault').value = '';
      document.getElementById('varLocked').checked = false;
      document.getElementById('varReadonly').checked = false;
      document.getElementById('varDescription').value = '';

      // Hide array configurator
      this.toggleArrayConfigurator('string');

      // Clear associations
      this.clearAssociations();
    }

    toggleArrayConfigurator(type) {
      const configurator = document.getElementById('arrayConfigurator');
      const defaultInput = document.getElementById('varDefault');

      if (!configurator) return;

      if (type === 'array') {
        configurator.style.display = 'block';
        defaultInput.style.display = 'none';
        this.renderArrayTable();
      } else {
        configurator.style.display = 'none';
        defaultInput.style.display = 'block';
      }
    }

    renderArrayTable() {
      const tbody = document.getElementById('arrayItemsTable');
      if (!tbody) return;

      const existingRows = Array.from(tbody.querySelectorAll('tr')).filter(row => {
        return !row.querySelector('td[colspan]');
      });

      if (existingRows.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="4" style="padding: 1rem; text-align: center; color: var(--text-secondary); font-size: 0.875rem;">
              No items. Click "+ Add Item" to add an array item.
            </td>
          </tr>
        `;
      }
    }

    addArrayItem() {
      const tbody = document.getElementById('arrayItemsTable');
      if (!tbody) return;

      // Remove empty message if it exists
      const emptyRow = tbody.querySelector('tr td[colspan="4"]');
      if (emptyRow) {
        tbody.innerHTML = '';
      }

      const columnCount = this.getArrayColumnCount();
      const row = document.createElement('tr');

      let cellsHtml = '';
      for (let i = 0; i < columnCount; i++) {
        const colName = document.getElementById(`arrayCol${i}Name`)?.value || `Column ${i + 1}`;
        cellsHtml += `
          <td style="padding: 0.5rem;">
            <input type="text" class="property-input array-cell"
                   data-column="${i}"
                   placeholder="${colName}"
                   style="font-size: 0.875rem; padding: 0.375rem;">
          </td>
        `;
      }

      row.innerHTML = `
        ${cellsHtml}
        <td style="padding: 0.5rem; text-align: center;">
          <button type="button" class="btn btn-sm btn-danger" onclick="variablesManager.removeArrayItem(this)" title="Remove item">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      `;

      tbody.appendChild(row);
      console.log('[Variables Manager] Added array item row');
    }

    removeArrayItem(button) {
      const row = button.closest('tr');
      const tbody = row.parentElement;
      row.remove();

      // If no rows left, show empty message
      if (tbody.children.length === 0) {
        this.renderArrayTable();
      }

      console.log('[Variables Manager] Removed array item row');
    }

    addArrayColumn() {
      const container = document.getElementById('arrayColumnsContainer');
      if (!container) return;

      const columnCount = this.getArrayColumnCount();
      const columnDiv = document.createElement('div');
      columnDiv.className = 'array-column-config';
      columnDiv.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr auto; gap: 0.5rem; align-items: end; margin-bottom: 0.5rem;">
          <div class="form-group" style="margin: 0;">
            <label class="form-label" style="font-size: 0.75rem;">Column Name</label>
            <input type="text" id="arrayCol${columnCount}Name" class="property-input" placeholder="Column ${columnCount + 1}" style="font-size: 0.875rem; padding: 0.375rem;">
          </div>
          <div class="form-group" style="margin: 0;">
            <label class="form-label" style="font-size: 0.75rem;">Type</label>
            <select id="arrayCol${columnCount}Type" class="property-input" style="font-size: 0.875rem; padding: 0.375rem;">
              <option value="string">String</option>
              <option value="number">Number</option>
              <option value="boolean">Boolean</option>
              <option value="date">Date</option>
            </select>
          </div>
          <button type="button" class="btn btn-sm btn-danger" onclick="variablesManager.removeArrayColumn(this)" title="Remove column">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      `;

      container.appendChild(columnDiv);
      console.log('[Variables Manager] Added array column config');
    }

    removeArrayColumn(button) {
      const columnDiv = button.closest('.array-column-config');
      columnDiv.remove();
      console.log('[Variables Manager] Removed array column config');
    }

    getArrayColumnCount() {
      const container = document.getElementById('arrayColumnsContainer');
      return container ? container.querySelectorAll('.array-column-config').length : 0;
    }

    getArrayColumns() {
      const columns = [];
      const columnCount = this.getArrayColumnCount();

      for (let i = 0; i < columnCount; i++) {
        const nameInput = document.getElementById(`arrayCol${i}Name`);
        const typeSelect = document.getElementById(`arrayCol${i}Type`);

        if (nameInput && typeSelect) {
          columns.push({
            name: nameInput.value.trim() || `Column ${i + 1}`,
            type: typeSelect.value
          });
        }
      }

      return columns;
    }

    getArrayDefaultValue() {
      const tbody = document.getElementById('arrayItemsTable');
      if (!tbody) return [];

      const rows = tbody.querySelectorAll('tr');
      const items = [];
      const columns = this.getArrayColumns();

      rows.forEach(row => {
        const cells = row.querySelectorAll('.array-cell');
        if (cells.length > 0) {
          const item = {};
          cells.forEach((cell, index) => {
            const colName = columns[index]?.name || `col${index}`;
            const colType = columns[index]?.type || 'string';
            const value = cell.value.trim();

            // Parse value based on column type
            if (value) {
              switch (colType) {
                case 'number':
                  item[colName] = parseFloat(value) || 0;
                  break;
                case 'boolean':
                  item[colName] = value.toLowerCase() === 'true';
                  break;
                case 'date':
                  item[colName] = value;
                  break;
                default:
                  item[colName] = value;
              }
            } else {
              item[colName] = colType === 'number' ? 0 : (colType === 'boolean' ? false : '');
            }
          });
          items.push(item);
        }
      });

      return items;
    }

    clearAssociations() {
      document.getElementById('assocForms').value = '';
      document.getElementById('assocObjects').value = '';
      document.getElementById('assocWorkflows').value = '';
      document.getElementById('assocParameters').value = '';
    }

    getAssociations() {
      const parseList = (value) => {
        return value.split(',').map(s => s.trim()).filter(s => s);
      };

      return {
        forms: parseList(document.getElementById('assocForms')?.value || ''),
        objects: parseList(document.getElementById('assocObjects')?.value || ''),
        workflows: parseList(document.getElementById('assocWorkflows')?.value || ''),
        parameters: parseList(document.getElementById('assocParameters')?.value || '')
      };
    }

    saveVariable() {
      const key = document.getElementById('varKey')?.value.trim();
      const type = document.getElementById('varType')?.value;
      const scope = document.getElementById('varScope')?.value;
      let defaultValue = document.getElementById('varDefault')?.value.trim();
      const locked = document.getElementById('varLocked')?.checked || false;
      const readonly = document.getElementById('varReadonly')?.checked || false;
      const description = document.getElementById('varDescription')?.value.trim() || '';

      if (!key) {
        alert('Variable key is required');
        return;
      }

      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
        alert('Variable key must be a valid JavaScript identifier (letters, numbers, underscores; cannot start with a number)');
        return;
      }

      // Check uniqueness (allow editing existing variable)
      if (this.variables[key] && this.selectedVariable !== key) {
        alert(`Variable "${key}" already exists. Please use a unique name.`);
        return;
      }

      // Parse default value based on type
      let parsedValue = defaultValue;
      let arrayConfig = null;

      try {
        if (type === 'number') {
          parsedValue = parseFloat(defaultValue) || 0;
        } else if (type === 'boolean') {
          parsedValue = defaultValue.toLowerCase() === 'true';
        } else if (type === 'object') {
          parsedValue = defaultValue ? JSON.parse(defaultValue) : {};
        } else if (type === 'array') {
          // Get array configuration
          arrayConfig = {
            columns: this.getArrayColumns(),
            items: this.getArrayDefaultValue()
          };
          parsedValue = arrayConfig.items;
        }
      } catch (error) {
        alert('Invalid default value for type: ' + type + '\n' + error.message);
        return;
      }

      const associations = this.getAssociations();

      this.variables[key] = {
        type,
        scope,
        defaultValue: parsedValue,
        locked,
        readonly,
        description,
        associations,
        ...(arrayConfig && { arrayConfig })
      };

      window.FORM_DESIGNER_STATE.variables = this.variables;
      window.FORM_DESIGNER_STATE.isDirty = true;

      this.renderVariablesTable();
      this.closeAddVariableModal();

      // Show in properties panel
      this.showVariableInProperties(key);

      console.log('[Variables Manager] Variable saved:', key, this.variables[key]);
    }

    renderVariablesTable() {
      const tbody = document.getElementById('variablesTableBody');
      if (!tbody) return;

      const variablesArray = Object.entries(this.variables);

      if (variablesArray.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" class="text-muted" style="text-align: center; padding: 2rem;">
              No variables defined. Click "Add Variable" to create one.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = variablesArray.map(([key, variable]) => {
        const displayValue = this.formatVariableValue(variable);
        const isSelected = this.selectedVariable === key;

        return `
          <tr class="${isSelected ? 'selected' : ''}"
              onclick="variablesManager.selectVariable('${key}')"
              style="cursor: pointer; ${isSelected ? 'background: rgba(0, 120, 212, 0.1);' : ''}">
            <td>
              <strong>${key}</strong>
              ${variable.locked ? '<i class="fas fa-lock" style="color: var(--warning-color); margin-left: 0.5rem;" title="Locked"></i>' : ''}
              ${variable.readonly ? '<i class="fas fa-eye" style="color: var(--info-color); margin-left: 0.5rem;" title="Read-only"></i>' : ''}
            </td>
            <td><span class="badge bg-primary">${variable.type}</span></td>
            <td><span class="badge bg-secondary">${variable.scope}</span></td>
            <td><code style="font-size: 0.875rem;">${displayValue}</code></td>
            <td style="font-size: 0.75rem; color: var(--text-secondary);">${variable.description || '-'}</td>
            <td style="font-size: 0.75rem;">${this.formatAssociations(variable.associations)}</td>
            <td>
              <div style="display: flex; gap: 0.25rem;">
                <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); variablesManager.editVariable('${key}')" title="Edit">
                  <i class="fas fa-edit"></i>
                </button>
                ${!variable.locked ? `
                  <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); variablesManager.deleteVariable('${key}')" title="Delete">
                    <i class="fas fa-trash"></i>
                  </button>
                ` : ''}
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    formatVariableValue(variable) {
      const value = variable.defaultValue;

      if (value === null || value === undefined || value === '') {
        return '<em style="color: var(--text-secondary);">Not set</em>';
      }

      if (typeof value === 'object') {
        if (Array.isArray(value)) {
          return `Array[${value.length}]`;
        }
        return 'Object';
      }

      const str = String(value);
      return str.length > 30 ? str.substring(0, 30) + '...' : str;
    }

    formatAssociations(associations) {
      if (!associations) return '-';

      const parts = [];
      if (associations.forms?.length) parts.push(`Forms: ${associations.forms.length}`);
      if (associations.objects?.length) parts.push(`Objects: ${associations.objects.length}`);
      if (associations.workflows?.length) parts.push(`Workflows: ${associations.workflows.length}`);
      if (associations.parameters?.length) parts.push(`Params: ${associations.parameters.length}`);

      return parts.length > 0 ? parts.join(', ') : '-';
    }

    selectVariable(key) {
      this.selectedVariable = key;
      this.renderVariablesTable();
      this.showVariableInProperties(key);
    }

    showVariableInProperties(key) {
      const variable = this.variables[key];
      if (!variable) return;

      const panel = document.getElementById('variablePropertiesPanel');
      if (!panel) return;

      const displayValue = typeof variable.defaultValue === 'object'
        ? JSON.stringify(variable.defaultValue, null, 2)
        : String(variable.defaultValue);

      panel.innerHTML = `
        <div class="panel-header" style="padding: 0.75rem 1rem; border-bottom: 1px solid var(--border-color); font-weight: 600;">
          Variable: ${key}
        </div>
        <div style="padding: 1rem; overflow-y: auto; max-height: calc(100vh - 200px);">
          <div class="form-group">
            <label class="form-label">Key</label>
            <div style="padding: 0.5rem; background: var(--bg-tertiary); border-radius: 4px; font-family: monospace;">
              ${key}
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Type</label>
            <div style="padding: 0.5rem; background: var(--bg-tertiary); border-radius: 4px;">
              <span class="badge bg-primary">${variable.type}</span>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Scope</label>
            <div style="padding: 0.5rem; background: var(--bg-tertiary); border-radius: 4px;">
              <span class="badge bg-secondary">${variable.scope}</span>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Default Value</label>
            <textarea class="property-input" rows="4" readonly style="font-family: monospace; font-size: 0.875rem;">${displayValue}</textarea>
          </div>

          ${variable.arrayConfig ? `
            <div class="form-group">
              <label class="form-label">Array Configuration</label>
              <div style="padding: 0.5rem; background: var(--bg-tertiary); border-radius: 4px; font-size: 0.875rem;">
                <strong>Columns:</strong> ${variable.arrayConfig.columns.map(c => `${c.name} (${c.type})`).join(', ')}<br>
                <strong>Items:</strong> ${variable.arrayConfig.items.length}
              </div>
            </div>
          ` : ''}

          <div class="form-group">
            <label class="form-label">Description</label>
            <div style="padding: 0.5rem; background: var(--bg-tertiary); border-radius: 4px; min-height: 3rem;">
              ${variable.description || '<em style="color: var(--text-secondary);">No description</em>'}
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Properties</label>
            <div style="padding: 0.5rem; background: var(--bg-tertiary); border-radius: 4px;">
              ${variable.locked ? '<span class="badge bg-warning">Locked</span> ' : ''}
              ${variable.readonly ? '<span class="badge bg-info">Read-only</span> ' : ''}
              ${!variable.locked && !variable.readonly ? '<span class="badge bg-secondary">Editable</span>' : ''}
            </div>
          </div>

          ${variable.associations && (variable.associations.forms?.length || variable.associations.objects?.length || variable.associations.workflows?.length || variable.associations.parameters?.length) ? `
            <div class="form-group">
              <label class="form-label">Associations</label>
              <div style="padding: 0.5rem; background: var(--bg-tertiary); border-radius: 4px; font-size: 0.875rem;">
                ${variable.associations.forms?.length ? `<div><strong>Forms:</strong> ${variable.associations.forms.join(', ')}</div>` : ''}
                ${variable.associations.objects?.length ? `<div><strong>Objects:</strong> ${variable.associations.objects.join(', ')}</div>` : ''}
                ${variable.associations.workflows?.length ? `<div><strong>Workflows:</strong> ${variable.associations.workflows.join(', ')}</div>` : ''}
                ${variable.associations.parameters?.length ? `<div><strong>Parameters:</strong> ${variable.associations.parameters.join(', ')}</div>` : ''}
              </div>
            </div>
          ` : ''}

          <div style="margin-top: 1.5rem; display: flex; gap: 0.5rem;">
            <button class="btn btn-secondary flex-1" onclick="variablesManager.editVariable('${key}')">
              <i class="fas fa-edit"></i> Edit
            </button>
            ${!variable.locked ? `
              <button class="btn btn-danger flex-1" onclick="variablesManager.deleteVariable('${key}')">
                <i class="fas fa-trash"></i> Delete
              </button>
            ` : ''}
          </div>
        </div>
      `;

      panel.style.display = 'flex';
    }

    clearPropertiesPanel() {
      const panel = document.getElementById('variablePropertiesPanel');
      if (panel) {
        panel.innerHTML = `
          <div class="panel-header" style="padding: 0.75rem 1rem; border-bottom: 1px solid var(--border-color); font-weight: 600;">
            Properties
          </div>
          <div style="padding: 2rem; text-align: center; color: var(--text-secondary);">
            <i class="fas fa-info-circle" style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem;"></i>
            <p>Select a variable to view its properties</p>
          </div>
        `;
        panel.style.display = 'flex';
      }
    }

    editVariable(key) {
      const variable = this.variables[key];
      if (!variable) return;

      this.selectedVariable = key;

      // Populate modal with existing values
      document.getElementById('varKey').value = key;
      document.getElementById('varKey').disabled = true; // Can't change key when editing
      document.getElementById('varType').value = variable.type;
      document.getElementById('varScope').value = variable.scope;
      document.getElementById('varLocked').checked = variable.locked || false;
      document.getElementById('varReadonly').checked = variable.readonly || false;
      document.getElementById('varDescription').value = variable.description || '';

      // Handle default value based on type
      if (variable.type === 'array') {
        this.toggleArrayConfigurator('array');

        // Populate array columns
        if (variable.arrayConfig?.columns) {
          variable.arrayConfig.columns.forEach((col, index) => {
            if (index > 0) this.addArrayColumn();
            setTimeout(() => {
              document.getElementById(`arrayCol${index}Name`).value = col.name;
              document.getElementById(`arrayCol${index}Type`).value = col.type;
            }, 10);
          });
        }

        // Populate array items
        if (variable.arrayConfig?.items) {
          setTimeout(() => {
            variable.arrayConfig.items.forEach(() => {
              this.addArrayItem();
            });

            // Fill in values
            const tbody = document.getElementById('arrayItemsTable');
            const rows = tbody.querySelectorAll('tr');
            variable.arrayConfig.items.forEach((item, rowIndex) => {
              const row = rows[rowIndex];
              if (row) {
                const cells = row.querySelectorAll('.array-cell');
                Object.values(item).forEach((value, colIndex) => {
                  if (cells[colIndex]) {
                    cells[colIndex].value = value;
                  }
                });
              }
            });
          }, 50);
        }
      } else {
        this.toggleArrayConfigurator(variable.type);
        const displayValue = typeof variable.defaultValue === 'object'
          ? JSON.stringify(variable.defaultValue)
          : String(variable.defaultValue);
        document.getElementById('varDefault').value = displayValue;
      }

      // Populate associations
      if (variable.associations) {
        document.getElementById('assocForms').value = variable.associations.forms?.join(', ') || '';
        document.getElementById('assocObjects').value = variable.associations.objects?.join(', ') || '';
        document.getElementById('assocWorkflows').value = variable.associations.workflows?.join(', ') || '';
        document.getElementById('assocParameters').value = variable.associations.parameters?.join(', ') || '';
      }

      this.showAddVariableModal();
    }

    deleteVariable(key) {
      const variable = this.variables[key];

      if (variable?.locked) {
        alert(`Variable "${key}" is locked and cannot be deleted.`);
        return;
      }

      if (confirm(`Delete variable "${key}"?\n\nThis will remove the variable from the form.`)) {
        delete this.variables[key];
        window.FORM_DESIGNER_STATE.variables = this.variables;
        window.FORM_DESIGNER_STATE.isDirty = true;

        if (this.selectedVariable === key) {
          this.selectedVariable = null;
          this.clearPropertiesPanel();
        }

        this.renderVariablesTable();
        console.log('[Variables Manager] Deleted variable:', key);
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
      const json = JSON.stringify(this.variables, null, 2);

      // Copy to clipboard
      navigator.clipboard.writeText(json).then(() => {
        alert('Variables JSON copied to clipboard!');
      }).catch(() => {
        // Fallback: show in prompt
        prompt('Variables JSON (copy this):', json);
      });
    }

    getVariableValue(key) {
      return this.variables[key]?.defaultValue;
    }

    setVariableValue(key, value) {
      if (this.variables[key]) {
        const oldValue = this.variables[key].defaultValue;
        this.variables[key].defaultValue = value;

        // Trigger variable change events if Event Handlers manager is available
        if (window.eventHandlersManager) {
          const changeHandlers = window.eventHandlersManager.eventHandlers?.filter(h =>
            h.objectId === `_var_${key}` && h.trigger === 'onVariableChange'
          ) || [];

          changeHandlers.forEach(handler => {
            console.log('[Variables Manager] Variable change event triggered:', key, 'from', oldValue, 'to', value);
            // Event execution would happen at runtime
          });
        }

        this.renderVariablesTable();
        if (this.selectedVariable === key) {
          this.showVariableInProperties(key);
        }
      }
    }

    getAllVariables() {
      return this.variables;
    }

    loadVariables(variables) {
      this.variables = variables;
      window.FORM_DESIGNER_STATE.variables = this.variables;
      this.renderVariablesTable();
      this.clearPropertiesPanel();
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
