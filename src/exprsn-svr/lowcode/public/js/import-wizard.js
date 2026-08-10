/**
 * Import Wizard - Client-side JavaScript
 *
 * Handles multi-step data import workflow with transformation pipeline.
 */

class ImportWizard {
  constructor(dataSourceId, appId) {
    this.dataSourceId = dataSourceId;
    this.appId = appId;
    this.currentStep = 1;
    this.totalSteps = 6;

    this.config = {
      sourceType: null,
      file: null,
      fileName: null,
      parserOptions: {},
      previewData: null,
      schema: null,
      transformations: [],
      columns: []
    };
  }

  init() {
    this.setupFileUpload();
    this.updateNavigation();
  }

  /**
   * Setup file upload with drag-and-drop
   */
  setupFileUpload() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');

    uploadArea.addEventListener('click', () => fileInput.click());

    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        this.handleFileSelected(files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.handleFileSelected(e.target.files[0]);
      }
    });
  }

  /**
   * Handle file selection
   */
  async handleFileSelected(file) {
    this.config.file = file;
    this.config.fileName = file.name;

    // Auto-detect file type if not selected
    if (!this.config.sourceType) {
      const ext = file.name.split('.').pop().toLowerCase();
      this.config.sourceType = ext === 'xlsx' || ext === 'xls' ? 'excel' : ext;
    }

    // Show file info
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileSize').textContent = this.formatFileSize(file.size);
    document.getElementById('uploadedFileInfo').style.display = 'block';

    // Render parser options
    this.renderParserOptions();
  }

  /**
   * Format file size
   */
  formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  /**
   * Render parser-specific options
   */
  renderParserOptions() {
    const container = document.getElementById('parserOptions');
    let html = '<h3><i class="fas fa-sliders-h"></i> Parser Options</h3>';

    switch (this.config.sourceType) {
      case 'csv':
      case 'tsv':
        html += `
          <div class="form-group">
            <label>Delimiter</label>
            <select id="optDelimiter" class="form-control">
              <option value="">Auto-detect</option>
              <option value=",">Comma (,)</option>
              <option value=";">Semicolon (;)</option>
              <option value="\t">Tab</option>
              <option value="|">Pipe (|)</option>
            </select>
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" id="optHasHeaders" checked> First row contains headers
            </label>
          </div>
          <div class="form-group">
            <label>Encoding</label>
            <select id="optEncoding" class="form-control">
              <option value="">Auto-detect</option>
              <option value="utf-8">UTF-8</option>
              <option value="iso-8859-1">ISO-8859-1</option>
              <option value="windows-1252">Windows-1252</option>
            </select>
          </div>
        `;
        break;

      case 'excel':
        html += `
          <div class="form-group">
            <label>Sheet Name</label>
            <input type="text" id="optSheetName" class="form-control" placeholder="Leave empty for first sheet">
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" id="optHasHeaders" checked> First row contains headers
            </label>
          </div>
        `;
        break;

      case 'json':
        html += `
          <div class="form-group">
            <label>Array Path (optional)</label>
            <input type="text" id="optArrayPath" class="form-control" placeholder="e.g., data.items">
            <small>JSONPath to array data (leave empty for root)</small>
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" id="optFlatten" checked> Flatten nested objects
            </label>
          </div>
        `;
        break;

      case 'xml':
        html += `
          <div class="form-group">
            <label>Array Path (optional)</label>
            <input type="text" id="optArrayPath" class="form-control" placeholder="e.g., root.items.item">
            <small>Path to repeating elements</small>
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" id="optFlatten" checked> Flatten nested elements
            </label>
          </div>
        `;
        break;
    }

    container.innerHTML = html;
  }

  /**
   * Collect parser options from UI
   */
  collectParserOptions() {
    const options = {};

    switch (this.config.sourceType) {
      case 'csv':
      case 'tsv':
        const delimiter = document.getElementById('optDelimiter')?.value;
        if (delimiter) options.delimiter = delimiter;
        options.hasHeaders = document.getElementById('optHasHeaders')?.checked || true;
        const encoding = document.getElementById('optEncoding')?.value;
        if (encoding) options.encoding = encoding;
        break;

      case 'excel':
        const sheetName = document.getElementById('optSheetName')?.value;
        if (sheetName) options.sheetName = sheetName;
        options.hasHeaders = document.getElementById('optHasHeaders')?.checked || true;
        break;

      case 'json':
        const jsonArrayPath = document.getElementById('optArrayPath')?.value;
        if (jsonArrayPath) options.arrayPath = jsonArrayPath;
        options.flatten = document.getElementById('optFlatten')?.checked || true;
        break;

      case 'xml':
        const xmlArrayPath = document.getElementById('optArrayPath')?.value;
        if (xmlArrayPath) options.arrayPath = xmlArrayPath;
        options.flatten = document.getElementById('optFlatten')?.checked || true;
        break;
    }

    this.config.parserOptions = options;
  }

  /**
   * Load preview data
   */
  async loadPreview() {
    document.getElementById('previewLoading').style.display = 'flex';
    document.getElementById('previewContent').style.display = 'none';

    try {
      this.collectParserOptions();

      const formData = new FormData();
      formData.append('file', this.config.file);
      formData.append('sourceType', this.config.sourceType);
      formData.append('parserOptions', JSON.stringify(this.config.parserOptions));
      formData.append('dataSourceId', this.dataSourceId);

      const response = await fetch('/lowcode/api/data-imports/preview', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Preview failed');
      }

      this.config.previewData = result.preview.original;
      this.config.schema = result.schema;

      this.renderPreview();
    } catch (error) {
      console.error('Preview failed:', error);
      alert(`Preview failed: ${error.message}`);
    } finally {
      document.getElementById('previewLoading').style.display = 'none';
    }
  }

  /**
   * Render data preview table
   */
  renderPreview() {
    const table = document.getElementById('previewTable');
    const data = this.config.previewData;

    if (!data || data.length === 0) {
      table.innerHTML = '<tr><td colspan="100">No data to preview</td></tr>';
      return;
    }

    // Render headers
    const columns = Object.keys(data[0]);
    let html = '<thead><tr>';
    columns.forEach(col => {
      html += `<th>${col}</th>`;
    });
    html += '</tr></thead>';

    // Render rows
    html += '<tbody>';
    data.forEach((row, index) => {
      if (index >= 10) return; // Limit to 10 rows
      html += '<tr>';
      columns.forEach(col => {
        const value = row[col];
        html += `<td>${value !== null && value !== undefined ? value : '<em>null</em>'}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody>';

    table.innerHTML = html;
    document.getElementById('previewContent').style.display = 'block';
  }

  /**
   * Render column configuration
   */
  renderColumnConfig() {
    const container = document.getElementById('columnList');

    if (!this.config.schema || this.config.schema.columns.length === 0) {
      container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">No columns to configure</p>';
      return;
    }

    let html = '';
    this.config.schema.columns.forEach(col => {
      html += `
        <div class="column-item">
          <div class="column-name">${col.name}</div>
          <select data-column="${col.name}" data-field="type" onchange="window.importWizard.updateColumnConfig()">
            <option value="string" ${col.type === 'string' ? 'selected' : ''}>Text</option>
            <option value="number" ${col.type === 'number' ? 'selected' : ''}>Number</option>
            <option value="date" ${col.type === 'date' ? 'selected' : ''}>Date</option>
            <option value="boolean" ${col.type === 'boolean' ? 'selected' : ''}>Boolean</option>
            <option value="email" ${col.type === 'email' ? 'selected' : ''}>Email</option>
            <option value="url" ${col.type === 'url' ? 'selected' : ''}>URL</option>
          </select>
          <label style="display: flex; align-items: center; gap: 0.5rem;">
            <input type="checkbox" data-column="${col.name}" data-field="nullable" ${col.nullable ? 'checked' : ''} onchange="window.importWizard.updateColumnConfig()">
            <span>Nullable</span>
          </label>
          <div style="color: var(--text-secondary); font-size: 0.8125rem;">
            ${col.uniqueCount} unique values
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  /**
   * Update column configuration
   */
  updateColumnConfig() {
    const items = document.querySelectorAll('.column-item select, .column-item input[type="checkbox"]');
    this.config.columns = [];

    items.forEach(item => {
      const columnName = item.dataset.column;
      const field = item.dataset.field;
      const value = item.type === 'checkbox' ? item.checked : item.value;

      let existing = this.config.columns.find(c => c.name === columnName);
      if (!existing) {
        existing = { name: columnName };
        this.config.columns.push(existing);
      }

      existing[field] = value;
    });
  }

  /**
   * Render transformation list
   */
  renderTransformations() {
    const container = document.getElementById('transformationList');

    if (this.config.transformations.length === 0) {
      container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">No transformations added yet. Click "Add Step" to begin.</p>';
      return;
    }

    let html = '';
    this.config.transformations.forEach((trans, index) => {
      html += `
        <div class="transformation-step">
          <div class="step-order">${index + 1}</div>
          <div class="step-details">
            <div class="step-type">${this.getTransformationLabel(trans.type)}</div>
            <div class="step-params">${this.formatTransformationParams(trans)}</div>
          </div>
          <button class="btn btn-sm btn-danger" onclick="window.importWizard.removeTransformation(${index})">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  /**
   * Get human-readable transformation label
   */
  getTransformationLabel(type) {
    const labels = {
      renameColumn: 'Rename Column',
      removeColumn: 'Remove Column',
      duplicateColumn: 'Duplicate Column',
      splitColumn: 'Split Column',
      mergeColumns: 'Merge Columns',
      changeType: 'Change Type',
      removeErrors: 'Remove Errors',
      removeDuplicates: 'Remove Duplicates',
      removeNulls: 'Remove Nulls',
      replaceValue: 'Replace Value',
      trim: 'Trim Whitespace',
      filterRows: 'Filter Rows',
      sortRows: 'Sort Rows',
      addColumn: 'Add Column',
      groupBy: 'Group By'
    };
    return labels[type] || type;
  }

  /**
   * Format transformation parameters for display
   */
  formatTransformationParams(trans) {
    const params = trans.params || {};
    return Object.entries(params).map(([key, value]) => {
      return `${key}: ${JSON.stringify(value)}`;
    }).join(', ');
  }

  /**
   * Add transformation (show modal)
   */
  addTransformation() {
    // In a real implementation, this would show a modal to configure the transformation
    const type = prompt('Enter transformation type (e.g., removeDuplicates, trim):');
    if (!type) return;

    this.config.transformations.push({
      type,
      params: {}
    });

    this.renderTransformations();
  }

  /**
   * Remove transformation
   */
  removeTransformation(index) {
    this.config.transformations.splice(index, 1);
    this.renderTransformations();
  }

  /**
   * Render summary
   */
  renderSummary() {
    document.getElementById('summarySourceType').textContent = this.config.sourceType.toUpperCase();
    document.getElementById('summaryRowCount').textContent = this.config.previewData?.length || 0;
    document.getElementById('summaryColumnCount').textContent = this.config.schema?.columns.length || 0;
    document.getElementById('summaryTransformationCount').textContent = this.config.transformations.length;

    const details = document.getElementById('summaryDetails');
    details.innerHTML = `
      <div style="margin-bottom: 1rem;">
        <strong>File:</strong> ${this.config.fileName}
      </div>
      <div style="margin-bottom: 1rem;">
        <strong>Parser Options:</strong> ${JSON.stringify(this.config.parserOptions, null, 2)}
      </div>
      <div style="margin-bottom: 1rem;">
        <strong>Columns:</strong> ${this.config.schema?.columns.map(c => c.name).join(', ')}
      </div>
      <div>
        <strong>Transformations:</strong> ${this.config.transformations.length} steps configured
      </div>
    `;
  }

  /**
   * Execute final import
   */
  async executeImport() {
    try {
      this.collectParserOptions();

      const formData = new FormData();
      formData.append('file', this.config.file);
      formData.append('sourceType', this.config.sourceType);
      formData.append('parserOptions', JSON.stringify(this.config.parserOptions));
      formData.append('transformations', JSON.stringify(this.config.transformations));
      formData.append('dataSourceId', this.dataSourceId);
      formData.append('inferSchema', 'true');

      const response = await fetch('/lowcode/api/data-imports', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Import failed');
      }

      alert(`Import successful! ${result.stats.rowsImported} rows imported.`);
      window.location.href = `/lowcode/datasources/${this.dataSourceId}`;
    } catch (error) {
      console.error('Import failed:', error);
      alert(`Import failed: ${error.message}`);
    }
  }

  /**
   * Navigation methods
   */
  nextStep() {
    if (this.currentStep < this.totalSteps) {
      // Validate current step
      if (!this.validateStep(this.currentStep)) {
        return;
      }

      // Load data for next step
      if (this.currentStep === 2) {
        this.loadPreview();
      } else if (this.currentStep === 4) {
        this.renderColumnConfig();
      } else if (this.currentStep === 5) {
        this.renderSummary();
      }

      this.currentStep++;
      this.goToStep(this.currentStep);
    }
  }

  previousStep() {
    if (this.currentStep > 1) {
      this.currentStep--;
      this.goToStep(this.currentStep);
    }
  }

  goToStep(step) {
    if (step < 1 || step > this.totalSteps) return;

    this.currentStep = step;

    // Update step items
    document.querySelectorAll('.step-item').forEach((item, index) => {
      item.classList.remove('active', 'completed');
      if (index + 1 === step) {
        item.classList.add('active');
      } else if (index + 1 < step) {
        item.classList.add('completed');
      }
    });

    // Update panels
    document.querySelectorAll('.step-panel').forEach((panel, index) => {
      panel.classList.remove('active');
      if (index + 1 === step) {
        panel.classList.add('active');
      }
    });

    this.updateNavigation();
  }

  updateNavigation() {
    document.getElementById('currentStep').textContent = this.currentStep;
    document.getElementById('btnPrevious').disabled = this.currentStep === 1;

    if (this.currentStep === this.totalSteps) {
      document.getElementById('btnNext').style.display = 'none';
      document.getElementById('btnImport').style.display = 'inline-block';
    } else {
      document.getElementById('btnNext').style.display = 'inline-block';
      document.getElementById('btnImport').style.display = 'none';
    }
  }

  validateStep(step) {
    switch (step) {
      case 1:
        if (!this.config.sourceType) {
          alert('Please select a data source type');
          return false;
        }
        return true;

      case 2:
        if (!this.config.file) {
          alert('Please upload a file');
          return false;
        }
        return true;

      default:
        return true;
    }
  }
}

// Global functions for onclick handlers
function selectSourceType(type) {
  window.importWizard.config.sourceType = type;

  document.querySelectorAll('.source-card').forEach(card => {
    card.classList.remove('selected');
  });

  document.querySelector(`.source-card[data-type="${type}"]`).classList.add('selected');
}

function addTransformation() {
  window.importWizard.addTransformation();
}

function nextStep() {
  window.importWizard.nextStep();
}

function previousStep() {
  window.importWizard.previousStep();
}

function goToStep(step) {
  window.importWizard.goToStep(step);
}

function executeImport() {
  window.importWizard.executeImport();
}

function cancelWizard() {
  if (confirm('Are you sure you want to cancel the import?')) {
    window.history.back();
  }
}
