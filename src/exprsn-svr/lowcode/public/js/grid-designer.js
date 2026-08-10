/**
 * ═══════════════════════════════════════════════════════════
 * Grid Designer
 * Visual interface for creating and configuring data grids
 * ═══════════════════════════════════════════════════════════
 */

const GridDesigner = {
  // State
  gridId: window.GRID_ID,
  applicationId: window.APPLICATION_ID,
  gridData: window.GRID_DATA || {},
  columns: [],
  dataSources: [],
  selectedColumn: null,
  previewEngine: null,
  unsavedChanges: false,

  /**
   * ═══════════════════════════════════════════════════════════
   * INITIALIZATION
   * ═══════════════════════════════════════════════════════════
   */

  async init() {
    try {
      console.log('[GridDesigner] Initializing...', {
        gridId: this.gridId,
        applicationId: this.applicationId
      });

      // Load grid data if editing existing grid
      if (this.gridId) {
        await this.loadGrid();
      } else {
        // Initialize empty grid
        this.gridData = {
          name: 'new_grid',
          displayName: 'Unnamed Grid',
          applicationId: this.applicationId,
          columns: [],
          gridType: 'readonly',
          pagination: {
            enabled: true,
            pageSize: 25
          },
          dataSource: null,
          filters: [],
          sorting: [],
          actions: [],
          settings: {}
        };
      }

      // Load available data sources
      await this.loadDataSources();

      // Initialize columns from grid data
      this.columns = this.gridData.columns || [];

      // Render UI
      this.render();

      // Initialize preview
      this.initPreview();

      // Set up event listeners
      this.setupEventListeners();

      // Track unsaved changes
      this.trackChanges();

      console.log('[GridDesigner] Initialization complete');
    } catch (error) {
      console.error('[GridDesigner] Initialization failed:', error);
      this.showError('Failed to initialize grid designer: ' + error.message);
    }
  },

  /**
   * Load grid from API
   */
  async loadGrid() {
    try {
      const response = await fetch(`/lowcode/api/grids/${this.gridId}`);
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Failed to load grid');
      }

      this.gridData = result.data;
      console.log('[GridDesigner] Grid loaded:', this.gridData);
    } catch (error) {
      console.error('[GridDesigner] Failed to load grid:', error);
      throw error;
    }
  },

  /**
   * Load available data sources
   */
  async loadDataSources() {
    try {
      // Load entities for this application
      const response = await fetch(`/lowcode/api/entities?applicationId=${this.applicationId}`);
      const result = await response.json();

      if (result.success) {
        this.dataSources = result.data.entities || [];
        this.renderDataSourceSelect();
      }
    } catch (error) {
      console.error('[GridDesigner] Failed to load data sources:', error);
    }
  },

  /**
   * ═══════════════════════════════════════════════════════════
   * RENDERING
   * ═══════════════════════════════════════════════════════════
   */

  render() {
    this.renderColumns();
    this.renderDataSourceSelect();
    this.renderSettings();
  },

  renderColumns() {
    const container = document.getElementById('columnsList');

    if (this.columns.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-columns"></i>
          <p>No columns yet</p>
          <button class="btn btn-primary btn-sm" onclick="GridDesigner.openAddColumnModal()">
            <i class="fas fa-plus"></i> Add First Column
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = this.columns.map((column, index) => `
      <div class="column-item ${this.selectedColumn === column ? 'active' : ''}"
           onclick="GridDesigner.selectColumn(${index})">
        <div class="column-header">
          <span class="column-name">${this.escapeHtml(column.label || column.field)}</span>
          <span class="column-type">${column.type || 'text'}</span>
        </div>
        <div class="column-actions">
          <button class="column-action-btn" onclick="event.stopPropagation(); GridDesigner.editColumn(${index})">
            <i class="fas fa-edit"></i>
          </button>
          <button class="column-action-btn" onclick="event.stopPropagation(); GridDesigner.removeColumn(${index})">
            <i class="fas fa-trash"></i>
          </button>
          ${index > 0 ? `<button class="column-action-btn" onclick="event.stopPropagation(); GridDesigner.moveColumn(${index}, ${index - 1})">
            <i class="fas fa-arrow-up"></i>
          </button>` : ''}
          ${index < this.columns.length - 1 ? `<button class="column-action-btn" onclick="event.stopPropagation(); GridDesigner.moveColumn(${index}, ${index + 1})">
            <i class="fas fa-arrow-down"></i>
          </button>` : ''}
        </div>
      </div>
    `).join('');
  },

  renderDataSourceSelect() {
    const select = document.getElementById('dataSourceId');
    if (!select) return;

    select.innerHTML = `
      <option value="">Select data source...</option>
      ${this.dataSources.map(ds => `
        <option value="${ds.id}" ${this.gridData.dataSource?.id === ds.id ? 'selected' : ''}>
          ${this.escapeHtml(ds.displayName || ds.name)}
        </option>
      `).join('')}
    `;
  },

  renderSettings() {
    // Set grid type
    const gridTypeSelect = document.getElementById('gridType');
    if (gridTypeSelect) {
      gridTypeSelect.value = this.gridData.gridType || 'readonly';
    }

    // Set pagination
    const paginationEnabled = document.getElementById('paginationEnabled');
    if (paginationEnabled) {
      paginationEnabled.checked = this.gridData.pagination?.enabled !== false;
    }

    const pageSize = document.getElementById('pageSize');
    if (pageSize) {
      pageSize.value = this.gridData.pagination?.pageSize || 25;
    }

    // Set features
    const sortingEnabled = document.getElementById('sortingEnabled');
    if (sortingEnabled) {
      sortingEnabled.checked = this.gridData.settings?.sortingEnabled !== false;
    }

    const filteringEnabled = document.getElementById('filteringEnabled');
    if (filteringEnabled) {
      filteringEnabled.checked = this.gridData.settings?.filteringEnabled !== false;
    }

    const exportEnabled = document.getElementById('exportEnabled');
    if (exportEnabled) {
      exportEnabled.checked = this.gridData.settings?.exportEnabled === true;
    }
  },

  /**
   * ═══════════════════════════════════════════════════════════
   * COLUMN MANAGEMENT
   * ═══════════════════════════════════════════════════════════
   */

  openAddColumnModal() {
    document.getElementById('addColumnModal').classList.add('show');
    // Clear form
    document.getElementById('columnName').value = '';
    document.getElementById('columnDisplayName').value = '';
    document.getElementById('columnType').value = 'text';
    document.getElementById('columnWidth').value = '';
    document.getElementById('columnSortable').checked = true;
    document.getElementById('columnVisible').checked = true;
  },

  closeAddColumnModal() {
    document.getElementById('addColumnModal').classList.remove('show');
  },

  addColumn() {
    const name = document.getElementById('columnName').value.trim();
    const displayName = document.getElementById('columnDisplayName').value.trim();
    const type = document.getElementById('columnType').value;
    const width = document.getElementById('columnWidth').value;
    const sortable = document.getElementById('columnSortable').checked;
    const visible = document.getElementById('columnVisible').checked;

    // Validation
    if (!name) {
      this.showError('Column name is required');
      return;
    }

    if (!displayName) {
      this.showError('Display name is required');
      return;
    }

    // Check for duplicate column names
    if (this.columns.some(col => col.field === name)) {
      this.showError('A column with this name already exists');
      return;
    }

    // Create column
    const column = {
      field: name,
      label: displayName,
      type: type,
      width: width ? parseInt(width) : undefined,
      sortable: sortable,
      visible: visible
    };

    this.columns.push(column);
    this.gridData.columns = this.columns;

    this.unsavedChanges = true;
    this.render();
    this.refreshPreview();
    this.closeAddColumnModal();

    this.showSuccess('Column added successfully');
  },

  editColumn(index) {
    const column = this.columns[index];
    // Populate modal with column data
    document.getElementById('columnName').value = column.field;
    document.getElementById('columnName').disabled = true; // Can't change field name
    document.getElementById('columnDisplayName').value = column.label;
    document.getElementById('columnType').value = column.type || 'text';
    document.getElementById('columnWidth').value = column.width || '';
    document.getElementById('columnSortable').checked = column.sortable !== false;
    document.getElementById('columnVisible').checked = column.visible !== false;

    // Change modal title and button
    document.querySelector('#addColumnModal .modal-title').textContent = 'Edit Column';
    const addButton = document.querySelector('#addColumnModal .modal-footer .btn-primary');
    addButton.textContent = 'Update Column';
    addButton.onclick = () => this.updateColumn(index);

    document.getElementById('addColumnModal').classList.add('show');
  },

  updateColumn(index) {
    const displayName = document.getElementById('columnDisplayName').value.trim();
    const type = document.getElementById('columnType').value;
    const width = document.getElementById('columnWidth').value;
    const sortable = document.getElementById('columnSortable').checked;
    const visible = document.getElementById('columnVisible').checked;

    if (!displayName) {
      this.showError('Display name is required');
      return;
    }

    // Update column
    this.columns[index] = {
      ...this.columns[index],
      label: displayName,
      type: type,
      width: width ? parseInt(width) : undefined,
      sortable: sortable,
      visible: visible
    };

    this.gridData.columns = this.columns;

    this.unsavedChanges = true;
    this.render();
    this.refreshPreview();
    this.closeAddColumnModal();

    // Reset modal
    document.querySelector('#addColumnModal .modal-title').textContent = 'Add Column';
    const addButton = document.querySelector('#addColumnModal .modal-footer .btn-primary');
    addButton.textContent = 'Add Column';
    addButton.onclick = () => this.addColumn();
    document.getElementById('columnName').disabled = false;

    this.showSuccess('Column updated successfully');
  },

  removeColumn(index) {
    if (!confirm('Are you sure you want to remove this column?')) {
      return;
    }

    this.columns.splice(index, 1);
    this.gridData.columns = this.columns;

    this.unsavedChanges = true;
    this.render();
    this.refreshPreview();

    this.showSuccess('Column removed');
  },

  moveColumn(fromIndex, toIndex) {
    const column = this.columns[fromIndex];
    this.columns.splice(fromIndex, 1);
    this.columns.splice(toIndex, 0, column);

    this.gridData.columns = this.columns;

    this.unsavedChanges = true;
    this.render();
    this.refreshPreview();
  },

  selectColumn(index) {
    this.selectedColumn = this.columns[index];
    this.render();
  },

  /**
   * ═══════════════════════════════════════════════════════════
   * PREVIEW
   * ═══════════════════════════════════════════════════════════
   */

  async initPreview() {
    await this.refreshPreview();
  },

  async refreshPreview() {
    try {
      const container = document.getElementById('gridPreviewContainer');

      // Destroy existing preview
      if (this.previewEngine) {
        // Grid engine doesn't have destroy method yet, just clear container
        container.innerHTML = '';
        this.previewEngine = null;
      }

      // Check if we have necessary data
      if (this.columns.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <i class="fas fa-table"></i>
            <p>Add columns to see preview</p>
          </div>
        `;
        return;
      }

      // Build preview grid configuration
      const previewConfig = {
        id: 'preview',
        displayName: document.getElementById('gridDisplayName').value || 'Grid Preview',
        columns: this.columns,
        dataSource: this.gridData.dataSource,
        pagination: {
          enabled: document.getElementById('paginationEnabled').checked,
          pageSize: parseInt(document.getElementById('pageSize').value) || 25
        },
        gridType: document.getElementById('gridType').value
      };

      // Create sample data for preview
      const sampleData = this.generateSampleData(previewConfig.columns);

      // Render preview HTML
      container.innerHTML = '<div id="previewGrid"></div>';

      // Create temporary grid engine for preview
      this.previewEngine = new GridRuntimeEngine(previewConfig, {
        containerId: 'previewGrid',
        autoLoad: false,
        enableSorting: document.getElementById('sortingEnabled').checked,
        enableFiltering: document.getElementById('filteringEnabled').checked,
        onRowClick: null,
        onRowEdit: null,
        onRowDelete: null
      });

      await this.previewEngine.initialize();

      // Override loadData to use sample data
      this.previewEngine.state.rows = sampleData;
      this.previewEngine.state.totalRows = sampleData.length;
      this.previewEngine.state.totalPages = Math.ceil(sampleData.length / previewConfig.pagination.pageSize);

      // Render table
      this.previewEngine.renderTable();

    } catch (error) {
      console.error('[GridDesigner] Preview failed:', error);
      document.getElementById('gridPreviewContainer').innerHTML = `
        <div class="empty-state">
          <i class="fas fa-exclamation-triangle" style="color: var(--danger);"></i>
          <p>Preview Error: ${this.escapeHtml(error.message)}</p>
        </div>
      `;
    }
  },

  generateSampleData(columns) {
    const sampleData = [];
    const sampleCount = 5;

    for (let i = 0; i < sampleCount; i++) {
      const row = { id: `sample-${i + 1}` };

      columns.forEach(column => {
        switch (column.type) {
          case 'text':
            row[column.field] = `Sample ${column.label} ${i + 1}`;
            break;
          case 'number':
            row[column.field] = (i + 1) * 100;
            break;
          case 'currency':
            row[column.field] = (i + 1) * 99.99;
            break;
          case 'date':
            row[column.field] = new Date().toISOString().split('T')[0];
            break;
          case 'datetime':
            row[column.field] = new Date().toISOString();
            break;
          case 'boolean':
            row[column.field] = i % 2 === 0;
            break;
          case 'email':
            row[column.field] = `user${i + 1}@example.com`;
            break;
          case 'link':
            row[column.field] = `https://example.com/item/${i + 1}`;
            break;
          case 'image':
            row[column.field] = `https://via.placeholder.com/50`;
            break;
          default:
            row[column.field] = `Value ${i + 1}`;
        }
      });

      sampleData.push(row);
    }

    return sampleData;
  },

  previewGrid() {
    this.refreshPreview();
  },

  /**
   * ═══════════════════════════════════════════════════════════
   * SAVE & PUBLISH
   * ═══════════════════════════════════════════════════════════
   */

  async save() {
    try {
      // Gather all settings
      const gridData = {
        name: this.gridData.name || 'new_grid',
        displayName: document.getElementById('gridDisplayName').value || 'Unnamed Grid',
        applicationId: this.applicationId,
        columns: this.columns,
        gridType: document.getElementById('gridType').value,
        dataSource: {
          id: document.getElementById('dataSourceId').value || null
        },
        pagination: {
          enabled: document.getElementById('paginationEnabled').checked,
          pageSize: parseInt(document.getElementById('pageSize').value) || 25
        },
        settings: {
          sortingEnabled: document.getElementById('sortingEnabled').checked,
          filteringEnabled: document.getElementById('filteringEnabled').checked,
          exportEnabled: document.getElementById('exportEnabled').checked
        }
      };

      let response;
      if (this.gridId) {
        // Update existing grid
        response = await fetch(`/lowcode/api/grids/${this.gridId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(gridData)
        });
      } else {
        // Create new grid
        response = await fetch('/lowcode/api/grids', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(gridData)
        });
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Failed to save grid');
      }

      this.gridId = result.data.id;
      this.gridData = result.data;
      this.unsavedChanges = false;

      this.showSuccess('Grid saved successfully!');

      // Update URL if creating new grid
      if (!window.GRID_ID) {
        window.history.replaceState({}, '', `/lowcode/grids/${this.gridId}/designer`);
        window.GRID_ID = this.gridId;
      }

    } catch (error) {
      console.error('[GridDesigner] Save failed:', error);
      this.showError('Failed to save grid: ' + error.message);
    }
  },

  async publish() {
    if (this.unsavedChanges) {
      if (!confirm('You have unsaved changes. Save before publishing?')) {
        return;
      }
      await this.save();
    }

    try {
      // TODO: Implement publish endpoint if needed
      // For now, just update status
      await this.save();
      this.showSuccess('Grid published successfully!');
    } catch (error) {
      console.error('[GridDesigner] Publish failed:', error);
      this.showError('Failed to publish grid: ' + error.message);
    }
  },

  /**
   * ═══════════════════════════════════════════════════════════
   * EVENT LISTENERS
   * ═══════════════════════════════════════════════════════════
   */

  setupEventListeners() {
    // Grid name change
    document.getElementById('gridDisplayName').addEventListener('input', () => {
      this.unsavedChanges = true;
    });

    // Data source change
    document.getElementById('dataSourceId').addEventListener('change', (e) => {
      const selectedId = e.target.value;
      const dataSource = this.dataSources.find(ds => ds.id === selectedId);
      this.gridData.dataSource = dataSource || null;
      this.unsavedChanges = true;
    });

    // Settings changes
    ['gridType', 'paginationEnabled', 'pageSize', 'sortingEnabled', 'filteringEnabled', 'exportEnabled'].forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener('change', () => {
          this.unsavedChanges = true;
          this.refreshPreview();
        });
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 's') {
          e.preventDefault();
          this.save();
        }
      }
    });

    // Warn about unsaved changes
    window.addEventListener('beforeunload', (e) => {
      if (this.unsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  },

  trackChanges() {
    // Track changes for autosave or unsaved changes warning
    setInterval(() => {
      if (this.unsavedChanges) {
        console.log('[GridDesigner] Unsaved changes detected');
      }
    }, 30000); // Every 30 seconds
  },

  /**
   * ═══════════════════════════════════════════════════════════
   * UTILITIES
   * ═══════════════════════════════════════════════════════════
   */

  escapeHtml(text) {
    if (typeof text !== 'string') return text;
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  showSuccess(message) {
    // Simple toast notification
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: var(--success);
      color: white;
      padding: 1rem 1.5rem;
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-lg);
      z-index: 10000;
      animation: slideIn 0.3s ease-out;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  },

  showError(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: var(--danger);
      color: white;
      padding: 1rem 1.5rem;
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-lg);
      z-index: 10000;
      animation: slideIn 0.3s ease-out;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 5000);
  }
};

/**
 * Navigate back to applications list
 */
function goBack() {
  if (GridDesigner.unsavedChanges) {
    if (!confirm('You have unsaved changes. Are you sure you want to leave?')) {
      return;
    }
  }
  window.location.href = `/lowcode/applications/${GridDesigner.applicationId}`;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  GridDesigner.init();
});
