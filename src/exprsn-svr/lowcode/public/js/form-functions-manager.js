/**
 * ═══════════════════════════════════════════════════════════
 * Functions Manager - Custom JavaScript Functions
 * Manages function table, Monaco editor, and function execution
 * ═══════════════════════════════════════════════════════════
 */

(function() {
  'use strict';

  class FunctionsManager {
    constructor() {
      this.functions = {};
      this.selectedFunction = null;
      this.editor = null;

      this.init();
    }

    init() {
      this.setupEventListeners();
      this.renderFunctionsTable();
    }

    setupEventListeners() {
      // Add Function button
      document.getElementById('addFunctionBtn')?.addEventListener('click', () => {
        this.showAddFunctionModal();
      });

      // Save Function Metadata button (in modal)
      document.getElementById('saveFunctionMetaBtn')?.addEventListener('click', () => {
        this.createFunction();
      });

      // Save Function Code button
      document.getElementById('saveFunctionBtn')?.addEventListener('click', () => {
        this.saveFunctionCode();
      });

      // Test Function button
      document.getElementById('testFunctionBtn')?.addEventListener('click', () => {
        this.testFunction();
      });
    }

    showAddFunctionModal() {
      const modal = document.getElementById('addFunctionModal');
      modal.classList.add('active');

      // Clear previous values
      this.clearFunctionModal();
    }

    closeAddFunctionModal() {
      // Clear form fields
      this.clearFunctionModal();

      // Close modal
      document.getElementById('addFunctionModal').classList.remove('active');

      console.log('[Functions Manager] Modal closed and cleared');
    }

    clearFunctionModal() {
      document.getElementById('funcName').value = '';
      this.clearParametersTable();
      document.getElementById('funcReturn').value = 'void';
      document.getElementById('funcAsync').checked = false;
      document.getElementById('funcDesc').value = '';
    }

    clearParametersTable() {
      const tbody = document.getElementById('funcParamsTable');
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="padding: 1rem; text-align: center; color: var(--text-secondary); font-size: 0.875rem;">
            No parameters. Click "+ Add" to add a parameter.
          </td>
        </tr>
      `;
    }

    addParameterRow() {
      const tbody = document.getElementById('funcParamsTable');

      // Remove empty message if it exists
      const emptyRow = tbody.querySelector('tr td[colspan="4"]');
      if (emptyRow) {
        tbody.innerHTML = '';
      }

      const rowIndex = tbody.children.length;
      const row = document.createElement('tr');
      row.innerHTML = `
        <td style="padding: 0.5rem;">
          <input type="text" class="property-input" placeholder="paramName" style="font-size: 0.875rem; padding: 0.375rem;">
        </td>
        <td style="padding: 0.5rem;">
          <select class="property-input" style="font-size: 0.875rem; padding: 0.375rem;">
            <option value="any">any</option>
            <option value="string">string</option>
            <option value="number">number</option>
            <option value="boolean">boolean</option>
            <option value="object">object</option>
            <option value="array">array</option>
            <option value="function">function</option>
            <option value="Date">Date</option>
            <option value="RegExp">RegExp</option>
            <option value="Promise">Promise</option>
            <option value="Map">Map</option>
            <option value="Set">Set</option>
            <option value="Symbol">Symbol</option>
            <option value="BigInt">BigInt</option>
          </select>
        </td>
        <td style="padding: 0.5rem; text-align: center;">
          <input type="checkbox" style="cursor: pointer;">
        </td>
        <td style="padding: 0.5rem; text-align: center;">
          <button type="button" class="btn btn-sm btn-danger" onclick="functionsManager.removeParameterRow(this)" title="Remove parameter">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      `;
      tbody.appendChild(row);

      console.log('[Functions Manager] Added parameter row');
    }

    removeParameterRow(button) {
      const row = button.closest('tr');
      const tbody = row.parentElement;
      row.remove();

      // If no rows left, show empty message
      if (tbody.children.length === 0) {
        this.clearParametersTable();
      }

      console.log('[Functions Manager] Removed parameter row');
    }

    getParametersFromTable() {
      const tbody = document.getElementById('funcParamsTable');
      const rows = tbody.querySelectorAll('tr');
      const parameters = [];

      rows.forEach(row => {
        const nameInput = row.querySelector('input[type="text"]');
        const typeSelect = row.querySelector('select');
        const requiredCheckbox = row.querySelector('input[type="checkbox"]');

        if (nameInput && typeSelect) {
          const name = nameInput.value.trim();
          if (name) {
            parameters.push({
              name,
              type: typeSelect.value,
              required: requiredCheckbox?.checked || false
            });
          }
        }
      });

      return parameters;
    }

    createFunction() {
      const name = document.getElementById('funcName').value.trim();
      const parameters = this.getParametersFromTable();
      const returnType = document.getElementById('funcReturn').value;
      const isAsync = document.getElementById('funcAsync').checked;
      const description = document.getElementById('funcDesc').value.trim();

      if (!name) {
        alert('Function name is required');
        return;
      }

      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
        alert('Function name must be a valid JavaScript identifier');
        return;
      }

      if (this.functions[name]) {
        alert('A function with this name already exists');
        return;
      }

      // Generate code using the global function (which has better JSDoc)
      const code = typeof window.generateFunctionCode === 'function'
        ? window.generateFunctionCode(name, parameters, returnType, isAsync, description)
        : this.generateDefaultCode(name, parameters, isAsync);

      // Create function object
      this.functions[name] = {
        name,
        params: parameters,  // Array of {name, type, required} objects
        returnType,
        isAsync,
        description,
        code
      };

      // Save to global state
      window.FORM_DESIGNER_STATE.customFunctions = this.functions;
      window.FORM_DESIGNER_STATE.isDirty = true;

      // Update UI
      this.renderFunctionsTable();
      this.selectFunction(name);

      // Set the current editing function for Monaco integration
      if (typeof window.currentEditingFunction !== 'undefined') {
        window.currentEditingFunction = name;
      }

      // Close modal
      document.getElementById('addFunctionModal').classList.remove('active');

      console.log('[Functions Manager] Function created:', name, 'with', parameters.length, 'parameters');
    }

    generateDefaultCode(name, parameters, isAsync = false) {
      // Generate JSDoc comment
      let jsdoc = `/**\n * Function: ${name}${isAsync ? ' (async)' : ''}\n`;
      if (parameters.length > 0) {
        jsdoc += parameters.map(p =>
          ` * @param {${p.type}} ${p.name}${p.required ? ' - Required parameter' : ''}`
        ).join('\n') + '\n';
      }
      jsdoc += ` */`;

      const asyncKeyword = isAsync ? 'async ' : '';
      const paramNames = parameters.map(p => p.name).join(', ');

      return `${jsdoc}\n${asyncKeyword}function ${name}(${paramNames}) {\n  // Write your code here\n  ${isAsync ? '// You can use await inside this function\n  ' : ''}\n  return;\n}`;
    }

    renderFunctionsTable() {
      const tbody = document.getElementById('functionsTableBody');
      const functionsArray = Object.values(this.functions);

      if (functionsArray.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="5" class="text-muted" style="text-align: center; padding: 2rem;">
              No custom functions defined. Click "Add Function" to create one.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = functionsArray.map(func => {
        // Handle both old (string array) and new (object array) parameter formats
        let paramsDisplay = '-';
        if (func.params && func.params.length > 0) {
          if (typeof func.params[0] === 'string') {
            // Old format: array of strings
            paramsDisplay = func.params.join(', ');
          } else {
            // New format: array of {name, type, required} objects
            paramsDisplay = func.params.map(p =>
              `${p.name}: ${p.type}${p.required ? '*' : ''}`
            ).join(', ');
          }
        }

        return `
          <tr class="${this.selectedFunction === func.name ? 'selected' : ''}"
              onclick="functionsManager.selectFunction('${func.name}')">
            <td><strong>${func.name}</strong></td>
            <td style="font-family: monospace; font-size: 0.875rem;">${paramsDisplay}</td>
            <td>${func.returnType}</td>
            <td>${func.description || '-'}</td>
            <td>
              <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); functionsManager.deleteFunction('${func.name}')">
                <i class="fas fa-trash"></i>
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }

    selectFunction(name) {
      this.selectedFunction = name;
      const func = this.functions[name];

      if (!func) return;

      // Update table selection
      this.renderFunctionsTable();

      // Update editor title
      let paramsList = '';
      if (func.params && func.params.length > 0) {
        if (typeof func.params[0] === 'string') {
          // Old format
          paramsList = func.params.join(', ');
        } else {
          // New format
          paramsList = func.params.map(p => `${p.name}: ${p.type}`).join(', ');
        }
      }
      document.getElementById('currentFunctionName').textContent =
        `${func.name}(${paramsList}) : ${func.returnType}`;

      // Set global current editing function for Monaco integration
      if (typeof window.currentEditingFunction !== 'undefined') {
        window.currentEditingFunction = name;
      }

      // Use global Monaco editor if available
      if (window.monacoEditor) {
        if (typeof window.setMonacoCode === 'function') {
          window.setMonacoCode(func.code);
        } else {
          window.monacoEditor.setValue(func.code);
        }
      } else if (this.editor) {
        // Fallback to local editor
        this.editor.setValue(func.code);
      } else {
        this.initializeEditor(func.code);
      }
    }

    initializeEditor(code) {
      require(['vs/editor/editor.main'], () => {
        this.editor = monaco.editor.create(document.getElementById('functionEditor'), {
          value: code,
          language: 'javascript',
          theme: 'vs-light',
          minimap: { enabled: false },
          fontSize: 14,
          lineNumbers: 'on',
          automaticLayout: true,
          scrollBeyondLastLine: false
        });

        // Mark as dirty on changes
        this.editor.onDidChangeModelContent(() => {
          window.FORM_DESIGNER_STATE.isDirty = true;
        });
      });
    }

    saveFunctionCode() {
      if (!this.selectedFunction) {
        alert('No function selected');
        return;
      }

      // Get code from global Monaco or local editor
      let code;
      if (window.monacoEditor) {
        code = typeof window.getMonacoCode === 'function'
          ? window.getMonacoCode()
          : window.monacoEditor.getValue();
      } else if (this.editor) {
        code = this.editor.getValue();
      } else {
        alert('Editor not initialized');
        return;
      }

      this.functions[this.selectedFunction].code = code;

      // Save to global state
      window.FORM_DESIGNER_STATE.customFunctions = this.functions;
      window.FORM_DESIGNER_STATE.isDirty = true;

      alert('Function code saved!');
    }

    deleteFunction(name) {
      if (!confirm(`Delete function "${name}"?`)) {
        return;
      }

      delete this.functions[name];
      window.FORM_DESIGNER_STATE.customFunctions = this.functions;
      window.FORM_DESIGNER_STATE.isDirty = true;

      // Clear editor if deleted function was selected
      if (this.selectedFunction === name) {
        this.selectedFunction = null;
        document.getElementById('currentFunctionName').textContent = 'Select a function to edit';
        if (this.editor) {
          this.editor.setValue('');
        }
      }

      this.renderFunctionsTable();
    }

    testFunction() {
      if (!this.selectedFunction || !this.editor) {
        alert('No function selected');
        return;
      }

      const code = this.editor.getValue();

      try {
        // Create a safe execution context
        const testContext = {
          console: {
            log: (...args) => {
              console.log('[Test]', ...args);
              return args.join(' ');
            }
          },
          alert: (msg) => {
            console.log('[Test Alert]', msg);
            return msg;
          }
        };

        // Execute the function code
        const func = new Function('context', `
          with (context) {
            ${code}
            return ${this.selectedFunction};
          }
        `)(testContext);

        // Prompt for test parameters
        const funcDef = this.functions[this.selectedFunction];
        const params = funcDef.params;
        const paramValues = [];

        if (params.length > 0) {
          const input = prompt(`Enter test parameters (comma-separated):\n${params.join(', ')}`);
          if (input === null) return; // User canceled

          paramValues.push(...input.split(',').map(v => {
            v = v.trim();
            // Try to parse as JSON
            try {
              return JSON.parse(v);
            } catch {
              return v;
            }
          }));
        }

        // Execute function
        const result = func(...paramValues);

        // Show result
        alert(`Function executed successfully!\n\nResult: ${JSON.stringify(result, null, 2)}`);
        console.log('[Test Result]', result);

      } catch (error) {
        alert(`Function test failed:\n\n${error.message}`);
        console.error('[Test Error]', error);
      }
    }

    getFunctionCode(name) {
      return this.functions[name]?.code || null;
    }

    getAllFunctions() {
      return this.functions;
    }

    importFunctions(functionsData) {
      this.functions = functionsData;
      window.FORM_DESIGNER_STATE.customFunctions = this.functions;
      this.renderFunctionsTable();
    }
  }

  // Initialize when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    window.functionsManager = new FunctionsManager();

    // Load existing functions from state
    if (window.FORM_DESIGNER_STATE.customFunctions) {
      window.functionsManager.importFunctions(window.FORM_DESIGNER_STATE.customFunctions);
    }
  });

})();
